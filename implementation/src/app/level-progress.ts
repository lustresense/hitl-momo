/**
 * Level unlock / completion progress, persisted in the browser's localStorage.
 * Every access is guarded: storage may be blocked (private window, SSR) and progress must stay usable.
 */
const COMPLETED_STAGES_KEY = "sketchbook.completedStages";

function readCompletedStages(): number[] {
  return JSON.parse(window.localStorage.getItem(COMPLETED_STAGES_KEY) ?? "[]") as number[];
}

/** Dev hosts (dev.*, localhost, 127.0.0.1) open every stage so QA can reach them directly. */
function isDevHost(): boolean {
  const host = window.location.hostname;
  return host.includes("dev") || host.includes("localhost") || host === "127.0.0.1";
}

export function isLevelUnlocked(stage: number): boolean {
  if (stage <= 1) return true;
  try {
    if (typeof window !== "undefined" && isDevHost()) return true;
    return readCompletedStages().includes(stage - 1);
  } catch {
    return false;
  }
}

export function recordCompletedStage(stage: number): void {
  try {
    const completed = readCompletedStages();
    if (!completed.includes(stage)) {
      window.localStorage.setItem(COMPLETED_STAGES_KEY, JSON.stringify([...completed, stage]));
    }
  } catch {
    // Keep completion usable if browser storage is unavailable.
  }
}
