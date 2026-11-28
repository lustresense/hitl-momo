import type { DrawingInput } from "@/src/domain/types";
import type { DrawingSurface } from "@/src/input";
import { StrokeStore } from "@/src/input/types";
import { ERASER_RADIUS_PX, GUESS_IDLE_MS } from "@/src/nui/core/constants";
import type { InputSample } from "@/src/nui/core/types";
import * as cr from "./canvas-render";
import { addDemoSample, type DemoSampleKind } from "./demo-sample";
import type {
  CanvasControllerOptions,
  CanvasControllerState,
  CanvasSurfaceMetrics,
  CanvasViewportRect,
} from "./canvas-render";
import type { ActiveBrushTool, CanvasToolId } from "./tools";

export type {
  CanvasControllerOptions,
  CanvasControllerState,
  CanvasSurfaceMetrics,
  CanvasViewportRect,
  NibBridge,
  NibSeedPoint,
} from "./canvas-render";

const nowFallback = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Pure 5-tool controller over `StrokeStore` (O-7 segment eraser, O-13 no provisional guess, O-14 idle 1000 ms). */
export class CanvasController {
  readonly store: StrokeStore;
  private readonly opts: CanvasControllerOptions;
  private readonly idleMs: number;
  private readonly eraserCssPx: number;
  private readonly clock: () => number;
  private readonly stateListeners = new Set<(state: CanvasControllerState) => void>();
  private readonly usedTools = new Set<CanvasToolId>();

  private canvas: HTMLCanvasElement | null = null;
  private activeTool: ActiveBrushTool = "pencil";
  private inkEnabled = true;
  private idleReady = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private prevPinch = false;
  private drawingActive = false;
  private erasingActive = false;
  private eraseChanged = false;
  private disposed = false;

  constructor(options: CanvasControllerOptions = {}) {
    this.store = new StrokeStore();
    this.store.eraseSegments = true;
    this.opts = options;
    this.idleMs = options.idleMs ?? GUESS_IDLE_MS;
    this.eraserCssPx = options.eraserRadiusCssPx ?? ERASER_RADIUS_PX;
    this.clock = options.clock ?? nowFallback;
    if (options.onStateChange) this.stateListeners.add(options.onStateChange);
  }

  getState(): CanvasControllerState {
    return {
      activeTool: this.activeTool,
      hasInk: cr.hasStoreMeaningfulInk(this.store),
      idleReady: this.idleReady,
      usedTools: new Set(this.usedTools),
      strokeCount: cr.getStoreStrokeCount(this.store),
      inkEnabled: this.inkEnabled,
    };
  }

  subscribe(listener: (state: CanvasControllerState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  attachCanvas(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    this.resizeForDpr();
    const stopRo = cr.observeCanvasResize(canvas, () => this.resizeForDpr());
    return () => {
      stopRo();
      if (this.canvas === canvas) this.canvas = null;
    };
  }

  attachPointerFallback(canvas: HTMLCanvasElement, shouldHandle: () => boolean): () => void {
    return cr.attachCanvasPointerFallback(canvas, shouldHandle, this.clock, (s, c) => this.feedSample(s, c));
  }

  resizeForDpr(): void {
    if (this.canvas) cr.syncCanvasDprSize(this.canvas);
    this.render();
  }

  setInkEnabled(enabled: boolean): void {
    if (this.inkEnabled === enabled) return;
    this.inkEnabled = enabled;
    if (!enabled) {
      this.finishActiveInteraction(false);
      this.prevPinch = false;
      this.clearIdleTimer();
      this.idleReady = false;
    } else {
      this.scheduleIdleIfInk();
    }
    this.emitState();
  }

  selectTool(tool: CanvasToolId): boolean {
    if (this.disposed) return false;
    if (tool === "pencil" || tool === "eraser") {
      if (this.activeTool === tool) return true;
      this.finishActiveInteraction(true);
      this.activeTool = tool;
      this.store.eraserMode = tool === "eraser";
      this.opts.onToolAction?.(tool);
      this.emitState();
      return true;
    }
    if (!this.inkEnabled) return false;
    this.finishActiveInteraction(true);
    const changed = tool === "undo" ? this.store.undo() : tool === "redo" ? this.store.redo() : this.store.wipe();
    if (changed) {
      this.recordToolUsed(tool);
      this.opts.onToolAction?.(tool);
      this.idleReady = false;
      this.scheduleIdleIfInk();
      this.render();
      this.emitState();
    }
    return changed;
  }

  /** "Lewati" di kertas kosong: papan atau peti contoh supaya tidak pernah buntu. */
  drawDemoSample(kind: DemoSampleKind): void {
    if (this.disposed) return;
    this.finishActiveInteraction(false);
    addDemoSample(this.store, kind, this.metrics());
    this.render();
    this.emitState();
  }

  /** One NUI sample (Rule D): `nib` for the hand pencil, `(x, y)` for mouse/eraser. Never predicts (O-13). */
  feedSample(sample: InputSample, chrome = false): void {
    if (this.disposed) return;
    if (!this.inkEnabled || !sample.inFrame) {
      if (this.drawingActive || this.erasingActive) this.completeStrokeAndReschedule();
      this.prevPinch = false;
      return;
    }

    const useNib = this.activeTool === "pencil" && sample.nib !== undefined;
    const vpX = useNib ? sample.nib!.x : sample.x;
    const vpY = useNib ? sample.nib!.y : sample.y;
    const metrics = this.metrics();
    const pt = cr.viewportToCanvasPoint(vpX, vpY, metrics);

    if (sample.pinch && !this.prevPinch) {
      if (!chrome && this.isInsidePaper(vpX, vpY, metrics)) {
        this.beginInteractivePass(sample, metrics, pt);
        this.opts.onInk?.({ kind: "begin", tool: this.activeTool, x: vpX, y: vpY, t: sample.t, effective: this.activeTool === "pencil" || this.eraseChanged });
      }
    } else if (sample.pinch && this.prevPinch) {
      if (this.erasingActive) {
        const erased = this.store.eraseAt(pt, this.eraserRadiusCanvasPx());
        if (erased) this.eraseChanged = true;
        this.render();
        this.opts.onInk?.({ kind: "move", tool: "eraser", x: vpX, y: vpY, t: sample.t, effective: erased });
      } else if (this.drawingActive) {
        this.store.addPoint(pt);
        this.render();
        this.opts.onInk?.({ kind: "move", tool: "pencil", x: vpX, y: vpY, t: sample.t, effective: true });
      }
    } else if (!sample.pinch && this.prevPinch && (this.drawingActive || this.erasingActive)) {
      this.completeStrokeAndReschedule();
    }
    this.prevPinch = sample.pinch;
  }

  getDrawingViewportRect(): CanvasViewportRect | null {
    return cr.computeDrawingViewportRect(this.store, this.metrics());
  }

  eraserRadiusCanvasPx(): number {
    return cr.measureEraserCanvasRadius(this.canvas, this.metrics(), this.eraserCssPx);
  }

  toDrawingInput(): DrawingInput {
    return cr.storeToDrawingInput(this.store);
  }

  toSurfaceAdapter(): DrawingSurface {
    return cr.buildSurfaceAdapter({
      store: this.store,
      eraserCssPx: this.eraserCssPx,
      getActiveTool: () => this.activeTool,
      selectTool: (t) => this.selectTool(t),
      setInkEnabled: (on) => this.setInkEnabled(on),
      hasMeaningfulInk: () => cr.hasStoreMeaningfulInk(this.store),
      clearAll: () => this.clearSurface(),
      toDrawingInput: () => this.toDrawingInput(),
      resizeForDpr: () => this.resizeForDpr(),
      render: () => this.render(),
      dispose: () => this.dispose(),
    });
  }

  render(): void {
    if (this.canvas) cr.paintCanvasStrokes(this.canvas, this.store, this.metrics().dpr);
    this.opts.onRender?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.opts.onInk?.({ kind: "end" });
    this.clearIdleTimer();
    this.stateListeners.clear();
  }

  private clearSurface(): void {
    this.opts.onInk?.({ kind: "end" });
    this.store.clear();
    this.clearIdleTimer();
    this.idleReady = false;
    this.render();
    this.emitState();
  }

  private beginInteractivePass(sample: InputSample, metrics: CanvasSurfaceMetrics, pt: { x: number; y: number }): void {
    this.clearIdleTimer();
    this.idleReady = false;
    if (this.activeTool === "eraser") {
      this.erasingActive = true;
      this.store.beginErase();
      this.eraseChanged = this.store.eraseAt(pt, this.eraserRadiusCanvasPx());
    } else {
      this.drawingActive = true;
      const seeded = sample.source === "hand" ? this.opts.getNibBridge?.()?.beginNib(sample.t) : undefined;
      cr.seedStrokeStart(this.store, metrics, pt, seeded);
    }
    this.render();
    this.emitState();
  }

  private completeStrokeAndReschedule(): void {
    this.finishActiveInteraction(true);
    this.scheduleIdleIfInk();
    this.render();
    this.emitState();
  }

  private metrics(): CanvasSurfaceMetrics {
    return this.opts.getMetrics ? this.opts.getMetrics() : this.canvas ? cr.readDomCanvasMetrics(this.canvas) : cr.DEFAULT_CANVAS_METRICS;
  }

  private isInsidePaper(vx: number, vy: number, metrics: CanvasSurfaceMetrics): boolean {
    const r = metrics.rect;
    if (vx < r.left || vx > r.right || vy < r.top || vy > r.bottom) return false;
    return this.opts.isPointOnPaper ? this.opts.isPointOnPaper(vx, vy) : true;
  }

  private finishActiveInteraction(recordUsage: boolean): void {
    if (this.erasingActive || this.drawingActive) this.opts.onInk?.({ kind: "end" });
    if (this.erasingActive) {
      this.erasingActive = false;
      this.store.endErase();
      if (recordUsage && this.eraseChanged) this.recordToolUsed("eraser");
      this.eraseChanged = false;
    }
    if (this.drawingActive) {
      this.drawingActive = false;
      const active = this.store.getStrokes().active;
      const meaningful = active !== null && active.length >= 2;
      this.store.endStroke();
      if (recordUsage && meaningful) this.recordToolUsed("pencil");
    }
  }

  private recordToolUsed(tool: CanvasToolId): void {
    this.usedTools.add(tool);
    this.opts.onToolUsed?.(tool);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private scheduleIdleIfInk(): void {
    this.clearIdleTimer();
    if (!this.inkEnabled || this.drawingActive || this.erasingActive || !cr.hasStoreMeaningfulInk(this.store)) {
      this.idleReady = false;
      return;
    }
    const startedAt = this.clock();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.disposed || !this.inkEnabled || this.drawingActive || this.erasingActive) return;
      if (!cr.hasStoreMeaningfulInk(this.store) || this.clock() - startedAt < 0) return;
      this.idleReady = true;
      this.emitState();
    }, this.idleMs);
  }

  private emitState(): void {
    const snap = this.getState();
    for (const l of [...this.stateListeners]) l(snap);
  }
}
