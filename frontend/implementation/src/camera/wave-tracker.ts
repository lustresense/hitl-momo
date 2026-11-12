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
 * - with a face in view, only a hand near that face counts (face-anchor.ts, primary-hand.ts).
 */
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { delegateLabel } from "./hand-landmarker";
import { takeHandLandmarker } from "./landmarker-warmup";
import { classifyCameraError, messageFor, type CameraFailureReason } from "./messages";
import { frameForDetection } from "./frame-source";
import { pollDetection } from "./inference-scheduler";
import { pickPrimaryHand, type PrimaryHandState } from "./primary-hand";
import { FaceAnchor, type FaceBox, type FaceSource } from "./face-anchor";

export interface WaveSample {
  x: number;
  time: number;
}

/*
 * Wave rule: the wrist sweeps left and right, and turns at least WAVE_MIN_REVERSALS times within WAVE_WINDOW_MS.
 * Each leg (one direction of the sweep) must cover a minimum distance that scales with the hand size, so a small,
 * far hand still counts and a jitter of a few pixels does not. Two turns are a left-right-left sweep, about 1.5 swings.
 *
 * Earlier rule: it also needed the wrist back near its start (0.18), a span of 0.16 and 2 swings of 0.05. The return
 * check delayed the wave by up to a full swing, and the span rule never fired for a normal sweep of a small reach.
 */
/** Samples older than this are dropped. With real timestamps, a slower detection rate only means fewer samples. */
export const WAVE_WINDOW_MS = 1000;
export const WAVE_MIN_SAMPLES = 6;
export const WAVE_MIN_REVERSALS = 2;
/** A leg must cover this share of the hand size ... */
export const WAVE_LEG_RATIO = 0.25;
/** ... but never less than this (normalised frame units), so a far hand's jitter is not a sweep. */
export const WAVE_MIN_LEG = 0.03;
/** Hand size assumed when the caller gives none (a hand about 30 % of the frame). */
export const WAVE_DEFAULT_HAND_SIZE = 0.3;
/**
 * The face box may move this far (share of its width) during one sweep before the sweep starts again: a head turn
 * carries a hand held on the head sideways in the picture, and that is not a wave.
 */
export const FACE_STILL_SHIFT = 0.6;

/** Minimum leg (normalised) for a hand of this size. */
export function waveLeg(handSize: number): number {
  return Math.max(WAVE_MIN_LEG, WAVE_LEG_RATIO * handSize);
}

/** Number of swings: direction reversals that each move at least `minSwing`. */
export function countSwings(values: number[], minSwing = WAVE_MIN_LEG): number {
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

/** Pure wake-up wave rule (see the note above). `handSize` scales the minimum leg. */
export function detectWave(samples: WaveSample[], handSize = WAVE_DEFAULT_HAND_SIZE): boolean {
  if (samples.length < WAVE_MIN_SAMPLES) return false;
  return countSwings(samples.map((s) => s.x), waveLeg(handSize)) >= WAVE_MIN_REVERSALS;
}

/**
 * 0..1 progress toward the wave rule for the cincin lambaian: the share of the required turns made so far.
 * It reaches 1 exactly when detectWave fires (same turns, same leg).
 */
export function waveProgress(samples: WaveSample[], handSize = WAVE_DEFAULT_HAND_SIZE): number {
  if (samples.length === 0) return 0;
  const swings = countSwings(samples.map((s) => s.x), waveLeg(handSize));
  return Math.max(0, Math.min(1, swings / WAVE_MIN_REVERSALS));
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
  /** Where the player's face is. Default: a FaceAnchor (falls back to the plain hand rule without a face model). */
  face?: FaceSource;
}

const MAX_CONSECUTIVE_DETECT_FAILURES = 3;

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
  /** Face centre x when the current sweep began; a head turn that moves it restarts the sweep. */
  private sweepFaceCx: number | null = null;
  private progressValue = 0;
  private readonly progressListeners = new Set<(progress: number) => void>();
  private readonly face: FaceSource;

  constructor(private readonly options: WaveTrackerOptions) {
    this.face = options.face ?? new FaceAnchor();
  }

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
      this.sweepFaceCx = null;
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
    this.sweepFaceCx = null;
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

  /** Starts the sweep again: the samples go, and the face (if any) becomes the new reference. */
  private restartSweep(faceCx: number | null): void {
    this.samples = [];
    this.sweepFaceCx = faceCx;
    this.setProgress(0);
  }

  private loop = (): void => {
    const video = this.options.getVideo();
    const landmarker = this.landmarker;
    if (!video || !landmarker || this.reported) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (typeof document !== "undefined" && document.hidden) return;
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    let result: HandLandmarkerResult | null;
    try {
      // The shared gate may skip this camera frame (budget) or hand back another reader's result for it.
      result = pollDetection(this, video, (ts) => landmarker.detectForVideo(frameForDetection(video), ts));
      this.failures = 0;
    } catch {
      this.failures++;
      if (this.failures >= MAX_CONSECUTIVE_DETECT_FAILURES) {
        this.release();
        this.options.onStatus?.({ kind: "error", reason: "tracker-error", message: messageFor("tracker-error") });
      }
      return;
    }
    if (!result) return;
    const now = performance.now();
    // The face has its own, slower clock (face-anchor.ts). It only narrows which hand is the player's.
    this.face.update(video, now);
    const face: FaceBox | null = this.face.current(now);
    const pick = pickPrimaryHand(result.landmarks, this.primary, now, face);
    this.primary = pick.state;
    const wrist = pick.index === null ? undefined : result.landmarks[pick.index]?.[0];
    if (!wrist) {
      // A blurred or dropped frame keeps the sweep; only a longer gap restarts it.
      this.missingFrames++;
      if (this.missingFrames > WAVE_MAX_MISSING_FRAMES) this.restartSweep(null);
      return;
    }
    this.missingFrames = 0;
    if (face) {
      const cx = face.x + face.w / 2;
      if (this.sweepFaceCx === null) this.sweepFaceCx = cx;
      else if (Math.abs(cx - this.sweepFaceCx) > FACE_STILL_SHIFT * face.w) this.restartSweep(cx);
    }
    this.samples.push({ x: wrist.x, time: now });
    while (this.samples.length && now - this.samples[0]!.time > WAVE_WINDOW_MS) this.samples.shift();
    const handSize = pick.state?.size ?? WAVE_DEFAULT_HAND_SIZE;
    this.setProgress(waveProgress(this.samples, handSize));
    if (detectWave(this.samples, handSize)) {
      this.reported = true;
      this.setProgress(1);
      this.release();
      this.options.onWave();
    }
  };
}
