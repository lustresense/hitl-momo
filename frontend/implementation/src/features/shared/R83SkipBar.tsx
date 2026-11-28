"use client";

import { audio } from "@/src/audio";
import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Keputusan saklar tombol "Lewati" untuk seluruh shell (lihat `src/config/skip-button.ts`).
 * `null` = tidak ada shell (layar dirender sendiri, mis. di test): ikut prop `visible`.
 */
export const SkipButtonVisibilityContext = createContext<boolean | null>(null);

/** Satu tekanan = satu adegan: tekanan beruntun yang lebih rapat dari ini diabaikan. */
const SKIP_REPEAT_GUARD_MS = 250;

export interface R83SkipBarProps {
  readonly label: string;
  readonly onSkip: () => void;
  readonly visible?: boolean;
  readonly align?: "center" | "right";
  readonly buttonLabel?: string;
  readonly buttonTestId?: string;
}

/**
 * Bilah lewati demo/dev ala `sandbox-r8.3` (`#skipbar`): label = adegan yang sedang jalan,
 * satu tekanan menyelesaikan adegan itu saja, lalu adegan berikutnya berjalan normal.
 * Selalu diabaikan NUI (`#skipbar`, `data-nui-off`).
 * Alt+Q sama dengan menekan tombolnya (kursor mouse disembunyikan saat mode tangan).
 */
export function R83SkipBar({
  label,
  onSkip,
  visible = true,
  align = "center",
  buttonLabel = "Lewati ›",
  buttonTestId = "r83-skipbar-btn",
}: R83SkipBarProps) {
  const shellDecision = useContext(SkipButtonVisibilityContext);
  const shown = shellDecision ?? visible;
  const lastPressRef = useRef<{ label: string; at: number } | null>(null);
  const pressRef = useRef<() => void>(() => undefined);
  pressRef.current = () => {
    const now = Date.now();
    const last = lastPressRef.current;
    // A double press must not run the same scene's skip twice (it would throw or skip two scenes).
    if (last && last.label === label && now - last.at < SKIP_REPEAT_GUARD_MS) return;
    lastPressRef.current = { label, at: now };
    audio.interrupt();
    audio.emit("ui.skip");
    onSkip();
  };

  // The listener lives with the bar: when the switch hides the bar, the shortcut is off too.
  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyQ" || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      if (!e.repeat) pressRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      id="skipbar"
      className={align === "right" ? "is-right" : undefined}
      data-nui-off="true"
      data-testid="r83-skipbar"
    >
      <span id="sk-label" data-testid="r83-skipbar-label">
        {label}
      </span>
      <button
        id="skip"
        type="button"
        className="nb-btn"
        data-nui-off="true"
        data-testid={buttonTestId}
        aria-label={`Lewati ${label}`}
        aria-keyshortcuts="Alt+Q"
        title="Alt+Q"
        onClick={(e) => {
          e.currentTarget.blur();
          pressRef.current();
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
