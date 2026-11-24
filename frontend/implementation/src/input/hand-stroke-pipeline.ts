import type { HandInputStatus, Landmark, StrokeStore } from "./types";
import {
  DEFAULT_LAB_ASPECT,
  LAB_PINCH_EXIT,
  PINCH_EXIT,
  classifyHandPose,
  countExtendedFingers,
  evaluateGesture,
  indexTipNormalized,
  mapToCanvas,
  palmCenterNormalized,
  type CursorState,
  type HandPose,
} from "./hand-gesture";
import { EraserSizer, type EraserControl } from "./eraser";
import { DRAWING_ONE_EURO, PointSmoother } from "./smoothing";

/**
 * Per-frame hand pipeline for drawing (no DOM, no camera). Raw landmark frames go in; a stable pose,
 * stroke and eraser actions on a StrokeStore, and a cursor come out. The live MediaPipe driver and the
 * test hook both call it, so what the tests exercise is the path the app ships.
 */

/** Pose votes: the last five frames; a pose needs three of them to become the stable pose. */
const VOTE_WINDOW = 5;
const POSE_MIN_VOTES = 3;
/** A stroke starts after this many pinch frames in a row, so one noisy frame is not ink. */
const DRAW_START_FRAMES = 2;
/** A stroke ends once this many of the last five frames show no pinch, so one dropped frame keeps the line. */
const DRAW_RELEASE_FRAMES = 3;
/** A hand lost for longer than this closes the open line; shorter drops keep it. */
export const LOSS_GRACE_MS = 150;
/** After a loss, a point farther than this share of the canvas width starts a new line instead of a long jump. */
const JUMP_SHARE_OF_WIDTH = 0.12;

interface Point {
  x: number;
  y: number;
}

/** Where the hand's pointer is this frame, and what it does there. */
export interface HandCursor {
  x: number;
  y: number;
  state: CursorState;
  /** The eraser acts at this point this frame (a fist, or the Hapus tool). The surface draws the eraser ring. */
  erasing?: boolean;
  /** Two-hand sizing: the radius (CSS px) the second hand is setting this frame; null when it is not. */
  sizingCss?: number | null;
}

export interface HandFrame {
  /** Stable (voted) pose of the drawing hand: what the commands and the eraser follow. */
  pose: HandPose;
  status: HandInputStatus;
  /** Cursor in canvas px, or null while no hand is tracked. */
  cursor: HandCursor | null;
  /** True when the store or the cursor changed and the canvas must be redrawn. */
  changed: boolean;
}

export interface HandPipelineOptions {
  store: StrokeStore;
  /** Canvas size in px, read every frame so resizes apply at once. */
  size(): { width: number; height: number };
  /** Eraser radius shared with the surface: the fist, the Hapus tool and the two-hand sizer all use it. */
  eraser: EraserControl;
  onPose?(pose: HandPose, nowMs: number): void;
  /** Owner NUI Lab only: opt-in landmark rules. Default game behavior stays unchanged. */
  experimentalRobust?: boolean;
  /** Owner NUI Lab only: video width / height, read every frame. Only used with experimentalRobust. */
  aspect?(): number;
  /** Owner NUI Lab only: prevent an action until the new hand released that gesture. */
  canPerformAction?(rawPose: HandPose, fingerCount: number): boolean;
  /** Owner NUI Lab only: configurable grace window (ms) for brief detector blinks. Default: LOSS_GRACE_MS (150 ms). */
  lossGraceMs?: number;
  /**
   * Owner NUI Lab only: anchor for measuring loss grace.
   * Default `"last-tracked"` keeps legacy student gameplay identical; `"loss-start"` measures from the first lost frame.
   */
  lossGraceAnchor?: "last-tracked" | "loss-start";
  /** Owner NUI Lab only: hard upper bound (ms) on total unobserved gap (`nowMs - lastTrackedMs`) when resuming a stroke. */
  maxResumeGapMs?: number;
  /** Owner NUI Lab only: max jump share of canvas width allowed to resume a stroke after a blink. Default: 0.12. */
  maxResumeJumpShare?: number;
  /** Owner NUI Lab only: optional separate cursor smoother hook (C15) so cursor smoothing stays independent from ink. */
  cursorSmoother?: {
    smooth(p: { x: number; y: number }, nowMs: number): { x: number; y: number };
    reset(): void;
  };
}

/**
 * Owner NUI Lab only (Contract K3 / C02): external single-authority input from `ActionIntentResolver`.
 * Guarantees `HandStrokePipeline` NEVER mutates `StrokeStore` when the resolver rejects an action.
 */
export interface ResolvedHandAuthority {
  /** Primary owner landmarks, or undefined when missing/untracked. */
  landmarks: Landmark[] | undefined;
  /** Optional non-crossing secondary hand for eraser radius sizing while owner erases (B07/C16); never draws. */
  secondaryLandmarks?: Landmark[] | null;
  /** Canonical pose from single PoseSource. */
  pose: HandPose;
  /** Canonical finger count (0..5) from single PoseSource. */
  fingerCount: number;
  /** Canonical pinch ratio from single PinchSource (drives cursor near vs hover visual state only). */
  pinchRatio: number | null;
  /** Sole authorization to draw ink this frame. */
  allowDraw: boolean;
  /** Sole authorization to erase ink this frame. */
  allowErase: boolean;
  /** True while holding an open stroke across a short blink without mutating StrokeStore. */
  inLossGrace: boolean;
  /** True when the resolver requires immediate fail-closed closure of open stroke/erase ops. */
  shouldEndOpenOps: boolean;
  /** True when the frame is stale (C15): StrokeStore MUST NOT mutate. */
  isStale?: boolean;
  /** Frame timestamp in ms. */
  nowMs: number;
}

/** What the last tracked frame decided, for the owner-only lab diagnostics. Not used by any game screen. */
export interface PipelineDebug {
  raw: HandPose;
  stable: HandPose;
  fingerCount: number;
  actionAllowed: boolean;
  drawing: boolean;
  drawStreak: number;
  erasing: boolean;
  /** Result of the last eraseAt call: true = some ink was cut. null until the first erase frame. */
  lastEraseHit: boolean | null;
  eraseFrames: number;
}

export class HandStrokePipeline {
  private readonly votes: HandPose[] = [];
  private debug: PipelineDebug = { raw: "none", stable: "none", fingerCount: 0, actionAllowed: true, drawing: false, drawStreak: 0, erasing: false, lastEraseHit: null, eraseFrames: 0 };
  private stable: HandPose = "none";
  private drawVotes: boolean[] = [];
  private drawStreak = 0;
  private prevRaw: HandPose = "none";
  private lastTrackedMs: number | null = null;
  private lossStartedMs: number | null = null;
  private lostFrames = 0;
  private cursorVisible = false;
  /** Index-tip position of the drawing hand on the last tracked frame; picks between two pinching hands. */
  private lastInk: Point | null = null;
  private readonly sizer = new EraserSizer();
  /** Ink and palm are smoothed separately, so switching between the two points never drags one into the other. */
  private readonly inkSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);
  private readonly palmSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);

  constructor(private readonly options: HandPipelineOptions) {}

  /** Lab diagnostics of the last tracked frame (a copy). */
  debugState(): PipelineDebug {
    return { ...this.debug };
  }

  private aspect(): number {
    const a = this.options.aspect?.();
    return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : DEFAULT_LAB_ASPECT;
  }

  /** Finger count under the rule set in force: the lab's robust thumb + aspect, or the game's legacy rule. */
  private fingers(lm: Landmark[]): number {
    const robust = this.options.experimentalRobust === true;
    return countExtendedFingers(lm, { robustThumb: robust, aspect: robust ? this.aspect() : undefined });
  }

  /** Switch lab experiment without changing the game-wide classifier. */
  setExperimentalRobust(enabled: boolean, nowMs: number): void {
    this.options.experimentalRobust = enabled;
    this.reset(nowMs);
  }

  /** One processed frame with a single hand. `landmarks` undefined (or short) means no hand in this frame. */
  feed(landmarks: Landmark[] | undefined, nowMs: number): HandFrame {
    return this.feedHands(landmarks ? [landmarks] : undefined, nowMs);
  }

  /**
   * One processed camera frame with every visible hand (MediaPipe reports up to two).
   * A hand with five extended fingers is the eraser; without one a pinching hand draws.
   * A second hand must not hijack ink or trigger a fist-erasure.
   */
  feedHands(hands: Landmark[][] | undefined, nowMs: number): HandFrame {
    const visible = (hands ?? []).filter((h) => h && h.length >= 21);
    if (visible.length === 0) {
      this.sizer.end();
      return this.done(this.lost(nowMs), nowMs);
    }

    const pinchHeld = this.prevRaw === "pinch";
    const robust = this.options.experimentalRobust === true;
    const poses = visible.map((h) => classifyHandPose(h, { pinchHeld, experimentalRobust: robust, aspect: robust ? this.aspect() : undefined }));
    const primary = this.pickPrimary(visible, poses);
    const frame = this.tracked(visible[primary]!, poses[primary]!, nowMs);

    const other = visible.find((_, i) => i !== primary);
    let sizingCss: number | null = null;
    // A fixed eraser (tutorial card 3) does not take a size from the second hand, so no size badge either.
    if (other && this.stable === "fist" && this.options.eraser.isFixed?.() !== true) sizingCss = this.sizeFrom(other);
    else this.sizer.end();
    if (frame.cursor) frame.cursor.sizingCss = sizingCss;
    return this.done(frame, nowMs);
  }

  /** Ends everything at once (hidden tab, stop, tracker error): no grace period. */
  reset(nowMs: number): HandFrame {
    const changed = this.endOpenOps() || this.cursorVisible;
    this.votes.length = 0;
    this.stable = "none";
    this.prevRaw = "none";
    this.lastTrackedMs = null;
    this.lossStartedMs = null;
    this.lostFrames = 0;
    this.cursorVisible = false;
    this.lastInk = null;
    this.sizer.end();
    this.inkSmoother.reset();
    this.palmSmoother.reset();
    this.options.cursorSmoother?.reset();
    this.options.onPose?.("none", nowMs);
    const status: HandInputStatus = { kind: "tracking-lost" };
    return { pose: "none", status, cursor: null, changed };
  }

  /**
   * Owner NUI Lab only (Contract K3 / C02): consumes canonical decisions from `ActionIntentResolver`.
   * Never mutates `StrokeStore` when the resolver rejects an action or marks a frame stale.
   */
  feedResolved(auth: ResolvedHandAuthority): HandFrame {
    const { store } = this.options;
    const { nowMs } = auth;

    if (auth.isStale) {
      return this.done(
        {
          pose: this.stable,
          status: { kind: "ready" },
          cursor: null,
          changed: false,
        },
        nowMs,
      );
    }

    const lm = auth.landmarks;
    if (!lm || lm.length < 21) {
      this.sizer.end();
      const frame = this.lostResolved(nowMs, auth.inLossGrace && !auth.shouldEndOpenOps);
      return this.done(frame, nowMs);
    }

    if (auth.shouldEndOpenOps) {
      this.sizer.end();
      const changed = this.endOpenOps() || this.cursorVisible;
      this.prevRaw = "none";
      this.stable = this.vote("none");
      this.inkSmoother.reset();
      this.palmSmoother.reset();
      this.options.cursorSmoother?.reset();
      this.cursorVisible = false;
      this.lossStartedMs = null;
      return this.done(
        { pose: this.stable, status: { kind: "tracking-lost" }, cursor: null, changed },
        nowMs,
      );
    }

    const resumed = this.lostFrames > 0;
    const gapSinceTracked = this.lastTrackedMs === null ? 0 : nowMs - this.lastTrackedMs;
    this.lostFrames = 0;
    this.lastTrackedMs = nowMs;
    this.lossStartedMs = null;

    this.prevRaw = auth.pose;
    this.stable = this.vote(auth.pose);

    const drawing = auth.allowDraw;
    const erasing = !drawing && auth.allowErase;

    const tipNorm = indexTipNormalized(lm);
    const inkPt = this.toCanvas(this.inkSmoother.smooth(tipNorm, nowMs));
    this.lastInk = inkPt;
    let cursorPt: Point = this.options.cursorSmoother
      ? this.toCanvas(this.options.cursorSmoother.smooth(tipNorm, nowMs))
      : inkPt;
    let sizingCss: number | null = null;

    if (erasing) {
      if (store.hasActiveStroke()) store.endStroke();
      this.drawVotes = [];
      this.drawStreak = 0;
      cursorPt = this.toCanvas(this.palmSmoother.smooth(palmCenterNormalized(lm), nowMs));
      // Secondary-hand eraser radius sizing ONLY while primary owner is actively erasing (B07/C16).
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
      this.updateStrokeResolved(drawing, inkPt, resumed, gapSinceTracked);
    }

    const ratio = auth.pinchRatio ?? 1;
    const state: CursorState = drawing ? "drawing" : ratio <= 0.5 ? "near" : "hover";
    this.debug = {
      ...this.debug,
      raw: auth.pose,
      stable: this.stable,
      fingerCount: auth.fingerCount,
      actionAllowed: drawing || erasing,
      drawing,
      drawStreak: this.drawStreak,
      erasing,
    };
    const status: HandInputStatus = drawing ? { kind: "drawing" } : { kind: "ready" };
    this.cursorVisible = true;
    return this.done(
      {
        pose: this.stable,
        status,
        cursor: { x: cursorPt.x, y: cursorPt.y, state, erasing, sizingCss },
        changed: true,
      },
      nowMs,
    );
  }

  private done(frame: HandFrame, nowMs: number): HandFrame {
    this.options.onPose?.(this.stable, nowMs);
    return frame;
  }

  /** The fist hand; else a pinching hand (nearest the line being drawn when two pinch); else the first hand. */
  private pickPrimary(hands: Landmark[][], poses: HandPose[]): number {
    // Five spread fingers are the eraser. A closed fist never steals the primary input.
    const fivePalm = poses.findIndex((p,i) =>
      (p === "open-palm" || p === "split-palm") && this.fingers(hands[i]!) === 5);
    if (fivePalm >= 0) return fivePalm;
    const pinching = poses.flatMap((p, i) => (p === "pinch" ? [i] : []));
    if (pinching.length <= 1) return pinching[0] ?? 0;
    if (!this.lastInk) return pinching[0]!;
    const near = this.lastInk;
    let best = pinching[0]!;
    let bestDistance = Infinity;
    for (const i of pinching) {
      const tip = this.toCanvas(indexTipNormalized(hands[i]!));
      const distance = Math.hypot(tip.x - near.x, tip.y - near.y);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * The second hand's gap moves the eraser radius (CSS px). A hand without a readable gap ends the session,
   * and the radius holds where it is until a new session re-anchors on it.
   */
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

  private tracked(lm: Landmark[], raw: HandPose, nowMs: number): HandFrame {
    const { store } = this.options;
    const resumed = this.lostFrames > 0;
    this.lostFrames = 0;
    this.lastTrackedMs = nowMs;
    this.lossStartedMs = null;

    this.prevRaw = raw;
    this.stable = this.vote(raw);
    const fingerCount = this.fingers(lm);
    const actionAllowed = this.options.canPerformAction?.(raw, fingerCount) ?? true;
    const drawing = raw === "pinch" && actionAllowed;
    // With the Hapus tool on, any pose erases under the cursor except the commands: a thumbs-up
    // confirmation, undo or redo must never cut the drawing, and an open palm is no tool at all.
    // Only a full five-finger palm erases, regardless of the old game/tutorial distinction.
    const isErasePose =
      fingerCount === 5 &&
      (this.stable === "open-palm" || this.stable === "split-palm");
    const command =
      raw === "thumb-up" || raw === "two-fingers" || raw === "one-finger" || raw === "three-fingers" || raw === "split-palm";
    // An explicit eraser tool may erase on pinch, but a fist is never an erase backdoor.
    const erasing = actionAllowed && ((isErasePose && !drawing)
      || (store.eraserMode && !command && raw !== "fist"));

    const ink = this.toCanvas(this.inkSmoother.smooth(indexTipNormalized(lm), nowMs));
    this.lastInk = ink;
    let cursor: Point = ink;
    if (erasing) {
      // A fist/palm (or the Hapus tool) never leaves a line open.
      if (store.hasActiveStroke()) store.endStroke();
      this.drawVotes = [];
      this.drawStreak = 0;
      if (isErasePose) {
        cursor = this.toCanvas(this.palmSmoother.smooth(palmCenterNormalized(lm), nowMs));
      }
      this.debug.lastEraseHit = store.eraseAt(cursor, this.options.eraser.radiusCanvasPx());
      this.debug.eraseFrames++;
    } else {
      this.palmSmoother.reset();
      if (store.isErasing()) store.endErase();
      this.updateStroke(drawing, ink, resumed);
    }

    const robustGeometry = this.options.experimentalRobust === true;
    const gesture = evaluateGesture(lm, robustGeometry ? this.aspect() : 1);
    const ratio = gesture.state === "tracking" ? gesture.pinchRatio : 1;
    const state: CursorState = drawing ? "drawing" : ratio < (robustGeometry ? LAB_PINCH_EXIT : PINCH_EXIT) ? "near" : "hover";
    this.debug = {
      ...this.debug,
      raw,
      stable: this.stable,
      fingerCount,
      actionAllowed,
      drawing,
      drawStreak: this.drawStreak,
      erasing,
    };
    const status: HandInputStatus = drawing ? { kind: "drawing" } : { kind: "ready" };
    this.cursorVisible = true;
    return {
      pose: this.stable,
      status,
      cursor: { x: cursor.x, y: cursor.y, state, erasing },
      changed: true,
    };
  }

  private computeInGrace(nowMs: number): boolean {
    const graceMs = this.options.lossGraceMs ?? LOSS_GRACE_MS;
    const sinceTracked = this.lastTrackedMs === null ? Infinity : nowMs - this.lastTrackedMs;
    if (this.options.lossGraceAnchor === "loss-start") {
      if (this.lossStartedMs === null) this.lossStartedMs = nowMs;
      const sinceLoss = nowMs - this.lossStartedMs;
      const withinMaxGap =
        this.options.maxResumeGapMs === undefined ||
        (sinceTracked >= 0 && sinceTracked <= this.options.maxResumeGapMs);
      return sinceLoss >= 0 && sinceLoss <= graceMs && withinMaxGap;
    }
    return sinceTracked >= 0 && sinceTracked <= graceMs;
  }

  private lost(nowMs: number): HandFrame {
    this.lostFrames++;
    this.prevRaw = "none";
    this.stable = this.vote("none");
    this.inkSmoother.reset();
    this.palmSmoother.reset();
    this.options.cursorSmoother?.reset();
    const inGrace = this.computeInGrace(nowMs);
    let changed = this.cursorVisible;
    if (!inGrace) changed = this.endOpenOps() || changed;
    this.cursorVisible = false;
    const status: HandInputStatus = { kind: "tracking-lost" };
    return { pose: this.stable, status, cursor: null, changed };
  }

  private lostResolved(nowMs: number, allowGrace: boolean): HandFrame {
    this.lostFrames++;
    this.prevRaw = "none";
    this.stable = this.vote("none");
    this.inkSmoother.reset();
    this.palmSmoother.reset();
    this.options.cursorSmoother?.reset();
    const inGrace = allowGrace && this.computeInGrace(nowMs);
    let changed = this.cursorVisible;
    if (!inGrace) {
      changed = this.endOpenOps() || changed;
    }
    this.cursorVisible = false;
    const status: HandInputStatus = { kind: "tracking-lost" };
    return { pose: this.stable, status, cursor: null, changed };
  }

  private updateStrokeResolved(drawing: boolean, pt: Point, resumed: boolean, gapSinceTracked: number): void {
    const { store } = this.options;
    this.drawStreak = drawing ? this.drawStreak + 1 : 0;
    this.drawVotes.push(drawing);
    if (this.drawVotes.length > VOTE_WINDOW) this.drawVotes.shift();

    if (!store.hasActiveStroke()) {
      if (drawing && this.drawStreak >= DRAW_START_FRAMES) {
        store.beginStroke();
        store.addPoint(pt);
        this.drawVotes = new Array<boolean>(DRAW_START_FRAMES).fill(true);
      }
      return;
    }

    if (drawing) {
      const last = store.lastActivePoint();
      const gapExceeded =
        this.options.maxResumeGapMs !== undefined && gapSinceTracked > this.options.maxResumeGapMs;
      const jumpExceeded =
        last !== null && Math.hypot(pt.x - last.x, pt.y - last.y) > this.jumpLimit();
      if (gapExceeded || (resumed && jumpExceeded)) {
        // Fail-closed on teleport or excessive gap: close the old stroke without drawing across,
        // and require fresh onset confirmation before starting a new stroke (C05/B04).
        store.endStroke();
        this.drawVotes = [true];
        this.drawStreak = 1;
        return;
      }
      store.addPoint(pt);
      return;
    }

    const releaseVotes = this.drawVotes.filter((v) => !v).length;
    if (releaseVotes >= DRAW_RELEASE_FRAMES) {
      store.endStroke();
      this.drawVotes = [];
    }
  }

  /** Closes an open stroke and an open eraser pass; true when either was open. */
  private endOpenOps(): boolean {
    const { store } = this.options;
    const hadStroke = store.hasActiveStroke();
    const hadErase = store.isErasing();
    if (hadStroke) store.endStroke();
    if (hadErase) store.endErase();
    this.drawVotes = [];
    this.drawStreak = 0;
    return hadStroke || hadErase;
  }

  private updateStroke(drawing: boolean, pt: Point, resumed: boolean): void {
    const { store } = this.options;
    this.drawStreak = drawing ? this.drawStreak + 1 : 0;
    this.drawVotes.push(drawing);
    if (this.drawVotes.length > VOTE_WINDOW) this.drawVotes.shift();

    if (!store.hasActiveStroke()) {
      if (drawing && this.drawStreak >= DRAW_START_FRAMES) {
        store.beginStroke();
        store.addPoint(pt);
        // The window now describes this stroke only: its opening frames are all pinch frames.
        this.drawVotes = new Array<boolean>(DRAW_START_FRAMES).fill(true);
      }
      return;
    }

    if (drawing) {
      const last = store.lastActivePoint();
      if (resumed && last && Math.hypot(pt.x - last.x, pt.y - last.y) > this.jumpLimit()) {
        // Back after a loss and far from where the line stopped: lift the pen instead of drawing across.
        store.endStroke();
        store.beginStroke();
      }
      store.addPoint(pt);
      return;
    }

    const releaseVotes = this.drawVotes.filter((v) => !v).length;
    if (releaseVotes >= DRAW_RELEASE_FRAMES) {
      store.endStroke();
      this.drawVotes = [];
    }
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

  private toCanvas(p: { x: number; y: number }): Point {
    const { width, height } = this.options.size();
    return mapToCanvas(p, width, height);
  }
}
