"use client";

/**
 * NUI test page for the Owner (/nui-lab). Not linked from the student flow.
 * Uses R19 G4 Hybrid (G1 Geometry + G3 MLP 82->96->48->3 + PistolVirtualKeyFSM) as the SOLE
 * classifier engine with fail-closed lifecycle guards.
 * The camera starts only on a click; hiding the tab, ending the stream, stopping, or leaving the
 * page releases all virtual keys, the camera tracks, and the MediaPipe hand detector.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import Link from "next/link";
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
import {
  LabAnalyzer,
  type LabDiagnostics,
  type LabR19Telemetry,
  type LabSnapshot,
  type R19ModelState,
} from "./lab-analyzer";
import {
  delegateReasonText,
  faceAbsentText,
  modelReadoutText,
  poseLabel,
  r19DirectionText,
  r19StateLabel,
  switchStateText,
  type R19TelemetryState,
} from "./lab-metrics";
import { LandmarkRecorder, TRUTH_LABELS, type TruthLabel } from "./lab-recorder";
import { countHandRoles } from "./lab-roles";
import type { FingerState } from "./r19/pistol_types";
import { fetchR19Model } from "./r19/r19_loader";
import "./NuiLabPage.css";

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_URL = "/models/hand_landmarker.task";
/** Width of the overlay canvas; its height follows the camera's own aspect ratio. */
const OVERLAY_WIDTH = 640;
const INK_SIZE = { width: 1280, height: 720 };
/** How often the numbers on screen are refreshed (the loop itself runs every frame). */
const REFRESH_MS = 250;
/** Consecutive detector errors before the page stops and says so (as the game's trackers do). */
const MAX_DETECT_FAILURES = 3;

const R19_ENGINE_LABEL = "R19 G4 Hybrid · G1 Geometry + G3 MLP + PistolVirtualKeyFSM";
const R19_VKEY_SCOPE_NOTE =
  "Simulasi tombol virtual R19 hanya untuk diagnostik NUI Lab — tidak menggerakkan Thinman produksi.";
const R19_CANVAS_PISTOL_NOTE = "Gestur pistol hanya dipantau diagnostik — tidak menggerakkan Thinman.";

const LOW_LIGHT_OPTIONS: { mode: LowLightMode; label: string }[] = [
  { mode: "auto", label: "Otomatis" },
  { mode: "off", label: "Mati" },
  { mode: "on", label: "CLAHE 320" },
  { mode: "scaled", label: "RAW 320" },
];

interface R19PoseCard {
  id: string;
  title: string;
  hint: string;
  isActive: (snap: LabSnapshot | null, fiveFingerActive: boolean) => boolean;
}

const R19_POSE_CARDS: R19PoseCard[] = [
  {
    id: "point-ready",
    title: "POINT_READY (Siaga Tunjuk)",
    hint: "Telunjuk lurus, jempol terlipat — tombol virtual tetap OFF.",
    isActive: (snap) => snap?.r19.state === "POINT_READY",
  },
  {
    id: "point-press",
    title: "POINT_PRESS (Pistol Aktif)",
    hint: "Telunjuk lurus, jempol terangkat — simulasi LEFT / JUMP / RIGHT aktif.",
    isActive: (snap) => snap?.r19.state === "POINT_PRESS",
  },
  {
    id: "pinch",
    title: "Cubit (Pinch)",
    hint: "Jempol & telunjuk menyentuh pada mode OTHER untuk mencoret kanvas.",
    isActive: (snap) => snap?.r19.state === "OTHER" && Boolean(snap.r19.guards.pinchActive || snap.pose === "pinch"),
  },
  {
    id: "five",
    title: "Telapak 5 jari (Hapus)",
    hint: "Kelima jari terbuka penuh dan stabil 4 frame untuk menghapus.",
    isActive: (snap, fiveFingerActive) =>
      snap?.r19.state === "OTHER" && Boolean(snap.r19.guards.eraseActive || fiveFingerActive),
  },
  {
    id: "swipe",
    title: "Swipe Kiri/Kanan (Undo/Redo)",
    hint: "Geser kiri 1 jari (Undo) atau geser kanan 2 jari (Redo) saat OTHER.",
    isActive: (snap) =>
      snap?.r19.state === "OTHER" &&
      Boolean(snap.r19.guards.swipeAction !== null || snap.pose === "one-finger" || snap.pose === "two-fingers"),
  },
  {
    id: "thumb-up",
    title: "Jempol Atas (Gate Negatif)",
    hint: "Ditahan sebagai gate negatif agar tidak dianggap pistol atau cubit.",
    isActive: (snap) => Boolean(snap?.r19.guards.isThumbUp || snap?.pose === "thumb-up"),
  },
  {
    id: "fist-other",
    title: "Kepal / Pose Lain (OTHER)",
    hint: "Kepal, tiga/empat jari, atau pose netral tanpa aksi gambar maupun gerak.",
    isActive: (snap) =>
      snap?.r19.state === "OTHER" &&
      (snap.pose === "fist" ||
        snap.pose === "three-fingers" ||
        snap.r19.subClass === "four" ||
        snap.r19.subClass === "unknown"),
  },
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
  cleanupListeners: () => void;
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
  try {
    s.cleanupListeners();
  } catch {
    /* best-effort */
  }
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

function modelStatusText(state: R19ModelState): string {
  switch (state) {
    case "unloaded":
      return "Belum dimuat";
    case "loading":
      return "Memuat model...";
    case "ready":
      return "Siap (R19 G4 Hybrid)";
    case "error":
      return "Gagal memuat model";
  }
}

function fingerStateLabel(state: FingerState | undefined): string {
  switch (state) {
    case "extended":
      return "terbuka";
    case "curled":
      return "terlipat";
    case "between":
      return "setengah";
    default:
      return "—";
  }
}

/** Unified NUI Lab workspace supporting Gesture Detection and Canvas Lab with sole R19 G4 Hybrid engine. */
export function NuiLabPage({ variant = "gesture" }: { variant?: "gesture" | "canvas" } = {}) {
  const isCanvas = variant === "canvas";
  const isGesture = variant === "gesture";
  const [pointerTool, setPointerTool] = useState<"pen" | "eraser">("pen");
  const pointerDown = useRef(false);
  // RD-02: numbers-only recorder, opt-in, local. It stays empty and idle until the tester consents and presses start.
  const recorderRef = useRef(new LandmarkRecorder());
  const truthRef = useRef<TruthLabel>("UNLABELLED");
  const pointerCursor = useRef<HandCursor | null>(null);
  const analyzerRef = useRef(
    new LabAnalyzer({
      fullFrameLock: true,
      enableInk: isCanvas,
    }),
  );
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"off" | "starting" | "on">("off");
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState<CameraInfo>(EMPTY_INFO);
  const [readout, setReadout] = useState<Readout>(EMPTY_READOUT);
  const [lowLight, setLowLightState] = useState<LowLightMode>("auto");
  const [modelState, setModelState] = useState<R19ModelState>("unloaded");
  const [modelError, setModelError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const session = useRef<Session | null>(null);
  /** The lab must not leave its diagnostic preprocessing override active in the student game. */
  const initialDetectionMode = useRef<LowLightMode>("auto");
  /** Bumped by stop and unmount, so a camera/model request that is still opening is discarded cleanly. */
  const generation = useRef({ value: 0 });
  const mounted = useRef(false);

  const syncSnapshot = (analyzer: LabAnalyzer, nowMs = performance.now()) => {
    setReadout((prev) => ({ ...prev, snapshot: analyzer.snapshot(nowMs) }));
  };

  useEffect(() => {
    mounted.current = true;
    const analyzer = analyzerRef.current;
    const recorder = recorderRef.current;
    const genCounter = generation.current;
    initialDetectionMode.current = getFrameSourceStats().mode;
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    setLowLightState(getFrameSourceStats().mode);
    return () => {
      const now = performance.now();
      mounted.current = false;
      setLowLightEnhancement(initialDetectionMode.current);
      genCounter.value++;
      releaseSession(session.current);
      session.current = null;
      recorder.stop();
      analyzer.releaseAll("unmount", now);
      analyzer.stop(now);
    };
  }, []);

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
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x + 0.6, stroke[0]!.y);
      ctx.stroke();
    }
    const handCursor = analyzerRef.current.cursor;
    const cursor =
      handCursor?.state === "drawing"
        ? handCursor
        : pointerDown.current
          ? pointerCursor.current
          : handCursor;
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

  const clearOverlay = () => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const stopCamera = () => {
    const now = performance.now();
    generation.current.value++;
    const s = session.current;
    session.current = null;
    releaseSession(s);
    recorderRef.current.stop();
    analyzerRef.current.releaseAll("stop", now);
    analyzerRef.current.stop(now);
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("off");
    setInfo(EMPTY_INFO);
    setReadout(EMPTY_READOUT);
    if (analyzerRef.current.r19Status === "loading") {
      setModelState("unloaded");
    }
    clearOverlay();
    paintInk();
  };

  const loadR19ModelForAnalyzer = async (analyzer: LabAnalyzer, isWanted: () => boolean) => {
    analyzer.setR19Loading();
    if (isWanted()) {
      setModelState("loading");
      setModelError(null);
      syncSnapshot(analyzer);
    }
    try {
      const model = await fetchR19Model();
      if (!isWanted()) return;
      const now = performance.now();
      analyzer.enableR19(model, now);
      setModelState("ready");
      setModelError(null);
      syncSnapshot(analyzer, now);
    } catch (err) {
      if (!isWanted()) return;
      const msg =
        err instanceof Error && err.message.trim().length > 0 ? err.message : "Gagal memuat model R19";
      const now = performance.now();
      analyzer.failR19(msg, now);
      setModelState("error");
      setModelError(msg);
      syncSnapshot(analyzer, now);
    }
  };

  const retryR19Model = async () => {
    if (modelState === "loading") return;
    const gen = generation.current.value;
    const analyzer = session.current?.analyzer ?? analyzerRef.current;
    await loadR19ModelForAnalyzer(analyzer, () => mounted.current && generation.current.value === gen);
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
    if (session.current) syncSnapshot(session.current.analyzer);
    paintInk();
  };

  const startCamera = async () => {
    if (session.current || phase === "starting") return;
    const gen = ++generation.current.value;
    setPhase("starting");
    setMessage("");
    const result = await startLabCamera(navigator.mediaDevices);
    const stillWanted = () => mounted.current && generation.current.value === gen;
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
      cleanupListeners: () => undefined,
      frameTimes: [],
      lastVideoTime: -1,
      lastVideoFrameCount: null,
      failures: 0,
    };

    const videoTracks = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
    const onTrackEnded = () => {
      if (session.current !== s) return;
      const now = performance.now();
      s.analyzer.releaseAll("stream-ended", now);
      syncSnapshot(s.analyzer, now);
      stopCamera();
      if (mounted.current) setMessage("Stream kamera berhenti");
    };
    const onVisibilityChange = () => {
      if (!document.hidden || session.current !== s) return;
      const now = performance.now();
      s.analyzer.releaseAll("browser-hidden", now);
      syncSnapshot(s.analyzer, now);
      paintInk();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    for (const track of videoTracks) {
      if (typeof track.addEventListener === "function") {
        track.addEventListener("ended", onTrackEnded);
      }
    }
    s.cleanupListeners = () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const track of videoTracks) {
        if (typeof track.removeEventListener === "function") {
          track.removeEventListener("ended", onTrackEnded);
        }
      }
    };

    session.current = s;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      // Not awaited: a slow or refused play must not hold up the model load.
      video.play().catch(() => undefined);
    }
    const settings = videoTracks[0]?.getSettings?.() ?? {};
    setInfo({
      width: settings.width ?? null,
      height: settings.height ?? null,
      frameRate: settings.frameRate ?? null,
    });

    // Launch R19 model loading and MediaPipe HandLandmarker initialization in parallel.
    const r19LoadPromise = loadR19ModelForAnalyzer(s.analyzer, stillWanted);
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
      // Geometry is measured in true image proportions: x/width and y/height are not the same unit on a 16:9 stream.
      const aspect = v.videoWidth > 0 && v.videoHeight > 0 ? v.videoWidth / v.videoHeight : undefined;
      cur.analyzer.analyse({ landmarks, inferMs, nowMs: t0, face, aspect });
      if (recorderRef.current.isRecording) {
        const a = cur.analyzer;
        recorderRef.current.add(a.snapshot(t0), a.primaryLandmarks(), truthRef.current, t0, a.snapshot(t0).diag.lastCommand?.atMs ?? null);
      }
      paintOverlay(v, cur);
      paintInk();
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
    const tick = () => {
      if (session.current !== s) return;
      s.rafId = requestAnimationFrame(tick);
      runFrame(s);
    };
    refresh();
    s.rafId = requestAnimationFrame(tick);
    s.timerId = setInterval(refresh, REFRESH_MS);
    await r19LoadPromise;
  };

  const relockHand = () => {
    const now = performance.now();
    analyzerRef.current.resetHandLock(now);
    syncSnapshot(analyzerRef.current, now);
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
  const r19ModelState: R19ModelState = snap?.modelState ?? modelState;
  const r19ModelError: string | null = snap?.modelError ?? modelError;
  const r19 = snap?.r19 ?? null;

  return (
    <main className={`nui-lab nui-lab--${variant}`} data-testid={`nui-lab-${variant}`}>
      <nav className="nui-lab__nav" aria-label="Navigasi NUI Lab">
        <Link href="/nui-lab">Ringkasan NUI Lab</Link>
        <Link href="/nui-lab/gesture" aria-current={isGesture ? "page" : undefined}>
          Gesture Detection Lab
        </Link>
        <Link href="/nui-lab/canvas" aria-current={isCanvas ? "page" : undefined}>
          Canvas Lab
        </Link>
      </nav>
      <header className="nui-lab__header">
        <h1>{isCanvas ? "Canvas NUI Lab" : "Gesture Detection Lab"}</h1>
        <p className="nui-lab__lede">
          {isCanvas
            ? "Uji menggambar memakai MediaPipe atau pointer dengan gate keselamatan R19 G4 Hybrid. Tidak menjalankan game produksi atau onboarding."
            : "Diagnostik langsung engine tunggal R19 G4 Hybrid (G1 Geometry + G3 MLP + PistolVirtualKeyFSM). Tidak menggerakkan gameplay produksi."}
        </p>
        <div className="nui-lab__r19-bar">
          <span className="nui-lab__r19-badge" data-testid="r19-engine-badge">
            {R19_ENGINE_LABEL}
          </span>
          <span
            className="nui-lab__r19-status"
            data-testid="r19-model-status"
            data-state={r19ModelState}
            aria-live="polite"
          >
            {modelStatusText(r19ModelState)}
          </span>
        </div>
        {r19ModelState === "error" && (
          <div role="alert" className="nui-lab__r19-alert" data-testid="r19-model-error">
            <div>
              <strong>Gagal memuat model R19:</strong>{" "}
              <span>{r19ModelError ?? "Model gagal dimuat."}</span>
            </div>
            <button
              type="button"
              className="nui-lab__button"
              data-testid="r19-retry-model"
              onClick={() => {
                void retryR19Model();
              }}
            >
              Coba muat ulang model
            </button>
          </div>
        )}
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
        {phase === "starting" && <span className="nui-lab__muted">Kamera, pelacak tangan, dan model R19 sedang dibuka…</span>}
        <button type="button" className="nui-lab__button" onClick={relockHand} data-testid="lab-relock-hand">
          Ulang kunci tangan
        </button>
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
          <p className="nui-lab__lock-banner" data-testid="lab-lock-status" aria-live="polite">
            {snap?.lockStatus === "locked"
              ? "Tangan siap"
              : snap?.lockStatus === "lost"
                ? "Mencari tangan aktif lagi… tinta dan tombol ditahan"
                : snap?.lockStatus === "ambiguous"
                  ? "Tunjukkan satu tangan. Aksi ditahan agar tidak salah."
                  : snap?.lockStatus === "locking"
                    ? "Tangan sedang dipastikan…"
                    : "Tunjukkan satu tangan di mana saja dalam kamera. Penguncian otomatis."}
          </p>
          <p className="nui-lab__legend">
            <span className="nui-lab__swatch nui-lab__swatch--primary" aria-hidden="true" /> Oranye = tangan utama ·
            <span className="nui-lab__swatch nui-lab__swatch--other" aria-hidden="true" /> Abu-abu = tangan dan wajah lain ·
            <span className="nui-lab__swatch nui-lab__swatch--face" aria-hidden="true" /> Biru = wajah pemain ·
            <span className="nui-lab__swatch nui-lab__swatch--region" aria-hidden="true" /> Ungu = area tangan pemain
          </p>
        </section>

        {isCanvas && (
          <section className="nui-lab__panel nui-lab__canvas-workspace" aria-labelledby="nui-lab-canvas-title">
            <h2 id="nui-lab-canvas-title">Kanvas bebas</h2>
            <p className="nui-lab__muted">
              Pinch coret · 5 jari hapus · 1 jari geser kiri undo · 2 jari geser kanan redo (hanya aktif saat R19 OTHER).
              Coba mouse dan sentuh sebagai pembanding.
            </p>
            <div className="nui-lab__gesture-guide" aria-label="Gestur yang dipakai canvas NUI">
              <span data-active={snap?.pose === "pinch" && r19?.state === "OTHER" ? "true" : "false"}>
                <GestureGlyph name="gesture-pinch" size={37} />
                Cubit <b>Coret</b>
              </span>
              <span data-active={fiveFingerActive && r19?.state === "OTHER" ? "true" : "false"}>
                <GestureGlyph name="gesture-five" size={37} />
                5 jari <b>Hapus</b>
              </span>
              <span data-active={snap?.pose === "one-finger" && r19?.state === "OTHER" ? "true" : "false"}>
                <GestureGlyph name="gesture-one" size={37} />
                1 jari <b>Swipe Undo</b>
              </span>
              <span data-active={snap?.pose === "two-fingers" && r19?.state === "OTHER" ? "true" : "false"}>
                <GestureGlyph name="gesture-two" size={37} />
                2 jari <b>Swipe Redo</b>
              </span>
            </div>
            <div className="nui-lab__gesture-hud" data-testid="lab-gesture-hud" aria-live="polite">
              <strong>{snap?.lockStatus === "locked" ? "Terkunci" : "Belum terkunci"}</strong>
              <span>{snap?.pose === "fist" ? "Kepal tidak aktif" : snap ? poseLabel(snap.pose) : "Belum ada gestur"}</span>
              <span>{snap ? `${snap.fingerCount} jari terbuka` : "— jari"}</span>
              <span>
                {snap?.drawingAction === "draw"
                  ? "PINCH · CORET"
                  : snap?.drawingAction === "erase"
                    ? "5 JARI · HAPUS"
                    : r19?.guards.swipeAction === "undo"
                      ? "SWIPE · UNDO"
                      : r19?.guards.swipeAction === "redo"
                        ? "SWIPE · REDO"
                        : r19?.state === "POINT_PRESS" || r19?.state === "POINT_READY"
                          ? `${r19.state} · TINTA DITAHAN`
                          : "GERAKAN DIPANTAU"}
              </span>
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
              <p className="momo-chat__bubble">
                Coba gambar perlahan, lalu cepat. Saat gestur pistol aktif, tinta ditahan agar coretan tidak bocor!
              </p>
            </div>
          </section>
        )}

        <section className="nui-lab__panel nui-lab__tools-panel" aria-labelledby="nui-lab-numbers-title">
          {isCanvas && (
            <>
              <section aria-label="Alat menggambar">
                <h2>Tools gambar</h2>
                <div className="nui-lab__choices">
                  <button
                    className="nui-lab__button"
                    type="button"
                    aria-pressed={pointerTool === "pen"}
                    onClick={() => setPointerTool("pen")}
                  >
                    Pena pointer
                  </button>
                  <button
                    className="nui-lab__button"
                    type="button"
                    aria-pressed={pointerTool === "eraser"}
                    onClick={() => setPointerTool("eraser")}
                  >
                    Penghapus pointer
                  </button>
                  <button className="nui-lab__button" type="button" onClick={() => runCanvasAction("undo")}>
                    Undo
                  </button>
                  <button className="nui-lab__button" type="button" onClick={() => runCanvasAction("redo")}>
                    Redo
                  </button>
                  <button className="nui-lab__button" type="button" onClick={() => runCanvasAction("clear")}>
                    Bersihkan kanvas
                  </button>
                </div>
                <p className="nui-lab__muted">
                  Gestur kamera mengikuti aturan keselamatan R19. Tombol pena dan penghapus hanya mengubah alat mouse/sentuh.
                </p>
              </section>

              <R19CanvasReadOnlyPanel snap={snap} r19={r19} />
            </>
          )}

          {isGesture && (
            <>
              <R19DiagnosticsSection snap={snap} r19={r19} />

              <section aria-label="Katalog pose yang dapat dideteksi R19">
                <h2>Pose tangan R19</h2>
                <p className="nui-lab__muted">
                  Lihat status klasifikasi R19, jumlah jari, dan status lock. Halaman ini memantau gestur lokal, bukan
                  menjalankan perintah game siswa.
                </p>
                <p className="nui-lab__pose-now" aria-live="polite">
                  {snap ? (snap.pose === "fist" ? "Kepal, tidak ada aksi" : poseLabel(snap.pose)) : "Nyalakan kamera untuk mendeteksi"}
                </p>
                <p className="nui-lab__muted">
                  Jumlah jari terbuka {snap?.fingerCount ?? "—"}. Hapus hanya aktif saat 5 jari terdeteksi pada mode OTHER.
                </p>
                <div className="nui-lab__poses">
                  {R19_POSE_CARDS.map((card) => {
                    const active = card.isActive(snap, fiveFingerActive);
                    return (
                      <div key={card.id} className="nui-lab__pose" data-active={active ? "true" : "false"}>
                        <strong>{card.title}</strong>
                        <small>{active ? "TERDETEKSI" : card.hint}</small>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          <section className="nui-lab__debug" aria-label="Diagnostik gestur" data-testid="lab-gesture-diagnostics">
            <h3>Kenapa gestur terbaca atau ditolak?</h3>
            <p className="nui-lab__muted">
              Engine tunggal R19 G4 Hybrid menggabungkan batas geometri G1, probabilitas MLP terkalibrasi, dan FSM tombol
              virtual dengan kegagalan tertutup (fail-closed) bila model belum siap.
            </p>
            <dl className="nui-lab__numbers">
              <Stat label="Sesi tangan (bukan identitas orang)" value={snap ? String(snap.acquisitionId) : "—"} />
              <Stat label="Penyebab hand lock" value={snap?.lockReason ?? "—"} />
              <Stat
                label="Rasio cubit jempol-telunjuk"
                value={snap?.pinchRatio === null || snap?.pinchRatio === undefined ? "—" : snap.pinchRatio.toFixed(3)}
              />
              <Stat
                label="Ambang mulai / lepas pinch biasa"
                value={snap ? `${snap.pinchEnter.toFixed(2)} / ${snap.pinchExit.toFixed(2)}` : "—"}
              />
              <Stat
                label="Ambang mulai / lepas pinch jari terlipat"
                value={snap ? `${snap.foldedPinchEnter.toFixed(2)} / ${snap.foldedPinchExit.toFixed(2)}` : "—"}
              />
              <Stat
                label="Telunjuk / tengah / manis / kelingking"
                value={snap?.fingerStates ? snap.fingerStates.map((s) => fingerStateLabel(s)).join(" / ") : "—"}
              />
              <Stat label="Izin tindakan tinta tangan ini" value={snap?.inkAllowed ? "siap" : "ditahan"} />
              <Stat label="Alasan tindakan terakhir" value={snap?.rejectionReason ?? "—"} />
            </dl>
            <GestureDiagnostics diag={snap?.diag ?? null} />
            <RecorderPanel recorder={recorderRef.current} truthRef={truthRef} cameraOn={running} />
          </section>

          <h2 id="nui-lab-numbers-title">Angka langsung</h2>
          <dl className="nui-lab__numbers">
            <Stat label="Resolusi kamera" value={info.width && info.height ? `${info.width} × ${info.height}` : "—"} />
            <Stat label="FPS kamera (pengaturan)" value={info.frameRate ? `${Math.round(info.frameRate)}` : "—"} />
            <Stat label="FPS frame diterima" value={running ? `${readout.deliveredFps} /detik` : "—"} />
            <Stat label="Deteksi efektif" value={sched ? `${sched.effectiveHz} /detik` : "—"} />
            <Stat label="FPS deteksi analyzer" value={snap ? `${snap.detectFps} /detik` : "—"} />
            <Stat label="Waktu deteksi rata-rata" value={fmtMs(sched?.avgMs ?? null)} />
            <Stat label="Waktu deteksi p50" value={fmtMs(snap?.inferP50 ?? null)} />
            <Stat label="Waktu deteksi p95" value={fmtMs(snap?.inferP95 ?? null)} />
            <Stat label="Waktu inferensi R19" value={r19?.ms !== null && r19?.ms !== undefined ? `${r19.ms.toFixed(2)} ms` : "—"} />
            <Stat label="Tangan (deteksi)" value={sched ? modelReadoutText(sched.models.hand) : "—"} />
            <Stat label="Wajah (deteksi)" value={sched ? modelReadoutText(sched.models.face) : "—"} />
            <Stat label="Sibuk (diukur)" value={fmtPct(sched ? sched.busyShare * 100 : null)} />
            <Stat label="Mesin (GPU/CPU)" value={readout.engine} />
            <Stat label="Alasan mesin" value={readout.reason} />
            <Stat label="Status pindah mesin" value={readout.switchText} />
            <Stat label="Status lock tangan" value={snap?.lockStatus ?? "waiting"} />
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
          <p className="nui-lab__muted">Bandingkan RAW 320 dan CLAHE 320 pada pencahayaan sama. Parameter belum dikalibrasi.</p>
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

/** Concise read-only R19 telemetry panel displayed on Canvas Lab. */
function R19CanvasReadOnlyPanel({ snap, r19 }: { snap: LabSnapshot | null; r19: LabR19Telemetry | null }) {
  const state: R19TelemetryState = r19?.state ?? "NO_HAND";
  const direction = r19?.directionLabel ?? "NEUTRAL";
  const directionDisplay = r19?.directionDisplay ?? r19DirectionText("NEUTRAL");
  return (
    <section className="nui-lab__r19-readonly" aria-label="Ringkasan read-only R19">
      <h3>Pemantauan R19 (Read-Only)</h3>
      <p className="nui-lab__r19-scope">{R19_CANVAS_PISTOL_NOTE}</p>
      <dl className="nui-lab__numbers">
        <Stat label="Status R19" value={`${state} · ${r19StateLabel(state)}`} />
        <Stat label="Arah telunjuk" value={`${direction} (${directionDisplay})`} />
        <Stat label="Pinch / Hapus" value={`${yesNo(Boolean(r19?.guards.pinchActive))} / ${yesNo(Boolean(r19?.guards.eraseActive))}`} />
        <Stat label="Alasan / lock" value={`${snap?.lockStatus ?? "waiting"} · ${r19?.reason ?? snap?.rejectionReason ?? "—"}`} />
      </dl>
    </section>
  );
}

/** Primary R19 G4 Hybrid telemetry, softmax probabilities, finger states, safety gates, and virtual keyboard simulator. */
function R19DiagnosticsSection({ snap, r19 }: { snap: LabSnapshot | null; r19: LabR19Telemetry | null }) {
  const r19State: R19TelemetryState = r19?.state ?? "NO_HAND";
  const vkey = r19?.virtualKey;
  const probs = r19?.probs ?? null;
  const fingers = r19?.fingers ?? null;
  const guards = r19?.guards ?? null;
  const directionLabel = r19?.directionLabel ?? "NEUTRAL";
  const directionDisplay = r19?.directionDisplay ?? r19DirectionText("NEUTRAL");
  const angleDeg = r19?.angleDeg ?? null;

  const vkLeft = Boolean(vkey?.left);
  const vkRight = Boolean(vkey?.right);
  const vkJump = Boolean(vkey?.jump || vkey?.jumpPulseActive);
  const vkJumpPulse = Boolean(vkey?.jumpPulseActive);
  const vkJumpFired = Boolean(vkey?.jumpFiredThisFrame);
  const diagDirection =
    r19State === "POINT_PRESS" && (vkey?.zone === "jump-right" || (vkRight && vkJump))
      ? "UP_RIGHT"
      : r19State === "POINT_PRESS" && (vkey?.zone === "jump-left" || (vkLeft && vkJump))
        ? "UP_LEFT"
        : null;

  const probRows: Array<{ key: "ready" | "press" | "other"; label: string; value: number | null }> = [
    { key: "ready", label: "POINT_READY", value: probs ? probs.ready : null },
    { key: "press", label: "POINT_PRESS", value: probs ? probs.press : null },
    { key: "other", label: "OTHER", value: probs ? probs.other : null },
  ];

  return (
    <section className="nui-lab__r19-section" aria-label="Telemetri R19 G4 Hybrid">
      <h2>Telemetri R19 G4 Hybrid</h2>

      <div className="nui-lab__r19-state" data-testid="r19-state-badge" data-r19-state={r19State} aria-live="polite">
        <div className="nui-lab__r19-state-head">
          <strong>{r19State}</strong>
          <span>{r19StateLabel(r19State)}</span>
        </div>
        <div className="nui-lab__r19-state-meta">
          <span>Subkelas: <code>{r19?.subClass ?? "idle"}</code></span>
          <span>Alasan: <code>{r19?.reason ?? snap?.rejectionReason ?? "Kamera belum menyala"}</code></span>
        </div>
      </div>

      <section className="nui-lab__r19-card" data-testid="r19-vkey-panel" aria-label="Simulasi tombol virtual R19">
        <h3>Tombol Virtual R19 (PistolVirtualKeyFSM)</h3>
        <div className="nui-lab__vkey-grid">
          <button
            type="button"
            disabled
            className="nui-lab__vkey-cap"
            data-testid="r19-vkey-left"
            data-active={vkLeft ? "true" : "false"}
            aria-pressed={vkLeft}
          >
            <strong>LEFT (Kiri)</strong>
            <small>{vkLeft ? "AKTIF" : "Lepas"}</small>
          </button>
          <button
            type="button"
            disabled
            className="nui-lab__vkey-cap"
            data-testid="r19-vkey-jump"
            data-active={vkJump ? "true" : "false"}
            aria-pressed={vkJump}
          >
            <strong>JUMP (Lompat)</strong>
            <small>{vkJumpFired ? "Lompat dipicu!" : vkJumpPulse ? "Pulse aktif" : "Lepas"}</small>
          </button>
          <button
            type="button"
            disabled
            className="nui-lab__vkey-cap"
            data-testid="r19-vkey-right"
            data-active={vkRight ? "true" : "false"}
            aria-pressed={vkRight}
          >
            <strong>RIGHT (Kanan)</strong>
            <small>{vkRight ? "AKTIF" : "Lepas"}</small>
          </button>
        </div>

        <div
          className="nui-lab__vkey-diagonal"
          data-testid="r19-vkey-diagonal"
          data-active={diagDirection ? "true" : "false"}
        >
          {diagDirection === "UP_RIGHT"
            ? "Kombo Diagonal Aktif: UP_RIGHT (Lompat + Kanan)"
            : diagDirection === "UP_LEFT"
              ? "Kombo Diagonal Aktif: UP_LEFT (Lompat + Kiri)"
              : "Kombo Diagonal (UP_RIGHT / UP_LEFT): Nonaktif"}
        </div>

        <dl className="nui-lab__numbers" data-testid="r19-vkey-event">
          <Stat label="Event FSM" value={vkey?.event ?? "NONE"} />
          <Stat label="State FSM" value={vkey?.fsmState ?? "NO_HAND"} />
          <Stat label="Alasan lepas" value={vkey?.releaseReason ?? "—"} />
          <Stat
            label="Counter (KD / Held / KU / Jump / RelAll)"
            value={
              vkey
                ? `${vkey.keydowns} / ${vkey.heldFrames} / ${vkey.keyups} / ${vkey.jumps} / ${vkey.releaseAlls}`
                : "0 / 0 / 0 / 0 / 0"
            }
          />
        </dl>

        <p className="nui-lab__r19-scope" data-testid="r19-vkey-scope-note">
          {R19_VKEY_SCOPE_NOTE}
        </p>
      </section>

      <section className="nui-lab__r19-card" data-testid="r19-probs" aria-label="Probabilitas MLP R19">
        <h3>Probabilitas Softmax Terkalibrasi MLP R19 (bukan confidence MediaPipe)</h3>
        <div className="nui-lab__r19-prob-list">
          {probRows.map((row) => {
            const pct = row.value === null ? null : Math.max(0, Math.min(100, row.value * 100));
            return (
              <div key={row.key} className="nui-lab__r19-prob-row">
                <div className="nui-lab__r19-prob-head">
                  <span>{row.label}</span>
                  <strong>{pct === null ? "Belum terbaca" : `${pct.toFixed(1)}%`}</strong>
                </div>
                <div className="nui-lab__r19-prob-bar" aria-hidden="true">
                  <div className="nui-lab__r19-prob-fill" style={{ width: `${pct ?? 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="nui-lab__r19-two-col">
        <section className="nui-lab__r19-card" data-testid="r19-direction" aria-label="Arah telunjuk R19">
          <h3>Arah Telunjuk</h3>
          <dl className="nui-lab__numbers">
            <Stat label="Zona arah" value={directionLabel} />
            <Stat label="Label arah" value={directionDisplay} />
            <Stat label="Sudut telunjuk" value={angleDeg !== null && Number.isFinite(angleDeg) ? `${angleDeg.toFixed(1)}°` : "—"} />
          </dl>
        </section>

        <section className="nui-lab__r19-card" data-testid="r19-fingers" aria-label="Detail jari dan jempol R19">
          <h3>Jari &amp; Jempol</h3>
          <dl className="nui-lab__numbers">
            <Stat label="Jumlah jari terbuka" value={fingers ? `${fingers.count} / 5` : "—"} />
            <Stat label="Jempol" value={fingers ? (fingers.thumbOpen ? "Terbuka (PRESS)" : "Terlipat (READY)") : "—"} />
            <Stat label="Telunjuk" value={fingerStateLabel(fingers?.index)} />
            <Stat label="Tengah" value={fingerStateLabel(fingers?.middle)} />
            <Stat label="Manis" value={fingerStateLabel(fingers?.ring)} />
            <Stat label="Kelingking" value={fingerStateLabel(fingers?.pinky)} />
          </dl>
        </section>
      </div>

      <section className="nui-lab__r19-card" data-testid="r19-guards-panel" aria-label="Gate keselamatan gestur R19">
        <h3>Gestur Lain &amp; Gate Keselamatan</h3>
        <dl className="nui-lab__numbers">
          <Stat label="Pinch aktif (gambar)" value={guards ? `${yesNo(guards.pinchActive)} (geometri: ${yesNo(guards.isPinch)})` : "—"} />
          <Stat label="Hapus 5-jari stabil" value={guards ? yesNo(guards.eraseActive) : "—"} />
          <Stat label="Swipe Undo/Redo" value={guards?.swipeAction ?? "—"} />
          <Stat label="Gate negatif jempol atas" value={guards ? yesNo(guards.isThumbUp) : "—"} />
          <Stat label="Pose aktif" value={snap ? poseLabel(snap.pose) : "Belum terbaca"} />
          <Stat
            label="Lock & akuisisi"
            value={snap ? `${snap.lockStatus} (#${snap.acquisitionId}) · ${snap.rejectionReason}` : "waiting (#0)"}
          />
        </dl>
      </section>
    </section>
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

const yesNo = (v: boolean): string => (v ? "ya" : "tidak");
const f2 = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : v.toFixed(2));

/**
 * Developer readout for one hand, in numbers the rules actually use.
 * Everything here is a landmark measurement or a rule state, never an AI confidence, and nothing identifies a person.
 */
function GestureDiagnostics({ diag }: { diag: LabDiagnostics | null }) {
  const row = (id: string, label: string, value: string) => (
    <div className="nui-lab__stat" data-testid={`lab-diag-${id}`} key={id}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const d = diag;
  const thumb = d?.thumb ?? null;
  const swipe = d?.swipe ?? null;
  const last = d?.lastCommand ?? null;
  return (
    <section className="nui-lab__debug-detail" aria-label="Diagnostik jari dan perintah" data-testid="lab-diag">
      <h4>Diagnostik jari, jempol, dan kanvas (NUI Lab)</h4>
      <dl className="nui-lab__numbers">
        {row("aspect", "Rasio frame yang dipakai geometri", d ? d.aspect.toFixed(3) : "—")}
        {row("pose-raw", "Pose mentah / stabil (vote 3 dari 5)", d ? `${d.rawPose} / ${d.stablePose}` : "—")}
        {row("fingers", "Jari terbuka: geometri R19 / hitungan dasar", d ? `${d.rawFingerCount} / ${d.legacyFingerCount}` : "—")}
        {row("thumb-legacy", "Jempol: rasio dasar (terbuka bila > 1,3)", thumb ? `${f2(thumb.legacyRatio)} → ${thumb.legacyExtended ? "terbuka" : "tertutup"}` : "—")}
        {row("thumb-lateral", "Jempol: posisi menyamping (terbuka bila > 1,3)", thumb ? `${f2(thumb.lateral)} → ${thumb.robustOpen ? "terbuka" : "tertutup"}` : "—")}
        {row("thumb-ip", "Jempol: sudut sendi IP", thumb && thumb.ipAngleDeg !== null ? `${thumb.ipAngleDeg.toFixed(0)}°` : "—")}
        {row("five-valid", "Lima jari valid untuk Hapus", d ? yesNo(d.fiveFingerValid) : "—")}
        {row("armed", "Siap aksi (gambar / hapus / perintah)", d ? `${yesNo(d.armed.draw)} / ${yesNo(d.armed.erase)} / ${yesNo(d.armed.commands)}` : "—")}
        {row("hand-status", "Status tangan (Hapus)", d?.handStatus ?? "—")}
        {row("pipeline", "Gambar / hapus (frame beruntun)", d?.pipeline ? `${d.pipeline.drawing ? "gambar" : "-"} ${d.pipeline.drawStreak} / ${d.pipeline.erasing ? "hapus" : "-"} ${d.pipeline.eraseFrames}` : "—")}
        {row("erase-hit", "Hapus terakhir kena stroke", d?.pipeline?.lastEraseHit === null || d?.pipeline?.lastEraseHit === undefined ? "—" : yesNo(d.pipeline.lastEraseHit))}
        {row("strokes", "Stroke selesai / titik aktif", d ? `${d.strokes.completed} / ${d.strokes.activePoints}` : "—")}
        {row("command-mode", "Mode Undo/Redo", d ? (d.commandMode === "swipe" ? "geser (uji)" : "tahan pose 300 ms") : "—")}
        {row("last-command", "Perintah terakhir (jawaban store)", last ? `${last.kind} · ${last.changed ? "mengubah canvas" : "tidak ada yang diubah"} · ${last.via}` : "—")}
        {row("command-count", "Jumlah perintah dijalankan", d ? String(d.commandCount) : "—")}
        {row("swipe-phase", "Geser: fase", swipe ? `${swipe.phase} (pose ${swipe.pose}, ${swipe.poseStreak} frame)` : "—")}
        {row("swipe-travel", "Geser: jarak / vertikal (lebar telapak)", swipe ? `${f2(swipe.travelSpans)} / ${f2(swipe.verticalSpans)}` : "—")}
        {row("swipe-speed", "Geser: kelurusan / kecepatan", swipe ? `${f2(swipe.straightness)} / ${f2(swipe.speedSpansPerS)} telapak/dtk` : "—")}
        {row("swipe-cancel", "Geser: pembatalan terakhir", swipe?.lastCancel ?? "—")}
      </dl>
      <p className="nui-lab__muted">NUI Lab diagnostik R19 G4 Hybrid — kandidat uji, bukan keputusan gameplay siswa produksi.</p>
    </section>
  );
}

/**
 * RD-02: opt-in local recorder of NUMBERS (21 landmarks and rule readings). No video, no image, no upload: the only way out
 * is a file the tester downloads by hand. It never starts by itself and never without the consent box.
 */
function RecorderPanel({ recorder, truthRef, cameraOn }: { recorder: LandmarkRecorder; truthRef: { current: TruthLabel }; cameraOn: boolean }) {
  const [consent, setConsent] = useState(false);
  const [, bump] = useState(0);
  const [truth, setTruth] = useState<TruthLabel>("UNLABELLED");
  useEffect(() => {
    const id = setInterval(() => bump((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const recording = recorder.isRecording;
  const download = () => {
    const blob = new Blob([recorder.toJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nui-landmark-record.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="nui-lab__debug-detail" aria-label="Rekam landmark lokal" data-testid="lab-recorder">
      <h4>Rekam angka landmark (lokal, opsional)</h4>
      <p className="nui-lab__muted">
        Menyimpan 21 titik landmark dan pembacaan aturan saja. Tidak merekam video atau gambar, tidak mengunggah apa pun.
        File hanya keluar bila kamu menekan Unduh. Data tanpa persetujuan tidak boleh dipakai untuk latihan model.
      </p>
      <label className="nui-lab__check">
        <input type="checkbox" checked={consent} disabled={recording} onChange={(e) => setConsent(e.target.checked)} data-testid="lab-recorder-consent" />
        Saya setuju angka landmark tangan saya direkam di perangkat ini
      </label>
      <label>
        Label dari penguji{" "}
        <select value={truth} onChange={(e) => { const v = e.target.value as TruthLabel; setTruth(v); truthRef.current = v; }} data-testid="lab-recorder-truth">
          {TRUTH_LABELS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <div className="nui-lab__row">
        {!recording ? (
          <button type="button" className="nui-lab__button" disabled={!consent || !cameraOn} onClick={() => { recorder.start(consent, performance.now()); bump((n) => n + 1); }} data-testid="lab-recorder-start">Mulai rekam</button>
        ) : (
          <button type="button" className="nui-lab__button" onClick={() => { recorder.stop(); bump((n) => n + 1); }} data-testid="lab-recorder-stop">Berhenti</button>
        )}
        <button type="button" className="nui-lab__button" disabled={recording || recorder.frameCount === 0} onClick={download} data-testid="lab-recorder-download">Unduh JSON</button>
        <button type="button" className="nui-lab__button" disabled={recorder.frameCount === 0 && !recording} onClick={() => { recorder.discard(); bump((n) => n + 1); }} data-testid="lab-recorder-discard">Hapus rekaman</button>
      </div>
      <p className="nui-lab__muted" data-testid="lab-recorder-status" aria-live="polite">
        {recording ? "Merekam" : "Tidak merekam"} · {recorder.frameCount} frame
      </p>
    </section>
  );
}
