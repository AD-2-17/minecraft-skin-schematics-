import { buildRig, type Pose, type Segment } from "../rig/pose";
import { apply, chain, invertAffine, rotX, translation, type Mat4 } from "../rig/mat4";
import { Face, faceTexelIndex, type SkinModel } from "../skin/layout";
import { spritePixels, type ItemSpec } from "./items";

export type OuterMode = "shell" | "flat" | "off";

export interface VoxelizeOptions {
  model: SkinModel;
  pose: Pose;
  /** voxels per skin pixel */
  scale: number;
  outer: OuterMode;
  item: ItemSpec | null;
}

/** Dense voxel grid. y is up; the statue faces +z (south in Minecraft). */
export interface VoxelGrid {
  sx: number;
  sy: number;
  sz: number;
  /** packed RGB + 1, 0 = empty */
  color: Uint32Array;
  /** segment index (1-based, see SEGMENT_ORDER), ITEM_SEGMENT for the held item */
  seg: Uint8Array;
  /** world position (skin pixels) of voxel (0, 0, 0)'s min corner */
  origin: [number, number, number];
  scale: number;
}

export const ITEM_SEGMENT = 11;
export const PEDESTAL_SEGMENT = 12;

const OUTER_ALPHA = 100;

interface Solid {
  inv: Mat4;
  matrix: Mat4;
  /** local-space bounds [x0, y0, z0, x1, y1, z1] */
  bounds: number[];
  segIndex: number;
  /** writes into `out` and returns true if the local point is filled */
  sample(x: number, y: number, z: number, out: SampleOut): boolean;
}

interface SampleOut {
  color: number;
  prio: number;
}

const pack = (r: number, g: number, b: number) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);

// Priorities: lower wins. Base surfaces beat items, items beat the outer layer,
// so the overlay never pokes through a neighbouring part's face.
const P_BASE = 0;
const P_EXTENSION = 4000;
const P_ITEM = 20000;
const P_OUTER = 30000;

function segmentSolid(seg: Segment, skin: Uint8ClampedArray, outer: OuterMode, shellPx: number): Solid {
  const { box } = seg;
  const t = outer === "shell" ? shellPx : 0;
  const yLo = seg.y0 - seg.extendBelow;
  const yHi = seg.y1 + seg.extendAbove;
  const bounds = [
    box.x - t,
    yLo - (seg.cutBelow ? 0 : t),
    box.z - t,
    box.x + box.w + t,
    yHi + (seg.cutAbove ? 0 : t),
    box.z + box.d + t,
  ];
  // rows this segment owns, relative to box.y, for clamping extension samples
  const ownLo = seg.y0 - box.y;
  const ownHi = seg.y1 - box.y - 1e-6;


  return {
    inv: invertAffine(seg.matrix),
    matrix: seg.matrix,
    bounds,
    segIndex: seg.index,
    sample(px, py, pz, out) {
      const lx = px - box.x;
      const lz = pz - box.z;
      const insideX = lx >= 0 && lx < box.w;
      const insideZ = lz >= 0 && lz < box.d;
      const insideY = py >= yLo && py < yHi;
      const lyRaw = py - box.y;
      const ly = Math.min(ownHi, Math.max(ownLo, lyRaw));

      if (insideX && insideY && insideZ) {
        // Nearest real face decides which texel this voxel shows.
        let best: Face = Face.PZ;
        let dist = box.d - lz;
        if (lz < dist) (dist = lz), (best = Face.NZ);
        if (lx < dist) (dist = lx), (best = Face.NX);
        if (box.w - lx < dist) (dist = box.w - lx), (best = Face.PX);
        if (!seg.cutAbove && box.y + box.h - py < dist) (dist = box.y + box.h - py), (best = Face.PY);
        if (!seg.cutBelow && py - box.y < dist) (dist = py - box.y), (best = Face.NY);
        const ti = faceTexelIndex(best, box, seg.base, lx, ly, lz) * 4;
        let r = skin[ti];
        let g = skin[ti + 1];
        let b = skin[ti + 2];
        if (outer === "flat") {
          const oi = faceTexelIndex(best, box, seg.outer, lx, ly, lz) * 4;
          const oa = skin[oi + 3];
          if (oa > 0) {
            const a = oa / 255;
            r = r + (skin[oi] - r) * a;
            g = g + (skin[oi + 1] - g) * a;
            b = b + (skin[oi + 2] - b) * a;
          }
        }
        out.color = pack(r, g, b);
        const inExtension = py < seg.y0 || py >= seg.y1;
        out.prio = P_BASE + (inExtension ? P_EXTENSION : 0) + Math.min(3999, dist * 100);
        return true;
      }

      if (outer !== "shell") return false;

      // Outer layer: a one-voxel shell hugging each face, like 3D skin layers.
      const ox = lx < 0 ? (lx >= -t ? -1 : 9) : lx >= box.w ? (lx < box.w + t ? 1 : 9) : 0;
      const oz = lz < 0 ? (lz >= -t ? -1 : 9) : lz >= box.d ? (lz < box.d + t ? 1 : 9) : 0;
      let oy = 0;
      if (py < yLo) {
        if (seg.cutBelow || py < yLo - t) return false;
        oy = -1;
      } else if (py >= yHi) {
        if (seg.cutAbove || py >= yHi + t) return false;
        oy = 1;
      }
      if (ox === 9 || oz === 9) return false;
      const cx = Math.min(box.w - 1e-6, Math.max(0, lx));
      const cz = Math.min(box.d - 1e-6, Math.max(0, lz));
      const faces: Face[] = [];
      if (oz === 1) faces.push(Face.PZ);
      if (oz === -1) faces.push(Face.NZ);
      if (ox === -1) faces.push(Face.NX);
      if (ox === 1) faces.push(Face.PX);
      if (oy === 1) faces.push(Face.PY);
      if (oy === -1) faces.push(Face.NY);
      if (!faces.length) return false;
      let color = -1;
      for (const f of faces) {
        const oi = faceTexelIndex(f, box, seg.outer, cx, ly, cz) * 4;
        if (skin[oi + 3] < OUTER_ALPHA) return false;
        if (color < 0) color = pack(skin[oi], skin[oi + 1], skin[oi + 2]);
      }
      out.color = color;
      out.prio = P_OUTER + faces.length;
      return true;
    },
  };
}

function itemSolid(spec: ItemSpec, hand: { matrix: Mat4; point: [number, number, number] }): Solid {
  const { w, h, px, grip } = spritePixels(spec.kind, spec.material);
  // Sprite space: u = column, v = up, n = thickness. In the arm's frame the
  // sprite lies in the YZ plane: u -> +Z (forward), v -> +Y, n -> +X.
  const toArm = new Float64Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
  const gu = grip[0] + 0.5;
  const gv = h - grip[1] - 0.5;
  const matrix = chain(
    hand.matrix,
    translation(hand.point[0], hand.point[1], hand.point[2]),
    rotX(-spec.angle),
    toArm,
    translation(-gu, -gv, 0),
  );
  return {
    inv: invertAffine(matrix),
    matrix,
    bounds: [0, 0, -0.5, w, h, 0.5],
    segIndex: ITEM_SEGMENT,
    sample(u, v, n, out) {
      if (u < 0 || u >= w || v < 0 || v >= h || n < -0.5 || n >= 0.5) return false;
      const col = Math.floor(u);
      const row = h - 1 - Math.floor(v);
      const c = px[row * w + col];
      if (c < 0) return false;
      out.color = c;
      out.prio = P_ITEM;
      return true;
    },
  };
}

function worldBounds(s: Solid): number[] {
  const [x0, y0, z0, x1, y1, z1] = s.bounds;
  const p = [0, 0, 0];
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const x of [x0, x1])
    for (const y of [y0, y1])
      for (const z of [z0, z1]) {
        apply(s.matrix, x, y, z, p);
        for (let k = 0; k < 3; k++) {
          b[k] = Math.min(b[k], p[k]);
          b[k + 3] = Math.max(b[k + 3], p[k]);
        }
      }
  return b;
}

export function voxelize(skin: Uint8ClampedArray, opts: VoxelizeOptions): VoxelGrid {
  const s = Math.max(1, Math.round(opts.scale));
  const shellPx = Math.max(1, Math.round(s * 0.5)) / s;
  const rig = buildRig(opts.model, opts.pose);
  const solids: Solid[] = rig.segments.map((seg) => segmentSolid(seg, skin, opts.outer, shellPx));
  if (opts.item) solids.push(itemSolid(opts.item, rig.hand[opts.item.hand]));

  const wb = solids.map(worldBounds);
  const min = [0, 1, 2].map((k) => Math.floor(Math.min(...wb.map((b) => b[k])) * s) - 1);
  const max = [0, 1, 2].map((k) => Math.ceil(Math.max(...wb.map((b) => b[k + 3])) * s) + 1);
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  const sz = max[2] - min[2];
  const n = sx * sy * sz;
  const color = new Uint32Array(n);
  const seg = new Uint8Array(n);
  const prio = new Uint16Array(n).fill(65535);

  const out: SampleOut = { color: 0, prio: 0 };
  const local = [0, 0, 0];
  solids.forEach((solid, si) => {
    const b = wb[si];
    const i0 = Math.max(0, Math.floor(b[0] * s) - min[0]);
    const j0 = Math.max(0, Math.floor(b[1] * s) - min[1]);
    const k0 = Math.max(0, Math.floor(b[2] * s) - min[2]);
    const i1 = Math.min(sx, Math.ceil(b[3] * s) - min[0] + 1);
    const j1 = Math.min(sy, Math.ceil(b[4] * s) - min[1] + 1);
    const k1 = Math.min(sz, Math.ceil(b[5] * s) - min[2] + 1);
    const inv = solid.inv;
    // Stepping one voxel in x moves the local point by the inverse's first column.
    const dx = inv[0] / s, dy = inv[4] / s, dz = inv[8] / s;
    const wx0 = (i0 + min[0] + 0.5) / s;
    for (let j = j0; j < j1; j++) {
      const wy = (j + min[1] + 0.5) / s;
      for (let k = k0; k < k1; k++) {
        const wz = (k + min[2] + 0.5) / s;
        apply(inv, wx0, wy, wz, local);
        let lx = local[0] - dx, ly = local[1] - dy, lz = local[2] - dz;
        for (let i = i0; i < i1; i++) {
          lx += dx;
          ly += dy;
          lz += dz;
          if (!solid.sample(lx, ly, lz, out)) continue;
          const idx = (j * sz + k) * sx + i;
          if (out.prio < prio[idx]) {
            prio[idx] = out.prio;
            color[idx] = out.color + 1;
            seg[idx] = solid.segIndex;
          }
        }
      }
    }
  });
  return crop({ sx, sy, sz, color, seg, origin: [min[0] / s, min[1] / s, min[2] / s], scale: s });
}

/** Shrink to the filled bounding box so the statue stands at y = 0. */
export function crop(g: VoxelGrid): VoxelGrid {
  let x0 = g.sx, y0 = g.sy, z0 = g.sz, x1 = -1, y1 = -1, z1 = -1;
  for (let y = 0; y < g.sy; y++)
    for (let z = 0; z < g.sz; z++)
      for (let x = 0; x < g.sx; x++) {
        if (!g.color[(y * g.sz + z) * g.sx + x]) continue;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (z < z0) z0 = z;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
        if (z > z1) z1 = z;
      }
  if (x1 < 0) return { sx: 1, sy: 1, sz: 1, color: new Uint32Array(1), seg: new Uint8Array(1), origin: g.origin, scale: g.scale };
  const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
  const color = new Uint32Array(sx * sy * sz);
  const seg = new Uint8Array(sx * sy * sz);
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++) {
      const src = ((y + y0) * g.sz + (z + z0)) * g.sx + x0;
      const dst = (y * sz + z) * sx;
      color.set(g.color.subarray(src, src + sx), dst);
      seg.set(g.seg.subarray(src, src + sx), dst);
    }
  const o = g.origin;
  return { sx, sy, sz, color, seg, origin: [o[0] + x0 / g.scale, o[1] + y0 / g.scale, o[2] + z0 / g.scale], scale: g.scale };
}
