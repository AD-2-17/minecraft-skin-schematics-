import { DEFAULT_STYLE, DEFAULT_VERSION, getStyle, getVersion } from "../lib/blocks/blocks";
import type { StatueSettings } from "../lib/build";
import { getPreset, restPose, type Pose } from "../lib/rig/pose";
import type { SkinModel } from "../lib/skin/layout";
import { ITEM_KINDS, MATERIALS, type ItemKind, type Material } from "../lib/voxel/items";
import type { OuterMode } from "../lib/voxel/voxelize";

export interface Settings {
  model: SkinModel;
  poseId: string | null;
  pose: Pose;
  itemKind: ItemKind | "none";
  material: Material;
  hand: "right" | "left";
  itemAngle: number;
  style: string;
  outer: OuterMode;
  scale: number;
  hollow: boolean;
  pedestal: string | null;
  maxBlocks: number;
  version: string;
}

export const DEFAULT_SETTINGS: Settings = {
  model: "classic",
  poseId: "stand",
  pose: restPose(),
  itemKind: "none",
  material: "diamond",
  hand: "right",
  itemAngle: 0,
  style: DEFAULT_STYLE,
  outer: "shell",
  scale: 2,
  hollow: true,
  pedestal: null,
  maxBlocks: 0,
  version: DEFAULT_VERSION,
};

export function toStatueSettings(s: Settings, scaleOverride?: number): StatueSettings {
  return {
    model: s.model,
    pose: s.pose,
    scale: scaleOverride ?? s.scale,
    outer: s.outer,
    item: s.itemKind === "none" ? null : { kind: s.itemKind, material: s.material, hand: s.hand, angle: s.itemAngle },
    style: s.style,
    version: s.version,
    maxBlocks: s.maxBlocks,
    hollow: s.hollow,
    pedestal: s.pedestal,
  };
}

const KEY = "skin-schematic:v1";

export interface Saved {
  settings: Settings;
  skin?: { dataUrl: string; name: string };
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const s = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } as Settings;
    // sanitize anything that may have changed between versions
    s.style = getStyle(s.style).id;
    s.version = getVersion(s.version).id;
    if (s.itemKind !== "none" && !ITEM_KINDS.includes(s.itemKind)) s.itemKind = "none";
    if (!MATERIALS.includes(s.material)) s.material = "diamond";
    s.scale = Math.min(8, Math.max(1, Math.round(s.scale) || 2));
    if (s.poseId && !getPreset(s.poseId)) s.poseId = null;
    s.pose = { ...restPose(), ...s.pose };
    return { settings: s, skin: parsed.skin };
  } catch {
    return null;
  }
}

export function save(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage full or blocked: nothing to do */
  }
}
