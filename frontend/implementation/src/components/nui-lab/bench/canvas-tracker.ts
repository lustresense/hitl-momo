/**
 * Extracts discrete Gesture Lab and Canvas Lab events from per-frame LabAnalyzer snapshots and pointer fallback actions,
 * and maps K1 (`CameraFrameTick`), K2 (`CpuWorkerResult`), and K3 (`ActionIntentResolver`) telemetry into R22
 * `BenchFrame` / `BenchEvent` records with mandatory `labelSource` provenance (B05, B08, E02).
 *
 * Keeps pointer ("pointer") and camera gesture ("gesture") sources strictly tagged so they are never mixed.
 */
import type { Landmark } from "@/src/input/types";
import type { LabSnapshot } from "../lab-analyzer";
import { buildRecordFrame, type TruthLabel } from "../lab-recorder";
import type { BenchSessionManager } from "./manager";
import { deriveConditionTags } from "./stats";
import type { BenchFrameInput, LabelSource, LandmarkHealth, TrackingState } from "./schema";

export interface FrameRecordContext {
  frameId: number;
  nowMs: number;
  landmarks: Landmark[] | null;
  truth: TruthLabel;
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
  activeStrokePoints: Array<{ x: number; y: number }> | null;
  completedStrokeCount: number;

  // R22 K1/K2/K3 optional extensions (populated by upgraded NuiLabPage; safe fallbacks if omitted)
  captureFrameId?: number;
  processedFrameId?: number;
  captureTimestampMs?: number;
  displayTimestampMs?: number;
  frameAgeMs?: number | null;
  uniqueCaptureFps?: number | null;
  /** Either per-frame skipped count or cumulative from CameraFrameScheduler (see framesSkippedDuplicateCumulative). */
  framesSkippedDuplicate?: number;
  framesSkippedDuplicateCumulative?: number;
  videoFrameWidth?: number | null;
  videoFrameHeight?: number | null;
  cameraReportedFps?: number | null;
  detectHz?: number | null;
  uiFps?: number | null;
  numHandsActive?: 1 | 2;
  initSetOptionsCalls?: number;
  runtimeSetOptionsCalls?: number;
  runtimeSetOptionsCallsCumulative?: number;
  ownerTrack?: {
    locked: boolean;
    trackId: number;
    handCount: number;
    ambiguousHold: boolean;
    rejectReason: string | null;
  } | null;
  tabHidden?: boolean;
  actionResolution?: {
    actionIntent: string;
    actionAccepted: boolean;
    rejectReason: string | null;
    labelSource: LabelSource;
    fingerCount?: number;
    undoRedoFsmState?: string | null;
    via?: string | null;
    gapReason?: string | null;
    endReason?: string | null;
    inGrace?: boolean;
    pinchContact?: boolean;
    drawPathError?: number | null;
    gestureTransition?: string | null;
    posePred?: string | null;
    predictionConfidence?: number | null;
  } | null;
  isDatasetGt?: boolean;
  // MoNUI-7 R23 / Lampiran E Frame Fields
  rescueState?: "NORMAL" | "SEARCH" | "RESCUE_TRACK" | "POSITION_ONLY" | "LOST" | null;
  yoloRan?: boolean | null;
  yoloMs?: number | null;
  yoloScore?: number | null;
  cropTried?: boolean | null;
  cropSuccess?: boolean | null;
  positionOnly?: { cx: number; cy: number; score: number } | null;
  guideState?: "GREET" | "LOCKED" | "DRAWING" | "ASK_FIVE_AGAIN" | "UNCLEAR_FINGERS" | "ASK_LIGHT" | null;
  /** R22B B3/B4.2/B2.5 optional per-frame metadata. */
  mpRawHandCount?: number | null;
  mpHandednessScores?: number[] | null;
  truthMasked?: boolean;
  labelProvenance?: string | null;
  captureStep?: string | null;
  variation?: string | null;
  lighting?: string | null;
  subjectCode?: string | null;
}

function strokePathPx(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return Math.round(len * 10) / 10;
}

function normalizeCommandVia(kind: "undo" | "redo", rawVia: string | undefined): string {
  if (rawVia === "gesture-fist-one" || rawVia === "gesture-fist-two" || rawVia === "button") {
    return rawVia;
  }
  if (
    rawVia === "fist-transition" ||
    rawVia === "pose-hold" ||
    rawVia === "fist-one" ||
    rawVia === "fist-two"
  ) {
    return kind === "undo" ? "gesture-fist-one" : "gesture-fist-two";
  }
  return rawVia ?? (kind === "undo" ? "gesture-fist-one" : "gesture-fist-two");
}

function normalizeCanvasPosePred(snap: LabSnapshot, hasHand: boolean): string {
  if (!hasHand) return "NO_HAND";
  switch (snap.pose) {
    case "pinch":
      return "PINCH";
    case "open-palm":
    case "split-palm":
      return snap.fingerCount === 5 ? "FIVE" : "OTHER";
    case "fist":
      return "FIST";
    case "one-finger":
      return "ONE";
    case "two-fingers":
      return "TWO";
    default:
      return "OTHER";
  }
}

export class LabTelemetryBridge {
  private prevLock: string | null = null;
  private prevAcqId = 0;
  private prevPinch = false;
  private prevErasing = false;
  private prevEraseHit: boolean | null = null;
  private prevCommandAtMs: number | null = null;
  private prevRejectKey: string | null = null;
  private prevCompletedStrokeCount = 0;
  private prevUndoRedoState: string | null = null;

  // Cumulative -> per-trial delta trackers (kept across bridge.reset() unless cumulative counter resets)
  private prevSkippedDuplicateCum: number | null = null;
  private prevRuntimeSetOptionsCum: number | null = null;

  // Active gesture stroke tracking (supports short-blink grace survival without premature STROKE_END)
  private strokeSeq = 0;
  private activeGestureStroke: {
    id: number;
    startedAtMs: number;
    points: Array<{ x: number; y: number }>;
    inGrace: boolean;
    graceStartedAtMs: number | null;
    recoveredGapCount: number;
  } | null = null;

  // Active pointer fallback tracking (separate source!)
  private activePointerStroke: {
    id: number;
    tool: "pen" | "eraser";
    startedAtMs: number;
    points: Array<{ x: number; y: number }>;
  } | null = null;

  constructor(
    private readonly mgr: BenchSessionManager,
    private readonly isCanvas: boolean,
  ) {}

  reset(): void {
    this.prevLock = null;
    this.prevAcqId = 0;
    this.prevPinch = false;
    this.prevErasing = false;
    this.prevEraseHit = null;
    this.prevCommandAtMs = null;
    this.prevRejectKey = null;
    this.prevCompletedStrokeCount = 0;
    this.prevUndoRedoState = null;
    this.activeGestureStroke = null;
    this.activePointerStroke = null;
  }

  private computeDelta(currCum: number | undefined, prev: number | null): { delta: number; nextPrev: number | null } {
    if (currCum === undefined || !Number.isFinite(currCum)) return { delta: 0, nextPrev: prev };
    if (prev === null) return { delta: Math.max(0, currCum), nextPrev: currCum };
    if (currCum >= prev) return { delta: currCum - prev, nextPrev: currCum };
    return { delta: Math.max(0, currCum), nextPrev: currCum };
  }

  onAnalyzedFrame(snap: LabSnapshot, ctx: FrameRecordContext): void {
    if (!this.mgr.isActive || !this.mgr.hasOpenTrial) return;

    const tRel = this.mgr.nowT();
    const base = buildRecordFrame(
      snap,
      ctx.landmarks,
      ctx.truth,
      Math.round(tRel),
      snap.diag.lastCommand?.atMs ?? null,
    );

    const probs = snap.r19.probs;
    const top3 = probs
      ? [
          { label: "POINT_READY", p: Math.round(probs.ready * 1e4) / 1e4 },
          { label: "POINT_PRESS", p: Math.round(probs.press * 1e4) / 1e4 },
          { label: "OTHER", p: Math.round(probs.other * 1e4) / 1e4 },
        ].sort((a, b) => b.p - a.p)
      : null;

    const hasHand = ctx.landmarks !== null && ctx.landmarks.length === 21;
    const snapAr = (snap as unknown as {
      actionResolution?: {
        actionIntent: string;
        actionAccepted: boolean;
        rejectReason: string | null;
        labelSource: LabelSource;
        fingerCount?: number;
        poseClass?: string;
        pinchState?: string;
        pinchContact?: boolean;
        undoRedoFsmState?: string;
        inLossGrace?: boolean;
        shouldEndOpenOps?: boolean;
        confidence?: number;
      };
    }).actionResolution;
    const actionRes: FrameRecordContext["actionResolution"] =
      ctx.actionResolution ??
      (snapAr
        ? {
            actionIntent: snapAr.actionIntent,
            actionAccepted: snapAr.actionAccepted,
            rejectReason: snapAr.rejectReason,
            labelSource: snapAr.labelSource,
            fingerCount: snapAr.fingerCount,
            undoRedoFsmState: snapAr.undoRedoFsmState ?? null,
            inGrace: snapAr.inLossGrace,
            posePred: !hasHand
              ? "NO_HAND"
              : snapAr.pinchState === "TOUCH"
                ? "PINCH"
                : snapAr.poseClass ?? normalizeCanvasPosePred(snap, hasHand),
            predictionConfidence:
              snapAr.labelSource === "MODEL_PREDICTION" ? (snapAr.confidence ?? null) : null,
            gapReason: snapAr.inLossGrace ? "short-blink-grace" : null,
          }
        : null);

    // Duplicate-frame & runtime setOptions deltas
    let skippedDupDelta = ctx.framesSkippedDuplicate ?? 0;
    if (ctx.framesSkippedDuplicateCumulative !== undefined) {
      const d = this.computeDelta(ctx.framesSkippedDuplicateCumulative, this.prevSkippedDuplicateCum);
      skippedDupDelta = d.delta;
      this.prevSkippedDuplicateCum = d.nextPrev;
    }

    let runtimeSetOptionsDelta = 0;
    const runtimeCum = ctx.runtimeSetOptionsCallsCumulative ?? ctx.runtimeSetOptionsCalls;
    if (runtimeCum !== undefined) {
      const d = this.computeDelta(runtimeCum, this.prevRuntimeSetOptionsCum);
      runtimeSetOptionsDelta = d.delta;
      this.prevRuntimeSetOptionsCum = d.nextPrev;
    }

    const frameAgeMs =
      ctx.frameAgeMs !== undefined
        ? ctx.frameAgeMs
        : ctx.captureTimestampMs !== undefined
          ? Math.max(0, Math.round((ctx.displayTimestampMs ?? ctx.nowMs) - ctx.captureTimestampMs))
          : null;
    const captureTimestampRel =
      ctx.captureTimestampMs !== undefined
        ? Math.max(0, Math.round(tRel - Math.max(0, (ctx.displayTimestampMs ?? ctx.nowMs) - ctx.captureTimestampMs)))
        : Math.round(tRel);

    const lP10 = ctx.luma.p10 ?? null;
    const lP50 = ctx.luma.p50 ?? ctx.luma.mean;
    const lP95 = ctx.luma.p95 ?? null;
    const nearWhiteHandPct = hasHand ? (ctx.luma.nearWhiteHandPct ?? null) : null;
    const blurProxy = ctx.luma.blurProxy ?? null;
    const noiseProxy = ctx.luma.noiseProxy ?? null;
    const captureQualityTags = deriveConditionTags({
      lumaP50: lP50,
      lumaP95: lP95,
      nearWhiteHandPct,
      blurProxy,
      noiseProxy,
      backlight: ctx.luma.backlight,
    });

    const ambiguousHold =
      Boolean(ctx.ownerTrack?.ambiguousHold) ||
      snap.lockStatus === "ambiguous" ||
      snap.lockReason === "crossing";
    const trackingState: TrackingState = ctx.tabHidden
      ? "HIDDEN"
      : ambiguousHold
        ? "AMBIGUOUS_HOLD"
        : !hasHand
          ? "NO_HAND"
          : snap.lockStatus === "locked" || ctx.ownerTrack?.locked
            ? "LOCKED"
            : snap.lockStatus === "lost"
              ? "LOST"
              : "ACQUIRING";

    const missReason: string | null =
      hasHand && !ambiguousHold
        ? null
        : ctx.tabHidden
          ? "tab-hidden"
          : ctx.ownerTrack?.rejectReason ?? snap.lockReason ?? "no-hand";

    const landmarkHealth: LandmarkHealth = !hasHand
      ? "MISSING"
      : ambiguousHold
        ? "AMBIGUOUS"
        : (frameAgeMs ?? 0) > 150
          ? "STALE"
          : blurProxy !== null && blurProxy < 20
            ? "LOW_QUALITY"
            : "VALID";

    const posePred =
      actionRes?.posePred ??
      (this.isCanvas
        ? normalizeCanvasPosePred(snap, hasHand)
        : hasHand && snap.r19.state !== "NO_HAND"
          ? snap.r19.state
          : "NO_HAND");

    const posePredSource: LabelSource =
      !hasHand ? "RULE_DERIVED" : probs && !this.isCanvas ? "MODEL_PREDICTION" : "RULE_DERIVED";
    const maxProb = top3 && top3.length > 0 ? top3[0]!.p : null;
    const predictionConfidence =
      actionRes?.predictionConfidence !== undefined
        ? actionRes.predictionConfidence
        : posePredSource === "MODEL_PREDICTION"
          ? maxProb
          : null;

    const actionIntent =
      actionRes?.actionIntent ??
      (this.isCanvas
        ? snap.drawingAction === "draw"
          ? "DRAW"
          : snap.drawingAction === "erase"
            ? "ERASE"
            : snap.diag.lastCommand?.atMs === ctx.nowMs
              ? snap.diag.lastCommand.kind.toUpperCase()
              : "NEUTRAL"
        : snap.r19.virtualKey.event === "KEYDOWN" || snap.r19.virtualKey.event === "HELD"
          ? snap.r19.virtualKey.zone
          : "NEUTRAL");

    const actionAccepted =
      actionRes?.actionAccepted ??
      (this.isCanvas
        ? snap.drawingAction !== null || snap.diag.lastCommand?.atMs === ctx.nowMs
        : snap.r19.virtualKey.event === "KEYDOWN" || snap.r19.virtualKey.event === "HELD");

    const actionRejectedReason =
      actionRes !== null
        ? actionRes.rejectReason
        : actionAccepted
          ? null
          : snap.rejectionReason || null;

    const actionLabelSource: LabelSource = actionRes?.labelSource ?? posePredSource;
    const truthSource: LabelSource = ctx.isDatasetGt
      ? "DATASET_GT"
      : ctx.truth !== "UNLABELLED"
        ? "USER_ACTION"
        : "UNKNOWN";

    const currUndoRedoState = actionRes?.undoRedoFsmState ?? null;
    let gestureTransition = actionRes?.gestureTransition ?? null;
    if (!gestureTransition && currUndoRedoState && this.prevUndoRedoState && currUndoRedoState !== this.prevUndoRedoState) {
      gestureTransition = `${this.prevUndoRedoState}->${currUndoRedoState}`;
    }
    this.prevUndoRedoState = currUndoRedoState;
    const gestureActivePts = !this.activePointerStroke ? ctx.activeStrokePoints : null;
    const completedIncreased = ctx.completedStrokeCount > this.prevCompletedStrokeCount;
    this.prevCompletedStrokeCount = ctx.completedStrokeCount;

    let frameGapReason: string | null = actionRes?.gapReason ?? null;
    let frameEndReason: string | null = actionRes?.endReason ?? null;

    // Track lock & reacquisition events
    if (this.prevLock === "locked" && snap.lockStatus !== "locked") {
      this.mgr.event("HAND_LOST", { reason: snap.lockReason ?? "unknown", hands: snap.handCount }, "gesture", true, "RULE_DERIVED");
    }
    if (snap.lockStatus === "locked" && snap.acquisitionId > this.prevAcqId) {
      this.prevAcqId = snap.acquisitionId;
      this.mgr.event("HAND_REACQUIRED", { acquisitionId: snap.acquisitionId, hands: snap.handCount }, "gesture", true, "RULE_DERIVED");
    }
    this.prevLock = snap.lockStatus;

    // Virtual key events (Gesture Lab & read-only telemetry)
    const vke = snap.r19.virtualKey.event;
    if (vke === "KEYDOWN") {
      this.mgr.event(
        "KEYDOWN",
        {
          zone: snap.r19.virtualKey.zone,
          left: snap.r19.virtualKey.left,
          right: snap.r19.virtualKey.right,
          jump: snap.r19.virtualKey.jump,
          pipelineMs: ctx.timing.pipelineMs,
        },
        "gesture",
        true,
        posePredSource,
      );
    } else if (vke === "KEYUP") {
      this.mgr.event("KEYUP", { reason: snap.r19.virtualKey.releaseReason }, "gesture", true, "RULE_DERIVED");
    } else if (vke === "RELEASE_ALL") {
      this.mgr.event("RELEASE_ALL", { reason: snap.r19.virtualKey.releaseReason ?? snap.r19.reason }, "gesture", true, "RULE_DERIVED");
    }

    // Canvas-specific events & stroke continuity tracking
    if (this.isCanvas) {
      const fullAr = snap.actionResolution;
      if (fullAr?.onsetBlockedReason) {
        this.mgr.event(
          "PINCH_ONSET_BLOCKED",
          {
            reason: fullAr.onsetBlockedReason,
            path: fullAr.pinchGate?.path ?? "CLOSED",
            indexPipDeg: fullAr.pinchGate?.indexPipDeg ?? null,
            thumbTipToIndexMcp: fullAr.pinchGate?.thumbTipToIndexMcp ?? null,
            mrpExtendedCount: fullAr.pinchGate?.mrpExtendedCount ?? 0,
            pinchRatio: snap.pinchRatio,
          },
          "gesture",
          true,
          "RULE_DERIVED",
        );
      }
      if (fullAr?.onsetConfirmedMeta) {
        this.mgr.event(
          "PINCH_ONSET_CONFIRMED",
          {
            waitedMs: fullAr.onsetConfirmedMeta.waitedMs,
            backfilledPoints: snap.lastBackfilledPoints ?? 0,
            variant: fullAr.onsetConfirmedMeta.variant ?? null,
          },
          "gesture",
          true,
          "RULE_DERIVED",
        );
      }
      if (fullAr?.releaseBridgedGapMs !== null && fullAr?.releaseBridgedGapMs !== undefined) {
        this.mgr.event(
          "PINCH_RELEASE_BRIDGED",
          {
            gapMs: fullAr.releaseBridgedGapMs,
            strokeId: this.activeGestureStroke?.id ?? null,
          },
          "gesture",
          true,
          "RULE_DERIVED",
        );
      }
      if (fullAr?.fireThreeAction) {
        this.mgr.event(
          "THREE_ACTION",
          {
            variant: fullAr.fireThreeAction,
            presetId: fullAr.presetId ?? snap.presetId ?? "default-any-pinch",
          },
          "gesture",
          true,
          "RULE_DERIVED",
        );
      }

      const pinchNow =
        Boolean(snapAr?.pinchContact) ||
        Boolean(ctx.actionResolution?.pinchContact) ||
        snap.r19.guards.pinchActive ||
        snap.drawingAction === "draw";
      if (pinchNow && !this.prevPinch) {
        this.mgr.event("PINCH_ON", { pinchRatio: snap.pinchRatio, latencyMs: ctx.timing.pipelineMs }, "gesture", true, "RULE_DERIVED");
      } else if (!pinchNow && this.prevPinch) {
        this.mgr.event("PINCH_OFF", { pinchRatio: snap.pinchRatio }, "gesture", true, "RULE_DERIVED");
      }
      this.prevPinch = pinchNow;

      // Close previous stroke if completedStrokeCount grew or points vanished while not in grace
      const inGraceNow = Boolean(actionRes?.inGrace) && !completedIncreased;
      if (this.activeGestureStroke && (completedIncreased || (!gestureActivePts?.length && !inGraceNow))) {
        const s = this.activeGestureStroke;
        const unexpectedBreak = !hasHand || snap.lockStatus !== "locked" || ambiguousHold;
        const endReason =
          actionRes?.endReason ??
          (s.inGrace && !hasHand
            ? "detector-miss-timeout"
            : !hasHand
              ? "detector-miss"
              : ambiguousHold
                ? "ambiguous-two-hands"
                : snap.lockStatus !== "locked"
                  ? snap.lockStatus
                  : "pinch-release");
        const gapReason =
          actionRes?.gapReason ??
          (s.recoveredGapCount > 0 ? "short-blink-grace-recovered" : null);
        frameEndReason = endReason;
        frameGapReason = gapReason;
        this.mgr.event(
          "STROKE_END",
          {
            strokeId: s.id,
            points: s.points.length,
            pathPx: strokePathPx(s.points),
            durMs: Math.max(0, Math.round(ctx.nowMs - s.startedAtMs)),
            unexpectedBreak,
            endReason,
            gapReason,
            recoveredGaps: s.recoveredGapCount,
          },
          "gesture",
          true,
          "RULE_DERIVED",
        );
        this.activeGestureStroke = null;
      }

      if (gestureActivePts && gestureActivePts.length > 0) {
        if (!this.activeGestureStroke) {
          const id = ++this.strokeSeq;
          this.activeGestureStroke = {
            id,
            startedAtMs: ctx.nowMs,
            points: gestureActivePts.map((p) => ({ x: p.x, y: p.y })),
            inGrace: false,
            graceStartedAtMs: null,
            recoveredGapCount: 0,
          };
          this.mgr.event(
            "STROKE_START",
            { strokeId: id, pinchRatio: snap.pinchRatio, latencyMs: ctx.timing.pipelineMs },
            "gesture",
            true,
            actionLabelSource,
          );
        } else {
          // Check grace entry vs grace recovery while stroke stays open
          if ((!hasHand || inGraceNow) && !this.activeGestureStroke.inGrace) {
            this.activeGestureStroke.inGrace = true;
            this.activeGestureStroke.graceStartedAtMs = ctx.nowMs;
            frameGapReason = actionRes?.gapReason ?? "short-blink-grace";
            this.mgr.event(
              "STROKE_GAP",
              { strokeId: this.activeGestureStroke.id, gapReason: frameGapReason },
              "gesture",
              true,
              "RULE_DERIVED",
            );
          } else if (hasHand && !inGraceNow && this.activeGestureStroke.inGrace) {
            const gapMs =
              this.activeGestureStroke.graceStartedAtMs !== null
                ? Math.max(0, Math.round(ctx.nowMs - this.activeGestureStroke.graceStartedAtMs))
                : 0;
            this.activeGestureStroke.inGrace = false;
            this.activeGestureStroke.graceStartedAtMs = null;
            this.activeGestureStroke.recoveredGapCount++;
            frameGapReason = "resumed-after-short-blink";
            this.mgr.event(
              "STROKE_RESUME",
              { strokeId: this.activeGestureStroke.id, gapMs, gapReason: "short-blink-grace" },
              "gesture",
              true,
              "RULE_DERIVED",
            );
          }
          this.activeGestureStroke.points = gestureActivePts.map((p) => ({ x: p.x, y: p.y }));
        }
      }

      const dbg = snap.diag.pipeline;
      const erasingNow = Boolean(dbg?.erasing) || snap.drawingAction === "erase";
      if (erasingNow && !this.prevErasing) {
        this.mgr.event(
          "ERASE_START",
          {
            fingerCount: actionRes?.fingerCount ?? snap.fingerCount,
            pose: snap.pose,
            fiveFingerValid: snap.diag.fiveFingerValid,
            latencyMs: ctx.timing.pipelineMs,
          },
          "gesture",
          true,
          "RULE_DERIVED",
        );
      } else if (!erasingNow && this.prevErasing) {
        this.mgr.event("ERASE_END", { fingerCount: snap.fingerCount }, "gesture", true, "RULE_DERIVED");
        this.prevEraseHit = null;
      }
      this.prevErasing = erasingNow;

      if (erasingNow && dbg && dbg.lastEraseHit !== null && dbg.lastEraseHit !== this.prevEraseHit) {
        this.prevEraseHit = dbg.lastEraseHit;
        this.mgr.event(dbg.lastEraseHit ? "ERASE_HIT" : "ERASE_MISS", {}, "gesture", true, "RULE_DERIVED");
      }

      const cmd = snap.diag.lastCommand;
      if (cmd && cmd.atMs !== this.prevCommandAtMs) {
        this.prevCommandAtMs = cmd.atMs;
        const via = normalizeCommandVia(cmd.kind, actionRes?.via ?? cmd.via);
        this.mgr.event(
          cmd.kind === "undo" ? "UNDO" : "REDO",
          { changed: cmd.changed, via, latencyMs: ctx.timing.pipelineMs },
          "gesture",
          true,
          "RULE_DERIVED",
        );
      }

      const wantsCanvasAction =
        snap.pose === "pinch" ||
        snap.r19.guards.isPinch ||
        ((snap.pose === "open-palm" || snap.pose === "split-palm") && snap.fingerCount === 5) ||
        (actionRes !== null && actionRes.actionIntent !== "NEUTRAL" && actionRes.actionIntent !== "NONE");
      const rejectedNow =
        actionRes !== null
          ? !actionRes.actionAccepted && actionRes.rejectReason !== null && wantsCanvasAction
          : wantsCanvasAction && snap.drawingAction === null;
      const rejectKey = rejectedNow ? `${actionIntent}:${actionRejectedReason ?? snap.rejectionReason}` : null;
      if (rejectKey && rejectKey !== this.prevRejectKey) {
        this.mgr.event(
          "ACTION_REJECTED",
          {
            actionIntent,
            pose: snap.pose,
            r19State: snap.r19.state,
            reason: actionRejectedReason ?? snap.rejectionReason,
          },
          "gesture",
          true,
          actionLabelSource,
        );
      }
      this.prevRejectKey = rejectKey;
    }

    const frame: Omit<BenchFrameInput, "trialId"> = {
      ...base,
      fid: ctx.processedFrameId ?? ctx.frameId,
      det: hasHand ? "HAND" : "DETECTOR_MISS",
      hands: snap.handCount,
      farHands: snap.farHandCount,
      luma: {
        mean: ctx.luma.mean,
        center: ctx.luma.center,
        backlight: ctx.luma.backlight,
        pass: ctx.luma.pass,
        p10: lP10,
        p50: lP50,
        p95: lP95,
        clippedPct: ctx.luma.clippedPct ?? null,
        handRoiLumaP50: ctx.luma.handRoiLumaP50 ?? null,
        lastRoiLumaP50: ctx.luma.lastRoiLumaP50 ?? null,
        nearWhiteHandPct,
        blurProxy,
        noiseProxy,
      },
      timing: {
        mpMs: ctx.timing.mpMs,
        preMs: ctx.timing.preMs,
        workerMs: ctx.timing.workerMs,
        classifierMs: ctx.timing.classifierMs,
        pipelineMs: ctx.timing.pipelineMs,
      },
      top3,
      direction: snap.r19.directionLabel,
      geometry: {
        pinchActive: snap.r19.guards.pinchActive,
        eraseActive: snap.r19.guards.eraseActive,
        swipe: snap.r19.guards.swipeAction,
        thumbUp: snap.r19.guards.isThumbUp,
        isPinch: snap.r19.guards.isPinch,
      },
      fsm: {
        state: actionRes?.undoRedoFsmState ?? snap.r19.virtualKey.fsmState,
        event: snap.r19.virtualKey.event,
        zone: snap.r19.virtualKey.zone,
        left: snap.r19.virtualKey.left,
        right: snap.r19.virtualKey.right,
        jump: snap.r19.virtualKey.jump,
        releaseReason: snap.r19.virtualKey.releaseReason,
      },
      rejectDetail: snap.r19.reason,
      jitter: snap.still ? { raw: snap.rawJitterPx, ink: snap.inkJitterPx } : null,
      droppedSincePrev: ctx.droppedSincePrev,

      // R22 extended fields
      captureFrameId: ctx.captureFrameId ?? ctx.frameId,
      processedFrameId: ctx.processedFrameId ?? ctx.frameId,
      captureTimestamp: captureTimestampRel,
      displayTimestamp: Math.round(tRel),
      frameAgeMs,
      uniqueCaptureFps: ctx.uniqueCaptureFps ?? null,
      framesSkippedDuplicate: skippedDupDelta,
      videoFrameWidth: ctx.videoFrameWidth ?? null,
      videoFrameHeight: ctx.videoFrameHeight ?? null,
      cameraReportedFps: ctx.cameraReportedFps ?? null,
      detectHz: ctx.detectHz ?? (snap.detectFps > 0 ? snap.detectFps : null),
      uiFps: ctx.uiFps ?? null,
      captureToActionLatency: ctx.timing.pipelineMs,
      numHandsActive: ctx.numHandsActive ?? 2,
      initSetOptionsCalls: ctx.initSetOptionsCalls ?? 0,
      runtimeSetOptionsCalls: runtimeSetOptionsDelta,
      lumaP10: lP10,
      lumaP50: lP50,
      lumaP95: lP95,
      nearWhiteHandPct,
      blurProxy,
      noiseProxy,
      backlightCandidate: ctx.luma.backlight,
      preprocessPass: ctx.luma.pass,
      captureQualityTags,
      ownerTrackId: ctx.ownerTrack ? (ctx.ownerTrack.locked ? ctx.ownerTrack.trackId : null) : (snap.lockStatus === "locked" ? snap.acquisitionId : null),
      trackingState,
      missReason,
      landmarkHealth,
      posePred,
      predictionConfidence,
      gestureTransition,
      actionIntent,
      actionAccepted,
      actionRejectedReason,
      strokeId: this.activeGestureStroke?.id ?? null,
      pointCount: this.activeGestureStroke?.points.length ?? null,
      drawPathError: actionRes?.drawPathError ?? null,
      gapReason: frameGapReason,
      endReason: frameEndReason,
      labelSource: actionLabelSource,
      labelSources: {
        truth: truthSource,
        posePred: posePredSource,
        actionIntent: actionLabelSource,
        captureQuality: "RULE_DERIVED",
      },
      mpRawHandCount: ctx.mpRawHandCount ?? snap.handCount,
      mpHandednessScores: ctx.mpHandednessScores ?? null,
      pinchGate: snap.pinchGate ?? null,
      handState: snap.handState ?? null,
      clippedPct: ctx.luma.clippedPct ?? null,
      handRoiLumaP50: ctx.luma.handRoiLumaP50 ?? null,
      lastRoiLumaP50: ctx.luma.lastRoiLumaP50 ?? null,
      truthMasked: ctx.truthMasked ?? false,
      labelProvenance: ctx.labelProvenance ?? null,
      captureStep: ctx.captureStep ?? null,
      variation: ctx.variation ?? null,
      lighting: ctx.lighting ?? null,
      subjectCode: ctx.subjectCode ?? null,
      // MoNUI-7 R23 / Lampiran E Frame Fields
      rescueState: ctx.rescueState ?? null,
      yoloRan: ctx.yoloRan ?? null,
      yoloMs: ctx.yoloMs ?? null,
      yoloScore: ctx.yoloScore ?? null,
      cropTried: ctx.cropTried ?? null,
      cropSuccess: ctx.cropSuccess ?? null,
      positionOnly: ctx.positionOnly ?? null,
      guideState: ctx.guideState ?? null,
    };
    this.mgr.recordFrame(frame);
  }

  // Pointer/mouse/touch fallback events — strictly tagged source: "pointer", labelSource: "USER_ACTION"
  onPointerDown(tool: "pen" | "eraser", pt: { x: number; y: number }, nowMs: number): void {
    if (!this.mgr.isActive) return;
    const id = ++this.strokeSeq;
    this.activePointerStroke = { id, tool, startedAtMs: nowMs, points: [{ x: pt.x, y: pt.y }] };
    this.mgr.event(
      tool === "pen" ? "STROKE_START" : "ERASE_START",
      { strokeId: id, tool, latencyMs: 0 },
      "pointer",
      true,
      "USER_ACTION",
    );
  }

  onPointerMove(pt: { x: number; y: number }): void {
    if (!this.activePointerStroke) return;
    this.activePointerStroke.points.push({ x: pt.x, y: pt.y });
  }

  onPointerUp(nowMs: number): void {
    const s = this.activePointerStroke;
    this.activePointerStroke = null;
    if (!s || !this.mgr.isActive) return;
    if (s.tool === "pen") {
      this.mgr.event(
        "STROKE_END",
        {
          strokeId: s.id,
          points: s.points.length,
          pathPx: strokePathPx(s.points),
          durMs: Math.max(0, Math.round(nowMs - s.startedAtMs)),
          unexpectedBreak: false,
          endReason: "pointer-up",
          gapReason: null,
        },
        "pointer",
        true,
        "USER_ACTION",
      );
    } else {
      this.mgr.event("ERASE_END", { strokeId: s.id }, "pointer", true, "USER_ACTION");
    }
  }

  onManualCanvasAction(action: "undo" | "redo" | "clear"): void {
    if (!this.mgr.isActive) return;
    const ev = action === "undo" ? "UNDO" : action === "redo" ? "REDO" : "MANUAL_CLEAR";
    this.mgr.event(ev, { via: "button" }, "pointer", true, "USER_ACTION");
  }
}
