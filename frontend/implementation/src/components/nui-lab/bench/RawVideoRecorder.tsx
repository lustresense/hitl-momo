"use client";

/**
 * R22B B2.6: Developer-Only Local Raw Camera Video Recorder (`?rawrec=1`, default OFF).
 *
 * Guarantees:
 *  - Never shown by default and NEVER exposed to student gameplay.
 *  - Requires a separate explicit consent checkbox before recording can start.
 *  - Uses browser `MediaRecorder` locally to save `.webm` to disk — ZERO network uploads.
 *  - Filenames include `sessionId`, `trialId`, and start timestamp for offline low-light replay (B7.3).
 *  - Logs `RAWREC_START` and `RAWREC_STOP` events to the benchmark session.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface RawRecMetaSnapshot {
  enabled: boolean;
  consentGranted: boolean;
  mimeType: string | null;
  startedAtIso: string | null;
  filename: string | null;
}

function pickSupportedWebmMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
  for (const mime of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

function sanitizeToken(v: string | null | undefined, fallback: string): string {
  const clean = (v ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  return clean.length > 0 ? clean : fallback;
}

export function RawVideoRecorder({
  stream,
  sessionId,
  trialId,
  onRawRecEvent,
  onMetaChange,
}: {
  stream: MediaStream | null;
  sessionId: string | null;
  trialId: string | null;
  onRawRecEvent: (
    kind: "RAWREC_START" | "RAWREC_STOP",
    detail: Record<string, string | number | boolean | null>,
  ) => void;
  onMetaChange: (meta: RawRecMetaSnapshot | null) => void;
}) {
  const [rawConsent, setRawConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<{ url: string; filename: string; bytes: number } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const metaRef = useRef<{ filename: string; mimeType: string; startedAtIso: string } | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const supported = typeof MediaRecorder !== "undefined";

  const stopRecording = useCallback(
    (reason: string) => {
      const rec = recorderRef.current;
      if (!rec) return;
      recorderRef.current = null;
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      setRecording(false);
      onMetaChange(null);
      onRawRecEvent("RAWREC_STOP", {
        reason,
        filename: metaRef.current?.filename ?? null,
      });
    },
    [onRawRecEvent, onMetaChange],
  );

  // Stop cleanly if camera stream stops or component unmounts.
  useEffect(() => {
    if (!stream && recorderRef.current) {
      stopRecording("stream-ended");
    }
  }, [stream, stopRecording]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
      onMetaChange(null);
    };
  }, [onMetaChange]);

  const startRecording = () => {
    if (!supported || !stream || !rawConsent) return;
    setErrorMsg(null);
    const mime = pickSupportedWebmMime();
    if (mime === null) {
      setErrorMsg("MediaRecorder tidak didukung di browser ini.");
      return;
    }
    const startedAtIso = new Date().toISOString();
    const compactTs = startedAtIso.replace(/[:.]/g, "-").slice(0, 19);
    const filename = `nui-rawrec_${sanitizeToken(sessionId, "nosession")}_${sanitizeToken(trialId, "notrial")}_${compactTs}.webm`;
    try {
      const options: MediaRecorderOptions = mime ? { mimeType: mime } : {};
      const rec = new MediaRecorder(stream, options);
      chunksRef.current = [];
      metaRef.current = { filename, mimeType: rec.mimeType || mime || "video/webm", startedAtIso };
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const meta = metaRef.current;
        const blob = new Blob(chunksRef.current, { type: meta?.mimeType || "video/webm" });
        chunksRef.current = [];
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;
        const fname = meta?.filename ?? `nui-rawrec_${compactTs}.webm`;
        setLastDownload({ url, filename: fname, bytes: blob.size });
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch {
          /* download link stays available below */
        }
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
      onMetaChange({
        enabled: true,
        consentGranted: true,
        mimeType: metaRef.current.mimeType,
        startedAtIso,
        filename,
      });
      onRawRecEvent("RAWREC_START", {
        filename,
        mimeType: metaRef.current.mimeType,
        startedAtIso,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section
      className="nui-lab__panel nui-lab__dev-panel nui-lab__rawrec-panel"
      data-testid="rawrec-panel"
      aria-label="Perekam video mentah lokal (khusus pengembang)"
    >
      <div className="nui-lab__info-head">
        <h3>Rekam Video Kamera Mentah (?rawrec=1)</h3>
        <span className={`nui-lab__pill ${recording ? "nui-lab__pill--err" : ""}`}>
          {recording ? "MEREKAM LOKAL (.webm)" : "NONAKTIF"}
        </span>
      </div>

      <label className="nui-lab__check">
        <input
          type="checkbox"
          data-testid="rawrec-consent-checkbox"
          checked={rawConsent}
          disabled={recording}
          onChange={(e) => setRawConsent(e.target.checked)}
        />
        <span>Rekam video kamera mentah (khusus pengembang, lokal, tidak diunggah)</span>
      </label>

      <p className="nui-lab__muted">
        Video hanya diunduh ke komputer Anda (<code>.webm</code>) untuk replay offline low-light dan{" "}
        <strong>tidak pernah diunggah</strong>. Jangan aktifkan saat mengukur benchmark performa A/B.
      </p>

      <div className="nui-lab__row">
        <button
          type="button"
          className={`nui-lab__button nui-lab__button--compact ${recording ? "" : "nui-lab__button--primary"}`}
          data-testid="rawrec-toggle-btn"
          disabled={!supported || !stream || (!recording && !rawConsent)}
          onClick={() => (recording ? stopRecording("user-stop") : startRecording())}
        >
          {recording ? "Hentikan & Unduh WebM" : "Mulai Rekam Video Lokal"}
        </button>

        {lastDownload && (
          <a
            href={lastDownload.url}
            download={lastDownload.filename}
            className="nui-lab__button nui-lab__button--compact"
            data-testid="rawrec-download-link"
          >
            Unduh ulang ({Math.max(1, Math.round(lastDownload.bytes / 1024))} KB)
          </a>
        )}
      </div>

      {!supported && <p className="nui-lab__status nui-lab__status--error">MediaRecorder tidak tersedia di browser ini.</p>}
      {errorMsg && <p className="nui-lab__status nui-lab__status--error">{errorMsg}</p>}
    </section>
  );
}
