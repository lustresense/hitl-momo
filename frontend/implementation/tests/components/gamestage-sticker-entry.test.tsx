import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { GameStage } from "@/src/components/game/GameStage";
import { LEVELS } from "@/src/domain/levels";

// The sticker's "Lempar" is the student's entry into the world (S1): the world falls and places at once,
// with no "Masukkan ke dunia" pop-up to click first.
const mockMount = vi.fn().mockResolvedValue(undefined);

vi.mock("@/src/game/game-controller", () => ({
  GameController: class {
    mount = mockMount;
    unmount = vi.fn();
    setInput = vi.fn();
    setPlacement = vi.fn().mockReturnValue(true);
    commitPlacementAt = vi.fn().mockReturnValue(true);
    retry = vi.fn();
    reposition = vi.fn();
  },
}));

beforeEach(() => {
  mockMount.mockClear();
});

afterEach(() => cleanup());

function stage(phase: "falling" | "placing") {
  return (
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
    />
  );
}

describe("GameStage after Lempar: the world starts without the Masukkan ke dunia pop-up", () => {
  it.each(["falling", "placing"] as const)("%s: no enter pop-up and the world mounts at once", async (phase) => {
    await act(async () => {
      render(stage(phase));
    });
    expect(screen.queryByTestId("enter-world-popup")).toBeNull();
    expect(screen.queryByTestId("btn-enter-world")).toBeNull();
    expect(mockMount).toHaveBeenCalledTimes(1);
  });
});
