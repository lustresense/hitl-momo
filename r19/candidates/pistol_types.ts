/**
 * Standalone R19 geometry and virtual-key primitive types matching `main@c14b1d0502`
 * (`src/input/types.ts`, `src/input/hand-gesture.ts`, `src/input/gameplay-gesture.ts`).
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export type FingerState = "extended" | "curled" | "between";

export type SteerZone = "walk-right" | "walk-left" | "jump" | "jump-right" | "jump-left" | "stop";

export interface DirectionInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export const DEFAULT_LAB_ASPECT = 16 / 9;
export const STEER_WALK_DEG = 30;
export const STEER_JUMP_STRAIGHT_MIN_DEG = 75;
export const STEER_JUMP_STRAIGHT_MAX_DEG = 105;
export const STEER_JUMP_DIAGONAL_MIN_DEG = 45;
export const STEER_JUMP_DIAGONAL_MAX_DEG = 135;
export const STEER_HYSTERESIS_DEG = 5;

const NO_INPUT: DirectionInput = { left: false, right: false, jump: false };

export function withAspect(landmarks: Landmark[], aspect: number): Landmark[] {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect === 1) return landmarks;
  return landmarks.map((p) => (p ? { x: p.x * aspect, y: p.y, z: p.z } : p));
}

/** Legacy R17 knuckle-line thumb projection (`0 = pinky MCP`, `1 = index MCP`, `>1.3 = open`). */
export function thumbLateral(lm: Landmark[]): number | null {
  const tip = lm[4];
  const index = lm[5];
  const pinky = lm[17];
  if (!tip || !index || !pinky) return null;
  const ax = index.x - pinky.x;
  const ay = index.y - pinky.y;
  const len2 = ax * ax + ay * ay;
  if (len2 <= 1e-12) return null;
  return ((tip.x - pinky.x) * ax + (tip.y - pinky.y) * ay) / len2;
}

export function steerInput(zone: SteerZone): DirectionInput {
  switch (zone) {
    case "walk-right":
      return { left: false, right: true, jump: false };
    case "walk-left":
      return { left: true, right: false, jump: false };
    case "jump":
      return { left: false, right: false, jump: true };
    case "jump-right":
      return { left: false, right: true, jump: true };
    case "jump-left":
      return { left: true, right: false, jump: true };
    case "stop":
      return { ...NO_INPUT };
  }
}
