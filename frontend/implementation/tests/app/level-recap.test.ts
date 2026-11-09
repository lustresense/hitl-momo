import { describe, expect, it } from "vitest";
import { recapFromFlow } from "../../src/app/hooks/useLevelSession";
import { LEVELS } from "../../src/domain/levels";

const prediction = { candidates: [{ label: "papan", confidence: 0.5 }, { label: "balok", confidence: 0.3 }, { label: "tangga", confidence: 0.2 }] } as never;

describe("R9 level recap for the closing", () => {
  it("is null until a decision exists", () => {
    expect(recapFromFlow(LEVELS[0]!, { drawingInput: null, prediction: null, decision: null, behavior: null })).toBeNull();
  });
  it("keeps strokes, final label, category, decision and Momo's first guess", () => {
    const r = recapFromFlow(LEVELS[2]!, {
      drawingInput: { strokes: [[{ x: 1, y: 2, t: 0 }]] } as never,
      prediction,
      decision: { type: "correct", finalLabel: "tali", sourceRank: 2 } as never,
      behavior: "danger",
    });
    expect(r).toMatchObject({ levelId: "stage-3-validation", title: "Bab 3", finalLabel: "tali", category: "bahaya", decision: "correct", firstGuess: "papan" });
    expect(r!.strokes).toHaveLength(1);
  });
});
