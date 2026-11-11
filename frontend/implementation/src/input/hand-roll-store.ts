/**
 * The roll of the stage's own hand reader, in degrees (see hand-rotation.ts), or null while no hand is in view.
 * The gameplay driver publishes it every frame; the object-turn control listens only while it is turning. Framework-
 * free, like hand-cursor-store: the driver publishes without rendering, and listeners hear only a real change.
 */

/** A change smaller than this (degrees) is jitter; listeners are not told about it. */
export const ROLL_EPSILON_DEG = 0.5;

type Listener = (roll: number | null) => void;

let current: number | null = null;
const listeners = new Set<Listener>();

export function publishHandRoll(roll: number | null): void {
  const same =
    roll === null || current === null ? roll === current : Math.abs(roll - current) < ROLL_EPSILON_DEG;
  if (same) return;
  current = roll;
  for (const listener of [...listeners]) listener(roll);
}

/** Tells the listener the current roll at once, then each real change. Returns the unsubscribe function. */
export function subscribeHandRoll(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function resetHandRollForTest(): void {
  current = null;
  listeners.clear();
}
