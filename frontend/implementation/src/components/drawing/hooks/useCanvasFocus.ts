/**
 * The focus phase on arrival at the canvas: a dark backdrop, Momo's tool review, then the level's catalog and the
 * "Mulai Menggambar" thumb. It opens when `armed` first turns true (the level intro has lifted) and closes for good
 * once the student starts. It opens once per level per session: a second drawing cycle or a redraw remounts the screen
 * (DrawingFlowScreen key), and the review must not repeat there (Owner 2026-11-10: no repeated hurdles).
 */
import { useCallback, useState } from "react";

export type CanvasFocusStep = "tools" | "catalog";

/** Levels whose focus phase the student already closed in this session. */
const seenLevels = new Set<string>();

/** TEST ONLY: forget which levels were seen. */
export function resetCanvasFocusForTest(): void {
  seenLevels.clear();
}

export function useCanvasFocus(armed: boolean, levelKey?: string) {
  const [dismissed, setDismissed] = useState(() => (levelKey ? seenLevels.has(levelKey) : false));
  const [step, setStep] = useState<CanvasFocusStep>("tools");
  /** Momo finished the tool review (lines and reading pause): the catalog comes next. */
  const advance = useCallback(() => setStep((current) => (current === "tools" ? "catalog" : current)), []);
  /** The student held the thumb: drawing starts. */
  const dismiss = useCallback(() => {
    if (levelKey) seenLevels.add(levelKey);
    setDismissed(true);
  }, [levelKey]);
  return { open: armed && !dismissed, step, advance, dismiss };
}
