"use client";

import { useRef, type ReactNode } from "react";
import { useNuiTarget, useOptionalNui } from "@/src/nui/react";

export interface GuessChoiceButtonProps {
  readonly id: string;
  readonly label: string;
  readonly holdMs: number;
  readonly className: string;
  readonly testId: string;
  readonly disabled?: boolean;
  readonly dataAttrs?: Record<string, string | number>;
  readonly onActivate: () => void;
  readonly children: ReactNode;
}

function NuiChoiceButton({
  id,
  label,
  holdMs,
  className,
  testId,
  disabled = false,
  dataAttrs,
  onActivate,
  children,
}: GuessChoiceButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useNuiTarget(ref, {
    id,
    label,
    holdMs,
    mode: "any",
    disabled,
    badge: true,
    trackState: false,
    onFire: onActivate,
  });

  return (
    <button
      ref={ref}
      type="button"
      className={className}
      disabled={disabled}
      data-testid={testId}
      aria-label={label}
      onClick={onActivate}
      {...dataAttrs}
    >
      {children}
    </button>
  );
}

function PlainChoiceButton({
  label,
  className,
  testId,
  disabled = false,
  dataAttrs,
  onActivate,
  children,
}: Omit<GuessChoiceButtonProps, "id" | "holdMs">) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      data-testid={testId}
      aria-label={label}
      onClick={onActivate}
      {...dataAttrs}
    >
      {children}
    </button>
  );
}

/** Tombol pilihan aturan B di dalam GuessPanel, terhubung ke NuiEngine bila NuiProvider tersedia. */
export function GuessChoiceButton(props: GuessChoiceButtonProps) {
  const hasNui = useOptionalNui() !== null;
  return hasNui ? <NuiChoiceButton {...props} /> : <PlainChoiceButton {...props} />;
}
