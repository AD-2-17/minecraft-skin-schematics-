import { describe, expect, it } from "vitest";
import { buildStatue } from "../src/lib/build";
import { getStyle } from "../src/lib/blocks/blocks";
import { matchColors } from "../src/lib/blocks/matcher";
import { getPreset, restPose } from "../src/lib/rig/pose";
import { normalizeSkin } from "../src/lib/skin/skin";
import { paintSteve } from "../src/lib/skin/steve";
import { voxelize } from "../src/lib/voxel/voxelize";

const skin = normalizeSkin(paintSteve(), 64, 64).data;

describe("voxelizer", () => {
  it("builds a standing classic player at 1 block per pixel", () => {
    const g = voxelize(skin, { model: "classic", pose: restPose(), scale: 1, outer: "off", item: null });
    expect([g.sx, g.sy, g.sz]).toEqual([16, 32, 8]);
  });

  it("uses 3 px arms for slim skins", () => {
    const g = voxelize(skin, { model: "slim", pose: restPose(), scale: 1, outer: "off", item: null });
    expect(g.sx).toBe(14);
  });

  it("scales every dimension", () => {
    const g = voxelize(skin, { model: "classic", pose: restPose(), scale: 3, outer: "off", item: null });
    expect([g.sx, g.sy, g.sz]).toEqual([48, 96, 24]);
  });

  it("maps the face onto the front of the head", () => {
    const g = voxelize(skin, { model: "classic", pose: restPose(), scale: 1, outer: "off", item: null });
    // front-most layer of the head, eye row: x = 4 + col, y = 24 + (7 - row), z = 7
    const at = (x: number, y: number, z: number) => g.color[(y * g.sz + z) * g.sx + x] - 1;
    const px = (u: number, v: number) => {
      const i = (v * 64 + u) * 4;
      return (skin[i] << 16) | (skin[i + 1] << 8) | skin[i + 2];
    };
    for (let col = 1; col < 7; col++) expect(at(4 + col, 24 + 3, 7)).toBe(px(8 + col, 8 + 4));
  });

  it("raises the right arm above the head when striking", () => {
    const rest = voxelize(skin, { model: "classic", pose: restPose(), scale: 1, outer: "off", item: null });
    const up = voxelize(skin, { model: "classic", pose: getPreset("strike")!.pose, scale: 1, outer: "off", item: null });
    expect(up.sy).toBeGreaterThan(rest.sy);
  });

  it("adds a held item", () => {
    const g = voxelize(skin, { model: "classic", pose: restPose(), scale: 1, outer: "off", item: { kind: "sword", material: "iron", hand: "right", angle: 0 } });
    expect(g.sz).toBeGreaterThan(8);
  });
});

describe("block matching", () => {
  const weights = new Map<number, number>();
  for (let i = 0; i < 64 * 64; i++) if (skin[i * 4 + 3]) {
    const c = (skin[i * 4] << 16) | (skin[i * 4 + 1] << 8) | skin[i * 4 + 2];
    weights.set(c, (weights.get(c) ?? 0) + 1);
  }

  it("respects the block type cap", () => {
    expect(matchColors(weights, "full", "1.21", 6).used.length).toBeLessThanOrEqual(6);
  });

  it("only uses a style's own blocks", () => {
    const style = getStyle("marble");
    for (const b of matchColors(weights, "marble", "1.21").used) expect(style.blocks).toContain(b.id);
  });

  it("never picks a block newer than the target version", () => {
    const used = matchColors(weights, "full", "1.16").used;
    for (const b of used) expect(b.since).toBe("1.16");
  });
});

describe("statue", () => {
  const base = { model: "classic" as const, pose: restPose(), scale: 2, outer: "shell" as const, item: null, style: "full", version: "1.21", maxBlocks: 0, pedestal: null };

  it("hollowing removes hidden blocks only", () => {
    const solid = buildStatue(skin, { ...base, hollow: false });
    const hollow = buildStatue(skin, { ...base, hollow: true });
    expect(hollow.total).toBeLessThan(solid.total);
    expect([hollow.sx, hollow.sy, hollow.sz]).toEqual([solid.sx, solid.sy, solid.sz]);
  });

  it("adds a pedestal under the feet", () => {
    const plain = buildStatue(skin, { ...base, hollow: true });
    const ped = buildStatue(skin, { ...base, hollow: true, pedestal: "smooth_stone" });
    expect(ped.sy).toBeGreaterThan(plain.sy);
    expect(ped.palette).toContain("smooth_stone");
    // bottom layer is entirely pedestal inside its footprint
    const bottom = [] as number[];
    for (let z = 0; z < ped.sz; z++) for (let x = 0; x < ped.sx; x++) bottom.push(ped.cells[z * ped.sx + x]);
    const id = ped.palette.indexOf("smooth_stone") + 1;
    expect(bottom.filter((c) => c === id).length).toBeGreaterThan(0);
  });

  it("counts every block exactly once", () => {
    const st = buildStatue(skin, { ...base, hollow: true });
    expect(st.counts.reduce((a, b) => a + b, 0)).toBe(st.total);
    expect(st.cells.filter((c) => c > 0).length).toBe(st.total);
  });
});
