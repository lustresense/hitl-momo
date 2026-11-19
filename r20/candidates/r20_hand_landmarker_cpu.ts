/**
 * R20 CPU-Only HandLandmarker Controller & Dedicated Web Worker Bridge (`r20_hand_landmarker_cpu.ts`).
 *
 * Implements §7.1–7.5 & §14.1:
 *  - Hard enforces `delegate: "CPU"` (`gpuDelegateAttempted: false`, `gpuDelegateActive: false`) across
 *    both Variant A (`cpu-main-thread`) and Variant B (`cpu-web-worker`).
 *  - Variant B (`cpu-web-worker`):
 *      * Moves synchronous `HandLandmarker.detectForVideo` off the main UI thread into a dedicated Web Worker
 *        (`r20_hand_landmarker.worker.ts`) via transferable `ImageBitmap`.
 *      * Strictly caps in-flight frames to `1` (`maxInFlight = 1`, latest-frame-wins; no queue buildup).
 *      * Downscales transferable `ImageBitmap` capture to detection width (`320 px` default) so main-thread
 *        `createImageBitmap` + `postMessage` transfer takes < 1.5 ms and causes ZERO >50 ms UI LongTasks.
 *      * Increments `sessionEpoch` on every reset/stop/hidden/crash and immediately fires `onReleaseAll`
 *        (`0` stuck keys; stale in-flight worker messages from prior epochs are discarded).
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  R20LowLightFrameSource,
  type R20FrameSourceStats,
  type R20LowLightMode,
} from "./r20_lowlight_frame_source";
import type {
  R20WorkerDetectMessage,
  R20WorkerHandResult,
  R20WorkerInboundMessage,
  R20WorkerInitMessage,
  R20WorkerOutboundMessage,
} from "./r20_hand_landmarker.worker";

export type R20ExecutionVariant = "cpu-main-thread" | "cpu-web-worker";

export interface R20HandDetectionFrameResult {
  frameId: number;
  timestampMs: number;
  aspect: number;
  variant: R20ExecutionVariant;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  landmarks: Array<Array<{ x: number; y: number; z: number }>>;
  handedness: Array<{ categoryName: string; score: number }>;
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
    setOptionsMs?: number;
    totalE2eMs: number;
  };
  ownerGuard?: {
    activeNumHands: 1 | 2;
    bystanderAudits: number;
    bystanderDetections: number;
    ownerJumpRejects: number;
    ownerSizeRejects: number;
    handednessProbes: number;
    bystanderCooldown: number;
  };
  monotonicClamps?: number;
}

export interface R20CpuDetectorTelemetry {
  variant: R20ExecutionVariant;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  numHands: number;
  lowLightMode: R20LowLightMode;
  ready: boolean;
  closed: boolean;
  inFlight: number;
  maxInFlightObserved: number;
  framesSubmitted: number;
  framesCompleted: number;
  framesDroppedBusy: number;
  staleFramesDiscarded: number;
  releaseAllCount: number;
  lastReleaseReason: string | null;
  lastError: string | null;
}

export interface R20CpuHandDetectorOptions {
  variant: R20ExecutionVariant;
  wasmRoot: string;
  modelUrl: string;
  workerScriptUrl?: string;
  numHands?: number;
  dynamicOwnerLock?: boolean;
  lowLightMode?: R20LowLightMode;
  captureWidth?: number;
  onResult: (result: R20HandDetectionFrameResult) => void;
  onReleaseAll: (reason: string) => void;
  onError?: (message: string) => void;
}

export class R20CpuHandDetector {
  private readonly variant: R20ExecutionVariant;
  private readonly numHands: number;
  private lowLightMode: R20LowLightMode;
  private readonly captureWidth: number;
  private sessionEpoch = 1;
  private ready = false;
  private closed = false;
  private inFlight = 0;
  private maxInFlightObserved = 0;
  private nextFrameId = 1;
  private lastMonotonicTs = Number.NEGATIVE_INFINITY;
  private lastVideoTime = -1;
  private framesSubmitted = 0;
  private framesCompleted = 0;
  private framesDroppedBusy = 0;
  private staleFramesDiscarded = 0;
  private releaseAllCount = 0;
  private lastReleaseReason: string | null = null;
  private lastError: string | null = null;

  // Main-thread variant state
  private mainLandmarker: HandLandmarker | null = null;
  private readonly mainFrameSource = new R20LowLightFrameSource();

  // Web-worker variant state
  private worker: Worker | null = null;
  private activeVideo: HTMLVideoElement | null = null;
  private readonly dispatchTimes = new Map<number, { t0: number; dispatchMs: number }>();
  private visibilityHandler: (() => void) | null = null;

  constructor(private readonly opts: R20CpuHandDetectorOptions) {
    this.variant = opts.variant;
    this.numHands = opts.numHands ?? 2;
    this.lowLightMode = opts.lowLightMode ?? "adaptive-fallback";
    this.captureWidth = opts.captureWidth ?? 320;
    this.mainFrameSource.setMode(this.lowLightMode);
  }

  async init(): Promise<void> {
    if (this.closed) throw new Error("R20CpuHandDetector already closed");
    this.attachLifecycleGuards();

    if (this.variant === "cpu-main-thread") {
      const vision = await FilesetResolver.forVisionTasks(this.opts.wasmRoot);
      // STRICT CPU-ONLY POLICY (G20-A): never instantiate GPU delegate
      this.mainLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: this.opts.modelUrl,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: this.numHands,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      this.ready = true;
      return;
    }

    // Variant B: Dedicated Web Worker
    const workerUrl = this.opts.workerScriptUrl;
    if (!workerUrl) {
      throw new Error("workerScriptUrl is required for cpu-web-worker variant");
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const w = new Worker(workerUrl);
      this.worker = w;
      const epoch = this.sessionEpoch;

      w.onmessage = (ev: MessageEvent<R20WorkerOutboundMessage>) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.sessionEpoch !== this.sessionEpoch) {
          this.staleFramesDiscarded++;
          return;
        }
        if (msg.type === "READY") {
          this.ready = true;
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }
        if (msg.type === "ERROR") {
          this.inFlight = Math.max(0, this.inFlight - 1);
          this.lastError = msg.message;
          this.triggerReleaseAll(`worker-${msg.stage}-error`);
          this.opts.onError?.(msg.message);
          if (!settled) {
            settled = true;
            reject(new Error(msg.message));
          }
          return;
        }
        if (msg.type === "RESULT") {
          this.inFlight = Math.max(0, this.inFlight - 1);
          this.framesCompleted++;
          const meta = this.dispatchTimes.get(msg.frameId);
          this.dispatchTimes.delete(msg.frameId);
          const totalE2eMs = meta ? Math.round((performance.now() - meta.t0) * 100) / 100 : msg.timing.workerTotalMs;
          const dispatchMs = meta ? meta.dispatchMs : 0;
          this.opts.onResult({
            frameId: msg.frameId,
            timestampMs: msg.timestampMs,
            aspect: msg.aspect,
            variant: "cpu-web-worker",
            delegate: "CPU",
            gpuDelegateAttempted: false,
            gpuDelegateActive: false,
            landmarks: msg.landmarks,
            handedness: msg.handedness,
            luma: msg.luma,
            timing: {
              mainThreadDispatchMs: dispatchMs,
              preprocessMs: msg.timing.preprocessMs,
              detectMs: msg.timing.detectMs,
              setOptionsMs: msg.timing.setOptionsMs ?? 0,
              totalE2eMs,
            },
            ownerGuard: msg.ownerGuard,
            monotonicClamps: msg.monotonicClamps ?? 0,
          });
          // Immediate frame pump: if <video> already advanced while worker was busy, submit immediately without waiting up to 16.7ms for next rAF
          if (this.activeVideo && !this.closed && this.ready && this.inFlight === 0) {
            if (this.activeVideo.currentTime !== this.lastVideoTime) {
              void this.submitVideoFrame(this.activeVideo, performance.now());
            }
          }
        }
      };

      w.onerror = (err) => {
        this.inFlight = 0;
        const message = err.message || "Web Worker runtime error";
        this.lastError = message;
        this.triggerReleaseAll("worker-crash");
        this.opts.onError?.(message);
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };

      const initMsg: R20WorkerInitMessage = {
        type: "INIT",
        sessionEpoch: epoch,
        wasmRoot: this.opts.wasmRoot,
        modelUrl: this.opts.modelUrl,
        numHands: this.numHands,
        dynamicOwnerLock: Boolean(this.opts.dynamicOwnerLock),
        lowLightMode: this.lowLightMode,
      };
      w.postMessage(initMsg);
    });
  }

  private attachLifecycleGuards(): void {
    if (typeof document === "undefined" || this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this.triggerReleaseAll("tab-hidden");
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  setLowLightMode(mode: R20LowLightMode): void {
    this.lowLightMode = mode;
    this.mainFrameSource.setMode(mode);
  }

  /** Immediately invalidate in-flight frames and emit fail-closed RELEASE_ALL. */
  triggerReleaseAll(reason: string): void {
    this.sessionEpoch++;
    this.inFlight = 0;
    this.dispatchTimes.clear();
    this.releaseAllCount++;
    this.lastReleaseReason = reason;
    this.opts.onReleaseAll(reason);
  }

  /**
   * Poll/submit the current `<video>` frame.
   * Enforces max 1 frame in-flight and latest-frame-wins (drops outdated frames if detector is busy).
   */
  async submitVideoFrame(video: HTMLVideoElement, nowMs = performance.now()): Promise<boolean> {
    if (this.closed || !this.ready) return false;
    if (!video.videoWidth || !video.videoHeight || video.paused || video.ended) return false;
    this.activeVideo = video;
    if (video.currentTime === this.lastVideoTime) return false;

    // Latest-frame-wins: never queue a second frame while one detection is in flight
    if (this.inFlight >= 1) {
      this.framesDroppedBusy++;
      return false;
    }

    this.lastVideoTime = video.currentTime;
    const aspect = video.videoWidth / Math.max(1, video.videoHeight);
    const ts = Math.max(Math.round(nowMs), this.lastMonotonicTs + 1);
    this.lastMonotonicTs = ts;
    const frameId = this.nextFrameId++;

    if (this.variant === "cpu-main-thread") {
      if (!this.mainLandmarker) return false;
      this.inFlight = 1;
      this.maxInFlightObserved = Math.max(this.maxInFlightObserved, this.inFlight);
      this.framesSubmitted++;
      const t0 = performance.now();
      try {
        const surface = this.mainFrameSource.frameForDetection(video);
        const fStats: R20FrameSourceStats = this.mainFrameSource.getStats();
        const tDet0 = performance.now();
        const res = this.mainLandmarker.detectForVideo(surface, ts);
        const detectMs = Math.round((performance.now() - tDet0) * 100) / 100;
        const totalMs = Math.round((performance.now() - t0) * 100) / 100;

        const lms = (res.landmarks ?? []).map((hand: Array<{ x: number; y: number; z?: number }>) =>
          hand.map((p: { x: number; y: number; z?: number }) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
        );
        const hds = (res.handedness ?? []).map((cats: Array<{ categoryName?: string; displayName?: string; score?: number }>) => {
          const c = cats[0];
          return {
            categoryName: c?.categoryName ?? c?.displayName ?? "Unknown",
            score: c?.score ?? 0,
          };
        });
        this.mainFrameSource.notifyDetectionResult(lms.length);
        this.framesCompleted++;
        this.opts.onResult({
          frameId,
          timestampMs: ts,
          aspect,
          variant: "cpu-main-thread",
          delegate: "CPU",
          gpuDelegateAttempted: false,
          gpuDelegateActive: false,
          landmarks: lms,
          handedness: hds,
          luma: {
            meanLuma: fStats.lastLuma,
            centerLuma: fStats.lastCenterLuma,
            isDark: fStats.darkCandidate,
            isBacklight: fStats.backlightCandidate,
            activePass: fStats.activePass,
          },
          timing: {
            mainThreadDispatchMs: totalMs,
            preprocessMs: fStats.lastPreprocessMs ?? 0,
            detectMs,
            totalE2eMs: totalMs,
          },
        });
        return true;
      } finally {
        this.inFlight = 0;
      }
    }

    // Variant B: Dedicated Web Worker via transferable ImageBitmap
    if (!this.worker) return false;
    this.inFlight = 1;
    this.maxInFlightObserved = Math.max(this.maxInFlightObserved, this.inFlight);
    this.framesSubmitted++;
    const epochAtSubmit = this.sessionEpoch;
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
      const msg: R20WorkerDetectMessage = {
        type: "DETECT",
        sessionEpoch: epochAtSubmit,
        frameId,
        timestampMs: ts,
        bitmap,
        aspect,
        lowLightMode: this.lowLightMode,
      };
      this.worker.postMessage(msg, [bitmap]);
      return true;
    } catch (err) {
      this.inFlight = 0;
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  getTelemetry(): R20CpuDetectorTelemetry {
    return {
      variant: this.variant,
      delegate: "CPU",
      gpuDelegateAttempted: false,
      gpuDelegateActive: false,
      numHands: this.numHands,
      lowLightMode: this.lowLightMode,
      ready: this.ready,
      closed: this.closed,
      inFlight: this.inFlight,
      maxInFlightObserved: this.maxInFlightObserved,
      framesSubmitted: this.framesSubmitted,
      framesCompleted: this.framesCompleted,
      framesDroppedBusy: this.framesDroppedBusy,
      staleFramesDiscarded: this.staleFramesDiscarded,
      releaseAllCount: this.releaseAllCount,
      lastReleaseReason: this.lastReleaseReason,
      lastError: this.lastError,
    };
  }

  close(reason = "detector-closed"): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.triggerReleaseAll(reason);
    if (typeof document !== "undefined" && this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.mainLandmarker) {
      try {
        this.mainLandmarker.close();
      } catch {
        /* ignore */
      }
      this.mainLandmarker = null;
    }
    if (this.worker) {
      try {
        const closeMsg: R20WorkerInboundMessage = { type: "CLOSE", sessionEpoch: this.sessionEpoch };
        this.worker.postMessage(closeMsg);
        this.worker.terminate();
      } catch {
        /* ignore */
      }
      this.worker = null;
    }
  }
}
