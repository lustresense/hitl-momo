// @vitest-environment jsdom
import { useEffect, useRef, type ReactNode } from "react";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailPanel, Placement, SuccessPanel } from "@/src/features/world";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";

const emit = vi.hoisted(() => vi.fn());
vi.mock("@/src/audio", () => ({
  audio: { emit, musicPatch: vi.fn(), duck: vi.fn() },
  PENTATONIC_RATES: [1, 1.122, 1.26, 1.498, 1.682, 2],
}));

const ids = () => emit.mock.calls.map(([id]) => id as string);

function ControllerCapture({ onReady }: { onReady: (c: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => onReady(ctrl), [ctrl, onReady]);
  return null;
}

function Harness({ children, ts, clock, onReady }: { children: ReactNode; ts: TestSource; clock: () => number; onReady: (c: NuiController) => void }) {
  return (
    <div data-ui="r83">
      <NuiProvider testSource={ts} clock={clock}>
        <ControllerCapture onReady={onReady} />
        {children}
      </NuiProvider>
    </div>
  );
}

describe("world audio wiring (UNIT_ONLY, audio mocked)", () => {
  beforeEach(() => emit.mockClear());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("SuccessPanel sounds the win once (sparkle + level jingle), and stays silent for a dev-forced demo win", () => {
    let now = 0;
    const ts = new TestSource(() => now);
    const bubbleRef = { current: null };
    const { unmount } = render(
      <Harness ts={ts} clock={() => now} onReady={() => undefined}>
        <SuccessPanel stage={1} bubbleRef={bubbleRef} onLineChange={() => undefined} onContinue={() => undefined} />
      </Harness>,
    );
    expect(ids()).toEqual(["win.sparkle", "jingle.level_complete"]);
    unmount();

    emit.mockClear();
    render(
      <Harness ts={ts} clock={() => now} onReady={() => undefined}>
        <SuccessPanel stage={1} bubbleRef={bubbleRef} demo onLineChange={() => undefined} onContinue={() => undefined} />
      </Harness>,
    );
    expect(ids()).toEqual([]);
  });

  it("FailPanel rings in once when it becomes visible (after its 350 ms entrance delay)", async () => {
    let now = 0;
    const ts = new TestSource(() => now);
    render(
      <Harness ts={ts} clock={() => now} onReady={() => undefined}>
        <FailPanel onRetry={() => undefined} onReposition={() => undefined} onRedraw={() => undefined} />
      </Harness>,
    );
    expect(ids()).toEqual([]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(ids()).toEqual(["ui.ring_in"]);
  });

  function PlacementHost({ game }: { game: { setPlacement: (x: number, y: number) => boolean; commitPlacementAt: (x: number, y: number) => boolean; rotate: (d?: 1 | -1) => boolean } }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const worldRef = useRef<HTMLDivElement | null>(null);
    const bubbleRef = useRef(null);
    const gameRef = useRef(game as unknown as import("@/src/game/game-controller").GameController);
    useEffect(() => {
      const c = canvasRef.current;
      if (c) Object.assign(c.dataset, { objectX: "200", objectY: "150", objectWidth: "80", objectHeight: "20" });
    }, []);
    return (
      <div ref={worldRef}>
        <canvas ref={canvasRef} width={800} height={450} />
        <Placement active canvasRef={canvasRef} worldRef={worldRef} gameRef={gameRef} bubbleRef={bubbleRef} onExit={vi.fn()} onRedraw={vi.fn()} />
      </div>
    );
  }

  it("Placement: successful turn -> place.rotate; refused turn -> ui.denied (never both)", () => {
    let now = 0;
    const ts = new TestSource(() => now);
    const rotate = vi.fn(() => true);
    const game = { setPlacement: vi.fn(() => true), commitPlacementAt: vi.fn(() => true), rotate };
    render(
      <Harness ts={ts} clock={() => now} onReady={() => undefined}>
        <PlacementHost game={game} />
      </Harness>,
    );
    fireEvent.click(screen.getByTestId("r83-place-rotate"));
    expect(ids()).toEqual(["place.rotate"]);

    emit.mockClear();
    rotate.mockReturnValue(false);
    fireEvent.click(screen.getByTestId("r83-place-rotate"));
    expect(ids()).toEqual(["ui.denied"]);
  });

  it("Placement: drag start -> place.grab; the first refused move of a streak -> one ui.denied; slides stay quiet", () => {
    vi.useFakeTimers();
    let now = 0;
    const ts = new TestSource(() => now);
    let accept = true;
    const game = {
      setPlacement: vi.fn(() => accept),
      commitPlacementAt: vi.fn(() => true),
      rotate: vi.fn(() => true),
    };
    render(
      <Harness ts={ts} clock={() => now} onReady={() => undefined}>
        <PlacementHost game={game} />
      </Harness>,
    );
    act(() => {
      now = 100;
      ts.push({ t: now, x: 400, y: 300, inFrame: true, pinch: true });
      now = 120;
      ts.push({ t: now, x: 440, y: 320, inFrame: true, pinch: true });
    });
    expect(ids()).toContain("place.grab");
    expect(ids()).not.toContain("ui.denied");

    emit.mockClear();
    accept = false;
    act(() => {
      now = 140;
      ts.push({ t: now, x: 480, y: 340, inFrame: true, pinch: true });
      now = 160;
      ts.push({ t: now, x: 520, y: 360, inFrame: true, pinch: true });
      now = 180;
      ts.push({ t: now, x: 560, y: 380, inFrame: true, pinch: true });
    });
    expect(ids().filter((i) => i === "ui.denied")).toEqual(["ui.denied"]);
  });
});
