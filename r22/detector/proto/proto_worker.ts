// Instrument WebAssembly.Memory BEFORE MediaPipe Tasks loads so we measure exact WASM linear memory per task!
const trackedWasmMemories: WebAssembly.Memory[] = [];
const OrigWasmMemory = WebAssembly.Memory;
const WrappedWasmMemory = function (this: unknown, desc: WebAssembly.MemoryDescriptor) {
  const m = new OrigWasmMemory(desc);
  trackedWasmMemories.push(m);
  return m;
} as unknown as typeof WebAssembly.Memory;
WrappedWasmMemory.prototype = OrigWasmMemory.prototype;
(globalThis as unknown as { WebAssembly: { Memory: typeof WebAssembly.Memory } }).WebAssembly.Memory = WrappedWasmMemory;

const origInstantiateStreaming = WebAssembly.instantiateStreaming;
if (typeof origInstantiateStreaming === "function") {
  WebAssembly.instantiateStreaming = async (source, imports) => {
    const res = await origInstantiateStreaming.call(WebAssembly, source, imports);
    const expMem = (res.instance.exports as Record<string, unknown>).memory;
    if (expMem instanceof OrigWasmMemory && !trackedWasmMemories.includes(expMem)) {
      trackedWasmMemories.push(expMem);
    }
    return res;
  };
}
const origInstantiate = WebAssembly.instantiate;
WebAssembly.instantiate = (async (bytes: BufferSource | WebAssembly.Module, imports?: WebAssembly.Imports) => {
  const res = await origInstantiate.call(WebAssembly, bytes as BufferSource, imports);
  const inst = "instance" in res ? res.instance : res;
  const expMem = (inst.exports as Record<string, unknown>).memory;
  if (expMem instanceof OrigWasmMemory && !trackedWasmMemories.includes(expMem)) {
    trackedWasmMemories.push(expMem);
  }
  return res;
}) as typeof WebAssembly.instantiate;

const OrigWasmInstance = WebAssembly.Instance;
const WrappedWasmInstance = function (this: unknown, mod: WebAssembly.Module, imports?: WebAssembly.Imports) {
  const inst = new OrigWasmInstance(mod, imports);
  const expMem = (inst.exports as Record<string, unknown>).memory;
  if (expMem instanceof OrigWasmMemory && !trackedWasmMemories.includes(expMem)) {
    trackedWasmMemories.push(expMem);
  }
  return inst;
} as unknown as typeof WebAssembly.Instance;
WrappedWasmInstance.prototype = OrigWasmInstance.prototype;
(globalThis as unknown as { WebAssembly: { Instance: typeof WebAssembly.Instance } }).WebAssembly.Instance = WrappedWasmInstance;

function getWasmMemSummary() {
  let totalBytes = 0;
  for (const m of trackedWasmMemories) {
    try {
      totalBytes += m.buffer.byteLength;
    } catch {
      /* ignore detached */
    }
  }
  return {
    wasmMemoryCount: trackedWasmMemories.length,
    wasmLinearMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
    wasmLinearBytes: totalBytes,
  };
}

import { FilesetResolver, HandLandmarker, ObjectDetector } from "@mediapipe/tasks-vision";

interface InitMsg {
  type: "INIT";
  mode: "hand_only" | "dual_object_and_hand";
  wasmRoot: string;
  handModelUrl: string;
  objectModelUrl?: string;
}

interface DetectMsg {
  type: "DETECT";
  frameId: number;
  timestampMs: number;
  bitmap: ImageBitmap;
  roiCrop?: [number, number, number, number] | null;
}

let handLandmarker: HandLandmarker | null = null;
let objectDetector: ObjectDetector | null = null;
let sharedVision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let workerMode: "hand_only" | "dual_object_and_hand" = "hand_only";
let offscreen: OffscreenCanvas | null = null;
let offCtx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = async (ev: MessageEvent<InitMsg | DetectMsg | { type: "ADD_OBJECT_DETECTOR"; objectModelUrl: string }>) => {
  const msg = ev.data;
  if (msg.type === "ADD_OBJECT_DETECTOR") {
    const tObj0 = performance.now();
    objectDetector = await ObjectDetector.createFromOptions(sharedVision!, {
      baseOptions: { modelAssetPath: msg.objectModelUrl, delegate: "CPU" },
      runningMode: "VIDEO",
      maxResults: 5,
      scoreThreshold: 0.25,
    });
    const objectInitMs = Math.round((performance.now() - tObj0) * 100) / 100;
    self.postMessage({
      type: "OBJECT_DETECTOR_ADDED",
      objectInitMs,
      wasmAfterObject: getWasmMemSummary(),
    });
    return;
  }
  if (msg.type === "INIT") {
    workerMode = msg.mode;
    const t0 = performance.now();
    const tResolver0 = performance.now();
    sharedVision = await FilesetResolver.forVisionTasks(msg.wasmRoot);
    const vision = sharedVision;
    const resolverMs = performance.now() - tResolver0;
    const wasmBeforeHand = getWasmMemSummary();

    const tHand0 = performance.now();
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: msg.handModelUrl, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    const handInitMs = performance.now() - tHand0;
    const wasmAfterHand = getWasmMemSummary();

    let objectInitMs = 0;
    if (msg.mode === "dual_object_and_hand" && msg.objectModelUrl) {
      const tObj0 = performance.now();
      objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: msg.objectModelUrl, delegate: "CPU" },
        runningMode: "VIDEO",
        maxResults: 5,
        scoreThreshold: 0.25,
      });
      objectInitMs = performance.now() - tObj0;
    }
    const wasmAfterObject = getWasmMemSummary();

    const totalInitMs = performance.now() - t0;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    self.postMessage({
      type: "READY",
      mode: workerMode,
      resolverMs: Math.round(resolverMs * 100) / 100,
      handInitMs: Math.round(handInitMs * 100) / 100,
      objectInitMs: Math.round(objectInitMs * 100) / 100,
      totalInitMs: Math.round(totalInitMs * 100) / 100,
      wasmBeforeHand,
      wasmAfterHand,
      wasmAfterObject,
      workerJsHeapUsedMb: mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
      workerJsHeapTotalMb: mem ? Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
    });
    return;
  }

  if (msg.type === "DETECT") {
    const { bitmap, timestampMs, frameId, roiCrop } = msg;
    try {
      let objMs = 0;
      let detections: Array<{ label: string; score: number; bbox: { originX: number; originY: number; width: number; height: number } }> = [];
      if (objectDetector) {
        const tO0 = performance.now();
        const oRes = objectDetector.detectForVideo(bitmap, timestampMs);
        objMs = performance.now() - tO0;
        detections = (oRes.detections ?? []).map((d) => ({
          label: d.categories?.[0]?.categoryName ?? "unknown",
          score: Math.round((d.categories?.[0]?.score ?? 0) * 1000) / 1000,
          bbox: d.boundingBox ?? { originX: 0, originY: 0, width: 0, height: 0 },
        }));
      }

      let handInput: ImageBitmap | OffscreenCanvas = bitmap;
      let cropNorm: [number, number, number, number] | null = null;
      if (roiCrop && typeof OffscreenCanvas !== "undefined") {
        const [x0, y0, x1, y1] = roiCrop;
        const sx = Math.max(0, Math.floor(x0 * bitmap.width));
        const sy = Math.max(0, Math.floor(y0 * bitmap.height));
        const sw = Math.max(16, Math.min(bitmap.width - sx, Math.ceil((x1 - x0) * bitmap.width)));
        const sh = Math.max(16, Math.min(bitmap.height - sy, Math.ceil((y1 - y0) * bitmap.height)));
        if (!offscreen || offscreen.width !== sw || offscreen.height !== sh) {
          offscreen = new OffscreenCanvas(sw, sh);
          offCtx = offscreen.getContext("2d");
        }
        if (offCtx) {
          offCtx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
          handInput = offscreen;
          cropNorm = [sx / bitmap.width, sy / bitmap.height, (sx + sw) / bitmap.width, (sy + sh) / bitmap.height];
        }
      }

      const tH0 = performance.now();
      const hRes = handLandmarker!.detectForVideo(handInput as unknown as ImageBitmap, timestampMs);
      const handMs = performance.now() - tH0;

      const landmarks = (hRes.landmarks ?? []).map((hand) =>
        hand.map((p) => {
          if (!cropNorm) return { x: p.x, y: p.y, z: p.z ?? 0 };
          const [cx0, cy0, cx1, cy1] = cropNorm;
          return {
            x: cx0 + p.x * (cx1 - cx0),
            y: cy0 + p.y * (cy1 - cy0),
            z: p.z ?? 0,
          };
        }),
      );

      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      self.postMessage({
        type: "RESULT",
        frameId,
        objMs: Math.round(objMs * 100) / 100,
        handMs: Math.round(handMs * 100) / 100,
        totalDetectMs: Math.round((objMs + handMs) * 100) / 100,
        handCount: landmarks.length,
        landmarks,
        detections,
        wasmEnd: getWasmMemSummary(),
        workerJsHeapUsedMb: mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100 : null,
      });
    } finally {
      bitmap.close();
    }
  }
};
