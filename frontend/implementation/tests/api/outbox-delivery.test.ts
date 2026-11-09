import { describe, expect, it } from "vitest";
import { MemoryOutboxStorage, OutboxQueue } from "@/src/api/outbox";
import { ApiError } from "@/src/api/http-client";
import type { CreateSubmissionRequest } from "@/src/api/submission-client";

const payload: CreateSubmissionRequest = {
  submission_key: "key-delivery-1",
  join_token: "tok-test-1",
  student_id: 9,
  level_id: "level-1",
  strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
  candidates: [
    { label: "a", confidence: 0.5 },
    { label: "b", confidence: 0.3 },
    { label: "c", confidence: 0.2 },
  ],
  decision_type: "accept",
  final_label: "a",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("OutboxQueue delivery (no online event needed)", () => {
  it("sends a submission right after it is enqueued", async () => {
    const calls: string[] = [];
    const client = {
      createSubmission: async (p: CreateSubmissionRequest) => {
        calls.push(p.submission_key);
        return { id: 77, status: "created" as const };
      },
      recordOutcome: async () => ({ id: 77, status: "updated" as const }),
    };
    const storage = new MemoryOutboxStorage();
    const outbox = new OutboxQueue({ client: client as never, storage });
    await outbox.enqueueSubmission(payload);
    await wait(30);
    expect(calls).toEqual(["key-delivery-1"]);
    const job = (await storage.getAll())[0] as { status: string; serverSubmissionId?: number };
    expect(job.status).toBe("acknowledged");
    expect(job.serverSubmissionId).toBe(77);
  });

  it("retries a network failure with the same submission_key after backoff", async () => {
    const keys: string[] = [];
    let attempt = 0;
    const client = {
      createSubmission: async (p: CreateSubmissionRequest) => {
        keys.push(p.submission_key);
        attempt++;
        if (attempt === 1) throw new ApiError({ message: "network down", code: "network" });
        return { id: 78, status: "duplicate" as const };
      },
      recordOutcome: async () => ({ id: 78, status: "updated" as const }),
    };
    const storage = new MemoryOutboxStorage();
    const outbox = new OutboxQueue({ client: client as never, storage, baseBackoffMs: 5, maxBackoffMs: 20 });
    await outbox.enqueueSubmission(payload);
    await wait(200);
    expect(keys).toEqual(["key-delivery-1", "key-delivery-1"]);
    const job = (await storage.getAll())[0] as { status: string };
    expect(job.status).toBe("acknowledged");
  });
});
