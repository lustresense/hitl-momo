/**
 * BenchSessionManager — ONE module-level singleton shared by /nui-lab, /nui-lab/gesture, /nui-lab/canvas and
 * /nui-lab/diagnostics (client-side navigation keeps the module alive, so trial history survives route changes; a reload
 * recovers it from IndexedDB and flags the old session as interrupted without merging or double-counting).
 *
 * R22 Zero-Friction Automatic Lifecycle (B01–B04, B06, E03):
 *  - Nothing is recorded before explicit numeric telemetry consent (`grantConsent()` or `startSession({ consent: true })`).
 *  - Once consent is granted (persisted in localStorage), `startCameraTrialAuto(ctx)` automatically starts a session
 *    (if none active) and opens a trial when the camera turns on — no manual "Mulai Benchmark", scenario, or GT needed!
 *  - Route switches, tab hidden (`visibilitychange`), `pagehide`, camera stop, and worker errors automatically close
 *    the active trial with explicit `endReason` so off-tab / off-camera time never pollutes active detection windows.
 */
import {
  DEFAULT_MIN_DETECTION_CONFIDENCE,
  DEFAULT_MIN_PRESENCE_CONFIDENCE,
  DEFAULT_MIN_TRACKING_CONFIDENCE,
  readPersistedBenchConsent,
  writePersistedBenchConsent,
} from "./config";
import type { ReacquirePinchPolicy } from "./presets";
import { DEFAULT_PREPROCESS, PREPROCESS_CANDIDATES } from "./engines";
import { YOLO_MODEL_SHA256 } from "./monui7-yolo";
import { collectNonIdentifyingEnvironment, getAppBuildInfo } from "./env";
import { analyzeBundle, buildExportBlob, buildSummaryCsv, readBundle } from "./export";
import { deriveConditionTags, TrialAggregator } from "./stats";
import { openBenchStore, type BenchStore } from "./store";
import { ChunkWriter } from "./writer";
import {
  BENCH_SESSION_SCHEMA,
  type BenchEvent,
  type BenchFrame,
  type BenchFrameInput,
  type BenchRoute,
  type BenchSource,
  type CameraProfile,
  type EngineConfig,
  type EventType,
  type LabelSource,
  type LandmarkHealth,
  type PerfSample,
  type Scenario,
  type SessionMeta,
  type SessionStatus,
  type TrackingState,
  type TrialMeta,
  type TrialSummary,
  type TruthLabel,
} from "./schema";

export interface TrialContext {
  route: BenchRoute;
  source: BenchSource;
  engine: EngineConfig;
  camera: CameraProfile;
  numHandsActive?: 1 | 2;
  numHandsOverride?: string | null;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
  confidenceOverride?: string | null;
  presetId?: string;
  reacquirePinchPolicy?: ReacquirePinchPolicy;
  captureMeta?: TrialMeta["captureMeta"];
  rawRecMeta?: TrialMeta["rawRecMeta"];
  initSetOptionsCalls?: number;
}

export interface TrialRow {
  trialId: string;
  index: number;
  route: BenchRoute;
  source: BenchSource;
  engineId: string;
  engineShort: string;
  preprocess: string;
  detector: string;
  scenario: Scenario;
  endReason: string | null;
  open: boolean;
  summary: TrialSummary;
}

export interface BenchState {
  ready: boolean;
  consentGranted: boolean;
  phase: "idle" | "active" | "finished";
  sessionId: string | null;
  status: SessionStatus | null;
  storage: "indexeddb" | "memory-only" | "unknown";
  scenario: Scenario;
  scenarioNote: string;
  truth: TruthLabel;
  currentTrialId: string | null;
  trialCount: number;
  trials: TrialRow[];
  counters: { frames: number; events: number; perf: number };
  hiddenDurationMs: number;
  droppedRecords: number;
  storageFailures: number;
  storageQueue: number;
  warnings: string[];
  perfLatest: PerfSample | null;
  /** Sessions found in IndexedDB from earlier page loads (stored data the user can still export or delete). */
  previousSessions: Array<{
    sessionId: string;
    status: SessionStatus;
    statusReason: string | null;
    trialCount: number;
    createdAtMinuteIso: string;
  }>;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
  lastError: string | null;
}

const EMPTY_SUMMARY = (id: string): TrialSummary => new TrialAggregator(id).summary();

/** Deterministic SSR/hydration snapshot so client reload with persisted consent never triggers React hydration errors. */
const SSR_BENCH_STATE: BenchState = Object.freeze({
  ready: false,
  consentGranted: false,
  phase: "idle",
  sessionId: null,
  status: null,
  storage: "unknown",
  scenario: "UNSPECIFIED",
  scenarioNote: "",
  truth: "UNLABELLED",
  currentTrialId: null,
  trialCount: 0,
  trials: [],
  counters: { frames: 0, events: 0, perf: 0 },
  hiddenDurationMs: 0,
  droppedRecords: 0,
  storageFailures: 0,
  storageQueue: 0,
  warnings: [],
  perfLatest: null,
  previousSessions: [],
  storageUsageBytes: null,
  storageQuotaBytes: null,
  lastError: null,
});

export interface ManagerDeps {
  openStore?: () => Promise<BenchStore>;
  now?: () => number;
  wallMinuteIso?: () => string;
  randomId?: () => string;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
  heartbeatStaleMs?: number;
  initialConsent?: boolean;
}

const defaultRandomId = (): string => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 8);
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
};
const defaultWallMinuteIso = (): string => new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();

const ACTIVE_TAB_SESSION_KEY = "nui-lab-active-session-id/1";

function readTabActiveSessionId(): string | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(ACTIVE_TAB_SESSION_KEY) : null;
  } catch {
    return null;
  }
}

function writeTabActiveSessionId(id: string | null): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (id) sessionStorage.setItem(ACTIVE_TAB_SESSION_KEY, id);
    else sessionStorage.removeItem(ACTIVE_TAB_SESSION_KEY);
  } catch {
    /* ignore private mode */
  }
}

export function normalizeTrialEndReason(reason: string): string {
  switch (reason) {
    case "route-unmount":
    case "route-switch":
      return "route-switch";
    case "tab-hidden":
    case "browser-hidden":
      return "tab-hidden";
    case "pagehide":
    case "interrupted:pagehide":
      return "pagehide";
    case "stop":
    case "camera-stop":
    case "camera-stopped":
    case "stream-ended":
    case "camera-stream-ended":
    case "camera-reset":
      return "camera-stop";
    case "tracker-error":
    case "worker-error":
    case "detector-error":
      return "worker-error";
    case "finished-by-tester":
    case "session-finish":
    case "user-finish":
      return "user-finish";
    default:
      return reason;
  }
}

function normalizeBenchFrame(frame: Omit<BenchFrameInput, "trialId">, trialId: string, trialMeta: TrialMeta): BenchFrame {
  const hasHand = frame.det === "HAND";
  const lMean = frame.luma.mean;
  const lP10 = frame.lumaP10 ?? frame.luma.p10 ?? null;
  const lP50 = frame.lumaP50 ?? frame.luma.p50 ?? lMean;
  const lP95 = frame.lumaP95 ?? frame.luma.p95 ?? null;
  const nwHand = hasHand ? (frame.nearWhiteHandPct ?? frame.luma.nearWhiteHandPct ?? null) : null;
  const blur = frame.blurProxy ?? frame.luma.blurProxy ?? null;
  const noise = frame.noiseProxy ?? frame.luma.noiseProxy ?? null;
  const backlight = Boolean(frame.backlightCandidate ?? frame.luma.backlight);
  const preprocessPass = frame.preprocessPass ?? frame.luma.pass;
  const captureQualityTags =
    frame.captureQualityTags ??
    deriveConditionTags({
      lumaP50: lP50,
      lumaP95: lP95,
      nearWhiteHandPct: nwHand,
      blurProxy: blur,
      noiseProxy: noise,
      backlight,
    });

  const trackingState: TrackingState =
    frame.trackingState ??
    (hasHand ? (frame.lock === "locked" ? "LOCKED" : "ACQUIRING") : "NO_HAND");
  const missReason =
    frame.missReason !== undefined
      ? frame.missReason
      : hasHand && trackingState !== "AMBIGUOUS_HOLD"
        ? null
        : frame.lock === "ambiguous"
          ? "ambiguous-two-hands"
          : "no-hand";
  const landmarkHealth: LandmarkHealth =
    frame.landmarkHealth ??
    (!hasHand
      ? "MISSING"
      : trackingState === "AMBIGUOUS_HOLD"
        ? "AMBIGUOUS"
        : (frame.frameAgeMs ?? 0) > 150
          ? "STALE"
          : "VALID");

  const posePred =
    frame.posePred ??
    (frame.r19State !== "NO_HAND" ? frame.r19State : frame.stablePose || "NO_HAND");
  const maxProb = frame.r19Probs
    ? Math.max(frame.r19Probs.ready, frame.r19Probs.press, frame.r19Probs.other)
    : null;
  const labelSource: LabelSource =
    frame.labelSource ??
    (hasHand && frame.r19Probs && trialMeta.route !== "canvas" ? "MODEL_PREDICTION" : "RULE_DERIVED");
  const truthSource: LabelSource =
    frame.labelSources?.truth ?? (frame.truth !== "UNLABELLED" ? "USER_ACTION" : "UNKNOWN");

  const actionIntent =
    frame.actionIntent ??
    (frame.action !== "none" ? frame.action.toUpperCase() : "NEUTRAL");
  const actionAccepted = frame.actionAccepted ?? (frame.action !== "none");
  const actionRejectedReason =
    frame.actionRejectedReason !== undefined
      ? frame.actionRejectedReason
      : actionAccepted
        ? null
        : (frame.reject || null);

  return {
    ...frame,
    trialId,
    captureFrameId: frame.captureFrameId ?? frame.fid,
    processedFrameId: frame.processedFrameId ?? frame.fid,
    captureTimestamp: frame.captureTimestamp ?? frame.t,
    displayTimestamp: frame.displayTimestamp ?? frame.t,
    frameAgeMs: frame.frameAgeMs ?? null,
    uniqueCaptureFps: frame.uniqueCaptureFps ?? null,
    framesSkippedDuplicate: frame.framesSkippedDuplicate ?? 0,
    videoFrameWidth: frame.videoFrameWidth ?? trialMeta.camera.width ?? null,
    videoFrameHeight: frame.videoFrameHeight ?? trialMeta.camera.height ?? null,
    cameraReportedFps: frame.cameraReportedFps ?? trialMeta.camera.frameRate ?? null,
    detectHz: frame.detectHz ?? null,
    uiFps: frame.uiFps ?? null,
    captureToActionLatency: frame.captureToActionLatency ?? frame.timing.pipelineMs ?? null,
    numHandsActive: frame.numHandsActive ?? trialMeta.detectorConfig?.numHandsActive ?? 2,
    initSetOptionsCalls: frame.initSetOptionsCalls ?? trialMeta.detectorConfig?.initSetOptionsCalls ?? 0,
    runtimeSetOptionsCalls: frame.runtimeSetOptionsCalls ?? 0,
    lumaP10: lP10,
    lumaP50: lP50,
    lumaP95: lP95,
    nearWhiteHandPct: nwHand,
    blurProxy: blur,
    noiseProxy: noise,
    backlightCandidate: backlight,
    preprocessPass,
    captureQualityTags,
    ownerTrackId: frame.ownerTrackId !== undefined ? frame.ownerTrackId : (frame.lock === "locked" ? frame.session : null),
    trackingState,
    missReason,
    landmarkHealth,
    posePred,
    predictionConfidence: frame.predictionConfidence !== undefined ? frame.predictionConfidence : (labelSource === "MODEL_PREDICTION" ? maxProb : null),
    gestureTransition: frame.gestureTransition ?? null,
    actionIntent,
    actionAccepted,
    actionRejectedReason,
    strokeId: frame.strokeId ?? null,
    pointCount: frame.pointCount ?? null,
    drawPathError: frame.drawPathError ?? null,
    gapReason: frame.gapReason ?? null,
    endReason: frame.endReason ?? null,
    labelSource,
    labelSources: frame.labelSources ?? {
      truth: truthSource,
      posePred: hasHand && frame.r19Probs && trialMeta.route !== "canvas" ? "MODEL_PREDICTION" : "RULE_DERIVED",
      actionIntent: "RULE_DERIVED",
      captureQuality: "RULE_DERIVED",
    },
    ...(frame.mpRawHandCount !== undefined ? { mpRawHandCount: frame.mpRawHandCount } : {}),
    ...(frame.mpHandednessScores !== undefined ? { mpHandednessScores: frame.mpHandednessScores } : {}),
    ...(frame.pinchGate !== undefined ? { pinchGate: frame.pinchGate } : {}),
    ...(frame.handState !== undefined ? { handState: frame.handState } : {}),
    ...(frame.clippedPct !== undefined ? { clippedPct: frame.clippedPct } : {}),
    ...(frame.handRoiLumaP50 !== undefined ? { handRoiLumaP50: frame.handRoiLumaP50 } : {}),
    ...(frame.lastRoiLumaP50 !== undefined ? { lastRoiLumaP50: frame.lastRoiLumaP50 } : {}),
    ...(frame.truthMasked !== undefined ? { truthMasked: frame.truthMasked } : {}),
    ...(frame.labelProvenance !== undefined ? { labelProvenance: frame.labelProvenance } : {}),
    ...(frame.captureStep !== undefined ? { captureStep: frame.captureStep } : {}),
    ...(frame.variation !== undefined ? { variation: frame.variation } : {}),
    ...(frame.lighting !== undefined ? { lighting: frame.lighting } : {}),
    ...(frame.subjectCode !== undefined ? { subjectCode: frame.subjectCode } : {}),
  };
}

export class BenchSessionManager {
  private store: BenchStore | null = null;
  private writer: ChunkWriter | null = null;
  private meta: SessionMeta | null = null;
  private startPerf = 0;
  private trialIndex = 0;
  private trialMeta: TrialMeta | null = null;
  private agg: TrialAggregator | null = null;
  private ctx: TrialContext | null = null;
  private suspendedCtx: TrialContext | null = null;
  private hiddenStartPerf: number | null = null;
  private hiddenDurationMs = 0;
  private trialRows = new Map<string, TrialRow>();
  private scenario: Scenario = "UNSPECIFIED";
  private scenarioNote = "";
  private truth: TruthLabel = "UNLABELLED";
  private counters = { frames: 0, events: 0, perf: 0 };
  private perfLatest: PerfSample | null = null;
  private warnings: string[] = [];
  private listeners = new Set<() => void>();
  private snapshot: BenchState;
  private notifyAt = 0;
  private notifyTimer: unknown = null;
  private hbTimer: unknown = null;
  private previous: BenchState["previousSessions"] = [];
  private lastError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private autoStartInFlight: Promise<{ started: boolean; sessionId: string | null; trialId: string | null; reason: string }> | null = null;
  private usage: { usageBytes: number | null; quotaBytes: number | null } = { usageBytes: null, quotaBytes: null };
  private lastUsageCheck = 0;
  private finishedSessionId: string | null = null;
  private consentGranted: boolean;
  private readonly deps: Required<Omit<ManagerDeps, "heartbeatStaleMs" | "initialConsent">> & { heartbeatStaleMs: number };

  constructor(deps: ManagerDeps = {}) {
    this.deps = {
      openStore: deps.openStore ?? openBenchStore,
      now: deps.now ?? (() => performance.now()),
      wallMinuteIso: deps.wallMinuteIso ?? defaultWallMinuteIso,
      randomId: deps.randomId ?? defaultRandomId,
      setInterval: deps.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
      clearInterval: deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>)),
      heartbeatStaleMs: deps.heartbeatStaleMs ?? 8000,
    };
    this.consentGranted = deps.initialConsent ?? readPersistedBenchConsent();
    this.snapshot = this.compute();
  }

  // ----------------------------------------------------------------- React plumbing
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = (): BenchState => this.snapshot;
  getServerSnapshot = (): BenchState => SSR_BENCH_STATE;

  private notify(force = false): void {
    const now = this.deps.now();
    if (!force && now - this.notifyAt < 250) {
      if (this.notifyTimer === null) {
        this.notifyTimer = setTimeout(() => {
          this.notifyTimer = null;
          this.notify(true);
        }, 250);
      }
      return;
    }
    this.notifyAt = now;
    this.snapshot = this.compute();
    for (const l of [...this.listeners]) l();
  }

  private compute(): BenchState {
    const w = this.writer?.stats();
    const dropped = w ? w.dropped.frames + w.dropped.events + w.dropped.perf : 0;
    const rows: TrialRow[] = [...this.trialRows.values()].map((r) => ({
      ...r,
      summary: r.open && this.agg && this.trialMeta?.trialId === r.trialId ? this.agg.summary() : r.summary,
    }));
    return {
      ready: this.store !== null,
      consentGranted: this.consentGranted,
      phase: this.meta?.status === "active" ? "active" : this.finishedSessionId ? "finished" : "idle",
      sessionId: this.meta?.sessionId ?? this.finishedSessionId,
      status: this.meta?.status ?? null,
      storage: this.store?.kind ?? "unknown",
      scenario: this.scenario,
      scenarioNote: this.scenarioNote,
      truth: this.truth,
      currentTrialId: this.trialMeta?.trialId ?? null,
      trialCount: rows.length,
      trials: rows,
      counters: { ...this.counters },
      hiddenDurationMs: Math.round(this.hiddenDurationMs),
      droppedRecords: dropped,
      storageFailures: w?.failures ?? this.meta?.storageFailures ?? 0,
      storageQueue: w?.queuedItems ?? 0,
      warnings: [...this.warnings],
      perfLatest: this.perfLatest,
      previousSessions: this.previous,
      storageUsageBytes: this.usage.usageBytes,
      storageQuotaBytes: this.usage.quotaBytes,
      lastError: this.lastError,
    };
  }

  private warn(msg: string): void {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
    if (this.warnings.length > 20) this.warnings.shift();
    if (this.meta && !this.meta.warnings.includes(msg)) this.meta.warnings.push(msg);
    this.event("STORAGE_WARNING", { message: msg }, "system", false);
    this.notify(true);
  }

  // ----------------------------------------------------------------- consent
  get hasConsent(): boolean {
    return this.consentGranted || readPersistedBenchConsent();
  }

  grantConsent(): void {
    this.consentGranted = true;
    writePersistedBenchConsent(true, this.deps.wallMinuteIso());
    this.notify(true);
  }

  revokeConsent(): void {
    this.consentGranted = false;
    writePersistedBenchConsent(false);
    this.notify(true);
  }

  // ----------------------------------------------------------------- lifecycle
  /** Opens the store and recovers sessions left "active" by a closed or crashed page. Safe to call repeatedly. */
  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.store = await this.deps.openStore();
      const sessions = await this.store.listSessions();
      const now = Date.now();
      const prevTabSessionId = readTabActiveSessionId();
      for (const s of sessions) {
        const isSameTabReload = prevTabSessionId !== null && prevTabSessionId === s.sessionId && this.meta === null;
        if (
          s.status === "active" &&
          s.sessionId !== this.meta?.sessionId &&
          (isSameTabReload || now - s.heartbeatEpochMs > this.deps.heartbeatStaleMs)
        ) {
          s.status = "interrupted";
          s.statusReason = isSameTabReload
            ? "page reloaded or navigated away before the session was finished (recovered on reload)"
            : "page closed, refreshed or crashed before the session was finished (recovered on next load)";
          try {
            // Also close any trial that was left open at crash/reload time and refresh its summary from chunks.
            const trials = await this.store.listTrials(s.sessionId);
            const hasOpenTrial = trials.some((t) => t.meta.endedT === null || t.meta.endReason === null);
            if (hasOpenTrial) {
              const bundle = await readBundle(this.store, s.sessionId);
              for (const t of trials) {
                if (t.meta.endedT === null || t.meta.endReason === null) {
                  t.meta.endReason = "interrupted";
                }
              }
              const analysis = analyzeBundle({
                ...bundle,
                trials,
              });
              for (const t of trials) {
                if (t.meta.endedT === null) {
                  const sum = analysis.trialSummaries[t.meta.trialId];
                  t.meta.endedT = sum ? t.meta.startedT + sum.durationMs : t.meta.startedT;
                  t.summary = sum ?? t.summary;
                  await this.store.putTrial(t);
                }
              }
            }
            await this.store.putSession(s);
          } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
          }
          if (isSameTabReload) writeTabActiveSessionId(null);
        }
      }
      this.previous = sessions
        .filter((s) => s.sessionId !== this.meta?.sessionId)
        .sort((a, b) => (a.createdAtMinuteIso < b.createdAtMinuteIso ? 1 : -1))
        .map((s) => ({
          sessionId: s.sessionId,
          status: s.status,
          statusReason: s.statusReason,
          trialCount: s.trialCount,
          createdAtMinuteIso: s.createdAtMinuteIso,
        }));
      await this.refreshUsage();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.notify(true);
  }

  private async refreshUsage(): Promise<void> {
    if (!this.store) return;
    this.lastUsageCheck = this.deps.now();
    this.usage = await this.store.estimate();
    if (this.usage.usageBytes !== null && this.usage.quotaBytes && this.usage.usageBytes / this.usage.quotaBytes > 0.8) {
      this.warn("Kuota penyimpanan browser hampir penuh (>80%). Unduh hasil lalu hapus data lokal.");
    }
  }

  /** Consent is mandatory. Anything but `true` throws and stores nothing. */
  async startSession(opts: {
    consent: boolean;
    persistConsent?: boolean;
    app: { version: string; gitCommit: string; gitBranch?: string };
    environment: SessionMeta["environment"];
    yoloModelSha256?: string | null;
    yoloEnabled?: boolean | null;
    yoloRateHz?: number | null;
    monuiVersion?: "MoNUI-7" | string | null;
    cameraActual?: SessionMeta["cameraActual"];
    cameraCapabilities?: SessionMeta["cameraCapabilities"];
    exposureControlStatus?: SessionMeta["exposureControlStatus"];
    autoPreprocessStatus?: SessionMeta["autoPreprocessStatus"];
  }): Promise<string> {
    if (opts.consent !== true) throw new Error("Sesi benchmark butuh persetujuan eksplisit");
    if (this.meta?.status === "active") throw new Error("Sesi benchmark masih aktif");
    if (opts.persistConsent) {
      this.consentGranted = true;
      writePersistedBenchConsent(true, this.deps.wallMinuteIso());
    }
    await this.init();
    if (!this.store) throw new Error(this.lastError ?? "Penyimpanan lokal tidak bisa dibuka");
    const sessionId = `S-${this.deps.randomId()}`;
    this.meta = {
      schema: BENCH_SESSION_SCHEMA,
      sessionId,
      status: "active",
      statusReason: null,
      createdAtMinuteIso: this.deps.wallMinuteIso(),
      heartbeatEpochMs: Date.now(),
      consent: { numericRecording: true, videoOrImages: false, upload: false, version: "bench-consent/1" },
      app: opts.app,
      environment: { ...opts.environment, storage: this.store.kind },
      trialCount: 0,
      droppedRecords: { frames: 0, events: 0, perf: 0 },
      storageFailures: 0,
      warnings: [],
      yoloModelSha256: opts.yoloModelSha256 !== undefined ? opts.yoloModelSha256 : YOLO_MODEL_SHA256,
      yoloEnabled: opts.yoloEnabled !== undefined ? opts.yoloEnabled : true,
      yoloRateHz: opts.yoloRateHz !== undefined ? opts.yoloRateHz : 5,
      monuiVersion: opts.monuiVersion !== undefined ? opts.monuiVersion : "MoNUI-7",
      ...(opts.cameraActual !== undefined ? { cameraActual: opts.cameraActual } : {}),
      ...(opts.cameraCapabilities !== undefined ? { cameraCapabilities: opts.cameraCapabilities } : {}),
      ...(opts.exposureControlStatus !== undefined ? { exposureControlStatus: opts.exposureControlStatus } : {}),
      ...(opts.autoPreprocessStatus !== undefined ? { autoPreprocessStatus: opts.autoPreprocessStatus } : {}),
    };
    this.startPerf = this.deps.now();
    this.trialIndex = 0;
    this.trialMeta = null;
    this.agg = null;
    this.ctx = null;
    this.suspendedCtx = null;
    this.hiddenStartPerf = null;
    this.hiddenDurationMs = 0;
    this.trialRows.clear();
    this.counters = { frames: 0, events: 0, perf: 0 };
    this.warnings = [];
    this.perfLatest = null;
    this.finishedSessionId = null;
    this.scenario = "UNSPECIFIED";
    this.scenarioNote = "";
    this.truth = "UNLABELLED";
    this.writer = new ChunkWriter(this.store, sessionId, { onWarning: (m) => this.warn(m) });
    await this.store.putSession(this.meta);
    writeTabActiveSessionId(sessionId);
    this.hbTimer = this.deps.setInterval(() => void this.heartbeat(), 2000);
    this.event("SESSION_START", { storage: this.store.kind }, "system", true, "RULE_DERIVED");
    this.notify(true);
    return sessionId;
  }

  /**
   * Zero-friction automatic benchmark entry (B01):
   * Once numeric consent has been granted, starting the camera automatically opens a session (if needed) and
   * opens a trial for that route without requiring a manual "Mulai Sesi Benchmark" click.
   */
  async startCameraTrialAuto(
    ctx: TrialContext,
    opts?: {
      app?: { version: string; gitCommit: string; gitBranch?: string };
      environment?: SessionMeta["environment"];
      reason?: string;
      yoloEnabled?: boolean | null;
      yoloRateHz?: number | null;
      cameraActual?: SessionMeta["cameraActual"];
      cameraCapabilities?: SessionMeta["cameraCapabilities"];
      exposureControlStatus?: SessionMeta["exposureControlStatus"];
      autoPreprocessStatus?: SessionMeta["autoPreprocessStatus"];
    },
  ): Promise<{ started: boolean; sessionId: string | null; trialId: string | null; reason: string }> {
    if (!this.hasConsent) {
      return { started: false, sessionId: null, trialId: null, reason: "no-consent" };
    }
    if (this.autoStartInFlight) {
      return this.autoStartInFlight;
    }
    this.autoStartInFlight = (async () => {
      await this.init();
      if (!this.isActive) {
        await this.startSession({
          consent: true,
          app: opts?.app ?? getAppBuildInfo(),
          environment: opts?.environment ?? collectNonIdentifyingEnvironment(this.store?.kind ?? "indexeddb"),
          yoloEnabled: opts?.yoloEnabled,
          yoloRateHz: opts?.yoloRateHz,
          cameraActual: opts?.cameraActual,
          cameraCapabilities: opts?.cameraCapabilities,
          exposureControlStatus: opts?.exposureControlStatus,
          autoPreprocessStatus: opts?.autoPreprocessStatus,
        });
      } else if (opts) {
        this.patchSessionMeta({
          ...(opts.cameraActual !== undefined ? { cameraActual: opts.cameraActual } : {}),
          ...(opts.cameraCapabilities !== undefined ? { cameraCapabilities: opts.cameraCapabilities } : {}),
          ...(opts.exposureControlStatus !== undefined ? { exposureControlStatus: opts.exposureControlStatus } : {}),
          ...(opts.autoPreprocessStatus !== undefined ? { autoPreprocessStatus: opts.autoPreprocessStatus } : {}),
        });
      }
      const trialId = this.beginTrial(ctx, opts?.reason ?? "camera-start");
      return {
        started: trialId !== null,
        sessionId: this.meta?.sessionId ?? null,
        trialId,
        reason: opts?.reason ?? "camera-start",
      };
    })();
    try {
      return await this.autoStartInFlight;
    } finally {
      this.autoStartInFlight = null;
    }
  }

  /** R23B-HF3: Update active session metadata (cameraActual, cameraCapabilities, exposure & preprocess status). */
  patchSessionMeta(
    patch: Partial<
      Pick<
        SessionMeta,
        "cameraActual" | "cameraCapabilities" | "exposureControlStatus" | "autoPreprocessStatus"
      >
    >,
  ): void {
    if (!this.meta || this.meta.status !== "active") return;
    Object.assign(this.meta, patch);
    if (this.store) {
      void this.store.putSession(this.meta).catch(() => undefined);
    }
  }

  get isActive(): boolean {
    return this.meta?.status === "active";
  }

  private async heartbeat(): Promise<void> {
    if (!this.meta || !this.store || this.meta.status !== "active") return;
    this.meta.heartbeatEpochMs = Date.now();
    const w = this.writer?.stats();
    if (w) {
      this.meta.droppedRecords = { ...w.dropped };
      this.meta.storageFailures = w.failures;
    }
    try {
      await this.store.putSession(this.meta);
      await this.persistOpenTrialSummary();
      if (this.deps.now() - this.lastUsageCheck > 30000) await this.refreshUsage();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.warn(`Gagal memperbarui metadata sesi: ${this.lastError}`);
    }
    this.notify();
  }

  private async persistOpenTrialSummary(): Promise<void> {
    if (!this.store || !this.trialMeta || !this.agg) return;
    const sum = this.agg.summary();
    this.trialMeta.autoConditionTags = sum.autoConditionTags;
    this.trialMeta.autoConditionTagsSource = "RULE_DERIVED";
    this.trialMeta.independentGroundTruthAvailable = sum.independentGroundTruthAvailable;
    await this.store.putTrial({ meta: { ...this.trialMeta }, summary: sum });
  }

  private t(): number {
    return Math.max(0, Math.round((this.deps.now() - this.startPerf) * 10) / 10);
  }

  // ----------------------------------------------------------------- trials
  /** Start a trial (closing the open one). The camera page calls this when the camera starts or its config changes. */
  beginTrial(ctx: TrialContext, reason = "start"): string | null {
    if (!this.meta || this.meta.status !== "active" || !this.store) return null;
    if (this.trialMeta) this.closeTrial(normalizeTrialEndReason("replaced:" + reason));
    this.ctx = ctx;
    this.suspendedCtx = null;
    const index = ++this.trialIndex;
    const trialId = `${this.meta.sessionId}-T${String(index).padStart(3, "0")}`;
    this.trialMeta = {
      trialId,
      sessionId: this.meta.sessionId,
      index,
      route: ctx.route,
      source: ctx.source,
      engine: ctx.engine,
      scenario: this.scenario,
      scenarioNote: this.scenarioNote,
      camera: ctx.camera,
      startedT: this.t(),
      endedT: null,
      endReason: null,
      preprocessConfig: {
        mode: ctx.engine.preprocess,
        defaultMode: DEFAULT_PREPROCESS,
        candidates: [...PREPROCESS_CANDIDATES],
      },
      detectorConfig: {
        variant: ctx.engine.detector,
        delegate: ctx.engine.delegate,
        numHandsPolicy: ctx.engine.numHandsPolicy,
        numHandsActive: ctx.numHandsActive ?? (ctx.engine.numHandsPolicy === "fixed-1" ? 1 : 2),
        numHandsOverride: ctx.numHandsOverride ?? ctx.engine.numHandsOverride ?? null,
        minDetectionConfidence: ctx.minDetectionConfidence ?? DEFAULT_MIN_DETECTION_CONFIDENCE,
        minPresenceConfidence: ctx.minPresenceConfidence ?? DEFAULT_MIN_PRESENCE_CONFIDENCE,
        minTrackingConfidence: ctx.minTrackingConfidence ?? DEFAULT_MIN_TRACKING_CONFIDENCE,
        confidenceOverride: ctx.confidenceOverride ?? null,
        initSetOptionsCalls: ctx.initSetOptionsCalls ?? 0,
        runtimeSetOptionsCalls: 0,
      },
      presetId: ctx.presetId ?? "default-any-pinch",
      reacquirePinchPolicy: ctx.reacquirePinchPolicy ?? "require-release",
      captureMeta: ctx.captureMeta ?? null,
      rawRecMeta: ctx.rawRecMeta ?? null,
      autoConditionTags: [],
      autoConditionTagsSource: "RULE_DERIVED",
      independentGroundTruthAvailable: false,
    };
    this.agg = new TrialAggregator(trialId, null, ctx.route);
    this.meta.trialCount = index;
    this.trialRows.set(trialId, {
      trialId,
      index,
      route: ctx.route,
      source: ctx.source,
      engineId: ctx.engine.engineId,
      engineShort: ctx.engine.label.split(" ")[0] + " " + (ctx.engine.label.split(" ")[1] ?? ""),
      preprocess: ctx.engine.preprocess,
      detector: ctx.engine.detector,
      scenario: this.scenario,
      endReason: null,
      open: true,
      summary: EMPTY_SUMMARY(trialId),
    });
    void this.persistOpenTrialSummary().catch((e) => this.warn(`Gagal menyimpan trial: ${String(e)}`));
    this.event(
      "TRIAL_START",
      {
        index,
        route: ctx.route,
        engine: ctx.engine.engineId,
        actualModelId: ctx.engine.actualModelId ?? ctx.engine.engineId,
        preprocess: ctx.engine.preprocess,
        numHandsPolicy: ctx.engine.numHandsPolicy,
        numHandsActive: ctx.numHandsActive ?? (ctx.engine.numHandsPolicy === "fixed-1" ? 1 : 2),
        numHandsOverride: ctx.numHandsOverride ?? ctx.engine.numHandsOverride ?? null,
        minDetectionConfidence: ctx.minDetectionConfidence ?? DEFAULT_MIN_DETECTION_CONFIDENCE,
        minPresenceConfidence: ctx.minPresenceConfidence ?? DEFAULT_MIN_PRESENCE_CONFIDENCE,
        minTrackingConfidence: ctx.minTrackingConfidence ?? DEFAULT_MIN_TRACKING_CONFIDENCE,
        confidenceOverride: ctx.confidenceOverride ?? null,
        presetId: ctx.presetId ?? "default-any-pinch",
        reacquirePinchPolicy: ctx.reacquirePinchPolicy ?? "require-release",
        scenario: this.scenario,
        reason,
      },
      "system",
      true,
      "RULE_DERIVED",
    );
    this.notify(true);
    return trialId;
  }

  /** Close the open trial and persist its final summary with canonical `endReason`. Idempotent. */
  endTrial(reason: string): void {
    if (!this.trialMeta) return;
    this.closeTrial(normalizeTrialEndReason(reason));
    this.notify(true);
  }

  /** R22B: Update active trial metadata (presetId, reacquirePinchPolicy, captureMeta, rawRecMeta) cleanly. */
  patchActiveTrialMeta(
    patch: Partial<Pick<TrialMeta, "presetId" | "reacquirePinchPolicy" | "captureMeta" | "rawRecMeta">>,
  ): void {
    if (!this.trialMeta) return;
    Object.assign(this.trialMeta, patch);
    if (this.ctx) {
      if (patch.presetId !== undefined) this.ctx.presetId = patch.presetId;
      if (patch.reacquirePinchPolicy !== undefined) this.ctx.reacquirePinchPolicy = patch.reacquirePinchPolicy;
      if (patch.captureMeta !== undefined) this.ctx.captureMeta = patch.captureMeta;
      if (patch.rawRecMeta !== undefined) this.ctx.rawRecMeta = patch.rawRecMeta;
    }
    void this.persistOpenTrialSummary().catch(() => undefined);
  }

  /** Route transition helper (B02): emits ROUTE_CHANGE and closes open trial with `"route-switch"`. */
  onRouteSwitch(toRoute?: BenchRoute): void {
    this.suspendedCtx = null;
    if (this.isActive && toRoute) {
      this.event("ROUTE_CHANGE", { to: toRoute }, "system", false, "RULE_DERIVED");
    }
    if (this.trialMeta) {
      this.endTrial("route-switch");
    }
  }

  /** Tab hidden helper (B03/E03): closes open trial with `"tab-hidden"` so off-tab periods never enter active windows. */
  onTabHidden(): void {
    if (!this.isActive) return;
    if (this.hiddenStartPerf === null) {
      this.hiddenStartPerf = this.deps.now();
    }
    this.event("VISIBILITY_HIDDEN", {}, "system", false, "RULE_DERIVED");
    if (this.trialMeta) {
      this.suspendedCtx = this.ctx;
      this.endTrial("tab-hidden");
    }
    void this.writer?.flush(1500).catch(() => undefined);
  }

  /** Flushes any buffered records to the underlying store (useful before expected idle gaps or in crash tests). */
  async flush(timeoutMs = 2000): Promise<void> {
    if (this.writer) {
      await this.writer.flush(timeoutMs);
    }
    if (this.trialMeta) {
      await this.persistOpenTrialSummary();
    }
  }

  /** Tab visible helper (B03/E03): records `hiddenDurationMs` and optionally opens a fresh trial if camera is still ON. */
  onTabVisible(resumeCtx?: TrialContext | null): string | null {
    if (!this.isActive) {
      this.hiddenStartPerf = null;
      this.suspendedCtx = null;
      return null;
    }
    const hiddenDur =
      this.hiddenStartPerf !== null ? Math.max(0, Math.round(this.deps.now() - this.hiddenStartPerf)) : 0;
    this.hiddenStartPerf = null;
    this.hiddenDurationMs += hiddenDur;
    const ctxToUse = resumeCtx !== undefined ? resumeCtx : this.suspendedCtx;
    this.suspendedCtx = null;
    let nextTrialId: string | null = null;
    if (ctxToUse && !this.trialMeta) {
      nextTrialId = this.beginTrial(ctxToUse, "tab-visible");
    }
    this.event("VISIBILITY_VISIBLE", { hiddenDurationMs: hiddenDur }, "system", true, "RULE_DERIVED");
    return nextTrialId;
  }

  /** Camera stop helper (B03): closes open trial with `"camera-stop"` (or `"worker-error"`). */
  onCameraStop(reason = "camera-stop"): void {
    this.suspendedCtx = null;
    this.hiddenStartPerf = null;
    if (!this.isActive) return;
    const canonical = normalizeTrialEndReason(reason);
    this.event("CAMERA_STOP", { reason: canonical }, "system", false, "RULE_DERIVED");
    if (this.trialMeta) {
      this.endTrial(canonical);
    }
  }

  /** Worker/detector failure helper (B03): emits DETECTOR_ERROR and closes trial with `"worker-error"`. */
  onWorkerError(message: string): void {
    this.suspendedCtx = null;
    if (!this.isActive) return;
    this.event("DETECTOR_ERROR", { message }, "system", false, "RULE_DERIVED");
    if (this.trialMeta) {
      this.endTrial("worker-error");
    }
  }

  private closeTrial(reason: string): void {
    if (!this.trialMeta || !this.agg) return;
    const meta = this.trialMeta;
    const canonicalReason = normalizeTrialEndReason(reason);
    meta.endedT = this.t();
    meta.endReason = canonicalReason;
    this.agg.setEndReason(canonicalReason);
    this.event("TRIAL_END", { reason: canonicalReason }, "system", false, "RULE_DERIVED");
    const summary = this.agg.summary();
    meta.autoConditionTags = summary.autoConditionTags;
    meta.autoConditionTagsSource = "RULE_DERIVED";
    meta.independentGroundTruthAvailable = summary.independentGroundTruthAvailable;
    if (meta.detectorConfig) {
      meta.detectorConfig.initSetOptionsCalls = summary.initSetOptionsCalls;
      meta.detectorConfig.runtimeSetOptionsCalls = summary.runtimeSetOptionsCalls;
    }
    const row = this.trialRows.get(meta.trialId);
    if (row) {
      row.open = false;
      row.endReason = canonicalReason;
      row.summary = summary;
    }
    const store = this.store;
    if (store) {
      void store.putTrial({ meta: { ...meta }, summary }).catch((e) => this.warn(`Gagal menyimpan ringkasan trial: ${String(e)}`));
    }
    this.trialMeta = null;
    this.agg = null;
  }

  get hasOpenTrial(): boolean {
    return this.trialMeta !== null;
  }
  get currentTrialId(): string | null {
    return this.trialMeta?.trialId ?? null;
  }

  /** The tester picked another scenario (legacy/diagnostics): a new trial with the same engine/route starts. */
  setScenario(s: Scenario, note = ""): void {
    if (this.scenario === s && this.scenarioNote === note) return;
    this.scenario = s;
    this.scenarioNote = note;
    this.event("SCENARIO_CHANGE", { scenario: s, note }, "system", true, "USER_ACTION");
    if (this.trialMeta && this.ctx) this.beginTrial(this.ctx, "scenario-change");
    else this.notify(true);
  }

  setTruth(label: TruthLabel): void {
    if (this.truth === label) return;
    this.truth = label;
    this.event("LABEL_CHANGE", { label }, "system", true, "USER_ACTION");
    this.notify(true);
  }
  get currentTruth(): TruthLabel {
    return this.truth;
  }
  get currentScenario(): Scenario {
    return this.scenario;
  }

  // ----------------------------------------------------------------- records
  /** Returns false when nothing was recorded (no session / trial). A recorded-but-dropped frame is counted, not hidden. */
  recordFrame(frame: Omit<BenchFrameInput, "trialId"> & { trialId?: string }): boolean {
    if (!this.meta || this.meta.status !== "active" || !this.writer || !this.trialMeta || !this.agg) return false;
    const full = normalizeBenchFrame(frame, this.trialMeta.trialId, this.trialMeta);
    this.agg.addFrame(full);
    this.counters.frames++;
    this.writer.push("frames", full);
    this.notify();
    return true;
  }

  event(
    type: EventType,
    data?: BenchEvent["data"],
    source: BenchEvent["source"] = "gesture",
    notify = true,
    labelSource?: LabelSource,
  ): void {
    if (!this.meta || this.meta.status !== "active" || !this.writer) return;
    const resolvedSource: LabelSource =
      labelSource ?? (source === "pointer" ? "USER_ACTION" : "RULE_DERIVED");
    const e: BenchEvent = {
      t: this.t(),
      trialId: this.trialMeta?.trialId ?? null,
      type,
      source,
      labelSource: resolvedSource,
      ...(data ? { data } : {}),
    };
    this.agg?.addEvent(e);
    this.counters.events++;
    this.writer.push("events", e);
    if (notify) this.notify();
  }

  recordPerf(
    p: Omit<PerfSample, "trialId" | "t" | "storageQueue" | "droppedRecords"> & Partial<Pick<PerfSample, "trialId" | "t">>,
  ): void {
    if (!this.meta || this.meta.status !== "active" || !this.writer) return;
    const w = this.writer.stats();
    const sample: PerfSample = {
      ...p,
      t: p.t ?? this.t(),
      trialId: p.trialId ?? this.trialMeta?.trialId ?? null,
      storageQueue: w.queuedItems,
      droppedRecords: w.dropped.frames + w.dropped.events + w.dropped.perf,
    };
    if (sample.trialId && sample.trialId === this.trialMeta?.trialId) {
      this.agg?.addPerf(sample);
    }
    this.perfLatest = sample;
    this.counters.perf++;
    this.writer.push("perf", sample);
    this.notify();
  }

  /** Time (ms since session start) for callers that stamp their own records. */
  nowT(): number {
    return this.t();
  }

  // ----------------------------------------------------------------- end of session
  async finishSession(reason = "user-finish"): Promise<void> {
    if (!this.meta || this.meta.status !== "active" || !this.store || !this.writer) return;
    const canonical = normalizeTrialEndReason(reason);
    this.event("SESSION_FINISH", { reason: canonical }, "system", false, "USER_ACTION");
    if (this.trialMeta) this.closeTrial(canonical === "user-finish" ? "user-finish" : canonical);
    this.suspendedCtx = null;
    this.hiddenStartPerf = null;
    let flushError: string | null = null;
    try {
      await this.writer.flush();
    } catch (err) {
      flushError = err instanceof Error ? err.message : String(err);
      this.warn(`Sesi selesai tetapi sebagian catatan belum tersimpan: ${flushError}`);
    }
    const w = this.writer.stats();
    this.meta.droppedRecords = { ...w.dropped };
    this.meta.storageFailures = w.failures;
    this.meta.status = "finished";
    this.meta.statusReason = flushError ? `finished with unsaved records: ${flushError}` : reason;
    this.stopHeartbeat();
    try {
      await this.store.putSession(this.meta);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.finishedSessionId = this.meta.sessionId;
    writeTabActiveSessionId(null);
    this.writer.dispose();
    this.meta = null;
    this.writer = null;
    await this.refreshPrevious();
    this.notify(true);
  }

  private stopHeartbeat(): void {
    if (this.hbTimer !== null) this.deps.clearInterval(this.hbTimer);
    this.hbTimer = null;
  }

  /** Best-effort (pagehide/unload): mark the session interrupted. Data already written stays; nothing is deleted. */
  markInterrupted(reason: string): void {
    if (!this.meta || this.meta.status !== "active" || !this.store) return;
    this.event("SESSION_INTERRUPTED", { reason }, "system", false, "RULE_DERIVED");
    if (this.trialMeta) {
      this.closeTrial(reason === "pagehide" ? "pagehide" : "interrupted:" + reason);
    }
    this.suspendedCtx = null;
    this.hiddenStartPerf = null;
    this.meta.status = "interrupted";
    this.meta.statusReason = reason;
    const w = this.writer?.stats();
    if (w) {
      this.meta.droppedRecords = { ...w.dropped };
      this.meta.storageFailures = w.failures;
    }
    this.stopHeartbeat();
    void this.writer?.flush(2000).catch(() => undefined);
    void this.store.putSession(this.meta).catch(() => undefined);
    this.notify(true);
  }

  /** The page came back from the back/forward cache and the tab was not destroyed: continue the same session. */
  resumeAfterPageShow(): void {
    if (!this.meta || this.meta.status !== "interrupted" || this.meta.statusReason !== "pagehide" || !this.store) return;
    this.meta.status = "active";
    this.meta.statusReason = null;
    this.meta.heartbeatEpochMs = Date.now();
    this.hbTimer ??= this.deps.setInterval(() => void this.heartbeat(), 2000);
    this.event("SESSION_START", { resumedFromBfcache: true }, "system", true, "RULE_DERIVED");
    void this.store.putSession(this.meta).catch(() => undefined);
    this.notify(true);
  }

  // ----------------------------------------------------------------- export / delete
  private async refreshPrevious(): Promise<void> {
    if (!this.store) return;
    const sessions = await this.store.listSessions();
    this.previous = sessions
      .sort((a, b) => (a.createdAtMinuteIso < b.createdAtMinuteIso ? 1 : -1))
      .map((s) => ({
        sessionId: s.sessionId,
        status: s.status,
        statusReason: s.statusReason,
        trialCount: s.trialCount,
        createdAtMinuteIso: s.createdAtMinuteIso,
      }));
  }

  /** Every stored session (current + previous page loads). */
  async allSessionIds(): Promise<string[]> {
    await this.init();
    if (!this.store) return [];
    return (await this.store.listSessions()).map((s) => s.sessionId);
  }

  /** The single "Unduh Hasil" artefact. Flushes the live writer first so the file includes the latest records. */
  async exportAll(app: { version: string; gitCommit: string; gitBranch?: string } = getAppBuildInfo()): Promise<Blob> {
    await this.init();
    if (!this.store) throw new Error("Penyimpanan lokal tidak tersedia");
    if (this.writer) {
      try {
        await this.writer.flush();
      } catch (err) {
        this.warn(`Ekspor dibuat dengan catatan belum tersimpan: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (this.trialMeta) await this.persistOpenTrialSummary();
      if (this.meta) {
        const w = this.writer.stats();
        this.meta.droppedRecords = { ...w.dropped };
        this.meta.storageFailures = w.failures;
        await this.store.putSession(this.meta);
      }
    }
    const ids = await this.allSessionIds();
    return buildExportBlob(this.store, ids, { app, exportedAtMinuteIso: this.deps.wallMinuteIso() });
  }

  async exportSummaryCsv(): Promise<Blob> {
    await this.init();
    if (!this.store) throw new Error("Penyimpanan lokal tidak tersedia");
    if (this.writer) await this.writer.flush().catch(() => undefined);
    return new Blob([await buildSummaryCsv(this.store, await this.allSessionIds())], { type: "text/csv" });
  }

  /** Explicit user action only. Deletes every stored session, including the live one, and clears consent. */
  async deleteAllLocalData(): Promise<void> {
    await this.init();
    if (this.meta) {
      this.stopHeartbeat();
      this.trialMeta = null;
      this.agg = null;
      this.writer?.dispose();
      this.writer = null;
      this.meta = null;
    }
    await this.store?.deleteAll();
    writeTabActiveSessionId(null);
    writePersistedBenchConsent(false);
    this.consentGranted = false;
    this.suspendedCtx = null;
    this.hiddenStartPerf = null;
    this.hiddenDurationMs = 0;
    this.trialRows.clear();
    this.counters = { frames: 0, events: 0, perf: 0 };
    this.previous = [];
    this.finishedSessionId = null;
    this.warnings = [];
    this.perfLatest = null;
    await this.refreshUsage();
    this.notify(true);
  }

  /** TEST ONLY */
  get _store(): BenchStore | null {
    return this.store;
  }
  _writerStats() {
    return this.writer?.stats() ?? null;
  }
}

let singleton: BenchSessionManager | null = null;
export function getBenchManager(): BenchSessionManager {
  singleton ??= new BenchSessionManager();
  return singleton;
}
/** TEST ONLY */
export function resetBenchManagerForTest(m: BenchSessionManager | null = null): void {
  singleton = m;
}
