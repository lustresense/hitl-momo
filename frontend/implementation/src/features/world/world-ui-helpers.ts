"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { WORLD_LEVEL_COPY, normalizeWorldStage } from "@/src/domain/copy/world";
import {
  BUBBLE_REPLACE_MS,
  RING_DEFAULT_H,
  RING_DEFAULT_W,
  createPlacementThrottle,
  measureLiveRect,
  placeRing,
  type Rect,
  type RingSide,
} from "@/src/features/shared/bubble-placement";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Always returns `false` to preserve 1:1 `sandbox-r8.3` GSAP choreography parity
 * across world scenes (including on Windows devices where OS "Animation Effects" is disabled).
 */
export function prefersReducedMotion(): boolean {
  return false;
}

const MOOD_MAP: Record<string, MomoExpression> = {
  Senang: "Senang",
  Tenang: "Senang",
  Semangat: "Semangat",
  Bangga: "Bangga",
  Penasaran: "Penasaran",
  Bingung: "Bingung",
  Khawatir: "Khawatir",
  Berpikir: "Berpikir",
  Kaget: "Kaget",
  Terkejut: "Terkejut",
  Sedih: "Sedih",
};

/** Memetakan ekspresi sandbox r8.3 ke `MomoExpression` pada `momo-engine.ts`. */
export function mapWorldMood(mood: string): MomoExpression {
  return MOOD_MAP[mood] ?? "Senang";
}

/** Label papan petunjuk ujung level untuk `StageArtwork` ("Level 2" / "Level 3", L3 tetap "Pusat Halaman"). */
export function worldNextStageLabel(stage: number): string | undefined {
  return WORLD_LEVEL_COPY[normalizeWorldStage(stage)].signpostNextLabel;
}

export function elementRect(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0
    ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    : null;
}

export interface PinnedRingOptions {
  readonly enabled: boolean;
  readonly side: RingSide;
  readonly getAnchorRect: () => Rect | null;
  readonly bubbleRef?: RefObject<R83BubbleHandle | null>;
  readonly anchorIsBubble?: boolean;
  readonly hintSelector?: string;
}

/** Menempatkan `NuiRing` di samping objek atau di bawah bubble Momo via DOM ref (0 React state per frame). */
export function usePinnedRingPosition(
  ringRef: RefObject<HTMLDivElement | null>,
  options: PinnedRingOptions,
): void {
  const { enabled, side, getAnchorRect, bubbleRef, anchorIsBubble = false, hintSelector = ".r83-hint" } = options;

  useIsoLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const throttle = createPlacementThrottle(BUBBLE_REPLACE_MS);
    let raf = 0;

    const placeNow = () => {
      const el = ringRef.current;
      if (!el) return;
      const anchor = getAnchorRect();
      const vp = { w: window.innerWidth, h: window.innerHeight };
      if (!anchor) return;
      const hintEl = document.querySelector(hintSelector);
      const skipEl = document.getElementById("skipbar");
      const pipEl = document.getElementById("cam-pip");
      const bubbleEl = bubbleRef?.current?.element() ?? null;
      const avoid = [
        measureLiveRect(hintEl),
        measureLiveRect(skipEl),
        measureLiveRect(pipEl),
        anchorIsBubble ? null : measureLiveRect(bubbleEl),
      ];
      const bubbleUp = anchorIsBubble && bubbleRef?.current?.side() === "up";
      const pos = placeRing({
        anchor,
        vp,
        ring: { w: el.offsetWidth || RING_DEFAULT_W, h: el.offsetHeight || RING_DEFAULT_H },
        side,
        anchorIsBubbleUp: bubbleUp,
        avoid,
      });
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
    };

    const tick = (now: number) => {
      const anchor = getAnchorRect();
      const sig = anchor
        ? `${anchor.left.toFixed(1)},${anchor.top.toFixed(1)},${anchor.width.toFixed(1)},${anchor.height.toFixed(1)},${window.innerWidth}x${window.innerHeight}`
        : `none,${window.innerWidth}x${window.innerHeight}`;
      if (throttle(now, sig)) placeNow();
      raf = window.requestAnimationFrame(tick);
    };

    placeNow();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", placeNow);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", placeNow);
    };
  }, [enabled, side, getAnchorRect, bubbleRef, anchorIsBubble, hintSelector, ringRef]);
}
