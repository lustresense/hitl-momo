"use strict";

/**
 * Gameplay gesture mapping (pure, fully unit-tested). Steering is the direction of the INDEX
 * FINGER, drawn from its knuckle (landmark 5) to its tip (landmark 8), mirrored once so it matches
 * the mirrored preview the student sees (0 deg = right, 90 deg = straight up, 180 deg = left):
 * - about 90 deg (75 to 105): jump on the spot;
 * - 45 to 75 deg: jump and walk right; 105 to 135 deg: jump and walk left;
 * - nearly horizontal (|angle| < 30, or > 150): walk right / left;
 * - anything else (pointing down, or 30 to 45 and 135 to 150): stop.
 * The thumb pinch is not a jump any more: it grabs the object while placing (InputArbiter).
 *
 * The angle bands are a first guess, not a tested calibration. They are exported so they can be
 * tuned in one place. Zones use hysteresis so a finger resting on a boundary does not chatter.
 *
 * MediaPipe landmarks are normalized [0..1] with x measured in the camera's own frame.
 */

import { isPinched, indexTipNormalized, evaluateGesture } from "./hand-gesture";
import { PointSmoother } from "./smoothing";
import type { Landmark } from "./types";

/** Index knuckle (base of the pointing finger) and fingertip in MediaPipe's 21-point hand. */
const INDEX_KNUCKLE = 5;
const INDEX_TIP = 8;
/** Shorter than this (normalized units) the finger has no direction: a flat or hidden finger. */
const MIN_POINT_LENGTH = 0.01;

/** Walk band: |angle| below this walks right, |angle| above 180 minus this walks left. */
export const STEER_WALK_DEG = 30;
/** Straight-up jump band (inclusive). */
export const STEER_JUMP_STRAIGHT_MIN_DEG = 75;
export const STEER_JUMP_STRAIGHT_MAX_DEG = 105;
/** Diagonal jump bands: 45 up to (not incl.) 75 is jump-right; above 105 up to 135 is jump-left. */
export const STEER_JUMP_DIAGONAL_MIN_DEG = 45;
export const STEER_JUMP_DIAGONAL_MAX_DEG = 135;
/** A zone is kept until the angle leaves it by this many degrees (hysteresis). */
export const STEER_HYSTERESIS_DEG = 5;

export const GAMEPLAY_PINCH_THRESHOLD = 0.42;

export type SteerZone = "walk-right" | "walk-left" | "jump" | "jump-right" | "jump-left" | "stop";

export interface DirectionInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export type GameplayGestureFrame =
  | {
      tracked: true;
      cursor: { x: number; y: number } | null;
      pinched: boolean;
      /** Index finger direction in degrees (0 = right, 90 = up), or null when it has none. */
      angle: number | null;
      input: DirectionInput;
    }
  | { tracked: false; cursor: null; pinched: false; angle: null; input: { left: false; right: false; jump: false } };

const NO_INPUT: DirectionInput = { left: false, right: false, jump: false };

/**
 * Direction of the index finger, knuckle to tip, in degrees with 0 = the student's right and
 * 90 = straight up. The camera image is mirrored, so x is flipped once here. Returns null when a
 * point is missing or NaN, or the finger is too short to have a direction.
 */
export function indexPointAngle(landmarks: Landmark[]): number | null {
  const base = landmarks[INDEX_KNUCKLE];
  const tip = landmarks[INDEX_TIP];
  if (!base || !tip) return null;
  if ([base.x, base.y, tip.x, tip.y].some((v) => Number.isNaN(v))) return null;
  // Mirrored x: base.x - tip.x. Image y grows downwards, so "up" is base.y - tip.y.
  const dx = base.x - tip.x;
  const dy = base.y - tip.y;
  if (Math.hypot(dx, dy) < MIN_POINT_LENGTH) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function zoneOf(theta: number): SteerZone {
  const a = Math.abs(theta);
  if (a < STEER_WALK_DEG) return "walk-right";
  if (a > 180 - STEER_WALK_DEG) return "walk-left";
  if (theta >= STEER_JUMP_STRAIGHT_MIN_DEG && theta <= STEER_JUMP_STRAIGHT_MAX_DEG) return "jump";
  if (theta >= STEER_JUMP_DIAGONAL_MIN_DEG && theta < STEER_JUMP_STRAIGHT_MIN_DEG) return "jump-right";
  if (theta > STEER_JUMP_STRAIGHT_MAX_DEG && theta <= STEER_JUMP_DIAGONAL_MAX_DEG) return "jump-left";
  return "stop";
}

/** Whether `theta` is still inside `zone` when its band is widened by `h` degrees. */
function inZone(zone: Exclude<SteerZone, "stop">, theta: number, h: number): boolean {
  const a = Math.abs(theta);
  switch (zone) {
    case "walk-right":
      return a < STEER_WALK_DEG + h;
    case "walk-left":
      return a > 180 - STEER_WALK_DEG - h;
    case "jump":
      return theta >= STEER_JUMP_STRAIGHT_MIN_DEG - h && theta <= STEER_JUMP_STRAIGHT_MAX_DEG + h;
    case "jump-right":
      return theta >= STEER_JUMP_DIAGONAL_MIN_DEG - h && theta < STEER_JUMP_STRAIGHT_MIN_DEG + h;
    case "jump-left":
      return theta > STEER_JUMP_STRAIGHT_MAX_DEG - h && theta <= STEER_JUMP_DIAGONAL_MAX_DEG + h;
  }
}

/**
 * Zone for a finger angle. Pass the previous zone to get hysteresis: while the angle is still
 * inside the previous zone's band widened by STEER_HYSTERESIS_DEG, that zone is kept. "stop" is
 * never kept, so releasing a walk stops at once.
 */
export function steerFromAngle(theta: number, prev: SteerZone | null = null): SteerZone {
  if (prev && prev !== "stop" && inZone(prev, theta, STEER_HYSTERESIS_DEG)) return prev;
  return zoneOf(theta);
}

/** Left / right / jump input of a zone. */
export function steerInput(zone: SteerZone): DirectionInput {
  switch (zone) {
    case "walk-right":
      return { left: false, right: true, jump: false };
    case "walk-left":
      return { left: true, right: false, jump: false };
    case "jump":
      return { left: false, right: false, jump: true };
    case "jump-right":
      return { left: false, right: true, jump: true };
    case "jump-left":
      return { left: true, right: false, jump: true };
    case "stop":
      return { ...NO_INPUT };
  }
}

/** Pinch ratio of the hand (thumb-index gap over wrist-middle span), or 1 when untracked. */
function pinchRatioOf(landmarks: Landmark[]): number {
  const f = evaluateGesture(landmarks);
  return f.state === "tracking" ? f.pinchRatio : 1;
}

/**
 * Evaluate gameplay gesture from MediaPipe landmarks, without state (no hysteresis, no reacquire
 * pause). Returns the mirrored index tip, the pinch state, the finger angle and the input.
 *
 * @param landmarks - MediaPipe hand landmarks (21 points), undefined if no hand detected
 */
export function evaluateGameplayGesture(landmarks: Landmark[] | undefined): GameplayGestureFrame {
  if (!landmarks || landmarks.length < 10) {
    return { tracked: false, cursor: null, pinched: false, angle: null, input: { left: false, right: false, jump: false } };
  }

  // Check for NaN or invalid numbers in the landmarks the gesture reads (0..9 covers 5 and 8).
  for (let i = 0; i < 10; i++) {
    const lm = landmarks[i];
    if (!lm || Number.isNaN(lm.x) || Number.isNaN(lm.y)) {
      return { tracked: false, cursor: null, pinched: false, angle: null, input: { left: false, right: false, jump: false } };
    }
  }

  const tip = indexTipNormalized(landmarks);
  if (Number.isNaN(tip.x) || Number.isNaN(tip.y)) {
    return { tracked: false, cursor: null, pinched: false, angle: null, input: { left: false, right: false, jump: false } };
  }

  const pinched = isPinched(landmarks, GAMEPLAY_PINCH_THRESHOLD);
  const angle = indexPointAngle(landmarks);
  const input = steerInput(angle === null ? "stop" : steerFromAngle(angle));

  return { tracked: true, cursor: { x: tip.x, y: tip.y }, pinched, angle, input: { ...input } };
}

/* ------------------------------------------------------------------ */
/* Stateful filter: hysteresis + debounce on top of the stateless map. */
/* ------------------------------------------------------------------ */

/** Pinch engages below GAMEPLAY_PINCH_THRESHOLD and releases above this ratio. */
export const GAMEPLAY_PINCH_RELEASE = 0.5;
/** Consecutive tracked frames needed before ANY input is asserted after (re)acquiring the hand. */
export const GAMEPLAY_REACQUIRE_FRAMES = 3;
/** Consecutive pinched frames needed to engage a pinch (rejects 1-frame flicker). */
export const GAMEPLAY_PINCH_CONFIRM_FRAMES = 2;

export interface GameplayGestureFilterOptions {
  /**
   * Legacy opt-in: treat a held pinch as "jump" too. The app does not set it: the jump is the
   * finger angle, and the pinch grabs the object while placing.
   */
  enableJump?: boolean;
}

/**
 * Per-frame filter used by GameplayHandDriver:
 * - tracking loss is IMMEDIATE neutral (never keep walking on a stale hand);
 * - after (re)acquisition, input stays neutral for GAMEPLAY_REACQUIRE_FRAMES frames;
 * - the steering zone uses hysteresis (STEER_HYSTERESIS_DEG) so a finger on a boundary does not chatter;
 * - pinch has hysteresis (engage <0.42, release >0.50) + a 2-frame confirm;
 * - the reported cursor is 1-euro smoothed (placement drag); the zone uses the raw angle.
 */
export class GameplayGestureFilter {
  private stableFrames = 0;
  private zone: SteerZone | null = null;
  private pinched = false;
  private pinchFrames = 0;
  private readonly smoother = new PointSmoother();

  constructor(private readonly options: GameplayGestureFilterOptions = {}) {}

  reset(): void {
    this.stableFrames = 0;
    this.zone = null;
    this.pinched = false;
    this.pinchFrames = 0;
    this.smoother.reset();
  }

  update(landmarks: Landmark[] | undefined, timestampMs?: number): GameplayGestureFrame {
    const raw = evaluateGameplayGesture(landmarks);
    if (!raw.tracked || !raw.cursor) {
      this.reset();
      return { tracked: false, cursor: null, pinched: false, angle: null, input: { left: false, right: false, jump: false } };
    }
    const cursor = this.smoother.smooth(raw.cursor, timestampMs);
    this.stableFrames++;
    if (this.stableFrames < GAMEPLAY_REACQUIRE_FRAMES) {
      return { tracked: true, cursor, pinched: false, angle: raw.angle, input: { ...NO_INPUT } };
    }

    // pinch with hysteresis + confirm
    const ratio = pinchRatioOf(landmarks!);
    if (this.pinched) {
      if (ratio > GAMEPLAY_PINCH_RELEASE) {
        this.pinched = false;
        this.pinchFrames = 0;
      }
    } else if (ratio < GAMEPLAY_PINCH_THRESHOLD) {
      this.pinchFrames++;
      if (this.pinchFrames >= GAMEPLAY_PINCH_CONFIRM_FRAMES) this.pinched = true;
    } else {
      this.pinchFrames = 0;
    }

    // steering zone with hysteresis; no direction (angle null) means stop
    this.zone = raw.angle === null ? "stop" : steerFromAngle(raw.angle, this.zone);
    const steer = steerInput(this.zone);

    return {
      tracked: true,
      cursor,
      pinched: this.pinched,
      angle: raw.angle,
      input: {
        left: steer.left,
        right: steer.right,
        jump: steer.jump || (Boolean(this.options.enableJump) && this.pinched),
      },
    };
  }
}
