/**
 * Gesture rules of the world stage while an object is placed or explored (REVISI §18A/§18C). Pure: no DOM,
 * no React, no timers. The stage hook and the components call these; the meaning of a pose comes only from
 * the gesture router (`actionFor`), never from a raw finger count (the thumb is counted too).
 */
import { MODE_GAMEPLAY_EXPLORATION_CAM, MODE_GAMEPLAY_PLACEMENT, actionFor, type GestureAction, type GestureMode } from "@/src/input/gesture-mode";
import type { HandPose } from "@/src/input/hand-gesture";
import type { StageOutcome, StagePhase } from "./game-stage-types";

/** Ring hold times, in ms. A confirm is deliberate: a pose must stay for the whole hold. */
export const PLACE_HOLD_MS = 2000;
export const REDRAW_HOLD_MS = 2000;
export const GRAB_HOLD_MS = 1500;
export const ROTATE_HOLD_MS = 1500;
/** A pinch that is gone for less than this keeps the object: a flicker of the hand is not a release. */
export const GRAB_DROP_MS = 150;

/**
 * The router mode of the stage right now, or null when no hand action applies (outcome shown, or no object yet).
 * Placing uses MODE_GAMEPLAY_PLACEMENT; the played world uses MODE_GAMEPLAY_EXPLORATION_CAM.
 */
export function stageGestureMode(phase: StagePhase, outcome: StageOutcome | null): GestureMode | null {
  if (outcome) return null;
  if (phase === "placing") return MODE_GAMEPLAY_PLACEMENT;
  if (phase === "gameplay") return MODE_GAMEPLAY_EXPLORATION_CAM;
  return null;
}

/** The action a pose asks for in `mode`, or null (no mode, or the pose does nothing there). */
export function gestureFor(mode: GestureMode | null, pose: HandPose): GestureAction | null {
  return mode ? actionFor(mode, pose) : null;
}

/**
 * Grab state: `holding` while the student keeps the object in hand. `releasedAt` is the moment the pinch was
 * first lost in the current gap; null while the pinch is there.
 */
export interface GrabState {
  holding: boolean;
  releasedAt: number | null;
}

export const NOT_GRABBING: GrabState = { holding: false, releasedAt: null };

export function beginGrab(): GrabState {
  return { holding: true, releasedAt: null };
}

/**
 * One reading of the pinch while holding. `drop` is true once the pinch has been gone for GRAB_DROP_MS: the object
 * is let go at its last legal position. A shorter gap changes nothing; a returning pinch clears the gap.
 */
export function readGrab(state: GrabState, pinched: boolean, nowMs: number): { state: GrabState; drop: boolean } {
  if (!state.holding) return { state, drop: false };
  if (pinched) return { state: { holding: true, releasedAt: null }, drop: false };
  const releasedAt = state.releasedAt ?? nowMs;
  if (nowMs - releasedAt >= GRAB_DROP_MS) return { state: NOT_GRABBING, drop: true };
  return { state: { holding: true, releasedAt }, drop: false };
}
