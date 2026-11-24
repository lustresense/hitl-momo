/**
 * R22B NUI-Lab-Only Stroke & Eraser Driver (`bench/lab-stroke-driver.ts`).
 *
 * Lives strictly under `src/components/nui-lab/**` (zero changes to `src/input/**` student gameplay!).
 * Implements:
 *  - B1.2 Onset confirmation backfill: buffers smoothed canvas points while `pinchOnset === "PENDING"`
 *    (zero premature StrokeStore mutations), and backfills all buffered points since frame #1 when
 *    onset transitions to `"CONFIRMED"` (`backfilledPoints` reported).
 *  - B1.3 Time-based release debounce (>= 150 ms) + retro-trim (separate from `HOLD_GRACE` for NO_HAND):
 *    buffers points during release debounce without losing continuity; if pinch returns before 150 ms
 *    (`releaseBridged`), flushes buffered points seamlessly into the same open stroke; if release is
 *    confirmed (`releaseConfirmed`), discards debounce-period points (retro-trim) and closes the stroke.
 *  - Short-blink grace (`HOLD_GRACE`) via loss-start + maxResumeGapMs + maxResumeJumpShare (C04/C05/C06).
 *  - Secondary-hand eraser radius sizing ONLY while primary owner is actively erasing (B07/C16).
 */
import { EraserSizer, type EraserControl } from "@/src/input/eraser";
import {
  evaluateGesture,
  indexTipNormalized,
  mapToCanvas,
  palmCenterNormalized,
  type CursorState,
  type HandPose,
} from "@/src/input/hand-gesture";
import type { HandCursor, HandFrame, PipelineDebug } from "@/src/input/hand-stroke-pipeline";
import { DRAWING_ONE_EURO, PointSmoother } from "@/src/input/smoothing";
import type { HandInputStatus, Landmark, StrokeStore } from "@/src/input/types";

interface Point {
  x: number;
  y: number;
}

const VOTE_WINDOW = 5;
const POSE_MIN_VOTES = 3;
const JUMP_SHARE_OF_WIDTH = 0.12;

export interface LabStrokeDriverOptions {
  store: StrokeStore;
  size(): { width: number; height: number };
  eraser: EraserControl;
  lossGraceMs: number;
  maxResumeGapMs: number;
  maxResumeJumpShare?: number;
  cursorSmoother?: {
    smooth(p: Point, nowMs: number): Point;
    reset(): void;
  };
}

export interface LabStrokeDriverInput {
  landmarks: Landmark[] | undefined;
  secondaryLandmarks?: Landmark[] | null;
  pose: HandPose;
  fingerCount: number;
  pinchRatio: number | null;
  /** Onset confirmation state from ActionIntentResolver (K3.1 / B1.2). */
  pinchOnset: "NONE" | "PENDING" | "CONFIRMED";
  /** Sole authorization flag to draw ink this frame (confirmed pinch). */
  allowDraw: boolean;
  /** True while holding an open stroke during >= 150 ms pinch release debounce (B1.3). */
  inReleaseDebounce: boolean;
  /** True on the frame a release debounce was bridged back into active pinch (B1.3). */
  releaseBridged: boolean;
  /** True on the frame release debounce completed (>= 150 ms) and open stroke must retro-trim & close. */
  releaseConfirmed: boolean;
  /** Sole authorization flag to erase ink this frame. */
  allowErase: boolean;
  /** True while holding an open stroke across a short NO_HAND detector blink (HOLD_GRACE). */
  inLossGrace: boolean;
  /** True when caller must close open ops fail-closed immediately. */
  shouldEndOpenOps: boolean;
  /** True when frame is stale (C15): StrokeStore MUST NOT mutate. */
  isStale?: boolean;
  nowMs: number;
}

export interface LabStrokeDriverResult extends HandFrame {
  backfilledPoints: number;
  retroTrimmedPoints: number;
  lastCursor: Point | null;
}

export class LabStrokeDriver {
  private readonly votes: HandPose[] = [];
  private stable: HandPose = "none";
  private debug: PipelineDebug = {
    raw: "none",
    stable: "none",
    fingerCount: 0,
    actionAllowed: true,
    drawing: false,
    drawStreak: 0,
    erasing: false,
    lastEraseHit: null,
    eraseFrames: 0,
  };
  private drawStreak = 0;
  private lastTrackedMs: number | null = null;
  private lossStartedMs: number | null = null;
  private lostFrames = 0;
  private cursorVisible = false;
  private lastCursorPt: Point | null = null;

  /** B1.2 pending onset points buffered while waiting for 2-frame / 300ms confirmation. */
  private pendingOnsetPts: Point[] = [];
  /** B1.3 release debounce points held off StrokeStore until bridged (flushed) or confirmed (retro-trimmed). */
  private releaseDebouncePts: Point[] = [];

  private readonly sizer = new EraserSizer();
  private readonly inkSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);
  private readonly palmSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);

  constructor(private readonly options: LabStrokeDriverOptions) {}

  debugState(): PipelineDebug {
    return { ...this.debug };
  }

  get lastCursorPosition(): Point | null {
    return this.lastCursorPt ? { ...this.lastCursorPt } : null;
  }

  get pendingOnsetCount(): number {
    return this.pendingOnsetPts.length;
  }

  get releaseDebounceBufferedCount(): number {
    return this.releaseDebouncePts.length;
  }

  reset(_nowMs: number): LabStrokeDriverResult {
    const changed = this.endOpenOps() || this.cursorVisible;
    this.votes.length = 0;
    this.stable = "none";
    this.lastTrackedMs = null;
    this.lossStartedMs = null;
    this.lostFrames = 0;
    this.cursorVisible = false;
    this.pendingOnsetPts = [];
    this.releaseDebouncePts = [];
    this.sizer.end();
    this.inkSmoother.reset();
    this.palmSmoother.reset();
    this.options.cursorSmoother?.reset();
    this.debug = {
      ...this.debug,
      raw: "none",
      stable: "none",
      fingerCount: 0,
      actionAllowed: false,
      drawing: false,
      drawStreak: 0,
      erasing: false,
    };
    const status: HandInputStatus = { kind: "tracking-lost" };
    return {
      pose: "none",
      status,
      cursor: null,
      changed,
      backfilledPoints: 0,
      retroTrimmedPoints: 0,
      lastCursor: this.lastCursorPt ? { ...this.lastCursorPt } : null,
    };
  }

  feed(auth: LabStrokeDriverInput): LabStrokeDriverResult {
    const { store } = this.options;
    const { nowMs } = auth;

    // C15: Stale frame must NEVER mutate StrokeStore.
    if (auth.isStale) {
      return {
        pose: this.stable,
        status: { kind: "ready" },
        cursor: null,
        changed: false,
        backfilledPoints: 0,
        retroTrimmedPoints: 0,
        lastCursor: this.lastCursorPt ? { ...this.lastCursorPt } : null,
      };
    }

    const lm = auth.landmarks;
    if (!lm || lm.length < 21) {
      this.sizer.end();
      this.lostFrames++;
      this.stable = this.vote("none");
      this.pendingOnsetPts = [];
      this.inkSmoother.reset();
      this.palmSmoother.reset();
      this.options.cursorSmoother?.reset();
      const inGrace = auth.inLossGrace && !auth.shouldEndOpenOps && this.computeInGrace(nowMs);
      let changed = this.cursorVisible;
      let retroTrimmedPoints = 0;
      if (inGrace && store.isErasing() && this.lastCursorPt) {
        this.debug.lastEraseHit = store.eraseAt(this.lastCursorPt, this.options.eraser.radiusCanvasPx());
        this.debug.eraseFrames++;
        changed = true;
      } else if (!inGrace) {
        retroTrimmedPoints = this.releaseDebouncePts.length;
        this.releaseDebouncePts = [];
        changed = this.endOpenOps() || changed;
      }
      this.cursorVisible = false;
      this.debug = {
        ...this.debug,
        raw: "none",
        stable: this.stable,
        fingerCount: 0,
        actionAllowed: false,
        drawing: false,
        erasing: store.isErasing(),
      };
      return {
        pose: this.stable,
        status: { kind: "tracking-lost" },
        cursor: null,
        changed,
        backfilledPoints: 0,
        retroTrimmedPoints,
        lastCursor: this.lastCursorPt ? { ...this.lastCursorPt } : null,
      };
    }

    if (auth.shouldEndOpenOps) {
      this.sizer.end();
      const retroTrimmedPoints = this.releaseDebouncePts.length;
      this.releaseDebouncePts = [];
      this.pendingOnsetPts = [];
      const changed = this.endOpenOps() || this.cursorVisible;
      this.stable = this.vote("none");
      this.inkSmoother.reset();
      this.palmSmoother.reset();
      this.options.cursorSmoother?.reset();
      this.cursorVisible = false;
      this.lossStartedMs = null;
      this.debug = {
        ...this.debug,
        raw: "none",
        stable: this.stable,
        fingerCount: 0,
        actionAllowed: false,
        drawing: false,
        drawStreak: 0,
        erasing: false,
      };
      return {
        pose: this.stable,
        status: { kind: "tracking-lost" },
        cursor: null,
        changed,
        backfilledPoints: 0,
        retroTrimmedPoints,
        lastCursor: this.lastCursorPt ? { ...this.lastCursorPt } : null,
      };
    }

    const resumed = this.lostFrames > 0;
    const gapSinceTracked = this.lastTrackedMs === null ? 0 : nowMs - this.lastTrackedMs;
    this.lostFrames = 0;
    this.lastTrackedMs = nowMs;
    this.lossStartedMs = null;

    this.stable = this.vote(auth.pose);

    const drawing = auth.allowDraw;
    const erasing = !drawing && !auth.inReleaseDebounce && auth.allowErase;

    let cursorPt: Point;
    let sizingCss: number | null = null;
    let backfilledPoints = 0;
    let retroTrimmedPoints = 0;

    if (erasing) {
      retroTrimmedPoints = this.releaseDebouncePts.length;
      this.releaseDebouncePts = [];
      this.pendingOnsetPts = [];
      if (store.hasActiveStroke()) store.endStroke();
      this.drawStreak = 0;
      this.inkSmoother.reset();
      const palmNorm = palmCenterNormalized(lm);
      cursorPt = this.options.cursorSmoother
        ? this.toCanvas(this.options.cursorSmoother.smooth(palmNorm, nowMs))
        : this.toCanvas(this.palmSmoother.smooth(palmNorm, nowMs));
      this.lastCursorPt = { x: cursorPt.x, y: cursorPt.y };
      const secondary = auth.secondaryLandmarks;
      if (secondary && secondary.length >= 21 && this.options.eraser.isFixed?.() !== true) {
        sizingCss = this.sizeFrom(secondary);
      } else {
        this.sizer.end();
      }
      this.debug.lastEraseHit = store.eraseAt(cursorPt, this.options.eraser.radiusCanvasPx());
      this.debug.eraseFrames++;
    } else {
      this.sizer.end();
      this.palmSmoother.reset();
      if (store.isErasing()) store.endErase();

      const tipNorm = indexTipNormalized(lm);
      const inkPt = this.toCanvas(this.inkSmoother.smooth(tipNorm, nowMs));
      cursorPt = this.options.cursorSmoother
        ? this.toCanvas(this.options.cursorSmoother.smooth(tipNorm, nowMs))
        : inkPt;
      this.lastCursorPt = { x: cursorPt.x, y: cursorPt.y };

      // Case 1: Active stroke exists -> check fail-closed gap/jump, release debounce, bridging, or normal addPoint.
      if (store.hasActiveStroke()) {
        if (drawing) {
          this.drawStreak++;
          const last = store.lastActivePoint();
          const gapExceeded = gapSinceTracked > this.options.maxResumeGapMs;
          const jumpExceeded =
            last !== null && Math.hypot(inkPt.x - last.x, inkPt.y - last.y) > this.jumpLimit();

          if (gapExceeded || (resumed && jumpExceeded)) {
            // Fail-closed on teleport or excessive gap: close old stroke without drawing across (C05/B04).
            retroTrimmedPoints = this.releaseDebouncePts.length;
            this.releaseDebouncePts = [];
            this.pendingOnsetPts = [inkPt];
            store.endStroke();
            this.drawStreak = 1;
          } else {
            // If returning from a < 150 ms release debounce, flush buffered debounce points seamlessly!
            if (auth.releaseBridged && this.releaseDebouncePts.length > 0) {
              for (const bp of this.releaseDebouncePts) {
                store.addPoint(bp);
              }
              this.releaseDebouncePts = [];
            } else if (this.releaseDebouncePts.length > 0) {
              this.releaseDebouncePts = [];
            }
            store.addPoint(inkPt);
          }
          this.pendingOnsetPts = [];
        } else if (auth.inReleaseDebounce) {
          // B1.3: Hold open stroke across < 150 ms release flicker; buffer points off-store so
          // they can be flushed on bridge OR discarded cleanly (retro-trimmed) if release confirms.
          this.releaseDebouncePts.push(inkPt);
          this.pendingOnsetPts = [];
        } else if (auth.releaseConfirmed || !auth.inLossGrace) {
          // B1.3: Release confirmed (>= 150 ms) or stall/non-draw close -> discard debounce points (retro-trim) & close!
          retroTrimmedPoints = this.releaseDebouncePts.length;
          this.releaseDebouncePts = [];
          this.pendingOnsetPts = auth.pinchOnset === "PENDING" ? [inkPt] : [];
          store.endStroke();
          this.drawStreak = 0;
        }
      } else {
        // Case 2: No active stroke yet -> B1.2 onset pending buffer & backfill on confirm!
        this.releaseDebouncePts = [];
        if (drawing && auth.pinchOnset === "CONFIRMED") {
          store.beginStroke();
          for (const pt of this.pendingOnsetPts) {
            store.addPoint(pt);
          }
          backfilledPoints = this.pendingOnsetPts.length;
          this.pendingOnsetPts = [];
          store.addPoint(inkPt);
          this.drawStreak = backfilledPoints + 1;
        } else if (auth.pinchOnset === "PENDING") {
          // Buffer point without mutating StrokeStore until onset confirms (2 frames or >= 300 ms).
          this.pendingOnsetPts.push(inkPt);
          this.drawStreak = 0;
        } else {
          this.pendingOnsetPts = [];
          this.drawStreak = 0;
        }
      }
    }

    const ratio = auth.pinchRatio ?? 1;
    const state: CursorState =
      drawing || (store.hasActiveStroke() && auth.inReleaseDebounce)
        ? "drawing"
        : ratio <= 0.5 || auth.pinchOnset === "PENDING"
          ? "near"
          : "hover";
    this.debug = {
      ...this.debug,
      raw: auth.pose,
      stable: this.stable,
      fingerCount: auth.fingerCount,
      actionAllowed: drawing || erasing,
      drawing: drawing || (store.hasActiveStroke() && auth.inReleaseDebounce),
      drawStreak: this.drawStreak,
      erasing,
    };
    const status: HandInputStatus = drawing ? { kind: "drawing" } : { kind: "ready" };
    this.cursorVisible = true;
    this.lastCursorPt = { x: cursorPt.x, y: cursorPt.y };
    const cursor: HandCursor = { x: cursorPt.x, y: cursorPt.y, state, erasing, sizingCss };
    return {
      pose: this.stable,
      status,
      cursor,
      changed: true,
      backfilledPoints,
      retroTrimmedPoints,
      lastCursor: { ...this.lastCursorPt },
    };
  }

  private computeInGrace(nowMs: number): boolean {
    const sinceTracked = this.lastTrackedMs === null ? Infinity : nowMs - this.lastTrackedMs;
    if (this.lossStartedMs === null) this.lossStartedMs = nowMs;
    const sinceLoss = nowMs - this.lossStartedMs;
    const graceLimitMs = this.options.store.isErasing() ? 300 : this.options.lossGraceMs;
    return (
      sinceLoss >= 0 &&
      sinceLoss <= graceLimitMs &&
      sinceTracked >= 0 &&
      sinceTracked <= this.options.maxResumeGapMs
    );
  }

  private endOpenOps(): boolean {
    const { store } = this.options;
    const hadStroke = store.hasActiveStroke();
    const hadErase = store.isErasing();
    if (hadStroke) store.endStroke();
    if (hadErase) store.endErase();
    this.drawStreak = 0;
    return hadStroke || hadErase;
  }

  private sizeFrom(hand: Landmark[]): number | null {
    const gesture = evaluateGesture(hand);
    if (gesture.state !== "tracking") {
      this.sizer.end();
      return null;
    }
    const eraser = this.options.eraser;
    eraser.setRadiusCss(this.sizer.update(gesture.pinchRatio, eraser.radiusCss()));
    return eraser.radiusCss();
  }

  private vote(raw: HandPose): HandPose {
    this.votes.push(raw);
    if (this.votes.length > VOTE_WINDOW) this.votes.shift();
    const counts = new Map<HandPose, number>();
    for (const pose of this.votes) counts.set(pose, (counts.get(pose) ?? 0) + 1);
    let best: HandPose = this.stable;
    let bestCount = 0;
    for (const [pose, count] of counts) {
      if (count > bestCount) {
        best = pose;
        bestCount = count;
      }
    }
    return bestCount >= POSE_MIN_VOTES ? best : this.stable;
  }

  private jumpLimit(): number {
    const share = this.options.maxResumeJumpShare ?? JUMP_SHARE_OF_WIDTH;
    return share * this.options.size().width;
  }

  private toCanvas(p: Point): Point {
    const { width, height } = this.options.size();
    return mapToCanvas(p, width, height);
  }
}
