/**
 * R20 Dedicated Web Worker for CPU-Only MediaPipe HandLandmarker (`r20_hand_landmarker.worker.ts`).
 *
 * Implements §7.1–7.3 & §14.1:
 *  - Forces `baseOptions.delegate = "CPU"` (100% CPU/XNNPACK WASM inference; zero WebGL/GPU delegate).
 *  - Uses `runningMode: "VIDEO"` with strictly monotonic timestamps.
 *  - Consumes transferable `ImageBitmap` from the main thread, optionally applies low-light CPU
 *    photometric preprocessing inside an `OffscreenCanvas` in the worker so the main UI thread
 *    does ZERO pixel readback (`getImageData`) and ZERO synchronous WASM detection!
 *  - Always calls `bitmap.close()` in `finally` to prevent GPU/RAM texture leaks.
 *  - Posts back only compact landmark coordinates, handedness, luma stats, and worker timings.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  R20_BACKLIGHT_CENTER_MAX,
  R20_BACKLIGHT_LUMA_GAP,
  R20_DARK_LUMA,
  R20_DIM_RECOVERY_LUMA,
  R20_ENHANCE_WIDTH,
  claheAndGammaRgbaInPlace,
  computeMeanAndCenterLuma,
  denoise3x3RgbaInPlace,
  type R20LowLightMode,
} from "./r20_lowlight_frame_source";

export interface R20WorkerInitMessage {
  type: "INIT";
  sessionEpoch: number;
  wasmRoot: string;
  modelUrl: string;
  numHands: number;
  dynamicOwnerLock?: boolean;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
  lowLightMode?: R20LowLightMode;
}

export interface R20WorkerDetectMessage {
  type: "DETECT";
  sessionEpoch: number;
  frameId: number;
  timestampMs: number;
  bitmap: ImageBitmap;
  aspect: number;
  lowLightMode?: R20LowLightMode;
}

export interface R20WorkerCloseMessage {
  type: "CLOSE";
  sessionEpoch: number;
}

export type R20WorkerInboundMessage =
  | R20WorkerInitMessage
  | R20WorkerDetectMessage
  | R20WorkerCloseMessage;

export interface R20WorkerHandResult {
  type: "RESULT";
  sessionEpoch: number;
  frameId: number;
  timestampMs: number;
  aspect: number;
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
    preprocessMs: number;
    detectMs: number;
    workerTotalMs: number;
  };
}

export interface R20WorkerReadyMessage {
  type: "READY";
  sessionEpoch: number;
  delegate: "CPU";
  gpuDelegateAttempted: false;
  gpuDelegateActive: false;
  numHands: number;
}

export interface R20WorkerErrorMessage {
  type: "ERROR";
  sessionEpoch: number;
  stage: "init" | "detect";
  message: string;
}

export type R20WorkerOutboundMessage =
  | R20WorkerReadyMessage
  | R20WorkerHandResult
  | R20WorkerErrorMessage;

let landmarker: HandLandmarker | null = null;
let currentEpoch = 0;
let lastMonotonicTs = Number.NEGATIVE_INFINITY;
let lowLightMode: R20LowLightMode = "adaptive-fallback";
let dynamicOwnerLock = false;
let activeNumHands = 2;
let lockedStreak = 0;
let lastOwnerPalm: { x: number; y: number } | null = null;
let consecutiveMisses = 0;
let lastRecoveryWorked = false;
let lastLuma: number | null = null;
let lastCenterLuma: number | null = null;
let lastLumaSampleTs = Number.NEGATIVE_INFINITY;
let isDark = false;
let isBacklight = false;
let offscreen: OffscreenCanvas | null = null;
let offCtx: OffscreenCanvasRenderingContext2D | null = null;

function safeCloseLandmarker(): void {
  if (!landmarker) return;
  try {
    landmarker.close();
  } catch {
    /* ignore */
  }
  landmarker = null;
}

function prepareWorkerSurface(
  bitmap: ImageBitmap,
  nowTs: number,
): { surface: ImageBitmap | OffscreenCanvas; activePass: string; preprocessMs: number } {
  const t0 = performance.now();
  if (lowLightMode === "off" || typeof OffscreenCanvas === "undefined") {
    return { surface: bitmap, activePass: "A0_raw", preprocessMs: 0 };
  }

  const w = R20_ENHANCE_WIDTH;
  const h = Math.max(1, Math.round((w * bitmap.height) / Math.max(1, bitmap.width)));
  if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
    offscreen = new OffscreenCanvas(w, h);
    offCtx = offscreen.getContext("2d", { willReadFrequently: true });
  }
  if (!offCtx || !offscreen) {
    return { surface: bitmap, activePass: "A0_raw", preprocessMs: 0 };
  }

  let imgData: ImageData | null = null;
  if (nowTs - lastLumaSampleTs >= 400 || lastLuma === null) {
    lastLumaSampleTs = nowTs;
    offCtx.drawImage(bitmap, 0, 0, w, h);
    imgData = offCtx.getImageData(0, 0, w, h);
    const stats = computeMeanAndCenterLuma(imgData.data, w, h, 2);
    lastLuma = Math.round(stats.meanLuma * 10000) / 10000;
    lastCenterLuma = Math.round(stats.centerLuma * 10000) / 10000;
    isBacklight = stats.centerLuma < R20_BACKLIGHT_CENTER_MAX && stats.meanLuma - stats.centerLuma >= R20_BACKLIGHT_LUMA_GAP;
    isDark = stats.meanLuma < R20_DARK_LUMA || isBacklight;
  }

  if (lowLightMode === "scaled") {
    if (!imgData) offCtx.drawImage(bitmap, 0, 0, w, h);
    return {
      surface: offscreen,
      activePass: "A1_raw320",
      preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  if (lowLightMode === "clahe320") {
    if (!imgData) {
      offCtx.drawImage(bitmap, 0, 0, w, h);
      imgData = offCtx.getImageData(0, 0, w, h);
    }
    claheAndGammaRgbaInPlace(imgData.data, w, h, 2.0, 1.0, 0);
    offCtx.putImageData(imgData, 0, 0);
    return {
      surface: offscreen,
      activePass: "A2_clahe320",
      preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  const lumaVal = lastLuma ?? 0.5;
  const shouldEnhance =
    lowLightMode === "gamma-denoise-clahe320" ||
    (lowLightMode === "adaptive-fallback" &&
      (lumaVal < R20_DIM_RECOVERY_LUMA || isBacklight) &&
      (lastRecoveryWorked || (consecutiveMisses > 0 && consecutiveMisses % 2 === 1)));

  if (!shouldEnhance) {
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
  if (lumaVal < 0.22) {
    denoise3x3RgbaInPlace(imgData.data, w, h);
  }
  const clipLim = lumaVal < 0.14 ? 1.6 : 2.0;
  const gamma = lumaVal < 0.16 ? 0.72 : lumaVal < 0.28 ? 0.82 : 0.90;
  const noiseFloor = lumaVal < 0.18 ? 3 : 0;
  claheAndGammaRgbaInPlace(imgData.data, w, h, clipLim, gamma, noiseFloor);
  offCtx.putImageData(imgData, 0, 0);
  return {
    surface: offscreen,
    activePass: "A3_gamma_denoise_clahe320",
    preprocessMs: Math.round((performance.now() - t0) * 100) / 100,
  };
}

async function loadModelBufferCached(modelUrl: string): Promise<Uint8Array> {
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open("r20-nui-models-v1");
      let resp = await cache.match(modelUrl);
      if (!resp) {
        const netResp = await fetch(modelUrl);
        if (netResp.ok) {
          await cache.put(modelUrl, netResp.clone());
          resp = netResp;
        }
      }
      if (resp) {
        return new Uint8Array(await resp.arrayBuffer());
      }
    } catch {
      /* fallback to direct fetch */
    }
  }
  const r = await fetch(modelUrl);
  return new Uint8Array(await r.arrayBuffer());
}

interface WorkerScopeLike {
  onmessage: ((ev: MessageEvent<R20WorkerInboundMessage>) => void) | null;
  postMessage(message: unknown): void;
}

const ctx: WorkerScopeLike = self as unknown as WorkerScopeLike;

ctx.onmessage = async (ev: MessageEvent<R20WorkerInboundMessage>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "CLOSE") {
    currentEpoch = msg.sessionEpoch;
    safeCloseLandmarker();
    return;
  }

  if (msg.type === "INIT") {
    currentEpoch = msg.sessionEpoch;
    lowLightMode = msg.lowLightMode ?? "adaptive-fallback";
    dynamicOwnerLock = Boolean(msg.dynamicOwnerLock);
    activeNumHands = dynamicOwnerLock ? 2 : msg.numHands;
    lockedStreak = 0;
    lastOwnerPalm = null;
    consecutiveMisses = 0;
    lastRecoveryWorked = false;
    lastMonotonicTs = Number.NEGATIVE_INFINITY;
    safeCloseLandmarker();
    try {
      const [vision, modelAssetBuffer] = await Promise.all([
        FilesetResolver.forVisionTasks(msg.wasmRoot),
        loadModelBufferCached(msg.modelUrl),
      ]);
      // STRICT CPU-ONLY POLICY (G20-A): never pass delegate: "GPU"
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: activeNumHands,
        minHandDetectionConfidence: msg.minDetectionConfidence ?? 0.6,
        minHandPresenceConfidence: msg.minPresenceConfidence ?? 0.45,
        minTrackingConfidence: msg.minTrackingConfidence ?? 0.45,
      });
      const ready: R20WorkerReadyMessage = {
        type: "READY",
        sessionEpoch: currentEpoch,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        numHands: msg.numHands,
      };
      ctx.postMessage(ready);
    } catch (err) {
      const errMsg: R20WorkerErrorMessage = {
        type: "ERROR",
        sessionEpoch: currentEpoch,
        stage: "init",
        message: err instanceof Error ? err.message : String(err),
      };
      ctx.postMessage(errMsg);
    }
    return;
  }

  if (msg.type === "DETECT") {
    const tStart = performance.now();
    const { bitmap, sessionEpoch, frameId, aspect } = msg;
    if (msg.lowLightMode) lowLightMode = msg.lowLightMode;
    try {
      if (sessionEpoch !== currentEpoch || !landmarker) {
        return;
      }
      const ts = Math.max(Math.round(msg.timestampMs), lastMonotonicTs + 1);
      lastMonotonicTs = ts;

      const prep = prepareWorkerSurface(bitmap, ts);
      const tDet0 = performance.now();
      const res = landmarker.detectForVideo(prep.surface as unknown as ImageBitmap, ts);
      const detectMs = Math.round((performance.now() - tDet0) * 100) / 100;

      let lms = (res.landmarks ?? []).map((hand: Array<{ x: number; y: number; z?: number }>) =>
        hand.map((p: { x: number; y: number; z?: number }) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
      );
      let hds = (res.handedness ?? []).map((cats: Array<{ categoryName?: string; displayName?: string; score?: number }>) => {
        const c = cats[0];
        return {
          categoryName: c?.categoryName ?? c?.displayName ?? "Unknown",
          score: c?.score ?? 0,
        };
      });

      // Dynamic Owner-Lock numHands transitions (2 hands during acquisition/disambiguation -> 1 hand while locked)
      if (dynamicOwnerLock && landmarker) {
        if (lms.length > 0) {
          // Pick closest hand to lastOwnerPalm if locked, else largest hand
          let pickIdx = 0;
          if (lastOwnerPalm && lms.length > 1) {
            let bestDist = Infinity;
            for (let i = 0; i < lms.length; i++) {
              const p0 = lms[i]![0]!;
              const p9 = lms[i]![9]!;
              const cx = 0.5 * (p0.x + p9.x);
              const cy = 0.5 * (p0.y + p9.y);
              const d = Math.hypot(cx - lastOwnerPalm.x, cy - lastOwnerPalm.y);
              if (d < bestDist) {
                bestDist = d;
                pickIdx = i;
              }
            }
          }
          const picked = lms[pickIdx]!;
          const cx = 0.5 * (picked[0]!.x + picked[9]!.x);
          const cy = 0.5 * (picked[0]!.y + picked[9]!.y);
          const jumpDist = lastOwnerPalm ? Math.hypot(cx - lastOwnerPalm.x, cy - lastOwnerPalm.y) : 0;

          if (activeNumHands === 1 && lastOwnerPalm && jumpDist > 0.25) {
            // Sudden spatial jump in 1-hand mode -> possible bystander steal; fail-closed and revert to 2-hand mode
            lms = [];
            hds = [];
            lockedStreak = 0;
            lastOwnerPalm = null;
            activeNumHands = 2;
            await landmarker.setOptions({ numHands: 2 });
          } else {
            lastOwnerPalm = { x: cx, y: cy };
            lockedStreak++;
            if (activeNumHands === 2 && lockedStreak >= 2) {
              activeNumHands = 1;
              await landmarker.setOptions({ numHands: 1 });
            }
          }
        } else {
          lockedStreak = 0;
          lastOwnerPalm = null;
          if (activeNumHands !== 2) {
            activeNumHands = 2;
            await landmarker.setOptions({ numHands: 2 });
          }
        }
      }

      if (lms.length > 0) {
        consecutiveMisses = 0;
        lastRecoveryWorked = prep.activePass === "A3_gamma_denoise_clahe320";
      } else {
        consecutiveMisses++;
        if (prep.activePass === "A3_gamma_denoise_clahe320") {
          lastRecoveryWorked = false;
        }
      }

      const out: R20WorkerHandResult = {
        type: "RESULT",
        sessionEpoch,
        frameId,
        timestampMs: ts,
        aspect,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        landmarks: lms,
        handedness: hds,
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
          workerTotalMs: Math.round((performance.now() - tStart) * 100) / 100,
        },
      };
      ctx.postMessage(out);
    } catch (err) {
      const errMsg: R20WorkerErrorMessage = {
        type: "ERROR",
        sessionEpoch,
        stage: "detect",
        message: err instanceof Error ? err.message : String(err),
      };
      ctx.postMessage(errMsg);
    } finally {
      try {
        bitmap.close();
      } catch {
        /* ignore */
      }
    }
  }
};
