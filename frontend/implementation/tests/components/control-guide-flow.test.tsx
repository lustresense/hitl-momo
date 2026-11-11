import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { GameStage } from "@/src/components/game/GameStage";
import { LEVELS } from "@/src/domain/levels";

vi.mock("@/src/game/game-controller", () => ({
  GameController: class {
    mount = vi.fn().mockResolvedValue(undefined);
    unmount = vi.fn();
    setInput = vi.fn();
    setPlacement = vi.fn().mockReturnValue(true);
    commitPlacementAt = vi.fn().mockReturnValue(true);
    retry = vi.fn();
    reposition = vi.fn();
  },
}));

const GUIDE_MS = 6000;

function renderStage(phase: "placing" | "gameplay") {
  return render(
    <GameStage
      integrated
      level={LEVELS[0]!}
      behavior="solid"
      decision={{ type: "accept", finalLabel: "papan", sourceRank: 1 }}
      drawingInput={null}
      phase={phase}
      onOutcomeReported={vi.fn()}
      onRedraw={vi.fn()}
      onFallComplete={vi.fn()}
      onCommitPlacement={vi.fn()}
      onReposition={vi.fn()}
    />,
  );
}

/** Entering the world mounts the game; the guide only starts once it is ready. */
async function enterWorld() {
  await act(async () => {});
}

const guide = () => screen.queryByTestId("control-guide");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("ControlGuide in the play phase", () => {
  it("opens when play starts (fallback wording by default) and closes by itself after 6 seconds", async () => {
    renderStage("gameplay");
    await enterWorld();

    expect(guide()).not.toBeNull();
    expect(screen.getByText("Pakai keyboard atau tombol")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(GUIDE_MS - 1);
    });
    expect(guide()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(guide()).toBeNull();
  });

  it("closes at once on the first movement, before the 6 seconds are up", async () => {
    renderStage("gameplay");
    await enterWorld();
    expect(guide()).not.toBeNull();

    act(() => {
      fireEvent.keyDown(window, { code: "ArrowRight" });
    });
    expect(guide()).toBeNull();
  });

  it("the help button reopens the guide, stays open until closed, and toggles it shut", async () => {
    renderStage("gameplay");
    await enterWorld();
    act(() => {
      vi.advanceTimersByTime(GUIDE_MS);
    });
    expect(guide()).toBeNull();

    fireEvent.click(screen.getByTestId("btn-control-guide"));
    expect(guide()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(GUIDE_MS * 2);
    });
    expect(guide()).not.toBeNull();

    fireEvent.click(screen.getByTestId("btn-control-guide"));
    expect(guide()).toBeNull();
  });

  it("is not shown while the student is still placing the object", async () => {
    renderStage("placing");
    await enterWorld();
    expect(guide()).toBeNull();
    expect(screen.queryByTestId("btn-control-guide")).toBeNull();
  });
});
