import type { DrawingInput } from "../domain/types";
import { StrokeStore, type HandInputStatus, type InputModeId } from "./types";
import { attachPointerDriver, strokesToDrawingInput } from "./pointer-input";
import { HandDrawingDriver } from "./mediapipe-input";
import { evaluateGesture, mapToCanvas } from "./hand-gesture";
import { PointSmoother } from "./smoothing";

/**
 * TASK 06 — Drawing workspace orchestrator.
 * One stroke store, swappable input drivers (pointer default, MediaPipe hand),
 * high-DPI aware canvas rendering, clear/undo/submit-validation support.
 */
export interface DrawingSurfaceOptions {
  initialMode?: InputModeId;
  modelUrl?: string;
  onStatusChange?(status: HandInputStatus): void;
}

export class DrawingSurface {
  readonly store = new StrokeStore();
  private detachPointer: (() => void) | null = null;
  private handDriver: HandDrawingDriver | null = null;
  private handCursor: { x: number; y: number } | null = null;
  private readonly smoother = new PointSmoother();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
    private options: DrawingSurfaceOptions = {},
  ) {
    this.resizeForDpr();
    this.attachPointer();
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
      try {
        this.detachPointer?.();
        this.handDriver = new HandDrawingDriver({
          canvas: this.canvas,
          video: this.video,
          store: this.store,
          modelUrl: this.options.modelUrl ?? "/models/hand_landmarker.task",
          onStatus: (s) => {
            this.updateHandCursorFromStatus(s);
            this.options.onStatusChange?.(s);
          },
          onRender: () => this.render(),
        });
        await this.handDriver.start();
      } catch {
        // Any construction failure falls back to pointer without restart.
        await this.stopHand();
        this.attachPointer();
        const status: HandInputStatus = { kind: "error", reason: "tracker-error" };
        this.options.onStatusChange?.(status);
        return status;
      }
    }
    return { kind: "initializing" };
  }

  private updateHandCursorFromStatus(status: HandInputStatus): void {
    if (status.kind === "tracking-lost") {
      this.handCursor = null;
      this.smoother.reset();
    }
  }

  private attachPointer(): void {
    if (this.detachPointer) return;
    this.detachPointer = attachPointerDriver(this.canvas, this.store, () => this.render());
  }

  private async stopHand(): Promise<void> {
    if (this.handDriver) {
      const d = this.handDriver;
      this.handDriver = null;
      await d.stop();
      this.options.onStatusChange?.({ kind: "idle" });
    }
    this.handCursor = null;
    this.attachPointer();
  }

  /**
   * TEST HOOK (TASK 14): inject synthetic landmarks into the gesture pipeline.
   * Works with or without an active camera/driver so automation can exercise
   * mapping/smoothing/stroke production headlessly.
   */
  feedHandLandmarksForTest(
    landmarks: Array<{ x: number; y: number; z?: number }> | undefined,
    _ts = 0,
  ): void {
    const frame = evaluateGesture(landmarks);
    if (frame.state === "lost") {
      if (this.store.hasInk()) this.store.endStroke();
      this.handCursor = null;
      this.smoother.reset();
      this.render();
      return;
    }
    const smoothed = this.smoother.smooth(frame.cursor);
    this.handCursor = mapToCanvas(smoothed, this.canvas.width, this.canvas.height);
    if (frame.pinched && !this.lastTestPinch) this.store.beginStroke();
    if (frame.pinched) this.store.addPoint(this.handCursor);
    else if (this.lastTestPinch) this.store.endStroke();
    this.lastTestPinch = frame.pinched;
    this.render();
  }

  private lastTestPinch = false;

  /** Expose smoothed cursor for overlay rendering from gesture pipeline tests. */
  pushTestCursor(p: { x: number; y: number }): void {
    const s = this.smoother.smooth(p);
    this.handCursor = mapToCanvas(s, this.canvas.width, this.canvas.height);
  }

  /* ---------------- workspace ops ---------------- */

  isEmpty(): boolean {
    return !this.store.hasInk();
  }

  clear(): void {
    this.store.clear();
    this.render();
  }

  /** Simple undo of last completed stroke (TASK 06 optional feature). */
  undo(): boolean {
    const ok = this.store.undo();
    this.render();
    return ok;
  }

  toDrawingInput(): DrawingInput {
    return strokesToDrawingInput(this.store);
  }

  dispose(): void {
    void this.stopHand();
    this.detachPointer?.();
    this.detachPointer = null;
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
    ctx.strokeStyle = "#23324d";
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

    if (this.handCursor) {
      ctx.strokeStyle = "#2e7d32";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.handCursor.x, this.handCursor.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Lined sketchbook paper placeholder — replaceable visual token target. */
function drawPaper(ctx: CanvasRenderingContext2D): void {
  const c = ctx.canvas;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fdfaf3";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#dfe8f2";
  ctx.lineWidth = 1;
  for (let y = 24; y < c.height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y);
    ctx.stroke();
  }
}
