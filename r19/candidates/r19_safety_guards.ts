/**
 * Standalone R19 Action Safety Guards (`SafeSwipeGuard`, `isSafeEraseFrame`, `isSafePinchFrame`)
 * matching `r18/candidates/ux1_candidates.ts` without external repo imports.
 */
import { pistolGeometryMetrics } from "./pistol_geometry";
import { thumbLateral, withAspect, type FingerState, type Landmark } from "./pistol_types";

export type HandPose =
  | "none"
  | "fist"
  | "pinch"
  | "thumb-up"
  | "one-finger"
  | "two-fingers"
  | "three-fingers"
  | "open-palm"
  | "split-palm";

export class SafeSwipeGuard {
  private lastPose: HandPose = "none";
  private poseStreak = 0;
  private armedStill = false;
  private buffer: Array<{ t: number; x: number; y: number }> = [];
  private cooldownUntil = 0;

  reset(): void {
    this.lastPose = "none";
    this.poseStreak = 0;
    this.armedStill = false;
    this.buffer = [];
    this.cooldownUntil = 0;
  }

  feed(pose: HandPose, x: number, y: number, palmScale: number, nowMs: number): "undo" | "redo" | null {
    const wanted = pose === "one-finger" ? "undo" : pose === "two-fingers" ? "redo" : null;
    if (!wanted || palmScale <= 1e-6) {
      this.lastPose = "none";
      this.poseStreak = 0;
      this.armedStill = false;
      this.buffer = [];
      return null;
    }
    if (pose !== this.lastPose) {
      this.lastPose = pose;
      this.poseStreak = 1;
      this.armedStill = false;
      this.buffer = [{ t: nowMs, x, y }];
      return null;
    }
    this.poseStreak++;
    if (nowMs < this.cooldownUntil) return null;

    this.buffer.push({ t: nowMs, x, y });
    while (this.buffer.length > 1 && nowMs - this.buffer[0]!.t > 500) this.buffer.shift();

    const normScale = Math.max(palmScale, 0.08);
    if (!this.armedStill) {
      const oldest = this.buffer[0]!;
      if (this.poseStreak >= 5 && nowMs - oldest.t >= 220) {
        const recent = this.buffer.filter((s) => nowMs - s.t <= 220);
        if (recent.length >= 2) {
          const disp = Math.hypot(recent[recent.length - 1]!.x - recent[0]!.x, recent[recent.length - 1]!.y - recent[0]!.y) / normScale;
          if (disp <= 0.2) {
            this.armedStill = true;
            this.buffer = [{ t: nowMs, x, y }];
          }
        }
      }
      return null;
    }

    const first = this.buffer[0]!;
    const dt = Math.max(1, nowMs - first.t);
    const dx = (x - first.x) / normScale;
    const dy = (y - first.y) / normScale;
    let path = 0;
    for (let i = 1; i < this.buffer.length; i++) {
      path += Math.hypot(this.buffer[i]!.x - this.buffer[i - 1]!.x, this.buffer[i]!.y - this.buffer[i - 1]!.y) / normScale;
    }
    const straight = path > 1e-6 ? Math.hypot(dx, dy) / path : 0;
    const speed = (Math.abs(dx) * 1000) / dt;
    const dirOk = wanted === "undo" ? dx < 0 : dx > 0;
    if (dirOk && Math.abs(dx) >= 2.0 && Math.abs(dy) <= 0.4 * Math.abs(dx) && straight >= 0.85 && speed >= 3.0) {
      this.cooldownUntil = nowMs + 900;
      this.armedStill = false;
      this.buffer = [];
      return wanted;
    }
    return null;
  }
}

export function isSafeEraseFrame(lm: Landmark[], aspect = 4 / 3): boolean {
  const m = pistolGeometryMetrics(lm, aspect);
  if (!m || !m.plausible) return false;
  const states: [FingerState, FingerState, FingerState, FingerState] = m.fingerStates;
  if (states.some((s) => s !== "extended")) return false;
  const tl = thumbLateral(withAspect(lm, aspect));
  if (tl === null || tl < 1.35 || m.thumbAngle234Deg < 130) return false;
  if (m.d4_8 < 0.5) return false;
  return true;
}

export function isSafePinchFrame(lm: Landmark[], pinchHeld: boolean, aspect = 4 / 3): boolean {
  const m = pistolGeometryMetrics(lm, aspect);
  if (!m || !m.plausible) return false;
  if (m.isThumbUp) return false;
  const idx = m.fingerStates[0];
  const enterRatio = idx === "curled" ? 0.2 : 0.3;
  const exitRatio = idx === "curled" ? 0.27 : 0.42;
  const thresh = pinchHeld ? exitRatio : enterRatio;
  const pinchRatio = m.d4_8 / Math.max(0.2, m.wristToMidRatio);
  if (pinchRatio >= thresh) return false;
  if (m.fingerStates.every((s) => s === "curled")) return false;
  return true;
}
