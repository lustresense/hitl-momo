"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties, type MouseEvent } from "react";
import { OwnerIcon, type OwnerIconName } from "@/src/components/ui/owner-icons";
import { ringAriaLabel } from "@/src/domain/copy/nui";
import { RING_SVG_RADIUS_PX } from "../core/constants";
import type { TargetMode } from "../core/types";
import { useNuiTarget } from "./useNuiTarget";

const RING_RADIUS = RING_SVG_RADIUS_PX;
const RING_CIRC = (2 * Math.PI * RING_RADIUS).toFixed(4);

export interface NuiRingHandle {
  reset(): void;
  element(): HTMLDivElement | null;
}

export interface NuiRingProps {
  label: string;
  holdMs?: number;
  mode?: TargetMode;
  onFire?: () => void;
  disabled?: boolean;
  icon?: OwnerIconName;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  group?: string;
  /** Reset otomatis setelah menembak (berguna untuk harness berulang). */
  autoResetMs?: number;
}

const preventContext = (e: MouseEvent<HTMLDivElement>): void => {
  e.preventDefault();
};

/**
 * Ring ber-ikon cubit plek 1:1 `ui.js:122-125` + `hand.css`.
 * Progres SVG diisi langsung lewat ref (`strokeDashoffset`) di rAF: NOL React re-render per frame.
 */
export const NuiRing = forwardRef<NuiRingHandle, NuiRingProps>(function NuiRing(
  {
    label,
    holdMs,
    mode = "any",
    onFire,
    disabled = false,
    icon = "gesture-pinch",
    className,
    style,
    testId = "r83-nui-ring",
    group,
    autoResetMs,
  },
  forwardedRef,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<SVGCircleElement | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = useNuiTarget(rootRef, {
    label,
    holdMs,
    mode,
    disabled,
    fillRef,
    badge: false,
    group,
    trackState: false,
    onFire: () => {
      onFire?.();
      if (autoResetMs !== undefined && autoResetMs >= 0) {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          target.reset();
          resetTimerRef.current = null;
        }, autoResetMs);
      }
    },
  });

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      reset: () => target.reset(),
      element: () => rootRef.current,
    }),
    [target],
  );

  const classes = ["thumb-confirm", disabled ? "is-disabled" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div
      ref={rootRef}
      className={classes}
      style={style}
      role="progressbar"
      tabIndex={disabled ? undefined : 0}
      aria-label={ringAriaLabel(label)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      data-testid={testId}
      onContextMenu={preventContext}
    >
      <span className="thumb-confirm__face">
        <svg className="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true">
          <circle className="thumb-confirm__track" cx="36" cy="36" r={RING_RADIUS} />
          <circle
            ref={fillRef}
            className="thumb-confirm__fill"
            cx="36"
            cy="36"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRC}
            strokeDashoffset={RING_CIRC}
            transform="rotate(-90 36 36)"
          />
        </svg>
        <span className="thumb-confirm__thumb">
          <OwnerIcon name={icon} size={30} />
        </span>
      </span>
      <span className="thumb-confirm__label">{label}</span>
    </div>
  );
});
