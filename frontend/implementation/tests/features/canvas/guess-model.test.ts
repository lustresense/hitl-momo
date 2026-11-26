import { describe, expect, it } from "vitest";
import { FlowController } from "@/src/app/state-machine";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import { overrideDecision } from "@/src/domain/decision-resolver";
import type { InteractionEvent } from "@/src/domain/events";
import { LEVELS } from "@/src/domain/levels";
import type { DrawingInput, PredictionResult } from "@/src/domain/types";
import { buildGuessModel, overrideCatalogFor, resolveGuessProvenance } from "@/src/features/canvas";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";
import { makeProvenance } from "@/src/prediction/provenance";

const INK: DrawingInput = {
  strokes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.45 }]],
  hasInk: true,
  aspectRatio: 1,
};

describe("guess-model & HITL invariants (§9.1)", () => {
  it("overrideCatalogFor reads level.catalog from levels.ts and excludes every Top-3 label", () => {
    const level = LEVELS[0]!; // catalog: tangga, jembatan, bangku, papan luncur
    const top3: PredictionResult["candidates"] = [
      { label: "tangga", confidence: 0.72 },
      { label: "jembatan", confidence: 0.18 },
      { label: "awan", confidence: 0.1 },
    ];
    const options = overrideCatalogFor(level, top3);
    expect(options.map((o) => o.labelId)).toEqual(["bangku", "papan luncur"]);
    // Case-insensitive exclusion guard
    expect(overrideCatalogFor(level, ["Tangga", "AWAN", "Meja"]).map((o) => o.labelId)).toEqual([
      "jembatan",
      "bangku",
      "papan luncur",
    ]);
  });

  it("overrideCatalogFor returns empty array when every catalog label is already in Top-3", () => {
    const customLevel = {
      ...LEVELS[0]!,
      catalog: [
        { labelId: "tangga", displayName: "Tangga" },
        { labelId: "jembatan", displayName: "Jembatan" },
        { labelId: "bangku", displayName: "Bangku" },
      ],
    };
    const options = overrideCatalogFor(customLevel, [
      { label: "tangga", confidence: 0.6 },
      { label: "jembatan", confidence: 0.25 },
      { label: "bangku", confidence: 0.15 },
    ]);
    expect(options).toEqual([]);
  });

  it("every override option returned by overrideCatalogFor is valid for decideOverride()", () => {
    for (const level of LEVELS) {
      const prediction: PredictionResult = {
        candidates: [
          { label: level.catalog[0]!.labelId, confidence: 0.61 },
          { label: level.catalog[1]!.labelId, confidence: 0.27 },
          { label: "kaktus", confidence: 0.12 },
        ],
      };
      const options = overrideCatalogFor(level, prediction.candidates);
      expect(options.length).toBeGreaterThan(0);
      for (const opt of options) {
        expect(prediction.candidates.some((c) => c.label === opt.labelId)).toBe(false);
        expect(overrideDecision(opt.labelId, prediction)).toEqual({
          type: "override",
          finalLabel: opt.labelId,
        });
      }
    }
  });

  it("preserves exact provider labels & confidences (no fabricated numbers or guessFor heuristic)", () => {
    const prediction: PredictionResult = {
      candidates: [
        { label: "papan luncur", confidence: 0.436 },
        { label: "bangku", confidence: 0.344 },
        { label: "petir", confidence: 0.22 },
      ],
      provenance: makeProvenance("partner", 82, "mobilenet-v2"),
    };
    const model = buildGuessModel(prediction, LEVELS[1]!, "partner");
    expect(model.rows.map((r) => [r.rank, r.label, r.percent, r.actionVerb])).toEqual([
      [1, "papan luncur", 44, "Terima"],
      [2, "bangku", 34, "Pakai"],
      [3, "petir", 22, "Pakai"],
    ]);
    expect(model.momoLines[0]).toContain("44%");
    expect(model.momoLines[0]).toContain("Papan luncur");
    expect(model.momoLines[0]).toContain("bangku");
    expect(model.momoFog).toBe(0.4);
  });

  it("always labels Mock provenance cleanly without the word 'Demo' (O-13)", () => {
    const mockPred: PredictionResult = {
      candidates: [
        { label: "tangga", confidence: 0.86 },
        { label: "jembatan", confidence: 0.09 },
        { label: "bangku", confidence: 0.05 },
      ],
      provenance: makeProvenance("mock", 0),
    };
    const p1 = resolveGuessProvenance("mock", mockPred);
    // Even if caller passes "partner", prediction provenance "mock" still wins (never mislabeled).
    const p2 = resolveGuessProvenance("partner", mockPred);
    expect(p1.isMock).toBe(true);
    expect(p2.isMock).toBe(true);
    expect(p1.badgeText).toBe(CANVAS_COPY.guess.provenance.mock);
    expect(p1.badgeText.toLowerCase()).toContain("mock");
    expect(p1.badgeText.toLowerCase()).not.toContain("demo");

    const partnerPred: PredictionResult = {
      candidates: mockPred.candidates,
      provenance: makeProvenance("partner", 40),
    };
    const p3 = resolveGuessProvenance("partner", partnerPred);
    expect(p3.isMock).toBe(false);
    expect(p3.badgeText).toBe(CANVAS_COPY.guess.provenance.partner);
  });

  it("FlowController invariants: redraw emits no decision_made, Correct only 2|3, events free of PII/strokes", async () => {
    const events: InteractionEvent[] = [];
    const level = LEVELS[0]!;
    const provider = new MockPredictionProvider({
      vocabulary: level.vocabulary,
      stage: level.stage,
      latencyMs: 0,
    });
    const flow = new FlowController({
      provider,
      sink: { emit: (e) => void events.push(e) },
    });

    flow.enterLevel(level);
    await flow.submitDrawing(INK);
    flow.requestRedraw("evaluation");
    expect(events.some((e) => e.kind === "decision_made")).toBe(false);
    expect(events.some((e) => e.kind === "redraw_requested")).toBe(true);

    await flow.submitDrawing(INK);
    const top3 = flow.prediction!.candidates;
    // @ts-expect-error runtime guard: Correct only accepts 2 | 3
    expect(() => flow.decideCorrect(1)).toThrow();
    const override = overrideCatalogFor(level, top3)[0]!;
    flow.decideOverride(override.labelId);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("strokes");
    expect(serialized).not.toContain("studentNumber");
    expect(serialized).not.toContain("studentName");
  });
});
