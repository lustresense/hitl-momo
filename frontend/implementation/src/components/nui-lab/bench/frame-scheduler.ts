/**
 * R22 Contract K1: Unique Camera Frame Scheduler (`frame-scheduler.ts`).
 *
 * Prevents duplicate inference on low-FPS webcams (e.g. 15 FPS camera polled at 60-144 Hz rAF or
 * pumped from worker completion callbacks) by assigning a strictly monotonic `captureFrameId`
 * ONLY when a genuinely new video frame arrives.
 *
 * Freshness detection hierarchy:
 *  1. `HTMLVideoElement.requestVideoFrameCallback` (`metadata.presentedFrames` / `metadata.mediaTime`)
 *  2. `video.getVideoPlaybackQuality().totalVideoFrames`
 *  3. `video.currentTime` change check + lightweight subsampled 16x9 luma SAD safeguard
 *     (catches identical framebuffers when MediaStream `currentTime` ticks smoothly at 60+ Hz,
 *     with a static-scene heartbeat safeguard so zero-noise synthetic feeds never starve).
 *
 * Invariant:
 *  - `processedFrames <= capturedUniqueFrames` (worker callbacks can call `claimLatestUnprocessedFrame()`
 *    or `pollAndClaim(video)` to eliminate rAF bubbles without EVER re-inferring an identical frame).
 */

export const STALE_FRAME_THRESHOLD_MS = 150;

export type FrameFreshnessSource =
  | "rvfc"
  | "playback-quality"
  | "media-time"
  | "pixel-sad"
  | "static-heartbeat";

export interface VideoFrameCallbackMetadataLike {
  presentationTime: number;
  expectedDisplayTime: number;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: VideoFrameCallbackMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export interface CameraFrameTick {
  /** Monotonic unique camera frame ID (1, 2, 3...). */
  captureFrameId: number;
  /** `performance.now()` timestamp at unique frame arrival. */
  captureTimestampMs: number;
  /** Video media clock (`metadata.mediaTime` or `video.currentTime`). */
  mediaTimeSec: number;
  /** Delta in ms since the previous unique camera frame (0 on frame #1). */
  dtMs: number;
  /** Rolling unique camera capture FPS (honest 12-15 FPS when camera delivers 15 FPS). */
  uniqueCaptureFps: number;
  /** Cumulative count of duplicate polls/callbacks skipped without emitting a new captureFrameId. */
  framesSkippedDuplicate: number;
  videoWidth: number;
  videoHeight: number;
  /** Which freshness mechanism accepted this frame. */
  freshnessSource?: FrameFreshnessSource;
  /** Compositor presentedFrames counter when RVFC is active. */
  presentedFrames?: number | null;
}

export interface CameraFrameSchedulerStats {
  capturedUniqueFrames: number;
  dispatchedFrames: number;
  processedFrames: number;
  framesSkippedDuplicate: number;
  /** Unique frames superseded by a newer unique frame before dispatch (latest-frame-wins). */
  framesDroppedBeforeDispatch: number;
  uniqueCaptureFps: number;
  lastCaptureFrameId: number;
  lastDispatchedFrameId: number;
  lastProcessedFrameId: number;
  lastCaptureTimestampMs: number | null;
  lastDtMs: number;
  freshnessSource: FrameFreshnessSource | null;
  usingRvfc: boolean;
  running: boolean;
}

export interface CameraFrameSchedulerOptions {
  /** Rolling window for uniqueCaptureFps calculation (default 1000 ms). */
  fpsWindowMs?: number;
  /** Prefer `video.requestVideoFrameCallback` when available (default true). */
  useRvfc?: boolean;
  /** Enable lightweight 16x9 subsampled luma SAD fallback when neither RVFC nor totalVideoFrames is available (default true). */
  enablePixelSadFallback?: boolean;
  /** Mean per-pixel absolute luma difference threshold (0..255) above which a frame is treated as changed (default 0.01). */
  pixelSadThreshold?: number;
  /** Max ms before emitting a heartbeat tick on a bit-identical static scene in pixel-SAD fallback mode (default 120 ms). */
  staticSceneHeartbeatMs?: number;
  /** Injectable clock for deterministic unit tests (default `() => performance.now()`). */
  now?: () => number;
  /** Injectable subsampled luma sampler for deterministic unit tests. */
  sampleSubsampledLuma?: (video: HTMLVideoElement) => Uint8Array | null;
}

export type CameraFrameListener = (tick: CameraFrameTick) => void;

const SAD_GRID_W = 16;
const SAD_GRID_H = 9;
const SAD_GRID_LEN = SAD_GRID_W * SAD_GRID_H;

/** Returns frame age in ms (`>= 0`). */
export function computeCaptureFrameAgeMs(
  captureTimestampMs: number,
  nowMs = performance.now(),
): number {
  const age = nowMs - captureTimestampMs;
  return Number.isFinite(age) && age > 0 ? Math.round(age * 100) / 100 : 0;
}

/** Returns true when a processed frame is older than the staleness threshold (default 150 ms). */
export function isCaptureFrameStale(
  captureTimestampMs: number,
  nowMs = performance.now(),
  thresholdMs = STALE_FRAME_THRESHOLD_MS,
): boolean {
  return computeCaptureFrameAgeMs(captureTimestampMs, nowMs) > thresholdMs;
}

export class CameraFrameScheduler {
  private readonly fpsWindowMs: number;
  private readonly useRvfc: boolean;
  private readonly enablePixelSadFallback: boolean;
  private readonly pixelSadThreshold: number;
  private readonly staticSceneHeartbeatMs: number;
  private readonly nowFn: () => number;
  private readonly customLumaSampler: ((video: HTMLVideoElement) => Uint8Array | null) | null;

  private listeners = new Set<CameraFrameListener>();
  private attachedVideo: VideoWithRvfc | null = null;
  private running = false;
  private usingRvfc = false;
  private rvfcHandle: number | null = null;
  private rafHandle: number | null = null;

  private captureFrameId = 0;
  private dispatchedFrames = 0;
  private processedFrames = 0;
  private lastDispatchedFrameId = 0;
  private lastProcessedFrameId = 0;
  private framesSkippedDuplicate = 0;
  private framesDroppedBeforeDispatch = 0;

  private lastPresentedFrames: number | null = null;
  private lastDecodedVideoFrames: number | null = null;
  private lastMediaTimeSec: number | null = null;
  private lastCaptureTsMs: number | null = null;
  private lastDtMs = 0;
  private lastFreshnessSource: FrameFreshnessSource | null = null;
  private latestTick: CameraFrameTick | null = null;

  private frameTimestamps: number[] = [];
  private prevSubsampledLuma: Uint8Array | null = null;
  private sadCanvas: HTMLCanvasElement | null = null;
  private sadCtx: CanvasRenderingContext2D | null = null;
  private sadCanvasUnavailable = false;

  constructor(opts: CameraFrameSchedulerOptions = {}) {
    this.fpsWindowMs = opts.fpsWindowMs ?? 1000;
    this.useRvfc = opts.useRvfc ?? true;
    this.enablePixelSadFallback = opts.enablePixelSadFallback ?? true;
    this.pixelSadThreshold = opts.pixelSadThreshold ?? 0.01;
    this.staticSceneHeartbeatMs = opts.staticSceneHeartbeatMs ?? 120;
    this.nowFn = opts.now ?? (() => performance.now());
    this.customLumaSampler = opts.sampleSubsampledLuma ?? null;
  }

  /** Subscribe to newly arrived unique camera frames. Returns an unsubscribe callback. */
  onNewCameraFrame(cb: CameraFrameListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Attach to a video element and start tracking unique camera frames. */
  start(video: HTMLVideoElement): void {
    this.stop();
    this.attachedVideo = video as VideoWithRvfc;
    this.running = true;

    const canRvfc =
      this.useRvfc &&
      typeof this.attachedVideo.requestVideoFrameCallback === "function";

    if (canRvfc) {
      this.usingRvfc = true;
      const scheduleNextRvfc = () => {
        if (!this.running || !this.attachedVideo?.requestVideoFrameCallback) return;
        this.rvfcHandle = this.attachedVideo.requestVideoFrameCallback(
          (_now, metadata) => {
            this.rvfcHandle = null;
            if (!this.running || !this.attachedVideo) return;
            this.handleRvfcFrame(this.attachedVideo, metadata, this.nowFn());
            scheduleNextRvfc();
          },
        );
      };
      scheduleNextRvfc();
    } else {
      this.usingRvfc = false;
      const scheduleNextRaf = () => {
        if (!this.running || typeof requestAnimationFrame !== "function") return;
        this.rafHandle = requestAnimationFrame(() => {
          this.rafHandle = null;
          if (!this.running || !this.attachedVideo) return;
          this.poll(this.attachedVideo, this.nowFn());
          scheduleNextRaf();
        });
      };
      scheduleNextRaf();
    }
  }

  /** Stop listening to the attached video element and cancel any pending callbacks. */
  stop(): void {
    this.running = false;
    if (
      this.rvfcHandle !== null &&
      this.attachedVideo &&
      typeof this.attachedVideo.cancelVideoFrameCallback === "function"
    ) {
      try {
        this.attachedVideo.cancelVideoFrameCallback(this.rvfcHandle);
      } catch {
        /* ignore */
      }
    }
    this.rvfcHandle = null;
    if (this.rafHandle !== null && typeof cancelAnimationFrame === "function") {
      try {
        cancelAnimationFrame(this.rafHandle);
      } catch {
        /* ignore */
      }
    }
    this.rafHandle = null;
    this.attachedVideo = null;
    this.usingRvfc = false;
  }

  /** Reset all frame counters and freshness baselines (e.g., on camera restart or new trial). */
  reset(): void {
    this.captureFrameId = 0;
    this.dispatchedFrames = 0;
    this.processedFrames = 0;
    this.lastDispatchedFrameId = 0;
    this.lastProcessedFrameId = 0;
    this.framesSkippedDuplicate = 0;
    this.framesDroppedBeforeDispatch = 0;
    this.lastPresentedFrames = null;
    this.lastDecodedVideoFrames = null;
    this.lastMediaTimeSec = null;
    this.lastCaptureTsMs = null;
    this.lastDtMs = 0;
    this.lastFreshnessSource = null;
    this.latestTick = null;
    this.frameTimestamps = [];
    this.prevSubsampledLuma = null;
  }

  /**
   * Direct RVFC ingestion hook (also usable in unit tests simulating `requestVideoFrameCallback`).
   * Emits a new `CameraFrameTick` ONLY when `presentedFrames` (or `mediaTime`) advances.
   */
  handleRvfcFrame(
    video: HTMLVideoElement,
    metadata: VideoFrameCallbackMetadataLike,
    nowMs = this.nowFn(),
  ): CameraFrameTick | null {
    if (typeof document !== "undefined" && document.hidden) return null;
    if (video.readyState < 2) return null;
    const width = metadata.width || video.videoWidth;
    const height = metadata.height || video.videoHeight;
    if (!width || !height) return null;

    const presented =
      typeof metadata.presentedFrames === "number" && Number.isFinite(metadata.presentedFrames)
        ? metadata.presentedFrames
        : null;
    const mediaTime =
      typeof metadata.mediaTime === "number" && Number.isFinite(metadata.mediaTime)
        ? metadata.mediaTime
        : video.currentTime;

    if (presented !== null) {
      if (this.lastPresentedFrames !== null && presented <= this.lastPresentedFrames) {
        this.framesSkippedDuplicate++;
        return null;
      }
      this.lastPresentedFrames = presented;
    } else if (this.lastMediaTimeSec !== null && mediaTime === this.lastMediaTimeSec) {
      this.framesSkippedDuplicate++;
      return null;
    }

    // Keep fallback counters in sync so any manual poll() never double-emits the same frame
    const decoded = video.getVideoPlaybackQuality?.()?.totalVideoFrames;
    if (typeof decoded === "number" && decoded > 0) {
      this.lastDecodedVideoFrames = decoded;
    }
    this.lastMediaTimeSec = mediaTime;

    return this.emitUniqueFrame(nowMs, mediaTime, width, height, "rvfc", presented);
  }

  /**
   * Synchronous freshness check for environments without RVFC (or explicit manual/rAF polling).
   * Returns a new `CameraFrameTick` ONLY when a genuinely new video frame is detected; otherwise
   * increments `framesSkippedDuplicate` and returns `null`.
   */
  poll(video: HTMLVideoElement, nowMs = this.nowFn()): CameraFrameTick | null {
    if (typeof document !== "undefined" && document.hidden) return null;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    // If RVFC is actively driving this video element, do NOT double-poll via rAF/callbacks.
    if (this.usingRvfc && this.running && this.attachedVideo === video) {
      return null;
    }

    const mediaTime = typeof video.currentTime === "number" && Number.isFinite(video.currentTime)
      ? video.currentTime
      : 0;

    // Tier 2: getVideoPlaybackQuality().totalVideoFrames
    const decoded = video.getVideoPlaybackQuality?.()?.totalVideoFrames;
    if (typeof decoded === "number" && Number.isFinite(decoded) && decoded > 0) {
      if (this.lastDecodedVideoFrames !== null && decoded <= this.lastDecodedVideoFrames) {
        this.framesSkippedDuplicate++;
        return null;
      }
      this.lastDecodedVideoFrames = decoded;
      this.lastMediaTimeSec = mediaTime;
      return this.emitUniqueFrame(
        nowMs,
        mediaTime,
        video.videoWidth,
        video.videoHeight,
        "playback-quality",
        null,
      );
    }

    // Tier 3 + 4: currentTime + subsampled pixel SAD safeguard
    const lumaGrid = this.enablePixelSadFallback ? this.sampleLumaGrid(video) : null;
    if (lumaGrid) {
      if (this.prevSubsampledLuma && this.prevSubsampledLuma.length === lumaGrid.length) {
        const sad = computeMeanAbsDiff(lumaGrid, this.prevSubsampledLuma);
        const dtSinceLast = this.lastCaptureTsMs === null ? Infinity : nowMs - this.lastCaptureTsMs;
        if (sad <= this.pixelSadThreshold) {
          if (dtSinceLast < this.staticSceneHeartbeatMs) {
            this.framesSkippedDuplicate++;
            return null;
          }
          // Static scene heartbeat safeguard: allow low-rate refresh when scene is truly motionless
          this.prevSubsampledLuma.set(lumaGrid);
          this.lastMediaTimeSec = mediaTime;
          return this.emitUniqueFrame(
            nowMs,
            mediaTime,
            video.videoWidth,
            video.videoHeight,
            "static-heartbeat",
            null,
          );
        }
        this.prevSubsampledLuma.set(lumaGrid);
      } else {
        this.prevSubsampledLuma = new Uint8Array(lumaGrid);
      }
      this.lastMediaTimeSec = mediaTime;
      return this.emitUniqueFrame(
        nowMs,
        mediaTime,
        video.videoWidth,
        video.videoHeight,
        "pixel-sad",
        null,
      );
    }

    // Pure media-time fallback (e.g. jsdom / headless without canvas 2d)
    if (this.lastMediaTimeSec !== null && mediaTime === this.lastMediaTimeSec) {
      this.framesSkippedDuplicate++;
      return null;
    }
    this.lastMediaTimeSec = mediaTime;
    return this.emitUniqueFrame(
      nowMs,
      mediaTime,
      video.videoWidth,
      video.videoHeight,
      "media-time",
      null,
    );
  }

  /**
   * Returns true if a unique camera frame has arrived since the last dispatched frame.
   */
  hasUnprocessedFrame(): boolean {
    return this.latestTick !== null && this.latestTick.captureFrameId > this.lastDispatchedFrameId;
  }

  /**
   * Atomically claims the latest unique camera frame for worker submission.
   * Returns `null` if no newer unique camera frame has arrived since the last dispatch,
   * guaranteeing worker completion callbacks NEVER re-infer the same video frame.
   */
  claimLatestUnprocessedFrame(): CameraFrameTick | null {
    if (!this.latestTick) return null;
    if (this.latestTick.captureFrameId <= this.lastDispatchedFrameId) {
      this.framesSkippedDuplicate++;
      return null;
    }
    const skipped = this.latestTick.captureFrameId - this.lastDispatchedFrameId - 1;
    if (skipped > 0) {
      this.framesDroppedBeforeDispatch += skipped;
    }
    this.lastDispatchedFrameId = this.latestTick.captureFrameId;
    this.dispatchedFrames++;
    return this.latestTick;
  }

  /**
   * Polls `video` (when not RVFC-driven) and claims the latest unprocessed unique frame if available.
   * Safe replacement for the legacy unguarded `submitFrame(v, performance.now())` pump inside worker callbacks.
   */
  pollAndClaim(video: HTMLVideoElement, nowMs = this.nowFn()): CameraFrameTick | null {
    if (!this.usingRvfc) {
      const polled = this.poll(video, nowMs);
      if (polled === null && !this.hasUnprocessedFrame()) {
        return null;
      }
    }
    return this.claimLatestUnprocessedFrame();
  }

  /**
   * Explicitly records that a `captureFrameId` is being submitted to the worker.
   * Returns `false` (and increments `framesSkippedDuplicate`) if already dispatched.
   */
  markDispatched(captureFrameId: number): boolean {
    if (captureFrameId <= this.lastDispatchedFrameId) {
      this.framesSkippedDuplicate++;
      return false;
    }
    const skipped = captureFrameId - this.lastDispatchedFrameId - 1;
    if (skipped > 0) {
      this.framesDroppedBeforeDispatch += skipped;
    }
    this.lastDispatchedFrameId = captureFrameId;
    this.dispatchedFrames++;
    return true;
  }

  /**
   * Records that the worker completed inference for `processedFrameId`.
   * Enforces the invariant `processedFrames <= capturedUniqueFrames`.
   */
  markProcessed(processedFrameId: number): void {
    if (processedFrameId <= this.lastProcessedFrameId) return;
    this.lastProcessedFrameId = processedFrameId;
    if (this.processedFrames < this.captureFrameId) {
      this.processedFrames++;
    }
  }

  getLatestTick(): CameraFrameTick | null {
    return this.latestTick ? { ...this.latestTick } : null;
  }

  computeFrameAgeMs(captureTimestampMs: number, nowMs = this.nowFn()): number {
    return computeCaptureFrameAgeMs(captureTimestampMs, nowMs);
  }

  isFrameStale(
    captureTimestampMs: number,
    nowMs = this.nowFn(),
    thresholdMs = STALE_FRAME_THRESHOLD_MS,
  ): boolean {
    return isCaptureFrameStale(captureTimestampMs, nowMs, thresholdMs);
  }

  getStats(nowMs = this.nowFn()): CameraFrameSchedulerStats {
    return {
      capturedUniqueFrames: this.captureFrameId,
      dispatchedFrames: this.dispatchedFrames,
      processedFrames: this.processedFrames,
      framesSkippedDuplicate: this.framesSkippedDuplicate,
      framesDroppedBeforeDispatch: this.framesDroppedBeforeDispatch,
      uniqueCaptureFps: this.computeRollingFps(nowMs, false),
      lastCaptureFrameId: this.captureFrameId,
      lastDispatchedFrameId: this.lastDispatchedFrameId,
      lastProcessedFrameId: this.lastProcessedFrameId,
      lastCaptureTimestampMs: this.lastCaptureTsMs,
      lastDtMs: this.lastDtMs,
      freshnessSource: this.lastFreshnessSource,
      usingRvfc: this.usingRvfc,
      running: this.running,
    };
  }

  private emitUniqueFrame(
    nowMs: number,
    mediaTimeSec: number,
    videoWidth: number,
    videoHeight: number,
    source: FrameFreshnessSource,
    presentedFrames: number | null,
  ): CameraFrameTick {
    const dtMs =
      this.lastCaptureTsMs === null
        ? 0
        : Math.max(0, Math.round((nowMs - this.lastCaptureTsMs) * 100) / 100);
    this.lastCaptureTsMs = nowMs;
    this.lastDtMs = dtMs;
    this.lastFreshnessSource = source;
    this.captureFrameId++;

    this.frameTimestamps.push(nowMs);
    const uniqueCaptureFps = this.computeRollingFps(nowMs, true);

    const tick: CameraFrameTick = {
      captureFrameId: this.captureFrameId,
      captureTimestampMs: nowMs,
      mediaTimeSec,
      dtMs,
      uniqueCaptureFps,
      framesSkippedDuplicate: this.framesSkippedDuplicate,
      videoWidth,
      videoHeight,
      freshnessSource: source,
      presentedFrames,
    };
    this.latestTick = tick;

    for (const cb of [...this.listeners]) {
      cb(tick);
    }
    return tick;
  }

  private computeRollingFps(nowMs: number, onArrival: boolean): number {
    const cutoff = nowMs - this.fpsWindowMs;
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0]! < cutoff) {
      this.frameTimestamps.shift();
    }
    const n = this.frameTimestamps.length;
    if (n < 2) {
      if (onArrival && this.lastDtMs > 0) {
        return Math.round((1000 / this.lastDtMs) * 10) / 10;
      }
      return 0;
    }
    const earliest = this.frameTimestamps[0]!;
    const latest = this.frameTimestamps[n - 1]!;
    const spanMs = onArrival
      ? latest - earliest
      : Math.max(latest - earliest, nowMs - earliest);
    if (spanMs <= 0) return 0;
    const rawFps = ((n - 1) * 1000) / spanMs;
    return Math.round(rawFps * 10) / 10;
  }

  private sampleLumaGrid(video: HTMLVideoElement): Uint8Array | null {
    if (this.customLumaSampler) {
      return this.customLumaSampler(video);
    }
    if (this.sadCanvasUnavailable || typeof document === "undefined") {
      return null;
    }
    try {
      if (!this.sadCanvas) {
        this.sadCanvas = document.createElement("canvas");
        this.sadCanvas.width = SAD_GRID_W;
        this.sadCanvas.height = SAD_GRID_H;
        this.sadCtx = this.sadCanvas.getContext("2d", { willReadFrequently: true });
        if (!this.sadCtx) {
          this.sadCanvasUnavailable = true;
          return null;
        }
      }
      if (!this.sadCtx) return null;
      this.sadCtx.drawImage(video, 0, 0, SAD_GRID_W, SAD_GRID_H);
      const data = this.sadCtx.getImageData(0, 0, SAD_GRID_W, SAD_GRID_H).data;
      const out = new Uint8Array(SAD_GRID_LEN);
      for (let i = 0; i < SAD_GRID_LEN; i++) {
        const j = i << 2;
        out[i] = (77 * data[j]! + 150 * data[j + 1]! + 29 * data[j + 2]! + 128) >> 8;
      }
      return out;
    } catch {
      this.sadCanvasUnavailable = true;
      return null;
    }
  }
}

function computeMeanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  return sum / n;
}
