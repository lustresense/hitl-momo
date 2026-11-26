/**
 * NUI Lab Dedicated Web Worker for CPU-Only MediaPipe HandLandmarker (`r20-hand.worker.ts`).
 *
 * Enforces R22 Contracts K2 & W01–W08 invariants:
 *  - 100% CPU-only (`baseOptions.delegate = "CPU"`, zero WebGL/GPU delegate).
 *  - ZERO runtime `landmarker.setOptions({ numHands })` thrashing during active tracking
 *    (`runtimeSetOptionsCalls === 0` under default R22 `"fixed-2"` policy; `initSetOptionsCalls`
 *    is tracked separately). Single-owner lock, automatic reacquire, and 2-hand bystander / crossing
 *    fail-closed holds run purely in JS via `WorkerOwnerGuard`.
 *  - Propagates `captureFrameId`, `processedFrameId`, `captureTimestampMs`, `numHandsActive`,
 *    `initSetOptionsCalls`, `runtimeSetOptionsCalls`, `ownerTrack`, and full pre-LUT `lumaStats`
 *    (`mean`, `center`, `p10`, `p50`, `p95`, `nearWhiteHandPct`, `blurProxy`, `noiseProxy`,
 *    `isBacklight`, `passUsed`) using `r20-lowlight.ts` `analyzeFrameLuma`.
 *  - Always calls `bitmap.close()` in `finally` to prevent memory leaks over long sessions.
 *  - Deduplicates `hand_landmarker.task` via CacheStorage so restarts/navigation never re-download 7.8 MB.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  AutoPreprocessHysteresis,
  HF3_AUTO_PREPROCESS_PASS,
  R20_ENHANCE_WIDTH,
  R20_LUMA_SAMPLE_INTERVAL_MS,
  R22_DIM_RECOVERY_LUMA,
  analyzeFrameLuma,
  applyA4ChromaRecoveryInPlace,
  claheRgbaInPlace,
  computeRoiLumaStats,
  expandNormalizedBBox,
  handRoiFromLandmarks,
  isBacklightCandidateR22B,
  type AutoPreprocessStatus,
  type FrameLumaDiagnostics,
  type NormalizedBBox,
} from "./r20-lowlight";
import {
  WorkerOwnerGuard,
  type OwnerFailClosedReason,
  type OwnerGuardPolicy,
  type OwnerGuardTelemetry,
  type WorkerHandedness,
  type WorkerOwnerTrack,
  type WorkerPoint3,
} from "./worker-owner-guard";
import {
  RescueFSM,
  type RescueState,
  computeCropSquareFromBox,
  unmapLandmarksFromCrop,
} from "./monui7-rescue";
import type { PreprocessMode } from "./schema";
import {
  YOLO_MODEL_URL,
  YOLO_MODEL_SHA256,
  verifySha256,
  letterboxRgbaToNchw,
  parseYoloOutput,
} from "./monui7-yolo";

let ortModule: any = null;

async function getOrt(): Promise<any> {
  if (ortModule) return ortModule;
  const scope = (typeof self !== "undefined" ? self : globalThis) as any;
  if (scope.ort) {
    ortModule = scope.ort;
    return ortModule;
  }
  if (typeof scope.importScripts === "function") {
    try {
      scope.importScripts("/ort/ort.min.js");
      if (scope.ort) {
        ortModule = scope.ort;
        return ortModule;
      }
    } catch (e) {
      console.warn("[monui7-yolo] importScripts failed:", e);
    }
  }
  try {
    ortModule = await import(/* webpackIgnore: true */ "onnxruntime-web");
    return ortModule;
  } catch (e) {
    console.warn("[monui7-yolo] dynamic import failed:", e);
    return null;
  }
}

export interface WorkerLumaStats {
  mean: number;
  center: number;
  p10: number;
  p50: number;
  p95: number;
  /** R22B B3/B7.1: % of sampled pixels with luma >= 0.96. */
  clippedPct: number;
  /** R22B B3/B7.1: median luma inside active primary hand ROI, else null. */
  handRoiLumaP50: number | null;
  /** R22B B3/B7.1: median luma inside last hand ROI expanded x1.5 on lost frames, else null. */
  lastRoiLumaP50: number | null;
  nearWhiteHandPct: number | null;
  blurProxy: number;
  noiseProxy: number;
  isBacklight: boolean;
  passUsed: string;
}

export interface LabWorkerInitMsg {
  type: "INIT";
  sessionEpoch: number;
  wasmRoot: string;
  modelUrl: string;
  /** Backwards-compatible flag; R22 defaults to fixed `numHands=2` (`runtimeSetOptionsCalls = 0`). */
  dynamicOwnerLock?: boolean;
  /**
   * R22 numHands policy (default `"fixed-2"` -> 0 runtime `setOptions` calls).
   * `"legacy-dynamic"` is reserved strictly for controlled A/B ablations.
   */
  numHandsPolicy?: OwnerGuardPolicy;
  /** Optional explicit fixed `numHands` override (1 or 2; default 2). */
  fixedNumHands?: 1 | 2;
  auditIntervalFrames?: number;
  preprocess: PreprocessMode;
  dimRecoveryLuma?: number;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
  yoloEnabled?: boolean;
}

export interface LabWorkerDetectMsg {
  type: "DETECT";
  sessionEpoch: number;
  frameId: number;
  /** Monotonic unique camera frame ID from `CameraFrameScheduler` (Contract K1). */
  captureFrameId?: number;
  /** `performance.now()` when the unique camera frame arrived (Contract K1). */
  captureTimestampMs?: number;
  timestampMs: number;
  bitmap: ImageBitmap;
  aspect: number;
  preprocess?: PreprocessMode;
}

export interface LabWorkerCloseMsg {
  type: "CLOSE";
  sessionEpoch: number;
}

export interface LabWorkerPendingFrameMsg {
  type: "PENDING_FRAME";
}

export type LabWorkerInboundMsg =
  | LabWorkerInitMsg
  | LabWorkerDetectMsg
  | LabWorkerCloseMsg
  | LabWorkerPendingFrameMsg;

export interface LabWorkerReadyMsg {
  type: "READY";
  sessionEpoch: number;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  numHands: 1 | 2;
  numHandsPolicy?: OwnerGuardPolicy;
  initSetOptionsCalls?: number;
  runtimeSetOptionsCalls?: number;
}

export interface LabWorkerResultMsg {
  type: "RESULT";
  sessionEpoch: number;
  frameId: number;
  /** Monotonic unique camera frame ID submitted for inference (Contract K2). */
  captureFrameId: number;
  /** Camera frame ID completed by this worker result (equals `captureFrameId` for this result). */
  processedFrameId: number;
  /** Monotonic sequential count (1, 2, 3...) of completed inferences in this worker epoch. */
  processedSeq: number;
  /** `performance.now()` at unique camera frame capture (Contract K2). */
  captureTimestampMs: number;
  timestampMs: number;
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
  /** R22B B4.2 / K2: Raw MediaPipe handedness scores per detected hand (never invents presence scores). */
  mpHandednessScores: number[];
  /** Legacy luma payload preserved for backwards compatibility. */
  luma: {
    meanLuma: number | null;
    centerLuma: number | null;
    isDark: boolean;
    isBacklight: boolean;
    activePass: string;
  };
  /** Contract K2 extended pre-LUT luma, glare, sharpness, and noise diagnostics. */
  lumaStats: WorkerLumaStats;
  timing: {
    preprocessMs: number;
    detectMs: number;
    setOptionsMs: number;
    workerTotalMs: number;
    detectorCalls: number;
  };
  ownerGuard: OwnerGuardTelemetry;
  /** Contract K2 owner track continuity state. */
  ownerTrack: WorkerOwnerTrack;
  failClosedReason: OwnerFailClosedReason;
  monotonicClamps: number;
  /** MoNUI-7 Rescue & Telemetry K8 v2.2 fields */
  rescueState?: RescueState;
  source?: "mediapipe" | "rescue";
  positionOnly?: { cx: number; cy: number; score: number } | null;
  yoloRan?: boolean;
  yoloMs?: number | null;
  yoloScore?: number | null;
  cropTried?: boolean;
  cropSuccess?: boolean;
  rescueAutoOff?: { reason: string; p50Ms: number } | null;
  /** R23B-HF3 Auto-brightener (A4v2) hysteresis telemetry & transition events */
  autoPreprocessTransition?: {
    transition: "ON" | "OFF";
    pass: string;
    effectiveLuma: number | null;
    lumaSource: "handRoiLumaP50" | "lumaP50" | "none";
  } | null;
  autoPreprocessStatus?: AutoPreprocessStatus;
}

export interface LabWorkerErrorMsg {
  type: "ERROR";
  sessionEpoch: number;
  stage: "init" | "detect";
  message: string;
}

export interface LabWorkerProgressMsg {
  type: "PROGRESS";
  sessionEpoch: number;
  stage: "warming";
}

export type LabWorkerOutboundMsg =
  | LabWorkerReadyMsg
  | LabWorkerResultMsg
  | LabWorkerErrorMsg
  | LabWorkerProgressMsg;

let landmarker: HandLandmarker | null = null;
let currentEpoch = 0;
let lastMonotonicTs = Number.NEGATIVE_INFINITY;
let monotonicClamps = 0;
let processedSeq = 0;
let preprocessMode: PreprocessMode = "raw";
let activePolicy: OwnerGuardPolicy = "fixed-2";
let appliedNumHands: 1 | 2 = 2;
let initSetOptionsCalls = 0;
let runtimeSetOptionsCalls = 0;
let dimRecoveryLuma = R22_DIM_RECOVERY_LUMA;
let ownerGuard = new WorkerOwnerGuard({ enabled: true, policy: "fixed-2" });

let consecutiveMisses = 0;
let lastRecoveryWorked = false;
let lastLumaSampleTs = Number.NEGATIVE_INFINITY;
let lastDiag: FrameLumaDiagnostics | null = null;
let lastRawSampleRgba: Uint8ClampedArray | null = null;
let lastRawSampleW = 0;
let lastRawSampleH = 0;
let lastKnownHandRoi: NormalizedBBox | null = null;

let offscreen: OffscreenCanvas | null = null;
let offCtx: OffscreenCanvasRenderingContext2D | null = null;
let scratchBuf: Uint8ClampedArray | null = null;
let temporalPrev: Uint8ClampedArray | null = null;

let imageLandmarker: HandLandmarker | null = null;
let cachedModelAssetBuffer: Uint8Array | null = null;
let cachedVision: unknown = null;

const rescueFsm = new RescueFSM("NORMAL");
const autoPreprocessHysteresis = new AutoPreprocessHysteresis();
const WORKER_LUMA_SAMPLE_INTERVAL_MS = Math.min(R20_LUMA_SAMPLE_INTERVAL_MS, 200);
let rescueDisabled = false;
let yoloEnabled = true;
let hasPendingCameraFrame = false;
let yoloRateHz = 5;
let autoOffWarmupCount = 0;
let autoOffMeasurements: number[] = [];
let autoOffWarmupDone = false;
let autoOffReason: string | null = null;
let autoOffP50 = 0;

let yoloSession: any = null;
let yoloLoadingPromise: Promise<void> | null = null;

async function ensureYoloSession(): Promise<void> {
  if (yoloSession) return;
  if (yoloLoadingPromise) return yoloLoadingPromise;
  yoloLoadingPromise = (async () => {
    try {
      if (typeof fetch === "undefined") return;
      const resp = await fetch(YOLO_MODEL_URL);
      if (!resp.ok) {
        console.warn("[monui7-yolo] Request ONNX gagal, HTTP:", resp.status);
        return;
      }
      const buf = await resp.arrayBuffer();
      const valid = await verifySha256(buf, YOLO_MODEL_SHA256);
      if (!valid) {
        console.warn("[monui7-yolo] SHA-256 model tidak valid, fail-closed");
        return;
      }
      const ort = await getOrt();
      if (!ort) {
        console.warn("[monui7-yolo] onnxruntime-web tidak tersedia");
        return;
      }
      if (ort.env?.wasm) {
        ort.env.wasm.wasmPaths = "/ort/";
        ort.env.wasm.numThreads = 1;
      }
      yoloSession = await ort.InferenceSession.create(new Uint8Array(buf), {
        executionProviders: ["wasm"],
      });
      console.log("[monui7-yolo] Sesi onnxruntime-web berhasil dibuat. Model verified:", YOLO_MODEL_SHA256);
    } catch (e) {
      console.warn("[monui7-yolo] Gagal inisialisasi onnxruntime-web:", e);
    }
  })();
  return yoloLoadingPromise;
}

function safeCloseLandmarker(): void {
  if (landmarker) {
    try {
      landmarker.close();
    } catch {
      /* ignore */
    }
    landmarker = null;
  }
  if (imageLandmarker) {
    try {
      imageLandmarker.close();
    } catch {
      /* ignore */
    }
    imageLandmarker = null;
  }
}

/**
 * Only invoked when explicitly running the `"legacy-dynamic"` ablation comparator.
 * Under R22 fixed policies (`"fixed-2"` / `"fixed-1"`), returns `0` immediately and NEVER
 * touches `landmarker.setOptions(...)`.
 */
async function syncNumHandsRuntime(desired: 1 | 2): Promise<number> {
  if (activePolicy !== "legacy-dynamic") return 0;
  if (!landmarker || appliedNumHands === desired) return 0;
  const t0 = performance.now();
  await landmarker.setOptions({ numHands: desired });
  appliedNumHands = desired;
  runtimeSetOptionsCalls++;
  return Math.round((performance.now() - t0) * 100) / 100;
}

function prepareWorkerSurface(
  bitmap: ImageBitmap,
  nowTs: number,
): { surface: ImageBitmap | OffscreenCanvas; activePass: string; preprocessMs: number } {
  const t0 = performance.now();
  if (typeof OffscreenCanvas === "undefined") {
    return { surface: bitmap, activePass: "A0_raw", preprocessMs: 0 };
  }

  const w = R20_ENHANCE_WIDTH;
  const h = Math.max(1, Math.round((w * bitmap.height) / Math.max(1, bitmap.width)));
  if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
    offscreen = new OffscreenCanvas(w, h);
    offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    scratchBuf = new Uint8ClampedArray(w * h * 4);
    temporalPrev = null;
    lastRawSampleRgba = null;
    lastRawSampleW = w;
    lastRawSampleH = h;
  }
  if (!offCtx || !offscreen) {
    return { surface: bitmap, activePass: "A0_raw", preprocessMs: 0 };
  }

  // Sample pre-LUT luma, percentiles, blur, and noise periodically even in RAW mode.
  let imgData: ImageData | null = null;
  if (nowTs - lastLumaSampleTs >= WORKER_LUMA_SAMPLE_INTERVAL_MS || lastDiag === null) {
    lastLumaSampleTs = nowTs;
    offCtx.drawImage(bitmap, 0, 0, w, h);
    imgData = offCtx.getImageData(0, 0, w, h);
    lastDiag = analyzeFrameLuma(imgData.data, w, h, {
      step: 2,
      dimThreshold: dimRecoveryLuma,
    });
    // Cache raw pre-LUT pixels so hand-ROI nearWhiteHandPct & handRoiLumaP50 stay strictly pre-LUT.
    if (!lastRawSampleRgba || lastRawSampleRgba.length !== imgData.data.length) {
      lastRawSampleRgba = new Uint8ClampedArray(imgData.data);
    } else {
      lastRawSampleRgba.set(imgData.data);
    }
    lastRawSampleW = w;
    lastRawSampleH = h;
  }

  if (preprocessMode === "raw") {
    // R23B-HF3 Step 3: automatic low-light brightening via existing A4v2 hysteresis (ON < 0.15 / 1s, OFF > 0.22 / 2s).
    if (!autoPreprocessHysteresis.active) {
      temporalPrev = null;
      return {
        surface: bitmap,
        activePass: "A0_raw",
        preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
      };
    }
    if (!imgData) {
      offCtx.drawImage(bitmap, 0, 0, w, h);
      imgData = offCtx.getImageData(0, 0, w, h);
    }
    const meanLumaForLut = lastDiag?.meanLuma ?? 0.1;
    temporalPrev = applyA4ChromaRecoveryInPlace(
      imgData.data,
      w,
      h,
      meanLumaForLut,
      temporalPrev,
      scratchBuf ?? undefined,
    );
    offCtx.putImageData(imgData, 0, 0);
    return {
      surface: offscreen,
      activePass: HF3_AUTO_PREPROCESS_PASS,
      preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  if (preprocessMode === "clahe") {
    if (!imgData) {
      offCtx.drawImage(bitmap, 0, 0, w, h);
      imgData = offCtx.getImageData(0, 0, w, h);
    }
    claheRgbaInPlace(imgData.data, w, h, 2.0);
    offCtx.putImageData(imgData, 0, 0);
    return {
      surface: offscreen,
      activePass: "A2_clahe320",
      preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  // Mode "a4": stay RAW in normal lighting (T2 fix: threshold 0.32 instead of 0.52);
  // engage A4v2 chroma-preserving denoise + Reinhard LUT only when genuinely dim or backlit
  // AND either recovery previously succeeded or detector missed on RAW.
  const lumaVal = lastDiag?.meanLuma ?? 0.5;
  const isDimOrBacklit =
    lastDiag?.shouldActivateDimRecovery ?? (lumaVal < dimRecoveryLuma);
  const shouldEnhance = isDimOrBacklit && (lastRecoveryWorked || consecutiveMisses >= 1);

  if (!shouldEnhance) {
    if (isDimOrBacklit && imgData) {
      temporalPrev = new Uint8ClampedArray(imgData.data);
    } else if (!isDimOrBacklit) {
      temporalPrev = null;
    }
    return {
      surface: bitmap,
      activePass: "A0_raw",
      preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  if (!imgData) {
    offCtx.drawImage(bitmap, 0, 0, w, h);
    imgData = offCtx.getImageData(0, 0, w, h);
  }
  temporalPrev = applyA4ChromaRecoveryInPlace(
    imgData.data,
    w,
    h,
    lumaVal,
    temporalPrev,
    scratchBuf ?? undefined,
  );
  offCtx.putImageData(imgData, 0, 0);
  return {
    surface: offscreen,
    activePass: "A4_denoise_reinhard320",
    preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

async function loadModelBufferCached(modelUrl: string): Promise<Uint8Array> {
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open("nui-lab-models-v1");
      let resp = await cache.match(modelUrl);
      if (!resp) {
        const netResp = await fetch(modelUrl);
        if (netResp.ok) {
          await cache.put(modelUrl, netResp.clone());
          resp = netResp;
        }
      }
      if (resp) return new Uint8Array(await resp.arrayBuffer());
    } catch {
      /* fallback to direct fetch */
    }
  }
  const r = await fetch(modelUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${modelUrl}`);
  return new Uint8Array(await r.arrayBuffer());
}

interface WorkerScopeLike {
  onmessage: ((ev: MessageEvent<LabWorkerInboundMsg>) => void) | null;
  postMessage(message: LabWorkerOutboundMsg): void;
}

const workerScope: WorkerScopeLike = self as unknown as WorkerScopeLike;

function resolveInitPolicy(msg: LabWorkerInitMsg): OwnerGuardPolicy {
  if (msg.numHandsPolicy) return msg.numHandsPolicy;
  if (msg.fixedNumHands === 1) return "fixed-1";
  return "fixed-2";
}

function warmUpLandmarker(instance: HandLandmarker): void {
  if (typeof OffscreenCanvas === "undefined") return;
  try {
    const canvas = new OffscreenCanvas(64, 64);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 64, 64);
    }
    instance.detectForVideo(canvas as unknown as ImageBitmap, 0);
    lastMonotonicTs = 0;
  } catch {
    /* best-effort cold-start warmup */
  }
}

workerScope.onmessage = async (ev: MessageEvent<LabWorkerInboundMsg>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "CLOSE") {
    currentEpoch = msg.sessionEpoch;
    safeCloseLandmarker();
    autoPreprocessHysteresis.reset();
    temporalPrev = null;
    lastRawSampleRgba = null;
    lastKnownHandRoi = null;
    return;
  }

  if (msg.type === "INIT") {
    currentEpoch = msg.sessionEpoch;
    preprocessMode = msg.preprocess;
    dimRecoveryLuma = msg.dimRecoveryLuma ?? R22_DIM_RECOVERY_LUMA;
    activePolicy = resolveInitPolicy(msg);
    appliedNumHands = activePolicy === "fixed-1" ? 1 : 2;
    initSetOptionsCalls = 0;
    runtimeSetOptionsCalls = 0;
    processedSeq = 0;

    ownerGuard = new WorkerOwnerGuard({
      enabled: msg.dynamicOwnerLock ?? true,
      policy: activePolicy,
      fixedNumHands: appliedNumHands,
      lockConfirmFrames: activePolicy === "legacy-dynamic" ? 3 : 2,
      auditIntervalFrames: msg.auditIntervalFrames ?? 45,
    });
    ownerGuard.reset(appliedNumHands);

    consecutiveMisses = 0;
    lastRecoveryWorked = false;
    lastMonotonicTs = Number.NEGATIVE_INFINITY;
    monotonicClamps = 0;
    lastLumaSampleTs = Number.NEGATIVE_INFINITY;
    lastDiag = null;
    lastRawSampleRgba = null;
    lastKnownHandRoi = null;
    temporalPrev = null;
    autoPreprocessHysteresis.reset();
    safeCloseLandmarker();

    try {
      const [vision, modelAssetBuffer] = await Promise.all([
        FilesetResolver.forVisionTasks(msg.wasmRoot),
        loadModelBufferCached(msg.modelUrl),
      ]);
      cachedVision = vision;
      cachedModelAssetBuffer = modelAssetBuffer;
      workerScope.postMessage({
        type: "PROGRESS",
        sessionEpoch: currentEpoch,
        stage: "warming",
      });
      rescueFsm.reset();
      rescueDisabled = false;
      yoloEnabled = msg.yoloEnabled !== undefined ? msg.yoloEnabled : true;
      hasPendingCameraFrame = false;
      if (yoloEnabled) {
        void ensureYoloSession();
      }
      yoloRateHz = 5;
      autoOffWarmupCount = 0;
      autoOffMeasurements = [];
      autoOffWarmupDone = false;
      autoOffReason = null;
      autoOffP50 = 0;
      // STRICT CPU-ONLY POLICY (G20-A / W01): delegate is hardcoded to "CPU".
      // numHands is configured ONCE during createFromOptions -> 0 runtime setOptions transitions!
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: appliedNumHands,
        minHandDetectionConfidence: msg.minDetectionConfidence ?? 0.6,
        minHandPresenceConfidence: msg.minPresenceConfidence ?? 0.45,
        minTrackingConfidence: msg.minTrackingConfidence ?? 0.45,
      });
      warmUpLandmarker(landmarker);
      workerScope.postMessage({
        type: "READY",
        sessionEpoch: currentEpoch,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        numHands: appliedNumHands,
        numHandsPolicy: activePolicy,
        initSetOptionsCalls,
        runtimeSetOptionsCalls,
      });
    } catch (err) {
      workerScope.postMessage({
        type: "ERROR",
        sessionEpoch: currentEpoch,
        stage: "init",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "PENDING_FRAME") {
    hasPendingCameraFrame = true;
    return;
  }

  if (msg.type === "DETECT") {
    hasPendingCameraFrame = false;
    const tStart = performance.now();
    const { bitmap, sessionEpoch, frameId, aspect } = msg;
    const captureFrameId = msg.captureFrameId ?? frameId;
    const captureTimestampMs = msg.captureTimestampMs ?? msg.timestampMs;
    if (msg.preprocess) preprocessMode = msg.preprocess;

    try {
      if (sessionEpoch !== currentEpoch || !landmarker) return;

      const rawTs = Math.round(msg.timestampMs);
      let ts = rawTs;
      if (ts <= lastMonotonicTs) {
        ts = lastMonotonicTs + 1;
        monotonicClamps++;
      }
      lastMonotonicTs = ts;

      let setOptionsMs = 0;
      const preNumHands = ownerGuard.beforeDetect();
      setOptionsMs += await syncNumHandsRuntime(preNumHands);

      const prep = prepareWorkerSurface(bitmap, ts);
      const tDet0 = performance.now();
      const res = landmarker.detectForVideo(prep.surface as unknown as ImageBitmap, ts);
      const detectMs = Math.round((performance.now() - tDet0) * 100) / 100;

      const rawLms: WorkerPoint3[][] = (res.landmarks ?? []).map((hand) =>
        hand.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
      );
      const rawHds: WorkerHandedness[] = (res.handedness ?? []).map((cats) => {
        const c = cats[0];
        return {
          categoryName: c?.categoryName ?? c?.displayName ?? "Unknown",
          score: c?.score ?? 0,
        };
      });

      const mpRawHandCount = rawLms.length;
      const mpHandednessScores = rawHds.map((h) => Math.round(h.score * 10000) / 10000);

      const guarded = ownerGuard.afterDetect(rawLms, rawHds, captureTimestampMs);
      setOptionsMs += await syncNumHandsRuntime(guarded.nextNumHands);
      processedSeq++;

      if (guarded.landmarks.length > 0) {
        consecutiveMisses = 0;
        lastRecoveryWorked = prep.activePass === "A4_denoise_reinhard320";
      } else {
        consecutiveMisses++;
        if (prep.activePass === "A4_denoise_reinhard320") {
          if (consecutiveMisses % 4 === 0) lastRecoveryWorked = false;
        }
      }

      const primaryHandForRoi = guarded.landmarks[0] ?? null;
      const currentRoi = primaryHandForRoi ? handRoiFromLandmarks(primaryHandForRoi, 0.04) : null;
      let nearWhiteHandPct: number | null = null;
      let handRoiLumaP50: number | null = null;
      let lastRoiLumaP50: number | null = null;

      if (currentRoi) {
        lastKnownHandRoi = currentRoi;
        const roiStats = computeRoiLumaStats(lastRawSampleRgba, lastRawSampleW, lastRawSampleH, currentRoi);
        nearWhiteHandPct = roiStats.nearWhitePct;
        handRoiLumaP50 = roiStats.lumaP50;
      } else if (lastKnownHandRoi) {
        const expanded = expandNormalizedBBox(lastKnownHandRoi, 1.5);
        lastRoiLumaP50 = computeRoiLumaStats(lastRawSampleRgba, lastRawSampleW, lastRawSampleH, expanded).lumaP50;
      }

      const clippedPct = lastDiag?.clippedPct ?? 0;
      const isBacklightR22B = isBacklightCandidateR22B(clippedPct, handRoiLumaP50, lastRoiLumaP50);

      // R23B-HF3 Step 3: update auto-preprocess hysteresis using strictly pre-LUT luma (handRoiLumaP50 else lumaP50).
      const autoPreRes =
        preprocessMode === "raw"
          ? autoPreprocessHysteresis.update({
              nowMs: ts,
              handRoiLumaP50,
              lumaP50: lastDiag?.p50 ?? null,
            })
          : null;
      const autoPreprocessTransition =
        autoPreRes && autoPreRes.transition
          ? {
              transition: autoPreRes.transition,
              pass: autoPreRes.transition === "ON" ? HF3_AUTO_PREPROCESS_PASS : "A0_raw",
              effectiveLuma: autoPreRes.effectiveLuma,
              lumaSource: autoPreRes.lumaSource,
            }
          : null;
      const autoPreprocessStatus = autoPreprocessHysteresis.getStatus();

      const lumaStats: WorkerLumaStats = {
        mean: lastDiag?.meanLuma ?? 0,
        center: lastDiag?.centerLuma ?? 0,
        p10: lastDiag?.p10 ?? 0,
        p50: lastDiag?.p50 ?? 0,
        p95: lastDiag?.p95 ?? 0,
        clippedPct,
        handRoiLumaP50,
        lastRoiLumaP50,
        nearWhiteHandPct,
        blurProxy: lastDiag?.blurProxy ?? 0,
        noiseProxy: lastDiag?.noiseProxy ?? 0,
        isBacklight: isBacklightR22B,
        passUsed: prep.activePass,
      };

      // MoNUI-7 Rescue Integration (T22 / Lampiran A)
      let rescueState: RescueState = "NORMAL";
      let source: "mediapipe" | "rescue" = "mediapipe";
      let positionOnly: { cx: number; cy: number; score: number } | null = null;
      let yoloRan = false;
      let yoloMs: number | null = null;
      let yoloScore: number | null = null;
      let cropTried = false;
      let cropSuccess = false;
      let autoOffReport: { reason: string; p50Ms: number } | null = null;

      const hasMpHands = guarded.landmarks.length > 0;
      if (hasMpHands) {
        rescueFsm.update({ t: ts, mpHand: true, hasPendingFrame: hasPendingCameraFrame });
        rescueState = "NORMAL";
        source = "mediapipe";
      } else if (!rescueDisabled && yoloEnabled) {
        const step = rescueFsm.update({
          t: ts,
          mpHand: false,
          hasPendingFrame: hasPendingCameraFrame,
        });
        rescueState = step.state;

        if (step.shouldRunYolo && !hasPendingCameraFrame) {
          yoloRan = true;
          const tYolo0 = performance.now();
          if (yoloSession && offCtx && offscreen) {
            try {
              cropTried = true;
              const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
              const { tensor, meta } = letterboxRgbaToNchw(imgData.data, offscreen.width, offscreen.height);
              const ort = await getOrt();
              const inTensor = new ort.Tensor("float32", tensor, [1, 3, 320, 320]);
              const feeds: Record<string, any> = { [yoloSession.inputNames[0]]: inTensor };
              const results = await yoloSession.run(feeds);
              const outTensor = results[yoloSession.outputNames[0]];
              if (outTensor) {
                const dets = parseYoloOutput(outTensor.data as Float32Array, outTensor.dims, meta, 0.35);
                const firstDet = dets[0];
                if (firstDet) {
                  cropSuccess = true;
                  yoloScore = Math.round(firstDet.score * 1000) / 1000;
                  const step2 = rescueFsm.update({
                    t: ts,
                    mpHand: false,
                    yolo: { box: firstDet.box, score: firstDet.score },
                  });
                  rescueState = step2.state;
                  if (step2.positionOnly) {
                    positionOnly = step2.positionOnly;
                    source = "rescue";
                  }
                }
              }
            } catch (err) {
              console.warn("[monui7-yolo] Inference error:", err);
            }
          }
          const yoloDur = performance.now() - tYolo0;
          yoloMs = Math.round(yoloDur * 10) / 10;

          if (!autoOffWarmupDone) {
            if (autoOffWarmupCount < 3) {
              autoOffWarmupCount++;
            } else {
              autoOffMeasurements.push(yoloDur);
              if (autoOffMeasurements.length >= 5) {
                autoOffWarmupDone = true;
                const sorted = [...autoOffMeasurements].sort((a, b) => a - b);
                const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
                autoOffP50 = p50;
                if (p50 > 120) {
                  rescueDisabled = true;
                  autoOffReason = "LATENCY_P50_GT_120MS";
                  autoOffReport = { reason: autoOffReason, p50Ms: Math.round(p50 * 10) / 10 };
                } else if (p50 > 60) {
                  yoloRateHz = 5;
                  autoOffReason = "REDUCED_TO_5HZ_P50_GT_60MS";
                  autoOffReport = { reason: autoOffReason, p50Ms: Math.round(p50 * 10) / 10 };
                }
              }
            }
          }
        }

        if (rescueState === "POSITION_ONLY") {
          positionOnly = step.positionOnly;
          source = "rescue";
        }
      }

      workerScope.postMessage({
        type: "RESULT",
        sessionEpoch,
        frameId,
        captureFrameId,
        processedFrameId: captureFrameId,
        processedSeq,
        captureTimestampMs,
        timestampMs: ts,
        aspect,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        numHandsActive: appliedNumHands,
        initSetOptionsCalls,
        runtimeSetOptionsCalls,
        landmarks: guarded.landmarks,
        handedness: guarded.handedness,
        mpRawHandCount,
        mpHandednessScores,
        luma: {
          meanLuma: lastDiag ? lastDiag.meanLuma : null,
          centerLuma: lastDiag ? lastDiag.centerLuma : null,
          isDark: lastDiag ? lastDiag.isDark : false,
          isBacklight: isBacklightR22B,
          activePass: prep.activePass,
        },
        lumaStats,
        timing: {
          preprocessMs: prep.preprocessMs,
          detectMs,
          setOptionsMs: Math.round(setOptionsMs * 100) / 100,
          workerTotalMs: Math.round((performance.now() - tStart) * 100) / 100,
          detectorCalls: 1,
        },
        ownerGuard: ownerGuard.telemetry(),
        ownerTrack: guarded.ownerTrack,
        failClosedReason: guarded.failClosedReason,
        monotonicClamps,
        rescueState,
        source,
        positionOnly,
        yoloRan,
        yoloMs,
        yoloScore,
        cropTried,
        cropSuccess,
        rescueAutoOff: autoOffReport,
        autoPreprocessTransition,
        autoPreprocessStatus,
      });
    } catch (err) {
      workerScope.postMessage({
        type: "ERROR",
        sessionEpoch,
        stage: "detect",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      try {
        bitmap.close();
      } catch {
        /* ignore */
      }
    }
  }
};
