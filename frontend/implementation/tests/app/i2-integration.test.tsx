// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SketchbookApp } from "@/src/app/SketchbookApp";
import { resolveR83Route, pathForR83Route } from "@/src/app/r83-routes";
import * as copy from "@/src/domain/copy";
import EndingPage from "@/app/ending/page";
import { LEVELS } from "@/src/domain/levels";
import { recordCompletedStage } from "@/src/app/level-progress";

function resetBrowserState(path = "/") {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", path);
}

function assertCamPipScopedUnderR83() {
  const pip = screen.getByTestId("r83-cam-pip");
  const scopedPip = document.querySelector('[data-ui="r83"] #cam-pip');
  expect(scopedPip).toBe(pip);
  const shellRoot = pip.closest('[data-ui="r83"].r83-shell-root');
  expect(shellRoot).not.toBeNull();
  return pip;
}

describe("I-2 Integrasi r8.3 behind NEXT_PUBLIC_UI_R83", () => {
  const prevUiR83 = process.env.NEXT_PUBLIC_UI_R83;
  const prevDevTools = process.env.NEXT_PUBLIC_DEV_TOOLS;
  const prevTestHooks = process.env.NEXT_PUBLIC_TEST_HOOKS;

  beforeEach(() => {
    resetBrowserState("/");
    process.env.NEXT_PUBLIC_DEV_TOOLS = "0";
    process.env.NEXT_PUBLIC_TEST_HOOKS = "1";
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    resetBrowserState("/");
    process.env.NEXT_PUBLIC_UI_R83 = prevUiR83;
    process.env.NEXT_PUBLIC_DEV_TOOLS = prevDevTools;
    process.env.NEXT_PUBLIC_TEST_HOOKS = prevTestHooks;
  });

  it("copy barrel re-exports all 7 r8.3 copy modules cleanly", () => {
    expect(copy.COVER_HERO_COPY).toBeDefined();
    expect(copy.TUTORIAL_COPY).toBeDefined();
    expect(copy.LEVEL_SELECT_COPY).toBeDefined();
    expect(copy.CANVAS_COPY).toBeDefined();
    expect(copy.WORLD_COPY).toBeDefined();
    expect(copy.ENDING_COPY).toBeDefined();
    expect(copy.NUI_LEGEND).toBeDefined();
  });

  it("resolveR83Route enforces Level lock guard with 'Level' (O-8) and maps /, /load, /ending", () => {
    expect(resolveR83Route("/", () => false)).toEqual({ kind: "load" });
    expect(resolveR83Route("/load", () => false)).toEqual({ kind: "load" });
    expect(resolveR83Route("/onboarding/cam", () => false)).toEqual({ kind: "cover" });
    expect(resolveR83Route("/onboarding/card", () => false)).toEqual({ kind: "tutorial" });
    expect(resolveR83Route("/levels", () => false)).toEqual({ kind: "levels", notice: null });
    expect(resolveR83Route("/ending", () => false)).toEqual({ kind: "ending" });
    expect(resolveR83Route("/level1", (s) => s === 1)).toEqual({ kind: "level", level: LEVELS[0] });
    expect(resolveR83Route("/canvas1", (s) => s === 1)).toEqual({ kind: "canvas", level: LEVELS[0] });

    const locked2 = resolveR83Route("/level2", (s) => s === 1);
    expect(locked2.kind).toBe("levels");
    if (locked2.kind === "levels") {
      expect(locked2.notice).toContain("Level");
      expect(locked2.notice).not.toMatch(/\bBab\b/i);
    }

    expect(pathForR83Route({ kind: "load" })).toBe("/");
    expect(pathForR83Route({ kind: "cover" })).toBe("/onboarding/cam");
    expect(pathForR83Route({ kind: "ending" })).toBe("/ending");
  });

  it("flag=0 preserves legacy SketchbookApp untouched on /", () => {
    process.env.NEXT_PUBLIC_UI_R83 = "0";
    render(<SketchbookApp />);

    expect(screen.queryByTestId("r83-cover-screen")).toBeNull();
    expect(screen.getByTestId("global-camera-widget")).toBeTruthy();
  });

  it("flag=1 renders R83SketchbookShell on /, /load, /onboarding/cam, /onboarding/card, /levels, /canvas1, and /ending with single #cam-pip", () => {
    process.env.NEXT_PUBLIC_UI_R83 = "1";

    // 1a. In-dream nickname DreamLoader on / over mounted CoverScreen (single #cam-pip hidden)
    const { unmount } = render(<SketchbookApp />);
    expect(screen.getByTestId("dream-loader")).toBeTruthy();
    expect(screen.getByTestId("r83-entry-name-input")).toBeTruthy();
    expect(screen.queryByTestId("dream-loader-skip")).toBeNull();
    expect(screen.getByTestId("r83-cover-screen")).toBeTruthy();
    expect(assertCamPipScopedUnderR83().style.display).toBe("none");
    expect(window.__skbNui).toBeDefined();
    unmount();
    cleanup();

    // 1b. Cover on /onboarding/cam (hidden #cam-pip because CoverCameraCard owns video)
    window.history.replaceState(null, "", "/onboarding/cam");
    render(<SketchbookApp />);
    expect(screen.getByTestId("r83-cover-screen")).toBeTruthy();
    expect(assertCamPipScopedUnderR83().style.display).toBe("none");
    cleanup();

    // 2. Tutorial on /onboarding/card (#cam-pip visible and scoped under [data-ui="r83"])
    window.history.replaceState(null, "", "/onboarding/card");
    render(<SketchbookApp />);
    expect(screen.getByTestId("r83-tutorial-screen")).toBeTruthy();
    expect(assertCamPipScopedUnderR83().style.display).not.toBe("none");
    cleanup();

    // 3. Level Select on /levels + locked guard redirect from /level2
    window.history.replaceState(null, "", "/level2");
    render(<SketchbookApp />);
    expect(window.location.pathname).toBe("/levels");
    expect(screen.getByTestId("r83-level-select-screen")).toBeTruthy();
    expect(screen.getByTestId("r83-route-notice").textContent).toContain("Selesaikan Level 1 dulu");
    assertCamPipScopedUnderR83();
    cleanup();

    // 4. Direct /canvas1 opens CanvasScreen cleanly without WorldIntro
    window.history.replaceState(null, "", "/canvas1");
    render(<SketchbookApp />);
    expect(screen.getByTestId("r83-canvas-screen")).toBeTruthy();
    assertCamPipScopedUnderR83();
    cleanup();

    // 5. /ending page mounts EndingScreen cleanly under flag=1
    recordCompletedStage(1);
    recordCompletedStage(2);
    recordCompletedStage(3);
    window.history.replaceState(null, "", "/ending");
    render(<EndingPage />);
    expect(screen.getByTestId("r83-ending-screen")).toBeTruthy();
    assertCamPipScopedUnderR83();
    expect(document.querySelectorAll("#cam-pip")).toHaveLength(1);
  });

  it("styles #cam-pip as fixed bottom-left under [data-ui='r83'] in CSS", () => {
    const momoCss = readFileSync(resolve(process.cwd(), "app/styles/114-r83-momo.css"), "utf8");
    const paperCss = readFileSync(resolve(process.cwd(), "app/styles/112-r83-paper.css"), "utf8");
    expect(momoCss).toMatch(/\[data-ui="r83"\] \.r83-cam-pip,\s*\[data-ui="r83"\] #cam-pip\s*\{[^}]*position:\s*fixed;/);
    expect(paperCss).toContain('[data-ui="r83"] #cam-pip');
  });

  it("hydrates prerendered SSR shell without #418/#423 mismatch across static routes", () => {
    process.env.NEXT_PUBLIC_UI_R83 = "1";
    const ssrHtml = renderToString(<SketchbookApp />);
    expect(ssrHtml).toContain('data-ui="r83"');
    expect(ssrHtml).toContain("r83-shell-root");
    expect(ssrHtml).toContain("r83-screen-frame--paper");
    expect(ssrHtml).not.toContain("r83-cover-screen");

    recordCompletedStage(1);
    recordCompletedStage(2);
    recordCompletedStage(3);

    const routeCases = [
      { path: "/", testId: "dream-loader" },
      { path: "/load", testId: "dream-loader" },
      { path: "/onboarding/cam", testId: "r83-cover-screen" },
      { path: "/onboarding/card", testId: "r83-tutorial-screen" },
      { path: "/levels", testId: "r83-level-select-screen" },
      { path: "/level2", testId: "r83-world-intro" },
      { path: "/canvas1", testId: "r83-canvas-screen" },
      { path: "/ending", testId: "r83-ending-screen" },
    ] as const;

    for (const { path, testId } of routeCases) {
      const container = document.createElement("div");
      container.innerHTML = ssrHtml;
      document.body.appendChild(container);
      window.history.replaceState(null, "", path);

      const onRecoverableError = vi.fn();
      let root: ReturnType<typeof hydrateRoot> | null = null;
      act(() => {
        root = hydrateRoot(container, <SketchbookApp />, { onRecoverableError });
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(screen.getByTestId(testId)).toBeTruthy();
      assertCamPipScopedUnderR83();

      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it("flag=1 handles route transitions: /levels -> /level1 -> /canvas1 and /ending -> /", async () => {
    let clock = gsap.globalTimeline.time();
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_UI_R83 = "1";
    window.history.replaceState(null, "", "/levels");
    render(<SketchbookApp />);

    const slot1 = screen.getByTestId("r83-level-card-1");
    fireEvent.click(slot1);
    for (let ms = 0; ms < 1400; ms += 50) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
        clock += 0.05;
        gsap.updateRoot(clock);
      });
    }
    expect(window.location.pathname).toBe("/level1");
    expect(screen.getByTestId("r83-world-intro")).toBeTruthy();
    expect(screen.queryByTestId("r83-intro-skip")).toBeNull();
    assertCamPipScopedUnderR83();

    // Re-render /level1 with NEXT_PUBLIC_DEV_TOOLS="1" to exercise the dev skip transition cleanly -> /canvas1
    cleanup();
    process.env.NEXT_PUBLIC_DEV_TOOLS = "1";
    window.history.replaceState(null, "", "/level1");
    render(<SketchbookApp />);
    fireEvent.click(screen.getByTestId("r83-intro-skip"));
    for (let ms = 0; ms < 1200; ms += 50) {
      act(() => {
        vi.advanceTimersByTime(50);
        clock += 0.05;
        gsap.updateRoot(clock);
      });
    }
    expect(window.location.pathname).toBe("/canvas1");
    expect(screen.getByTestId("r83-canvas-screen")).toBeTruthy();
    assertCamPipScopedUnderR83();

    act(() => {
      window.history.pushState(null, "", "/ending");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("r83-ending-screen")).toBeTruthy();
    assertCamPipScopedUnderR83();

    act(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("dream-loader")).toBeTruthy();
    expect(screen.getByTestId("r83-entry-name-input")).toBeTruthy();
    expect(screen.queryByTestId("dream-loader-skip")).toBeNull();
    expect(assertCamPipScopedUnderR83().style.display).toBe("none");
    vi.useRealTimers();
  });
});
