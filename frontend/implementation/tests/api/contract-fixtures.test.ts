/**
 * Client side of the classroom contract. The same JSON files are validated by the backend
 * (tests/integration/test_classroom_contract.py). If either side drifts, one of the two suites fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SubmissionAdapter } from "@/src/api/submission-adapter";
import { MemoryOutboxStorage, OutboxQueue } from "@/src/api/outbox";
import type { CreateSubmissionRequest, RecordOutcomeRequest } from "@/src/api/submission-client";
import type { FlowDecisionSnapshot, FlowGameplayResultSnapshot } from "@/src/app/state-machine";

const FIXTURES = new URL("../../../../contracts/fixtures/", import.meta.url);
const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")) as T;

const neverSends = {
  createSubmission: async () => {
    throw new Error("network disabled in contract test");
  },
  recordOutcome: async () => {
    throw new Error("network disabled in contract test");
  },
} as const;

describe("classroom contract fixtures (client)", () => {
  it("submission payload equals contracts/fixtures/submission-request.json", async () => {
    const fixture = load<CreateSubmissionRequest>("submission-request.json");
    const storage = new MemoryOutboxStorage();
    const outbox = new OutboxQueue({ client: neverSends as never, storage });
    const adapter = new SubmissionAdapter({
      outbox,
      idGenerator: () => fixture.submission_key,
      classContext: () => ({ joinToken: fixture.join_token, studentId: fixture.student_id }),
    });

    const snapshot: FlowDecisionSnapshot = {
      attemptId: "attempt-0001",
      levelId: fixture.level_id,
      drawingInput: { strokes: fixture.strokes as never, hasInk: true, aspectRatio: 1 },
      prediction: {
        candidates: fixture.candidates as never,
        predictionId: fixture.prediction_id ?? "",
        modelVersion: "fixture",
      },
      decision: { type: fixture.decision_type, finalLabel: fixture.final_label, sourceRank: fixture.source_rank ?? null } as never,
      sourceRank: (fixture.source_rank ?? null) as never,
      redrawCount: fixture.redraw_count ?? 0,
    };
    await adapter.handleDecisionApplied(snapshot);

    const jobs = await storage.getAll();
    const sub = jobs.find((j) => j.type === "submission");
    expect(sub).toBeDefined();
    expect((sub as { payload: unknown }).payload).toEqual(fixture);
  });

  it("outcome payload equals contracts/fixtures/outcome-request.json", async () => {
    const fixture = load<RecordOutcomeRequest>("outcome-request.json");
    const storage = new MemoryOutboxStorage();
    const outbox = new OutboxQueue({ client: neverSends as never, storage });
    const adapter = new SubmissionAdapter({
      outbox,
      idGenerator: () => "sub-0001-fixture-key",
      classContext: () => ({ joinToken: "tok-fixture-123", studentId: 1 }),
    });
    const result: FlowGameplayResultSnapshot = {
      attemptId: "attempt-0001",
      levelId: "level-1",
      outcome: fixture.outcome,
      behavior: fixture.behavior,
    };
    await adapter.handleDecisionApplied({
      attemptId: "attempt-0001",
      levelId: "level-1",
      drawingInput: { strokes: [], hasInk: true, aspectRatio: 1 },
      prediction: { candidates: [{ label: "a", confidence: 0.5 }, { label: "b", confidence: 0.3 }, { label: "c", confidence: 0.2 }] as never, predictionId: "p", modelVersion: "f" },
      decision: { type: "accept", finalLabel: "a", sourceRank: 1 } as never,
      sourceRank: 1,
      redrawCount: 0,
    });
    await adapter.handleGameplayResult(result);
    const jobs = await storage.getAll();
    const out = jobs.find((j) => j.type === "outcome") as { payload: unknown } | undefined;
    expect(out?.payload).toEqual(fixture);
  });

  it("does not enqueue a submission outside a class (solo play)", async () => {
    const storage = new MemoryOutboxStorage();
    const outbox = new OutboxQueue({ client: neverSends as never, storage });
    const adapter = new SubmissionAdapter({ outbox, classContext: () => null });
    const key = await adapter.handleDecisionApplied({
      attemptId: "attempt-solo",
      levelId: "level-1",
      drawingInput: { strokes: [], hasInk: true, aspectRatio: 1 },
      prediction: { candidates: [{ label: "a", confidence: 0.5 }, { label: "b", confidence: 0.3 }, { label: "c", confidence: 0.2 }] as never, predictionId: "p", modelVersion: "f" },
      decision: { type: "accept", finalLabel: "a", sourceRank: 1 } as never,
      sourceRank: 1,
      redrawCount: 0,
    });
    expect(key).toBe("");
    expect(await storage.getAll()).toHaveLength(0);
  });
});
