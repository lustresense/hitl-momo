"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import { WORLD_COPY, normalizeWorldStage } from "@/src/domain/copy/world";
import type { R83BubbleHandle } from "@/src/features/shared/R83Bubble";
import { getStageGeometry } from "@/src/game/stage-geometry";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import { NuiRing } from "@/src/nui";
import { DEFAULT_WORLD_BOUNDS } from "./placement-controller";
import { prefersReducedMotion, useIsoLayoutEffect, usePinnedRingPosition } from "./world-ui-helpers";

export interface SuccessPanelProps {
  readonly stage: number;
  readonly characterDisplayName?: string | null;
  readonly bubbleRef: RefObject<R83BubbleHandle | null>;
  readonly onWin?: () => void;
  /** Dev "Lewati" forced this win scene: it is a demo, so it gets no win sound. */
  readonly demo?: boolean;
  readonly onLineChange: (line: string) => void;
  readonly onContinue: () => void;
}

const CONFETTI_COLORS = ["#ef7a37", "#f0d487", "#c8d9a4", "#4a8c1f", "#111"] as const;
const CONFETTI_COUNT = 30;
const RING_DELAY_MS = 400;
const WIN_RING_HOLD_MS = HOLD_MS_DEFAULT;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Panel menang r8.3 (port `play.js:90-110`):
 * konfeti di papan petunjuk, chip "Level N+1 terbuka" / "Pusat Halaman terbuka",
 * baris ringkasan berurutan + jeda 400 ms -> ring "Lanjut" (1000 ms).
 */
export function SuccessPanel({
  stage,
  characterDisplayName,
  bubbleRef,
  onWin,
  demo = false,
  onLineChange,
  onContinue,
}: SuccessPanelProps) {
  const s = normalizeWorldStage(stage);
  const geometry = getStageGeometry(s);
  const lines = useMemo(
    () => WORLD_COPY.win.lines(s, characterDisplayName),
    [s, characterDisplayName],
  );

  const [ringVisible, setRingVisible] = useState(false);
  const actorsRef = useRef<HTMLDivElement | null>(null);
  const ringHostRef = useRef<HTMLDivElement | null>(null);
  const wonRef = useRef(false);
  const continuedRef = useRef(false);
  const onLineRef = useRef(onLineChange);
  onLineRef.current = onLineChange;
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  useEffect(() => {
    if (wonRef.current) return;
    wonRef.current = true;
    // The win scene appears exactly when the scene reported success (wonRef = once per panel).
    if (!demo) {
      audio.emit("win.sparkle");
      audio.emit("jingle.level_complete");
    }
    onWin?.();
  }, [onWin, demo]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(resolve, ms);
        timers.push(id);
      });

    const runLines = async () => {
      for (let i = 0; i < lines.length; i++) {
        if (cancelled) return;
        const text = lines[i]!;
        onLineRef.current(text);
        if (i < lines.length - 1) {
          await wait(clamp(text.length * 55, 1700, 3600));
        }
      }
      await wait(RING_DELAY_MS);
      if (!cancelled) setRingVisible(true);
    };

    void runLines();
    return () => {
      cancelled = true;
      for (const id of timers) clearTimeout(id);
    };
  }, [lines]);

  useIsoLayoutEffect(() => {
    const actors = actorsRef.current;
    if (!actors || prefersReducedMotion()) return;
    const goalX = ((geometry.goal.x + geometry.goal.w / 2) / DEFAULT_WORLD_BOUNDS.width) * 100;
    const goalY = ((geometry.goal.y + geometry.goal.h - 48) / DEFAULT_WORLD_BOUNDS.height) * 100;
    const sparks: HTMLElement[] = [];

    const ctx = gsap.context(() => {
      for (let k = 0; k < CONFETTI_COUNT; k++) {
        const sp = document.createElement("i");
        sp.className = "spark";
        sp.style.left = `${goalX}%`;
        sp.style.top = `${goalY}%`;
        sp.style.background = CONFETTI_COLORS[k % CONFETTI_COLORS.length]!;
        actors.appendChild(sp);
        sparks.push(sp);
        gsap.fromTo(
          sp,
          { x: 0, y: 0, opacity: 1, rotation: 0, scale: 1 },
          {
            x: (Math.random() - 0.5) * 360,
            y: -80 - Math.random() * 180,
            rotation: Math.random() * 540,
            opacity: 0,
            scale: 0.6,
            duration: 1.3 + Math.random() * 0.6,
            ease: "power2.out",
            delay: Math.random() * 0.3,
          },
        );
      }
    }, actors);

    return () => {
      ctx.revert();
      for (const sp of sparks) sp.remove();
    };
  }, [geometry.goal.h, geometry.goal.w, geometry.goal.x, geometry.goal.y]);

  const handleContinue = useCallback(() => {
    if (continuedRef.current) return;
    continuedRef.current = true;
    onContinueRef.current();
  }, []);

  const getBubbleRect = useCallback(() => bubbleRef.current?.rect() ?? null, [bubbleRef]);
  usePinnedRingPosition(ringHostRef, {
    enabled: ringVisible,
    side: "under",
    getAnchorRect: getBubbleRect,
    bubbleRef,
    anchorIsBubble: true,
  });

  return (
    <div data-testid="r83-success-panel">
      <div ref={actorsRef} className="actors" aria-hidden="true" />
      <div className="hud bc">
        <span className="k-chip good" data-testid="r83-win-unlocked">
          {WORLD_COPY.win.unlockedChip(s)}
        </span>
      </div>
      {ringVisible ? (
        <div ref={ringHostRef} className="r83-ring-pinned">
          <NuiRing
            label={WORLD_COPY.win.continueRingLabel}
            holdMs={WIN_RING_HOLD_MS}
            mode="any"
            testId="r83-win-continue"
            onFire={handleContinue}
          />
        </div>
      ) : null}
      <div className="r83-hint" role="note" style={{ opacity: 1 }}>
        {WORLD_COPY.win.hint}
      </div>
    </div>
  );
}
