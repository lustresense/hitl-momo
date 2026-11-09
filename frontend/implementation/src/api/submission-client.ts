import type { DecisionType, ObjectBehavior, StrokePoint } from "../domain/types";
import { HttpClient, type HttpClientOptions, type RequestOptions } from "./http-client";

export interface SubmissionCandidate {
  label: string;
  confidence: number;
}

/**
 * Body of POST /api/submissions. Mirrors SubmissionBody in backend/app/classroom.py.
 * Shared fixture: contracts/fixtures/submission-request.json (checked by both test suites).
 */
export interface CreateSubmissionRequest {
  /** Client-generated and stable across retries; the server deduplicates on it. */
  submission_key: string;
  join_token: string;
  student_id: number;
  attempt_id?: string;
  prediction_id?: string;
  level_id: string;
  strokes: StrokePoint[][];
  candidates: [SubmissionCandidate, SubmissionCandidate, SubmissionCandidate];
  decision_type: DecisionType;
  source_rank?: 1 | 2 | 3 | null;
  final_label: string;
  redraw_count?: number;
}

export interface CreateSubmissionResponse {
  id: number;
  /** "created" on first delivery, "duplicate" when the same submission_key was already stored. */
  status: "created" | "duplicate";
}

/** Body of PATCH /api/submissions/{id}/outcome. Fixture: contracts/fixtures/outcome-request.json. */
export interface RecordOutcomeRequest {
  outcome: "success" | "fail";
  behavior: ObjectBehavior;
  retry_count?: number;
}

export interface RecordOutcomeResponse {
  id: number;
  status: "updated";
}

export class SubmissionClient {
  private readonly http: HttpClient;

  constructor(options: HttpClientOptions = {}) {
    this.http = new HttpClient(options);
  }

  async createSubmission(
    payload: CreateSubmissionRequest,
    options?: RequestOptions
  ): Promise<CreateSubmissionResponse> {
    return this.http.post<CreateSubmissionResponse>("/api/submissions", payload, options);
  }

  async recordOutcome(
    submissionId: number,
    payload: RecordOutcomeRequest,
    options?: RequestOptions
  ): Promise<RecordOutcomeResponse> {
    return this.http.patch<RecordOutcomeResponse>(
      `/api/submissions/${encodeURIComponent(submissionId)}/outcome`,
      payload,
      options
    );
  }
}
