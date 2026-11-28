/** One footstep sound per this much ground travelled by the tutorial walker, in CSS px (about one stride). */
export const STEP_STRIDE_PX = 28;

export interface FootstepAccumulator {
  /** Distance travelled since the last step sound, in px (always below the stride). */
  readonly acc: number;
  /** True when this movement crossed a stride boundary, so exactly one step sound is due. */
  readonly step: boolean;
}

/**
 * Pure stride counter for the footsteps of the card-1 walker. `travelPx` is the real ground distance of one move
 * (airborne moves and zero moves are not passed in). A big jump in position yields at most one step, never a burst.
 */
export function advanceFootsteps(accPx: number, travelPx: number, stridePx: number = STEP_STRIDE_PX): FootstepAccumulator {
  const travelled = Number.isFinite(travelPx) ? Math.abs(travelPx) : 0;
  const total = (Number.isFinite(accPx) && accPx > 0 ? accPx : 0) + travelled;
  if (!(stridePx > 0) || total < stridePx) return { acc: total, step: false };
  return { acc: total % stridePx, step: true };
}
