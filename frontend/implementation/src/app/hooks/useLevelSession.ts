import { SubmissionAdapter, type ClassContext } from "@/src/api/submission-adapter";
import type { OutboxQueue } from "@/src/api/outbox";
/**
 * The running level: creates the FlowController (with its prediction provider and event sink) on
 * level entry, owns the per-level event sink lifecycle, the session's world creations and the
 * "mission briefing opens once per level" memory.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LevelDefinition } from "@/src/domain/levels";
import { createEventSink } from "@/src/events";
import { createPredictionProvider, env } from "@/src/config/env";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";
import { CreationStore, type WorldCreation } from "@/src/game/creation-store";
import { isLevelUnlocked } from "../level-progress";
import { FlowController } from "../state-machine";
import type { PredictionProvider } from "@/src/prediction/prediction-provider";
import type { RouteState } from "./useRouteState";
import type { LevelRecap } from "@/src/components/ending/ending-types";

/** R9 recap of a level from the flow's first decided object; null when the flow has no decision yet. */
export function recapFromFlow(level: LevelDefinition, flow: Pick<FlowController, "drawingInput" | "prediction" | "decision" | "behavior">): LevelRecap | null {
  const { decision, prediction, behavior, drawingInput } = flow;
  if (!decision || !prediction) return null;
  return {
    levelId: level.levelId,
    title: `Bab ${level.stage}`,
    strokes: drawingInput?.strokes.map((s) => [...s]) ?? [],
    finalLabel: decision.finalLabel,
    category: behavior === "solid" ? "padat" : behavior === "danger" ? "bahaya" : "netral",
    decision: decision.type,
    firstGuess: prediction.candidates[0].label,
  };
}

export interface LevelSessionOptions {
  outbox?: OutboxQueue;
  tokenProvider?: () => string | undefined;
  /** Class identity for submissions; null when the student has not joined a class. */
  classContext?: () => ClassContext | null;
}

export function useLevelSession(
  route: Pick<RouteState, "setRouteNotice" | "redirectToLockedNotice">,
  sessionOptions?: LevelSessionOptions,
) {
  const { setRouteNotice, redirectToLockedNotice } = route;
  const [controller, setController] = useState<FlowController | null>(null);
  /** Same provider the FlowController uses; R11 provisional guesses while drawing read it too. */
  const [provider, setProvider] = useState<PredictionProvider | null>(null);
  const [providerMode, setProviderMode] = useState<"mock" | "partner">(env.predictionMode);
  // Survives GameStage unmounts during redraw/add/prediction; never browser-persisted.
  const creationsRef = useRef(new CreationStore());
  const eventSinkRef = useRef<ReturnType<typeof createEventSink> | null>(null);
  const missionSeenLevels = useRef(new Set<string>());
  const [missionOpen, setMissionOpen] = useState(false);
  /** R9: first decided object per level this session (strokes + decision), for the closing overview. */
  const recapsRef = useRef(new Map<string, LevelRecap>());
  const recordRecap = useCallback((recap: LevelRecap | null) => {
    if (recap && !recapsRef.current.has(recap.levelId)) recapsRef.current.set(recap.levelId, recap);
  }, []);
  const getRecaps = useCallback(() => [...recapsRef.current.values()].sort((a, b) => a.title.localeCompare(b.title)), []);
  /** The level whose story intro is playing (first entry per level per session). */
  const [introLevel, setIntroLevel] = useState<LevelDefinition | null>(null);
  /** The drawing page under the intro becomes visible just before the intro fades out (no blank frame). */
  const [introRevealed, setIntroRevealed] = useState(false);
  const revealDrawing = useCallback(() => setIntroRevealed(true), []);
  const finishIntro = useCallback(() => setIntroLevel(null), []);
  /** The first entry into a level per session plays Momo's story intro. */
  const willPlayIntro = useCallback((level: LevelDefinition) => !missionSeenLevels.current.has(level.levelId), []);

  useEffect(
    () => () => {
      eventSinkRef.current?.flush();
      eventSinkRef.current?.dispose();
    },
    [],
  );

  const handleCreationsChange = useCallback((items: WorldCreation[]) => {
    creationsRef.current.replace(items);
  }, []);

  const enterLevel = useCallback(
    (level: LevelDefinition) => {
      if (typeof window !== "undefined" && !isLevelUnlocked(level.stage)) {
        redirectToLockedNotice();
        return;
      }
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
        if (window.location.pathname !== `/level${level.stage}`) {
          window.history.pushState(null, "", `/level${level.stage}`);
        }
        setRouteNotice(null);
      }
      const adapter = sessionOptions?.outbox
        ? new SubmissionAdapter({ outbox: sessionOptions.outbox, classContext: sessionOptions.classContext })
        : null;

      const provider = createPredictionProvider(level, sessionOptions?.tokenProvider);
      setProviderMode(env.predictionMode === "partner" && env.predictionEndpoint ? "partner" : "mock");
      // TEST HOOKS ONLY (NEXT_PUBLIC_TEST_HOOKS=1): expose mock controls for E2E.
      if (env.testHooksEnabled && provider instanceof MockPredictionProvider) {
        window.__skbMock = provider;
      }
      // One event sink per level: flush and dispose the previous one first.
      eventSinkRef.current?.flush();
      eventSinkRef.current?.dispose();
      const sink = createEventSink();
      eventSinkRef.current = sink;
      const flow = new FlowController({
        provider,
        sink,
        goalCompletesLevel: true,
        // Submission is best effort. A failure here must never reach gameplay.
        onDecisionApplied: (s) => {
          void adapter?.handleDecisionApplied(s).catch(() => {});
        },
        onGameplayResult: (r) => {
          void adapter?.handleGameplayResult(r).catch(() => {});
        },
      });
      creationsRef.current.enterLevel(level.levelId);
      if (!missionSeenLevels.current.has(level.levelId)) {
        missionSeenLevels.current.add(level.levelId);
        setIntroRevealed(false);
        setIntroLevel(level);
      }
      setProvider(provider);
      setController(flow);
      flow.enterLevel(level);
    },
    [redirectToLockedNotice, setRouteNotice, sessionOptions?.outbox, sessionOptions?.tokenProvider, sessionOptions?.classContext],
  );

  /** Leave the running level for the level list and forget this session's world creations. */
  const exitToLevels = useCallback(() => {
    controller?.exitToLevelEntry();
    creationsRef.current.clear();
    setIntroLevel(null);
    setMissionOpen(false);
    if (typeof window !== "undefined") window.history.pushState(null, "", "/levels");
  }, [controller]);

  return {
    controller,
    provider,
    recordRecap,
    getRecaps,
    providerMode,
    creationsRef,
    missionOpen,
    setMissionOpen,
    introLevel,
    introRevealed,
    revealDrawing,
    finishIntro,
    willPlayIntro,
    handleCreationsChange,
    enterLevel,
    exitToLevels,
  };
}

export type LevelSession = ReturnType<typeof useLevelSession>;
