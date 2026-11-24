/**
 * R22B Contract K3.1 / K4 v1.1 / K11 — Single-Source ActionIntentResolver (`bench/action-resolver.ts`).
 *
 * Enforces §A2, R22 B01–B08, and R22B B1.1–B1.9:
 *  - Exactly ONE `PinchSource` and ONE `PoseSource` per route (trained heads replace the source
 *    behind these interfaces only after passing B6 decision gates; never stacked as parallel vetoes).
 *  - B1.1 Variant-aware onset gate G1' in `GeometricPinchSource` (replaces the disproved R22
 *    "real fists >= 0.24" assumption; S-970 physical evidence showed dorsal fists drop to 0.03):
 *      * `mrpExtendedCount >= 2` -> `path: "OK"` -> passed (a fist cannot have >=2 extended MRP fingers)
 *      * otherwise               -> `path: "CLOSED"` -> `indexPipDeg(5,6,7) >= 60` AND
 *                                   `(thumbOpen || |thumbTip(4) - indexMCP(5)| / |0 - 9| >= 0.33)`.
 *  - B1.2 Onset confirmation + backfill:
 *      * Normal: 2 consecutive G1'-passing unique frames.
 *      * Guarded: if within last 400 ms pose was FIST/ONE/TWO or `undoRedoFsmState !== "NEUTRAL"`,
 *        requires >= 300 ms continuous time-based G1'-passing hold.
 *      * Points from pending frame #1 are backfilled by `LabStrokeDriver` on confirmation.
 *  - B1.3 Release debounce (>= 150 ms) + retro-trim (strictly separate from `HOLD_GRACE` for NO_HAND):
 *      * Pinch return before 150 ms continues the same stroke (`PINCH_RELEASE_BRIDGED`).
 *      * Confirmed release (>= 150 ms) discards debounce-period points (retro-trim).
 *  - B1.4 Fist hold tolerance: single non-FIST frame <= 100 ms (not ONE/TWO/FIVE) does not reset
 *    `fistHoldStartMs`; G1'-rejected pinch frames count as FIST-compatible.
 *  - B1.5 Strict `FIVE` when preset uses both `PINCH_OK` draw and `FIVE` erase: all 5 fingers EXT,
 *    `pinchRatio >= 0.55`, `indexPipDeg(5,6,7) >= 160°`, plus >= 160 ms stable hold.
 *  - B1.7 K11 `CanvasMechanismPreset` + compositional K4 v1.1 `HandStateReading` + pinch variant smoothing.
 *  - B1.8 `reacquirePinchPolicy`: `"require-release"` (default) | `"allow-after-confirm"` (<= 1.5 s,
 *    <= 12% canvas diagonal, >= 3 consecutive G1'-passing frames).
 */
import { THUMB_OPEN_LATERAL, type FingerState, type HandPose } from "@/src/input/hand-gesture";
import type { Landmark } from "@/src/input/types";
import {
  fingerDiagnosticStatesAspect,
  pistolGeometryMetrics,
  type PistolGeometryMetrics,
} from "../r19/pistol_geometry";
import { DEFAULT_LAB_ASPECT, thumbLateral, withAspect } from "../r19/pistol_types";
import {
  DEFAULT_CANVAS_PRESET_ID,
  getCanvasPreset,
  inspectPresetRiskFlags,
  type CanvasMechanismPreset,
  type HandStateReading,
  type K4DerivedClass,
  type K4FingerPosture,
  type K4FingerPostures,
  type PinchVariant,
  type ReacquirePinchPolicy,
  type ThreeVariant,
} from "./presets";

export type {
  CanvasMechanismPreset,
  HandStateReading,
  K4DerivedClass,
  K4FingerPosture,
  K4FingerPostures,
  PinchVariant,
  ReacquirePinchPolicy,
  ThreeVariant,
} from "./presets";

export type LabRoute = "canvas" | "gesture";

/** Contract K4 mandatory autolabel provenance enum. */
export type LabelSource =
  | "MODEL_PREDICTION"
  | "RULE_DERIVED"
  | "USER_ACTION"
  | "DATASET_GT"
  | "UNKNOWN";

/** Contract K4 canonical pinch states (`NEAR` is an explicit negative that must never draw). */
export type PinchContactState = "TOUCH" | "NEAR" | "OPEN";

/** Contract K4 Canvas static pose taxonomy (v1.0 compatible). */
export type CanvasPoseClass = "FIST" | "ONE" | "TWO" | "FIVE" | "OTHER";

/** Diagnostic finger count (0..5 including 3 and 4 fingers per §A8 #9). */
export type DiagnosticFingerCount = 0 | 1 | 2 | 3 | 4 | 5;

/** Contract K3 / K11 canonical resolved action intent. */
export type ActionIntent =
  | "DRAW"
  | "ERASE"
  | "UNDO"
  | "REDO"
  | "THREE_ACTION"
  | "HOLD_GRACE"
  | "NEUTRAL";

/** Contract K3 / §B05 edge-triggered Undo/Redo FSM state. */
export type UndoRedoFsmState =
  | "NEUTRAL"
  | "ARMED_FIST"
  | "CONFIRM_ONE"
  | "CONFIRM_TWO"
  | "FIRED";

export type PinchOnsetState = "NONE" | "PENDING" | "CONFIRMED";

export const CANONICAL_PINCH_ONSET = 0.3;
export const CANONICAL_PINCH_HOLD = 0.42;
/**
 * Folded/curled-index pinch thresholds retained until B6 refit; protected at onset by G1' gate
 * because S-970 physical evidence (01_BUKTI_DAN_PENALARAN_S970.md §2.2–2.3) disproved the
 * prior "real fists >= 0.24" assumption (dorsal fists dropped as low as 0.03).
 */
export const CANONICAL_FOLDED_PINCH_ONSET = 0.2;
export const CANONICAL_FOLDED_PINCH_HOLD = 0.27;
export const CANONICAL_PINCH_NEAR_MAX = 0.5;

/** R22B B1.1 Onset Gate G1' default parameters (initial calibration from S-970 + T004; refit in B6). */
export const DEFAULT_PINCH_GATE_PIP_MIN_DEG = 60;
export const DEFAULT_PINCH_GATE_THUMB_IDX_MCP_MIN = 0.33;
export const DEFAULT_PINCH_GATE_MRP_EXTENDED_MIN = 2;

/** R22B B1.5 Strict FIVE thresholds when PINCH_OK and FIVE coexist in preset. */
export const STRICT_FIVE_PINCH_RATIO_MIN = 0.55;
export const STRICT_FIVE_INDEX_PIP_MIN_DEG = 160;

export const DEFAULT_CANVAS_LOSS_GRACE_MS = 240;
export const DEFAULT_CANVAS_MAX_RESUME_GAP_MS = 360;
export const DEFAULT_FIST_ARM_MS = 150;
export const DEFAULT_COMMAND_CONFIRM_MS = 150;
export const DEFAULT_COMMAND_COOLDOWN_MS = 500;
export const DEFAULT_FIST_TRANSITION_GRACE_MS = 450;
export const DEFAULT_CONFIRM_FLICKER_GRACE_MS = 100;
export const DEFAULT_FIST_FLICKER_TOLERANCE_MS = 100;
export const DEFAULT_ERASE_STABLE_MS = 160;
export const DEFAULT_THREE_ACTION_STABLE_MS = 150;
export const DEFAULT_STALE_FRAME_MS = 150;
export const DEFAULT_ONSET_CONFIRM_FRAMES = 2;
export const DEFAULT_POST_FIST_ONSET_GUARD_WINDOW_MS = 400;
export const DEFAULT_POST_FIST_ONSET_HOLD_MS = 200;
export const DEFAULT_RELEASE_DEBOUNCE_MS = 150;
export const DEFAULT_REACQUIRE_MAX_GAP_MS = 1500;
export const DEFAULT_REACQUIRE_MAX_DIAG_SHARE = 0.12;
export const DEFAULT_REACQUIRE_CONFIRM_FRAMES = 3;
export const DEFAULT_VARIANT_SMOOTH_WINDOW_MS = 300;

/** Split-palm thresholds matching `src/input/hand-gesture.ts` so NUI Lab audits split-palm honestly (§A8 #11). */
const SPLIT_GAP_RATIO = 1.8;
const SPLIT_MIN_SPREAD = 0.25;

export interface PinchGateConfig {
  pipMinDeg: number;
  thumbIdxMcpMin: number;
  mrpExtendedMin: number;
}

export const DEFAULT_PINCH_GATE_CONFIG: Readonly<PinchGateConfig> = Object.freeze({
  pipMinDeg: DEFAULT_PINCH_GATE_PIP_MIN_DEG,
  thumbIdxMcpMin: DEFAULT_PINCH_GATE_THUMB_IDX_MCP_MIN,
  mrpExtendedMin: DEFAULT_PINCH_GATE_MRP_EXTENDED_MIN,
});

/** Contract K3.1 per-frame G1' gate reading. */
export interface PinchGateResult {
  path: "OK" | "CLOSED";
  passed: boolean;
  reasons: string[];
  indexPipDeg: number;
  thumbTipToIndexMcp: number;
  thumbOpen: boolean;
  mrpExtendedCount: number;
}

/** Contract K3.1 PinchReading. */
export interface PinchReading {
  state: PinchContactState;
  contact: boolean;
  pinchRatio: number | null;
  onsetThreshold: number;
  holdThreshold: number;
  indexCurled: boolean;
  variant: PinchVariant | null;
  gate: PinchGateResult;
  onset: PinchOnsetState;
  timestampMs: number;
  confidence: number;
  labelSource: LabelSource;
  reason: string;
}

export interface PinchSource {
  readonly id: string;
  readonly labelSource: LabelSource;
  evaluate(
    landmarks: Landmark[] | undefined,
    aspect: number,
    nowMs: number,
    held: boolean,
  ): PinchReading;
  reset(): void;
}

export interface PoseEvaluateOptions {
  /** B1.5: enforce strict FIVE (5 EXT + pinchRatio >= 0.55 + indexPipDeg(5,6,7) >= 160°). */
  strictFive?: boolean;
}

export interface PoseReading {
  poseClass: CanvasPoseClass;
  fingerCount: DiagnosticFingerCount;
  fingerStates: [FingerState, FingerState, FingerState, FingerState] | null;
  thumbOpen: boolean;
  isSplitPalm: boolean;
  isThumbUp: boolean;
  handPose: HandPose;
  threeVariant: ThreeVariant | null;
  fingersK4: K4FingerPostures | null;
  indexPipDeg: number;
  confidence: number;
  labelSource: LabelSource;
  reason: string;
  metrics: PistolGeometryMetrics | null;
}

export interface PoseSource {
  readonly id: string;
  readonly labelSource: LabelSource;
  evaluate(
    landmarks: Landmark[] | undefined,
    aspect: number,
    nowMs: number,
    pinch: PinchReading,
    opts?: PoseEvaluateOptions,
  ): PoseReading;
  reset(): void;
}

export interface ActionResolverConfig {
  /** Short detector blink grace measured from first lost frame (ms). Default: 240 ms. */
  lossGraceMs: number;
  /** Upper bound on total unobserved gap (`nowMs - lastTrackedMs`) to allow stroke resume. Default: 360 ms. */
  maxResumeGapMs: number;
  /** Minimum continuous stable FIST hold duration (ms) to enter `ARMED_FIST`. Default: 150 ms. */
  fistArmMs: number;
  /** Minimum continuous 1-finger or 2-finger confirmation duration (ms) after `ARMED_FIST`. Default: 150 ms. */
  commandConfirmMs: number;
  /** Cooldown (ms) after firing Undo/Redo before FIST re-arm can complete. Default: 500 ms. */
  commandCooldownMs: number;
  /** Max brief transition window (ms) allowed while opening fingers from FIST into ONE/TWO. Default: 450 ms. */
  fistTransitionGraceMs: number;
  /** Max single-frame flicker tolerance (ms) while confirming ONE/TWO. Default: 100 ms. */
  confirmFlickerGraceMs: number;
  /** B1.4: Max single non-FIST frame flicker tolerance (ms) without resetting `fistHoldStartMs`. Default: 100 ms. */
  fistFlickerToleranceMs: number;
  /** Minimum continuous 5-finger open-palm hold duration (ms) before ERASE activates. Default: 160 ms. */
  eraseStableMs: number;
  /** Minimum continuous THREE-variant hold duration (ms) before THREE_ACTION fires. Default: 150 ms. */
  threeActionStableMs: number;
  /** Minimum unique frames for time-gated transitions (prevents 1-frame timestamp jump false fires). Default: 2. */
  minUniqueFrames: number;
  /** Frame age threshold (ms) above which a frame is considered stale and must not mutate StrokeStore. Default: 150 ms. */
  staleFrameMs: number;
  /** B1.1: G1' onset gate thresholds. */
  pipMinDeg: number;
  thumbIdxMcpMin: number;
  mrpExtendedMin: number;
  /** B1.2: Consecutive G1'-passing unique frames required for normal onset confirmation. Default: 2. */
  onsetConfirmFrames: number;
  /** B1.2: Post-FIST/ONE/TWO guard window (ms) that enforces time-based onset confirmation. Default: 400 ms. */
  postFistOnsetGuardWindowMs: number;
  /** B1.2: Continuous G1'-passing hold duration (ms) required inside post-FIST guard or non-NEUTRAL FSM. Default: 300 ms. */
  postFistOnsetHoldMs: number;
  /** B1.3: Release debounce hold duration (ms) before closing stroke & retro-trimming. Default: 150 ms. */
  releaseDebounceMs: number;
  /** B1.8: Reacquire pinch policy flag (default `"require-release"`). */
  reacquirePinchPolicy: ReacquirePinchPolicy;
  /** B1.8: Max absence gap (ms) for `allow-after-confirm`. Default: 1500 ms. */
  reacquireMaxGapMs: number;
  /** B1.8: Max canvas diagonal share for `allow-after-confirm`. Default: 0.12. */
  reacquireMaxDiagShare: number;
  /** B1.8: Consecutive G1'-passing frames required for `allow-after-confirm`. Default: 3. */
  reacquireConfirmFrames: number;
  /** B1.7: Active K11 Canvas mechanism preset ID. Default: `"default-any-pinch"`. */
  presetId: string;
}

export const DEFAULT_ACTION_RESOLVER_CONFIG: Readonly<ActionResolverConfig> = Object.freeze({
  lossGraceMs: DEFAULT_CANVAS_LOSS_GRACE_MS,
  maxResumeGapMs: DEFAULT_CANVAS_MAX_RESUME_GAP_MS,
  fistArmMs: DEFAULT_FIST_ARM_MS,
  commandConfirmMs: DEFAULT_COMMAND_CONFIRM_MS,
  commandCooldownMs: DEFAULT_COMMAND_COOLDOWN_MS,
  fistTransitionGraceMs: DEFAULT_FIST_TRANSITION_GRACE_MS,
  confirmFlickerGraceMs: DEFAULT_CONFIRM_FLICKER_GRACE_MS,
  fistFlickerToleranceMs: DEFAULT_FIST_FLICKER_TOLERANCE_MS,
  eraseStableMs: DEFAULT_ERASE_STABLE_MS,
  threeActionStableMs: DEFAULT_THREE_ACTION_STABLE_MS,
  minUniqueFrames: 2,
  staleFrameMs: DEFAULT_STALE_FRAME_MS,
  pipMinDeg: DEFAULT_PINCH_GATE_PIP_MIN_DEG,
  thumbIdxMcpMin: DEFAULT_PINCH_GATE_THUMB_IDX_MCP_MIN,
  mrpExtendedMin: DEFAULT_PINCH_GATE_MRP_EXTENDED_MIN,
  onsetConfirmFrames: DEFAULT_ONSET_CONFIRM_FRAMES,
  postFistOnsetGuardWindowMs: DEFAULT_POST_FIST_ONSET_GUARD_WINDOW_MS,
  postFistOnsetHoldMs: DEFAULT_POST_FIST_ONSET_HOLD_MS,
  releaseDebounceMs: DEFAULT_RELEASE_DEBOUNCE_MS,
  reacquirePinchPolicy: "require-release",
  reacquireMaxGapMs: DEFAULT_REACQUIRE_MAX_GAP_MS,
  reacquireMaxDiagShare: DEFAULT_REACQUIRE_MAX_DIAG_SHARE,
  reacquireConfirmFrames: DEFAULT_REACQUIRE_CONFIRM_FRAMES,
  presetId: DEFAULT_CANVAS_PRESET_ID,
});

export interface ActionResolverInput {
  route: LabRoute;
  landmarks: Landmark[] | undefined;
  aspect: number;
  nowMs: number;
  /** Optional K1 unique camera frame ID; duplicate IDs never advance hold timers or double-fire edges. */
  captureFrameId?: number;
  /** Optional K1 frame age in ms; if > staleFrameMs, frame is stale and never mutates StrokeStore. */
  frameAgeMs?: number;
  /** Explicit stale override from frame freshness monitor. */
  isStale?: boolean;
  /** Whether the primary owner hand lock is active for this frame. */
  ownerLocked: boolean;
  /** True when two hands cross or conflict (fail-closed hold). */
  ambiguousHold?: boolean;
  /** Reason string from hand lock (`"temporary-loss"`, `"empty-reset"`, `"crossing"`, `"unmatched-hand"`, etc.). */
  lockReason?: string | null;
  /** Monotonic acquisition serial; increments ONLY on a brand-new owner hand session (NOT on short blink). */
  acquisitionId: number;
  /** Fail-closed gate: false while model is unloaded, loading, or errored. */
  modelReady: boolean;
  modelNotReadyReason?: string | null;
  /** Current StrokeStore state (read-only awareness for grace & release debounce status). */
  hasActiveStroke: boolean;
  isErasing: boolean;
  /** Require fresh hand to release an active pose before first action (true under fullFrameLock). */
  requireFreshHandRearm?: boolean;
}

export interface ActionResolution {
  route: LabRoute;
  actionIntent: ActionIntent;
  actionAccepted: boolean;
  rejectReason: string | null;
  labelSource: LabelSource;
  fingerCount: DiagnosticFingerCount;
  poseClass: CanvasPoseClass;
  handPose: HandPose;
  pinchState: PinchContactState;
  pinchRatio: number | null;
  pinchContact: boolean;
  /** Contract K3.1 fields. */
  pinchVariant: PinchVariant | null;
  pinchGate: PinchGateResult;
  pinchOnset: PinchOnsetState;
  /** Contract K4 v1.1 compositional hand state. */
  handState: HandStateReading;
  /** Active K11 preset ID. */
  presetId: string;
  isSplitPalm: boolean;
  isThumbUp: boolean;
  thumbOpen: boolean;
  fingerStates: [FingerState, FingerState, FingerState, FingerState] | null;
  undoRedoFsmState: UndoRedoFsmState;
  r19State: "DISABLED_ON_CANVAS" | "ACTIVE_ON_GESTURE";
  /** Sole authorization flag allowing StrokeStore draw mutations this frame. */
  allowDrawMutation: boolean;
  /** Sole authorization flag allowing StrokeStore erase mutations this frame. */
  allowEraseMutation: boolean;
  /** B1.3: True while holding an open stroke across a < 150 ms pinch release flicker (separate from HOLD_GRACE). */
  inReleaseDebounce: boolean;
  /** B1.3: Non-null on the frame a < 150 ms pinch release flicker was bridged back into drawing. */
  releaseBridgedGapMs: number | null;
  /** B1.3: True on the frame release debounce completed (>= 150 ms) so caller retro-trims & closes stroke. */
  releaseConfirmed: boolean;
  /** B1.2 / B1.9: Non-null on the frame onset transitions PENDING -> CONFIRMED. */
  onsetConfirmedMeta: { waitedMs: number; variant: PinchVariant | null } | null;
  /** B1.1 / B1.9: Non-null when G1' blocked a pinch onset candidate on this frame. */
  onsetBlockedReason: string | null;
  /** Edge-triggered single-frame Undo/Redo command, or null. */
  fireCommand: "undo" | "redo" | null;
  /** Edge-triggered single-frame K11 THREE_ACTION, or null. */
  fireThreeAction: ThreeVariant | null;
  /** True while holding an open stroke across a short NO_HAND detector blink without mutating StrokeStore. */
  inLossGrace: boolean;
  /** Elapsed ms since first lost frame (0 while tracked). */
  lossElapsedMs: number;
  /** True when caller must close open strokes/erases fail-closed immediately. */
  shouldEndOpenOps: boolean;
  /** True when a 5-finger open palm has satisfied the >= 160 ms stability gate. */
  eraseStable: boolean;
  /** Re-arm status snapshot for diagnostics. */
  armed: { draw: boolean; erase: boolean; commands: boolean };
  confidence: number;
  captureFrameId: number | null;
  timestampMs: number;
}

export const EMPTY_PINCH_GATE: Readonly<PinchGateResult> = Object.freeze({
  path: "CLOSED",
  passed: false,
  reasons: ["no-landmarks"],
  indexPipDeg: 0,
  thumbTipToIndexMcp: 0,
  thumbOpen: false,
  mrpExtendedCount: 0,
});

export const EMPTY_HAND_STATE: Readonly<HandStateReading> = Object.freeze({
  contact: "OPEN",
  variant: null,
  fingers: null,
  threeVariant: null,
  derivedClass: "OTHER",
});

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function jointAngleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ax = a.x - b.x;
  const ay = a.y - b.y;
  const bx = c.x - b.x;
  const by = c.y - b.y;
  const len = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (len <= 1e-8) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / len))) * 180) / Math.PI;
}

function round2(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function round4(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0;
}

function mapFingerStateToK4(state: FingerState): K4FingerPosture {
  if (state === "extended") return "EXT";
  if (state === "curled") return "CURL";
  return "BETWEEN";
}

function isNearlyStraightRing(geo: Landmark[]): boolean {
  const wrist = geo[0];
  const mcp = geo[13];
  const pip = geo[14];
  const tip = geo[16];
  if (!wrist || !mcp || !pip || !tip) return false;
  return jointAngleDeg(mcp, pip, tip) >= 154 && dist2(tip, wrist) > 1.02 * dist2(pip, wrist);
}

function validAspect(aspect?: number): number {
  return typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_LAB_ASPECT;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function isSplitPalmRaw(lm: Landmark[]): boolean {
  const wrist = lm[0];
  const midMcp = lm[9];
  const i8 = lm[8];
  const m12 = lm[12];
  const r16 = lm[16];
  const p20 = lm[20];
  if (!wrist || !midMcp || !i8 || !m12 || !r16 || !p20) return false;
  const span = dist2(wrist, midMcp);
  if (span <= 1e-6) return false;
  const gapIM = dist2(i8, m12);
  const gapMR = dist2(m12, r16);
  const gapRP = dist2(r16, p20);
  return gapMR / span > SPLIT_MIN_SPREAD && gapMR > SPLIT_GAP_RATIO * Math.max(gapIM, gapRP);
}

/**
 * Pure helper evaluating R22B B1.1 Onset Gate G1' in aspect-corrected 2D space.
 * Exact geometric parity with `eval_fist_pinch_gate.py`.
 */
export function evaluatePinchGateG1Prime(
  geo: Landmark[],
  fourStates: [FingerState, FingerState, FingerState, FingerState] | null,
  scale: number,
  cfg: PinchGateConfig = DEFAULT_PINCH_GATE_CONFIG,
): PinchGateResult {
  const l4 = geo[4];
  const l5 = geo[5];
  const l6 = geo[6];
  const l7 = geo[7];
  if (!l4 || !l5 || !l6 || !l7 || !(scale > 1e-6)) {
    return { ...EMPTY_PINCH_GATE, reasons: ["invalid-landmarks"] };
  }
  const indexPipDeg = round2(jointAngleDeg(l5, l6, l7));
  const thumbTipToIndexMcp = round4(dist2(l4, l5) / scale);
  const tl = thumbLateral(geo);
  const thumbOpen = tl !== null && tl >= THUMB_OPEN_LATERAL;
  const mrpExtendedCount = fourStates
    ? (fourStates[1] === "extended" ? 1 : 0) +
      (fourStates[2] === "extended" ? 1 : 0) +
      (fourStates[3] === "extended" ? 1 : 0)
    : 0;

  if (mrpExtendedCount >= cfg.mrpExtendedMin) {
    return {
      path: "OK",
      passed: true,
      reasons: [],
      indexPipDeg,
      thumbTipToIndexMcp,
      thumbOpen,
      mrpExtendedCount,
    };
  }

  const reasons: string[] = [];
  if (!(indexPipDeg >= cfg.pipMinDeg)) {
    reasons.push("index-pip-curled");
  }
  if (!(thumbOpen || thumbTipToIndexMcp >= cfg.thumbIdxMcpMin)) {
    reasons.push("thumb-tucked");
  }
  return {
    path: "CLOSED",
    passed: reasons.length === 0,
    reasons,
    indexPipDeg,
    thumbTipToIndexMcp,
    thumbOpen,
    mrpExtendedCount,
  };
}

/**
 * Default canonical geometric `PinchSource` (Contract K3.1 / §A2 / R22B B1.1).
 *
 * Uses aspect-corrected thumb-index tip distance divided by wrist-to-middle-MCP span `|0 - 9|`:
 *  - Normal onset `<= 0.30`, hold hysteresis `<= 0.42`.
 *  - Curled-index onset `<= 0.20`, hold hysteresis `<= 0.27` — guarded at onset by variant-aware
 *    G1' gate (S-970 physical evidence disproved the old "real fists >= 0.24" comment: dorsal fists
 *    dropped to 0.03 and triggered 13 false pinches & 2 spurious strokes in the undo window).
 *  - `NEAR` (`onset < ratio <= 0.50` when not held) is explicitly rejected and NEVER draws.
 *  - Thumbs-up is always vetoed to `OPEN`.
 */
export class GeometricPinchSource implements PinchSource {
  readonly id = "r22b-geometric-pinch-g1p-v1";
  readonly labelSource: LabelSource = "RULE_DERIVED";
  readonly gateConfig: PinchGateConfig;

  constructor(gateConfig?: Partial<PinchGateConfig>) {
    this.gateConfig = { ...DEFAULT_PINCH_GATE_CONFIG, ...(gateConfig ?? {}) };
  }

  reset(): void {
    // Stateless per-frame evaluator (onset/hold/debounce state is owned by ActionIntentResolver).
  }

  evaluate(
    landmarks: Landmark[] | undefined,
    aspect: number,
    nowMs: number,
    held: boolean,
  ): PinchReading {
    const a = validAspect(aspect);
    if (!landmarks || landmarks.length < 21) {
      return {
        state: "OPEN",
        contact: false,
        pinchRatio: null,
        onsetThreshold: CANONICAL_PINCH_ONSET,
        holdThreshold: CANONICAL_PINCH_HOLD,
        indexCurled: false,
        variant: null,
        gate: { ...EMPTY_PINCH_GATE, reasons: ["no-landmarks"] },
        onset: "NONE",
        timestampMs: nowMs,
        confidence: 0,
        labelSource: this.labelSource,
        reason: "no-landmarks",
      };
    }

    const m = pistolGeometryMetrics(landmarks, a);
    const geo = withAspect(landmarks, a);
    const wrist = geo[0];
    const midMcp = geo[9];
    const thumbTip = geo[4];
    const indexTip = geo[8];
    if (!wrist || !midMcp || !thumbTip || !indexTip) {
      return {
        state: "OPEN",
        contact: false,
        pinchRatio: null,
        onsetThreshold: CANONICAL_PINCH_ONSET,
        holdThreshold: CANONICAL_PINCH_HOLD,
        indexCurled: false,
        variant: null,
        gate: { ...EMPTY_PINCH_GATE, reasons: ["invalid-landmarks"] },
        onset: "NONE",
        timestampMs: nowMs,
        confidence: 0,
        labelSource: this.labelSource,
        reason: "invalid-landmarks",
      };
    }

    const span = dist2(wrist, midMcp);
    if (!(span > 1e-6)) {
      return {
        state: "OPEN",
        contact: false,
        pinchRatio: null,
        onsetThreshold: CANONICAL_PINCH_ONSET,
        holdThreshold: CANONICAL_PINCH_HOLD,
        indexCurled: false,
        variant: null,
        gate: { ...EMPTY_PINCH_GATE, reasons: ["degenerate-span"] },
        onset: "NONE",
        timestampMs: nowMs,
        confidence: 0,
        labelSource: this.labelSource,
        reason: "degenerate-span",
      };
    }

    const pinchRatio = dist2(thumbTip, indexTip) / span;
    const fourStates = m?.fingerStates ?? fingerDiagnosticStatesAspect(landmarks, a);
    const indexCurled = fourStates ? fourStates[0] === "curled" : false;
    const onsetThreshold = indexCurled ? CANONICAL_FOLDED_PINCH_ONSET : CANONICAL_PINCH_ONSET;
    const holdThreshold = indexCurled ? CANONICAL_FOLDED_PINCH_HOLD : CANONICAL_PINCH_HOLD;
    const gate = evaluatePinchGateG1Prime(geo, fourStates, span, this.gateConfig);

    if (m && !m.plausible) {
      return {
        state: "OPEN",
        contact: false,
        pinchRatio,
        onsetThreshold,
        holdThreshold,
        indexCurled,
        variant: null,
        gate: { ...gate, passed: false, reasons: [...gate.reasons, `implausible:${m.plausibilityReason}`] },
        onset: "NONE",
        timestampMs: nowMs,
        confidence: 0,
        labelSource: this.labelSource,
        reason: `implausible:${m.plausibilityReason}`,
      };
    }

    if (m?.isThumbUp) {
      return {
        state: "OPEN",
        contact: false,
        pinchRatio,
        onsetThreshold,
        holdThreshold,
        indexCurled,
        variant: null,
        gate: { ...gate, passed: false, reasons: [...gate.reasons, "thumb-up-veto"] },
        onset: "NONE",
        timestampMs: nowMs,
        confidence: 0.95,
        labelSource: this.labelSource,
        reason: "thumb-up-veto",
      };
    }

    const activeThreshold = held ? holdThreshold : onsetThreshold;
    if (pinchRatio <= activeThreshold) {
      // B1.1: Onset requires variant-aware G1' gate to pass; active hold keeps existing hysteresis.
      if (!held && !gate.passed) {
        return {
          state: "OPEN",
          contact: false,
          pinchRatio,
          onsetThreshold,
          holdThreshold,
          indexCurled,
          variant: null,
          gate,
          onset: "NONE",
          timestampMs: nowMs,
          confidence: 0.9,
          labelSource: this.labelSource,
          reason: `pinch-gate-blocked:${gate.reasons.join("+") || "g1-failed"}`,
        };
      }
      const margin = clamp01(1 - pinchRatio / Math.max(1e-6, activeThreshold));
      return {
        state: "TOUCH",
        contact: true,
        pinchRatio,
        onsetThreshold,
        holdThreshold,
        indexCurled,
        variant: gate.path,
        gate,
        onset: held ? "CONFIRMED" : "PENDING",
        timestampMs: nowMs,
        confidence: clamp01(0.65 + 0.35 * margin),
        labelSource: this.labelSource,
        reason: held ? "pinch-hold" : "pinch-contact",
      };
    }

    if (pinchRatio <= CANONICAL_PINCH_NEAR_MAX) {
      return {
        state: "NEAR",
        contact: false,
        pinchRatio,
        onsetThreshold,
        holdThreshold,
        indexCurled,
        variant: null,
        gate,
        onset: "NONE",
        timestampMs: nowMs,
        confidence: 0.8,
        labelSource: this.labelSource,
        reason: "near-pinch-rejected",
      };
    }

    return {
      state: "OPEN",
      contact: false,
      pinchRatio,
      onsetThreshold,
      holdThreshold,
      indexCurled,
      variant: null,
      gate,
      onset: "NONE",
      timestampMs: nowMs,
      confidence: 0.95,
      labelSource: this.labelSource,
      reason: "open",
    };
  }
}

/**
 * Default canonical geometric `PoseSource` (Contract K3 / K4 v1.1 / B1.5 / §A8 #9-#11).
 */
export class GeometricPoseSource implements PoseSource {
  readonly id = "r22b-geometric-pose-v1.1";
  readonly labelSource: LabelSource = "RULE_DERIVED";

  reset(): void {
    // Stateless per-frame evaluator.
  }

  evaluate(
    landmarks: Landmark[] | undefined,
    aspect: number,
    _nowMs: number,
    pinch: PinchReading,
    opts?: PoseEvaluateOptions,
  ): PoseReading {
    const a = validAspect(aspect);
    if (!landmarks || landmarks.length < 21) {
      return {
        poseClass: "OTHER",
        fingerCount: 0,
        fingerStates: null,
        thumbOpen: false,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "none",
        threeVariant: null,
        fingersK4: null,
        indexPipDeg: 0,
        confidence: 0,
        labelSource: this.labelSource,
        reason: "no-landmarks",
        metrics: null,
      };
    }

    const m = pistolGeometryMetrics(landmarks, a);
    const fourStates = m?.fingerStates ?? fingerDiagnosticStatesAspect(landmarks, a);
    if (!fourStates) {
      return {
        poseClass: "OTHER",
        fingerCount: 0,
        fingerStates: null,
        thumbOpen: false,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "none",
        threeVariant: null,
        fingersK4: null,
        indexPipDeg: 0,
        confidence: 0,
        labelSource: this.labelSource,
        reason: "invalid-landmarks",
        metrics: m,
      };
    }

    const geo = withAspect(landmarks, a);
    const tl = thumbLateral(geo);
    const thumbOpen = m ? m.thumbOpen : tl !== null && tl >= THUMB_OPEN_LATERAL;
    const isThumbUp = m?.isThumbUp ?? false;
    const indexPipDeg = geo[5] && geo[6] && geo[7] ? round2(jointAngleDeg(geo[5], geo[6], geo[7])) : 0;

    const isIdxExt = fourStates[0] === "extended";
    const isMidExt = fourStates[1] === "extended";
    const isPinkyExt = fourStates[3] === "extended";
    const isRingExt =
      fourStates[2] === "extended" ||
      (isIdxExt &&
        isMidExt &&
        fourStates[3] === "curled" &&
        fourStates[2] === "between" &&
        isNearlyStraightRing(geo));

    const isIdxCurled = fourStates[0] === "curled" || Boolean(m?.index.isCurled && !isIdxExt);
    const isMidCurled = fourStates[1] === "curled" || Boolean(m?.middle.isCurled && !isMidExt);
    const isRingCurled = !isRingExt && (fourStates[2] === "curled" || Boolean(m?.ring.isCurled));
    const isPinkyCurled = fourStates[3] === "curled" || Boolean(m?.pinky.isCurled && !isPinkyExt);

    const fourExtCount =
      (isIdxExt ? 1 : 0) + (isMidExt ? 1 : 0) + (isRingExt ? 1 : 0) + (isPinkyExt ? 1 : 0);
    const fingerCount = Math.max(
      0,
      Math.min(5, fourExtCount + (thumbOpen ? 1 : 0)),
    ) as DiagnosticFingerCount;

    const fingersK4: K4FingerPostures = {
      thumb: thumbOpen ? "EXT" : "CURL",
      index: mapFingerStateToK4(fourStates[0]),
      middle: mapFingerStateToK4(fourStates[1]),
      ring: isRingExt ? "EXT" : mapFingerStateToK4(fourStates[2]),
      pinky: mapFingerStateToK4(fourStates[3]),
    };

    // Compositional THREE variants (only valid when thumb-index is OPEN, never during pinch contact).
    let threeVariant: ThreeVariant | null = null;
    if (!pinch.contact && pinch.state === "OPEN") {
      if (isIdxExt && isMidExt && isRingExt && isPinkyCurled && !thumbOpen) {
        threeVariant = "IMR";
      } else if (thumbOpen && isIdxExt && isMidExt && isRingCurled && isPinkyCurled) {
        threeVariant = "TIM";
      } else if (isIdxCurled && isMidExt && isRingExt && isPinkyExt) {
        threeVariant = "MRP";
      }
    }

    const all4NonCurled =
      fourStates[0] !== "curled" &&
      fourStates[1] !== "curled" &&
      fourStates[2] !== "curled" &&
      fourStates[3] !== "curled";
    const splitPalm = all4NonCurled && isSplitPalmRaw(landmarks);

    // 1. Pinch contact takes precedence for drawing.
    if (pinch.contact) {
      return {
        poseClass: "OTHER",
        fingerCount,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "pinch",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: pinch.confidence,
        labelSource: this.labelSource,
        reason: "pinch-contact",
        metrics: m,
      };
    }

    // 2. Thumbs-up negative gate.
    if (isThumbUp) {
      return {
        poseClass: "OTHER",
        fingerCount: Math.max(1, fingerCount) as DiagnosticFingerCount,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen: true,
        isSplitPalm: false,
        isThumbUp: true,
        handPose: "thumb-up",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: 0.9,
        labelSource: this.labelSource,
        reason: "thumb-up",
        metrics: m,
      };
    }

    // 3. FIST: all 4 non-thumb fingers curled, thumb not open.
    if (
      fourExtCount === 0 &&
      isIdxCurled &&
      isMidCurled &&
      isRingCurled &&
      isPinkyCurled &&
      !thumbOpen
    ) {
      return {
        poseClass: "FIST",
        fingerCount: 0,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen: false,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "fist",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: 0.92,
        labelSource: this.labelSource,
        reason: "fist-all-curled",
        metrics: m,
      };
    }

    // 4. ONE: only index extended, middle/ring/pinky curled, thumb folded.
    if (isIdxExt && isMidCurled && isRingCurled && isPinkyCurled && !thumbOpen) {
      return {
        poseClass: "ONE",
        fingerCount: 1,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen: false,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "one-finger",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: 0.9,
        labelSource: this.labelSource,
        reason: "one-finger-index",
        metrics: m,
      };
    }

    // 5. TWO: index + middle extended, ring + pinky curled, thumb folded.
    if (isIdxExt && isMidExt && isRingCurled && isPinkyCurled && !thumbOpen) {
      return {
        poseClass: "TWO",
        fingerCount: 2,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen: false,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "two-fingers",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: 0.9,
        labelSource: this.labelSource,
        reason: "two-fingers-index-middle",
        metrics: m,
      };
    }

    // 6. THREE (IMR default diagnostic; TIM/MRP also captured via `threeVariant`).
    if (threeVariant !== null) {
      return {
        poseClass: "OTHER",
        fingerCount: 3,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen,
        isSplitPalm: false,
        isThumbUp: false,
        handPose: "three-fingers",
        threeVariant,
        fingersK4,
        indexPipDeg,
        confidence: 0.9,
        labelSource: this.labelSource,
        reason: `three-fingers-${threeVariant.toLowerCase()}`,
        metrics: m,
      };
    }

    // 7. FOUR vs FIVE open/split palm (Owner Decision R22 + R22B B1.5 strict FIVE).
    if (fourExtCount === 4) {
      const safeFiveThumb =
        thumbOpen &&
        tl !== null &&
        tl >= THUMB_OPEN_LATERAL &&
        (m ? m.thumbAngle234Deg >= 120 && m.d4_8 >= 0.48 : true);
      const strictFiveOk =
        !opts?.strictFive ||
        ((pinch.pinchRatio === null || pinch.pinchRatio >= STRICT_FIVE_PINCH_RATIO_MIN) &&
          indexPipDeg >= STRICT_FIVE_INDEX_PIP_MIN_DEG);

      if (safeFiveThumb && strictFiveOk) {
        return {
          poseClass: "FIVE",
          fingerCount: 5,
          fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
          thumbOpen: true,
          isSplitPalm: splitPalm,
          isThumbUp: false,
          handPose: splitPalm ? "split-palm" : "open-palm",
          threeVariant: null,
          fingersK4,
          indexPipDeg,
          confidence: splitPalm ? 0.92 : 0.94,
          labelSource: this.labelSource,
          reason: splitPalm ? "split-palm-five" : "open-palm-five",
          metrics: m,
        };
      }
      return {
        poseClass: "OTHER",
        fingerCount: (thumbOpen ? 5 : 4) as DiagnosticFingerCount,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen,
        isSplitPalm: splitPalm,
        isThumbUp: false,
        handPose: splitPalm ? "split-palm" : "open-palm",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: 0.85,
        labelSource: this.labelSource,
        reason:
          safeFiveThumb && !strictFiveOk
            ? "strict-five-pinch-ok-guard"
            : splitPalm
              ? "split-palm-not-five"
              : thumbOpen
                ? "five-thumb-angle-unconfirmed"
                : "four-fingers-thumb-tucked",
        metrics: m,
      };
    }

    // 8. Split-palm with fewer than 4 extended non-thumb fingers: NEVER erases.
    if (splitPalm) {
      return {
        poseClass: "OTHER",
        fingerCount,
        fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
        thumbOpen,
        isSplitPalm: true,
        isThumbUp: false,
        handPose: "split-palm",
        threeVariant: null,
        fingersK4,
        indexPipDeg,
        confidence: 0.88,
        labelSource: this.labelSource,
        reason: "split-palm-not-five",
        metrics: m,
      };
    }

    // 9. L-sign (thumb + index) or other partial postures: accurate count, Canvas OTHER.
    const fallbackPose: HandPose =
      isIdxExt && isMidCurled && isRingCurled && isPinkyCurled ? "one-finger" : "none";
    return {
      poseClass: "OTHER",
      fingerCount,
      fingerStates: [...fourStates] as [FingerState, FingerState, FingerState, FingerState],
      thumbOpen,
      isSplitPalm: false,
      isThumbUp: false,
      handPose: fallbackPose,
      threeVariant: null,
      fingersK4,
      indexPipDeg,
      confidence: 0.7,
      labelSource: this.labelSource,
      reason: "other-posture",
      metrics: m,
    };
  }
}

function buildHandState(
  pinch: PinchReading,
  pose: PoseReading,
  smoothedVariant: PinchVariant | null,
): HandStateReading {
  let derivedClass: K4DerivedClass = "OTHER";
  if (pinch.contact) {
    derivedClass = (smoothedVariant ?? pinch.variant) === "OK" ? "PINCH_OK" : "PINCH_CLOSED";
  } else if (pose.poseClass === "FIST") {
    derivedClass = "FIST";
  } else if (pose.poseClass === "ONE") {
    derivedClass = "ONE";
  } else if (pose.poseClass === "TWO") {
    derivedClass = "TWO";
  } else if (pose.poseClass === "FIVE") {
    derivedClass = "FIVE";
  } else if (pinch.state === "NEAR") {
    derivedClass = "NEAR_PINCH";
  } else if (pose.threeVariant === "IMR") {
    derivedClass = "THREE_IMR";
  } else if (pose.threeVariant === "TIM") {
    derivedClass = "THREE_TIM";
  } else if (pose.threeVariant === "MRP") {
    derivedClass = "THREE_MRP";
  } else if (pose.fingerCount === 4 && !pose.thumbOpen) {
    derivedClass = "FOUR";
  }
  return {
    contact: pinch.state,
    variant: pinch.contact ? (smoothedVariant ?? pinch.variant) : null,
    fingers: pose.fingersK4 ? { ...pose.fingersK4 } : null,
    threeVariant: pose.threeVariant,
    derivedClass,
  };
}

export interface ActionIntentResolverOptions {
  pinchSource?: PinchSource;
  poseSource?: PoseSource;
  config?: Partial<ActionResolverConfig>;
  preset?: CanvasMechanismPreset;
}

/**
 * Deterministic single-source `ActionIntentResolver` (Contract K3.1 / K4 v1.1 / K11).
 */
export class ActionIntentResolver {
  readonly pinchSource: PinchSource;
  readonly poseSource: PoseSource;
  readonly config: ActionResolverConfig;
  private presetNow: CanvasMechanismPreset;

  /** True while drawing stroke is confirmed active (including < 150 ms release debounce and short-blink grace). */
  private pinchHeld = false;
  private armed = { draw: false, erase: false, commands: false };
  private lastAcquisitionId = -1;

  // Frame uniqueness tracking (prevents duplicate-rAF frames from inflating ms/frame gates)
  private lastCaptureFrameId: number | null = null;
  private lastUniqueNowMs: number | null = null;

  // Loss / short-blink grace tracking
  private lastTrackedMs: number | null = null;
  private lossStartedMs: number | null = null;
  private lastLostAtMs: number | null = null;
  private lastTrackedTipNorm: { x: number; y: number } | null = null;
  /** B1.8: Frozen last known tip position captured when hand entered loss (never overwritten while !armed.draw). */
  private lastLostTipNorm: { x: number; y: number } | null = null;

  // B1.2 Onset confirmation tracking
  private onsetStartMs: number | null = null;
  private onsetConsecutiveFrames = 0;
  private onsetGuarded = false;
  private lastFistOneTwoMs: number | null = null;
  private lastFistOrFsmGuardMs: number | null = null;

  // B1.3 Release debounce tracking (strictly separate from HOLD_GRACE)
  private releaseDebounceStartMs: number | null = null;

  // B1.7 Pinch variant smoothing window (prevents mid-stroke CLOSED <-> OK flicker)
  private variantHistory: Array<{ t: number; v: PinchVariant }> = [];
  private smoothedVariant: PinchVariant | null = null;

  // B1.8 Reacquire policy (`allow-after-confirm`) consecutive G1' frames
  private reacquireConfirmFrames = 0;

  // 5-finger Erase time-based stability tracker
  private eraseStableStartMs: number | null = null;
  private eraseUniqueFrames = 0;

  // K11 THREE_ACTION time-based edge-triggered tracker
  private threeStableStartMs: number | null = null;
  private threeUniqueFrames = 0;
  private threeActionFired = false;

  // Time-based edge-triggered Canvas Undo/Redo FSM (with B1.4 flicker tolerance)
  private undoRedoState: UndoRedoFsmState = "NEUTRAL";
  private fistHoldStartMs: number | null = null;
  private fistUniqueFrames = 0;
  private fistFlickerCount = 0;
  private lastFistMs: number | null = null;
  private confirmStartMs: number | null = null;
  private confirmUniqueFrames = 0;
  private confirmFlickerStartMs: number | null = null;
  private commandCooldownUntilMs = 0;

  // Cached last resolution for duplicate captureFrameId idempotence
  private lastResolution: ActionResolution | null = null;

  constructor(opts: ActionIntentResolverOptions = {}) {
    this.config = { ...DEFAULT_ACTION_RESOLVER_CONFIG, ...(opts.config ?? {}) };
    this.presetNow = opts.preset ?? getCanvasPreset(this.config.presetId);
    this.config.presetId = this.presetNow.id;
    this.pinchSource =
      opts.pinchSource ??
      new GeometricPinchSource({
        pipMinDeg: this.config.pipMinDeg,
        thumbIdxMcpMin: this.config.thumbIdxMcpMin,
        mrpExtendedMin: this.config.mrpExtendedMin,
      });
    this.poseSource = opts.poseSource ?? new GeometricPoseSource();
  }

  get preset(): CanvasMechanismPreset {
    return this.presetNow;
  }

  setPreset(presetOrId: CanvasMechanismPreset | string): void {
    const next = typeof presetOrId === "string" ? getCanvasPreset(presetOrId) : presetOrId;
    if (next.id === this.presetNow.id) return;
    this.presetNow = next;
    this.config.presetId = next.id;
    this.resetOnset();
    this.releaseDebounceStartMs = null;
    this.pinchHeld = false;
    this.resetEraseHold();
    this.resetThreeAction();
    this.resetUndoRedoFsm(false);
  }

  setReacquirePinchPolicy(policy: ReacquirePinchPolicy): void {
    this.config.reacquirePinchPolicy = policy;
    this.reacquireConfirmFrames = 0;
  }

  get undoRedoFsmState(): UndoRedoFsmState {
    return this.undoRedoState;
  }

  get armedState(): { draw: boolean; erase: boolean; commands: boolean } {
    return { ...this.armed };
  }

  reset(): void {
    this.pinchSource.reset();
    this.poseSource.reset();
    this.pinchHeld = false;
    this.armed = { draw: false, erase: false, commands: false };
    this.lastAcquisitionId = -1;
    this.lastCaptureFrameId = null;
    this.lastUniqueNowMs = null;
    this.lastTrackedMs = null;
    this.lossStartedMs = null;
    this.lastLostAtMs = null;
    this.lastTrackedTipNorm = null;
    this.lastLostTipNorm = null;
    this.resetOnset();
    this.lastFistOneTwoMs = null;
    this.lastFistOrFsmGuardMs = null;
    this.releaseDebounceStartMs = null;
    this.variantHistory = [];
    this.smoothedVariant = null;
    this.reacquireConfirmFrames = 0;
    this.resetEraseHold();
    this.resetThreeAction();
    this.resetUndoRedoFsm(false);
    this.commandCooldownUntilMs = 0;
    this.lastResolution = null;
  }

  private resetOnset(): void {
    this.onsetStartMs = null;
    this.onsetConsecutiveFrames = 0;
    this.onsetGuarded = false;
  }

  private resetEraseHold(): void {
    this.eraseStableStartMs = null;
    this.eraseUniqueFrames = 0;
  }

  private resetThreeAction(): void {
    this.threeStableStartMs = null;
    this.threeUniqueFrames = 0;
    this.threeActionFired = false;
  }

  private resetUndoRedoFsm(keepCooldown: boolean): void {
    this.undoRedoState = "NEUTRAL";
    this.fistHoldStartMs = null;
    this.fistUniqueFrames = 0;
    this.fistFlickerCount = 0;
    this.lastFistMs = null;
    this.confirmStartMs = null;
    this.confirmUniqueFrames = 0;
    this.confirmFlickerStartMs = null;
    if (!keepCooldown) this.commandCooldownUntilMs = 0;
  }

  private updateSmoothedVariant(raw: PinchVariant | null, nowMs: number, isNewOnset: boolean): PinchVariant | null {
    if (raw === null) {
      this.variantHistory = [];
      this.smoothedVariant = null;
      return null;
    }
    if (isNewOnset || this.variantHistory.length === 0) {
      this.variantHistory = [{ t: nowMs, v: raw }];
      this.smoothedVariant = raw;
      return raw;
    }
    this.variantHistory.push({ t: nowMs, v: raw });
    const cutoff = nowMs - DEFAULT_VARIANT_SMOOTH_WINDOW_MS;
    while (this.variantHistory.length > 7 || (this.variantHistory.length > 1 && this.variantHistory[0]!.t < cutoff)) {
      this.variantHistory.shift();
    }
    let okCount = 0;
    let closedCount = 0;
    for (const item of this.variantHistory) {
      if (item.v === "OK") okCount++;
      else closedCount++;
    }
    if (okCount > closedCount) this.smoothedVariant = "OK";
    else if (closedCount > okCount) this.smoothedVariant = "CLOSED";
    return this.smoothedVariant ?? raw;
  }

  private computeIsUniqueFrame(nowMs: number, captureFrameId?: number): boolean {
    if (captureFrameId !== undefined) {
      if (this.lastCaptureFrameId !== null && captureFrameId === this.lastCaptureFrameId) {
        return false;
      }
      this.lastCaptureFrameId = captureFrameId;
      this.lastUniqueNowMs = nowMs;
      return true;
    }
    if (this.lastUniqueNowMs !== null && nowMs <= this.lastUniqueNowMs) {
      return false;
    }
    this.lastUniqueNowMs = nowMs;
    return true;
  }

  private stepUndoRedoFsm(
    poseClass: CanvasPoseClass,
    nowMs: number,
    isUniqueFrame: boolean,
  ): "undo" | "redo" | null {
    if (this.presetNow.undoRedo !== "FIST_ONE_TWO") {
      this.resetUndoRedoFsm(true);
      return null;
    }
    // 5-finger palm cancels Undo/Redo arming cleanly.
    if (poseClass === "FIVE") {
      this.resetUndoRedoFsm(true);
      return null;
    }

    switch (this.undoRedoState) {
      case "NEUTRAL": {
        if (poseClass === "FIST") {
          this.fistFlickerCount = 0;
          if (this.fistHoldStartMs === null) {
            this.fistHoldStartMs = nowMs;
            this.fistUniqueFrames = 1;
          } else if (isUniqueFrame) {
            this.fistUniqueFrames += 1;
          }
          this.lastFistMs = nowMs;
          const heldMs = nowMs - this.fistHoldStartMs;
          if (
            nowMs >= this.commandCooldownUntilMs &&
            this.fistUniqueFrames >= this.config.minUniqueFrames &&
            heldMs >= this.config.fistArmMs
          ) {
            this.undoRedoState = "ARMED_FIST";
          }
        } else if (
          // B1.4: Single non-FIST frame <= 100 ms (not ONE/TWO/FIVE) does NOT reset fistHoldStartMs.
          this.fistHoldStartMs !== null &&
          this.lastFistMs !== null &&
          poseClass !== "ONE" &&
          poseClass !== "TWO" &&
          this.fistFlickerCount === 0 &&
          nowMs - this.lastFistMs <= this.config.fistFlickerToleranceMs
        ) {
          this.fistFlickerCount = 1;
        } else {
          this.fistHoldStartMs = null;
          this.fistUniqueFrames = 0;
          this.fistFlickerCount = 0;
          this.lastFistMs = null;
        }
        return null;
      }

      case "ARMED_FIST": {
        if (poseClass === "FIST") {
          this.lastFistMs = nowMs;
          return null;
        }
        if (poseClass === "ONE") {
          this.undoRedoState = "CONFIRM_ONE";
          this.confirmStartMs = nowMs;
          this.confirmUniqueFrames = 1;
          this.confirmFlickerStartMs = null;
          return null;
        }
        if (poseClass === "TWO") {
          this.undoRedoState = "CONFIRM_TWO";
          this.confirmStartMs = nowMs;
          this.confirmUniqueFrames = 1;
          this.confirmFlickerStartMs = null;
          return null;
        }
        // Brief transitional pose while opening fingers from fist to 1 or 2 fingers.
        if (
          this.lastFistMs !== null &&
          nowMs - this.lastFistMs <= this.config.fistTransitionGraceMs
        ) {
          return null;
        }
        this.resetUndoRedoFsm(true);
        return null;
      }

      case "CONFIRM_ONE": {
        if (poseClass === "ONE") {
          this.confirmFlickerStartMs = null;
          if (this.confirmStartMs === null) {
            this.confirmStartMs = nowMs;
            this.confirmUniqueFrames = 1;
          } else if (isUniqueFrame) {
            this.confirmUniqueFrames += 1;
          }
          if (
            this.confirmUniqueFrames >= this.config.minUniqueFrames &&
            nowMs - this.confirmStartMs >= this.config.commandConfirmMs
          ) {
            this.undoRedoState = "FIRED";
            this.commandCooldownUntilMs = nowMs + this.config.commandCooldownMs;
            this.fistHoldStartMs = null;
            this.fistUniqueFrames = 0;
            this.fistFlickerCount = 0;
            this.confirmStartMs = null;
            this.confirmUniqueFrames = 0;
            this.confirmFlickerStartMs = null;
            return "undo";
          }
          return null;
        }
        if (poseClass === "TWO") {
          this.undoRedoState = "CONFIRM_TWO";
          this.confirmStartMs = nowMs;
          this.confirmUniqueFrames = 1;
          this.confirmFlickerStartMs = null;
          return null;
        }
        if (poseClass === "FIST") {
          this.undoRedoState = "ARMED_FIST";
          this.lastFistMs = nowMs;
          this.confirmStartMs = null;
          this.confirmUniqueFrames = 0;
          this.confirmFlickerStartMs = null;
          return null;
        }
        if (this.confirmFlickerStartMs === null) {
          this.confirmFlickerStartMs = nowMs;
          return null;
        }
        if (nowMs - this.confirmFlickerStartMs <= this.config.confirmFlickerGraceMs) {
          return null;
        }
        this.resetUndoRedoFsm(true);
        return null;
      }

      case "CONFIRM_TWO": {
        if (poseClass === "TWO") {
          this.confirmFlickerStartMs = null;
          if (this.confirmStartMs === null) {
            this.confirmStartMs = nowMs;
            this.confirmUniqueFrames = 1;
          } else if (isUniqueFrame) {
            this.confirmUniqueFrames += 1;
          }
          if (
            this.confirmUniqueFrames >= this.config.minUniqueFrames &&
            nowMs - this.confirmStartMs >= this.config.commandConfirmMs
          ) {
            this.undoRedoState = "FIRED";
            this.commandCooldownUntilMs = nowMs + this.config.commandCooldownMs;
            this.fistHoldStartMs = null;
            this.fistUniqueFrames = 0;
            this.fistFlickerCount = 0;
            this.confirmStartMs = null;
            this.confirmUniqueFrames = 0;
            this.confirmFlickerStartMs = null;
            return "redo";
          }
          return null;
        }
        if (poseClass === "ONE") {
          this.undoRedoState = "CONFIRM_ONE";
          this.confirmStartMs = nowMs;
          this.confirmUniqueFrames = 1;
          this.confirmFlickerStartMs = null;
          return null;
        }
        if (poseClass === "FIST") {
          this.undoRedoState = "ARMED_FIST";
          this.lastFistMs = nowMs;
          this.confirmStartMs = null;
          this.confirmUniqueFrames = 0;
          this.confirmFlickerStartMs = null;
          return null;
        }
        if (this.confirmFlickerStartMs === null) {
          this.confirmFlickerStartMs = nowMs;
          return null;
        }
        if (nowMs - this.confirmFlickerStartMs <= this.config.confirmFlickerGraceMs) {
          return null;
        }
        this.resetUndoRedoFsm(true);
        return null;
      }

      case "FIRED": {
        if (poseClass === "FIST") {
          if (nowMs < this.commandCooldownUntilMs) {
            this.fistHoldStartMs = null;
            this.fistUniqueFrames = 0;
            this.fistFlickerCount = 0;
            return null;
          }
          this.fistFlickerCount = 0;
          if (this.fistHoldStartMs === null) {
            this.fistHoldStartMs = nowMs;
            this.fistUniqueFrames = 1;
          } else if (isUniqueFrame) {
            this.fistUniqueFrames += 1;
          }
          this.lastFistMs = nowMs;
          if (
            this.fistUniqueFrames >= this.config.minUniqueFrames &&
            nowMs - this.fistHoldStartMs >= this.config.fistArmMs
          ) {
            this.undoRedoState = "ARMED_FIST";
          }
          return null;
        }
        if (
          this.fistHoldStartMs !== null &&
          this.lastFistMs !== null &&
          poseClass !== "ONE" &&
          poseClass !== "TWO" &&
          this.fistFlickerCount === 0 &&
          nowMs - this.lastFistMs <= this.config.fistFlickerToleranceMs
        ) {
          this.fistFlickerCount = 1;
          return null;
        }
        this.fistHoldStartMs = null;
        this.fistUniqueFrames = 0;
        this.fistFlickerCount = 0;
        return null;
      }
    }
  }

  private baseResolution(
    input: ActionResolverInput,
    r19State: "DISABLED_ON_CANVAS" | "ACTIVE_ON_GESTURE",
    overrides: Partial<ActionResolution>,
  ): ActionResolution {
    return {
      route: input.route,
      actionIntent: "NEUTRAL",
      actionAccepted: false,
      rejectReason: null,
      labelSource: "RULE_DERIVED",
      fingerCount: 0,
      poseClass: "OTHER",
      handPose: "none",
      pinchState: "OPEN",
      pinchRatio: null,
      pinchContact: false,
      pinchVariant: null,
      pinchGate: { ...EMPTY_PINCH_GATE },
      pinchOnset: "NONE",
      handState: { ...EMPTY_HAND_STATE },
      presetId: this.presetNow.id,
      isSplitPalm: false,
      isThumbUp: false,
      thumbOpen: false,
      fingerStates: null,
      undoRedoFsmState: this.undoRedoState,
      r19State,
      allowDrawMutation: false,
      allowEraseMutation: false,
      inReleaseDebounce: false,
      releaseBridgedGapMs: null,
      releaseConfirmed: false,
      onsetConfirmedMeta: null,
      onsetBlockedReason: null,
      fireCommand: null,
      fireThreeAction: null,
      inLossGrace: false,
      lossElapsedMs: 0,
      shouldEndOpenOps: false,
      eraseStable: false,
      armed: { ...this.armed },
      confidence: 0,
      captureFrameId: input.captureFrameId ?? null,
      timestampMs: input.nowMs,
      ...overrides,
    };
  }

  resolve(input: ActionResolverInput): ActionResolution {
    const r19State = input.route === "canvas" ? "DISABLED_ON_CANVAS" : "ACTIVE_ON_GESTURE";
    const staleByAge =
      typeof input.frameAgeMs === "number" &&
      Number.isFinite(input.frameAgeMs) &&
      input.frameAgeMs > this.config.staleFrameMs;
    const isStale = input.isStale === true || staleByAge;

    // 1. Fail-closed if model/runtime is not ready.
    if (!input.modelReady) {
      this.pinchHeld = false;
      this.lossStartedMs = null;
      this.lastTrackedMs = null;
      this.releaseDebounceStartMs = null;
      this.resetOnset();
      this.resetEraseHold();
      this.resetThreeAction();
      this.resetUndoRedoFsm(false);
      const res = this.baseResolution(input, r19State, {
        rejectReason: input.modelNotReadyReason ?? "Model R19 belum siap",
        shouldEndOpenOps: true,
      });
      this.lastResolution = res;
      return res;
    }

    // 2. Fail-closed on stale frames (C15: stale frame MUST NEVER mutate StrokeStore!).
    if (isStale) {
      const prev = this.lastResolution;
      return this.baseResolution(input, r19State, {
        rejectReason: "Data tertinggal: menunggu frame terbaru",
        fingerCount: prev?.fingerCount ?? 0,
        poseClass: prev?.poseClass ?? "OTHER",
        handPose: prev?.handPose ?? "none",
        pinchState: prev?.pinchState ?? "OPEN",
        pinchRatio: prev?.pinchRatio ?? null,
        pinchVariant: prev?.pinchVariant ?? null,
        pinchGate: prev?.pinchGate ?? { ...EMPTY_PINCH_GATE },
        pinchOnset: prev?.pinchOnset ?? "NONE",
        handState: prev?.handState ?? { ...EMPTY_HAND_STATE },
        thumbOpen: prev?.thumbOpen ?? false,
        fingerStates: prev?.fingerStates ?? null,
      });
    }

    // 3. Fail-closed on two-hand ambiguity / crossing (W05 / C13).
    if (input.ambiguousHold) {
      this.pinchHeld = false;
      this.lossStartedMs = null;
      this.releaseDebounceStartMs = null;
      this.resetOnset();
      this.resetEraseHold();
      this.resetThreeAction();
      this.resetUndoRedoFsm(true);
      const res = this.baseResolution(input, r19State, {
        rejectReason: "Dua tangan terlalu dekat: aksi ditahan aman",
        shouldEndOpenOps: true,
      });
      this.lastResolution = res;
      return res;
    }

    // 4. Duplicate captureFrameId guard: do not advance hold timers or double-fire edge commands.
    const isUniqueFrame = this.computeIsUniqueFrame(input.nowMs, input.captureFrameId);
    if (!isUniqueFrame && input.captureFrameId !== undefined && this.lastResolution) {
      return {
        ...this.lastResolution,
        fireCommand: null,
        fireThreeAction: null,
        onsetConfirmedMeta: null,
        releaseBridgedGapMs: null,
        releaseConfirmed: false,
        onsetBlockedReason: null,
        actionIntent:
          this.lastResolution.fireCommand !== null || this.lastResolution.fireThreeAction !== null
            ? "NEUTRAL"
            : this.lastResolution.actionIntent,
        actionAccepted:
          this.lastResolution.fireCommand !== null || this.lastResolution.fireThreeAction !== null
            ? false
            : this.lastResolution.actionAccepted,
        timestampMs: input.nowMs,
      };
    }

    // 5. Missing hand or unlocked owner: separate short NO_HAND detector blink (HOLD_GRACE) vs long loss.
    const hasValidLandmarks = Boolean(input.landmarks && input.landmarks.length >= 21);
    if (!hasValidLandmarks || !input.ownerLocked) {
      if (!input.isErasing) {
        this.resetEraseHold();
      }
      this.resetThreeAction();
      this.resetUndoRedoFsm(true);
      this.resetOnset();
      this.reacquireConfirmFrames = 0;

      const lockReason = input.lockReason ?? "no-hand";
      const graceEligibleReason =
        lockReason === "temporary-loss" || lockReason === "no-hand" || lockReason === "lost";
      const canGrace =
        input.route === "canvas" &&
        graceEligibleReason &&
        this.lastTrackedMs !== null;

      let inLossGrace = false;
      let lossElapsedMs = 0;
      const effectiveLossGraceMs = input.isErasing ? 300 : this.config.lossGraceMs;

      if (canGrace) {
        if (this.lossStartedMs === null) this.lossStartedMs = input.nowMs;
        lossElapsedMs = Math.max(0, input.nowMs - this.lossStartedMs);
        const totalGapMs = input.nowMs - this.lastTrackedMs!;
        inLossGrace =
          lossElapsedMs <= effectiveLossGraceMs &&
          totalGapMs >= 0 &&
          totalGapMs <= this.config.maxResumeGapMs;
      }

      if (!inLossGrace) {
        this.resetEraseHold();
        if (this.lastLostAtMs === null && this.lastTrackedMs !== null) {
          this.lastLostAtMs = this.lastTrackedMs;
          this.lastLostTipNorm = this.lastTrackedTipNorm ? { ...this.lastTrackedTipNorm } : null;
        }
        this.pinchHeld = false;
        this.releaseDebounceStartMs = null;
        this.variantHistory = [];
        this.smoothedVariant = null;
        if (
          lockReason === "empty-reset" ||
          lockReason === "unmatched-hand" ||
          lockReason === "crossing" ||
          lockReason === "multiple-hands" ||
          lockReason === "stale-track"
        ) {
          this.armed = { draw: false, erase: false, commands: false };
          this.lossStartedMs = null;
          this.lastTrackedMs = null;
        }
      }

      const isErasingGrace = input.isErasing && inLossGrace;
      const res = this.baseResolution(input, r19State, {
        actionIntent: isErasingGrace ? "ERASE" : inLossGrace ? "HOLD_GRACE" : "NEUTRAL",
        actionAccepted: isErasingGrace ? true : false,
        allowEraseMutation: isErasingGrace,
        rejectReason: inLossGrace
          ? (isErasingGrace ? null : "Jeda singkat deteksi (menahan goresan)")
          : lockReason === "no-hand"
            ? "Tangan tidak ditemukan"
            : lockReason,
        inLossGrace,
        lossElapsedMs,
        shouldEndOpenOps: !inLossGrace,
      });
      this.lastResolution = res;
      return res;
    }

    // 6. Tracked locked owner hand! Check new acquisition vs same-owner continuation.
    const requireRearm = input.requireFreshHandRearm === true;
    const prevTrackedBeforeUpdate = this.lastTrackedMs;
    let stallClosedOldOps = false;

    if (input.acquisitionId !== this.lastAcquisitionId) {
      this.lastAcquisitionId = input.acquisitionId;
      this.pinchHeld = false;
      this.lossStartedMs = null;
      this.releaseDebounceStartMs = null;
      this.variantHistory = [];
      this.smoothedVariant = null;
      this.resetOnset();
      this.reacquireConfirmFrames = 0;
      this.resetEraseHold();
      this.resetThreeAction();
      this.resetUndoRedoFsm(false);
      this.armed = requireRearm
        ? { draw: false, erase: false, commands: false }
        : { draw: true, erase: true, commands: true };
    } else if (this.lossStartedMs !== null) {
      const lossElapsedMs = input.nowMs - this.lossStartedMs;
      const totalGapMs =
        this.lastTrackedMs === null ? Infinity : input.nowMs - this.lastTrackedMs;
      const effectiveGrace = input.isErasing ? 300 : this.config.lossGraceMs;
      const withinGrace =
        lossElapsedMs >= 0 &&
        lossElapsedMs <= effectiveGrace &&
        totalGapMs >= 0 &&
        totalGapMs <= this.config.maxResumeGapMs;
      if (!withinGrace) {
        this.pinchHeld = false;
        this.releaseDebounceStartMs = null;
        this.resetOnset();
        this.resetEraseHold();
        if (this.lastLostAtMs === null && this.lastTrackedMs !== null) {
          this.lastLostAtMs = this.lastTrackedMs;
          this.lastLostTipNorm = this.lastTrackedTipNorm ? { ...this.lastTrackedTipNorm } : null;
        }
      }
      this.lossStartedMs = null;
    } else if (
      this.lastTrackedMs !== null &&
      input.nowMs - this.lastTrackedMs > this.config.maxResumeGapMs
    ) {
      // Camera stall > maxResumeGapMs with zero intermediate empty frames: fail-closed.
      this.pinchHeld = false;
      this.releaseDebounceStartMs = null;
      this.resetOnset();
      this.resetEraseHold();
      this.resetThreeAction();
      this.resetUndoRedoFsm(true);
      stallClosedOldOps = input.hasActiveStroke || input.isErasing;
    }

    this.lastTrackedMs = input.nowMs;

    // 7. Run the SINGLE PinchSource and SINGLE PoseSource.
    const riskFlags = inspectPresetRiskFlags(this.presetNow);
    const pinch = this.pinchSource.evaluate(
      input.landmarks,
      input.aspect,
      input.nowMs,
      this.pinchHeld,
    );
    const pose = this.poseSource.evaluate(input.landmarks, input.aspect, input.nowMs, pinch, {
      strictFive: input.route === "canvas" && riskFlags.requiresStrictFive,
    });

    // B1.1 / B1.4: Did G1' block a pinch onset candidate?
    const gateBlocked =
      !this.pinchHeld &&
      pinch.pinchRatio !== null &&
      pinch.pinchRatio <= pinch.onsetThreshold &&
      !pinch.gate.passed;
    const onsetBlockedReason = gateBlocked ? "blocked-by-g1-prime" : null;

    if (gateBlocked) {
      // B1.4: G1'-rejected pinch frames count as FIST-compatible for Undo/Redo & post-fist guard!
      this.lastFistOneTwoMs = input.nowMs;
      if (this.fistUniqueFrames >= 1 || this.undoRedoState !== "NEUTRAL") {
        this.lastFistOrFsmGuardMs = input.nowMs;
      }
    } else if (!pinch.contact && (pose.poseClass === "FIST" || pose.poseClass === "ONE" || pose.poseClass === "TWO")) {
      this.lastFistOneTwoMs = input.nowMs;
      if ((pose.poseClass === "FIST" && this.fistUniqueFrames >= 1) || this.undoRedoState !== "NEUTRAL") {
        this.lastFistOrFsmGuardMs = input.nowMs;
      }
    } else if (this.undoRedoState !== "NEUTRAL") {
      this.lastFistOrFsmGuardMs = input.nowMs;
    }

    // Update smoothed pinch variant (when pinching) & compositional HandStateReading (K4 v1.1)
    const smoothedVar = pinch.contact
      ? this.updateSmoothedVariant(pinch.variant, input.nowMs, !this.pinchHeld && this.onsetConsecutiveFrames === 0)
      : this.pinchHeld
        ? this.smoothedVariant
        : this.updateSmoothedVariant(null, input.nowMs, false);
    const handState = buildHandState(pinch, pose, smoothedVar);

    // Track last normalized index-tip position for B1.8 `allow-after-confirm` distance check
    // (never overwrite `lastLostTipNorm` while `!this.armed.draw` so frame 2+ cannot bypass the 12% jump guard!).
    const curTip = input.landmarks![8];
    const refLostTip = this.lastLostTipNorm ?? this.lastTrackedTipNorm;
    if (curTip && Number.isFinite(curTip.x) && Number.isFinite(curTip.y)) {
      this.lastTrackedTipNorm = { x: curTip.x, y: curTip.y };
    }

    // Update fresh-hand arming flags whenever a gesture is released.
    if (!pinch.contact && !this.pinchHeld) {
      this.armed.draw = true;
      this.reacquireConfirmFrames = 0;
      this.lastLostAtMs = null;
      this.lastLostTipNorm = null;
    }
    if (pose.poseClass !== "FIVE") this.armed.erase = true;
    if (pose.poseClass !== "ONE" && pose.poseClass !== "TWO") this.armed.commands = true;

    // On Gesture route, report accurate 0..5 finger diagnostics and pose without Canvas mutations.
    if (input.route === "gesture") {
      this.pinchHeld = pinch.contact;
      this.resetEraseHold();
      this.resetThreeAction();
      this.resetUndoRedoFsm(false);
      const res = this.baseResolution(input, r19State, {
        labelSource: pose.labelSource,
        fingerCount: pose.fingerCount,
        poseClass: pose.poseClass,
        handPose: pose.handPose,
        pinchState: pinch.state,
        pinchRatio: pinch.pinchRatio,
        pinchContact: pinch.contact,
        pinchVariant: smoothedVar,
        pinchGate: pinch.gate,
        pinchOnset: pinch.contact ? "CONFIRMED" : "NONE",
        handState,
        isSplitPalm: pose.isSplitPalm,
        isThumbUp: pose.isThumbUp,
        thumbOpen: pose.thumbOpen,
        fingerStates: pose.fingerStates,
        confidence: pose.confidence,
        onsetBlockedReason,
      });
      this.lastResolution = res;
      return res;
    }

    // 8. Canvas route decision logic (K11 preset + B1.1–B1.8):
    const activeVariant = smoothedVar ?? pinch.variant;
    const variantAllowedByPreset =
      activeVariant !== null &&
      this.presetNow.draw.includes(activeVariant === "OK" ? "PINCH_OK" : "PINCH_CLOSED");

    // 8a. Already drawing (`this.pinchHeld === true`): manage continuous draw & B1.3 release debounce (>= 150 ms).
    let releaseConfirmed = false;
    if (this.pinchHeld) {
      if (pinch.contact && variantAllowedByPreset) {
        let releaseBridgedGapMs: number | null = null;
        if (this.releaseDebounceStartMs !== null) {
          releaseBridgedGapMs = Math.max(0, Math.round(input.nowMs - this.releaseDebounceStartMs));
          this.releaseDebounceStartMs = null;
        }
        this.resetEraseHold();
        this.resetThreeAction();
        this.resetUndoRedoFsm(true);
        const canDraw = !requireRearm || this.armed.draw;
        const res = this.baseResolution(input, r19State, {
          actionIntent: "DRAW",
          actionAccepted: canDraw,
          rejectReason: canDraw ? null : "Tunggu gestur dilepas sebelum aksi baru",
          labelSource: pinch.labelSource,
          fingerCount: pose.fingerCount,
          poseClass: pose.poseClass,
          handPose: "pinch",
          pinchState: pinch.state,
          pinchRatio: pinch.pinchRatio,
          pinchContact: true,
          pinchVariant: activeVariant,
          pinchGate: pinch.gate,
          pinchOnset: "CONFIRMED",
          handState,
          thumbOpen: pose.thumbOpen,
          fingerStates: pose.fingerStates,
          allowDrawMutation: canDraw,
          releaseBridgedGapMs,
          confidence: pinch.confidence,
        });
        this.lastResolution = res;
        return res;
      }

      // Pinch dropped or pose changed while active stroke was open -> B1.3 >= 150 ms release debounce!
      if (this.releaseDebounceStartMs === null) {
        this.releaseDebounceStartMs = input.nowMs;
      }
      const debounceElapsedMs = Math.max(0, input.nowMs - this.releaseDebounceStartMs);
      if (debounceElapsedMs < this.config.releaseDebounceMs) {
        // Still inside debounce window: hold open stroke (no erase/undo sabotage during <150ms OK->FIVE flicker!).
        this.resetEraseHold();
        this.resetThreeAction();
        const res = this.baseResolution(input, r19State, {
          actionIntent: "DRAW",
          actionAccepted: false,
          rejectReason: "Menahan lepas cubit (< 150 ms)",
          labelSource: pinch.labelSource,
          fingerCount: pose.fingerCount,
          poseClass: pose.poseClass,
          handPose: pose.handPose,
          pinchState: pinch.state,
          pinchRatio: pinch.pinchRatio,
          pinchContact: false,
          pinchVariant: this.smoothedVariant,
          pinchGate: pinch.gate,
          pinchOnset: "CONFIRMED",
          handState,
          isSplitPalm: pose.isSplitPalm,
          isThumbUp: pose.isThumbUp,
          thumbOpen: pose.thumbOpen,
          fingerStates: pose.fingerStates,
          allowDrawMutation: false,
          inReleaseDebounce: true,
          confidence: pinch.confidence,
        });
        this.lastResolution = res;
        return res;
      }

      // Debounce elapsed >= 150 ms: release CONFIRMED -> retro-trim & close stroke, then evaluate current pose!
      this.pinchHeld = false;
      this.releaseDebounceStartMs = null;
      this.variantHistory = [];
      this.smoothedVariant = null;
      this.armed.draw = true;
      releaseConfirmed = true;
    }

    // 8b. Not currently drawing: handle pinch onset (B1.2) & reacquire policy (B1.8) & preset filter (B1.7).
    if (pinch.contact) {
      if (!variantAllowedByPreset) {
        this.resetOnset();
        this.resetEraseHold();
        this.resetThreeAction();
        const res = this.baseResolution(input, r19State, {
          actionIntent: "NEUTRAL",
          actionAccepted: false,
          rejectReason:
            activeVariant === "CLOSED"
              ? "Preset aktif hanya mengizinkan cubit OK"
              : "Preset aktif hanya mengizinkan cubit rapat",
          labelSource: pinch.labelSource,
          fingerCount: pose.fingerCount,
          poseClass: pose.poseClass,
          handPose: "pinch",
          pinchState: pinch.state,
          pinchRatio: pinch.pinchRatio,
          pinchContact: true,
          pinchVariant: activeVariant,
          pinchGate: pinch.gate,
          pinchOnset: "NONE",
          handState,
          thumbOpen: pose.thumbOpen,
          fingerStates: pose.fingerStates,
          onsetBlockedReason: "blocked-by-preset-variant",
          releaseConfirmed,
          confidence: pinch.confidence,
        });
        this.lastResolution = res;
        return res;
      }

      // B1.8: Optional `allow-after-confirm` reacquire policy when fresh hand enters already pinching.
      if (requireRearm && !this.armed.draw && this.config.reacquirePinchPolicy === "allow-after-confirm") {
        const refLostMs = this.lastLostAtMs ?? prevTrackedBeforeUpdate;
        const absenceMs = refLostMs === null ? Infinity : input.nowMs - refLostMs;
        const a = validAspect(input.aspect);
        const diagNorm = Math.hypot(a, 1);
        const distNorm =
          refLostTip && curTip
            ? Math.hypot((curTip.x - refLostTip.x) * a, curTip.y - refLostTip.y)
            : Infinity;
        const withinTime = absenceMs >= 0 && absenceMs <= this.config.reacquireMaxGapMs;
        const withinDist = distNorm <= this.config.reacquireMaxDiagShare * diagNorm;
        if (withinTime && withinDist && pinch.gate.passed) {
          this.reacquireConfirmFrames += isUniqueFrame ? 1 : 0;
          if (this.reacquireConfirmFrames >= this.config.reacquireConfirmFrames) {
            this.armed.draw = true;
            this.lastLostAtMs = null;
            this.lastLostTipNorm = null;
          }
        } else {
          this.reacquireConfirmFrames = 0;
        }
      }

      const canDraw = !requireRearm || this.armed.draw;
      if (!canDraw) {
        this.resetOnset();
        this.resetEraseHold();
        this.resetThreeAction();
        const res = this.baseResolution(input, r19State, {
          actionIntent: "DRAW",
          actionAccepted: false,
          rejectReason: "Tunggu gestur dilepas sebelum aksi baru",
          labelSource: pinch.labelSource,
          fingerCount: pose.fingerCount,
          poseClass: pose.poseClass,
          handPose: "pinch",
          pinchState: pinch.state,
          pinchRatio: pinch.pinchRatio,
          pinchContact: true,
          pinchVariant: activeVariant,
          pinchGate: pinch.gate,
          pinchOnset: "NONE",
          handState,
          thumbOpen: pose.thumbOpen,
          fingerStates: pose.fingerStates,
          onsetBlockedReason: "blocked-by-reacquire-policy",
          releaseConfirmed,
          confidence: pinch.confidence,
        });
        this.lastResolution = res;
        return res;
      }

      // B1.2: Onset confirmation (2 consecutive unique frames; OR >= 300 ms time-based if within 400 ms of FIST/ONE/TWO or FSM != NEUTRAL).
      // Latch `onsetGuarded` when pending onset begins within 400 ms of FIST / gateBlocked / non-NEUTRAL Undo-Redo FSM.
      const withinPostFistGuard =
        this.lastFistOneTwoMs !== null &&
        input.nowMs - this.lastFistOneTwoMs <= this.config.postFistOnsetGuardWindowMs;
      const withinLatchedFistGuard =
        this.lastFistOrFsmGuardMs !== null &&
        input.nowMs - this.lastFistOrFsmGuardMs <= this.config.postFistOnsetGuardWindowMs;

      if (this.onsetStartMs === null) {
        this.onsetStartMs = input.nowMs;
        this.onsetConsecutiveFrames = 1;
        this.onsetGuarded = this.undoRedoState !== "NEUTRAL" || withinLatchedFistGuard;
      } else {
        if (isUniqueFrame) this.onsetConsecutiveFrames += 1;
        if (this.undoRedoState !== "NEUTRAL" || withinLatchedFistGuard) {
          this.onsetGuarded = true;
        }
      }
      const guardedOnset = this.onsetGuarded || withinPostFistGuard;
      const waitedMs = Math.max(0, Math.round(input.nowMs - this.onsetStartMs));
      const onsetConfirmed = guardedOnset
        ? waitedMs >= this.config.postFistOnsetHoldMs && this.onsetConsecutiveFrames >= 2
        : this.onsetConsecutiveFrames >= this.config.onsetConfirmFrames;

      if (onsetConfirmed) {
        this.pinchHeld = true;
        this.releaseDebounceStartMs = null;
        this.resetOnset();
        this.resetEraseHold();
        this.resetThreeAction();
        this.resetUndoRedoFsm(true);
        this.lastLostAtMs = null;
        this.lastLostTipNorm = null;
        const res = this.baseResolution(input, r19State, {
          actionIntent: "DRAW",
          actionAccepted: true,
          rejectReason: null,
          labelSource: pinch.labelSource,
          fingerCount: pose.fingerCount,
          poseClass: pose.poseClass,
          handPose: "pinch",
          pinchState: pinch.state,
          pinchRatio: pinch.pinchRatio,
          pinchContact: true,
          pinchVariant: activeVariant,
          pinchGate: pinch.gate,
          pinchOnset: "CONFIRMED",
          handState,
          thumbOpen: pose.thumbOpen,
          fingerStates: pose.fingerStates,
          allowDrawMutation: true,
          onsetConfirmedMeta: { waitedMs, variant: activeVariant },
          releaseConfirmed,
          confidence: pinch.confidence,
        });
        this.lastResolution = res;
        return res;
      }

      // Pending onset: buffer point in LabStrokeDriver without mutating StrokeStore yet!
      this.resetEraseHold();
      this.resetThreeAction();
      const res = this.baseResolution(input, r19State, {
        actionIntent: "NEUTRAL",
        actionAccepted: false,
        rejectReason: guardedOnset
          ? "Konfirmasi cubit setelah kepal (>= 300 ms)..."
          : "Konfirmasi onset cubit...",
        labelSource: pinch.labelSource,
        fingerCount: pose.fingerCount,
        poseClass: pose.poseClass,
        handPose: "pinch",
        pinchState: pinch.state,
        pinchRatio: pinch.pinchRatio,
        pinchContact: true,
        pinchVariant: activeVariant,
        pinchGate: pinch.gate,
        pinchOnset: "PENDING",
        handState,
        thumbOpen: pose.thumbOpen,
        fingerStates: pose.fingerStates,
        allowDrawMutation: false,
        onsetBlockedReason: guardedOnset ? "blocked-by-post-fist-confirm" : null,
        releaseConfirmed: releaseConfirmed || stallClosedOldOps,
        confidence: pinch.confidence,
      });
      this.lastResolution = res;
      return res;
    }

    // Not pinching: clear pending onset.
    this.resetOnset();

    // 8c. FIVE (Erase): only if preset enables `erase: "FIVE"`.
    if (pose.poseClass === "FIVE" && this.presetNow.erase === "FIVE") {
      this.resetThreeAction();
      this.resetUndoRedoFsm(true);
      if (this.eraseStableStartMs === null) {
        this.eraseStableStartMs = input.nowMs;
        this.eraseUniqueFrames = 1;
      } else if (isUniqueFrame) {
        this.eraseUniqueFrames += 1;
      }
      const eraseElapsedMs = input.nowMs - this.eraseStableStartMs;
      const eraseStable =
        this.eraseUniqueFrames >= this.config.minUniqueFrames &&
        eraseElapsedMs >= this.config.eraseStableMs;
      const canErase = eraseStable && (!requireRearm || this.armed.erase);
      const rejectReason = !eraseStable
        ? "Telapak hapus butuh stabil >= 160 ms"
        : !canErase
          ? "Tunggu gestur dilepas sebelum aksi baru"
          : null;
      const res = this.baseResolution(input, r19State, {
        actionIntent: "ERASE",
        actionAccepted: canErase,
        rejectReason,
        labelSource: pose.labelSource,
        fingerCount: 5,
        poseClass: "FIVE",
        handPose: pose.handPose,
        pinchState: pinch.state,
        pinchRatio: pinch.pinchRatio,
        pinchContact: false,
        pinchVariant: null,
        pinchGate: pinch.gate,
        pinchOnset: "NONE",
        handState,
        isSplitPalm: pose.isSplitPalm,
        thumbOpen: true,
        fingerStates: pose.fingerStates,
        allowEraseMutation: canErase,
        releaseConfirmed,
        eraseStable,
        confidence: pose.confidence,
      });
      this.lastResolution = res;
      return res;
    }

    this.resetEraseHold();

    // 8d. K11 THREE_ACTION: only when active preset explicitly configures `three` and variant matches!
    if (
      this.presetNow.three !== null &&
      handState.contact === "OPEN" &&
      handState.threeVariant === this.presetNow.three.variant
    ) {
      this.resetUndoRedoFsm(true);
      if (this.threeStableStartMs === null) {
        this.threeStableStartMs = input.nowMs;
        this.threeUniqueFrames = 1;
      } else if (isUniqueFrame) {
        this.threeUniqueFrames += 1;
      }
      const threeElapsedMs = input.nowMs - this.threeStableStartMs;
      const threeReady =
        !this.threeActionFired &&
        this.threeUniqueFrames >= this.config.minUniqueFrames &&
        threeElapsedMs >= this.config.threeActionStableMs;
      if (threeReady) {
        this.threeActionFired = true;
        const res = this.baseResolution(input, r19State, {
          actionIntent: "THREE_ACTION",
          actionAccepted: true,
          rejectReason: null,
          labelSource: pose.labelSource,
          fingerCount: pose.fingerCount,
          poseClass: pose.poseClass,
          handPose: pose.handPose,
          pinchState: pinch.state,
          pinchRatio: pinch.pinchRatio,
          pinchContact: false,
          pinchVariant: null,
          pinchGate: pinch.gate,
          pinchOnset: "NONE",
          handState,
          thumbOpen: pose.thumbOpen,
          fingerStates: pose.fingerStates,
          fireThreeAction: this.presetNow.three.variant,
          releaseConfirmed,
          confidence: pose.confidence,
        });
        this.lastResolution = res;
        return res;
      }
      const res = this.baseResolution(input, r19State, {
        actionIntent: "NEUTRAL",
        actionAccepted: false,
        rejectReason: this.threeActionFired
          ? `Aksi 3 jari (${this.presetNow.three.variant}) sudah dipicu`
          : `Konfirmasi 3 jari (${this.presetNow.three.variant})...`,
        labelSource: pose.labelSource,
        fingerCount: pose.fingerCount,
        poseClass: pose.poseClass,
        handPose: pose.handPose,
        pinchState: pinch.state,
        pinchRatio: pinch.pinchRatio,
        pinchContact: false,
        pinchVariant: null,
        pinchGate: pinch.gate,
        pinchOnset: "NONE",
        handState,
        thumbOpen: pose.thumbOpen,
        fingerStates: pose.fingerStates,
        releaseConfirmed,
        confidence: pose.confidence,
      });
      this.lastResolution = res;
      return res;
    }

    this.resetThreeAction();

    // 8e. Time-based FIST -> ONE/TWO Undo/Redo FSM (B1.4: G1'-rejected pinch counts as FIST-compatible).
    const fsmPoseClass: CanvasPoseClass = gateBlocked ? "FIST" : pose.poseClass;
    const cmd = this.stepUndoRedoFsm(fsmPoseClass, input.nowMs, isUniqueFrame);

    if (cmd !== null) {
      const res = this.baseResolution(input, r19State, {
        actionIntent: cmd === "undo" ? "UNDO" : "REDO",
        actionAccepted: true,
        rejectReason: null,
        labelSource: pose.labelSource,
        fingerCount: pose.fingerCount,
        poseClass: pose.poseClass,
        handPose: pose.handPose,
        pinchState: pinch.state,
        pinchRatio: pinch.pinchRatio,
        pinchContact: false,
        pinchVariant: null,
        pinchGate: pinch.gate,
        pinchOnset: "NONE",
        handState,
        isSplitPalm: pose.isSplitPalm,
        isThumbUp: pose.isThumbUp,
        thumbOpen: pose.thumbOpen,
        fingerStates: pose.fingerStates,
        fireCommand: cmd,
        releaseConfirmed,
        confidence: pose.confidence,
      });
      this.lastResolution = res;
      return res;
    }

    let rejectReason: string;
    if (gateBlocked) {
      rejectReason = "Ditahan: mirip kepal (G1')";
    } else if (pinch.state === "NEAR" && pose.poseClass !== "FIST") {
      rejectReason = "Cubit belum rapat (near-pinch)";
    } else if (pose.reason === "strict-five-pinch-ok-guard") {
      rejectReason = "Telapak hapus ditahan (jari telunjuk/cubit belum terbuka penuh)";
    } else if (pose.isSplitPalm) {
      rejectReason = "Telapak terbelah belum 5 jari (tidak menghapus)";
    } else if (pose.poseClass === "FIST") {
      rejectReason =
        this.undoRedoState === "ARMED_FIST"
          ? "Kepal siap: angkat 1 jari (Undo) atau 2 jari (Redo)"
          : "Kepal netral";
    } else if (this.undoRedoState === "CONFIRM_ONE") {
      rejectReason = "Konfirmasi Undo (tahan 1 jari)...";
    } else if (this.undoRedoState === "CONFIRM_TWO") {
      rejectReason = "Konfirmasi Redo (tahan 2 jari)...";
    } else if (this.undoRedoState === "FIRED") {
      rejectReason = "Aksi selesai: kepal ulang untuk Undo/Redo berikutnya";
    } else if (pose.poseClass === "ONE" || pose.poseClass === "TWO") {
      rejectReason = "Kepal dulu untuk mengaktifkan Undo/Redo";
    } else {
      rejectReason = "Tidak ada aksi gambar";
    }

    const res = this.baseResolution(input, r19State, {
      actionIntent: "NEUTRAL",
      actionAccepted: false,
      rejectReason,
      labelSource: pose.labelSource,
      fingerCount: pose.fingerCount,
      poseClass: pose.poseClass,
      handPose: pose.handPose,
      pinchState: pinch.state,
      pinchRatio: pinch.pinchRatio,
      pinchContact: false,
      pinchVariant: null,
      pinchGate: pinch.gate,
      pinchOnset: "NONE",
      handState,
      isSplitPalm: pose.isSplitPalm,
      isThumbUp: pose.isThumbUp,
      thumbOpen: pose.thumbOpen,
      fingerStates: pose.fingerStates,
      releaseConfirmed,
      onsetBlockedReason,
      confidence: pose.confidence,
    });
    this.lastResolution = res;
    return res;
  }
}
