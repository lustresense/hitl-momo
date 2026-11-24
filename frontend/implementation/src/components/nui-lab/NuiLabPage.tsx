"use client";

/**
 * R22 Unified NUI Lab Workspace (/nui-lab/gesture and /nui-lab/canvas).
 *
 * Key R22 guarantees implemented here:
 *  - Clean Owner UX (U01–U04, U06): two-column layout with sticky left camera + independent right scroll on
 *    desktop (>= 960px), zero duplicate camera previews, natural camera aspect without cropping, and zero
 *    engineering dropdowns (no engine/preprocess/detector/scenario/manual-GT selectors).
 *  - Honest runtime badge (A04, U07): displays "NUI R22 · CPU · Otomatis" while exposing the true active
 *    underlying model ID & pinned SHA-256 inside collapsible diagnostics.
 *  - Unique frame synchronization & stale protection (U05, W02, W03, W08): uses `CameraFrameScheduler` (K1)
 *    so identical video frames are never re-inferred from worker callbacks or rAF ticks, binds overlay/pose/action
 *    to synchronized capture/processed frame IDs, and flags stale results (`frameAgeMs > 150` or pending frame).
 *  - Automatic consent-based benchmark lifecycle (B01–B03): starts recording automatically on camera-on once
 *    consent is granted and closes trials cleanly on route change, tab hidden, camera stop, or worker error.
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { MomoAvatar } from "@/src/components/momo/MomoAvatar";
import { GestureGlyph } from "@/src/components/ui/GestureGlyph";
import { frameForDetection, getFrameSourceStats, setLowLightEnhancement, type LowLightMode } from "@/src/camera/frame-source";
import { FaceAnchor, type FaceModelStatus } from "@/src/camera/face-anchor";
import { createHandLandmarker, delegateLabel, getDelegateInfo } from "@/src/camera/hand-landmarker";
import { getInferenceStats, pollDetection, type InferenceStats } from "@/src/camera/inference-scheduler";
import { classifyCameraError, messageFor } from "@/src/camera/messages";
import { WAVE_MIN_REVERSALS } from "@/src/camera/wave-tracker";
import type { HandCursor } from "@/src/input/hand-stroke-pipeline";
import type { Landmark } from "@/src/input/types";
import { drawFaceArea, drawHands } from "./hand-overlay";
import { startLabCamera } from "./lab-camera";
import {
  MomoGuideFSM,
  MOMO_GUIDE_TEXTS,
  type MomoGuideState,
} from "./bench/monui7-momo-guide";
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
import { countHandRoles } from "./lab-roles";
import type { FingerState } from "./r19/pistol_types";
import { validateR19Model } from "./r19/r19_loader";
import {
  BenchSessionBar,
  useBenchConsent,
  useBenchState,
  useLabBenchConfig,
} from "./bench/BenchControls";
import { CamDevPanel } from "./bench/CamDevPanel";
import { GuidedCapturePanel, type GuidedCaptureMetaSnapshot } from "./bench/GuidedCapturePanel";
import { RawVideoRecorder, type RawRecMetaSnapshot } from "./bench/RawVideoRecorder";
import { LabTelemetryBridge } from "./bench/canvas-tracker";
import {
  canUseCpuWorker,
  DEFAULT_MIN_DETECTION_CONFIDENCE,
  DEFAULT_MIN_PRESENCE_CONFIDENCE,
  DEFAULT_MIN_TRACKING_CONFIDENCE,
  parseDetectorConfidenceUrlOverride,
  parseLabDevUrlFlags,
  parseNumHandsUrlOverride,
  parseYoloUrlOverride,
  type DetectorConfidenceUrlOverride,
  type LabDevUrlFlags,
  type NumHandsUrlOverride,
} from "./bench/config";
import {
  AUTO_RUNTIME_UI_LABEL,
  buildEngineConfig,
  DEFAULT_PREPROCESS,
  ENGINE_SPECS,
  fetchEngineModel,
  formatHonestEngineDiagnostics,
  PREPROCESS_CANDIDATES,
} from "./bench/engines";
import { classifyCameraTrack, getAppBuildInfo } from "./bench/env";
import {
  CameraFrameScheduler,
  computeCaptureFrameAgeMs,
  STALE_FRAME_THRESHOLD_MS,
  type CameraFrameTick,
} from "./bench/frame-scheduler";
import type { ActiveCaptureFrameTag } from "./bench/guided-capture-protocol";
import { getBenchManager, type TrialContext } from "./bench/manager";
import { UiPerfMonitor } from "./bench/perf-monitor";
import {
  CANVAS_PRESETS,
  DEFAULT_CANVAS_PRESET_ID,
  getCanvasPreset,
  parsePresetUrlOverride,
  parseReacquirePolicyUrlOverride,
  type ReacquirePinchPolicy,
} from "./bench/presets";
import {
  AutoPreprocessHysteresis,
  BlackFrameDetector,
  CameraExposureController,
  HF3_CAMERA_BLACK_MESSAGE,
  probeCameraExposureCapabilities,
  type AutoPreprocessStatus,
  type CameraExposureCapabilities,
} from "./bench/r20-lowlight";
import { LabCpuWorkerClient, type CpuWorkerResult, type WorkerOwnerTrack } from "./bench/r20-worker-client";
import type { BenchEvent, CameraProfile, EngineId, EventType, PreprocessMode, TruthLabel } from "./bench/schema";
import { quantile } from "./bench/stats";
import "./NuiLabPage.css";

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_URL = "/models/hand_landmarker.task";
/** Width of the overlay canvas; its height follows the camera's own aspect ratio. */
const OVERLAY_WIDTH = 640;
const INK_SIZE = { width: 1280, height: 720 };
/** How often the numbers on screen are refreshed (the loop itself runs on unique camera frames). */
const REFRESH_MS = 200;
/** Consecutive detector errors before the page stops and notifies the Owner. */
const MAX_DETECT_FAILURES = 3;

const R19_VKEY_SCOPE_NOTE =
  "Simulasi tombol virtual untuk diagnostik NUI Lab — tidak menggerakkan karakter siswa produksi.";
const R19_CANVAS_PISTOL_NOTE =
  "Pada Canvas Lab, gestur pistol tidak menutup coretan tinta dan tombol virtual tetap nonaktif.";

interface R19PoseCard {
  id: string;
  title: string;
  hint: string;
  isActive: (snap: LabSnapshot | null, fiveFingerActive: boolean) => boolean;
}

const GESTURE_POSE_CARDS: R19PoseCard[] = [
  {
    id: "point-ready",
    title: "POINT_READY (Siaga Tunjuk)",
    hint: "Telunjuk lurus, jempol terlipat — tombol virtual tetap OFF.",
    isActive: (snap) => snap?.r19.state === "POINT_READY",
  },
  {
    id: "point-press",
    title: "POINT_PRESS (Pistol Aktif)",
    hint: "Telunjuk lurus, jempol terbuka — simulasi LEFT / JUMP / RIGHT aktif.",
    isActive: (snap) => snap?.r19.state === "POINT_PRESS",
  },
  {
    id: "pinch",
    title: "Cubit Rapat (Pinch)",
    hint: "Jempol & telunjuk menyentuh rapat pada mode OTHER.",
    isActive: (snap) => snap?.r19.state === "OTHER" && Boolean(snap.r19.guards.pinchActive || snap.pose === "pinch"),
  },
  {
    id: "five",
    title: "Telapak 5 Jari (Hapus)",
    hint: "Kelima jari terbuka penuh dan stabil untuk menghapus di Canvas.",
    isActive: (snap, fiveFingerActive) =>
      snap?.r19.state === "OTHER" && Boolean(snap.r19.guards.eraseActive || fiveFingerActive),
  },
  {
    id: "three-four",
    title: "3 atau 4 Jari Terbuka (Diagnostik)",
    hint: "Pembacaan diagnostik 3 atau 4 jari terbuka akurat (bukan aksi Canvas).",
    isActive: (snap) =>
      snap?.r19.state === "OTHER" && (snap.fingerCount === 3 || snap.fingerCount === 4),
  },
  {
    id: "fist-other",
    title: "Kepal / Netral (OTHER)",
    hint: "Kepal (0 jari) atau pose netral tanpa aksi gambar maupun gerak.",
    isActive: (snap) =>
      snap?.r19.state === "OTHER" &&
      (snap.pose === "fist" || snap.fingerCount === 0 || snap.r19.subClass === "unknown"),
  },
  {
    id: "thumb-up",
    title: "Jempol Atas (Gate Negatif)",
    hint: "Ditahan sebagai gate negatif agar tidak dianggap pistol atau cubit.",
    isActive: (snap) => Boolean(snap?.r19.guards.isThumbUp || snap?.pose === "thumb-up"),
  },
];

interface CameraInfo {
  width: number | null;
  height: number | null;
  frameRate: number | null;
}

interface FrameSyncState {
  latestCaptureFrameId: number;
  latestCaptureTimestampMs: number | null;
  syncedCaptureFrameId: number | null;
  syncedProcessedFrameId: number | null;
  syncedCaptureTimestampMs: number | null;
  syncedDisplayTimestampMs: number | null;
  frameAgeMs: number | null;
  waitingForNewerFrame: boolean;
  isStaleAge: boolean;
  /** R22B B2.1: Result-arrival display staleness (`now - lastResultArrivalMs > max(250, 2.5 * p50IntervalMs)`). */
  msSinceLastResult: number | null;
  resultIntervalP50Ms: number | null;
  displayStaleThresholdMs: number;
  isDisplayStale: boolean;
  /** R22B B2.1: Show "Kamera tersendat" ONLY when > 500 ms pass with zero new results. */
  isCameraStalled: boolean;
  uniqueCaptureFps: number;
  framesSkippedDuplicate: number;
  detectHz: number;
  uiFps: number;
  pipelineMs: number | null;
  runtimeSetOptionsCalls: number;
  numHandsActive: 1 | 2;
}

interface Readout {
  snapshot: LabSnapshot | null;
  deliveredFps: number;
  luma: number | null;
  centerLuma: number | null;
  lumaP10: number | null;
  lumaP50: number | null;
  lumaP95: number | null;
  clippedPct: number | null;
  handRoiLumaP50: number | null;
  lastRoiLumaP50: number | null;
  nearWhiteHandPct: number | null;
  blurProxy: number | null;
  noiseProxy: number | null;
  backlightCandidate: boolean;
  claheMs: number | null;
  enhancing: boolean;
  activePass: string;
  sched: InferenceStats | null;
  faceModel: FaceModelStatus;
  engine: string;
  reason: string;
  switchText: string;
  sync: FrameSyncState;
}

const EMPTY_INFO: CameraInfo = { width: null, height: null, frameRate: null };
const EMPTY_SYNC: FrameSyncState = {
  latestCaptureFrameId: 0,
  latestCaptureTimestampMs: null,
  syncedCaptureFrameId: null,
  syncedProcessedFrameId: null,
  syncedCaptureTimestampMs: null,
  syncedDisplayTimestampMs: null,
  frameAgeMs: null,
  waitingForNewerFrame: false,
  isStaleAge: false,
  msSinceLastResult: null,
  resultIntervalP50Ms: null,
  displayStaleThresholdMs: 250,
  isDisplayStale: false,
  isCameraStalled: false,
  uniqueCaptureFps: 0,
  framesSkippedDuplicate: 0,
  detectHz: 0,
  uiFps: 0,
  pipelineMs: null,
  runtimeSetOptionsCalls: 0,
  numHandsActive: 2,
};

const EMPTY_READOUT: Readout = {
  snapshot: null,
  deliveredFps: 0,
  luma: null,
  centerLuma: null,
  lumaP10: null,
  lumaP50: null,
  lumaP95: null,
  clippedPct: null,
  handRoiLumaP50: null,
  lastRoiLumaP50: null,
  nearWhiteHandPct: null,
  blurProxy: null,
  noiseProxy: null,
  backlightCandidate: false,
  claheMs: null,
  enhancing: false,
  activePass: "A0_raw",
  sched: null,
  faceModel: "loading",
  engine: "—",
  reason: "—",
  switchText: "—",
  sync: EMPTY_SYNC,
};

/** Everything one camera session owns; released together on stop, track end, or unmount. */
interface Session {
  stream: MediaStream;
  primaryTrack: MediaStreamTrack | null;
  cameraProfile: CameraProfile;
  exposureCaps: CameraExposureCapabilities | null;
  constraintFallback: boolean;
  irCameraSkipped: boolean;
  exposureController: CameraExposureController;
  blackFrameDetector: BlackFrameDetector;
  autoPreprocessStatus: AutoPreprocessStatus;
  pendingHf3Events: Array<{ type: EventType; data?: BenchEvent["data"] }>;
  detectorKind: "cpu-worker" | "cpu-main-thread";
  landmarker: HandLandmarker | null;
  workerClient: LabCpuWorkerClient | null;
  frameScheduler: CameraFrameScheduler;
  /** The player's face in main-thread mode; null in CPU Worker mode to prevent competing detectors. */
  face: FaceAnchor | null;
  analyzer: LabAnalyzer;
  perfMonitor: UiPerfMonitor;
  timerId: ReturnType<typeof setInterval> | null;
  perfTimerId: ReturnType<typeof setInterval> | null;
  cleanupListeners: () => void;
  unsubscribeFrame: () => void;
  detectTimes: number[];
  pipelineSamples: number[];
  /** R22B B2.1: Rolling inter-result arrival intervals (ms) and last arrival timestamp. */
  lastResultArrivalMs: number | null;
  resultIntervalsMs: number[];
  /** R22B B2.7: Continuous backlightCandidate start timestamp. */
  backlightSinceMs: number | null;
  failures: number;
  frameIdSeq: number;
  mainReceived: number;
  mainProcessed: number;
  mainSkipped: number;
  syncedCaptureFrameId: number | null;
  syncedProcessedFrameId: number | null;
  syncedCaptureTimestampMs: number | null;
  syncedDisplayTimestampMs: number | null;
  syncedSnapshot: LabSnapshot | null;
  latestPipelineMs: number | null;
  initSetOptionsCalls: number;
  runtimeSetOptionsCalls: number;
  numHandsActive: 1 | 2;
  numHandsPolicy: "fixed-2" | "fixed-1";
  numHandsOverride: string | null;
  minDetectionConfidence: number;
  minPresenceConfidence: number;
  minTrackingConfidence: number;
  confidenceOverride: string | null;
  lastOwnerTrack: WorkerOwnerTrack | null;
  workerLuma: {
    mean: number | null;
    center: number | null;
    p10: number | null;
    p50: number | null;
    p95: number | null;
    clippedPct: number | null;
    handRoiLumaP50: number | null;
    lastRoiLumaP50: number | null;
    nearWhiteHandPct: number | null;
    blurProxy: number | null;
    noiseProxy: number | null;
    backlight: boolean;
    activePass: string;
    preprocessMs: number | null;
  };
}

function releaseSession(s: Session | null): void {
  if (!s) return;
  try {
    s.exposureController.dispose();
  } catch {
    /* best-effort */
  }
  try {
    s.unsubscribeFrame();
  } catch {
    /* best-effort */
  }
  try {
    s.frameScheduler.stop();
  } catch {
    /* best-effort */
  }
  if (s.timerId !== null) clearInterval(s.timerId);
  if (s.perfTimerId !== null) clearInterval(s.perfTimerId);
  s.perfMonitor.stop();
  try {
    s.cleanupListeners();
  } catch {
    /* best-effort */
  }
  for (const track of s.stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* best-effort */
    }
  }
  try {
    s.landmarker?.close();
  } catch {
    /* best-effort */
  }
  try {
    s.workerClient?.close("session-release");
  } catch {
    /* best-effort */
  }
  s.landmarker = null;
  s.workerClient = null;
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
      return "Siap (CPU)";
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

function friendlyCameraFailureMessage(rawMessage: string): string {
  if (/ditolak|permission|notallowed/i.test(rawMessage)) {
    return "Izin kamera ditolak. Aktifkan izin kamera pada browser lalu coba lagi, atau pakai mouse/sentuh di Canvas.";
  }
  if (/tidak ditemukan|unavailable|notfound/i.test(rawMessage)) {
    return "Kamera tidak ditemukan. Sambungkan webcam atau pakai mouse/sentuh di Canvas.";
  }
  if (/dipakai aplikasi lain|busy|notreadable/i.test(rawMessage)) {
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu tekan Nyalakan kamera.";
  }
  return rawMessage;
}

function canvasUndoRedoFsmLabel(snap: LabSnapshot | null, isStale: boolean): string {
  if (isStale) return "Menunggu frame terbaru";
  if (snap?.diag.lastCommand) {
    return `Perintah: ${snap.diag.lastCommand.kind.toUpperCase()} (${snap.diag.lastCommand.via})`;
  }
  switch (snap?.undoRedoFsmState) {
    case "ARMED_FIST":
      return "Siap Undo/Redo (Kepal)";
    case "CONFIRM_ONE":
      return "Konfirmasi Undo (1 jari)";
    case "CONFIRM_TWO":
      return "Konfirmasi Redo (2 jari)";
    case "FIRED":
      return "Perintah dijalankan";
    default:
      return "Undo/Redo: Netral";
  }
}

function canvasHudStatusLabel(snap: LabSnapshot | null, isStale: boolean): string {
  if (isStale) return "DATA TERTINGGAL · MENUNGGU FRAME";
  if (!snap) return "SIAP GAMBAR";
  if (snap.actionIntent === "HOLD_GRACE") return "TAHAN SESAAT · JEDA DETEKSI";
  if (snap.actionIntent === "DRAW" || snap.drawingAction === "draw") {
    return snap.handState?.variant === "OK" ? "CUBIT OK · MENGGAMBAR" : "CUBIT RAPAT · MENGGAMBAR";
  }
  if (snap.actionIntent === "ERASE" || snap.drawingAction === "erase") return "5 JARI · MENGHAPUS";
  if (snap.actionIntent === "UNDO") return "KEPAL → 1 JARI · UNDO";
  if (snap.actionIntent === "REDO") return "KEPAL → 2 JARI · REDO";
  if (snap.actionIntent === "THREE_ACTION") return "3 JARI · AKSI PRESET";
  if (snap.undoRedoFsmState === "ARMED_FIST" || snap.pose === "fist") return "KEPAL · NETRAL / SIAP";
  return "SIAP GAMBAR";
}

function onsetBlockedLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason === "blocked-by-g1-prime") return "Ditahan: mirip kepal";
  if (reason === "blocked-by-preset-variant") return "Ditahan: varian bukan preset";
  if (reason === "blocked-by-reacquire-policy") return "Ditahan: lepas cubit dulu";
  if (reason === "blocked-by-post-fist-confirm") return "Konfirmasi cubit pasca-kepal…";
  return `Ditahan: ${reason}`;
}

/** Unified NUI Lab workspace supporting Gesture and Canvas routes with sticky left camera and independent right scroll. */
export function NuiLabPage({ variant = "gesture" }: { variant?: "gesture" | "canvas" } = {}) {
  const isCanvas = variant === "canvas";
  const isGesture = variant === "gesture";
  const buildInfo = getAppBuildInfo();
  const benchState = useBenchState();
  const benchCfg = useLabBenchConfig();
  const benchMgr = getBenchManager();
  if (typeof window !== "undefined") {
    (window as unknown as { __benchMgr?: typeof benchMgr }).__benchMgr = benchMgr;
  }
  const [consentGranted] = useBenchConsent();
  const [lowGlare, setLowGlare] = useState(false);
  const [pointerTool, setPointerTool] = useState<"pen" | "eraser">("pen");
  const pointerDown = useRef(false);
  const telemetryBridgeRef = useRef(new LabTelemetryBridge(benchMgr, isCanvas));
  const pointerCursor = useRef<HandCursor | null>(null);
  const momoGuideRef = useRef<MomoGuideFSM>(new MomoGuideFSM());
  const [guideState, setGuideState] = useState<MomoGuideState>("GREET");
  const [guideText, setGuideText] = useState<string | null>(MOMO_GUIDE_TEXTS["GREET"]);
  const analyzerRef = useRef(
    new LabAnalyzer({
      route: variant,
      fullFrameLock: true,
      enableInk: isCanvas,
      cursorFilterMode: isCanvas ? "one-euro" : "default",
    }),
  );
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"off" | "starting" | "on">("off");
  const [message, setMessage] = useState("");
  const [hasErrorMsg, setHasErrorMsg] = useState(false);
  const [info, setInfo] = useState<CameraInfo>(EMPTY_INFO);
  const [readout, setReadout] = useState<Readout>(EMPTY_READOUT);
  const [modelState, setModelState] = useState<R19ModelState>("unloaded");
  const [modelError, setModelError] = useState<string | null>(null);
  const [exposureCaps, setExposureCaps] = useState<CameraExposureCapabilities | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [activeTrack, setActiveTrack] = useState<MediaStreamTrack | null>(null);
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_CANVAS_PRESET_ID);
  const [reacquirePolicy, setReacquirePolicy] = useState<ReacquirePinchPolicy>("require-release");
  const [devFlags, setDevFlags] = useState<LabDevUrlFlags>({
    captureMode: false,
    rawRecMode: false,
    camDevMode: false,
  });
  const [showLightTip, setShowLightTip] = useState(false);
  const [lightTipDismissed, setLightTipDismissed] = useState(false);
  const [cameraBlackAlert, setCameraBlackAlert] = useState(false);
  const [videoDevices, setVideoDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const selectedDeviceIdRef = useRef<string>("");
  const startingRef = useRef(false);
  const [urlHandsOverride, setUrlHandsOverride] = useState<NumHandsUrlOverride>({
    numHandsPolicy: "fixed-2",
    fixedNumHands: 2,
    numHandsOverride: null,
  });
  const [urlConfOverride, setUrlConfOverride] = useState<DetectorConfidenceUrlOverride>({
    minDetectionConfidence: DEFAULT_MIN_DETECTION_CONFIDENCE,
    minPresenceConfidence: DEFAULT_MIN_PRESENCE_CONFIDENCE,
    minTrackingConfidence: DEFAULT_MIN_TRACKING_CONFIDENCE,
    confidenceOverride: null,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const session = useRef<Session | null>(null);
  const activeEngineRef = useRef<EngineId>(benchCfg.engineId);
  const activePreprocessRef = useRef<PreprocessMode>(benchCfg.preprocess);
  const activePresetRef = useRef<string>(DEFAULT_CANVAS_PRESET_ID);
  const reacquirePolicyRef = useRef<ReacquirePinchPolicy>("require-release");
  const captureTagProviderRef = useRef<((nowMs: number) => ActiveCaptureFrameTag | null) | null>(null);
  const captureMetaRef = useRef<GuidedCaptureMetaSnapshot | null>(null);
  const rawRecMetaRef = useRef<RawRecMetaSnapshot | null>(null);
  const modelHashVerifiedRef = useRef<boolean>(false);
  /** The lab must not leave its diagnostic preprocessing override active in the student game. */
  const initialDetectionMode = useRef<LowLightMode>("auto");
  /** Bumped by stop and unmount, so a camera/model request that is still opening is discarded cleanly. */
  const generation = useRef({ value: 0 });
  const mounted = useRef(false);

  activeEngineRef.current = benchCfg.engineId;
  activePreprocessRef.current = benchCfg.preprocess;
  activePresetRef.current = activePresetId;
  reacquirePolicyRef.current = reacquirePolicy;
  selectedDeviceIdRef.current = selectedDeviceId;

  const refreshVideoDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.enumerateDevices !== "function") {
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      if (!mounted.current) return;
      const cams = list
        .filter((d) => d.kind === "videoinput" && Boolean(d.deviceId))
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label && d.label.trim().length > 0 ? d.label.trim() : `Kamera ${idx + 1}`,
        }));
      setVideoDevices(cams);
    } catch {
      /* ignore enumerateDevices failures */
    }
  }, []);

  const activeEngineSpec = ENGINE_SPECS[benchCfg.engineId];
  const honestDiag = formatHonestEngineDiagnostics({
    engineId: benchCfg.engineId,
    modelSha256: activeEngineSpec.sha256,
    modelHashVerified: modelHashVerifiedRef.current,
    isTrainedR22Model: activeEngineSpec.isTrainedR22Model,
  });

  const handlePresetChange = (nextId: string, source: "user" | "system" = "user") => {
    const from = activePresetRef.current;
    const resolved = getCanvasPreset(nextId);
    setActivePresetId(resolved.id);
    activePresetRef.current = resolved.id;
    analyzerRef.current.setPreset(resolved);
    benchMgr.patchActiveTrialMeta({ presetId: resolved.id });
    benchMgr.event("PRESET_CHANGED", { from, to: resolved.id, source }, "system");
    if (session.current) {
      syncSnapshot(session.current.analyzer);
    }
  };

  const handleCaptureTagProviderChange = useCallback(
    (provider: ((nowMs: number) => ActiveCaptureFrameTag | null) | null) => {
      captureTagProviderRef.current = provider;
    },
    [],
  );

  const handleCaptureMetaChange = useCallback(
    (meta: GuidedCaptureMetaSnapshot | null) => {
      captureMetaRef.current = meta;
      benchMgr.patchActiveTrialMeta({ captureMeta: meta });
    },
    [benchMgr],
  );

  const handleRawRecMetaChange = useCallback(
    (meta: RawRecMetaSnapshot | null) => {
      rawRecMetaRef.current = meta;
      benchMgr.patchActiveTrialMeta({ rawRecMeta: meta });
    },
    [benchMgr],
  );

  const handleCaptureStepEvent = useCallback(
    (
      kind: "CAPTURE_STEP_START" | "CAPTURE_STEP_END",
      detail: Record<string, string | number | boolean | null>,
    ) => {
      if (benchMgr.isActive) {
        benchMgr.event(kind, detail, "system", false, "DATASET_GT");
      }
    },
    [benchMgr],
  );

  const handleRawRecEvent = useCallback(
    (kind: "RAWREC_START" | "RAWREC_STOP", detail: Record<string, string | number | boolean | null>) => {
      if (benchMgr.isActive) {
        benchMgr.event(kind, detail, "system", false, "USER_ACTION");
      }
    },
    [benchMgr],
  );

  const syncSnapshot = (analyzer: LabAnalyzer, nowMs = performance.now()) => {
    const snap = analyzer.snapshot(nowMs);
    if (isCanvas && momoGuideRef.current) {
      const cur = session.current;
      const luma = cur?.workerLuma;
      const schedStats = cur?.frameScheduler.getStats(nowMs);
      const uniqueCaptureFps =
        schedStats && schedStats.lastCaptureFrameId > 0 ? schedStats.uniqueCaptureFps : null;
      const gRes = momoGuideRef.current.update({
        nowMs,
        hasHand: snap.handCount > 0,
        fiveFingerValid:
          snap.diag.fiveFingerValid ||
          snap.diag.stablePose === "open-palm" ||
          snap.pose === "open-palm" ||
          snap.fingerCount === 5 ||
          snap.diag.rawFingerCount === 5,
        drawingActive: snap.drawingAction === "draw",
        rescueState: null,
        handRoiLumaP50: luma?.handRoiLumaP50 ?? null,
        frameLumaMean: luma?.mean ?? null,
        backlight: luma?.backlight ?? null,
        uniqueCaptureFps,
        exposureControlAttempted: cur?.exposureController.hasAttemptedOrUnsupported ?? false,
      });
      setGuideState(gRes.state);
      setGuideText(gRes.text);
      if (gRes.promptEvent && benchMgr.isActive) {
        benchMgr.event("GUIDE_PROMPT", { id: gRes.promptEvent.state, text: gRes.promptEvent.text, atMs: gRes.promptEvent.atMs }, "system");
      }
    }
    setReadout((prev) => ({ ...prev, snapshot: snap }));
  };

  const buildHf3SessionMeta = (s: Session) => {
    const v = videoRef.current;
    const settings = s.primaryTrack?.getSettings?.() ?? {};
    const actualWidth = (v?.videoWidth && v.videoWidth > 0 ? v.videoWidth : null) ?? settings.width ?? s.cameraProfile.width ?? null;
    const actualHeight = (v?.videoHeight && v.videoHeight > 0 ? v.videoHeight : null) ?? settings.height ?? s.cameraProfile.height ?? null;
    const actualFps =
      typeof settings.frameRate === "number" && Number.isFinite(settings.frameRate)
        ? Math.round(settings.frameRate * 10) / 10
        : s.cameraProfile.frameRate;
    return {
      cameraActual: {
        width: actualWidth,
        height: actualHeight,
        frameRate: actualFps,
        deviceClass: s.cameraProfile.deviceClass,
        constraintFallback: s.constraintFallback,
        irCameraSkipped: s.irCameraSkipped,
      },
      cameraCapabilities: {
        supported: Boolean(s.exposureCaps?.supported),
        exposureMode: s.exposureCaps?.exposureMode ?? null,
        exposureTime: s.exposureCaps?.exposureTime ?? null,
        currentExposureMode: s.exposureCaps?.currentExposureMode ?? null,
        currentExposureTime: s.exposureCaps?.currentExposureTime ?? null,
        canLockExposureTime: Boolean(s.exposureCaps?.canLockExposureTime),
      },
      exposureControlStatus: s.exposureController.getStatus(),
      autoPreprocessStatus: s.autoPreprocessStatus,
    };
  };

  const emitOrBufferHf3Event = (s: Session, type: EventType, data?: BenchEvent["data"]) => {
    if (benchMgr.isActive) {
      benchMgr.event(type, data, "system");
    } else {
      s.pendingHf3Events.push({ type, data });
    }
  };

  const buildTrialCtx = (s: Session, engineId: EngineId, preprocess: PreprocessMode): TrialContext => ({
    route: variant,
    source: isCanvas ? "canvas-lab" : "gesture-lab",
    engine: buildEngineConfig(engineId, preprocess, s.detectorKind, modelHashVerifiedRef.current, {
      numHandsPolicy:
        s.detectorKind === "cpu-worker"
          ? s.numHandsPolicy
          : s.numHandsPolicy === "fixed-1"
            ? "fixed-1"
            : "main-thread-fixed-2",
      numHandsOverride: s.numHandsOverride,
    }),
    camera: s.cameraProfile,
    numHandsActive: s.numHandsActive,
    numHandsOverride: s.numHandsOverride,
    minDetectionConfidence: s.minDetectionConfidence,
    minPresenceConfidence: s.minPresenceConfidence,
    minTrackingConfidence: s.minTrackingConfidence,
    confidenceOverride: s.confidenceOverride,
    presetId: activePresetRef.current,
    reacquirePinchPolicy: reacquirePolicyRef.current,
    captureMeta: captureMetaRef.current,
    rawRecMeta: rawRecMetaRef.current,
    initSetOptionsCalls: s.initSetOptionsCalls,
  });

  const ensureAutoBenchActiveAndOpenTrial = async (s: Session, reason: string) => {
    const yoloEnabled = parseYoloUrlOverride();
    const hf3Meta = buildHf3SessionMeta(s);
    await benchMgr.startCameraTrialAuto(
      buildTrialCtx(s, activeEngineRef.current, activePreprocessRef.current),
      { reason, yoloEnabled, ...hf3Meta },
    );
    if (session.current === s && benchMgr.isActive) {
      telemetryBridgeRef.current.reset();
      benchMgr.patchSessionMeta(buildHf3SessionMeta(s));
      if (s.pendingHf3Events.length > 0) {
        const queued = s.pendingHf3Events.splice(0);
        for (const ev of queued) {
          benchMgr.event(ev.type, ev.data, "system");
        }
      }
    }
  };
  const ensureAutoBenchRef = useRef(ensureAutoBenchActiveAndOpenTrial);
  ensureAutoBenchRef.current = ensureAutoBenchActiveAndOpenTrial;

  useEffect(() => {
    mounted.current = true;
    const analyzer = analyzerRef.current;
    const genCounter = generation.current;
    initialDetectionMode.current = getFrameSourceStats().mode;
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    setUrlHandsOverride(parseNumHandsUrlOverride());
    setUrlConfOverride(parseDetectorConfidenceUrlOverride());
    setDevFlags(parseLabDevUrlFlags());
    const presetParsed = parsePresetUrlOverride();
    setActivePresetId(presetParsed.preset.id);
    activePresetRef.current = presetParsed.preset.id;
    analyzer.setPreset(presetParsed.preset);
    const reacquireParsed = parseReacquirePolicyUrlOverride();
    setReacquirePolicy(reacquireParsed.policy);
    reacquirePolicyRef.current = reacquireParsed.policy;
    analyzer.setReacquirePinchPolicy(reacquireParsed.policy);
    if (benchMgr.isActive) {
      benchMgr.event("ROUTE_CHANGE", { to: variant }, "system");
    }
    void refreshVideoDevices();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const onDeviceChange = () => {
      void refreshVideoDevices();
    };
    if (md && typeof md.addEventListener === "function") {
      md.addEventListener("devicechange", onDeviceChange);
    }
    return () => {
      const now = performance.now();
      mounted.current = false;
      startingRef.current = false;
      if (md && typeof md.removeEventListener === "function") {
        md.removeEventListener("devicechange", onDeviceChange);
      }
      setLowLightEnhancement(initialDetectionMode.current);
      genCounter.value++;
      releaseSession(session.current);
      session.current = null;
      analyzer.releaseAll("unmount", now);
      analyzer.stop(now);
      if (benchMgr.hasOpenTrial) {
        benchMgr.endTrial("route-switch");
      }
    };
  }, [benchMgr, refreshVideoDevices, variant]);

  // Auto-start benchmark session & trial if consent is granted while camera is already ON.
  useEffect(() => {
    const s = session.current;
    if (phase === "on" && modelState === "ready" && s && (consentGranted || benchState.phase === "active") && !benchMgr.hasOpenTrial) {
      void ensureAutoBenchRef.current(s, "consent-granted-while-camera-on");
    }
  }, [phase, modelState, consentGranted, benchState.phase, benchMgr]);

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
    // A8 #13: live cursor is shown whenever a hand is present; ink draws only on pinch contact.
    const handCursor = analyzerRef.current.cursor;
    const cursor =
      handCursor?.state === "drawing"
        ? handCursor
        : pointerDown.current
          ? pointerCursor.current
          : handCursor;
    const scale = canvas.width / (canvas.clientWidth || canvas.width);
    if (!cursor) {
      // R22B B2.8: Show subtle ghost/shadow cursor at last known position when hand is lost > 600 ms.
      const liveSnap = analyzerRef.current.snapshot(performance.now());
      if (isCanvas && liveSnap.handLostDurationMs > 600 && liveSnap.lastCursor) {
        ctx.save();
        ctx.setLineDash([4 * scale, 4 * scale]);
        ctx.beginPath();
        ctx.arc(liveSnap.lastCursor.x, liveSnap.lastCursor.y, 8 * scale, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.strokeStyle = "rgba(71, 85, 105, 0.7)";
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    const { x, y, state } = cursor;
    if (cursor.erasing) {
      const eraserRadiusPx = Math.max(8, analyzerRef.current.eraserRadiusCanvasPx);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, eraserRadiusPx, 0, Math.PI * 2);
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

  const stopCamera = (reason = "camera-stop") => {
    const now = performance.now();
    generation.current.value++;
    startingRef.current = false;
    const s = session.current;
    session.current = null;
    releaseSession(s);
    analyzerRef.current.releaseAll(reason, now);
    analyzerRef.current.stop(now);
    if (benchMgr.isActive) {
      benchMgr.event("CAMERA_STOP", { reason }, "system");
      if (benchMgr.hasOpenTrial) {
        const endReason = reason === "tracker-error" || reason === "worker-error" ? "worker-error" : "camera-stop";
        benchMgr.endTrial(endReason);
      }
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("off");
    setInfo(EMPTY_INFO);
    setReadout(EMPTY_READOUT);
    setExposureCaps(null);
    setActiveStream(null);
    setActiveTrack(null);
    setShowLightTip(false);
    setCameraBlackAlert(false);
    if (analyzerRef.current.r19Status === "loading") {
      setModelState("unloaded");
    }
    clearOverlay();
    paintInk();
  };

  const loadModelForEngine = async (
    engineId: EngineId,
    analyzer: LabAnalyzer,
    isWanted: () => boolean,
  ): Promise<boolean> => {
    analyzer.setR19Loading();
    modelHashVerifiedRef.current = false;
    if (isWanted()) {
      setModelState("loading");
      setModelError(null);
      syncSnapshot(analyzer);
    }
    try {
      const loaded = await fetchEngineModel(engineId);
      const model = validateR19Model(loaded.json);
      if (!isWanted()) return false;
      modelHashVerifiedRef.current = loaded.hashVerified;
      const now = performance.now();
      analyzer.enableR19(model, now);
      setModelState("ready");
      setModelError(null);
      syncSnapshot(analyzer, now);
      return true;
    } catch (err) {
      if (!isWanted()) return false;
      const msg =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : `Gagal memuat model ${ENGINE_SPECS[engineId].short}`;
      const now = performance.now();
      analyzer.failR19(msg, now);
      setModelState("error");
      setModelError(msg);
      syncSnapshot(analyzer, now);
      return false;
    }
  };

  const retryR19Model = async () => {
    if (modelState === "loading") return;
    const gen = generation.current.value;
    const analyzer = session.current?.analyzer ?? analyzerRef.current;
    await loadModelForEngine(
      activeEngineRef.current,
      analyzer,
      () => mounted.current && generation.current.value === gen,
    );
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
    telemetryBridgeRef.current.onPointerDown(pointerTool, point, performance.now());
    paintInk();
  };
  const onCanvasMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isCanvas || !pointerDown.current) return;
    const point = canvasPoint(event);
    pointerCursor.current = { ...point, state: "drawing", erasing: pointerTool === "eraser" };
    if (pointerTool === "pen") analyzerRef.current.movePointerStroke(point);
    else analyzerRef.current.erasePointer(point);
    telemetryBridgeRef.current.onPointerMove(point);
    paintInk();
  };
  const onCanvasUp = () => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    if (pointerTool === "pen") analyzerRef.current.endPointerStroke();
    else analyzerRef.current.endPointerErase();
    telemetryBridgeRef.current.onPointerUp(performance.now());
    pointerCursor.current = null;
    paintInk();
  };
  const runCanvasAction = (action: "undo" | "redo" | "clear") => {
    analyzerRef.current.canvasAction(action);
    telemetryBridgeRef.current.onManualCanvasAction(action);
    if (session.current) syncSnapshot(session.current.analyzer);
    paintInk();
  };

  const startCamera = async (overrideDeviceId?: string) => {
    if (session.current || startingRef.current) return;
    startingRef.current = true;
    const gen = ++generation.current.value;
    setPhase("starting");
    setMessage("");
    setHasErrorMsg(false);
    setCameraBlackAlert(false);
    const chosenDeviceId = overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceIdRef.current;
    const result = await startLabCamera(
      navigator.mediaDevices,
      chosenDeviceId ? { deviceId: chosenDeviceId } : undefined,
    );
    const stillWanted = () => mounted.current && generation.current.value === gen;
    if (result.kind === "error") {
      startingRef.current = false;
      if (stillWanted()) {
        setPhase("off");
        setMessage(friendlyCameraFailureMessage(result.message));
        setHasErrorMsg(true);
      }
      return;
    }
    const stream = result.stream;
    if (!stillWanted()) {
      startingRef.current = false;
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    void refreshVideoDevices();

    const videoTracks = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
    const primaryTrack = videoTracks[0] ?? null;
    const exposureCapProbe = probeCameraExposureCapabilities(primaryTrack ?? undefined);
    setExposureCaps(exposureCapProbe);
    setActiveStream(stream);
    setActiveTrack(primaryTrack);
    setShowLightTip(false);
    setLightTipDismissed(false);
    const cameraProfile: CameraProfile = {
      ...classifyCameraTrack(primaryTrack ?? undefined),
      exposureProbeSupported: exposureCapProbe.supported,
      exposureCapabilities: exposureCapProbe,
    };
    const useWorker = benchCfg.detector === "cpu-worker" && canUseCpuWorker();
    const detectorKind: "cpu-worker" | "cpu-main-thread" = useWorker ? "cpu-worker" : "cpu-main-thread";
    const handsOverride = parseNumHandsUrlOverride();
    const confOverride = parseDetectorConfidenceUrlOverride();
    setUrlHandsOverride(handsOverride);
    setUrlConfOverride(confOverride);

    if (!useWorker) {
      const mapped: LowLightMode =
        benchCfg.preprocess === "raw" ? "off" : benchCfg.preprocess === "clahe" ? "on" : "auto";
      setLowLightEnhancement(mapped);
    }

    const frameScheduler = new CameraFrameScheduler();
    const initialAutoPreStatus = new AutoPreprocessHysteresis().getStatus();
    const pendingHf3Events: Array<{ type: EventType; data?: BenchEvent["data"] }> = [];
    if (result.constraintFallback) {
      pendingHf3Events.push({
        type: "CAMERA_CONSTRAINT_FALLBACK",
        data: {
          reason: result.fallbackReason ?? "OverconstrainedError",
          retriedWithoutMinFps: true,
        },
      });
    }

    let sessionRefLocal: Session | null = null;
    const exposureController = new CameraExposureController(primaryTrack, exposureCapProbe, {
      onLocked: (detail) => {
        if (!sessionRefLocal || session.current !== sessionRefLocal) return;
        emitOrBufferHf3Event(sessionRefLocal, "CAMERA_EXPOSURE_LOCKED", {
          beforeExposureMode: detail.beforeExposureMode,
          beforeExposureTime: detail.beforeExposureTime,
          afterExposureMode: detail.afterExposureMode,
          afterExposureTime: detail.afterExposureTime,
          unit: detail.unit,
          fpsBeforeLock: detail.fpsBeforeLock,
        });
        benchMgr.patchSessionMeta({ exposureControlStatus: exposureController.getStatus() });
      },
      onReverted: (detail) => {
        if (!sessionRefLocal || session.current !== sessionRefLocal) return;
        emitOrBufferHf3Event(sessionRefLocal, "CAMERA_EXPOSURE_REVERTED", {
          reason: detail.reason,
          beforeExposureMode: detail.beforeExposureMode,
          beforeExposureTime: detail.beforeExposureTime,
          afterExposureMode: detail.afterExposureMode,
          fpsBeforeLock: detail.fpsBeforeLock,
          fpsAtRevert: detail.fpsAtRevert,
          error: detail.error,
        });
        benchMgr.patchSessionMeta({ exposureControlStatus: exposureController.getStatus() });
      },
      onStatusChange: (status) => {
        if (!sessionRefLocal || session.current !== sessionRefLocal) return;
        benchMgr.patchSessionMeta({ exposureControlStatus: status });
      },
    });

    const s: Session = {
      stream,
      primaryTrack,
      cameraProfile,
      exposureCaps: exposureCapProbe,
      constraintFallback: result.constraintFallback,
      irCameraSkipped: result.irCameraSkipped,
      exposureController,
      blackFrameDetector: new BlackFrameDetector(),
      autoPreprocessStatus: initialAutoPreStatus,
      pendingHf3Events,
      detectorKind,
      landmarker: null,
      workerClient: null,
      frameScheduler,
      face: useWorker ? null : new FaceAnchor(),
      analyzer: analyzerRef.current,
      perfMonitor: new UiPerfMonitor(2000),
      timerId: null,
      perfTimerId: null,
      cleanupListeners: () => undefined,
      unsubscribeFrame: () => undefined,
      detectTimes: [],
      pipelineSamples: [],
      lastResultArrivalMs: null,
      resultIntervalsMs: [],
      backlightSinceMs: null,
      failures: 0,
      frameIdSeq: 0,
      mainReceived: 0,
      mainProcessed: 0,
      mainSkipped: 0,
      syncedCaptureFrameId: null,
      syncedProcessedFrameId: null,
      syncedCaptureTimestampMs: null,
      syncedDisplayTimestampMs: null,
      syncedSnapshot: null,
      latestPipelineMs: null,
      initSetOptionsCalls: 0,
      runtimeSetOptionsCalls: 0,
      numHandsActive: handsOverride.fixedNumHands,
      numHandsPolicy: handsOverride.numHandsPolicy,
      numHandsOverride: handsOverride.numHandsOverride,
      minDetectionConfidence: confOverride.minDetectionConfidence,
      minPresenceConfidence: confOverride.minPresenceConfidence,
      minTrackingConfidence: confOverride.minTrackingConfidence,
      confidenceOverride: confOverride.confidenceOverride,
      lastOwnerTrack: null,
      workerLuma: {
        mean: null,
        center: null,
        p10: null,
        p50: null,
        p95: null,
        clippedPct: null,
        handRoiLumaP50: null,
        lastRoiLumaP50: null,
        nearWhiteHandPct: null,
        blurProxy: null,
        noiseProxy: null,
        backlight: false,
        activePass: "A0_raw",
        preprocessMs: null,
      },
    };

    const onTrackEnded = () => {
      if (session.current !== s) return;
      const now = performance.now();
      s.analyzer.releaseAll("stream-ended", now);
      if (benchMgr.isActive) benchMgr.event("TRACK_ENDED", {}, "system");
      syncSnapshot(s.analyzer, now);
      stopCamera("stream-ended");
      if (mounted.current) {
        setMessage("Kamera terputus atau ditutup. Tekan Nyalakan kamera untuk menyambungkan ulang.");
        setHasErrorMsg(true);
      }
    };
    const onVisibilityChange = () => {
      if (session.current !== s) return;
      if (document.hidden) {
        const now = performance.now();
        s.analyzer.releaseAll("browser-hidden", now);
        benchMgr.onTabHidden();
        syncSnapshot(s.analyzer, now);
        paintInk();
      } else {
        benchMgr.onTabVisible(buildTrialCtx(s, activeEngineRef.current, activePreprocessRef.current));
      }
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

    sessionRefLocal = s;
    session.current = s;
    startingRef.current = false;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      // Not awaited: a slow or refused play must not hold up the model load.
      video.play().catch(() => undefined);
    }
    const settings = primaryTrack?.getSettings?.() ?? {};
    setInfo({
      width: settings.width ?? null,
      height: settings.height ?? null,
      frameRate: settings.frameRate ?? null,
    });
    if (benchMgr.isActive) {
      benchMgr.patchSessionMeta(buildHf3SessionMeta(s));
      if (s.pendingHf3Events.length > 0) {
        const queued = s.pendingHf3Events.splice(0);
        for (const ev of queued) {
          benchMgr.event(ev.type, ev.data, "system");
        }
      }
      benchMgr.event(
        "CAMERA_START",
        {
          width: settings.width ?? null,
          height: settings.height ?? null,
          frameRate: settings.frameRate ?? null,
          detector: detectorKind,
          constraintFallback: result.constraintFallback,
          irCameraSkipped: result.irCameraSkipped,
        },
        "system",
      );
    }

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
        // R22B B2.1: Never clear/blank overlay on display stale; CSS dims via data-stale instead.
        drawHands(ctx, cur.analyzer.lastHands, cur.analyzer.primaryHandIndex, canvas.width, canvas.height, cur.analyzer.currentFace);
        drawFaceArea(
          ctx,
          cur.analyzer.currentFace,
          canvas.width,
          canvas.height,
          cur.face ? cur.face.others(performance.now()) : [],
        );
      }
    };

    const recordFrameToBench = (
      cur: Session,
      opts: {
        captureFrameId: number;
        processedFrameId: number;
        captureTimestampMs: number;
        nowMs: number;
        frameAgeMs: number | null;
        luma: {
          mean: number | null;
          center: number | null;
          backlight: boolean;
          pass: string;
          p10?: number | null;
          p50?: number | null;
          p95?: number | null;
          clippedPct?: number | null;
          handRoiLumaP50?: number | null;
          lastRoiLumaP50?: number | null;
          nearWhiteHandPct?: number | null;
          blurProxy?: number | null;
          noiseProxy?: number | null;
        };
        timing: {
          mpMs: number | null;
          preMs: number | null;
          workerMs: number | null;
          classifierMs: number | null;
          pipelineMs: number | null;
        };
        droppedSincePrev: number;
        ownerTrack: WorkerOwnerTrack | null;
        mpRawHandCount?: number | null;
        mpHandednessScores?: number[] | null;
        rescueState?: "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST" | null;
        yoloRan?: boolean | null;
        yoloMs?: number | null;
        yoloScore?: number | null;
        cropTried?: boolean | null;
        cropSuccess?: boolean | null;
        positionOnly?: { cx: number; cy: number; score: number } | null;
        guideState?: MomoGuideState | null;
      },
    ) => {
      const a = cur.analyzer;
      const snapNow = cur.syncedSnapshot ?? a.snapshot(opts.nowMs);
      const primaryLm = a.primaryLandmarks();
      if (benchMgr.isActive && benchMgr.hasOpenTrial) {
        const st = a.strokes();
        const v = videoRef.current;
        const schedStats = cur.frameScheduler.getStats(opts.nowMs);
        const workerTel = cur.workerClient?.getTelemetry() ?? null;
        const captureTag = captureTagProviderRef.current ? captureTagProviderRef.current(opts.nowMs) : null;
        telemetryBridgeRef.current.onAnalyzedFrame(snapNow, {
          frameId: opts.processedFrameId,
          nowMs: opts.nowMs,
          landmarks: primaryLm,
          truth: (captureTag?.truth ?? "UNLABELLED") as TruthLabel,
          isDatasetGt: Boolean(captureTag),
          truthMasked: captureTag?.truthMasked ?? false,
          labelProvenance: captureTag?.labelProvenance ?? null,
          captureStep: captureTag?.captureStep ?? null,
          variation: captureTag?.variation ?? null,
          lighting: captureTag?.lighting ?? null,
          subjectCode: captureTag?.subjectCode ?? null,
          luma: opts.luma,
          timing: opts.timing,
          droppedSincePrev: opts.droppedSincePrev,
          activeStrokePoints: st.active,
          completedStrokeCount: st.completed.length,
          captureFrameId: opts.captureFrameId,
          processedFrameId: opts.processedFrameId,
          captureTimestampMs: opts.captureTimestampMs,
          displayTimestampMs: opts.nowMs,
          frameAgeMs: opts.frameAgeMs,
          uniqueCaptureFps: schedStats.uniqueCaptureFps,
          framesSkippedDuplicateCumulative:
            schedStats.framesSkippedDuplicate + (workerTel?.framesSkippedDuplicate ?? 0),
          videoFrameWidth: v?.videoWidth || cur.cameraProfile.width,
          videoFrameHeight: v?.videoHeight || cur.cameraProfile.height,
          cameraReportedFps: cur.cameraProfile.frameRate,
          detectHz: cur.detectTimes.filter((t) => opts.nowMs - t <= 1000).length,
          uiFps: cur.perfMonitor.snapshot(opts.nowMs).uiFps,
          numHandsActive: cur.numHandsActive,
          initSetOptionsCalls: cur.initSetOptionsCalls,
          runtimeSetOptionsCallsCumulative: cur.runtimeSetOptionsCalls,
          ownerTrack: opts.ownerTrack,
          mpRawHandCount: opts.mpRawHandCount ?? null,
          mpHandednessScores: opts.mpHandednessScores ?? null,
          tabHidden: typeof document !== "undefined" ? document.hidden : false,
          rescueState: opts.rescueState ?? null,
          yoloRan: opts.yoloRan ?? null,
          yoloMs: opts.yoloMs ?? null,
          yoloScore: opts.yoloScore ?? null,
          cropTried: opts.cropTried ?? null,
          cropSuccess: opts.cropSuccess ?? null,
          positionOnly: opts.positionOnly ?? null,
          guideState: opts.guideState ?? null,
        });
      }
    };

    const buildSyncState = (cur: Session, now: number): FrameSyncState => {
      const schedStats = cur.frameScheduler.getStats(now);
      const frameAgeMs =
        cur.syncedCaptureTimestampMs !== null
          ? computeCaptureFrameAgeMs(cur.syncedCaptureTimestampMs, now)
          : null;
      const waitingForNewerFrame =
        schedStats.lastCaptureFrameId > 0 &&
        (cur.syncedCaptureFrameId === null || schedStats.lastCaptureFrameId > cur.syncedCaptureFrameId);
      const isStaleAge = frameAgeMs !== null && frameAgeMs > STALE_FRAME_THRESHOLD_MS;
      const msSinceLastResult =
        cur.lastResultArrivalMs !== null ? Math.max(0, Math.round((now - cur.lastResultArrivalMs) * 10) / 10) : null;
      const sortedIntervals =
        cur.resultIntervalsMs.length >= 3 ? [...cur.resultIntervalsMs].sort((a, b) => a - b) : [];
      const resultIntervalP50Ms = sortedIntervals.length > 0 ? quantile(sortedIntervals, 0.5) : null;
      const displayStaleThresholdMs = Math.round(Math.max(250, 2.5 * (resultIntervalP50Ms ?? 100)));
      const isDisplayStale = msSinceLastResult !== null && msSinceLastResult > displayStaleThresholdMs;
      const isCameraStalled = msSinceLastResult !== null && msSinceLastResult > 500;
      return {
        latestCaptureFrameId: schedStats.lastCaptureFrameId,
        latestCaptureTimestampMs: schedStats.lastCaptureTimestampMs,
        syncedCaptureFrameId: cur.syncedCaptureFrameId,
        syncedProcessedFrameId: cur.syncedProcessedFrameId,
        syncedCaptureTimestampMs: cur.syncedCaptureTimestampMs,
        syncedDisplayTimestampMs: cur.syncedDisplayTimestampMs,
        frameAgeMs,
        waitingForNewerFrame,
        isStaleAge,
        msSinceLastResult,
        resultIntervalP50Ms,
        displayStaleThresholdMs,
        isDisplayStale,
        isCameraStalled,
        uniqueCaptureFps: schedStats.uniqueCaptureFps,
        framesSkippedDuplicate: schedStats.framesSkippedDuplicate,
        detectHz: cur.detectTimes.filter((t) => now - t <= 1000).length,
        uiFps: cur.perfMonitor.snapshot(now).uiFps,
        pipelineMs: cur.latestPipelineMs,
        runtimeSetOptionsCalls: cur.runtimeSetOptionsCalls,
        numHandsActive: cur.numHandsActive,
      };
    };

    const handleWorkerResult = (cur: Session, res: CpuWorkerResult) => {
      if (session.current !== cur) return;
      const nowMs = performance.now();
      if (cur.lastResultArrivalMs !== null) {
        const dt = Math.max(10, Math.min(2000, nowMs - cur.lastResultArrivalMs));
        cur.resultIntervalsMs.push(dt);
        if (cur.resultIntervalsMs.length > 30) cur.resultIntervalsMs.shift();
      }
      cur.lastResultArrivalMs = nowMs;

      const capFrameId = res.captureFrameId;
      const capTimestampMs = res.captureTimestampMs;
      const procFrameId = res.processedFrameId;
      cur.frameScheduler.markProcessed(capFrameId);

      cur.detectTimes.push(nowMs);
      cur.latestPipelineMs = res.timing.pipelineMs;
      cur.pipelineSamples.push(res.timing.pipelineMs);
      if (cur.pipelineSamples.length > 120) cur.pipelineSamples.shift();
      cur.initSetOptionsCalls = res.initSetOptionsCalls;
      cur.runtimeSetOptionsCalls = res.runtimeSetOptionsCalls;
      cur.numHandsActive = res.numHandsActive;
      cur.lastOwnerTrack = res.ownerTrack;

      cur.workerLuma = {
        mean: res.lumaStats.mean,
        center: res.lumaStats.center,
        p10: res.lumaStats.p10,
        p50: res.lumaStats.p50,
        p95: res.lumaStats.p95,
        clippedPct: res.lumaStats.clippedPct ?? null,
        handRoiLumaP50: res.lumaStats.handRoiLumaP50 ?? null,
        lastRoiLumaP50: res.lumaStats.lastRoiLumaP50 ?? null,
        nearWhiteHandPct: res.lumaStats.nearWhiteHandPct,
        blurProxy: res.lumaStats.blurProxy,
        noiseProxy: res.lumaStats.noiseProxy,
        backlight: res.lumaStats.isBacklight,
        activePass: res.lumaStats.passUsed,
        preprocessMs: res.timing.preprocessMs,
      };

      // R23B-HF3 Step 3: record auto-preprocess transitions & session meta status
      if (res.autoPreprocessStatus) {
        cur.autoPreprocessStatus = res.autoPreprocessStatus;
      }
      if (res.autoPreprocessTransition) {
        const evType: EventType =
          res.autoPreprocessTransition.transition === "ON" ? "PREPROCESS_AUTO_ON" : "PREPROCESS_AUTO_OFF";
        emitOrBufferHf3Event(cur, evType, {
          pass: res.autoPreprocessTransition.pass,
          effectiveLuma: res.autoPreprocessTransition.effectiveLuma,
          lumaSource: res.autoPreprocessTransition.lumaSource,
        });
        benchMgr.patchSessionMeta({ autoPreprocessStatus: cur.autoPreprocessStatus });
      }

      // R23B-HF3 Step 6: black-frame detection (lumaP50 === 0 for >= 2s)
      const blackRes = cur.blackFrameDetector.update(res.lumaStats.p50, nowMs);
      if (blackRes.justTriggered) {
        emitOrBufferHf3Event(cur, "CAMERA_BLACK", {
          lumaP50: 0,
          durationMs: blackRes.durationMs,
        });
      }
      setCameraBlackAlert(blackRes.isBlack);

      // R23B-HF3 Step 2: opportunistic exposure lock / revert when FPS < 20 for >= 2s
      const schedForHf3 = cur.frameScheduler.getStats(nowMs);
      const liveUniqueFps = schedForHf3.lastCaptureFrameId > 0 ? schedForHf3.uniqueCaptureFps : null;
      void cur.exposureController.update(liveUniqueFps, nowMs);

      // R23B-HF3 Step 4: keep actual video width/height synced into cameraProfile & session meta
      const liveVideo = videoRef.current;
      if (
        liveVideo &&
        liveVideo.videoWidth > 0 &&
        liveVideo.videoHeight > 0 &&
        (cur.cameraProfile.width !== liveVideo.videoWidth || cur.cameraProfile.height !== liveVideo.videoHeight)
      ) {
        cur.cameraProfile.width = liveVideo.videoWidth;
        cur.cameraProfile.height = liveVideo.videoHeight;
        setInfo((prev) => ({ ...prev, width: liveVideo.videoWidth, height: liveVideo.videoHeight }));
        benchMgr.patchSessionMeta({ cameraActual: buildHf3SessionMeta(cur).cameraActual });
      }

      const staleByAge = res.isStale || res.frameAgeMs > STALE_FRAME_THRESHOLD_MS;
      const ambiguousHold = Boolean(res.ownerTrack?.ambiguousHold);
      cur.analyzer.analyse({
        landmarks: res.landmarks as Landmark[][],
        inferMs: res.timing.detectMs,
        nowMs,
        face: null,
        aspect: res.aspect,
        captureFrameId: capFrameId,
        frameAgeMs: res.frameAgeMs,
        isStale: staleByAge,
        ambiguousHold,
      });

      const syncedSnap = cur.analyzer.snapshot(nowMs);
      cur.syncedCaptureFrameId = capFrameId;
      cur.syncedProcessedFrameId = procFrameId;
      cur.syncedCaptureTimestampMs = capTimestampMs;
      cur.syncedDisplayTimestampMs = nowMs;
      cur.syncedSnapshot = syncedSnap;

      let currentGuideState: MomoGuideState | null = null;
      if (isCanvas && momoGuideRef.current) {
        const luma = cur.workerLuma;
        const hasHand = syncedSnap.handCount > 0;
        const isFive =
          syncedSnap.diag.fiveFingerValid ||
          syncedSnap.diag.stablePose === "open-palm" ||
          syncedSnap.pose === "open-palm" ||
          syncedSnap.fingerCount === 5 ||
          syncedSnap.diag.rawFingerCount === 5;
        const gRes = momoGuideRef.current.update({
          nowMs,
          hasHand,
          fiveFingerValid: isFive,
          drawingActive: syncedSnap.drawingAction === "draw",
          rescueState: res.rescueState ?? null,
          handRoiLumaP50: luma?.handRoiLumaP50 ?? null,
          frameLumaMean: luma?.mean ?? null,
          backlight: luma?.backlight ?? null,
          uniqueCaptureFps: liveUniqueFps,
          exposureControlAttempted: cur.exposureController.hasAttemptedOrUnsupported,
        });
        currentGuideState = gRes.state;
        setGuideState(gRes.state);
        setGuideText(gRes.text);
        if (gRes.promptEvent && benchMgr.isActive) {
          benchMgr.event("GUIDE_PROMPT", { id: gRes.promptEvent.state, text: gRes.promptEvent.text, atMs: gRes.promptEvent.atMs }, "system");
        }
      }

      const r19Ms = syncedSnap.r19.ms;
      recordFrameToBench(cur, {
        captureFrameId: capFrameId,
        processedFrameId: procFrameId,
        captureTimestampMs: capTimestampMs,
        nowMs,
        frameAgeMs: res.frameAgeMs,
        luma: {
          mean: res.lumaStats.mean,
          center: res.lumaStats.center,
          backlight: res.lumaStats.isBacklight,
          pass: res.lumaStats.passUsed,
          p10: res.lumaStats.p10,
          p50: res.lumaStats.p50,
          p95: res.lumaStats.p95,
          clippedPct: res.lumaStats.clippedPct ?? null,
          handRoiLumaP50: res.lumaStats.handRoiLumaP50 ?? null,
          lastRoiLumaP50: res.lumaStats.lastRoiLumaP50 ?? null,
          nearWhiteHandPct: res.lumaStats.nearWhiteHandPct,
          blurProxy: res.lumaStats.blurProxy,
          noiseProxy: res.lumaStats.noiseProxy,
        },
        timing: {
          mpMs: res.timing.detectMs,
          preMs: res.timing.preprocessMs,
          workerMs: res.timing.workerTotalMs,
          classifierMs: r19Ms,
          pipelineMs: res.timing.pipelineMs,
        },
        droppedSincePrev: res.droppedSincePrev,
        ownerTrack: res.ownerTrack,
        mpRawHandCount: res.mpRawHandCount ?? res.landmarks.length,
        mpHandednessScores: res.mpHandednessScores ?? [],
        rescueState: res.rescueState ?? null,
        yoloRan: res.yoloRan ?? null,
        yoloMs: res.yoloMs ?? null,
        yoloScore: res.yoloScore ?? null,
        cropTried: res.cropTried ?? null,
        cropSuccess: res.cropSuccess ?? null,
        positionOnly: res.positionOnly ?? null,
        guideState: currentGuideState ?? (isCanvas ? momoGuideRef.current?.state ?? null : null),
      });

      const v = videoRef.current;
      if (v) paintOverlay(v, cur);
      paintInk();

      // CRITICAL R22 FIX (W02): Never blindly pump submitFrame() on worker completion!
      // pollAndClaim() claims a frame ONLY if a genuinely newer unique camera frame arrived while worker was busy.
      if (v && !document.hidden && cur.workerClient) {
        const nextTick = cur.frameScheduler.pollAndClaim(v, performance.now());
        if (nextTick) {
          void cur.workerClient.submitFrame(v, nextTick.captureTimestampMs, {
            captureFrameId: nextTick.captureFrameId,
            captureTimestampMs: nextTick.captureTimestampMs,
          });
        }
      }
    };

    const handleUniqueCameraTick = (cur: Session, tick: CameraFrameTick) => {
      const v = videoRef.current;
      if (!v || session.current !== cur || document.hidden || v.readyState < 2) return;

      if (cur.workerClient) {
        if (cur.workerClient.getTelemetry().inFlight === 0 && cur.frameScheduler.markDispatched(tick.captureFrameId)) {
          void cur.workerClient.submitFrame(v, tick.captureTimestampMs, {
            captureFrameId: tick.captureFrameId,
            captureTimestampMs: tick.captureTimestampMs,
          });
        } else if (cur.workerClient.getTelemetry().inFlight > 0) {
          cur.workerClient.notifyPendingFrame();
        }
        return;
      }

      if (!cur.landmarker) return;
      cur.mainReceived++;
      const t0 = tick.captureTimestampMs;
      if (cur.face) cur.face.update(v, t0);
      const face = cur.face ? cur.face.current(t0) : null;
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
        if (benchMgr.isActive) benchMgr.event("DETECTOR_ERROR", { failures: cur.failures }, "system");
        if (cur.failures >= MAX_DETECT_FAILURES) {
          stopCamera("tracker-error");
          setMessage("Pelacak tangan berhenti karena kesalahan internal. Muat ulang atau nyalakan kamera kembali.");
          setHasErrorMsg(true);
        }
        return;
      }
      if (landmarks === null) {
        cur.mainSkipped++;
        return;
      }
      cur.mainProcessed++;
      cur.frameScheduler.markProcessed(tick.captureFrameId);
      const doneMs = performance.now();
      if (cur.lastResultArrivalMs !== null) {
        const dt = Math.max(10, Math.min(2000, doneMs - cur.lastResultArrivalMs));
        cur.resultIntervalsMs.push(dt);
        if (cur.resultIntervalsMs.length > 30) cur.resultIntervalsMs.shift();
      }
      cur.lastResultArrivalMs = doneMs;
      const frameAgeMs = Math.max(0, Math.round((doneMs - t0) * 100) / 100);
      const staleByAge = frameAgeMs > STALE_FRAME_THRESHOLD_MS;
      cur.detectTimes.push(doneMs);
      const aspect = v.videoWidth > 0 && v.videoHeight > 0 ? v.videoWidth / v.videoHeight : undefined;
      cur.analyzer.analyse({
        landmarks,
        inferMs,
        nowMs: doneMs,
        face,
        aspect,
        captureFrameId: tick.captureFrameId,
        frameAgeMs,
        isStale: staleByAge,
      });
      const pipeMs = Math.round((doneMs - t0) * 100) / 100;
      cur.latestPipelineMs = pipeMs;
      cur.pipelineSamples.push(pipeMs);
      if (cur.pipelineSamples.length > 120) cur.pipelineSamples.shift();
      const fStats = getFrameSourceStats();
      const syncedSnap = cur.analyzer.snapshot(doneMs);
      const procId = ++cur.frameIdSeq;
      cur.syncedCaptureFrameId = tick.captureFrameId;
      cur.syncedProcessedFrameId = procId;
      cur.syncedCaptureTimestampMs = t0;
      cur.syncedDisplayTimestampMs = doneMs;
      cur.syncedSnapshot = syncedSnap;

      recordFrameToBench(cur, {
        captureFrameId: tick.captureFrameId,
        processedFrameId: procId,
        captureTimestampMs: t0,
        nowMs: doneMs,
        frameAgeMs,
        luma: {
          mean: fStats.lastLuma,
          center: fStats.lastCenterLuma,
          backlight: fStats.backlightCandidate,
          pass: fStats.enhancing ? "A2_clahe320" : fStats.mode === "scaled" ? "A1_raw320" : "A0_raw",
        },
        timing: {
          mpMs: Math.round(inferMs * 100) / 100,
          preMs: fStats.lastClaheMs,
          workerMs: null,
          classifierMs: syncedSnap.r19.ms,
          pipelineMs: pipeMs,
        },
        droppedSincePrev: 0,
        ownerTrack: null,
        mpRawHandCount: landmarks.length,
        mpHandednessScores: [],
      });
      paintOverlay(v, cur);
      paintInk();
    };

    // Launch selected classifier model loading and MediaPipe detector initialization in parallel.
    const selectedEngine = activeEngineRef.current;
    const modelLoadPromise = loadModelForEngine(selectedEngine, s.analyzer, stillWanted);
    if (useWorker) {
      const yoloEnabled = parseYoloUrlOverride();
      const workerClient = new LabCpuWorkerClient({
        wasmRoot: WASM_ROOT,
        modelUrl: MODEL_URL,
        preprocess: activePreprocessRef.current,
        numHandsPolicy: handsOverride.numHandsPolicy,
        fixedNumHands: handsOverride.fixedNumHands,
        minDetectionConfidence: confOverride.minDetectionConfidence,
        minPresenceConfidence: confOverride.minPresenceConfidence,
        minTrackingConfidence: confOverride.minTrackingConfidence,
        yoloEnabled,
        dynamicOwnerLock: true,
        auditIntervalFrames: 45,
        captureWidth: 320,
        onResult: (res) => handleWorkerResult(s, res),
        onReleaseAll: (reason) => {
          const now = performance.now();
          s.analyzer.releaseAll(reason, now);
          if (benchMgr.isActive) benchMgr.event("RELEASE_ALL", { reason }, "system");
          syncSnapshot(s.analyzer, now);
          paintInk();
        },
        onWorkerRestart: (reason, attempt) => {
          if (benchMgr.isActive) benchMgr.event("WORKER_RESTART", { reason, attempt }, "system");
        },
        onError: (err) => {
          if (benchMgr.isActive) benchMgr.event("DETECTOR_ERROR", { message: err }, "system");
          if (mounted.current && session.current === s) {
            stopCamera("worker-error");
            setMessage(`Detektor CPU mengalami gangguan (${err}). Coba matikan lalu nyalakan kamera kembali.`);
            setHasErrorMsg(true);
          }
        },
      });
      try {
        await workerClient.init();
        if (!stillWanted()) {
          workerClient.close("stale-init");
          return;
        }
        s.workerClient = workerClient;
      } catch (err) {
        workerClient.close("init-failed");
        if (stillWanted()) {
          setMessage(`Gagal menyiapkan detektor CPU: ${friendlyCameraFailureMessage(messageFor(classifyCameraError(err)))}`);
          setHasErrorMsg(true);
        }
      }
    } else {
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
        if (stillWanted()) {
          setMessage(friendlyCameraFailureMessage(messageFor(classifyCameraError(err))));
          setHasErrorMsg(true);
        }
      }
    }
    if (!stillWanted()) return;

    s.perfMonitor.start();
    setPhase("on");

    // Automatically start benchmark session & trial if consent is already granted (zero extra clicks!).
    void modelLoadPromise.then(() => {
      if (session.current === s) {
        void ensureAutoBenchActiveAndOpenTrial(s, "camera-start");
      }
    });

    const refresh = () => {
      if (session.current !== s) return;
      const now = performance.now();
      s.detectTimes = s.detectTimes.filter((t) => now - t <= 1000);
      const sync = buildSyncState(s, now);
      // R22B B2.1: Never clearOverlay() on display stale!
      // R22B B2.2 & B2.8: Always pull fresh snapshot(now) so lastCommand TTL (1.5s / 300ms hand loss)
      // and handLostDurationMs (>600ms shadow cursor) update smoothly even between camera results.
      const snapshotToShow = s.analyzer.snapshot(now);
      if (isCanvas && snapshotToShow.handLostDurationMs > 600 && snapshotToShow.lastCursor) {
        paintInk();
      }
      // R23B-HF3: advance exposure controller, black-frame timer, and Momo low-FPS check on refresh ticks too
      const liveUniqueFps = sync.latestCaptureFrameId > 0 ? sync.uniqueCaptureFps : null;
      void s.exposureController.update(liveUniqueFps, now);
      const lumaP50ForBlack = s.workerClient ? s.workerLuma.p50 : getFrameSourceStats().lastLuma;
      if (lumaP50ForBlack !== null) {
        const blackTick = s.blackFrameDetector.update(lumaP50ForBlack, now);
        if (blackTick.justTriggered) {
          emitOrBufferHf3Event(s, "CAMERA_BLACK", { lumaP50: 0, durationMs: blackTick.durationMs });
        }
        setCameraBlackAlert(blackTick.isBlack);
      }
      if (isCanvas && momoGuideRef.current) {
        const wlNow = s.workerLuma;
        const gTick = momoGuideRef.current.update({
          nowMs: now,
          hasHand: snapshotToShow.handCount > 0,
          fiveFingerValid:
            snapshotToShow.diag.fiveFingerValid ||
            snapshotToShow.diag.stablePose === "open-palm" ||
            snapshotToShow.pose === "open-palm" ||
            snapshotToShow.fingerCount === 5 ||
            snapshotToShow.diag.rawFingerCount === 5,
          drawingActive: snapshotToShow.drawingAction === "draw",
          rescueState: null,
          handRoiLumaP50: wlNow.handRoiLumaP50 ?? null,
          frameLumaMean: wlNow.mean ?? null,
          backlight: wlNow.backlight ?? null,
          uniqueCaptureFps: liveUniqueFps,
          exposureControlAttempted: s.exposureController.hasAttemptedOrUnsupported,
        });
        setGuideState(gTick.state);
        setGuideText(gTick.text);
        if (gTick.promptEvent && benchMgr.isActive) {
          benchMgr.event(
            "GUIDE_PROMPT",
            { id: gTick.promptEvent.state, text: gTick.promptEvent.text, atMs: gTick.promptEvent.atMs },
            "system",
          );
        }
      }

      if (s.workerClient) {
        const wl = s.workerLuma;
        if (wl.backlight) {
          if (s.backlightSinceMs === null) s.backlightSinceMs = now;
          if (now - s.backlightSinceMs >= 3000) setShowLightTip(true);
        } else {
          s.backlightSinceMs = null;
          setShowLightTip(false);
        }
        setReadout({
          snapshot: snapshotToShow,
          deliveredFps: sync.uniqueCaptureFps,
          luma: wl.mean,
          centerLuma: wl.center,
          lumaP10: wl.p10,
          lumaP50: wl.p50,
          lumaP95: wl.p95,
          clippedPct: wl.clippedPct,
          handRoiLumaP50: wl.handRoiLumaP50,
          lastRoiLumaP50: wl.lastRoiLumaP50,
          nearWhiteHandPct: wl.nearWhiteHandPct,
          blurProxy: wl.blurProxy,
          noiseProxy: wl.noiseProxy,
          backlightCandidate: wl.backlight,
          claheMs: wl.preprocessMs,
          enhancing: wl.activePass !== "A0_raw",
          activePass: wl.activePass,
          sched: null,
          faceModel: "ready",
          engine: "CPU (Web Worker · R22B)",
          reason: "CPU-only Web Worker (tanpa GPU delegate, Single-Owner Guard)",
          switchText: "tidak ada pindah (CPU tetap)",
          sync,
        });
        return;
      }
      const stats = getFrameSourceStats();
      const delegate = getDelegateInfo();
      if (stats.backlightCandidate) {
        if (s.backlightSinceMs === null) s.backlightSinceMs = now;
        if (now - s.backlightSinceMs >= 3000) setShowLightTip(true);
      } else {
        s.backlightSinceMs = null;
        setShowLightTip(false);
      }
      setReadout({
        snapshot: snapshotToShow,
        deliveredFps: sync.uniqueCaptureFps,
        luma: stats.lastLuma,
        centerLuma: stats.lastCenterLuma,
        lumaP10: null,
        lumaP50: null,
        lumaP95: null,
        clippedPct: null,
        handRoiLumaP50: null,
        lastRoiLumaP50: null,
        nearWhiteHandPct: null,
        blurProxy: null,
        noiseProxy: null,
        backlightCandidate: stats.backlightCandidate,
        claheMs: stats.lastClaheMs,
        enhancing: stats.enhancing,
        activePass: stats.enhancing ? "A2_clahe320" : "A0_raw",
        sched: getInferenceStats(),
        faceModel: s.face ? s.face.status() : "ready",
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
        sync,
      });
    };

    const recordPerfTick = () => {
      if (session.current !== s || !benchMgr.isActive) return;
      const now = performance.now();
      const uiPerf = s.perfMonitor.snapshot(now);
      const sortedPipe = [...s.pipelineSamples].sort((a, b) => a - b);
      const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
      const wt = s.workerClient?.getTelemetry() ?? null;
      const schedStats = s.frameScheduler.getStats(now);
      const legacySched = s.workerClient ? null : getInferenceStats();
      benchMgr.recordPerf({
        framesReceived: wt ? wt.framesReceived : s.mainReceived,
        framesProcessed: wt ? wt.framesCompleted : s.mainProcessed,
        framesSkipped: wt ? schedStats.framesSkippedDuplicate : (legacySched?.skippedFrames ?? s.mainSkipped),
        framesDropped: wt ? wt.framesDroppedBusy + schedStats.framesDroppedBeforeDispatch : 0,
        detectHz: s.detectTimes.filter((t) => now - t <= 1000).length,
        videoFps: schedStats.uniqueCaptureFps,
        uiFps: uiPerf.uiFps,
        rafIntervalP95Ms: uiPerf.rafIntervalP95Ms,
        rafIntervalMaxMs: uiPerf.rafIntervalMaxMs,
        longTasksInWindow: uiPerf.longTasksInWindow,
        longTaskMaxMs: uiPerf.longTaskMaxMs,
        inFlight: wt ? wt.inFlight : 0,
        workerRestarts: wt ? wt.workerRestarts : 0,
        pipelineP50Ms: r2(quantile(sortedPipe, 0.5)),
        pipelineP95Ms: r2(quantile(sortedPipe, 0.95)),
        jsHeapUsedMb: uiPerf.jsHeapUsedMb,
        uniqueCaptureFps: schedStats.uniqueCaptureFps,
        framesSkippedDuplicate: schedStats.framesSkippedDuplicate,
        runtimeSetOptionsCalls: s.runtimeSetOptionsCalls,
      });
    };

    s.unsubscribeFrame = s.frameScheduler.onNewCameraFrame((tick) => {
      handleUniqueCameraTick(s, tick);
    });
    if (video) {
      s.frameScheduler.start(video);
    }

    refresh();
    s.timerId = setInterval(refresh, REFRESH_MS);
    s.perfTimerId = setInterval(recordPerfTick, 1000);
    await modelLoadPromise;
  };

  const snap = readout.snapshot;
  const sched = readout.sched;
  const sync = readout.sync;
  const rejected = snap ? countHandRoles(snap.handRoles) : null;
  const running = phase === "on";
  const wave = snap?.wave;
  const fiveFingerActive = (snap?.pose === "open-palm" || snap?.pose === "split-palm") && snap?.fingerCount === 5;
  const r19ModelState: R19ModelState = snap?.modelState ?? modelState;
  const r19ModelError: string | null = snap?.modelError ?? modelError;
  const r19 = snap?.r19 ?? null;
  const displayStale = running && sync.isDisplayStale;
  const isStaleBannerVisible = running && (sync.isDisplayStale || sync.isCameraStalled);
  const activePreset = getCanvasPreset(activePresetId);
  const compState = snap?.handState ?? null;
  const onsetBlockedText = onsetBlockedLabel(snap?.actionResolution?.onsetBlockedReason);
  const handLostLong = isCanvas && running && (snap?.handLostDurationMs ?? 0) > 600;

  return (
    <main
      className={`nui-lab nui-lab--${variant}`}
      data-testid={`nui-lab-${variant}`}
      data-low-glare={lowGlare ? "true" : "false"}
    >
      <div className="nui-lab__topbar">
        <nav className="nui-lab__nav" aria-label="Navigasi NUI Lab">
          <Link href="/nui-lab">Ringkasan NUI Lab</Link>
          <Link href="/nui-lab/gesture" aria-current={isGesture ? "page" : undefined}>
            Coba Gestur
          </Link>
          <Link href="/nui-lab/canvas" aria-current={isCanvas ? "page" : undefined}>
            Coba Canvas
          </Link>
          <a href="/LICENSE.md" target="_blank" rel="noreferrer" className="nui-lab__nav-link">
            Kode sumber (AGPL-3.0)
          </a>
          <a href="/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer" className="nui-lab__nav-link">
            Notice
          </a>
        </nav>

        <div className="nui-lab__topbar-right">
          <span className="nui-lab__r19-badge" data-testid="r19-engine-badge">
            {AUTO_RUNTIME_UI_LABEL}
          </span>
          <span className="nui-lab__r19-badge" data-testid="nui-lab-version-badge">
            {buildInfo.version} ({buildInfo.gitCommit.slice(0, 7)})
          </span>
          <span
            className="nui-lab__r19-status"
            data-testid="r19-model-status"
            data-state={r19ModelState}
            aria-live="polite"
          >
            {modelStatusText(r19ModelState)}
          </span>
          <button
            type="button"
            className="nui-lab__button nui-lab__button--compact"
            aria-pressed={lowGlare}
            data-testid="low-glare-toggle"
            onClick={() => setLowGlare((v) => !v)}
          >
            {lowGlare ? "Mode Terang" : "Mode Redup (Anti-Silau)"}
          </button>
        </div>
      </div>

      <header className="nui-lab__header">
        <div className="nui-lab__header-row">
          <h1>{isCanvas ? "Canvas NUI Lab" : "Gesture Detection Lab"}</h1>
          <p className="nui-lab__lede">
            {isCanvas
              ? "Gambar dengan cubit rapat, hapus 5 jari, atau Undo/Redo lewat kepal → 1 atau 2 jari."
              : "Pantau gestur pistol (LEFT / JUMP / RIGHT) dan pembacaan langsung 0–5 jari terbuka."}
          </p>
        </div>

        <BenchSessionBar
          onConsentGranted={() => {
            if (session.current && phase === "on" && !benchMgr.hasOpenTrial) {
              void ensureAutoBenchActiveAndOpenTrial(session.current, "consent-granted");
            }
          }}
        />

        {r19ModelState === "error" && (
          <div role="alert" className="nui-lab__r19-alert" data-testid="r19-model-error">
            <div>
              <strong>Gagal memuat model AI:</strong> <span>{r19ModelError ?? "Model gagal dimuat."}</span>
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

      <div className="nui-lab__layout">
        {/* Sticky Left Column (Desktop >= 960px, 40% width): Camera preview + synced frame badge + owner lock */}
        <section
          className="nui-lab__panel nui-lab__camera-panel"
          data-testid="nui-lab-camera-panel"
          aria-labelledby="nui-lab-camera-title"
        >
          <div className="nui-lab__info-head">
            <h2 id="nui-lab-camera-title">{isCanvas ? "Kamera langsung" : "Kamera & Pelacak Tangan"}</h2>
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
              <button type="button" className="nui-lab__button" onClick={() => stopCamera("camera-stop")}>
                Matikan kamera
              </button>
            )}
          </div>

          {videoDevices.length > 1 && (
            <div className="nui-lab__camera-actions">
              <label className="nui-lab__preset-label" htmlFor="nui-lab-camera-device-select">
                <span>Pilih kamera:</span>
                <select
                  id="nui-lab-camera-device-select"
                  className="nui-lab__select"
                  data-testid="camera-device-selector"
                  aria-label="Pilih kamera"
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedDeviceId(nextId);
                    selectedDeviceIdRef.current = nextId;
                    if (session.current) {
                      stopCamera("camera-switch");
                      void startCamera(nextId);
                    }
                  }}
                >
                  <option value="">Otomatis (hindari IR)</option>
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {running && cameraBlackAlert && (
            <p
              role="alert"
              className="nui-lab__status nui-lab__status--error"
              data-testid="camera-black-alert"
            >
              {HF3_CAMERA_BLACK_MESSAGE}
            </p>
          )}

          {phase === "starting" && (
            <p className="nui-lab__muted" role="status">
              Membuka kamera dan menyiapkan pelacak tangan CPU…
            </p>
          )}
          {(supported === false || message) && (
            <p
              role={hasErrorMsg || supported === false ? "alert" : "status"}
              className={`nui-lab__status ${hasErrorMsg || supported === false ? "nui-lab__status--error" : ""}`}
              data-testid="camera-error-status"
            >
              {supported === false ? "Browser ini belum bisa pakai kamera." : message}
            </p>
          )}

          <div ref={stageRef} className="nui-lab__stage">
            <video ref={videoRef} className="nui-lab__video" muted playsInline autoPlay aria-label="Pratinjau kamera" />
            <canvas
              ref={overlayRef}
              className="nui-lab__overlay"
              data-stale={displayStale ? "true" : "false"}
              aria-label="Kerangka tangan"
            />
            {!running && <p className="nui-lab__placeholder">Kamera belum menyala.</p>}
          </div>

          {/* Synchronized Frame Badge & Stale Indicator (U05, W08, R22B B2.1) */}
          <div
            className="nui-lab__frame-sync"
            data-testid="frame-sync-badge"
            data-capture-frame-id={sync.syncedCaptureFrameId ?? 0}
            data-processed-frame-id={sync.syncedProcessedFrameId ?? 0}
            data-frame-age-ms={sync.frameAgeMs !== null ? Math.round(sync.frameAgeMs) : ""}
          >
            <span>
              {running
                ? sync.syncedCaptureFrameId !== null
                  ? `Sinkron: Kamera #${sync.syncedCaptureFrameId} · Proses #${sync.syncedProcessedFrameId}`
                  : "Menunggu frame kamera pertama…"
                : "Frame belum aktif"}
            </span>
            <span>{running && sync.frameAgeMs !== null ? `Umur ${Math.round(sync.frameAgeMs)} ms` : "—"}</span>
          </div>

          {isStaleBannerVisible && (
            <div
              className="nui-lab__stale-alert"
              role="status"
              aria-live="polite"
              data-testid="stale-frame-badge"
              data-stale={displayStale ? "true" : "false"}
              data-stalled={sync.isCameraStalled ? "true" : "false"}
              data-pending={sync.waitingForNewerFrame ? "true" : "false"}
            >
              {sync.isCameraStalled
                ? `Kamera tersendat (${Math.round(sync.msSinceLastResult ?? 0)} ms tanpa hasil baru)`
                : `Data tertinggal (${Math.round(sync.msSinceLastResult ?? 0)} ms) · Menunggu frame terbaru`}
            </div>
          )}

          {running && showLightTip && !lightTipDismissed && (
            <div className="nui-lab__light-tip" role="status" data-testid="light-tips-card">
              <span>Ada cahaya terang di belakang tangan — hadap ke jendela atau nyalakan lampu di depan</span>
              <button
                type="button"
                className="nui-lab__button nui-lab__button--compact"
                onClick={() => setLightTipDismissed(true)}
              >
                Tutup
              </button>
            </div>
          )}

          <p
            className="nui-lab__lock-banner"
            data-testid="lab-lock-status"
            data-lock={snap?.lockStatus ?? "waiting"}
            aria-live="polite"
          >
            {snap?.lockStatus === "locked"
              ? "Tangan terkunci otomatis — siap"
              : snap?.lockStatus === "lost"
                ? "Mencari tangan aktif lagi… tinta dan tombol ditahan"
                : snap?.lockStatus === "ambiguous"
                  ? "Terlihat lebih dari satu tangan — aksi ditahan agar tidak salah"
                  : snap?.lockStatus === "locking"
                    ? "Mengunci tangan Anda secara otomatis…"
                    : "Tunjukkan satu tangan di depan kamera (penguncian otomatis)."}
          </p>

          {/* Separated Readouts: FPS Kamera Unik, Deteksi (Hz), UI FPS, Latensi Pipeline */}
          <dl className="nui-lab__camera-kpis" data-testid="camera-perf-kpis">
            <Stat label="FPS Kamera Unik" value={running ? `${sync.uniqueCaptureFps} fps` : "—"} />
            <Stat label="Deteksi (Hz)" value={running ? `${sync.detectHz} Hz` : "—"} />
            <Stat label="UI FPS" value={running ? `${sync.uiFps} fps` : "—"} />
            <Stat label="Latensi Pipeline" value={running ? fmtMs(sync.pipelineMs) : "—"} />
          </dl>

          <p className="nui-lab__legend">
            <span className="nui-lab__swatch nui-lab__swatch--primary" aria-hidden="true" /> Oranye = tangan utama ·
            <span className="nui-lab__swatch nui-lab__swatch--other" aria-hidden="true" /> Abu-abu = tangan lain
          </p>
        </section>

        {/* Independent Scrolling Right Column (Desktop >= 960px, 60% width) */}
        <div className="nui-lab__right-panel" data-testid="nui-lab-right-panel">
          {isCanvas && (
            <>
              <section className="nui-lab__panel nui-lab__canvas-workspace" aria-labelledby="nui-lab-canvas-title">
                <div className="nui-lab__info-head">
                  <h2 id="nui-lab-canvas-title">Kanvas Gambar NUI</h2>
                  <span className="nui-lab__muted">Coba gestur tangan atau mouse/sentuh</span>
                </div>

                {/* R22B B2.4 / K11: Per-level Canvas Mechanism Preset selector */}
                <div className="nui-lab__preset-bar" data-testid="canvas-preset-bar">
                  <label className="nui-lab__preset-label" htmlFor="canvas-preset-select">
                    <span>Preset mekanisme Canvas:</span>
                    <select
                      id="canvas-preset-select"
                      className="nui-lab__select"
                      data-testid="canvas-preset-selector"
                      aria-label="Preset mekanisme Canvas"
                      value={activePreset.id}
                      onChange={(e) => handlePresetChange(e.target.value)}
                    >
                      {CANVAS_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="nui-lab__muted">
                    Gambar: {activePreset.draw.join(" / ")}
                    {activePreset.three ? ` · 3 jari: ${activePreset.three.variant}` : ""}
                  </span>
                </div>

                {/* Updated R22 Canvas Gesture Instructions (NO Swipe!) */}
                <div className="nui-lab__gesture-guide" aria-label="Panduan gestur Canvas R22">
                  <span data-active={!displayStale && (snap?.actionIntent === "DRAW" || snap?.drawingAction === "draw") ? "true" : "false"}>
                    <GestureGlyph name="gesture-pinch" size={32} />
                    Cubit rapat <b>Gambar</b>
                  </span>
                  <span data-active={!displayStale && (snap?.actionIntent === "ERASE" || snap?.drawingAction === "erase") ? "true" : "false"}>
                    <GestureGlyph name="gesture-five" size={32} />
                    Telapak 5 jari <b>Hapus</b>
                  </span>
                  <span data-active={!displayStale && (snap?.undoRedoFsmState === "ARMED_FIST" || snap?.pose === "fist") ? "true" : "false"}>
                    <GestureGlyph name="gesture-pinch" size={32} />
                    Kepal <b>Netral / Siap</b>
                  </span>
                  <span data-active={!displayStale && (snap?.undoRedoFsmState === "CONFIRM_ONE" || snap?.actionIntent === "UNDO" || snap?.pose === "one-finger") ? "true" : "false"}>
                    <GestureGlyph name="gesture-one" size={32} />
                    Kepal → 1 jari <b>Undo</b>
                  </span>
                  <span data-active={!displayStale && (snap?.undoRedoFsmState === "CONFIRM_TWO" || snap?.actionIntent === "REDO" || snap?.pose === "two-fingers") ? "true" : "false"}>
                    <GestureGlyph name="gesture-two" size={32} />
                    Kepal → 2 jari <b>Redo</b>
                  </span>
                </div>

                <div className="nui-lab__gesture-hud" data-testid="lab-gesture-hud" aria-live="polite">
                  <strong>{displayStale ? "Menunggu frame" : snap?.lockStatus === "locked" ? "Terkunci" : "Menunggu tangan"}</strong>
                  <span>
                    {displayStale
                      ? "Data tertinggal"
                      : snap
                        ? snap.pose === "fist"
                          ? "Kepal (Siap)"
                          : poseLabel(snap.pose)
                        : "Belum ada gestur"}
                  </span>
                  <span>{displayStale ? "— jari (tertinggal)" : snap ? `${snap.fingerCount} jari` : "— jari"}</span>
                  <span data-testid="canvas-undo-redo-fsm">
                    {canvasUndoRedoFsmLabel(snap, displayStale)}
                  </span>
                  <span>
                    {canvasHudStatusLabel(snap, displayStale)}
                  </span>
                </div>

                {/* R22B B2.3: Compositional HandState HUD */}
                <div className="nui-lab__compositional-hud" data-testid="lab-compositional-hud" aria-live="polite">
                  <span
                    className="nui-lab__comp-chip"
                    data-contact={compState?.contact ?? "OPEN"}
                  >
                    Kontak:{" "}
                    {compState?.contact === "TOUCH"
                      ? "RAPAT"
                      : compState?.contact === "NEAR"
                        ? "DEKAT"
                        : "LEPAS"}
                  </span>
                  <span className="nui-lab__comp-chip">
                    Varian: {compState?.variant === "OK" ? "OK" : compState?.variant === "CLOSED" ? "RAPAT" : "—"}
                  </span>
                  <span className="nui-lab__comp-chip">
                    Jari:{" "}
                    {compState?.fingers
                      ? [
                          compState.fingers.index === "EXT" ? "I✓" : "I·",
                          compState.fingers.middle === "EXT" ? "M✓" : "M·",
                          compState.fingers.ring === "EXT" ? "R✓" : "R·",
                          compState.fingers.pinky === "EXT" ? "P✓" : "P·",
                        ].join(" ")
                      : "I· M· R· P·"}
                  </span>
                  {compState?.threeVariant && (
                    <span className="nui-lab__comp-chip">3 Jari: {compState.threeVariant}</span>
                  )}
                  {onsetBlockedText && (
                    <span className="nui-lab__comp-blocked" data-testid="lab-onset-blocked-pill">
                      {onsetBlockedText}
                    </span>
                  )}
                </div>

                {handLostLong && (
                  <div className="nui-lab__hand-lost-banner" role="status" data-testid="hand-lost-banner">
                    Tangan tidak terlihat — hadapkan telapak ke kamera
                  </div>
                )}

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

                <div className="nui-lab__canvas-toolbar" role="group" aria-label="Kontrol kanvas dan fallback pointer">
                  <button
                    className="nui-lab__button nui-lab__button--compact"
                    type="button"
                    aria-pressed={pointerTool === "pen"}
                    onClick={() => setPointerTool("pen")}
                  >
                    Pena pointer
                  </button>
                  <button
                    className="nui-lab__button nui-lab__button--compact"
                    type="button"
                    aria-pressed={pointerTool === "eraser"}
                    onClick={() => setPointerTool("eraser")}
                  >
                    Penghapus pointer
                  </button>
                  <button
                    className="nui-lab__button nui-lab__button--compact"
                    type="button"
                    onClick={() => runCanvasAction("undo")}
                  >
                    Undo
                  </button>
                  <button
                    className="nui-lab__button nui-lab__button--compact"
                    type="button"
                    onClick={() => runCanvasAction("redo")}
                  >
                    Redo
                  </button>
                  <button
                    className="nui-lab__button nui-lab__button--compact"
                    type="button"
                    onClick={() => runCanvasAction("clear")}
                  >
                    Bersihkan kanvas
                  </button>
                </div>
              </section>

              <section className="nui-lab__panel" aria-label="Petunjuk dan status Canvas">
                <div className="nui-lab__momo" aria-label="Petunjuk Momo">
                  <MomoAvatar
                    expression={
                      guideState === "LOCKED" || snap?.pose === "pinch"
                        ? "Semangat"
                        : guideState === "ASK_LIGHT" || guideState === "UNCLEAR_FINGERS"
                        ? "Bingung"
                        : "Penasaran"
                    }
                    height={96}
                  />
                  {guideText ? (
                    <p className="momo-chat__bubble" data-guide-state={guideState}>
                      {guideText}
                    </p>
                  ) : null}
                </div>
                <R19CanvasReadOnlyPanel snap={snap} r19={r19} />
              </section>
            </>
          )}

          {isGesture && (
            <section className="nui-lab__panel" aria-label="Kontrol Gestur & Jari">
              <R19DiagnosticsSection snap={snap} r19={r19} isStale={displayStale} />

              <section aria-label="Katalog pose gestur">
                <h3>Katalog Pose &amp; Pembacaan Jari</h3>
                <p className="nui-lab__pose-now" aria-live="polite">
                  {displayStale
                    ? "Data tertinggal — menunggu frame terbaru"
                    : snap
                      ? snap.pose === "fist"
                        ? "Kepal (0 jari — netral)"
                        : poseLabel(snap.pose)
                      : "Nyalakan kamera untuk mendeteksi"}
                </p>
                <div className="nui-lab__poses">
                  {GESTURE_POSE_CARDS.map((card) => {
                    const active = !displayStale && card.isActive(snap, fiveFingerActive);
                    return (
                      <div key={card.id} className="nui-lab__pose" data-active={active ? "true" : "false"}>
                        <strong>{card.title}</strong>
                        <small>{active ? "TERDETEKSI" : card.hint}</small>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section aria-label="Uji lambaian">
                <h3>Uji Lambaian</h3>
                <div className="nui-lab__row">
                  <button
                    type="button"
                    className="nui-lab__button nui-lab__button--compact"
                    onClick={() => session.current?.analyzer.startWaveTest()}
                    disabled={!running}
                  >
                    Mulai uji lambaian
                  </button>
                  <span className="nui-lab__muted">
                    Pembalikan: {wave ? `${wave.reversals} dari ${WAVE_MIN_REVERSALS}` : "—"}
                  </span>
                </div>
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
              </section>
            </section>
          )}

          {/* R22B Developer/Owner-Only Panels (?capture=1, ?rawrec=1, ?camdev=1 — all default OFF) */}
          {devFlags.captureMode && (
            <GuidedCapturePanel
              cameraRunning={running}
              onTagProviderChange={handleCaptureTagProviderChange}
              onStepEvent={handleCaptureStepEvent}
              onMetaChange={handleCaptureMetaChange}
            />
          )}

          {devFlags.rawRecMode && (
            <RawVideoRecorder
              stream={activeStream}
              sessionId={benchState.sessionId}
              trialId={benchState.currentTrialId}
              onRawRecEvent={handleRawRecEvent}
              onMetaChange={handleRawRecMetaChange}
            />
          )}

          {devFlags.camDevMode && (
            <CamDevPanel
              track={activeTrack}
              capabilities={exposureCaps}
              onCapabilitiesChange={(nextCaps) => {
                setExposureCaps(nextCaps);
                if (session.current) session.current.exposureCaps = nextCaps;
              }}
              onSettingChanged={(change) => {
                if (benchMgr.isActive) {
                  benchMgr.event(
                    "CAMERA_SETTING_CHANGED",
                    {
                      setting: change.setting,
                      before: JSON.stringify(change.before),
                      after: JSON.stringify(change.after),
                    },
                    "system",
                    false,
                    "USER_ACTION",
                  );
                }
              }}
            />
          )}

          {/* Collapsible Technical Diagnostics Detail (A04, U07, K6): keeps Owner UI clean while preserving full transparency */}
          <details className="nui-lab__diagnostics-details" data-testid="nui-lab-diagnostics-details">
            <summary>Detail Diagnostik &amp; Identitas Model Internal</summary>
            <div className="nui-lab__debug" data-testid="lab-gesture-diagnostics">
              <div className="nui-lab__debug-detail" data-testid="nui-lab-honest-model-info">
                <h4>Identitas Model Nyata (Transparansi Runtime)</h4>
                <p className="nui-lab__muted">{honestDiag.honestyNote}</p>
                <dl className="nui-lab__numbers">
                  <Stat label="Versi build" value={`${buildInfo.version} (${buildInfo.gitBranch}@${buildInfo.gitCommit.slice(0, 7)})`} />
                  <Stat label="Lencana UI" value={honestDiag.uiBadge} />
                  <Stat label="Model aktif nyata" value={`${honestDiag.actualModelId} · ${honestDiag.actualModelLabel}`} />
                  <Stat label="SHA-256 model" value={honestDiag.modelSha256} />
                  <Stat label="Hash terverifikasi" value={modelHashVerifiedRef.current ? "ya (SHA-256 cocok)" : "belum dimuat / test double"} />
                  <Stat label="Delegate aktif" value={readout.engine} />
                  <Stat
                    label="Kebijakan numHands"
                    value={
                      urlHandsOverride.numHandsOverride
                        ? `${urlHandsOverride.numHandsPolicy} (${urlHandsOverride.fixedNumHands} tangan · ${urlHandsOverride.numHandsOverride})`
                        : `${urlHandsOverride.numHandsPolicy} (${sync.numHandsActive} tangan · default)`
                    }
                  />
                  <Stat
                    label="Confidence MediaPipe (mdc / mpc / mtc)"
                    value={`${urlConfOverride.minDetectionConfidence} / ${urlConfOverride.minPresenceConfidence} / ${urlConfOverride.minTrackingConfidence}${urlConfOverride.confidenceOverride ? ` (${urlConfOverride.confidenceOverride})` : " (default)"}`}
                  />
                  <Stat label="Preset Canvas &amp; Reacquire" value={`${activePreset.id} · ${reacquirePolicy}`} />
                  <Stat
                    label="Mode preprocessing"
                    value={`${benchCfg.preprocess} (default: ${DEFAULT_PREPROCESS}; kandidat: ${PREPROCESS_CANDIDATES.join(", ")})`}
                  />
                  <Stat label="setOptions() runtime" value={String(sync.runtimeSetOptionsCalls)} />
                  <Stat label="Frame duplikat dilewati" value={String(sync.framesSkippedDuplicate)} />
                  <Stat
                    label="Kontrol eksposur kamera (UVC)"
                    value={exposureCaps ? (exposureCaps.canAdjustExposure ? "didukung" : "tidak tersedia") : "—"}
                  />
                </dl>
              </div>

              <dl className="nui-lab__numbers">
                <Stat label="Resolusi kamera" value={info.width && info.height ? `${info.width} × ${info.height}` : "—"} />
                <Stat label="FPS kamera (pengaturan)" value={info.frameRate ? `${Math.round(info.frameRate)}` : "—"} />
                <Stat label="FPS frame diterima" value={running ? `${readout.deliveredFps} /detik` : "—"} />
                <Stat label="Deteksi efektif" value={sched ? `${sched.effectiveHz} /detik` : `${sync.detectHz} /detik`} />
                <Stat label="FPS deteksi analyzer" value={snap ? `${snap.detectFps} /detik` : "—"} />
                <Stat label="Waktu deteksi rata-rata" value={fmtMs(sched?.avgMs ?? null)} />
                <Stat label="Waktu deteksi p50 / p95" value={`${fmtMs(snap?.inferP50 ?? null)} / ${fmtMs(snap?.inferP95 ?? null)}`} />
                <Stat label="Waktu inferensi model" value={r19?.ms !== null && r19?.ms !== undefined ? `${r19.ms.toFixed(2)} ms` : "—"} />
                <Stat label="Tangan (deteksi)" value={sched ? modelReadoutText(sched.models.hand) : "—"} />
                <Stat label="Wajah (deteksi)" value={sched ? modelReadoutText(sched.models.face) : "—"} />
                <Stat label="Sibuk (diukur)" value={fmtPct(sched ? sched.busyShare * 100 : null)} />
                <Stat label="Alasan mesin" value={readout.reason} />
                <Stat label="Status pindah mesin" value={readout.switchText} />
                <Stat label="Sesi tangan (non-biometrik)" value={snap ? String(snap.acquisitionId) : "—"} />
                <Stat label="Penyebab hand lock" value={snap?.lockReason ?? "—"} />
                <Stat
                  label="Rasio cubit jempol-telunjuk"
                  value={snap?.pinchRatio === null || snap?.pinchRatio === undefined ? "—" : snap.pinchRatio.toFixed(3)}
                />
                <Stat label="Izin tindakan tinta" value={snap?.inkAllowed ? "siap" : "ditahan"} />
                <Stat label="Alasan tindakan terakhir" value={snap?.rejectionReason ?? "—"} />
                <Stat label="Tangan terlihat" value={snap ? `${snap.handCount} (jauh: ${snap.farHandCount})` : "—"} />
                <Stat
                  label="Wajah pemain"
                  value={snap ? (snap.face ? `ada, ${Math.round(snap.face.w * 100)}%` : faceAbsentText(readout.faceModel)) : "—"}
                />
                <Stat
                  label="Tangan ditolak"
                  value={rejected ? `jauh ${rejected.far} · wajah ${rejected.face} · luar ${rejected.outside}` : "—"}
                />
                <Stat label="Tangan diam / jitter mentah / tinta" value={snap ? `${yesNo(snap.still)} · ${fmtPx(snap.rawJitterPx)} · ${fmtPx(snap.inkJitterPx)}` : "—"} />
                <Stat label="Luma mean / p10 / p50 / p95" value={readout.luma === null ? "—" : `${readout.luma.toFixed(2)} / ${f2(readout.lumaP10)} / ${f2(readout.lumaP50)} / ${f2(readout.lumaP95)}`} />
                <Stat
                  label="Clipped % / Hand ROI p50 / Last ROI p50"
                  value={`${readout.clippedPct === null ? "—" : `${readout.clippedPct.toFixed(1)}%`} / ${f2(readout.handRoiLumaP50)} / ${f2(readout.lastRoiLumaP50)}`}
                />
                <Stat label="Near-white hand % / blur / noise" value={`${readout.nearWhiteHandPct === null ? "—" : `${readout.nearWhiteHandPct.toFixed(1)}%`} / ${f2(readout.blurProxy)} / ${f2(readout.noiseProxy)}`} />
                <Stat
                  label="Pinch Gate G1' (pass / thumbOpen / indexPip)"
                  value={
                    snap
                      ? `${yesNo(snap.pinchGate.passed)} / ${yesNo(snap.pinchGate.thumbOpen)} / ${snap.pinchGate.indexPipDeg.toFixed(0)}°`
                      : "—"
                  }
                />
                <Stat label="Pass preprocessing aktif" value={readout.activePass} />
              </dl>

              <GestureDiagnostics diag={snap?.diag ?? null} />
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}

/** Concise read-only gesture monitor panel displayed below the Canvas workspace. */
function R19CanvasReadOnlyPanel({ snap, r19 }: { snap: LabSnapshot | null; r19: LabR19Telemetry | null }) {
  const state: R19TelemetryState = r19?.state ?? "NO_HAND";
  const gateState = r19?.gateState ?? state;
  const direction = r19?.directionLabel ?? "NEUTRAL";
  const directionDisplay = r19?.directionDisplay ?? r19DirectionText("NEUTRAL");
  return (
    <section className="nui-lab__r19-readonly" aria-label="Pemantauan gestur read-only pada Canvas">
      <h3>Status Aturan Canvas &amp; Gestur</h3>
      <p className="nui-lab__r19-scope">{R19_CANVAS_PISTOL_NOTE}</p>
      <dl className="nui-lab__numbers">
        <Stat
          label="Gerbang pistol"
          value={gateState === "DISABLED_ON_CANVAS" ? `${gateState} · Nonaktif di Canvas` : `${state} · ${r19StateLabel(state)}`}
        />
        <Stat
          label="Aksi K3 &amp; FSM Undo/Redo"
          value={
            snap
              ? `${snap.actionIntent} (${snap.actionAccepted ? "diterima" : snap.actionRejectedReason ?? "ditahan"}) · ${snap.undoRedoFsmState}`
              : "NEUTRAL · NEUTRAL"
          }
        />
        <Stat label="Arah telunjuk" value={`${direction} (${directionDisplay})`} />
        <Stat label="Cubit / Hapus 5 jari" value={`${yesNo(Boolean(r19?.guards.pinchActive))} / ${yesNo(Boolean(r19?.guards.eraseActive))}`} />
        <Stat label="Lock &amp; alasan" value={`${snap?.lockStatus ?? "waiting"} · ${snap?.rejectionReason ?? "—"}`} />
      </dl>
    </section>
  );
}

/** Primary Gesture Lab live feedback: state badge, 0–5 finger counter, virtual keyboard, and MLP probabilities. */
function R19DiagnosticsSection({
  snap,
  r19,
  isStale,
}: {
  snap: LabSnapshot | null;
  r19: LabR19Telemetry | null;
  isStale: boolean;
}) {
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

  const activeFingerCount = !isStale && snap ? snap.fingerCount : null;
  const fingerPills = [
    { name: "Jempol", open: !isStale && Boolean(fingers?.thumbOpen) },
    { name: "Telunjuk", open: !isStale && fingers?.index === "extended" },
    { name: "Tengah", open: !isStale && fingers?.middle === "extended" },
    { name: "Manis", open: !isStale && fingers?.ring === "extended" },
    { name: "Kelingking", open: !isStale && fingers?.pinky === "extended" },
  ];

  const probRows: Array<{ key: "ready" | "press" | "other"; label: string; value: number | null }> = [
    { key: "ready", label: "POINT_READY", value: probs ? probs.ready : null },
    { key: "press", label: "POINT_PRESS", value: probs ? probs.press : null },
    { key: "other", label: "OTHER", value: probs ? probs.other : null },
  ];

  return (
    <section className="nui-lab__r19-section" aria-label="Hasil Gestur Langsung">
      <h2>Hasil Gestur Langsung</h2>

      <div className="nui-lab__r19-state" data-testid="r19-state-badge" data-r19-state={r19State} aria-live="polite">
        <div className="nui-lab__r19-state-head">
          <strong>{isStale ? `${r19State} (TERTINGGAL)` : r19State}</strong>
          <span>{isStale ? "Menunggu frame terbaru" : r19StateLabel(r19State)}</span>
        </div>
        <div className="nui-lab__r19-state-meta">
          <span>
            Subkelas: <code>{r19?.subClass ?? "idle"}</code>
          </span>
          <span>
            Alasan: <code>{r19?.reason ?? snap?.rejectionReason ?? "Kamera belum menyala"}</code>
          </span>
        </div>
      </div>

      {/* Prominent 0–5 Extended Finger Count Readout (A8 #9: ensures 3 and 4 fingers are clearly displayed) */}
      <div className="nui-lab__finger-hero" data-testid="gesture-finger-count" aria-live="polite">
        <div>
          <div className="nui-lab__muted">Jari terbuka (0–5)</div>
          <div className="nui-lab__finger-count-value">
            {isStale ? "— / 5 jari (tertinggal)" : activeFingerCount !== null ? `${activeFingerCount} / 5 jari` : "— / 5 jari"}
          </div>
        </div>
        <div className="nui-lab__finger-pills" aria-label="Status tiap jari">
          {fingerPills.map((fp) => (
            <span key={fp.name} className="nui-lab__finger-pill" data-extended={fp.open ? "true" : "false"}>
              {fp.name}: {fp.open ? "Buka" : "Lipat"}
            </span>
          ))}
        </div>
      </div>

      <section className="nui-lab__r19-card" data-testid="r19-vkey-panel" aria-label="Simulasi tombol virtual">
        <h3>Tombol Virtual Arah (PistolVirtualKeyFSM)</h3>
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

      <section className="nui-lab__r19-card" data-testid="r19-probs" aria-label="Probabilitas MLP">
        <h3>Probabilitas Softmax Terkalibrasi MLP (bukan confidence MediaPipe)</h3>
        <div className="nui-lab__r19-prob-list">
          {probRows.map((row) => {
            const pct = row.value === null ? null : Math.max(0, Math.min(100, row.value * 100));
            return (
              <div className="nui-lab__r19-prob-row" key={row.key}>
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
        <section className="nui-lab__r19-card" data-testid="r19-direction" aria-label="Arah telunjuk">
          <h3>Arah Telunjuk</h3>
          <dl className="nui-lab__numbers">
            <Stat label="Zona arah" value={directionLabel} />
            <Stat label="Label arah" value={directionDisplay} />
            <Stat label="Sudut telunjuk" value={angleDeg !== null && Number.isFinite(angleDeg) ? `${angleDeg.toFixed(1)}°` : "—"} />
          </dl>
        </section>

        <section className="nui-lab__r19-card" data-testid="r19-fingers" aria-label="Detail jari dan jempol">
          <h3>Detail Jari &amp; Jempol</h3>
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

      <section className="nui-lab__r19-card" data-testid="r19-guards-panel" aria-label="Gate keselamatan gestur">
        <h3>Gate Keselamatan Gestur</h3>
        <dl className="nui-lab__numbers">
          <Stat label="Pinch aktif (gambar)" value={guards ? `${yesNo(guards.pinchActive)} (geometri: ${yesNo(guards.isPinch)})` : "—"} />
          <Stat label="Hapus 5-jari stabil" value={guards ? yesNo(guards.eraseActive) : "—"} />
          <Stat label="Gate negatif jempol atas" value={guards ? yesNo(guards.isThumbUp) : "—"} />
          <Stat label="Pose aktif" value={snap ? poseLabel(snap.pose) : "Belum terbaca"} />
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

/** Developer readout for one hand, hidden inside collapsible diagnostics detail. */
function GestureDiagnostics({ diag }: { diag: LabDiagnostics | null }) {
  const row = (id: string, label: string, value: string) => (
    <div className="nui-lab__stat" data-testid={`lab-diag-${id}`} key={id}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const d = diag;
  const thumb = d?.thumb ?? null;
  const last = d?.lastCommand ?? null;
  return (
    <section className="nui-lab__debug-detail" aria-label="Diagnostik jari dan perintah" data-testid="lab-diag">
      <h4>Diagnostik Geometri Jari &amp; Kanvas (Internal)</h4>
      <dl className="nui-lab__numbers">
        {row("aspect", "Rasio frame geometri", d ? d.aspect.toFixed(3) : "—")}
        {row("pose-raw", "Pose mentah / stabil", d ? `${d.rawPose} / ${d.stablePose}` : "—")}
        {row("fingers", "Jari terbuka: geometri / dasar", d ? `${d.rawFingerCount} / ${d.legacyFingerCount}` : "—")}
        {row("thumb-legacy", "Jempol: rasio dasar", thumb ? `${f2(thumb.legacyRatio)} → ${thumb.legacyExtended ? "terbuka" : "tertutup"}` : "—")}
        {row("thumb-lateral", "Jempol: menyamping", thumb ? `${f2(thumb.lateral)} → ${thumb.robustOpen ? "terbuka" : "tertutup"}` : "—")}
        {row("thumb-ip", "Jempol: sudut sendi IP", thumb && thumb.ipAngleDeg !== null ? `${thumb.ipAngleDeg.toFixed(0)}°` : "—")}
        {row("five-valid", "Lima jari valid untuk Hapus", d ? yesNo(d.fiveFingerValid) : "—")}
        {row("armed", "Siap aksi (gambar / hapus / perintah)", d ? `${yesNo(d.armed.draw)} / ${yesNo(d.armed.erase)} / ${yesNo(d.armed.commands)}` : "—")}
        {row("hand-status", "Status tangan (Hapus)", d?.handStatus ?? "—")}
        {row("pipeline", "Gambar / hapus (streak)", d?.pipeline ? `${d.pipeline.drawing ? "gambar" : "-"} ${d.pipeline.drawStreak} / ${d.pipeline.erasing ? "hapus" : "-"} ${d.pipeline.eraseFrames}` : "—")}
        {row("erase-hit", "Hapus terakhir kena stroke", d?.pipeline?.lastEraseHit === null || d?.pipeline?.lastEraseHit === undefined ? "—" : yesNo(d.pipeline.lastEraseHit))}
        {row("strokes", "Stroke selesai / titik aktif", d ? `${d.strokes.completed} / ${d.strokes.activePoints}` : "—")}
        {row("command-mode", "Mode Undo/Redo", "Kepal → 1/2 jari (R22)")}
        {row("last-command", "Perintah terakhir", last ? `${last.kind} · ${last.changed ? "mengubah canvas" : "no-op"} · ${last.via}` : "—")}
        {row("command-count", "Jumlah perintah dijalankan", d ? String(d.commandCount) : "—")}
      </dl>
      <p className="nui-lab__muted">NUI Lab diagnostik internal — tidak mengubah gameplay siswa produksi.</p>
    </section>
  );
}
