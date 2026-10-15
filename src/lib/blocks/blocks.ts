import { RAW_BLOCKS, type Since } from "./blockData";
import { rgbToOklab, unpackRgb, type Lab, type RGB } from "./color";

export interface BlockDef {
  id: string; // without namespace
  name: string;
  hex: number;
  rgb: RGB;
  lab: Lab;
  noise: number;
  since: Since;
  tags: string[];
  props?: Record<string, string>;
}

const NAME_OVERRIDES: Record<string, string> = {
  smooth_quartz: "Smooth Quartz Block",
  quartz_block: "Block of Quartz",
  iron_block: "Block of Iron",
  gold_block: "Block of Gold",
  diamond_block: "Block of Diamond",
  emerald_block: "Block of Emerald",
  lapis_block: "Block of Lapis Lazuli",
  coal_block: "Block of Coal",
  netherite_block: "Block of Netherite",
  amethyst_block: "Block of Amethyst",
  raw_iron_block: "Block of Raw Iron",
  raw_gold_block: "Block of Raw Gold",
  raw_copper_block: "Block of Raw Copper",
  waxed_copper_block: "Waxed Block of Copper",
  snow_block: "Snow Block",
  resin_block: "Block of Resin",
};

function titleCase(id: string): string {
  return id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const BLOCKS: BlockDef[] = RAW_BLOCKS.map(([id, hex, noise, since, tags, props]) => {
  const rgb = unpackRgb(hex);
  return {
    id,
    name: NAME_OVERRIDES[id] ?? titleCase(id),
    hex,
    rgb,
    lab: rgbToOklab(rgb[0], rgb[1], rgb[2]),
    noise,
    since,
    tags,
    props,
  };
});

export const BLOCK_BY_ID: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));

export function getBlock(id: string): BlockDef {
  const b = BLOCK_BY_ID[id];
  if (!b) throw new Error(`Unknown block ${id}`);
  return b;
}

/** Full block-state string, e.g. `minecraft:oak_wood[axis=y]`. */
export function blockStateString(b: BlockDef): string {
  const props = b.props ? Object.entries(b.props) : [];
  if (!props.length) return `minecraft:${b.id}`;
  return `minecraft:${b.id}[${props.map(([k, v]) => `${k}=${v}`).join(",")}]`;
}

// ---------------------------------------------------------------------------
// Target game versions

const SINCE_ORDER: Since[] = ["1.16", "1.18", "1.19", "1.20", "1.21", "1.21.4", "26.1"];

export interface VersionTarget {
  id: string;
  label: string;
  /** DataVersion of the oldest release in the range, so every game in range can load it. */
  dataVersion: number;
  /** Litematica schematic format version understood by every Litematica build in range. */
  litematicVersion: number;
  newest: Since;
}

export const VERSIONS: VersionTarget[] = [
  { id: "26", label: "26.1 – 26.3", dataVersion: 4786, litematicVersion: 7, newest: "26.1" },
  { id: "1.21.4", label: "1.21.4 – 1.21.11", dataVersion: 4189, litematicVersion: 7, newest: "1.21.4" },
  { id: "1.21", label: "1.21 – 1.21.3", dataVersion: 3953, litematicVersion: 7, newest: "1.21" },
  { id: "1.20.5", label: "1.20.5 – 1.20.6", dataVersion: 3837, litematicVersion: 7, newest: "1.20" },
  { id: "1.20", label: "1.20 – 1.20.4", dataVersion: 3463, litematicVersion: 6, newest: "1.20" },
  { id: "1.18", label: "1.18 – 1.19.4", dataVersion: 2860, litematicVersion: 6, newest: "1.18" },
  { id: "1.16", label: "1.16 – 1.17.1", dataVersion: 2566, litematicVersion: 5, newest: "1.16" },
];

export const DEFAULT_VERSION = "1.21";

export function getVersion(id: string): VersionTarget {
  return VERSIONS.find((v) => v.id === id) ?? VERSIONS.find((v) => v.id === DEFAULT_VERSION)!;
}

export function availableIn(b: BlockDef, v: VersionTarget): boolean {
  return SINCE_ORDER.indexOf(b.since) <= SINCE_ORDER.indexOf(v.newest);
}

// ---------------------------------------------------------------------------
// Styles: which blocks a statue may use, and how colors are matched.

export type StyleMode = "color" | "tone";

export interface Style {
  id: string;
  name: string;
  blurb: string;
  mode: StyleMode;
  blocks: string[];
}

const ids = (pred: (b: BlockDef) => boolean) => BLOCKS.filter(pred).map((b) => b.id);
const has = (b: BlockDef, ...t: string[]) => t.some((x) => b.tags.includes(x));

const SURVIVAL_EXCLUDE = new Set([
  "blue_ice",
  "packed_ice",
  "sponge",
  "honeycomb_block",
  "warped_wart_block",
  "nether_wart_block",
  "crimson_hyphae",
  "warped_hyphae",
  "stripped_crimson_hyphae",
  "stripped_warped_hyphae",
  "purpur_block",
  "end_stone_bricks",
  "end_stone",
  "prismarine",
  "prismarine_bricks",
  "dark_prismarine",
  "resin_block",
  "resin_bricks",
  "pale_moss_block",
]);

export const STYLES: Style[] = [
  {
    id: "full",
    name: "Full color",
    blurb: "Closest match from every clean, solid block.",
    mode: "color",
    blocks: ids((b) => !has(b, "precious") && b.noise < 30),
  },
  {
    id: "concrete",
    name: "Concrete",
    blurb: "Sixteen flat, saturated colors.",
    mode: "color",
    blocks: ids((b) => has(b, "concrete")),
  },
  {
    id: "wool",
    name: "Wool",
    blurb: "Soft and bright. Easy to farm.",
    mode: "color",
    blocks: ids((b) => has(b, "wool")),
  },
  {
    id: "terracotta",
    name: "Terracotta",
    blurb: "Muted, earthy tones.",
    mode: "color",
    blocks: ids((b) => has(b, "terracotta")),
  },
  {
    id: "survival",
    name: "Survival",
    blurb: "Common blocks only. No ores, no rare drops.",
    mode: "color",
    blocks: ids(
      (b) =>
        has(b, "wool", "terracotta", "planks", "wood", "stone", "sandstone", "masonry", "natural", "nether") &&
        !has(b, "precious") &&
        !SURVIVAL_EXCLUDE.has(b.id),
    ),
  },
  {
    id: "natural",
    name: "Natural",
    blurb: "Wood, stone and earth. No dyes.",
    mode: "color",
    blocks: ids((b) => !has(b, "dyed", "precious") && b.noise < 32),
  },
  {
    id: "marble",
    name: "Stone statue",
    blurb: "Monochrome, from quartz to blackstone.",
    mode: "tone",
    blocks: [
      "smooth_quartz",
      "calcite",
      "polished_diorite",
      "smooth_stone",
      "polished_andesite",
      "stone",
      "polished_tuff",
      "polished_deepslate",
      "deepslate_tiles",
      "polished_blackstone",
      "blackstone",
    ],
  },
  {
    id: "gilded",
    name: "Gilded",
    blurb: "A gold monument with bronze shadows.",
    mode: "tone",
    blocks: ["gold_block", "raw_gold_block", "honeycomb_block", "yellow_terracotta", "orange_terracotta", "brown_terracotta", "dark_oak_planks"],
  },
  {
    id: "onyx",
    name: "Onyx",
    blurb: "Dark stone with deepslate highlights.",
    mode: "tone",
    blocks: ["polished_andesite", "stone", "polished_deepslate", "deepslate_tiles", "smooth_basalt", "polished_blackstone", "blackstone", "obsidian", "coal_block"],
  },
];

export const DEFAULT_STYLE = "full";

export function getStyle(id: string): Style {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export const PEDESTAL_BLOCKS = [
  "smooth_stone",
  "polished_andesite",
  "smooth_quartz",
  "polished_blackstone",
  "stone_bricks",
  "polished_deepslate",
  "dark_oak_planks",
  "black_concrete",
  "white_concrete",
];
