/**
 * The one gate for MediaPipe detectForVideo calls (PANDUAN §3, §8). Every camera reader asks here before it reads a
 * frame, so the main thread is not blocked more than the budget allows.
 *
 * - One read per camera frame: a frame is its video element plus currentTime. A second reader asking about the same
 *   frame gets the first reader's result instead of a second detectForVideo call.
 * - Latest frame wins: nothing is queued. A reader that asks gets the frame the camera shows now.
 * - Adaptive budget: a detection may take about BUDGET_SHARE of wall time. The next one starts no sooner than
 *   avg(duration) / BUDGET_SHARE after the last start, and never later than MAX_INTERVAL_MS (the 8 Hz floor).
 *   A detection slower than the floor cannot be made faster here; the floor only means no extra wait is added.
 *
 * Detection is synchronous, so only one inference runs at a time by construction.
 */

/** Share of wall time a detection may use. 20 ms of inference therefore starts at most every ~57 ms. */
export const BUDGET_SHARE = 0.35;
/** Floor of 8 detections a second: the gap never grows beyond this. */
export const MIN_DETECTIONS_PER_SECOND = 8;
export const MAX_INTERVAL_MS = 1000 / MIN_DETECTIONS_PER_SECOND;
/** How many recent detections the moving average uses. */
const DURATION_WINDOW = 8;
/** Window for the effective rate reported in the stats. */
const RATE_WINDOW_MS = 1000;
const MAX_STARTS_KEPT = 64;

export interface InferenceStats {
  /** Moving average of the detection time (ms), null before the first detection. */
  avgMs: number | null;
  /** Duration of the last detection (ms), null before the first one. */
  lastMs: number | null;
  /** Detections started in the last second. */
  effectiveHz: number;
  /** Current minimum gap between two detection starts (ms); 0 before the first measurement. */
  minIntervalMs: number;
  /** Detections run so far. */
  detections: number;
  /** Camera frames that the budget let pass without a detection. */
  skippedFrames: number;
}

export interface InferenceSchedulerOptions {
  now(): number;
}

interface Frame {
  video: HTMLVideoElement;
  time: number;
}

function sameFrame(frame: Frame | null | undefined, video: HTMLVideoElement, time: number): boolean {
  return !!frame && frame.video === video && frame.time === time;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export class InferenceScheduler {
  private readonly durations: number[] = [];
  private readonly starts: number[] = [];
  private lastStart: number | null = null;
  private lastMs: number | null = null;
  private detections = 0;
  private skippedFrames = 0;
  private lastSeen: Frame | null = null;
  /** The newest frame that was read, and its result: the copy every other reader of that frame gets. */
  private shared: { frame: Frame; value: unknown } | null = null;
  /** Per reader: the frame it was last given. */
  private readonly delivered = new WeakMap<object, Frame>();
  private lastTimestamp = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: InferenceSchedulerOptions) {}

  /** Smallest gap between two detection starts now (ms). Grows with the measured cost, capped at the floor. */
  minIntervalMs(): number {
    if (this.durations.length === 0) return 0;
    return Math.min(MAX_INTERVAL_MS, mean(this.durations) / BUDGET_SHARE);
  }

  /**
   * Asks for the result of this camera frame. Returns the result when this reader has not had this frame yet, and
   * null when there is nothing new for it now (already delivered, or skipped by the budget). `detect` receives a
   * monotonic timestamp for detectForVideo and must do the frame preparation itself.
   */
  poll<T>(reader: object, video: HTMLVideoElement, detect: (timestampMs: number) => T): T | null {
    const time = video.currentTime;
    const frame: Frame = { video, time };

    if (this.shared && sameFrame(this.shared.frame, video, time)) {
      if (sameFrame(this.delivered.get(reader), video, time)) return null;
      this.delivered.set(reader, frame);
      return this.shared.value as T;
    }

    const now = this.options.now();
    // A clock that went backwards (a restored page, a test clock) must not hold the budget closed.
    if (this.lastStart !== null && now < this.lastStart) this.lastStart = null;
    const fresh = !sameFrame(this.lastSeen, video, time);
    this.lastSeen = frame;
    if (this.lastStart !== null && now - this.lastStart < this.minIntervalMs()) {
      if (fresh) this.skippedFrames++;
      return null;
    }

    this.lastStart = now;
    this.recordStart(now);
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    let value: T;
    try {
      value = detect(timestamp);
    } finally {
      this.recordDuration(Math.max(0, this.options.now() - now));
    }
    this.shared = { frame, value };
    this.delivered.set(reader, frame);
    this.detections++;
    return value;
  }

  getStats(): InferenceStats {
    const now = this.options.now();
    const effectiveHz = this.starts.filter((s) => now - s >= 0 && now - s < RATE_WINDOW_MS).length;
    return {
      avgMs: this.durations.length ? mean(this.durations) : null,
      lastMs: this.lastMs,
      effectiveHz,
      minIntervalMs: this.minIntervalMs(),
      detections: this.detections,
      skippedFrames: this.skippedFrames,
    };
  }

  private recordStart(now: number): void {
    this.starts.push(now);
    while (this.starts.length > MAX_STARTS_KEPT || (this.starts[0] !== undefined && now - this.starts[0] >= RATE_WINDOW_MS)) {
      this.starts.shift();
    }
  }

  private recordDuration(ms: number): void {
    this.lastMs = ms;
    this.durations.push(ms);
    if (this.durations.length > DURATION_WINDOW) this.durations.shift();
  }
}

let defaultScheduler = new InferenceScheduler({ now: () => performance.now() });

/** The app-wide gate. See InferenceScheduler.poll. */
export function pollDetection<T>(reader: object, video: HTMLVideoElement, detect: (timestampMs: number) => T): T | null {
  return defaultScheduler.poll(reader, video, detect);
}

/** Detection timing for the lab page and any status line: moving average, last duration, Hz, skipped frames. */
export function getInferenceStats(): InferenceStats {
  return defaultScheduler.getStats();
}

/** TEST ONLY: a fresh gate with no history. */
export function resetInferenceSchedulerForTest(): void {
  defaultScheduler = new InferenceScheduler({ now: () => performance.now() });
}
