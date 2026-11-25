/**
 * Pure horizontal movement rule shared by physics and the character animation.
 */
import { WALK_SPEED } from "./constants";

/** Resolved horizontal velocity for the current input; zero outside live gameplay or once settled. */
export function resolveHorizontalMovementIntent(
  input: { left: boolean; right: boolean; speed?: number },
  gameplay: boolean,
  settled: boolean,
): number {
  return gameplay && !settled
    ? (Number(Boolean(input.right)) - Number(Boolean(input.left))) * WALK_SPEED * Math.max(0, Math.min(1, input.speed ?? 1))
    : 0;
}
