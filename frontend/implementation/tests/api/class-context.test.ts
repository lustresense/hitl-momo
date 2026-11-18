import { describe, expect, it } from "vitest";
import { SubmissionAdapter, classContextFrom } from "@/src/api/submission-adapter";
import { MemoryOutboxStorage, OutboxQueue } from "@/src/api/outbox";
import type { FlowDecisionSnapshot } from "@/src/app/state-machine";

describe("classContextFrom", () => {
  it("uses the join token from the page URL when there is one", () => {
    expect(classContextFrom("tok-url", { student_id: 4, join_token: "tok-stored" })).toEqual({
      joinToken: "tok-url",
      studentId: 4,
    });
  });

  it("falls back to the token stored with the session after a reload (URL has no query)", () => {
    expect(classContextFrom(null, { student_id: 4, join_token: "tok-stored" })).toEqual({
      joinToken: "tok-stored",
      studentId: 4,
    });
  });

  it("returns null when the student has not joined a class", () => {
    expect(classContextFrom(null, null)).toBeNull();
    expect(classContextFrom("tok-url", null)).toBeNull();
    expect(classContextFrom(null, { student_id: 4 })).toBeNull();
  });
});

describe("SubmissionAdapter with a malformed snapshot", () => {
  it("resolves to an empty key instead of rejecting, so gameplay never sees an unhandled rejection", async () => {
    const outbox = new OutboxQueue({ client: {} as never, storage: new MemoryOutboxStorage() });
    const adapter = new SubmissionAdapter({ outbox, classContext: () => ({ joinToken: "t", studentId: 1 }) });
    const bad = {
      attemptId: "a",
      levelId: "level-1",
      drawingInput: { strokes: [], hasInk: true, aspectRatio: 1 },
      prediction: { candidates: [{ label: "x", confidence: 0.9 }], predictionId: "p", modelVersion: "m" },
      decision: { type: "accept", finalLabel: "x", sourceRank: 1 },
      sourceRank: 1,
      redrawCount: 0,
    } as unknown as FlowDecisionSnapshot;

    await expect(adapter.handleDecisionApplied(bad)).resolves.toBe("");
  });
});
