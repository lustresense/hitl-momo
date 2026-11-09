import { describe, expect, it } from "vitest";
import { SubmissionClient, type CreateSubmissionRequest, type RecordOutcomeRequest } from "@/src/api/submission-client";

describe("SubmissionClient", () => {
  it("createSubmission sends POST /api/submissions with full payload", async () => {
    let capturedBody: unknown = null;
    let authHeader = "";

    const fetchImpl: typeof fetch = async (url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      authHeader = (init?.headers as Record<string, string>)?.["authorization"] || "";
      return new Response(JSON.stringify({ id: 101, status: "stored" }), { status: 201 });
    };

    const client = new SubmissionClient({
      baseUrl: "https://api.example.com",
      fetchImpl,
      tokenProvider: () => "student_tok_abc",
    });

    const payload: CreateSubmissionRequest = {
      submission_key: "sub_uuid_123",
      attempt_id: "att_456",
      prediction_id: "pred_789",
      level_id: "level-1",
      strokes: [[{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]],
      decision_type: "accept",
      source_rank: 1,
      final_label: "balok",
      redraw_count: 0,
    };

    const res = await client.createSubmission(payload);
    expect(res.id).toBe(101);
    expect(res.status).toBe("stored");
    expect(authHeader).toBe("Bearer student_tok_abc");
    expect((capturedBody as CreateSubmissionRequest).submission_key).toBe("sub_uuid_123");
    expect((capturedBody as CreateSubmissionRequest).final_label).toBe("balok");
  });

  it("recordOutcome sends PATCH /api/submissions/{id}/outcome", async () => {
    let capturedUrl = "";
    let capturedBody: unknown = null;

    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 101, status: "stored" }), { status: 200 });
    };

    const client = new SubmissionClient({ baseUrl: "https://api.example.com", fetchImpl });
    const payload: RecordOutcomeRequest = {
      outcome: "success",
      behavior: "solid",
      retry_count: 1,
    };

    const res = await client.recordOutcome(101, payload);
    expect(capturedUrl).toBe("https://api.example.com/api/submissions/101/outcome");
    expect((capturedBody as RecordOutcomeRequest).outcome).toBe("success");
    expect(res.status).toBe("stored");
  });
});
