/**
 * Hand-tracking settings shared by every landmarker builder (hand-landmarker.ts, landmarker-warmup.ts).
 * Kept apart from hand-landmarker.ts so a test that mocks that module does not lose these values.
 */

/**
 * Every landmarker asks for two hands: the player's hand is then picked by primary-hand.ts, and a second
 * person's hand is seen (and ignored) instead of silently taking the only slot.
 */
export const DEFAULT_NUM_HANDS = 2;

/**
 * Starting detection thresholds for a live exhibition (not measured on a camera in the sandbox).
 * Higher = fewer false hands from the background, but a hand must be clearer to be seen.
 */
export const HAND_DETECTION_CONFIDENCE = 0.6;
export const HAND_PRESENCE_CONFIDENCE = 0.6;
export const HAND_TRACKING_CONFIDENCE = 0.6;

/**
 * Face detector that bounds whose hand counts (wave and thumb rules). BlazeFace short range, Apache-2.0, shipped with
 * the app in public/mediapipe so it works offline like the wasm files.
 */
export const FACE_MODEL_PATH = "/mediapipe/blaze_face_short_range.tflite";
/** A face does not move fast enough to need more than this; the detector runs at most this often. */
export const FACE_DETECTIONS_PER_SECOND = 4;
export const FACE_MIN_CONFIDENCE = 0.6;
/** A face not seen for this long is gone; the hand rule then falls back to the plain largest-hand rule. */
export const FACE_LOST_MS = 1000;
