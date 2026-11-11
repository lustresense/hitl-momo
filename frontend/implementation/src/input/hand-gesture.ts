import type { Landmark } from "./types";

/**
 * TASK 05 — Provisional hand-gesture mapping (pure, fully unit-tested).
 *
 * PROVISIONAL GESTURE (not product-final):
 * - index fingertip (landmark 8) drives the cursor;
 * - thumb-index pinch distance toggles ink on/off.
 *
 * MediaPipe landmarks are normalized [0..1] with x measured in the camera's
 * own frame. The preview is mirrored, so we mirror x (1-x) to match what the
 * user sees before mapping onto the drawing canvas.
 */

export const INDEX_TIP = 8;
export const THUMB_TIP = 4;
export const WRIST = 0;
export const MIDDLE_MCP = 9;

export type CursorState = "hover" | "near" | "drawing";

/** Mirrored + clamped normalized position of the index fingertip. */
export function indexTipNormalized(landmarks: Landmark[]): { x: number; y: number } {
  const tip = landmarks[INDEX_TIP] ?? landmarks[0];
  if (!tip) return { x: 0.5, y: 0.5 };
  return { x: clamp01(1 - tip.x), y: clamp01(tip.y) };
}

/** Map a normalized (already mirrored) point onto canvas pixel space with clamping. */
export function mapToCanvas(
  p: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: clamp(Math.round(p.x * width), 0, width),
    y: clamp(Math.round(p.y * height), 0, height),
  };
}

/**
 * Pinch detection normalized by hand size so distance-to-camera matters less.
 * Ratio threshold is DEV-tunable/provisional.
 */
export function isPinched(landmarks: Landmark[], threshold = 0.42): boolean {
  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  const wrist = landmarks[WRIST];
  const middleMcp = landmarks[MIDDLE_MCP];
  if (!thumb || !index || !wrist || !middleMcp) return false;
  const span = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  if (span <= 1e-6) return false;
  const pinch = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  return pinch / span < threshold;
}

/**
 * Gesture state machine for one processed frame.
 * Handles tracking loss without jump lines: when the hand disappears the
 * caller must end the current stroke; on reacquisition a new stroke begins
 * only after the pinch gesture is asserted again.
 */
export type GestureFrame =
  | {
      state: "tracking";
      cursor: { x: number; y: number };
      pinched: boolean;
      cursorState: CursorState;
      pinchRatio: number;
    }
  | { state: "lost" };

export function evaluateGesture(
  landmarks: Landmark[] | undefined,
): GestureFrame {
  if (!landmarks || landmarks.length < MIDDLE_MCP + 1) {
    return { state: "lost" };
  }
  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  const wrist = landmarks[WRIST];
  const middleMcp = landmarks[MIDDLE_MCP];
  if (!thumb || !index || !wrist || !middleMcp) {
    return { state: "lost" };
  }
  const span = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  const pinch = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  const pinchRatio = span <= 1e-6 ? 1 : pinch / span;
  const pinched = pinchRatio < 0.42;
  const cursorState: CursorState = pinched ? "drawing" : pinchRatio < 0.55 ? "near" : "hover";

  return {
    state: "tracking",
    cursor: indexTipNormalized(landmarks),
    pinched,
    cursorState,
    pinchRatio,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/**
 * PRD 0.0.16 R4 — thumbs-up detection on the existing 21-point HandLandmarker skeleton.
 * Rule: thumb tip clearly above the thumb base (MCP, smaller y), the four other fingers curled
 * (tip closer to the wrist than their PIP joint), and the thumb is the highest point of the hand
 * so a raised open palm does not count. Thresholds are scaled by hand size (wrist to middle MCP).
 */
export const THUMB_MCP = 2;
const FINGER_TIPS = [8, 12, 16, 20] as const;
const FINGER_PIPS = [6, 10, 14, 18] as const;

export function isThumbUp(landmarks: Landmark[] | undefined, minLift = 0.45): boolean {
  if (!landmarks || landmarks.length < 21) return false;
  const wrist = landmarks[WRIST];
  const middleMcp = landmarks[MIDDLE_MCP];
  const thumbTip = landmarks[THUMB_TIP];
  const thumbMcp = landmarks[THUMB_MCP];
  if (!wrist || !middleMcp || !thumbTip || !thumbMcp) return false;
  const span = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  if (span <= 1e-6) return false;
  // Thumb points up: tip well above its base.
  if ((thumbMcp.y - thumbTip.y) / span < minLift) return false;
  for (let i = 0; i < FINGER_TIPS.length; i++) {
    const tip = landmarks[FINGER_TIPS[i]!];
    const pip = landmarks[FINGER_PIPS[i]!];
    if (!tip || !pip) return false;
    const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const pipToWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    if (tipToWrist >= pipToWrist) return false; // finger extended
    if (tip.y < thumbTip.y) return false; // something above the thumb
  }
  return true;
}

/**
 * PRD 0.0.16 R12 — drawing-gesture poses (provisional mapping, Owner to confirm):
 * pinch = Coret (draw), kepal = Hapus (erase), dua jari = Mundur (undo), telapak terbelah = Maju (redo).
 * `classifyHandPose` returns exactly one pose per frame so the poses are mutually exclusive with
 * each other, with the thumbs-up confirmation and with the open palm used for the wave.
 * Priority: thumb-up, pinch, fist, two-fingers, split-palm, open-palm.
 */
export type HandPose =
  | "thumb-up"
  | "fist"
  | "pinch"
  | "one-finger"
  | "two-fingers"
  | "three-fingers"
  | "split-palm"
  | "open-palm"
  | "none";

/**
 * Thumb rule for counting fingers (honest ratio, not a learned model): the thumb is extended when its tip is
 * farther from the index knuckle (MCP) than its IP joint is, by this factor. A thumb tucked across the palm stays
 * near the knuckle and is not counted.
 */
export const THUMB_EXTENDED_RATIO = 1.3;

/**
 * Extended fingers in one hand, 0..5 (thumb included by the rule above). A finger is extended when its tip is
 * beyond the same 1.1x PIP distance the pose classifier uses, so the count and the poses agree.
 * Pure: no landmarks or a short list gives 0.
 */
export function countExtendedFingers(landmarks: Landmark[] | undefined): number {
  if (!landmarks || landmarks.length < 21 || landmarks.some((p) => !p)) return 0;
  const count = fingerStates(landmarks).filter((s) => s === "extended").length;
  return count + (thumbExtended(landmarks) ? 1 : 0);
}

/** Thumb extended by the ratio rule (see THUMB_EXTENDED_RATIO). Landmarks 2 (MCP), 3 (IP), 4 (tip), 5 (index MCP). */
function thumbExtended(lm: Landmark[]): boolean {
  const tip = lm[THUMB_TIP]!;
  const ip = lm[3]!;
  const indexMcp = lm[5]!;
  const tipGap = dist(tip, indexMcp);
  const ipGap = dist(ip, indexMcp);
  return tipGap > ipGap * THUMB_EXTENDED_RATIO;
}

/** Pinch enters below PINCH_ENTER and, once held, stays until PINCH_EXIT (thumb-index gap / hand span). */
export const PINCH_ENTER = 0.42;
export const PINCH_EXIT = 0.55;
/**
 * A folded index only counts as pinched when the thumb nearly touches its tip; this keeps a real fist from drawing.
 * Once held, the same pinch keeps its ink up to TOUCH_FOLDED_INDEX_EXIT (same ~1.3x ratio as PINCH_ENTER/EXIT);
 * otherwise a loose thumb drops the ink and the still-folded hand reads as a fist, which erases.
 */
export const TOUCH_FOLDED_INDEX = 0.15;
export const TOUCH_FOLDED_INDEX_EXIT = 0.2;
/** A thumb raised this far (hand spans) is not a fist: a raised thumb must never erase. */
const FIST_MAX_THUMB_LIFT = 0.3;
/** Tip beyond this many PIP distances from the wrist = straight. Was 1.15; loosened for children's hands. */
const EXTENDED_RATIO = 1.1;
/** Split palm: the middle-ring gap must clearly beat the other gaps, so an evenly spread open palm stays open. */
const SPLIT_GAP_RATIO = 1.8;
/** Split palm: middle-ring gap as a share of the hand span. Was 0.35; loosened for small hands. */
const SPLIT_MIN_SPREAD = 0.25;

type FingerState = "extended" | "curled" | "between";

function fingerStates(lm: Landmark[]): FingerState[] {
  const wrist = lm[WRIST]!;
  return FINGER_TIPS.map((tipI, i) => {
    const tip = lm[tipI]!;
    const pip = lm[FINGER_PIPS[i]!]!;
    const t = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const p = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    if (t < p) return "curled";
    if (t > p * EXTENDED_RATIO) return "extended";
    return "between";
  });
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * `opts.pinchHeld`: the previous frame was a pinch, so the looser exit ratio applies (hysteresis).
 */
export function classifyHandPose(landmarks: Landmark[] | undefined, opts: { pinchHeld?: boolean } = {}): HandPose {
  if (!landmarks || landmarks.length < 21 || landmarks.some((p) => !p)) return "none";
  const wrist = landmarks[WRIST]!;
  const span = dist(wrist, landmarks[MIDDLE_MCP]!);
  if (span <= 1e-6) return "none";
  if (isThumbUp(landmarks)) return "thumb-up";

  // Pinch is read before fist: a thumb on the index tip is ink whatever the other fingers do.
  const touch = dist(landmarks[THUMB_TIP]!, landmarks[INDEX_TIP]!) / span;
  const [index, middle, ring, pinky] = fingerStates(landmarks);
  const pinched =
    index === "curled"
      ? touch < (opts.pinchHeld ? TOUCH_FOLDED_INDEX_EXIT : TOUCH_FOLDED_INDEX)
      : touch < (opts.pinchHeld ? PINCH_EXIT : PINCH_ENTER);
  if (pinched) return "pinch";

  // Fist (Hapus): every finger folded and the thumb not raised.
  if (
    index === "curled" && middle === "curled" && ring === "curled" && pinky === "curled" &&
    thumbLift(landmarks, span) < FIST_MAX_THUMB_LIFT
  ) {
    return "fist";
  }

  // Two fingers (Mundur): index and middle not folded (one of them straight); ring and pinky not straight.
  if (
    index !== "curled" && middle !== "curled" && (index === "extended" || middle === "extended") &&
    ring !== "extended" && pinky !== "extended"
  ) {
    return "two-fingers";
  }

  // One finger (Satu jari): only the index straight, the thumb not raised. Excludes two-fingers by middle !== curled.
  if (index === "extended" && middle === "curled" && ring === "curled" && pinky === "curled" && !thumbExtended(landmarks)) {
    return "one-finger";
  }

  // Three fingers (Tiga jari): index, middle and ring straight, pinky folded, thumb not raised.
  // Excludes two-fingers (ring extended) and the palms (pinky folded).
  if (
    index === "extended" && middle === "extended" && ring === "extended" && pinky === "curled" &&
    !thumbExtended(landmarks)
  ) {
    return "three-fingers";
  }

  // Split palm (Maju) and open palm: no finger folded. Split = a clearly wider middle-ring gap.
  if (index !== "curled" && middle !== "curled" && ring !== "curled" && pinky !== "curled") {
    const gapIM = dist(landmarks[8]!, landmarks[12]!);
    const gapMR = dist(landmarks[12]!, landmarks[16]!);
    const gapRP = dist(landmarks[16]!, landmarks[20]!);
    if (gapMR / span > SPLIT_MIN_SPREAD && gapMR > SPLIT_GAP_RATIO * Math.max(gapIM, gapRP)) return "split-palm";
    if (index === "extended" && middle === "extended" && ring === "extended" && pinky === "extended") return "open-palm";
  }
  return "none";
}

/** Thumb tip height above its base, in hand spans (positive = raised). */
function thumbLift(lm: Landmark[], span: number): number {
  return (lm[THUMB_MCP]!.y - lm[THUMB_TIP]!.y) / span;
}

/**
 * Centre of the four knuckles (MCP 5, 9, 13, 17), mirrored and clamped like the cursor.
 * The fist eraser works here: the folded fingertips sit in the palm and would erase the wrong spot.
 */
export function palmCenterNormalized(landmarks: Landmark[]): { x: number; y: number } {
  const knuckles = [5, 9, 13, 17].map((i) => landmarks[i]!);
  const x = knuckles.reduce((sum, p) => sum + p.x, 0) / knuckles.length;
  const y = knuckles.reduce((sum, p) => sum + p.y, 0) / knuckles.length;
  return { x: clamp01(1 - x), y: clamp01(y) };
}

/** Kepal = Hapus (erase). */
export const isFist = (lm: Landmark[] | undefined): boolean => classifyHandPose(lm) === "fist";
/** Dua jari = Mundur (undo). */
export const isTwoFingers = (lm: Landmark[] | undefined): boolean => classifyHandPose(lm) === "two-fingers";
/** Telapak terbelah = Maju (redo). */
export const isSplitPalm = (lm: Landmark[] | undefined): boolean => classifyHandPose(lm) === "split-palm";

/** Drawing command for a pose under the R12 mapping; null = no command. */
export type DrawingGestureCommand = "draw" | "erase" | "undo" | "redo";
export function drawingCommandFor(pose: HandPose): DrawingGestureCommand | null {
  switch (pose) {
    case "pinch": return "draw";
    case "fist": return "erase";
    case "two-fingers": return "undo";
    case "split-palm": return "redo";
    default: return null;
  }
}


/**
 * Stable value over the last `window` frames: a new value takes over only after `minVotes` of those frames agree.
 * One noisy frame (blur, a flicker) cannot change a pose or a finger count; a missing hand is pushed as its own value.
 */
export class StableVote<T> {
  private readonly votes: T[] = [];
  private current: T;

  constructor(
    private readonly initial: T,
    private readonly window = 5,
    private readonly minVotes = 3,
  ) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  push(next: T): T {
    this.votes.push(next);
    if (this.votes.length > this.window) this.votes.shift();
    const counts = new Map<T, number>();
    for (const v of this.votes) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = this.current;
    let bestCount = 0;
    for (const [v, n] of counts) {
      if (n > bestCount) {
        best = v;
        bestCount = n;
      }
    }
    if (bestCount >= this.minVotes) this.current = best;
    return this.current;
  }

  reset(): void {
    this.votes.length = 0;
    this.current = this.initial;
  }
}
