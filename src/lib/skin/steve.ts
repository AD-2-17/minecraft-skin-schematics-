// An original, hand-painted take on the classic default look: brown hair,
// teal tee, blue jeans. Painted in code so the site ships no game assets.

import { partLayouts, type Box } from "./layout";
import { SKIN_SIZE } from "./skin";

type Painter = (col: number, row: number, cols: number, rows: number) => number | null;

const C = {
  hair: [0x3a2814, 0x45301a, 0x2f2010],
  skin: [0xc29274, 0xbb8b6d, 0xc8987a],
  skinShade: 0xa5775c,
  nose: 0x9a6a50,
  mouth: 0x6b4230,
  beard: 0x5e3b29,
  eyeWhite: 0xf4f4f4,
  pupil: 0x4f3d8f,
  shirt: [0x0fa3a3, 0x0b9496, 0x17b0ae],
  shirtShade: 0x0a7f82,
  pants: [0x3a3d9a, 0x33358a, 0x4245a8],
  pantsShade: 0x2c2e78,
  shoe: [0x6a6a6a, 0x5c5c5c, 0x747474],
};

// Deterministic per-pixel variation so large areas don't look flat.
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function pick(tones: number[], x: number, y: number) {
  const r = hash(x, y);
  return r < 0.62 ? tones[0] : r < 0.84 ? tones[1] : tones[2];
}

type FaceName = "top" | "bottom" | "right" | "front" | "left" | "back";

function faceRect(box: Box, origin: [number, number], face: FaceName): [number, number, number, number] {
  const { w, h, d } = box;
  const [u, v] = origin;
  switch (face) {
    case "top":
      return [u + d, v, w, d];
    case "bottom":
      return [u + d + w, v, w, d];
    case "right":
      return [u, v + d, d, h];
    case "front":
      return [u + d, v + d, w, h];
    case "left":
      return [u + d + w, v + d, d, h];
    case "back":
      return [u + 2 * d + w, v + d, w, h];
  }
}

export function paintSteve(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  const parts = Object.fromEntries(partLayouts("classic").map((p) => [p.id, p]));

  const paint = (part: keyof typeof parts, face: FaceName, fn: Painter) => {
    const p = parts[part];
    const [x0, y0, w, h] = faceRect(p.box, p.base, face);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const c = fn(col, row, w, h);
        if (c === null) continue;
        const i = ((y0 + row) * SKIN_SIZE + x0 + col) * 4;
        px[i] = (c >> 16) & 255;
        px[i + 1] = (c >> 8) & 255;
        px[i + 2] = c & 255;
        px[i + 3] = 255;
      }
    }
  };

  const hair = (x: number, y: number) => pick(C.hair, x, y);
  const skin = (x: number, y: number) => pick(C.skin, x, y);
  const shirt = (x: number, y: number) => pick(C.shirt, x, y);
  const pants = (x: number, y: number) => pick(C.pants, x, y);

  // Head
  const FACE = [
    "HHHHHHHH",
    "HHHHHHHH",
    "HSSSSSSH",
    "sSSSSSSs",
    "SWPSSPWS",
    "sSSNNSSs",
    "SSMMMMSS",
    "SSBSSBSS",
  ];
  paint("head", "front", (c, r) => {
    const ch = FACE[r][c];
    const x = c + 8, y = r + 8;
    switch (ch) {
      case "H": return hair(x, y);
      case "S": return skin(x, y);
      case "s": return C.skinShade;
      case "W": return C.eyeWhite;
      case "P": return C.pupil;
      case "N": return C.nose;
      case "M": return C.mouth;
      case "B": return C.beard;
    }
    return null;
  });
  paint("head", "top", (c, r) => hair(c + 8, r));
  paint("head", "bottom", (c, r) => (r === 7 && c > 1 && c < 6 ? C.beard : skin(c + 16, r)));
  paint("head", "back", (c, r) => (r === 7 ? C.skinShade : hair(c + 24, r + 8)));
  const side = (front: (c: number) => number) => (c: number, r: number) => {
    const f = front(c); // 0 = back .. 7 = front
    const x = c + 40, y = r + 8;
    if (r <= 1) return hair(x, y);
    if (r === 2) return f <= 5 ? hair(x, y) : skin(x, y);
    if (r <= 4) {
      if (f <= 3) return hair(x, y);
      if (f === 4) return C.skinShade;
      return skin(x, y);
    }
    if (f <= 1) return hair(x, y);
    if (f === 7 && r >= 6) return C.beard;
    return r === 7 ? C.skinShade : skin(x, y);
  };
  paint("head", "right", side((c) => c));
  paint("head", "left", side((c) => 7 - c));

  // Body
  paint("body", "front", (c, r) => {
    if (r === 0 && (c === 3 || c === 4)) return C.skin[1];
    if (r === 11) return C.shirtShade;
    return shirt(c + 20, r + 20);
  });
  paint("body", "back", (c, r) => (r === 11 ? C.shirtShade : shirt(c + 32, r + 20)));
  paint("body", "right", (c, r) => (r === 11 ? C.shirtShade : shirt(c + 16, r + 20)));
  paint("body", "left", (c, r) => (r === 11 ? C.shirtShade : shirt(c + 28, r + 20)));
  paint("body", "top", (c, r) => shirt(c + 20, r + 16));
  paint("body", "bottom", () => C.pantsShade);

  // Arms: short sleeves, bare forearms
  for (const arm of ["rightArm", "leftArm"] as const) {
    const ox = arm === "rightArm" ? 40 : 32;
    const oy = arm === "rightArm" ? 16 : 48;
    const sleeve = (c: number, r: number, face: FaceName) => {
      const x = ox + c + (face === "front" ? 4 : face === "back" ? 12 : face === "left" ? 8 : 0);
      const y = oy + r + 4;
      if (r <= 2) return shirt(x, y);
      if (r === 3) return C.shirtShade;
      if (face === "back") return r >= 10 ? C.skinShade : pick([C.skin[1], C.skin[0], C.skinShade], x, y);
      return r >= 10 ? pick([C.skin[1], C.skinShade, C.skin[0]], x, y) : skin(x, y);
    };
    for (const face of ["front", "back", "left", "right"] as const) paint(arm, face, (c, r) => sleeve(c, r, face));
    paint(arm, "top", (c, r) => shirt(ox + c + 4, oy + r));
    paint(arm, "bottom", () => C.skinShade);
  }

  // Legs: jeans and shoes
  for (const leg of ["rightLeg", "leftLeg"] as const) {
    const ox = leg === "rightLeg" ? 0 : 16;
    const oy = leg === "rightLeg" ? 16 : 48;
    const jean = (c: number, r: number, face: FaceName) => {
      const x = ox + c + (face === "front" ? 4 : face === "back" ? 12 : face === "left" ? 8 : 0);
      const y = oy + r + 4;
      if (r >= 10) return pick(C.shoe, x, y);
      if (face === "back" || face === "right" || face === "left") return r === 9 ? C.pantsShade : pick([C.pants[1], C.pants[0], C.pantsShade], x, y);
      return r === 9 ? C.pantsShade : pants(x, y);
    };
    for (const face of ["front", "back", "left", "right"] as const) paint(leg, face, (c, r) => jean(c, r, face));
    paint(leg, "top", (c, r) => pants(ox + c + 4, oy + r));
    paint(leg, "bottom", () => C.shoe[1]);
  }
  return px;
}
