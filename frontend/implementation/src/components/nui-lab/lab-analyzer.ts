/**
 * Frame-by-frame analysis for the NUI test page. One MediaPipe result goes in; numbers and the
 * primary hand come out. It reuses the game's own pieces (primary-hand lock, pose classifier, drawing
 * smoother, ink pipeline) so the page shows what the drawing and the wave really see.
 */
import type { FaceBox } from "@/src/camera/face-anchor";
import { handSize, isLargeEnough, pickPrimaryHand, type PrimaryHandState } from "@/src/camera/primary-hand";
import { PINCH_ENTER, PINCH_EXIT, LAB_FOLDED_PINCH_ENTER, LAB_FOLDED_PINCH_EXIT, TOUCH_FOLDED_INDEX, TOUCH_FOLDED_INDEX_EXIT, classifyHandPose, countExtendedFingers, evaluateGesture, fingerDiagnosticStates, indexTipNormalized, type FingerState, type HandPose } from "@/src/input/hand-gesture";
import { MODE_CANVAS_DRAWING, actionFor, type GestureAction } from "@/src/input/gesture-mode";
import type { HandCursor } from "@/src/input/hand-stroke-pipeline";
import { FullFrameHandLock, type LabLockStatus, type LabLockReason } from "./lab-hand-lock";
import { createGestureCommander } from "@/src/components/drawing/gesture-commands";
import { HandStrokePipeline } from "@/src/input/hand-stroke-pipeline";
import type { EraserControl } from "@/src/input/eraser";
import { DRAWING_ONE_EURO, PointSmoother } from "@/src/input/smoothing";
import { StrokeStore, type Landmark, type RawStroke } from "@/src/input/types";
import { LAB_STILL_SPAN, WaveLabSampler, isStill, jitterStdDevPx, percentile } from "./lab-metrics";
import { classifyHandRoles, type HandRole } from "./lab-roles";

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
  classifierMode: "baseline" | "experiment";
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
  private readonly store = new StrokeStore();
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
  private armed = { draw: false, erase: false, commands: false };
  constructor(private readonly options: { fullFrameLock?: boolean; enableInk?: boolean; experimentalRobust?: boolean } = {}) {
    if (options.experimentalRobust) this.setExperimentalMode(true, 0);
  }
  /** A candidate may control the cursor before it can execute its first gesture. */
  private canExecute(raw: HandPose, fingerCount: number): boolean {
    if (this.options.fullFrameLock !== true) return true;
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
    this.liveCursor = null;
    this.pinchRatioNow = null;
    this.fingerStatesNow = null;
    this.inkPermitted = false;
    this.rejectNow = "Mode berubah, tunggu gestur baru";
  }

  private readonly ink = new HandStrokePipeline({
    store: this.store,
    size: () => INK_SIZE,
    eraser: INK_ERASER,
    canPerformAction: (pose, fingers) => this.canExecute(pose, fingers),
  });

  analyse({ landmarks, inferMs, nowMs, face = null }: LabDetection): void {
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
      this.drawingActionNow = null;
      this.pinchRatioNow = null;
      this.fingerStatesNow = null;
      this.inkPermitted = false;
      this.rejectNow = strict ? this.fullLock.reason : "Tangan tidak ditemukan";
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
      this.armed = { draw: false, erase: false, commands: false };
      this.rawTips = [];
      this.inkTips = [];
      this.inkSmoother.reset();
    }
    this.pose = classifyHandPose(lm, { pinchHeld: this.pose === "pinch", experimentalRobust: this.experimental });
    this.fingerCountNow = countExtendedFingers(lm);
    const diag = evaluateGesture(lm);
    this.pinchRatioNow = diag.state === "tracking" ? diag.pinchRatio : null;
    this.fingerStatesNow = fingerDiagnosticStates(lm);
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
      this.drawingActionNow = !this.inkPermitted || (mapped === "erase" && this.fingerCountNow !== 5) ? null : mapped;
      if (this.pose === "pinch" && this.store.hasActiveStroke()) this.rejectNow = "Tinta aktif";
      const command = this.gestureCommands.feed(this.canExecute(inkFrame.pose, this.fingerCountNow) ? inkFrame.pose : "none", nowMs);
      if (command === "undo") this.store.undo();
      if (command === "redo") this.store.redo();
    } else {
      this.liveCursor = null;
      this.drawingActionNow = null;
      this.gestureCommands.feed("none", nowMs);
    }
    // The wave rule scales its swing with the hand's own size, as the game does.
    this.feedWave(lm[0] ?? null, nowMs, this.primarySizeNow, face);
  }

  /** Starts (or restarts) the wave test on the primary wrist. */
  startWaveTest(): void {
    this.sampler.reset();
    this.waveStatus = "running";
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
  }

  /** Manual recovery remains an escape hatch. Normal reacquisition is automatic after empty frames. */
  resetHandLock(nowMs: number): void {
    this.fullLock.reset();
    this.lastAcquisition = 0;
    this.armed = { draw: false, erase: false, commands: false };
    this.ink.reset(nowMs);
    this.gestureCommands.reset();
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
      pinchEnter: PINCH_ENTER,
      pinchExit: PINCH_EXIT,
      foldedPinchEnter: this.experimental ? LAB_FOLDED_PINCH_ENTER : TOUCH_FOLDED_INDEX,
      foldedPinchExit: this.experimental ? LAB_FOLDED_PINCH_EXIT : TOUCH_FOLDED_INDEX_EXIT,
      fingerStates: this.fingerStatesNow ? [...this.fingerStatesNow] : null,
      inkAllowed: this.inkPermitted && this.options.enableInk !== false,
      rejectionReason: this.rejectNow,
      classifierMode: this.experimental ? "experiment" : "baseline",
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
