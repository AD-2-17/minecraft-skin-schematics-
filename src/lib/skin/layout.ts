// Minecraft player model geometry and skin UV layout.
//
// Model space is measured in skin pixels: Y up, feet at y = 0, the player
// faces +Z, and the player's right side is -X (so it appears on the viewer's
// left when looking at the front). Face orientation matches the vanilla
// renderer: every face reads unmirrored when viewed from outside.

export type SkinModel = "classic" | "slim";

export type PartId = "head" | "body" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg";

export const PART_IDS: PartId[] = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];

export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface PartLayout {
  id: PartId;
  box: Box;
  /** texture origin of the base layer box */
  base: [number, number];
  /** texture origin of the outer (overlay) layer box */
  outer: [number, number];
  /** joint the part rotates around */
  pivot: [number, number, number];
}

export function partLayouts(model: SkinModel): PartLayout[] {
  const aw = model === "slim" ? 3 : 4;
  return [
    { id: "head", box: { x: -4, y: 24, z: -4, w: 8, h: 8, d: 8 }, base: [0, 0], outer: [32, 0], pivot: [0, 24, 0] },
    { id: "body", box: { x: -4, y: 12, z: -2, w: 8, h: 12, d: 4 }, base: [16, 16], outer: [16, 32], pivot: [0, 12, 0] },
    {
      id: "rightArm",
      box: { x: -4 - aw, y: 12, z: -2, w: aw, h: 12, d: 4 },
      base: [40, 16],
      outer: [40, 32],
      pivot: [-5, model === "slim" ? 21.5 : 22, 0],
    },
    {
      id: "leftArm",
      box: { x: 4, y: 12, z: -2, w: aw, h: 12, d: 4 },
      base: [32, 48],
      outer: [48, 48],
      pivot: [5, model === "slim" ? 21.5 : 22, 0],
    },
    { id: "rightLeg", box: { x: -4, y: 0, z: -2, w: 4, h: 12, d: 4 }, base: [0, 16], outer: [0, 32], pivot: [-2, 12, 0] },
    { id: "leftLeg", box: { x: 0, y: 0, z: -2, w: 4, h: 12, d: 4 }, base: [16, 48], outer: [0, 48], pivot: [2, 12, 0] },
  ];
}

/** Face index order used everywhere: +X, -X, +Y, -Y, +Z, -Z */
export const Face = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 } as const;
export type Face = (typeof Face)[keyof typeof Face];

/**
 * Texture coordinate of the texel shown at a point on a face.
 * (lx, ly, lz) are coordinates relative to the box min corner, already
 * clamped into [0, w) x [0, h) x [0, d). Returns [u, v] in skin pixels.
 */
export function faceTexel(face: Face, box: Box, origin: [number, number], lx: number, ly: number, lz: number): [number, number] {
  const i = faceTexelIndex(face, box, origin, lx, ly, lz);
  return [i % 64, Math.floor(i / 64)];
}

/** Same as faceTexel, as a pixel index (v * 64 + u). Allocation-free for hot loops. */
export function faceTexelIndex(face: Face, box: Box, origin: [number, number], lx: number, ly: number, lz: number): number {
  const { w, h, d } = box;
  const [u, v] = origin;
  const col = (n: number, size: number) => Math.min(size - 1, Math.max(0, Math.floor(n)));
  const rowFromTop = h - 1 - col(ly, h);
  switch (face) {
    case Face.PZ: // front
      return (v + d + rowFromTop) * 64 + u + d + col(lx, w);
    case Face.NZ: // back
      return (v + d + rowFromTop) * 64 + u + 2 * d + w + (w - 1 - col(lx, w));
    case Face.NX: // player's right side
      return (v + d + rowFromTop) * 64 + u + col(lz, d);
    case Face.PX: // player's left side
      return (v + d + rowFromTop) * 64 + u + d + w + (d - 1 - col(lz, d));
    case Face.PY: // top
      return (v + col(lz, d)) * 64 + u + d + col(lx, w);
    default: // bottom
      return (v + col(lz, d)) * 64 + u + d + w + col(lx, w);
  }
}
