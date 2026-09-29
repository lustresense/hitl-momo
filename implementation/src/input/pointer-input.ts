import type { DrawingInput } from "../domain/types";
import { normalizeStrokes } from "./normalize";

/**
 * TASK 06 — Pointer/touch driver (the always-available fallback input).
 * Pushes raw canvas-space points into the shared StrokeStore.
 */
export function attachPointerDriver(
  canvas: HTMLCanvasElement,
  store: import("./types").StrokeStore,
  onRender: () => void,
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
    store.beginStroke();
    store.addPoint(pointOf(e));
    onRender();
  };
  const onMove = (e: PointerEvent) => {
    if (!active) return;
    e.preventDefault();
    store.addPoint(pointOf(e));
    onRender();
  };
  const onUp = () => {
    if (!active) return;
    active = false;
    store.endStroke();
    onRender();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return () => {
    if (active) store.endStroke();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}

/** Normalized provider input from the current store contents. */
export function strokesToDrawingInput(store: import("./types").StrokeStore): DrawingInput {
  const { completed, active } = store.getStrokes();
  const all = active ? [...completed, active] : completed;
  return normalizeStrokes(all);
}
