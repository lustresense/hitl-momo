// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRouteSync, type LevelUrlView } from "@/src/app/hooks/useRouteSync";
import { LEVELS } from "@/src/domain/levels";

const LEVEL = LEVELS[0]!;

/** Stage 1 is always unlocked, so the sync never redirects these paths to the level list. */
function setup(initial: LevelUrlView, startPath: string) {
  window.history.replaceState(null, "", startPath);
  const snap = { levelId: null as string | null, phase: "level-entry" as string };
  const route = {
    onboarding: "levels",
    setOnboarding: vi.fn(),
    setRouteNotice: vi.fn(),
    routeGuardActive: { current: false },
    redirectToLockedNotice: vi.fn(),
    routeNotice: null,
  };
  const session = {
    controller: { getSnapshot: () => snap, exitToLevelEntry: vi.fn() },
    creationsRef: { current: { clear: vi.fn() } },
    enterLevel: vi.fn(),
  };
  const hook = renderHook((view: LevelUrlView) => useRouteSync(route as never, session as never, view), {
    initialProps: initial,
  });
  return { hook, snap, session };
}

const drawing = (introPending: boolean): LevelUrlView => ({ stage: 1, phase: "drawing", introPending });

describe("useRouteSync: level URL follows the running level", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("a direct load of /canvas1 opens the level without replaying its intro", () => {
    const { session } = setup({ stage: null, phase: null, introPending: false }, "/canvas1");
    expect(session.enterLevel).toHaveBeenCalledWith(LEVEL, { skipIntro: true });
  });

  it("the URL rises to /canvas1 only after the intro is over", () => {
    const { hook } = setup(drawing(true), "/level1");
    expect(window.location.pathname).toBe("/level1");
    act(() => hook.rerender(drawing(false)));
    expect(window.location.pathname).toBe("/canvas1");
  });

  it("the URL falls back to /level1 once the sticker is thrown", () => {
    const { hook } = setup(drawing(false), "/canvas1");
    act(() => hook.rerender({ stage: 1, phase: "falling", introPending: false }));
    expect(window.location.pathname).toBe("/level1");
  });

  it("Back onto /level1 while in the sky keeps the state and puts the URL back on /canvas1", () => {
    const { hook, snap, session } = setup(drawing(false), "/canvas1");
    snap.levelId = LEVEL.levelId;
    snap.phase = "drawing";
    act(() => hook.rerender(drawing(false)));
    expect(window.location.pathname).toBe("/canvas1");

    // The browser lands on the previous entry, /level1; the sync must not restart the level.
    session.enterLevel.mockClear();
    window.history.replaceState(null, "", "/level1");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(session.enterLevel).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/canvas1");
  });
});
