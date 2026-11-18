/**
 * PRD 0.0.16 R13 — app-wide input mode.
 *
 * "camera" (default) = full NUI: no buttons, the ring fills only from a real thumbs-up.
 * "fallback" = the camera cannot be used (missing, denied, MediaPipe failed): hold-able buttons appear.
 * A live shared stream clears a camera failure, so the buttons disappear again when the camera returns.
 * Framework-free store so drivers and React (useInputMode) read the same value.
 *
 * A camera failure is remembered for this tab (sessionStorage), so a refresh on a canvas route does not bring the camera
 * mode back while no camera is running. It is restored on the first subscription (a hook's effect, after hydration),
 * never while rendering, so the server and first client render still agree. A live stream clears it again.
 */
import { subscribeSharedStream } from "../camera/shared-stream";

export type InputMode = "camera" | "fallback";
export type InputModeListener = (mode: InputMode) => void;

const FALLBACK_STORAGE_KEY = "skb-input-mode-fallback";

let cameraFailed = false;
let trackerFailed = false;
let forced: InputMode | null = null;
let hasStream = false;
let wired = false;
const listeners = new Set<InputModeListener>();

export function getInputMode(): InputMode {
  if (forced) return forced;
  return cameraFailed || trackerFailed ? "fallback" : "camera";
}

function readStoredFallback(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(FALLBACK_STORAGE_KEY) === "1";
  } catch {
    // Blocked or private storage: the mode simply starts from the camera again.
    return false;
  }
}

function writeStoredFallback(on: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (on) window.sessionStorage.setItem(FALLBACK_STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(FALLBACK_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing is remembered, which is the old behaviour.
  }
}

function emit(): void {
  writeStoredFallback(cameraFailed || trackerFailed);
  const mode = getInputMode();
  for (const l of [...listeners]) l(mode);
}

function wire(): void {
  if (wired) return;
  wired = true;
  if (readStoredFallback()) cameraFailed = true;
  subscribeSharedStream((stream) => {
    const next = stream !== null;
    if (next === hasStream) return;
    hasStream = next;
    if (next && cameraFailed) {
      cameraFailed = false;
      emit();
    }
  });
}

/** GlobalCamera calls this when getUserMedia fails or the camera is unavailable/denied. */
export function reportCameraUnavailable(): void {
  if (cameraFailed) return;
  cameraFailed = true;
  emit();
}

/** Camera usable again (also implied by a new shared stream). */
export function reportCameraAvailable(): void {
  if (!cameraFailed && !trackerFailed) return;
  cameraFailed = false;
  trackerFailed = false;
  emit();
}

/** Hand tracker (MediaPipe) could not load or crashed: buttons are the only way forward. */
export function reportTrackerFailed(failed = true): void {
  if (trackerFailed === failed) return;
  trackerFailed = failed;
  emit();
}

/** Dev/e2e override (null clears). Callers gate this behind NEXT_PUBLIC_TEST_HOOKS. */
export function forceInputMode(mode: InputMode | null): void {
  forced = mode;
  emit();
}

export function subscribeInputMode(listener: InputModeListener): () => void {
  wire();
  listeners.add(listener);
  listener(getInputMode());
  return () => {
    listeners.delete(listener);
  };
}

/** TEST ONLY. */
export function resetInputModeForTest(): void {
  writeStoredFallback(false);
  cameraFailed = false;
  trackerFailed = false;
  forced = null;
  hasStream = false;
  wired = false;
  listeners.clear();
}
