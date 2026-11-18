/**
 * Frame-by-frame analysis for the NUI test page (/nui-lab).
 * Uses R19 G4 Hybrid (G1 Geometry + G3 MLP [82->96->48->3] + PistolVirtualKeyFSM) as the SOLE
 * classifier engine with strict fail-closed lifecycle and aspect-corrected safety gates.
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
  evaluateGesture,
  indexTipNormalized,
  palmCenterNormalized,
  thumbDiagnostics,
  type FingerState,
  type HandPose,
  type ThumbDiagnostics,
} from "@/src/input/hand-gesture";
import type { GestureAction } from "@/src/input/gesture-mode";
import type { HandCursor } from "@/src/input/hand-stroke-pipeline";
import { HandStrokePipeline, type PipelineDebug } from "@/src/input/hand-stroke-pipeline";
import type { EraserControl } from "@/src/input/eraser";
import { DRAWING_ONE_EURO, PointSmoother } from "@/src/input/smoothing";
import { StrokeStore, type Landmark, type RawStroke } from "@/src/input/types";
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
import { fingerDiagnosticStatesAspect, pistolGeometryMetrics } from "./r19/pistol_geometry";
import { R19_LABELS, type R19Label } from "./r19/r19_features";
import { R19RuntimePipeline } from "./r19/r19_integrated";
import { validateR19Model } from "./r19/r19_loader";
import type { R19ExportedModel } from "./r19/r19_model";

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
/** Eraser radius for the scratch canvas only; the lab never erases on a real surface. */
const INK_ERASER: EraserControl = {
  radiusCanvasPx: () => 32,
  radiusCss: () => 16,
  setRadiusCss: () => undefined,
  isFixed: () => true,
};

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
}

/** Last Undo/Redo that really ran in the lab, with what the store said. HUD mapping alone proves nothing. */
export interface LabCommandResult {
  kind: "undo" | "redo";
  /** What store.undo() / store.redo() returned: false = nothing to undo/redo (a no-op, not a success). */
  changed: boolean;
  atMs: number;
  via: "pose-hold" | "swipe";
}

export type WaveStatus = "idle" | "running" | "done";
export type R19ModelState = "unloaded" | "loading" | "ready" | "error";
export type R19VirtualKeyEvent = "KEYDOWN" | "HELD" | "KEYUP" | "RELEASE_ALL" | "NONE";

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
  count: number;
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
  fingerCount: number;
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
  /** Pose of the primary hand this frame, mapped cleanly with R19 safety vetoes. */
  rawPose: HandPose;
  /** Pose after the 3-of-5 vote in the ink pipeline: what the actions follow. */
  stablePose: HandPose;
  /** Extended fingers 0..5 under R19 aspect-corrected geometry (thumb included). */
  rawFingerCount: number;
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
  commandMode: "swipe";
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

function resolveLabPose(step: R19StepResult, revPose: HandPose): HandPose {
  const cls = step.hybridCls;
  if (!cls) return "none";
  if (cls.subClass === "pinch" || step.pinchActive) return "pinch";
  if (cls.subClass === "thumb-up") return "thumb-up";
  if (cls.subClass === "fist") return "fist";
  if (step.geomState === "POINT_PRESS" || step.geomState === "POINT_READY") return "one-finger";
  if (cls.subClass === "two-fingers") return "two-fingers";
  if (cls.subClass === "three") return "three-fingers";
  if (cls.subClass === "five") return revPose === "split-palm" ? "split-palm" : "open-palm";
  return revPose === "pinch" ? "none" : revPose;
}

function emptyR19Telemetry(
  subClass: string,
  reason: string,
  vkey: LabR19VirtualKey,
): LabR19Telemetry {
  return {
    state: "NO_HAND",
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

export class LabAnalyzer {
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
  private fingerCountNow = 0;
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
  private thumbNow: ThumbDiagnostics | null = null;
  private legacyCountNow = 0;
  private handStatusNow: string | null = null;

  private r19StatusNow: R19ModelState = "unloaded";
  private r19ErrorNow: string | null = null;
  private r19Model: R19ExportedModel | null = null;
  private r19Pipeline: R19RuntimePipeline | null = null;
  private r19Aspect = 0;
  private r19LastStep: R19StepResult | null = null;
  private r19LastPinchHeld = false;
  private r19HadKeysPressed = false;
  private r19Stats = { keydowns: 0, heldFrames: 0, keyups: 0, jumps: 0, releaseAlls: 0 };
  private r19TelemetryNow: LabR19Telemetry;

  constructor(private readonly options: { fullFrameLock?: boolean; enableInk?: boolean } = {}) {
    this.r19TelemetryNow = emptyR19Telemetry("model-not-ready", this.rejectNow, this.buildVirtualKey("NONE", "NO_HAND", "stop", false, false, false, false, false, null));
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
    this.r19TelemetryNow = emptyR19Telemetry("model-not-ready", this.rejectNow, this.r19TelemetryNow.virtualKey);
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
      this.r19TelemetryNow = emptyR19Telemetry("no-hand", "no-hand", this.r19TelemetryNow.virtualKey);
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
    this.r19TelemetryNow = emptyR19Telemetry("model-error", message, this.r19TelemetryNow.virtualKey);
  }

  /** Immediately release all virtual keys and clear armed/ink state. */
  releaseAll(reason: string, nowMs = performance.now()): void {
    const cleanReason = reason.trim().length > 0 ? reason : "release-all";
    this.releaseAllInternal(cleanReason, nowMs, true);
    this.r19TelemetryNow = emptyR19Telemetry(cleanReason, cleanReason, this.r19TelemetryNow.virtualKey);
  }

  onPhaseChange(): void {
    const hadKeys = this.r19HadKeysPressed;
    this.r19HadKeysPressed = false;
    this.r19Pipeline?.onPhaseChange();
    const event: R19VirtualKeyEvent = hadKeys ? "RELEASE_ALL" : "NONE";
    if (hadKeys) this.r19Stats.releaseAlls += 1;
    const vkey = this.buildVirtualKey(event, "RELEASED_WAIT_REARM", "stop", false, false, false, false, false, hadKeys ? "phase-change" : null);
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
    const emitReleaseAll = hadKeys || forceEvent;
    this.r19HadKeysPressed = false;
    this.r19LastStep = null;
    this.r19LastPinchHeld = false;
    this.r19Pipeline?.reset();
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
    if (emitReleaseAll) this.r19Stats.releaseAlls += 1;
    const event: R19VirtualKeyEvent = emitReleaseAll ? "RELEASE_ALL" : "NONE";
    const vkey = this.buildVirtualKey(event, "NO_HAND", "stop", false, false, false, false, false, emitReleaseAll ? reason : null);
    this.r19TelemetryNow = emptyR19Telemetry(reason, reason, vkey);
  }

  /** Enforces R19 G4 Hybrid safety gates + optional FullFrameHandLock re-arming. */
  private canExecute(raw: HandPose, fingerCount: number): boolean {
    if (this.r19StatusNow !== "ready" || !this.r19LastStep) return false;
    if (this.r19LastStep.geomState !== "OTHER") return false;
    const strict = this.options.fullFrameLock === true;
    if (raw === "pinch") {
      if (!this.r19LastStep.pinchActive) return false;
      return strict ? this.armed.draw : true;
    }
    if (fingerCount === 5 && (raw === "open-palm" || raw === "split-palm")) {
      if (!this.r19LastStep.eraseActive) return false;
      return strict ? this.armed.erase : true;
    }
    if (raw === "one-finger" || raw === "two-fingers") {
      return strict ? this.armed.commands : true;
    }
    return true;
  }

  private readonly ink = new HandStrokePipeline({
    store: this.store,
    size: () => INK_SIZE,
    eraser: INK_ERASER,
    aspect: () => this.aspect,
    experimentalRobust: true,
    canPerformAction: (pose, fingers) => this.canExecute(pose, fingers),
  });

  analyse({ landmarks, inferMs, nowMs, face = null, aspect }: LabDetection): void {
    if (typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0) this.aspect = aspect;
    this.inferSamples.push({ t: nowMs, v: inferMs });
    this.detectTimes.push(nowMs);
    this.hands = landmarks;
    this.face = face;

    const strict = this.options.fullFrameLock === true;
    const pick = strict ? this.fullLock.pick(landmarks, nowMs) : pickPrimaryHand(landmarks, this.primary, nowMs, face);
    if (!strict) this.primary = (pick as ReturnType<typeof pickPrimaryHand>).state;
    this.primaryIdx = pick.index;
    // The full-frame lab intentionally ignores the face-region gate. Other hands are never promoted automatically.
    this.roles = strict
      ? landmarks.map((h, i): HandRole => (!isLargeEnough(h) ? "far" : i === pick.index ? "primary" : "other"))
      : classifyHandRoles(landmarks, pick.index, face);
    const lm = pick.index === null ? undefined : landmarks[pick.index];

    // Fail-closed: if the R19 model is not ready, refuse all gestures/ink/virtual keys with zero fallback.
    if (this.r19StatusNow !== "ready" || !this.r19Model) {
      this.primarySizeNow = lm ? handSize(lm) : null;
      const reason = this.r19ErrorNow ?? "Model R19 belum siap";
      this.releaseAllInternal(reason, nowMs, false);
      this.rejectNow = reason;
      this.r19TelemetryNow = emptyR19Telemetry("model-not-ready", reason, this.r19TelemetryNow.virtualKey);
      this.feedWave(null, nowMs);
      return;
    }

    if (!lm) {
      this.primarySizeNow = null;
      const lossReason = strict ? this.fullLock.reason : "no-hand";
      this.releaseAllInternal(lossReason, nowMs, false);
      this.rejectNow = strict ? this.fullLock.reason : "Tangan tidak ditemukan";
      this.r19TelemetryNow = emptyR19Telemetry(lossReason, lossReason, this.r19TelemetryNow.virtualKey);
      this.feedWave(null, nowMs);
      return;
    }

    this.primarySizeNow = handSize(lm);
    if (strict && this.fullLock.acquisitionId !== this.lastAcquisition) {
      this.lastAcquisition = this.fullLock.acquisitionId;
      this.releaseAllInternal("new-acquisition", nowMs, false);
    }

    if (!this.r19Pipeline || Math.abs(this.r19Aspect - this.aspect) > 0.01) {
      if (this.r19HadKeysPressed) {
        this.releaseAllInternal("aspect-changed", nowMs, false);
      }
      this.r19Pipeline = new R19RuntimePipeline(this.r19Model, this.aspect);
      this.r19Aspect = this.aspect;
    }

    const revPose = classifyHandPose(lm, {
      pinchHeld: this.r19LastPinchHeld,
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
    const r19Step = this.r19Pipeline.step(lm, nowMs, revPose, c.x, c.y, scale);
    const r19Ms = performance.now() - t0;

    this.r19LastStep = r19Step;
    this.r19LastPinchHeld = r19Step.pinchActive;

    const fourStates = fingerDiagnosticStatesAspect(lm, this.aspect);
    const metrics = r19Step.hybridCls?.metrics ?? pistolGeometryMetrics(lm, this.aspect);
    const thumbOpen = metrics?.thumbOpen ?? false;
    const fourExtCount = fourStates ? fourStates.filter((s) => s === "extended").length : 0;
    this.fingerCountNow = fourStates ? fourExtCount + (thumbOpen ? 1 : 0) : 0;
    this.fingerStatesNow = fourStates ? [...fourStates] : null;
    this.legacyCountNow = countExtendedFingers(lm);
    this.thumbNow = thumbDiagnostics(lm, this.aspect);
    const evalDiag = evaluateGesture(lm, this.aspect);
    this.pinchRatioNow = evalDiag.state === "tracking" ? evalDiag.pinchRatio : null;

    this.pose = resolveLabPose(r19Step, revPose);

    const isPistol = r19Step.geomState === "POINT_READY" || r19Step.geomState === "POINT_PRESS";
    if (!r19Step.pinchActive && revPose !== "pinch") this.armed.draw = true;
    if (!r19Step.eraseActive && !(this.fingerCountNow === 5 && (revPose === "open-palm" || revPose === "split-palm"))) {
      this.armed.erase = true;
    }
    if (isPistol || (revPose !== "one-finger" && revPose !== "two-fingers")) {
      this.armed.commands = true;
    }

    // Virtual key output: ONLY POINT_PRESS from r19Pipeline FSM can set left/right/jump = true.
    const allowKeys = r19Step.hybridCls !== null && r19Step.geomState === "POINT_PRESS";
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

    const r19State: R19TelemetryState = r19Step.hybridCls ? r19Step.geomState : "NO_HAND";
    const angleDeg = r19Step.hybridCls?.angle ?? metrics?.indexPointAngleDeg ?? null;
    const directionLabel = resolveDirectionLabel(r19State, r19Step.fsm.zone, angleDeg);
    const swipeAllowed =
      r19State === "OTHER" &&
      (!strict || (this.fullLock.status === "locked" && this.armed.commands));
    const gatedSwipe = swipeAllowed ? r19Step.swipeAction : null;

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
      subClass: r19Step.hybridCls?.subClass ?? "degenerate",
      reason: r19Step.hybridCls?.reason ?? r19Step.fsm.releaseReason ?? "degenerate",
      topLabel: r19Step.topLabel,
      probs: mapProbs(r19Step.probs, this.r19Pipeline.clf.labels),
      angleDeg,
      directionLabel,
      directionDisplay: r19DirectionText(directionLabel),
      virtualKey: vkey,
      fingers: fourStates
        ? {
            count: this.fingerCountNow,
            thumbOpen,
            index: fourStates[0],
            middle: fourStates[1],
            ring: fourStates[2],
            pinky: fourStates[3],
          }
        : null,
      guards: {
        pinchActive: r19Step.pinchActive,
        eraseActive: r19Step.eraseActive,
        swipeAction: gatedSwipe,
        isPinch: metrics?.isPinch ?? false,
        isThumbUp: metrics?.isThumbUp ?? false,
      },
      ms: r19Ms,
    };

    const raw = indexTipNormalized(lm);
    this.rawTips.push({ t: nowMs, v: raw });
    this.inkTips.push({ t: nowMs, v: this.inkSmoother.smooth(raw, nowMs) });

    if (this.options.enableInk !== false) {
      if (r19State === "NO_HAND") {
        this.ink.reset(nowMs);
        this.liveCursor = null;
        this.drawingActionNow = null;
        this.inkPermitted = false;
        this.rejectNow = "Landmark tidak valid";
      } else {
        if (r19State !== "OTHER") {
          // Pistol (POINT_READY / POINT_PRESS) must never leave an open stroke or erase pass.
          if (this.store.hasActiveStroke()) this.store.endStroke();
          if (this.store.isErasing()) this.store.endErase();
        }
        const inkFrame = this.ink.feed(lm, nowMs);
        if (r19State !== "OTHER" && inkFrame.cursor) {
          inkFrame.cursor = { ...inkFrame.cursor, state: "hover", erasing: false };
        }
        this.liveCursor = inkFrame.cursor;

        const dbg = this.ink.debugState();
        const canDraw = r19State === "OTHER" && r19Step.pinchActive && (!strict || this.armed.draw);
        const canErase = r19State === "OTHER" && r19Step.eraseActive && this.fingerCountNow === 5 && thumbOpen && (!strict || this.armed.erase);
        this.inkPermitted = r19State === "OTHER" && this.canExecute(this.pose, this.fingerCountNow);

        if (r19State !== "OTHER") {
          this.drawingActionNow = null;
          this.rejectNow = r19State === "POINT_PRESS"
            ? "Mode pistol aktif: tinta dinonaktifkan"
            : "Mode siaga tunjuk: tinta dinonaktifkan";
        } else if (canDraw && (inkFrame.pose === "pinch" || dbg.drawing)) {
          this.drawingActionNow = "draw";
          this.rejectNow = this.store.hasActiveStroke() ? "Tinta aktif" : "Pinch dibaca, menunggu validasi tinta";
        } else if (canErase && (dbg.erasing || revPose === "open-palm" || revPose === "split-palm")) {
          this.drawingActionNow = "erase";
          this.rejectNow = "Hapus aktif";
        } else {
          this.drawingActionNow = null;
          if (!this.inkPermitted) {
            this.rejectNow = this.pose === "pinch" && !r19Step.pinchActive
              ? "Cubit ditolak gate R19"
              : this.fingerCountNow === 5 && (this.pose === "open-palm" || this.pose === "split-palm") && !r19Step.eraseActive
                ? "Telapak hapus butuh 4 frame stabil"
                : "Tunggu gestur dilepas sebelum aksi baru";
          } else {
            this.rejectNow = "Tidak ada aksi gambar";
          }
        }

        if (gatedSwipe) {
          const changed = gatedSwipe === "undo" ? this.store.undo() : this.store.redo();
          this.lastCommand = { kind: gatedSwipe, changed, atMs: nowMs, via: "swipe" };
          this.commandCount += 1;
        }
      }
    } else {
      this.liveCursor = null;
      this.drawingActionNow = null;
      this.inkPermitted = false;
      this.rejectNow = r19State !== "OTHER" ? "Mode pistol aktif: tinta dinonaktifkan" : "Tinta dinonaktifkan";
    }

    this.handStatusNow = this.computeHandStatus(r19Step);
    // The wave rule scales its swing with the hand's own size, as the game does.
    this.feedWave(lm[0] ?? null, nowMs, this.primarySizeNow, face);
  }

  /** Honest Hapus-path status: says what is actually true this frame, never a made-up success. */
  private computeHandStatus(r19Step: R19StepResult): string | null {
    if (!r19Step.hybridCls || r19Step.geomState !== "OTHER") return null;
    const palm = this.pose === "open-palm" || this.pose === "split-palm";
    const dbg = this.ink.debugState();
    if (dbg.erasing) return dbg.lastEraseHit === false ? "TIDAK ADA STROKE DI AREA" : "HAPUS AKTIF";
    if (!palm) return null;
    if (this.fingerCountNow !== 5) return "LANDMARK ADA / 5 JARI BELUM TERBACA";
    if (!r19Step.eraseActive) return "5 JARI TERBACA / STABILISASI";
    if (!this.armed.erase && this.options.fullFrameLock === true) return "TELAPAK TERBACA / TUNGGU REARM";
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
    this.ink.reset(nowMs);
    this.fullLock.reset();
    this.lastCommand = null;
    this.commandCount = 0;
    this.thumbNow = null;
    this.handStatusNow = null;
    this.legacyCountNow = 0;
    this.liveCursor = null;
    this.fingerCountNow = 0;
    this.drawingActionNow = null;
    this.pinchRatioNow = null;
    this.fingerStatesNow = null;
    this.rejectNow = this.r19StatusNow === "ready"
      ? "Kamera belum membaca tangan"
      : (this.r19ErrorNow ?? "Model R19 belum siap");
    this.inkPermitted = false;
    this.lastAcquisition = 0;
    this.armed = { draw: false, erase: false, commands: false };
    this.inkSmoother.reset();
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
    this.r19LastStep = null;
    this.r19LastPinchHeld = false;
    const prevReleaseAlls = this.r19Stats.releaseAlls;
    this.r19Stats = {
      keydowns: 0,
      heldFrames: 0,
      keyups: 0,
      jumps: 0,
      releaseAlls: hadKeys ? prevReleaseAlls + 1 : 0,
    };
    const vkey = this.buildVirtualKey(
      hadKeys ? "RELEASE_ALL" : "NONE",
      "NO_HAND",
      "stop",
      false,
      false,
      false,
      false,
      false,
      hadKeys ? reason : null,
    );
    this.r19TelemetryNow = emptyR19Telemetry(reason, reason, vkey);
  }

  /** Manual recovery remains an escape hatch. Normal reacquisition is automatic after empty frames. */
  resetHandLock(nowMs: number): void {
    const hadKeys = this.r19HadKeysPressed;
    this.r19HadKeysPressed = false;
    this.fullLock.reset();
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
    this.rejectNow = this.r19StatusNow === "ready"
      ? "Kunci manual diulang"
      : (this.r19ErrorNow ?? "Model R19 belum siap");
    this.primaryIdx = null;
    this.primary = null;
    this.rawTips = [];
    this.inkTips = [];
    this.inkSmoother.reset();
    this.r19Pipeline?.reset();
    this.r19LastStep = null;
    this.r19LastPinchHeld = false;
    if (hadKeys) this.r19Stats.releaseAlls += 1;
    const vkey = this.buildVirtualKey(
      hadKeys ? "RELEASE_ALL" : "NONE",
      "NO_HAND",
      "stop",
      false,
      false,
      false,
      false,
      false,
      hadKeys ? "reset-hand-lock" : null,
    );
    this.r19TelemetryNow = emptyR19Telemetry("reset-hand-lock", "reset-hand-lock", vkey);
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
    this.store.eraseAt(point, 32);
  }
  endPointerErase(): void { this.store.endErase(); }
  get cursor(): HandCursor | null { return this.liveCursor; }
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
    const infer = recent(this.inferSamples, nowMs, INFER_WINDOW_MS);
    const raw = recent(this.rawTips, nowMs, JITTER_WINDOW_MS);
    const ink = recent(this.inkTips, nowMs, JITTER_WINDOW_MS);
    const still = raw.length >= JITTER_MIN_SAMPLES && isStill(raw, LAB_STILL_SPAN);
    const ready = this.r19StatusNow === "ready";
    return {
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
        : this.primaryIdx !== null ? "locked" : "waiting",
      lockReason: this.options.fullFrameLock ? this.fullLock.reason : null,
      acquisitionId: this.options.fullFrameLock ? this.fullLock.acquisitionId : 0,
      pinchRatio: ready ? this.pinchRatioNow : null,
      pinchEnter: LAB_PINCH_ENTER,
      pinchExit: LAB_PINCH_EXIT,
      foldedPinchEnter: LAB_FOLDED_PINCH_ENTER,
      foldedPinchExit: LAB_FOLDED_PINCH_EXIT,
      fingerStates: ready && this.fingerStatesNow ? [...this.fingerStatesNow] : null,
      inkAllowed: ready && this.inkPermitted && this.options.enableInk !== false,
      rejectionReason: ready ? this.rejectNow : (this.r19ErrorNow ?? "Model R19 belum siap"),
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
      diag: this.buildDiagnostics(),
    };
  }

  private buildDiagnostics(): LabDiagnostics {
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
        this.r19TelemetryNow.state === "OTHER" &&
        this.fingerCountNow === 5 &&
        Boolean(this.r19TelemetryNow.fingers?.thumbOpen) &&
        (this.pose === "open-palm" || this.pose === "split-palm"),
      handStatus: ready ? this.handStatusNow : null,
      pipeline: dbg,
      strokes: { completed: strokes.completed.length, activePoints: strokes.active?.length ?? 0 },
      lastCommand: this.lastCommand ? { ...this.lastCommand } : null,
      commandCount: this.commandCount,
      commandMode: "swipe",
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
