import type { DrawingInput, StrokePoint } from "@/src/domain/types";
import type { DrawingSurface } from "@/src/input";
import { eraserRadiusCanvasPx } from "@/src/input/eraser";
import { normalizeStrokes } from "@/src/input/normalize";
import { StrokeStore, type HandInputStatus, type InputModeId, type RawStroke } from "@/src/input/types";
import type { InputSample } from "@/src/nui/core/types";
import type { ActiveBrushTool, CanvasToolId } from "./tools";

export interface CanvasViewportRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasSurfaceMetrics {
  readonly rect: CanvasViewportRect;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly dpr: number;
}

export interface NibSeedPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface NibBridge {
  beginNib(tMs: number): readonly NibSeedPoint[];
}

export interface CanvasControllerState {
  readonly activeTool: ActiveBrushTool;
  readonly hasInk: boolean;
  readonly idleReady: boolean;
  readonly usedTools: ReadonlySet<CanvasToolId>;
  readonly strokeCount: number;
  readonly inkEnabled: boolean;
}

export interface CanvasControllerOptions {
  readonly onToolUsed?: (tool: CanvasToolId) => void;
  readonly onStateChange?: (state: CanvasControllerState) => void;
  readonly onRender?: () => void;
  readonly idleMs?: number;
  readonly eraserRadiusCssPx?: number;
  readonly clock?: () => number;
  readonly getMetrics?: () => CanvasSurfaceMetrics;
  readonly isPointOnPaper?: (viewportX: number, viewportY: number) => boolean;
  readonly getNibBridge?: () => NibBridge | null;
}

export function observeCanvasResize(canvas: HTMLCanvasElement, onResize: () => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);
  return () => ro.disconnect();
}

export const DEFAULT_CANVAS_METRICS: CanvasSurfaceMetrics = {
  rect: { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 },
  canvasWidth: 1280,
  canvasHeight: 720,
  dpr: 1,
};

export function readCanvasDpr(): number {
  return Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
}

export function readDomCanvasMetrics(canvas: HTMLCanvasElement): CanvasSurfaceMetrics {
  const r = canvas.getBoundingClientRect();
  const dpr = readCanvasDpr();
  const width = r.width > 0 ? r.width : canvas.clientWidth || canvas.width || DEFAULT_CANVAS_METRICS.rect.width;
  const height = r.height > 0 ? r.height : canvas.clientHeight || canvas.height || DEFAULT_CANVAS_METRICS.rect.height;
  return {
    rect: { left: r.left, top: r.top, right: r.left + width, bottom: r.top + height, width, height },
    canvasWidth: canvas.width || Math.max(1, Math.round(width * dpr)),
    canvasHeight: canvas.height || Math.max(1, Math.round(height * dpr)),
    dpr,
  };
}

export function syncCanvasDprSize(canvas: HTMLCanvasElement): void {
  const dpr = readCanvasDpr();
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const nextW = Math.max(1, Math.round(rect.width * dpr));
  const nextH = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW;
    canvas.height = nextH;
  }
}

export function viewportToCanvasPoint(vx: number, vy: number, m: CanvasSurfaceMetrics): StrokePoint {
  const w = m.rect.width > 0 ? m.rect.width : 1;
  const h = m.rect.height > 0 ? m.rect.height : 1;
  return { x: ((vx - m.rect.left) / w) * m.canvasWidth, y: ((vy - m.rect.top) / h) * m.canvasHeight };
}

export function measureEraserCanvasRadius(
  canvas: HTMLCanvasElement | null,
  metrics: CanvasSurfaceMetrics,
  eraserCssPx: number,
): number {
  if (canvas) return eraserRadiusCanvasPx(canvas, eraserCssPx);
  const ratio = metrics.rect.width > 0 ? metrics.canvasWidth / metrics.rect.width : metrics.dpr;
  return eraserCssPx * (ratio > 0 ? ratio : 1);
}

export function hasStoreMeaningfulInk(store: StrokeStore): boolean {
  const { completed, active } = store.getStrokes();
  return completed.some((s) => s.length >= 2) || (active !== null && active.length >= 2);
}

export function getStoreStrokeCount(store: StrokeStore): number {
  const { completed, active } = store.getStrokes();
  return completed.length + (active ? 1 : 0);
}

export function storeToDrawingInput(store: StrokeStore): DrawingInput {
  const { completed, active } = store.getStrokes();
  const all: RawStroke[] = active ? [...completed, active] : completed;
  return normalizeStrokes(all);
}

export function computeDrawingViewportRect(store: StrokeStore, m: CanvasSurfaceMetrics): CanvasViewportRect | null {
  const { completed, active } = store.getStrokes();
  const strokes = active ? [...completed, active] : completed;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      count += 1;
    }
  }
  if (count === 0) return null;
  const sx = m.canvasWidth > 0 ? m.rect.width / m.canvasWidth : 1;
  const sy = m.canvasHeight > 0 ? m.rect.height / m.canvasHeight : 1;
  const left = m.rect.left + minX * sx;
  const top = m.rect.top + minY * sy;
  const right = m.rect.left + maxX * sx;
  const bottom = m.rect.top + maxY * sy;
  return { left, top, right, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function paintCanvasStrokes(canvas: HTMLCanvasElement, store: StrokeStore, dpr: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1e2126";
  ctx.lineWidth = 3.4 * Math.max(1, dpr);

  const { completed, active } = store.getStrokes();
  const all = active ? [...completed, active] : completed;
  canvas.dataset.strokeCount = String(completed.length + (active ? 1 : 0));

  for (const s of all) {
    if (s.length === 0) continue;
    ctx.beginPath();
    const p0 = s[0]!;
    ctx.moveTo(p0.x, p0.y);
    if (s.length === 1) {
      ctx.lineTo(p0.x + 0.6, p0.y);
      ctx.stroke();
      continue;
    }
    for (let i = 1; i < s.length - 1; i++) {
      const a = s[i]!;
      const b = s[i + 1]!;
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    const last = s[s.length - 1]!;
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

export function attachCanvasPointerFallback(
  canvas: HTMLCanvasElement,
  shouldHandle: () => boolean,
  clock: () => number,
  feedSample: (sample: InputSample, chrome: boolean) => void,
): () => void {
  let active = false;
  const emitPointer = (e: PointerEvent, pinch: boolean) => {
    if (!shouldHandle()) return;
    feedSample(
      {
        t: clock(),
        x: e.clientX,
        y: e.clientY,
        inFrame: true,
        pinch,
        pinchStrength: pinch ? 1 : 0,
        source: e.pointerType === "touch" ? "touch" : "mouse",
      },
      false,
    );
  };
  const onDown = (e: PointerEvent) => {
    if (!shouldHandle()) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    active = true;
    emitPointer(e, true);
  };
  const onMove = (e: PointerEvent) => {
    if (!active) return;
    e.preventDefault();
    emitPointer(e, true);
  };
  const onUp = (e: PointerEvent) => {
    if (!active) return;
    active = false;
    emitPointer(e, false);
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

export interface SurfaceAdapterHost {
  readonly store: StrokeStore;
  readonly eraserCssPx: number;
  getActiveTool(): ActiveBrushTool;
  selectTool(tool: CanvasToolId): boolean;
  setInkEnabled(on: boolean): void;
  hasMeaningfulInk(): boolean;
  clearAll(): void;
  toDrawingInput(): DrawingInput;
  resizeForDpr(): void;
  render(): void;
  dispose(): void;
}

export function seedStrokeStart(
  store: StrokeStore,
  metrics: CanvasSurfaceMetrics,
  fallbackPt: StrokePoint,
  seeded?: readonly NibSeedPoint[],
): void {
  store.beginStroke();
  if (seeded && seeded.length > 0) {
    for (const s of seeded) store.addPoint(viewportToCanvasPoint(s.x, s.y, metrics));
  } else {
    store.addPoint(fallbackPt);
  }
}

export function buildSurfaceAdapter(host: SurfaceAdapterHost): DrawingSurface {
  const adapter = {
    store: host.store,
    getMode: (): InputModeId => "pointer",
    setMode: async (): Promise<HandInputStatus> => ({ kind: "idle" }),
    setInkEnabled: (on: boolean) => host.setInkEnabled(on),
    setErasing: (on: boolean) => {
      void host.selectTool(on ? "eraser" : "pencil");
    },
    isErasingMode: () => host.getActiveTool() === "eraser",
    setEraserRadius: () => host.eraserCssPx,
    getEraserRadius: () => host.eraserCssPx,
    isEmpty: () => !host.hasMeaningfulInk(),
    clear: () => host.clearAll(),
    undo: () => host.selectTool("undo"),
    redo: () => host.selectTool("redo"),
    toDrawingInput: () => host.toDrawingInput(),
    resizeForDpr: () => host.resizeForDpr(),
    render: () => host.render(),
    dispose: () => host.dispose(),
  };
  return adapter as unknown as DrawingSurface;
}
