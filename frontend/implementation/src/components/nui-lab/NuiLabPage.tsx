"use client";

/**
 * NUI test page for the Owner (/nui-lab). Not linked from the student flow.
 * The Owner opens it on his own laptop with a real webcam before the exhibition and reads the numbers live.
 * The camera starts only on a click; stopping or leaving the page releases the camera and the model.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { MomoAvatar } from "@/src/components/momo/MomoAvatar";
import { GestureGlyph } from "@/src/components/ui/GestureGlyph";
import type { HandCursor } from "@/src/input/hand-stroke-pipeline";
import { frameForDetection, getFrameSourceStats, setLowLightEnhancement, type LowLightMode } from "@/src/camera/frame-source";
import { FaceAnchor, type FaceModelStatus } from "@/src/camera/face-anchor";
import { createHandLandmarker, delegateLabel, getDelegateInfo } from "@/src/camera/hand-landmarker";
import { getInferenceStats, pollDetection, type InferenceStats } from "@/src/camera/inference-scheduler";
import { classifyCameraError, messageFor } from "@/src/camera/messages";
import { WAVE_MIN_REVERSALS } from "@/src/camera/wave-tracker";
import type { Landmark } from "@/src/input/types";
import { drawFaceArea, drawHands } from "./hand-overlay";
import { startLabCamera } from "./lab-camera";
import { LabAnalyzer, type LabSnapshot } from "./lab-analyzer";
import { delegateReasonText, faceAbsentText, modelReadoutText, poseLabel, switchStateText } from "./lab-metrics";
import { countHandRoles } from "./lab-roles";
import "./NuiLabPage.css";

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_URL = "/models/hand_landmarker.task";
/** Width of the overlay canvas; its height follows the camera's own aspect ratio. */
const OVERLAY_WIDTH = 640;
const INK_SIZE = { width: 1280, height: 720 };
const POSES = ["thumb-up", "pinch", "one-finger", "two-fingers", "three-fingers", "split-palm", "open-palm"] as const;
/** How often the numbers on screen are refreshed (the loop itself runs every frame). */
const REFRESH_MS = 250;
/** Consecutive detector errors before the page stops and says so (as the game's trackers do). */
const MAX_DETECT_FAILURES = 3;

const LOW_LIGHT_OPTIONS: { mode: LowLightMode; label: string }[] = [
  { mode: "auto", label: "Otomatis" },
  { mode: "off", label: "Mati" },
  { mode: "on", label: "CLAHE 320" },
  { mode: "scaled", label: "RAW 320" },
];

interface CameraInfo {
  width: number | null;
  height: number | null;
  frameRate: number | null;
}

interface Readout {
  snapshot: LabSnapshot | null;
  deliveredFps: number;
  luma: number | null;
  centerLuma: number | null;
  backlightCandidate: boolean;
  claheMs: number | null;
  enhancing: boolean;
  /** Detector stats from the shared gate: per model and total, busy share, skipped frames. */
  sched: InferenceStats | null;
  /** The face model: still loading, in use, or given up. Tells "no face" from "no face model". */
  faceModel: FaceModelStatus;
  /** Engine as the game labels it: "GPU", "CPU (tanpa GPU)", ... */
  engine: string;
  reason: string;
  switchText: string;
}

const EMPTY_INFO: CameraInfo = { width: null, height: null, frameRate: null };
const EMPTY_READOUT: Readout = {
  snapshot: null,
  deliveredFps: 0,
  luma: null,
  centerLuma: null,
  backlightCandidate: false,
  claheMs: null,
  enhancing: false,
  sched: null,
  faceModel: "loading",
  engine: "—",
  reason: "—",
  switchText: "—",
};

/** Everything one camera session owns; released together. */
interface Session {
  stream: MediaStream;
  landmarker: HandLandmarker | null;
  /** The player's face, found at a low rate; it narrows which hand counts (same as the game). */
  face: FaceAnchor;
  analyzer: LabAnalyzer;
  rafId: number | null;
  timerId: ReturnType<typeof setInterval> | null;
  /** Times of new video frames in the last second. */
  frameTimes: number[];
  lastVideoTime: number;
  lastVideoFrameCount: number | null;
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
const fmtPct = (v: number | null): string => (v === null ? "—" : `${Math.round(v)}%`);

/** All variants reuse one MediaPipe session and the same LabAnalyzer. */
export function NuiLabPage({ variant = "diagnostics" }: { variant?: "diagnostics" | "gesture" | "canvas" } = {}) {
  const isCanvas = variant === "canvas";
  const isGesture = variant === "gesture";
  const [pointerTool, setPointerTool] = useState<"pen" | "eraser">("pen");
  const pointerDown = useRef(false);
  const pointerCursor = useRef<HandCursor | null>(null);
  const analyzerRef = useRef(new LabAnalyzer({
    fullFrameLock: variant !== "diagnostics",
    enableInk: variant !== "gesture",
  }));
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
  /** The lab must not leave its diagnostic preprocessing override active in the student game. */
  const initialDetectionMode = useRef<LowLightMode>("auto");
  /** Bumped by stop and unmount, so a camera that is still opening is closed instead of kept. */
  const generation = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    initialDetectionMode.current = getFrameSourceStats().mode;
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    setLowLightState(getFrameSourceStats().mode);
    return () => {
      mounted.current = false;
      setLowLightEnhancement(initialDetectionMode.current);
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
    analyzerRef.current.reset(performance.now());
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("off");
    setInfo(EMPTY_INFO);
    setReadout(EMPTY_READOUT);
    paintInk();
  };

  const paintInk = () => {
    const canvas = inkRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { completed, active } = analyzerRef.current.strokes();
    // Same stroke material and cursor state as DrawingSurface.render().
    ctx.strokeStyle = "#23211d";
    ctx.lineWidth = Math.max(3, Math.round(canvas.width / 160));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of [...completed, ...(active ? [active] : [])]) {
      if (!stroke.length) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x + .6, stroke[0]!.y);
      ctx.stroke();
    }
    const handCursor = analyzerRef.current.cursor;
    const cursor = handCursor?.state === "drawing"
      ? handCursor
      : (pointerDown.current ? pointerCursor.current : handCursor);
    if (!cursor) return;
    const scale = canvas.width / (canvas.clientWidth || canvas.width);
    const { x, y, state } = cursor;
    if (cursor.erasing) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 32, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 225, 105, 0.22)";
      ctx.fill();
      ctx.lineWidth = Math.max(2, Math.round(3 * scale));
      ctx.strokeStyle = "#111111";
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 6.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = state === "drawing" ? "#ffe169" : state === "near" ? "#f59e0b" : "#38bdf8";
    ctx.fill();
    ctx.lineWidth = Math.max(2, Math.round(2 * scale));
    ctx.strokeStyle = "#111111";
    ctx.stroke();
    ctx.restore();
  };

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(INK_SIZE.width, ((event.clientX - rect.left) / Math.max(1, rect.width)) * INK_SIZE.width));
    const y = Math.max(0, Math.min(INK_SIZE.height, ((event.clientY - rect.top) / Math.max(1, rect.height)) * INK_SIZE.height));
    return { x, y };
  };
  const onCanvasDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isCanvas) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Match DrawingSurface: camera drawing owns the active stroke, pointer cannot split it.
    if (analyzerRef.current.cursor?.state === "drawing") return;
    pointerDown.current = true;
    const point = canvasPoint(event);
    pointerCursor.current = { ...point, state: "drawing", erasing: pointerTool === "eraser" };
    if (pointerTool === "pen") analyzerRef.current.beginPointerStroke(point);
    else analyzerRef.current.erasePointer(point);
    paintInk();
  };
  const onCanvasMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isCanvas || !pointerDown.current) return;
    const point = canvasPoint(event);
    pointerCursor.current = { ...point, state: "drawing", erasing: pointerTool === "eraser" };
    if (pointerTool === "pen") analyzerRef.current.movePointerStroke(point);
    else analyzerRef.current.erasePointer(point);
    paintInk();
  };
  const onCanvasUp = () => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    if (pointerTool === "pen") analyzerRef.current.endPointerStroke();
    else analyzerRef.current.endPointerErase();
    pointerCursor.current = null;
    paintInk();
  };
  const runCanvasAction = (action: "undo" | "redo" | "clear") => {
    analyzerRef.current.canvasAction(action);
    paintInk();
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
      face: new FaceAnchor(),
      analyzer: analyzerRef.current,
      rafId: null,
      timerId: null,
      frameTimes: [],
      lastVideoTime: -1,
      lastVideoFrameCount: null,
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
      if (v.readyState < 2) return;
      // video.currentTime advances continuously and can fake 120+ FPS on a 30 FPS camera.
      const decoded = v.getVideoPlaybackQuality?.().totalVideoFrames;
      if (typeof decoded === "number" && decoded > 0) {
        if (cur.lastVideoFrameCount === decoded) return;
        cur.lastVideoFrameCount = decoded;
      } else {
        if (v.currentTime === cur.lastVideoTime) return;
      }
      cur.lastVideoTime = v.currentTime;
      const t0 = performance.now();
      cur.frameTimes.push(t0);
      // The face has its own, slower rate (face-anchor.ts); it is read before the hands are analysed.
      cur.face.update(v, t0);
      const face = cur.face.current(t0);
      // Through the app-wide gate, so the lab shows the rate and load the game would really get. A frame the
      // gate skips is not analysed; the next camera frame is asked for afresh (latest frame wins).
      const landmarker = cur.landmarker;
      let inferMs = 0;
      let landmarks: Landmark[][] | null;
      try {
        landmarks = pollDetection(cur, v, (timestamp) => {
          const start = performance.now();
          try {
            return landmarker.detectForVideo(frameForDetection(v), timestamp).landmarks;
          } finally {
            inferMs = performance.now() - start;
          }
        });
        cur.failures = 0;
      } catch {
        cur.failures++;
        if (cur.failures >= MAX_DETECT_FAILURES) {
          stopCamera();
          setMessage(messageFor("tracker-error"));
        }
        return;
      }
      if (landmarks === null) return;
      cur.analyzer.analyse({ landmarks, inferMs, nowMs: t0, face });
      paintOverlay(v, cur);
      paintInk();
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
      if (ctx) {
        drawHands(ctx, cur.analyzer.lastHands, cur.analyzer.primaryHandIndex, canvas.width, canvas.height, cur.analyzer.currentFace);
        drawFaceArea(ctx, cur.analyzer.currentFace, canvas.width, canvas.height, cur.face.others(performance.now()));
      }
    };
    const refresh = () => {
      if (session.current !== s) return;
      const now = performance.now();
      s.frameTimes = s.frameTimes.filter((t) => now - t <= 1000);
      const stats = getFrameSourceStats();
      // Read live: a runtime GPU-to-CPU switch shows up here within one refresh.
      const delegate = getDelegateInfo();
      setReadout({
        snapshot: s.analyzer.snapshot(now),
        deliveredFps: s.frameTimes.length,
        luma: stats.lastLuma,
        centerLuma: stats.lastCenterLuma,
        backlightCandidate: stats.backlightCandidate,
        claheMs: stats.lastClaheMs,
        enhancing: stats.enhancing,
        sched: getInferenceStats(),
        faceModel: s.face.status(),
        // getDelegateInfo is process-wide: without a landmarker of this session it may describe an older one.
        engine:
          s.landmarker && delegate.delegate
            ? delegateLabel({
                delegate: delegate.delegate,
                fellBack: delegate.reason === "gpu-failed",
                reason: delegate.reason ?? undefined,
              })
            : "—",
        reason: delegateReasonText(delegate.reason),
        switchText: switchStateText(delegate.switchState, delegate.switchError),
      });
    };
    s.rafId = requestAnimationFrame(tick);
    s.timerId = setInterval(refresh, REFRESH_MS);
  };

  const relockHand = () => {
    analyzerRef.current.resetHandLock(performance.now());
    setReadout((prev) => ({ ...prev, snapshot: analyzerRef.current.snapshot(performance.now()) }));
    paintInk();
  };

  const chooseLowLight = (mode: LowLightMode) => {
    setLowLightEnhancement(mode);
    setLowLightState(mode);
  };

  const snap = readout.snapshot;
  const sched = readout.sched;
  const rejected = snap ? countHandRoles(snap.handRoles) : null;
  const running = phase === "on";
  const wave = snap?.wave;
  const fiveFingerActive = (snap?.pose === "open-palm" || snap?.pose === "split-palm") && snap?.fingerCount === 5;

  return (
    <main className={`nui-lab nui-lab--${variant}`} data-testid={`nui-lab-${variant}`}>
      <nav className="nui-lab__nav" aria-label="Navigasi NUI Lab">
        <a href="/nui-lab">Beranda Lab</a>
        <a href="/nui-lab/gesture" aria-current={isGesture ? "page" : undefined}>Gesture Detection</a>
        <a href="/nui-lab/canvas" aria-current={isCanvas ? "page" : undefined}>Canvas Lab</a>
        {variant === "diagnostics" && <span className="nui-lab__nav-note">Mode diagnostik lama</span>}
      </nav>
      <header className="nui-lab__header">
        <h1>{isCanvas ? "Canvas NUI Lab" : isGesture ? "Gesture Detection Lab" : "Uji Tangan NUI"}</h1>
        <p className="nui-lab__lede">
          {isCanvas
            ? "Uji menggambar memakai MediaPipe atau pointer. Tidak menjalankan game, prediksi Top-3, atau onboarding."
            : isGesture
              ? "Kenali semua pose tangan dari classifier yang sama dengan game. Status merupakan hasil heuristik, bukan confidence model."
              : "Halaman diagnostik lama untuk Owner. Kamera hanya menyala setelah tombol ditekan."}
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
        {variant !== "diagnostics" && (
          <button type="button" className="nui-lab__button" onClick={relockHand} data-testid="lab-relock-hand">
            Kunci ulang tangan
          </button>
        )}
        <p role="status" className="nui-lab__status">
          {supported === false ? "Browser ini belum bisa pakai kamera." : message}
        </p>
      </div>

      <div className="nui-lab__layout">
        <section className="nui-lab__panel nui-lab__camera-panel" aria-labelledby="nui-lab-camera-title">
          <h2 id="nui-lab-camera-title">{isCanvas ? "Kamera langsung" : "Kamera dan tangan"}</h2>
          <div ref={stageRef} className="nui-lab__stage">
            <video ref={videoRef} className="nui-lab__video" muted playsInline autoPlay aria-label="Pratinjau kamera" />
            <canvas ref={overlayRef} className="nui-lab__overlay" aria-label="Kerangka tangan" />
            {!running && <p className="nui-lab__placeholder">Kamera belum menyala.</p>}
          </div>
          {variant !== "diagnostics" && (
            <p className="nui-lab__lock-banner" data-testid="lab-lock-status" aria-live="polite">
              {snap?.lockStatus === "locked" ? "TANGAN TERKUNCI" :
                snap?.lockStatus === "lost" ? "LOCK HILANG, kunci ulang jika tangan berpindah jauh" :
                snap?.lockStatus === "ambiguous" ? "DUA TANGAN AMBIGU, tidak pindah otomatis" :
                snap?.lockStatus === "locking" ? "Mengunci satu tangan…" :
                "Tunjukkan hanya satu tangan untuk mengunci, bebas di seluruh area kamera"}
            </p>
          )}
          <p className="nui-lab__legend">
            <span className="nui-lab__swatch nui-lab__swatch--primary" aria-hidden="true" /> Oranye = tangan utama (diikuti
            game) ·
            <span className="nui-lab__swatch nui-lab__swatch--other" aria-hidden="true" /> Abu-abu = tangan dan wajah lain ·
            <span className="nui-lab__swatch nui-lab__swatch--face" aria-hidden="true" /> Biru = wajah pemain ·
            <span className="nui-lab__swatch nui-lab__swatch--region" aria-hidden="true" /> Ungu = area tangan pemain
          </p>

          {variant === "diagnostics" && (
            <>
              <h3>Coret uji</h3>
              <p className="nui-lab__muted">Cubit untuk coret, buka kelima jari untuk hapus. Kepal tidak menghapus.</p>
              <canvas ref={inkRef} className="nui-lab__ink" width={INK_SIZE.width} height={INK_SIZE.height} aria-label="Kanvas coret uji" />
            </>
          )}
        </section>

        {isCanvas && (
          <section className="nui-lab__panel nui-lab__canvas-workspace" aria-labelledby="nui-lab-canvas-title">
            <h2 id="nui-lab-canvas-title">Kanvas bebas</h2>
            <p className="nui-lab__muted">Pinch coret · 5 jari hapus · 1 jari undo · 2 jari redo. Coba mouse dan sentuh sebagai pembanding.</p>
            <div className="nui-lab__gesture-guide" aria-label="Gestur yang dipakai canvas game">
              <span data-active={snap?.pose === "pinch" ? "true" : "false"}><GestureGlyph name="gesture-pinch" size={37} />Cubit <b>Coret</b></span>
              <span data-active={fiveFingerActive ? "true" : "false"}><GestureGlyph name="gesture-five" size={37} />5 jari <b>Hapus</b></span>
              <span data-active={snap?.pose === "one-finger" ? "true" : "false"}><GestureGlyph name="gesture-one" size={37} />1 jari <b>Undo</b></span>
              <span data-active={snap?.pose === "two-fingers" ? "true" : "false"}><GestureGlyph name="gesture-two" size={37} />2 jari <b>Redo</b></span>
            </div>
            <div className="nui-lab__gesture-hud" data-testid="lab-gesture-hud" aria-live="polite">
              <strong>{snap?.lockStatus === "locked" ? "Terkunci" : "Belum terkunci"}</strong>
              <span>{snap?.pose === "fist" ? "Kepal tidak aktif" : snap ? poseLabel(snap.pose) : "Belum ada gestur"}</span>
              <span>{snap ? `${snap.fingerCount} jari terbuka` : "— jari"}</span>
              <span>{snap?.drawingAction === "draw" ? "PINCH · CORET" :
                snap?.drawingAction === "erase" ? "5 JARI · HAPUS" :
                snap?.drawingAction === "undo" ? "1 JARI · UNDO" :
                snap?.drawingAction === "redo" ? "2 JARI · REDO" : "GERAKAN DIPANTAU"}</span>
            </div>
            <canvas
              ref={inkRef}
              className="nui-lab__ink nui-lab__ink--large"
              width={INK_SIZE.width}
              height={INK_SIZE.height}
              aria-label="Kanvas gambar NUI"
              onPointerDown={onCanvasDown}
              onPointerMove={onCanvasMove}
              onPointerUp={onCanvasUp}
              onPointerCancel={onCanvasUp}
            />
            <div className="nui-lab__momo" aria-label="Petunjuk Momo">
              <MomoAvatar expression={snap?.pose === "pinch" ? "Semangat" : "Penasaran"} height={105} />
              <p className="momo-chat__bubble">Coba gambar perlahan, lalu cepat. Perhatikan garisnya. Kalau tracking hilang, gunakan mouse dulu, ya!</p>
            </div>
          </section>
        )}
        <section className="nui-lab__panel nui-lab__tools-panel" aria-labelledby="nui-lab-numbers-title">
          {isCanvas && (
            <section aria-label="Alat menggambar">
              <h2>Tools gambar</h2>
              <div className="nui-lab__choices">
                <button className="nui-lab__button" type="button" aria-pressed={pointerTool === "pen"} onClick={() => setPointerTool("pen")}>Pena pointer</button>
                <button className="nui-lab__button" type="button" aria-pressed={pointerTool === "eraser"} onClick={() => setPointerTool("eraser")}>Penghapus pointer</button>
                <button className="nui-lab__button" type="button" onClick={() => runCanvasAction("undo")}>Undo</button>
                <button className="nui-lab__button" type="button" onClick={() => runCanvasAction("redo")}>Redo</button>
                <button className="nui-lab__button" type="button" onClick={() => runCanvasAction("clear")}>Bersihkan kanvas</button>
              </div>
              <p className="nui-lab__muted">Gestur kamera tetap memakai mapping mode gambar. Tombol pena dan penghapus hanya mengubah alat mouse/sentuh.</p>
            </section>
          )}
          {isGesture && (
            <section aria-label="Katalog pose yang dapat dideteksi">
              <h2>Pose tangan</h2>
              <p className="nui-lab__muted">Lihat pose aktif, jumlah jari, dan status lock. Halaman ini mengamati, bukan menjalankan perintah game.</p>
              <p className="nui-lab__pose-now" aria-live="polite">{snap ? (snap.pose === "fist" ? "Kepal, tidak ada aksi" : poseLabel(snap.pose)) : "Nyalakan kamera untuk mendeteksi"}</p>
              <p className="nui-lab__muted">Jumlah jari terbuka {snap?.fingerCount ?? "—"}. Hapus hanya saat kelima jari terdeteksi.</p>
              <div className="nui-lab__poses">
                {POSES.map((pose) => (
                  <div key={pose} className="nui-lab__pose" data-active={snap?.pose === pose ? "true" : "false"}>
                    <strong>{poseLabel(pose)}</strong>
                    <small>{snap?.pose === pose ? "TERDETEKSI" : "belum terdeteksi"}</small>
                  </div>
                ))}
              </div>
              <p className="nui-lab__muted">Jempol, pinch, satu/dua/tiga jari, dan telapak lima jari. Kepal bukan perintah gambar. Semua pose bisa dicoba tanpa aksi game.</p>
            </section>
          )}

          <h2 id="nui-lab-numbers-title">Angka langsung</h2>
          <dl className="nui-lab__numbers">
            <Stat label="Resolusi kamera" value={info.width && info.height ? `${info.width} × ${info.height}` : "—"} />
            <Stat label="FPS kamera (pengaturan)" value={info.frameRate ? `${Math.round(info.frameRate)}` : "—"} />
            <Stat label="FPS frame diterima" value={running ? `${readout.deliveredFps} /detik` : "—"} />
            <Stat label="Deteksi efektif" value={sched ? `${sched.effectiveHz} /detik` : "—"} />
            <Stat label="Waktu deteksi rata-rata" value={fmtMs(sched?.avgMs ?? null)} />
            <Stat label="Waktu deteksi p50" value={fmtMs(snap?.inferP50 ?? null)} />
            <Stat label="Waktu deteksi p95" value={fmtMs(snap?.inferP95 ?? null)} />
            <Stat label="Tangan (deteksi)" value={sched ? modelReadoutText(sched.models.hand) : "—"} />
            <Stat label="Wajah (deteksi)" value={sched ? modelReadoutText(sched.models.face) : "—"} />
            <Stat label="Sibuk (diukur)" value={fmtPct(sched ? sched.busyShare * 100 : null)} />
            <Stat label="Mesin (GPU/CPU)" value={readout.engine} />
            <Stat label="Alasan mesin" value={readout.reason} />
            <Stat label="Status pindah mesin" value={readout.switchText} />
            {variant !== "diagnostics" && <Stat label="Status lock tangan" value={snap?.lockStatus ?? "waiting"} />}
            <Stat label="Jari terbuka" value={snap ? String(snap.fingerCount) : "—"} />
            <Stat label="Tangan terlihat" value={snap ? `${snap.handCount} (jauh, diabaikan: ${snap.farHandCount})` : "—"} />
            <Stat
              label="Tangan utama"
              value={
                snap && snap.primaryIndex !== null && snap.primarySize !== null
                  ? `ada, ${Math.round(snap.primarySize * 100)}% lebar frame`
                  : "tidak ada"
              }
            />
            <Stat
              label="Wajah pemain"
              value={snap ? (snap.face ? `ada, ${Math.round(snap.face.w * 100)}% lebar frame` : faceAbsentText(readout.faceModel)) : "—"}
            />
            <Stat
              label="Tangan ditolak"
              value={rejected ? `jauh ${rejected.far} · wajah ${rejected.face} · di luar area ${rejected.outside}` : "—"}
            />
            <Stat label="Pose sekarang" value={snap ? (snap.pose === "fist" ? "Kepal (tanpa aksi)" : poseLabel(snap.pose)) : "—"} />
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
          <dl className="nui-lab__numbers">
            <Stat label="Pembalikan lambaian" value={wave ? `${wave.reversals} dari ${WAVE_MIN_REVERSALS}` : "—"} />
          </dl>
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
            <Stat label="Luma area tengah" value={readout.centerLuma === null ? "—" : readout.centerLuma.toFixed(2)} />
            <Stat label="Indikasi backlight" value={readout.backlightCandidate ? "ya (heuristik)" : "tidak"} />
            <Stat label="CLAHE terakhir" value={fmtMs(readout.claheMs)} />
            <Stat label="Peningkatan cahaya aktif?" value={readout.enhancing ? "ya" : "tidak"} />
          </dl>
          <p>Bandingkan RAW 320 dan CLAHE 320 pada pencahayaan sama. Parameter belum dikalibrasi.</p>
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
