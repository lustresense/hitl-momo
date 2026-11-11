import { afterEach, describe, expect, it, vi } from "vitest";
import { createPredictionProvider, sessionTokenAllowedFor } from "@/src/config/env";
import { getLevel } from "@/src/domain/levels";
import type { DrawingInput } from "@/src/domain/types";

const LEVEL = getLevel("stage-1-foundation")!;
const INPUT: DrawingInput = { strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], hasInk: true, aspectRatio: 1 };
const SECRET = "student-secret-token-123";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("student session token scope", () => {
  it("is sent only to /api/ paths on the class backend origin", () => {
    expect(sessionTokenAllowedFor("https://api.example.com/api/predict", "https://api.example.com")).toBe(true);
    expect(sessionTokenAllowedFor("https://api.example.com/predict", "https://api.example.com")).toBe(false);
    expect(sessionTokenAllowedFor("https://partner.example/api/predict", "https://api.example.com")).toBe(false);
    expect(sessionTokenAllowedFor("https://partner.example/predict", "")).toBe(false);
  });

  it("the partner prediction request built from env never carries the student token", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREDICTION_MODE", "partner");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.stubEnv("NEXT_PUBLIC_PREDICTION_ENDPOINT", "");
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      calls.push(init);
      return new Response(
        JSON.stringify({ candidates: [{ label: "cat", confidence: 0.5 }, { label: "dog", confidence: 0.3 }, { label: "bird", confidence: 0.2 }] }),
        { status: 200 },
      );
    });
    const p = createPredictionProvider(LEVEL, () => SECRET);
    await p.predict(INPUT);
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(JSON.stringify(calls)).not.toContain(SECRET);
  });
});
