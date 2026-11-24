/**
 * MoNUI-7 Momo Pemandu (Momo Guide) State Machine (`bench/monui7-momo-guide.ts`).
 *
 * Implements Lampiran B (variant canvas):
 * - Guides the user into proper hand positioning and lighting before and during drawing.
 * - Controls the ink gate: ink is permitted ONLY in LOCKED and DRAWING states.
 * - Emits prompts and handles transitions between GREET, LOCKED, DRAWING,
 *   ASK_FIVE_AGAIN, UNCLEAR_FINGERS, and ASK_LIGHT.
 */

export type MomoGuideState =
  | "GREET"
  | "LOCKED"
  | "DRAWING"
  | "ASK_FIVE_AGAIN"
  | "UNCLEAR_FINGERS"
  | "ASK_LIGHT";

export const MOMO_GUIDE_TEXTS: Readonly<Record<MomoGuideState, string | null>> = Object.freeze({
  GREET: "Halo! Tunjukkan lima jarimu ke aku dulu, ya.",
  LOCKED: "Sip, aku sudah lihat tanganmu. Silakan menggambar!",
  DRAWING: null,
  ASK_FIVE_AGAIN: "Tanganmu hilang dari pandanganku. Tunjukkan lima jari lagi, ya.",
  UNCLEAR_FINGERS: "Aku lihat tanganmu, tapi jarinya belum jelas. Coba dekatkan sedikit.",
  ASK_LIGHT: "Ruangannya agak gelap. Coba nyalakan lampu di depanmu, ya.",
});

export const MOMO_ASK_LIGHT_LOW_FPS_TEXT =
  "Kameramu melambat karena gelap. Nyalakan lampu di depanmu, ya.";

export const MOMO_GUIDE_CONSTANTS = Object.freeze({
  FIVE_STABLE_MS: 300,
  HAND_LOST_MS: 2000,
  LOW_LUMA_THRESHOLD: 0.10,
  LOW_LUMA_DUR_MS: 3000,
  FRAME_LOW_LUMA_THRESHOLD: 0.20,
  LOSS_BURST_WINDOW_MS: 10000,
  LOSS_BURST_COUNT: 2,
  /** R23B-HF3 Step 7: ASK_LIGHT trigger when uniqueCaptureFps stays < 12 for >= 3 s after exposure step 2. */
  LOW_FPS_THRESHOLD: 12,
  LOW_FPS_DUR_MS: 3000,
});

export interface MomoGuideFrameInput {
  nowMs: number;
  hasHand: boolean;
  fiveFingerValid: boolean;
  drawingActive?: boolean;
  rescueState?: "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST" | null;
  handRoiLumaP50?: number | null;
  frameLumaMean?: number | null;
  backlight?: boolean | null;
  /** R23B-HF3 Step 7: Rolling unique camera capture FPS. */
  uniqueCaptureFps?: number | null;
  /** R23B-HF3 Step 7: True once camera exposure step 2 has been attempted (or camera lacks support). */
  exposureControlAttempted?: boolean;
}

export interface MomoGuidePromptEvent {
  state: MomoGuideState;
  text: string;
  atMs: number;
}

export class MomoGuideFSM {
  private stateNow: MomoGuideState = "GREET";
  private fiveSinceMs: number | null = null;
  private lastHandSeenMs = 0;
  private lowLumaSinceMs: number | null = null;
  private lowFpsSinceMs: number | null = null;
  private askLightReason: "luma" | "low-fps" | null = null;
  private lossTimestamps: number[] = [];
  private wasHandPresent = false;
  private lastPromptEmitted: MomoGuideState | null = null;

  constructor(initialState: MomoGuideState = "GREET") {
    this.stateNow = initialState;
    if (initialState !== "DRAWING") {
      this.lastPromptEmitted = initialState;
    }
  }

  get state(): MomoGuideState {
    return this.stateNow;
  }

  get text(): string | null {
    if (this.stateNow === "ASK_LIGHT" && this.askLightReason === "low-fps") {
      return MOMO_ASK_LIGHT_LOW_FPS_TEXT;
    }
    return MOMO_GUIDE_TEXTS[this.stateNow];
  }

  /** Ink is permitted strictly in LOCKED and DRAWING states (Lampiran B). */
  get isInkAllowed(): boolean {
    return this.stateNow === "LOCKED" || this.stateNow === "DRAWING";
  }

  reset(nowMs = 0): void {
    void nowMs;
    this.stateNow = "GREET";
    this.fiveSinceMs = null;
    this.lastHandSeenMs = 0;
    this.lowLumaSinceMs = null;
    this.lowFpsSinceMs = null;
    this.askLightReason = null;
    this.lossTimestamps = [];
    this.wasHandPresent = false;
    this.lastPromptEmitted = "GREET";
  }

  update(input: MomoGuideFrameInput): {
    state: MomoGuideState;
    text: string | null;
    inkAllowed: boolean;
    promptEvent: MomoGuidePromptEvent | null;
  } {
    const { nowMs, hasHand, fiveFingerValid, drawingActive, rescueState } = input;

    // Track hand presence and loss events
    if (this.wasHandPresent && !hasHand) {
      this.lossTimestamps.push(nowMs);
    }
    this.wasHandPresent = hasHand;

    // Prune loss timestamps outside sliding 10s window
    const cutoffLoss = nowMs - MOMO_GUIDE_CONSTANTS.LOSS_BURST_WINDOW_MS;
    this.lossTimestamps = this.lossTimestamps.filter((t) => t >= cutoffLoss);

    if (hasHand) {
      this.lastHandSeenMs = nowMs;
    }

    // Five-finger stability tracking
    if (fiveFingerValid) {
      if (this.fiveSinceMs === null) {
        this.fiveSinceMs = nowMs;
      }
    } else {
      this.fiveSinceMs = null;
    }
    const fiveStable =
      this.fiveSinceMs !== null && nowMs - this.fiveSinceMs >= MOMO_GUIDE_CONSTANTS.FIVE_STABLE_MS;

    // Hand ROI low luma tracking (p50 < 0.10 for >= 3s)
    const roiLuma = input.handRoiLumaP50;
    if (
      hasHand &&
      roiLuma !== null &&
      roiLuma !== undefined &&
      roiLuma < MOMO_GUIDE_CONSTANTS.LOW_LUMA_THRESHOLD
    ) {
      if (this.lowLumaSinceMs === null) {
        this.lowLumaSinceMs = nowMs;
      }
    } else {
      this.lowLumaSinceMs = null;
    }
    const lowLumaPersistent =
      this.lowLumaSinceMs !== null &&
      nowMs - this.lowLumaSinceMs >= MOMO_GUIDE_CONSTANTS.LOW_LUMA_DUR_MS;

    // R23B-HF3 Step 7: persistent low capture FPS (< 12 fps for >= 3s after exposure step 2 was tried)
    const fps = input.uniqueCaptureFps;
    if (
      input.exposureControlAttempted === true &&
      typeof fps === "number" &&
      Number.isFinite(fps) &&
      fps < MOMO_GUIDE_CONSTANTS.LOW_FPS_THRESHOLD
    ) {
      if (this.lowFpsSinceMs === null) {
        this.lowFpsSinceMs = nowMs;
      }
    } else {
      this.lowFpsSinceMs = null;
    }
    const lowFpsPersistent =
      this.lowFpsSinceMs !== null &&
      nowMs - this.lowFpsSinceMs >= MOMO_GUIDE_CONSTANTS.LOW_FPS_DUR_MS;

    // Frame low luma or backlight with burst of losses (>= 2 losses in 10s)
    const frameLuma = input.frameLumaMean;
    const isFrameLowLuma =
      (frameLuma !== null &&
        frameLuma !== undefined &&
        frameLuma < MOMO_GUIDE_CONSTANTS.FRAME_LOW_LUMA_THRESHOLD) ||
      input.backlight === true;
    const lossBurstInLowLight =
      isFrameLowLuma && this.lossTimestamps.length >= MOMO_GUIDE_CONSTANTS.LOSS_BURST_COUNT;

    const askLightTriggered = lowLumaPersistent || lossBurstInLowLight || lowFpsPersistent;

    // Lost condition: rescueState LOST or hand absent >= 2000 ms (after having been seen)
    const handLostCondition =
      rescueState === "LOST" ||
      (!hasHand &&
        this.lastHandSeenMs > 0 &&
        nowMs - this.lastHandSeenMs >= MOMO_GUIDE_CONSTANTS.HAND_LOST_MS);

    const prevState = this.stateNow;
    const prevText = this.text;

    const enterAskLight = () => {
      this.stateNow = "ASK_LIGHT";
      this.askLightReason = lowFpsPersistent && !lowLumaPersistent && !lossBurstInLowLight ? "low-fps" : "luma";
    };

    // Evaluate state machine transitions
    switch (this.stateNow) {
      case "GREET": {
        if (fiveStable) {
          this.stateNow = "LOCKED";
          this.askLightReason = null;
        } else if (askLightTriggered) {
          enterAskLight();
        }
        break;
      }

      case "LOCKED": {
        if (handLostCondition) {
          this.stateNow = "ASK_FIVE_AGAIN";
        } else if (rescueState === "POSITION_ONLY") {
          this.stateNow = "UNCLEAR_FINGERS";
        } else if (askLightTriggered) {
          enterAskLight();
        } else if (drawingActive) {
          this.stateNow = "DRAWING";
        }
        break;
      }

      case "DRAWING": {
        if (handLostCondition) {
          this.stateNow = "ASK_FIVE_AGAIN";
        } else if (rescueState === "POSITION_ONLY") {
          this.stateNow = "UNCLEAR_FINGERS";
        } else if (askLightTriggered) {
          enterAskLight();
        }
        break;
      }

      case "ASK_FIVE_AGAIN":
      case "UNCLEAR_FINGERS":
      case "ASK_LIGHT": {
        if (fiveStable) {
          this.stateNow = "LOCKED";
          this.askLightReason = null;
        } else if (this.stateNow !== "ASK_LIGHT" && askLightTriggered) {
          enterAskLight();
        } else if (this.stateNow === "ASK_LIGHT" && lowFpsPersistent && this.askLightReason !== "low-fps") {
          this.askLightReason = "low-fps";
        }
        break;
      }
    }

    let promptEvent: MomoGuidePromptEvent | null = null;
    const currentText = this.text;
    if ((this.stateNow !== prevState || currentText !== prevText) && currentText !== null) {
      if (this.lastPromptEmitted !== this.stateNow || currentText !== prevText) {
        promptEvent = {
          state: this.stateNow,
          text: currentText,
          atMs: nowMs,
        };
        this.lastPromptEmitted = this.stateNow;
      }
    } else if (this.stateNow === "DRAWING") {
      this.lastPromptEmitted = null;
    }

    return {
      state: this.stateNow,
      text: currentText,
      inkAllowed: this.isInkAllowed,
      promptEvent,
    };
  }
}
