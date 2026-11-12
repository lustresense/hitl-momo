import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerHttpPredictionProvider } from "@/src/prediction/partner-http-provider";
import type { DrawingInput } from "@/src/domain/types";

const INPUT: DrawingInput = { strokes: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], hasInk: true, aspectRatio: 1 };
const EP = "https://partner.example/predict";
const GOOD = {
  candidates: [
    { label: "cat", confidence: 0.6 },
    { label: "dog", confidence: 0.3 },
    { label: "bird", confidence: 0.1 },
  ],
};
const okResponse = () => new Response(JSON.stringify(GOOD), { status: 200 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A fetch that never answers on its own; it only rejects when the adapter aborts it. */
function hangingFetch(): typeof fetch {
  return vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  ) as unknown as typeof fetch;
}

describe("timeout and honest errors", () => {
  it("times out after the limit, with an Indonesian message, and does not retry", async () => {
    const f = hangingFetch();
    const p = new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f, timeoutMs: 8000 });
    const settled = p.predict(INPUT).then(
      () => null,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(8000);
    const err = (await settled) as { reason: string; message: string };
    expect(err.reason).toBe("timeout");
    expect(err.message).toMatch(/terlalu lama/i);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("network failure: Indonesian message, never the raw browser text", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f }).predict(INPUT).catch((e: unknown) => e);
    expect(err).toMatchObject({ reason: "unknown" });
    expect((err as Error).message).toMatch(/tersambung/i);
    expect((err as Error).message).not.toMatch(/fetch failed/);
  });
});

describe("limited retry", () => {
  it("retries once after a 503 and then succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? new Response("busy", { status: 503 }) : okResponse()));
    const r = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch }).predict(INPUT);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.candidates[0]!.modelLabel).toBe("cat");
  });

  it("retries once after a network error and then succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => {
      if (++n === 1) throw new TypeError("network down");
      return okResponse();
    });
    await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch }).predict(INPUT);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry and reports the 503 honestly", async () => {
    const f = vi.fn(async () => new Response("busy", { status: 503 }));
    const err = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch })
      .predict(INPUT)
      .catch((e: unknown) => e);
    expect(f).toHaveBeenCalledTimes(2);
    expect(err).toMatchObject({ reason: "provider-unavailable", httpStatus: 503 });
    expect((err as Error).message).toMatch(/tidak tersedia/i);
  });

  it("does not retry a client error (422): the drawing itself is refused", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 422 }));
    const err = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch })
      .predict(INPUT)
      .catch((e: unknown) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ reason: "provider-unavailable", httpStatus: 422 });
  });

  it("does not retry a malformed body", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 200 }));
    const err = await new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch })
      .predict(INPUT)
      .catch((e: unknown) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ reason: "malformed-response" });
  });
});

describe("in-flight guard", () => {
  it("two back-to-back calls with the same drawing share one request (no double submit)", async () => {
    const f = vi.fn(async () => {
      await Promise.resolve();
      return okResponse();
    });
    const p = new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch });
    const [a, b] = await Promise.all([p.predict(INPUT), p.predict(INPUT)]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it("after the first call settles, asking again sends a new request (retry button)", async () => {
    const f = vi.fn(async () => okResponse());
    const p = new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch });
    await p.predict(INPUT);
    await p.predict(INPUT);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("a different drawing while one is in flight is not merged into it", async () => {
    const other: DrawingInput = { strokes: [[{ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.1 }]], hasInk: true, aspectRatio: 1 };
    const f = vi.fn(async () => {
      await Promise.resolve();
      return okResponse();
    });
    const p = new PartnerHttpPredictionProvider({ endpoint: EP, fetchImpl: f as unknown as typeof fetch });
    await Promise.all([p.predict(INPUT), p.predict(other)]);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
