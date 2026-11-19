/**
 * NUI Lab benchmark session (R20-FIX P1): shared types and constants.
 *
 * This UPGRADES the one-shot LandmarkRecorder (lab-recorder.ts): per-frame numbers are produced by the same
 * `buildRecordFrame`, then wrapped with trial/session ids and pipeline telemetry. Nothing here ever holds pixels.
 *
 * Privacy contract (enforced by tests): numbers only. No image, video, audio, face data, name, device label text,
 * IP, or upload. Wall-clock appears in exactly one place: `createdAtMinuteIso` (rounded to the minute) so the Owner can
 * tell which night a file belongs to. The consent text in the UI says so.
 */
import type { RecordFrame, TruthLabel } from "../lab-recorder";

export const BENCH_SESSION_SCHEMA = "nui-lab-bench-session/1" as const;
export const BENCH_EXPORT_SCHEMA = "nui-lab-bench-export/1" as const;
export const BENCH_DB_NAME = "nui-lab-bench";
export const BENCH_DB_VERSION = 1;

export type BenchRoute = "gesture" | "canvas" | "diagnostics";
export type BenchSource = "gesture-lab" | "canvas-lab";
export type EngineId = "r19-c0" | "r20-c4" | "r20-c7";
export type PreprocessMode = "raw" | "clahe" | "a4";
export type DetectorVariant = "cpu-worker" | "cpu-main-thread";
export type SessionStatus = "active" | "finished" | "interrupted" | "aborted";
export type RecordKind = "frames" | "events" | "perf";

/** Ground-truth scenario the tester says is being tried (N1..N6 are the Owner's night protocol). */
export const SCENARIOS = [
  "UNSPECIFIED",
  "N1_single_room_lamp",
  "N2_laptop_screen_only",
  "N3_backlight_behind_shoulder",
  "N4_far_80_100cm",
  "N5_second_person_behind",
  "N6_scratch_head_face_phone",
  "DAYLIGHT_BASELINE",
  "CUSTOM",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface EngineConfig {
  engineId: EngineId;
  label: string;
  modelUrl: string;
  /** SHA-256 pinned in the app; `modelHashVerified` tells whether the downloaded bytes matched it. */
  modelSha256: string;
  modelBytes: number;
  modelHashVerified: boolean;
  preprocess: PreprocessMode;
  detector: DetectorVariant;
  delegate: "CPU";
  /** Policy for the MediaPipe numHands option, as implemented by the worker. */
  numHandsPolicy: "fixed-2" | "owner-lock-guarded" | "main-thread-fixed-2";
}

export interface CameraProfile {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  /** "virtual-suspected" when the device name looks like a fake/virtual camera. The name itself is NOT stored. */
  deviceClass: "physical-presumed" | "virtual-suspected" | "unknown";
}

export interface SessionMeta {
  schema: typeof BENCH_SESSION_SCHEMA;
  sessionId: string;
  status: SessionStatus;
  statusReason: string | null;
  createdAtMinuteIso: string;
  /** Local liveness stamp (performance.timeOrigin-relative ms) used to detect crashed tabs on the next page load. */
  heartbeatEpochMs: number;
  consent: { numericRecording: true; videoOrImages: false; upload: false; version: "bench-consent/1" };
  app: { version: string; gitCommit: string };
  environment: {
    userAgentFamily: string;
    platform: string;
    hardwareConcurrency: number | null;
    deviceMemoryGb: number | null;
    devicePixelRatio: number | null;
    viewport: { w: number; h: number } | null;
    secureContext: boolean;
    storage: "indexeddb" | "memory-only";
  };
  trialCount: number;
  droppedRecords: Record<RecordKind, number>;
  storageFailures: number;
  warnings: string[];
}

export interface TrialMeta {
  trialId: string;
  sessionId: string;
  index: number;
  route: BenchRoute;
  source: BenchSource;
  engine: EngineConfig;
  scenario: Scenario;
  scenarioNote: string;
  camera: CameraProfile;
  startedT: number;
  endedT: number | null;
  endReason: string | null;
}

export interface FrameExtra {
  fid: number;
  trialId: string;
  /** Detector status for the frame: a frame with no landmarks is DETECTOR_MISS, never silently omitted. */
  det: "HAND" | "DETECTOR_MISS";
  hands: number;
  farHands: number;
  luma: { mean: number | null; center: number | null; backlight: boolean; pass: string };
  timing: {
    mpMs: number | null;
    preMs: number | null;
    workerMs: number | null;
    classifierMs: number | null;
    /** capture-to-analysed estimate of this pipeline (NOT physical intent-to-key latency). */
    pipelineMs: number | null;
  };
  /** Top-3 for this 3-class model, sorted. */
  top3: Array<{ label: string; p: number }> | null;
  direction: string;
  geometry: { pinchActive: boolean; eraseActive: boolean; swipe: string | null; thumbUp: boolean; isPinch: boolean } | null;
  fsm: { state: string; event: string; zone: string; left: boolean; right: boolean; jump: boolean; releaseReason: string | null };
  rejectDetail: string;
  /** Index-tip jitter in px of a 400 px canvas while the hand is still (null when not still). */
  jitter: { raw: number | null; ink: number | null } | null;
  /** Frames dropped by the detector gate since the previous recorded frame. */
  droppedSincePrev: number;
}

export type BenchFrame = RecordFrame & FrameExtra;

export type EventType =
  | "SESSION_START"
  | "SESSION_FINISH"
  | "SESSION_INTERRUPTED"
  | "TRIAL_START"
  | "TRIAL_END"
  | "CAMERA_START"
  | "CAMERA_STOP"
  | "TRACK_ENDED"
  | "VISIBILITY_HIDDEN"
  | "VISIBILITY_VISIBLE"
  | "ROUTE_CHANGE"
  | "ENGINE_CHANGE"
  | "SCENARIO_CHANGE"
  | "LABEL_CHANGE"
  | "WORKER_RESTART"
  | "DETECTOR_ERROR"
  | "STORAGE_WARNING"
  | "KEYDOWN"
  | "KEYUP"
  | "RELEASE_ALL"
  | "HAND_LOST"
  | "HAND_REACQUIRED"
  | "STROKE_START"
  | "STROKE_END"
  | "ERASE_START"
  | "ERASE_END"
  | "ERASE_HIT"
  | "ERASE_MISS"
  | "UNDO"
  | "REDO"
  | "ACTION_REJECTED"
  | "PINCH_ON"
  | "PINCH_OFF"
  | "MANUAL_CLEAR";

export interface BenchEvent {
  t: number;
  trialId: string | null;
  type: EventType;
  /** gesture = camera landmarks, pointer = mouse/touch fallback (never mixed in one aggregate). */
  source?: "gesture" | "pointer" | "system";
  data?: Record<string, number | string | boolean | null>;
}

export interface PerfSample {
  t: number;
  trialId: string | null;
  framesReceived: number;
  framesProcessed: number;
  framesSkipped: number;
  framesDropped: number;
  detectHz: number;
  videoFps: number;
  uiFps: number;
  rafIntervalP95Ms: number | null;
  rafIntervalMaxMs: number | null;
  longTasksInWindow: number;
  longTaskMaxMs: number | null;
  inFlight: number;
  workerRestarts: number;
  pipelineP50Ms: number | null;
  pipelineP95Ms: number | null;
  storageQueue: number;
  droppedRecords: number;
  /** Chromium-only, coarse; null when the browser does not expose it. Never invented. */
  jsHeapUsedMb: number | null;
}

export interface TrialSummary {
  trialId: string;
  frames: number;
  durationMs: number;
  handFrames: number;
  detectorMissFrames: number;
  missingHandRate: number | null;
  lockedFrames: number;
  handLossEvents: number;
  reacquisitions: number;
  handCountHistogram: Record<string, number>;
  rejectReasons: Record<string, number>;
  preprocessPasses: Record<string, number>;
  mpMs: Quantiles;
  preMs: Quantiles;
  classifierMs: Quantiles;
  pipelineMs: Quantiles;
  detectHzMean: number | null;
  lumaMean: Quantiles;
  backlightFrames: number;
  gesture: {
    keydowns: number;
    keyups: number;
    releaseAlls: number;
    heldFrames: number;
    labelledFrames: number;
    /** labelled frames where truth is not POINT_PRESS but the model said POINT_PRESS. Needs tester labels to be meaningful. */
    falsePressFrames: number;
    missedPressFrames: number;
    confusion: Record<string, Record<string, number>>;
  };
  canvas: {
    strokes: number;
    strokePointsMean: number | null;
    strokePathPxMean: number | null;
    strokeDurMsMean: number | null;
    unexpectedStrokeBreaks: number;
    gapFramesDuringStroke: number;
    eraseActions: number;
    eraseHits: number;
    eraseMisses: number;
    undo: number;
    redo: number;
    actionsRejected: number;
    pointerStrokes: number;
    gestureStrokes: number;
    actionLatencyMs: Quantiles;
    jitterRawPx: Quantiles;
    jitterInkPx: Quantiles;
  };
  warnings: string[];
}

export interface Quantiles {
  n: number;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface ChunkRecord<T = unknown> {
  sessionId: string;
  kind: RecordKind;
  seq: number;
  count: number;
  items: T[];
}

export type { TruthLabel };
