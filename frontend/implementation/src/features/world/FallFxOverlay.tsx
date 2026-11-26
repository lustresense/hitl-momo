"use client";

import { useRef, type RefObject } from "react";
import gsap from "gsap";
import {
  FALL_BOUNCE_TWEEN,
  FALL_SHADOW_FADEOUT,
  FALL_SQUASH_TWEEN,
  computeFallSwayDeg,
  computeLandingShadow,
  computeShadowLayout,
  createDustSpecs,
  fallProgress,
  type FallBox,
} from "./fall-fx";
import { DEFAULT_WORLD_BOUNDS } from "./placement-controller";
import { prefersReducedMotion, useIsoLayoutEffect } from "./world-ui-helpers";

export interface FallFxOverlayProps {
  readonly phase: "falling" | "placing" | "gameplay";
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}

function readBox(canvas: HTMLCanvasElement | null): FallBox | null {
  if (!canvas) return null;
  const x = Number(canvas.dataset.objectX);
  const y = Number(canvas.dataset.objectY);
  const w = Number(canvas.dataset.objectWidth);
  const h = Number(canvas.dataset.objectHeight);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/**
 * Efek visual jatuh murni di atas `.actors` (port `fallfx.js`):
 * ayunan mereda, bayangan membesar di tempat mendarat, squash + pantulan, dan 8 debu.
 * Nol React state per frame; tidak mengubah koordinat fisika KAPLAY.
 */
export function FallFxOverlay({ phase, canvasRef }: FallFxOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLElement | null>(null);
  const swayRef = useRef<HTMLDivElement | null>(null);
  const prevPhaseRef = useRef(phase);
  const startYRef = useRef<number | null>(null);
  const endYRef = useRef<number | null>(null);
  const lastBoxRef = useRef<FallBox | null>(null);

  useIsoLayoutEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    const host = hostRef.current;
    const shadow = shadowRef.current;
    const sway = swayRef.current;
    if (!host || !shadow || !sway || typeof window === "undefined") return;

    if (phase === "falling") {
      startYRef.current = null;
      endYRef.current = null;
      const t0 = performance.now();
      let raf = 0;

      const tick = (now: number) => {
        const box = readBox(canvasRef.current);
        if (box) {
          lastBoxRef.current = box;
          if (startYRef.current === null) startYRef.current = box.y;
          const endY = Math.max(endYRef.current ?? box.y + 120, box.y);
          endYRef.current = endY;
          const prog = fallProgress(box.y, startYRef.current, endY);
          const layout = computeShadowLayout({ ...box, y: endY }, DEFAULT_WORLD_BOUNDS);
          shadow.style.display = "block";
          shadow.style.left = `${layout.leftPct}%`;
          shadow.style.top = `${layout.topPct}%`;
          shadow.style.width = `${layout.widthPct}%`;
          const sh = computeLandingShadow(prog);
          shadow.style.opacity = String(sh.opacity);
          shadow.style.transform = `translate(-50%, -50%) scale(${sh.scale.toFixed(3)})`;

          sway.style.display = "block";
          sway.style.left = `${(box.x / DEFAULT_WORLD_BOUNDS.width) * 100}%`;
          sway.style.top = `${(box.y / DEFAULT_WORLD_BOUNDS.height) * 100}%`;
          sway.style.width = `${(box.w / DEFAULT_WORLD_BOUNDS.width) * 100}%`;
          sway.style.height = `${(box.h / DEFAULT_WORLD_BOUNDS.height) * 100}%`;
          const deg = prefersReducedMotion() ? 0 : computeFallSwayDeg(now - t0, prog);
          sway.style.transform = `rotate(${deg.toFixed(2)}deg)`;
        }
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
      return () => {
        window.cancelAnimationFrame(raf);
      };
    }

    if (prevPhase === "falling" && phase === "placing") {
      const box = readBox(canvasRef.current) ?? lastBoxRef.current;
      if (!box) {
        shadow.style.display = "none";
        sway.style.display = "none";
        return;
      }
      const spawnedDust: HTMLElement[] = [];
      const ctx = gsap.context(() => {
        gsap.to(shadow, {
          ...FALL_SHADOW_FADEOUT,
          onComplete: () => {
            shadow.style.display = "none";
          },
        });
        if (!prefersReducedMotion()) {
          gsap.fromTo(
            sway,
            { scaleX: FALL_SQUASH_TWEEN.fromScaleX, scaleY: FALL_SQUASH_TWEEN.fromScaleY },
            {
              scaleX: FALL_SQUASH_TWEEN.toScaleX,
              scaleY: FALL_SQUASH_TWEEN.toScaleY,
              duration: FALL_SQUASH_TWEEN.duration,
              ease: FALL_SQUASH_TWEEN.ease,
              onComplete: () => {
                sway.style.display = "none";
              },
            },
          );
          gsap.fromTo(
            sway,
            { y: FALL_BOUNCE_TWEEN.fromY },
            {
              y: FALL_BOUNCE_TWEEN.toY,
              duration: FALL_BOUNCE_TWEEN.duration,
              yoyo: FALL_BOUNCE_TWEEN.yoyo,
              repeat: FALL_BOUNCE_TWEEN.repeat,
              ease: FALL_BOUNCE_TWEEN.ease,
              overwrite: false,
            },
          );
          for (const spec of createDustSpecs(box, DEFAULT_WORLD_BOUNDS)) {
            const dot = document.createElement("i");
            dot.className = "dust";
            dot.style.left = `${spec.leftPct}%`;
            dot.style.top = `${spec.topPct}%`;
            host.appendChild(dot);
            spawnedDust.push(dot);
            gsap.set(dot, { xPercent: -50, yPercent: -50, scale: spec.initialScale });
            gsap.to(dot, {
              x: spec.targetX,
              y: spec.targetY,
              scale: spec.targetScale,
              opacity: 0,
              duration: spec.durationS,
              ease: "power2.out",
              onComplete: () => dot.remove(),
            });
          }
        } else {
          sway.style.display = "none";
        }
      }, host);

      return () => {
        ctx.revert();
        for (const dot of spawnedDust) dot.remove();
      };
    }

    shadow.style.display = "none";
    sway.style.display = "none";
  }, [phase, canvasRef]);

  return (
    <div ref={hostRef} className="actors" data-testid="r83-fall-fx" aria-hidden="true">
      <i ref={shadowRef} className="land-shadow" style={{ display: "none" }} />
      <div ref={swayRef} className="r83-fall-sway" style={{ display: "none" }} />
    </div>
  );
}
