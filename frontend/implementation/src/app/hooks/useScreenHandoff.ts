"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { COVER_MOMO_FADE_MS } from "@/src/components/camera/cover-handoff";
import { BOOK_FLIP_DURATION } from "@/src/components/ui/BookFlip";

/** The incoming screen fades in over this long (the outgoing Momo fades first, see COVER_MOMO_FADE_MS). */
export const SCREEN_FADE_MS = 300;
/** The leaf is edge-on at half its turn; the outgoing Momo has faded out by then, while the page is still visible. */
export const PAGE_LEAVE_MS = (BOOK_FLIP_DURATION * 1000) / 2;

type HandoffPhase = "idle" | "leaving" | "entering";

/**
 * R12-03 / R12b-FLOW: a screen change happens at the book's midpoint, never before.
 * - `turn` (page turn, ruler -> cards -> levels): the outgoing Momo starts to fade now, `midpoint` runs the change and
 *   the incoming screen fades in with no delay (the leaf is already lifting away).
 * - `later` queues a change for the next midpoint without the outgoing fade (kept for callers that have no Momo).
 * - `swap` runs a change right away for a caller already at the midpoint (the cover); the cover Momo fades first.
 */
export function useScreenHandoff() {
  const [phase, setPhase] = useState<HandoffPhase>("idle");
  const [delayMs, setDelayMs] = useState(COVER_MOMO_FADE_MS);
  const queuedRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const settleAfter = useCallback((ms: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPhase("idle");
    }, ms);
  }, []);

  const later = useCallback((change: () => void) => {
    queuedRef.current = change;
  }, []);

  const turn = useCallback(
    (change: () => void) => {
      queuedRef.current = change;
      setPhase("leaving");
    },
    [],
  );

  const midpoint = useCallback(() => {
    const change = queuedRef.current;
    queuedRef.current = null;
    if (!change) {
      setPhase("idle");
      return;
    }
    change();
    setDelayMs(0);
    setPhase("entering");
    settleAfter(SCREEN_FADE_MS);
  }, [settleAfter]);

  const swap = useCallback(
    (change: () => void) => {
      change();
      setDelayMs(COVER_MOMO_FADE_MS);
      setPhase("entering");
      settleAfter(COVER_MOMO_FADE_MS + SCREEN_FADE_MS);
    },
    [settleAfter],
  );

  return {
    entering: phase === "entering",
    leaving: phase === "leaving",
    delayMs,
    leaveMs: PAGE_LEAVE_MS,
    later,
    turn,
    midpoint,
    swap,
  };
}
