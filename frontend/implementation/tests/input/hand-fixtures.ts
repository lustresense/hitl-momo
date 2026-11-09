import type { Landmark } from "@/src/input/types";

/**
 * Synthetic 21-point hands for the gesture tests (the sandbox has no camera).
 * The geometry is written out by hand so expectations never reuse the code under test:
 * - wrist at (0.5, 0.9) and middle knuckle at (0.5, 0.7): hand span 0.2;
 * - each finger's PIP joint is 0.3 from the wrist and its tip is `ratio * 0.3` from it,
 *   so ratio < 1 = folded, about 1 = half-bent, 1.5 = straight.
 * Coordinates are camera-frame (not mirrored), as MediaPipe reports them.
 */
const WRIST: Landmark = { x: 0.5, y: 0.9 };
const PIP_DIST = 0.3;
/** Knuckle column per finger: index, middle, ring, pinky. */
const KNUCKLE_X = [0.44, 0.5, 0.56, 0.62] as const;

/** Point at `dist` from the wrist in column `x`, on the upward side of the hand. */
export function pointAt(x: number, dist: number): Landmark {
  return { x, y: WRIST.y - Math.sqrt(dist * dist - (x - WRIST.x) ** 2) };
}

export interface HandSpec {
  /** Tip distance / PIP distance per finger (index, middle, ring, pinky). */
  ratios: readonly [number, number, number, number];
  /** Optional tip column per finger; defaults to the knuckle column (a straight finger). */
  tipX?: readonly [number, number, number, number];
  /** Overrides landmark 8 so a pinch can sit anywhere in the frame. */
  indexTip?: Landmark;
  thumbTip?: Landmark;
  thumbMcp?: Landmark;
}

export function makeHand(spec: HandSpec): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7 }));
  lm[0] = { ...WRIST };
  const fingers: Array<[number, number, number, number]> = [
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  fingers.forEach(([mcp, pip, dip, tip], f) => {
    const knuckle = KNUCKLE_X[f]!;
    const pipPt = pointAt(knuckle, PIP_DIST);
    const tipPt = pointAt(spec.tipX?.[f] ?? knuckle, PIP_DIST * spec.ratios[f]!);
    lm[mcp] = { x: knuckle, y: 0.7 };
    lm[pip] = pipPt;
    lm[dip] = { x: (pipPt.x + tipPt.x) / 2, y: (pipPt.y + tipPt.y) / 2 };
    lm[tip] = f === 0 && spec.indexTip ? { ...spec.indexTip } : tipPt;
  });
  lm[2] = { ...(spec.thumbMcp ?? { x: 0.36, y: 0.7 }) };
  lm[4] = { ...(spec.thumbTip ?? { x: 0.28, y: 0.7 }) };
  lm[3] = { x: (lm[2]!.x + lm[4]!.x) / 2, y: (lm[2]!.y + lm[4]!.y) / 2 };
  return lm;
}

/** Hand span of the fixtures (wrist to middle knuckle). A thumb-index gap of `r` spans is `r * HAND_SPAN` wide. */
export const HAND_SPAN = 0.2;

/** An open hand whose thumb tip sits `gap` spans from its index tip, both at camera point (x, y). */
export function spreadHand(gap: number, x: number, y = 0.5): Landmark[] {
  return makeHand({ ratios: [1.5, 1.5, 1.5, 1.5], thumbTip: { x, y }, indexTip: { x: x + gap * HAND_SPAN, y } });
}

/** A closed fist: every finger folded, thumb down. */
export function fistHand(): Landmark[] {
  return makeHand({ ratios: [0.5, 0.5, 0.5, 0.5] });
}

/** A thumb touching the index tip at camera point (x, y): the pinch that draws. */
export function pinchHand(x: number, y = 0.55): Landmark[] {
  return makeHand({ ratios: [1.5, 0.5, 0.5, 0.5], indexTip: { x, y }, thumbTip: { x: x + 0.004, y } });
}
