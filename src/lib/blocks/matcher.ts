import { availableIn, BLOCK_BY_ID, getStyle, getVersion, type BlockDef } from "./blocks";
import { rgbToOklab, unpackRgb, type Lab } from "./color";

/** Penalty per unit of texture noise, in OKLab distance. Keeps speckled blocks for when they really fit. */
const NOISE_K = 0.0007;
/** Hue shifts (pink vs. tan skin) read as far worse than small lightness or saturation errors. */
const HUE_W = 2.5;

export interface MatchResult {
  /** packed RGB -> block */
  byColor: Map<number, BlockDef>;
  /** blocks actually used, most used first */
  used: BlockDef[];
}

/**
 * Map every distinct color to a block.
 * @param weights packed RGB -> number of voxels using it
 * @param maxBlocks cap on distinct block types (0 = no cap)
 */
export function matchColors(weights: Map<number, number>, styleId: string, versionId: string, maxBlocks = 0): MatchResult {
  const style = getStyle(styleId);
  const version = getVersion(versionId);
  let candidates = style.blocks.map((id) => BLOCK_BY_ID[id]).filter((b) => b && availableIn(b, version));
  if (!candidates.length) candidates = [BLOCK_BY_ID.white_concrete];

  const colors = [...weights.keys()];
  const labs = new Map<number, Lab>();
  for (const c of colors) {
    const [r, g, b] = unpackRgb(c);
    labs.set(c, rgbToOklab(r, g, b));
  }

  let score: (c: number, b: BlockDef) => number;

  if (style.mode === "tone") {
    // Auto-level the skin's lightness into the ramp's range so features stay readable.
    const sorted = colors.map((c) => [labs.get(c)![0], weights.get(c)!] as const).sort((a, b) => a[0] - b[0]);
    const total = sorted.reduce((s, x) => s + x[1], 0);
    const pct = (p: number) => {
      let acc = 0;
      for (const [l, w] of sorted) {
        acc += w;
        if (acc >= total * p) return l;
      }
      return sorted.length ? sorted[sorted.length - 1][0] : 0.5;
    };
    const lo = pct(0.03);
    const hi = pct(0.97);
    const rampL = candidates.map((b) => b.lab[0]);
    const rLo = Math.min(...rampL);
    const rHi = Math.max(...rampL);
    const span = Math.max(1e-3, hi - lo);
    score = (c, b) => {
      const t = Math.min(1, Math.max(0, (labs.get(c)![0] - lo) / span));
      const target = rLo + t * (rHi - rLo);
      const d = target - b.lab[0];
      return d * d + NOISE_K * NOISE_K * b.noise * b.noise * 0.25;
    };
  } else {
    score = (c, b) => {
      const l = labs.get(c)!;
      const dl = l[0] - b.lab[0];
      const da = l[1] - b.lab[1];
      const db = l[2] - b.lab[2];
      const dc = Math.hypot(l[1], l[2]) - Math.hypot(b.lab[1], b.lab[2]);
      const dh2 = Math.max(0, da * da + db * db - dc * dc);
      const d = Math.sqrt(dl * dl + dc * dc + HUE_W * dh2) + NOISE_K * b.noise;
      return d * d;
    };
  }

  // Rank candidates for every color once; reassignments then just walk the list.
  const ranked = new Map<number, BlockDef[]>();
  for (const c of colors) {
    ranked.set(
      c,
      candidates
        .map((b) => [b, score(c, b)] as const)
        .sort((a, b) => a[1] - b[1])
        .map((x) => x[0]),
    );
  }

  const removed = new Set<string>();
  const pick = (c: number) => ranked.get(c)!.find((b) => !removed.has(b.id))!;

  const usage = () => {
    const u = new Map<string, number>();
    for (const c of colors) {
      const b = pick(c);
      u.set(b.id, (u.get(b.id) ?? 0) + weights.get(c)!);
    }
    return u;
  };

  let u = usage();
  if (maxBlocks > 0) {
    while (u.size > maxBlocks) {
      let worst = "";
      let worstCount = Infinity;
      for (const [id, n] of u) {
        if (n < worstCount) {
          worst = id;
          worstCount = n;
        }
      }
      removed.add(worst);
      u = usage();
    }
  }

  const byColor = new Map<number, BlockDef>();
  for (const c of colors) byColor.set(c, pick(c));
  const used = [...u.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => BLOCK_BY_ID[id]);
  return { byColor, used };
}
