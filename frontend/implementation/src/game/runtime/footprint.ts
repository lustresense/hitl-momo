/**
 * The box of a student's object, taken from the drawing itself (pure: no DOM, no KAPLAY).
 *
 * Before: every object was the same 130 x 20 plank and the drawing was squeezed into it, so a heart showed as a
 * 30 px speck on a 209 px wide invisible slab. Now the drawing keeps its proportions and is scaled up until it fills
 * the largest box of the level; the collider is that box, hugging the ink up to the stroke margin.
 *
 *   wide drawing  -> full width, as tall as its proportions give;
 *   tall drawing  -> full height, as narrow as its proportions give;
 *   line or dot   -> a thin plank / post / small block at the level's minimum size.
 */
import type { DrawingInput } from "../../domain/types";
import { INK_MIN_SPAN, inkInset, inkSpans } from "../sketch-renderer";

export interface FootprintLimits {
  maxW: number;
  maxH: number;
  minW: number;
  minH: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The ink margin of a box this size (it depends on the height, so solve it in two passes). */
function margin(w: number, h: number): number {
  let m = inkInset(w, h);
  m = inkInset(w, Math.max(h, 2 * m));
  return m;
}

export function inkFootprint(
  input: DrawingInput | null | undefined,
  limits: FootprintLimits,
  fallback: { w: number; h: number },
): { w: number; h: number } {
  const spans = inkSpans(input?.strokes);
  if (!spans) return { w: fallback.w, h: fallback.h };

  const hasX = spans.spanX > INK_MIN_SPAN;
  const hasY = spans.spanY > INK_MIN_SPAN;
  const aspect = hasX && hasY ? spans.spanX / spans.spanY : 0;

  // The margin depends on the box (a thin plank has a thinner stroke), so settle box and margin together.
  let w = limits.maxW;
  let h = limits.maxH;
  for (let pass = 0; pass < 4; pass++) {
    const m = margin(w, h);
    const availW = Math.max(0, limits.maxW - 2 * m);
    const availH = Math.max(0, limits.maxH - 2 * m);
    let innerW = 0;
    let innerH = 0;
    if (hasX && hasY) {
      innerH = Math.min(availH, availW / aspect);
      innerW = innerH * aspect;
    } else if (hasX) {
      innerW = availW; // a flat line: as wide as it may be
    } else if (hasY) {
      innerH = availH; // a vertical line: as tall as it may be
    }
    w = clamp(innerW + 2 * m, limits.minW, limits.maxW);
    h = clamp(innerH + 2 * m, limits.minH, limits.maxH);
  }
  // Rounding must not push a box past its limit.
  return { w: Math.min(round1(w), limits.maxW), h: Math.min(round1(h), limits.maxH) };
}

/** Share of each side a danger object's touch zone gives back: the corners of a spike's box are empty air. */
export const HAZARD_FORGIVENESS = 0.12;

/**
 * Where a "danger" object hurts, inside its box (local coordinates). It is a little smaller than the box so a
 * touch on empty corner air never counts; the box stays the placement rule, the zone is only the hurt area.
 */
export function hazardZone(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const dx = Math.min(w / 4, w * HAZARD_FORGIVENESS);
  const dy = Math.min(h / 4, h * HAZARD_FORGIVENESS);
  return { x: dx, y: dy, w: w - 2 * dx, h: h - 2 * dy };
}
