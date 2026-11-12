/**
 * PRD 0.0.16 R4 — one shared hand tracker for thumbs-up and pinch confirmation.
 *
 * Reads the app's single webcam via `shared-stream` (never a second getUserMedia): the camera preview when it plays
 * that stream, else its own off-screen feed. Runs ONE HandLandmarker and publishes { handVisible, thumbUp, pinch, cursor }.
 * It runs only while at least one consumer holds it (a ThumbConfirm or PinchRing is on screen); the last
 * release stops the loop and closes the landmarker.
 */
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { takeHandLandmarker } from "./landmarker-warmup";
import { frameForDetection } from "./frame-source";
import { pollDetection } from "./inference-scheduler";
import { pickPrimaryHand, type PrimaryHandState } from "./primary-hand";
import { subscribeSharedStream } from "./shared-stream";
import { StableVote, classifyHandPose, countExtendedFingers, indexTipNormalized, isThumbUp, type HandPose } from "../input/hand-gesture";
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
  /** Stable pose (voted over recent frames); "none" without a hand. Test hooks may force thumb-up or pinch. */
  pose: HandPose;
  /** Stable extended-finger count 0..5 (voted over recent frames); 0 without a hand. */
  fingerCount: number;
}

export type HandGestureListener = (state: HandGestureState) => void;

const IDLE: HandGestureState = { ready: false, handVisible: false, thumbUp: false, pinch: false, cursor: null, pose: "none", fingerCount: 0 };

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
/** The stream this tracker reads (set by bind, cleared by unbind). */
let boundStream: MediaStream | null = null;
/** Own off-screen feed of the stream; used only when the camera preview does not already play it (see frameVideo). */
let video: HTMLVideoElement | null = null;
/** The camera preview GlobalCamera shows. Reading it shares each frame with the wave tracker and the page drivers. */
const PREVIEW_SELECTOR = ".global-camera-host .camera-video";
/** Identity of this reader in the shared inference gate. */
const READER = {};
let rafId: number | null = null;
let unsubStream: (() => void) | null = null;
let lastVideoTime = -1;
let failures = 0;
/** The player's hand, locked across frames (see primary-hand.ts). */
let primary: PrimaryHandState | null = null;
let modelUrl = "/models/hand_landmarker.task";
let wasmRoot = "/mediapipe/wasm";

/**
 * One frame's reading of a hand. Pure: the loop calls it, tests call it with synthetic landmarks.
 * `pinchHeld` is last frame's pinch: a held pinch needs a looser gap to end (hysteresis), so the ring does not flicker.
 */
export function gestureSnapshot(
  hand: Landmark[] | undefined,
  pinchHeld = false,
): Omit<HandGestureState, "ready" | "pose" | "fingerCount"> {
  return {
    handVisible: !!hand,
    thumbUp: isThumbUp(hand),
    pinch: classifyHandPose(hand, { pinchHeld }) === "pinch",
    cursor: hand ? indexTipNormalized(hand) : null,
  };
}

/** Voted pose and finger count: one noisy frame cannot flip them (see StableVote). Reset when the hand is lost. */
const poseVote = new StableVote<HandPose>("none");
const fingerVote = new StableVote<number>(0);

/** One frame's full reading: the snapshot plus the voted pose and finger count. */
function readHand(hand: Landmark[] | undefined, pinchHeld: boolean): Omit<HandGestureState, "ready"> {
  const snap = gestureSnapshot(hand, pinchHeld);
  if (!hand) {
    poseVote.reset();
    fingerVote.reset();
    return { ...snap, pose: "none", fingerCount: 0 };
  }
  return {
    ...snap,
    pose: poseVote.push(classifyHandPose(hand, { pinchHeld })),
    fingerCount: fingerVote.push(countExtendedFingers(hand)),
  };
}

/** The state consumers see: a test hook replaces the real reading where it is set. */
function effective(next: HandGestureState): HandGestureState {
  const pinch = simulatedPinch ?? (simulated === null ? next.pinch : false);
  let pose = next.pose;
  if (simulated === true) pose = "thumb-up";
  else if (simulated === false && pose === "thumb-up") pose = "none";
  if (simulatedPinch === true) pose = "pinch";
  else if (simulatedPinch === false && pose === "pinch") pose = "none";
  if (simulated === null) return { ...next, pinch, pose };
  return { ready: true, handVisible: simulated, thumbUp: simulated, pinch, cursor: next.cursor, pose, fingerCount: next.fingerCount };
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
  const discrete =
    state.ready === prev.ready &&
    state.handVisible === prev.handVisible &&
    state.thumbUp === prev.thumbUp &&
    state.pinch === prev.pinch &&
    state.pose === prev.pose &&
    state.fingerCount === prev.fingerCount;
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
  publish({ ready: true, ...readHand(hand, raw.pinch) });
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

/** Plays without letting a blocked or unsupported play() throw; the readyState check in the loop still guards. */
function safePlay(v: HTMLVideoElement): void {
  try {
    const playing = v.play() as Promise<void> | undefined;
    void playing?.catch?.(() => undefined);
  } catch {
    /* jsdom and blocked autoplay */
  }
}

function detachOwnFeed(): void {
  // Called every frame while the preview is in use: a feed that is already detached costs nothing.
  if (!video || video.srcObject === null) return;
  try {
    video.pause();
  } catch {
    /* jsdom */
  }
  video.srcObject = null;
}

/**
 * The element frames are read from. The camera preview when it already plays this stream, so the camera is decoded
 * once and every reader shares one frame identity. Otherwise the tracker's own feed (a second decode, rare).
 */
function frameVideo(): HTMLVideoElement | null {
  const stream = boundStream;
  if (!stream || typeof document === "undefined") return null;
  const preview = document.querySelector<HTMLVideoElement>(PREVIEW_SELECTOR);
  if (preview && preview.srcObject === stream) {
    detachOwnFeed();
    return preview;
  }
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
  }
  if (video.srcObject !== stream) {
    video.srcObject = stream;
    safePlay(video);
  }
  return video;
}

async function bind(stream: MediaStream): Promise<void> {
  unbind();
  const gen = ++generation;
  boundStream = stream;
  // Starts the feed now, so it runs while the model loads.
  frameVideo();
  try {
    const created = await takeHandLandmarker({ wasmRoot, modelUrl });
    if (gen !== generation) {
      try { created.landmarker.close(); } catch { /* best-effort */ }
      return;
    }
    landmarker = created.landmarker;
    failures = 0;
    lastVideoTime = -1;
    primary = null;
    reportTrackerFailed(false);
    publish({ ready: true, handVisible: false, thumbUp: false, pinch: false, cursor: null, pose: "none", fingerCount: 0 });
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
  detachOwnFeed();
  boundStream = null;
  primary = null;
  publish(IDLE);
}

function loop(): void {
  const v = frameVideo();
  const lm = landmarker;
  if (!v || !lm) return;
  rafId = requestAnimationFrame(loop);
  if (typeof document !== "undefined" && document.hidden) return;
  if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
  lastVideoTime = v.currentTime;
  let result: HandLandmarkerResult | null;
  const now = performance.now();
  try {
    // Shared gate: null when the budget skips this frame or another reader already read it.
    result = pollDetection(READER, v, (ts) => lm.detectForVideo(frameForDetection(v), ts));
    failures = 0;
  } catch {
    failures++;
    if (failures >= 3) {
      unbind();
      reportTrackerFailed(true);
    }
    return;
  }
  if (!result) return;
  // The player's hand, not whichever hand MediaPipe lists first; a lost lock reads as no hand.
  const pick = pickPrimaryHand(result.landmarks, primary, now);
  primary = pick.state;
  publish({ ready: true, ...readHand(pick.index === null ? undefined : result.landmarks[pick.index], raw.pinch) });
}

/** TEST ONLY. */
export function resetThumbTrackerForTest(): void {
  stopTracking();
  holders = 0;
  simulated = null;
  simulatedPinch = null;
  primary = null;
  poseVote.reset();
  fingerVote.reset();
  state = IDLE;
  raw = IDLE;
  listeners.clear();
}
