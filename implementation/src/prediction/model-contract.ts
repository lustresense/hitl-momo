import type { DrawingInput, PredictionResult, PredictionCandidate } from "../domain/types";
import { PredictionError } from "./prediction-provider";
import { validatePredictionResponse } from "./validation";

/**
 * ============================================================================
 * MODEL INTEGRATION CONTRACT — Types, Schemas, and Verification Helpers
 * ============================================================================
 * Single source of truth for the partner classifier wire contract.
 * Author-side validation, mock fixtures, and tests all derive from here.
 */

/** Wire request payload sent to partner endpoint (exact JSON shape). */
export interface PartnerRequestPayload {
  drawing: DrawingInput;
}

/** Wire response payload expected from partner endpoint (exact JSON shape). */
export interface PartnerResponsePayload {
  candidates: [
    { label: string; confidence: number },
    { label: string; confidence: number },
    { label: string; confidence: number }
  ];
}

/** Canonical confidence bounds (inclusive). */
export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 1;

/** Exact candidate count required by contract. */
export const REQUIRED_CANDIDATE_COUNT = 3;

/**
 * Validates a partner response payload at runtime.
 * Throws PredictionError with reason "malformed-response" on any violation.
 * This is the SAME validator used by PartnerHttpPredictionProvider.
 */
export function validatePartnerResponse(payload: unknown): PartnerResponsePayload {
  return validatePredictionResponse(payload) as PartnerResponsePayload;
}

/**
 * Validates a partner request payload (author-side construction).
 * Ensures DrawingInput conforms to normalization contract before sending.
 */
export function validatePartnerRequest(payload: unknown): PartnerRequestPayload {
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("drawing" in payload)
  ) {
    throw new PredictionError("malformed-response", "Request payload missing drawing field.");
  }
  const drawing = (payload as { drawing: unknown }).drawing;
  if (
    drawing === null ||
    typeof drawing !== "object" ||
    !("strokes" in drawing) ||
    !("hasInk" in drawing) ||
    !("aspectRatio" in drawing)
  ) {
    throw new PredictionError("malformed-response", "DrawingInput missing required fields.");
  }
  const { strokes, hasInk, aspectRatio } = drawing as {
    strokes: unknown;
    hasInk: unknown;
    aspectRatio: unknown;
  };
  if (!Array.isArray(strokes)) {
    throw new PredictionError("malformed-response", "strokes must be an array.");
  }
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) {
      throw new PredictionError("malformed-response", "Each stroke must be an array of points.");
    }
    for (const pt of stroke) {
      if (
        pt === null ||
        typeof pt !== "object" ||
        typeof (pt as { x: unknown; y: unknown }).x !== "number" ||
        typeof (pt as { x: unknown; y: unknown }).y !== "number"
      ) {
        throw new PredictionError("malformed-response", "Stroke points must be { x: number, y: number }.");
      }
    }
  }
  if (typeof hasInk !== "boolean") {
    throw new PredictionError("malformed-response", "hasInk must be boolean.");
  }
  if (typeof aspectRatio !== "number" || Number.isNaN(aspectRatio) || aspectRatio <= 0) {
    throw new PredictionError("malformed-response", "aspectRatio must be a positive number.");
  }
  return payload as PartnerRequestPayload;
}

/**
 * Creates a valid example request for documentation / partner testing.
 */
export function createExampleRequest(): PartnerRequestPayload {
  return {
    drawing: {
      strokes: [
        [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.6 }],
        [{ x: 0.7, y: 0.8 }, { x: 0.9, y: 0.9 }],
      ],
      hasInk: true,
      aspectRatio: 1.333,
    },
  };
}

/**
 * Creates a valid example response for documentation / partner testing.
 */
export function createExampleResponse(labels: string[] = ["papan", "batu", "tali"]): PartnerResponsePayload {
  return {
    candidates: [
      { label: labels[0]!, confidence: 0.6 },
      { label: labels[1]!, confidence: 0.3 },
      { label: labels[2]!, confidence: 0.1 },
    ],
  };
}

/**
 * Contract verification helper for partner integration testing.
 * Returns { ok: true } if payload passes all contract rules, else { ok: false, errors: string[] }.
 * Does NOT throw — collects all violations for reporting.
 */
export function verifyPartnerContract(payload: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    validatePartnerResponse(payload);
  } catch (err) {
    if (err instanceof PredictionError) {
      errors.push(err.message);
    } else {
      errors.push(String(err));
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * MOCK vs REAL provider type guard — for runtime logging / debugging.
 */
export function isMockProvider(provider: unknown): provider is { getMode(): string } {
  return typeof provider === "object" && provider !== null && "getMode" in provider;
}

/**
 * Contract version marker (increment on breaking wire changes).
 * Partner should echo this in response header or body when agreed.
 */
export const CONTRACT_VERSION = "1.0.0-draft";
