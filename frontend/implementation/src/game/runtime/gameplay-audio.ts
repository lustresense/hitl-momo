/**
 * Audio observers for the KAPLAY gameplay scene. Everything here is READ-ONLY with respect to
 * physics: it only looks at values the scene already has (grounded flag, vertical velocity, the
 * animation bridge's current keyframe) and says "that just happened" to the audio engine.
 *
 * Rules (Owner audio mandate M-047): edge-triggered only, truthful (a result sound only for a
 * result the scene really reported), and never per frame.
 */
import { audio, type AudioEventId } from "@/src/audio";
import type { EmitParams } from "@/src/audio/types";

export type GameplayAudioEmit = (id: AudioEventId, params?: EmitParams) => unknown;

const defaultEmit: GameplayAudioEmit = (id, params) => audio.emit(id, params);

/** Downward speed (world px/s) below which touching ground again is not a "landing" (spawn settle, edge flicker). */
export const MIN_LAND_SPEED = 150;
/** Downward speed at/above which the landing is the hard variant (about a 130 px drop; an ordinary jump lands at ~520). */
export const HARD_LAND_SPEED = 650;
/** The walk cycle has 8 keyframes; the feet meet the ground on frames 0 and 4 (two steps per cycle). */
const WALK_FRAMES = 8;
const STEP_FRAME_EVERY = WALK_FRAMES / 2;

export type OutcomeCause = "hazard" | "abyss" | "goal";

/** Sound id for the cause of a REAL reported outcome (contact alone never reaches this). */
export function outcomeSoundFor(cause: OutcomeCause): AudioEventId {
  if (cause === "hazard") return "hazard.hit";
  if (cause === "abyss") return "fall.abyss";
  return "goal.reach";
}

/** `WALK_3` -> 3; anything else -> null. */
export function walkFrameIndex(frameId: string): number | null {
  if (!frameId.startsWith("WALK_")) return null;
  const n = Number(frameId.slice(5));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export interface GameplayAudioSample {
  readonly grounded: boolean;
  /** Vertical velocity, world px/s, positive = down (KAPLAY). */
  readonly vy: number;
  /** The animation bridge's current keyframe id. */
  readonly frameId: string;
}

/**
 * Footsteps (walk-frame contact edge while grounded) and landings (grounded edge after a real fall,
 * soft or hard by the downward speed just before touchdown). Call `step` once per fixed step while
 * the Thinman is live; call `reset` whenever the body is re-created or frozen.
 */
export class GameplayAudioObserver {
  private wasGrounded: boolean | null = null;
  private fallSpeed = 0;
  private lastWalkFrame = -1;

  constructor(private readonly emit: GameplayAudioEmit = defaultEmit) {}

  reset(): void {
    this.wasGrounded = null;
    this.fallSpeed = 0;
    this.lastWalkFrame = -1;
  }

  step(s: GameplayAudioSample): void {
    if (this.wasGrounded === null) {
      // First sample after a reset is only a baseline: the body spawning onto the floor is not a landing.
      this.wasGrounded = s.grounded;
      this.fallSpeed = 0;
      return;
    }

    if (!s.grounded) {
      if (Number.isFinite(s.vy)) this.fallSpeed = Math.max(this.fallSpeed, s.vy);
      this.lastWalkFrame = -1;
    } else if (!this.wasGrounded) {
      const speed = this.fallSpeed;
      this.fallSpeed = 0;
      if (speed >= MIN_LAND_SPEED) this.emit("thinman.land", { variant: speed >= HARD_LAND_SPEED ? 1 : 0 });
    }
    this.wasGrounded = s.grounded;

    const frame = s.grounded ? walkFrameIndex(s.frameId) : null;
    if (frame === null) {
      this.lastWalkFrame = -1;
      return;
    }
    if (frame !== this.lastWalkFrame) {
      this.lastWalkFrame = frame;
      if (frame % STEP_FRAME_EVERY === 0) this.emit("thinman.step");
    }
  }
}

/**
 * Distance-based footstep pacing for walkers that have no physics frame (the ending walker): one
 * step per `stepDistance` travelled, at most one per call, nothing while standing still.
 */
export class DistanceStepper {
  private travelled = 0;

  constructor(private readonly stepDistance: number) {}

  reset(): void {
    this.travelled = 0;
  }

  /** Feed the distance moved since the last call; returns true when a footstep is due. */
  advance(distance: number): boolean {
    if (!Number.isFinite(distance) || distance <= 0) return false;
    this.travelled += distance;
    if (this.travelled < this.stepDistance) return false;
    this.travelled %= this.stepDistance;
    return true;
  }
}

/** Soft sound for an edge-detected refusal: fires on the first refused move of a streak, then needs a free move and `minGapMs`. */
export function createRefusalEdge(minGapMs: number): (refused: boolean, nowMs: number) => boolean {
  let wasRefused = false;
  let lastAt = Number.NEGATIVE_INFINITY;
  return (refused, nowMs) => {
    const fire = refused && !wasRefused && nowMs - lastAt >= minGapMs;
    if (fire) lastAt = nowMs;
    wasRefused = refused;
    return fire;
  };
}
