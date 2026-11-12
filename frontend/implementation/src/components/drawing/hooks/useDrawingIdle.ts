/**
 * Idle prompt for the drawing screen: true once the student has been without brush, pinch, fist or pointer press
 * for IDLE_PROMPT_MS. A press or a held pinch/fist counts as activity for as long as it lasts; every release restarts
 * the count. The prompt only asks (Momo's line and a lit indicator); it never predicts.
 */
import { useEffect, useState, type RefObject } from "react";
import { IDLE_PROMPT_MS } from "../canvas-focus";

export { IDLE_PROMPT_MS };

export interface DrawingIdleOptions {
  /** Counting runs only while the drawing is live and has ink. */
  enabled: boolean;
  canvasRef: RefObject<HTMLCanvasElement>;
  /** The drawing hand holds a pinch (brush) or a fist (eraser) right now. */
  handBusy: boolean;
}

export function useDrawingIdle({ enabled, canvasRef, handBusy }: DrawingIdleOptions): boolean {
  const [pointerDown, setPointerDown] = useState(false);
  const [prompting, setPrompting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const down = () => setPointerDown(true);
    const up = () => setPointerDown(false);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [canvasRef]);

  const busy = pointerDown || handBusy;
  useEffect(() => {
    setPrompting(false);
    if (!enabled || busy) return;
    const timer = setTimeout(() => setPrompting(true), IDLE_PROMPT_MS);
    return () => clearTimeout(timer);
  }, [enabled, busy]);

  return prompting;
}
