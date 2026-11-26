import {
  R1_PINCH_COOLDOWN_MS,
  R1_PINCH_ENTER_FRAMES,
  R1_PINCH_ENTER_R,
  R1_PINCH_HOLD_R,
  R1_PINCH_RELEASE_MIN_MS,
  R1_PINCH_STRENGTH_SPAN_R,
  R1_PINCH_STRENGTH_TOP_R,
} from "../../core/constants";
import type { Pt } from "./pointer-filter";

export const PINCH_ENTER_R = R1_PINCH_ENTER_R;
export const PINCH_HOLD_R = R1_PINCH_HOLD_R;
export const PINCH_ENTER_FRAMES = R1_PINCH_ENTER_FRAMES;
export const PINCH_RELEASE_MIN_MS = R1_PINCH_RELEASE_MIN_MS;
export const PINCH_COOLDOWN_MS = R1_PINCH_COOLDOWN_MS;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Normalized landmarks, aspect = videoWidth/videoHeight. Returns r = |P4-P8| / |P0-P9| (aspect corrected). */
export function pinchRatio(lm: ReadonlyArray<Pt>, aspect: number): number | null {
  if (!Number.isFinite(aspect) || aspect <= 0) return null;
  const p0 = lm[0], p4 = lm[4], p8 = lm[8], p9 = lm[9];
  if (!p0 || !p4 || !p8 || !p9) return null;
  const d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
  const palm = d(p0, p9);
  return palm > 1e-6 ? d(p4, p8) / palm : null;
}

export function pinchStrength(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return clamp01((R1_PINCH_STRENGTH_TOP_R - r) / R1_PINCH_STRENGTH_SPAN_R);
}

/** Open hand: at least 3 of 4 fingers extended (tip farther from wrist than PIP) and not pinched. */
export function isOpenHand(lm: ReadonlyArray<Pt>, aspect: number): boolean {
  if (!Number.isFinite(aspect) || aspect <= 0) return false;
  const w = lm[0];
  if (!w) return false;
  const dist = (p: Pt): number => Math.hypot(p.x - w.x, (p.y - w.y) / aspect);
  let ext = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]] as const) {
    const a = lm[tip], b = lm[pip];
    if (a && b && dist(a) > dist(b)) ext++;
  }
  const r = pinchRatio(lm, aspect);
  return ext >= 3 && r !== null && r >= PINCH_HOLD_R;
}

export interface PinchResult {
  pinch: boolean;
  strength: number;
  event: "on" | "off" | null;
}

export interface PinchDetector {
  /** unique = frame carries a new detection (not a duplicated frame). */
  update(r: number, tMs: number, unique: boolean): PinchResult;
  /** Hand lost: drop pinch silently (caller cancels the press). */
  reset(): void;
}

export function createPinchDetector(): PinchDetector {
  let on = false;
  let count = 0;
  let relStart: number | null = null;
  let lastT: number | null = null;
  let frameDt = 0;
  let blockedUntil = -Infinity;
  return {
    update(r, t, unique) {
      if (!Number.isFinite(r) || !Number.isFinite(t)) {
        if (!on) count = 0;
        return { pinch: on, strength: 0, event: null };
      }
      if (!unique) {
        return { pinch: on, strength: pinchStrength(r), event: null };
      }
      if (lastT !== null && t > lastT) {
        frameDt = t - lastT;
      }
      if (lastT === null || t > lastT) {
        lastT = t;
      }
      let event: "on" | "off" | null = null;
      if (!on) {
        if (t >= blockedUntil && r < PINCH_ENTER_R) {
          count++;
          if (count >= PINCH_ENTER_FRAMES) {
            on = true;
            count = 0;
            relStart = null;
            event = "on";
          }
        } else {
          count = 0;
        }
      } else if (r < PINCH_HOLD_R) {
        relStart = null;
      } else {
        relStart ??= t;
        if (t - relStart >= Math.max(PINCH_RELEASE_MIN_MS, 2 * frameDt)) {
          on = false;
          relStart = null;
          blockedUntil = t + PINCH_COOLDOWN_MS;
          event = "off";
        }
      }
      return { pinch: on, strength: pinchStrength(r), event };
    },
    reset() {
      on = false;
      count = 0;
      relStart = null;
      lastT = null;
      frameDt = 0;
      blockedUntil = -Infinity;
    },
  };
}
