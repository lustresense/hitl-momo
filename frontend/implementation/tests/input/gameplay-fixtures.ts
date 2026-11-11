import type { Landmark } from "@/src/input/types";

/**
 * Synthetic 21-point hand whose index finger points at `thetaDeg` on the STUDENT's screen
 * (0 = right, 90 = straight up, 180 = left, negative = down). The camera image is mirrored, so
 * the raw camera x of the tip is 1 minus the mirrored x. Hand span (wrist to middle MCP) is 0.2,
 * so the thumb sits `pinchGap * 0.2` beside the tip: pinch when pinchGap < 0.42.
 */
export function pointingHand(thetaDeg: number, opts: { pinchGap?: number; length?: number } = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  const rad = (thetaDeg * Math.PI) / 180;
  const len = opts.length ?? 0.2;
  lm[0] = { x: 0.5, y: 0.9 };
  lm[9] = { x: 0.5, y: 0.7 };
  // index knuckle (pangkal) at the centre of the frame
  lm[5] = { x: 0.5, y: 0.6 };
  const mirroredX = 0.5 + Math.cos(rad) * len;
  const y = 0.6 - Math.sin(rad) * len;
  lm[8] = { x: 1 - mirroredX, y };
  const gap = opts.pinchGap ?? 1;
  lm[4] = { x: lm[8].x - gap * 0.2, y };
  return lm;
}
