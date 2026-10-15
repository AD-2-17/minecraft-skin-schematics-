// Hand-drawn item sprites. Like the game, a held item is a flat sprite one
// pixel thick, drawn diagonally: handle bottom-left, business end top-right.
//
// Glyphs: o outline · a b c d head tones (light → dark) · h H handle ·
// g G guard · s n M m steel (mace) · y gold · u T t w prismarine (trident)

export type ItemKind = "sword" | "axe" | "pickaxe" | "mace" | "trident";
export type Material = "wood" | "stone" | "iron" | "gold" | "diamond" | "netherite";

export interface ItemSpec {
  kind: ItemKind;
  material: Material;
  hand: "right" | "left";
  /** degrees; + raises the tip */
  angle: number;
}

interface Sprite {
  rows: string[];
  /** pixel held in the fist: [col, row] */
  grip: [number, number];
  materials: boolean;
}

export const SPRITES: Record<ItemKind, Sprite> = {
  sword: {
    materials: true,
    grip: [4, 13],
    rows: [
      "................oo",
      "...............oab",
      "..............oabo",
      ".............oabo.",
      "............oabo..",
      "...........oabo...",
      "..........oaco....",
      "....o....oaco.....",
      "...oGo..oaco......",
      "...ogGooaco.......",
      "....ogGaco........",
      "....oogGo.........",
      "...oHhogGo........",
      "..oHho.ogo........",
      ".oHho...o.........",
      "oGGo..............",
      "ogGo..............",
      ".oo...............",
    ],
  },
  axe: {
    materials: true,
    grip: [5, 12],
    rows: [
      "..................",
      "..................",
      ".......oo.........",
      "......oabo...oo...",
      ".....oabcco.ohHo..",
      "....oabccddohHo...",
      "....obbccdohHo....",
      "....occcdohHo.....",
      ".....ocdohHo......",
      "......oohHo.......",
      "......ohHo........",
      ".....ohHo.........",
      "....ohHo..........",
      "...ohHo...........",
      "..ohHo............",
      ".ohHo.............",
      "..oo..............",
      "..................",
    ],
  },
  pickaxe: {
    materials: true,
    grip: [5, 12],
    rows: [
      "..................",
      ".....ooooo........",
      "....oaaabboo......",
      "...oaabbbbbbo.....",
      "....ooooooccbo....",
      "..........odcbo...",
      "..........ohdbbo..",
      ".........ohHocbo..",
      "........ohHoocbo..",
      ".......ohHo..ocbo.",
      "......ohHo...occo.",
      ".....ohHo.....oo..",
      "....ohHo..........",
      "...ohHo...........",
      "..ohHo............",
      ".ohHo.............",
      "..oo..............",
      "..................",
    ],
  },
  mace: {
    materials: false,
    grip: [5, 12],
    rows: [
      "............o.....",
      ".........o.ono.o..",
      "........onooMoono.",
      ".........onsnMMo..",
      "........oosssnMoo.",
      ".......onMnsnMmmno",
      "........ooMnMmmoo.",
      ".........oMMmmmo..",
      "........ohHomoono.",
      ".......ohHoono.o..",
      "......ohHo..o.....",
      ".....ohHo.........",
      "....ohHo..........",
      "..oohHo...........",
      ".oyhHo............",
      ".oyyo.............",
      "..oo..............",
      "..................",
    ],
  },
  trident: {
    materials: false,
    grip: [6, 15],
    rows: [
      "......................",
      "..............o.......",
      ".............ouo...o..",
      "............oTo...ouo.",
      "...........oTo...oTo..",
      "..........oTo...oTo...",
      ".........oTo...oTo....",
      "..........oToooTo...o.",
      "...........oTwTo...ouo",
      "...........oTTwo..oTo.",
      "..........oTtwTo.oTo..",
      ".........oTtoooToTo...",
      "........oTto...oTo....",
      ".......oTto.....o.....",
      "......oTto............",
      ".....oTto.............",
      "....oTto..............",
      "...oTto...............",
      "..oTto................",
      ".owto.................",
      "owwo..................",
      "owo...................",
    ],
  },
};

// Tones per material: [a, b, c, d, outline, guard light, guard dark]
const MATERIAL_TONES: Record<Material, number[]> = {
  wood: [0xc49a5c, 0x9f7a45, 0x7a5a30, 0x5a4020, 0x2e200f, 0x7a5a30, 0x5a4020],
  stone: [0xb5b5b5, 0x8f8f8f, 0x6e6e6e, 0x535353, 0x262626, 0x6e6e6e, 0x4a4a4a],
  iron: [0xffffff, 0xd8d8d8, 0xa8a8ac, 0x6e6e74, 0x1e1e22, 0x8a8a90, 0x55555c],
  gold: [0xfffbb0, 0xfcdc4a, 0xe0a822, 0xa8730f, 0x3d2a05, 0xe0a822, 0xa8730f],
  diamond: [0xd6fff9, 0x5ef0dc, 0x2cb8a8, 0x187a72, 0x0b2e2b, 0x2cb8a8, 0x187a72],
  netherite: [0x8a7f86, 0x5c535a, 0x463e45, 0x322b31, 0x141014, 0x463e45, 0x322b31],
};

const FIXED: Record<string, number> = {
  h: 0x966f3e,
  H: 0x62461f,
  s: 0xe4e4ec,
  n: 0xa8a8b2,
  M: 0x70707a,
  m: 0x40404a,
  y: 0xf0c846,
  u: 0x96e6d2,
  T: 0x40a096,
  t: 0x1e6060,
  w: 0x164042,
};

export const ITEM_LABELS: Record<ItemKind, string> = {
  sword: "Sword",
  axe: "Axe",
  pickaxe: "Pickaxe",
  mace: "Mace",
  trident: "Trident",
};

export const MATERIAL_LABELS: Record<Material, string> = {
  wood: "Wood",
  stone: "Stone",
  iron: "Iron",
  gold: "Gold",
  diamond: "Diamond",
  netherite: "Netherite",
};

export const ITEM_KINDS: ItemKind[] = ["sword", "axe", "pickaxe", "mace", "trident"];
export const MATERIALS: Material[] = ["wood", "stone", "iron", "gold", "diamond", "netherite"];

export function itemHasMaterial(kind: ItemKind) {
  return SPRITES[kind].materials;
}

/** Resolve a sprite into packed RGB per pixel (-1 = empty), rows top to bottom. */
export function spritePixels(kind: ItemKind, material: Material): { w: number; h: number; px: Int32Array; grip: [number, number] } {
  const s = SPRITES[kind];
  const tones = MATERIAL_TONES[s.materials ? material : "iron"];
  const map: Record<string, number> = {
    ...FIXED,
    a: tones[0],
    b: tones[1],
    c: tones[2],
    d: tones[3],
    o: s.materials ? tones[4] : 0x1c1c22,
    G: tones[5],
    g: tones[6],
  };
  const h = s.rows.length;
  const w = s.rows[0].length;
  const px = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = s.rows[y][x];
      if (ch !== ".") px[y * w + x] = map[ch] ?? 0xff00ff;
    }
  }
  return { w, h, px, grip: s.grip };
}
