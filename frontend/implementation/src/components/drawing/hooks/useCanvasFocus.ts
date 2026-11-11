/**
 * The focus phase on arrival at the canvas: a dark backdrop, Momo's tool review, then the level's catalog and the
 * "Mulai Menggambar" thumb. It opens when `armed` first turns true (the level intro has lifted) and closes for good
 * once the student starts. A redraw remounts the screen (DrawingFlowScreen key), so it opens again there.
 */
import { useCallback, useState } from "react";

export type CanvasFocusStep = "tools" | "catalog";

export function useCanvasFocus(armed: boolean) {
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<CanvasFocusStep>("tools");
  /** Momo finished the tool review (lines and reading pause): the catalog comes next. */
  const advance = useCallback(() => setStep((current) => (current === "tools" ? "catalog" : current)), []);
  /** The student held the thumb: drawing starts. */
  const dismiss = useCallback(() => setDismissed(true), []);
  return { open: armed && !dismissed, step, advance, dismiss };
}
