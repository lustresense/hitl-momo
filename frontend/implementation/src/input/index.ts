import type { DrawingInput } from "../domain/types";
import { StrokeStore, type HandInputStatus, type InputModeId } from "./types";
import { attachPointerDriver, strokesToDrawingInput } from "./pointer-input";
import { HandDrawingDriver } from "./mediapipe-input";
import { HandStrokePipeline, type HandCursor, type HandFrame } from "./hand-stroke-pipeline";
import { ERASER_RADIUS_PX, ERASER_SIZE_STEP_PX, clampEraserRadius, eraserRadiusCanvasPx, type EraserControl } from "./eraser";
import { mapToCanvas, type HandPose } from "./hand-gesture";
import { PointSmoother } from "./smoothing";
import { DRAWING_MODE_EVENT, HAND_STATUS_EVENT, messageFor } from "../camera/messages";

// N1 public API for the screens: finger count, stable vote, and the single gesture router.
export { countExtendedFingers, classifyHandPose, StableVote, type HandPose } from "./hand-gesture";
export * from "./gesture-mode";

/**
 * TASK 06 — Drawing workspace orchestrator.
 * One stroke store, swappable input drivers (pointer default, MediaPipe hand),
 * high-DPI aware canvas rendering, clear/undo/submit-validation support.
 */
export interface DrawingSurfaceOptions {
  initialMode?: InputModeId;
  modelUrl?: string;
  onStatusChange?(status: HandInputStatus): void;
  onInkChange?(hasInk: boolean): void;
  /** PRD 0.0.16 R12: stable hand pose once per hand frame ("none" when no hand); the UI debounces it into commands. */
  onPose?(pose: HandPose, nowMs: number): void;
}

export class DrawingSurface {
  readonly store = new StrokeStore();
  private detachPointer: (() => void) | null = null;
  private handDriver: HandDrawingDriver | null = null;
  private cursor: HandCursor | null = null;
  private readonly smoother = new PointSmoother();
  private lastReportedInk = false;
  /** Frame pipeline for the test hook (the live driver owns its own). Created on first use. */
  private testPipeline: HandStrokePipeline | null = null;
  /** Hapus radius in CSS px (see setEraserRadius); canvas px follow the backing-store ratio. */
  private eraserRadiusCss = ERASER_RADIUS_PX;
  /** The eraser as the hand pipeline and the drivers see it: one radius, owned here. */
  private readonly eraser: EraserControl = {
    radiusCanvasPx: () => this.currentEraserRadiusCanvasPx(),
    radiusCss: () => this.eraserRadiusCss,
    setRadiusCss: (px) => {
      this.setEraserRadius(px);
    },
  };

  /** Mouse wheel over the canvas sizes the eraser while the Hapus tool is on; otherwise the page scrolls. */
  private readonly onWheel = (e: WheelEvent) => {
    if (!this.store.eraserMode || e.deltaY === 0) return;
    e.preventDefault();
    this.nudgeEraser(e.deltaY < 0 ? ERASER_SIZE_STEP_PX : -ERASER_SIZE_STEP_PX);
  };

  /** `[` and `]` size the eraser while the Hapus tool is on, unless the student is typing or using a shortcut. */
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.store.eraserMode || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    const step = e.key === "[" ? -ERASER_SIZE_STEP_PX : e.key === "]" ? ERASER_SIZE_STEP_PX : 0;
    if (step === 0) return;
    e.preventDefault();
    this.nudgeEraser(step);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement | null,
    private options: DrawingSurfaceOptions = {},
  ) {
    this.resizeForDpr();
    this.attachPointer();
    // Non-passive so the wheel can be taken over (sizing the eraser) without scrolling the page.
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    if (typeof window !== "undefined") window.addEventListener("keydown", this.onKey);
    void this.setMode(options.initialMode ?? "pointer");
  }

  /* ---------------- mode management ---------------- */

  getMode(): InputModeId {
    return this.handDriver ? "hand" : "pointer";
  }

  /** Switch input modality. Hand failures leave pointer active (TASK 13). */
  async setMode(mode: InputModeId): Promise<HandInputStatus> {
    if (mode === "pointer") {
      await this.stopHand();
      return { kind: "idle" };
    }
    if (!this.handDriver) {
      if (!this.video) return { kind: "error", reason: "camera-unavailable" };
      try {
        this.detachPointer?.();
        this.detachPointer = null; // must be nulled or attachPointer() later no-ops and pointer drawing stays dead
        this.handDriver = new HandDrawingDriver({
          canvas: this.canvas,
          video: this.video,
          store: this.store,
          modelUrl: this.options.modelUrl ?? "/models/hand_landmarker.task",
          onStatus: (s) => {
            this.updateHandCursorFromStatus(s);
            this.publishStatus(s);
            // The hand driver swallows its own start errors (permission denied, model/tracker failure).
            // Never leave the student without any input: fall back to pointer, keep the error visible.
            if (s.kind === "error") void this.fallbackToPointer();
          },
          onRender: () => {
            this.render();
            this.reportInkChange();
          },
          // The driver always calls onRender right after onCursor for a landmark frame:
          // only record the cursor here so a frame costs ONE canvas redraw, not two.
          onCursor: (c) => {
            this.cursor = c;
          },
          onPose: (pose, nowMs) => this.options.onPose?.(pose, nowMs),
          eraser: this.eraser,
        });
        await this.handDriver.start();
      } catch {
        // Any construction failure falls back to pointer without restart.
        await this.stopHand();
        this.attachPointer();
        const status: HandInputStatus = { kind: "error", reason: "tracker-error", message: messageFor("tracker-error") };
        this.publishStatus(status);
        this.announcePointerFallback();
        return status;
      }
    }
    return { kind: "initializing" };
  }

  private updateHandCursorFromStatus(status: HandInputStatus): void {
    if (status.kind === "tracking-lost") {
      this.cursor = null;
      this.smoother.reset();
    }
  }

  private attachPointer(): void {
    if (this.detachPointer) return;
    this.detachPointer = attachPointerDriver(
      this.canvas,
      this.store,
      () => {
        this.render();
        this.reportInkChange();
      },
      (c) => {
        this.cursor = c;
        this.render();
      },
      () => this.currentEraserRadiusCanvasPx(),
    );
  }

  private async fallbackToPointer(): Promise<void> {
    const d = this.handDriver;
    this.handDriver = null;
    try { await d?.stop(); } catch { /* best-effort */ }
    this.cursor = null;
    this.attachPointer();
    this.render();
    this.announcePointerFallback();
  }

  private lastStatusKey = "";

  /** Deduplicated status fan-out: per-frame "ready"/"drawing" repeats must not spam React/HUD listeners. */
  private publishStatus(status: HandInputStatus): void {
    const key = JSON.stringify(status);
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.options.onStatusChange?.(status);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(HAND_STATUS_EVENT, { detail: status }));
    }
  }

  /** Tell the toolbar/camera card that the student is back on the pointer (keeps their toggles truthful). */
  private announcePointerFallback(): void {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DRAWING_MODE_EVENT, { detail: "pointer" }));
    }
  }

  private async stopHand(): Promise<void> {
    if (this.handDriver) {
      const d = this.handDriver;
      this.handDriver = null;
      await d.stop();
      this.publishStatus({ kind: "idle" });
    }
    this.cursor = null;
    this.attachPointer();
  }

  /**
   * TEST HOOK (TASK 14): inject synthetic landmarks into the gesture pipeline.
   * Works with or without an active camera/driver so automation can exercise
   * mapping/smoothing/stroke production headlessly. Same pipeline as the live driver.
   */
  feedHandLandmarksForTest(
    landmarks: Array<{ x: number; y: number; z?: number }> | undefined,
    _ts = 0,
  ): void {
    this.feedHandsForTest(landmarks ? [landmarks] : undefined, _ts);
  }

  /** TEST HOOK: every hand of one frame (two hands: a fist and a second hand that sizes the eraser). */
  feedHandsForTest(
    hands: Array<Array<{ x: number; y: number; z?: number }>> | undefined,
    _ts = 0,
  ): void {
    this.testPipeline ??= new HandStrokePipeline({
      store: this.store,
      size: () => ({ width: this.canvas.width, height: this.canvas.height }),
      eraser: this.eraser,
      onPose: (pose, nowMs) => this.options.onPose?.(pose, nowMs),
    });
    this.applyFrame(this.testPipeline.feedHands(hands, _ts));
  }

  /** Cursor, ink flag and redraw for one hand frame (same contract as the live driver's reports). */
  private applyFrame(frame: HandFrame): void {
    this.cursor = frame.cursor;
    if (frame.changed) {
      this.render();
      this.reportInkChange();
    }
  }

  /** Expose smoothed cursor for overlay rendering from gesture pipeline tests. */
  pushTestCursor(p: { x: number; y: number }): void {
    const s = this.smoother.smooth(p);
    const canvasPt = mapToCanvas(s, this.canvas.width, this.canvas.height);
    this.cursor = { x: canvasPt.x, y: canvasPt.y, state: "hover" };
    this.render();
  }

  /* ---------------- workspace ops ---------------- */

  private reportInkChange(): void {
    const hasInk = this.store.hasInk();
    if (hasInk === this.lastReportedInk) return;
    this.lastReportedInk = hasInk;
    this.options.onInkChange?.(hasInk);
  }

  /**
   * PRD 0.0.16 R12 Hapus tool: while on, pointer drags and the hand cursor erase the strokes they pass.
   * One pass is one undo step. A held fist erases in hand mode even when off.
   */
  setErasing(on: boolean): void {
    if (!on && this.store.isErasing()) this.store.endErase();
    this.store.eraserMode = on;
  }

  isErasingMode(): boolean {
    return this.store.eraserMode;
  }

  /**
   * Eraser radius for the fist (hand) and the drag (pointer), in CSS px. Clamped to a safe range;
   * NaN keeps the current value. Returns the radius now in use.
   */
  setEraserRadius(px: number): number {
    if (!Number.isNaN(px)) this.eraserRadiusCss = clampEraserRadius(px);
    return this.eraserRadiusCss;
  }

  /** The Hapus radius in CSS px now in use (fist, drag, wheel, `[ ]` and the two-hand sizer all share it). */
  getEraserRadius(): number {
    return this.eraserRadiusCss;
  }

  /** One wheel notch or one `[ ]` press: move the radius by `step` CSS px and redraw the ring. */
  private nudgeEraser(step: number): void {
    this.setEraserRadius(this.eraserRadiusCss + step);
    this.render();
  }

  private currentEraserRadiusCanvasPx(): number {
    return eraserRadiusCanvasPx(this.canvas, this.eraserRadiusCss);
  }

  isEmpty(): boolean {
    return !this.store.hasInk();
  }

  clear(): void {
    this.store.clear();
    this.render();
    this.reportInkChange();
  }

  /** Simple undo of last completed stroke (TASK 06 optional feature). */
  undo(): boolean {
    const ok = this.store.undo();
    this.render();
    this.reportInkChange();
    return ok;
  }

  /** Re-applies the last undone stroke. */
  redo(): boolean {
    const ok = this.store.redo();
    this.render();
    this.reportInkChange();
    return ok;
  }

  toDrawingInput(): DrawingInput {
    return strokesToDrawingInput(this.store);
  }

  dispose(): void {
    void this.stopHand();
    this.detachPointer?.();
    this.detachPointer = null;
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (typeof window !== "undefined") window.removeEventListener("keydown", this.onKey);
  }

  /* ---------------- rendering ---------------- */

  /** High-DPI sizing; resilient to container resizes (TASK 06). */
  resizeForDpr(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? Math.round(rect.width * dpr) : this.canvas.width;
    const h = rect.height > 0 ? Math.round((rect.height / (rect.width || 1)) * w) : this.canvas.height;
    this.canvas.width = w;
    this.canvas.height = h;
    this.render();
  }

  render(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    drawPaper(ctx);

    const { completed, active } = this.store.getStrokes();
    this.canvas.dataset.strokeCount = String(completed.length + (active ? 1 : 0));
    this.canvas.dataset.pointCount = String(completed.reduce((n, stroke) => n + stroke.length, 0) + (active?.length ?? 0));
    ctx.strokeStyle = "#23211d";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, Math.round(this.canvas.width / 160));
    for (const stroke of active ? [...completed, active] : completed) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x + 0.6, stroke[0]!.y);
      ctx.stroke();
    }

    if (this.cursor) {
      const { x, y, state } = this.cursor;
      const cssW = this.canvas.clientWidth || (this.canvas.width / (window.devicePixelRatio || 1)) || this.canvas.width;
      const scale = this.canvas.width / (cssW || 1);
      // The Hapus reach is drawn under the pointer dot, so the dot stays on top.
      if (this.cursor.erasing || this.store.eraserMode) this.drawEraserRing(ctx, x, y, scale);
      const r = 6.5 * scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = state === "drawing" ? "#ffe169" : state === "near" ? "#f59e0b" : "#38bdf8";
      ctx.fill();
      ctx.lineWidth = Math.max(2, Math.round(2 * scale));
      ctx.strokeStyle = "#111111";
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * The Hapus reach at (x, y): a dark ring as wide as the radius now in use, with a faint fill, so the student
   * sees what one pass will cut. While the second hand sets the size, a dark badge shows the size in CSS px.
   */
  private drawEraserRing(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    const radius = this.currentEraserRadiusCanvasPx();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 225, 105, 0.22)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, Math.round(3 * scale));
    ctx.strokeStyle = "#111111";
    ctx.stroke();
    const sizing = this.cursor?.sizingCss;
    if (sizing != null) {
      const badgeR = 13 * scale;
      const bx = x;
      const by = y - radius - badgeR - 4 * scale;
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = "#111111";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(15 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(sizing)), bx, by);
    }
    ctx.restore();
  }
}

/** Keys typed into a field belong to the field, not to the eraser. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

/** Transparent canvas clearing — allows full-bleed CSS sketchbook dot-grid to show through. */
function drawPaper(ctx: CanvasRenderingContext2D): void {
  const c = ctx.canvas;
  ctx.clearRect(0, 0, c.width, c.height);
}
