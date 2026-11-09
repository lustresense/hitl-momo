// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { LEVELS } from "@/src/domain/levels";
import { FlowController } from "@/src/app/state-machine";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";
import { isLevelUnlocked, nextStageToPlay, recordCompletedStage } from "@/src/app/level-progress";
import type { DrawingInput } from "@/src/domain/types";

const MOCK_STROKE: DrawingInput = {
  strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
  hasInk: true,
  aspectRatio: 1,
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("four-level journey: Bab 1 to Bab 4, then the closing", () => {
  it("opens Bab 4 only after Bab 3 is won", () => {
    expect(isLevelUnlocked(4)).toBe(false);
    recordCompletedStage(1);
    recordCompletedStage(2);
    expect(isLevelUnlocked(4)).toBe(false);
    recordCompletedStage(3);
    expect(isLevelUnlocked(4)).toBe(true);
    expect(nextStageToPlay([1, 2, 3, 4])).toBe(4);
  });

  it("runs L1 -> L2 -> L3 -> L4, and winning L4 is the last completion", async () => {
    const provider = new MockPredictionProvider({
      vocabulary: ["papan", "balok", "tangga", "batu", "tali", "ember"],
      stage: 1,
      latencyMs: 0,
    });
    const controller = new FlowController({ provider, goalCompletesLevel: true });

    const playOneObject = async (choose: "accept" | "correct2" | "override") => {
      await controller.submitDrawing(MOCK_STROKE);
      expect(controller.getSnapshot().phase).toBe("evaluating");
      if (choose === "accept") controller.decideAccept();
      else if (choose === "correct2") controller.decideCorrect(2);
      else controller.decideOverride("jembatan");
      controller.completeFall();
      controller.commitPlacement();
      expect(controller.getSnapshot().phase).toBe("gameplay");
      controller.reportGameplayOutcome("success");
      expect(controller.getSnapshot().phase).toBe("complete");
    };

    controller.enterLevel(LEVELS[0]!);
    await playOneObject("accept");
    controller.exitToLevelEntry();

    controller.enterLevel(LEVELS[1]!);
    await playOneObject("correct2");
    controller.exitToLevelEntry();

    controller.enterLevel(LEVELS[2]!);
    await playOneObject("override");
    controller.exitToLevelEntry();

    controller.enterLevel(LEVELS[3]!);
    expect(controller.getSnapshot().levelId).toBe("stage-4-proof");
    expect(controller.getSnapshot().phase).toBe("drawing");
    await playOneObject("accept");
    expect(controller.getSnapshot().levelId).toBe("stage-4-proof");
  });
});
