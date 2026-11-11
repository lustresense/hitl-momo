import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Landmark, StrokeStore } from "./types";
import type { HandFailureReason, HandInputStatus } from "./types";
import { classifyHandPose, evaluateGesture, indexTipNormalized, type HandPose } from "./hand-gesture";
import { HandStrokePipeline, type HandCursor, type HandFrame } from "./hand-stroke-pipeline";
import { ERASER_RADIUS_PX, fixedEraserControl, type EraserControl } from "./eraser";
import { getSharedStream, subscribeSharedStream } from "../camera/shared-stream";
import { publishHand, retireHand, startHandHeartbeat } from "../camera/hand-cursor-store";
import { delegateLabel } from "../camera/hand-landmarker";
import { takeHandLandmarker } from "../camera/landmarker-warmup";
import { frameForDetection } from "../camera/frame-source";
import { isLargeEnough } from "../camera/primary-hand";
import { classifyCameraError, messageFor, type CameraFailureReason } from "../camera/messages";

export { ERASER_RADIUS_PX };

/**
 * TASK 05 — MediaPipe HandLandmarker drawing driver (client-only).
 *
 * Camera and model lifecycle live here; the per-frame rules (pose vote, stroke start/release,
 * loss grace, eraser) live in HandStrokePipeline so the tests and the live path share them.
 * - Browser-only; never imported on the server (dynamic import at call site).
 * - Starts only when the student enters hand-drawing mode.
 * - Fully cleaned up when leaving drawing mode (camera tracks, rAF, landmarker).
 * - Every failure mode degrades to pointer/touch without app restart.
 */
export interface HandDriverOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  store: StrokeStore;
  modelUrl: string;
  /** WASM root for FilesetResolver; local copy under /mediapipe/wasm preferred. */
  wasmRoot?: string;
  onStatus(status: HandInputStatus): void;
  onRender(): void;
  onCursor?: (cursor: HandCursor | null) => void;
  /** PRD 0.0.16 R12: stable (voted) pose once per processed frame ("none" when no hand). The UI debounces it into commands. */
  onPose?: (pose: HandPose, nowMs: number) => void;
  /** Eraser setting owned by the surface (the fist, the Hapus tool and the two-hand sizer share it). */
  eraser?: EraserControl;
}

export class HandDrawingDriver {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  /** True only when THIS driver opened the camera (must then close it too). */
  private ownsStream = false;
  private rafId = 0;
  private running = false;
  private lastVideoTime = -1;
  /** Clock time of the last frame sent through the pipeline (camera frame or lost report). */
  private lastFedMs = 0;
  private readonly pipeline: HandStrokePipeline;
  /** Bumped by every start()/stop(); an async start whose token is stale must not touch state. */
  private generation = 0;
  private unsubscribeStream: (() => void) | null = null;
  private onVisibility: (() => void) | null = null;
  /** Keeps this reader alive in the shared cursor store while the model loads (no frames yet). */
  private stopHeartbeat: (() => void) | null = null;

  constructor(private readonly options: HandDriverOptions) {
    this.pipeline = new HandStrokePipeline({
      store: options.store,
      size: () => ({ width: options.canvas.width, height: options.canvas.height }),
      eraser: options.eraser ?? fixedEraserControl(options.canvas, ERASER_RADIUS_PX),
      onPose: options.onPose,
    });
  }

  async start(): Promise<void> {
    const { onStatus } = this.options;
    this.running = true;
    this.lastFedMs = performance.now();
    const myGen = ++this.generation;
    const stale = () => !this.running || this.generation !== myGen;
    // Visible to the dwell buttons from now on, so they never start a second model while this one loads.
    this.beginReader();
    try {
      onStatus({ kind: "initializing" });

      // Camera first so permission errors surface before model loading.
      // Zero double camera: bind the LIVE stream published by the persistent
      // GlobalCamera (same lens, no second permission prompt) when available.
      const shared = getSharedStream();
      let stream: MediaStream;
      let owns: boolean;
      if (shared && shared.getVideoTracks().some((t) => t.readyState === "live")) {
        stream = shared;
        owns = false;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        owns = true;
        if (stale()) {
          // stop() raced getUserMedia: never leave an orphan live camera.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
      }
      this.stream = stream;
      this.ownsStream = owns;
      if (this.options.video.srcObject !== stream) this.options.video.srcObject = stream;
      await this.options.video.play().catch(() => undefined);
      if (stale()) return;
      this.watchBorrowedStream();

      // Two hands: one draws or erases (the fist or the pinch), the other sets the eraser size.
      const created = await takeHandLandmarker({
        wasmRoot: this.options.wasmRoot ?? "/mediapipe/wasm",
        modelUrl: this.options.modelUrl,
        numHands: 2,
      });
      if (stale()) {
        // stop() raced the async start: do not leave an orphan landmarker behind.
        try { await created.landmarker.close(); } catch { /* best-effort */ }
        return;
      }
      this.landmarker = created.landmarker;

      onStatus({ kind: "ready", delegate: delegateLabel(created) });
      this.watchVisibility();
      this.endHeartbeat();
      this.loop();
    } catch (err) {
      if (stale()) return; // superseded by stop()/restart: the caller already moved on
      await this.stop();
      this.fail(classifyCameraError(err));
    }
  }

  private beginReader(): void {
    this.endHeartbeat();
    publishHand({ cursor: null, source: "drawing" });
    this.stopHeartbeat = startHandHeartbeat("drawing");
  }

  private endHeartbeat(): void {
    this.stopHeartbeat?.();
    this.stopHeartbeat = null;
  }

  /** Report a failure with a short Indonesian reason; the caller falls back to pointer. */
  private fail(reason: CameraFailureReason): void {
    this.options.onStatus({ kind: "error", reason: toHandReason(reason), message: messageFor(reason) });
  }

  /** A borrowed stream that ends or is retired (permission revoked, camera unplugged) must not leave a dead driver. */
  private watchBorrowedStream(): void {
    this.unsubscribeStream?.();
    this.unsubscribeStream = null;
    if (this.ownsStream || !this.stream) return;
    const stream = this.stream;
    const tracks = stream.getVideoTracks();
    const onEnded = () => this.onCameraLost();
    tracks.forEach((t) => t.addEventListener?.("ended", onEnded));
    const unsub = subscribeSharedStream((current) => {
      if (current !== stream) this.onCameraLost();
    });
    this.unsubscribeStream = () => {
      unsub();
      tracks.forEach((t) => t.removeEventListener?.("ended", onEnded));
    };
  }

  private onCameraLost(): void {
    if (!this.running) return;
    void this.stop().then(() => this.fail("camera-lost"));
  }

  /** Hidden tab: stop doing work and end any stroke so nothing stays "held". */
  private watchVisibility(): void {
    if (typeof document === "undefined" || this.onVisibility) return;
    this.onVisibility = () => {
      if (document.hidden) this.apply(this.pipeline.reset(performance.now()));
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /**
   * TEST HOOK ONLY (TASK 14): feeds synthetic landmarks through the same
   * pipeline without a camera. Guarded by NEXT_PUBLIC_TEST_HOOKS in callers.
   */
  feedLandmarksForTest(landmarks: Landmark[] | undefined, timestampMs: number): void {
    if (!this.running) return;
    this.process(landmarks ? [landmarks] : undefined, timestampMs);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    const video = this.options.video;
    if (!this.landmarker || video.readyState < 2) return;
    // Hidden tab: skip inference entirely (rAF is throttled anyway; this also covers occluded windows).
    if (typeof document !== "undefined" && document.hidden) return;
    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) {
      // No new camera frame. After a long freeze, report the hand as lost so the open line closes;
      // otherwise the next frame would draw a straight jump from the old point.
      if (now - this.lastFedMs > CAMERA_STALL_MS) this.process(undefined, now);
      return;
    }
    this.lastVideoTime = video.currentTime;
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(frameForDetection(video), now);
    } catch {
      // A throwing tracker will keep throwing: end the stroke, stop, and let the caller fall back.
      this.apply(this.pipeline.reset(now));
      void this.stop().then(() => this.fail("tracker-error"));
      return;
    }
    this.process(result.landmarks, now);
  };

  /**
   * `hands`: every hand MediaPipe reports this frame (none = undefined or empty).
   * The pipeline keeps its own fist/pinch choice between the two hands; here only far-away hands are dropped
   * (a person across the room must not draw or resize the eraser).
   */
  private process(hands: Landmark[][] | undefined, nowMs: number): void {
    this.lastFedMs = nowMs;
    const near = hands?.filter((h) => h && isLargeEnough(h));
    const frame = this.pipeline.feedHands(near, nowMs);
    this.apply(frame);
    const hand = cursorHandOf(near);
    publishHand({
      cursor: hand ? indexTipNormalized(hand) : null,
      pose: frame.pose,
      thumbUp: frame.pose === "thumb-up",
      pinch: frame.pose === "pinch",
      source: "drawing",
    });
  }

  /** Reports one frame: status, cursor, and a redraw only when the canvas changed. */
  private apply(frame: HandFrame): void {
    this.options.onStatus(frame.status);
    this.options.onCursor?.(frame.cursor);
    if (frame.changed) this.options.onRender();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.generation++;
    cancelAnimationFrame(this.rafId);
    this.endHeartbeat();
    retireHand("drawing");
    this.unsubscribeStream?.();
    this.unsubscribeStream = null;
    if (this.onVisibility && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
    this.onVisibility = null;
    // Closes any open stroke or eraser pass now, so no line or undo step is left half-open.
    if (this.pipeline.reset(performance.now()).changed) this.options.onRender();
    this.options.onCursor?.(null);
    // Only release tracks we opened; a borrowed (shared) stream stays alive
    // for its owner (GlobalCamera) and the next hand-mode session.
    const releasedOwnStream = this.ownsStream;
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ownsStream = false;
    // The video element is the shared GlobalCamera preview: only detach it when we opened the stream.
    if (releasedOwnStream) this.options.video.srcObject = null;
    const landmarker = this.landmarker;
    this.landmarker = null;
    try {
      await landmarker?.close();
    } catch {
      /* close is best-effort */
    }
  }
}

/** HandFailureReason is the narrower public union; fold the extra camera reasons into it. */
function toHandReason(reason: CameraFailureReason): HandFailureReason {
  switch (reason) {
    case "permission-denied":
    case "model-error":
    case "tracker-error":
      return reason;
    default:
      return "camera-unavailable";
  }
}

/**
 * The hand the shared cursor follows: the fist (the eraser hand) first, then a pinching hand, else the first seen.
 * Mirrors the drawing pipeline's pick closely enough for a cursor; the pipeline keeps the ink choice.
 */
function cursorHandOf(hands: Landmark[][] | undefined): Landmark[] | undefined {
  const visible = (hands ?? []).filter((h) => h && h.length >= 21);
  if (visible.length <= 1) return visible[0];
  return (
    visible.find((h) => classifyHandPose(h) === "fist") ??
    visible.find((h) => classifyHandPose(h) === "pinch") ??
    visible[0]
  );
}

/**
 * A camera that delivers no new frame for this long counts as a lost hand. Longer than the hand-loss
 * grace on purpose: a slow low-light webcam (about 6 fps) must not cut every stroke into dots.
 */
export const CAMERA_STALL_MS = 500;

/** Poses that are commands, never ink: a pinch-like thumb/index distance inside them must not draw. */
const COMMAND_POSES: ReadonlySet<HandPose> = new Set(["fist", "one-finger", "two-fingers", "three-fingers", "split-palm", "thumb-up"]);

/** Classify the pose once, report it, and suppress ink while a command pose is shown (single-frame helper). */
export function gateFrameByPose(
  frame: ReturnType<typeof evaluateGesture>,
  landmarks: Landmark[] | undefined,
  nowMs: number,
  onPose?: (pose: HandPose, nowMs: number) => void,
): { frame: ReturnType<typeof evaluateGesture>; pose: HandPose } {
  const pose = classifyHandPose(landmarks);
  onPose?.(pose, nowMs);
  if (frame.state === "tracking" && frame.pinched && COMMAND_POSES.has(pose)) {
    return { frame: { ...frame, pinched: false, cursorState: "hover" }, pose };
  }
  return { frame, pose };
}
