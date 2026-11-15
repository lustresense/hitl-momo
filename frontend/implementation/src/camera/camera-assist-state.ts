/**
 * One small UI-only signal for camera recovery.
 * No webcam access, no MediaPipe reader, no timers, no duplicate Momo instance.
 * The existing page Momo can react without replacing her story/confirmation callbacks.
 */
export type CameraAssistState = "idle" | "failed" | "ready";
let current: CameraAssistState = "idle";
const listeners = new Set<(state: CameraAssistState) => void>();

export function getCameraAssistState(): CameraAssistState {
  return current;
}

export function publishCameraAssistState(next: CameraAssistState): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(current);
}

export function subscribeCameraAssistState(listener: (state: CameraAssistState) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}

/** Unit tests can reset between independent components. */
export function resetCameraAssistStateForTest(): void {
  current = "idle";
  listeners.clear();
}
