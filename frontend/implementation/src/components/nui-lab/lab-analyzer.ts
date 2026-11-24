/**
 * Frame-by-frame analysis for the NUI test page (/nui-lab).
 *
 * R22 Architecture (Contract K3 / §A2 / §B01–B08 / Acceptance IDs C01–C17):
 *  - Route-scoped separation:
 *      * `route: "canvas"` disables Pistol gating (`POINT_READY`/`POINT_PRESS`) completely
 *        (`r19.gateState = "DISABLED_ON_CANVAS"`, `actionResolution.r19State = "DISABLED_ON_CANVAS"`)
 *        and delegates all Canvas decisions (`DRAW`, `ERASE`, `UNDO`, `REDO`, `HOLD_GRACE`, `NEUTRAL`)
 *        to a single `ActionIntentResolver` with ONE `PinchSource` and ONE `PoseSource`.
 *      * `route: "gesture"` keeps R19 G4 Hybrid (`G1 Geometry + MLP + PistolVirtualKeyFSM`) active
 *        for virtual key hold/release/combinations (`LEFT`, `RIGHT`, `UP`, `UP_RIGHT`, `UP_LEFT`)
 *        while exposing accurate 0..5 diagnostic finger counts (including 3 and 4 fingers).
 *  - Single `StrokeStore` authority: `HandStrokePipeline.feedResolved()` mutates `StrokeStore` ONLY
 *    when `ActionIntentResolver` authorizes `allowDrawMutation` or `allowEraseMutation`.
 *  - Short-blink grace: brief `NO_HAND` detector blinks (`<= 240 ms` from loss start, `<= 360 ms` total)
 *    enter `HOLD_GRACE` via `HandStrokePipeline` without resetting `armed.draw` and without drawing
 *    speculative segments; long losses, teleports, owner changes, or 2-hand ambiguity close fail-closed.
 *  - Time-based edge-triggered Canvas Undo/Redo FSM (`FIST -> 1 finger = UNDO`, `FIST -> 2 fingers = REDO`,
 *    zero swipe Undo/Redo).
 */
import type { FaceBox } from "@/src/camera/face-anchor";
import { handSize, isLargeEnough, pickPrimaryHand, type PrimaryHandState } from "@/src/camera/primary-hand";
import {
  DEFAULT_LAB_ASPECT,
  LAB_FOLDED_PINCH_ENTER,
  LAB_FOLDED_PINCH_EXIT,
  LAB_PINCH_ENTER,
  LAB_PINCH_EXIT,
  classifyHandPose,
  countExtendedFingers,
  indexTipNormalized,
  palmCenterNormalized,
  thumbDiagnostics,
  type FingerState,
  type HandPose,
  type ThumbDiagnostics,
} from "@/src/input/hand-gesture";
import type { GestureAction } from "@/src/input/gesture-mode";
import type { HandCursor, PipelineDebug } from "@/src/input/hand-stroke-pipeline";
import {
  ERASER_RADIUS_MAX_PX,
  ERASER_RADIUS_MIN_PX,
  type EraserControl,
} from "@/src/input/eraser";
import { DRAWING_ONE_EURO, PointSmoother } from "@/src/input/smoothing";
import { StrokeStore, type Landmark, type RawStroke } from "@/src/input/types";
import {
  ActionIntentResolver,
  DEFAULT_CANVAS_LOSS_GRACE_MS,
  DEFAULT_CANVAS_MAX_RESUME_GAP_MS,
  EMPTY_HAND_STATE,
  EMPTY_PINCH_GATE,
  GeometricPinchSource,
  GeometricPoseSource,
  type ActionIntent,
  type ActionResolution,
  type ActionResolverConfig,
  type CanvasMechanismPreset,
  type CanvasPoseClass,
  type DiagnosticFingerCount,
  type HandStateReading,
  type LabRoute,
  type LabelSource,
  type PinchContactState,
  type PinchGateResult,
  type PinchOnsetState,
  type PinchSource,
  type PinchVariant,
  type PoseSource,
  type ReacquirePinchPolicy,
  type ThreeVariant,
  type UndoRedoFsmState,
} from "./bench/action-resolver";
import { LabStrokeDriver } from "./bench/lab-stroke-driver";
import { OneEuroPoint2DFilter } from "./bench/one-euro";
import { FullFrameHandLock, type LabLockReason, type LabLockStatus } from "./lab-hand-lock";
import {
  LAB_STILL_SPAN,
  WaveLabSampler,
  isStill,
  jitterStdDevPx,
  percentile,
  r19DirectionText,
  type R19DirectionLabel,
  type R19TelemetryState,
} from "./lab-metrics";
import { classifyHandRoles, type HandRole } from "./lab-roles";
import type { SwipeDebug } from "./lab-swipe";
import {
  STEER_JUMP_DIAGONAL_MAX_DEG,
  STEER_JUMP_DIAGONAL_MIN_DEG,
  STEER_JUMP_STRAIGHT_MAX_DEG,
  STEER_JUMP_STRAIGHT_MIN_DEG,
  STEER_WALK_DEG,
  type SteerZone,
} from "./r19/pistol_types";
import { R19_LABELS, type R19Label } from "./r19/r19_features";
import { R19RuntimePipeline } from "./r19/r19_integrated";
import { validateR19Model } from "./r19/r19_loader";
import type { R19ExportedModel } from "./r19/r19_model";

export {
  ActionIntentResolver,
  GeometricPinchSource,
  GeometricPoseSource,
  type ActionIntent,
  type ActionResolution,
  type ActionResolverConfig,
  type CanvasMechanismPreset,
  type CanvasPoseClass,
  type DiagnosticFingerCount,
  type HandStateReading,
  type LabRoute,
  type LabelSource,
  type PinchContactState,
  type PinchGateResult,
  type PinchOnsetState,
  type PinchSource,
  type PinchVariant,
  type PoseSource,
  type ReacquirePinchPolicy,
  type ThreeVariant,
  type UndoRedoFsmState,
};

/** R22B B1.6: Clear `lastCommand` pill after 1,500 ms or when hand is lost >= 300 ms. */
export const LAST_COMMAND_TTL_MS = 1500;
export const LAST_COMMAND_HAND_LOST_CLEAR_MS = 300;

const INFER_WINDOW_MS = 2000;
const FPS_WINDOW_MS = 1000;
/** Window for the jitter meter; long enough to see tremor, short enough to follow a hand that stops. */
const JITTER_WINDOW_MS = 1500;
/**
 * Fewer points than this is not enough to call a hand still. At the gate's 8 Hz floor the 1.5 s window holds
 * about 12 samples, so the minimum must stay below that or the meter would never show at a slow detector.
 */
const JITTER_MIN_SAMPLES = 10;
/** Jitter is shown in px of a canvas this wide (the same scale the page draws at). */
const JITTER_CANVAS_PX = 400;
const INK_SIZE = { width: 1280, height: 720 };
const DEFAULT_LAB_ERASER_CSS_PX = 24;
const LAB_ERASER_CANVAS_SCALE = 2; // 24 CSS px -> 48 canvas px on 1280x720 scratch canvas (R23-HF2 x1.5 radius)

export interface LabAnalyzerOptions {
  /** Active NUI Lab route: `"canvas"` disables pistol gating; `"gesture"` runs PistolVirtualKeyFSM. */
  route?: LabRoute;
  fullFrameLock?: boolean;
  enableInk?: boolean;
  /** Short detector blink grace window in ms (measured from first lost frame). Default: 240 ms. */
  lossGraceMs?: number;
  /** Maximum total unobserved gap (`nowMs - lastTrackedMs`) allowed to resume an open stroke. Default: 360 ms. */
  maxResumeGapMs?: number;
  /** Maximum canvas-width share jump allowed to resume an open stroke after a short blink. Default: 0.12. */
  maxResumeJumpShare?: number;
  /** Optional cursor smoothing mode kept strictly independent from ink smoothing (C15). */
  cursorFilterMode?: "default" | "one-euro";
  /** Optional single PinchSource override (Contract K3 / §A2). */
  pinchSource?: PinchSource;
  /** Optional single PoseSource override (Contract K3 / §A2). */
  poseSource?: PoseSource;
  /** Optional ActionIntentResolver timing overrides. */
  resolverConfig?: Partial<ActionResolverConfig>;
  /** R22B B1.7: Optional initial K11 Canvas mechanism preset (default `"default-any-pinch"`). */
  preset?: CanvasMechanismPreset | string;
  /** R22B B1.8: Optional reacquire pinch policy flag (default `"require-release"`). */
  reacquirePinchPolicy?: ReacquirePinchPolicy;
  /**
   * Enable secondary-hand eraser radius resizing while primary owner is actively erasing (B07/C16).
   * Secondary hand NEVER draws, erases on its own, fires commands, or hijacks primary ownership.
   * Default: `true`.
   */
  enableSecondaryEraserResize?: boolean;

}

export interface LabDetection {
  /** Landmarks of every hand in this frame (MediaPipe result.landmarks). */
  landmarks: Landmark[][];
  /** Time the detectForVideo call took, in ms. */
  inferMs: number;
  /** Clock time when the frame was analysed (performance.now()). */
  nowMs: number;
  /** The player's face in this frame, if one is in view. Without it the plain hand rule applies. */
  face?: FaceBox | null;
  /** Video width / height. The lab measures pinch gaps and the thumb in true image proportions with it. */
  aspect?: number;
  /** Contract K1 unique camera frame ID (prevents duplicate-rAF frames from advancing FSM timers). */
  captureFrameId?: number;
  /** Contract K1/K2 frame age in ms; frames above stale threshold (150 ms) do not mutate StrokeStore (C15). */
  frameAgeMs?: number;
  /** Contract K1/K2 explicit stale flag (C15/W08). */
  isStale?: boolean;
  /** Contract K2 worker owner-track ambiguity hold signal (W05/C13). */
  ambiguousHold?: boolean;
}

/** Last Undo/Redo that really ran in the lab, with what the store said. HUD mapping alone proves nothing. */
export interface LabCommandResult {
  kind: "undo" | "redo";
  /** What store.undo() / store.redo() returned: false = nothing to undo/redo (a no-op, not a success). */
  changed: boolean;
  atMs: number;
  via: "fist-transition" | "pose-hold" | "swipe";
}

export type WaveStatus = "idle" | "running" | "done";
export type R19ModelState = "unloaded" | "loading" | "ready" | "error";
export type R19VirtualKeyEvent = "KEYDOWN" | "HELD" | "KEYUP" | "RELEASE_ALL" | "NONE";
export type R19GateState = R19TelemetryState | "DISABLED_ON_CANVAS";

export interface LabR19Probs {
  ready: number;
  press: number;
  other: number;
}

export interface LabR19VirtualKey {
  event: R19VirtualKeyEvent;
  fsmState: string;
  zone: string;
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpFiredThisFrame: boolean;
  jumpPulseActive: boolean;
  releaseReason: string | null;
  keydowns: number;
  heldFrames: number;
  keyups: number;
  jumps: number;
  releaseAlls: number;
}

export interface LabR19Fingers {
  count: DiagnosticFingerCount;
  thumbOpen: boolean;
  index: FingerState;
  middle: FingerState;
  ring: FingerState;
  pinky: FingerState;
}

export interface LabR19Guards {
  pinchActive: boolean;
  eraseActive: boolean;
  swipeAction: "undo" | "redo" | null;
  isPinch: boolean;
  isThumbUp: boolean;
}

export interface LabR19Telemetry {
  state: R19TelemetryState;
  /** Contract K3: `"DISABLED_ON_CANVAS"` on Canvas route; mirrors `state` on Gesture route. */
  gateState: R19GateState;
  subClass: string;
  reason: string;
  topLabel: R19Label | "NONE";
  probs: LabR19Probs | null;
  angleDeg: number | null;
  directionLabel: R19DirectionLabel;
  directionDisplay: string;
  virtualKey: LabR19VirtualKey;
  fingers: LabR19Fingers | null;
  guards: LabR19Guards;
  ms: number | null;
}

export interface LabSnapshot {
  route: LabRoute;
  handCount: number;
  /** Hands below MIN_HAND_SIZE: too far away to be the player. */
  farHandCount: number;
  primaryIndex: number | null;
  /** Larger side of the primary hand's box, 0..1 of the frame. */
  primarySize: number | null;
  pose: HandPose;
  inferP50: number | null;
  inferP95: number | null;
  /** Detections in the last second. */
  detectFps: number;
  still: boolean;
  /** Std dev of the raw index tip while still, in px of a 400 px canvas. */
  rawJitterPx: number | null;
  /** Same for the smoothed ink point (the drawing's smoother). */
  inkJitterPx: number | null;
  wave: { status: WaveStatus; progress: number; elapsedMs: number | null; reversals: number };
  /** The player's face box, or null when none is in view. */
  face: FaceBox | null;
  /** Why each hand was used or rejected, in the order MediaPipe reported them. */
  handRoles: HandRole[];
  /** Live cursor uses the same coordinates and state as DrawingSurface. */
  cursor: HandCursor | null;
  fingerCount: DiagnosticFingerCount;
  drawingAction: GestureAction | null;
  lockStatus: LabLockStatus;
  lockReason: LabLockReason | null;
  acquisitionId: number;
  pinchRatio: number | null;
  pinchEnter: number;
  pinchExit: number;
  foldedPinchEnter: number;
  foldedPinchExit: number;
  fingerStates: FingerState[] | null;
  inkAllowed: boolean;
  rejectionReason: string;
  /** Contract K3 / K3.1 / K4 v1.1 / K11 canonical action decision fields. */
  actionIntent: ActionIntent;
  actionAccepted: boolean;
  actionRejectedReason: string | null;
  labelSource: LabelSource;
  undoRedoFsmState: UndoRedoFsmState;
  actionResolution: ActionResolution;
  pinchGate: PinchGateResult;
  handState: HandStateReading;
  presetId: string;
  /** Last known cursor in canvas px (for B2.8 shadow cursor when hand is lost > 600 ms). */
  lastCursor: { x: number; y: number } | null;
  /** Elapsed ms since hand disappeared (0 when tracked). */
  handLostDurationMs: number;
  /** Points backfilled on the frame onset confirmed (B1.2). */
  lastBackfilledPoints: number;
  /** Points retro-trimmed on confirmed release debounce (B1.3). */
  lastRetroTrimmedPoints: number;
  /** Count of K11 THREE_ACTION triggers in this session. */
  threeActionCount: number;
  /** Active scratch-canvas eraser radius in canvas px (B07/C16 audit). */
  eraserRadiusCanvasPx: number;
  classifierMode: "r19-g4-hybrid";
  modelState: R19ModelState;
  modelError: string | null;
  r19: LabR19Telemetry;
  /** Developer diagnostics. Numbers only: no camera frames, no identity. */
  diag: LabDiagnostics;
}

export interface LabDiagnostics {
  /** Aspect the lab used for geometry (video width / height). */
  aspect: number;
  /** Pose of the primary hand this frame, mapped cleanly with single-source R22 geometry. */
  rawPose: HandPose;
  /** Pose after the 3-of-5 vote in the ink pipeline: what the actions follow. */
  stablePose: HandPose;
  /** Extended fingers 0..5 under aspect-corrected geometry (thumb included). */
  rawFingerCount: DiagnosticFingerCount;
  /** Count under the legacy thumb ratio, for the same frame. */
  legacyFingerCount: number;
  thumb: ThumbDiagnostics | null;
  armed: { draw: boolean; erase: boolean; commands: boolean };
  fiveFingerValid: boolean;
  /** Short honest status for the Hapus path, or null when no palm is involved. */
  handStatus: string | null;
  pipeline: PipelineDebug | null;
  strokes: { completed: number; activePoints: number };
  /** Undo/Redo that ran, with the store's answer. */
  lastCommand: LabCommandResult | null;
  commandCount: number;
  commandMode: "fist-transition" | "swipe";
  undoRedoFsmState: UndoRedoFsmState;
  pinchState: PinchContactState;
  poseClass: CanvasPoseClass;
  inLossGrace: boolean;
  swipe: SwipeDebug | null;
}

interface Timed<T> {
  t: number;
  v: T;
}

type R19StepResult = ReturnType<R19RuntimePipeline["step"]>;

const recent = <T>(items: Timed<T>[], nowMs: number, windowMs: number): T[] =>
  items.filter((s) => nowMs - s.t >= 0 && nowMs - s.t <= windowMs).map((s) => s.v);

function directionFromAngle(angleDeg: number | null): R19DirectionLabel {
  if (angleDeg === null || !Number.isFinite(angleDeg)) return "NEUTRAL";
  const a = Math.abs(angleDeg);
  if (a < STEER_WALK_DEG) return "RIGHT";
  if (a > 180 - STEER_WALK_DEG) return "LEFT";
  if (angleDeg >= STEER_JUMP_STRAIGHT_MIN_DEG && angleDeg <= STEER_JUMP_STRAIGHT_MAX_DEG) return "UP";
  if (angleDeg >= STEER_JUMP_DIAGONAL_MIN_DEG && angleDeg < STEER_JUMP_STRAIGHT_MIN_DEG) return "UP_RIGHT";
  if (angleDeg > STEER_JUMP_STRAIGHT_MAX_DEG && angleDeg <= STEER_JUMP_DIAGONAL_MAX_DEG) return "UP_LEFT";
  if (angleDeg < -STEER_WALK_DEG && angleDeg > -(180 - STEER_WALK_DEG)) return "DOWN";
  return "NEUTRAL";
}

function directionFromZone(zone: SteerZone): R19DirectionLabel | null {
  switch (zone) {
    case "walk-right":
      return "RIGHT";
    case "walk-left":
      return "LEFT";
    case "jump":
      return "UP";
    case "jump-right":
      return "UP_RIGHT";
    case "jump-left":
      return "UP_LEFT";
    case "stop":
      return null;
  }
}

function resolveDirectionLabel(
  state: R19TelemetryState,
  zone: SteerZone,
  angleDeg: number | null,
): R19DirectionLabel {
  if (state === "POINT_PRESS") {
    const activeDir = directionFromZone(zone);
    if (activeDir) return activeDir;
    return directionFromAngle(angleDeg);
  }
  if (state === "POINT_READY") {
    return directionFromAngle(angleDeg);
  }
  return "NEUTRAL";
}

function mapProbs(probs: number[] | null, labels: string[]): LabR19Probs | null {
  if (!probs) return null;
  const idx = (target: R19Label): number => {
    const i = labels.indexOf(target);
    return i >= 0 ? i : R19_LABELS.indexOf(target);
  };
  return {
    ready: probs[idx("POINT_READY")] ?? 0,
    press: probs[idx("POINT_PRESS")] ?? 0,
    other: probs[idx("OTHER")] ?? 0,
  };
}

function emptyR19Telemetry(
  subClass: string,
  reason: string,
  vkey: LabR19VirtualKey,
  gateState: R19GateState = "NO_HAND",
): LabR19Telemetry {
  return {
    state: "NO_HAND",
    gateState,
    subClass,
    reason,
    topLabel: "NONE",
    probs: null,
    angleDeg: null,
    directionLabel: "NEUTRAL",
    directionDisplay: r19DirectionText("NEUTRAL"),
    virtualKey: { ...vkey },
    fingers: null,
    guards: {
      pinchActive: false,
      eraseActive: false,
      swipeAction: null,
      isPinch: false,
      isThumbUp: false,
    },
    ms: null,
  };
}

function emptyResolution(route: LabRoute, reason: string | null, nowMs = 0, presetId = "default-any-pinch"): ActionResolution {
  return {
    route,
    actionIntent: "NEUTRAL",
    actionAccepted: false,
    rejectReason: reason,
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
    presetId,
    isSplitPalm: false,
    isThumbUp: false,
    thumbOpen: false,
    fingerStates: null,
    undoRedoFsmState: "NEUTRAL",
    r19State: route === "canvas" ? "DISABLED_ON_CANVAS" : "ACTIVE_ON_GESTURE",
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
    armed: { draw: false, erase: false, commands: false },
    confidence: 0,
    captureFrameId: null,
    timestampMs: nowMs,
  };
}

export class LabAnalyzer {
  private readonly routeNow: LabRoute;
  private readonly strictCanvasRoute: boolean;
  private readonly inkEnabled: boolean;
  private readonly resolver: ActionIntentResolver;
  private readonly cursorOneEuro: OneEuroPoint2DFilter | null;
  private eraserRadiusCss = DEFAULT_LAB_ERASER_CSS_PX;
  private readonly labEraser: EraserControl;
  private readonly ink: LabStrokeDriver;

  private inferSamples: Timed<number>[] = [];
  private detectTimes: number[] = [];
  private primary: PrimaryHandState | null = null;
  private hands: Landmark[][] = [];
  private primaryIdx: number | null = null;
  private primarySizeNow: number | null = null;
  private face: FaceBox | null = null;
  private roles: HandRole[] = [];
  private pose: HandPose = "none";
  private rawTips: Timed<{ x: number; y: number }>[] = [];
  private inkTips: Timed<{ x: number; y: number }>[] = [];
  private readonly inkSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);
  private readonly sampler = new WaveLabSampler();
  private waveStatus: WaveStatus = "idle";
  private readonly store = Object.assign(new StrokeStore(), { eraseSegments: true });
  private readonly fullLock = new FullFrameHandLock();
  private liveCursor: HandCursor | null = null;
  private fingerCountNow: DiagnosticFingerCount = 0;
  private drawingActionNow: GestureAction | null = null;
  private pinchRatioNow: number | null = null;
  private fingerStatesNow: FingerState[] | null = null;
  private rejectNow = "Model R19 belum siap";
  private inkPermitted = false;
  private lastAcquisition = 0;
  private armed = { draw: false, erase: false, commands: false };
  private aspect = DEFAULT_LAB_ASPECT;
  private lastCommand: LabCommandResult | null = null;
  private commandCount = 0;
  private threeActionCount = 0;
  private handLostSinceMs: number | null = null;
  private lastBackfilledPoints = 0;
  private lastRetroTrimmedPoints = 0;
  private thumbNow: ThumbDiagnostics | null = null;
  private legacyCountNow = 0;
  private handStatusNow: string | null = null;
  private resolutionNow: ActionResolution;

  private r19StatusNow: R19ModelState = "unloaded";
  private r19ErrorNow: string | null = null;
  private r19Model: R19ExportedModel | null = null;
  private r19Pipeline: R19RuntimePipeline | null = null;
  private r19Aspect = 0;
  private r19HadKeysPressed = false;
  private r19Stats = { keydowns: 0, heldFrames: 0, keyups: 0, jumps: 0, releaseAlls: 0 };
  private r19TelemetryNow: LabR19Telemetry;

  constructor(private readonly options: LabAnalyzerOptions = {}) {
    this.routeNow = options.route ?? (options.enableInk === false ? "gesture" : "canvas");
    this.strictCanvasRoute = options.route === "canvas";
    this.inkEnabled = options.enableInk !== undefined ? options.enableInk : this.routeNow === "canvas";

    const lossGraceMs = options.lossGraceMs ?? DEFAULT_CANVAS_LOSS_GRACE_MS;
    const maxResumeGapMs = options.maxResumeGapMs ?? DEFAULT_CANVAS_MAX_RESUME_GAP_MS;
    const initialPresetId =
      typeof options.preset === "string"
        ? options.preset
        : options.preset?.id ?? options.resolverConfig?.presetId;

    this.resolver = new ActionIntentResolver({
      pinchSource: options.pinchSource,
      poseSource: options.poseSource,
      preset: typeof options.preset === "object" ? options.preset : undefined,
      config: {
        lossGraceMs,
        maxResumeGapMs,
        ...(initialPresetId ? { presetId: initialPresetId } : {}),
        ...(options.reacquirePinchPolicy ? { reacquirePinchPolicy: options.reacquirePinchPolicy } : {}),
        ...(options.resolverConfig ?? {}),
      },
    });

    this.cursorOneEuro = options.cursorFilterMode === "one-euro" ? new OneEuroPoint2DFilter() : null;
    const allowResize = options.enableSecondaryEraserResize !== false;
    this.labEraser = {
      radiusCanvasPx: () => Math.round(this.eraserRadiusCss * LAB_ERASER_CANVAS_SCALE),
      radiusCss: () => this.eraserRadiusCss,
      setRadiusCss: (px: number) => {
        if (!allowResize || !Number.isFinite(px)) return;
        this.eraserRadiusCss = Math.max(ERASER_RADIUS_MIN_PX, Math.min(ERASER_RADIUS_MAX_PX, px));
      },
      isFixed: () => !allowResize,
    };

    const cursorFilterAdapter = this.cursorOneEuro
      ? {
          smooth: (p: { x: number; y: number }, nowMs: number) =>
            this.cursorOneEuro!.filter(p, nowMs, {
              tracked: true,
              ownerTrackId: this.lastAcquisition,
            }) ?? p,
          reset: () => this.cursorOneEuro!.reset(),
        }
      : undefined;

    this.ink = new LabStrokeDriver({
      store: this.store,
      size: () => INK_SIZE,
      eraser: this.labEraser,
      lossGraceMs,
      maxResumeGapMs,
      maxResumeJumpShare: options.maxResumeJumpShare,
      cursorSmoother: cursorFilterAdapter,
    });

    this.resolutionNow = emptyResolution(this.routeNow, this.rejectNow, 0, this.resolver.preset.id);
    this.r19TelemetryNow = emptyR19Telemetry(
      "model-not-ready",
      this.rejectNow,
      this.buildVirtualKey("NONE", "NO_HAND", "stop", false, false, false, false, false, null),
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  get route(): LabRoute {
    return this.routeNow;
  }

  get preset(): CanvasMechanismPreset {
    return this.resolver.preset;
  }

  setPreset(presetOrId: CanvasMechanismPreset | string): void {
    this.resolver.setPreset(presetOrId);
  }

  setReacquirePinchPolicy(policy: ReacquirePinchPolicy): void {
    this.resolver.setReacquirePinchPolicy(policy);
  }

  private expireLastCommandIfNeeded(nowMs: number): void {
    if (!this.lastCommand) return;
    const expiredByTtl = nowMs - this.lastCommand.atMs >= LAST_COMMAND_TTL_MS;
    const expiredByHandLoss =
      this.handLostSinceMs !== null && nowMs - this.handLostSinceMs >= LAST_COMMAND_HAND_LOST_CLEAR_MS;
    if (expiredByTtl || expiredByHandLoss) {
      this.lastCommand = null;
    }
  }

  get r19Status(): R19ModelState {
    return this.r19StatusNow;
  }

  get r19Error(): string | null {
    return this.r19ErrorNow;
  }

  setR19Loading(): void {
    const nowMs = performance.now();
    this.releaseAllInternal("model-loading", nowMs, false);
    this.r19StatusNow = "loading";
    this.r19ErrorNow = null;
    this.rejectNow = "Model R19 belum siap";
    this.resolutionNow = emptyResolution(this.routeNow, this.rejectNow, nowMs, this.resolver.preset.id);
    this.r19TelemetryNow = emptyR19Telemetry(
      "model-not-ready",
      this.rejectNow,
      this.r19TelemetryNow.virtualKey,
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  enableR19(model: R19ExportedModel, nowMs: number): void {
    try {
      const validated = validateR19Model(model);
      this.r19Pipeline = new R19RuntimePipeline(validated, this.aspect);
      this.r19Model = validated;
      this.r19Aspect = this.aspect;
      this.r19StatusNow = "ready";
      this.r19ErrorNow = null;
      this.releaseAllInternal("model-ready-reset", nowMs, false);
      this.rejectNow = "Tangan belum aktif";
      this.resolutionNow = emptyResolution(this.routeNow, this.rejectNow, nowMs, this.resolver.preset.id);
      this.r19TelemetryNow = emptyR19Telemetry(
        "no-hand",
        "no-hand",
        this.r19TelemetryNow.virtualKey,
        this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.failR19(message, nowMs);
      throw err;
    }
  }

  failR19(reason: string, nowMs: number): void {
    const message = reason.trim().length > 0 ? reason : "Model R19 gagal dimuat";
    this.r19StatusNow = "error";
    this.r19ErrorNow = message;
    this.r19Pipeline = null;
    this.r19Model = null;
    this.r19Aspect = 0;
    this.releaseAllInternal(message, nowMs, false);
    this.rejectNow = message;
    this.resolutionNow = emptyResolution(this.routeNow, message, nowMs, this.resolver.preset.id);
    this.r19TelemetryNow = emptyR19Telemetry(
      "model-error",
      message,
      this.r19TelemetryNow.virtualKey,
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  /** Immediately release all virtual keys and clear armed/ink state. */
  releaseAll(reason: string, nowMs = performance.now()): void {
    const cleanReason = reason.trim().length > 0 ? reason : "release-all";
    this.releaseAllInternal(cleanReason, nowMs, true);
    this.resolutionNow = emptyResolution(this.routeNow, cleanReason, nowMs, this.resolver.preset.id);
    this.r19TelemetryNow = emptyR19Telemetry(
      cleanReason,
      cleanReason,
      this.r19TelemetryNow.virtualKey,
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  onPhaseChange(): void {
    const hadKeys = this.r19HadKeysPressed;
    this.r19HadKeysPressed = false;
    this.r19Pipeline?.onPhaseChange();
    const event: R19VirtualKeyEvent = hadKeys ? "RELEASE_ALL" : "NONE";
    if (hadKeys) this.r19Stats.releaseAlls += 1;
    const vkey = this.buildVirtualKey(
      event,
      "RELEASED_WAIT_REARM",
      "stop",
      false,
      false,
      false,
      false,
      false,
      hadKeys ? "phase-change" : null,
    );
    this.r19TelemetryNow = {
      ...this.r19TelemetryNow,
      virtualKey: vkey,
    };
  }

  notifyJumpConsumed(): void {
    this.r19Pipeline?.notifyJumpConsumed();
  }

  private buildVirtualKey(
    event: R19VirtualKeyEvent,
    fsmState: string,
    zone: string,
    left: boolean,
    right: boolean,
    jump: boolean,
    jumpFiredThisFrame: boolean,
    jumpPulseActive: boolean,
    releaseReason: string | null,
  ): LabR19VirtualKey {
    return {
      event,
      fsmState,
      zone,
      left,
      right,
      jump,
      jumpFiredThisFrame,
      jumpPulseActive,
      releaseReason,
      keydowns: this.r19Stats.keydowns,
      heldFrames: this.r19Stats.heldFrames,
      keyups: this.r19Stats.keyups,
      jumps: this.r19Stats.jumps,
      releaseAlls: this.r19Stats.releaseAlls,
    };
  }

  private releaseAllInternal(reason: string, nowMs: number, forceEvent: boolean): void {
    const hadKeys = this.r19HadKeysPressed;
    const emitReleaseAll = !this.strictCanvasRoute && (hadKeys || forceEvent);
    this.r19HadKeysPressed = false;
    this.r19Pipeline?.reset();
    this.resolver.reset();
    this.ink.reset(nowMs);
    this.armed = { draw: false, erase: false, commands: false };
    this.liveCursor = null;
    this.drawingActionNow = null;
    this.inkPermitted = false;
    this.fingerCountNow = 0;
    this.legacyCountNow = 0;
    this.fingerStatesNow = null;
    this.pinchRatioNow = null;
    this.thumbNow = null;
    this.handStatusNow = null;
    this.pose = "none";
    this.rawTips = [];
    this.inkTips = [];
    this.inkSmoother.reset();
    this.cursorOneEuro?.reset();
    if (emitReleaseAll) this.r19Stats.releaseAlls += 1;
    const event: R19VirtualKeyEvent = emitReleaseAll ? "RELEASE_ALL" : "NONE";
    const vkey = this.buildVirtualKey(
      event,
      "NO_HAND",
      "stop",
      false,
      false,
      false,
      false,
      false,
      emitReleaseAll ? reason : null,
    );
    this.r19TelemetryNow = emptyR19Telemetry(
      reason,
      reason,
      vkey,
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  /**
   * Release only Gesture virtual keys on hand loss (zero stuck keys) without clobbering
   * Canvas short-blink grace or `armed.draw`.
   */
  private releaseVirtualKeysOnly(reason: string): LabR19VirtualKey {
    const hadKeys = this.r19HadKeysPressed;
    this.r19HadKeysPressed = false;
    this.r19Pipeline?.reset();
    const emitReleaseAll = !this.strictCanvasRoute && hadKeys;
    if (emitReleaseAll) this.r19Stats.releaseAlls += 1;
    const event: R19VirtualKeyEvent = emitReleaseAll ? "RELEASE_ALL" : "NONE";
    return this.buildVirtualKey(
      event,
      "NO_HAND",
      "stop",
      false,
      false,
      false,
      false,
      false,
      emitReleaseAll ? reason : null,
    );
  }

  private findSecondaryHand(landmarks: Landmark[][], primaryIdx: number): Landmark[] | null {
    for (let i = 0; i < landmarks.length; i++) {
      if (i === primaryIdx) continue;
      if (this.roles[i] !== "other") continue;
      const h = landmarks[i];
      if (h && h.length >= 21 && isLargeEnough(h)) return h;
    }
    return null;
  }

  analyse({
    landmarks,
    inferMs,
    nowMs,
    face = null,
    aspect,
    captureFrameId,
    frameAgeMs,
    isStale,
    ambiguousHold,
  }: LabDetection): void {
    if (typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0) this.aspect = aspect;
    this.inferSamples.push({ t: nowMs, v: inferMs });
    this.detectTimes.push(nowMs);
    this.hands = landmarks;
    this.face = face;

    const strict = this.options.fullFrameLock === true;
    const pick = strict
      ? this.fullLock.pick(landmarks, nowMs)
      : pickPrimaryHand(landmarks, this.primary, nowMs, face);
    if (!strict) this.primary = (pick as ReturnType<typeof pickPrimaryHand>).state;
    this.primaryIdx = pick.index;

    // The full-frame lab intentionally ignores the face-region gate. Other hands are never promoted automatically.
    this.roles = strict
      ? landmarks.map((h, i): HandRole => (!isLargeEnough(h) ? "far" : i === pick.index ? "primary" : "other"))
      : classifyHandRoles(landmarks, pick.index, face);

    const lm = pick.index === null ? undefined : landmarks[pick.index];
    const isAmbiguous = Boolean(ambiguousHold) || (strict && this.fullLock.status === "ambiguous");
    const acquisitionId = strict ? this.fullLock.acquisitionId : 0;
    const frameIsStale =
      isStale === true ||
      (typeof frameAgeMs === "number" &&
        Number.isFinite(frameAgeMs) &&
        frameAgeMs > this.resolver.config.staleFrameMs);

    // 1. Fail-closed: if the R19 model is not ready, refuse all gestures/ink/virtual keys with zero fallback.
    if (this.r19StatusNow !== "ready" || !this.r19Model) {
      this.primarySizeNow = lm ? handSize(lm) : null;
      const reason = this.r19ErrorNow ?? "Model R19 belum siap";
      this.releaseAllInternal(reason, nowMs, false);
      this.rejectNow = reason;
      this.resolutionNow = this.resolver.resolve({
        route: this.routeNow,
        landmarks: undefined,
        aspect: this.aspect,
        nowMs,
        captureFrameId,
        frameAgeMs,
        isStale,
        ownerLocked: false,
        ambiguousHold: false,
        lockReason: reason,
        acquisitionId,
        modelReady: false,
        modelNotReadyReason: reason,
        hasActiveStroke: this.store.hasActiveStroke(),
        isErasing: this.store.isErasing(),
        requireFreshHandRearm: strict,
      });
      this.r19TelemetryNow = emptyR19Telemetry(
        "model-not-ready",
        reason,
        this.r19TelemetryNow.virtualKey,
        this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
      );
      this.feedWave(null, nowMs);
      return;
    }

    // 2. Hand missing, unlocked, or two-hand ambiguous:
    //    - Gesture virtual keys ALWAYS release immediately (zero stuck keys).
    //    - Canvas enters short-blink grace (`LabStrokeDriver.feed`) WITHOUT wiping `armed.draw`!
    //    - Long loss / empty-reset / ambiguity / unmatched-hand closes strokes fail-closed!
    if (!lm || isAmbiguous) {
      if (this.handLostSinceMs === null) this.handLostSinceMs = nowMs;
      this.expireLastCommandIfNeeded(nowMs);
      this.lastBackfilledPoints = 0;
      this.lastRetroTrimmedPoints = 0;
      this.primarySizeNow = null;
      const lossReason = isAmbiguous
        ? strict && this.fullLock.status === "ambiguous"
          ? this.fullLock.reason
          : "ambiguous-hands"
        : strict
          ? this.fullLock.reason
          : "no-hand";

      const vkey = this.releaseVirtualKeysOnly(lossReason);
      const resolution = this.resolver.resolve({
        route: this.routeNow,
        landmarks: undefined,
        aspect: this.aspect,
        nowMs,
        captureFrameId,
        frameAgeMs,
        isStale,
        ownerLocked: false,
        ambiguousHold: isAmbiguous,
        lockReason: lossReason,
        acquisitionId,
        modelReady: true,
        hasActiveStroke: this.store.hasActiveStroke(),
        isErasing: this.store.isErasing(),
        requireFreshHandRearm: strict,
      });
      this.resolutionNow = resolution;
      this.armed = { ...resolution.armed };

      if (this.inkEnabled) {
        const inkFrame = this.ink.feed({
          landmarks: undefined,
          pose: "none",
          fingerCount: 0,
          pinchRatio: null,
          pinchOnset: "NONE",
          allowDraw: false,
          inReleaseDebounce: false,
          releaseBridged: false,
          releaseConfirmed: false,
          allowErase: resolution.allowEraseMutation,
          inLossGrace: resolution.inLossGrace,
          shouldEndOpenOps: resolution.shouldEndOpenOps,
          isStale: frameIsStale,
          nowMs,
        });
        this.lastRetroTrimmedPoints = inkFrame.retroTrimmedPoints;
      }

      if (!resolution.inLossGrace) {
        this.rawTips = [];
        this.inkTips = [];
        this.inkSmoother.reset();
        this.cursorOneEuro?.reset();
      }
      this.liveCursor = null;
      this.drawingActionNow = null;
      this.inkPermitted = false;
      this.fingerCountNow = 0;
      this.legacyCountNow = 0;
      this.fingerStatesNow = null;
      this.pinchRatioNow = null;
      this.thumbNow = null;
      this.handStatusNow = null;
      this.pose = "none";
      this.rejectNow = resolution.inLossGrace
        ? (resolution.rejectReason ?? "Jeda singkat deteksi (menahan goresan)")
        : strict
          ? this.fullLock.reason
          : "Tangan tidak ditemukan";
      this.r19TelemetryNow = emptyR19Telemetry(
        lossReason,
        lossReason,
        vkey,
        this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
      );
      this.feedWave(null, nowMs);
      return;
    }

    // 3. Valid locked owner hand! Handle brand-new acquisition (ONLY when acquisitionId actually changes).
    this.handLostSinceMs = null;
    this.expireLastCommandIfNeeded(nowMs);
    this.lastBackfilledPoints = 0;
    this.lastRetroTrimmedPoints = 0;
    this.primarySizeNow = handSize(lm);
    if (strict && acquisitionId !== this.lastAcquisition) {
      this.lastAcquisition = acquisitionId;
      this.releaseAllInternal("new-acquisition", nowMs, false);
    }

    // 4. Resolve canonical K3 action via the SINGLE ActionIntentResolver (ONE PinchSource + ONE PoseSource).
    const resolution = this.resolver.resolve({
      route: this.routeNow,
      landmarks: lm,
      aspect: this.aspect,
      nowMs,
      captureFrameId,
      frameAgeMs,
      isStale,
      ownerLocked: true,
      ambiguousHold: false,
      lockReason: null,
      acquisitionId,
      modelReady: true,
      hasActiveStroke: this.store.hasActiveStroke(),
      isErasing: this.store.isErasing(),
      requireFreshHandRearm: strict,
    });
    this.resolutionNow = resolution;
    this.armed = { ...resolution.armed };
    this.fingerCountNow = resolution.fingerCount;
    this.fingerStatesNow = resolution.fingerStates ? [...resolution.fingerStates] : null;
    this.pinchRatioNow = resolution.pinchRatio;
    this.legacyCountNow = countExtendedFingers(lm);
    this.thumbNow = thumbDiagnostics(lm, this.aspect);

    // 5. Pistol Classifier & Virtual Key FSM:
    //    - On `route === "canvas"`: DISABLED (`r19.state = "OTHER"`, `r19.gateState = "DISABLED_ON_CANVAS"`,
    //      virtual keys always OFF; NEVER blocks or ends a canvas stroke!).
    //    - On `route === "gesture"` (or legacy hybrid test without explicit `route: "canvas"`):
    //      R19 G4 Hybrid + PistolVirtualKeyFSM runs for Gesture Lab virtual keys,
    //      still NEVER gating or closing Canvas ink!
    let r19State: R19TelemetryState = "OTHER";
    let r19GateState: R19GateState = this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "OTHER";

    if (this.strictCanvasRoute) {
      this.r19HadKeysPressed = false;
      const vkey = this.buildVirtualKey("NONE", "DISABLED_ON_CANVAS", "stop", false, false, false, false, false, null);
      this.pose = resolution.handPose;
      this.r19TelemetryNow = {
        state: "OTHER",
        gateState: "DISABLED_ON_CANVAS",
        subClass: resolution.pinchContact
          ? "pinch"
          : resolution.isThumbUp
            ? "thumb-up"
            : resolution.poseClass.toLowerCase(),
        reason: "disabled-on-canvas",
        topLabel: "OTHER",
        probs: null,
        angleDeg: null,
        directionLabel: "NEUTRAL",
        directionDisplay: r19DirectionText("NEUTRAL"),
        virtualKey: vkey,
        fingers: resolution.fingerStates
          ? {
              count: resolution.fingerCount,
              thumbOpen: resolution.thumbOpen,
              index: resolution.fingerStates[0],
              middle: resolution.fingerStates[1],
              ring: resolution.fingerStates[2],
              pinky: resolution.fingerStates[3],
            }
          : null,
        guards: {
          pinchActive: resolution.pinchContact,
          eraseActive: resolution.eraseStable,
          swipeAction: null,
          isPinch: resolution.pinchContact,
          isThumbUp: resolution.isThumbUp,
        },
        ms: 0,
      };
    } else {
      if (!this.r19Pipeline || Math.abs(this.r19Aspect - this.aspect) > 0.01) {
        if (this.r19HadKeysPressed) {
          this.releaseVirtualKeysOnly("aspect-changed");
        }
        this.r19Pipeline = new R19RuntimePipeline(this.r19Model, this.aspect);
        this.r19Aspect = this.aspect;
      }

      const revPose = classifyHandPose(lm, {
        pinchHeld: resolution.pinchContact,
        experimentalRobust: true,
        aspect: this.aspect,
      });
      const c = palmCenterNormalized(lm);
      const w = lm[0]!;
      const scale = Math.max(
        Math.hypot((lm[9]!.x - w.x) * this.aspect, lm[9]!.y - w.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * this.aspect, lm[17]!.y - lm[5]!.y),
      );

      const t0 = performance.now();
      const r19Step: R19StepResult = this.r19Pipeline.step(lm, nowMs, revPose, c.x, c.y, scale);
      const r19Ms = performance.now() - t0;

      // Virtual key output: ONLY POINT_PRESS from r19Pipeline FSM can set left/right/jump = true.
      const allowKeys = !frameIsStale && r19Step.hybridCls !== null && r19Step.geomState === "POINT_PRESS";
      const left = allowKeys && r19Step.fsm.input.left;
      const right = allowKeys && r19Step.fsm.input.right;
      const jump = allowKeys && r19Step.fsm.input.jump;
      const jumpFiredThisFrame = allowKeys && r19Step.fsm.jumpFiredThisFrame;
      const jumpPulseActive = allowKeys && r19Step.fsm.jumpPulseActive;

      let vkEvent: R19VirtualKeyEvent = r19Step.fsm.keyEvent;
      let vkReleaseReason = r19Step.fsm.releaseReason;
      if (!allowKeys && (vkEvent === "KEYDOWN" || vkEvent === "HELD")) {
        vkEvent = this.r19HadKeysPressed ? "KEYUP" : "NONE";
        vkReleaseReason = vkEvent === "KEYUP" ? "non-press-guard" : null;
      } else if (vkEvent === "NONE" && this.r19HadKeysPressed && !(left || right || jump)) {
        vkEvent = "KEYUP";
        vkReleaseReason = vkReleaseReason ?? "key-release";
      }
      if (vkEvent === "KEYDOWN") this.r19Stats.keydowns += 1;
      else if (vkEvent === "HELD") this.r19Stats.heldFrames += 1;
      else if (vkEvent === "KEYUP") this.r19Stats.keyups += 1;
      if (jumpFiredThisFrame) this.r19Stats.jumps += 1;
      this.r19HadKeysPressed = left || right || jump;

      r19State = r19Step.hybridCls ? r19Step.geomState : "NO_HAND";
      r19GateState = r19State;
      const angleDeg = r19Step.hybridCls?.angle ?? r19Step.hybridCls?.metrics?.indexPointAngleDeg ?? null;
      const directionLabel = resolveDirectionLabel(r19State, r19Step.fsm.zone, angleDeg);

      // Canonical pose comes from our SINGLE PoseSource + PinchSource (and respects pistol pointing in Gesture mode).
      this.pose =
        r19State === "POINT_PRESS" || r19State === "POINT_READY"
          ? "one-finger"
          : resolution.handPose;

      const vkey = this.buildVirtualKey(
        vkEvent,
        r19Step.fsm.fsmState,
        r19Step.fsm.zone,
        left,
        right,
        jump,
        jumpFiredThisFrame,
        jumpPulseActive,
        vkReleaseReason,
      );

      this.r19TelemetryNow = {
        state: r19State,
        gateState: r19GateState,
        subClass: r19Step.hybridCls?.subClass ?? "degenerate",
        reason: r19Step.hybridCls?.reason ?? r19Step.fsm.releaseReason ?? "degenerate",
        topLabel: r19Step.topLabel,
        probs: mapProbs(r19Step.probs, this.r19Pipeline.clf.labels),
        angleDeg,
        directionLabel,
        directionDisplay: r19DirectionText(directionLabel),
        virtualKey: vkey,
        fingers: resolution.fingerStates
          ? {
              count: resolution.fingerCount,
              thumbOpen: resolution.thumbOpen,
              index: resolution.fingerStates[0],
              middle: resolution.fingerStates[1],
              ring: resolution.fingerStates[2],
              pinky: resolution.fingerStates[3],
            }
          : null,
        guards: {
          // Single canonical PinchSource & Erase stability (ZERO double-gate conflict; ZERO swipe!)
          pinchActive: resolution.pinchContact,
          eraseActive: resolution.eraseStable,
          swipeAction: null,
          isPinch: resolution.pinchContact,
          isThumbUp: resolution.isThumbUp,
        },
        ms: r19Ms,
      };
    }

    // 6. Jitter tracking (existing DRAWING_ONE_EURO ink smoother preserved unchanged, C14).
    const raw = indexTipNormalized(lm);
    this.rawTips.push({ t: nowMs, v: raw });
    this.inkTips.push({ t: nowMs, v: this.inkSmoother.smooth(raw, nowMs) });

    // 7. Canvas StrokeStore execution — SOLELY driven by ActionIntentResolver (Fix 1, Fix 2, Fix 3)!
    //    Pistol NEVER blocks ink or calls store.endStroke(). Rejected/stale actions NEVER mutate StrokeStore.
    if (this.inkEnabled) {
      if (frameIsStale) {
        // C15: Stale frame must NOT mutate StrokeStore!
        this.drawingActionNow = null;
        this.inkPermitted = false;
        this.rejectNow = resolution.rejectReason ?? "Data tertinggal: menunggu frame terbaru";
      } else {
        const secondaryHand = this.findSecondaryHand(landmarks, pick.index!);
        const effectiveAllowDraw = resolution.allowDrawMutation;
        const inkFrame = this.ink.feed({
          landmarks: lm,
          secondaryLandmarks: secondaryHand,
          pose: resolution.handPose,
          fingerCount: resolution.fingerCount,
          pinchRatio: resolution.pinchRatio,
          pinchOnset: resolution.pinchOnset,
          allowDraw: effectiveAllowDraw,
          inReleaseDebounce: resolution.inReleaseDebounce,
          releaseBridged: resolution.releaseBridgedGapMs !== null,
          releaseConfirmed: resolution.releaseConfirmed,
          allowErase: resolution.allowEraseMutation,
          inLossGrace: false,
          shouldEndOpenOps: resolution.shouldEndOpenOps,
          isStale: false,
          nowMs,
        });
        this.lastBackfilledPoints = inkFrame.backfilledPoints;
        this.lastRetroTrimmedPoints = inkFrame.retroTrimmedPoints;

        // A8 #13: Cursor is visible whenever a valid owner hand is present; ink draws ONLY on accepted pinch contact.
        this.liveCursor = inkFrame.cursor;
        this.inkPermitted =
          effectiveAllowDraw ||
          resolution.allowEraseMutation ||
          resolution.fireCommand !== null ||
          resolution.fireThreeAction !== null;

        if (resolution.fireCommand !== null) {
          // Ensure no open stroke or erase pass collides with Undo/Redo stack transition.
          if (this.store.hasActiveStroke()) this.store.endStroke();
          if (this.store.isErasing()) this.store.endErase();
          const changed =
            resolution.fireCommand === "undo" ? this.store.undo() : this.store.redo();
          this.lastCommand = {
            kind: resolution.fireCommand,
            changed,
            atMs: nowMs,
            via: "fist-transition",
          };
          this.commandCount += 1;
          this.drawingActionNow = resolution.fireCommand;
          this.rejectNow =
            resolution.fireCommand === "undo"
              ? changed
                ? "Undo berhasil (Kepal -> 1 jari)"
                : "Tidak ada langkah untuk Undo"
              : changed
                ? "Redo berhasil (Kepal -> 2 jari)"
                : "Tidak ada langkah untuk Redo";
        } else if (resolution.fireThreeAction !== null) {
          this.threeActionCount += 1;
          this.drawingActionNow = null;
          this.rejectNow = `Aksi 3 jari (${resolution.fireThreeAction}) dipicu`;
        } else if (resolution.allowDrawMutation) {
          this.drawingActionNow = "draw";
          this.rejectNow = this.store.hasActiveStroke()
            ? "Tinta aktif"
            : "Pinch dibaca, menunggu validasi tinta";
        } else if (resolution.allowEraseMutation) {
          this.drawingActionNow = "erase";
          this.rejectNow = "Hapus aktif";
        } else {
          this.drawingActionNow = null;
          this.rejectNow = resolution.rejectReason ?? "Tidak ada aksi gambar";
        }
      }
    } else {
      this.liveCursor = null;
      this.drawingActionNow = null;
      this.inkPermitted = false;
      this.rejectNow =
        r19State !== "OTHER" && r19State !== "NO_HAND"
          ? "Mode pistol aktif: tinta dinonaktifkan"
          : "Tinta dinonaktifkan";
    }

    this.handStatusNow = this.computeHandStatus(resolution);
    // The wave rule scales its swing with the hand's own size, as the game does.
    this.feedWave(lm[0] ?? null, nowMs, this.primarySizeNow, face);
  }

  /** Honest Hapus-path status: says what is actually true this frame, never a made-up success. */
  private computeHandStatus(resolution: ActionResolution): string | null {
    if (!this.inkEnabled) return null;
    const dbg = this.ink.debugState();
    if (dbg.erasing) return dbg.lastEraseHit === false ? "TIDAK ADA STROKE DI AREA" : "HAPUS AKTIF";
    if (resolution.isSplitPalm && resolution.poseClass !== "FIVE") {
      return "TELAPAK TERBELAH / 5 JARI BELUM TERBACA";
    }
    const palm =
      resolution.handPose === "open-palm" ||
      resolution.handPose === "split-palm" ||
      resolution.poseClass === "FIVE";
    if (!palm) return null;
    if (resolution.fingerCount !== 5 || resolution.poseClass !== "FIVE") {
      return "LANDMARK ADA / 5 JARI BELUM TERBACA";
    }
    if (!resolution.eraseStable) return "5 JARI TERBACA / STABILISASI";
    if (!resolution.armed.erase && this.options.fullFrameLock === true) {
      return "TELAPAK TERBACA / TUNGGU REARM";
    }
    return "5 JARI TERBACA / SIAP HAPUS";
  }

  /** Starts (or restarts) the wave test on the primary wrist. */
  startWaveTest(): void {
    this.sampler.reset();
    this.waveStatus = "running";
  }

  /** The 21 landmarks of the locked hand in the last analysed frame, or null. Numbers only (RD-02 recorder). */
  primaryLandmarks(): Landmark[] | null {
    return this.primaryIdx === null ? null : (this.hands[this.primaryIdx] ?? null);
  }

  /** The player's face in the last analysed frame, or null. For the overlay. */
  get currentFace(): FaceBox | null {
    return this.face;
  }

  /** Forgets all hands, filters and the wave test (camera stopped). Preserves loaded R19 model. */
  reset(nowMs: number): void {
    this.resetSession(nowMs, "reset");
  }

  /** Stops active capture/session and releases virtual keys immediately. */
  stop(nowMs = performance.now()): void {
    this.resetSession(nowMs, "stop");
  }

  private resetSession(nowMs: number, reason: string): void {
    const hadKeys = this.r19HadKeysPressed;
    this.r19HadKeysPressed = false;
    this.resolver.reset();
    this.ink.reset(nowMs);
    this.fullLock.reset();
    this.eraserRadiusCss = DEFAULT_LAB_ERASER_CSS_PX;
    this.lastCommand = null;
    this.commandCount = 0;
    this.threeActionCount = 0;
    this.handLostSinceMs = null;
    this.lastBackfilledPoints = 0;
    this.lastRetroTrimmedPoints = 0;
    this.thumbNow = null;
    this.handStatusNow = null;
    this.legacyCountNow = 0;
    this.liveCursor = null;
    this.fingerCountNow = 0;
    this.drawingActionNow = null;
    this.pinchRatioNow = null;
    this.fingerStatesNow = null;
    this.rejectNow =
      this.r19StatusNow === "ready"
        ? "Kamera belum membaca tangan"
        : (this.r19ErrorNow ?? "Model R19 belum siap");
    this.inkPermitted = false;
    this.lastAcquisition = 0;
    this.armed = { draw: false, erase: false, commands: false };
    this.inkSmoother.reset();
    this.cursorOneEuro?.reset();
    this.inferSamples = [];
    this.detectTimes = [];
    this.primary = null;
    this.hands = [];
    this.primaryIdx = null;
    this.primarySizeNow = null;
    this.face = null;
    this.roles = [];
    this.pose = "none";
    this.rawTips = [];
    this.inkTips = [];
    this.sampler.reset();
    this.waveStatus = "idle";
    this.r19Pipeline?.reset();
    this.resolutionNow = emptyResolution(this.routeNow, this.rejectNow, nowMs, this.resolver.preset.id);
    const prevReleaseAlls = this.r19Stats.releaseAlls;
    const emitRelease = !this.strictCanvasRoute && hadKeys;
    this.r19Stats = {
      keydowns: 0,
      heldFrames: 0,
      keyups: 0,
      jumps: 0,
      releaseAlls: emitRelease ? prevReleaseAlls + 1 : 0,
    };
    const vkey = this.buildVirtualKey(
      emitRelease ? "RELEASE_ALL" : "NONE",
      "NO_HAND",
      "stop",
      false,
      false,
      false,
      false,
      false,
      emitRelease ? reason : null,
    );
    this.r19TelemetryNow = emptyR19Telemetry(
      reason,
      reason,
      vkey,
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  /** Manual recovery remains an escape hatch. Normal reacquisition is automatic after empty frames. */
  resetHandLock(nowMs: number): void {
    const hadKeys = this.r19HadKeysPressed;
    this.r19HadKeysPressed = false;
    this.fullLock.reset();
    this.resolver.reset();
    this.lastAcquisition = 0;
    this.armed = { draw: false, erase: false, commands: false };
    this.ink.reset(nowMs);
    this.liveCursor = null;
    this.fingerCountNow = 0;
    this.legacyCountNow = 0;
    this.drawingActionNow = null;
    this.pinchRatioNow = null;
    this.fingerStatesNow = null;
    this.thumbNow = null;
    this.handStatusNow = null;
    this.pose = "none";
    this.inkPermitted = false;
    this.rejectNow =
      this.r19StatusNow === "ready"
        ? "Kunci manual diulang"
        : (this.r19ErrorNow ?? "Model R19 belum siap");
    this.primaryIdx = null;
    this.primary = null;
    this.rawTips = [];
    this.inkTips = [];
    this.inkSmoother.reset();
    this.cursorOneEuro?.reset();
    this.r19Pipeline?.reset();
    this.resolutionNow = emptyResolution(this.routeNow, this.rejectNow, nowMs, this.resolver.preset.id);
    const emitRelease = !this.strictCanvasRoute && hadKeys;
    if (emitRelease) this.r19Stats.releaseAlls += 1;
    const vkey = this.buildVirtualKey(
      emitRelease ? "RELEASE_ALL" : "NONE",
      "NO_HAND",
      "stop",
      false,
      false,
      false,
      false,
      false,
      emitRelease ? "reset-hand-lock" : null,
    );
    this.r19TelemetryNow = emptyR19Telemetry(
      "reset-hand-lock",
      "reset-hand-lock",
      vkey,
      this.strictCanvasRoute ? "DISABLED_ON_CANVAS" : "NO_HAND",
    );
  }

  /** Strokes of the scratch ink canvas (canvas px). */
  strokes(): { completed: RawStroke[]; active: RawStroke | null } {
    return this.store.getStrokes();
  }

  /** Lab-only fallback tools, backed by the same stroke store as MediaPipe. */
  beginPointerStroke(point: { x: number; y: number }): void {
    this.store.beginStroke();
    this.store.addPoint(point);
  }
  movePointerStroke(point: { x: number; y: number }): void {
    this.store.addPoint(point);
  }
  endPointerStroke(): void {
    this.store.endStroke();
  }
  erasePointer(point: { x: number; y: number }): void {
    this.store.eraseAt(point, this.labEraser.radiusCanvasPx());
  }
  endPointerErase(): void {
    this.store.endErase();
  }
  get cursor(): HandCursor | null {
    return this.liveCursor;
  }
  get eraserRadiusCanvasPx(): number {
    return this.labEraser.radiusCanvasPx();
  }
  canvasAction(action: "undo" | "redo" | "clear"): void {
    this.ink.reset(performance.now());
    if (action === "undo") this.store.undo();
    if (action === "redo") this.store.redo();
    if (action === "clear") this.store.clear();
  }

  /** Hands of the last analysed frame, for the overlay. */
  get lastHands(): Landmark[][] {
    return this.hands;
  }

  get primaryHandIndex(): number | null {
    return this.primaryIdx;
  }

  snapshot(nowMs: number): LabSnapshot {
    this.expireLastCommandIfNeeded(nowMs);
    const infer = recent(this.inferSamples, nowMs, INFER_WINDOW_MS);
    const raw = recent(this.rawTips, nowMs, JITTER_WINDOW_MS);
    const ink = recent(this.inkTips, nowMs, JITTER_WINDOW_MS);
    const still = raw.length >= JITTER_MIN_SAMPLES && isStill(raw, LAB_STILL_SPAN);
    const ready = this.r19StatusNow === "ready";
    const res = ready
      ? this.resolutionNow
      : emptyResolution(this.routeNow, this.r19ErrorNow ?? "Model R19 belum siap", nowMs, this.resolver.preset.id);
    const handLostDurationMs =
      this.handLostSinceMs !== null ? Math.max(0, Math.round(nowMs - this.handLostSinceMs)) : 0;
    return {
      route: this.routeNow,
      handCount: this.hands.length,
      farHandCount: this.hands.filter((h) => !isLargeEnough(h)).length,
      primaryIndex: this.primaryIdx,
      primarySize: this.primaryIdx === null ? null : this.primarySizeNow,
      pose: !ready || this.primaryIdx === null ? "none" : this.pose,
      inferP50: percentile(infer, 50),
      inferP95: percentile(infer, 95),
      detectFps: this.detectTimes.filter((t) => nowMs - t >= 0 && nowMs - t <= FPS_WINDOW_MS).length,
      still,
      rawJitterPx: still ? jitterStdDevPx(raw, JITTER_CANVAS_PX) : null,
      inkJitterPx: still ? jitterStdDevPx(ink, JITTER_CANVAS_PX) : null,
      wave: {
        status: this.waveStatus,
        progress: this.sampler.progress,
        elapsedMs: this.sampler.elapsedMs,
        reversals: this.sampler.reversals,
      },
      face: this.face,
      handRoles: [...this.roles],
      cursor: ready && this.liveCursor ? { ...this.liveCursor } : null,
      fingerCount: ready ? this.fingerCountNow : 0,
      drawingAction: ready ? this.drawingActionNow : null,
      lockStatus: this.options.fullFrameLock
        ? this.fullLock.status
        : this.primaryIdx !== null
          ? "locked"
          : "waiting",
      lockReason: this.options.fullFrameLock ? this.fullLock.reason : null,
      acquisitionId: this.options.fullFrameLock ? this.fullLock.acquisitionId : 0,
      pinchRatio: ready ? this.pinchRatioNow : null,
      pinchEnter: LAB_PINCH_ENTER,
      pinchExit: LAB_PINCH_EXIT,
      foldedPinchEnter: LAB_FOLDED_PINCH_ENTER,
      foldedPinchExit: LAB_FOLDED_PINCH_EXIT,
      fingerStates: ready && this.fingerStatesNow ? [...this.fingerStatesNow] : null,
      inkAllowed: ready && this.inkPermitted && this.inkEnabled,
      rejectionReason: ready ? this.rejectNow : (this.r19ErrorNow ?? "Model R19 belum siap"),
      actionIntent: res.actionIntent,
      actionAccepted: res.actionAccepted,
      actionRejectedReason: res.rejectReason,
      labelSource: res.labelSource,
      undoRedoFsmState: res.undoRedoFsmState,
      actionResolution: {
        ...res,
        armed: { ...res.armed },
        pinchGate: { ...res.pinchGate, reasons: [...res.pinchGate.reasons] },
        handState: {
          ...res.handState,
          fingers: res.handState.fingers ? { ...res.handState.fingers } : null,
        },
        fingerStates: res.fingerStates ? [...res.fingerStates] : null,
      },
      pinchGate: { ...res.pinchGate, reasons: [...res.pinchGate.reasons] },
      handState: {
        ...res.handState,
        fingers: res.handState.fingers ? { ...res.handState.fingers } : null,
      },
      presetId: this.resolver.preset.id,
      lastCursor: this.ink.lastCursorPosition,
      handLostDurationMs,
      lastBackfilledPoints: this.lastBackfilledPoints,
      lastRetroTrimmedPoints: this.lastRetroTrimmedPoints,
      threeActionCount: this.threeActionCount,
      eraserRadiusCanvasPx: this.labEraser.radiusCanvasPx(),
      classifierMode: "r19-g4-hybrid",
      modelState: this.r19StatusNow,
      modelError: this.r19ErrorNow,
      r19: {
        ...this.r19TelemetryNow,
        probs: this.r19TelemetryNow.probs ? { ...this.r19TelemetryNow.probs } : null,
        virtualKey: { ...this.r19TelemetryNow.virtualKey },
        fingers: this.r19TelemetryNow.fingers ? { ...this.r19TelemetryNow.fingers } : null,
        guards: { ...this.r19TelemetryNow.guards },
      },
      diag: this.buildDiagnostics(res),
    };
  }

  private buildDiagnostics(res: ActionResolution): LabDiagnostics {
    const ready = this.r19StatusNow === "ready";
    const dbg = !ready || this.primaryIdx === null ? null : this.ink.debugState();
    const strokes = this.store.getStrokes();
    return {
      aspect: this.aspect,
      rawPose: !ready || this.primaryIdx === null ? "none" : this.pose,
      stablePose: dbg?.stable ?? "none",
      rawFingerCount: ready ? this.fingerCountNow : 0,
      legacyFingerCount: ready ? this.legacyCountNow : 0,
      thumb: ready ? this.thumbNow : null,
      armed: { ...this.armed },
      fiveFingerValid:
        ready &&
        res.poseClass === "FIVE" &&
        res.fingerCount === 5 &&
        res.thumbOpen,
      handStatus: ready ? this.handStatusNow : null,
      pipeline: dbg,
      strokes: { completed: strokes.completed.length, activePoints: strokes.active?.length ?? 0 },
      lastCommand: this.lastCommand ? { ...this.lastCommand } : null,
      commandCount: this.commandCount,
      commandMode: "fist-transition",
      undoRedoFsmState: res.undoRedoFsmState,
      pinchState: res.pinchState,
      poseClass: res.poseClass,
      inLossGrace: res.inLossGrace,
      swipe: null,
    };
  }

  private feedWave(
    wrist: { x: number; y: number } | null,
    nowMs: number,
    handSize?: number,
    face: FaceBox | null = null,
  ): void {
    if (this.waveStatus !== "running") return;
    this.sampler.feed(wrist, nowMs, { handSize, face });
    if (this.sampler.detected) this.waveStatus = "done";
  }
}
