"use client";
/**
 * Dwell ("hover to pick") for the hand: the index fingertip is the cursor, and a control fills while it rests
 * on that control. A full ring activates once. The fingertip must leave the control before it can activate it
 * again (latch), and a control that appears under a resting fingertip waits for one exit first, so a hand left
 * over from the previous screen cannot pick the next one. Only one control fills at a time.
 *
 * The fingertip comes from the shared hand cursor store, so every control on a screen reads one reader. A
 * control starts the shared tracker only when no page reader is live (a screen without a camera driver).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { getHandCursor } from "../camera/hand-cursor-store";
import { acquireThumbTracker } from "../camera/thumb-tracker";
import type { InputMode } from "../input/input-mode";
import { useInputMode } from "./useHandGesture";
import { useHandReaderLive } from "./useHandCursor";

export const DEFAULT_DWELL_MS = 1200;
/** Once the fingertip leaves, the ring drains at this fraction of the fill speed (slow, not a snap back). */
export const DWELL_DRAIN_RATIO = 0.5;
/** A page's driver may still be starting in the same commit: wait this long before starting the tracker ourselves. */
export const TRACKER_START_GRACE_MS = 300;

/** The one control allowed to fill now. Module-level because every control on screen shares one fingertip. */
let dwellOwner: symbol | null = null;

export interface UseDwellOptions {
  ref: RefObject<HTMLElement>;
  onActivate: () => void;
  dwellMs?: number;
  /** false = no dwell at all (a disabled control). */
  enabled?: boolean;
}

export interface DwellState {
  mode: InputMode;
  /** Ring fill, 0..1. Always 0 outside camera mode. */
  progress: number;
}

function inside(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** The control counts only when the topmost element at the fingertip is the control or one of its children. */
function isTopmostAt(el: HTMLElement, x: number, y: number): boolean {
  // Without elementFromPoint (jsdom, very old browsers) the rectangle alone decides.
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return true;
  const top = document.elementFromPoint(x, y);
  return !!top && (top === el || el.contains(top));
}

export function useDwell({ ref, onActivate, dwellMs = DEFAULT_DWELL_MS, enabled = true }: UseDwellOptions): DwellState {
  const mode = useInputMode();
  const dwellOn = enabled && mode === "camera";
  const readerLive = useHandReaderLive();

  // Two hand readers on one camera would load two models: start the shared tracker only with no page reader.
  useEffect(() => {
    if (!dwellOn || readerLive) return;
    let release: (() => void) | null = null;
    const timer = setTimeout(() => {
      release = acquireThumbTracker();
    }, TRACKER_START_GRACE_MS);
    return () => {
      clearTimeout(timer);
      release?.();
    };
  }, [dwellOn, readerLive]);

  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    if (!dwellOn) return;
    const me = Symbol("dwell");
    let raf = 0;
    let last: number | null = null;
    let value = 0;
    let shown = 0;
    let armed = false;

    const show = (next: number) => {
      value = next;
      const rounded = Math.round(next * 100) / 100;
      if (rounded !== shown) {
        shown = rounded;
        setProgress(rounded);
      }
    };

    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(Math.max(now - last, 0), 100);
      last = now;
      const el = ref.current;
      // Read per frame: the loop never restarts when the fingertip moves.
      const cursor = getHandCursor()?.cursor ?? null;
      const x = cursor ? cursor.x * window.innerWidth : 0;
      const y = cursor ? cursor.y * window.innerHeight : 0;
      const over = !!el && !!cursor && inside(el.getBoundingClientRect(), x, y) && isTopmostAt(el, x, y);

      if (!over) {
        armed = true;
        if (dwellOwner === me) dwellOwner = null;
        show(Math.max(0, value - (dt / dwellMs) * DWELL_DRAIN_RATIO));
      } else if (!armed) {
        // Latched after an activation: the ring stays full while the fingertip rests here.
      } else if (dwellOwner === null || dwellOwner === me) {
        dwellOwner = me;
        show(Math.min(1, value + dt / dwellMs));
        if (value >= 1) {
          armed = false;
          activateRef.current();
        }
      } else {
        // Another control already owns the dwell (the two overlap): this one drains.
        show(Math.max(0, value - (dt / dwellMs) * DWELL_DRAIN_RATIO));
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (dwellOwner === me) dwellOwner = null;
    };
  }, [dwellOn, dwellMs, ref]);

  return { mode, progress: dwellOn ? progress : 0 };
}
