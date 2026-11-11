/**
 * Roll of the open hand, read as a twist: turning the palm in the picture plane turns the object. Pure: no DOM,
 * no timers. The stage reads the roll through hand-roll-store.ts and decides what a step means.
 */
import type { Landmark } from "./types";

const WRIST = 0;
const MIDDLE_MCP = 9;

/** Every this many degrees of roll asks for one quarter turn. */
export const ROLL_STEP_DEG = 45;
/**
 * Extra roll before the first step fires. A wobble of a few degrees (a shaky hand) must not turn the object, so a
 * step needs STEP + HYSTERESIS from the anchor; the anchor then moves by one whole step, so the next step needs
 * one more step of roll.
 */
export const ROLL_HYSTERESIS_DEG = 5;

/** Wrist to middle knuckle, in degrees, as the student sees it on the mirrored preview. Clockwise is positive. */
export function handRollAngle(landmarks: Landmark[] | undefined): number | null {
  const wrist = landmarks?.[WRIST];
  const middle = landmarks?.[MIDDLE_MCP];
  if (!wrist || !middle) return null;
  // Upright hand (fingers up in the picture) = 0. The preview is mirrored, so the x difference flips sign.
  const dxScreen = -(middle.x - wrist.x);
  const dyScreen = middle.y - wrist.y;
  return (Math.atan2(dxScreen, -dyScreen) * 180) / Math.PI;
}

/** Brings an angle into (-180, 180]. */
export function wrapDegrees(deg: number): number {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export interface RollStepResult {
  /** +1 clockwise quarter turn, -1 counter-clockwise, 0 no turn. At most one step per reading. */
  turn: -1 | 0 | 1;
  /** The new anchor, in (-180, 180]. Unchanged when turn is 0. */
  anchor: number;
}

/**
 * One reading of the roll against the anchor. A step needs STEP + HYSTERESIS of roll from the anchor; then the anchor
 * moves by exactly one STEP in that direction, so the rest of the roll is kept and counted on the next readings.
 */
export function rollSteps(
  anchor: number,
  current: number,
  stepDeg: number = ROLL_STEP_DEG,
  hysteresisDeg: number = ROLL_HYSTERESIS_DEG,
): RollStepResult {
  const delta = wrapDegrees(current - anchor);
  if (Math.abs(delta) < stepDeg + hysteresisDeg) return { turn: 0, anchor };
  const turn: -1 | 1 = delta > 0 ? 1 : -1;
  return { turn, anchor: wrapDegrees(anchor + turn * stepDeg) };
}
