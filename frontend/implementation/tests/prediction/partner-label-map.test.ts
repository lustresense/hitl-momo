import { describe, expect, it, vi } from "vitest";
import { PartnerHttpPredictionProvider } from "@/src/prediction/partner-http-provider";
import { PredictionError } from "@/src/prediction/prediction-provider";
import type { DrawingInput } from "@/src/domain/types";

const INPUT: DrawingInput = { strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], hasInk: true, aspectRatio: 1 };
const EP = "https://partner.example/predict";

function fetchJson(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("partner response -> Top-3 shown to students", () => {
  it("shows Indonesian names, keeps the model label, order and exact confidence", async () => {
    const f = fetchJson({
      candidates: [
        { label: "cat", confidence: 0.6123 },
        { label: "dog", confidence: 0.2 },
        { label: "bird", confidence: 0.1 },
      ],
    });
    const r = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f }).predict(INPUT);
    expect(r.candidates.map((c) => c.label)).toEqual(["Kucing", "Anjing", "Burung"]);
    expect(r.candidates.map((c) => c.modelLabel)).toEqual(["cat", "dog", "bird"]);
    expect(r.candidates.map((c) => c.confidence)).toEqual([0.6123, 0.2, 0.1]);
    expect(r.candidates.map((c) => c.gameLabel)).toEqual([null, null, null]);
  });

  it("marks the result as model output (provenance source model)", async () => {
    const f = fetchJson({ candidates: [{ label: "cat", confidence: 0.5 }, { label: "dog", confidence: 0.3 }, { label: "bird", confidence: 0.2 }] });
    const r = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f }).predict(INPUT);
    expect(r.provenance).toMatchObject({ mode: "partner", source: "model" });
  });

  it("an unknown label is shown as sent and is never turned into a level object", async () => {
    const f = fetchJson({ candidates: [{ label: "kursi", confidence: 0.5 }, { label: "cat", confidence: 0.3 }, { label: "dog", confidence: 0.2 }] });
    const r = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f }).predict(INPUT);
    expect(r.candidates[0]).toMatchObject({ label: "kursi", modelLabel: "kursi", gameLabel: null });
  });

  it("a level-object word from a partner gets no gameLabel", async () => {
    const f = fetchJson({ candidates: [{ label: "papan", confidence: 0.5 }, { label: "batu", confidence: 0.3 }, { label: "tali", confidence: 0.2 }] });
    const r = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f }).predict(INPUT);
    expect(r.candidates.map((c) => c.gameLabel)).toEqual([null, null, null]);
  });

  it("policy reject: a label the model does not know is out-of-vocabulary", async () => {
    const f = fetchJson({ candidates: [{ label: "cat", confidence: 0.5 }, { label: "kursi", confidence: 0.3 }, { label: "dog", confidence: 0.2 }] });
    const p = new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f, outOfVocabulary: "reject" });
    await expect(p.predict(INPUT)).rejects.toMatchObject({ reason: "out-of-vocabulary" });
  });

  it("policy reject accepts a response made only of known model classes", async () => {
    const f = fetchJson({ candidates: [{ label: "cat", confidence: 0.5 }, { label: "dog", confidence: 0.3 }, { label: "bird", confidence: 0.2 }] });
    const p = new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f, outOfVocabulary: "reject" });
    await expect(p.predict(INPUT)).resolves.toBeDefined();
  });

  it("keeps an error instance for structural problems (no label mapping on malformed data)", async () => {
    const f = fetchJson({ candidates: [{ label: "cat", confidence: 2 }, { label: "dog", confidence: 0.3 }, { label: "bird", confidence: 0.2 }] });
    await expect(new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f }).predict(INPUT)).rejects.toBeInstanceOf(PredictionError);
  });
});
