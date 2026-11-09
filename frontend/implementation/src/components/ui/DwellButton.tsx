"use client";
/**
 * NUI button for the screens. A fingertip selects it by resting on it (the ring fills, then it fires once).
 * A mouse, touch or keyboard press fires it at once. Camera mode shows the ring; fallback mode is a plain button.
 * The button is always a real <button>, so focus, Enter/Space and screen readers keep working.
 */
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { DEFAULT_DWELL_MS, useDwell } from "../../hooks/useDwell";
import "./DwellButton.css";

export interface DwellButtonProps {
  onActivate: () => void;
  /** How long a resting fingertip takes to fire it. */
  dwellMs?: number;
  /** Visible text. With iconOnly it is kept for screen readers only. */
  children: ReactNode;
  /** Glyph shown inside the ring. */
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  testId?: string;
  /** Accessible name. Defaults to the text when children is a plain string. */
  label?: string;
  /** Tooltip (title attribute). */
  title?: string;
  pressed?: boolean;
  expanded?: boolean;
  /** A corner or close control: the size comes from the parent's class, the text is hidden. */
  iconOnly?: boolean;
  /** "accent" = the orange kit face; "cue" = the orange thumb pill on the mission hint. */
  tone?: "accent" | "cue";
  /** The parent draws the frame (border, face, shadow); this button is only the hit target. */
  bare?: boolean;
}

const R = 17;
const CIRC = 2 * Math.PI * R;

export const DwellButton = forwardRef<HTMLButtonElement, DwellButtonProps>(function DwellButton(
  {
    onActivate,
    dwellMs = DEFAULT_DWELL_MS,
    children,
    icon,
    disabled = false,
    className,
    testId,
    label,
    title,
    pressed,
    expanded,
    iconOnly = false,
    tone,
    bare = false,
  },
  forwardedRef,
) {
  const ref = useRef<HTMLButtonElement>(null);
  // Callers (a dialog's focus on open) get the real button through the same ref.
  useImperativeHandle(forwardedRef, () => ref.current as HTMLButtonElement);
  const { mode, progress } = useDwell({ ref, onActivate, dwellMs, enabled: !disabled });
  const name = label ?? (typeof children === "string" ? children : undefined);
  const classes = [
    "dwell-btn",
    `dwell-btn--${mode}`,
    progress > 0 ? "is-filling" : "",
    disabled ? "is-disabled" : "",
    iconOnly ? "dwell-btn--icon-only" : "",
    tone ? `dwell-btn--${tone}` : "",
    bare ? "dwell-btn--bare" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      data-testid={testId}
      data-nui-target=""
      data-mode={mode}
      data-progress={Math.round(progress * 100)}
      aria-label={name}
      aria-pressed={pressed}
      aria-expanded={expanded}
      title={title}
      disabled={disabled}
      onClick={() => onActivate()}
    >
      <span className="dwell-btn__ring" aria-hidden="true">
        {mode === "camera" && (
          <svg className="dwell-btn__svg" viewBox="0 0 48 48">
            <circle className="dwell-btn__track" cx="24" cy="24" r={R} />
            <circle
              className="dwell-btn__fill"
              cx="24"
              cy="24"
              r={R}
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
              transform="rotate(-90 24 24)"
            />
          </svg>
        )}
        {icon && <span className="dwell-btn__icon">{icon}</span>}
      </span>
      <span className="dwell-btn__text">{children}</span>
    </button>
  );
});
