/**
 * The one gate for MediaPipe detectForVideo calls (PANDUAN §3, §8). Every camera reader asks here before it reads a
 * frame, so the main thread is not blocked more than the budget allows. Hand and face share this gate (one budget).
 *
 * - One read per camera frame, across models: a frame is its video element plus currentTime. Once a frame has been
 *   read, a second reader of the same model gets that result, and a reader of the other model gets nothing. Two
 *   inferences never run on one frame, and a hand result never reaches the face reader (or the reverse).
 * - Latest frame wins: nothing is queued. A reader that asks gets the frame the camera shows now.
 * - Adaptive budget: a detection may take about BUDGET_SHARE of wall time. The next one starts no sooner than
 *   avg(duration) / BUDGET_SHARE after the last start, and never later than MAX_INTERVAL_MS (the 8 Hz floor).
 * - Hard cap: the 8 Hz floor gives way to the busy cap. A detection never takes more than MAX_BUSY_SHARE of wall
 *   time, so a 1 s detection waits 2 s and the main thread (typing, timers, input) gets the rest. The cap is on
 *   the total of all models: the gap is set from the durations of every model.
 * - Lanes: the hand is the primary lane. The face is a secondary lane: it has its own rate cap (4 Hz) and yields to
 *   the hand, but gets a slot at least every SECONDARY_MAX_WAIT_MS, so its box never goes stale while the hand is busy.
 *
 * Detection is synchronous, so only one inference runs at a time by construction.
 */
import { FACE_DETECTIONS_PER_SECOND } from "./hand-config";

/** Share of wall time a detection may use. 20 ms of inference therefore starts at most every ~57 ms. */
export const BUDGET_SHARE = 0.35;
/** Floor of 8 detections a second: the budget gap never grows beyond this (a slow detection can still widen it). */
export const MIN_DETECTIONS_PER_SECOND = 8;
export const MAX_INTERVAL_MS = 1000 / MIN_DETECTIONS_PER_SECOND;
/** Hard cap on busy time. Wins over the 8 Hz floor: UI and input must keep at least half the main thread. */
export const MAX_BUSY_SHARE = 0.5;
/**
 * A secondary model that has not run for this long takes the next free slot, even while the primary model is busy.
 * Under FACE_LOST_MS (1 s), so the face box stays fresh while the hand tracks.
 */
export const SECONDARY_MAX_WAIT_MS = 500;
/** A primary model that asked for a frame this recently counts as active (the hand asks on every animation frame). */
const PRIMARY_ACTIVE_MS = 500;
/** How many recent detections the moving average uses. */
const DURATION_WINDOW = 8;
/** Window for the effective rate and the busy share in the stats. */
const RATE_WINDOW_MS = 1000;
const MAX_STARTS_KEPT = 64;

export type InferenceModel = "hand" | "face";
const MODELS: InferenceModel[] = ["hand", "face"];

/** How a model asks for the gate. The hand is primary; the face is secondary with its own rate cap. */
export interface InferenceLane {
  model: InferenceModel;
  priority: "primary" | "secondary";
  /** Own rate cap: at least this many ms between two starts of this model. */
  minIntervalMs?: number;
}

export const HAND_LANE: InferenceLane = { model: "hand", priority: "primary" };
export const FACE_LANE: InferenceLane = {
  model: "face",
  priority: "secondary",
  minIntervalMs: 1000 / FACE_DETECTIONS_PER_SECOND,
};

export interface ModelInferenceStats {
  /** Detections of this model run so far. */
  detections: number;
  /** Moving average of this model's detection time (ms), null before its first detection. */
  avgMs: number | null;
  /** Duration of this model's last detection (ms), null before the first one. */
  lastMs: number | null;
  /** Starts of this model in the last second. */
  effectiveHz: number;
}

export interface InferenceStats {
  /** Moving average of the detection time (ms), null before the first detection. All models. */
  avgMs: number | null;
  /** Duration of the last detection (ms), null before the first one. All models. */
  lastMs: number | null;
  /** Detections started in the last second, all models. */
  effectiveHz: number;
  /** Current minimum gap between two detection starts (ms); 0 before the first measurement. */
  minIntervalMs: number;
  /** Detections run so far, all models. */
  detections: number;
  /** Camera frames that the budget let pass without a detection. */
  skippedFrames: number;
  /** Share of the last second the main thread spent in detections (0..1), all models. */
  busyShare: number;
  /** The same readouts per model. */
  models: Record<InferenceModel, ModelInferenceStats>;
}

export interface InferenceSchedulerOptions {
  now(): number;
}

/** What a reader needs from the gate. Hand and face readers pass their lane. */
export interface DetectionGate {
  poll<T>(
    reader: object,
    video: HTMLVideoElement,
    detect: (timestampMs: number) => T,
    lane?: InferenceLane,
  ): T | null;
}

interface Frame {
  video: HTMLVideoElement;
  time: number;
}

interface ModelState {
  lane: InferenceLane | null;
  lastStart: number | null;
  lastAsked: number | null;
  durations: number[];
  starts: number[];
  lastMs: number | null;
  detections: number;
}

function newModelState(): ModelState {
  return { lane: null, lastStart: null, lastAsked: null, durations: [], starts: [], lastMs: null, detections: 0 };
}

function sameFrame(frame: Frame | null | undefined, video: HTMLVideoElement, time: number): boolean {
  return !!frame && frame.video === video && frame.time === time;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function countRecent(starts: number[], now: number): number {
  return starts.filter((s) => now - s >= 0 && now - s < RATE_WINDOW_MS).length;
}

function pushWindow(list: number[], value: number, max: number): void {
  list.push(value);
  if (list.length > max) list.shift();
}

export class InferenceScheduler implements DetectionGate {
  private readonly durations: number[] = [];
  private readonly starts: number[] = [];
  private readonly runs: Array<{ start: number; ms: number }> = [];
  private lastStart: number | null = null;
  private lastMs: number | null = null;
  private detections = 0;
  private skippedFrames = 0;
  private lastSeen: Frame | null = null;
  /** The newest frame that was read, and the result each model got for it. */
  private frame: { frame: Frame; values: Map<InferenceModel, unknown> } | null = null;
  /** Per reader: the frame it was last given. */
  private readonly delivered = new WeakMap<object, Frame>();
  private lastTimestamp = Number.NEGATIVE_INFINITY;
  private readonly models: Record<InferenceModel, ModelState> = { hand: newModelState(), face: newModelState() };

  constructor(private readonly options: InferenceSchedulerOptions) {}

  /**
   * Smallest gap between two detection starts now (ms), over all models. The budget gap is capped at the 8 Hz floor;
   * the busy cap is not, so the larger of the two wins and busy time stays at or below MAX_BUSY_SHARE.
   */
  minIntervalMs(): number {
    if (this.durations.length === 0) return 0;
    const budgetGap = Math.min(MAX_INTERVAL_MS, mean(this.durations) / BUDGET_SHARE);
    // The last duration counts too, so one slow detection widens the gap at once.
    const busyCapGap = Math.max(this.lastMs ?? 0, mean(this.durations)) / MAX_BUSY_SHARE;
    return Math.max(budgetGap, busyCapGap);
  }

  /**
   * Asks for the result of this camera frame for `lane.model`. Returns the result when this reader has not had this
   * frame yet, and null when there is nothing new for it now (already delivered, read by another model, or skipped
   * by the budget). `detect` receives a monotonic timestamp for detectForVideo and must do the frame preparation.
   */
  poll<T>(
    reader: object,
    video: HTMLVideoElement,
    detect: (timestampMs: number) => T,
    lane: InferenceLane = HAND_LANE,
  ): T | null {
    const time = video.currentTime;
    const frame: Frame = { video, time };
    const now = this.options.now();
    const state = this.models[lane.model];
    state.lane = lane;
    state.lastAsked = now;

    if (this.frame && sameFrame(this.frame.frame, video, time)) {
      // Another model already read this frame: one inference per frame, so this model waits for the next one.
      if (!this.frame.values.has(lane.model)) return null;
      if (sameFrame(this.delivered.get(reader), video, time)) return null;
      this.delivered.set(reader, frame);
      return this.frame.values.get(lane.model) as T;
    }

    this.forgetFutureStarts(now);
    const fresh = !sameFrame(this.lastSeen, video, time);
    this.lastSeen = frame;
    if (!this.mayStart(lane, now)) {
      if (fresh) this.skippedFrames++;
      return null;
    }

    this.lastStart = now;
    state.lastStart = now;
    pushWindow(this.starts, now, MAX_STARTS_KEPT);
    pushWindow(state.starts, now, MAX_STARTS_KEPT);
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    let value: T;
    try {
      value = detect(timestamp);
    } finally {
      this.recordDuration(lane.model, now, Math.max(0, this.options.now() - now));
    }
    this.frame = { frame, values: new Map([[lane.model, value]]) };
    this.delivered.set(reader, frame);
    this.detections++;
    state.detections++;
    return value;
  }

  getStats(): InferenceStats {
    const now = this.options.now();
    const models = {} as Record<InferenceModel, ModelInferenceStats>;
    for (const m of MODELS) models[m] = this.modelStats(m, now);
    return {
      avgMs: this.durations.length ? mean(this.durations) : null,
      lastMs: this.lastMs,
      effectiveHz: countRecent(this.starts, now),
      minIntervalMs: this.minIntervalMs(),
      detections: this.detections,
      skippedFrames: this.skippedFrames,
      busyShare: this.busyShare(now),
      models,
    };
  }

  /** Whether `lane` may start a detection on this frame now. */
  private mayStart(lane: InferenceLane, now: number): boolean {
    if (this.lastStart !== null && now - this.lastStart < this.minIntervalMs()) return false;
    if (lane.priority === "primary") return !this.secondaryStarved(now);

    const state = this.models[lane.model];
    if (lane.minIntervalMs !== undefined && state.lastStart !== null && now - state.lastStart < lane.minIntervalMs) {
      return false;
    }
    if (this.isStarved(state, now)) return true;
    // Not starved: only take a slot the primary models do not need soon.
    if (!this.primaryActive(now)) return true;
    const primaryDue = this.nextPrimaryStart();
    return primaryDue === null || now + this.expectedMs(lane.model) <= primaryDue;
  }

  /** True when a secondary model is asking and has waited SECONDARY_MAX_WAIT_MS: the primary yields one slot. */
  private secondaryStarved(now: number): boolean {
    return MODELS.some((m) => {
      const s = this.models[m];
      if (s.lane?.priority !== "secondary") return false;
      const wantWindow = 2 * (s.lane.minIntervalMs ?? SECONDARY_MAX_WAIT_MS);
      return s.lastAsked !== null && now - s.lastAsked <= wantWindow && this.isStarved(s, now);
    });
  }

  private isStarved(state: ModelState, now: number): boolean {
    return state.lastStart === null || now - state.lastStart >= SECONDARY_MAX_WAIT_MS;
  }

  private primaryModels(): ModelState[] {
    return MODELS.map((m) => this.models[m]).filter((s) => s.lane?.priority === "primary");
  }

  private primaryActive(now: number): boolean {
    return this.primaryModels().some((s) => s.lastAsked !== null && now - s.lastAsked < PRIMARY_ACTIVE_MS);
  }

  /** Earliest time the next primary start is due (ms), or null when no primary model has started yet. */
  private nextPrimaryStart(): number | null {
    const starts = this.primaryModels()
      .map((s) => s.lastStart)
      .filter((s): s is number => s !== null);
    if (starts.length === 0) return null;
    return Math.min(...starts) + this.minIntervalMs();
  }

  /** Expected duration of one detection of this model (ms): its own average, else the shared one, else 0. */
  private expectedMs(model: InferenceModel): number {
    const own = this.models[model].durations;
    if (own.length) return mean(own);
    return this.durations.length ? mean(this.durations) : 0;
  }

  /** A clock that went backwards (a restored page, a test clock) must not hold the budget closed. */
  private forgetFutureStarts(now: number): void {
    if (this.lastStart !== null && now < this.lastStart) this.lastStart = null;
    for (const m of MODELS) {
      const s = this.models[m];
      if (s.lastStart !== null && now < s.lastStart) s.lastStart = null;
      if (s.lastAsked !== null && now < s.lastAsked) s.lastAsked = null;
    }
  }

  private modelStats(model: InferenceModel, now: number): ModelInferenceStats {
    const s = this.models[model];
    return {
      detections: s.detections,
      avgMs: s.durations.length ? mean(s.durations) : null,
      lastMs: s.lastMs,
      effectiveHz: countRecent(s.starts, now),
    };
  }

  private busyShare(now: number): number {
    while (this.runs.length && now - this.runs[0]!.start >= RATE_WINDOW_MS) this.runs.shift();
    const busy = this.runs.filter((r) => now - r.start >= 0).reduce((sum, r) => sum + r.ms, 0);
    return Math.min(1, busy / RATE_WINDOW_MS);
  }

  private recordDuration(model: InferenceModel, start: number, ms: number): void {
    this.lastMs = ms;
    pushWindow(this.durations, ms, DURATION_WINDOW);
    const s = this.models[model];
    s.lastMs = ms;
    pushWindow(s.durations, ms, DURATION_WINDOW);
    this.runs.push({ start, ms });
    if (this.runs.length > MAX_STARTS_KEPT) this.runs.shift();
  }
}

export const sharedDetectionGate: DetectionGate = {
  poll: (reader, video, detect, lane) => defaultScheduler.poll(reader, video, detect, lane),
};

let defaultScheduler = new InferenceScheduler({ now: () => performance.now() });

/** The app-wide gate. See InferenceScheduler.poll. Hand readers use the default lane. */
export function pollDetection<T>(
  reader: object,
  video: HTMLVideoElement,
  detect: (timestampMs: number) => T,
  lane: InferenceLane = HAND_LANE,
): T | null {
  return defaultScheduler.poll(reader, video, detect, lane);
}

/** Detection timing for the lab page and any status line: per model and total, Hz, busy share, skipped frames. */
export function getInferenceStats(): InferenceStats {
  return defaultScheduler.getStats();
}

/** TEST ONLY: a fresh gate with no history. */
export function resetInferenceSchedulerForTest(): void {
  defaultScheduler = new InferenceScheduler({ now: () => performance.now() });
}
