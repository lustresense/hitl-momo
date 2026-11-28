"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { audio } from "@/src/audio";
import type { FlowController, FlowStateSnapshot } from "@/src/app/state-machine";
import { env } from "@/src/config/env";
import type { LevelDefinition } from "@/src/domain/levels";
import type { CreationStore, WorldCreation } from "@/src/game/creation-store";
import type { GameController } from "@/src/game/game-controller";
import type { GameOutcome } from "@/src/game/kaplay-runtime";

export interface UseWorldRuntimeOptions {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly level: LevelDefinition;
  readonly snapshot: FlowStateSnapshot;
  readonly controller: FlowController;
  readonly creations: CreationStore;
  readonly onCreationsChange: (items: WorldCreation[]) => void;
  readonly onBumpDrawingRevision: () => void;
  readonly onBackToLevels: () => void;
}

export interface WorldRuntimeHandle {
  readonly gameRef: RefObject<GameController | null>;
  readonly ready: boolean;
  readonly error: string;
  readonly outcome: GameOutcome | null;
  readonly failReason: string;
  readonly retry: () => void;
  readonly reposition: () => void;
  readonly redraw: () => void;
  readonly createAnother: () => void;
  readonly finishWin: () => void;
  readonly clearOutcome: () => void;
  /** "Lewati" saat bermain: tampilkan adegan menang; hasil game sesudahnya diabaikan. */
  readonly forceSuccess: () => void;
  /** True once the dev "Lewati" forced the win scene: that result is a demo, not the student's. */
  readonly isForced: () => boolean;
}

/**
 * Mengelola siklus hidup `GameController` KAPLAY untuk layar dunia r8.3.
 * Membaca level, creations, dan callbacks via ref agar remount hanya terjadi saat level/keputusan berubah.
 */
export function useWorldRuntime(options: UseWorldRuntimeOptions): WorldRuntimeHandle {
  const { canvasRef, level, snapshot, controller } = options;
  const latestRef = useRef(options);
  latestRef.current = options;

  const gameRef = useRef<GameController | null>(null);
  const forcedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [failReason, setFailReason] = useState("");

  const { behavior, decision } = snapshot;
  const drawingInput = controller.drawingInput;
  const levelId = level.levelId;

  useEffect(() => {
    if (!behavior || !decision) return;
    let cancelled = false;
    let instance: GameController | null = null;
    forcedRef.current = false;
    setReady(false);
    setError("");
    setOutcome(null);
    setFailReason("");

    async function mountKaplay() {
      try {
        const { GameController: GameControllerClass } = await import("@/src/game/game-controller");
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        instance = new GameControllerClass();
        gameRef.current = instance;
        if (env.testHooksEnabled && typeof window !== "undefined") {
          window.__skbGameController = instance;
        }
        const cur = latestRef.current;
        await instance.mount(
          canvas,
          cur.level,
          behavior!,
          decision!.finalLabel,
          drawingInput,
          (result, reason) => {
            if (cancelled || forcedRef.current) return;
            setOutcome(result);
            setFailReason(reason ?? "");
            // Reported once per attempt by the scene (settled guard); a success is sounded by SuccessPanel.
            if (result === "fail") audio.emit("jingle.fail_soft");
            latestRef.current.controller.recordGameplayAttempt(result);
          },
          () => {
            if (!cancelled) latestRef.current.controller.completeFall();
          },
          () => {
            if (!cancelled) latestRef.current.controller.commitPlacement();
          },
          () => {
            if (!cancelled) latestRef.current.controller.repositionObject();
          },
          {
            integrated: true,
            creations: cur.creations.snapshot(),
            onCreationsChange: (items) => latestRef.current.onCreationsChange(items),
          },
        );
        if (cancelled) {
          instance.unmount();
          return;
        }
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    void mountKaplay();

    return () => {
      cancelled = true;
      instance?.unmount();
      if (gameRef.current === instance) gameRef.current = null;
      if (env.testHooksEnabled && typeof window !== "undefined" && window.__skbGameController === instance) {
        delete window.__skbGameController;
      }
    };
  }, [levelId, behavior, decision, drawingInput, canvasRef]);

  const clearOutcome = useCallback(() => {
    setOutcome(null);
    setFailReason("");
  }, []);

  const retry = useCallback(() => {
    gameRef.current?.retry();
    clearOutcome();
    latestRef.current.controller.recordGameplayRetry();
  }, [clearOutcome]);

  const reposition = useCallback(() => {
    clearOutcome();
    gameRef.current?.reposition();
  }, [clearOutcome]);

  const redraw = useCallback(() => {
    clearOutcome();
    latestRef.current.onBumpDrawingRevision();
    if (latestRef.current.controller.phase !== "drawing") {
      latestRef.current.controller.requestRedraw("gameplay");
    }
  }, [clearOutcome]);

  const createAnother = useCallback(() => {
    clearOutcome();
    latestRef.current.onBumpDrawingRevision();
    if (latestRef.current.controller.phase !== "drawing") {
      latestRef.current.controller.requestRedraw("create_another");
    }
  }, [clearOutcome]);

  const forceSuccess = useCallback(() => {
    if (forcedRef.current) return;
    forcedRef.current = true;
    setFailReason("");
    setOutcome("success");
    latestRef.current.controller.recordGameplayAttempt("success");
  }, []);

  const isForced = useCallback(() => forcedRef.current, []);

  const finishWin = useCallback(() => {
    latestRef.current.controller.reportGameplayOutcome("success");
    latestRef.current.onBackToLevels();
  }, []);

  return {
    gameRef,
    ready,
    error,
    outcome,
    failReason,
    retry,
    reposition,
    redraw,
    createAnother,
    finishWin,
    clearOutcome,
    forceSuccess,
    isForced,
  };
}
