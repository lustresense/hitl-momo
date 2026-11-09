import { describe, expect, it } from "vitest";
import {
  MemoryOutboxStorage,
  OutboxQueue,
  type OutcomeOutboxJob,
  type SubmissionOutboxJob,
} from "@/src/api/outbox";
import { ApiError } from "@/src/api/http-client";
import type { CreateSubmissionRequest } from "@/src/api/submission-client";

const payload = (key: string): CreateSubmissionRequest => ({
  submission_key: key,
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
});

const submissionJob = (key: string, status: SubmissionOutboxJob["status"]): SubmissionOutboxJob => ({
  id: `sub_${key}`,
  type: "submission",
  submissionKey: key,
  payload: payload(key),
  status,
  attempts: 1,
  createdAt: 1,
  updatedAt: 1,
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = { createSubmission: async () => ({ id: 5, status: "created" as const }), recordOutcome: async () => ({ id: 5, status: "updated" as const }) };

describe("OutboxQueue recovery after reload or crash", () => {
  it("resume() re-sends a job that was left in 'sending' when the tab closed", async () => {
    const storage = new MemoryOutboxStorage();
    await storage.put(submissionJob("k1", "sending"));
    const sent: string[] = [];
    const client = { ...ok, createSubmission: async (p: CreateSubmissionRequest) => { sent.push(p.submission_key); return { id: 5, status: "created" as const }; } };
    const outbox = new OutboxQueue({ client: client as never, storage });

    await outbox.resume();
    await wait(30);

    expect(sent).toEqual(["k1"]);
    expect((await storage.getAll())[0]!.status).toBe("acknowledged");
  });
});

describe("OutboxQueue expired student session (401)", () => {
  it("keeps the job blocked but recoverable, and requeueUnauthorized() delivers it after a new join", async () => {
    const storage = new MemoryOutboxStorage();
    let allowed = false;
    const client = {
      ...ok,
      createSubmission: async () => {
        if (!allowed) throw new ApiError({ message: "expired", code: "unauthorized", status: 401 });
        return { id: 9, status: "created" as const };
      },
    };
    const outbox = new OutboxQueue({ client: client as never, storage });

    await outbox.enqueueSubmission(payload("k2"));
    await wait(30);
    const blocked = (await storage.getAll())[0]!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.lastErrorCode).toBe("unauthorized");

    allowed = true;
    await outbox.requeueUnauthorized();
    await wait(30);
    expect((await storage.getAll())[0]!.status).toBe("acknowledged");
  });

  it("does not requeue jobs the server rejected for another reason (422)", async () => {
    const storage = new MemoryOutboxStorage();
    const client = {
      ...ok,
      createSubmission: async () => {
        throw new ApiError({ message: "bad", code: "unprocessable", status: 422 });
      },
    };
    const outbox = new OutboxQueue({ client: client as never, storage });
    await outbox.enqueueSubmission(payload("k3"));
    await wait(30);

    await outbox.requeueUnauthorized();
    await wait(30);

    expect((await storage.getAll())[0]!.status).toBe("blocked");
  });
});

describe("OutboxQueue outcome waiting for a blocked submission", () => {
  it("does not spin through the whole loop on every process() call", async () => {
    class CountingStorage extends MemoryOutboxStorage {
      reads = 0;
      override async getAll() {
        this.reads++;
        return super.getAll();
      }
    }
    const storage = new CountingStorage();
    await storage.put(submissionJob("k4", "blocked"));
    const outcome: OutcomeOutboxJob = {
      id: "out_k4",
      type: "outcome",
      submissionKey: "k4",
      payload: { outcome: "success", behavior: "solid" },
      status: "pending",
      attempts: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    await storage.put(outcome);
    const outbox = new OutboxQueue({ client: ok as never, storage });

    await outbox.process();

    expect(storage.reads).toBeLessThanOrEqual(3);
  });
});
