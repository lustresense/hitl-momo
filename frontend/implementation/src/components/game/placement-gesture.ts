/**
 * Gesture rules of the world stage while an object is placed or explored (REVISI §18A/§18C). Pure: no DOM,
 * no React, no timers. The stage hook and the components call these; the meaning of a pose comes only from
 * the gesture router (`actionFor`), never from a raw finger count (the thumb is counted too).
 */
import { MODE_GAMEPLAY_EXPLORATION_CAM, MODE_GAMEPLAY_PLACEMENT, actionFor, type GestureAction, type GestureMode } from "@/src/input/gesture-mode";
import type { HandPose } from "@/src/input/hand-gesture";
import { rollSteps } from "@/src/input/hand-rotation";
import type { StageOutcome, StagePhase } from "./game-stage-types";

/** Ring hold times, in ms. A confirm is deliberate: a pose must stay for the whole hold. */
export const PLACE_HOLD_MS = 2000;
export const REDRAW_HOLD_MS = 2000;
export const GRAB_HOLD_MS = 1500;
export const ROTATE_HOLD_MS = 1500;
/** Turn mode ends when the palm is gone (closed, or the hand out of view) for this long. */
export const TURN_LOST_MS = 400;
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

/** The palm that starts and keeps a turn: open or split (the router maps both to "rotate"). */
export function isPalmPose(pose: HandPose): boolean {
  return pose === "open-palm" || pose === "split-palm";
}

/**
 * Turn mode: the object turns with the roll of the palm. `anchor` is the roll the next step is measured from;
 * `lostSince` is when the palm was first gone in the current gap (null while the palm is there).
 */
export interface TurnState {
  anchor: number | null;
  lostSince: number | null;
}

export interface TurnReading {
  palm: boolean;
  thumbUp: boolean;
  /** The palm's roll in degrees (see handRollAngle), or null while no hand is read. */
  roll: number | null;
}

export function beginTurn(roll: number | null): TurnState {
  return { anchor: roll, lostSince: null };
}

/**
 * One reading in turn mode. `turn` is +1 or -1 for a quarter turn to do now (at most one per reading), 0 otherwise.
 * `done` is true when the thumb says "finished", or when the palm has been gone for TURN_LOST_MS.
 */
export function readTurn(state: TurnState, reading: TurnReading, nowMs: number): { state: TurnState; turn: -1 | 0 | 1; done: boolean } {
  if (reading.thumbUp) return { state, turn: 0, done: true };
  if (!reading.palm) {
    const lostSince = state.lostSince ?? nowMs;
    return { state: { anchor: state.anchor, lostSince }, turn: 0, done: nowMs - lostSince >= TURN_LOST_MS };
  }
  const cleared: TurnState = { anchor: state.anchor, lostSince: null };
  if (reading.roll === null) return { state: cleared, turn: 0, done: false };
  if (cleared.anchor === null) return { state: { anchor: reading.roll, lostSince: null }, turn: 0, done: false };
  const step = rollSteps(cleared.anchor, reading.roll);
  return { state: { anchor: step.anchor, lostSince: null }, turn: step.turn, done: false };
}
