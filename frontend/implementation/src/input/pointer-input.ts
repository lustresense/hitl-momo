import type { DrawingInput } from "../domain/types";
import { normalizeStrokes } from "./normalize";
import { ERASER_RADIUS_PX, eraserRadiusCanvasPx } from "./eraser";

/** Eraser radius in canvas pixels: the default CSS radius, scaled by the canvas backing-store ratio. */
export function eraserRadius(canvas: HTMLCanvasElement): number {
  return eraserRadiusCanvasPx(canvas, ERASER_RADIUS_PX);
}

/**
 * TASK 06 — Pointer/touch driver (the always-available fallback input).
 * Pushes raw canvas-space points into the shared StrokeStore.
 */
export function attachPointerDriver(
  canvas: HTMLCanvasElement,
  store: import("./types").StrokeStore,
  onRender: () => void,
  onCursor?: (c: { x: number; y: number; state: "hover" | "near" | "drawing" } | null) => void,
  /** Eraser radius in canvas px; the surface passes its CSS-px setting so the drag and the fist agree. */
  radiusPx: () => number = () => eraserRadius(canvas),
): () => void {
  let active = false;

  const pointOf = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    active = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    const p = pointOf(e);
    if (store.eraserMode) {
      store.beginErase();
      store.eraseAt(p, radiusPx());
    } else {
      store.beginStroke();
      store.addPoint(p);
    }
    onCursor?.({ x: p.x, y: p.y, state: "drawing" });
    onRender();
  };
  const onMove = (e: PointerEvent) => {
    const p = pointOf(e);
    if (active) {
      e.preventDefault();
      if (store.isErasing()) store.eraseAt(p, radiusPx());
      else store.addPoint(p);
      onCursor?.({ x: p.x, y: p.y, state: "drawing" });
      onRender();
    } else {
      onCursor?.({ x: p.x, y: p.y, state: "hover" });
    }
  };
  const onUp = (e?: PointerEvent) => {
    if (!active) return;
    active = false;
    if (store.isErasing()) store.endErase();
    else store.endStroke();
    if (e) {
      const p = pointOf(e);
      onCursor?.({ x: p.x, y: p.y, state: "hover" });
    } else {
      onCursor?.(null);
    }
    onRender();
  };
  const onLeave = () => {
    if (!active) {
      onCursor?.(null);
    }
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  return () => {
    if (active) {
      if (store.isErasing()) store.endErase();
      else store.endStroke();
    }
    onCursor?.(null);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
  };
}

/** Normalized provider input from the current store contents. */
export function strokesToDrawingInput(store: import("./types").StrokeStore): DrawingInput {
  const { completed, active } = store.getStrokes();
  const all = active ? [...completed, active] : completed;
  return normalizeStrokes(all);
}
