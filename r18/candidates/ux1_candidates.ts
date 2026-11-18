/**
 * R18-UX1 Candidate Modules (sandbox-only, never modifies `main`).
 *
 * Implements candidate improvements for:
 *  1. Aspect-corrected index pointing angle (`G03` / `F9`)
 *  2. Skeleton plausibility check (`F1`, §4.1)
 *  3. Intentional-pointing gate `P2_balanced` vs `P2_strict` (`G02` / `F8`)
 *  4. Virtual-key steering FSM with direction dwell, opposite-direction safety,
 *     phase barrier (`F10`), and J1 (hold) vs J2 (edge-triggered) jump (`G04` / `G09`)
 *  5. Action-safety guards for Hapus (sustained 5-finger palm), Pinch (tight + non-command),
 *     and Swipe (still-before-swipe + deliberate speed/travel) (`F5` / `F6`)
 */
import {
  STEER_HYSTERESIS_DEG,
  STEER_JUMP_DIAGONAL_MAX_DEG,
  STEER_JUMP_DIAGONAL_MIN_DEG,
  STEER_JUMP_STRAIGHT_MAX_DEG,
  STEER_JUMP_STRAIGHT_MIN_DEG,
  STEER_WALK_DEG,
  steerInput,
  type DirectionInput,
  type SteerZone,
} from "../repo/frontend/implementation/src/input/gameplay-gesture";
import {
  classifyHandPose,
  countExtendedFingers,
  evaluateGesture,
  fingerDiagnosticStates,
  indexTipNormalized,
  palmCenterNormalized,
  thumbDiagnostics,
  withAspect,
  type FingerState,
  type HandPose,
} from "../repo/frontend/implementation/src/input/hand-gesture";
import { handSize } from "../repo/frontend/implementation/src/camera/primary-hand";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";

const NO_INPUT: DirectionInput = { left: false, right: false, jump: false };

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 1. Aspect-corrected index finger direction (0 = right, 90 = up, 180 = left). */
export function indexPointAngleAspect(landmarks: Landmark[], aspect = 16 / 9): number | null {
  const base = landmarks[5];
  const tip = landmarks[8];
  if (!base || !tip) return null;
  if ([base.x, base.y, tip.x, tip.y].some((v) => !Number.isFinite(v))) return null;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const dx = (base.x - tip.x) * a;
  const dy = base.y - tip.y;
  if (Math.hypot(dx, dy) < 0.01) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** 2. Geometric skeleton plausibility check (§4.1, F1). Inclusive (>=99.7% real hands), rejects collapsed/exploded artifacts. */
export function isPlausibleHandSkeleton(landmarks: Landmark[], aspect = 4 / 3): boolean {
  if (!landmarks || landmarks.length < 21) return false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of landmarks) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const hs = Math.max(maxX - minX, maxY - minY);
  if (hs < 0.06 || hs > 1.25) return false;

  const g = withAspect(landmarks, aspect);
  // Use max(wrist-to-mid-MCP, index-to-pinky knuckle) so side-on or forward-pitched palms do not collapse the denominator
  const palmScale = Math.max(dist(g[0]!, g[9]!), dist(g[5]!, g[17]!));
  if (palmScale < 0.045) return false;

  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const bboxArea = (maxX - minX) * a * (maxY - minY);
  if (bboxArea < 0.0028) return false;

  const idxChain = (dist(g[5]!, g[6]!) + dist(g[6]!, g[7]!) + dist(g[7]!, g[8]!)) / palmScale;
  const midChain = (dist(g[9]!, g[10]!) + dist(g[10]!, g[11]!) + dist(g[11]!, g[12]!)) / palmScale;
  if (idxChain < 0.14 || idxChain > 2.8 || midChain < 0.14 || midChain > 3.0) return false;

  return true;
}

/** 3. Intentional-pointing gate (P2_balanced vs P2_strict vs P1_aspect_only). */
export type PointingPolicy = "P0_baseline" | "P1_aspect" | "P2_balanced" | "P2_strict";

export function isIntentionalPointing(
  landmarks: Landmark[],
  policy: PointingPolicy,
  aspect = 4 / 3,
): { ok: boolean; reason: string; angle: number | null } {
  if (policy === "P0_baseline") {
    const b = landmarks[5];
    const t = landmarks[8];
    if (!b || !t) return { ok: false, reason: "missing", angle: null };
    const dx = b.x - t.x;
    const dy = b.y - t.y;
    const ang = Math.hypot(dx, dy) < 0.01 ? null : (Math.atan2(dy, dx) * 180) / Math.PI;
    return { ok: ang !== null, reason: ang !== null ? "ok" : "short", angle: ang };
  }

  const ang = indexPointAngleAspect(landmarks, aspect);
  if (ang === null) return { ok: false, reason: "short-vector", angle: null };
  if (policy === "P1_aspect") return { ok: true, reason: "ok", angle: ang };

  if (!isPlausibleHandSkeleton(landmarks, aspect)) return { ok: false, reason: "implausible-skeleton", angle: null };
  const g = withAspect(landmarks, aspect);
  const w = g[0]!;
  const palmScale = Math.max(dist(w, g[9]!), dist(g[5]!, g[17]!));
  // Check projected 5->8 length relative to palmScale (reject straight-at-camera/curled stub)
  const projLen = dist(g[5]!, g[8]!);
  if (projLen < 0.22 * palmScale) return { ok: false, reason: "foreshortened-index", angle: null };

  // Distinguish actual pinch from depth-foreshortened pointing where thumb rests behind index
  const pinchRatio = dist(g[4]!, g[8]!) / palmScale;
  const idxReach = dist(g[8]!, w);
  const thumbReach = dist(g[4]!, w);
  if (pinchRatio < 0.25 || (pinchRatio < 0.35 && idxReach <= thumbReach * 1.15)) {
    return { ok: false, reason: "pinching", angle: null };
  }

  const states = fingerDiagnosticStates(g);
  if (!states) return { ok: false, reason: "invalid-states", angle: null };
  const [idx, mid, ring, pinky] = states;

  if (policy === "P2_strict") {
    if (idx !== "extended") return { ok: false, reason: "index-not-extended", angle: null };
    if (mid !== "curled" || ring !== "curled" || pinky !== "curled") {
      return { ok: false, reason: "other-fingers-not-curled", angle: null };
    }
    return { ok: true, reason: "ok", angle: ang };
  }

  // P2_balanced: allow depth-tilted "between" index ONLY when all 3 other fingers are curled and index extends outward
  const idxOk = idx === "extended" || (
    idx === "between" &&
    mid === "curled" && ring === "curled" && pinky === "curled" &&
    idxReach > dist(g[6]!, w) && idxReach > dist(g[5]!, w) * 1.18
  );
  if (!idxOk) return { ok: false, reason: "index-not-extended", angle: null };

  const extOthers = [mid, ring, pinky].filter((s) => s === "extended").length;
  if (extOthers >= 1) {
    const midReach = dist(g[12]!, w);
    if (mid === "extended" && idxReach <= midReach * 1.15) return { ok: false, reason: "multi-finger-extended", angle: null };
    if (extOthers >= 2) return { ok: false, reason: "open-hand-not-pointing", angle: null };
  }
  return { ok: true, reason: "ok", angle: ang };
}

function zoneOfAngle(theta: number): SteerZone {
  const a = Math.abs(theta);
  if (a < STEER_WALK_DEG) return "walk-right";
  if (a > 180 - STEER_WALK_DEG) return "walk-left";
  if (theta >= STEER_JUMP_STRAIGHT_MIN_DEG && theta <= STEER_JUMP_STRAIGHT_MAX_DEG) return "jump";
  if (theta >= STEER_JUMP_DIAGONAL_MIN_DEG && theta < STEER_JUMP_STRAIGHT_MIN_DEG) return "jump-right";
  if (theta > STEER_JUMP_STRAIGHT_MAX_DEG && theta <= STEER_JUMP_DIAGONAL_MAX_DEG) return "jump-left";
  return "stop";
}

function inWidenedZone(zone: Exclude<SteerZone, "stop">, theta: number, h: number): boolean {
  const a = Math.abs(theta);
  switch (zone) {
    case "walk-right": return a < STEER_WALK_DEG + h;
    case "walk-left": return a > 180 - STEER_WALK_DEG - h;
    case "jump": return theta >= STEER_JUMP_STRAIGHT_MIN_DEG - h && theta <= STEER_JUMP_STRAIGHT_MAX_DEG + h;
    case "jump-right": return theta >= STEER_JUMP_DIAGONAL_MIN_DEG - h && theta < STEER_JUMP_STRAIGHT_MIN_DEG + h;
    case "jump-left": return theta > STEER_JUMP_STRAIGHT_MAX_DEG - h && theta <= STEER_JUMP_DIAGONAL_MAX_DEG + h;
  }
}

export type JumpPolicy = "J1_hold" | "J2_edge";
export type VKeyState = "NO_HAND" | "RELEASED_WAIT_REARM" | "NEUTRAL" | "CANDIDATE" | "HELD";

export interface VirtualKeyConfig {
  pointingPolicy: PointingPolicy;
  jumpPolicy: JumpPolicy;
  aspect: number;
  dwellMs: number;
  oppositeDwellMs: number;
  rearmFrames: number;
  hysteresisDeg: number;
}

/** 4. Virtual-key FSM for keyboard-like Thinman movement. */
export class VirtualKeySteeringFSM {
  state: VKeyState = "NO_HAND";
  activeZone: SteerZone = "stop";
  candidateZone: SteerZone | null = null;
  candidateSinceMs = 0;
  rearmCount = 0;
  needsReleaseBeforeArm = false;
  jumpArmed = true;
  nonJumpMs = 0;
  private lastNowMs: number | null = null;

  constructor(readonly cfg: VirtualKeyConfig) {}

  reset(): void {
    this.state = "NO_HAND";
    this.activeZone = "stop";
    this.candidateZone = null;
    this.candidateSinceMs = 0;
    this.rearmCount = 0;
    this.needsReleaseBeforeArm = false;
    this.jumpArmed = true;
    this.nonJumpMs = 0;
    this.lastNowMs = null;
  }

  /** Phase barrier (placing -> gameplay): immediate RELEASE_ALL; must see non-active/neutral release before steering. */
  onPhaseChange(): void {
    this.activeZone = "stop";
    this.candidateZone = null;
    this.rearmCount = 0;
    this.needsReleaseBeforeArm = true;
    this.jumpArmed = true;
    this.nonJumpMs = 0;
    this.state = "RELEASED_WAIT_REARM";
  }

  private tickNonJump(dtMs: number): void {
    this.nonJumpMs += dtMs;
    if (this.nonJumpMs >= 130) this.jumpArmed = true;
  }

  update(landmarks: Landmark[] | undefined, nowMs: number): {
    tracked: boolean;
    pointingOk: boolean;
    zone: SteerZone;
    input: DirectionInput;
    angle: number | null;
    state: VKeyState;
  } {
    const dtMs = this.lastNowMs === null ? 0 : Math.max(0, Math.min(200, nowMs - this.lastNowMs));
    this.lastNowMs = nowMs;

    if (!landmarks || landmarks.length < 21) {
      this.activeZone = "stop";
      this.candidateZone = null;
      this.rearmCount = 0;
      this.state = "NO_HAND";
      this.tickNonJump(dtMs);
      return { tracked: false, pointingOk: false, zone: "stop", input: { ...NO_INPUT }, angle: null, state: this.state };
    }

    const pt = isIntentionalPointing(landmarks, this.cfg.pointingPolicy, this.cfg.aspect);
    if (!pt.ok || pt.angle === null) {
      // Immediate fail-safe keyup when non-pointing or degenerate; never instantly re-arm jump on 1-frame flicker
      this.activeZone = "stop";
      this.candidateZone = null;
      this.rearmCount = 0;
      this.needsReleaseBeforeArm = false;
      this.tickNonJump(dtMs);
      this.state = "NEUTRAL";
      return { tracked: true, pointingOk: false, zone: "stop", input: { ...NO_INPUT }, angle: null, state: this.state };
    }

    const rawZone = zoneOfAngle(pt.angle);

    // Phase barrier: if user entered phase already pointing in an action zone, require return to neutral/stop first
    if (this.needsReleaseBeforeArm) {
      if (rawZone === "stop") {
        this.needsReleaseBeforeArm = false;
        this.state = "NEUTRAL";
      } else {
        this.state = "RELEASED_WAIT_REARM";
        return { tracked: true, pointingOk: true, zone: "stop", input: { ...NO_INPUT }, angle: pt.angle, state: this.state };
      }
    }

    if (this.state === "NO_HAND" || this.state === "RELEASED_WAIT_REARM") {
      this.rearmCount = 1;
      this.state = "NEUTRAL";
      if (this.rearmCount < this.cfg.rearmFrames) {
        return { tracked: true, pointingOk: true, zone: "stop", input: { ...NO_INPUT }, angle: pt.angle, state: this.state };
      }
    } else if (this.rearmCount < this.cfg.rearmFrames) {
      this.rearmCount++;
      if (this.rearmCount < this.cfg.rearmFrames) {
        return { tracked: true, pointingOk: true, zone: "stop", input: { ...NO_INPUT }, angle: pt.angle, state: this.state };
      }
    }

    // Hysteresis on active zone
    let targetZone = rawZone;
    if (this.activeZone !== "stop" && inWidenedZone(this.activeZone, pt.angle, this.cfg.hysteresisDeg)) {
      targetZone = this.activeZone;
    }

    // Track continuous non-jump posture even during zone transition dwell
    if (this.cfg.jumpPolicy === "J2_edge") {
      if (targetZone === "stop" || pt.angle < 40 || pt.angle > 140 || !steerInput(targetZone).jump) {
        this.tickNonJump(dtMs);
      } else {
        this.nonJumpMs = 0;
      }
    }

    if (targetZone === "stop") {
      // Immediate keyup on neutral
      this.activeZone = "stop";
      this.candidateZone = null;
      this.state = "NEUTRAL";
      return { tracked: true, pointingOk: true, zone: "stop", input: { ...NO_INPUT }, angle: pt.angle, state: this.state };
    }

    // Check dwell when changing into a new active zone
    if (targetZone !== this.activeZone) {
      const prevInp = steerInput(this.activeZone);
      const nextInp = steerInput(targetZone);
      const isOpposite = (prevInp.left && nextInp.right) || (prevInp.right && nextInp.left);
      const reqDwell = isOpposite ? this.cfg.oppositeDwellMs : this.cfg.dwellMs;
      if (reqDwell > 0) {
        if (this.candidateZone !== targetZone) {
          this.candidateZone = targetZone;
          this.candidateSinceMs = nowMs;
          this.state = "CANDIDATE";
          // During cross-axis flip dwell, emit neutral instead of old opposite direction
          const outInp = isOpposite ? { ...NO_INPUT } : steerInput(this.activeZone);
          return { tracked: true, pointingOk: true, zone: isOpposite ? "stop" : this.activeZone, input: outInp, angle: pt.angle, state: this.state };
        }
        if (nowMs - this.candidateSinceMs < reqDwell) {
          this.state = "CANDIDATE";
          const outInp = isOpposite ? { ...NO_INPUT } : steerInput(this.activeZone);
          return { tracked: true, pointingOk: true, zone: isOpposite ? "stop" : this.activeZone, input: outInp, angle: pt.angle, state: this.state };
        }
      }
      this.activeZone = targetZone;
      this.candidateZone = null;
    }

    this.state = "HELD";
    const baseInp = steerInput(this.activeZone);

    // Jump policy: J1 hold vs J2 edge-triggered (re-arm already tracked above via tickNonJump >= 130ms)
    let jumpOut = baseInp.jump;
    if (this.cfg.jumpPolicy === "J2_edge") {
      if (baseInp.jump) {
        if (this.jumpArmed) {
          jumpOut = true;
          this.jumpArmed = false;
        } else {
          jumpOut = false;
        }
      }
    }

    return {
      tracked: true,
      pointingOk: true,
      zone: this.activeZone,
      input: { left: baseInp.left, right: baseInp.right, jump: jumpOut },
      angle: pt.angle,
      state: this.state,
    };
  }
}

/** 5. Action-safety temporal & rule guards for Drawing (Hapus, Pinch) and Swipe. */
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

  feed(
    pose: HandPose,
    x: number,
    y: number,
    palmScale: number,
    nowMs: number,
  ): "undo" | "redo" | null {
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

    // Must hold pose relatively still for >= 220ms BEFORE starting a deliberate swipe
    // (suppresses false Undo/Redo during continuous cursor sweeping in P1F/P2F)
    const normScale = Math.max(palmScale, 0.08);
    if (!this.armedStill) {
      const oldest = this.buffer[0]!;
      if (this.poseStreak >= 5 && nowMs - oldest.t >= 220) {
        const recent = this.buffer.filter((s) => nowMs - s.t <= 220);
        if (recent.length >= 2) {
          const disp = Math.hypot(recent[recent.length - 1]!.x - recent[0]!.x, recent[recent.length - 1]!.y - recent[0]!.y) / normScale;
          if (disp <= 0.20) {
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
    if (dirOk && Math.abs(dx) >= 2.0 && Math.abs(dy) <= 0.40 * Math.abs(dx) && straight >= 0.85 && speed >= 3.0) {
      this.cooldownUntil = nowMs + 900;
      this.armedStill = false;
      this.buffer = [];
      return wanted;
    }
    return null;
  }
}

/** Strict sustained 5-finger palm check for Hapus to curb NOG/GRB/OP2 false erasures. */
export function isSafeEraseFrame(lm: Landmark[], aspect = 4 / 3): boolean {
  if (!isPlausibleHandSkeleton(lm, aspect)) return false;
  const pose = classifyHandPose(lm, { experimentalRobust: true, aspect });
  if (pose !== "open-palm" && pose !== "split-palm") return false;
  const g = withAspect(lm, aspect);
  const states = fingerDiagnosticStates(g);
  if (!states || states.some((s) => s !== "extended")) return false;
  const td = thumbDiagnostics(lm, aspect);
  if (!td || td.lateral === null || td.lateral < 1.35 || td.ipAngleDeg < 130) return false;
  const ev = evaluateGesture(lm, aspect);
  if (ev.state !== "tracking" || ev.pinchRatio < 0.50) return false;
  return true;
}

export function isSafePinchFrame(lm: Landmark[], pinchHeld: boolean, aspect = 4 / 3): boolean {
  if (!isPlausibleHandSkeleton(lm, aspect)) return false;
  const pose = classifyHandPose(lm, { pinchHeld, experimentalRobust: true, aspect });
  if (pose !== "pinch") return false;
  // Additional guard: do not trigger ink when middle/ring/pinky are all tightly curled like a grab/fist
  const g = withAspect(lm, aspect);
  const states = fingerDiagnosticStates(g);
  if (!states) return false;
  const [idx, mid, ring, pinky] = states;
  // Allow pinch when index is not curled OR at least one of mid/ring/pinky is non-curled (classic OK-pinch/draw)
  if (idx === "curled" && mid === "curled" && ring === "curled" && pinky === "curled") return false;
  return true;
}
