import { describe, expect, it } from "vitest";
import { SubmissionAdapter } from "@/src/api/submission-adapter";
import { MemoryOutboxStorage, OutboxQueue } from "@/src/api/outbox";
import { SubmissionClient } from "@/src/api/submission-client";
import type { FlowDecisionSnapshot, FlowGameplayResultSnapshot } from "@/src/app/state-machine";

describe("SubmissionAdapter (CAN-05 & CAN-06 Orchestration)", () => {
  const dummySnapshot: FlowDecisionSnapshot = {
    attemptId: "att-100",
    levelId: "level-1",
    drawingInput: {
      strokes: [[{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]],
      hasInk: true,
      aspectRatio: 1.0,
    },
    prediction: {
      candidates: [
        { label: "balok", confidence: 0.7 },
        { label: "batu", confidence: 0.2 },
        { label: "papan", confidence: 0.1 },
      ],
      predictionId: "pred-rec-123",
      modelVersion: "cnn-v1",
    },
    decision: {
      type: "accept",
      finalLabel: "balok",
      sourceRank: 1,
    },
    sourceRank: 1,
    redrawCount: 2,
  };

  it("enqueues submission with stable submission_key and pairs with gameplay result", async () => {
    const storage = new MemoryOutboxStorage();
    const mockClient = {
      createSubmission: async () => ({ id: 501, status: "stored" }),
      recordOutcome: async () => ({ id: 501, status: "stored" }),
    } as unknown as SubmissionClient;

    const outbox = new OutboxQueue({ client: mockClient, storage });
    const adapter = new SubmissionAdapter({
      outbox,
      idGenerator: () => "sub-key-custom-1",
    });

    const key = await adapter.handleDecisionApplied(dummySnapshot);
    expect(key).toBe("sub-key-custom-1");
    expect(adapter.getSubmissionKey("att-100")).toBe("sub-key-custom-1");

    const gameplayResult: FlowGameplayResultSnapshot = {
      attemptId: "att-100",
      levelId: "level-1",
      outcome: "success",
      behavior: "solid",
    };
    await adapter.handleGameplayResult(gameplayResult);

    const jobs = await storage.getAll();
    expect(jobs).toHaveLength(2);

    const subJob = jobs.find((j) => j.type === "submission");
    const outJob = jobs.find((j) => j.type === "outcome");

    expect(subJob).toBeDefined();
    expect((subJob as any).payload.submission_key).toBe("sub-key-custom-1");
    expect((subJob as any).payload.prediction_id).toBe("pred-rec-123");
    expect((subJob as any).payload.redraw_count).toBe(2);

    expect(outJob).toBeDefined();
    expect(outJob?.submissionKey).toBe("sub-key-custom-1");
    expect((outJob as any).payload.outcome).toBe("success");
    expect((outJob as any).payload.behavior).toBe("solid");
  });

  it("handles multiple objects per level with isolated keys", async () => {
    const storage = new MemoryOutboxStorage();
    const mockClient = {
      createSubmission: async () => ({ id: 1, status: "stored" }),
      recordOutcome: async () => ({ id: 1, status: "stored" }),
    } as unknown as SubmissionClient;

    const outbox = new OutboxQueue({ client: mockClient, storage });
    let counter = 0;
    const adapter = new SubmissionAdapter({
      outbox,
      idGenerator: () => `key-${++counter}`,
    });

    const snap1 = { ...dummySnapshot, attemptId: "att-1" };
    const snap2 = { ...dummySnapshot, attemptId: "att-2" };

    const k1 = await adapter.handleDecisionApplied(snap1);
    const k2 = await adapter.handleDecisionApplied(snap2);

    expect(k1).toBe("key-1");
    expect(k2).toBe("key-2");
    expect(adapter.getSubmissionKey("att-1")).toBe("key-1");
    expect(adapter.getSubmissionKey("att-2")).toBe("key-2");

    await adapter.handleGameplayResult({
      attemptId: "att-2",
      levelId: "level-1",
      outcome: "fail",
      behavior: "danger",
    });

    const jobs = await storage.getAll();
    const outJob = jobs.find((j) => j.type === "outcome");
    expect(outJob?.submissionKey).toBe("key-2");
    expect((outJob as any).payload.outcome).toBe("fail");
  });
});
