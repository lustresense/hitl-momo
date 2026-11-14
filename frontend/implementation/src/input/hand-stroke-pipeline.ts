import type { HandInputStatus, Landmark, StrokeStore } from "./types";
import {
  PINCH_EXIT,
  classifyHandPose,
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
}

export class HandStrokePipeline {
  private readonly votes: HandPose[] = [];
  private stable: HandPose = "none";
  private drawVotes: boolean[] = [];
  private drawStreak = 0;
  private prevRaw: HandPose = "none";
  private lastTrackedMs: number | null = null;
  private lostFrames = 0;
  private cursorVisible = false;
  /** Index-tip position of the drawing hand on the last tracked frame; picks between two pinching hands. */
  private lastInk: Point | null = null;
  private readonly sizer = new EraserSizer();
  /** Ink and palm are smoothed separately, so switching between the two points never drags one into the other. */
  private readonly inkSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);
  private readonly palmSmoother = new PointSmoother(undefined, DRAWING_ONE_EURO);

  constructor(private readonly options: HandPipelineOptions) {}

  /** One processed frame with a single hand. `landmarks` undefined (or short) means no hand in this frame. */
  feed(landmarks: Landmark[] | undefined, nowMs: number): HandFrame {
    return this.feedHands(landmarks ? [landmarks] : undefined, nowMs);
  }

  /**
   * One processed camera frame with every visible hand (MediaPipe reports up to two).
   * The fist hand is the eraser; without a fist the pinching hand draws. A second hand never draws:
   * while a fist erases, the second hand's thumb-index gap sets the eraser radius.
   */
  feedHands(hands: Landmark[][] | undefined, nowMs: number): HandFrame {
    const visible = (hands ?? []).filter((h) => h && h.length >= 21);
    if (visible.length === 0) {
      this.sizer.end();
      return this.done(this.lost(nowMs), nowMs);
    }

    const pinchHeld = this.prevRaw === "pinch";
    const poses = visible.map((h) => classifyHandPose(h, { pinchHeld }));
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
    this.lostFrames = 0;
    this.cursorVisible = false;
    this.lastInk = null;
    this.sizer.end();
    this.inkSmoother.reset();
    this.palmSmoother.reset();
    this.options.onPose?.("none", nowMs);
    const status: HandInputStatus = { kind: "tracking-lost" };
    return { pose: "none", status, cursor: null, changed };
  }

  private done(frame: HandFrame, nowMs: number): HandFrame {
    this.options.onPose?.(this.stable, nowMs);
    return frame;
  }

  /** The fist hand; else a pinching hand (nearest the line being drawn when two pinch); else the first hand. */
  private pickPrimary(hands: Landmark[][], poses: HandPose[]): number {
    if (this.options.eraser.isFixed?.() === true) {
      const palm = poses.indexOf("open-palm");
      if (palm >= 0) return palm;
    } else {
      const fist = poses.indexOf("fist");
      if (fist >= 0) return fist;
    }
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

    this.prevRaw = raw;
    this.stable = this.vote(raw);
    const drawing = raw === "pinch";
    // With the Hapus tool on, any pose erases under the cursor except the commands: a thumbs-up
    // confirmation, undo or redo must never cut the drawing, and an open palm is no tool at all.
    const isErasePose = this.options.eraser.isFixed?.() === true
      ? this.stable === "open-palm"
      : (this.stable === "fist" || this.stable === "open-palm");
    const command =
      raw === "thumb-up" || raw === "two-fingers" || raw === "one-finger" || raw === "three-fingers" || raw === "split-palm";
    const erasing = (isErasePose && !drawing) || (store.eraserMode && !command);

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
      store.eraseAt(cursor, this.options.eraser.radiusCanvasPx());
    } else {
      this.palmSmoother.reset();
      if (store.isErasing()) store.endErase();
      this.updateStroke(drawing, ink, resumed);
    }

    const gesture = evaluateGesture(lm);
    const ratio = gesture.state === "tracking" ? gesture.pinchRatio : 1;
    const state: CursorState = drawing ? "drawing" : ratio < PINCH_EXIT ? "near" : "hover";
    const status: HandInputStatus = drawing ? { kind: "drawing" } : { kind: "ready" };
    this.cursorVisible = true;
    return {
      pose: this.stable,
      status,
      cursor: { x: cursor.x, y: cursor.y, state, erasing },
      changed: true,
    };
  }

  private lost(nowMs: number): HandFrame {
    this.lostFrames++;
    this.prevRaw = "none";
    this.stable = this.vote("none");
    this.inkSmoother.reset();
    this.palmSmoother.reset();
    const sinceTracked = this.lastTrackedMs === null ? Infinity : nowMs - this.lastTrackedMs;
    const inGrace = sinceTracked >= 0 && sinceTracked <= LOSS_GRACE_MS;
    let changed = this.cursorVisible;
    if (!inGrace) changed = this.endOpenOps() || changed;
    this.cursorVisible = false;
    const status: HandInputStatus = { kind: "tracking-lost" };
    return { pose: this.stable, status, cursor: null, changed };
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
    return JUMP_SHARE_OF_WIDTH * this.options.size().width;
  }

  private toCanvas(p: { x: number; y: number }): Point {
    const { width, height } = this.options.size();
    return mapToCanvas(p, width, height);
  }
}
