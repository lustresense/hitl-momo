"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { NUI_LEGEND, type LegendSegment } from "@/src/domain/copy/nui";
import { LEGEND_AUTO_DELAY_MS, LEGEND_BOTTOM_PX, LEGEND_HIDE_MS } from "../core/constants";
import { useNuiStatus } from "./NuiProvider";

/** Alias kompatibilitas; sumber tunggal di `src/nui/core/constants.ts`. */
export const LEGEND_AUTO_HIDE_MS = LEGEND_HIDE_MS;
const SESSION_KEY = "su.nuiLegend";

export interface HandLegendProps {
  /** Tampilkan paksa (mis. di harness dev). */
  forceVisible?: boolean;
  testId?: string;
}

function readSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Legenda kiri-bawah (`#hand-legend`, `bottom: 136px`), port 1:1 `hand.js:198-208` + `hand.css:64-67`.
 * Hanya merespons perubahan kasar (`simOn`, `simToggleCount`, `activeSource`).
 */
export function HandLegend({ forceVisible = false, testId = "r83-hand-legend" }: HandLegendProps) {
  const status = useNuiStatus();
  const [visible, setVisible] = useState(forceVisible);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (forceVisible) {
      setVisible(true);
      return;
    }
    if (readSeen()) return;
    const showTimer = setTimeout(() => {
      markSeen();
      setVisible(true);
      timerRef.current = setTimeout(() => setVisible(false), LEGEND_AUTO_HIDE_MS);
    }, LEGEND_AUTO_DELAY_MS);
    return () => {
      clearTimeout(showTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [forceVisible]);

  useEffect(() => {
    if (status.simToggleCount === 0) return;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!forceVisible) setVisible(false);
    }, LEGEND_AUTO_HIDE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status.simToggleCount, forceVisible]);

  const readyHand = status.handAttached && status.detectorState !== "starting";
  const isHand = status.activeSource === "hand" || readyHand;
  const segments: readonly LegendSegment[] = isHand
    ? NUI_LEGEND.handSegments
    : status.handAttached && status.detectorState === "starting"
      ? [{ text: "Menyiapkan pelacak tangan...", bold: false }]
      : status.simOn
        ? status.devTools
          ? NUI_LEGEND.simOnSegments
          : NUI_LEGEND.simOnBaseSegments
        : NUI_LEGEND.simOffSegments;

  return (
    <div
      id="hand-legend"
      role="status"
      aria-live="polite"
      data-nui-off="true"
      data-testid={testId}
      className={visible ? "on" : undefined}
    >
      {segments.map((seg, i) => (
        <Fragment key={i}>{seg.bold ? <b>{seg.text}</b> : seg.text}</Fragment>
      ))}
    </div>
  );
}
