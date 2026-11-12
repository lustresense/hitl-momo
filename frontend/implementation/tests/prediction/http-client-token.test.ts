import { describe, expect, it } from "vitest";
import { HttpClient } from "@/src/api/http-client";

const SECRET = "student-secret-token-123";

function recorder() {
  const seen: Record<string, string>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    seen.push(init!.headers as Record<string, string>);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

describe("http client attaches the session token only to class API paths", () => {
  it("relative /api/ path gets the Bearer token", async () => {
    const { seen, fetchImpl } = recorder();
    const client = new HttpClient({ baseUrl: "https://api.example.com", fetchImpl, tokenProvider: () => SECRET });
    await client.get("/api/join/abc");
    expect(seen[0]!.authorization).toBe(`Bearer ${SECRET}`);
  });

  it("absolute URL to another origin gets no token", async () => {
    const { seen, fetchImpl } = recorder();
    const client = new HttpClient({ baseUrl: "https://api.example.com", fetchImpl, tokenProvider: () => SECRET });
    await client.get("https://evil.example/api/steal");
    expect(seen[0]!.authorization).toBeUndefined();
  });

  it("relative path outside /api/ gets no token", async () => {
    const { seen, fetchImpl } = recorder();
    const client = new HttpClient({ baseUrl: "https://api.example.com", fetchImpl, tokenProvider: () => SECRET });
    await client.get("/predict");
    expect(seen[0]!.authorization).toBeUndefined();
  });
});
