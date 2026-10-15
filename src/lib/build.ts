import { BLOCK_BY_ID, blockStateString, getBlock } from "./blocks/blocks";
import { matchColors } from "./blocks/matcher";
import type { Structure } from "./export/schematic";
import type { Pose } from "./rig/pose";
import type { SkinModel } from "./skin/layout";
import type { ItemSpec } from "./voxel/items";
import { PEDESTAL_SEGMENT, voxelize, type OuterMode } from "./voxel/voxelize";

export interface StatueSettings {
  model: SkinModel;
  pose: Pose;
  scale: number;
  outer: OuterMode;
  item: ItemSpec | null;
  style: string;
  version: string;
  /** 0 = unlimited */
  maxBlocks: number;
  hollow: boolean;
  /** block id, or null for no pedestal */
  pedestal: string | null;
}

export interface Statue {
  sx: number;
  sy: number;
  sz: number;
  /** palette index + 1 per voxel, 0 = air */
  cells: Uint16Array;
  seg: Uint8Array;
  /** block ids */
  palette: string[];
  counts: number[];
  total: number;
}

const idx = (sx: number, sz: number, x: number, y: number, z: number) => (y * sz + z) * sx + x;

/** Remove voxels that can't be seen: all six neighbours filled. */
function hollowOut(sx: number, sy: number, sz: number, cells: Uint16Array) {
  const hidden: number[] = [];
  for (let y = 1; y < sy - 1; y++)
    for (let z = 1; z < sz - 1; z++)
      for (let x = 1; x < sx - 1; x++) {
        const i = idx(sx, sz, x, y, z);
        if (
          cells[i] &&
          cells[i - 1] &&
          cells[i + 1] &&
          cells[i - sx] &&
          cells[i + sx] &&
          cells[i - sx * sz] &&
          cells[i + sx * sz]
        )
          hidden.push(i);
      }
  for (const i of hidden) cells[i] = 0;
}

export function buildStatue(skin: Uint8ClampedArray, s: StatueSettings): Statue {
  const g = voxelize(skin, { model: s.model, pose: s.pose, scale: s.scale, outer: s.outer, item: s.item });
  let { sx, sy, sz } = g;
  let color = g.color;
  let seg = g.seg;

  // Pedestal under the feet.
  let pedestalH = 0;
  let shiftX = 0;
  let shiftZ = 0;
  if (s.pedestal && BLOCK_BY_ID[s.pedestal]) {
    const foot = Math.max(1, s.scale * 2);
    let x0 = sx, x1 = -1, z0 = sz, z1 = -1;
    for (let y = 0; y < Math.min(sy, foot); y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++)
          if (color[idx(sx, sz, x, y, z)]) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            z0 = Math.min(z0, z);
            z1 = Math.max(z1, z);
          }
    const m = Math.max(1, s.scale);
    pedestalH = Math.max(1, Math.round(s.scale * 0.75));
    const px0 = x0 - m, px1 = x1 + m, pz0 = z0 - m, pz1 = z1 + m;
    const nx0 = Math.min(0, px0), nx1 = Math.max(sx - 1, px1);
    const nz0 = Math.min(0, pz0), nz1 = Math.max(sz - 1, pz1);
    const nsx = nx1 - nx0 + 1, nsz = nz1 - nz0 + 1, nsy = sy + pedestalH;
    shiftX = -nx0;
    shiftZ = -nz0;
    const nc = new Uint32Array(nsx * nsy * nsz);
    const ns = new Uint8Array(nsx * nsy * nsz);
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const a = idx(sx, sz, x, y, z);
          if (!color[a]) continue;
          const b = idx(nsx, nsz, x + shiftX, y + pedestalH, z + shiftZ);
          nc[b] = color[a];
          ns[b] = seg[a];
        }
    for (let y = 0; y < pedestalH; y++)
      for (let z = pz0; z <= pz1; z++)
        for (let x = px0; x <= px1; x++) ns[idx(nsx, nsz, x + shiftX, y, z + shiftZ)] = PEDESTAL_SEGMENT;
    sx = nsx;
    sy = nsy;
    sz = nsz;
    color = nc;
    seg = ns;
  }

  const n = sx * sy * sz;
  // Mark occupancy (statue + pedestal) so hollowing sees both.
  const occ = new Uint16Array(n);
  for (let i = 0; i < n; i++) if (color[i] || seg[i] === PEDESTAL_SEGMENT) occ[i] = 1;
  if (s.hollow) hollowOut(sx, sy, sz, occ);

  const weights = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (!occ[i] || seg[i] === PEDESTAL_SEGMENT) continue;
    const c = color[i] - 1;
    weights.set(c, (weights.get(c) ?? 0) + 1);
  }
  const { byColor } = matchColors(weights, s.style, s.version, s.maxBlocks);

  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const indexOf = (id: string) => {
    let k = paletteIndex.get(id);
    if (k === undefined) {
      k = palette.length;
      palette.push(id);
      paletteIndex.set(id, k);
    }
    return k;
  };
  const cells = new Uint16Array(n);
  const counts: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!occ[i]) continue;
    const id = seg[i] === PEDESTAL_SEGMENT ? s.pedestal! : byColor.get(color[i] - 1)!.id;
    const k = indexOf(id);
    cells[i] = k + 1;
    counts[k] = (counts[k] ?? 0) + 1;
    total++;
  }
  return { sx, sy, sz, cells, seg, palette, counts, total };
}

/** Convert to an export structure: palette[0] is air, full block states. */
export function toStructure(st: Statue): Structure {
  const palette = ["minecraft:air", ...st.palette.map((id) => blockStateString(getBlock(id)))];
  return { sx: st.sx, sy: st.sy, sz: st.sz, blocks: st.cells, palette };
}
