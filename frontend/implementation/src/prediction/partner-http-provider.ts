import type { DrawingInput, PredictionCandidate, PredictionResult } from "../domain/types";
import { lookupModelLabel } from "./label-map";
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, MODEL_VERSION_HEADER } from "./model-contract";
import { PredictionError, type PredictionContext, type PredictionProvider } from "./prediction-provider";
import { elapsedMs, makeProvenance, nowMs, sanitizeModelVersion } from "./provenance";
import type { PredictionProvenance } from "./provenance";
import { validatePredictionResponse, type OutOfVocabularyPolicy } from "./validation";

/**
 * Partner integration edge (client adapter ONLY; no backend here).
 *
 * - Enabled only when a partner endpoint is configured (env/config).
 * - Calls the partner endpoint directly from the browser.
 * - Maps the model's class names (config.py, English) to Indonesian Top-3 labels.
 *   The model's own label and confidence are kept: confidence is never changed.
 * - Timeout, at most one retry for transient failures, honest Indonesian errors,
 *   and an in-flight guard so a held thumbs-up cannot send the same drawing twice.
 * - The wire schema is still a DRAFT (see contracts/openapi.json, /predict has no typed response).
 *
 * Nothing here is verified against a real partner endpoint (tests use injected fake fetch).
 */
export interface PartnerHttpPredictionProviderOptions {
  /** Partner endpoint URL. Required non-empty http(s) to construct. */
  endpoint: string;
  /** Abort timeout per attempt, in ms (default 8000). */
  timeoutMs?: number;
  /** Injectable fetch for tests. Defaults to global fetch (browser). */
  fetchImpl?: typeof fetch;
  /**
   * Optional level vocabulary for canonical spelling of labels (trim + case-insensitive).
   * Not used for the model's classes: those are judged by the label map.
   */
  vocabulary?: readonly string[];
  /**
   * "allow" (default): a label the label map does not know is shown as sent, with no gameLabel.
   * "reject": such a label fails with PredictionError "out-of-vocabulary".
   */
  outOfVocabulary?: OutOfVocabularyPolicy;
  /** Extra NON-SECRET static headers (e.g. X-Contract-Version). Sanitized in headers.ts. */
  extraHeaders?: Record<string, string>;
  /**
   * Token provider. When it returns a non-empty string the adapter sends `Authorization: Bearer <token>`.
   * env.ts passes it ONLY for /api/* on the class backend origin (sessionTokenAllowedFor). Never for /predict.
   */
  tokenProvider?: () => string | undefined | Promise<string | undefined>;
  /**
   * PROPOSED / default OFF: add additive optional body fields `levelId`, `attemptId`,
   * `contractVersion` and the `X-Contract-Version` header. The partner has not agreed to them.
   */
  sendContext?: boolean;
  /** Supplies levelId/attemptId when predict() is called without an explicit context. */
  contextProvider?: () => PredictionContext;
  /** Contract version string sent when `sendContext` is on. Default CONTRACT_VERSION. */
  contractVersion?: string;
  /** Called with the provenance of every successful prediction (telemetry tap). Never throws into predict(). */
  onProvenance?: (provenance: PredictionProvenance) => void;
  /**
   * Extra attempts after a transient failure: network error, HTTP 5xx or 429. Default 1.
   * Never retried: timeout (the student already waited), 4xx (the drawing was refused), malformed body.
   */
  maxRetries?: number;
}

function isAbortError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

/** Failures worth one more try. Prediction has no side effects, so a retry is safe. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof PredictionError)) return false;
  if (err.reason === "unknown") return true;
  if (err.reason === "provider-unavailable" && err.httpStatus !== undefined) {
    return err.httpStatus >= 500 || err.httpStatus === 429;
  }
  return false;
}

function httpFailureMessage(status: number): string {
  if (status >= 500 || status === 429) return "Model sedang tidak tersedia. Coba lagi, ya.";
  return "Model tidak bisa membaca gambar ini. Coba gambar ulang, ya.";
}

type Top3 = PredictionResult["candidates"];

export class PartnerHttpPredictionProvider implements PredictionProvider {
  private readonly fetchImpl: typeof fetch;
  /** The request currently in flight, keyed by its body. Lets an identical call share it. */
  private inFlight: { key: string; promise: Promise<PredictionResult> } | null = null;

  constructor(private readonly options: PartnerHttpPredictionProviderOptions) {
    if (!options.endpoint || !/^https?:\/\//i.test(options.endpoint)) {
      throw new PredictionError("unknown", "Endpoint partner tidak valid atau belum dikonfigurasi.");
    }
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...(a as Parameters<typeof fetch>)));
  }

  async predict(input: DrawingInput, context?: PredictionContext): Promise<PredictionResult> {
    const body = this.buildBody(input, context);
    const key = JSON.stringify(body);
    // A second identical call while the first is running (e.g. a held thumbs-up) gets the same answer.
    if (this.inFlight && this.inFlight.key === key) return this.inFlight.promise;

    const startedAt = nowMs();
    const promise: Promise<PredictionResult> = this.predictWithRetry(body, startedAt).finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = null;
    });
    this.inFlight = { key, promise };
    return promise;
  }

  private async predictWithRetry(body: Record<string, unknown>, startedAt: number): Promise<PredictionResult> {
    const maxRetries = Math.max(0, this.options.maxRetries ?? 1);
    for (let retries = 0; ; retries++) {
      try {
        return await this.attempt(body, startedAt);
      } catch (err) {
        if (retries >= maxRetries || !isTransient(err)) throw err;
      }
    }
  }

  private async attempt(body: Record<string, unknown>, startedAt: number): Promise<PredictionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    try {
      const headers = await this.buildHeaders();
      const res = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new PredictionError("provider-unavailable", httpFailureMessage(res.status), res.status);
      }
      let payload: unknown;
      try {
        payload = await res.json();
      } catch (jsonErr) {
        // An abort/timeout while the body streams is a timeout, not a bad body.
        if (isAbortError(jsonErr) || controller.signal.aborted) {
          throw new PredictionError("timeout", "Model terlalu lama menjawab. Coba lagi, ya.");
        }
        throw new PredictionError("malformed-response", "Jawaban model tidak bisa dibaca. Coba lagi, ya.");
      }
      // Structural checks only (3 candidates, confidence in [0,1], sorted, unique). Label judgement follows.
      const validated = validatePredictionResponse(payload, { vocabulary: this.options.vocabulary });
      const candidates = this.toTop3(validated.candidates);

      const headerModelVersion = sanitizeModelVersion(res.headers?.get?.(MODEL_VERSION_HEADER));
      const modelVersion =
        headerModelVersion ??
        sanitizeModelVersion((payload as { modelVersion?: unknown }).modelVersion);
      const provenance = makeProvenance("partner", elapsedMs(startedAt), modelVersion);
      try {
        this.options.onProvenance?.(provenance);
      } catch {
        /* telemetry tap must never break prediction */
      }
      return {
        candidates,
        ...(validated.predictionId ? { predictionId: validated.predictionId } : {}),
        ...(modelVersion ? { modelVersion } : {}),
        ...(validated.contractVersion ? { contractVersion: validated.contractVersion } : {}),
        provenance,
      };
    } catch (err) {
      if (err instanceof PredictionError) throw err;
      if (isAbortError(err) || controller.signal.aborted) {
        throw new PredictionError("timeout", "Model terlalu lama menjawab. Coba lagi, ya.");
      }
      throw new PredictionError("unknown", "Tidak bisa tersambung ke model. Periksa koneksi, lalu coba lagi.");
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Model class -> Top-3 shown to students. Order and confidence are the model's, untouched. */
  private toTop3(raw: PredictionResult["candidates"]): Top3 {
    const unknown: string[] = [];
    const mapped: PredictionCandidate[] = raw.map((c) => {
      const entry = lookupModelLabel(c.label);
      if (!entry) {
        unknown.push(c.label);
        return { label: c.label, confidence: c.confidence, modelLabel: c.label, gameLabel: null };
      }
      return { label: entry.displayName, confidence: c.confidence, modelLabel: c.label, gameLabel: entry.gameLabel };
    });
    if (this.options.outOfVocabulary === "reject" && unknown.length > 0) {
      throw new PredictionError("out-of-vocabulary", `Model mengenali benda di luar daftarnya: ${unknown.join(", ")}.`);
    }
    return mapped as Top3;
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      ...(this.options.extraHeaders ?? {}),
      "content-type": "application/json",
    };
    if (this.options.sendContext) {
      headers[CONTRACT_VERSION_HEADER] = this.options.contractVersion ?? CONTRACT_VERSION;
    }
    if (this.options.tokenProvider) {
      let token: string | undefined;
      try {
        token = await this.options.tokenProvider();
      } catch {
        throw new PredictionError("provider-unavailable", "Gagal mengambil token otentikasi untuk endpoint partner.");
      }
      if (token) headers["authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private buildBody(input: DrawingInput, context?: PredictionContext): Record<string, unknown> {
    if (!this.options.sendContext) return { drawing: input };
    let fromProvider: PredictionContext = {};
    try {
      fromProvider = this.options.contextProvider?.() ?? {};
    } catch {
      /* context is optional; never fail a prediction because of it */
    }
    const ctx = { ...fromProvider, ...(context ?? {}) };
    const body: Record<string, unknown> = { drawing: input };
    if (ctx.levelId) body.levelId = ctx.levelId;
    if (ctx.attemptId) body.attemptId = ctx.attemptId;
    body.contractVersion = this.options.contractVersion ?? CONTRACT_VERSION;
    return body;
  }
}
