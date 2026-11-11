import { describe, expect, it } from "vitest";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";
import { makeProvenance } from "@/src/prediction/provenance";
import { showDemoNotice } from "@/src/config/demo";
import type { DrawingInput } from "@/src/domain/types";

const INPUT: DrawingInput = { strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], hasInk: true, aspectRatio: 1 };

describe("provenance source", () => {
  it("partner results are source model, mock results are source demo", () => {
    expect(makeProvenance("partner", 1).source).toBe("model");
    expect(makeProvenance("mock", 1).source).toBe("demo");
  });

  it("a mock prediction is source demo and each candidate says its game label is its own label", async () => {
    const p = new MockPredictionProvider({ vocabulary: ["papan", "batu", "tali", "tangga"], stage: 1, latencyMs: 0 });
    const r = await p.predict(INPUT);
    expect(r.provenance?.source).toBe("demo");
    expect(r.candidates.map((c) => c.gameLabel)).toEqual(r.candidates.map((c) => c.label));
  });

  it("the demo notice shows only for demo predictions", () => {
    expect(showDemoNotice("demo")).toBe(true);
    expect(showDemoNotice("model")).toBe(false);
  });
});
