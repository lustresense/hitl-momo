/**
 * BenchSessionManager — ONE module-level singleton shared by /nui-lab, /nui-lab/gesture, /nui-lab/canvas and
 * /nui-lab/diagnostics (client-side navigation keeps the module alive, so trial history survives route changes; a reload
 * recovers it from IndexedDB and flags the old session as interrupted).
 *
 * Hard rules, all covered by tests/nui-lab/bench-*.test.ts:
 *  - nothing is recorded before `startSession({ consent: true })`; consent=false throws and stores nothing;
 *  - every frame handed to `recordFrame` ends up written, queued, or counted in `droppedRecords`;
 *  - a frame without a hand is recorded as DETECTOR_MISS (the caller must still call recordFrame);
 *  - closing the page / crash / camera stop never makes stored data vanish: sessions are flagged interrupted.
 */
import { TrialAggregator } from "./stats";
import { ChunkWriter } from "./writer";
import { buildExportBlob, buildSummaryCsv } from "./export";
import { openBenchStore, type BenchStore } from "./store";
import {
  BENCH_SESSION_SCHEMA,
  type BenchEvent,
  type BenchFrame,
  type BenchRoute,
  type BenchSource,
  type CameraProfile,
  type EngineConfig,
  type EventType,
  type PerfSample,
  type Scenario,
  type SessionMeta,
  type SessionStatus,
  type TrialMeta,
  type TrialSummary,
  type TruthLabel,
} from "./schema";

export interface TrialContext {
  route: BenchRoute;
  source: BenchSource;
  engine: EngineConfig;
  camera: CameraProfile;
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
  open: boolean;
  summary: TrialSummary;
}

export interface BenchState {
  ready: boolean;
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
  droppedRecords: number;
  storageFailures: number;
  storageQueue: number;
  warnings: string[];
  perfLatest: PerfSample | null;
  /** Sessions found in IndexedDB from earlier page loads (stored data the tester can still export or delete). */
  previousSessions: Array<{ sessionId: string; status: SessionStatus; statusReason: string | null; trialCount: number; createdAtMinuteIso: string }>;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
  lastError: string | null;
}

const EMPTY_SUMMARY = (id: string): TrialSummary => new TrialAggregator(id).summary();

export interface ManagerDeps {
  openStore?: () => Promise<BenchStore>;
  now?: () => number;
  wallMinuteIso?: () => string;
  randomId?: () => string;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
  heartbeatStaleMs?: number;
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

export class BenchSessionManager {
  private store: BenchStore | null = null;
  private writer: ChunkWriter | null = null;
  private meta: SessionMeta | null = null;
  private startPerf = 0;
  private trialIndex = 0;
  private trialMeta: TrialMeta | null = null;
  private agg: TrialAggregator | null = null;
  private ctx: TrialContext | null = null;
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
  private lastSummaryPersist = 0;
  private previous: BenchState["previousSessions"] = [];
  private lastError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private usage: { usageBytes: number | null; quotaBytes: number | null } = { usageBytes: null, quotaBytes: null };
  private lastUsageCheck = 0;
  private finishedSessionId: string | null = null;
  private readonly deps: Required<Omit<ManagerDeps, "heartbeatStaleMs">> & { heartbeatStaleMs: number };

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
    app: { version: string; gitCommit: string };
    environment: SessionMeta["environment"];
  }): Promise<string> {
    if (opts.consent !== true) throw new Error("Sesi benchmark butuh persetujuan eksplisit");
    if (this.meta?.status === "active") throw new Error("Sesi benchmark masih aktif");
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
    };
    this.startPerf = this.deps.now();
    this.trialIndex = 0;
    this.trialMeta = null;
    this.agg = null;
    this.ctx = null;
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
    this.event("SESSION_START", { storage: this.store.kind }, "system");
    this.notify(true);
    return sessionId;
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
    await this.store.putTrial({ meta: this.trialMeta, summary: this.agg.summary() });
  }

  private t(): number {
    return Math.max(0, Math.round((this.deps.now() - this.startPerf) * 10) / 10);
  }

  // ----------------------------------------------------------------- trials
  /** Start a trial (closing the open one). The camera page calls this when the camera starts or its config changes. */
  beginTrial(ctx: TrialContext, reason = "start"): string | null {
    if (!this.meta || this.meta.status !== "active" || !this.store) return null;
    if (this.trialMeta) this.closeTrial("replaced:" + reason);
    this.ctx = ctx;
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
    };
    this.agg = new TrialAggregator(trialId);
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
      open: true,
      summary: EMPTY_SUMMARY(trialId),
    });
    void this.persistOpenTrialSummary().catch((e) => this.warn(`Gagal menyimpan trial: ${String(e)}`));
    this.event("TRIAL_START", { index, route: ctx.route, engine: ctx.engine.engineId, preprocess: ctx.engine.preprocess, scenario: this.scenario, reason }, "system");
    this.notify(true);
    return trialId;
  }

  /** Close the open trial and persist its final summary. Idempotent. */
  endTrial(reason: string): void {
    if (!this.trialMeta) return;
    this.closeTrial(reason);
    this.notify(true);
  }

  private closeTrial(reason: string): void {
    if (!this.trialMeta || !this.agg) return;
    const meta = this.trialMeta;
    meta.endedT = this.t();
    meta.endReason = reason;
    this.event("TRIAL_END", { reason }, "system");
    const summary = this.agg.summary();
    const row = this.trialRows.get(meta.trialId);
    if (row) {
      row.open = false;
      row.summary = summary;
    }
    const store = this.store;
    if (store) void store.putTrial({ meta: { ...meta }, summary }).catch((e) => this.warn(`Gagal menyimpan ringkasan trial: ${String(e)}`));
    this.trialMeta = null;
    this.agg = null;
  }

  get hasOpenTrial(): boolean {
    return this.trialMeta !== null;
  }
  get currentTrialId(): string | null {
    return this.trialMeta?.trialId ?? null;
  }

  /** The tester picked another scenario: a new trial with the same engine/route starts so groups stay clean. */
  setScenario(s: Scenario, note = ""): void {
    if (this.scenario === s && this.scenarioNote === note) return;
    this.scenario = s;
    this.scenarioNote = note;
    this.event("SCENARIO_CHANGE", { scenario: s, note }, "system");
    if (this.trialMeta && this.ctx) this.beginTrial(this.ctx, "scenario-change");
    else this.notify(true);
  }

  setTruth(label: TruthLabel): void {
    if (this.truth === label) return;
    this.truth = label;
    this.event("LABEL_CHANGE", { label }, "system");
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
  recordFrame(frame: Omit<BenchFrame, "trialId"> & { trialId?: string }): boolean {
    if (!this.meta || this.meta.status !== "active" || !this.writer || !this.trialMeta || !this.agg) return false;
    const full = { ...frame, trialId: this.trialMeta.trialId } as BenchFrame;
    this.agg.addFrame(full);
    this.counters.frames++;
    this.writer.push("frames", full);
    this.notify();
    return true;
  }

  event(type: EventType, data?: BenchEvent["data"], source: BenchEvent["source"] = "gesture", notify = true): void {
    if (!this.meta || this.meta.status !== "active" || !this.writer) return;
    const e: BenchEvent = { t: this.t(), trialId: this.trialMeta?.trialId ?? null, type, source, ...(data ? { data } : {}) };
    this.agg?.addEvent(e);
    this.counters.events++;
    this.writer.push("events", e);
    if (notify) this.notify();
  }

  recordPerf(p: Omit<PerfSample, "trialId" | "t" | "storageQueue" | "droppedRecords"> & Partial<Pick<PerfSample, "trialId" | "t">>): void {
    if (!this.meta || this.meta.status !== "active" || !this.writer) return;
    const w = this.writer.stats();
    const sample: PerfSample = {
      ...p,
      t: p.t ?? this.t(),
      trialId: p.trialId ?? this.trialMeta?.trialId ?? null,
      storageQueue: w.queuedItems,
      droppedRecords: w.dropped.frames + w.dropped.events + w.dropped.perf,
    };
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
  async finishSession(reason = "finished-by-tester"): Promise<void> {
    if (!this.meta || this.meta.status !== "active" || !this.store || !this.writer) return;
    this.event("SESSION_FINISH", { reason }, "system", false);
    if (this.trialMeta) this.closeTrial("session-finish");
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
    this.event("SESSION_INTERRUPTED", { reason }, "system", false);
    if (this.trialMeta) this.closeTrial("interrupted:" + reason);
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
    this.event("SESSION_START", { resumedFromBfcache: true }, "system");
    void this.store.putSession(this.meta).catch(() => undefined);
    this.notify(true);
  }

  // ----------------------------------------------------------------- export / delete
  private async refreshPrevious(): Promise<void> {
    if (!this.store) return;
    const sessions = await this.store.listSessions();
    this.previous = sessions
      .sort((a, b) => (a.createdAtMinuteIso < b.createdAtMinuteIso ? 1 : -1))
      .map((s) => ({ sessionId: s.sessionId, status: s.status, statusReason: s.statusReason, trialCount: s.trialCount, createdAtMinuteIso: s.createdAtMinuteIso }));
  }

  /** Every stored session (current + previous page loads). */
  async allSessionIds(): Promise<string[]> {
    await this.init();
    if (!this.store) return [];
    return (await this.store.listSessions()).map((s) => s.sessionId);
  }

  /** The single "Unduh Semua Hasil Sesi" artefact. Flushes the live writer first so the file includes the latest records. */
  async exportAll(app: { version: string; gitCommit: string }): Promise<Blob> {
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

  /** Explicit user action only. Deletes every stored session, including the live one (which is then aborted). */
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
