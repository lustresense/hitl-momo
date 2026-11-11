"use client";
/**
 * Book page turn (PRD 0.0.16 R2, reused by R6 and R8.6). A full-screen paper leaf hinged at the top edge:
 * - direction "open": the leaf covers the screen and lifts up and away (rotateX 0 -> -180), bottom-right corner first,
 *   revealing the page underneath (cover -> ruler, level list -> world).
 * - direction "close": the reverse, the leaf falls down from the top and covers the screen (world -> level list).
 * The leaf is a fixed overlay with pointer-events none, so it never remounts or blocks the page under it (the camera PIP
 * keeps its single node). Reduced motion keeps the same turn and duration; only the sideways skew is dropped (R3).
 *
 * Usage: render `<BookFlip playKey={n} direction="open" onDone={...} />`. Every new non-zero `playKey` plays once;
 * `playKey` 0 renders nothing. `onMidpoint` fires when the leaf is edge-on (good moment to swap the page under it).
 */
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export type BookFlipDirection = "open" | "close";

export interface BookFlipProps {
  playKey: number;
  direction?: BookFlipDirection;
  /** Seconds. Default 0.9 (R2). */
  duration?: number;
  onMidpoint?: () => void;
  onDone?: () => void;
  /** Optional title printed on the leaf (the cover face). */
  label?: string;
  testId?: string;
}

export const BOOK_FLIP_DURATION = 0.9;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function BookFlip({ playKey, direction = "open", duration = BOOK_FLIP_DURATION, onMidpoint, onDone, label, testId = "book-flip" }: BookFlipProps) {
  const leafRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const cbRef = useRef({ onMidpoint, onDone });
  cbRef.current = { onMidpoint, onDone };

  useEffect(() => {
    if (!playKey) return;
    setActive(true);
  }, [playKey]);

  useEffect(() => {
    if (!active) return;
    const leaf = leafRef.current;
    let finished = false;
    let midFired = false;
    // The page under the leaf swaps exactly once, at edge-on, even if the tween never reports back (safety net).
    const midpoint = () => {
      if (midFired) return;
      midFired = true;
      cbRef.current.onMidpoint?.();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      midpoint();
      setActive(false);
      cbRef.current.onDone?.();
    };
    if (!leaf) {
      finish();
      return;
    }
    const open = direction === "open";
    const tl = gsap.timeline({ onComplete: finish });
    // The turn is the same for everyone (story animation keeps its duration, R3). Reduced motion only drops the
    // sideways tilt and skew, which is the part that moves the eye the most.
    const calm = prefersReducedMotion();
    const closed = { rotateX: 0, rotateZ: 0, skewX: 0, opacity: 1 };
    const away = { rotateX: -180, rotateZ: calm ? 0 : -6, skewX: calm ? 0 : -4, opacity: 1 };
    tl.fromTo(leaf, open ? closed : away, { ...(open ? away : closed), duration, ease: "power2.inOut" });
    tl.call(() => midpoint(), [], duration / 2);
    // jsdom has no animation frames worth waiting for; GSAP still completes on its ticker. Safety net only.
    const guard = setTimeout(finish, (duration + 0.5) * 1000);
    return () => {
      clearTimeout(guard);
      tl.kill();
    };
  }, [active, direction, duration]);

  if (!active) return null;
  return (
    <div className={`book-flip book-flip--${direction}`} data-testid={testId} data-direction={direction} aria-hidden="true">
      <div ref={leafRef} className="book-flip__leaf">
        <div className="book-flip__face book-flip__face--front">{label ? <span className="book-flip__label">{label}</span> : null}</div>
        <div className="book-flip__face book-flip__face--back" />
      </div>
    </div>
  );
}
