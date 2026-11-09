/**
 * PRD 0.0.16 R4 — one shared hand tracker for thumbs-up confirmation.
 *
 * Reads the app's single webcam via `shared-stream` (never a second getUserMedia) into an
 * off-screen <video>, runs ONE HandLandmarker, and publishes { handVisible, thumbUp }.
 * It runs only while at least one consumer holds it (a ThumbConfirm is on screen); the last
 * release stops the loop and closes the landmarker.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker } from "./hand-landmarker";
import { subscribeSharedStream } from "./shared-stream";
import { isThumbUp } from "../input/hand-gesture";
import { reportTrackerFailed } from "../input/input-mode";

export interface HandGestureState {
  /** Tracker loaded and reading frames. */
  ready: boolean;
  handVisible: boolean;
  thumbUp: boolean;
}

export type HandGestureListener = (state: HandGestureState) => void;

const IDLE: HandGestureState = { ready: false, handVisible: false, thumbUp: false };

let state: HandGestureState = IDLE;
let raw: HandGestureState = IDLE;
let simulated: boolean | null = null;
const listeners = new Set<HandGestureListener>();
let holders = 0;
let generation = 0;
let landmarker: HandLandmarker | null = null;
let video: HTMLVideoElement | null = null;
let rafId: number | null = null;
let unsubStream: (() => void) | null = null;
let lastVideoTime = -1;
let failures = 0;
let modelUrl = "/models/hand_landmarker.task";
let wasmRoot = "/mediapipe/wasm";

function publish(next: HandGestureState): void {
  raw = next;
  const effective = simulated === null ? next : { ready: true, handVisible: simulated, thumbUp: simulated };
  if (effective.ready === state.ready && effective.handVisible === state.handVisible && effective.thumbUp === state.thumbUp) return;
  state = effective;
  for (const l of [...listeners]) l(state);
}

export function getHandGestureState(): HandGestureState {
  return state;
}

export function subscribeHandGesture(listener: HandGestureListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function configureThumbTracker(options: { modelUrl?: string; wasmRoot?: string }): void {
  if (options.modelUrl) modelUrl = options.modelUrl;
  if (options.wasmRoot) wasmRoot = options.wasmRoot;
}

/** Dev/e2e: force a thumbs-up (true), hand without thumb (false) or real tracking (null). Gate callers behind test hooks. */
export function simulateThumb(value: boolean | null): void {
  simulated = value;
  publish(raw);
}

/** Acquire the tracker; returns the release function. */
export function acquireThumbTracker(): () => void {
  holders++;
  if (holders === 1) startTracking();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) stopTracking();
  };
}

function startTracking(): void {
  if (typeof window === "undefined") return;
  unsubStream = subscribeSharedStream((stream) => {
    if (stream) void bind(stream);
    else unbind();
  });
}

function stopTracking(): void {
  unsubStream?.();
  unsubStream = null;
  unbind();
}

async function bind(stream: MediaStream): Promise<void> {
  unbind();
  const gen = ++generation;
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = stream;
  video = v;
  try {
    await v.play();
  } catch {
    /* fake/blocked autoplay: readyState check in loop still guards */
  }
  try {
    const created = await createHandLandmarker({ wasmRoot, modelUrl });
    if (gen !== generation) {
      try { created.landmarker.close(); } catch { /* best-effort */ }
      return;
    }
    landmarker = created.landmarker;
    failures = 0;
    lastVideoTime = -1;
    reportTrackerFailed(false);
    publish({ ready: true, handVisible: false, thumbUp: false });
    loop();
  } catch {
    if (gen !== generation) return;
    reportTrackerFailed(true);
  }
}

function unbind(): void {
  generation++;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  const lm = landmarker;
  landmarker = null;
  try { lm?.close(); } catch { /* best-effort */ }
  if (video) {
    try { video.pause(); } catch { /* jsdom */ }
    video.srcObject = null;
  }
  video = null;
  publish(IDLE);
}

function loop(): void {
  const v = video;
  const lm = landmarker;
  if (!v || !lm) return;
  rafId = requestAnimationFrame(loop);
  if (typeof document !== "undefined" && document.hidden) return;
  if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
  lastVideoTime = v.currentTime;
  let result;
  try {
    result = lm.detectForVideo(v, performance.now());
    failures = 0;
  } catch {
    failures++;
    if (failures >= 3) {
      unbind();
      reportTrackerFailed(true);
    }
    return;
  }
  const hand = result.landmarks[0];
  publish({ ready: true, handVisible: !!hand, thumbUp: isThumbUp(hand) });
}

/** TEST ONLY. */
export function resetThumbTrackerForTest(): void {
  stopTracking();
  holders = 0;
  simulated = null;
  state = IDLE;
  raw = IDLE;
  listeners.clear();
}
