/**
 * Main-thread controller for the NUI Lab CPU-only MediaPipe Web Worker (`r20-worker-client.ts`).
 *
 * Guarantees (R22 Contracts K1/K2 & W01–W08):
 *  - Zero GPU delegate: worker hardcodes `delegate: "CPU"`.
 *  - Zero runtime `setOptions` thrashing: default `numHandsPolicy: "fixed-2"` (`runtimeSetOptionsCalls === 0`).
 *  - Strictly at most 1 frame in flight (`inFlight <= 1`): frames arriving while busy are dropped and counted.
 *  - Duplicate `captureFrameId` guard: when `CameraFrameTick` is supplied, never submits the same
 *    `captureFrameId` twice (`framesSkippedDuplicate` counted, guaranteeing `processedFrames <= capturedUniqueFrames`).
 *  - Propagates `captureFrameId`, `processedFrameId`, `captureTimestampMs`, `frameAgeMs`, `workerLagMs`,
 *    `numHandsActive`, `initSetOptionsCalls`, `runtimeSetOptionsCalls`, `ownerTrack`, and extended `lumaStats`.
 *  - Fail-closed `RELEASE_ALL` on tab hidden (`visibilitychange`), worker error/crash, restart, and close.
 *  - Automatic bounded restart (up to 2 times) on unexpected worker crash, emitting `onWorkerRestart`.
 */
import type { PreprocessMode } from "./schema";
import {
  STALE_FRAME_THRESHOLD_MS,
  type CameraFrameTick,
} from "./frame-scheduler";
import type { AutoPreprocessStatus } from "./r20-lowlight";
import type {
  LabWorkerInboundMsg,
  LabWorkerOutboundMsg,
  WorkerLumaStats,
} from "./r20-hand.worker";
import type {
  OwnerFailClosedReason,
  OwnerGuardPolicy,
  OwnerGuardTelemetry,
  WorkerHandedness,
  WorkerOwnerTrack,
  WorkerPoint3,
} from "./worker-owner-guard";

export type { WorkerLumaStats } from "./r20-hand.worker";
export type {
  OwnerFailClosedReason,
  OwnerGuardPolicy,
  OwnerGuardTelemetry,
  WorkerHandedness,
  WorkerOwnerTrack,
  WorkerPoint3,
} from "./worker-owner-guard";

export interface CpuWorkerResult {
  frameId: number;
  /** Monotonic unique camera frame ID submitted for inference (Contract K2). */
  captureFrameId: number;
  /** Camera frame ID completed by this worker result (matches `captureFrameId` of this result). */
  processedFrameId: number;
  /** Monotonic sequential worker completion counter (1, 2, 3...) for this session epoch. */
  processedSeq: number;
  /** `performance.now()` timestamp at unique camera frame capture (Contract K2). */
  captureTimestampMs: number;
  timestampMs: number;
  /** End-to-end age of the camera frame when result arrived (`receiveNow - captureTimestampMs`). */
  frameAgeMs: number;
  /** Round-trip worker latency (`receiveNow - submitStartMs`). */
  workerLagMs: number;
  /** True when `frameAgeMs > STALE_FRAME_THRESHOLD_MS` (150 ms). */
  isStale: boolean;
  aspect: number;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  numHandsActive: 1 | 2;
  initSetOptionsCalls: number;
  runtimeSetOptionsCalls: number;
  landmarks: WorkerPoint3[][];
  handedness: WorkerHandedness[];
  /** R22B B4.2 / K2: Raw MediaPipe hand count BEFORE WorkerOwnerGuard filtering. */
  mpRawHandCount: number;
  /** R22B B4.2 / K2: Raw MediaPipe handedness scores per detected hand. */
  mpHandednessScores: number[];
  /** Legacy luma object kept for backwards compatibility. */
  luma: {
    meanLuma: number | null;
    centerLuma: number | null;
    isDark: boolean;
    isBacklight: boolean;
    activePass: string;
  };
  /** Contract K2 extended pre-LUT luma, glare, blur, and noise diagnostics. */
  lumaStats: WorkerLumaStats;
  timing: {
    mainThreadDispatchMs: number;
    preprocessMs: number;
    detectMs: number;
    setOptionsMs: number;
    workerTotalMs: number;
    /** Capture-to-result pipeline latency estimate (NOT physical human intent-to-key latency). */
    pipelineMs: number;
    frameAgeMs: number;
    workerLagMs: number;
    detectorCalls: number;
  };
  ownerGuard: OwnerGuardTelemetry;
  /** Contract K2 owner track continuity & bystander hold state. */
  ownerTrack: WorkerOwnerTrack;
  failClosedReason: OwnerFailClosedReason;
  droppedSincePrev: number;
  /** MoNUI-7 Rescue & Telemetry K8 v2.2 fields */
  rescueState?: "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST";
  source?: "mediapipe" | "rescue";
  positionOnly?: { cx: number; cy: number; score: number } | null;
  yoloRan?: boolean;
  yoloMs?: number | null;
  yoloScore?: number | null;
  cropTried?: boolean;
  cropSuccess?: boolean;
  rescueAutoOff?: { reason: string; p50Ms: number } | null;
  /** R23B-HF3 Auto-brightener hysteresis telemetry & transition events */
  autoPreprocessTransition?: {
    transition: "ON" | "OFF";
    pass: string;
    effectiveLuma: number | null;
    lumaSource: "handRoiLumaP50" | "lumaP50" | "none";
  } | null;
  autoPreprocessStatus?: AutoPreprocessStatus;
}

export interface CpuWorkerTelemetry {
  delegate: "CPU";
  ready: boolean;
  closed: boolean;
  inFlight: number;
  maxInFlightObserved: number;
  framesReceived: number;
  framesSubmitted: number;
  framesCompleted: number;
  framesDroppedBusy: number;
  framesSkippedDuplicate: number;
  staleFramesDiscarded: number;
  workerRestarts: number;
  releaseAllCount: number;
  lastReleaseReason: string | null;
  lastError: string | null;
  numHandsActive: 1 | 2;
  numHandsPolicy: OwnerGuardPolicy;
  initSetOptionsCalls: number;
  runtimeSetOptionsCalls: number;
  lastCaptureFrameId: number;
  lastProcessedFrameId: number;
  lastFrameAgeMs: number | null;
  lastWorkerLagMs: number | null;
  ownerGuard: OwnerGuardTelemetry | null;
  ownerTrack: WorkerOwnerTrack | null;
}

export interface CpuWorkerClientOptions {
  wasmRoot: string;
  modelUrl: string;
  preprocess: PreprocessMode;
  /** Backwards-compatible flag; R22 defaults to zero-setOptions `"fixed-2"` policy. */
  dynamicOwnerLock?: boolean;
  /** R22 numHands policy (default `"fixed-2"`, 0 runtime `setOptions` calls). */
  numHandsPolicy?: OwnerGuardPolicy;
  /** Explicit fixed `numHands` override (1 or 2; default 2). */
  fixedNumHands?: 1 | 2;
  dimRecoveryLuma?: number;
  /** R22B B4.1: HandLandmarker confidence thresholds applied ONCE at worker creation (0 runtime setOptions). */
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
  auditIntervalFrames?: number;
  captureWidth?: number;
  staleThresholdMs?: number;
  yoloEnabled?: boolean;
  createWorker?: () => Worker;
  onResult: (res: CpuWorkerResult) => void;
  onReleaseAll?: (reason: string) => void;
  onWorkerRestart?: (reason: string, attempt: number) => void;
  onError?: (err: string) => void;
}

export type SubmitFrameMeta = Pick<CameraFrameTick, "captureFrameId" | "captureTimestampMs">;

const MAX_AUTO_RESTARTS = 2;

export class LabCpuWorkerClient {
  private worker: Worker | null = null;
  private ready = false;
  private closed = false;
  private sessionEpoch = 1;
  private nextFrameId = 1;
  private inFlight = 0;
  private maxInFlightObserved = 0;
  private framesReceived = 0;
  private framesSubmitted = 0;
  private framesCompleted = 0;
  private framesDroppedBusy = 0;
  private framesSkippedDuplicate = 0;
  private droppedSinceLastResult = 0;
  private staleFramesDiscarded = 0;
  private workerRestarts = 0;
  private releaseAllCount = 0;
  private lastReleaseReason: string | null = null;
  private lastError: string | null = null;
  private lastOwnerGuard: OwnerGuardTelemetry | null = null;
  private lastOwnerTrack: WorkerOwnerTrack | null = null;
  private numHandsActive: 1 | 2;
  private initSetOptionsCalls = 0;
  private runtimeSetOptionsCalls = 0;
  private lastSubmittedCaptureFrameId = 0;
  private lastCaptureFrameId = 0;
  private lastProcessedFrameId = 0;
  private lastFrameAgeMs: number | null = null;
  private lastWorkerLagMs: number | null = null;
  private preprocess: PreprocessMode;
  private readonly captureWidth: number;
  private readonly dynamicOwnerLock: boolean;
  private readonly numHandsPolicy: OwnerGuardPolicy;
  private readonly fixedNumHands: 1 | 2;
  private readonly dimRecoveryLuma?: number;
  private readonly auditIntervalFrames: number;
  private readonly staleThresholdMs: number;
  private dispatchTimes = new Map<
    number,
    { t0: number; dispatchMs: number; captureFrameId: number; captureTimestampMs: number }
  >();
  private visibilityHandler: (() => void) | null = null;

  constructor(private readonly opts: CpuWorkerClientOptions) {
    this.preprocess = opts.preprocess;
    this.captureWidth = opts.captureWidth ?? 320;
    this.dynamicOwnerLock = opts.dynamicOwnerLock ?? true;
    this.numHandsPolicy =
      opts.numHandsPolicy ?? (opts.fixedNumHands === 1 ? "fixed-1" : "fixed-2");
    this.fixedNumHands = this.numHandsPolicy === "fixed-1" ? 1 : 2;
    this.numHandsActive = this.fixedNumHands;
    this.dimRecoveryLuma = opts.dimRecoveryLuma;
    this.auditIntervalFrames = opts.auditIntervalFrames ?? 45;
    this.staleThresholdMs = opts.staleThresholdMs ?? STALE_FRAME_THRESHOLD_MS;
  }

  setPreprocess(mode: PreprocessMode): void {
    this.preprocess = mode;
  }

  /** Reset duplicate-frame tracking watermark (e.g. when a new CameraFrameScheduler session starts). */
  resetFrameWatermark(): void {
    this.lastSubmittedCaptureFrameId = 0;
  }

  async init(): Promise<void> {
    if (this.closed) throw new Error("CPU worker client sudah ditutup");
    if (typeof document !== "undefined" && !this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.triggerReleaseAll("browser-hidden");
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    await this.spawnWorker();
  }

  private spawnWorker(): Promise<void> {
    if (this.closed) return Promise.resolve();
    const epoch = ++this.sessionEpoch;
    this.ready = false;
    this.inFlight = 0;
    this.dispatchTimes.clear();

    const w = this.opts.createWorker
      ? this.opts.createWorker()
      : new Worker(new URL("./r20-hand.worker.ts", import.meta.url), { type: "module" });
    this.worker = w;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.lastError = "Worker HandLandmarker timeout saat inisialisasi (>30 dtk)";
          reject(new Error(this.lastError));
        }
      }, 30_000);

      w.onmessage = (ev: MessageEvent<LabWorkerOutboundMsg>) => {
        const msg = ev.data;
        if (!msg || msg.sessionEpoch !== this.sessionEpoch) {
          this.staleFramesDiscarded++;
          return;
        }
        if (msg.type === "READY") {
          this.ready = true;
          this.lastError = null;
          this.numHandsActive = msg.numHands ?? this.fixedNumHands;
          this.initSetOptionsCalls = msg.initSetOptionsCalls ?? 0;
          this.runtimeSetOptionsCalls = msg.runtimeSetOptionsCalls ?? 0;
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve();
          }
          return;
        }
        if (msg.type === "ERROR") {
          this.inFlight = 0;
          this.lastError = `[${msg.stage}] ${msg.message}`;
          this.triggerReleaseAll(`worker-${msg.stage}-error`);
          this.opts.onError?.(this.lastError);
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            reject(new Error(this.lastError));
          } else if (msg.stage === "detect") {
            void this.handleWorkerCrash(`detect-error:${msg.message}`).catch((err) => {
              this.lastError = err instanceof Error ? err.message : String(err);
              this.opts.onError?.(this.lastError);
            });
          }
          return;
        }
        if (msg.type === "RESULT") {
          this.inFlight = 0;
          if (this.closed) return;
          const receiveNow = performance.now();
          const info = this.dispatchTimes.get(msg.frameId);
          this.dispatchTimes.delete(msg.frameId);

          const captureFrameId = msg.captureFrameId ?? info?.captureFrameId ?? msg.frameId;
          const processedFrameId = msg.processedFrameId ?? captureFrameId;
          const captureTimestampMs =
            msg.captureTimestampMs ?? info?.captureTimestampMs ?? msg.timestampMs;

          const workerLagMs = info
            ? Math.max(0, Math.round((receiveNow - info.t0) * 100) / 100)
            : msg.timing.workerTotalMs;
          const frameAgeMs = Math.max(
            0,
            Math.round((receiveNow - captureTimestampMs) * 100) / 100,
          );
          const pipelineMs = workerLagMs;

          const droppedSincePrev = this.droppedSinceLastResult;
          this.droppedSinceLastResult = 0;
          this.framesCompleted++;

          const numHandsActive: 1 | 2 =
            msg.numHandsActive ?? msg.ownerGuard?.activeNumHands ?? this.fixedNumHands;
          const initSetOpts = msg.initSetOptionsCalls ?? this.initSetOptionsCalls;
          const runtimeSetOpts = msg.runtimeSetOptionsCalls ?? 0;

          this.numHandsActive = numHandsActive;
          this.initSetOptionsCalls = initSetOpts;
          this.runtimeSetOptionsCalls = runtimeSetOpts;
          this.lastCaptureFrameId = captureFrameId;
          this.lastProcessedFrameId = processedFrameId;
          this.lastFrameAgeMs = frameAgeMs;
          this.lastWorkerLagMs = workerLagMs;
          this.lastOwnerGuard = msg.ownerGuard ?? null;

          const ownerTrack: WorkerOwnerTrack = msg.ownerTrack ?? {
            locked: msg.landmarks.length === 1,
            trackId: msg.ownerGuard?.trackId ?? (msg.landmarks.length > 0 ? 1 : 0),
            handCount: msg.landmarks.length,
            ambiguousHold: msg.failClosedReason !== null,
            rejectReason: msg.failClosedReason ?? (msg.landmarks.length === 0 ? "no-hand" : null),
          };
          this.lastOwnerTrack = ownerTrack;

          const lumaStats: WorkerLumaStats = msg.lumaStats ?? {
            mean: msg.luma.meanLuma ?? 0,
            center: msg.luma.centerLuma ?? 0,
            p10: msg.luma.meanLuma ?? 0,
            p50: msg.luma.meanLuma ?? 0,
            p95: msg.luma.meanLuma ?? 0,
            clippedPct: 0,
            handRoiLumaP50: null,
            lastRoiLumaP50: null,
            nearWhiteHandPct: null,
            blurProxy: 0,
            noiseProxy: 0,
            isBacklight: msg.luma.isBacklight,
            passUsed: msg.luma.activePass,
          };

          const mpRawHandCount =
            typeof msg.mpRawHandCount === "number" ? msg.mpRawHandCount : msg.landmarks.length;
          const mpHandednessScores = Array.isArray(msg.mpHandednessScores)
            ? msg.mpHandednessScores
            : msg.handedness.map((h) => Math.round(h.score * 10000) / 10000);

          const out: CpuWorkerResult = {
            frameId: msg.frameId,
            captureFrameId,
            processedFrameId,
            processedSeq: msg.processedSeq ?? this.framesCompleted,
            captureTimestampMs,
            timestampMs: msg.timestampMs,
            frameAgeMs,
            workerLagMs,
            isStale: frameAgeMs > this.staleThresholdMs,
            aspect: msg.aspect,
            delegate: "CPU",
            gpuDelegateAttempted: false,
            gpuDelegateActive: false,
            numHandsActive,
            initSetOptionsCalls: initSetOpts,
            runtimeSetOptionsCalls: runtimeSetOpts,
            landmarks: msg.landmarks,
            handedness: msg.handedness,
            mpRawHandCount,
            mpHandednessScores,
            luma: msg.luma,
            lumaStats,
            timing: {
              mainThreadDispatchMs: info?.dispatchMs ?? 0,
              preprocessMs: msg.timing.preprocessMs,
              detectMs: msg.timing.detectMs,
              setOptionsMs: msg.timing.setOptionsMs,
              workerTotalMs: msg.timing.workerTotalMs,
              pipelineMs,
              frameAgeMs,
              workerLagMs,
              detectorCalls: msg.timing.detectorCalls,
            },
            ownerGuard: msg.ownerGuard,
            ownerTrack,
            failClosedReason: msg.failClosedReason,
            droppedSincePrev,
            rescueState: msg.rescueState,
            source: msg.source,
            positionOnly: msg.positionOnly,
            yoloRan: msg.yoloRan,
            yoloMs: msg.yoloMs,
            yoloScore: msg.yoloScore,
            cropTried: msg.cropTried,
            cropSuccess: msg.cropSuccess,
            rescueAutoOff: msg.rescueAutoOff,
            autoPreprocessTransition: msg.autoPreprocessTransition,
            autoPreprocessStatus: msg.autoPreprocessStatus,
          };
          this.opts.onResult(out);
        }
      };

      w.onerror = (ev) => {
        this.inFlight = 0;
        const detail = ev.message || "Worker runtime error";
        this.lastError = detail;
        this.triggerReleaseAll("worker-onerror");
        this.opts.onError?.(detail);
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(new Error(detail));
        } else {
          void this.handleWorkerCrash(`onerror:${detail}`).catch((err) => {
            this.lastError = err instanceof Error ? err.message : String(err);
            this.opts.onError?.(this.lastError);
          });
        }
      };

      const initMsg: LabWorkerInboundMsg = {
        type: "INIT",
        sessionEpoch: epoch,
        wasmRoot: this.opts.wasmRoot,
        modelUrl: this.opts.modelUrl,
        dynamicOwnerLock: this.dynamicOwnerLock,
        numHandsPolicy: this.numHandsPolicy,
        fixedNumHands: this.fixedNumHands,
        dimRecoveryLuma: this.dimRecoveryLuma,
        minDetectionConfidence: this.opts.minDetectionConfidence,
        minPresenceConfidence: this.opts.minPresenceConfidence,
        minTrackingConfidence: this.opts.minTrackingConfidence,
        auditIntervalFrames: this.auditIntervalFrames,
        preprocess: this.preprocess,
        yoloEnabled: this.opts.yoloEnabled,
      };
      w.postMessage(initMsg);
    });
  }

  private async handleWorkerCrash(reason: string): Promise<void> {
    if (this.closed) return;
    if (this.workerRestarts >= MAX_AUTO_RESTARTS) {
      this.ready = false;
      this.lastError = `Worker berhenti setelah ${MAX_AUTO_RESTARTS}x restart (${reason})`;
      this.opts.onError?.(this.lastError);
      return;
    }
    await this.restartWorker(reason);
  }

  /** Clean fail-closed worker restart (releases keys, terminates old worker, increments epoch, respawns). */
  async restartWorker(reason = "manual-restart"): Promise<void> {
    if (this.closed) return;
    this.workerRestarts++;
    this.triggerReleaseAll(`worker-restart:${reason}`);
    this.opts.onWorkerRestart?.(reason, this.workerRestarts);
    this.terminateWorkerOnly();
    await this.spawnWorker();
  }

  private terminateWorkerOnly(): void {
    this.ready = false;
    this.inFlight = 0;
    this.dispatchTimes.clear();
    if (!this.worker) return;
    try {
      this.worker.postMessage({
        type: "CLOSE",
        sessionEpoch: this.sessionEpoch,
      } satisfies LabWorkerInboundMsg);
      this.worker.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
  }

  private triggerReleaseAll(reason: string): void {
    this.releaseAllCount++;
    this.lastReleaseReason = reason;
    this.opts.onReleaseAll?.(reason);
  }

  notifyPendingFrame(): void {
    if (this.ready && this.worker) {
      try {
        this.worker.postMessage({ type: "PENDING_FRAME" });
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Submits the latest unique video frame if the worker is idle.
   * Never queues stale frames (`inFlight <= 1`), and when `frameMeta` (`CameraFrameTick`) is supplied,
   * never submits the same `captureFrameId` twice.
   */
  async submitFrame(
    video: HTMLVideoElement,
    nowMs = performance.now(),
    frameMeta?: SubmitFrameMeta,
  ): Promise<boolean> {
    if (this.closed || !this.ready || !this.worker) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;

    if (frameMeta && frameMeta.captureFrameId <= this.lastSubmittedCaptureFrameId) {
      this.framesSkippedDuplicate++;
      return false;
    }

    this.framesReceived++;
    if (this.inFlight > 0) {
      this.framesDroppedBusy++;
      this.droppedSinceLastResult++;
      this.notifyPendingFrame();
      return false;
    }

    const frameId = this.nextFrameId++;
    const captureFrameId = frameMeta ? frameMeta.captureFrameId : frameId;
    const captureTimestampMs = frameMeta ? frameMeta.captureTimestampMs : nowMs;
    if (frameMeta) {
      this.lastSubmittedCaptureFrameId = captureFrameId;
    }

    const aspect = video.videoWidth / video.videoHeight;
    const epochAtSubmit = this.sessionEpoch;
    this.inFlight = 1;
    this.maxInFlightObserved = Math.max(this.maxInFlightObserved, this.inFlight);
    this.framesSubmitted++;
    const t0 = performance.now();

    try {
      const resizeW = Math.min(video.videoWidth, this.captureWidth);
      const resizeH = Math.max(
        1,
        Math.round((resizeW * video.videoHeight) / Math.max(1, video.videoWidth)),
      );
      const bitmap = await createImageBitmap(video, {
        resizeWidth: resizeW,
        resizeHeight: resizeH,
        resizeQuality: "low",
      });
      if (this.closed || !this.worker || epochAtSubmit !== this.sessionEpoch) {
        bitmap.close();
        this.inFlight = 0;
        this.staleFramesDiscarded++;
        return false;
      }
      const dispatchMs = Math.round((performance.now() - t0) * 100) / 100;
      this.dispatchTimes.set(frameId, { t0, dispatchMs, captureFrameId, captureTimestampMs });
      const msg: LabWorkerInboundMsg = {
        type: "DETECT",
        sessionEpoch: epochAtSubmit,
        frameId,
        captureFrameId,
        captureTimestampMs,
        timestampMs: Math.round(captureTimestampMs),
        bitmap,
        aspect,
        preprocess: this.preprocess,
      };
      this.worker.postMessage(msg, [bitmap]);
      return true;
    } catch (err) {
      this.inFlight = 0;
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  getTelemetry(): CpuWorkerTelemetry {
    return {
      delegate: "CPU",
      ready: this.ready,
      closed: this.closed,
      inFlight: this.inFlight,
      maxInFlightObserved: this.maxInFlightObserved,
      framesReceived: this.framesReceived,
      framesSubmitted: this.framesSubmitted,
      framesCompleted: this.framesCompleted,
      framesDroppedBusy: this.framesDroppedBusy,
      framesSkippedDuplicate: this.framesSkippedDuplicate,
      staleFramesDiscarded: this.staleFramesDiscarded,
      workerRestarts: this.workerRestarts,
      releaseAllCount: this.releaseAllCount,
      lastReleaseReason: this.lastReleaseReason,
      lastError: this.lastError,
      numHandsActive: this.numHandsActive,
      numHandsPolicy: this.numHandsPolicy,
      initSetOptionsCalls: this.initSetOptionsCalls,
      runtimeSetOptionsCalls: this.runtimeSetOptionsCalls,
      lastCaptureFrameId: this.lastCaptureFrameId,
      lastProcessedFrameId: this.lastProcessedFrameId,
      lastFrameAgeMs: this.lastFrameAgeMs,
      lastWorkerLagMs: this.lastWorkerLagMs,
      ownerGuard: this.lastOwnerGuard ? { ...this.lastOwnerGuard } : null,
      ownerTrack: this.lastOwnerTrack ? { ...this.lastOwnerTrack } : null,
    };
  }

  close(reason = "detector-closed"): void {
    if (this.closed) return;
    this.closed = true;
    this.triggerReleaseAll(reason);
    if (typeof document !== "undefined" && this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.terminateWorkerOnly();
  }
}
