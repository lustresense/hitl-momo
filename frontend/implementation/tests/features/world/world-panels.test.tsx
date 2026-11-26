// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StageArtwork } from "@/src/components/stage-preview/StageArtwork";
import { LEVELS } from "@/src/domain/levels";
import { WORLD_COPY, WORLD_LEVEL_COPY, formatWorldFailReason } from "@/src/domain/copy/world";
import { CreationStore } from "@/src/game/creation-store";
import type { FlowController, FlowStateSnapshot } from "@/src/app/state-machine";
import { R83Bubble } from "@/src/features/shared/R83Bubble";
import {
  FailPanel,
  GameplayHud,
  Placement,
  SuccessPanel,
  WorldIntroOverlay,
  WorldScreen,
  buildIntroBeats,
} from "@/src/features/world";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";
import { useEffect, useRef, type ReactNode } from "react";

const mockGameHandles = vi.hoisted(() => ({
  instances: [] as Array<{
    setInput: ReturnType<typeof vi.fn>;
    setPlacement: ReturnType<typeof vi.fn>;
    commitPlacementAt: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    reposition: ReturnType<typeof vi.fn>;
    unmount: ReturnType<typeof vi.fn>;
    callbacks?: {
      onOutcome: (o: "success" | "fail", reason?: string) => void;
      onFallComplete: () => void;
      onCommitPlacement: () => void;
      onReposition: () => void;
    };
    canvas?: HTMLCanvasElement;
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
    onFallComplete = vi.fn();
    selectCreation = vi.fn(() => true);

    async mount(
      canvas: HTMLCanvasElement,
      _level: unknown,
      _behavior: unknown,
      _finalLabel: string,
      _drawingInput: unknown,
      onOutcome: (o: "success" | "fail", reason?: string) => void,
      onFallComplete: () => void,
      onCommitPlacement: () => void,
      onReposition: () => void,
    ) {
      canvas.dataset.objectX = "240";
      canvas.dataset.objectY = "180";
      canvas.dataset.objectWidth = "80";
      canvas.dataset.objectHeight = "20";
      mockGameHandles.instances.push({
        setInput: this.setInput,
        setPlacement: this.setPlacement,
        commitPlacementAt: this.commitPlacementAt,
        rotate: this.rotate,
        retry: this.retry,
        reposition: this.reposition,
        unmount: this.unmount,
        callbacks: { onOutcome, onFallComplete, onCommitPlacement, onReposition },
        canvas,
      });
    }
  },
}));

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

function NuiHarness({
  children,
  onReady,
  ts,
  clock,
}: {
  children: ReactNode;
  onReady: (c: NuiController) => void;
  ts: TestSource;
  clock: () => number;
}) {
  return (
    <div data-ui="r83">
      <NuiProvider testSource={ts} clock={clock}>
        <ControllerCapture onReady={onReady} />
        {children}
      </NuiProvider>
    </div>
  );
}

function ControllerCapture({ onReady }: { onReady: (c: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => {
    onReady(ctrl);
  }, [ctrl, onReady]);
  return null;
}

describe("world copy, StageArtwork label prop, and panels (jsdom)", () => {
  beforeEach(() => {
    mockGameHandles.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("StageArtwork keeps default 'Bab' signpost text and supports optional 'Level 2'/'Level 3' label", () => {
    const { container: cDefault } = render(<StageArtwork scene={1} gameplay />);
    expect([...cDefault.querySelectorAll("tspan")].map((t) => t.textContent)).toEqual(["Lanjut ke", "Bab 2"]);

    const { container: c1 } = render(<StageArtwork scene={1} gameplay nextStageLabel="Level 2" />);
    expect([...c1.querySelectorAll("tspan")].map((t) => t.textContent)).toEqual(["Lanjut ke", "Level 2"]);

    const { container: c2 } = render(<StageArtwork scene={2} gameplay nextStageLabel="Level 3" />);
    expect([...c2.querySelectorAll("tspan")].map((t) => t.textContent)).toEqual(["Lanjut ke", "Level 3"]);
  });

  it("uses 'Level' across r8.3 world copy and preserves 'kena duri' fail reason (O-8 & Lampiran B)", () => {
    expect(WORLD_LEVEL_COPY[1].title).toBe("Level 1 · Jembatan Pertama");
    expect(WORLD_LEVEL_COPY[2].title).toBe("Level 2 · Menara Lipatan");
    expect(WORLD_LEVEL_COPY[3].title).toBe("Level 3 · Lorong Kabut Penghapus");
    expect(WORLD_COPY.win.unlockedChip(1)).toBe("Level 2 terbuka");
    expect(WORLD_COPY.win.unlockedChip(2)).toBe("Level 3 terbuka");
    expect(WORLD_COPY.win.unlockedChip(3)).toBe("Pusat Halaman terbuka");
    expect(WORLD_COPY.placement.placeRingLabel).toBe("Taruh di sini");
    expect(formatWorldFailReason("Jatuh ke lantai duri!", "Thinman")).toBe(
      "Thinman kena duri. Cari jalan yang lebih aman.",
    );
    expect(formatWorldFailReason("Jatuh ke jurang!", "Thinman")).toContain("jatuh ke celah");
    expect(formatWorldFailReason("Menyentuh objek berbahaya (kaktus)!", "Thinman")).toContain("berbahaya");
  });

  it("WorldIntroOverlay groups beats like intro.js, shows .r83-hint immediately, hides skip in production, and supports devTools skip", () => {
    vi.useFakeTimers();
    const beats = buildIntroBeats(1, "Thinman");
    expect(beats).toHaveLength(3);
    expect(beats[0]).toMatchObject({ kind: "story", focus: "thinman" });
    expect(beats[1]).toMatchObject({ kind: "story", focus: "ahead" });
    expect(beats[2]).toMatchObject({ kind: "nudge", focus: "ahead" });

    let now = 0;
    const ts = new TestSource(() => now);
    let nuiCtrl: NuiController | null = null;
    const onReveal = vi.fn();
    const onFinish = vi.fn();

    render(
      <NuiHarness ts={ts} clock={() => now} onReady={(c) => { nuiCtrl = c; }}>
        <WorldIntroOverlay level={LEVELS[0]!} characterDisplayName="Thinman" onReveal={onReveal} onFinish={onFinish} />
      </NuiHarness>,
    );

    const introEl = screen.getByTestId("r83-world-intro");
    expect(introEl).toBeTruthy();
    expect(introEl.getAttribute("data-phase")).toBe("drop");
    expect(screen.getByTestId("r83-intro-dim")).toBeTruthy();
    expect(screen.getByTestId("r83-intro-title").textContent).toBe("Level 1 · Jembatan Pertama");

    const hint = screen.getByRole("note");
    expect(hint.classList.contains("r83-hint")).toBe(true);
    expect(hint.style.opacity).toBe("1");
    expect(hint.textContent).toBe(WORLD_COPY.intro.hint);
    expect(screen.queryByTestId("r83-intro-skip")).toBeNull();

    cleanup();
    render(
      <NuiHarness ts={ts} clock={() => now} onReady={(c) => { nuiCtrl = c; }}>
        <WorldIntroOverlay
          level={LEVELS[0]!}
          characterDisplayName="Thinman"
          devTools
          onReveal={onReveal}
          onFinish={onFinish}
        />
      </NuiHarness>,
    );

    fireEvent.click(screen.getByTestId("r83-intro-skip"));
    // Like the sandbox, the camera still rises, only about 7x faster.
    expect(onFinish).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(450); });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(nuiCtrl).not.toBeNull();
  });

  it("FailPanel registers 3 Rule B targets (1000 ms) inside R83Bubble and triggers chosen recovery", async () => {
    vi.useFakeTimers();
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const onRetry = vi.fn();
    const onReposition = vi.fn();
    const onRedraw = vi.fn();

    render(
      <NuiHarness ts={ts} clock={() => now} onReady={(c) => { ctrl = c; }}>
        <R83Bubble
          text="Thinman kena duri. Cari jalan yang lebih aman."
          visible
          anchor="mid"
          getMomoRect={() => ({ left: 100, top: 200, right: 240, bottom: 400, width: 140, height: 200 })}
          extra={<FailPanel onRetry={onRetry} onReposition={onReposition} onRedraw={onRedraw} />}
        />
      </NuiHarness>,
    );

    const retryBtn = screen.getByTestId("r83-fail-retry");
    const placeBtn = screen.getByTestId("r83-fail-place");
    const drawBtn = screen.getByTestId("r83-fail-draw");
    mockRect(retryBtn, { left: 100, top: 200, width: 120, height: 48 });
    mockRect(placeBtn, { left: 240, top: 200, width: 120, height: 48 });
    mockRect(drawBtn, { left: 380, top: 200, width: 120, height: 48 });

    act(() => {
      now = 50;
      ts.push({ t: now, x: 290, y: 224, inFrame: true, pinch: false });
      ctrl?.stepNow(now);
    });
    expect(placeBtn.dataset.nui).toBe("B");
    expect(placeBtn.classList.contains("nui-lit")).toBe(true);

    // Pinch and hold for 1000 ms in <= 50 ms steps (dt capped at 50 ms)
    act(() => {
      now = 100;
      ts.push({ t: now, x: 290, y: 224, inFrame: true, pinch: true });
      ctrl?.stepNow(now);
      for (let i = 1; i <= 21; i++) {
        now += 50;
        ts.push({ t: now, x: 290, y: 224, inFrame: true, pinch: true });
        ctrl?.stepNow(now);
      }
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onReposition).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
  });

  it("SuccessPanel records win immediately, shows Level N+1 chip, and fires 'Lanjut' ring (1000 ms)", async () => {
    vi.useFakeTimers();
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const onWin = vi.fn();
    const onContinue = vi.fn();
    const lines: string[] = [];

    function SuccessHost() {
      const bubbleRef = useRef<import("@/src/features/shared/R83Bubble").R83BubbleHandle | null>(null);
      return (
        <>
          <R83Bubble
            ref={bubbleRef}
            text={lines.at(-1) ?? "Menang"}
            visible
            anchor="side"
            getMomoRect={() => ({ left: 80, top: 200, right: 240, bottom: 440, width: 160, height: 240 })}
          />
          <SuccessPanel
            stage={1}
            characterDisplayName="Thinman"
            bubbleRef={bubbleRef}
            onWin={onWin}
            onLineChange={(l) => lines.push(l)}
            onContinue={onContinue}
          />
        </>
      );
    }

    render(
      <NuiHarness ts={ts} clock={() => now} onReady={(c) => { ctrl = c; }}>
        <SuccessHost />
      </NuiHarness>,
    );

    expect(onWin).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("r83-win-unlocked").textContent).toBe("Level 2 terbuka");
    expect(screen.queryByTestId("r83-win-continue")).toBeNull();

    // Advance through the win lines + 400 ms ring delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(lines.at(-1)).toBe("Level 2 sudah kebuka!");
    const ring = screen.getByTestId("r83-win-continue");
    mockRect(ring, { left: 320, top: 360, width: 96, height: 112 });

    act(() => {
      now = 50;
      ts.push({ t: now, x: 100, y: 100, inFrame: true, pinch: false });
      ctrl?.stepNow(now);
      now = 100;
      ts.push({ t: now, x: 100, y: 100, inFrame: true, pinch: true });
      ctrl?.stepNow(now);
      for (let i = 1; i <= 21; i++) {
        now += 50;
        ts.push({ t: now, x: 100, y: 100, inFrame: true, pinch: true });
        ctrl?.stepNow(now);
      }
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("Placement drags relatively (12 px threshold), shows 'Taruh di sini' after 700 ms, and commits at 1500 ms", async () => {
    vi.useFakeTimers();
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const setPlacement = vi.fn(() => true);
    const commitPlacementAt = vi.fn(() => true);
    const rotate = vi.fn(() => true);

    function PlacementHost() {
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const worldRef = useRef<HTMLDivElement | null>(null);
      const bubbleRef = useRef<import("@/src/features/shared/R83Bubble").R83BubbleHandle | null>(null);
      const gameRef = useRef({
        setPlacement,
        commitPlacementAt,
        rotate,
      } as unknown as import("@/src/game/game-controller").GameController);

      useEffect(() => {
        if (canvasRef.current) {
          canvasRef.current.dataset.objectX = "200";
          canvasRef.current.dataset.objectY = "150";
          canvasRef.current.dataset.objectWidth = "80";
          canvasRef.current.dataset.objectHeight = "20";
        }
      }, []);

      return (
        <div ref={worldRef}>
          <canvas ref={canvasRef} width={800} height={450} />
          <Placement
            active
            canvasRef={canvasRef}
            worldRef={worldRef}
            gameRef={gameRef}
            bubbleRef={bubbleRef}
            onExit={vi.fn()}
            onRedraw={vi.fn()}
          />
        </div>
      );
    }

    render(
      <NuiHarness ts={ts} clock={() => now} onReady={(c) => { ctrl = c; }}>
        <PlacementHost />
      </NuiHarness>,
    );

    // Before 700 ms, ring is not shown
    expect(screen.queryByTestId("r83-place-ring")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    const ring = screen.getByTestId("r83-place-ring");
    expect(ring.textContent).toContain("Taruh di sini");

    // Drag >= 12 px closes ring and invokes setPlacement
    act(() => {
      now = 100;
      ts.push({ t: now, x: 400, y: 300, inFrame: true, pinch: true });
      now = 120;
      ts.push({ t: now, x: 440, y: 320, inFrame: true, pinch: true });
    });
    expect(setPlacement).toHaveBeenCalled();
    expect(screen.queryByTestId("r83-place-ring")).toBeNull();

    // Release -> 700 ms later ring reappears -> hold 1500 ms commits
    act(() => {
      now = 200;
      ts.push({ t: now, x: 440, y: 320, inFrame: true, pinch: false });
      ctrl?.stepNow(now);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    const ring2 = screen.getByTestId("r83-place-ring");
    mockRect(ring2, { left: 320, top: 200, width: 96, height: 112 });

    act(() => {
      now = 950;
      ts.push({ t: now, x: 120, y: 120, inFrame: true, pinch: true });
      ctrl?.stepNow(now);
      for (let i = 1; i <= 31; i++) {
        now += 50;
        ts.push({ t: now, x: 120, y: 120, inFrame: true, pinch: true });
        ctrl?.stepNow(now);
      }
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(commitPlacementAt).toHaveBeenCalledTimes(1);
  });

  it("GameplayHud forwards joystick analog axis + tap jump and keyboard arrows to GameController.setInput", () => {
    vi.useFakeTimers();
    let now = 0;
    const ts = new TestSource(() => now);
    const setInput = vi.fn();
    const onExit = vi.fn();
    const onReposition = vi.fn();
    const onRedraw = vi.fn();

    function HudHost() {
      const gameRef = useRef({ setInput } as unknown as import("@/src/game/game-controller").GameController);
      return (
        <GameplayHud
          active
          stage={1}
          outcome={null}
          gameRef={gameRef}
          onExit={onExit}
          onReposition={onReposition}
          onRedraw={onRedraw}
        />
      );
    }

    render(
      <NuiHarness ts={ts} clock={() => now} onReady={() => undefined}>
        <HudHost />
      </NuiHarness>,
    );

    expect(screen.getByTestId("r83-world-hand-legend")).toBeTruthy();

    // Joystick move +69 px -> axis = 0.675
    act(() => {
      now = 100;
      ts.push({ t: now, x: 300, y: 300, inFrame: true, pinch: true });
      now = 150;
      ts.push({ t: now, x: 369, y: 300, inFrame: true, pinch: true });
    });
    const lastJoy = setInput.mock.calls.at(-1)?.[0];
    expect(lastJoy.right).toBe(true);
    expect(lastJoy.left).toBe(false);
    expect(lastJoy.axis).toBeCloseTo(0.675, 5);

    act(() => {
      now = 450;
      ts.push({ t: now, x: 369, y: 300, inFrame: true, pinch: false });
    });

    // Keyboard arrows
    fireEvent.keyDown(window, { code: "ArrowLeft" });
    expect(setInput.mock.calls.at(-1)?.[0]).toEqual({ left: true, right: false, jump: false, axis: -1 });
    fireEvent.keyDown(window, { code: "ArrowUp" });
    expect(setInput.mock.calls.at(-1)?.[0]).toEqual({ left: true, right: false, jump: true, axis: -1 });
    fireEvent.keyUp(window, { code: "ArrowLeft" });
    fireEvent.keyUp(window, { code: "ArrowUp" });

    // Action buttons
    fireEvent.click(screen.getByTestId("r83-world-reposition"));
    expect(onReposition).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("r83-world-redraw"));
    expect(onRedraw).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("r83-world-exit"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("WorldScreen acts as a drop-in GameplayScreenProps root connecting KAPLAY, FallFx, Placement, GameplayHud, and outcomes", async () => {
    const controller = {
      drawingInput: null,
      recordGameplayAttempt: vi.fn(),
      completeFall: vi.fn(),
      commitPlacement: vi.fn(),
      repositionObject: vi.fn(),
      recordGameplayRetry: vi.fn(),
      requestRedraw: vi.fn(),
      reportGameplayOutcome: vi.fn(),
    } as unknown as FlowController;

    const snapshot: FlowStateSnapshot = {
      phase: "falling",
      levelId: LEVELS[0]!.levelId,
      attemptId: "att-1",
      hasPrediction: true,
      decision: { type: "accept", finalLabel: "Tangga", sourceRank: 1 },
      behavior: "solid",
      cyclesCompleted: 0,
      redrawCount: 0,
      placingObject: { label: "Tangga", behavior: "solid" },
    };

    const creations = new CreationStore();
    const onCreationsChange = vi.fn();
    const onBumpDrawingRevision = vi.fn();
    const onBackToLevels = vi.fn();
    const onWon = vi.fn();

    const { rerender } = render(
      <WorldScreen
        level={LEVELS[0]!}
        snapshot={snapshot}
        phase="falling"
        controller={controller}
        characterDisplayName="Thinman"
        creations={creations}
        onCreationsChange={onCreationsChange}
        onBumpDrawingRevision={onBumpDrawingRevision}
        onBackToLevels={onBackToLevels}
        onWon={onWon}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("r83-world-stage")).toBeTruthy();
    expect(screen.getByTestId("r83-fall-fx")).toBeTruthy();
    expect(mockGameHandles.instances).toHaveLength(1);

    // Transition to placing -> gameplay -> fail outcome
    rerender(
      <WorldScreen
        level={LEVELS[0]!}
        snapshot={{ ...snapshot, phase: "placing" }}
        phase="placing"
        controller={controller}
        characterDisplayName="Thinman"
        creations={creations}
        onCreationsChange={onCreationsChange}
        onBumpDrawingRevision={onBumpDrawingRevision}
        onBackToLevels={onBackToLevels}
        onWon={onWon}
      />,
    );
    expect(screen.getByTestId("r83-placement-box")).toBeTruthy();

    rerender(
      <WorldScreen
        level={LEVELS[0]!}
        snapshot={{ ...snapshot, phase: "gameplay" }}
        phase="gameplay"
        controller={controller}
        characterDisplayName="Thinman"
        creations={creations}
        onCreationsChange={onCreationsChange}
        onBumpDrawingRevision={onBumpDrawingRevision}
        onBackToLevels={onBackToLevels}
        onWon={onWon}
      />,
    );
    expect(screen.getByTestId("r83-hud-level").textContent).toBe("Level 1 · Jembatan Pertama");

    act(() => {
      mockGameHandles.instances[0]!.callbacks!.onOutcome("fail", "Jatuh ke lantai duri!");
    });
    expect(screen.getByTestId("r83-fail-panel")).toBeTruthy();
    expect(controller.recordGameplayAttempt).toHaveBeenCalledWith("fail");
  });

  it("world.css wraps .sticker .sheet/.tape ink borders in :where(...) and stays scoped under [data-ui='r83']", () => {
    const css = readFileSync(resolve(process.cwd(), "src/features/world/world.css"), "utf8");
    expect(css).not.toMatch(/mix-blend-mode\s*:/i);
    expect(css).not.toMatch(/backdrop-filter\s*:/i);
    expect(css).toContain('[data-ui="r83"] :where(.sticker .sheet)');
    expect(css).toContain('[data-ui="r83"] :where(.sticker .tape)');
    const clean = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@(keyframes|media)[^{]*\{([\s\S]*?\})\s*\}/g, "");
    const headers = [...clean.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter(Boolean);
    expect(headers.length).toBeGreaterThan(0);
    for (const block of headers) {
      for (const sel of block.split(",").map((s) => s.trim()).filter(Boolean)) {
        expect(sel).toContain('[data-ui="r83"]');
      }
    }
  });
});
