/**
 * R19 Stage P2 — Pistol Virtual-Key FSM (`PistolVirtualKeyFSM`)
 *
 * Maps pure Pistol geometry (`POINT_READY` / `POINT_PRESS` / `OTHER`) + aspect-corrected
 * `indexPointAngleAspect` into virtual-key events (`KEYDOWN`, `HELD`, `KEYUP`, `NONE`)
 * and `{ left, right, jump }` levels compatible with `InputArbiter` + 50 Hz `JumpAssist`:
 *
 *  - `POINT_READY` -> keys OFF (never steers or jumps while resting/aiming with thumb folded).
 *  - `POINT_PRESS` -> `KEYDOWN` / `HELD` (`walk-left`, `walk-right`, `jump`, `jump-left`, `jump-right`).
 *  - `POINT_RELEASE` (`PRESS -> READY | OTHER | NO_HAND`) -> immediate `KEYUP` (zero stuck keys).
 *  - Preserves `RIGHT -> RIGHT+JUMP -> RIGHT` (and `LEFT -> LEFT+JUMP -> LEFT`) horizontal
 *    continuity across the `30..45 deg` / `135..150 deg` upper deadband seam.
 *  - Supports jump policies `J1_hold`, `J2_edge_single`, and `J3_pulse_consumed` (default:
 *    60 ms timed pulse + 130 ms non-jump lockout so 50 Hz `JumpAssist` catches every jump
 *    without bunny-hopping on landing).
 *  - Includes `placing -> gameplay` phase barrier (`onPhaseChange`) and opposite-direction dwell safety.
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
} from "./pistol_types";
import { DEFAULT_LAB_ASPECT } from "./pistol_types";
import type { Landmark } from "./pistol_types";
import {
  classifyPistolGeometry,
  type PistolClassification,
  type PistolGeometricState,
} from "./pistol_geometry";

export type PistolJumpPolicy = "J1_hold" | "J2_edge_single" | "J3_pulse_consumed";

export type PistolFsmState =
  | "NO_HAND"
  | "RELEASED_WAIT_REARM"
  | "READY"
  | "OTHER"
  | "CANDIDATE"
  | "HELD";

export type VirtualKeyEvent = "NONE" | "KEYDOWN" | "HELD" | "KEYUP";

export interface PistolFsmConfig {
  aspect: number;
  jumpPolicy: PistolJumpPolicy;
  dwellMs: number;
  oppositeDwellMs: number;
  rearmFrames: number;
  hysteresisDeg: number;
  jumpPulseMs: number;
  jumpLockoutMs: number;
}

export const DEFAULT_PISTOL_FSM_CONFIG: PistolFsmConfig = {
  aspect: DEFAULT_LAB_ASPECT,
  jumpPolicy: "J3_pulse_consumed",
  dwellMs: 33,
  oppositeDwellMs: 66,
  rearmFrames: 2,
  hysteresisDeg: STEER_HYSTERESIS_DEG,
  jumpPulseMs: 60,
  jumpLockoutMs: 130,
};

export interface PistolFsmStep {
  tracked: boolean;
  geomState: PistolGeometricState;
  classification: PistolClassification;
  fsmState: PistolFsmState;
  keyEvent: VirtualKeyEvent;
  releaseReason: string | null;
  zone: SteerZone;
  rawZone: SteerZone;
  angle: number | null;
  input: DirectionInput;
  jumpPulseActive: boolean;
  jumpFiredThisFrame: boolean;
}

const NO_INPUT: DirectionInput = { left: false, right: false, jump: false };

export function zoneOfAngle(theta: number): SteerZone {
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
    case "walk-right":
      return a < STEER_WALK_DEG + h;
    case "walk-left":
      return a > 180 - STEER_WALK_DEG - h;
    case "jump":
      return theta >= STEER_JUMP_STRAIGHT_MIN_DEG - h && theta <= STEER_JUMP_STRAIGHT_MAX_DEG + h;
    case "jump-right":
      return theta >= STEER_JUMP_DIAGONAL_MIN_DEG - h && theta < STEER_JUMP_STRAIGHT_MIN_DEG + h;
    case "jump-left":
      return theta > STEER_JUMP_STRAIGHT_MAX_DEG - h && theta <= STEER_JUMP_DIAGONAL_MAX_DEG + h;
  }
}

/**
 * Resolve steering zone with hysteresis + upper-quadrant walk<->diagonal-jump continuity bridge.
 * Preserves horizontal key state across `0 deg <-> 45..70 deg` (`right`) and `180 deg <-> 110..135 deg` (`left`)
 * while still releasing immediately to `"stop"` when pointing downward (`theta < -30 - h`).
 */
function resolveTargetZone(theta: number, activeZone: SteerZone, h: number): SteerZone {
  if (activeZone !== "stop" && inWidenedZone(activeZone, theta, h)) {
    return activeZone;
  }
  const raw = zoneOfAngle(theta);
  if (raw === "stop") {
    if ((activeZone === "walk-right" || activeZone === "jump-right") && theta >= 0 && theta < STEER_JUMP_DIAGONAL_MIN_DEG) {
      return "walk-right";
    }
    if ((activeZone === "walk-left" || activeZone === "jump-left") && theta > STEER_JUMP_DIAGONAL_MAX_DEG && theta <= 180) {
      return "walk-left";
    }
  }
  return raw;
}

function isSameDirectionJumpRelease(prev: SteerZone, next: SteerZone): boolean {
  return (prev === "jump-right" && next === "walk-right") || (prev === "jump-left" && next === "walk-left");
}

function isAnyKeyDown(inp: DirectionInput): boolean {
  return inp.left || inp.right || inp.jump;
}

export class PistolVirtualKeyFSM {
  readonly cfg: PistolFsmConfig;

  fsmState: PistolFsmState = "NO_HAND";
  activeZone: SteerZone = "stop";
  candidateZone: SteerZone | null = null;
  candidateSinceMs = 0;
  private candidateReqDwellMs = 0;
  private candidateIsOpposite = false;
  rearmCount = 0;
  needsReleaseBeforeArm = false;
  jumpArmed = true;
  nonJumpMs: number;
  pulseRemainingMs = 0;
  jumpConsumed = false;
  private lastNowMs: number | null = null;
  private hadKeysPressed = false;
  private prevJumpOut = false;

  constructor(cfg: Partial<PistolFsmConfig> = {}) {
    this.cfg = { ...DEFAULT_PISTOL_FSM_CONFIG, ...cfg };
    this.nonJumpMs = this.cfg.jumpLockoutMs;
  }

  reset(): void {
    this.fsmState = "NO_HAND";
    this.activeZone = "stop";
    this.candidateZone = null;
    this.candidateSinceMs = 0;
    this.candidateReqDwellMs = 0;
    this.candidateIsOpposite = false;
    this.rearmCount = 0;
    this.needsReleaseBeforeArm = false;
    this.jumpArmed = true;
    this.nonJumpMs = this.cfg.jumpLockoutMs;
    this.pulseRemainingMs = 0;
    this.jumpConsumed = false;
    this.lastNowMs = null;
    this.hadKeysPressed = false;
    this.prevJumpOut = false;
  }

  /**
   * Phase barrier (e.g. `placing -> gameplay`): immediately releases all virtual keys and requires
   * leaving active `POINT_PRESS` steering before new gameplay inputs can arm.
   */
  onPhaseChange(): void {
    this.activeZone = "stop";
    this.candidateZone = null;
    this.candidateSinceMs = 0;
    this.candidateReqDwellMs = 0;
    this.candidateIsOpposite = false;
    this.rearmCount = 0;
    this.needsReleaseBeforeArm = true;
    this.pulseRemainingMs = 0;
    this.jumpConsumed = false;
    this.jumpArmed = true;
    this.nonJumpMs = this.cfg.jumpLockoutMs;
    this.hadKeysPressed = false;
    this.prevJumpOut = false;
    this.fsmState = "RELEASED_WAIT_REARM";
  }

  /** Optional hook from physics (`JumpAssist`) to release `jump` pulse immediately once consumed. */
  notifyJumpConsumed(): void {
    this.jumpConsumed = true;
    this.pulseRemainingMs = 0;
  }

  private tickNonJump(dtMs: number): void {
    this.nonJumpMs = Math.min(this.cfg.jumpLockoutMs, this.nonJumpMs + dtMs);
    if (this.nonJumpMs >= this.cfg.jumpLockoutMs) {
      this.jumpArmed = true;
    }
  }

  private releaseOutput(
    tracked: boolean,
    geomState: PistolGeometricState,
    classification: PistolClassification,
    nextFsmState: PistolFsmState,
    reason: string,
    rawZone: SteerZone,
    angle: number | null,
  ): PistolFsmStep {
    const keyEvent: VirtualKeyEvent = this.hadKeysPressed ? "KEYUP" : "NONE";
    this.activeZone = "stop";
    this.candidateZone = null;
    this.candidateReqDwellMs = 0;
    this.candidateIsOpposite = false;
    this.pulseRemainingMs = 0;
    this.jumpConsumed = false;
    this.hadKeysPressed = false;
    this.prevJumpOut = false;
    this.fsmState = nextFsmState;
    return {
      tracked,
      geomState,
      classification,
      fsmState: nextFsmState,
      keyEvent,
      releaseReason: keyEvent === "KEYUP" ? reason : null,
      zone: "stop",
      rawZone,
      angle,
      input: { ...NO_INPUT },
      jumpPulseActive: false,
      jumpFiredThisFrame: false,
    };
  }

  update(
    landmarks: Landmark[] | undefined,
    nowMs: number,
    clsOverride?: PistolClassification,
  ): PistolFsmStep {
    const dtMs = this.lastNowMs === null ? 0 : Math.max(0, Math.min(200, nowMs - this.lastNowMs));
    this.lastNowMs = nowMs;

    if (!landmarks || landmarks.length < 21) {
      this.rearmCount = 0;
      this.tickNonJump(dtMs);
      const degCls: PistolClassification = {
        state: "OTHER",
        subClass: "degenerate",
        reason: "no-hand",
        angle: null,
        metrics: null,
      };
      return this.releaseOutput(false, "OTHER", degCls, "NO_HAND", "no-hand", "stop", null);
    }

    const cls = clsOverride ?? classifyPistolGeometry(landmarks, this.cfg.aspect);
    if (cls.subClass === "degenerate") {
      this.rearmCount = 0;
      this.tickNonJump(dtMs);
      return this.releaseOutput(false, "OTHER", cls, "NO_HAND", "degenerate", "stop", null);
    }

    const angle = cls.angle;
    const rawZone = angle === null ? "stop" : zoneOfAngle(angle);

    // Phase barrier clearance: leaving POINT_PRESS or returning to "stop" neutral clears the barrier.
    if (this.needsReleaseBeforeArm) {
      if (cls.state !== "POINT_PRESS" || rawZone === "stop") {
        this.needsReleaseBeforeArm = false;
      } else {
        this.tickNonJump(dtMs);
        return this.releaseOutput(true, cls.state, cls, "RELEASED_WAIT_REARM", "phase-barrier", rawZone, angle);
      }
    }

    // Track re-acquisition stability from NO_HAND / RELEASED_WAIT_REARM.
    const comingFromLost = this.fsmState === "NO_HAND" || this.fsmState === "RELEASED_WAIT_REARM";
    if (comingFromLost) {
      this.rearmCount = 1;
    } else if (this.rearmCount < this.cfg.rearmFrames) {
      this.rearmCount++;
    }

    // POINT_READY and OTHER always force immediate KEYUP / keys OFF.
    if (cls.state === "POINT_READY") {
      this.tickNonJump(dtMs);
      return this.releaseOutput(true, "POINT_READY", cls, "READY", "point-ready", rawZone, angle);
    }
    if (cls.state !== "POINT_PRESS" || angle === null) {
      this.tickNonJump(dtMs);
      return this.releaseOutput(true, "OTHER", cls, "OTHER", `other:${cls.subClass}`, rawZone, angle);
    }

    // Wait for re-acquisition stability after NO_HAND before engaging keys.
    if (this.rearmCount < this.cfg.rearmFrames) {
      this.tickNonJump(dtMs);
      return this.releaseOutput(true, "POINT_PRESS", cls, "READY", "rearming", rawZone, angle);
    }

    // Resolve target steering zone with hysteresis + horizontal continuity bridge.
    const targetZone = resolveTargetZone(angle, this.activeZone, this.cfg.hysteresisDeg);

    if (targetZone === "stop") {
      this.tickNonJump(dtMs);
      return this.releaseOutput(true, "POINT_PRESS", cls, "READY", "stop-zone", rawZone, angle);
    }

    let inOppositeNeutralDwell = false;
    if (targetZone !== this.activeZone) {
      const prevInp = steerInput(this.activeZone);
      const nextInp = steerInput(targetZone);
      const isOppositeNow = (prevInp.left && nextInp.right) || (prevInp.right && nextInp.left);
      const sameDirJumpRelease = isSameDirectionJumpRelease(this.activeZone, targetZone);

      if (this.candidateZone !== targetZone) {
        this.candidateZone = targetZone;
        this.candidateSinceMs = nowMs;
        this.candidateIsOpposite = isOppositeNow;
        this.candidateReqDwellMs = sameDirJumpRelease
          ? 0
          : isOppositeNow
            ? this.cfg.oppositeDwellMs
            : this.cfg.dwellMs;
      }

      if (this.candidateReqDwellMs > 0 && nowMs - this.candidateSinceMs < this.candidateReqDwellMs) {
        this.fsmState = "CANDIDATE";
        if (this.candidateIsOpposite) {
          inOppositeNeutralDwell = true;
          this.activeZone = "stop";
        }
      } else {
        this.activeZone = targetZone;
        this.candidateZone = null;
        this.candidateReqDwellMs = 0;
        this.candidateIsOpposite = false;
      }
    } else {
      this.candidateZone = null;
      this.candidateReqDwellMs = 0;
      this.candidateIsOpposite = false;
    }

    if (inOppositeNeutralDwell) {
      this.pulseRemainingMs = 0;
      this.jumpConsumed = false;
      this.prevJumpOut = false;
      this.tickNonJump(dtMs);
      const keyEvent: VirtualKeyEvent = this.hadKeysPressed ? "KEYUP" : "NONE";
      this.hadKeysPressed = false;
      return {
        tracked: true,
        geomState: "POINT_PRESS",
        classification: cls,
        fsmState: "CANDIDATE",
        keyEvent,
        releaseReason: keyEvent === "KEYUP" ? "opposite-dwell" : null,
        zone: "stop",
        rawZone,
        angle,
        input: { ...NO_INPUT },
        jumpPulseActive: false,
        jumpFiredThisFrame: false,
      };
    }

    if (this.candidateZone === null) {
      this.fsmState = "HELD";
    }

    const baseInp = steerInput(this.activeZone);
    const wasJumpOut = this.prevJumpOut;
    let jumpOut = false;

    if (!baseInp.jump) {
      this.pulseRemainingMs = 0;
      this.jumpConsumed = false;
      this.tickNonJump(dtMs);
    } else if (this.cfg.jumpPolicy === "J1_hold") {
      jumpOut = true;
      this.nonJumpMs = 0;
    } else if (this.cfg.jumpPolicy === "J2_edge_single") {
      this.nonJumpMs = 0;
      if (this.jumpArmed) {
        jumpOut = true;
        this.jumpArmed = false;
      }
    } else {
      // J3_pulse_consumed: bounded jumpPulseMs window per jump entry + jumpLockoutMs non-jump re-arm.
      this.nonJumpMs = 0;
      if (this.pulseRemainingMs > 0 && !this.jumpConsumed) {
        this.pulseRemainingMs = Math.max(0, this.pulseRemainingMs - dtMs);
        jumpOut = this.pulseRemainingMs > 0;
      } else if (this.jumpArmed) {
        this.pulseRemainingMs = this.cfg.jumpPulseMs;
        this.jumpArmed = false;
        this.jumpConsumed = false;
        jumpOut = true;
      }
    }

    const jumpFiredThisFrame = jumpOut && !wasJumpOut;
    this.prevJumpOut = jumpOut;

    const outInput: DirectionInput = {
      left: baseInp.left,
      right: baseInp.right,
      jump: jumpOut,
    };
    const anyNow = isAnyKeyDown(outInput);
    const keyEvent: VirtualKeyEvent = anyNow
      ? this.hadKeysPressed
        ? "HELD"
        : "KEYDOWN"
      : this.hadKeysPressed
        ? "KEYUP"
        : "NONE";
    this.hadKeysPressed = anyNow;

    return {
      tracked: true,
      geomState: "POINT_PRESS",
      classification: cls,
      fsmState: this.fsmState,
      keyEvent,
      releaseReason: keyEvent === "KEYUP" ? "pulse-or-stop" : null,
      zone: this.activeZone,
      rawZone,
      angle,
      input: outInput,
      jumpPulseActive: this.cfg.jumpPolicy === "J3_pulse_consumed" && jumpOut,
      jumpFiredThisFrame,
    };
  }
}
