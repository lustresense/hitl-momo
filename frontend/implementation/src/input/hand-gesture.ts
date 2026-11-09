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
 * Priority: thumb-up, fist, pinch, two-fingers, split-palm, open-palm.
 */
export type HandPose = "thumb-up" | "fist" | "pinch" | "two-fingers" | "split-palm" | "open-palm" | "none";

type FingerState = "extended" | "curled" | "between";

function fingerStates(lm: Landmark[]): FingerState[] {
  const wrist = lm[WRIST]!;
  return FINGER_TIPS.map((tipI, i) => {
    const tip = lm[tipI]!;
    const pip = lm[FINGER_PIPS[i]!]!;
    const t = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const p = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    if (t < p) return "curled";
    if (t > p * 1.15) return "extended";
    return "between";
  });
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function classifyHandPose(landmarks: Landmark[] | undefined): HandPose {
  if (!landmarks || landmarks.length < 21 || landmarks.some((p) => !p)) return "none";
  const wrist = landmarks[WRIST]!;
  const span = dist(wrist, landmarks[MIDDLE_MCP]!);
  if (span <= 1e-6) return "none";
  if (isThumbUp(landmarks)) return "thumb-up";
  const [index, middle, ring, pinky] = fingerStates(landmarks);
  if (index === "curled" && middle === "curled" && ring === "curled" && pinky === "curled") return "fist";
  if (index !== "curled" && isPinched(landmarks)) return "pinch";
  if (index === "extended" && middle === "extended" && ring === "curled" && pinky === "curled") return "two-fingers";
  if (index === "extended" && middle === "extended" && ring === "extended" && pinky === "extended") {
    const gapIM = dist(landmarks[8]!, landmarks[12]!);
    const gapMR = dist(landmarks[12]!, landmarks[16]!);
    const gapRP = dist(landmarks[16]!, landmarks[20]!);
    if (gapMR / span > 0.35 && gapMR > 1.8 * Math.max(gapIM, gapRP)) return "split-palm";
    return "open-palm";
  }
  return "none";
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

