import { describe, expect, it } from "vitest";
import { FlowController } from "@/src/app/state-machine";
import { LEVELS } from "@/src/domain/levels";
import type { DrawingInput, PredictionResult } from "@/src/domain/types";
import type { PredictionProvider } from "@/src/prediction/prediction-provider";

const INK: DrawingInput = { strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.4 }]], hasInk: true, aspectRatio: 1 };

/** Top-3 whose display labels are Indonesian text; gameLabel is the level label the label map resolved (or null). */
const TOP3 = {
  candidates: [
    { label: "Papan", confidence: 0.6, gameLabel: "papan" },
    { label: "Batu", confidence: 0.25, gameLabel: "batu" },
    { label: "Perahu layar", confidence: 0.15, gameLabel: null },
  ],
} as unknown as PredictionResult;

async function evaluatingFlow(): Promise<FlowController> {
  const provider: PredictionProvider = { predict: async () => TOP3 };
  const flow = new FlowController({ provider });
  flow.enterLevel(LEVELS[0]!);
  await flow.submitDrawing(INK);
  return flow;
}

describe("behavior comes from the level label, not the display label", () => {
  it("accept uses the rank 1 gameLabel (display label 'Papan' is not a level key)", async () => {
    const flow = await evaluatingFlow();
    flow.decideAccept();
    expect(flow.decision).toMatchObject({ type: "accept", finalLabel: "Papan" });
    expect(flow.behavior).toBe("solid");
  });

  it("correct uses the chosen rank's gameLabel", async () => {
    const flow = await evaluatingFlow();
    flow.decideCorrect(2);
    expect(flow.decision).toMatchObject({ type: "correct", finalLabel: "Batu" });
    expect(flow.behavior).toBe("danger");
  });

  it("a candidate without a gameLabel is unresolved, even if its display label reads like a level object", async () => {
    const flow = await evaluatingFlow();
    flow.decideCorrect(3);
    expect(flow.decision?.finalLabel).toBe("Perahu layar");
    expect(flow.behavior).toBe("unresolved");
  });

  it("override takes a level label from the level list directly", async () => {
    const flow = await evaluatingFlow();
    flow.decideOverride("papan");
    expect(flow.decision).toMatchObject({ type: "override", finalLabel: "papan" });
    expect(flow.behavior).toBe("solid");
  });
});
