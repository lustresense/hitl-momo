/**
 * PRD 0.0.16 R4 — one shared hand tracker for thumbs-up and pinch confirmation.
 *
 * Reads the app's single webcam via `shared-stream` (never a second getUserMedia) into an
 * off-screen <video>, runs ONE HandLandmarker, and publishes { handVisible, thumbUp, pinch, cursor }.
 * It runs only while at least one consumer holds it (a ThumbConfirm or PinchRing is on screen); the last
 * release stops the loop and closes the landmarker.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker } from "./hand-landmarker";
import { subscribeSharedStream } from "./shared-stream";
import { classifyHandPose, indexTipNormalized, isThumbUp } from "../input/hand-gesture";
import { reportTrackerFailed } from "../input/input-mode";
import type { Landmark } from "../input/types";
import { publishHand, retireHand } from "./hand-cursor-store";

export interface HandGestureState {
  /** Tracker loaded and reading frames. */
  ready: boolean;
  handVisible: boolean;
  thumbUp: boolean;
  /** Thumb and index tip pinched ("cubit"). A fist or a thumbs-up never counts. */
  pinch: boolean;
  /** Index fingertip, mirrored and clamped to 0..1 (the drawing cursor space); null without a hand. */
  cursor: { x: number; y: number } | null;
}

export type HandGestureListener = (state: HandGestureState) => void;

const IDLE: HandGestureState = { ready: false, handVisible: false, thumbUp: false, pinch: false, cursor: null };

let state: HandGestureState = IDLE;
let raw: HandGestureState = IDLE;
/** Test hooks: a forced thumbs-up (true), hand without thumb (false), or real tracking (null). */
let simulated: boolean | null = null;
/** Test hooks: a forced pinch (true), open hand (false), or real tracking (null). Independent of `simulated`. */
let simulatedPinch: boolean | null = null;
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

/**
 * One frame's reading of a hand. Pure: the loop calls it, tests call it with synthetic landmarks.
 * `pinchHeld` is last frame's pinch: a held pinch needs a looser gap to end (hysteresis), so the ring does not flicker.
 */
export function gestureSnapshot(hand: Landmark[] | undefined, pinchHeld = false): Omit<HandGestureState, "ready"> {
  return {
    handVisible: !!hand,
    thumbUp: isThumbUp(hand),
    pinch: classifyHandPose(hand, { pinchHeld }) === "pinch",
    cursor: hand ? indexTipNormalized(hand) : null,
  };
}

/** The state consumers see: a test hook replaces the real reading where it is set. */
function effective(next: HandGestureState): HandGestureState {
  const pinch = simulatedPinch ?? (simulated === null ? next.pinch : false);
  if (simulated === null) return { ...next, pinch };
  return { ready: true, handVisible: simulated, thumbUp: simulated, pinch, cursor: next.cursor };
}

function publish(next: HandGestureState): void {
  raw = next;
  const prev = state;
  state = effective(next);
  // The dwell buttons and the hand cursor read the fingertip from the shared store (source "tracker").
  if (state.ready) publishHand({ cursor: state.handVisible ? state.cursor : null, thumbUp: state.thumbUp, pinch: state.pinch, source: "tracker" });
  else retireHand("tracker");
  // Listeners hear a change of a discrete field, or a moved fingertip: the hand cursor and the dwell read the
  // cursor from the hook state, so it must reach them. An identical frame (nothing moved) stays silent.
  const discrete = state.ready === prev.ready && state.handVisible === prev.handVisible && state.thumbUp === prev.thumbUp && state.pinch === prev.pinch;
  if (discrete && sameCursor(state.cursor, prev.cursor)) return;
  for (const l of [...listeners]) l(state);
}

function sameCursor(a: HandGestureState["cursor"], b: HandGestureState["cursor"]): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
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

/** TEST ONLY: feed one frame of landmarks through the same path the loop uses (undefined = no hand). */
export function publishHandForTest(hand: Landmark[] | undefined): void {
  publish({ ready: true, ...gestureSnapshot(hand, raw.pinch) });
}

/** Dev/e2e: force a pinch (true), open hand (false) or real tracking (null). Gate callers behind test hooks. */
export function simulatePinch(value: boolean | null): void {
  simulatedPinch = value;
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
    publish({ ready: true, handVisible: false, thumbUp: false, pinch: false, cursor: null });
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
  publish({ ready: true, ...gestureSnapshot(result.landmarks[0], raw.pinch) });
}

/** TEST ONLY. */
export function resetThumbTrackerForTest(): void {
  stopTracking();
  holders = 0;
  simulated = null;
  simulatedPinch = null;
  state = IDLE;
  raw = IDLE;
  listeners.clear();
}
