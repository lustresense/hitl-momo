// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import { useLevelSession } from "@/src/app/hooks/useLevelSession";
import type { FlowController, FlowStateSnapshot } from "@/src/app/state-machine";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { WORLD_COPY } from "@/src/domain/copy/world";
import { LEVELS } from "@/src/domain/levels";
import { WorldScreen } from "@/src/features/world/WorldScreen";
import { CreationStore, type WorldCreation } from "@/src/game/creation-store";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";

const mockGameHandles = vi.hoisted(() => ({
  instances: [] as Array<{
    setInput: ReturnType<typeof vi.fn>;
    reposition: ReturnType<typeof vi.fn>;
    callbacks?: {
      onOutcome: (o: "success" | "fail", reason?: string) => void;
    };
  }>,
}));

vi.mock("@/src/game/game-controller", () => ({
  GameController: class MockGameController {
    setInput = vi.fn();
    setPlacement = vi.fn(() => true);
    commitPlacementAt = vi.fn(() => true);
    rotate = vi.fn(() => true);
    retry = vi.fn();
    reposition = vi.fn();
    unmount = vi.fn();
    selectCreation = vi.fn(() => true);

    async mount(
      canvas: HTMLCanvasElement,
      _level: unknown,
      _behavior: unknown,
      _finalLabel: string,
      _drawingInput: unknown,
      onOutcome: (o: "success" | "fail", reason?: string) => void,
    ) {
      canvas.dataset.objectX = "240";
      canvas.dataset.objectY = "180";
      canvas.dataset.objectWidth = "80";
      canvas.dataset.objectHeight = "20";
      mockGameHandles.instances.push({
        setInput: this.setInput,
        reposition: this.reposition,
        callbacks: { onOutcome },
      });
    }
  },
}));

function makeCreation(id: string, label = "Tangga"): WorldCreation {
  return {
    id,
    label,
    behavior: "solid",
    x: 240,
    y: 180,
    w: 80,
    h: 20,
    drawingInput: null,
  };
}

function makeController(): FlowController {
  return {
    phase: "gameplay",
    drawingInput: null,
    recordGameplayAttempt: vi.fn(),
    completeFall: vi.fn(),
    commitPlacement: vi.fn(),
    repositionObject: vi.fn(),
    recordGameplayRetry: vi.fn(),
    requestRedraw: vi.fn(),
    reportGameplayOutcome: vi.fn(),
  } as unknown as FlowController;
}

const SHARED_DECISION: NonNullable<FlowStateSnapshot["decision"]> = {
  type: "accept",
  finalLabel: "Tangga",
  sourceRank: 1,
};

function makeSnapshot(phase: FlowStateSnapshot["phase"]): FlowStateSnapshot {
  return {
    phase,
    levelId: LEVELS[0]!.levelId,
    attemptId: "att-1",
    hasPrediction: true,
    decision: SHARED_DECISION,
    behavior: "solid",
    cyclesCompleted: 0,
    redrawCount: 0,
    placingObject: { label: "Tangga", behavior: "solid" },
  };
}

function ControllerCapture({ onReady }: { onReady: (c: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => {
    onReady(ctrl);
  }, [ctrl, onReady]);
  return null;
}

function NuiHost({
  ts,
  clock,
  onReady,
  children,
}: {
  ts: TestSource;
  clock: () => number;
  onReady: (c: NuiController) => void;
  children: ReactNode;
}) {
  return (
    <NuiProvider testSource={ts} clock={clock}>
      <ControllerCapture onReady={onReady} />
      {children}
    </NuiProvider>
  );
}

function bubbleText(): string {
  return document.querySelector(".r83-bubble__text")?.textContent ?? "";
}

function mockRect(el: Element, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

function pinchHoldRuleA(
  ts: TestSource,
  ctrl: NuiController | null,
  nowRef: { current: number },
  steps = 22,
): void {
  act(() => {
    nowRef.current += 50;
    ts.push({ t: nowRef.current, x: 120, y: 120, inFrame: true, pinch: false });
    ctrl?.stepNow(nowRef.current);
    nowRef.current += 50;
    ts.push({ t: nowRef.current, x: 120, y: 120, inFrame: true, pinch: true });
    ctrl?.stepNow(nowRef.current);
    for (let i = 0; i < steps; i++) {
      nowRef.current += 50;
      ts.push({ t: nowRef.current, x: 120, y: 120, inFrame: true, pinch: true });
      ctrl?.stepNow(nowRef.current);
    }
  });
}

describe("WorldScreen post-place gate, win HUD hiding, and multi-recap session", () => {
  beforeEach(() => {
    mockGameHandles.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("shows need-more gate after 1st placement (< minDrawings), pauses GameplayHud, rises, and triggers createAnother", async () => {
    vi.useFakeTimers();
    const nowRef = { current: 0 };
    const ts = new TestSource(() => nowRef.current);
    let nuiCtrl: NuiController | null = null;

    const controller = makeController();
    const creations = new CreationStore();
    creations.enterLevel(LEVELS[0]!.levelId);
    creations.replace([makeCreation("c-1", "Tangga")]);
    const onBumpDrawingRevision = vi.fn();

    const baseProps = {
      level: LEVELS[0]!,
      controller,
      characterDisplayName: "Thinman",
      creations,
      onCreationsChange: vi.fn(),
      onBumpDrawingRevision,
      onBackToLevels: vi.fn(),
      onWon: vi.fn(),
    };

    const { rerender } = render(
      <NuiHost ts={ts} clock={() => nowRef.current} onReady={(c) => { nuiCtrl = c; }}>
        <WorldScreen {...baseProps} snapshot={makeSnapshot("placing")} phase="placing" />
      </NuiHost>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <NuiHost ts={ts} clock={() => nowRef.current} onReady={(c) => { nuiCtrl = c; }}>
        <WorldScreen {...baseProps} snapshot={makeSnapshot("gameplay")} phase="gameplay" />
      </NuiHost>,
    );

    expect(screen.getByTestId("r83-postplace-gate").getAttribute("data-mode")).toBe("need-more");
    expect(screen.queryByTestId("r83-gameplay-actions")).toBeNull();
    expect(screen.queryByTestId("r83-world-hand-legend")).toBeNull();
    expect(bubbleText()).toContain(
      WORLD_COPY.placement.needMoreObjectsBubble(1, 1, "Thinman"),
    );

    // Ring appears after 900 ms delay
    expect(screen.queryByTestId("r83-postplace-ring")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    const ring = screen.getByTestId("r83-postplace-ring");
    expect(ring.textContent).toContain(WORLD_COPY.placement.needMoreRingLabel);
    mockRect(ring, { left: 320, top: 360, width: 96, height: 112 });

    // Firing ring enters "rising" with real 3-screen intro-camera + CloudBand (never fake blue curtain)
    pinchHoldRuleA(ts, nuiCtrl, nowRef);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("r83-postplace-gate").getAttribute("data-mode")).toBe("rising");
    expect(screen.getByTestId("r83-world-camera")).toBeTruthy();
    expect(screen.getByTestId("r83-world-near-clouds").className).toContain("on");
    expect(screen.queryByTestId("r83-sky-rise")).toBeNull();
    expect(bubbleText()).toContain(WORLD_COPY.rise.bubble);
    expect(controller.requestRedraw).not.toHaveBeenCalled();

    // After 1.8 s cloud rise + 250 ms clean sky beat (2050 ms), invokes createAnother
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2050);
    });
    expect(onBumpDrawingRevision).toHaveBeenCalledTimes(1);
    expect(controller.requestRedraw).toHaveBeenCalledWith("create_another");
  });

  it("shows ready-play gate after 2nd placement (>= minDrawings) and starts GameplayHud when Mulai fires", async () => {
    vi.useFakeTimers();
    const nowRef = { current: 0 };
    const ts = new TestSource(() => nowRef.current);
    let nuiCtrl: NuiController | null = null;

    const controller = makeController();
    const creations = new CreationStore();
    creations.enterLevel(LEVELS[0]!.levelId);
    creations.replace([makeCreation("c-1", "Tangga"), makeCreation("c-2", "Jembatan")]);

    const baseProps = {
      level: LEVELS[0]!,
      controller,
      characterDisplayName: "Thinman",
      creations,
      onCreationsChange: vi.fn(),
      onBumpDrawingRevision: vi.fn(),
      onBackToLevels: vi.fn(),
      onWon: vi.fn(),
    };

    const { rerender } = render(
      <NuiHost ts={ts} clock={() => nowRef.current} onReady={(c) => { nuiCtrl = c; }}>
        <WorldScreen {...baseProps} snapshot={makeSnapshot("placing")} phase="placing" />
      </NuiHost>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <NuiHost ts={ts} clock={() => nowRef.current} onReady={(c) => { nuiCtrl = c; }}>
        <WorldScreen {...baseProps} snapshot={makeSnapshot("gameplay")} phase="gameplay" />
      </NuiHost>,
    );

    expect(screen.getByTestId("r83-postplace-gate").getAttribute("data-mode")).toBe("ready-play");
    expect(screen.queryByTestId("r83-gameplay-actions")).toBeNull();
    expect(bubbleText()).toContain(WORLD_COPY.placement.readyPlayBubble);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    const ring = screen.getByTestId("r83-postplace-ring");
    expect(ring.textContent).toContain(WORLD_COPY.placement.readyPlayRingLabel);
    mockRect(ring, { left: 320, top: 360, width: 96, height: 112 });

    pinchHoldRuleA(ts, nuiCtrl, nowRef);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId("r83-postplace-gate")).toBeNull();
    expect(screen.getByTestId("r83-gameplay-actions")).toBeTruthy();
    expect(screen.getByTestId("r83-world-hand-legend")).toBeTruthy();
    expect(bubbleText()).toContain(WORLD_COPY.gameplay.playBubble("Thinman"));

    // Reposition from GameplayHud -> placing -> gameplay shows reposition-ready (500 ms delay)
    fireEvent.click(screen.getByTestId("r83-world-reposition"));
    expect(mockGameHandles.instances[0]!.reposition).toHaveBeenCalledTimes(1);

    rerender(
      <NuiHost ts={ts} clock={() => nowRef.current} onReady={(c) => { nuiCtrl = c; }}>
        <WorldScreen {...baseProps} snapshot={makeSnapshot("placing")} phase="placing" />
      </NuiHost>,
    );
    rerender(
      <NuiHost ts={ts} clock={() => nowRef.current} onReady={(c) => { nuiCtrl = c; }}>
        <WorldScreen {...baseProps} snapshot={makeSnapshot("gameplay")} phase="gameplay" />
      </NuiHost>,
    );

    expect(screen.getByTestId("r83-postplace-gate").getAttribute("data-mode")).toBe("reposition-ready");
    expect(bubbleText()).toContain(WORLD_COPY.placement.repositionReadyBubble);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByTestId("r83-postplace-ring").textContent).toContain(WORLD_COPY.placement.readyPlayRingLabel);
  });

  it("hides top-right HUD chips and action buttons on world win (only SuccessPanel chip remains)", async () => {
    const controller = makeController();
    const creations = new CreationStore();
    creations.enterLevel(LEVELS[0]!.levelId);
    creations.replace([makeCreation("c-1"), makeCreation("c-2")]);

    render(
      <WorldScreen
        level={LEVELS[0]!}
        snapshot={makeSnapshot("gameplay")}
        phase="gameplay"
        controller={controller}
        characterDisplayName="Thinman"
        creations={creations}
        onCreationsChange={vi.fn()}
        onBumpDrawingRevision={vi.fn()}
        onBackToLevels={vi.fn()}
        onWon={vi.fn()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("r83-hud-level")).toBeTruthy();
    expect(screen.getByTestId("r83-hud-goal")).toBeTruthy();

    act(() => {
      mockGameHandles.instances[0]!.callbacks!.onOutcome("success");
    });

    expect(screen.getByTestId("r83-win-unlocked").textContent).toBe(WORLD_COPY.win.unlockedChip(1));
    expect(screen.queryByTestId("r83-hud-level")).toBeNull();
    expect(screen.queryByTestId("r83-hud-goal")).toBeNull();
    expect(screen.queryByTestId("r83-gameplay-actions")).toBeNull();
  });

  it("portals Taruh di sini ring and placement hint outside r83-world-camera so fixed overlays stay visible in viewport", async () => {
    vi.useFakeTimers();
    const controller = makeController();
    const creations = new CreationStore();
    creations.enterLevel(LEVELS[0]!.levelId);

    render(
      <WorldScreen
        level={LEVELS[0]!}
        snapshot={makeSnapshot("placing")}
        phase="placing"
        controller={controller}
        characterDisplayName="Thinman"
        creations={creations}
        onCreationsChange={vi.fn()}
        onBumpDrawingRevision={vi.fn()}
        onBackToLevels={vi.fn()}
        onWon={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    const stageRoot = screen.getByTestId("r83-world-stage");
    const camera = screen.getByTestId("r83-world-camera");
    const ring = screen.getByTestId("r83-place-ring");
    const hint = screen.getByTestId("r83-place-hint");

    expect(ring.textContent).toContain(WORLD_COPY.placement.placeRingLabel);
    expect(stageRoot.contains(ring)).toBe(true);
    expect(camera.contains(ring)).toBe(false);
    expect(stageRoot.contains(hint)).toBe(true);
    expect(camera.contains(hint)).toBe(false);
    expect(camera.className).not.toContain("is-rising");
  });

  it("useLevelSession stores multiple distinct recaps per level, dedupes exact duplicates, and caps at 12", () => {
    const { result } = renderHook(() =>
      useLevelSession({
        setRouteNotice: vi.fn(),
        redirectToLockedNotice: vi.fn(),
      }),
    );

    const r1: LevelRecap = {
      levelId: "stage-1-foundation",
      title: "Bab 1",
      strokes: [[{ x: 10, y: 10 }, { x: 80, y: 10 }]],
      finalLabel: "tangga",
      category: "padat",
      decision: "accept",
      firstGuess: "tangga",
      firstGuessConfidence: 0.85,
    };
    const r2: LevelRecap = {
      levelId: "stage-1-foundation",
      title: "Bab 1",
      strokes: [[{ x: 20, y: 40 }, { x: 140, y: 40 }]],
      finalLabel: "jembatan",
      category: "padat",
      decision: "correct",
      firstGuess: "bangku",
      firstGuessConfidence: 0.62,
    };
    const r3: LevelRecap = {
      levelId: "stage-2-ambiguity",
      title: "Bab 2",
      strokes: [[{ x: 5, y: 5 }, { x: 50, y: 50 }]],
      finalLabel: "meja",
      category: "padat",
      decision: "accept",
      firstGuess: "meja",
      firstGuessConfidence: 0.77,
    };

    act(() => {
      result.current.recordRecap(r1);
      result.current.recordRecap(r1); // duplicate ignored
      result.current.recordRecap(r2); // 2nd object in Bab 1 kept
      result.current.recordRecap(r3);
    });

    const recaps = result.current.getRecaps();
    expect(recaps).toHaveLength(3);
    expect(recaps.map((r) => `${r.title}:${r.finalLabel}`)).toEqual([
      "Bab 1:tangga",
      "Bab 1:jembatan",
      "Bab 2:meja",
    ]);

    // Verify cap at 12
    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.recordRecap({
          ...r3,
          finalLabel: `obj-${i}`,
          strokes: [[{ x: i * 10, y: 0 }, { x: i * 10 + 5, y: 20 }]],
        });
      }
    });
    expect(result.current.getRecaps()).toHaveLength(12);
  });

  it("hides #skipbar when devTools=false, shows right-aligned #skipbar when devTools=true, and skips need-more one scene at a time", async () => {
    vi.useFakeTimers();
    const controller = makeController();
    const creations = new CreationStore();
    creations.enterLevel(LEVELS[0]!.levelId);
    creations.replace([makeCreation("c-1", "Tangga")]);
    const onBumpDrawingRevision = vi.fn();
    const baseProps = {
      level: LEVELS[0]!,
      controller,
      characterDisplayName: "Thinman",
      creations,
      onCreationsChange: vi.fn(),
      onBumpDrawingRevision,
      onBackToLevels: vi.fn(),
      onWon: vi.fn(),
    };

    const { rerender } = render(
      <WorldScreen {...baseProps} snapshot={makeSnapshot("placing")} phase="placing" devTools={false} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("r83-skipbar")).toBeNull();

    rerender(
      <WorldScreen {...baseProps} snapshot={makeSnapshot("gameplay")} phase="gameplay" devTools={true} />,
    );

    const bar = screen.getByTestId("r83-skipbar");
    expect(bar.id).toBe("skipbar");
    expect(bar.classList.contains("is-right")).toBe(true);
    expect(screen.getByTestId("r83-postplace-gate").getAttribute("data-mode")).toBe("need-more");

    // Sandbox: "Benda berikutnya" only starts the flight to the sky ...
    expect(screen.getByTestId("r83-skipbar-label").textContent).toBe(`Level ${LEVELS[0]!.stage} · Benda berikutnya`);
    fireEvent.click(screen.getByTestId("r83-skipbar-btn"));
    expect(screen.getByTestId("r83-world-stage").getAttribute("data-postplace")).toBe("rising");
    expect(onBumpDrawingRevision).not.toHaveBeenCalled();
    // ... and "Ke langit" finishes it.
    expect(screen.getByTestId("r83-skipbar-label").textContent).toBe(`Level ${LEVELS[0]!.stage} · Ke langit`);
    fireEvent.click(screen.getByTestId("r83-skipbar-btn"));
    expect(onBumpDrawingRevision).toHaveBeenCalledTimes(1);
    expect(controller.requestRedraw).toHaveBeenCalledWith("create_another");
  });
});
