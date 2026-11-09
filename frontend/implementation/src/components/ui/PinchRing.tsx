"use client";
/**
 * Pinch ring: the thumb ring's twin for the pinch ("cubit") gesture, with the same rules as ThumbConfirm.
 *
 * Camera mode (default, full NUI): the ring fills ONLY while the shared tracker sees a pinch; nothing to click.
 * Fallback mode (camera unusable): the ring is a button that fills while held with mouse, touch, Enter or Space.
 * Letting go drains the ring slowly. A full ring fires onConfirm once; the pinch must be released before the
 * ring can fill again. A pinch still held when the ring mounts does not count, so it cannot carry over from
 * the previous screen.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useHandGesture, useInputMode } from "../../hooks/useHandGesture";
import { Icon } from "./Icon";
import "./PinchRing.css";

export interface PinchRingProps {
  /** Milliseconds of pinch (or press) that fill the ring. */
  holdMs: number;
  onConfirm: () => void;
  /** Short Indonesian caption in the pill under the ring. Also the accessible name. */
  label?: string;
  /** Paused: no tracking, no filling. */
  disabled?: boolean;
  className?: string;
  testId?: string;
}

const R = 28;
const CIRC = 2 * Math.PI * R;
/** Drain speed relative to fill speed once the pinch is lost (same as ThumbConfirm). */
const DRAIN_RATIO = 0.5;
const PULSE_MS = 450;

export function PinchRing({ holdMs, onConfirm, label = "Cubit & tahan", disabled = false, className, testId = "pinch-ring" }: PinchRingProps) {
  const mode = useInputMode();
  const gesture = useHandGesture(!disabled && mode === "camera");
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pulse, setPulse] = useState(false);

  const holding = !disabled && (mode === "camera" ? gesture.pinch : pressing);
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const progressRef = useRef(0);
  // Armed only after it has seen "no pinch" once, so a pinch carried over from the previous screen cannot confirm this one.
  const latchedRef = useRef(true);
  const pulseTimer = useRef<number | null>(null);

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
        const next = held ? Math.min(1, prev + dt / holdMs) : Math.max(0, prev - (dt / holdMs) * DRAIN_RATIO);
        if (next !== prev) {
          progressRef.current = next;
          setProgress(next);
        }
        if (next >= 1) {
          latchedRef.current = true;
          setPulse(true);
          pulseTimer.current = window.setTimeout(() => setPulse(false), PULSE_MS);
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

  useEffect(
    () => () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    },
    [],
  );

  const face = (
    <span className="pinch-ring__face">
      <svg className="pinch-ring__ring" viewBox="0 0 72 72" aria-hidden="true">
        <circle className="pinch-ring__track" cx="36" cy="36" r={R} />
        <circle
          className="pinch-ring__fill"
          cx="36"
          cy="36"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - progress)}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className="pinch-ring__icon">
        <Icon name="hand-draw" size={40} />
      </span>
    </span>
  );
  const pct = Math.round(progress * 100);
  const classes = [
    "pinch-ring",
    `pinch-ring--${mode}`,
    holding ? "is-holding" : "",
    pulse ? "is-confirmed" : "",
    disabled ? "is-disabled" : "",
    className ?? "",
  ].filter(Boolean).join(" ");
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
        <span className="pinch-ring__label">{label}</span>
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
      <span className="pinch-ring__label">{label}</span>
    </button>
  );
}
