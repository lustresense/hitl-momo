/**
 * Pure horizontal movement rule shared by physics and the character animation.
 */
import { WALK_SPEED } from "./constants";

/** Resolved horizontal velocity for the current input; zero outside live gameplay or once settled. */
export function resolveHorizontalMovementIntent(
  input: { left: boolean; right: boolean; axis?: number },
  gameplay: boolean,
  settled: boolean,
): number {
  if (!gameplay || settled) return 0;
  if (typeof input.axis === "number" && Number.isFinite(input.axis)) {
    const clamped = Math.max(-1, Math.min(1, input.axis));
    return clamped === 0 ? 0 : clamped * WALK_SPEED;
  }
  return (Number(Boolean(input.right)) - Number(Boolean(input.left))) * WALK_SPEED;
}
