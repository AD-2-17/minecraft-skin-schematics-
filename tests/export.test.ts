import { describe, expect, it } from "vitest";
import { gunzipSync } from "fflate";
import { packBlockStates, writeLitematic, writeSpongeSchem, type Structure } from "../src/lib/export/schematic";
import { litematicaGetAt, readNbt } from "./nbtReader";

function sample(sx: number, sy: number, sz: number, paletteSize: number): Structure {
  const blocks = new Uint16Array(sx * sy * sz);
  let seed = 7;
  for (let i = 0; i < blocks.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    blocks[i] = seed % 3 === 0 ? 0 : seed % paletteSize;
  }
  const palette = ["minecraft:air", ...Array.from({ length: paletteSize - 1 }, (_, i) => (i === 0 ? "minecraft:oak_wood[axis=y]" : `minecraft:block_${i}`))];
  return { sx, sy, sz, blocks, palette };
}

const toLongs = (words: Uint32Array) => {
  const out: bigint[] = [];
  for (let i = 0; i < words.length; i += 2) out.push(BigInt.asIntN(64, (BigInt(words[i + 1]) << 32n) | BigInt(words[i])));
  return out;
};

describe("block state packing", () => {
  for (const size of [2, 3, 5, 17, 33, 100, 300]) {
    it(`matches Litematica's bit array for a palette of ${size}`, () => {
      const s = sample(13, 9, 7, size);
      const { bits, words } = packBlockStates(s.blocks, s.palette.length);
      expect(bits).toBe(Math.max(2, Math.ceil(Math.log2(size))));
      expect(words.length / 2).toBe(Math.ceil((s.blocks.length * bits) / 64));
      const longs = toLongs(words);
      for (let i = 0; i < s.blocks.length; i++) expect(litematicaGetAt(longs, bits, i)).toBe(s.blocks[i]);
    });
  }
});

describe("litematic writer", () => {
  it("writes a structure Litematica can read", () => {
    const s = sample(5, 6, 4, 9);
    const preview = new Int32Array(16 * 16).fill(0xff336699 | 0);
    const file = writeLitematic(s, { name: "Test", author: "me", description: "d", dataVersion: 3953, litematicVersion: 7, preview, time: 1_700_000_000_000 });
    const { name, value } = readNbt(gunzipSync(file));
    expect(name).toBe("");
    expect(value.MinecraftDataVersion).toBe(3953);
    expect(value.Version).toBe(7);
    expect(value.SubVersion).toBe(1);
    const meta = value.Metadata as Record<string, any>;
    expect(meta.Name).toBe("Test");
    expect(meta.EnclosingSize).toEqual({ x: 5, y: 6, z: 4 });
    expect(meta.TotalVolume).toBe(120);
    expect(meta.TotalBlocks).toBe(s.blocks.filter((b) => b).length);
    expect(meta.TimeCreated).toBe(1_700_000_000_000n);
    expect((meta.PreviewImageData as Int32Array).length).toBe(256);
    const region = (value.Regions as Record<string, any>).Statue;
    expect(region.Position).toEqual({ x: 0, y: 0, z: 0 });
    expect(region.Size).toEqual({ x: 5, y: 6, z: 4 });
    expect(region.BlockStatePalette[0]).toEqual({ Name: "minecraft:air" });
    expect(region.BlockStatePalette[1]).toEqual({ Name: "minecraft:oak_wood", Properties: { axis: "y" } });
    for (const k of ["TileEntities", "Entities", "PendingBlockTicks", "PendingFluidTicks"]) expect(region[k]).toEqual([]);
    const bits = Math.max(2, 32 - Math.clz32(s.palette.length - 1));
    for (let i = 0; i < s.blocks.length; i++) expect(litematicaGetAt(region.BlockStates, bits, i)).toBe(s.blocks[i]);
  });
});

describe("sponge schem writer", () => {
  it("writes v2 with varint block data", () => {
    const s = sample(7, 3, 5, 200);
    const { name, value } = readNbt(gunzipSync(writeSpongeSchem(s, { name: "T", author: "a", description: "", dataVersion: 3953, litematicVersion: 7 })));
    expect(name).toBe("Schematic");
    expect(value.Version).toBe(2);
    expect([value.Width, value.Height, value.Length]).toEqual([7, 3, 5]);
    const palette = value.Palette as Record<string, number>;
    expect(palette["minecraft:air"]).toBe(0);
    expect(value.PaletteMax).toBe(200);
    const data = value.BlockData as Uint8Array;
    const decoded: number[] = [];
    for (let p = 0; p < data.length; ) {
      let v = 0, shift = 0, b;
      do { b = data[p++]; v |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
      decoded.push(v);
    }
    expect(decoded).toEqual(Array.from(s.blocks));
  });
});
