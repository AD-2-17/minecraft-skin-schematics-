import { partLayouts, type Box, type PartId, type SkinModel } from "../skin/layout";
import { around, chain, identity, rotX, rotY, rotZ, type Mat4 } from "./mat4";

// Angles are in degrees and named for what they do to the player:
//   head:  pitch + looks up,       yaw + turns to the player's left,  roll tilts
//   body:  pitch + leans forward,  yaw + twists left,                 roll leans sideways
//   limbs: pitch + swings forward, roll + raises outward,             yaw + twists outward
//   bend:  elbows flex forward, knees flex backward

export interface Joint {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface LimbJoint extends Joint {
  bend: number;
}

export interface Pose {
  head: Joint;
  body: Joint;
  rightArm: LimbJoint;
  leftArm: LimbJoint;
  rightLeg: LimbJoint;
  leftLeg: LimbJoint;
}

export type JointId = keyof Pose;
export const JOINT_IDS: JointId[] = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];
export const LIMBS: JointId[] = ["rightArm", "leftArm", "rightLeg", "leftLeg"];

export const JOINT_LABELS: Record<JointId, string> = {
  head: "Head",
  body: "Body",
  rightArm: "Right arm",
  leftArm: "Left arm",
  rightLeg: "Right leg",
  leftLeg: "Left leg",
};

const j = (): Joint => ({ pitch: 0, yaw: 0, roll: 0 });
const l = (): LimbJoint => ({ pitch: 0, yaw: 0, roll: 0, bend: 0 });

export function restPose(): Pose {
  return { head: j(), body: j(), rightArm: l(), leftArm: l(), rightLeg: l(), leftLeg: l() };
}

export type PoseInput = { [K in JointId]?: Partial<Pose[K]> };

export function makePose(input: PoseInput): Pose {
  const p = restPose();
  for (const k of JOINT_IDS) Object.assign(p[k], input[k] ?? {});
  return p;
}

export function clonePose(p: Pose): Pose {
  return JSON.parse(JSON.stringify(p));
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = restPose();
  for (const k of JOINT_IDS) {
    const src = a[k] as unknown as Record<string, number>;
    const dst = b[k] as unknown as Record<string, number>;
    const o = out[k] as unknown as Record<string, number>;
    for (const key of Object.keys(o)) o[key] = src[key] + (dst[key] - src[key]) * t;
  }
  return out;
}

/** Copy one side's limbs onto the other, mirrored. */
export function mirrorPose(p: Pose, from: "right" | "left"): Pose {
  const out = clonePose(p);
  if (from === "right") {
    out.leftArm = { ...p.rightArm };
    out.leftLeg = { ...p.rightLeg };
  } else {
    out.rightArm = { ...p.leftArm };
    out.rightLeg = { ...p.leftLeg };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rig: turn a pose into rigid segments with world matrices.

export type SegmentId = "head" | "body" | `${"rightArm" | "leftArm" | "rightLeg" | "leftLeg"}${"Upper" | "Lower"}`;

export interface Segment {
  id: SegmentId;
  part: PartId;
  /** numeric id stored per voxel (1-based) */
  index: number;
  /** full part box in rest space */
  box: Box;
  /** y-range of the box this segment owns, in rest space */
  y0: number;
  y1: number;
  /** extra rest-space length past the cut that this segment also fills (covers the bend wedge) */
  extendBelow: number;
  extendAbove: number;
  /** cut faces are interior: skip them when picking a texture face */
  cutBelow: boolean;
  cutAbove: boolean;
  base: [number, number];
  outer: [number, number];
  matrix: Mat4;
}

export const SEGMENT_ORDER: SegmentId[] = [
  "head",
  "body",
  "rightArmUpper",
  "rightArmLower",
  "leftArmUpper",
  "leftArmLower",
  "rightLegUpper",
  "rightLegLower",
  "leftLegUpper",
  "leftLegLower",
];

export const SEGMENT_PART: Record<SegmentId, JointId> = {
  head: "head",
  body: "body",
  rightArmUpper: "rightArm",
  rightArmLower: "rightArm",
  leftArmUpper: "leftArm",
  leftArmLower: "leftArm",
  rightLegUpper: "rightLeg",
  rightLegLower: "rightLeg",
  leftLegUpper: "leftLeg",
  leftLegLower: "leftLeg",
};

export interface Rig {
  segments: Segment[];
  /** matrix of the hand that holds items, by side */
  hand: Record<"right" | "left", { matrix: Mat4; point: [number, number, number] }>;
}

function jointMatrix(id: JointId, jt: Joint): Mat4 {
  const side = id.startsWith("right") ? -1 : 1;
  switch (id) {
    case "head":
      return chain(rotZ(jt.roll), rotY(jt.yaw), rotX(-jt.pitch));
    case "body":
      return chain(rotZ(jt.roll), rotY(jt.yaw), rotX(jt.pitch));
    default:
      return chain(rotZ(side * jt.roll), rotY(side * jt.yaw), rotX(-jt.pitch));
  }
}

export function buildRig(model: SkinModel, pose: Pose): Rig {
  const layouts = Object.fromEntries(partLayouts(model).map((p) => [p.id, p]));
  const bodyM = around(layouts.body.pivot, jointMatrix("body", pose.body));
  const segments: Segment[] = [];
  const hand = {} as Rig["hand"];

  const push = (s: Omit<Segment, "index">) => segments.push({ ...s, index: SEGMENT_ORDER.indexOf(s.id) + 1 });

  const head = layouts.head;
  push({
    id: "head",
    part: "head",
    box: head.box,
    y0: head.box.y,
    y1: head.box.y + head.box.h,
    extendAbove: 0,
    extendBelow: 0,
    cutAbove: false,
    cutBelow: false,
    base: head.base,
    outer: head.outer,
    matrix: chain(bodyM, around(head.pivot, jointMatrix("head", pose.head))),
  });
  const body = layouts.body;
  push({
    id: "body",
    part: "body",
    box: body.box,
    y0: body.box.y,
    y1: body.box.y + body.box.h,
    extendAbove: 0,
    extendBelow: 0,
    cutAbove: false,
    cutBelow: false,
    base: body.base,
    outer: body.outer,
    matrix: bodyM,
  });

  for (const limb of ["rightArm", "leftArm", "rightLeg", "leftLeg"] as const) {
    const lay = layouts[limb];
    const jt = pose[limb];
    const isArm = limb.endsWith("Arm");
    const parent = isArm ? bodyM : identity();
    const upper = chain(parent, around(lay.pivot, jointMatrix(limb, jt)));
    const b = lay.box;
    const mid = b.y + b.h / 2;
    const joint = [b.x + b.w / 2, mid, b.z + b.d / 2];
    const bend = isArm ? rotX(-jt.bend) : rotX(jt.bend);
    const lower = chain(upper, around(joint, bend));
    const ext = Math.abs(jt.bend) > 0.01 ? b.d / 2 + 0.5 : 0;
    push({
      id: `${limb}Upper`,
      part: limb,
      box: b,
      y0: mid,
      y1: b.y + b.h,
      extendBelow: ext,
      extendAbove: 0,
      cutBelow: true,
      cutAbove: false,
      base: lay.base,
      outer: lay.outer,
      matrix: upper,
    });
    push({
      id: `${limb}Lower`,
      part: limb,
      box: b,
      y0: b.y,
      y1: mid,
      extendBelow: 0,
      extendAbove: ext,
      cutBelow: false,
      cutAbove: true,
      base: lay.base,
      outer: lay.outer,
      matrix: lower,
    });
    if (isArm) {
      hand[limb === "rightArm" ? "right" : "left"] = { matrix: lower, point: [b.x + b.w / 2, b.y + 1, b.z + b.d / 2] };
    }
  }
  return { segments, hand };
}

// ---------------------------------------------------------------------------
// Presets

export interface PosePreset {
  id: string;
  name: string;
  pose: Pose;
  /** suggested in-hand item angle for this pose */
  itemAngle?: number;
}

export const POSE_PRESETS: PosePreset[] = [
  { id: "stand", name: "Stand", pose: restPose() },
  {
    id: "walk",
    name: "Walk",
    pose: makePose({
      rightArm: { pitch: -26 },
      leftArm: { pitch: 26 },
      rightLeg: { pitch: 26 },
      leftLeg: { pitch: -26 },
    }),
  },
  {
    id: "run",
    name: "Run",
    pose: makePose({
      body: { pitch: 10 },
      head: { pitch: 6 },
      rightArm: { pitch: 55, bend: 75 },
      leftArm: { pitch: -45, bend: 45 },
      rightLeg: { pitch: -35, bend: 55 },
      leftLeg: { pitch: 50, bend: 25 },
    }),
  },
  {
    id: "wave",
    name: "Wave",
    pose: makePose({
      head: { yaw: -12, roll: -4 },
      rightArm: { roll: 96, pitch: 6, bend: 92, yaw: 90 },
      leftArm: { roll: 4 },
    }),
  },
  {
    id: "victory",
    name: "Victory",
    pose: makePose({
      head: { pitch: 14 },
      rightArm: { roll: 152, pitch: 6 },
      leftArm: { roll: 152, pitch: 6 },
    }),
  },
  { id: "tpose", name: "T-pose", pose: makePose({ rightArm: { roll: 90 }, leftArm: { roll: 90 } }) },
  {
    id: "point",
    name: "Point",
    pose: makePose({ head: { yaw: -8 }, rightArm: { pitch: 88, yaw: 8 }, leftArm: { pitch: -6 } }),
  },
  {
    id: "salute",
    name: "Salute",
    pose: makePose({ rightArm: { pitch: 100, roll: 62, yaw: -78, bend: 132 } }),
  },
  {
    id: "hips",
    name: "Hero",
    pose: makePose({
      head: { pitch: 6 },
      rightArm: { roll: 42, yaw: -90, bend: 105, pitch: -6 },
      leftArm: { roll: 42, yaw: -90, bend: 105, pitch: -6 },
      rightLeg: { roll: 6 },
      leftLeg: { roll: 6 },
    }),
  },
  {
    id: "flex",
    name: "Flex",
    pose: makePose({
      head: { pitch: 4 },
      rightArm: { roll: 92, yaw: 90, bend: 115 },
      leftArm: { roll: 92, yaw: 90, bend: 115 },
    }),
  },
  {
    id: "think",
    name: "Think",
    pose: makePose({
      head: { pitch: -10, roll: 6 },
      rightArm: { pitch: 30, yaw: -30, bend: 145, roll: 8 },
      leftArm: { pitch: 40, yaw: 60, bend: 95 },
    }),
  },
  {
    id: "dab",
    name: "Dab",
    pose: makePose({
      head: { pitch: -32, yaw: 28, roll: 10 },
      body: { yaw: 8 },
      rightArm: { roll: 128, pitch: 30 },
      leftArm: { pitch: 72, roll: -38, yaw: 30, bend: 100 },
    }),
  },
  {
    id: "zombie",
    name: "Zombie",
    pose: makePose({ head: { pitch: -6 }, rightArm: { pitch: 90 }, leftArm: { pitch: 90 } }),
  },
  {
    id: "sit",
    name: "Sit",
    pose: makePose({
      rightArm: { pitch: 18 },
      leftArm: { pitch: 18 },
      rightLeg: { pitch: 90, roll: 4 },
      leftLeg: { pitch: 90, roll: 4 },
    }),
  },
  {
    id: "kneel",
    name: "Kneel",
    pose: makePose({
      head: { pitch: -8 },
      rightArm: { pitch: 10 },
      leftArm: { pitch: 10 },
      rightLeg: { pitch: 90, bend: 90 },
      leftLeg: { pitch: -12, bend: 100 },
    }),
  },
  {
    id: "sneak",
    name: "Sneak",
    pose: makePose({ body: { pitch: 28 }, head: { pitch: 22 }, rightArm: { pitch: 8 }, leftArm: { pitch: 8 } }),
  },
  {
    id: "strike",
    name: "Strike",
    itemAngle: -120,
    pose: makePose({
      head: { pitch: 10 },
      body: { yaw: -10 },
      rightArm: { pitch: 168, roll: 8 },
      leftArm: { pitch: 20, roll: 10 },
      rightLeg: { pitch: -14 },
      leftLeg: { pitch: 18 },
    }),
  },
  {
    id: "throw",
    name: "Throw",
    itemAngle: 135,
    pose: makePose({
      head: { pitch: 4, yaw: 6 },
      body: { yaw: -16, pitch: -4 },
      rightArm: { pitch: 150, roll: 14, bend: 30 },
      leftArm: { pitch: 60, roll: 6 },
      rightLeg: { pitch: -20 },
      leftLeg: { pitch: 22 },
    }),
  },
  {
    id: "guard",
    name: "Guard",
    itemAngle: -55,
    pose: makePose({
      head: { pitch: -2, yaw: -6 },
      rightArm: { pitch: 48, roll: 6, bend: 52 },
      leftArm: { pitch: 18, roll: 8, bend: 30 },
      rightLeg: { pitch: 16, roll: 4 },
      leftLeg: { pitch: -14, roll: 4 },
    }),
  },
  {
    id: "rest",
    name: "At rest",
    itemAngle: -110,
    pose: makePose({ head: { pitch: -4 }, rightArm: { pitch: 4, roll: 4 } }),
  },
];

export function getPreset(id: string) {
  return POSE_PRESETS.find((p) => p.id === id);
}
