import { gzipSync } from "fflate";
import { byteArray, compound, int, intArray, list, long, longArrayWords, short, string, TAG_COMPOUND, writeNbt, type Tag } from "./nbt";

/** A block-state grid ready for export. Index = (y * sz + z) * sx + x. */
export interface Structure {
  sx: number;
  sy: number;
  sz: number;
  /** palette indices; 0 must be air */
  blocks: Uint16Array;
  /** full block-state strings, e.g. "minecraft:oak_wood[axis=y]"; palette[0] = "minecraft:air" */
  palette: string[];
}

export interface ExportMeta {
  name: string;
  author: string;
  description: string;
  dataVersion: number;
  /** Litematica format version (5, 6 or 7) */
  litematicVersion: number;
  /** square ARGB preview shown in Litematica's schematic browser */
  preview?: Int32Array;
  regionName?: string;
  time?: number;
}

function parseState(state: string): { name: string; props: Record<string, string> } {
  const i = state.indexOf("[");
  if (i < 0) return { name: state, props: {} };
  const props: Record<string, string> = {};
  for (const kv of state.slice(i + 1, -1).split(",")) {
    const [k, v] = kv.split("=");
    props[k] = v;
  }
  return { name: state.slice(0, i), props };
}

/**
 * Pack palette indices exactly like Litematica's LitematicaBitArray: a tight
 * little-endian bit stream across 64-bit longs (entries may span two longs).
 * Returned as 32-bit words, low word first.
 */
export function packBlockStates(values: Uint16Array, paletteSize: number): { bits: number; words: Uint32Array } {
  const bits = Math.max(2, 32 - Math.clz32(Math.max(1, paletteSize - 1)));
  const longs = Math.max(1, Math.ceil((values.length * bits) / 64));
  const words = new Uint32Array(longs * 2);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!v) continue;
    const pos = i * bits;
    const w = pos >>> 5;
    const o = pos & 31;
    words[w] = (words[w] | (v << o)) >>> 0;
    if (o + bits > 32) words[w + 1] = (words[w + 1] | (v >>> (32 - o))) >>> 0;
  }
  return { bits, words };
}

function countNonAir(s: Structure) {
  let n = 0;
  for (let i = 0; i < s.blocks.length; i++) if (s.blocks[i]) n++;
  return n;
}

function vec(x: number, y: number, z: number): Tag {
  return compound({ x: int(x), y: int(y), z: int(z) });
}

/** Litematica .litematic (gzipped NBT). */
export function writeLitematic(s: Structure, meta: ExportMeta): Uint8Array {
  if (s.palette[0] !== "minecraft:air") throw new Error("palette[0] must be air");
  const now = BigInt(meta.time ?? Date.now());
  const { words } = packBlockStates(s.blocks, s.palette.length);
  const palette = s.palette.map((state) => {
    const { name, props } = parseState(state);
    const entry: Record<string, Tag> = { Name: string(name) };
    const keys = Object.keys(props);
    if (keys.length) entry.Properties = compound(Object.fromEntries(keys.map((k) => [k, string(props[k])])));
    return compound(entry);
  });

  const metadata: Record<string, Tag> = {
    Name: string(meta.name),
    Author: string(meta.author),
    Description: string(meta.description),
    RegionCount: int(1),
    TotalVolume: int(s.sx * s.sy * s.sz),
    TotalBlocks: int(countNonAir(s)),
    TimeCreated: long(now),
    TimeModified: long(now),
    EnclosingSize: vec(s.sx, s.sy, s.sz),
  };
  if (meta.preview && meta.preview.length) metadata.PreviewImageData = intArray(meta.preview);

  const region = compound({
    Position: vec(0, 0, 0),
    Size: vec(s.sx, s.sy, s.sz),
    BlockStatePalette: list(TAG_COMPOUND, palette),
    BlockStates: longArrayWords(words),
    TileEntities: list(TAG_COMPOUND, []),
    Entities: list(TAG_COMPOUND, []),
    PendingBlockTicks: list(TAG_COMPOUND, []),
    PendingFluidTicks: list(TAG_COMPOUND, []),
  });

  const root = compound({
    MinecraftDataVersion: int(meta.dataVersion),
    Version: int(meta.litematicVersion),
    SubVersion: int(1),
    Metadata: compound(metadata),
    Regions: compound({ [meta.regionName ?? "Statue"]: region }),
  });
  return gzipSync(writeNbt("", root), { level: 9 });
}

function varints(values: Uint16Array): Uint8Array {
  const out = new Uint8Array(values.length * 3);
  let p = 0;
  for (let i = 0; i < values.length; i++) {
    let v = values[i];
    while (v >= 0x80) {
      out[p++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    out[p++] = v;
  }
  return out.slice(0, p);
}

/** Sponge Schematic v2 (.schem) for WorldEdit, FastAsyncWorldEdit and Amulet. */
export function writeSpongeSchem(s: Structure, meta: ExportMeta): Uint8Array {
  if (s.sx > 65535 || s.sy > 65535 || s.sz > 65535) throw new Error("Too large for .schem");
  const palette: Record<string, Tag> = {};
  s.palette.forEach((state, i) => (palette[state] = int(i)));
  const root = compound({
    Version: int(2),
    DataVersion: int(meta.dataVersion),
    Width: short(s.sx << 16 >> 16),
    Height: short(s.sy << 16 >> 16),
    Length: short(s.sz << 16 >> 16),
    Offset: intArray(new Int32Array([0, 0, 0])),
    PaletteMax: int(s.palette.length),
    Palette: compound(palette),
    BlockData: byteArray(varints(s.blocks)),
    BlockEntities: list(TAG_COMPOUND, []),
    Metadata: compound({
      Name: string(meta.name),
      Author: string(meta.author),
      Date: long(BigInt(meta.time ?? Date.now())),
    }),
  });
  return gzipSync(writeNbt("Schematic", root), { level: 9 });
}
