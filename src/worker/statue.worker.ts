/// <reference lib="webworker" />
import { getBlock } from "../lib/blocks/blocks";
import { buildStatue, type StatueSettings } from "../lib/build";
import type { Pose } from "../lib/rig/pose";
import type { SkinModel } from "../lib/skin/layout";
import type { ItemSpec } from "../lib/voxel/items";
import { buildMesh } from "../lib/voxel/mesh";
import { voxelize } from "../lib/voxel/voxelize";

export type WorkerRequest =
  | { type: "skin"; data: Uint8ClampedArray }
  | { type: "build"; id: number; settings: StatueSettings }
  | { type: "thumbs"; id: number; model: SkinModel; poses: { key: string; pose: Pose; item: ItemSpec | null }[] };

export type WorkerResponse =
  | { type: "built"; id: number; result: BuildPayload }
  | { type: "thumbs"; id: number; meshes: ThumbMesh[] }
  | { type: "error"; id: number; message: string };

export interface BuildPayload {
  sx: number;
  sy: number;
  sz: number;
  cells: Uint16Array;
  palette: string[];
  counts: number[];
  total: number;
  ms: number;
  mesh: { positions: Float32Array; colors: Float32Array; indices: Uint32Array; quadSeg: Uint8Array };
}

export interface ThumbMesh {
  key: string;
  size: [number, number, number];
  mesh: BuildPayload["mesh"];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let skin: Uint8ClampedArray | null = null;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "skin") {
    skin = msg.data;
    return;
  }
  if (!skin) {
    ctx.postMessage({ type: "error", id: msg.id, message: "No skin loaded" } satisfies WorkerResponse);
    return;
  }
  try {
    if (msg.type === "build") {
      const t = performance.now();
      const st = buildStatue(skin, msg.settings);
      const hexes = st.palette.map((id) => getBlock(id).hex);
      const mesh = buildMesh(st.sx, st.sy, st.sz, st.cells, (i) => hexes[i], st.seg);
      const result: BuildPayload = {
        sx: st.sx,
        sy: st.sy,
        sz: st.sz,
        cells: st.cells,
        palette: st.palette,
        counts: st.counts,
        total: st.total,
        ms: performance.now() - t,
        mesh,
      };
      ctx.postMessage({ type: "built", id: msg.id, result } satisfies WorkerResponse, [
        st.cells.buffer,
        mesh.positions.buffer,
        mesh.colors.buffer,
        mesh.indices.buffer,
        mesh.quadSeg.buffer,
      ]);
    } else if (msg.type === "thumbs") {
      const meshes: ThumbMesh[] = [];
      const transfer: ArrayBuffer[] = [];
      for (const p of msg.poses) {
        const g = voxelize(skin, { model: msg.model, pose: p.pose, scale: 1, outer: "shell", item: p.item });
        // raw skin colors through a tiny local palette
        const colors: number[] = [];
        const lookup = new Map<number, number>();
        const cells = new Uint16Array(g.color.length);
        for (let i = 0; i < g.color.length; i++) {
          const c = g.color[i];
          if (!c) continue;
          let k = lookup.get(c);
          if (k === undefined) {
            k = colors.length;
            colors.push(c - 1);
            lookup.set(c, k);
          }
          cells[i] = k + 1;
        }
        const mesh = buildMesh(g.sx, g.sy, g.sz, cells, (i) => colors[i]);
        meshes.push({ key: p.key, size: [g.sx, g.sy, g.sz], mesh });
        transfer.push(mesh.positions.buffer as ArrayBuffer, mesh.colors.buffer as ArrayBuffer, mesh.indices.buffer as ArrayBuffer, mesh.quadSeg.buffer as ArrayBuffer);
      }
      ctx.postMessage({ type: "thumbs", id: msg.id, meshes } satisfies WorkerResponse, transfer);
    }
  } catch (err) {
    ctx.postMessage({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
