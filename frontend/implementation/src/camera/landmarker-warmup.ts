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
let warm: { numHands: number; created: CreatedHandLandmarker } | null = null;
/** A load in flight; `claimed` is set when a reader took it, so the warm-up does not keep a second copy. */
let pending: { numHands: number; promise: Promise<CreatedHandLandmarker>; claimed: boolean } | null = null;

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
  if (warm?.numHands === numHands || pending?.numHands === numHands) return;
  publish({ kind: "loading" });
  const promise = build({ ...options, numHands });
  const job = { numHands, promise, claimed: false };
  pending = job;
  try {
    const created = await promise;
    if (pending === job) pending = null;
    // The face model loads once the hand model is ready, so the two do not compete during the cold start.
    // A failure is harmless: the wave then runs on the plain hand rule.
    void loadFaceDetector(options.wasmRoot, FACE_MODEL_PATH).catch(() => undefined);
    if (job.claimed) {
      publish({ kind: "ready", delegate: delegateLabel(created) });
      return;
    }
    publish({ kind: "warming", delegate: delegateLabel(created) });
    blankInference(created.landmarker);
    warm = { numHands, created };
    publish({ kind: "ready", delegate: delegateLabel(created) });
  } catch (err) {
    if (pending === job) pending = null;
    publish({ kind: "failed", message: messageFor(classifyCameraError(err)) });
  }
}

/** Gives the warm instance (or the one still loading) to a reader. The reader closes it when it stops. */
export async function takeHandLandmarker(options: HandLandmarkerOptions): Promise<CreatedHandLandmarker> {
  const numHands = options.numHands ?? DEFAULT_NUM_HANDS;
  if (warm?.numHands === numHands) {
    const created = warm.created;
    warm = null;
    return created;
  }
  if (pending?.numHands === numHands) {
    const job = pending;
    job.claimed = true;
    pending = null;
    return job.promise;
  }
  return build({ ...options, numHands });
}

/** TEST ONLY: forget the warm instance and the status (closes nothing it does not own). */
export function resetHandLandmarkerForTest(): void {
  warm = null;
  pending = null;
  status = { kind: "idle" };
  listeners.clear();
}
