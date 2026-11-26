"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { strokesToPath, type LevelRecap } from "@/src/components/ending/ending-types";
import {
  ENDING_COPY,
  formatEndingRecapLabel,
  formatEndingRecapTitle,
} from "@/src/domain/copy/ending";
import { NuiRing } from "@/src/nui";
import type { RekapSubPhase } from "./ending-machine";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface RecapChatProps {
  readonly recaps: readonly LevelRecap[];
  readonly subPhase: RekapSubPhase;
  readonly revealedCount: number;
  readonly onIntroDone: () => void;
  readonly onItemLanded: () => void;
  readonly onFlyDone: () => void;
  readonly onCountsDone: () => void;
  readonly onConfirmNext: () => void;
}

function RecapSlotContent({ recap, index }: { readonly recap: LevelRecap; readonly index: number }) {
  const path = recap.strokes.length > 0 ? strokesToPath(recap.strokes, 120, 80) : "";
  const title = formatEndingRecapTitle(recap.title, recap.levelId, index);
  const label = formatEndingRecapLabel(recap.finalLabel);

  return (
    <>
      <span className="rc-chap">{title}</span>
      {path !== "" ? (
        <svg className="rc-art" viewBox="0 0 120 80" aria-hidden="true">
          <path
            d={path}
            fill="none"
            stroke="#1e2126"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <span className="rc-art rc-art--none">{ENDING_COPY.notRecorded}</span>
      )}
      <span className="rc-name">{label}</span>
    </>
  );
}

/**
 * Fase 4 (`rekap`): Rekap gaya chat Momo di dalam `R83Bubble`.
 * Seluruh item & goresan berasal dari `recaps` sesi asli (TANPA data contoh balok/papan/tali),
 * benda terbang masuk dari kiri secara berurutan urut level (`recap.js:15-39`).
 */
export function RecapChat({
  recaps,
  subPhase,
  revealedCount,
  onIntroDone,
  onItemLanded,
  onFlyDone,
  onCountsDone,
  onConfirmNext,
}: RecapChatProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const flyLayerRef = useRef<HTMLDivElement | null>(null);
  const footRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [compact, setCompact] = useState(false);

  const cbRef = useRef({ onIntroDone, onItemLanded, onFlyDone, onCountsDone });
  cbRef.current = { onIntroDone, onItemLanded, onFlyDone, onCountsDone };

  // Mode compact bila jumlah/tinggi kartu melebihi ruang bubble di atas tepi bawah layar.
  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === "undefined") return;
    const bubble = el.closest(".r83-bubble");
    if (bubble && bubble instanceof HTMLElement && bubble.offsetHeight > window.innerHeight * 0.62) {
      setCompact(true);
    }
  }, [recaps.length]);

  // Urutan sub-fase rekap: intro (500ms) -> flying (430ms/kartu + 750ms) -> counts (600ms) -> waiting-next.
  useIsoLayoutEffect(() => {
    if (subPhase === "intro") {
      const id = setTimeout(() => cbRef.current.onIntroDone(), 500);
      return () => clearTimeout(id);
    }

    if (subPhase === "flying") {
      const flyHost = flyLayerRef.current;
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      let cancelled = false;
      const ctx = gsap.context(() => {
        recaps.forEach((recap, i) => {
          const t = setTimeout(() => {
            if (cancelled) return;
            const slotEl = slotRefs.current[i];
            const r = slotEl?.getBoundingClientRect();
            if (flyHost && slotEl && r && r.width > 0) {
              const fly = slotEl.cloneNode(true) as HTMLDivElement;
              fly.className = `rc-slot rc-slot--${recap.category} rc-fly`;
              fly.removeAttribute("data-testid");
              fly.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:50`;
              flyHost.appendChild(fly);
              gsap.fromTo(
                fly,
                { x: -(r.left + r.width + 60), y: 26 - (i % 3) * 22, rotation: -14, opacity: 1 },
                {
                  x: 0,
                  y: 0,
                  rotation: 0,
                  duration: 0.75,
                  ease: "back.out(1.2)",
                  onComplete: () => {
                    fly.remove();
                    if (!cancelled) cbRef.current.onItemLanded();
                  },
                },
              );
            } else {
              cbRef.current.onItemLanded();
            }
          }, i * 430);
          timers.push(t);
        });

        const totalFlyMs = recaps.length > 0 ? (recaps.length - 1) * 430 + 750 : 0;
        const doneTimer = setTimeout(() => {
          if (!cancelled) cbRef.current.onFlyDone();
        }, totalFlyMs);
        timers.push(doneTimer);
      }, rootRef);

      return () => {
        cancelled = true;
        timers.forEach((t) => clearTimeout(t));
        ctx.revert();
        flyHost?.replaceChildren();
      };
    }

    if (subPhase === "counts") {
      const id = setTimeout(() => cbRef.current.onCountsDone(), 600);
      return () => clearTimeout(id);
    }

    return undefined;
  }, [subPhase, recaps]);

  // Animasi masuk ring "Lanjut" di kaki kartu rekap (`recap.js:36`).
  const showNext = subPhase === "waiting-next";
  useIsoLayoutEffect(() => {
    const foot = footRef.current;
    if (!showNext || !foot) return;
    const ctx = gsap.context(() => {
      gsap.from(foot, { opacity: 0, y: 10, duration: 0.4, ease: "back.out(1.7)" });
    }, foot);
    return () => ctx.revert();
  }, [showNext]);

  const allLanded = subPhase === "counts" || subPhase === "waiting-next";

  return (
    <div
      ref={rootRef}
      className={`rc${compact ? " compact" : ""}`}
      data-testid="r83-ending-recap"
    >
      <span className="rc-label">{ENDING_COPY.rekap.cardLabel}</span>

      {recaps.length === 0 ? (
        <p className="rc-empty" data-testid="r83-recap-empty">
          {ENDING_COPY.rekap.emptyMessage}
        </p>
      ) : (
        <div className="rc-slots" data-testid="r83-ending-recap-slots">
          {recaps.map((recap, i) => {
            const on = allLanded || i < revealedCount;
            return (
              <div
                key={`${recap.levelId}-${i}`}
                ref={(el) => {
                  slotRefs.current[i] = el;
                }}
                className={`rc-slot rc-slot--${recap.category}${on ? " on" : ""}`}
                data-testid={`r83-recap-slot-${recap.levelId}`}
                data-revealed={on ? "true" : "false"}
              >
                <RecapSlotContent recap={recap} index={i} />
              </div>
            );
          })}
        </div>
      )}

      {typeof document !== "undefined"
        ? createPortal(
            <div
              ref={flyLayerRef}
              data-ui="r83"
              className={compact ? "compact" : undefined}
              aria-hidden="true"
              style={{
                position: "fixed",
                inset: 0,
                width: 0,
                height: 0,
                margin: 0,
                padding: 0,
                overflow: "visible",
                background: "none",
                pointerEvents: "none",
                zIndex: 50,
              }}
            />,
            document.body,
          )
        : null}

      <div ref={footRef} className="rc-foot">
        {showNext ? (
          <NuiRing
            label={ENDING_COPY.rekap.nextLabel}
            holdMs={ENDING_COPY.rekap.nextHoldMs}
            mode="any"
            className="rc-ring"
            testId="r83-ending-recap-next"
            onFire={onConfirmNext}
          />
        ) : null}
      </div>
    </div>
  );
}
