"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ENDING_COPY } from "@/src/domain/copy/ending";
import type { MomoStageHandle } from "@/src/features/shared/MomoStage";
import { computeEndCameraFit, worldPercentW, worldPercentX, worldPercentY } from "./end-camera";
import { PARACHUTE_START_X, sampleGroundY } from "./end-walker";
import { createHeroSideRenderer } from "./pond-timeline";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const clampMs = (len: number) => Math.max(1700, Math.min(3600, len * 55));

export interface ParachuteSceneProps {
  readonly worldRef: RefObject<HTMLDivElement | null>;
  readonly camRef: RefObject<HTMLDivElement | null>;
  readonly heroRef: RefObject<HTMLDivElement | null>;
  readonly artRef: RefObject<HTMLDivElement | null>;
  readonly momoRef: RefObject<MomoStageHandle | null>;
  readonly onLineStep: (step: 0 | 1 | 2) => void;
  readonly onTouchdown: () => void;
  readonly onLanded: () => void;
}

/**
 * Fase 1 Penutup (`payung`): Thinman terjun payung ke Pusat Halaman + debu mendarat.
 * Port 1:1 `proto-html/r83/shared/end/end.js:67-105`.
 * Nol React state commit per frame; seluruh posisi/ayunan ditulis lewat ref & GSAP ticker.
 */
export function ParachuteScene({
  worldRef,
  camRef,
  heroRef,
  artRef,
  momoRef,
  onLineStep,
  onTouchdown,
  onLanded,
}: ParachuteSceneProps) {
  const chuteRef = useRef<HTMLDivElement | null>(null);
  const dustRef = useRef<HTMLDivElement | null>(null);

  const callbacksRef = useRef({ onLineStep, onTouchdown, onLanded });
  callbacksRef.current = { onLineStep, onTouchdown, onLanded };

  useIsoLayoutEffect(() => {
    const heroEl = heroRef.current;
    const artEl = artRef.current;
    const chuteEl = chuteRef.current;
    const dustEl = dustRef.current;
    // Resolusi fallback DOM penting: di React, useLayoutEffect anak berjalan sebelum ref induk (.world/.cam) terpasang.
    const worldEl = worldRef.current ?? heroEl?.closest<HTMLDivElement>(".world") ?? null;
    const camEl = camRef.current ?? heroEl?.closest<HTMLDivElement>(".cam") ?? null;
    if (!worldEl || !camEl || !heroEl || !artEl || !chuteEl || !dustEl || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (cancelled) {
          resolve();
          return;
        }
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    const x0 = PARACHUTE_START_X;
    const gy = sampleGroundY(x0);
    const hero = createHeroSideRenderer(heroEl, artEl);
    heroEl.classList.remove("alive");
    hero.place(x0, gy - 150);
    hero.stand(1);

    const fitCam = () => {
      gsap.set(camEl, { x: 0, y: 0, scale: 1, transformOrigin: "0 0" });
      const fit = computeEndCameraFit({
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        worldW: worldEl.offsetWidth,
        worldH: worldEl.offsetHeight,
        heroHeightPx: heroEl.getBoundingClientRect().height,
        targetX: x0,
        targetFrac: 0.3,
      });
      gsap.set(camEl, { x: fit.tx, y: fit.ty, scale: fit.scale, transformOrigin: "0 0" });
    };

    const ctx = gsap.context(() => {
      gsap.set(heroEl, { clearProps: "transform" });
      gsap.set(heroEl, { x: 0, y: 0, xPercent: -50, yPercent: -100, opacity: 1, scale: 1, rotation: 0, filter: "none" });
      fitCam();
      gsap.from(worldEl, { opacity: 0, duration: 0.6 });

      gsap.set(chuteEl, { xPercent: -50, yPercent: -100, transformOrigin: "50% 100%", opacity: 1, scaleY: 1 });
      const canopy = chuteEl.querySelector(".canopy");
      const lines = chuteEl.querySelector(".lines");
      if (canopy && lines) {
        gsap.set([canopy, lines], { scaleY: 0.12, svgOrigin: "60 62", opacity: 0 });
      }

      const off = { y: 150, sway: 0 };
      const open = { v: 0 };
      const motion = { vx: 0, vy: 0, on: false, face: 1 as const };
      let prevY = off.y;

      const sync = (_t: number, dtm: number) => {
        if (cancelled) return;
        const dt = Math.min(0.05, Math.max(0.001, dtm / 1000));
        const vy = off.y > 0 ? Math.max(-400, Math.min(400, (off.y - prevY) / dt)) : 0;
        prevY = off.y;
        motion.on = off.y <= 0.5;
        motion.vy = off.y > 0.5 ? Math.max(60, -vy) : 0;

        const curX = x0 + off.sway * 6 - 3;
        const curY = gy - off.y;
        hero.place(curX, curY);
        hero.update(motion, dt);

        const hr = heroEl.getBoundingClientRect();
        const wr = worldEl.getBoundingClientRect();
        if (wr.width > 0 && wr.height > 0 && hr.height > 0) {
          chuteEl.style.left = `${((hr.left + hr.width / 2 - wr.left) / wr.width) * 100}%`;
          chuteEl.style.top = `${((hr.top - wr.top + hr.height * 0.08) / wr.height) * 100}%`;
        } else {
          chuteEl.style.left = `${worldPercentX(curX)}%`;
          chuteEl.style.top = `${worldPercentY(curY - 18)}%`;
        }
        gsap.set(chuteEl, { rotation: (off.sway - 0.5) * 12 });
      };

      sync(0, 16);

      const tl = gsap.timeline();
      tl.to(off, { y: 60, duration: 0.9, ease: "power2.in" }, 0)
        .to(
          open,
          {
            v: 1,
            duration: 0.85,
            ease: "elastic.out(1,.45)",
            onUpdate: () => {
              if (canopy && lines) {
                gsap.set([canopy, lines], {
                  scaleY: 0.12 + 0.88 * Math.min(1, open.v),
                  opacity: Math.min(1, open.v * 3),
                });
              }
            },
          },
          0.85,
        )
        .to(off, { y: 0, duration: 3.3, ease: "power1.out" }, 0.95)
        .to(off, { sway: 1, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0.95)
        .to(chuteEl, { opacity: 0, scaleY: 0.2, duration: 0.5, ease: "power2.in" }, 4.25);

      for (let k = 0; k < 5; k++) {
        const puff = document.createElement("i");
        puff.className = "spark puff";
        puff.style.left = `${worldPercentX(x0)}%`;
        puff.style.top = `${worldPercentY(gy)}%`;
        dustEl.appendChild(puff);
        gsap.set(puff, { opacity: 0 });
        tl.fromTo(
          puff,
          { x: 0, y: 0, opacity: 1, scale: 0.6, immediateRender: false },
          {
            x: (k - 2) * 26,
            y: -12 - Math.random() * 14,
            opacity: 0,
            scale: 1.3,
            duration: 0.7,
            ease: "power2.out",
          },
          4.3,
        );
      }

      const landedPromise = new Promise<void>((resolve) => {
        tl.add(resolve, 4.3);
      });

      gsap.ticker.add(sync);

      void (async () => {
        await Promise.resolve();
        if (cancelled) return;
        await momoRef.current?.moveTo("corner", 800);
        if (cancelled) return;
        callbacksRef.current.onLineStep(0);
        await landedPromise;
        if (cancelled) return;
        await sleep(500);
        if (cancelled) return;
        gsap.ticker.remove(sync);
        chuteEl.style.display = "none";
        hero.place(x0, gy);
        hero.stand(1);
        callbacksRef.current.onTouchdown();
        callbacksRef.current.onLineStep(1);
        await sleep(clampMs(ENDING_COPY.payung.landedLines[0].length));
        if (cancelled) return;
        callbacksRef.current.onLineStep(2);
        await sleep(500);
        if (!cancelled) {
          callbacksRef.current.onLanded();
        }
      })();

      window.addEventListener("resize", fitCam);
      return () => {
        window.removeEventListener("resize", fitCam);
        gsap.ticker.remove(sync);
      };
    }, worldEl);

    return () => {
      cancelled = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      ctx.revert();
      dustEl.replaceChildren();
    };
  }, [worldRef, camRef, heroRef, artRef, momoRef]);

  return (
    <>
      <div
        ref={chuteRef}
        className="chute"
        data-testid="r83-ending-chute"
        style={{ width: `${worldPercentW(40)}%` }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 120 132" aria-hidden="true">
          <g className="lines" stroke="#111" strokeWidth="2" strokeLinecap="round">
            <path d="M8 62L60 126M34 62L60 126M60 62L60 126M86 62L60 126M112 62L60 126" />
          </g>
          <path
            className="canopy"
            d="M6 62C6 26 30 6 60 6C90 6 114 26 114 62Q101 50 87 62Q74 50 60 62Q46 50 33 62Q19 50 6 62Z"
            fill="#ef7a37"
            stroke="#111"
            strokeWidth="3.4"
            strokeLinejoin="round"
          />
          <path
            d="M33 61Q36 26 60 7M60 61V7M87 61Q84 26 60 7"
            fill="none"
            stroke="#111"
            strokeWidth="2.4"
          />
          <path d="M33 61Q36 26 60 7Q50 28 46 61Z" fill="#f0d487" opacity=".95" />
          <path d="M87 61Q84 26 60 7Q70 28 74 61Z" fill="#f0d487" opacity=".95" />
        </svg>
      </div>
      <div ref={dustRef} className="r83-ending-dust" aria-hidden="true" />
    </>
  );
}
