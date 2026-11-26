import { POINTER_OFFSCREEN } from "../core/constants";
import type { InputSample, Point, SourceKind } from "../core/types";
import type { HandDetector, HandFrame, HandLandmark } from "./hand-detector";
import type { InputSource } from "./input-source";
import {
  CLICK_ROLLBACK_MS, HOVER_LOOKBACK_MS, POINTER_LANDMARK_INDEX,
  chase, computePalmCenter, createLossHold, createNibFilter, createOwnerLock, createPinchDetector,
  createPointerFilter, createRollbackBuffer, isOpenHand, mapControlBox, pinchRatio,
  type HandCandidate, type HoldState, type Pt, type TimedPt, type Viewport,
} from "./hand";

const HAND_MATCH_MAX_DIST = 0.35;
const DEFAULT_ASPECT = 16 / 9;

export interface HandSourceStatus {
  frozen: boolean;
  ownerActive: boolean;
  readonly needsOpenPose: boolean;
  holdState: HoldState;
  raw: Point | null;
  filtered: Point | null;
  display: Point | null;
  pinch: boolean;
  pinchStrength: number;
  error: string | null;
}

export interface HandSourceOptions {
  detector: HandDetector;
  getViewport?: () => Viewport;
  getHoverId?: (x: number, y: number) => string | null;
  onError?: (err: unknown) => void;
}

interface TrackedHand { id: number; x: number; y: number; t: number }
interface MatchedHand { id: number; open: boolean; lm: readonly HandLandmark[] }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const defaultViewport = (): Viewport =>
  typeof window === "undefined"
    ? { w: 1280, h: 720 }
    : { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };

/**
 * Merakit resep R1 (`owner-lock`, `pointer-filter`, `pinch-detector`, `rollback-buffer`,
 * `loss-hold`, `nib-filter`) di atas `HandDetector`. Tidak memuat model sendiri.
 */
export class HandSource implements InputSource {
  readonly kind: SourceKind = "hand";

  private readonly detector: HandDetector;
  private readonly getViewport: () => Viewport;
  private readonly getHoverId?: (x: number, y: number) => string | null;
  private readonly onError?: (err: unknown) => void;
  private readonly listeners = new Set<(s: InputSample) => void>();

  private readonly ownerLock = createOwnerLock();
  private readonly pointerFilter = createPointerFilter();
  private readonly pinchDetector = createPinchDetector();
  private readonly rollbackBuffer = createRollbackBuffer();
  private readonly nibFilter = createNibFilter();
  private lossHold = createLossHold();

  private running = false;
  private unsubDetector: (() => void) | null = null;
  private tracked: TrackedHand[] = [];
  private nextTrackId = 1;
  private lastFrameT: number | null = null;
  private lastDisplayT: number | null = null;

  private frozen = false;
  private ownerActive = false;
  private needsOpenPose = false;
  private holdState: HoldState = "idle";
  private raw: Point | null = null;
  private filtered: Point | null = null;
  private display: Point | null = null;
  private nib: Point | null = null;
  private nibOffset: Point | null = null;
  private pinch = false;
  private pinchStrength = 0;
  private error: string | null = null;

  constructor(options: HandSourceOptions) {
    this.detector = options.detector;
    this.getViewport = options.getViewport ?? defaultViewport;
    this.getHoverId = options.getHoverId;
    this.onError = options.onError;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.error = null;
    this.unsubDetector = this.detector.subscribe((frame) => this.handleFrame(frame));
    void this.detector.start().catch((err: unknown) => {
      if (!this.running) return;
      this.error = err instanceof Error ? err.message : String(err);
      this.failClosed();
      this.onError?.(err);
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.unsubDetector?.();
    this.unsubDetector = null;
    try { this.detector.stop(); } catch { /* best effort */ }
    this.failClosed();
  }

  subscribe(cb: (s: InputSample) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  getStatus(): HandSourceStatus {
    return {
      frozen: this.frozen,
      ownerActive: this.ownerActive,
      needsOpenPose: this.needsOpenPose,
      holdState: this.holdState,
      raw: this.raw ? { ...this.raw } : null,
      filtered: this.filtered ? { ...this.filtered } : null,
      display: this.display ? { ...this.display } : null,
      pinch: this.pinch,
      pinchStrength: this.pinchStrength,
      error: this.error,
    };
  }

  /** Mengejar titik terfilter di loop rAF 60fps tanpa ekstrapolasi (tau = 35 ms). */
  advanceDisplay(nowMs: number): Point | null {
    if (!this.ownerActive || this.frozen || !this.filtered || !this.display) return null;
    const dt = this.lastDisplayT === null ? 0 : Math.max(0, nowMs - this.lastDisplayT);
    if (dt <= 0) return this.display;
    this.lastDisplayT = nowMs;
    this.display = chase(this.display, this.filtered, dt);
    return this.display;
  }

  beginNib(tMs: number): TimedPt[] { return this.nibFilter.begin(tMs); }
  endNib(stroke: ReadonlyArray<TimedPt>, tMs: number): TimedPt[] { return this.nibFilter.end(stroke, tMs); }
  mostHovered(tEnd: number, spanMs?: number): string | null { return this.rollbackBuffer.mostHovered(tEnd, spanMs); }

  private handleFrame(frame: HandFrame): void {
    if (!this.running) return;
    const unique = this.lastFrameT === null || frame.t > this.lastFrameT;
    this.lastFrameT = frame.t;

    const tGapMs = this.lossHold.tGap();
    const aspect = frame.videoWidth > 0 && frame.videoHeight > 0 ? frame.videoWidth / frame.videoHeight : DEFAULT_ASPECT;
    const matched = this.matchHands(frame.hands, frame.t, tGapMs, aspect);
    const candidates: HandCandidate[] = matched.map((m) => ({ id: m.id, open: m.open }));
    const ownerId = this.ownerLock.update(frame.t, candidates, tGapMs);
    const owner = ownerId === null ? undefined : matched.find((m) => m.id === ownerId);

    const hold = this.lossHold.update(frame.t, owner !== undefined, owner?.open ?? false);
    this.holdState = hold.state;

    if (hold.expired) {
      const lastPos = this.display ?? { x: POINTER_OFFSCREEN, y: POINTER_OFFSCREEN };
      this.resetPipeline();
      this.emit({ t: frame.t, x: lastPos.x, y: lastPos.y, inFrame: false, pinch: false, pinchStrength: 0, source: "hand" });
      return;
    }

    if (hold.state === "held") {
      this.frozen = true;
      this.ownerActive = true;
      this.needsOpenPose = true;
      if (this.display) {
        this.emit({
          t: frame.t, x: this.display.x, y: this.display.y, inFrame: true,
          pinch: this.pinch, pinchStrength: this.pinchStrength,
          nib: this.nib ? { ...this.nib } : undefined, source: "hand",
        });
      }
      return;
    }

    if (hold.state !== "tracking" || !owner) {
      this.frozen = false;
      this.ownerActive = false;
      this.needsOpenPose = matched.length > 0;
      return;
    }

    this.processOwner(owner.lm, frame.t, unique, aspect);
  }

  private processOwner(lm: readonly HandLandmark[], t: number, unique: boolean, aspect: number): void {
    const palm = computePalmCenter(lm);
    if (!palm) return;
    const mcp5 = lm[POINTER_LANDMARK_INDEX] ?? palm;

    const r = pinchRatio(lm, aspect) ?? 1;
    const pinchRes = this.pinchDetector.update(r, t, unique);
    const vp = this.getViewport();
    const filtered = this.pointerFilter.update(palm, t, pinchRes.pinch, aspect, vp);
    const dt = this.lastDisplayT === null ? 0 : Math.max(0, t - this.lastDisplayT);
    const display = this.display ? chase(this.display, filtered, dt) : { x: filtered.x, y: filtered.y };

    this.lastDisplayT = t;
    this.frozen = false;
    this.ownerActive = true;
    this.needsOpenPose = false;
    this.raw = { x: clamp01(1 - palm.x), y: clamp01(palm.y) };
    this.filtered = filtered;
    this.display = display;
    this.pinch = pinchRes.pinch;
    this.pinchStrength = pinchRes.strength;

    const hoverId = this.getHoverId?.(display.x, display.y) ?? null;
    this.rollbackBuffer.push({ x: display.x, y: display.y, t, hoverId });

    const mcp5Px = mapControlBox({ x: 1 - mcp5.x, y: mcp5.y }, vp);
    if (!pinchRes.pinch || !this.nibOffset) this.nibOffset = { x: display.x - mcp5Px.x, y: display.y - mcp5Px.y };
    const nibTimed = this.nibFilter.update(
      pinchRes.pinch ? { x: mcp5Px.x + this.nibOffset.x, y: mcp5Px.y + this.nibOffset.y } : display,
      t,
    );
    this.nib = { x: nibTimed.x, y: nibTimed.y };

    const clickPoint =
      pinchRes.event === "on"
        ? (this.rollbackBuffer.pointAt(t - CLICK_ROLLBACK_MS) ?? { x: display.x, y: display.y })
        : undefined;
    const preferredHoverId =
      pinchRes.event === "on"
        ? (this.rollbackBuffer.mostHovered(t, HOVER_LOOKBACK_MS) ?? undefined)
        : undefined;

    this.emit({
      t, x: display.x, y: display.y, inFrame: true,
      pinch: pinchRes.pinch, pinchStrength: pinchRes.strength,
      nib: { ...this.nib }, clickPoint, preferredHoverId, source: "hand",
    });
  }

  private matchHands(hands: readonly (readonly HandLandmark[])[], t: number, tGapMs: number, aspect: number): MatchedHand[] {
    this.tracked = this.tracked.filter((tr) => t - tr.t <= tGapMs);
    const used = new Set<number>();
    const out: MatchedHand[] = [];
    for (const lm of hands) {
      const a: Pt | null = computePalmCenter(lm);
      if (!a) continue;
      let best: TrackedHand | null = null;
      let bestDist = HAND_MATCH_MAX_DIST;
      for (const tr of this.tracked) {
        if (used.has(tr.id)) continue;
        const d = Math.hypot(a.x - tr.x, a.y - tr.y);
        if (d < bestDist) { bestDist = d; best = tr; }
      }
      let id: number;
      if (best) { id = best.id; best.x = a.x; best.y = a.y; best.t = t; }
      else { id = this.nextTrackId++; this.tracked.push({ id, x: a.x, y: a.y, t }); }
      used.add(id);
      out.push({ id, open: isOpenHand(lm, aspect), lm });
    }
    return out;
  }

  private failClosed(): void {
    const wasActive = this.ownerActive || this.pinch;
    const lastPos = this.display ?? { x: POINTER_OFFSCREEN, y: POINTER_OFFSCREEN };
    const t = this.lastFrameT ?? 0;
    this.resetPipeline();
    this.lossHold = createLossHold();
    this.lastFrameT = null;
    if (wasActive) {
      this.emit({ t, x: lastPos.x, y: lastPos.y, inFrame: false, pinch: false, pinchStrength: 0, source: "hand" });
    }
  }

  private resetPipeline(): void {
    this.pointerFilter.reset();
    this.pinchDetector.reset();
    this.rollbackBuffer.clear();
    this.nibFilter.reset();
    this.ownerLock.reset();
    this.tracked = [];
    this.lastDisplayT = null;
    this.frozen = false;
    this.ownerActive = false;
    this.needsOpenPose = false;
    this.raw = null;
    this.filtered = null;
    this.display = null;
    this.nib = null;
    this.nibOffset = null;
    this.pinch = false;
    this.pinchStrength = 0;
  }

  private emit(sample: InputSample): void {
    for (const cb of [...this.listeners]) cb(sample);
  }
}
