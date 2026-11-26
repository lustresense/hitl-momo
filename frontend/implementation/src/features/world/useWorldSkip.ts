"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { WORLD_COPY } from "@/src/domain/copy/world";
import type { GameController } from "@/src/game/game-controller";
import type { PostPlaceMode } from "./PostPlaceGate";
import type { WorldRuntimeHandle } from "./useWorldRuntime";

export interface UseWorldSkipOptions {
  readonly stage: number;
  readonly phase: "falling" | "placing" | "gameplay";
  readonly postPlaceMode: PostPlaceMode;
  readonly runtime: WorldRuntimeHandle;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly attemptId: string | null;
  readonly onDemoAttempt?: (attemptId: string) => void;
  readonly onStartRising: () => void;
  readonly onRiseComplete: () => void;
  readonly onStartPlay: () => void;
}

/** Label adegan persis sandbox (`pages.js`, `place.js`, `play.js`). */
export function worldSkipLabel(
  stage: number,
  phase: "falling" | "placing" | "gameplay",
  mode: PostPlaceMode,
  outcome: "success" | "fail" | null,
): string {
  if (mode === "rising") return WORLD_COPY.rise.sceneLabel(stage);
  if (outcome === "success") return WORLD_COPY.win.sceneLabel(stage);
  if (mode === "need-more") return `Level ${stage} · Benda berikutnya`;
  if (mode === "ready-play" || mode === "reposition-ready") return `Level ${stage} · Siap`;
  if (phase === "falling") return WORLD_COPY.drop.sceneLabel(stage);
  if (phase === "placing") return WORLD_COPY.placement.sceneLabel(stage);
  return WORLD_COPY.gameplay.sceneLabel(stage);
}

const SEARCH_STEP = 24;
const SEARCH_RINGS = 14;

/**
 * Menaruh benda di posisinya sekarang lewat runtime game. Bila ditolak aturan penempatan, cari posisi
 * sah terdekat. Tidak pernah memajukan FlowController sendiri: game yang memanggilnya setelah benda masuk.
 */
export function commitPlacementNear(game: GameController, canvas: HTMLCanvasElement | null): boolean {
  const x = Number(canvas?.dataset.objectX);
  const y = Number(canvas?.dataset.objectY);
  const baseX = Number.isFinite(x) ? x : 360;
  const baseY = Number.isFinite(y) ? y : 200;
  if (game.commitPlacementAt(baseX, baseY)) return true;
  for (let ring = 1; ring <= SEARCH_RINGS; ring++) {
    const d = ring * SEARCH_STEP;
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [-d, -d], [d, -d], [0, d]] as const) {
      if (game.commitPlacementAt(baseX + dx, baseY + dy)) return true;
    }
  }
  return false;
}

/** "Lewati" di halaman dunia: satu tekanan menyelesaikan satu adegan sandbox. */
export function useWorldSkip(options: UseWorldSkipOptions): { label: string; skip: () => void } {
  const latest = useRef(options);
  latest.current = options;
  const finishedRef = useRef(false);

  useEffect(() => {
    if (options.runtime.outcome !== "success") finishedRef.current = false;
  }, [options.runtime.outcome]);

  const skip = useCallback(() => {
    const o = latest.current;
    if (o.postPlaceMode === "rising") {
      o.onRiseComplete();
      return;
    }
    if (o.runtime.outcome === "success") {
      if (finishedRef.current) return;
      finishedRef.current = true;
      o.runtime.finishWin();
      return;
    }
    if (o.postPlaceMode === "need-more") {
      o.onStartRising();
      return;
    }
    if (o.postPlaceMode === "ready-play" || o.postPlaceMode === "reposition-ready") {
      o.onStartPlay();
      return;
    }
    if (o.phase === "falling") {
      // The game ends its own fall and then tells the flow; moving only the flow would desync them.
      o.runtime.gameRef.current?.onFallComplete();
      return;
    }
    if (o.phase === "placing") {
      const game = o.runtime.gameRef.current;
      if (game) commitPlacementNear(game, o.canvasRef.current);
      return;
    }
    // "Bermain", also from the fail sheet: straight to the win scene. The result is not the student's.
    if (o.attemptId) o.onDemoAttempt?.(o.attemptId);
    o.runtime.forceSuccess();
  }, []);

  return {
    label: worldSkipLabel(options.stage, options.phase, options.postPlaceMode, options.runtime.outcome),
    skip,
  };
}
