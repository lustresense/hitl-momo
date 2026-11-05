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
import type { RouteState } from "./useRouteState";

export function useLevelSession(route: Pick<RouteState, "setRouteNotice" | "redirectToLockedNotice">) {
  const { setRouteNotice, redirectToLockedNotice } = route;
  const [controller, setController] = useState<FlowController | null>(null);
  const [providerMode, setProviderMode] = useState<"mock" | "partner">(env.predictionMode);
  // Survives GameStage unmounts during redraw/add/prediction; never browser-persisted.
  const creationsRef = useRef(new CreationStore());
  const eventSinkRef = useRef<ReturnType<typeof createEventSink> | null>(null);
  const missionSeenLevels = useRef(new Set<string>());
  const [missionOpen, setMissionOpen] = useState(false);

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
      const provider = createPredictionProvider(level);
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
      const flow = new FlowController({ provider, sink, goalCompletesLevel: true });
      creationsRef.current.enterLevel(level.levelId);
      if (!missionSeenLevels.current.has(level.levelId)) {
        missionSeenLevels.current.add(level.levelId);
        setMissionOpen(true);
      }
      setController(flow);
      flow.enterLevel(level);
    },
    [redirectToLockedNotice, setRouteNotice],
  );

  /** Leave the running level for the level list and forget this session's world creations. */
  const exitToLevels = useCallback(() => {
    controller?.exitToLevelEntry();
    creationsRef.current.clear();
    if (typeof window !== "undefined") window.history.pushState(null, "", "/levels");
  }, [controller]);

  return {
    controller,
    providerMode,
    creationsRef,
    missionOpen,
    setMissionOpen,
    handleCreationsChange,
    enterLevel,
    exitToLevels,
  };
}

export type LevelSession = ReturnType<typeof useLevelSession>;
