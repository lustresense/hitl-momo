/**
 * NUI Lab Dedicated Web Worker for CPU-Only MediaPipe HandLandmarker (`r20-hand.worker.ts`).
 *
 * Enforces R20-FIX P0.1 & P0.3 invariants:
 *  - 100% CPU-only (`baseOptions.delegate = "CPU"`, zero WebGL/GPU delegate).
 *  - Guarded Dynamic Owner-Lock (`WorkerOwnerGuard`): `numHands=2` on acquisition, loss, and bystander presence,
 *    with spatial (`<= 0.18`), size-ratio (`<= 1.6`), handedness-flip, and periodic 2-hand bystander audit probes.
 *  - Chroma-preserving A4v2 low-light recovery (`applyA4ChromaRecoveryInPlace`: motion-gated temporal EMA +
 *    separable median-5 + Reinhard LUT) activated only on dim/backlit misses, keeping bright RAW untouched.
 *  - Always calls `bitmap.close()` in `finally` to avoid memory leaks over long sessions.
 *  - Deduplicates `hand_landmarker.task` via CacheStorage so restarts/navigation never re-download 7.8 MB.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  R20_BACKLIGHT_CENTER_MAX,
  R20_BACKLIGHT_LUMA_GAP,
  R20_DARK_LUMA,
  R20_DIM_RECOVERY_LUMA,
  R20_ENHANCE_WIDTH,
  R20_LUMA_SAMPLE_INTERVAL_MS,
  applyA4ChromaRecoveryInPlace,
  claheRgbaInPlace,
  computeMeanAndCenterLuma,
} from "./r20-lowlight";
import {
  WorkerOwnerGuard,
  type OwnerGuardTelemetry,
  type WorkerHandedness,
  type WorkerPoint3,
} from "./worker-owner-guard";
import type { PreprocessMode } from "./schema";

export interface LabWorkerInitMsg {
  type: "INIT";
  sessionEpoch: number;
  wasmRoot: string;
  modelUrl: string;
  dynamicOwnerLock: boolean;
  auditIntervalFrames?: number;
  preprocess: PreprocessMode;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
}

export interface LabWorkerDetectMsg {
  type: "DETECT";
  sessionEpoch: number;
  frameId: number;
  timestampMs: number;
  bitmap: ImageBitmap;
  aspect: number;
  preprocess?: PreprocessMode;
}

export interface LabWorkerCloseMsg {
  type: "CLOSE";
  sessionEpoch: number;
}

export type LabWorkerInboundMsg = LabWorkerInitMsg | LabWorkerDetectMsg | LabWorkerCloseMsg;

export interface LabWorkerReadyMsg {
  type: "READY";
  sessionEpoch: number;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  numHands: 1 | 2;
}

export interface LabWorkerResultMsg {
  type: "RESULT";
  sessionEpoch: number;
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
    preprocessMs: number;
    detectMs: number;
    setOptionsMs: number;
    workerTotalMs: number;
    detectorCalls: number;
  };
  ownerGuard: OwnerGuardTelemetry;
  failClosedReason: "owner-jump-reject" | "owner-size-reject" | null;
  monotonicClamps: number;
}

export interface LabWorkerErrorMsg {
  type: "ERROR";
  sessionEpoch: number;
  stage: "init" | "detect";
  message: string;
}

export type LabWorkerOutboundMsg = LabWorkerReadyMsg | LabWorkerResultMsg | LabWorkerErrorMsg;

let landmarker: HandLandmarker | null = null;
let currentEpoch = 0;
let lastMonotonicTs = Number.NEGATIVE_INFINITY;
let monotonicClamps = 0;
let preprocessMode: PreprocessMode = "a4";
let appliedNumHands: 1 | 2 = 2;
let ownerGuard = new WorkerOwnerGuard({ enabled: true });

let consecutiveMisses = 0;
let lastRecoveryWorked = false;
let lastLuma: number | null = null;
let lastCenterLuma: number | null = null;
let lastLumaSampleTs = Number.NEGATIVE_INFINITY;
let isDark = false;
let isBacklight = false;

let offscreen: OffscreenCanvas | null = null;
let offCtx: OffscreenCanvasRenderingContext2D | null = null;
let scratchBuf: Uint8ClampedArray | null = null;
let temporalPrev: Uint8ClampedArray | null = null;

function safeCloseLandmarker(): void {
  if (!landmarker) return;
  try {
    landmarker.close();
  } catch {
    /* ignore */
  }
  landmarker = null;
}

async function syncNumHands(desired: 1 | 2): Promise<number> {
  if (!landmarker || appliedNumHands === desired) return 0;
  const t0 = performance.now();
  await landmarker.setOptions({ numHands: desired });
  appliedNumHands = desired;
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
  }
  if (!offCtx || !offscreen) {
    return { surface: bitmap, activePass: "A0_raw", preprocessMs: 0 };
  }

  // Sample luma periodically even in "raw" mode so benchmark telemetry always logs honest lighting stats
  let imgData: ImageData | null = null;
  if (nowTs - lastLumaSampleTs >= R20_LUMA_SAMPLE_INTERVAL_MS || lastLuma === null) {
    lastLumaSampleTs = nowTs;
    offCtx.drawImage(bitmap, 0, 0, w, h);
    imgData = offCtx.getImageData(0, 0, w, h);
    const stats = computeMeanAndCenterLuma(imgData.data, w, h, 2);
    lastLuma = Math.round(stats.meanLuma * 10000) / 10000;
    lastCenterLuma = Math.round(stats.centerLuma * 10000) / 10000;
    isBacklight =
      stats.centerLuma < R20_BACKLIGHT_CENTER_MAX &&
      stats.meanLuma - stats.centerLuma >= R20_BACKLIGHT_LUMA_GAP;
    isDark = stats.meanLuma < R20_DARK_LUMA || isBacklight;
  }

  if (preprocessMode === "raw") {
    return {
      surface: bitmap,
      activePass: "A0_raw",
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

  // Mode "a4": keep RAW on bright or already-working frames; engage A4v2 chroma-preserving denoise + Reinhard LUT
  // when dim/backlit and either recovery previously succeeded or detector missed on RAW.
  const lumaVal = lastLuma ?? 0.5;
  const isDimOrBacklit = lumaVal < R20_DIM_RECOVERY_LUMA || isBacklight;
  const shouldEnhance = isDimOrBacklit && (lastRecoveryWorked || consecutiveMisses >= 1);

  if (!shouldEnhance) {
    // Keep temporalPrev warm in dim light when we already grabbed imgData
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

workerScope.onmessage = async (ev: MessageEvent<LabWorkerInboundMsg>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "CLOSE") {
    currentEpoch = msg.sessionEpoch;
    safeCloseLandmarker();
    temporalPrev = null;
    return;
  }

  if (msg.type === "INIT") {
    currentEpoch = msg.sessionEpoch;
    preprocessMode = msg.preprocess;
    ownerGuard = new WorkerOwnerGuard({
      enabled: msg.dynamicOwnerLock,
      lockConfirmFrames: 3,
      auditIntervalFrames: msg.auditIntervalFrames ?? 45,
    });
    ownerGuard.reset(2);
    appliedNumHands = 2;
    consecutiveMisses = 0;
    lastRecoveryWorked = false;
    lastMonotonicTs = Number.NEGATIVE_INFINITY;
    monotonicClamps = 0;
    temporalPrev = null;
    safeCloseLandmarker();

    try {
      const [vision, modelAssetBuffer] = await Promise.all([
        FilesetResolver.forVisionTasks(msg.wasmRoot),
        loadModelBufferCached(msg.modelUrl),
      ]);
      // STRICT CPU-ONLY POLICY (G20-A): delegate is hardcoded to "CPU"
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: msg.minDetectionConfidence ?? 0.6,
        minHandPresenceConfidence: msg.minPresenceConfidence ?? 0.45,
        minTrackingConfidence: msg.minTrackingConfidence ?? 0.45,
      });
      workerScope.postMessage({
        type: "READY",
        sessionEpoch: currentEpoch,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        numHands: appliedNumHands,
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

  if (msg.type === "DETECT") {
    const tStart = performance.now();
    const { bitmap, sessionEpoch, frameId, aspect } = msg;
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
      setOptionsMs += await syncNumHands(preNumHands);

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

      const guarded = ownerGuard.afterDetect(rawLms, rawHds);
      setOptionsMs += await syncNumHands(guarded.nextNumHands);

      if (guarded.landmarks.length > 0) {
        consecutiveMisses = 0;
        lastRecoveryWorked = prep.activePass === "A4_denoise_reinhard320";
      } else {
        consecutiveMisses++;
        if (prep.activePass === "A4_denoise_reinhard320") {
          // If A4v2 also missed, alternate back to RAW every 4th miss in case lighting suddenly brightened
          if (consecutiveMisses % 4 === 0) lastRecoveryWorked = false;
        }
      }

      workerScope.postMessage({
        type: "RESULT",
        sessionEpoch,
        frameId,
        timestampMs: ts,
        aspect,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        landmarks: guarded.landmarks,
        handedness: guarded.handedness,
        luma: {
          meanLuma: lastLuma,
          centerLuma: lastCenterLuma,
          isDark,
          isBacklight,
          activePass: prep.activePass,
        },
        timing: {
          preprocessMs: prep.preprocessMs,
          detectMs,
          setOptionsMs: Math.round(setOptionsMs * 100) / 100,
          workerTotalMs: Math.round((performance.now() - tStart) * 100) / 100,
          detectorCalls: 1,
        },
        ownerGuard: ownerGuard.telemetry(),
        failClosedReason: guarded.failClosedReason,
        monotonicClamps,
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
