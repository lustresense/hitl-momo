import type { OutboxQueue } from "./outbox";
import type { FlowDecisionSnapshot, FlowGameplayResultSnapshot } from "../app/state-machine";

export interface SubmissionAdapterOptions {
  outbox: OutboxQueue;
  idGenerator?: () => string;
}

export class SubmissionAdapter {
  private readonly outbox: OutboxQueue;
  private readonly idGenerator: () => string;
  private readonly attemptToSubmissionKey = new Map<string, string>();

  constructor(options: SubmissionAdapterOptions) {
    this.outbox = options.outbox;
    this.idGenerator =
      options.idGenerator ??
      (() =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  }

  async handleDecisionApplied(snapshot: FlowDecisionSnapshot): Promise<string> {
    const submissionKey = this.idGenerator();
    this.attemptToSubmissionKey.set(snapshot.attemptId, submissionKey);

    await this.outbox.enqueueSubmission({
      submission_key: submissionKey,
      attempt_id: snapshot.attemptId,
      prediction_id: snapshot.prediction.predictionId,
      level_id: snapshot.levelId,
      strokes: snapshot.drawingInput.strokes,
      decision_type: snapshot.decision.type,
      source_rank: snapshot.sourceRank,
      final_label: snapshot.decision.finalLabel,
      redraw_count: snapshot.redrawCount,
    });

    return submissionKey;
  }

  async handleGameplayResult(result: FlowGameplayResultSnapshot): Promise<void> {
    const submissionKey = this.attemptToSubmissionKey.get(result.attemptId);
    if (!submissionKey) return;

    await this.outbox.enqueueOutcome(submissionKey, {
      outcome: result.outcome,
      behavior: result.behavior,
    });
  }

  getSubmissionKey(attemptId: string): string | undefined {
    return this.attemptToSubmissionKey.get(attemptId);
  }
}
