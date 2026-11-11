/**
 * Live finger angle for the steering dial. The hand reader publishes it on every frame and the
 * dial reads it, so GameStage does not need new props. Subscribers are told only when the
 * whole-degree value changes: a 30 fps reader must not re-render the bar on every frame.
 */
import { useSyncExternalStore } from "react";

let current: number | null = null;
const listeners = new Set<() => void>();

/** `null` = no finger direction (no hand, or the finger has none). */
export function publishSteerAngle(angle: number | null): void {
  const next = angle === null || !Number.isFinite(angle) ? null : Math.round(angle);
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function getSteerAngle(): number | null {
  return current;
}

export function subscribeSteerAngle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSteerAngle(): number | null {
  return useSyncExternalStore(subscribeSteerAngle, getSteerAngle, getSteerAngle);
}

/** Tests only: clears the reading between cases. */
export function resetSteerAngleForTest(): void {
  current = null;
}
