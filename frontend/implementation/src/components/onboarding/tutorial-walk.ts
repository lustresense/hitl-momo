/**
 * Thinman's walk on card 1 (R4). Pure math; the component owns the state.
 *
 * Camera: a pinch anchors the hand and Thinman follows the hand's movement, so the walk stops when the pinch is let go.
 * Mouse and touch: Thinman follows the pointer while it is pressed. Keyboard: arrow keys step him.
 */

/** Thinman's walk ends at the flag (percent of the scene width). He stops there and cannot be moved on. */
export const WALK_END = 76;
/** Left edge he can start from and drag back to (percent). */
export const WALK_START = 10;
/** Percent of the scene per unit of hand travel (cursor x runs 0..1 across the camera frame). Assumed, not camera-tested. */
export const HAND_GAIN = 120;
/** Percent per arrow-key press. */
export const KEY_STEP = 3;
/** Percent of the scene Thinman covers in one full walk cycle (two steps). */
export const TUTORIAL_STRIDE_PCT = 9;

/** Walk-cycle phase after moving `dxPct` percent: the step rate follows the drag speed. */
export function advanceWalkPhase(phase: number, dxPct: number): number {
  return (((phase + Math.abs(dxPct) / TUTORIAL_STRIDE_PCT) % 1) + 1) % 1;
}

export function clampWalk(pos: number): number {
  return Math.min(WALK_END, Math.max(WALK_START, pos));
}

/** New position for a pinch-drag: the anchor position plus the hand's travel since the pinch began. */
export function handWalkTarget(anchorPos: number, anchorCursorX: number, cursorX: number): number {
  return clampWalk(anchorPos + (cursorX - anchorCursorX) * HAND_GAIN);
}
