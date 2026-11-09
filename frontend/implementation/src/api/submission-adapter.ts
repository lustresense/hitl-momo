import type { OutboxQueue } from "./outbox";
import type { FlowDecisionSnapshot, FlowGameplayResultSnapshot } from "../app/state-machine";

/** Class identity of the current classroom session. Null when the student has not joined a class. */
export interface ClassContext {
  joinToken: string;
  studentId: number;
}

/**
 * Build the class context. The page URL wins; after a reload the URL may have no query,
 * so fall back to the join token stored with the student session.
 */
export function classContextFrom(
  urlJoinToken: string | null | undefined,
  session: { student_id: number; join_token?: string } | null | undefined
): ClassContext | null {
  if (!session) return null;
  const joinToken = urlJoinToken || session.join_token;
  if (!joinToken) return null;
  return { joinToken, studentId: session.student_id };
}

export interface SubmissionAdapterOptions {
  outbox: OutboxQueue;
  idGenerator?: () => string;
  /**
   * Returns the class context. Without one (solo play, not joined), decisions are not
   * submitted: the server only accepts submissions from a joined student.
   */
  classContext?: () => ClassContext | null;
}

export class SubmissionAdapter {
  private readonly outbox: OutboxQueue;
  private readonly idGenerator: () => string;
  private readonly classContext?: () => ClassContext | null;
  private readonly attemptToSubmissionKey = new Map<string, string>();

  constructor(options: SubmissionAdapterOptions) {
    this.outbox = options.outbox;
    this.classContext = options.classContext;
    this.idGenerator =
      options.idGenerator ??
      (() =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  }

  async handleDecisionApplied(snapshot: FlowDecisionSnapshot): Promise<string> {
    const ctx = this.classContext ? this.classContext() : null;
    if (!ctx) return "";

    const c = snapshot.prediction?.candidates;
    if (!c || c.length < 3) return "";

    const submissionKey = this.idGenerator();
    this.attemptToSubmissionKey.set(snapshot.attemptId, submissionKey);

    await this.outbox.enqueueSubmission({
      submission_key: submissionKey,
      join_token: ctx.joinToken,
      student_id: ctx.studentId,
      attempt_id: snapshot.attemptId,
      prediction_id: snapshot.prediction.predictionId,
      level_id: snapshot.levelId,
      strokes: snapshot.drawingInput.strokes,
      candidates: [
        { label: snapshot.prediction.candidates[0].label, confidence: snapshot.prediction.candidates[0].confidence },
        { label: snapshot.prediction.candidates[1].label, confidence: snapshot.prediction.candidates[1].confidence },
        { label: snapshot.prediction.candidates[2].label, confidence: snapshot.prediction.candidates[2].confidence },
      ],
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
