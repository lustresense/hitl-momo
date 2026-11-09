import { describe, expect, it } from "vitest";
import { MemoryOutboxStorage, OutboxQueue } from "@/src/api/outbox";
import { SubmissionClient, type CreateSubmissionRequest, type RecordOutcomeRequest } from "@/src/api/submission-client";
import { ApiError } from "@/src/api/http-client";

describe("OutboxQueue", () => {
  const dummySubmission: CreateSubmissionRequest = {
    submission_key: "key-123",
    level_id: "level-1",
    strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
    decision_type: "accept",
    final_label: "balok",
  };

  const dummyOutcome: RecordOutcomeRequest = {
    outcome: "success",
    behavior: "solid",
    retry_count: 0,
  };

  it("enqueues and processes submission then pairs with outcome", async () => {
    let submissionCalls = 0;
    let outcomeCalls = 0;

    const mockClient = {
      createSubmission: async () => {
        submissionCalls++;
        return { id: 777, status: "stored" };
      },
      recordOutcome: async (_id: number) => {
        outcomeCalls++;
        return { id: 777, status: "stored" };
      },
    } as unknown as SubmissionClient;

    const storage = new MemoryOutboxStorage();
    const queue = new OutboxQueue({
      client: mockClient,
      storage,
      tokenProvider: () => "token-xyz",
    });

    const subId = await queue.enqueueSubmission(dummySubmission);
    expect(subId).toBe("sub_key-123");

    // Enqueue outcome for same submission_key
    await queue.enqueueOutcome("key-123", dummyOutcome);

    await queue.process();

    const stats = await queue.getStats();
    expect(stats.acknowledged).toBe(2);
    expect(stats.pending).toBe(0);
    expect(submissionCalls).toBe(1);
    expect(outcomeCalls).toBe(1);

    const jobs = await storage.getAll();
    const subJob = jobs.find((j) => j.type === "submission");
    const outJob = jobs.find((j) => j.type === "outcome");

    expect(subJob?.status).toBe("acknowledged");
    expect((subJob as any).serverSubmissionId).toBe(777);
    expect(outJob?.status).toBe("acknowledged");
    expect((outJob as any).submissionId).toBe(777);
  });

  it("marks non-retryable 400/409/422 errors as blocked", async () => {
    const mockClient = {
      createSubmission: async () => {
        throw new ApiError({
          code: "conflict",
          status: 409,
          message: "Idempotency conflict",
        });
      },
      recordOutcome: async () => ({ id: 1, status: "stored" }),
    } as unknown as SubmissionClient;

    const storage = new MemoryOutboxStorage();
    const queue = new OutboxQueue({
      client: mockClient,
      storage,
    });

    await queue.enqueueSubmission(dummySubmission);
    await queue.process();

    const stats = await queue.getStats();
    expect(stats.blocked).toBe(1);
    expect(stats.pending).toBe(0);

    const jobs = await storage.getAll();
    expect(jobs[0]!.status).toBe("blocked");
    expect(jobs[0]!.lastError).toContain("Idempotency conflict");
  });

  it("deduplicates identical submission_key", async () => {
    const mockClient = {
      createSubmission: async () => ({ id: 888, status: "stored" }),
      recordOutcome: async () => ({ id: 888, status: "stored" }),
    } as unknown as SubmissionClient;

    const storage = new MemoryOutboxStorage();
    const queue = new OutboxQueue({ client: mockClient, storage });

    const id1 = await queue.enqueueSubmission(dummySubmission);
    const id2 = await queue.enqueueSubmission(dummySubmission);

    expect(id1).toBe(id2);
    const all = await storage.getAll();
    expect(all).toHaveLength(1);
  });
});
