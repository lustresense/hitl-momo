/**
 * Visibility of the play-phase guide "Cara menjalankan Thinman".
 * It opens when play starts and closes by itself after GUIDE_AUTO_HIDE_MS or at the first
 * movement. Opened by the help button, it stays until the student closes it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const GUIDE_AUTO_HIDE_MS = 6000;

export interface ControlGuideState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export interface UseControlGuideOptions {
  /** Play is running: world ready, not settled, in the gameplay phase. */
  active: boolean;
  /** Some direction (keyboard, button or hand) is active, i.e. the student has moved. */
  moved: boolean;
}

export function useControlGuide({ active, moved }: UseControlGuideOptions): ControlGuideState {
  const [open, setOpen] = useState(false);
  // True only while the guide was opened by play starting; the help button clears it.
  const autoShown = useRef(false);

  useEffect(() => {
    if (!active) {
      autoShown.current = false;
      setOpen(false);
      return;
    }
    autoShown.current = true;
    setOpen(true);
    const id = window.setTimeout(() => {
      if (!autoShown.current) return;
      autoShown.current = false;
      setOpen(false);
    }, GUIDE_AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [active]);

  useEffect(() => {
    if (!moved || !autoShown.current) return;
    autoShown.current = false;
    setOpen(false);
  }, [moved]);

  const toggle = useCallback(() => {
    autoShown.current = false;
    setOpen((was) => !was);
  }, []);

  const close = useCallback(() => {
    autoShown.current = false;
    setOpen(false);
  }, []);

  return { open, toggle, close };
}
