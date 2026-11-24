/**
 * Shared reactive NUI Lab benchmark configuration (engineId, preprocess, detector) and persisted one-time numeric
 * telemetry consent (Contract K8 / B01).
 *
 * Config persists in sessionStorage across client-side route transitions (/nui-lab <-> /gesture <-> /canvas).
 * Consent persists in localStorage (`nui-lab-bench-consent/1`) once granted so the Owner never has to re-consent
 * or click "Mulai Sesi Benchmark" on every route or reload.
 *
 * Defaults:
 *  - engineId: DEFAULT_ENGINE_ID ("r20-c4") behind the automatic runtime badge ("NUI R22 · CPU · Otomatis").
 *  - detector: "cpu-worker" when Worker + createImageBitmap are available (real browsers), else "cpu-main-thread" (jsdom).
 *  - preprocess: DEFAULT_PREPROCESS ("raw" per Owner decision; A4/R22 retained as candidates pending physical low-light tests).
 *  - numHands: default "fixed-2", with hidden URL override `?hands=1` -> "fixed-1" (zero UI selector).
 */
import {
  DEFAULT_ENGINE_ID,
  DEFAULT_PREPROCESS,
  isEngineId,
  isPreprocessMode,
} from "./engines";
import type { DetectorVariant, EngineId, PreprocessMode } from "./schema";

const STORAGE_KEY = "nui-lab-bench-config/1";
export const BENCH_CONSENT_STORAGE_KEY = "nui-lab-bench-consent/1";

export interface PersistedBenchConsent {
  numericRecording: true;
  videoOrImages: false;
  upload: false;
  version: "bench-consent/1";
  grantedAtMinuteIso: string;
}

function browserConsentStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const ls = window.localStorage;
    if (ls && typeof ls.getItem === "function" && typeof ls.setItem === "function") {
      // Probe writeability (handles Safari private mode or Node 26 --localstorage-file-less jsdom)
      const probeKey = "__nui_bench_probe__";
      ls.setItem(probeKey, "1");
      ls.removeItem(probeKey);
      return ls;
    }
  } catch {
    /* fallback below */
  }
  try {
    const ss = window.sessionStorage;
    if (ss && typeof ss.getItem === "function" && typeof ss.setItem === "function") {
      return ss;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readPersistedBenchConsent(): boolean {
  const storage = browserConsentStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(BENCH_CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PersistedBenchConsent>;
    return (
      parsed.numericRecording === true &&
      parsed.videoOrImages === false &&
      parsed.upload === false &&
      parsed.version === "bench-consent/1"
    );
  } catch {
    return false;
  }
}

export function writePersistedBenchConsent(
  granted: boolean,
  grantedAtMinuteIso = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(),
): void {
  const storage = browserConsentStorage();
  if (!storage) return;
  try {
    if (!granted) {
      storage.removeItem(BENCH_CONSENT_STORAGE_KEY);
      return;
    }
    const payload: PersistedBenchConsent = {
      numericRecording: true,
      videoOrImages: false,
      upload: false,
      version: "bench-consent/1",
      grantedAtMinuteIso,
    };
    storage.setItem(BENCH_CONSENT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore private mode / quota errors */
  }
}

export interface LabBenchConfig {
  engineId: EngineId;
  preprocess: PreprocessMode;
  detector: DetectorVariant;
}

export interface NumHandsUrlOverride {
  numHandsPolicy: "fixed-2" | "fixed-1";
  fixedNumHands: 1 | 2;
  numHandsOverride: string | null;
}

export const DEFAULT_MIN_DETECTION_CONFIDENCE = 0.6;
export const DEFAULT_MIN_PRESENCE_CONFIDENCE = 0.45;
export const DEFAULT_MIN_TRACKING_CONFIDENCE = 0.45;

export interface DetectorConfidenceUrlOverride {
  minDetectionConfidence: number;
  minPresenceConfidence: number;
  minTrackingConfidence: number;
  confidenceOverride: string | null;
}

export interface LabDevUrlFlags {
  captureMode: boolean;
  rawRecMode: boolean;
  camDevMode: boolean;
}

function getSearchString(search?: string): string {
  if (search !== undefined) return search;
  if (typeof window !== "undefined" && typeof window.location?.search === "string") {
    return window.location.search;
  }
  return "";
}

function parseConfidenceParam(params: URLSearchParams, key: string, fallback: number): { val: number; changed: boolean } {
  const raw = params.get(key)?.trim();
  if (!raw) return { val: fallback, changed: false };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { val: fallback, changed: false };
  const clamped = Math.round(Math.max(0.2, Math.min(0.9, n)) * 1000) / 1000;
  return { val: clamped, changed: true };
}

/**
 * R22B B4.1: Hidden URL confidence parameters `?mdc=&mpc=&mtc=` (clamped to [0.2, 0.9]).
 * Applied ONLY when HandLandmarker is created (0 runtime `setOptions` calls).
 */
export function parseDetectorConfidenceUrlOverride(search?: string): DetectorConfidenceUrlOverride {
  const raw = getSearchString(search);
  let mdc = DEFAULT_MIN_DETECTION_CONFIDENCE;
  let mpc = DEFAULT_MIN_PRESENCE_CONFIDENCE;
  let mtc = DEFAULT_MIN_TRACKING_CONFIDENCE;
  const parts: string[] = [];
  if (raw) {
    try {
      const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
      const pMdc = parseConfidenceParam(params, "mdc", DEFAULT_MIN_DETECTION_CONFIDENCE);
      const pMpc = parseConfidenceParam(params, "mpc", DEFAULT_MIN_PRESENCE_CONFIDENCE);
      const pMtc = parseConfidenceParam(params, "mtc", DEFAULT_MIN_TRACKING_CONFIDENCE);
      mdc = pMdc.val;
      mpc = pMpc.val;
      mtc = pMtc.val;
      if (pMdc.changed) parts.push(`mdc=${mdc}`);
      if (pMpc.changed) parts.push(`mpc=${mpc}`);
      if (pMtc.changed) parts.push(`mtc=${mtc}`);
    } catch {
      /* ignore malformed query strings */
    }
  }
  return {
    minDetectionConfidence: mdc,
    minPresenceConfidence: mpc,
    minTrackingConfidence: mtc,
    confidenceOverride: parts.length > 0 ? `url:?${parts.join("&")}` : null,
  };
}

/** R22B developer/owner URL flags: `?capture=1`, `?rawrec=1`, `?camdev=1` (all default OFF). */
export function parseLabDevUrlFlags(search?: string): LabDevUrlFlags {
  const raw = getSearchString(search);
  if (!raw) return { captureMode: false, rawRecMode: false, camDevMode: false };
  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return {
      captureMode: params.get("capture")?.trim() === "1",
      rawRecMode: params.get("rawrec")?.trim() === "1",
      camDevMode: params.get("camdev")?.trim() === "1",
    };
  } catch {
    return { captureMode: false, rawRecMode: false, camDevMode: false };
  }
}

/**
 * Hidden URL override `?hands=1` for Owner CPU-throughput testing (no UI selector).
 * Default is always `fixed-2` (`numHands=2`, `numHandsOverride: null`).
 */
export function parseNumHandsUrlOverride(search?: string): NumHandsUrlOverride {
  const raw = getSearchString(search);
  if (raw) {
    try {
      const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
      if (params.get("hands")?.trim() === "1") {
        return {
          numHandsPolicy: "fixed-1",
          fixedNumHands: 1,
          numHandsOverride: "url:?hands=1",
        };
      }
    } catch {
      /* ignore malformed query strings */
    }
  }
  return {
    numHandsPolicy: "fixed-2",
    fixedNumHands: 2,
    numHandsOverride: null,
  };
}

/**
 * URL override `?yolo=0` to disable MoNUI-7 YOLO rescue completely (default true / enabled).
 */
export function parseYoloUrlOverride(search?: string): boolean {
  const raw = getSearchString(search);
  if (!raw) return true;
  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    if (params.get("yolo")?.trim() === "0") {
      return false;
    }
  } catch {
    /* ignore malformed query strings */
  }
  return true;
}

export function canUseCpuWorker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}

/**
 * Deterministic SSR / hydration snapshot so static HTML (`next build`) and initial client hydration
 * never diverge on `canUseCpuWorker()` (fixes React hydration errors #425/#418/#423 on `/nui-lab`).
 */
export const SSR_DEFAULT_BENCH_CONFIG: Readonly<LabBenchConfig> = Object.freeze({
  engineId: DEFAULT_ENGINE_ID,
  preprocess: DEFAULT_PREPROCESS,
  detector: "cpu-worker",
});

function defaultConfig(): LabBenchConfig {
  return {
    engineId: DEFAULT_ENGINE_ID,
    preprocess: DEFAULT_PREPROCESS,
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

  getServerSnapshot = (): LabBenchConfig => SSR_DEFAULT_BENCH_CONFIG;

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
