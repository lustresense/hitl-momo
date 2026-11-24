"use client";

/**
 * Shared UI components for the R22 NUI Lab Auto-Benchmark & Consent Recorder:
 *  - `BenchDashboard` (used on /nui-lab landing): single persisted numeric telemetry consent checkbox,
 *    1-click JSON/CSV export, local data deletion, live KPIs, and recovered IndexedDB session summary.
 *  - `BenchSessionBar` (used on /nui-lab/gesture and /nui-lab/canvas): compact always-visible bar with
 *    auto-recording status, 1-click consent (only if not yet granted), 1-click JSON/CSV export, and delete.
 *
 * Per R22 U06 / B06 / A04: zero engineering dropdowns (no C0/C4/C7, RAW/CLAHE/A4, detector, scenario, or manual GT).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getLabBenchConfig,
  readPersistedBenchConsent,
  writePersistedBenchConsent,
  type LabBenchConfig,
} from "./config";
import { getAppBuildInfo } from "./env";
import { getBenchManager, type BenchState, type TrialRow } from "./manager";

const CONSENT_CHANGE_EVENT = "nui-lab-bench-consent-changed";

export function readPersistedConsent(): boolean {
  return getBenchManager().hasConsent || readPersistedBenchConsent();
}

export function writePersistedConsent(granted: boolean): void {
  const mgr = getBenchManager();
  if (granted) mgr.grantConsent();
  else mgr.revokeConsent();
  writePersistedBenchConsent(granted);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: granted }));
  }
}

export function useBenchConsent(): [boolean, (granted: boolean) => void] {
  const [granted, setGranted] = useState<boolean>(false);

  useEffect(() => {
    setGranted(readPersistedConsent());
    const sync = () => setGranted(readPersistedConsent());
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: boolean) => {
    writePersistedConsent(next);
    setGranted(next);
  }, []);

  return [granted, update];
}

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
  return useSyncExternalStore(mgr.subscribe, mgr.getSnapshot, mgr.getServerSnapshot);
}

export function useLabBenchConfig(): LabBenchConfig {
  const store = getLabBenchConfig();
  useEffect(() => {
    store.hydrate();
  }, [store]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
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

function statusBadgeText(st: BenchState, consentGranted: boolean): string {
  if (st.phase === "active") return `MEREKAM OTOMATIS · ${st.sessionId}`;
  if (st.phase === "finished") return `SELESAI · ${st.sessionId}`;
  if (consentGranted) return "REKAM OTOMATIS SIAP (MENUNGGU KAMERA)";
  if (st.previousSessions.some((s) => s.status === "interrupted")) return "ADA SESI TERPUTUS TERSIMPAN";
  return "MENUNGGU PERSETUJUAN LOKAL";
}

/**
 * Clean Owner Telemetry & Export Dashboard on `/nui-lab`.
 */
export function BenchDashboard() {
  const st = useBenchState();
  const mgr = getBenchManager();
  const [consent, setConsent] = useBenchConsent();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const totalSessionsStored = (st.phase === "active" ? 1 : 0) + st.previousSessions.length;
  const hasExportableData = st.counters.frames > 0 || st.trialCount > 0 || st.previousSessions.length > 0;
  const effectiveConsent = consent || st.phase === "active";

  const handleConsentChange = async (checked: boolean) => {
    setConsent(checked);
    if (checked) {
      setFeedback("Persetujuan tersimpan. Perekaman telemetri angka akan berjalan otomatis saat kamera dinyalakan.");
      if (!mgr.isActive) {
        try {
          await mgr.init();
        } catch {
          /* ignore */
        }
      }
    } else {
      setFeedback("Perekaman otomatis dinonaktifkan.");
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
      setFeedback("Seluruh data benchmark lokal telah dihapus dan persetujuan direset.");
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
    <section className="nui-lab__panel nui-lab__bench-dash" data-testid="bench-dashboard" aria-label="Telemetri Otomatis NUI Lab">
      <div className="nui-lab__info-head">
        <h2>Telemetri &amp; Rekaman Otomatis Lokal</h2>
        <span
          className={`nui-lab__pill ${
            st.phase === "active" || effectiveConsent
              ? "nui-lab__pill--ok"
              : st.warnings.length > 0 || st.droppedRecords > 0
                ? "nui-lab__pill--warn"
                : ""
          }`}
          data-testid="bench-status-pill"
        >
          {statusBadgeText(st, effectiveConsent)}
        </span>
      </div>

      <p className="nui-lab__muted">
        Setelah Anda menyetujui sekali, semua percobaan di <strong>Coba Gestur</strong> dan <strong>Coba Canvas</strong>{" "}
        otomatis tercatat di penyimpanan lokal browser (IndexedDB). Hanya menyimpan data numerik landmark dan metrik
        performa — <strong>tanpa video, gambar, audio, wajah, identitas, atau unggahan server</strong>.
      </p>

      <div className="nui-lab__bench-consent-box">
        <label className="nui-lab__check">
          <input
            type="checkbox"
            checked={effectiveConsent}
            disabled={st.phase === "active" || busy}
            data-testid="bench-consent"
            onChange={(e) => void handleConsentChange(e.target.checked)}
          />
          <span>
            Saya menyetujui perekaman <strong>data numerik lokal</strong> (21 titik landmark, status gestur/kanvas, dan
            metrik performa) di perangkat ini. Tidak merekam video/gambar/wajah dan tidak mengunggah ke server.
          </span>
        </label>

        <div className="nui-lab__row">
          <button
            type="button"
            className="nui-lab__button nui-lab__button--primary"
            disabled={!hasExportableData || busy}
            data-testid="bench-export-json"
            onClick={() => void handleExportJson()}
          >
            Unduh Hasil (JSON)
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
            disabled={(!hasExportableData && st.phase !== "active" && !effectiveConsent) || busy}
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

      <dl className="nui-lab__numbers" data-testid="bench-kpis">
        <div className="nui-lab__stat">
          <dt>Penyimpanan lokal</dt>
          <dd>{st.storage === "indexeddb" ? "IndexedDB (persisten)" : st.storage === "memory-only" ? "Memori saja" : "Memeriksa…"}</dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Trial sesi ini / total sesi</dt>
          <dd>
            {st.trialCount} trial · {totalSessionsStored} sesi tersimpan
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Catatan tersimpan (frame / event)</dt>
          <dd>
            {st.counters.frames} / {st.counters.events} (antrian: {st.storageQueue})
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Record dibuang / gagal tulis</dt>
          <dd>
            {st.droppedRecords} / {st.storageFailures}
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>UI FPS / Deteksi Hz (terakhir)</dt>
          <dd>
            {fmtNum(st.perfLatest?.uiFps, " FPS")} · {fmtNum(st.perfLatest?.detectHz, " Hz")}
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Pipeline p95 / Frame drop / No-hand mentah</dt>
          <dd>
            {fmtNum(st.perfLatest?.pipelineP95Ms, " ms")} · drop {st.perfLatest?.framesDropped ?? 0} · {fmtPct(overallMissingRate)}
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Gesture (KEYDOWN / RELEASE_ALL)</dt>
          <dd>
            {totalGestureKd} / {totalGestureRel}
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Canvas (Stroke / Break tak terduga)</dt>
          <dd>
            {totalCanvasStrokes} / {totalCanvasBreaks}
          </dd>
        </div>
        <div className="nui-lab__stat">
          <dt>Pemakaian kuota penyimpanan</dt>
          <dd>
            {fmtBytes(st.storageUsageBytes)} / {fmtBytes(st.storageQuotaBytes)}
          </dd>
        </div>
      </dl>

      {st.warnings.length > 0 && (
        <div className="nui-lab__r19-alert" role="alert" data-testid="bench-warnings">
          <strong>Peringatan Sesi:</strong>
          <ul>
            {st.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {st.trials.length > 0 && (
        <div className="nui-lab__bench-table-wrap">
          <h3>Ringkasan Trial Tersimpan</h3>
          <table className="nui-lab__bench-table" data-testid="bench-trials-table">
            <thead>
              <tr>
                <th>Trial</th>
                <th>Mode</th>
                <th>Frame</th>
                <th>Detect Hz</th>
                <th>Miss Aktif</th>
                <th>No-hand mentah</th>
                <th>MP p95</th>
                <th>Pipe p95</th>
                <th>Stroke</th>
                <th>Alasan Selesai</th>
              </tr>
            </thead>
            <tbody>
              {st.trials.map((t: TrialRow) => (
                <tr key={t.trialId} data-engine={t.engineId}>
                  <td>
                    <code>{t.trialId.split("-").slice(-1)[0]}</code>
                    {t.open ? " ●" : ""}
                  </td>
                  <td>{t.route}</td>
                  <td>{t.summary.frames}</td>
                  <td>{fmtNum(t.summary.detectHzMean, " Hz")}</td>
                  <td>{fmtPct(t.summary.activeWindowMissRate)}</td>
                  <td>{fmtPct(t.summary.missingHandRate)}</td>
                  <td>{fmtNum(t.summary.mpMs.p95, " ms")}</td>
                  <td>{fmtNum(t.summary.pipelineMs.p95, " ms")}</td>
                  <td>{t.summary.canvas.strokes}</td>
                  <td>{t.summary.endReason ?? (t.open ? "aktif" : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
 * Compact Automatic Session & Export Bar on `/nui-lab/gesture` and `/nui-lab/canvas`.
 * Zero engineering selectors (no engine, preprocess, detector, scenario, or manual GT dropdowns).
 */
export function BenchSessionBar({
  onConsentGranted,
}: {
  onConsentGranted?: () => void;
}) {
  const st = useBenchState();
  const mgr = getBenchManager();
  const [consent, setConsent] = useBenchConsent();
  const [busy, setBusy] = useState(false);

  const hasExport = st.counters.frames > 0 || st.trialCount > 0 || st.previousSessions.length > 0;
  const effectiveConsent = consent || st.phase === "active";

  const handleToggleConsent = (checked: boolean) => {
    setConsent(checked);
    if (checked) {
      onConsentGranted?.();
    }
  };

  return (
    <section className="nui-lab__bench-bar" data-testid="bench-session-bar" aria-label="Status perekaman otomatis dan ekspor">
      <div className="nui-lab__bench-bar-row">
        <span
          className={`nui-lab__pill ${st.phase === "active" || effectiveConsent ? "nui-lab__pill--ok" : ""}`}
          data-testid="bench-bar-status"
        >
          {st.phase === "active"
            ? `REKAM OTOMATIS · ${st.currentTrialId?.split("-").slice(-1)[0] ?? "menunggu kamera"} · ${st.counters.frames} frame`
            : effectiveConsent
              ? "Rekam Otomatis Siap (mulai saat kamera aktif)"
              : "Perekaman Lokal Nonaktif"}
        </span>

        {!effectiveConsent && (
          <label className="nui-lab__check nui-lab__check--compact">
            <input
              type="checkbox"
              checked={effectiveConsent}
              disabled={busy}
              data-testid="bench-bar-consent"
              onChange={(e) => handleToggleConsent(e.target.checked)}
            />
            <span>Setuju rekam angka landmark lokal (tanpa video/wajah)</span>
          </label>
        )}

        <span className="nui-lab__muted" data-testid="bench-bar-metrics">
          Trial: {st.trialCount} · Dibuang: {st.droppedRecords}
          {st.perfLatest ? ` · UI ${st.perfLatest.uiFps} FPS · Det ${st.perfLatest.detectHz} Hz · Pipe p95 ${fmtNum(st.perfLatest.pipelineP95Ms, " ms")}` : ""}
        </span>
      </div>

      <div className="nui-lab__bench-bar-row">
        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
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
          Unduh Hasil (JSON)
        </button>

        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
          disabled={!hasExport || busy}
          data-testid="bench-bar-export-csv"
          onClick={async () => {
            setBusy(true);
            try {
              const blob = await mgr.exportSummaryCsv();
              triggerBlobDownload(blob, `nui-lab-benchmark-summary-${st.sessionId ?? "all"}.csv`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Unduh Ringkasan (CSV)
        </button>

        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
          disabled={(!hasExport && st.phase !== "active" && !effectiveConsent) || busy}
          data-testid="bench-bar-delete"
          onClick={async () => {
            setBusy(true);
            try {
              await mgr.deleteAllLocalData();
              setConsent(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          Hapus Data Lokal
        </button>
      </div>
    </section>
  );
}
