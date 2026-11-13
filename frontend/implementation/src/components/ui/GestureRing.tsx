"use client";
/**
 * Generic NUI confirm ring for the screens that have no cursor: a finger pose (1, 2, 3 fingers, thumb, pinch) fills
 * the ring, and a full ring fires onConfirm once.
 *
 * The caller decides when the pose counts: `active` is true while the requested pose is on screen. The caller owns
 * the shared hand tracker, so this ring never starts one. A press (mouse, touch, Enter or Space) fills the ring the
 * same way, for the fallback mode and for a student who does not use the camera.
 *
 * Latch: after a confirm the pose (or press) must be released once before the ring can fill again. A pose still held
 * when the ring mounts, or still held through a lock, does not count until it is released. A short pose drains the
 * ring slowly instead of resetting it, so a flicker of the hand does not restart the count.
 *
 * Locked: the ring stays on screen, grey with a padlock, and never fills. `lockedProgress` (0..1) shows a reading
 * pause in the same ring, so the student sees why it is not ready yet.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useInputMode } from "../../hooks/useHandGesture";
import { Icon } from "./Icon";
import "./GestureRing.css";

export interface GestureRingProps {
  /** The requested pose is on screen right now (the caller's check, e.g. pose === "one-finger"). */
  active: boolean;
  /** How long the pose (or press) must be held to fire. Must not be shortened for tests: use fake timers. */
  holdMs: number;
  onConfirm: () => void;
  /** Short Indonesian caption; also the accessible name of the button. */
  label: string;
  /** Glyph inside the dial, e.g. a FingerGlyph or an Icon. */
  icon?: ReactNode;
  /** Body content beside the dial (e.g. a candidate's label and percent). Without it the label is the caption. */
  children?: ReactNode;
  /** Grey, padlocked, never fills. The lock is visible before the ring is ready. */
  locked?: boolean;
  /** 0..1 progress of a reading pause, shown in the grey ring while locked. */
  lockedProgress?: number;
  /** Paused: no filling, no confirm, no visible progress. */
  disabled?: boolean;
  /** aria-pressed for a choice that is selected but not yet committed. */
  pressed?: boolean;
  /** aria-expanded for a control that opens a list. */
  expanded?: boolean;
  className?: string;
  drainImmediate?: boolean;
  testId?: string;
}

const VIEW = 64;
const R = 27;
const CIRC = 2 * Math.PI * R;
/** Drain speed relative to fill speed when the pose is lost. */
export const GESTURE_RING_DRAIN_RATIO = 0.5;
const PULSE_MS = 450;

export function GestureRing({
  active,
  holdMs,
  onConfirm,
  label,
  icon,
  children,
  locked = false,
  lockedProgress = 0,
  disabled = false,
  pressed,
  expanded,
  className,
  drainImmediate = false,
  testId = "gesture-ring",
}: GestureRingProps) {
  const mode = useInputMode();
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pulse, setPulse] = useState(false);

  const inert = disabled || locked;
  // The physical hold: a pose or a press. It arms and releases the latch even while the ring is inert.
  const raw = active || pressing;
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const inertRef = useRef(inert);
  inertRef.current = inert;
  const holdMsRef = useRef(holdMs);
  holdMsRef.current = holdMs;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const progressRef = useRef(0);
  // Armed only after the hold was seen released once: a pose carried over from the previous screen cannot confirm this one.
  const armedRef = useRef(false);
  const pulseTimer = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(Math.max(now - last, 0), 100);
      last = now;
      if (!rawRef.current) armedRef.current = true;
      // A hold that is already there while the ring is locked does not count after the unlock.
      else if (inertRef.current) armedRef.current = false;
      const filling = rawRef.current && armedRef.current && !inertRef.current;
      const prev = progressRef.current;
      const next = filling
        ? Math.min(1, prev + dt / holdMsRef.current)
        : (drainImmediate ? 0 : Math.max(0, prev - (dt / holdMsRef.current) * GESTURE_RING_DRAIN_RATIO));
      if (next >= 1) {
        // Full ring: fire once, then latch until the hold is released.
        armedRef.current = false;
        progressRef.current = 0;
        setProgress(0);
        setPulse(true);
        if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
        pulseTimer.current = window.setTimeout(() => setPulse(false), PULSE_MS);
        onConfirmRef.current();
      } else if (next !== prev) {
        progressRef.current = next;
        setProgress(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
      pulseTimer.current = null;
    };
  }, []);

  useEffect(() => {
    if (disabled) setPressing(false);
  }, [disabled]);

  const shown = locked ? lockedProgress : progress;
  const pct = Math.round(Math.min(1, Math.max(0, shown)) * 100);
  const state = disabled ? "disabled" : locked ? "locked" : pulse ? "confirmed" : progress > 0 ? "filling" : "idle";

  const stop = () => setPressing(false);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!inert) setPressing(true);
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      stop();
    }
  };

  const classes = [
    "gesture-ring",
    `gesture-ring--${state}`,
    `gesture-ring--${mode}`,
    progress > 0 && !locked ? "is-filling" : "",
    pulse ? "is-confirmed" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      data-testid={testId}
      data-state={state}
      data-mode={mode}
      data-progress={pct}
      data-hold-ms={holdMs}
      aria-label={label}
      aria-disabled={inert || undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!inert) setPressing(true);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="gesture-ring__dial" aria-hidden="true">
        <svg className="gesture-ring__svg" viewBox={`0 0 ${VIEW} ${VIEW}`}>
          <circle className="gesture-ring__track" cx={VIEW / 2} cy={VIEW / 2} r={R} />
          <circle
            className={locked ? "gesture-ring__fill gesture-ring__fill--locked" : "gesture-ring__fill"}
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - shown)}
            transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
          />
        </svg>
        <span className="gesture-ring__icon">{icon}</span>
        {locked && (
          <span className="gesture-ring__lock">
            <Icon name="lock" size={14} stroke={2.6} />
          </span>
        )}
      </span>
      <span className="gesture-ring__body">
        {children ?? <span className="gesture-ring__caption">{label}</span>}
      </span>
    </button>
  );
}

/**
 * N upright fingers in a row: a count the student can read at a glance, not a drawing of a hand.
 * Used as the icon of the pose rings (1, 2, 3 fingers, 5 = open palm).
 */
export function FingerGlyph({ count, size = 30 }: { count: 1 | 2 | 3 | 4 | 5; size?: number }) {
  if (count === 1) {
    return (
      <svg className="finger-glyph finger-glyph--1" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <rect x="12" y="4" width="4" height="12" rx="2" fill="currentColor" />
        <path d="M8 12h12v9a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  if (count === 2) {
    return (
      <svg className="finger-glyph finger-glyph--2" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <rect x="9" y="4" width="3.5" height="12" rx="1.75" fill="currentColor" />
        <rect x="15.5" y="4" width="3.5" height="12" rx="1.75" fill="currentColor" />
        <path d="M7 12h14v9a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  if (count === 3) {
    return (
      <svg className="finger-glyph finger-glyph--3" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <rect x="7" y="4" width="3.2" height="12" rx="1.6" fill="currentColor" />
        <rect x="12.4" y="3" width="3.2" height="13" rx="1.6" fill="currentColor" />
        <rect x="17.8" y="4" width="3.2" height="12" rx="1.6" fill="currentColor" />
        <path d="M6 12h16v9a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  return (
    <svg className="finger-glyph finger-glyph--palm" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <path d="M6 11h16v10a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="currentColor" opacity="0.85" />
      <rect x="5" y="6" width="3" height="8" rx="1.5" fill="currentColor" />
      <rect x="9.5" y="3.5" width="3" height="10" rx="1.5" fill="currentColor" />
      <rect x="14" y="3" width="3" height="10.5" rx="1.5" fill="currentColor" />
      <rect x="18.5" y="4.5" width="3" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}
