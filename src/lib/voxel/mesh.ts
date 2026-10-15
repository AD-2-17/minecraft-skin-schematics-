// Face-culled block mesh with Minecraft-style directional shading and
// per-vertex ambient occlusion, baked into vertex colors.

export interface MeshData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** segment id per quad, for picking */
  quadSeg: Uint8Array;
}

// For each face: normal, then the four corners (counter-clockwise from outside).
const FACES: { n: [number, number, number]; c: [number, number, number][]; shade: number }[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.74 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.74 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.58 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.88 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.88 },
];

const AO = [0.52, 0.68, 0.84, 1];

// Shading is baked in sRGB (like the game); the renderer expects linear vertex colors.
const LUT_SIZE = 4096;
const TO_LINEAR = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) {
  const v = i / LUT_SIZE;
  TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
const lin = (v: number) => TO_LINEAR[Math.min(LUT_SIZE, Math.max(0, Math.round(v * LUT_SIZE)))];

// Per face and corner: the two in-plane neighbour offsets that shade that corner.
const CORNER_AXES = FACES.map((f) => {
  const axes = [0, 1, 2].filter((k) => f.n[k] === 0);
  return f.c.map((c) => {
    const a1 = [0, 0, 0];
    const a2 = [0, 0, 0];
    a1[axes[0]] = c[axes[0]] * 2 - 1;
    a2[axes[1]] = c[axes[1]] * 2 - 1;
    return [a1, a2];
  });
});

function jitter(x: number, y: number, z: number) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return 0.965 + (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 0.07;
}

/**
 * @param cells palette index + 1 per voxel (0 = empty)
 * @param rgbOf packed RGB for a palette index
 */
export function buildMesh(sx: number, sy: number, sz: number, cells: Uint16Array, rgbOf: (idx: number) => number, seg?: Uint8Array): MeshData {
  const at = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && cells[(y * sz + z) * sx + x] !== 0 ? 1 : 0;

  // count quads first so buffers are allocated once
  let quads = 0;
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        if (!cells[(y * sz + z) * sx + x]) continue;
        for (const f of FACES) if (!at(x + f.n[0], y + f.n[1], z + f.n[2])) quads++;
      }

  const positions = new Float32Array(quads * 12);
  const colors = new Float32Array(quads * 12);
  const indices = new Uint32Array(quads * 6);
  const quadSeg = new Uint8Array(quads);
  let q = 0;
  const AO_SCRATCH = [0, 0, 0, 0];
  const ox = sx / 2;
  const oz = sz / 2;

  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const i = (y * sz + z) * sx + x;
        const cell = cells[i];
        if (!cell) continue;
        const rgb = rgbOf(cell - 1);
        const j = jitter(x, y, z);
        const r = ((rgb >> 16) & 255) / 255;
        const g = ((rgb >> 8) & 255) / 255;
        const b = (rgb & 255) / 255;
        for (let fi = 0; fi < 6; fi++) {
          const f = FACES[fi];
          const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
          if (at(nx, ny, nz)) continue;
          const ao = AO_SCRATCH;
          for (let v = 0; v < 4; v++) {
            const c = f.c[v];
            const [a1, a2] = CORNER_AXES[fi][v];
            const s1 = at(nx + a1[0], ny + a1[1], nz + a1[2]);
            const s2 = at(nx + a2[0], ny + a2[1], nz + a2[2]);
            const cr = at(nx + a1[0] + a2[0], ny + a1[1] + a2[1], nz + a1[2] + a2[2]);
            ao[v] = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
            const p = q * 12 + v * 3;
            positions[p] = x + c[0] - ox;
            positions[p + 1] = y + c[1];
            positions[p + 2] = z + c[2] - oz;
            const k = f.shade * AO[ao[v]] * j;
            colors[p] = lin(r * k);
            colors[p + 1] = lin(g * k);
            colors[p + 2] = lin(b * k);
          }
          const base = q * 4;
          const t = q * 6;
          // flip the diagonal so AO gradients interpolate without seams
          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            indices[t] = base + 1;
            indices[t + 1] = base + 2;
            indices[t + 2] = base + 3;
            indices[t + 3] = base + 1;
            indices[t + 4] = base + 3;
            indices[t + 5] = base;
          } else {
            indices[t] = base;
            indices[t + 1] = base + 1;
            indices[t + 2] = base + 2;
            indices[t + 3] = base;
            indices[t + 4] = base + 2;
            indices[t + 5] = base + 3;
          }
          quadSeg[q] = seg ? seg[i] : 0;
          q++;
        }
      }
  return { positions, colors, indices, quadSeg };
}
