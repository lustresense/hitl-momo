/**
 * NUI Lab only (R17-01 REV4, NUI-R17-03): Undo and Redo by a swipe, not by holding a pose.
 *
 * Candidate mapping under test, NOT a product decision (the Owner has not locked it):
 *   one finger + swipe LEFT  = Undo
 *   two fingers + swipe RIGHT = Redo
 * Left and right are as the student sees them on the mirrored preview.
 *
 * Finite state machine: idle -> pose-armed -> tracking-motion -> fired -> cooldown (-> idle).
 *  - A still pose never fires. Jitter never fires (net travel must be large and the path straight).
 *  - One swipe is one action: after a fire the machine waits out a cooldown and then needs the hand to be still again.
 *  - Losing the hand, an ambiguous lock, a new acquisition epoch or a pose change cancels the swipe in progress.
 * Every number below is a prototype parameter measured by tests/nui-lab/lab-swipe.test.ts, not a verified threshold.
 * The machine reads a point that is already mirrored and aspect-corrected, in the same units as `spanPx` (hand span).
 */
import type { HandPose } from "@/src/input/hand-gesture";

export type SwipeKind = "undo" | "redo";
export type SwipePhase = "idle" | "pose-armed" | "tracking-motion" | "fired" | "cooldown";

export const SWIPE_CONFIG = {
  /** The same swipe pose must be seen this many frames in a row before motion counts. */
  armFrames: 3,
  /** Look-back window for the swipe. */
  windowMs: 600,
  /** Horizontal travel inside the window, in hand spans (wrist to middle knuckle). */
  minTravelSpans: 1.3,
  /** Vertical travel may be at most this share of the horizontal travel. */
  maxVerticalShare: 0.5,
  /** Net travel / path length. 1 = a straight line; tremor and zig-zag stay low. */
  minStraightness: 0.75,
  /** Average speed over the window, in spans per second. */
  minSpeedSpansPerS: 1.8,
  /** Motion above this many spans moves the machine from pose-armed to tracking-motion. */
  trackingStartSpans: 0.35,
  /** After a fire nothing can fire for this long. */
  cooldownMs: 800,
  /** After the cooldown the hand must move less than this (spans) over the last `stillMs` to re-arm. */
  rearmStillSpans: 0.25,
  stillMs: 150,
} as const;

export interface SwipeInput {
  pose: HandPose;
  /** Palm centre, mirrored like the preview, in the same units as spanPx. */
  x: number;
  y: number;
  /** Hand span in those units. */
  spanPx: number;
  nowMs: number;
  /** False while the hand lock is not clean (ambiguous, waiting, a new epoch not yet armed). */
  permitted: boolean;
}

export interface SwipeDebug {
  phase: SwipePhase;
  pose: HandPose;
  poseStreak: number;
  /** Horizontal travel in the window, hand spans (negative = left). */
  travelSpans: number;
  verticalSpans: number;
  straightness: number;
  speedSpansPerS: number;
  firedCount: number;
  lastFired: SwipeKind | null;
  lastCancel: string | null;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

const kindFor = (pose: HandPose): SwipeKind | null =>
  pose === "one-finger" ? "undo" : pose === "two-fingers" ? "redo" : null;

export class SwipeCommander {
  private phase: SwipePhase = "idle";
  private lastPose: HandPose = "none";
  private poseStreak = 0;
  private buffer: Sample[] = [];
  private cooldownUntil = 0;
  private needStill = false;
  private firedCount = 0;
  private lastFired: SwipeKind | null = null;
  private lastCancel: string | null = null;
  private metrics = { travel: 0, vertical: 0, straight: 0, speed: 0 };

  /** Returns the command to run now, or null. */
  feed(input: SwipeInput): SwipeKind | null {
    const { pose, nowMs } = input;
    const wanted = kindFor(pose);
    if (!input.permitted || wanted === null || input.spanPx <= 1e-6) {
      this.cancelInternal(input.permitted ? (wanted === null ? "pose" : "span") : "lock");
      return null;
    }

    if (pose !== this.lastPose) {
      // A different swipe pose starts over: it must prove itself again.
      this.lastPose = pose;
      this.poseStreak = 1;
      this.buffer = [];
      if (this.phase !== "cooldown") this.phase = "idle";
      return null;
    }
    this.poseStreak += 1;

    if (this.phase === "cooldown") {
      if (nowMs < this.cooldownUntil) return null;
      this.phase = "idle";
      this.needStill = true;
      this.buffer = [];
    }

    this.buffer.push({ t: nowMs, x: input.x, y: input.y });
    while (this.buffer.length > 1 && nowMs - this.buffer[0]!.t > SWIPE_CONFIG.windowMs) this.buffer.shift();

    if (this.needStill) {
      if (this.isStill(input.spanPx)) {
        this.needStill = false;
        this.buffer = [{ t: nowMs, x: input.x, y: input.y }];
      }
      return null;
    }
    if (this.poseStreak < SWIPE_CONFIG.armFrames) return null;
    if (this.phase === "idle") this.phase = "pose-armed";

    const first = this.buffer[0]!;
    const dt = Math.max(1, nowMs - first.t);
    const dx = (input.x - first.x) / input.spanPx;
    const dy = (input.y - first.y) / input.spanPx;
    let path = 0;
    for (let i = 1; i < this.buffer.length; i++) {
      const a = this.buffer[i - 1]!;
      const b = this.buffer[i]!;
      path += Math.hypot(b.x - a.x, b.y - a.y) / input.spanPx;
    }
    const net = Math.hypot(dx, dy);
    this.metrics = { travel: dx, vertical: dy, straight: path <= 1e-6 ? 0 : net / path, speed: (Math.abs(dx) * 1000) / dt };

    if (Math.abs(dx) >= SWIPE_CONFIG.trackingStartSpans && this.phase === "pose-armed") this.phase = "tracking-motion";
    if (this.phase !== "tracking-motion") return null;

    const directionOk = wanted === "undo" ? dx < 0 : dx > 0;
    const fires =
      directionOk &&
      Math.abs(dx) >= SWIPE_CONFIG.minTravelSpans &&
      Math.abs(dy) <= SWIPE_CONFIG.maxVerticalShare * Math.abs(dx) &&
      this.metrics.straight >= SWIPE_CONFIG.minStraightness &&
      this.metrics.speed >= SWIPE_CONFIG.minSpeedSpansPerS;
    if (!fires) {
      // Motion that fades out (the hand stopped short) returns to armed so a new attempt can start cleanly.
      if (Math.abs(dx) < SWIPE_CONFIG.trackingStartSpans * 0.5) this.phase = "pose-armed";
      return null;
    }

    this.phase = "cooldown";
    this.cooldownUntil = nowMs + SWIPE_CONFIG.cooldownMs;
    this.buffer = [];
    this.firedCount += 1;
    this.lastFired = wanted;
    return wanted;
  }

  /** The lock changed owner, the hand was lost, or the camera stopped: drop everything in progress. */
  cancel(reason: string): void {
    this.cancelInternal(reason);
    this.cooldownUntil = 0;
    this.needStill = false;
  }

  reset(): void {
    this.cancel("reset");
    this.firedCount = 0;
    this.lastFired = null;
    this.lastCancel = null;
  }

  debug(): SwipeDebug {
    return {
      phase: this.phase,
      pose: this.lastPose,
      poseStreak: this.poseStreak,
      travelSpans: this.metrics.travel,
      verticalSpans: this.metrics.vertical,
      straightness: this.metrics.straight,
      speedSpansPerS: this.metrics.speed,
      firedCount: this.firedCount,
      lastFired: this.lastFired,
      lastCancel: this.lastCancel,
    };
  }

  private cancelInternal(reason: string): void {
    if (this.phase !== "idle" || this.poseStreak > 0 || this.buffer.length > 0) this.lastCancel = reason;
    this.lastPose = "none";
    this.poseStreak = 0;
    this.buffer = [];
    this.metrics = { travel: 0, vertical: 0, straight: 0, speed: 0 };
    if (this.phase !== "cooldown") this.phase = "idle";
  }

  private isStill(span: number): boolean {
    const last = this.buffer[this.buffer.length - 1];
    if (!last) return false;
    const old = this.buffer.find((s) => last.t - s.t <= SWIPE_CONFIG.stillMs);
    if (!old || old === last) return false;
    return Math.hypot(last.x - old.x, last.y - old.y) / span <= SWIPE_CONFIG.rearmStillSpans;
  }
}
