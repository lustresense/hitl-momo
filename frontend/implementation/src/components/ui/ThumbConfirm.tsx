"use client";
/**
 * PRD 0.0.16 R4 — thumbs-up confirmation with a progress ring (replaces gesture-cue).
 *
 * Camera mode (default, full NUI): the ring fills ONLY while the shared tracker sees a thumbs-up;
 * nothing to click. Fallback mode (R13, camera unusable): the thumb is a button that fills while
 * held with mouse, touch, Enter or Space for the same duration.
 * Losing the thumb drains the ring slowly (not straight to zero). Full ring = pulse + onConfirm once;
 * the thumb must be released before the ring can fill again. A newly mounted ring is armed only after it has seen
 * no thumb once, so a thumb carried over from the previous screen cannot confirm the next one.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useHandGesture, useInputMode } from "../../hooks/useHandGesture";
import { Icon } from "./Icon";

export interface ThumbConfirmProps {
  /** 1000 = conversation step, 2000 = real decision. */
  holdMs: 1000 | 2000;
  onConfirm: () => void;
  /** Short Indonesian caption under the thumb, e.g. "Tahan jempol". Also the accessible name. */
  label?: string;
  /** Paused: no tracking, no filling. */
  disabled?: boolean;
  className?: string;
  testId?: string;
  /**
   * A screen that already runs the hand tracker (the drawing surface) passes its thumbs-up here, so this ring
   * does not start a second tracker. When given, this ring never acquires the shared tracker.
   */
  externalThumbUp?: boolean;
}

const R = 30;
const CIRC = 2 * Math.PI * R;
/** Drain speed relative to fill speed when the thumb is lost. */
export const THUMB_DRAIN_RATIO = 0.5;

export function ThumbConfirm({
  holdMs,
  onConfirm,
  label = "Tahan jempol",
  disabled = false,
  className,
  testId = "thumb-confirm",
  externalThumbUp,
}: ThumbConfirmProps) {
  const mode = useInputMode();
  // The hook is always called; with an external thumb it is simply inactive (no shared tracker).
  const gesture = useHandGesture(!disabled && mode === "camera" && externalThumbUp === undefined);
  const thumbUp = externalThumbUp ?? gesture.thumbUp;
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pulse, setPulse] = useState(false);

  const holding = !disabled && (mode === "camera" ? thumbUp : pressing);
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const progressRef = useRef(0);
  // Armed only after it has seen "no thumb" once: a thumb still held from the previous screen's
  // confirm must not fill a newly mounted ring (same rule as after a confirm).
  const latchedRef = useRef(true);

  useEffect(() => {
    if (disabled) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(Math.max(now - last, 0), 100);
      last = now;
      const held = holdingRef.current;
      if (latchedRef.current) {
        if (!held) {
          latchedRef.current = false;
          progressRef.current = 0;
          setProgress(0);
        }
      } else {
        const prev = progressRef.current;
        const next = held ? Math.min(1, prev + dt / holdMs) : Math.max(0, prev - (dt / holdMs) * THUMB_DRAIN_RATIO);
        if (next !== prev) {
          progressRef.current = next;
          setProgress(next);
        }
        if (next >= 1) {
          latchedRef.current = true;
          setPulse(true);
          window.setTimeout(() => setPulse(false), 450);
          onConfirmRef.current();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [disabled, holdMs]);

  useEffect(() => {
    if (disabled) setPressing(false);
  }, [disabled]);

  const ring = (
    <svg className="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle className="thumb-confirm__track" cx="36" cy="36" r={R} />
      <circle
        className="thumb-confirm__fill"
        cx="36"
        cy="36"
        r={R}
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - progress)}
        transform="rotate(-90 36 36)"
      />
    </svg>
  );
  const face = (
    <span className="thumb-confirm__face">
      {ring}
      <span className="thumb-confirm__thumb"><Icon name="thumb-up" size={30} /></span>
    </span>
  );
  const classes = [
    "thumb-confirm",
    `thumb-confirm--${mode}`,
    holding ? "is-holding" : "",
    pulse ? "is-confirmed" : "",
    disabled ? "is-disabled" : "",
    className ?? "",
  ].filter(Boolean).join(" ");
  const pct = Math.round(progress * 100);
  const common = {
    className: classes,
    "data-testid": testId,
    "data-mode": mode,
    "data-hold-ms": holdMs,
    "data-progress": pct,
  };

  if (mode === "camera") {
    return (
      <div {...common} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        {face}
        <span className="thumb-confirm__label">{label}</span>
      </div>
    );
  }

  const stop = () => setPressing(false);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPressing(true);
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      stop();
    }
  };
  return (
    <button
      {...common}
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        setPressing(true);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {face}
      <span className="thumb-confirm__label">{label}</span>
    </button>
  );
}
