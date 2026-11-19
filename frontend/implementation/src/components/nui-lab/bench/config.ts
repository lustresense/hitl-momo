/**
 * Shared reactive NUI Lab benchmark configuration (engineId, preprocess, detector).
 * Persists in sessionStorage across client-side route transitions (/nui-lab <-> /gesture <-> /canvas).
 *
 * Defaults:
 *  - engineId: "r19-c0" (baseline) until the tester picks R20 C4 or R20 C7 (keeps all existing R19 tests intact while
 *    making R20 C4 / R20 C7 / R19 C0 one click away on every NUI Lab page).
 *  - detector: "cpu-worker" when Worker + createImageBitmap are available (real browsers), else "cpu-main-thread" (jsdom).
 *  - preprocess: "a4" (adaptive low-light recovery).
 */
import { isEngineId, isPreprocessMode } from "./engines";
import type { DetectorVariant, EngineId, PreprocessMode } from "./schema";

const STORAGE_KEY = "nui-lab-bench-config/1";

export interface LabBenchConfig {
  engineId: EngineId;
  preprocess: PreprocessMode;
  detector: DetectorVariant;
}

export function canUseCpuWorker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}

function defaultConfig(): LabBenchConfig {
  return {
    engineId: "r19-c0",
    preprocess: "a4",
    detector: canUseCpuWorker() ? "cpu-worker" : "cpu-main-thread",
  };
}

function readPersisted(): LabBenchConfig {
  const base = defaultConfig();
  if (typeof sessionStorage === "undefined") return base;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<LabBenchConfig>;
    return {
      engineId: isEngineId(parsed.engineId) ? parsed.engineId : base.engineId,
      preprocess: isPreprocessMode(parsed.preprocess) ? parsed.preprocess : base.preprocess,
      detector:
        parsed.detector === "cpu-worker" && canUseCpuWorker()
          ? "cpu-worker"
          : parsed.detector === "cpu-main-thread"
            ? "cpu-main-thread"
            : base.detector,
    };
  } catch {
    return base;
  }
}

class LabBenchConfigStore {
  private state: LabBenchConfig = defaultConfig();
  private hydrated = false;
  private listeners = new Set<() => void>();

  hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    this.state = readPersisted();
    this.emit();
  }

  getSnapshot = (): LabBenchConfig => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  update(patch: Partial<LabBenchConfig>): void {
    this.hydrated = true;
    const next: LabBenchConfig = {
      engineId: patch.engineId && isEngineId(patch.engineId) ? patch.engineId : this.state.engineId,
      preprocess: patch.preprocess && isPreprocessMode(patch.preprocess) ? patch.preprocess : this.state.preprocess,
      detector:
        patch.detector === "cpu-worker"
          ? canUseCpuWorker()
            ? "cpu-worker"
            : "cpu-main-thread"
          : patch.detector === "cpu-main-thread"
            ? "cpu-main-thread"
            : this.state.detector,
    };
    if (
      next.engineId === this.state.engineId &&
      next.preprocess === this.state.preprocess &&
      next.detector === this.state.detector
    ) {
      return;
    }
    this.state = next;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      /* ignore quota / private mode */
    }
    this.emit();
  }

  resetForTest(initial?: Partial<LabBenchConfig>): void {
    this.hydrated = true;
    this.state = { ...defaultConfig(), ...initial };
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.emit();
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}

let cfgSingleton: LabBenchConfigStore | null = null;
export function getLabBenchConfig(): LabBenchConfigStore {
  cfgSingleton ??= new LabBenchConfigStore();
  return cfgSingleton;
}
