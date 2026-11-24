/**
 * NUI Lab benchmark session (R22 K8, backwards compatible with R20 nui-lab-bench-export/1): shared types and constants.
 *
 * This UPGRADES the one-shot LandmarkRecorder (lab-recorder.ts): per-frame numbers are produced by the same
 * `buildRecordFrame`, then wrapped with trial/session ids, frame freshness, owner-track, quality proxies,
 * action-resolver telemetry, and mandatory `labelSource` provenance. Nothing here ever holds pixels or video.
 *
 * Privacy contract (enforced by tests): numbers only. No image, video, audio, face data, name, device label text,
 * IP, or upload. Wall-clock appears only rounded to the minute (`createdAtMinuteIso`) so the Owner can tell which
 * session a file belongs to.
 */
import type { RecordFrame, TruthLabel } from "../lab-recorder";
import type { PinchGateResult } from "./action-resolver";
import type { HandStateReading, ReacquirePinchPolicy } from "./presets";
import type {
  AutoPreprocessStatus,
  CameraExposureCapabilities,
  ExposureControlStatus,
} from "./r20-lowlight";

export const BENCH_SESSION_SCHEMA_V1 = "nui-lab-bench-session/1" as const;
export const BENCH_SESSION_SCHEMA = "nui-lab-bench-session/2" as const;
export const BENCH_EXPORT_SCHEMA_V1 = "nui-lab-bench-export/1" as const;
export const BENCH_EXPORT_SCHEMA = "nui-lab-bench-export/2" as const;
export const BENCH_EXPORT_SCHEMA_V2_1 = "nui-lab-bench-export/2.1" as const;
export const BENCH_EXPORT_SCHEMA_V2_2 = "nui-lab-bench-export/2.2" as const;
export const BENCH_EXPORT_SUPPORTED_SCHEMAS = [
  BENCH_EXPORT_SCHEMA_V1,
  BENCH_EXPORT_SCHEMA,
  BENCH_EXPORT_SCHEMA_V2_1,
  BENCH_EXPORT_SCHEMA_V2_2,
] as const;

export const BENCH_DB_NAME = "nui-lab-bench";
export const BENCH_DB_VERSION = 1;

export type BenchRoute = "gesture" | "canvas" | "diagnostics";
export type BenchSource = "gesture-lab" | "canvas-lab";
export type EngineId = "r19-c0" | "r20-c4" | "r20-c7";
export type PreprocessMode = "raw" | "clahe" | "a4";
export type DetectorVariant = "cpu-worker" | "cpu-main-thread";
export type SessionStatus = "active" | "finished" | "interrupted" | "aborted";
export type RecordKind = "frames" | "events" | "perf";

/** Mandatory provenance tag for predictions, derived proxies, user actions, and external GT (Contract K4/A06/B05/D14). */
export const LABEL_SOURCES = [
  "MODEL_PREDICTION",
  "RULE_DERIVED",
  "USER_ACTION",
  "DATASET_GT",
  "UNKNOWN",
] as const;
export type LabelSource = (typeof LABEL_SOURCES)[number];

export type TrackingState = "LOCKED" | "ACQUIRING" | "AMBIGUOUS_HOLD" | "LOST" | "NO_HAND" | "HIDDEN";
export type LandmarkHealth = "VALID" | "LOW_QUALITY" | "STALE" | "MISSING" | "AMBIGUOUS";

export const TRIAL_END_REASONS = [
  "route-switch",
  "tab-hidden",
  "pagehide",
  "camera-stop",
  "worker-error",
  "user-finish",
  "detector-switch",
  "engine-change",
  "preprocess-change",
  "interrupted",
] as const;
export type TrialEndReason = (typeof TRIAL_END_REASONS)[number] | (string & {});

/** Legacy scenario enum retained for v1 export/replay compatibility; Owner UI no longer requires selecting scenarios. */
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
  numHandsPolicy: "fixed-2" | "fixed-1" | "owner-lock-guarded" | "main-thread-fixed-2";
  /** Hidden URL override tag when explicitly overridden (e.g. `"url:?hands=1"`), else `null`. */
  numHandsOverride?: string | null;
  /** Primary Owner UI badge (e.g. "NUI R22 · CPU · Otomatis") while `engineId`/`actualModelId` stay strictly honest. */
  displayModeLabel?: string;
  actualModelId?: string;
  modelFamily?: "r19-baseline" | "r20-student" | "r22-candidate";
  isTrainedR22Model?: boolean;
}

export interface CameraProfile {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  /** "virtual-suspected" when the device name looks like a fake/virtual camera. The name itself is NOT stored. */
  deviceClass: "physical-presumed" | "virtual-suspected" | "unknown";
  /** Optional opportunistic UVC capability summary (non-identifying booleans/ranges only). */
  exposureProbeSupported?: boolean;
  /** R22B B3: Full non-identifying UVC exposure/brightness/contrast capabilities + current values. */
  exposureCapabilities?: CameraExposureCapabilities | null;
}

export interface SessionMeta {
  schema: typeof BENCH_SESSION_SCHEMA | typeof BENCH_SESSION_SCHEMA_V1;
  sessionId: string;
  status: SessionStatus;
  statusReason: string | null;
  createdAtMinuteIso: string;
  /** Local liveness stamp (epoch ms) used to detect crashed tabs on the next page load. */
  heartbeatEpochMs: number;
  consent: { numericRecording: true; videoOrImages: false; upload: false; version: "bench-consent/1" };
  app: { version: string; gitCommit: string; gitBranch?: string };
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
  /** MoNUI-7 R23 / Lampiran E Session Meta */
  yoloModelSha256?: string | null;
  yoloEnabled?: boolean | null;
  yoloRateHz?: number | null;
  monuiVersion?: "MoNUI-7" | string | null;
  /** R23B-HF3 Camera & low-light pipeline session metadata (numbers/enums only; no device labels). */
  cameraActual?: {
    width: number | null;
    height: number | null;
    frameRate: number | null;
    deviceClass?: CameraProfile["deviceClass"];
    constraintFallback?: boolean;
    irCameraSkipped?: boolean;
  } | null;
  cameraCapabilities?: {
    supported: boolean;
    exposureMode: string[] | null;
    exposureTime: { min: number; max: number; step: number } | null;
    currentExposureMode: string | null;
    currentExposureTime: number | null;
    canLockExposureTime: boolean;
  } | null;
  exposureControlStatus?: ExposureControlStatus | null;
  autoPreprocessStatus?: AutoPreprocessStatus | null;
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
  preprocessConfig?: {
    mode: PreprocessMode;
    variant?: string;
    defaultMode?: PreprocessMode;
    candidates?: string[];
  };
  detectorConfig?: {
    variant: DetectorVariant;
    delegate: "CPU";
    numHandsPolicy: EngineConfig["numHandsPolicy"];
    numHandsActive: 1 | 2;
    numHandsOverride?: string | null;
    /** R22B B3/B4: MediaPipe confidence parameters applied at creation only (0 runtime setOptions). */
    minDetectionConfidence?: number;
    minPresenceConfidence?: number;
    minTrackingConfidence?: number;
    confidenceOverride?: string | null;
    initSetOptionsCalls: number;
    runtimeSetOptionsCalls: number;
  };
  /** R22B B3/K11: Active Canvas mechanism preset ID. */
  presetId?: string;
  /** R22B B1.8: Active reacquire pinch policy (`require-release` | `allow-after-confirm`). */
  reacquirePinchPolicy?: ReacquirePinchPolicy;
  /** R22B B2.5/B3: Guided capture session metadata when `?capture=1` is active. */
  captureMeta?: {
    enabled: boolean;
    protocolId?: string | null;
    subjectCode?: string | null;
    lighting?: string | null;
  } | null;
  /** R22B B2.6/B3: Developer raw video recorder metadata when `?rawrec=1` is active (never uploaded). */
  rawRecMeta?: {
    enabled: boolean;
    consentGranted: boolean;
    filename?: string | null;
    mimeType?: string | null;
  } | null;
  autoConditionTags?: string[];
  autoConditionTagsSource?: LabelSource;
  independentGroundTruthAvailable?: boolean;
}

export interface FrameLumaInfo {
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
}

export interface R22FrameFields {
  /** Monotonic unique camera frame ID from CameraFrameScheduler (K1). */
  captureFrameId: number;
  /** Monotonic frame ID processed by the detector/worker (K2). */
  processedFrameId: number;
  /** Capture timestamp (ms since session start) corresponding to captureFrameId. */
  captureTimestamp: number;
  /** Display/analysis completion timestamp (ms since session start). */
  displayTimestamp: number;
  /** Age of the capture frame when analyzed/displayed (ms). */
  frameAgeMs: number | null;
  /** Rolling unique camera capture FPS reported by CameraFrameScheduler. */
  uniqueCaptureFps: number | null;
  /** Duplicate camera frames skipped since the previous recorded frame in this trial. */
  framesSkippedDuplicate: number;
  videoFrameWidth: number | null;
  videoFrameHeight: number | null;
  cameraReportedFps: number | null;
  detectHz: number | null;
  uiFps: number | null;
  captureToActionLatency: number | null;

  /** MediaPipe HandLandmarker active numHands and setOptions call counters (runtime MUST be 0 during tracking). */
  numHandsActive: 1 | 2;
  initSetOptionsCalls: number;
  runtimeSetOptionsCalls: number;

  /** Quality & lighting proxies (sensor post-AE proxies, never factual room lux). */
  lumaP10: number | null;
  lumaP50: number | null;
  lumaP95: number | null;
  /** % of pixels >= 250 inside hand ROI bbox when a hand is present; MUST be null when no hand bbox exists. */
  nearWhiteHandPct: number | null;
  blurProxy: number | null;
  noiseProxy: number | null;
  backlightCandidate: boolean;
  preprocessPass: string;
  captureQualityTags: string[];

  /** Owner tracking & landmark health (K2/E02). */
  ownerTrackId: number | null;
  trackingState: TrackingState;
  missReason: string | null;
  landmarkHealth: LandmarkHealth;

  /** Predictions, ActionIntentResolver output, gap/end metadata, and mandatory provenance (K3/A06/B05/D14). */
  posePred: string;
  predictionConfidence: number | null;
  gestureTransition: string | null;
  actionIntent: string;
  actionAccepted: boolean;
  actionRejectedReason: string | null;
  strokeId: number | null;
  pointCount: number | null;
  drawPathError: number | null;
  gapReason: string | null;
  endReason: string | null;
  labelSource: LabelSource;
  labelSources: {
    truth: LabelSource;
    posePred: LabelSource;
    actionIntent: LabelSource;
    captureQuality: LabelSource;
  };

  /** R22B K8 v2.1 / B3 / B4.2 / B1.9 per-frame extensions. */
  mpRawHandCount?: number | null;
  mpHandednessScores?: number[] | null;
  pinchGate?: PinchGateResult | null;
  handState?: HandStateReading | null;
  clippedPct?: number | null;
  handRoiLumaP50?: number | null;
  lastRoiLumaP50?: number | null;
  truthMasked?: boolean;
  labelProvenance?: string | null;
  captureStep?: string | null;
  variation?: string | null;
  lighting?: string | null;
  subjectCode?: string | null;
  /** MoNUI-7 R23 / Lampiran E Frame Fields */
  rescueState?: "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST" | null;
  yoloRan?: boolean | null;
  yoloMs?: number | null;
  yoloScore?: number | null;
  cropTried?: boolean | null;
  cropSuccess?: boolean | null;
  positionOnly?: { cx: number; cy: number; score: number } | null;
  guideState?: "GREET" | "LOCKED" | "DRAWING" | "ASK_FIVE_AGAIN" | "UNCLEAR_FINGERS" | "ASK_LIGHT" | null;
}

export interface FrameExtra extends R22FrameFields {
  fid: number;
  trialId: string;
  /** Detector status for the frame: a frame with no landmarks is DETECTOR_MISS, never silently omitted. */
  det: "HAND" | "DETECTOR_MISS";
  hands: number;
  farHands: number;
  luma: FrameLumaInfo;
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
export type BenchFrameInput = RecordFrame & Omit<FrameExtra, keyof R22FrameFields> & Partial<R22FrameFields>;

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
  | "STROKE_GAP"
  | "STROKE_RESUME"
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
  | "PINCH_ONSET_BLOCKED"
  | "PINCH_ONSET_CONFIRMED"
  | "PINCH_RELEASE_BRIDGED"
  | "THREE_ACTION"
  | "CAMERA_SETTING_CHANGED"
  | "CAPTURE_STEP_START"
  | "CAPTURE_STEP_END"
  | "RAWREC_START"
  | "RAWREC_STOP"
  | "MANUAL_CLEAR"
  // MoNUI-7 R23 / Lampiran E Events
  | "RESCUE_START"
  | "RESCUE_SUCCESS"
  | "RESCUE_FAIL"
  | "POSITION_ONLY_ENTER"
  | "POSITION_ONLY_EXIT"
  | "RESCUE_AUTO_OFF"
  | "PRESET_CHANGED"
  | "GUIDE_PROMPT"
  // R23B-HF3 Low-Light Camera Events
  | "CAMERA_CONSTRAINT_FALLBACK"
  | "CAMERA_EXPOSURE_LOCKED"
  | "CAMERA_EXPOSURE_REVERTED"
  | "PREPROCESS_AUTO_ON"
  | "PREPROCESS_AUTO_OFF"
  | "CAMERA_BLACK";

export interface BenchEvent {
  t: number;
  trialId: string | null;
  type: EventType;
  /** gesture = camera landmarks, pointer = mouse/touch fallback (never mixed in one aggregate). */
  source?: "gesture" | "pointer" | "system";
  /** Provenance of the event label/trigger. */
  labelSource?: LabelSource;
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
  uniqueCaptureFps?: number | null;
  framesSkippedDuplicate?: number;
  frameAgeP50Ms?: number | null;
  frameAgeP95Ms?: number | null;
  initSetOptionsCalls?: number;
  runtimeSetOptionsCalls?: number;
}

export interface ActiveWindowSummary {
  frames: number;
  durationMs: number;
  missFrames: number;
  missRate: number | null;
  leadInNoHandFrames: number;
  tailNoHandFrames: number;
  flickerStreaks_1_3: number;
  shortLossStreaks_4_15: number;
  longAbsenceStreaks_gt15: number;
  flickerFrames_1_3: number;
  shortLossFrames_4_15: number;
  longAbsenceFrames_gt15: number;
}

export interface TrialSummary {
  trialId: string;
  endReason: string | null;
  independentGroundTruthAvailable: boolean;
  frames: number;
  durationMs: number;
  handFrames: number;
  detectorMissFrames: number;
  /** Raw no-hand rate across the whole trial (includes lead-in and tail absence). */
  missingHandRate: number | null;
  rawNoHandRate: number | null;
  activeWindowMissRate: number | null;
  flickerStreaks_1_3: number;
  shortLossStreaks_4_15: number;
  longAbsenceStreaks_gt15: number;
  hiddenDurationMs: number;
  duplicateFrameSkippedCount: number;
  initSetOptionsCalls: number;
  runtimeSetOptionsCalls: number;
  autoConditionTags: string[];
  autoConditionTagsSource: LabelSource;
  activeWindow: ActiveWindowSummary;
  missingBreakdown: {
    hiddenFrames: number;
    hiddenDurationMs: number;
    bystanderAmbiguousFrames: number;
    ownerRejectFrames: number;
    leadInTailNoHandFrames: number;
    activeWindowUnknownMissFrames: number;
    missReasons: Record<string, number>;
  };
  freshness: {
    uniqueCaptureFps: Quantiles;
    frameAgeMs: Quantiles;
    duplicateFrameSkippedCount: number;
    framesDroppedBusy: number;
  };
  quality: {
    lumaP10: Quantiles;
    lumaP50: Quantiles;
    lumaP95: Quantiles;
    nearWhiteHandPct: Quantiles;
    blurProxy: Quantiles;
    noiseProxy: Quantiles;
  };
  actionInvariants: {
    noHandActionsCount: number;
    nearPinchStrokeStarts: number;
    pistolRejectsOnCanvas: number;
    runtimeSetOptionsCalls: number;
    predictionDistribution: Record<string, number>;
    labelSourceCounts: Record<string, number>;
  };
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
    /** Null unless independent ground-truth / explicit tester labels exist (NEVER derived from self-prediction). */
    falsePressFrames: number | null;
    missedPressFrames: number | null;
    confusion: Record<string, Record<string, number>> | null;
  };
  canvas: {
    strokes: number;
    strokePointsMean: number | null;
    strokePathPxMean: number | null;
    strokeDurMsMean: number | null;
    unexpectedStrokeBreaks: number;
    gapFramesDuringStroke: number;
    continuedStrokesAfterGrace: number;
    strokeGapEvents: number;
    strokeEndReasons: Record<string, number>;
    strokeGapReasons: Record<string, number>;
    eraseActions: number;
    eraseHits: number;
    eraseMisses: number;
    undo: number;
    redo: number;
    undoVia: Record<string, number>;
    redoVia: Record<string, number>;
    actionsRejected: number;
    actionRejectedReasons: Record<string, number>;
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
