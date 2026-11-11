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
