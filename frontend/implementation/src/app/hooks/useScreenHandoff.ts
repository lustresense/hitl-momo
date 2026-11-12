"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { COVER_MOMO_FADE_MS } from "@/src/components/camera/cover-handoff";

/** The incoming screen fades in over this long (the outgoing Momo fades first, see COVER_MOMO_FADE_MS). */
export const SCREEN_FADE_MS = 300;

/**
 * R12-03: a screen change happens at the book's midpoint, never before, and the incoming screen then fades in after
 * the outgoing Momo has gone. `later` queues a change for the next midpoint, `midpoint` runs it (BookFlip onMidpoint),
 * `swap` runs a change right away for a caller that is already at the midpoint (the cover) and starts the fade-in.
 */
export function useScreenHandoff() {
  const [entering, setEntering] = useState(false);
  const queuedRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const later = useCallback((change: () => void) => {
    queuedRef.current = change;
  }, []);

  const midpoint = useCallback(() => {
    const change = queuedRef.current;
    queuedRef.current = null;
    change?.();
  }, []);

  const swap = useCallback((change: () => void) => {
    change();
    setEntering(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setEntering(false);
    }, COVER_MOMO_FADE_MS + SCREEN_FADE_MS);
  }, []);

  return { entering, delayMs: COVER_MOMO_FADE_MS, later, midpoint, swap };
}
