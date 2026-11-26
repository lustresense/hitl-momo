"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ENDING_COPY } from "@/src/domain/copy/ending";
import {
  BUBBLE_REPLACE_MS,
  createPlacementThrottle,
  measureLiveRect,
  placeRing,
  placementSignature,
} from "@/src/features/shared/bubble-placement";
import type { MomoStageHandle } from "@/src/features/shared/MomoStage";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { NuiRing } from "@/src/nui";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface UnderstandRingProps {
  readonly momoRef: RefObject<MomoStageHandle | null>;
  readonly bubbleRef: RefObject<R83BubbleHandle | null>;
  readonly hintRef: RefObject<HTMLDivElement | null>;
  readonly onConfirm: () => void;
}

/**
 * Ring `"Aku mengerti"` (aturan A, 1000 ms) di bawah bubble Momo pada fase `bicara`.
 * Penempatan memakai `placeRing` ter-throttle 200 ms lewat ref (0 React commit/frame).
 */
export function UnderstandRing({ momoRef, bubbleRef, hintRef, onConfirm }: UnderstandRingProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") return;

    const place = () => {
      const bRect = bubbleRef.current?.rect();
      if (!bRect || bRect.width === 0) return;
      const pos = placeRing({
        anchor: bRect,
        vp: { w: window.innerWidth, h: window.innerHeight },
        ring: { w: host.offsetWidth || 96, h: host.offsetHeight || 112 },
        side: "under",
        anchorIsBubbleUp: bubbleRef.current?.side() === "up",
        avoid: [measureLiveRect(hintRef.current), measureLiveRect(document.getElementById("cam-pip"))],
      });
      host.style.left = `${pos.left}px`;
      host.style.top = `${pos.top}px`;
    };

    const throttle = createPlacementThrottle(BUBBLE_REPLACE_MS);
    let raf = 0;
    const tick = (now: number) => {
      const sig = placementSignature({
        pose: momoRef.current?.pose() ?? null,
        anchor: "ending",
        visible: true,
        textLength: 0,
        hasExtra: false,
        vp: { w: window.innerWidth, h: window.innerHeight },
      });
      if (throttle(now, sig)) place();
      raf = window.requestAnimationFrame(tick);
    };

    const ctx = gsap.context(() => {
      place();
      gsap.fromTo(
        host,
        { opacity: 0, y: 10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.7)" },
      );
    }, host);

    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      ctx.revert();
    };
  }, [bubbleRef, hintRef, momoRef]);

  return (
    <div
      ref={hostRef}
      className="r83-ending-ring-host"
      data-testid="r83-ending-understand-host"
      style={{ position: "fixed", zIndex: 47, left: 0, top: 0 }}
    >
      <NuiRing
        label={ENDING_COPY.bicara.understandLabel}
        holdMs={ENDING_COPY.bicara.understandHoldMs}
        mode="any"
        testId="r83-ending-understand"
        onFire={onConfirm}
      />
    </div>
  );
}
