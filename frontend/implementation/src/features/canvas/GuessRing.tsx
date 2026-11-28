"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import {
  BUBBLE_REPLACE_MS,
  RING_DEFAULT_H,
  RING_DEFAULT_W,
  createPlacementThrottle,
  measureLiveRect,
  placeRing,
  type Rect,
} from "@/src/features/shared/bubble-placement";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { HOLD_MS_DECISION } from "@/src/nui/core/constants";
import { NuiRing, useOptionalNui, useNuiStatus } from "@/src/nui/react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface GuessRingProps {
  readonly visible: boolean;
  readonly getDrawingRect: () => Rect | null;
  readonly bubbleRef?: RefObject<R83BubbleHandle | null>;
  readonly onSubmit: () => void;
  readonly testId?: string;
}

function FallbackGuessRingButton({ onSubmit, testId }: { readonly onSubmit: () => void; readonly testId: string }) {
  return (
    <button
      type="button"
      className="thumb-confirm"
      data-testid={testId}
      aria-label={`${CANVAS_COPY.momo.guessRingLabel}, cubit dan tahan`}
      onClick={onSubmit}
    >
      <span className="thumb-confirm__face">
        <span className="thumb-confirm__thumb">
          <OwnerIcon name="gesture-pinch" size={30} />
        </span>
      </span>
      <span className="thumb-confirm__label">{CANVAS_COPY.momo.guessRingLabel}</span>
    </button>
  );
}

function NuiGuessRingInner({
  onSubmit,
  testId,
}: {
  readonly onSubmit: () => void;
  readonly testId: string;
}) {
  const status = useNuiStatus();
  const canClickFallback = !status.simOn && !status.handAttached && status.activeSource !== "hand";

  return (
    <div onClick={canClickFallback ? onSubmit : undefined}>
      <NuiRing
        label={CANVAS_COPY.momo.guessRingLabel}
        holdMs={HOLD_MS_DECISION}
        mode="point"
        onFire={onSubmit}
        testId={testId}
      />
    </div>
  );
}

/**
 * Ring `"Tebak Gambarku"` 2000 ms (`mode: "point"`), muncul 1000 ms setelah tangan diam
 * bila kertas memiliki tinta (`GUESS_IDLE_MS = 1000`, O-14). Diposisikan di samping kotak gambar.
 */
export function GuessRing({
  visible,
  getDrawingRect,
  bubbleRef,
  onSubmit,
  testId = "r83-guess-ring",
}: GuessRingProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hasNui = useOptionalNui() !== null;
  const cfgRef = useRef({ getDrawingRect, bubbleRef });
  cfgRef.current = { getDrawingRect, bubbleRef };

  // The ring pops in (edge false -> true, once per appearance).
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) audio.emit("ui.ring_in");
    wasVisibleRef.current = visible;
  }, [visible]);

  const placeNow = useCallback(() => {
    const el = hostRef.current;
    if (!el || typeof window === "undefined") return;
    const anchor = cfgRef.current.getDrawingRect();
    if (!anchor) return;
    const avoid = [
      cfgRef.current.bubbleRef?.current?.rect(),
      measureLiveRect(document.querySelector("#cam-pip, .r83-cam-pip")),
      measureLiveRect(document.querySelector("#su-hint, .r83-hint")),
      measureLiveRect(document.getElementById("skipbar")),
    ];
    const layout = placeRing({
      anchor,
      vp: { w: window.innerWidth, h: window.innerHeight },
      ring: { w: el.offsetWidth || RING_DEFAULT_W, h: el.offsetHeight || RING_DEFAULT_H },
      side: "side",
      avoid,
    });
    el.style.left = `${layout.left}px`;
    el.style.top = `${layout.top}px`;
  }, []);

  useIsoLayoutEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const el = hostRef.current;
    if (!el) return;
    placeNow();

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 10, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.7)" },
      );
    }, el);

    const throttle = createPlacementThrottle(BUBBLE_REPLACE_MS);
    let raf = 0;
    const tick = (now: number) => {
      const a = cfgRef.current.getDrawingRect();
      const sig = a
        ? `${Math.round(a.left)},${Math.round(a.top)},${Math.round(a.width)}x${Math.round(a.height)},${window.innerWidth}x${window.innerHeight}`
        : "none";
      if (throttle(now, sig)) placeNow();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", placeNow);

    return () => {
      ctx.revert();
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", placeNow);
    };
  }, [visible, placeNow]);

  if (!visible) return null;

  return (
    <div ref={hostRef} className="r83-guess-ring-host" data-testid="r83-guess-ring-host">
      {hasNui ? (
        <NuiGuessRingInner onSubmit={onSubmit} testId={testId} />
      ) : (
        <FallbackGuessRingButton onSubmit={onSubmit} testId={testId} />
      )}
    </div>
  );
}
