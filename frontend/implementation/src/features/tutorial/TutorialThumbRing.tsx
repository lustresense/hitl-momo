"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { TUTORIAL_COPY } from "@/src/domain/copy/tutorial";
import { RING_SVG_RADIUS_PX } from "@/src/nui/core/constants";
import { useNuiTarget, useOptionalNui } from "@/src/nui/react";
import { CARD_READ_MS } from "./tutorial-machine";

const CIRC = 2 * Math.PI * RING_SVG_RADIUS_PX;
const CIRC_STR = CIRC.toFixed(4);

export interface TutorialThumbRingProps {
  readonly reading: boolean;
  readonly unlocked: boolean;
  readonly ctaLabel: string;
  readonly holdMs?: number;
  readonly onReadComplete: () => void;
  readonly onConfirm: () => void;
}

/**
 * Slot ring kartu tutorial (port kartu.js:87-91, 227-233):
 * - Saat terkunci: ikon gembok ("Coba dulu, ya"), ring abu-abu terisi otomatis lewat ref rAF selama CARD_READ_MS (3333 ms).
 * - Saat terbuka: ikon berubah menjadi cubit ("Lanjut" / "Pilih level"), terdaftar di NUI Aturan A (`mode: "any"`).
 */
export function TutorialThumbRing({
  reading,
  unlocked,
  ctaLabel,
  holdMs = 1000,
  onReadComplete,
  onConfirm,
}: TutorialThumbRingProps) {
  const hasNui = useOptionalNui() !== null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<SVGCircleElement | null>(null);
  const onReadRef = useRef(onReadComplete);
  onReadRef.current = onReadComplete;

  const { reset: resetTarget } = useNuiTarget(rootRef, {
    label: ctaLabel,
    holdMs,
    mode: "any",
    disabled: !unlocked,
    fillRef,
    badge: false,
    trackState: false,
    onFire: () => onConfirm(),
  });

  // Read-time progress animation while locked (no per-frame React state commits!)
  useEffect(() => {
    const circle = fillRef.current;
    if (!circle) return;
    if (unlocked) {
      resetTarget();
      return;
    }
    if (!reading) {
      circle.style.strokeDashoffset = CIRC_STR;
      return;
    }
    let alive = true;
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    let rafId = 0;
    const tick = (now: number) => {
      if (!alive) return;
      const t = Math.min(1, Math.max(0, (now - start) / CARD_READ_MS));
      circle.style.strokeDashoffset = (CIRC * (1 - t)).toFixed(2);
      if (t >= 1) {
        onReadRef.current();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [reading, unlocked, resetTarget]);

  // Unlock pop animation (kartu.js:231)
  useEffect(() => {
    const el = rootRef.current;
    if (!unlocked || !el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { scale: 0.85, opacity: 0.7 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.2)" });
    }, el);
    return () => ctx.revert();
  }, [unlocked]);

  return (
    <div className="tut-thumb-slot" data-locked={unlocked ? "false" : "true"}>
      <div
        ref={rootRef}
        className={`thumb-confirm tut-thumb${unlocked ? "" : " tut-thumb--locked"}`}
        role="progressbar"
        tabIndex={0}
        aria-label={unlocked ? TUTORIAL_COPY.unlockedRingAriaLabel : TUTORIAL_COPY.lockedRingAriaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={unlocked ? 0 : undefined}
        data-testid="r83-tut-thumb"
        onClick={() => {
          if (unlocked && !hasNui) onConfirm();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="thumb-confirm__face">
          <svg className="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true">
            <circle className="thumb-confirm__track" cx="36" cy="36" r={RING_SVG_RADIUS_PX} />
            <circle
              ref={fillRef}
              className="thumb-confirm__fill"
              cx="36"
              cy="36"
              r={RING_SVG_RADIUS_PX}
              strokeDasharray={CIRC_STR}
              strokeDashoffset={CIRC_STR}
              transform="rotate(-90 36 36)"
            />
          </svg>
          <span className="thumb-confirm__thumb">
            <OwnerIcon name={unlocked ? "gesture-pinch" : "lock"} size={30} />
          </span>
        </span>
        <span className="thumb-confirm__label">{unlocked ? ctaLabel : TUTORIAL_COPY.lockedRingLabel}</span>
      </div>
    </div>
  );
}
