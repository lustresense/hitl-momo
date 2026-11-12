/**
 * Frame-by-frame analysis for the NUI test page. One MediaPipe result goes in; numbers and the
 * primary hand come out. It reuses the game's own pieces (primary-hand lock, pose classifier, drawing
 * smoother, ink pipeline) so the page shows what the drawing and the wave really see.
 */
import type { FaceBox } from "@/src/camera/face-anchor";
import { handSize, isLargeEnough, pickPrimaryHand, type PrimaryHandState } from "@/src/camera/primary-hand";
import { classifyHandPose, indexTipNormalized, type HandPose } from "@/src/input/hand-gesture";
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
const INK_SIZE = { width: 400, height: 300 };
/** Eraser radius for the scratch canvas only; the lab never erases on a real surface. */
const INK_ERASER: EraserControl = {
  radiusCanvasPx: () => 16,
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
  private readonly ink = new HandStrokePipeline({
    store: this.store,
    size: () => INK_SIZE,
    eraser: INK_ERASER,
  });

  analyse({ landmarks, inferMs, nowMs, face = null }: LabDetection): void {
    this.inferSamples.push({ t: nowMs, v: inferMs });
    this.detectTimes.push(nowMs);
    this.hands = landmarks;
    this.face = face;

    const pick = pickPrimaryHand(landmarks, this.primary, nowMs, face);
    this.primary = pick.state;
    this.primaryIdx = pick.index;
    this.roles = classifyHandRoles(landmarks, pick.index, face);
    const lm = pick.index === null ? undefined : landmarks[pick.index];

    if (!lm) {
      this.primarySizeNow = null;
      this.pose = "none";
      // The lock expired: the next hand must not inherit this hand's filter state.
      if (pick.state === null) {
        this.rawTips = [];
        this.inkTips = [];
        this.inkSmoother.reset();
      }
      this.ink.feed(undefined, nowMs);
      this.feedWave(null, nowMs);
      return;
    }

    this.primarySizeNow = handSize(lm);
    this.pose = classifyHandPose(lm, { pinchHeld: this.pose === "pinch" });
    const raw = indexTipNormalized(lm);
    this.rawTips.push({ t: nowMs, v: raw });
    this.inkTips.push({ t: nowMs, v: this.inkSmoother.smooth(raw, nowMs) });
    this.ink.feed(lm, nowMs);
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

  /** Strokes of the scratch ink canvas (canvas px). */
  strokes(): { completed: RawStroke[]; active: RawStroke | null } {
    return this.store.getStrokes();
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
