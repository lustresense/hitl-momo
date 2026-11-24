/**
 * Export + v1/v2 reader + re-analysis of benchmark sessions (Contract K8).
 *
 * `SessionAnalyzer` re-derives every per-trial and per-group summary from the RAW records, so
 *  - the file written at export time carries summaries that are re-computable by anyone from the same file, and
 *  - `reanalyzeExport()` proves a stored summary matches its raw frames/events/perf (tested for both v1 and v2).
 *
 * Exports include SHA-256 `contentSha256` over the serialized `sessions` payload, exact git commit/branch, and
 * verified model SHA-256 inventory. Groups never mix engines: key is engine × preprocess × detector × source × scenario.
 */
import { computeSha256Hex } from "./engines";
import { TrialAggregator } from "./stats";
import type { BenchStore, StoredTrial } from "./store";
import {
  BENCH_EXPORT_SCHEMA,
  BENCH_EXPORT_SCHEMA_V1,
  BENCH_EXPORT_SCHEMA_V2_1,
  BENCH_EXPORT_SCHEMA_V2_2,
  BENCH_EXPORT_SUPPORTED_SCHEMAS,
  LABEL_SOURCES,
  type BenchEvent,
  type BenchFrame,
  type BenchFrameInput,
  type LabelSource,
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
      this.perTrial.set(m.trialId, new TrialAggregator(m.trialId, m.endReason ?? null, m.route));
      const key = groupKeyOf(m);
      const gid = groupId(key);
      let g = this.groups.get(gid);
      if (!g) {
        g = { key, agg: new TrialAggregator(gid, null, m.route), ids: [] };
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

  addFrame(f: BenchFrameInput): void {
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

  addPerf(p: PerfSample): void {
    this.perfN++;
    this.route(p.trialId, (a) => a.addPerf(p));
  }

  result(): SessionAnalysis {
    const trialSummaries: Record<string, TrialSummary> = {};
    for (const [id, a] of this.perTrial) trialSummaries[id] = a.summary();
    const groups: GroupSummary[] = [...this.groups.values()].map((g) => ({
      key: g.key,
      trialIds: g.ids,
      summary: g.agg.summary(),
    }));
    return {
      trialSummaries,
      groups,
      problems: [...this.problems],
      frameCount: this.frames,
      eventCount: this.events,
      perfCount: this.perfN,
    };
  }
}

export interface SessionBundle {
  meta: SessionMeta;
  trials: StoredTrial[];
  frames: BenchFrameInput[];
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
  if (meta.status === "interrupted" || meta.status === "aborted") {
    problems.push(`session status ${meta.status}: ${meta.statusReason ?? ""}`.trim());
  }
  const dropped = meta.droppedRecords.frames + meta.droppedRecords.events + meta.droppedRecords.perf;
  if (dropped > 0) problems.push(`${dropped} record(s) dropped by the writer (see meta.droppedRecords)`);
  if (meta.storageFailures > 0) problems.push(`${meta.storageFailures} storage write failure(s)`);
  const unverified = trials.filter((t) => !t.engine.modelHashVerified).map((t) => t.trialId);
  if (unverified.length) problems.push(`model hash not verified in ${unverified.length} trial(s)`);

  const summaries = Object.values(analysis.trialSummaries);
  const runtimeSetOptionsTotal = summaries.reduce((acc, s) => acc + s.runtimeSetOptionsCalls, 0);
  const independentGroundTruthAvailable = summaries.some((s) => s.independentGroundTruthAvailable);

  return {
    schemaOk: analysis.problems.length === 0,
    status: meta.status,
    problems,
    physicalWebcamEvidence: evidence,
    cameraDeviceClasses: classes,
    gitCommit: meta.app.gitCommit,
    gitBranch: meta.app.gitBranch ?? null,
    independentGroundTruthAvailable,
    runtimeSetOptionsCallsTotal: runtimeSetOptionsTotal,
    note:
      "Device class is a heuristic from the camera name (name not stored). Auto condition tags are RULE_DERIVED post-AE sensor proxies, never factual room lux measurements or independent ground truth.",
    framesReconciled: analysis.frameCount,
    eventsReconciled: analysis.eventCount,
    droppedRecords: meta.droppedRecords,
    storageFailures: meta.storageFailures,
    trialsWithUnverifiedModelHash: unverified,
  };
}

export interface ExportInfo {
  app: { version: string; gitCommit: string; gitBranch?: string };
  exportedAtMinuteIso: string;
}

export interface ModelInventoryEntry {
  engineId: string;
  actualModelId: string;
  modelSha256: string;
  modelHashVerified: boolean;
  modelBytes: number;
  isTrainedR22Model: boolean;
}

const j = (v: unknown): string => JSON.stringify(v);

/** Stream a whole session into JSON string parts: header, analysis, then raw arrays chunk by chunk. */
async function sessionParts(
  store: BenchStore,
  meta: SessionMeta,
  inventoryOut: Map<string, ModelInventoryEntry>,
): Promise<string[]> {
  const trials = await store.listTrials(meta.sessionId);
  const metas = trials.map((t) => t.meta);
  for (const m of metas) {
    const key = `${m.engine.engineId}|${m.engine.modelSha256}|${m.engine.modelHashVerified}`;
    if (!inventoryOut.has(key)) {
      inventoryOut.set(key, {
        engineId: m.engine.engineId,
        actualModelId: m.engine.actualModelId ?? m.engine.engineId,
        modelSha256: m.engine.modelSha256,
        modelHashVerified: m.engine.modelHashVerified,
        modelBytes: m.engine.modelBytes,
        isTrainedR22Model: Boolean(m.engine.isTrainedR22Model),
      });
    }
  }
  const an = new SessionAnalyzer(metas);
  await store.iterateChunks(meta.sessionId, "frames", (c) => (c.items as BenchFrameInput[]).forEach((f) => an.addFrame(f)));
  await store.iterateChunks(meta.sessionId, "events", (c) => (c.items as BenchEvent[]).forEach((e) => an.addEvent(e)));
  await store.iterateChunks(meta.sessionId, "perf", (c) => (c.items as PerfSample[]).forEach((p) => an.addPerf(p)));
  const analysis = an.result();
  const { heartbeatEpochMs: _hb, ...publicMeta } = meta;
  void _hb;
  const enrichedTrials = trials.map((t) => {
    const sum = analysis.trialSummaries[t.meta.trialId] ?? t.summary;
    const enrichedMeta: TrialMeta = {
      ...t.meta,
      autoConditionTags: sum?.autoConditionTags ?? t.meta.autoConditionTags ?? [],
      autoConditionTagsSource: "RULE_DERIVED",
      independentGroundTruthAvailable: sum?.independentGroundTruthAvailable ?? false,
    };
    return { meta: enrichedMeta, summary: sum };
  });
  const parts: string[] = [];
  parts.push(`{"meta":${j(publicMeta)},`);
  parts.push(`"trials":${j(enrichedTrials)},`);
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
  const sessionChunks: string[] = ["[\n"];
  const inventory = new Map<string, ModelInventoryEntry>();
  let first = true;
  for (const id of sessionIds) {
    const meta = await store.getSession(id);
    if (!meta) continue;
    if (!first) sessionChunks.push(",\n");
    first = false;
    sessionChunks.push(...(await sessionParts(store, meta, inventory)));
  }
  sessionChunks.push("\n]");
  const sessionsPayload = sessionChunks.join("");
  const contentSha256 = await computeSha256Hex(sessionsPayload);
  const modelInventory = [...inventory.values()];

  const header =
    `{"schema":${j(BENCH_EXPORT_SCHEMA)},"schemaVersion":${j(BENCH_EXPORT_SCHEMA_V2_2)},"contractVersion":"K8-v2.2","exportedAtMinuteIso":${j(info.exportedAtMinuteIso)},"app":${j(info.app)},` +
    `"modelInventory":${j(modelInventory)},` +
    `"checksumScope":"sessions-json-utf8","contentSha256":${j(contentSha256)},` +
    `"contains":"numeric landmarks, rule readings, timings, quality proxies, action intents, and labelSource provenance only; no video, no images, no audio, no face data, no identity, no device name",` +
    `"howToAnalyse":"Each session carries benchmarkSummary (per engine/preprocess/scenario group) and validation. All summaries are re-derivable from sessions[].frames/events/perf using the same aggregation (see reanalyzeExport in bench/export.ts).",` +
    `"sessions":`;

  return new Blob([header, sessionsPayload, "}\n"], { type: "application/json" });
}

/** Extracts the raw `"sessions":[...]` JSON array slice and verifies its SHA-256 against `contentSha256`. */
export async function verifyExportChecksum(
  jsonText: string,
): Promise<{ ok: boolean; expected: string | null; actual: string | null; reason?: string }> {
  let parsed: ParsedExport;
  try {
    parsed = JSON.parse(jsonText) as ParsedExport;
  } catch {
    return { ok: false, expected: null, actual: null, reason: "invalid-json" };
  }
  if (parsed.schema === BENCH_EXPORT_SCHEMA_V1) {
    return { ok: true, expected: null, actual: null, reason: "v1-no-checksum" };
  }
  const expected = typeof parsed.contentSha256 === "string" ? parsed.contentSha256 : null;
  if (!expected) {
    return { ok: false, expected: null, actual: null, reason: "missing-contentSha256" };
  }
  const marker = '"sessions":';
  const idx = jsonText.indexOf(marker);
  if (idx < 0) {
    return { ok: false, expected, actual: null, reason: "missing-sessions-slice" };
  }
  const arrStart = jsonText.indexOf("[", idx + marker.length);
  const arrEnd = jsonText.lastIndexOf("]");
  if (arrStart < 0 || arrEnd <= arrStart) {
    return { ok: false, expected, actual: null, reason: "malformed-sessions-slice" };
  }
  const sessionsSlice = jsonText.slice(arrStart, arrEnd + 1);
  const actual = await computeSha256Hex(sessionsSlice);
  return {
    ok: actual === expected,
    expected,
    actual,
    ...(actual === expected ? {} : { reason: "checksum-mismatch" }),
  };
}

const CSV_COLS = [
  "sessionId",
  "trialId",
  "index",
  "source",
  "route",
  "scenario",
  "endReason",
  "engineId",
  "actualModelId",
  "modelSha256",
  "gitCommit",
  "preprocess",
  "detector",
  "modelHashVerified",
  "independentGroundTruthAvailable",
  "frames",
  "durationMs",
  "detectHzMean",
  "missingHandRate",
  "rawNoHandRate",
  "activeWindowFrames",
  "activeWindowMissRate",
  "flickerStreaks_1_3",
  "shortLossStreaks_4_15",
  "longAbsenceStreaks_gt15",
  "hiddenDurationMs",
  "duplicateFrameSkippedCount",
  "runtimeSetOptionsCalls",
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
  "continuedStrokesAfterGrace",
  "eraseActions",
  "undo",
  "redo",
  "autoConditionTags",
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
    await store.iterateChunks(id, "frames", (c) => (c.items as BenchFrameInput[]).forEach((f) => an.addFrame(f)));
    await store.iterateChunks(id, "events", (c) => (c.items as BenchEvent[]).forEach((e) => an.addEvent(e)));
    await store.iterateChunks(id, "perf", (c) => (c.items as PerfSample[]).forEach((p) => an.addPerf(p)));
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
        endReason: s.endReason,
        engineId: t.meta.engine.engineId,
        actualModelId: t.meta.engine.actualModelId ?? t.meta.engine.engineId,
        modelSha256: t.meta.engine.modelSha256,
        gitCommit: meta.app.gitCommit,
        preprocess: t.meta.engine.preprocess,
        detector: t.meta.engine.detector,
        modelHashVerified: t.meta.engine.modelHashVerified,
        independentGroundTruthAvailable: s.independentGroundTruthAvailable,
        frames: s.frames,
        durationMs: s.durationMs,
        detectHzMean: s.detectHzMean,
        missingHandRate: s.missingHandRate,
        rawNoHandRate: s.rawNoHandRate,
        activeWindowFrames: s.activeWindow.frames,
        activeWindowMissRate: s.activeWindowMissRate,
        flickerStreaks_1_3: s.flickerStreaks_1_3,
        shortLossStreaks_4_15: s.shortLossStreaks_4_15,
        longAbsenceStreaks_gt15: s.longAbsenceStreaks_gt15,
        hiddenDurationMs: s.hiddenDurationMs,
        duplicateFrameSkippedCount: s.duplicateFrameSkippedCount,
        runtimeSetOptionsCalls: s.runtimeSetOptionsCalls,
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
        continuedStrokesAfterGrace: s.canvas.continuedStrokesAfterGrace,
        eraseActions: s.canvas.eraseActions,
        undo: s.canvas.undo,
        redo: s.canvas.redo,
        autoConditionTags: s.autoConditionTags.join(" | "),
        warnings: s.warnings.join(" | "),
      };
      rows.push(CSV_COLS.map((c) => csvCell(row[c])).join(","));
    }
  }
  return rows.join("\n") + "\n";
}

export interface ParsedExport {
  schema?: string;
  schemaVersion?: string;
  exportedAtMinuteIso?: string;
  app?: { version: string; gitCommit: string; gitBranch?: string };
  modelInventory?: ModelInventoryEntry[];
  checksumScope?: string;
  contentSha256?: string;
  sessions?: Array<{
    meta?: SessionMeta;
    trials?: Array<{ meta: TrialMeta; summary: TrialSummary | Record<string, unknown> | null }>;
    frames?: BenchFrameInput[];
    events?: BenchEvent[];
    perf?: PerfSample[];
    benchmarkSummary?: { groups?: Array<{ key: GroupSummary["key"]; trialIds: string[]; summary: unknown }> };
    validation?: Record<string, unknown>;
  }>;
}

const VALID_LABEL_SOURCES: ReadonlySet<string> = new Set<LabelSource>(LABEL_SOURCES);

/** Parse a v1 or v2 export JSON string or object cleanly. */
export function parseExportFile(input: string | unknown): ParsedExport {
  if (typeof input === "string") {
    return JSON.parse(input) as ParsedExport;
  }
  return input as ParsedExport;
}

/** Structural validation of a v1 or v2 export; returns problems (empty = ok). */
export function validateExportFile(fileOrJson: unknown): string[] {
  const problems: string[] = [];
  let f: ParsedExport | null;
  if (typeof fileOrJson === "string") {
    try {
      f = JSON.parse(fileOrJson) as ParsedExport;
    } catch {
      return ["invalid json"];
    }
  } else {
    f = fileOrJson as ParsedExport | null;
  }
  if (!f || typeof f !== "object") return ["not an object"];
  const schema = f.schema ?? f.schemaVersion;
  if (!schema || !(BENCH_EXPORT_SUPPORTED_SCHEMAS as readonly string[]).includes(schema)) {
    problems.push("schema");
  }
  const isV2 =
    schema === BENCH_EXPORT_SCHEMA ||
    schema === BENCH_EXPORT_SCHEMA_V2_1 ||
    schema === BENCH_EXPORT_SCHEMA_V2_2;
  if (isV2) {
    if (typeof f.contentSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(f.contentSha256)) {
      problems.push("contentSha256");
    }
    if (!f.app?.gitCommit) problems.push("app.gitCommit");
  }
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
      if (isV2) {
        if (!fr.labelSource || !VALID_LABEL_SOURCES.has(fr.labelSource)) {
          problems.push(`session ${si}: frame ${fr.fid} missing/invalid labelSource`);
          break;
        }
        if (fr.det === "DETECTOR_MISS" && fr.nearWhiteHandPct !== null && fr.nearWhiteHandPct !== undefined) {
          problems.push(`session ${si}: frame ${fr.fid} nearWhiteHandPct must be null without hand bbox`);
          break;
        }
      }
    }
  });
  return problems;
}

/** Projects a v2 TrialSummary down to the v1 shape so historical v1 exports re-analyze without false mismatches. */
function projectV1Summary(s: TrialSummary): Record<string, unknown> {
  return {
    trialId: s.trialId,
    frames: s.frames,
    durationMs: s.durationMs,
    handFrames: s.handFrames,
    detectorMissFrames: s.detectorMissFrames,
    missingHandRate: s.missingHandRate,
    lockedFrames: s.lockedFrames,
    handLossEvents: s.handLossEvents,
    reacquisitions: s.reacquisitions,
    handCountHistogram: s.handCountHistogram,
    rejectReasons: s.rejectReasons,
    preprocessPasses: s.preprocessPasses,
    mpMs: s.mpMs,
    preMs: s.preMs,
    classifierMs: s.classifierMs,
    pipelineMs: s.pipelineMs,
    detectHzMean: s.detectHzMean,
    lumaMean: s.lumaMean,
    backlightFrames: s.backlightFrames,
    gesture: {
      keydowns: s.gesture.keydowns,
      keyups: s.gesture.keyups,
      releaseAlls: s.gesture.releaseAlls,
      heldFrames: s.gesture.heldFrames,
      labelledFrames: s.gesture.labelledFrames,
      falsePressFrames: s.gesture.falsePressFrames ?? 0,
      missedPressFrames: s.gesture.missedPressFrames ?? 0,
      confusion: s.gesture.confusion ?? {},
    },
    canvas: {
      strokes: s.canvas.strokes,
      strokePointsMean: s.canvas.strokePointsMean,
      strokePathPxMean: s.canvas.strokePathPxMean,
      strokeDurMsMean: s.canvas.strokeDurMsMean,
      unexpectedStrokeBreaks: s.canvas.unexpectedStrokeBreaks,
      gapFramesDuringStroke: s.canvas.gapFramesDuringStroke,
      eraseActions: s.canvas.eraseActions,
      eraseHits: s.canvas.eraseHits,
      eraseMisses: s.canvas.eraseMisses,
      undo: s.canvas.undo,
      redo: s.canvas.redo,
      actionsRejected: s.canvas.actionsRejected,
      pointerStrokes: s.canvas.pointerStrokes,
      gestureStrokes: s.canvas.gestureStrokes,
      actionLatencyMs: s.canvas.actionLatencyMs,
      jitterRawPx: s.canvas.jitterRawPx,
      jitterInkPx: s.canvas.jitterInkPx,
    },
    warnings: s.warnings.filter((w) => !w.startsWith("no-independent-ground-truth")),
  };
}

function normalizeV1StoredSummaryForCompare(tSummary: Record<string, unknown>, fresh: TrialSummary): boolean {
  const projected = projectV1Summary(fresh);
  // Historical v1 warning text for labelled === 0
  const v1Warn = "no-ground-truth-labels: confusion/false-press need tester labels";
  if (fresh.gesture.labelledFrames === 0 && Array.isArray(projected.warnings)) {
    const w = projected.warnings as string[];
    if (!w.includes(v1Warn)) w.push(v1Warn);
  }
  return JSON.stringify(projected) === JSON.stringify(tSummary);
}

/**
 * Re-derive all summaries from the raw arrays of a v1 or v2 exported file and compare with what the file claims.
 * Always produces full v2 `SessionAnalysis` (including activeWindow, streaks, invariants) in `sessions`.
 */
export function reanalyzeExport(file: unknown): { ok: boolean; mismatches: string[]; sessions: SessionAnalysis[] } {
  const f = parseExportFile(file);
  const isV1 = (f.schema ?? f.schemaVersion) === BENCH_EXPORT_SCHEMA_V1;
  const mismatches: string[] = [];
  const out: SessionAnalysis[] = [];
  for (const s of f.sessions ?? []) {
    const bundle: SessionBundle = {
      meta: s.meta!,
      trials: (s.trials ?? []).map((t) => ({ meta: t.meta, summary: (t.summary as TrialSummary | null) ?? null })),
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
      if (isV1) {
        if (!normalizeV1StoredSummaryForCompare(t.summary as Record<string, unknown>, fresh)) {
          mismatches.push(`${t.meta.trialId}: stored v1 summary differs from re-analysis`);
        }
      } else if (JSON.stringify(fresh) !== JSON.stringify(t.summary)) {
        mismatches.push(`${t.meta.trialId}: stored summary differs from re-analysis`);
      }
    }
    const stored = s.benchmarkSummary?.groups ?? [];
    if (isV1) {
      const projectedGroups = res.groups.map((g) => {
        const sV1 = projectV1Summary(g.summary);
        if (g.summary.gesture.labelledFrames === 0 && Array.isArray(sV1.warnings)) {
          (sV1.warnings as string[]).push("no-ground-truth-labels: confusion/false-press need tester labels");
        }
        return { key: g.key, trialIds: g.trialIds, summary: sV1 };
      });
      if (JSON.stringify(stored) !== JSON.stringify(projectedGroups)) {
        mismatches.push(`${s.meta?.sessionId}: v1 group summaries differ from re-analysis`);
      }
    } else if (JSON.stringify(stored) !== JSON.stringify(res.groups)) {
      mismatches.push(`${s.meta?.sessionId}: group summaries differ from re-analysis`);
    }
  }
  return { ok: mismatches.length === 0, mismatches, sessions: out };
}
