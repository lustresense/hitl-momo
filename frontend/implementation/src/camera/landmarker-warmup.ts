/**
 * Cold start for the hand model: load it early, run one blank inference, then hand it to the first reader.
 *
 * - `warmHandLandmarker` is called when the camera is near (the cover) and never touches the camera itself.
 *   It publishes loading -> warming -> ready (with the GPU/CPU delegate) or failed, without blocking frames.
 * - `takeHandLandmarker` gives the warm instance to ONE reader (ownership moves; the reader closes it as before).
 *   A taker that asks while the warm-up runs waits for that same load, so two models are not built at once.
 *   A different hand count does not reuse the instance.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker, delegateLabel, type CreatedHandLandmarker } from "./hand-landmarker";
import { DEFAULT_NUM_HANDS, FACE_MODEL_PATH } from "./hand-config";
import { loadFaceDetector } from "./face-anchor";
import { classifyCameraError, messageFor } from "./messages";

export interface HandLandmarkerOptions {
  wasmRoot: string;
  modelUrl: string;
  numHands?: number;
}

export type HandLandmarkerStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "warming"; delegate: string }
  | { kind: "ready"; delegate: string }
  | { kind: "failed"; message: string };

/** Side of the blank frame for the warm-up inference: small, so it costs little, but it still compiles the pipeline. */
const WARM_FRAME_PX = 96;

let status: HandLandmarkerStatus = { kind: "idle" };
const listeners = new Set<(s: HandLandmarkerStatus) => void>();
let warm: { numHands: number; created: CreatedHandLandmarker; modelUrl: string; wasmRoot: string } | null = null;
/** Standby lifetime is a prototype parameter, not a measurement on the Owner's computer. */
const CACHE_IDLE_MS = 30_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
function clearExpiry(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
}
export function disposeWarmHandLandmarker(): void {
  clearExpiry();
  const old = warm;
  warm = null;
  try { old?.created.landmarker.close(); } catch { /* best effort */ }
}
function compatible(options: HandLandmarkerOptions): boolean {
  return !!warm && warm.numHands === (options.numHands ?? DEFAULT_NUM_HANDS)
    && warm.modelUrl === options.modelUrl && warm.wasmRoot === options.wasmRoot;
}
function cache(created: CreatedHandLandmarker, options: HandLandmarkerOptions): void {
  disposeWarmHandLandmarker();
  warm = { numHands: options.numHands ?? DEFAULT_NUM_HANDS, created, modelUrl: options.modelUrl, wasmRoot: options.wasmRoot };
  idleTimer = setTimeout(disposeWarmHandLandmarker, CACHE_IDLE_MS);
  if (typeof idleTimer === "object" && "unref" in idleTimer) idleTimer.unref();
}
/** Return a healthy exclusive model lease. The camera stream can be off while the model remains warm. */
export function returnHandLandmarker(created: CreatedHandLandmarker, options: HandLandmarkerOptions, healthy = true): void {
  if (!healthy || warm) {
    try { created.landmarker.close(); } catch { /* best effort */ }
    return;
  }
  cache(created, options);
}

/** A load in flight; `claimed` is set when a reader took it, so the warm-up does not keep a second copy. */
let pending: { numHands: number; modelUrl: string; wasmRoot: string; promise: Promise<CreatedHandLandmarker>; claimed: boolean } | null = null;

function publish(next: HandLandmarkerStatus): void {
  status = next;
  for (const l of [...listeners]) l(status);
}

export function getHandLandmarkerStatus(): HandLandmarkerStatus {
  return status;
}

/** Hears the current status now and on every change. Returns the unsubscribe function. */
export function subscribeHandLandmarkerStatus(listener: (s: HandLandmarkerStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

function build(options: HandLandmarkerOptions): Promise<CreatedHandLandmarker> {
  return createHandLandmarker({
    wasmRoot: options.wasmRoot,
    modelUrl: options.modelUrl,
    numHands: options.numHands ?? DEFAULT_NUM_HANDS,
  });
}

/** One inference on a blank frame: the first real frame then does not pay for shader compilation. */
function blankInference(landmarker: HandLandmarker): void {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = WARM_FRAME_PX;
  canvas.height = WARM_FRAME_PX;
  try {
    landmarker.detectForVideo(canvas, performance.now());
  } catch {
    /* best-effort: a real frame reports a failure itself */
  }
}

/** Load and warm the model. Safe to call many times; never throws (the status says what happened). */
export async function warmHandLandmarker(options: HandLandmarkerOptions): Promise<void> {
  const numHands = options.numHands ?? DEFAULT_NUM_HANDS;
  if (compatible(options) || (pending?.numHands === numHands && pending.modelUrl === options.modelUrl && pending.wasmRoot === options.wasmRoot)) return;
  publish({ kind: "loading" });
  const promise = build({ ...options, numHands });
  const job = { numHands, modelUrl: options.modelUrl, wasmRoot: options.wasmRoot, promise, claimed: false };
  pending = job;
  try {
    const created = await promise;
    publish({ kind: "warming", delegate: delegateLabel(created) });
    if (!job.claimed) blankInference(created.landmarker);
    // Face is loaded after hand, so heavy model initialization is staggered.
    // A failed face model degrades to hand-only recognition.
    const faceReady = await loadFaceDetector(options.wasmRoot, FACE_MODEL_PATH).then(() => true, () => false);
    const label = faceReady ? delegateLabel(created) : `${delegateLabel(created)} / tanpa filter wajah`;
    if (pending === job) pending = null;
    if (job.claimed) {
      publish({ kind: "ready", delegate: label });
      return;
    }
    cache(created, { ...options, numHands });
    publish({ kind: "ready", delegate: label });
  } catch (err) {
    if (pending === job) pending = null;
    publish({ kind: "failed", message: messageFor(classifyCameraError(err)) });
  }
}

/** Gives the warm instance (or the one still loading) to a reader. The reader closes it when it stops. */
export async function takeHandLandmarker(options: HandLandmarkerOptions): Promise<CreatedHandLandmarker> {
  const numHands = options.numHands ?? DEFAULT_NUM_HANDS;
  if (compatible(options)) {
    const created = warm!.created;
    clearExpiry();
    warm = null;
    return created;
  }
  if (pending?.numHands === numHands && pending.modelUrl === options.modelUrl && pending.wasmRoot === options.wasmRoot) {
    const job = pending;
    job.claimed = true;
    pending = null;
    return job.promise;
  }
  return build({ ...options, numHands });
}

/** TEST ONLY: reset status and dispose the unclaimed cached model. */
if (typeof window !== "undefined") window.addEventListener("pagehide", disposeWarmHandLandmarker);

export function resetHandLandmarkerForTest(): void {
  disposeWarmHandLandmarker();
  warm = null;
  pending = null;
  status = { kind: "idle" };
  listeners.clear();
}
