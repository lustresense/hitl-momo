/**
 * Main-thread controller for the NUI Lab CPU-only MediaPipe Web Worker (`r20-worker-client.ts`).
 *
 * Guarantees:
 *  - Zero GPU delegate: worker hardcodes `delegate: "CPU"`.
 *  - Strictly at most 1 frame in flight (`inFlight <= 1`): frames arriving while busy are dropped and counted.
 *  - Fail-closed `RELEASE_ALL` on tab hidden (`visibilitychange`), worker error/crash, restart, and close.
 *  - Automatic bounded restart (up to 2 times) on unexpected worker crash, emitting `onWorkerRestart`.
 */
import type { PreprocessMode } from "./schema";
import type {
  LabWorkerInboundMsg,
  LabWorkerOutboundMsg,
  LabWorkerResultMsg,
} from "./r20-hand.worker";
import type { OwnerGuardTelemetry, WorkerHandedness, WorkerPoint3 } from "./worker-owner-guard";

export interface CpuWorkerResult {
  frameId: number;
  timestampMs: number;
  aspect: number;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  landmarks: WorkerPoint3[][];
  handedness: WorkerHandedness[];
  luma: {
    meanLuma: number | null;
    centerLuma: number | null;
    isDark: boolean;
    isBacklight: boolean;
    activePass: string;
  };
  timing: {
    mainThreadDispatchMs: number;
    preprocessMs: number;
    detectMs: number;
    setOptionsMs: number;
    workerTotalMs: number;
    /** Capture-to-result pipeline latency estimate (NOT physical human intent-to-key latency). */
    pipelineMs: number;
    detectorCalls: number;
  };
  ownerGuard: OwnerGuardTelemetry;
  failClosedReason: "owner-jump-reject" | "owner-size-reject" | null;
  droppedSincePrev: number;
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
  staleFramesDiscarded: number;
  workerRestarts: number;
  releaseAllCount: number;
  lastReleaseReason: string | null;
  lastError: string | null;
  ownerGuard: OwnerGuardTelemetry | null;
}

export interface CpuWorkerClientOptions {
  wasmRoot: string;
  modelUrl: string;
  preprocess: PreprocessMode;
  dynamicOwnerLock?: boolean;
  auditIntervalFrames?: number;
  captureWidth?: number;
  createWorker?: () => Worker;
  onResult: (res: CpuWorkerResult) => void;
  onReleaseAll?: (reason: string) => void;
  onWorkerRestart?: (reason: string, attempt: number) => void;
  onError?: (err: string) => void;
}

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
  private droppedSinceLastResult = 0;
  private staleFramesDiscarded = 0;
  private workerRestarts = 0;
  private releaseAllCount = 0;
  private lastReleaseReason: string | null = null;
  private lastError: string | null = null;
  private lastOwnerGuard: OwnerGuardTelemetry | null = null;
  private preprocess: PreprocessMode;
  private readonly captureWidth: number;
  private readonly dynamicOwnerLock: boolean;
  private readonly auditIntervalFrames: number;
  private dispatchTimes = new Map<number, { t0: number; dispatchMs: number }>();
  private visibilityHandler: (() => void) | null = null;

  constructor(private readonly opts: CpuWorkerClientOptions) {
    this.preprocess = opts.preprocess;
    this.captureWidth = opts.captureWidth ?? 320;
    this.dynamicOwnerLock = opts.dynamicOwnerLock ?? true;
    this.auditIntervalFrames = opts.auditIntervalFrames ?? 45;
  }

  setPreprocess(mode: PreprocessMode): void {
    this.preprocess = mode;
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
            void this.handleWorkerCrash(`detect-error:${msg.message}`);
          }
          return;
        }
        if (msg.type === "RESULT") {
          this.inFlight = 0;
          if (this.closed) return;
          const info = this.dispatchTimes.get(msg.frameId);
          this.dispatchTimes.delete(msg.frameId);
          const pipelineMs = info ? Math.round((performance.now() - info.t0) * 100) / 100 : msg.timing.workerTotalMs;
          const droppedSincePrev = this.droppedSinceLastResult;
          this.droppedSinceLastResult = 0;
          this.framesCompleted++;
          this.lastOwnerGuard = msg.ownerGuard;

          const out: CpuWorkerResult = {
            frameId: msg.frameId,
            timestampMs: msg.timestampMs,
            aspect: msg.aspect,
            delegate: "CPU",
            gpuDelegateAttempted: false,
            gpuDelegateActive: false,
            landmarks: msg.landmarks,
            handedness: msg.handedness,
            luma: msg.luma,
            timing: {
              mainThreadDispatchMs: info?.dispatchMs ?? 0,
              preprocessMs: msg.timing.preprocessMs,
              detectMs: msg.timing.detectMs,
              setOptionsMs: msg.timing.setOptionsMs,
              workerTotalMs: msg.timing.workerTotalMs,
              pipelineMs,
              detectorCalls: msg.timing.detectorCalls,
            },
            ownerGuard: msg.ownerGuard,
            failClosedReason: msg.failClosedReason,
            droppedSincePrev,
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
          void this.handleWorkerCrash(`onerror:${detail}`);
        }
      };

      const initMsg: LabWorkerInboundMsg = {
        type: "INIT",
        sessionEpoch: epoch,
        wasmRoot: this.opts.wasmRoot,
        modelUrl: this.opts.modelUrl,
        dynamicOwnerLock: this.dynamicOwnerLock,
        auditIntervalFrames: this.auditIntervalFrames,
        preprocess: this.preprocess,
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
      this.worker.postMessage({ type: "CLOSE", sessionEpoch: this.sessionEpoch } satisfies LabWorkerInboundMsg);
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

  /** Submits the latest video frame if the worker is idle. Never queues stale frames. */
  async submitFrame(video: HTMLVideoElement, nowMs = performance.now()): Promise<boolean> {
    if (this.closed || !this.ready || !this.worker) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;

    this.framesReceived++;
    if (this.inFlight > 0) {
      this.framesDroppedBusy++;
      this.droppedSinceLastResult++;
      return false;
    }

    const frameId = this.nextFrameId++;
    const aspect = video.videoWidth / video.videoHeight;
    const epochAtSubmit = this.sessionEpoch;
    this.inFlight = 1;
    this.maxInFlightObserved = Math.max(this.maxInFlightObserved, this.inFlight);
    this.framesSubmitted++;
    const t0 = performance.now();

    try {
      const resizeW = Math.min(video.videoWidth, this.captureWidth);
      const resizeH = Math.max(1, Math.round((resizeW * video.videoHeight) / Math.max(1, video.videoWidth)));
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
      this.dispatchTimes.set(frameId, { t0, dispatchMs });
      const msg: LabWorkerInboundMsg = {
        type: "DETECT",
        sessionEpoch: epochAtSubmit,
        frameId,
        timestampMs: Math.round(nowMs),
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
      staleFramesDiscarded: this.staleFramesDiscarded,
      workerRestarts: this.workerRestarts,
      releaseAllCount: this.releaseAllCount,
      lastReleaseReason: this.lastReleaseReason,
      lastError: this.lastError,
      ownerGuard: this.lastOwnerGuard ? { ...this.lastOwnerGuard } : null,
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
