/**
 * Wake-up wave detector used by GlobalCamera.
 *
 * Owns exactly one HandLandmarker + one rAF loop. Guarantees:
 * - start()/stop() are race-safe (a landmarker that finishes loading after
 *   stop() is closed, never leaked; double start() is a no-op);
 * - detectForVideo is wrapped: 3 consecutive throws end the loop and report a
 *   short Indonesian reason instead of silently dying;
 * - no inference while document.hidden, none when video.currentTime is unchanged;
 * - after the wave is reported the loop and landmarker are released at once.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { delegateLabel } from "./hand-landmarker";
import { takeHandLandmarker } from "./landmarker-warmup";
import { classifyCameraError, messageFor, type CameraFailureReason } from "./messages";
import { frameForDetection } from "./frame-source";
import { pickPrimaryHand, type PrimaryHandState } from "./primary-hand";

export interface WaveSample {
  x: number;
  time: number;
}

/*
 * Wave calibration (lambaian di webcam biasa; motion blur memperkecil ayunan).
 * Old rule: >= 8 samples, span > 0.22, returns within 0.18, no swing count.
 * New rule: >= 6 samples, span >= 0.16, returns within 0.18, and at least two swings of >= 0.05 each
 * (a left-right-left sweep). Fewer samples and a smaller span catch a blurred wave; the two swings keep a
 * single slow lean or a one-way slide from counting as a wave.
 */
export const WAVE_MIN_SAMPLES = 6;
export const WAVE_MIN_SPAN = 0.16;
export const WAVE_RETURN_TOLERANCE = 0.18;
export const WAVE_MIN_SWINGS = 2;
export const WAVE_MIN_SWING_SPAN = 0.05;

/** Number of swings: direction reversals that each move at least `minSwing`. */
export function countSwings(values: number[], minSwing = WAVE_MIN_SWING_SPAN): number {
  if (values.length < 2) return 0;
  let swings = 0;
  let dir = 0; // 0 = not yet moving, 1 = rising, -1 = falling
  let extreme = values[0]!;
  for (const x of values.slice(1)) {
    if (dir === 0) {
      if (Math.abs(x - extreme) >= minSwing) {
        dir = Math.sign(x - extreme);
        extreme = x;
      }
    } else if (dir > 0) {
      if (x > extreme) extreme = x;
      else if (extreme - x >= minSwing) {
        swings++;
        dir = -1;
        extreme = x;
      }
    } else if (x < extreme) extreme = x;
    else if (x - extreme >= minSwing) {
      swings++;
      dir = 1;
      extreme = x;
    }
  }
  return swings;
}

/** Pure wake-up wave rule (see the calibration note above). */
export function detectWave(samples: WaveSample[]): boolean {
  if (samples.length < WAVE_MIN_SAMPLES) return false;
  const values = samples.map((s) => s.x);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const span = Math.max(...values) - Math.min(...values);
  return span >= WAVE_MIN_SPAN && Math.abs(last - first) < WAVE_RETURN_TOLERANCE && countSwings(values) >= WAVE_MIN_SWINGS;
}

/**
 * 0..1 progress toward the wave rule for the cincin lambaian: the smaller of the swing share and the span share.
 * It reaches 1 exactly when the sweep and the swings are there; the return to the start is checked by detectWave.
 */
export function waveProgress(samples: WaveSample[]): number {
  if (samples.length === 0) return 0;
  const values = samples.map((s) => s.x);
  const span = Math.max(...values) - Math.min(...values);
  const swings = countSwings(values);
  const p = Math.min(1, swings / WAVE_MIN_SWINGS, span / WAVE_MIN_SPAN);
  return Math.max(0, p);
}

/** Frames without a hand that a wave survives (a blurred frame or a dropped detection), before the sweep restarts. */
export const WAVE_MAX_MISSING_FRAMES = 3;

export type WaveTrackerStatus =
  | { kind: "ready"; delegate: string }
  | { kind: "error"; reason: CameraFailureReason; message: string };

export interface WaveTrackerOptions {
  getVideo(): HTMLVideoElement | null;
  modelUrl(): string;
  wasmRoot?: string;
  onWave(): void;
  onStatus?(status: WaveTrackerStatus): void;
}

const MAX_CONSECUTIVE_DETECT_FAILURES = 3;
const WINDOW_MS = 1300;

export class WaveTracker {
  private landmarker: HandLandmarker | null = null;
  private rafId: number | null = null;
  private generation = 0;
  private starting = false;
  private reported = false;
  private lastVideoTime = -1;
  private failures = 0;
  private samples: WaveSample[] = [];
  private missingFrames = 0;
  /** The player's hand, locked across frames so a second person's hand never feeds the sweep. */
  private primary: PrimaryHandState | null = null;
  private progressValue = 0;
  private readonly progressListeners = new Set<(progress: number) => void>();

  constructor(private readonly options: WaveTrackerOptions) {}

  /** 0..1 progress toward the wave (drives the cincin lambaian). */
  get progress(): number {
    return this.progressValue;
  }

  /** Hears the progress now and on every change (rounded to 0.01). Returns the unsubscribe function. */
  subscribeProgress(listener: (progress: number) => void): () => void {
    this.progressListeners.add(listener);
    listener(this.progressValue);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  private setProgress(next: number): void {
    const rounded = Math.round(Math.min(1, Math.max(0, next)) * 100) / 100;
    if (rounded === this.progressValue) return;
    this.progressValue = rounded;
    for (const l of [...this.progressListeners]) l(rounded);
  }

  /** True while a landmarker exists or is being created. */
  get active(): boolean {
    return this.starting || this.landmarker !== null || this.reported;
  }

  async start(): Promise<void> {
    if (this.active) return;
    const gen = ++this.generation;
    this.starting = true;
    try {
      // Takes the warm instance when the cover pre-loaded it (cold start), else builds one.
      const created = await takeHandLandmarker({
        wasmRoot: this.options.wasmRoot ?? "/mediapipe/wasm",
        modelUrl: this.options.modelUrl(),
      });
      if (gen !== this.generation) {
        // stop() (or a newer start) happened while loading: close, never leak.
        try { created.landmarker.close(); } catch { /* best-effort */ }
        return;
      }
      this.landmarker = created.landmarker;
      this.samples = [];
      this.missingFrames = 0;
      this.failures = 0;
      this.lastVideoTime = -1;
      this.primary = null;
      this.options.onStatus?.({ kind: "ready", delegate: delegateLabel(created) });
      this.loop();
    } catch (err) {
      if (gen !== this.generation) return;
      // The camera preview stays usable; the wave detector is optional.
      const reason = classifyCameraError(err);
      this.options.onStatus?.({ kind: "error", reason: "model-error", message: messageFor(reason === "tracker-error" ? "model-error" : reason) });
    } finally {
      if (gen === this.generation) this.starting = false;
    }
  }

  stop(): void {
    this.generation++;
    this.starting = false;
    this.reported = false;
    this.release();
    this.samples = [];
    this.primary = null;
    this.missingFrames = 0;
    this.lastVideoTime = -1;
    this.failures = 0;
    this.setProgress(0);
  }

  private release(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const lm = this.landmarker;
    this.landmarker = null;
    try {
      lm?.close();
    } catch {
      /* best-effort */
    }
  }

  private loop = (): void => {
    const video = this.options.getVideo();
    const landmarker = this.landmarker;
    if (!video || !landmarker || this.reported) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (typeof document !== "undefined" && document.hidden) return;
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    let result;
    try {
      result = landmarker.detectForVideo(frameForDetection(video), performance.now());
      this.failures = 0;
    } catch {
      this.failures++;
      if (this.failures >= MAX_CONSECUTIVE_DETECT_FAILURES) {
        this.release();
        this.options.onStatus?.({ kind: "error", reason: "tracker-error", message: messageFor("tracker-error") });
      }
      return;
    }
    const now = performance.now();
    const pick = pickPrimaryHand(result.landmarks, this.primary, now);
    this.primary = pick.state;
    const wrist = pick.index === null ? undefined : result.landmarks[pick.index]?.[0];
    if (!wrist) {
      // A blurred or dropped frame keeps the sweep; only a longer gap restarts it.
      this.missingFrames++;
      if (this.missingFrames > WAVE_MAX_MISSING_FRAMES) {
        this.samples = [];
        this.setProgress(0);
      }
      return;
    }
    this.missingFrames = 0;
    this.samples.push({ x: wrist.x, time: now });
    while (this.samples.length && now - this.samples[0]!.time > WINDOW_MS) this.samples.shift();
    this.setProgress(waveProgress(this.samples));
    if (detectWave(this.samples)) {
      this.reported = true;
      this.setProgress(1);
      this.release();
      this.options.onWave();
    }
  };
}
