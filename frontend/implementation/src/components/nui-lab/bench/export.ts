/**
 * Export + re-analysis of benchmark sessions.
 *
 * `SessionAnalyzer` re-derives every per-trial and per-group summary from the RAW records, so
 *  - the file written at export time carries summaries that are re-computable by anyone from the same file, and
 *  - `reanalyzeExport()` can prove a stored summary matches its raw frames (tested).
 *
 * Groups never mix engines: the key is engine × preprocess × detector × source × scenario.
 */
import { TrialAggregator } from "./stats";
import type { BenchStore, StoredTrial } from "./store";
import {
  BENCH_EXPORT_SCHEMA,
  type BenchEvent,
  type BenchFrame,
  type PerfSample,
  type SessionMeta,
  type TrialMeta,
  type TrialSummary,
} from "./schema";

export interface GroupSummary {
  key: {
    engineId: string;
    preprocess: string;
    detector: string;
    source: string;
    scenario: string;
  };
  trialIds: string[];
  summary: TrialSummary;
}

export interface SessionAnalysis {
  trialSummaries: Record<string, TrialSummary>;
  groups: GroupSummary[];
  problems: string[];
  frameCount: number;
  eventCount: number;
  perfCount: number;
}

export const groupKeyOf = (m: TrialMeta): GroupSummary["key"] => ({
  engineId: m.engine.engineId,
  preprocess: m.engine.preprocess,
  detector: m.engine.detector,
  source: m.source,
  scenario: m.scenario,
});
const groupId = (k: GroupSummary["key"]): string => `${k.engineId}|${k.preprocess}|${k.detector}|${k.source}|${k.scenario}`;

export class SessionAnalyzer {
  private trials = new Map<string, TrialMeta>();
  private perTrial = new Map<string, TrialAggregator>();
  private groups = new Map<string, { key: GroupSummary["key"]; agg: TrialAggregator; ids: string[] }>();
  private lastTrialByGroup = new Map<string, string>();
  private problems: string[] = [];
  private lastT = -Infinity;
  private frames = 0;
  private events = 0;
  private perfN = 0;

  constructor(trialMetas: TrialMeta[]) {
    for (const m of trialMetas) {
      this.trials.set(m.trialId, m);
      this.perTrial.set(m.trialId, new TrialAggregator(m.trialId));
      const key = groupKeyOf(m);
      const gid = groupId(key);
      let g = this.groups.get(gid);
      if (!g) {
        g = { key, agg: new TrialAggregator(gid), ids: [] };
        this.groups.set(gid, g);
      }
      g.ids.push(m.trialId);
    }
  }

  private route(trialId: string | null, fn: (a: TrialAggregator) => void): boolean {
    if (!trialId) return false;
    const meta = this.trials.get(trialId);
    const t = this.perTrial.get(trialId);
    if (!meta || !t) {
      this.problems.push(`record references unknown trial ${trialId}`);
      return false;
    }
    fn(t);
    const gid = groupId(groupKeyOf(meta));
    const g = this.groups.get(gid)!;
    if (this.lastTrialByGroup.get(gid) !== trialId) {
      g.agg.breakContinuity();
      this.lastTrialByGroup.set(gid, trialId);
    }
    fn(g.agg);
    return true;
  }

  addFrame(f: BenchFrame): void {
    this.frames++;
    if (typeof f.t === "number") {
      if (f.t < this.lastT) this.problems.push(`frame time goes backwards at fid ${f.fid} (${f.t} < ${this.lastT})`);
      this.lastT = Math.max(this.lastT, f.t);
    }
    this.route(f.trialId, (a) => a.addFrame(f));
  }
  addEvent(e: BenchEvent): void {
    this.events++;
    this.route(e.trialId, (a) => a.addEvent(e));
  }
  addPerf(_p: PerfSample): void {
    this.perfN++;
  }

  result(): SessionAnalysis {
    const trialSummaries: Record<string, TrialSummary> = {};
    for (const [id, a] of this.perTrial) trialSummaries[id] = a.summary();
    const groups: GroupSummary[] = [...this.groups.values()].map((g) => ({ key: g.key, trialIds: g.ids, summary: g.agg.summary() }));
    return { trialSummaries, groups, problems: [...this.problems], frameCount: this.frames, eventCount: this.events, perfCount: this.perfN };
  }
}

export interface SessionBundle {
  meta: SessionMeta;
  trials: StoredTrial[];
  frames: BenchFrame[];
  events: BenchEvent[];
  perf: PerfSample[];
}

export async function readBundle(store: BenchStore, sessionId: string): Promise<SessionBundle> {
  const meta = await store.getSession(sessionId);
  if (!meta) throw new Error(`Sesi ${sessionId} tidak ditemukan`);
  const trials = await store.listTrials(sessionId);
  const frames: BenchFrame[] = [];
  const events: BenchEvent[] = [];
  const perf: PerfSample[] = [];
  await store.iterateChunks(sessionId, "frames", (c) => frames.push(...(c.items as BenchFrame[])));
  await store.iterateChunks(sessionId, "events", (c) => events.push(...(c.items as BenchEvent[])));
  await store.iterateChunks(sessionId, "perf", (c) => perf.push(...(c.items as PerfSample[])));
  return { meta, trials, frames, events, perf };
}

export function analyzeBundle(b: SessionBundle): SessionAnalysis {
  const an = new SessionAnalyzer(b.trials.map((t) => t.meta));
  for (const f of b.frames) an.addFrame(f);
  for (const e of b.events) an.addEvent(e);
  for (const p of b.perf) an.addPerf(p);
  return an.result();
}

export type PhysicalWebcamEvidence = "PHYSICAL_PRESUMED_TESTER_RUN" | "VIRTUAL_OR_SIMULATED_SUSPECTED" | "UNKNOWN";

export function validationFor(meta: SessionMeta, trials: TrialMeta[], analysis: SessionAnalysis): Record<string, unknown> {
  const classes = [...new Set(trials.map((t) => t.camera.deviceClass))];
  let evidence: PhysicalWebcamEvidence = "UNKNOWN";
  if (classes.includes("virtual-suspected")) evidence = "VIRTUAL_OR_SIMULATED_SUSPECTED";
  else if (classes.length > 0 && classes.every((c) => c === "physical-presumed")) evidence = "PHYSICAL_PRESUMED_TESTER_RUN";
  const problems = [...analysis.problems];
  if (meta.status === "interrupted" || meta.status === "aborted") problems.push(`session status ${meta.status}: ${meta.statusReason ?? ""}`.trim());
  const dropped = meta.droppedRecords.frames + meta.droppedRecords.events + meta.droppedRecords.perf;
  if (dropped > 0) problems.push(`${dropped} record(s) dropped by the writer (see meta.droppedRecords)`);
  if (meta.storageFailures > 0) problems.push(`${meta.storageFailures} storage write failure(s)`);
  const unverified = trials.filter((t) => !t.engine.modelHashVerified).map((t) => t.trialId);
  if (unverified.length) problems.push(`model hash not verified in ${unverified.length} trial(s)`);
  return {
    schemaOk: analysis.problems.length === 0,
    status: meta.status,
    problems,
    physicalWebcamEvidence: evidence,
    cameraDeviceClasses: classes,
    note:
      "Device class is a heuristic from the camera name (name not stored). PHYSICAL_PRESUMED does not prove the night scenarios were run correctly; the Owner's N1..N6 notes and tester labels are the ground truth.",
    framesReconciled: analysis.frameCount,
    eventsReconciled: analysis.eventCount,
    droppedRecords: meta.droppedRecords,
    storageFailures: meta.storageFailures,
    trialsWithUnverifiedModelHash: unverified,
  };
}

export interface ExportInfo {
  app: { version: string; gitCommit: string };
  exportedAtMinuteIso: string;
}

const j = (v: unknown): string => JSON.stringify(v);

/** Stream a whole session into Blob parts: header, analysis, then raw arrays chunk by chunk. */
async function sessionParts(store: BenchStore, meta: SessionMeta): Promise<string[]> {
  const trials = await store.listTrials(meta.sessionId);
  const metas = trials.map((t) => t.meta);
  const an = new SessionAnalyzer(metas);
  await store.iterateChunks(meta.sessionId, "frames", (c) => (c.items as BenchFrame[]).forEach((f) => an.addFrame(f)));
  await store.iterateChunks(meta.sessionId, "events", (c) => (c.items as BenchEvent[]).forEach((e) => an.addEvent(e)));
  await store.iterateChunks(meta.sessionId, "perf", (c) => (c.items as PerfSample[]).forEach((p) => an.addPerf(p)));
  const analysis = an.result();
  const { heartbeatEpochMs: _hb, ...publicMeta } = meta;
  void _hb;
  const parts: string[] = [];
  parts.push(`{"meta":${j(publicMeta)},`);
  parts.push(`"trials":${j(trials.map((t) => ({ meta: t.meta, summary: analysis.trialSummaries[t.meta.trialId] ?? t.summary })))},`);
  parts.push(`"benchmarkSummary":${j({ note: "Groups never mix engines, preprocess modes, detectors, sources or scenarios.", groups: analysis.groups })},`);
  parts.push(`"validation":${j(validationFor(meta, metas, analysis))},`);
  for (const kind of ["events", "perf", "frames"] as const) {
    parts.push(`"${kind}":[\n`);
    let first = true;
    await store.iterateChunks(meta.sessionId, kind, (c) => {
      const body = (c.items as unknown[]).map((x) => j(x)).join(",\n");
      if (body.length === 0) return;
      parts.push((first ? "" : ",\n") + body);
      first = false;
    });
    parts.push(kind === "frames" ? "\n]}" : "\n],");
  }
  return parts;
}

export async function buildExportBlob(store: BenchStore, sessionIds: string[], info: ExportInfo): Promise<Blob> {
  const parts: string[] = [];
  parts.push(
    `{"schema":${j(BENCH_EXPORT_SCHEMA)},"exportedAtMinuteIso":${j(info.exportedAtMinuteIso)},"app":${j(info.app)},` +
      `"contains":"numeric landmarks, rule readings, timings and counters only; no video, no images, no audio, no face data, no identity, no device name",` +
      `"howToAnalyse":"Each session carries benchmarkSummary (per engine/preprocess/scenario group) and validation. All summaries are re-derivable from sessions[].frames/events using the same aggregation (see reanalyzeExport in bench/export.ts).",` +
      `"sessions":[\n`,
  );
  let first = true;
  for (const id of sessionIds) {
    const meta = await store.getSession(id);
    if (!meta) continue;
    if (!first) parts.push(",\n");
    first = false;
    parts.push(...(await sessionParts(store, meta)));
  }
  parts.push("\n]}\n");
  return new Blob(parts, { type: "application/json" });
}

const CSV_COLS = [
  "sessionId",
  "trialId",
  "index",
  "source",
  "route",
  "scenario",
  "engineId",
  "preprocess",
  "detector",
  "modelHashVerified",
  "frames",
  "durationMs",
  "detectHzMean",
  "missingHandRate",
  "handLossEvents",
  "reacquisitions",
  "mpMsP50",
  "mpMsP95",
  "preMsP95",
  "pipelineMsP95",
  "keydowns",
  "releaseAlls",
  "labelledFrames",
  "falsePressFrames",
  "missedPressFrames",
  "strokes",
  "unexpectedStrokeBreaks",
  "eraseActions",
  "undo",
  "redo",
  "warnings",
] as const;

const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function buildSummaryCsv(store: BenchStore, sessionIds: string[]): Promise<string> {
  const rows: string[] = [CSV_COLS.join(",")];
  for (const id of sessionIds) {
    const meta = await store.getSession(id);
    if (!meta) continue;
    const trials = await store.listTrials(id);
    const an = new SessionAnalyzer(trials.map((t) => t.meta));
    await store.iterateChunks(id, "frames", (c) => (c.items as BenchFrame[]).forEach((f) => an.addFrame(f)));
    await store.iterateChunks(id, "events", (c) => (c.items as BenchEvent[]).forEach((e) => an.addEvent(e)));
    const res = an.result();
    for (const t of trials) {
      const s = res.trialSummaries[t.meta.trialId]!;
      const row: Record<(typeof CSV_COLS)[number], unknown> = {
        sessionId: id,
        trialId: t.meta.trialId,
        index: t.meta.index,
        source: t.meta.source,
        route: t.meta.route,
        scenario: t.meta.scenario,
        engineId: t.meta.engine.engineId,
        preprocess: t.meta.engine.preprocess,
        detector: t.meta.engine.detector,
        modelHashVerified: t.meta.engine.modelHashVerified,
        frames: s.frames,
        durationMs: s.durationMs,
        detectHzMean: s.detectHzMean,
        missingHandRate: s.missingHandRate,
        handLossEvents: s.handLossEvents,
        reacquisitions: s.reacquisitions,
        mpMsP50: s.mpMs.p50,
        mpMsP95: s.mpMs.p95,
        preMsP95: s.preMs.p95,
        pipelineMsP95: s.pipelineMs.p95,
        keydowns: s.gesture.keydowns,
        releaseAlls: s.gesture.releaseAlls,
        labelledFrames: s.gesture.labelledFrames,
        falsePressFrames: s.gesture.falsePressFrames,
        missedPressFrames: s.gesture.missedPressFrames,
        strokes: s.canvas.strokes,
        unexpectedStrokeBreaks: s.canvas.unexpectedStrokeBreaks,
        eraseActions: s.canvas.eraseActions,
        undo: s.canvas.undo,
        redo: s.canvas.redo,
        warnings: s.warnings.join(" | "),
      };
      rows.push(CSV_COLS.map((c) => csvCell(row[c])).join(","));
    }
  }
  return rows.join("\n") + "\n";
}

interface ParsedExport {
  schema?: string;
  sessions?: Array<{
    meta?: SessionMeta;
    trials?: Array<{ meta: TrialMeta; summary: TrialSummary | null }>;
    frames?: BenchFrame[];
    events?: BenchEvent[];
    perf?: PerfSample[];
    benchmarkSummary?: { groups?: GroupSummary[] };
    validation?: Record<string, unknown>;
  }>;
}

/** Structural validation of an export; returns problems (empty = ok). */
export function validateExportFile(file: unknown): string[] {
  const problems: string[] = [];
  const f = file as ParsedExport | null;
  if (!f || typeof f !== "object") return ["not an object"];
  if (f.schema !== BENCH_EXPORT_SCHEMA) problems.push("schema");
  if (!Array.isArray(f.sessions)) return [...problems, "sessions"];
  f.sessions.forEach((s, si) => {
    if (!s.meta || s.meta.consent?.numericRecording !== true) problems.push(`session ${si}: consent flag missing`);
    if (!Array.isArray(s.trials)) problems.push(`session ${si}: trials`);
    if (!Array.isArray(s.frames)) problems.push(`session ${si}: frames`);
    if (!Array.isArray(s.events)) problems.push(`session ${si}: events`);
    if (!s.validation) problems.push(`session ${si}: validation`);
    for (const fr of s.frames ?? []) {
      if (fr.lm !== null && (fr.lm.length !== 21 || fr.lm.some((p) => p.length !== 2))) {
        problems.push(`session ${si}: frame ${fr.fid} landmarks`);
        break;
      }
    }
  });
  return problems;
}

/** Re-derive all summaries from the raw arrays of an exported file and compare with what the file claims. */
export function reanalyzeExport(file: unknown): { ok: boolean; mismatches: string[]; sessions: SessionAnalysis[] } {
  const f = file as ParsedExport;
  const mismatches: string[] = [];
  const out: SessionAnalysis[] = [];
  for (const s of f.sessions ?? []) {
    const bundle: SessionBundle = {
      meta: s.meta!,
      trials: (s.trials ?? []).map((t) => ({ meta: t.meta, summary: t.summary })),
      frames: s.frames ?? [],
      events: s.events ?? [],
      perf: s.perf ?? [],
    };
    const res = analyzeBundle(bundle);
    out.push(res);
    for (const t of s.trials ?? []) {
      const fresh = res.trialSummaries[t.meta.trialId];
      if (!t.summary || !fresh) {
        mismatches.push(`${t.meta.trialId}: summary missing`);
        continue;
      }
      if (JSON.stringify(fresh) !== JSON.stringify(t.summary)) mismatches.push(`${t.meta.trialId}: stored summary differs from re-analysis`);
    }
    const stored = s.benchmarkSummary?.groups ?? [];
    if (JSON.stringify(stored) !== JSON.stringify(res.groups)) mismatches.push(`${s.meta?.sessionId}: group summaries differ from re-analysis`);
  }
  return { ok: mismatches.length === 0, mismatches, sessions: out };
}

