"use client";

/**
 * Shared UI components for the NUI Lab Benchmark Session Recorder:
 *  - `BenchDashboard` (used on /nui-lab landing): full configuration, consent, start/finish, export, local delete,
 *    live KPIs, per-trial R19 vs R20 comparison table, and recovered previous sessions from IndexedDB.
 *  - `BenchSessionBar` (used on /nui-lab/gesture, /nui-lab/canvas, /nui-lab/diagnostics): compact always-visible bar
 *    showing active recording state, engine/preprocess/detector switches, scenario/truth labels, finish & download.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { getLabBenchConfig, canUseCpuWorker, type LabBenchConfig } from "./config";
import { ENGINE_IDS, ENGINE_SPECS, PREPROCESS_LABELS } from "./engines";
import { collectNonIdentifyingEnvironment, getAppBuildInfo } from "./env";
import { getBenchManager, type BenchState, type TrialRow } from "./manager";
import { SCENARIOS, type EngineId, type PreprocessMode, type Scenario } from "./schema";
import { TRUTH_LABELS, type TruthLabel } from "../lab-recorder";

const PREPROCESS_MODES: PreprocessMode[] = ["a4", "raw", "clahe"];

export const SCENARIO_LABELS: Record<Scenario, string> = {
  UNSPECIFIED: "Belum ditentukan",
  N1_single_room_lamp: "N1 · Lampu ruangan tunggal",
  N2_laptop_screen_only: "N2 · Cahaya layar laptop saja",
  N3_backlight_behind_shoulder: "N3 · Backlight di belakang bahu",
  N4_far_80_100cm: "N4 · Jarak jauh (80–100 cm)",
  N5_second_person_behind: "N5 · Orang kedua lewat di belakang",
  N6_scratch_head_face_phone: "N6 · Garuk wajah/kepala & pegang HP (60 dtk)",
  DAYLIGHT_BASELINE: "Cahaya siang / ruangan terang (baseline)",
  CUSTOM: "Skenario khusus (isi catatan)",
};

export function useBenchLifecycleHooks(): void {
  const mgr = getBenchManager();
  useEffect(() => {
    void mgr.init();
    const onPageHide = () => {
      mgr.markInterrupted("pagehide");
    };
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        mgr.resumeAfterPageShow();
      }
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [mgr]);
}

export function useBenchState(): BenchState {
  const mgr = getBenchManager();
  useBenchLifecycleHooks();
  return useSyncExternalStore(mgr.subscribe, mgr.getSnapshot, mgr.getSnapshot);
}

export function useLabBenchConfig(): LabBenchConfig {
  const store = getLabBenchConfig();
  useEffect(() => {
    store.hydrate();
  }, [store]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fmtNum = (v: number | null | undefined, suffix = "", digits = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

const fmtPct = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;

const fmtBytes = (b: number | null): string => {
  if (b === null || !Number.isFinite(b)) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

function statusBadgeText(st: BenchState): string {
  if (st.phase === "active") return `MEREKAM · ${st.sessionId}`;
  if (st.phase === "finished") return `SELESAI · ${st.sessionId}`;
  if (st.previousSessions.some((s) => s.status === "interrupted")) return "ADA SESI TERPUTUS TERSIMPAN";
  return "SIAP (BELUM MEREKAM)";
}

/**
 * Full Benchmark Session Dashboard on `/nui-lab`.
 */
export function BenchDashboard() {
  const st = useBenchState();
  const cfg = useLabBenchConfig();
  const mgr = getBenchManager();
  const cfgStore = getLabBenchConfig();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState(st.scenarioNote);
  const workerSupported = canUseCpuWorker();

  useEffect(() => {
    setNoteDraft(st.scenarioNote);
  }, [st.scenarioNote]);

  const totalSessionsStored = (st.phase === "active" ? 1 : 0) + st.previousSessions.length;
  const hasExportableData = st.counters.frames > 0 || st.trialCount > 0 || st.previousSessions.length > 0;

  const handleStart = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const id = await mgr.startSession({
        consent,
        app: getAppBuildInfo(),
        environment: collectNonIdentifyingEnvironment(),
      });
      setFeedback(`Sesi benchmark ${id} aktif. Buka Gesture Lab atau Canvas Lab lalu nyalakan kamera untuk merekam otomatis.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await mgr.finishSession("finished-by-tester");
      setFeedback("Sesi benchmark selesai dan disimpan di IndexedDB. Tekan Unduh Semua Hasil Sesi untuk mengekspor.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportJson = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const blob = await mgr.exportAll(getAppBuildInfo());
      const tag = st.sessionId ?? "all";
      triggerBlobDownload(blob, `nui-lab-benchmark-${tag}.json`);
      setFeedback(`File JSON lengkap diunduh (${fmtBytes(blob.size)}).`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const blob = await mgr.exportSummaryCsv();
      const tag = st.sessionId ?? "all";
      triggerBlobDownload(blob, `nui-lab-benchmark-summary-${tag}.csv`);
      setFeedback(`Ringkasan CSV diunduh (${fmtBytes(blob.size)}).`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await mgr.deleteAllLocalData();
      setConsent(false);
      setFeedback("Seluruh data benchmark lokal telah dihapus.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const totalGestureKd = st.trials.reduce((acc, t) => acc + t.summary.gesture.keydowns, 0);
  const totalGestureRel = st.trials.reduce((acc, t) => acc + t.summary.gesture.releaseAlls, 0);
  const totalCanvasStrokes = st.trials.reduce((acc, t) => acc + t.summary.canvas.strokes, 0);
  const totalCanvasBreaks = st.trials.reduce((acc, t) => acc + t.summary.canvas.unexpectedStrokeBreaks, 0);
  const totalFrames = st.trials.reduce((acc, t) => acc + t.summary.frames, 0);
  const totalMissFrames = st.trials.reduce((acc, t) => acc + t.summary.detectorMissFrames, 0);
  const overallMissingRate = totalFrames > 0 ? totalMissFrames / totalFrames : null;

  return (
    <section className="nui-lab__panel nui-lab__bench-dash" data-testid="bench-dashboard" aria-label="Dasbor Benchmark NUI Lab">
      <div className="nui-lab__info-head">
        <h2>Sesi Benchmark NUI Lab (R19 vs R20 · CPU-Only)</h2>
        <span
          className={`nui-lab__pill ${
            st.phase === "active"
              ? "nui-lab__pill--ok"
              : st.warnings.length > 0 || st.droppedRecords > 0
                ? "nui-lab__pill--warn"
                : ""
          }`}
          data-testid="bench-status-pill"
        >
          {statusBadgeText(st)}
        </span>
      </div>

      <p className="nui-lab__muted">
        Rekam semua percobaan Gesture Lab dan Canvas Lab secara otomatis dalam satu sesi persisten lokal (IndexedDB).
        Hanya menyimpan angka landmark, telemetri aturan, dan metrik performa — <strong>tanpa video, gambar, audio, wajah, identitas, atau unggahan server</strong>.
      </p>

      {/* Preset & Configuration */}
      <div className="nui-lab__bench-config" data-testid="bench-config-panel">
        <div className="nui-lab__bench-group">
          <strong>1. Pilih Engine Model (tidak dicampur antar trial)</strong>
          <div className="nui-lab__choices" role="group" aria-label="Pilih engine model">
            {ENGINE_IDS.map((eid: EngineId) => {
              const spec = ENGINE_SPECS[eid];
              return (
                <button
                  key={eid}
                  type="button"
                  className="nui-lab__button"
                  aria-pressed={cfg.engineId === eid}
                  data-testid={`bench-engine-${eid}`}
                  onClick={() => cfgStore.update({ engineId: eid })}
                >
                  {spec.short} ({Math.round(spec.bytes / 1024)} KB)
                </button>
              );
            })}
          </div>
          <p className="nui-lab__muted">
            Aktif: <code>{ENGINE_SPECS[cfg.engineId].label}</code> · SHA-256: <code>{ENGINE_SPECS[cfg.engineId].sha256.slice(0, 12)}…</code>
          </p>
        </div>

        <div className="nui-lab__bench-group">
          <strong>2. Mode Preprocessing Cahaya &amp; Detektor CPU</strong>
          <div className="nui-lab__choices" role="group" aria-label="Mode preprocessing cahaya">
            {PREPROCESS_MODES.map((pm) => (
              <button
                key={pm}
                type="button"
                className="nui-lab__button"
                aria-pressed={cfg.preprocess === pm}
                data-testid={`bench-preprocess-${pm}`}
                onClick={() => cfgStore.update({ preprocess: pm })}
              >
                {pm.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              className="nui-lab__button"
              aria-pressed={cfg.detector === "cpu-worker"}
              disabled={!workerSupported}
              data-testid="bench-detector-cpu-worker"
              onClick={() => cfgStore.update({ detector: "cpu-worker" })}
            >
              CPU Web Worker (R20)
            </button>
            <button
              type="button"
              className="nui-lab__button"
              aria-pressed={cfg.detector === "cpu-main-thread"}
              data-testid="bench-detector-cpu-main-thread"
              onClick={() => cfgStore.update({ detector: "cpu-main-thread" })}
            >
              CPU Main-Thread
            </button>
          </div>
          <p className="nui-lab__muted">
            Preprocess: <code>{PREPROCESS_LABELS[cfg.preprocess]}</code> · Delegate: <code>CPU</code>
          </p>
        </div>

        <div className="nui-lab__bench-group">
          <strong>3. Skenario Uji (Matriks N1–N6)</strong>
          <div className="nui-lab__row">
            <label>
              Skenario:{" "}
              <select
                value={st.scenario}
                data-testid="bench-scenario-select"
                onChange={(e) => mgr.setScenario(e.target.value as Scenario, noteDraft)}
              >
                {SCENARIOS.map((sc) => (
                  <option key={sc} value={sc}>
                    {SCENARIO_LABELS[sc]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Catatan skenario (non-PII):{" "}
              <input
                type="text"
                value={noteDraft}
                maxLength={80}
                placeholder="mis. lampu meja 1x, jarak 90cm"
                data-testid="bench-scenario-note"
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => mgr.setScenario(st.scenario, noteDraft)}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Consent & Session Lifecycle Controls */}
      <div className="nui-lab__bench-consent-box">
        <label className="nui-lab__check">
          <input
            type="checkbox"
            checked={consent || st.phase === "active"}
            disabled={st.phase === "active" || busy}
            data-testid="bench-consent"
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Saya menyetujui perekaman <strong>data numerik lokal</strong> (21 landmark, status aturan gestur/kanvas, dan metrik performa) ke penyimpanan perangkat ini. Tidak merekam video/gambar/audio/wajah dan tidak mengunggah ke server.
          </span>
        </label>

        <div className="nui-lab__row">
          {st.phase !== "active" ? (
            <button
              type="button"
              className="nui-lab__button nui-lab__button--primary"
              disabled={!consent || busy}
              data-testid="bench-start"
              onClick={() => void handleStart()}
            >
              Mulai Sesi Benchmark
            </button>
          ) : (
            <button
              type="button"
              className="nui-lab__button nui-lab__button--primary"
              disabled={busy}
              data-testid="bench-finish"
              onClick={() => void handleFinish()}
            >
              Selesaikan Sesi
            </button>
          )}
          <button
            type="button"
            className="nui-lab__button"
            disabled={!hasExportableData || busy}
            data-testid="bench-export-json"
            onClick={() => void handleExportJson()}
          >
            Unduh Semua Hasil Sesi (JSON)
          </button>
          <button
            type="button"
            className="nui-lab__button"
            disabled={!hasExportableData || busy}
            data-testid="bench-export-csv"
            onClick={() => void handleExportCsv()}
          >
            Unduh Ringkasan (CSV)
          </button>
          <button
            type="button"
            className="nui-lab__button"
            disabled={(!hasExportableData && st.phase !== "active") || busy}
            data-testid="bench-delete-all"
            onClick={() => void handleDeleteAll()}
          >
            Hapus Data Lokal
          </button>
        </div>

        {feedback && (
          <p className="nui-lab__status" role="status" data-testid="bench-feedback">
            {feedback}
          </p>
        )}
      </div>

      {/* Live Telemetry Overview */}
      <dl className="nui-lab__numbers" data-testid="bench-kpis">
        <div className="nui-lab__stat">
          <dt>Penyimpanan lokal</dt>
          <dd>{st.storage === "indexeddb" ? "IndexedDB (persisten)" : st.storage === "memory-only" ? "Memori saja (non-persisten)" : "Memeriksa…"}</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Trial sesi ini / total sesi</dt>
          <dd>{st.trialCount} trial · {totalSessionsStored} sesi tersimpan</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Catatan tersimpan (frame / event)</dt>
          <dd>{st.counters.frames} / {st.counters.events} (antrian: {st.storageQueue})</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Record dibuang / gagal tulis</dt>
          <dd>{st.droppedRecords} / {st.storageFailures}</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>UI FPS / Deteksi Hz (terakhir)</dt>
          <dd>{fmtNum(st.perfLatest?.uiFps, " FPS")} · {fmtNum(st.perfLatest?.detectHz, " Hz")}</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Pipeline p95 / Frame drop / Miss-hand</dt>
          <dd>
            {fmtNum(st.perfLatest?.pipelineP95Ms, " ms")} · drop {st.perfLatest?.framesDropped ?? 0} · miss {fmtPct(overallMissingRate)}
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Gesture (KEYDOWN / RELEASE_ALL)</dt>
          <dd>{totalGestureKd} / {totalGestureRel}</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Canvas (Stroke / Break tak terduga)</dt>
          <dd>{totalCanvasStrokes} / {totalCanvasBreaks}</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Pemakaian kuota penyimpanan</dt>
          <dd>{fmtBytes(st.storageUsageBytes)} / {fmtBytes(st.storageQuotaBytes)}</dd>
        </div>
      </dl>

      {st.warnings.length > 0 && (
        <div className="nui-lab__r19-alert" role="alert" data-testid="bench-warnings">
          <strong>Peringatan Sesi / Keselamatan:</strong>
          <ul>
            {st.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-Trial Comparison Table (never mixes R19 and R20) */}
      {st.trials.length > 0 && (
        <div className="nui-lab__bench-table-wrap">
          <h3>Ringkasan Per Trial (R19 vs R20 Terpisah)</h3>
          <table className="nui-lab__bench-table" data-testid="bench-trials-table">
            <thead>
              <tr>
                <th>Trial</th>
                <th>Route</th>
                <th>Engine</th>
                <th>Preprocess</th>
                <th>Skenario</th>
                <th>Frame</th>
                <th>Detect Hz</th>
                <th>Miss-hand</th>
                <th>MP p95</th>
                <th>Pipe p95</th>
                <th>KD / RelAll</th>
                <th>Stroke</th>
              </tr>
            </thead>
            <tbody>
              {st.trials.map((t: TrialRow) => (
                <tr key={t.trialId} data-engine={t.engineId}>
                  <td><code>{t.trialId.split("-").slice(-1)[0]}</code>{t.open ? " ●" : ""}</td>
                  <td>{t.route}</td>
                  <td><strong>{t.engineId}</strong></td>
                  <td>{t.preprocess}</td>
                  <td>{t.scenario}</td>
                  <td>{t.summary.frames}</td>
                  <td>{fmtNum(t.summary.detectHzMean, " Hz")}</td>
                  <td>{fmtPct(t.summary.missingHandRate)}</td>
                  <td>{fmtNum(t.summary.mpMs.p95, " ms")}</td>
                  <td>{fmtNum(t.summary.pipelineMs.p95, " ms")}</td>
                  <td>{t.summary.gesture.keydowns} / {t.summary.gesture.releaseAlls}</td>
                  <td>{t.summary.canvas.strokes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Previous Stored Sessions in IndexedDB */}
      {st.previousSessions.length > 0 && (
        <div className="nui-lab__bench-prev" data-testid="bench-prev-sessions">
          <h3>Sesi Tersimpan Sebelumnya (IndexedDB)</h3>
          <ul>
            {st.previousSessions.slice(0, 8).map((s) => (
              <li key={s.sessionId}>
                <code>{s.sessionId}</code> · <strong>{s.status}</strong> · {s.trialCount} trial · {s.createdAtMinuteIso}
                {s.statusReason ? ` (${s.statusReason})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Compact Benchmark Session & Engine Bar rendered at the top of `/nui-lab/gesture`, `/nui-lab/canvas`, and `/nui-lab/diagnostics`.
 */
export function BenchSessionBar({
  onConfigChange,
}: {
  onConfigChange?: (next: LabBenchConfig) => void;
}) {
  const st = useBenchState();
  const cfg = useLabBenchConfig();
  const mgr = getBenchManager();
  const cfgStore = getLabBenchConfig();
  const [quickConsent, setQuickConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const workerSupported = canUseCpuWorker();

  const updateCfg = (patch: Partial<LabBenchConfig>) => {
    cfgStore.update(patch);
    onConfigChange?.(cfgStore.getSnapshot());
  };

  const hasExport = st.counters.frames > 0 || st.trialCount > 0 || st.previousSessions.length > 0;

  return (
    <section className="nui-lab__bench-bar" data-testid="bench-session-bar" aria-label="Kontrol sesi benchmark aktif">
      <div className="nui-lab__bench-bar-row">
        <span
          className={`nui-lab__pill ${st.phase === "active" ? "nui-lab__pill--ok" : ""}`}
          data-testid="bench-bar-status"
        >
          {st.phase === "active"
            ? `SESI AKTIF ${st.sessionId} · Trial ${st.currentTrialId?.split("-").slice(-1)[0] ?? "menunggu kamera"} · ${st.counters.frames} frame`
            : "Sesi Benchmark Nonaktif"}
        </span>

        <label className="nui-lab__bench-inline">
          Engine:{" "}
          <select
            value={cfg.engineId}
            data-testid="bench-bar-engine"
            onChange={(e) => updateCfg({ engineId: e.target.value as EngineId })}
          >
            {ENGINE_IDS.map((eid) => (
              <option key={eid} value={eid}>
                {ENGINE_SPECS[eid].short} ({Math.round(ENGINE_SPECS[eid].bytes / 1024)} KB)
              </option>
            ))}
          </select>
        </label>

        <label className="nui-lab__bench-inline">
          Cahaya:{" "}
          <select
            value={cfg.preprocess}
            data-testid="bench-bar-preprocess"
            onChange={(e) => updateCfg({ preprocess: e.target.value as PreprocessMode })}
          >
            <option value="a4">A4 Adaptif</option>
            <option value="raw">RAW</option>
            <option value="clahe">CLAHE 320</option>
          </select>
        </label>

        <label className="nui-lab__bench-inline">
          Detektor:{" "}
          <select
            value={cfg.detector}
            data-testid="bench-bar-detector"
            onChange={(e) => updateCfg({ detector: e.target.value as LabBenchConfig["detector"] })}
          >
            <option value="cpu-worker" disabled={!workerSupported}>
              CPU Web Worker
            </option>
            <option value="cpu-main-thread">CPU Main-Thread</option>
          </select>
        </label>

        <label className="nui-lab__bench-inline">
          Skenario:{" "}
          <select
            value={st.scenario}
            data-testid="bench-bar-scenario"
            onChange={(e) => mgr.setScenario(e.target.value as Scenario, st.scenarioNote)}
          >
            {SCENARIOS.map((sc) => (
              <option key={sc} value={sc}>
                {SCENARIO_LABELS[sc]}
              </option>
            ))}
          </select>
        </label>

        <label className="nui-lab__bench-inline">
          Label GT:{" "}
          <select
            value={st.truth}
            data-testid="bench-bar-truth"
            onChange={(e) => mgr.setTruth(e.target.value as TruthLabel)}
          >
            {TRUTH_LABELS.map((tl) => (
              <option key={tl} value={tl}>
                {tl}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="nui-lab__bench-bar-row">
        {st.phase !== "active" ? (
          <>
            <label className="nui-lab__check nui-lab__check--compact">
              <input
                type="checkbox"
                checked={quickConsent}
                data-testid="bench-bar-consent"
                onChange={(e) => setQuickConsent(e.target.checked)}
              />
              <span>Setuju rekam data numerik lokal (tanpa video/gambar/unggah)</span>
            </label>
            <button
              type="button"
              className="nui-lab__button"
              disabled={!quickConsent || busy}
              data-testid="bench-bar-start"
              onClick={async () => {
                setBusy(true);
                try {
                  await mgr.startSession({
                    consent: quickConsent,
                    app: getAppBuildInfo(),
                    environment: collectNonIdentifyingEnvironment(),
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Mulai Sesi Benchmark
            </button>
          </>
        ) : (
          <button
            type="button"
            className="nui-lab__button"
            disabled={busy}
            data-testid="bench-bar-finish"
            onClick={async () => {
              setBusy(true);
              try {
                await mgr.finishSession("finished-by-tester");
              } finally {
                setBusy(false);
              }
            }}
          >
            Selesaikan Sesi
          </button>
        )}

        <button
          type="button"
          className="nui-lab__button"
          disabled={!hasExport || busy}
          data-testid="bench-bar-export"
          onClick={async () => {
            setBusy(true);
            try {
              const blob = await mgr.exportAll(getAppBuildInfo());
              triggerBlobDownload(blob, `nui-lab-benchmark-${st.sessionId ?? "all"}.json`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Unduh Semua Hasil Sesi
        </button>

        <span className="nui-lab__muted" data-testid="bench-bar-metrics">
          Trial: {st.trialCount} · Dibuang: {st.droppedRecords} · Antrian: {st.storageQueue}
          {st.perfLatest ? ` · UI ${st.perfLatest.uiFps} FPS · Det ${st.perfLatest.detectHz} Hz · Pipe p95 ${fmtNum(st.perfLatest.pipelineP95Ms, " ms")}` : ""}
        </span>
      </div>
    </section>
  );
}
