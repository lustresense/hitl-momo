import type { DecisionType, ObjectBehavior, StrokePoint } from "../domain/types";
import { HttpClient, type HttpClientOptions, type RequestOptions } from "./http-client";

export interface CreateSubmissionRequest {
  submission_key: string;
  attempt_id?: string;
  prediction_id?: string;
  level_id: string;
  strokes: StrokePoint[][];
  decision_type: DecisionType;
  source_rank?: 1 | 2 | 3 | null;
  final_label: string;
  redraw_count?: number;
}

export interface CreateSubmissionResponse {
  id: number;
  status: string;
}

export interface RecordOutcomeRequest {
  outcome: "success" | "fail";
  behavior: ObjectBehavior;
  retry_count?: number;
}

export interface RecordOutcomeResponse {
  id: number;
  status: string;
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
