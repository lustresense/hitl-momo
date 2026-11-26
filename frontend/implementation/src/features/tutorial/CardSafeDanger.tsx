"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { LegacyGlyph, OwnerIcon } from "@/src/components/ui/owner-icons";
import { TUTORIAL_COPY } from "@/src/domain/copy/tutorial";
import { CharacterAnimationAdapter } from "@/src/game/character/character-animation-adapter";
import { FIGURE_FPS } from "./tutorial-machine";

export interface CardSafeDangerProps {
  readonly active: boolean;
}

/**
 * Praktik Kartu 2 (port kartu.js:132-143):
 * Dua sisi kertas sobek: kiri "Aman dipijak" (balok/tangga/papan + Thinman lompat),
 * kanan "Kertas sobek" (duri + Thinman gemetar pose gagal).
 */
export function CardSafeDanger({ active }: CardSafeDangerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hopRef = useRef<HTMLDivElement | null>(null);
  const ouchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const hop = hopRef.current;
    const ouch = ouchRef.current;
    if (!root || !hop || !ouch) return;

    const hopAd = new CharacterAnimationAdapter({ variant: "A" });
    const ouchAd = new CharacterAnimationAdapter({ variant: "A" });
    let lastHop = "";
    let lastOuch = "";
    let acc = 0;
    let last = typeof performance !== "undefined" ? performance.now() : Date.now();
    let rafId = 0;
    const minStep = 1 / FIGURE_FPS;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      acc += dt;
      if (acc >= minStep) {
        const step = Math.min(0.066, acc);
        acc = 0;
        hopAd.update({ x: 0, y: 0, vx: 0, vy: -250, grounded: false, facing: 1 }, step);
        ouchAd.update({ x: 0, y: 0, vx: 0, vy: 0, grounded: true, facing: 1, terminalPhase: "fail" }, step);
        const hopSvg = hopAd.renderSvg(1);
        const ouchSvg = ouchAd.renderSvg(1);
        if (hopSvg !== lastHop) {
          lastHop = hopSvg;
          hop.innerHTML = hopSvg;
        }
        if (ouchSvg !== lastOuch) {
          lastOuch = ouchSvg;
          ouch.innerHTML = ouchSvg;
        }
      }
      if (active) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const ctx = gsap.context(() => {
      gsap.to(hop, { yPercent: -34, duration: 0.5, ease: "power2.out", yoyo: true, repeat: -1, repeatDelay: 0.1 });
      gsap.to(ouch, { x: 3, rotation: 3, duration: 0.125, ease: "none", yoyo: true, repeat: -1 });
    }, root);

    return () => {
      cancelAnimationFrame(rafId);
      ctx.revert();
    };
  }, [active]);

  return (
    <div ref={rootRef} className="tut-scene tut-safety" data-testid="r83-tut-safety">
      <section className="tut-zone tut-zone--safe" aria-label={TUTORIAL_COPY.safeBadge}>
        <span className="tut-zone__badge tut-zone__badge--ok">
          <OwnerIcon name="check" size={16} />
          {TUTORIAL_COPY.safeBadge}
        </span>
        <div className="tut-zone__stage">
          <svg viewBox="0 0 240 240" className="tut-zone__art" aria-hidden="true" focusable="false">
            <path d="M6 204Q120 198 234 204" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" />
            <g stroke="#111" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
              <rect x="30" y="140" width="92" height="62" rx="4" fill="#d9a066" />
              <path d="M30 171h92M76 140v31M53 171v31M99 171v31" fill="none" strokeWidth="3" />
            </g>
            <g stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M158 202L170 96M196 202L208 96" />
              <path d="M162 176h36M165 148h36M168 122h36" strokeWidth="3.6" />
            </g>
            <g stroke="#111" strokeWidth="3.6" strokeLinejoin="round">
              <rect x="130" y="206" width="104" height="14" rx="3" fill="#c28a52" transform="translate(-4 -8) rotate(-0.5 180 213)" />
            </g>
          </svg>
          <div ref={hopRef} className="tut-zone__man tut-zone__man--hop wb" aria-hidden="true" />
        </div>
      </section>

      <section className="tut-zone tut-zone--danger" aria-label={TUTORIAL_COPY.dangerBadge}>
        <span className="tut-zone__badge tut-zone__badge--bad">
          <LegacyGlyph name="close" size={16} />
          {TUTORIAL_COPY.dangerBadge}
        </span>
        <div className="tut-zone__stage">
          <svg viewBox="0 0 240 240" className="tut-zone__art" aria-hidden="true" focusable="false">
            <path d="M6 204Q120 198 234 204" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" />
            <g stroke="#111" strokeWidth="4" strokeLinejoin="round">
              <path d="M16 204l20-70 20 70z" fill="#f0e4cf" />
              <path d="M58 204l20-70 20 70z" fill="#f0e4cf" />
              <path d="M100 204l20-70 20 70z" fill="#f0e4cf" />
            </g>
          </svg>
          <div ref={ouchRef} className="tut-zone__man tut-zone__man--ouch wb" aria-hidden="true" />
        </div>
      </section>

      <i className="tut-tear" aria-hidden="true" />
    </div>
  );
}
