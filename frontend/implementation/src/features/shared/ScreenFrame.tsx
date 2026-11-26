"use client";

import type { ReactNode } from "react";
import { PaperOverlay } from "./PaperOverlay";

export type ScreenFrameVariant = "cover" | "page";

export interface ScreenFrameProps {
  /** Paper surface variant: "cover" (gray-fiber texture + dot grid) or "page" (cream dot grid). */
  readonly variant?: ScreenFrameVariant;
  readonly className?: string;
  readonly id?: string;
  /** Optional test ID (defaults to "r83-screen-frame"). */
  readonly testId?: string;
  readonly ariaLabel?: string;
  /** Include the shared PaperOverlay singleton (default: true). */
  readonly includePaperOverlay?: boolean;
  readonly children: ReactNode;
}

/**
 * Root r8.3 visual scope container (`[data-ui="r83"]`).
 * Isolates r8.3 CSS tokens, paper surfaces, and PaperOverlay from flag=0 legacy screens.
 */
export function ScreenFrame({
  variant = "page",
  className,
  id,
  testId = "r83-screen-frame",
  ariaLabel,
  includePaperOverlay = true,
  children,
}: ScreenFrameProps) {
  const classes = [
    "r83-screen-frame",
    `r83-screen-frame--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={id}
      data-ui="r83"
      data-variant={variant}
      data-testid={testId}
      className={classes}
      aria-label={ariaLabel}
    >
      {includePaperOverlay ? <PaperOverlay /> : null}
      {children}
    </div>
  );
}
