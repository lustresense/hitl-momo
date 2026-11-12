import { describe, expect, it, vi } from "vitest";
import { HttpClient, ApiError } from "@/src/api/http-client";

describe("HttpClient", () => {
  it("resolves relative path with baseUrl", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const client = new HttpClient({
      baseUrl: "https://api.example.com/base",
      fetchImpl,
    });

    const res = await client.get<{ ok: boolean }>("/test-path");
    expect(requestedUrl).toBe("https://api.example.com/base/test-path");
    expect(res.ok).toBe(true);
  });

  it("handles absolute url directly", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ direct: true }), { status: 200 });
    };

    const client = new HttpClient({ baseUrl: "https://api.example.com", fetchImpl });
    const res = await client.get<{ direct: boolean }>("https://other.com/api");
    expect(requestedUrl).toBe("https://other.com/api");
    expect(res.direct).toBe(true);
  });

  it("attaches Authorization header from tokenProvider on the class backend /api/ paths", async () => {
    let authHeader = "";
    const fetchImpl: typeof fetch = async (_, init) => {
      authHeader = (init?.headers as Record<string, string>)?.["authorization"] || "";
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const client = new HttpClient({
      baseUrl: "https://api.example.com",
      fetchImpl,
      tokenProvider: () => "secret-token-123",
    });

    await client.get("/api/authed");
    expect(authHeader).toBe("Bearer secret-token-123");
  });

  it("never attaches the token to a non-/api path or to an absolute URL (other origin)", async () => {
    const seen: Array<string | null> = [];
    const fetchImpl: typeof fetch = async (_, init) => {
      seen.push((init?.headers as Record<string, string>)?.["authorization"] ?? null);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const client = new HttpClient({
      baseUrl: "https://api.example.com",
      fetchImpl,
      tokenProvider: () => "secret-token-123",
    });

    await client.get("/predict");
    await client.get("https://partner.example/api/predict");
    expect(seen).toEqual([null, null]);
  });

  it("throws ApiError with standard envelope error details on 400/404/500", async () => {
    const fetchImpl: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "PREDICTION_NOT_FOUND",
            message: "Prediksi tidak ditemukan atau expired",
            requestId: "req-999",
          },
        }),
        { status: 404 }
      );
    };

    const client = new HttpClient({ fetchImpl });

    await expect(client.get("/missing")).rejects.toThrowError("Prediksi tidak ditemukan atau expired");
    try {
      await client.get("/missing");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe("not-found");
      expect(apiErr.status).toBe(404);
      expect(apiErr.requestId).toBe("req-999");
    }
  });

  it("handles malformed JSON response gracefully", async () => {
    const fetchImpl: typeof fetch = async () => {
      return new Response("<html>Gateway Timeout</html>", { status: 200 });
    };

    const client = new HttpClient({ fetchImpl });
    await expect(client.get("/bad-json")).rejects.toThrowError("Respons server bukan format JSON yang valid.");
  });

  it("handles fetch abort / timeout", async () => {
    const fetchImpl: typeof fetch = async (_, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };

    const client = new HttpClient({ fetchImpl, timeoutMs: 50 });
    await expect(client.get("/hang")).rejects.toThrowError("Permintaan HTTP melebihi batas waktu");
  });
});
