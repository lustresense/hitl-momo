/**
 * Frame-by-frame analysis for the NUI test page. One MediaPipe result goes in; numbers and the
 * primary hand come out. It reuses the game's own pieces (primary-hand lock, pose classifier, drawing
 * smoother, ink pipeline) so the page shows what the drawing and the wave really see.
 */
import type { FaceBox } from "@/src/camera/face-anchor";
import { handSize, isLargeEnough, pickPrimaryHand, type PrimaryHandState } from "@/src/camera/primary-hand";
import { DEFAULT_LAB_ASPECT, LAB_PINCH_ENTER, LAB_PINCH_EXIT, PINCH_ENTER, PINCH_EXIT, LAB_FOLDED_PINCH_ENTER, LAB_FOLDED_PINCH_EXIT, TOUCH_FOLDED_INDEX, TOUCH_FOLDED_INDEX_EXIT, classifyHandPose, countExtendedFingers, evaluateGesture, fingerDiagnosticStates, indexTipNormalized, palmCenterNormalized, thumbDiagnostics, type FingerState, type HandPose, type ThumbDiagnostics } from "@/src/input/hand-gesture";
import { MODE_CANVAS_DRAWING, actionFor, type GestureAction } from "@/src/input/gesture-mode";
import type { HandCursor } from "@/src/input/hand-stroke-pipeline";
import { FullFrameHandLock, type LabLockStatus, type LabLockReason } from "./lab-hand-lock";
import { createGestureCommander } from "@/src/components/drawing/gesture-commands";
import { HandStrokePipeline, type PipelineDebug } from "@/src/input/hand-stroke-pipeline";
import { SwipeCommander, type SwipeDebug } from "./lab-swipe";
import type { EraserControl } from "@/src/input/eraser";
import { DRAWING_ONE_EURO, PointSmoother } from "@/src/input/smoothing";
import { StrokeStore, type Landmark, type RawStroke } from "@/src/input/types";
import { LAB_STILL_SPAN, WaveLabSampler, isStill, jitterStdDevPx, percentile } from "./lab-metrics";
import { classifyHandRoles, type HandRole } from "./lab-roles";
import { Ux3RuntimePipeline } from "./r18/ux3_integrated";
import type { Ux3ExportedModel } from "./r18/ux3_model";

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
  classifierMode: "baseline" | "experiment" | "r18";
  r18?: { label: string; conf: number | null; pinch: boolean; erase: boolean; swipe: string | null; pointing: boolean; direction: string; ms: number } | null;
  /** NUI-R17-01 developer diagnostics. Numbers only: no camera frames, no identity. */
  diag: LabDiagnostics;
}

export interface LabDiagnostics {
  /** Aspect the lab used for geometry (video width / height). */
  aspect: number;
  /** Pose of the primary hand this frame, before voting. */
  rawPose: HandPose;
  /** Pose after the 3-of-5 vote in the ink pipeline: what the actions follow. */
  stablePose: HandPose;
  /** Extended fingers 0..5 under the rule set in force (thumb included). */
  rawFingerCount: number;
  /** Count under the legacy thumb ratio, for the same frame. Equal to rawFingerCount in baseline mode. */
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
  /** "swipe" in experiment mode, "pose-hold" (300 ms, the game rule) in baseline. */
  commandMode: "swipe" | "pose-hold";
  swipe: SwipeDebug | null;
}

interface Timed<T> {
  t: number;
  v: T;
}

const recent = <T>(items: Timed<T>[], nowMs: number, windowMs: number): T[] =>
  items.filter((s) => nowMs - s.t >= 0 && nowMs - s.t <= windowMs).map((s) => s.v);

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
  private readonly gestureCommands = createGestureCommander();
  private readonly fullLock = new FullFrameHandLock();
  private liveCursor: HandCursor | null = null;
  private fingerCountNow = 0;
  private drawingActionNow: GestureAction | null = null;
  private pinchRatioNow: number | null = null;
  private fingerStatesNow: FingerState[] | null = null;
  private rejectNow = "Tangan belum aktif";
  private inkPermitted = false;
  private lastAcquisition = 0;
  private experimental = false;
  private r18Active = false;
  private r18Model: Ux3ExportedModel | null = null;
  private r18Pipeline: Ux3RuntimePipeline | null = null;
  private r18Aspect = 0;
  private r18Last: ReturnType<Ux3RuntimePipeline["step"]> | null = null;
  private r18Ms = 0;
  private armed = { draw: false, erase: false, commands: false };
  private aspect = DEFAULT_LAB_ASPECT;
  private readonly swipe = new SwipeCommander();
  private lastCommand: LabCommandResult | null = null;
  private commandCount = 0;
  private thumbNow: ThumbDiagnostics | null = null;
  private legacyCountNow = 0;
  private handStatusNow: string | null = null;
  constructor(private readonly options: { fullFrameLock?: boolean; enableInk?: boolean; experimentalRobust?: boolean } = {}) {
    if (options.experimentalRobust) this.setExperimentalMode(true, 0);
  }
  /** A candidate may control the cursor before it can execute its first gesture. */
  private canExecute(raw: HandPose, fingerCount: number): boolean {
    if (this.options.fullFrameLock !== true) return true;
    if (this.r18Active) {
      if (raw === "pinch" && !this.r18Last?.pinchActive) return false;
      if (fingerCount === 5 && (raw === "open-palm" || raw === "split-palm") && !this.r18Last?.eraseActive) return false;
    }
    if (raw === "pinch") return this.armed.draw;
    if (fingerCount === 5 && (raw === "open-palm" || raw === "split-palm")) return this.armed.erase;
    if (raw === "one-finger" || raw === "two-fingers") return this.armed.commands;
    return true;
  }
  /** Changing modes resets the ink FSM, not MediaPipe, for side-by-side field testing. */
  setExperimentalMode(enabled: boolean, nowMs: number): void {
    this.experimental = enabled;
    this.ink.setExperimentalRobust(enabled, nowMs);
    this.gestureCommands.reset();
    this.armed = { draw: false, erase: false, commands: false };
    this.swipe.reset();
    this.liveCursor = null;
    this.pinchRatioNow = null;
    this.fingerStatesNow = null;
    this.inkPermitted = false;
    this.rejectNow = "Mode berubah, tunggu gestur baru";
    this.r18Pipeline?.reset();
    this.r18Last = null;
  }

  /** R18 candidate is limited to NUI Lab, never game controls. */
  enableR18(model: Ux3ExportedModel, nowMs: number): void {
    this.r18Pipeline = new Ux3RuntimePipeline(model, this.aspect);
    this.r18Model = model;
    this.r18Aspect = this.aspect;
    this.r18Active = true;
    this.setExperimentalMode(true, nowMs);
  }

  disableR18(nowMs: number): void {
    this.r18Active = false;
    this.r18Pipeline?.reset();
    this.r18Last = null;
    this.r18Ms = 0;
    this.setExperimentalMode(this.experimental, nowMs);
  }

  private readonly ink = new HandStrokePipeline({
    store: this.store,
    size: () => INK_SIZE,
    eraser: INK_ERASER,
    aspect: () => this.aspect,
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
      ? landmarks.map((h, i): HandRole => !isLargeEnough(h) ? "far" : i === pick.index ? "primary" : "other")
      : classifyHandRoles(landmarks, pick.index, face);
    const lm = pick.index === null ? undefined : landmarks[pick.index];

    if (!lm) {
      this.primarySizeNow = null;
      this.pose = "none";
      // The lock expired: the next hand must not inherit this hand's filter state.
      if (strict || (pick as ReturnType<typeof pickPrimaryHand>).state === null) {
        this.rawTips = [];
        this.inkTips = [];
        this.inkSmoother.reset();
      }
      this.liveCursor = null;
      this.fingerCountNow = 0;
      this.legacyCountNow = 0;
      this.thumbNow = null;
      this.handStatusNow = null;
      this.swipe.cancel("no-hand");
      this.drawingActionNow = null;
      this.pinchRatioNow = null;
      this.fingerStatesNow = null;
      this.inkPermitted = false;
      this.rejectNow = strict ? this.fullLock.reason : "Tangan tidak ditemukan";
      this.r18Pipeline?.reset();
      this.r18Last = null;
      this.r18Ms = 0;
      this.ink.feed(undefined, nowMs);
      this.gestureCommands.feed("none", nowMs);
      this.feedWave(null, nowMs);
      return;
    }

    this.primarySizeNow = handSize(lm);
    if (strict && this.fullLock.acquisitionId !== this.lastAcquisition) {
      this.lastAcquisition = this.fullLock.acquisitionId;
      this.ink.reset(nowMs);
      this.gestureCommands.reset();
      this.swipe.cancel("new-acquisition");
      this.r18Pipeline?.reset();
      this.r18Last = null;
      this.armed = { draw: false, erase: false, commands: false };
      this.rawTips = [];
      this.inkTips = [];
      this.inkSmoother.reset();
    }
    this.pose = classifyHandPose(lm, { pinchHeld: this.pose === "pinch", experimentalRobust: this.experimental, aspect: this.aspect });
    this.fingerCountNow = countExtendedFingers(lm, { robustThumb: this.experimental, aspect: this.aspect });
    this.legacyCountNow = countExtendedFingers(lm);
    this.thumbNow = thumbDiagnostics(lm, this.aspect);
    const diag = evaluateGesture(lm, this.experimental ? this.aspect : 1);
    this.pinchRatioNow = diag.state === "tracking" ? diag.pinchRatio : null;
    this.fingerStatesNow = fingerDiagnosticStates(lm);
    if (this.r18Active && this.r18Model) {
      if (!this.r18Pipeline || Math.abs(this.r18Aspect - this.aspect) > 0.01) {
        this.r18Pipeline = new Ux3RuntimePipeline(this.r18Model, this.aspect);
        this.r18Aspect = this.aspect;
      }
      const c = palmCenterNormalized(lm);
      const w = lm[0]!;
      const scale = Math.max(
        Math.hypot((lm[9]!.x - w.x) * this.aspect, lm[9]!.y - w.y),
        Math.hypot((lm[17]!.x - lm[5]!.x) * this.aspect, lm[17]!.y - lm[5]!.y),
      );
      const t = performance.now();
      this.r18Last = this.r18Pipeline.step(lm, nowMs, this.pose, c.x, c.y, scale);
      this.r18Ms = performance.now() - t;
    }
    if (this.pose !== "pinch") this.armed.draw = true;
    if (!(this.fingerCountNow === 5 && (this.pose === "open-palm" || this.pose === "split-palm"))) this.armed.erase = true;
    if (this.pose !== "one-finger" && this.pose !== "two-fingers") this.armed.commands = true;
    this.inkPermitted = this.canExecute(this.pose, this.fingerCountNow);
    this.rejectNow = !this.inkPermitted ? "Tunggu gestur dilepas sebelum aksi baru"
      : this.pose === "pinch" && this.options.enableInk !== false ? "Pinch dibaca, menunggu validasi tinta"
      : "Tidak ada aksi gambar";
    const raw = indexTipNormalized(lm);
    this.rawTips.push({ t: nowMs, v: raw });
    this.inkTips.push({ t: nowMs, v: this.inkSmoother.smooth(raw, nowMs) });
    if (this.options.enableInk !== false) {
      const inkFrame = this.ink.feed(lm, nowMs);
      this.liveCursor = inkFrame.cursor;
      const mapped = actionFor(MODE_CANVAS_DRAWING, inkFrame.pose);
      const swipeMode = this.experimental;
      // In swipe mode a still undo/redo pose is only a ready state, never an action.
      this.drawingActionNow = !this.inkPermitted || (mapped === "erase" && this.fingerCountNow !== 5) || (swipeMode && (mapped === "undo" || mapped === "redo")) ? null : mapped;
      if (this.pose === "pinch" && this.store.hasActiveStroke()) this.rejectNow = "Tinta aktif";
      const allowed = this.canExecute(inkFrame.pose, this.fingerCountNow);
      let command: "undo" | "redo" | null = null;
      if (this.r18Active) {
        command = allowed && (!strict || this.fullLock.status === "locked") ? this.r18Last?.swipeAction ?? null : null;
      } else if (swipeMode) {
        const c = palmCenterNormalized(lm);
        const m = lm[9]!;
        const w = lm[0]!;
        command = this.swipe.feed({
          pose: inkFrame.pose,
          x: c.x * this.aspect,
          y: c.y,
          spanPx: Math.hypot((m.x - w.x) * this.aspect, m.y - w.y),
          nowMs,
          permitted: allowed && (!strict || this.fullLock.status === "locked"),
        });
      } else {
        command = this.gestureCommands.feed(allowed ? inkFrame.pose : "none", nowMs);
      }
      if (command) {
        const changed = command === "undo" ? this.store.undo() : this.store.redo();
        this.lastCommand = { kind: command, changed, atMs: nowMs, via: swipeMode ? "swipe" : "pose-hold" };
        this.commandCount += 1;
      }
    } else {
      this.liveCursor = null;
      this.drawingActionNow = null;
      this.gestureCommands.feed("none", nowMs);
    }
    this.handStatusNow = this.computeHandStatus();
    // The wave rule scales its swing with the hand's own size, as the game does.
    this.feedWave(lm[0] ?? null, nowMs, this.primarySizeNow, face);
  }

  /** Honest Hapus-path status (NUI-R17-02 step 6): says what is actually true this frame, never a made-up success. */
  private computeHandStatus(): string | null {
    const palm = this.pose === "open-palm" || this.pose === "split-palm";
    const dbg = this.ink.debugState();
    if (dbg.erasing) return dbg.lastEraseHit === false ? "TIDAK ADA STROKE DI AREA" : "HAPUS AKTIF";
    if (!palm) return null;
    if (this.fingerCountNow !== 5) return "LANDMARK ADA / 5 JARI BELUM TERBACA";
    const stablePalm = dbg.stable === "open-palm" || dbg.stable === "split-palm";
    if (!stablePalm) return "5 JARI TERBACA / STABILISASI";
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

  /** Forgets all hands, filters and the wave test (camera stopped). */
  reset(nowMs: number): void {
    this.ink.reset(nowMs);
    this.fullLock.reset();
    this.gestureCommands.reset();
    this.swipe.reset();
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
    this.rejectNow = "Kamera belum membaca tangan";
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
    this.r18Pipeline?.reset();
    this.r18Last = null;
    this.r18Ms = 0;
  }

  /** Manual recovery remains an escape hatch. Normal reacquisition is automatic after empty frames. */
  resetHandLock(nowMs: number): void {
    this.fullLock.reset();
    this.lastAcquisition = 0;
    this.armed = { draw: false, erase: false, commands: false };
    this.ink.reset(nowMs);
    this.gestureCommands.reset();
    this.swipe.reset();
    this.liveCursor = null;
    this.fingerCountNow = 0;
    this.drawingActionNow = null;
    this.pinchRatioNow = null;
    this.fingerStatesNow = null;
    this.inkPermitted = false;
    this.rejectNow = "Kunci manual diulang";
    this.primaryIdx = null;
    this.primary = null;
    this.rawTips = [];
    this.inkTips = [];
    this.inkSmoother.reset();
    this.r18Pipeline?.reset();
    this.r18Last = null;
    this.r18Ms = 0;
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
    this.gestureCommands.reset();
    this.swipe.cancel("manual-canvas-action");
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
    return {
      handCount: this.hands.length,
      farHandCount: this.hands.filter((h) => !isLargeEnough(h)).length,
      primaryIndex: this.primaryIdx,
      primarySize: this.primaryIdx === null ? null : this.primarySizeNow,
      pose: this.primaryIdx === null ? "none" : this.pose,
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
      cursor: this.liveCursor ? { ...this.liveCursor } : null,
      fingerCount: this.fingerCountNow,
      drawingAction: this.drawingActionNow,
      lockStatus: this.options.fullFrameLock
        ? this.fullLock.status
        : this.primaryIdx !== null ? "locked" : "waiting",
      lockReason: this.options.fullFrameLock ? this.fullLock.reason : null,
      acquisitionId: this.options.fullFrameLock ? this.fullLock.acquisitionId : 0,
      pinchRatio: this.pinchRatioNow,
      pinchEnter: this.experimental ? LAB_PINCH_ENTER : PINCH_ENTER,
      pinchExit: this.experimental ? LAB_PINCH_EXIT : PINCH_EXIT,
      foldedPinchEnter: this.experimental ? LAB_FOLDED_PINCH_ENTER : TOUCH_FOLDED_INDEX,
      foldedPinchExit: this.experimental ? LAB_FOLDED_PINCH_EXIT : TOUCH_FOLDED_INDEX_EXIT,
      fingerStates: this.fingerStatesNow ? [...this.fingerStatesNow] : null,
      inkAllowed: this.inkPermitted && this.options.enableInk !== false,
      rejectionReason: this.rejectNow,
      classifierMode: this.r18Active ? "r18" : this.experimental ? "experiment" : "baseline",
      r18: this.r18Active && this.r18Last ? {
        label: this.r18Last.topLabel,
        conf: this.r18Last.probs ? Math.max(...this.r18Last.probs) : null,
        pinch: this.r18Last.pinchActive,
        erase: this.r18Last.eraseActive,
        swipe: this.r18Last.swipeAction,
        pointing: this.r18Last.steer.pointingOk,
        direction: this.r18Last.steer.input.left ? "Kiri" : this.r18Last.steer.input.right ? "Kanan" : this.r18Last.steer.input.jump ? "Lompat" : "Netral",
        ms: this.r18Ms,
      } : null,
      diag: this.buildDiagnostics(),
    };
  }

  private buildDiagnostics(): LabDiagnostics {
    const dbg = this.primaryIdx === null ? null : this.ink.debugState();
    const strokes = this.store.getStrokes();
    return {
      aspect: this.aspect,
      rawPose: this.primaryIdx === null ? "none" : this.pose,
      stablePose: dbg?.stable ?? "none",
      rawFingerCount: this.fingerCountNow,
      legacyFingerCount: this.legacyCountNow,
      thumb: this.thumbNow,
      armed: { ...this.armed },
      fiveFingerValid: this.fingerCountNow === 5 && (this.pose === "open-palm" || this.pose === "split-palm"),
      handStatus: this.handStatusNow,
      pipeline: dbg,
      strokes: { completed: strokes.completed.length, activePoints: strokes.active?.length ?? 0 },
      lastCommand: this.lastCommand ? { ...this.lastCommand } : null,
      commandCount: this.commandCount,
      commandMode: this.experimental ? "swipe" : "pose-hold",
      swipe: this.experimental ? this.swipe.debug() : null,
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
