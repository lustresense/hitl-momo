/**
 * Extracts discrete Gesture Lab and Canvas Lab events from per-frame LabAnalyzer snapshots and pointer fallback actions.
 * Keeps pointer ("pointer") and camera gesture ("gesture") sources strictly tagged so they are never mixed.
 */
import type { Landmark } from "@/src/input/types";
import type { LabSnapshot } from "../lab-analyzer";
import { buildRecordFrame, type TruthLabel } from "../lab-recorder";
import type { BenchSessionManager } from "./manager";
import type { BenchFrame } from "./schema";

export interface FrameRecordContext {
  frameId: number;
  nowMs: number;
  landmarks: Landmark[] | null;
  truth: TruthLabel;
  luma: { mean: number | null; center: number | null; backlight: boolean; pass: string };
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
}

function strokePathPx(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return Math.round(len * 10) / 10;
}

export class LabTelemetryBridge {
  private prevLock: string | null = null;
  private prevAcqId = 0;
  private prevPinch = false;
  private prevErasing = false;
  private prevEraseHit: boolean | null = null;
  private prevCommandAtMs: number | null = null;
  private prevRejectKey: string | null = null;

  // Active gesture stroke tracking
  private strokeSeq = 0;
  private activeGestureStroke: {
    id: number;
    startedAtMs: number;
    points: Array<{ x: number; y: number }>;
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
    this.activeGestureStroke = null;
    this.activePointerStroke = null;
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
    const frame: Omit<BenchFrame, "trialId"> = {
      ...base,
      fid: ctx.frameId,
      det: hasHand ? "HAND" : "DETECTOR_MISS",
      hands: snap.handCount,
      farHands: snap.farHandCount,
      luma: {
        mean: ctx.luma.mean,
        center: ctx.luma.center,
        backlight: ctx.luma.backlight,
        pass: ctx.luma.pass,
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
        state: snap.r19.virtualKey.fsmState,
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
    };
    this.mgr.recordFrame(frame);

    // 1. Hand lock & reacquisition events
    if (this.prevLock === "locked" && snap.lockStatus !== "locked") {
      this.mgr.event("HAND_LOST", { reason: snap.lockReason ?? "unknown", hands: snap.handCount }, "gesture");
    }
    if (snap.lockStatus === "locked" && snap.acquisitionId > this.prevAcqId) {
      this.prevAcqId = snap.acquisitionId;
      this.mgr.event("HAND_REACQUIRED", { acquisitionId: snap.acquisitionId, hands: snap.handCount }, "gesture");
    }
    this.prevLock = snap.lockStatus;

    // 2. Virtual key events (Gesture Lab & read-only Canvas Lab)
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
      );
    } else if (vke === "KEYUP") {
      this.mgr.event("KEYUP", { reason: snap.r19.virtualKey.releaseReason }, "gesture");
    } else if (vke === "RELEASE_ALL") {
      this.mgr.event("RELEASE_ALL", { reason: snap.r19.virtualKey.releaseReason ?? snap.r19.reason }, "gesture");
    }

    if (!this.isCanvas) return;

    // 3. Canvas Lab pinch, stroke, erase, swipe undo/redo & rejections (gesture source only)
    const pinchNow = snap.r19.guards.pinchActive;
    if (pinchNow && !this.prevPinch) {
      this.mgr.event("PINCH_ON", { pinchRatio: snap.pinchRatio, latencyMs: ctx.timing.pipelineMs }, "gesture");
    } else if (!pinchNow && this.prevPinch) {
      this.mgr.event("PINCH_OFF", { pinchRatio: snap.pinchRatio }, "gesture");
    }
    this.prevPinch = pinchNow;

    const gestureActivePts = !this.activePointerStroke ? ctx.activeStrokePoints : null;
    if (gestureActivePts && gestureActivePts.length > 0) {
      if (!this.activeGestureStroke) {
        const id = ++this.strokeSeq;
        this.activeGestureStroke = {
          id,
          startedAtMs: ctx.nowMs,
          points: gestureActivePts.map((p) => ({ x: p.x, y: p.y })),
        };
        this.mgr.event("STROKE_START", { strokeId: id, latencyMs: ctx.timing.pipelineMs }, "gesture");
      } else {
        this.activeGestureStroke.points = gestureActivePts.map((p) => ({ x: p.x, y: p.y }));
      }
    } else if (this.activeGestureStroke) {
      const s = this.activeGestureStroke;
      const unexpectedBreak =
        !hasHand || snap.lockStatus !== "locked" || (snap.r19.state !== "OTHER" && !pinchNow);
      this.mgr.event(
        "STROKE_END",
        {
          strokeId: s.id,
          points: s.points.length,
          pathPx: strokePathPx(s.points),
          durMs: Math.max(0, Math.round(ctx.nowMs - s.startedAtMs)),
          unexpectedBreak,
          endReason: !hasHand ? "detector-miss" : snap.lockStatus !== "locked" ? snap.lockStatus : "pinch-release",
        },
        "gesture",
      );
      this.activeGestureStroke = null;
    }

    const dbg = snap.diag.pipeline;
    const erasingNow = Boolean(dbg?.erasing);
    if (erasingNow && !this.prevErasing) {
      this.mgr.event("ERASE_START", { latencyMs: ctx.timing.pipelineMs }, "gesture");
    } else if (!erasingNow && this.prevErasing) {
      this.mgr.event("ERASE_END", {}, "gesture");
      this.prevEraseHit = null;
    }
    this.prevErasing = erasingNow;

    if (erasingNow && dbg && dbg.lastEraseHit !== null && dbg.lastEraseHit !== this.prevEraseHit) {
      this.prevEraseHit = dbg.lastEraseHit;
      this.mgr.event(dbg.lastEraseHit ? "ERASE_HIT" : "ERASE_MISS", {}, "gesture");
    }

    const cmd = snap.diag.lastCommand;
    if (cmd && cmd.atMs !== this.prevCommandAtMs) {
      this.prevCommandAtMs = cmd.atMs;
      this.mgr.event(
        cmd.kind === "undo" ? "UNDO" : "REDO",
        { changed: cmd.changed, via: cmd.via, latencyMs: ctx.timing.pipelineMs },
        "gesture",
      );
    }

    const wantsCanvasAction =
      snap.pose === "pinch" ||
      snap.r19.guards.isPinch ||
      ((snap.pose === "open-palm" || snap.pose === "split-palm") && snap.fingerCount === 5);
    const rejectedNow = wantsCanvasAction && snap.drawingAction === null;
    const rejectKey = rejectedNow ? `${snap.pose}:${snap.rejectionReason}` : null;
    if (rejectKey && rejectKey !== this.prevRejectKey) {
      this.mgr.event(
        "ACTION_REJECTED",
        { pose: snap.pose, r19State: snap.r19.state, reason: snap.rejectionReason },
        "gesture",
      );
    }
    this.prevRejectKey = rejectKey;
  }

  // Pointer/mouse/touch fallback events — strictly tagged source: "pointer"
  onPointerDown(tool: "pen" | "eraser", pt: { x: number; y: number }, nowMs: number): void {
    if (!this.mgr.isActive) return;
    const id = ++this.strokeSeq;
    this.activePointerStroke = { id, tool, startedAtMs: nowMs, points: [{ x: pt.x, y: pt.y }] };
    this.mgr.event(tool === "pen" ? "STROKE_START" : "ERASE_START", { strokeId: id, tool, latencyMs: 0 }, "pointer");
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
        },
        "pointer",
      );
    } else {
      this.mgr.event("ERASE_END", { strokeId: s.id }, "pointer");
    }
  }

  onManualCanvasAction(action: "undo" | "redo" | "clear"): void {
    if (!this.mgr.isActive) return;
    const ev = action === "undo" ? "UNDO" : action === "redo" ? "REDO" : "MANUAL_CLEAR";
    this.mgr.event(ev, { via: "button" }, "pointer");
  }
}
