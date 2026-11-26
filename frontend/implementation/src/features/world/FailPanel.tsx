"use client";

import { useCallback, useRef } from "react";
import gsap from "gsap";
import { WORLD_COPY } from "@/src/domain/copy/world";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import { useNuiStatus, useNuiTarget } from "@/src/nui";
import { prefersReducedMotion, useIsoLayoutEffect } from "./world-ui-helpers";

export interface FailPanelProps {
  readonly onRetry: () => void;
  readonly onReposition: () => void;
  readonly onRedraw: () => void;
}

const FAIL_TARGET_HOLD_MS = HOLD_MS_DEFAULT;

/**
 * Panel gagal di dalam bubble Momo (`play.js:76-85`, `112-r83-paper.css:857-875`).
 * Tiga pilihan memakai Aturan B (terdekat menyala, kunci saat cubit, tahan 1000 ms).
 */
export function FailPanel({ onRetry, onReposition, onRedraw }: FailPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const placeRef = useRef<HTMLButtonElement | null>(null);
  const drawRef = useRef<HTMLButtonElement | null>(null);
  const pickedRef = useRef(false);
  const nuiStatus = useNuiStatus();

  const pickOnce = useCallback((fn: () => void) => {
    if (pickedRef.current) return;
    pickedRef.current = true;
    fn();
  }, []);

  useNuiTarget(retryRef, {
    id: "r83-fail-retry",
    label: WORLD_COPY.fail.actions.retry,
    holdMs: FAIL_TARGET_HOLD_MS,
    mode: "any",
    badge: true,
    group: "world-fail",
    trackState: false,
    onFire: () => pickOnce(onRetry),
  });

  useNuiTarget(placeRef, {
    id: "r83-fail-place",
    label: WORLD_COPY.fail.actions.place,
    holdMs: FAIL_TARGET_HOLD_MS,
    mode: "any",
    badge: true,
    group: "world-fail",
    trackState: false,
    onFire: () => pickOnce(onReposition),
  });

  useNuiTarget(drawRef, {
    id: "r83-fail-draw",
    label: WORLD_COPY.fail.actions.draw,
    holdMs: FAIL_TARGET_HOLD_MS,
    mode: "any",
    badge: true,
    group: "world-fail",
    trackState: false,
    onFire: () => pickOnce(onRedraw),
  });

  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(el, { opacity: 0, y: 8, duration: 0.4, delay: 0.35, ease: "power2.out" });
    }, el);
    return () => ctx.revert();
  }, []);

  const handleFallbackClick = (fn: () => void) => {
    if (!nuiStatus.simOn && !nuiStatus.handAttached) pickOnce(fn);
  };

  return (
    <div ref={rootRef} className="fail-ask" data-testid="r83-fail-panel">
      <span className="k-kicker">{WORLD_COPY.fail.kicker}</span>
      <h2 className="k-title">{WORLD_COPY.fail.title}</h2>
      <p className="k-text">{WORLD_COPY.fail.prompt}</p>
      <div className="row">
        <button
          ref={retryRef}
          type="button"
          className="nb-btn primary"
          data-a="retry"
          data-testid="r83-fail-retry"
          onClick={() => handleFallbackClick(onRetry)}
        >
          {WORLD_COPY.fail.actions.retry}
        </button>
        <button
          ref={placeRef}
          type="button"
          className="nb-btn"
          data-a="place"
          data-testid="r83-fail-place"
          onClick={() => handleFallbackClick(onReposition)}
        >
          {WORLD_COPY.fail.actions.place}
        </button>
        <button
          ref={drawRef}
          type="button"
          className="nb-btn"
          data-a="draw"
          data-testid="r83-fail-draw"
          onClick={() => handleFallbackClick(onRedraw)}
        >
          {WORLD_COPY.fail.actions.draw}
        </button>
      </div>
    </div>
  );
}
