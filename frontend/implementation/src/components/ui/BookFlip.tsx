"use client";
/**
 * Book page turn (PRD 0.0.16 R2, reused by R6 and R8.6; semi-3D per R12-04 / M-019). A full-screen paper leaf hinged at
 * the top edge, lifting up and away from the bottom:
 * - direction "open": the leaf covers the screen and rotates up and away (rotateX 0 -> -180), revealing the page
 *   underneath (cover -> ruler, level list -> world).
 * - direction "close": the reverse, the leaf falls down from the top and covers the screen (world -> level list).
 * A soft shadow band sweeps over the page underneath while the leaf turns, and a thin page edge shows the thickness
 * of the paper. The leaf is a fixed overlay with pointer-events none, so it never remounts or blocks the page under it.
 * Reduced motion keeps the same turn and duration; only the sweeping shadow is skipped (D-20261110-03).
 *
 * Usage: render `<BookFlip playKey={n} direction="open" onDone={...} />`. Every new non-zero `playKey` plays once;
 * `playKey` 0 renders nothing. `onMidpoint` fires when the leaf is edge-on (good moment to swap the page under it).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import "./BookFlip.css";

// Layout effects run before paint, so the leaf appears in the same frame as the page change (no one-frame gap).
// Plain useEffect would paint the old page first. useEffect on the server avoids the SSR layout-effect warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type BookFlipDirection = "open" | "close";

export interface BookFlipProps {
  playKey: number;
  direction?: BookFlipDirection;
  /** Seconds. Default BOOK_FLIP_DURATION (R12-04: 0.9-1.2 s). */
  duration?: number;
  onMidpoint?: () => void;
  onDone?: () => void;
  /** Optional title printed on the leaf (the cover face). */
  label?: string;
  testId?: string;
}

/**
 * Owner window 0.9-1.2 s (R12-04). Kept at 0.9 s: the GlobalCamera cover tests hard-code the 0.9 s safety timer
 * (duration + 0.5 s); moving to 1.05 s needs those tests updated by the cover owner first.
 */
export const BOOK_FLIP_DURATION = 0.9;

// The shadow band is 60% of the screen tall. yPercent is relative to its own height, so 167 puts its top at the
// bottom edge (fully below the screen) and -100 puts its bottom at the top edge (fully above).
const SHADE_BELOW = 167;
const SHADE_ABOVE = -100;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function BookFlip({ playKey, direction = "open", duration = BOOK_FLIP_DURATION, onMidpoint, onDone, label, testId = "book-flip" }: BookFlipProps) {
  const leafRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const cbRef = useRef({ onMidpoint, onDone });
  cbRef.current = { onMidpoint, onDone };

  useIsoLayoutEffect(() => {
    if (!playKey) return;
    setActive(true);
  }, [playKey]);

  useIsoLayoutEffect(() => {
    if (!active) return;
    const leaf = leafRef.current;
    const shade = shadeRef.current;
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
    const calm = prefersReducedMotion();
    const tl = gsap.timeline({ onComplete: finish });
    // Hinge only: the leaf rotates about its top edge. Symmetric power2.inOut puts the edge-on moment at exactly
    // half the duration, so the midpoint callback lines up with the visual edge-on frame.
    tl.fromTo(
      leaf,
      { rotateX: open ? 0 : -180 },
      { rotateX: open ? -180 : 0, duration, ease: "power2.inOut" },
    );
    // The soft shadow follows the leaf over the page underneath. Reduced motion skips it (same duration, lighter effect).
    if (shade && !calm) {
      const from = open ? SHADE_BELOW : SHADE_ABOVE;
      const to = open ? SHADE_ABOVE : SHADE_BELOW;
      tl.fromTo(shade, { yPercent: from }, { yPercent: to, duration, ease: "power1.inOut" }, 0);
    }
    tl.call(() => midpoint(), [], duration / 2);
    // jsdom has no animation frames worth waiting for; GSAP still completes on its ticker. Safety net only.
    const guard = setTimeout(finish, (duration + 0.5) * 1000);
    return () => {
      clearTimeout(guard);
      tl.kill();
    };
  }, [active, direction, duration]);

  if (!active) return null;
  const open = direction === "open";
  // The start pose is in the markup too, so the first painted frame already matches the tween's start.
  const startDeg = open ? 0 : -180;
  const calm = prefersReducedMotion();
  return (
    <div
      className={`book-flip book-flip--${direction}${calm ? " book-flip--calm" : ""}`}
      data-testid={testId}
      data-direction={direction}
      aria-hidden="true"
    >
      <div
        ref={shadeRef}
        className="book-flip__shade"
        style={{ transform: `translateY(${open ? SHADE_BELOW : SHADE_ABOVE}%)` }}
      />
      <div ref={leafRef} className="book-flip__leaf" style={{ transform: `rotateX(${startDeg}deg)` }}>
        <div className="book-flip__face book-flip__face--front">{label ? <span className="book-flip__label">{label}</span> : null}</div>
        <div className="book-flip__face book-flip__face--back" />
        <div className="book-flip__edge" />
      </div>
    </div>
  );
}
