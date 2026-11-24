/**
 * MoNUI-7 Rescue State Machine (`bench/monui7-rescue.ts`).
 *
 * Implements Lampiran A:
 * - States: NORMAL, SEARCH, RESCUE_TRACK, POSITION_ONLY, LOST
 * - Constants (prototype parameters):
 *   RESCUE_ENTER_MISS_MS = 100
 *   YOLO_INTERVAL_MS = 100 (<= 10 Hz)
 *   YOLO_MIN_SCORE = 0.35
 *   CROP_SCALE = 1.6
 *   POSITION_ONLY_AFTER_MS = 500
 *   LOST_PROMPT_AFTER_MS = 2000
 *   RESCUE_TRACK_MAX_FAILS = 3
 */

export const RESCUE_ENTER_MISS_MS = 100;
export const YOLO_INTERVAL_MS = 200;
export const YOLO_MIN_SCORE = 0.35;
export const CROP_SCALE = 1.6;
export const POSITION_ONLY_AFTER_MS = 500;
export const LOST_PROMPT_AFTER_MS = 2000;
export const RESCUE_TRACK_MAX_FAILS = 3;

export type RescueState = "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST";

export interface RescueInput {
  t: number;
  mpHand: boolean;
  yolo?: { box: [number, number, number, number]; score: number } | null;
  crop?: Array<{ x: number; y: number; z?: number }> | null;
  hasPendingFrame?: boolean;
}

export type RescueEvent =
  | "RESCUE_START"
  | "RESCUE_SUCCESS"
  | "RESCUE_FAIL"
  | "POSITION_ONLY_ENTER"
  | "POSITION_ONLY_EXIT";

export interface RescueStepResult {
  state: RescueState;
  shouldRunYolo: boolean;
  shouldRunCrop: boolean;
  cropBox: [number, number, number, number] | null;
  positionOnly: { cx: number; cy: number; score: number } | null;
  event: RescueEvent | null;
}

/**
 * Computes square crop from box [x1, y1, x2, y2], scaled by scale (default 1.6) and clamped to [0, 1].
 */
export function computeCropSquareFromBox(
  box: [number, number, number, number],
  scale = CROP_SCALE,
): [number, number, number, number] {
  const [x1, y1, x2, y2] = box;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const w = Math.max(0.01, x2 - x1);
  const h = Math.max(0.01, y2 - y1);
  const side = Math.max(w, h) * scale;

  const cropX1 = Math.max(0, cx - side / 2);
  const cropY1 = Math.max(0, cy - side / 2);
  const cropX2 = Math.min(1, cx + side / 2);
  const cropY2 = Math.min(1, cy + side / 2);

  return [cropX1, cropY1, cropX2, cropY2];
}

/**
 * Computes square crop from 21 landmarks, scaled and clamped to [0, 1].
 */
export function computeCropSquareFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
  scale = CROP_SCALE,
): [number, number, number, number] {
  if (!landmarks || landmarks.length === 0) return [0, 0, 1, 1];
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const pt of landmarks) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return computeCropSquareFromBox([minX, minY, maxX, maxY], scale);
}

/**
 * Maps normalized landmarks inside crop [cropX1, cropY1, cropX2, cropY2]
 * back to full-frame normalized coordinates.
 */
export function unmapLandmarksFromCrop<T extends { x: number; y: number; z?: number }>(
  landmarks: T[],
  crop: [number, number, number, number],
): T[] {
  const [cropX1, cropY1, cropX2, cropY2] = crop;
  const cropW = cropX2 - cropX1;
  const cropH = cropY2 - cropY1;

  return landmarks.map((pt) => ({
    ...pt,
    x: cropX1 + pt.x * cropW,
    y: cropY1 + pt.y * cropH,
    z: pt.z !== undefined ? pt.z * Math.max(cropW, cropH) : 0,
  })) as T[];
}

export class RescueFSM {
  private stateNow: RescueState = "NORMAL";
  private handMissingSinceMs: number | null = null;
  private lastYoloTimeMs = -Infinity;
  private boxPresentSinceMs: number | null = null;
  private lastBoxSeenMs: number | null = null;
  private lastAnyActivityMs = 0;
  private consecutiveCropFails = 0;
  private lastKnownCropBox: [number, number, number, number] | null = null;
  private lastPositionOnly: { cx: number; cy: number; score: number } | null = null;

  constructor(initialState: RescueState = "NORMAL") {
    this.stateNow = initialState;
  }

  get state(): RescueState {
    return this.stateNow;
  }

  reset(nowMs = 0): void {
    this.stateNow = "NORMAL";
    this.handMissingSinceMs = null;
    this.lastYoloTimeMs = -Infinity;
    this.boxPresentSinceMs = null;
    this.lastBoxSeenMs = null;
    this.lastAnyActivityMs = nowMs;
    this.consecutiveCropFails = 0;
    this.lastKnownCropBox = null;
    this.lastPositionOnly = null;
  }

  update(input: RescueInput): RescueStepResult {
    const { t, mpHand, yolo, crop } = input;
    const prevState = this.stateNow;
    let event: RescueEvent | null = null;

    const hasBox = yolo !== null && yolo !== undefined && yolo.score >= YOLO_MIN_SCORE;
    const hasPoints = crop !== null && crop !== undefined && crop.length === 21;

    if (hasBox) {
      this.lastBoxSeenMs = t;
      if (this.boxPresentSinceMs === null) {
        this.boxPresentSinceMs = t;
      }
      const [bx1, by1, bx2, by2] = yolo.box;
      this.lastPositionOnly = {
        cx: (bx1 + bx2) / 2,
        cy: (by1 + by2) / 2,
        score: yolo.score,
      };
      this.lastKnownCropBox = computeCropSquareFromBox(yolo.box);
    } else {
      this.boxPresentSinceMs = null;
    }

    if (hasPoints) {
      this.consecutiveCropFails = 0;
      this.lastKnownCropBox = computeCropSquareFromLandmarks(crop!);
    } else if (this.stateNow === "RESCUE_TRACK") {
      this.consecutiveCropFails++;
    }

    if (mpHand || hasBox || hasPoints) {
      this.lastAnyActivityMs = t;
    }

    // State machine evaluation per Lampiran A
    switch (this.stateNow) {
      case "NORMAL": {
        if (!mpHand) {
          if (this.handMissingSinceMs === null) {
            this.handMissingSinceMs = t;
          }
          if (t - this.handMissingSinceMs >= RESCUE_ENTER_MISS_MS) {
            this.stateNow = "SEARCH";
            event = "RESCUE_START";
          }
        } else {
          this.handMissingSinceMs = null;
        }
        break;
      }

      case "SEARCH": {
        if (mpHand) {
          this.stateNow = "NORMAL";
          this.handMissingSinceMs = null;
        } else if (hasBox && hasPoints) {
          this.stateNow = "RESCUE_TRACK";
          event = "RESCUE_SUCCESS";
        } else if (
          hasBox &&
          !hasPoints &&
          this.boxPresentSinceMs !== null &&
          t - this.boxPresentSinceMs >= POSITION_ONLY_AFTER_MS
        ) {
          this.stateNow = "POSITION_ONLY";
          event = "POSITION_ONLY_ENTER";
        } else if (
          !hasBox &&
          !hasPoints &&
          t - this.lastAnyActivityMs >= LOST_PROMPT_AFTER_MS
        ) {
          this.stateNow = "LOST";
          event = "RESCUE_FAIL";
        }
        break;
      }

      case "RESCUE_TRACK": {
        if (mpHand) {
          this.stateNow = "NORMAL";
          this.handMissingSinceMs = null;
        } else if (this.consecutiveCropFails >= RESCUE_TRACK_MAX_FAILS) {
          this.stateNow = "SEARCH";
        }
        break;
      }

      case "POSITION_ONLY": {
        if (mpHand) {
          this.stateNow = "NORMAL";
          this.handMissingSinceMs = null;
          event = "POSITION_ONLY_EXIT";
        } else if (hasPoints) {
          this.stateNow = "RESCUE_TRACK";
          event = "POSITION_ONLY_EXIT";
        } else if (
          !hasBox &&
          this.lastBoxSeenMs !== null &&
          t - this.lastBoxSeenMs >= LOST_PROMPT_AFTER_MS
        ) {
          this.stateNow = "LOST";
          event = "POSITION_ONLY_EXIT";
        }
        break;
      }

      case "LOST": {
        if (mpHand) {
          this.stateNow = "NORMAL";
          this.handMissingSinceMs = null;
        } else if (hasBox && hasPoints) {
          this.stateNow = "RESCUE_TRACK";
          event = "RESCUE_SUCCESS";
        } else if (hasBox) {
          this.stateNow = "SEARCH";
        }
        break;
      }
    }

    // Determine actions for current state (R23-HF2: YOLO strictly in SEARCH window, <= 5 Hz, skip if pending frame)
    const shouldRunYolo =
      this.stateNow === "SEARCH" &&
      !input.hasPendingFrame &&
      t - this.lastYoloTimeMs >= YOLO_INTERVAL_MS;

    if (shouldRunYolo) {
      this.lastYoloTimeMs = t;
    }

    const shouldRunCrop =
      this.stateNow === "RESCUE_TRACK" ||
      (this.stateNow === "SEARCH" && hasBox) ||
      (this.stateNow === "POSITION_ONLY" && hasBox);

    const positionOnly = this.stateNow === "POSITION_ONLY" ? this.lastPositionOnly : null;

    return {
      state: this.stateNow,
      shouldRunYolo,
      shouldRunCrop,
      cropBox: this.lastKnownCropBox,
      positionOnly,
      event,
    };
  }
}
