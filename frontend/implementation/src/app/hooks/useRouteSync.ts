/**
 * Keeps the shell's screen state and the browser URL in step: `navigateTo` for in-app navigation, a popstate and
 * initial-load sync that resolves the current path (guarding locked levels), and the level URL that follows the
 * running level: /levelN on the ground, /canvasN in the sky (pushState, so the page never reloads).
 */
import { useCallback, useEffect, useRef } from "react";
import { LEVELS } from "@/src/domain/levels";
import { isLevelUnlocked } from "../level-progress";
import { expectedLevelPath, levelPath, resolveAppRoute } from "../route-guard";
import type { AppPhase } from "../state-machine";
import type { LevelSession } from "./useLevelSession";
import type { RouteState } from "./useRouteState";

/** What the level URL follows: the running level's stage, its phase, and whether its story intro is still on. */
export interface LevelUrlView {
  stage: number | null;
  phase: AppPhase | null;
  introPending: boolean;
}

/** The level URL for the current state, or null when no level is running. */
function expectedPathFor(view: LevelUrlView): string | null {
  if (view.stage === null || view.phase === null || view.phase === "level-entry") return null;
  return expectedLevelPath(view.stage, view.phase, view.introPending);
}

export function useRouteSync(route: RouteState, session: LevelSession, view: LevelUrlView) {
  const { setOnboarding, setRouteNotice, routeGuardActive, redirectToLockedNotice } = route;
  const { controller, creationsRef, enterLevel } = session;
  // Browser Back is handled by a listener that reads the latest view, so it corrects the URL against current state.
  const viewRef = useRef(view);
  viewRef.current = view;

  const navigateTo = useCallback(
    (path: string) => {
      if (typeof window !== "undefined") {
        const normalizedRoute = path.includes("/levels") ? "/levels" : path;
        window.history.pushState(null, "", normalizedRoute);
        window.scrollTo(0, 0);
      }
      setRouteNotice(null);
      if (path.includes("/onboarding/number")) {
        setOnboarding("number");
      } else if (path.includes("/onboarding/card")) {
        setOnboarding("tutorial");
      } else if (path.includes("/levels")) {
        setOnboarding("levels");
      } else {
        setOnboarding("camera");
      }
    },
    [setOnboarding, setRouteNotice],
  );

  // Each change of the running level's URL is one history entry: the rise to the sky and the fall back to the ground.
  const expectedPath = expectedPathFor(view);
  useEffect(() => {
    if (expectedPath && typeof window !== "undefined" && window.location.pathname !== expectedPath) {
      window.history.pushState(null, "", expectedPath);
    }
  }, [expectedPath]);

  useEffect(() => {
    function syncRoute() {
      if (typeof window === "undefined") return;
      const resolved = resolveAppRoute(window.location.pathname, isLevelUnlocked);
      if (resolved.kind === "level" || resolved.kind === "canvas") {
        setRouteNotice(null);
        setOnboarding("levels");
        const currentSnapshot = controller?.getSnapshot();
        if (currentSnapshot?.levelId !== resolved.level.levelId || currentSnapshot.phase === "level-entry") {
          // A direct load of /canvasN is past the story: open the sky without replaying the intro.
          enterLevel(resolved.level, { skipIntro: resolved.kind === "canvas" });
        }
        // Back/forward landed on the other half of this level (/levelN while in the sky, or the reverse): keep the
        // state and put the URL back where the state is, without a new history entry.
        const expected = expectedPathFor(viewRef.current);
        if (expected && window.location.pathname !== expected) window.history.replaceState(null, "", expected);
      } else if (resolved.kind === "levels") {
        // A running prediction cannot be abandoned (FlowController invariant). Browser Back used to throw an
        // uncaught InvalidTransitionError here and leave the URL on /levels with the UI stuck in "predicting".
        const running = controller?.getSnapshot();
        if (running?.phase === "predicting") {
          const active = LEVELS.find((l) => l.levelId === running.levelId);
          if (active) window.history.pushState(null, "", levelPath(active.stage));
          return;
        }
        if (resolved.notice) {
          redirectToLockedNotice();
          return;
        }
        if (routeGuardActive.current) {
          routeGuardActive.current = false;
        } else {
          setRouteNotice(null);
        }
        setOnboarding("levels");
        if (controller?.getSnapshot().levelId) controller.exitToLevelEntry();
        creationsRef.current.clear();
      } else if (resolved.kind === "number") {
        setRouteNotice(null);
        setOnboarding("number");
      } else if (resolved.kind === "tutorial") {
        setOnboarding("tutorial");
      } else {
        setOnboarding("camera");
        if (window.location.pathname === "/" || window.location.pathname === "") {
          window.history.replaceState(null, "", "/onboarding/cam");
        }
      }
    }

    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [controller, enterLevel, creationsRef, routeGuardActive, redirectToLockedNotice, setOnboarding, setRouteNotice]);

  return { navigateTo };
}
