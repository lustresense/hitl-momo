"use client";

/**
 * NUI test page for the Owner (/nui-lab). Not linked from the student flow.
 * The Owner opens it on his own laptop with a real webcam before the exhibition and reads the numbers live.
 * The camera starts only on a click; stopping or leaving the page releases the camera and the model.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { frameForDetection, getFrameSourceStats, setLowLightEnhancement, type LowLightMode } from "@/src/camera/frame-source";
import { createHandLandmarker, delegateLabel } from "@/src/camera/hand-landmarker";
import { classifyCameraError, messageFor } from "@/src/camera/messages";
import type { Landmark } from "@/src/input/types";
import { drawHands } from "./hand-overlay";
import { startLabCamera } from "./lab-camera";
import { LabAnalyzer, type LabSnapshot } from "./lab-analyzer";
import { poseLabel } from "./lab-metrics";
import "./NuiLabPage.css";

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_URL = "/models/hand_landmarker.task";
/** Width of the overlay canvas; its height follows the camera's own aspect ratio. */
const OVERLAY_WIDTH = 640;
const INK_SIZE = { width: 400, height: 300 };
/** How often the numbers on screen are refreshed (the loop itself runs every frame). */
const REFRESH_MS = 250;
/** Consecutive detector errors before the page stops and says so (as the game's trackers do). */
const MAX_DETECT_FAILURES = 3;

const LOW_LIGHT_OPTIONS: { mode: LowLightMode; label: string }[] = [
  { mode: "auto", label: "Otomatis" },
  { mode: "off", label: "Mati" },
  { mode: "on", label: "Selalu" },
];

interface CameraInfo {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  delegate: string | null;
}

interface Readout {
  snapshot: LabSnapshot | null;
  deliveredFps: number;
  luma: number | null;
  claheMs: number | null;
  enhancing: boolean;
}

const EMPTY_INFO: CameraInfo = { width: null, height: null, frameRate: null, delegate: null };
const EMPTY_READOUT: Readout = { snapshot: null, deliveredFps: 0, luma: null, claheMs: null, enhancing: false };

/** Everything one camera session owns; released together. */
interface Session {
  stream: MediaStream;
  landmarker: HandLandmarker | null;
  analyzer: LabAnalyzer;
  rafId: number | null;
  timerId: ReturnType<typeof setInterval> | null;
  /** Times of new video frames in the last second. */
  frameTimes: number[];
  lastVideoTime: number;
  failures: number;
}

function releaseSession(s: Session | null): void {
  if (!s) return;
  if (s.rafId !== null) cancelAnimationFrame(s.rafId);
  if (s.timerId !== null) clearInterval(s.timerId);
  for (const track of s.stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* best-effort: the track may already be gone */
    }
  }
  try {
    s.landmarker?.close();
  } catch {
    /* best-effort */
  }
  s.landmarker = null;
}

const fmtMs = (v: number | null): string => (v === null ? "—" : `${Math.round(v)} ms`);
const fmtPx = (v: number | null): string => (v === null ? "tahan tangan diam" : `${v.toFixed(1)} px`);

export function NuiLabPage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"off" | "starting" | "on">("off");
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState<CameraInfo>(EMPTY_INFO);
  const [readout, setReadout] = useState<Readout>(EMPTY_READOUT);
  const [lowLight, setLowLightState] = useState<LowLightMode>("auto");

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const session = useRef<Session | null>(null);
  /** Bumped by stop and unmount, so a camera that is still opening is closed instead of kept. */
  const generation = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    setLowLightState(getFrameSourceStats().mode);
    return () => {
      mounted.current = false;
      // generation is a plain counter, not a DOM ref: bumping the live value is the intent.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      releaseSession(session.current);
      session.current = null;
    };
  }, []);

  const stopCamera = () => {
    generation.current++;
    const s = session.current;
    session.current = null;
    releaseSession(s);
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("off");
    setInfo(EMPTY_INFO);
    setReadout(EMPTY_READOUT);
  };

  const startCamera = async () => {
    if (session.current || phase === "starting") return;
    const gen = ++generation.current;
    setPhase("starting");
    setMessage("");
    const result = await startLabCamera(navigator.mediaDevices);
    const stillWanted = () => mounted.current && generation.current === gen;
    if (result.kind === "error") {
      if (stillWanted()) {
        setPhase("off");
        setMessage(result.message);
      }
      return;
    }
    const stream = result.stream;
    if (!stillWanted()) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const s: Session = {
      stream,
      landmarker: null,
      analyzer: new LabAnalyzer(),
      rafId: null,
      timerId: null,
      frameTimes: [],
      lastVideoTime: -1,
      failures: 0,
    };
    session.current = s;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      // Not awaited: a slow or refused play must not hold up the model load.
      video.play().catch(() => undefined);
    }
    const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
    setInfo((prev) => ({
      ...prev,
      width: settings.width ?? null,
      height: settings.height ?? null,
      frameRate: settings.frameRate ?? null,
    }));

    try {
      const created = await createHandLandmarker({ wasmRoot: WASM_ROOT, modelUrl: MODEL_URL });
      if (!stillWanted()) {
        try {
          created.landmarker.close();
        } catch {
          /* best-effort */
        }
        return;
      }
      s.landmarker = created.landmarker;
      setInfo((prev) => ({ ...prev, delegate: delegateLabel(created) }));
    } catch (err) {
      // The preview keeps running; the numbers just show no hands.
      if (stillWanted()) setMessage(messageFor(classifyCameraError(err)));
    }
    if (!stillWanted()) return;

    setPhase("on");
    const tick = () => {
      if (session.current !== s) return;
      s.rafId = requestAnimationFrame(tick);
      runFrame(s);
    };
    const runFrame = (cur: Session) => {
      const v = videoRef.current;
      if (!cur.landmarker || !v || document.hidden) return;
      if (v.readyState < 2 || v.currentTime === cur.lastVideoTime) return;
      cur.lastVideoTime = v.currentTime;
      const t0 = performance.now();
      cur.frameTimes.push(t0);
      let landmarks: Landmark[][];
      try {
        landmarks = cur.landmarker.detectForVideo(frameForDetection(v), t0).landmarks;
        cur.failures = 0;
      } catch {
        cur.failures++;
        if (cur.failures >= MAX_DETECT_FAILURES) {
          stopCamera();
          setMessage(messageFor("tracker-error"));
        }
        return;
      }
      cur.analyzer.analyse({ landmarks, inferMs: performance.now() - t0, nowMs: t0 });
      paintOverlay(v, cur);
      paintInk(cur);
    };
    const paintOverlay = (v: HTMLVideoElement, cur: Session) => {
      const canvas = overlayRef.current;
      if (!canvas || !v.videoWidth || !v.videoHeight) return;
      const height = Math.round((OVERLAY_WIDTH * v.videoHeight) / v.videoWidth);
      if (canvas.width !== OVERLAY_WIDTH || canvas.height !== height) {
        canvas.width = OVERLAY_WIDTH;
        canvas.height = height;
      }
      if (stageRef.current) stageRef.current.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
      const ctx = canvas.getContext("2d");
      if (ctx) drawHands(ctx, cur.analyzer.lastHands, cur.analyzer.primaryHandIndex, canvas.width, canvas.height);
    };
    const paintInk = (cur: Session) => {
      const ctx = inkRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, INK_SIZE.width, INK_SIZE.height);
      const { completed, active } = cur.analyzer.strokes();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of [...completed, ...(active ? [active] : [])]) {
        if (stroke.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
        for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    };
    const refresh = () => {
      if (session.current !== s) return;
      const now = performance.now();
      s.frameTimes = s.frameTimes.filter((t) => now - t <= 1000);
      const stats = getFrameSourceStats();
      setReadout({
        snapshot: s.analyzer.snapshot(now),
        deliveredFps: s.frameTimes.length,
        luma: stats.lastLuma,
        claheMs: stats.lastClaheMs,
        enhancing: stats.enhancing,
      });
    };
    s.rafId = requestAnimationFrame(tick);
    s.timerId = setInterval(refresh, REFRESH_MS);
  };

  const chooseLowLight = (mode: LowLightMode) => {
    setLowLightEnhancement(mode);
    setLowLightState(mode);
  };

  const snap = readout.snapshot;
  const running = phase === "on";
  const wave = snap?.wave;

  return (
    <main className="nui-lab">
      <header className="nui-lab__header">
        <h1>Uji Tangan NUI</h1>
        <p className="nui-lab__lede">
          Halaman untuk Owner sebelum pameran. Tidak tertaut dari permainan siswa. Kamera hanya menyala setelah
          tombol ditekan.
        </p>
      </header>

      <div className="nui-lab__controls">
        {phase === "off" ? (
          <button
            type="button"
            className="nui-lab__button nui-lab__button--primary"
            onClick={() => void startCamera()}
            disabled={supported === false}
          >
            Nyalakan kamera
          </button>
        ) : (
          <button type="button" className="nui-lab__button" onClick={stopCamera}>
            Matikan kamera
          </button>
        )}
        {phase === "starting" && <span className="nui-lab__muted">Kamera dan pelacak sedang dibuka…</span>}
        <p role="status" className="nui-lab__status">
          {supported === false ? "Browser ini belum bisa pakai kamera." : message}
        </p>
      </div>

      <div className="nui-lab__layout">
        <section className="nui-lab__panel" aria-labelledby="nui-lab-camera-title">
          <h2 id="nui-lab-camera-title">Kamera dan tangan</h2>
          <div ref={stageRef} className="nui-lab__stage">
            <video ref={videoRef} className="nui-lab__video" muted playsInline autoPlay aria-label="Pratinjau kamera" />
            <canvas ref={overlayRef} className="nui-lab__overlay" aria-label="Kerangka tangan" />
            {!running && <p className="nui-lab__placeholder">Kamera belum menyala.</p>}
          </div>
          <p className="nui-lab__legend">
            <span className="nui-lab__swatch nui-lab__swatch--primary" aria-hidden="true" /> Oranye = tangan utama (diikuti
            game) ·
            <span className="nui-lab__swatch nui-lab__swatch--other" aria-hidden="true" /> Abu-abu = tangan lain
          </p>

          <h3>Coret uji</h3>
          <p className="nui-lab__muted">Cubit telunjuk dan jempol untuk menulis, kepal untuk menghapus.</p>
          <canvas
            ref={inkRef}
            className="nui-lab__ink"
            width={INK_SIZE.width}
            height={INK_SIZE.height}
            aria-label="Kanvas coret uji"
          />
        </section>

        <section className="nui-lab__panel" aria-labelledby="nui-lab-numbers-title">
          <h2 id="nui-lab-numbers-title">Angka langsung</h2>
          <dl className="nui-lab__numbers">
            <Stat label="Resolusi kamera" value={info.width && info.height ? `${info.width} × ${info.height}` : "—"} />
            <Stat label="FPS kamera (pengaturan)" value={info.frameRate ? `${Math.round(info.frameRate)}` : "—"} />
            <Stat label="FPS frame diterima" value={running ? `${readout.deliveredFps} /detik` : "—"} />
            <Stat label="FPS deteksi" value={snap ? `${snap.detectFps} /detik` : "—"} />
            <Stat label="Waktu deteksi p50" value={fmtMs(snap?.inferP50 ?? null)} />
            <Stat label="Waktu deteksi p95" value={fmtMs(snap?.inferP95 ?? null)} />
            <Stat label="Mesin (GPU/CPU)" value={info.delegate ?? "—"} />
            <Stat label="Tangan terlihat" value={snap ? `${snap.handCount} (jauh, diabaikan: ${snap.farHandCount})` : "—"} />
            <Stat
              label="Tangan utama"
              value={
                snap && snap.primaryIndex !== null && snap.primarySize !== null
                  ? `ada, ${Math.round(snap.primarySize * 100)}% lebar frame`
                  : "tidak ada"
              }
            />
            <Stat label="Pose sekarang" value={snap ? poseLabel(snap.pose) : "—"} />
          </dl>

          <h3>Jitter (tangan diam)</h3>
          <dl className="nui-lab__numbers">
            <Stat label="Tangan diam?" value={snap?.still ? "ya" : "belum"} />
            <Stat label="Jitter telunjuk mentah" value={snap ? fmtPx(snap.rawJitterPx) : "—"} />
            <Stat label="Jitter titik tinta (halus)" value={snap ? fmtPx(snap.inkJitterPx) : "—"} />
          </dl>

          <h3>Uji lambaian</h3>
          <button type="button" className="nui-lab__button" onClick={() => session.current?.analyzer.startWaveTest()} disabled={!running}>
            Mulai uji lambaian
          </button>
          <p className="nui-lab__status" aria-live="polite">
            {(!wave || wave.status === "idle") && "Belum diuji. Tekan tombol, lalu lambaikan tangan kiri dan kanan."}
            {wave?.status === "running" && `Sedang diuji… progres ${Math.round(wave.progress * 100)}%`}
            {wave?.status === "done" &&
              (wave.elapsedMs === null
                ? "Lambaian terdeteksi."
                : `Lambaian terdeteksi ${Math.round(wave.elapsedMs)} ms setelah gerak pertama.`)}
          </p>
          <div
            className="nui-lab__progress"
            role="progressbar"
            aria-label="Progres lambaian"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((wave?.progress ?? 0) * 100)}
          >
            <div className="nui-lab__progress-fill" style={{ width: `${Math.round((wave?.progress ?? 0) * 100)}%` }} />
          </div>

          <h3>Cahaya rendah</h3>
          <dl className="nui-lab__numbers">
            <Stat label="Kecerahan (luma rata-rata)" value={readout.luma === null ? "—" : readout.luma.toFixed(2)} />
            <Stat label="CLAHE terakhir" value={fmtMs(readout.claheMs)} />
            <Stat label="Peningkatan cahaya aktif?" value={readout.enhancing ? "ya" : "tidak"} />
          </dl>
          <div className="nui-lab__choices" role="group" aria-label="Peningkatan cahaya">
            {LOW_LIGHT_OPTIONS.map((o) => (
              <button
                key={o.mode}
                type="button"
                className="nui-lab__button"
                aria-pressed={lowLight === o.mode}
                onClick={() => chooseLowLight(o.mode)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="nui-lab__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
