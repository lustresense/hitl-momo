import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import type { Landmark } from "@/src/input/types";
import { MEDIAN_SKELETONS, pinchSkeleton, placeHand, type RealisticClass, type Skeleton } from "../input/realistic-hands";

/**
 * Shared rig for the R17 end-to-end tests: one landmark list per frame through LabAnalyzer, 16:9, class-median hands.
 * The hand moves continuously: the full-frame lock rightly refuses a wrist that jumps further than MAX_JUMP between
 * frames, so every change of place is a glide of small steps in a neutral pose. Evidence class: UNIT_ONLY.
 */
export const ASPECT = 16 / 9;
export const CANVAS = { w: 1280, h: 720 };
const STEP = 0.03; // max wrist travel per frame while gliding (lock limit is 0.18)

export type Build = (cx: number, cy: number) => Landmark[];
export const skel = (s: Skeleton): Build => (cx, cy) => placeHand(s, { aspect: ASPECT, cx, cy });
export const cls = (c: RealisticClass): Build => skel(MEDIAN_SKELETONS[c]);
export const NEUTRAL = cls("thumb_index"); // an L shape: not a pinch, not a command, not erase-eligible
export const PINCH = skel(pinchSkeleton(0.05));

/** Raw-frame origin that puts the palm centre of `s` on canvas point (X, Y) (the preview is mirrored). */
export function originForPalm(s: Skeleton, X: number, Y: number): { cx: number; cy: number } {
  const lm = placeHand(s, { aspect: ASPECT, cx: 0, cy: 0 });
  const k = [5, 9, 13, 17].map((i) => lm[i]!);
  const ox = k.reduce((a, p) => a + p.x, 0) / 4;
  const oy = k.reduce((a, p) => a + p.y, 0) / 4;
  return { cx: 1 - X / CANVAS.w - ox, cy: Y / CANVAS.h - oy };
}

export function rig(opts: { experimental: boolean } = { experimental: true }, onFrame?: (lab: LabAnalyzer, lm: Landmark[] | null, nowMs: number) => void) {
  const lab = new LabAnalyzer({ fullFrameLock: true, enableInk: true, experimentalRobust: opts.experimental });
  let t = 1000;
  let pos = { x: 0.5, y: 0.6 };
  const feedLm = (lm: Landmark[] | null) => {
    t += 33;
    lab.analyse({ landmarks: lm ? [lm] : [], inferMs: 5, nowMs: t, aspect: ASPECT });
    onFrame?.(lab, lm, t);
  };
  /** One frame at an exact place. */
  const put = (b: Build, x = pos.x, y = pos.y) => {
    pos = { x, y };
    feedLm(b(x, y));
  };
  /** Glide to (x, y) in small steps, then settle. */
  const glide = (b: Build, x: number, y: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x - pos.x, y - pos.y) / STEP));
    const from = { ...pos };
    for (let i = 1; i <= n; i++) put(b, from.x + ((x - from.x) * i) / n, from.y + ((y - from.y) * i) / n);
  };
  const hold = (b: Build, n: number) => {
    for (let i = 0; i < n; i++) put(b);
  };
  return { lab, feedLm, put, glide, hold, now: () => t, pos: () => pos };
}
export type Rig = ReturnType<typeof rig>;

