"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import type { DrawingStamp } from "@/src/components/drawing/DrawingScreen";
import { audio } from "@/src/audio";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import {
  BUBBLE_REPLACE_MS,
  createPlacementThrottle,
  measureLiveRect,
  placeRing,
  type Rect,
} from "@/src/features/shared/bubble-placement";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { STAMP_THROW_MS, STICKER_RING_MS, THROW_TRAVEL } from "@/src/nui/core/constants";
import { NuiRing, useFlick, useOptionalNui } from "@/src/nui/react";
import { formatObjectLabel } from "./guess-model";
import { StrokePreview } from "./StrokePreview";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface StickerStageProps {
  readonly stamp: DrawingStamp;
  readonly bubbleRef?: RefObject<R83BubbleHandle | null>;
  readonly onThrowStart?: () => void;
  readonly testId?: string;
}

function StickerFlickBinder({
  enabled,
  onFlick,
}: {
  readonly enabled: boolean;
  readonly onFlick: () => void;
}) {
  useFlick(onFlick, { enabled });
  return null;
}

function FallbackStickerRings({
  onThrow,
  onRedraw,
}: {
  readonly onThrow: () => void;
  readonly onRedraw: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="thumb-confirm r-throw"
        data-testid="r83-sticker-throw"
        aria-label={`${CANVAS_COPY.sticker.throwLabel}, cubit dan tahan`}
        onClick={onThrow}
      >
        <span className="thumb-confirm__face">
          <span className="thumb-confirm__thumb">
            <OwnerIcon name="gesture-pinch" size={30} />
          </span>
        </span>
        <span className="thumb-confirm__label">{CANVAS_COPY.sticker.throwLabel}</span>
      </button>
      <button
        type="button"
        className="thumb-confirm r-redraw"
        data-testid="r83-sticker-redraw"
        aria-label={`${CANVAS_COPY.sticker.redrawLabel}, cubit dan tahan`}
        onClick={onRedraw}
      >
        <span className="thumb-confirm__face">
          <span className="thumb-confirm__thumb">
            <OwnerIcon name="gesture-pinch" size={30} />
          </span>
        </span>
        <span className="thumb-confirm__label">{CANVAS_COPY.sticker.redrawLabel}</span>
      </button>
    </>
  );
}

/**
 * Stiker hasil gambar r8.3 (`stamp.js`).
 * Sentil ke atas (`useFlick`, 50 px / 160 ms) atau ring "Lempar" (efektif 1000 ms) →
 * animasi `STAMP_THROW_MS = 1200 ms` / `THROW_TRAVEL = 0.6` → `stamp.onThrow()`.
 * Ring "Gambar lagi" (efektif 1000 ms) atau tombol G → `stamp.onRedraw()`.
 */
export function StickerStage({ stamp, bubbleRef, onThrowStart, testId = "r83-sticker" }: StickerStageProps) {
  const hasNui = useOptionalNui() !== null;
  const stickerRef = useRef<HTMLDivElement | null>(null);
  const ringsRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<"ready" | "throwing" | "redrawing">("ready");
  const committedRef = useRef(false);
  const onThrowRef = useRef(stamp.onThrow);
  onThrowRef.current = stamp.onThrow;
  const onRedrawRef = useRef(stamp.onRedraw);
  onRedrawRef.current = stamp.onRedraw;
  const onThrowStartRef = useRef(onThrowStart);
  onThrowStartRef.current = onThrowStart;

  useEffect(() => {
    committedRef.current = false;
    setStage("ready");
  }, [stamp.label, stamp.drawingInput]);

  const displayLabel = formatObjectLabel(stamp.label);

  const triggerThrow = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    audio.emit("sticker.throw");
    setStage("throwing");
  }, []);

  const triggerRedraw = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    audio.emit("sticker.shrink");
    setStage("redrawing");
  }, []);

  // Keyboard 'g'/'G' triggers redraw (stamp.js:44).
  useEffect(() => {
    if (stage !== "ready") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "g" || e.key === "G") triggerRedraw();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, triggerRedraw]);

  // The sticker pops in once per stage instance (the wobble loop below stays silent; ref survives StrictMode re-runs).
  const poppedRef = useRef(false);
  useEffect(() => {
    if (poppedRef.current) return;
    poppedRef.current = true;
    audio.emit("sticker.pop");
  }, []);

  // Entrance + wobble animation while ready (stamp.js:28-30).
  useIsoLayoutEffect(() => {
    const st = stickerRef.current;
    if (!st || stage !== "ready" || typeof window === "undefined") return;
    const ctx = gsap.context(() => {
      gsap.set(st, { xPercent: -50, yPercent: -50 });
      gsap.from(st, { scale: 0.3, rotation: -14, opacity: 0, duration: 0.7, ease: "back.out(1.7)" });
      gsap.to(st, { rotation: 1.6, duration: 2.4, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 0.8 });
    }, st);
    return () => ctx.revert();
  }, [stage]);

  // Throw animation (STAMP_THROW_MS = 1200, THROW_TRAVEL = 0.6) -> stamp.onThrow().
  useIsoLayoutEffect(() => {
    if (stage !== "throwing") return;
    onThrowStartRef.current?.();
    const st = stickerRef.current;
    const dur = STAMP_THROW_MS / 1000;
    const travel = typeof window !== "undefined" ? Math.round(window.innerHeight * THROW_TRAVEL) : 432;
    const ctx = st
      ? gsap.context(() => {
          gsap.set(st, { xPercent: -50, yPercent: -50 });
          gsap.to(st, { y: travel, rotation: 10, scale: 0.62, duration: dur, ease: "power2.in" });
          gsap.to(st, { opacity: 0, duration: 0.25, delay: Math.max(0, dur - 0.1) });
        }, st)
      : null;
    const timer = window.setTimeout(() => onThrowRef.current(), STAMP_THROW_MS);
    return () => { window.clearTimeout(timer); ctx?.revert(); };
  }, [stage]);

  // Redraw shrink/spin exit animation (stamp.js:51) -> stamp.onRedraw().
  useIsoLayoutEffect(() => {
    if (stage !== "redrawing") return;
    const st = stickerRef.current;
    if (!st || typeof window === "undefined") { onRedrawRef.current(); return; }
    let finished = false;
    const finish = () => { if (finished) return; finished = true; onRedrawRef.current(); };
    const ctx = gsap.context(() => {
      gsap.set(st, { xPercent: -50, yPercent: -50 });
      gsap.to(st, { scale: 0.2, rotation: 24, opacity: 0, duration: 0.45, ease: "back.in(1.6)", onComplete: finish });
    }, st);
    const timer = window.setTimeout(finish, 460);
    return () => { window.clearTimeout(timer); ctx.revert(); };
  }, [stage]);

  // Pin rings beside sticker (stamp.js:35-40).
  useIsoLayoutEffect(() => {
    if (stage !== "ready" || typeof window === "undefined") return;
    const rings = ringsRef.current;
    const st = stickerRef.current;
    if (!rings || !st) return;

    const placeNow = () => {
      const b = st.getBoundingClientRect();
      const anchor: Rect =
        b.width > 0
          ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }
          : {
              left: window.innerWidth * 0.5,
              top: window.innerHeight * 0.3,
              right: window.innerWidth * 0.78,
              bottom: window.innerHeight * 0.62,
              width: window.innerWidth * 0.28,
              height: window.innerHeight * 0.32,
            };
      const avoid = [
        bubbleRef?.current?.rect(),
        measureLiveRect(document.querySelector("#cam-pip, .r83-cam-pip")),
        measureLiveRect(document.querySelector("#su-hint, .r83-hint")),
        measureLiveRect(document.getElementById("skipbar")),
      ];
      const layout = placeRing({
        anchor,
        vp: { w: window.innerWidth, h: window.innerHeight },
        ring: { w: rings.offsetWidth || 120, h: rings.offsetHeight || 240 },
        side: "side",
        avoid,
      });
      rings.style.left = `${layout.left}px`;
      rings.style.top = `${layout.top}px`;
    };

    placeNow();
    const ctx = gsap.context(() => {
      gsap.from(rings, { opacity: 0, y: 12, duration: 0.45, delay: 0.5, ease: "back.out(1.7)" });
    }, rings);

    const throttle = createPlacementThrottle(BUBBLE_REPLACE_MS);
    let raf = 0;
    const tick = (now: number) => {
      const b = st.getBoundingClientRect();
      const sig = `${Math.round(b.left)},${Math.round(b.top)},${window.innerWidth}x${window.innerHeight}`;
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
  }, [stage, bubbleRef]);

  return (
    <div className="r83-sticker-stage" data-testid="r83-sticker-stage" data-state={stage}>
      {hasNui && <StickerFlickBinder enabled={stage === "ready"} onFlick={triggerThrow} />}

      <div
        ref={stickerRef}
        className="sticker"
        data-testid={testId}
        role="img"
        aria-label={CANVAS_COPY.sticker.alt(displayLabel)}
      >
        <div className="sheet">
          <span className="tape" aria-hidden="true" />
          <div className="art">
            <StrokePreview drawingInput={stamp.drawingInput} />
          </div>
          <div className="lab">{displayLabel}</div>
        </div>
      </div>

      {stage === "ready" && (
        <div ref={ringsRef} className="stamp-rings" data-testid="r83-sticker-rings">
          {hasNui ? (
            <>
              <NuiRing
                label={CANVAS_COPY.sticker.throwLabel}
                holdMs={STICKER_RING_MS}
                mode="any"
                className="r-throw"
                onFire={triggerThrow}
                testId="r83-sticker-throw"
              />
              <NuiRing
                label={CANVAS_COPY.sticker.redrawLabel}
                holdMs={STICKER_RING_MS}
                mode="any"
                className="r-redraw"
                onFire={triggerRedraw}
                testId="r83-sticker-redraw"
              />
            </>
          ) : (
            <FallbackStickerRings onThrow={triggerThrow} onRedraw={triggerRedraw} />
          )}
        </div>
      )}
    </div>
  );
}
