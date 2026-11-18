import { describe, expect, it } from "vitest";
import { SubmissionAdapter } from "@/src/api/submission-adapter";
import { MemoryOutboxStorage, OutboxQueue } from "@/src/api/outbox";
import type { SubmissionClient } from "@/src/api/submission-client";
import type { FlowDecisionSnapshot, FlowGameplayResultSnapshot } from "@/src/app/state-machine";

/** source undefined = a prediction without provenance (must never be submitted). */
function snapshot(source: "model" | "demo" | undefined): FlowDecisionSnapshot {
  return {
    attemptId: "att-1",
    levelId: "stage-1-foundation",
    drawingInput: { strokes: [[{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]], hasInk: true, aspectRatio: 1 },
    prediction: {
      candidates: [
        { label: "Kucing", confidence: 0.6, modelLabel: "cat", gameLabel: null },
        { label: "Anjing", confidence: 0.3, modelLabel: "dog", gameLabel: null },
        { label: "Burung", confidence: 0.1, modelLabel: "bird", gameLabel: null },
      ],
      provenance: source ? { mode: source === "model" ? "partner" : "mock", source, latencyMs: 1 } : undefined,
    },
    decision: { type: "accept", finalLabel: "Kucing", sourceRank: 1 },
    sourceRank: 1,
    redrawCount: 0,
  };
}

function setup() {
  const storage = new MemoryOutboxStorage();
  const client = {
    createSubmission: async () => ({ id: 1, status: "created" }),
    recordOutcome: async () => ({ id: 1, status: "updated" }),
  } as unknown as SubmissionClient;
  const outbox = new OutboxQueue({ client, storage });
  const adapter = new SubmissionAdapter({
    outbox,
    classContext: () => ({ joinToken: "tok-1", studentId: 9 }),
    idGenerator: () => "sub-key-1",
  });
  return { storage, adapter };
}

describe("submissions carry only real model decisions", () => {
  it("a demo (mock) decision is never sent to /api/submissions", async () => {
    const { storage, adapter } = setup();
    const key = await adapter.handleDecisionApplied(snapshot("demo"));
    expect(key).toBe("");
    expect(await storage.getAll()).toHaveLength(0);
  });

  it("a prediction without provenance is not sent either", async () => {
    const { storage, adapter } = setup();
    expect(await adapter.handleDecisionApplied(snapshot(undefined))).toBe("");
    expect(await storage.getAll()).toHaveLength(0);
  });

  it("a model decision is sent, with the Indonesian labels the student saw and no extra fields", async () => {
    const { storage, adapter } = setup();
    const key = await adapter.handleDecisionApplied(snapshot("model"));
    expect(key).toBe("sub-key-1");
    const job = (await storage.getAll()).find((j) => j.type === "submission") as unknown as { payload: Record<string, unknown> };
    expect(job.payload.candidates).toEqual([
      { label: "Kucing", confidence: 0.6 },
      { label: "Anjing", confidence: 0.3 },
      { label: "Burung", confidence: 0.1 },
    ]);
  });

  it("the gameplay outcome of a demo attempt is not sent either", async () => {
    const { storage, adapter } = setup();
    await adapter.handleDecisionApplied(snapshot("demo"));
    const result: FlowGameplayResultSnapshot = { attemptId: "att-1", levelId: "stage-1-foundation", outcome: "success", behavior: "solid" };
    await adapter.handleGameplayResult(result);
    expect(await storage.getAll()).toHaveLength(0);
  });
});
