import { afterEach, describe, expect, it, vi } from "vitest";
import { isQuizEnabled } from "@/src/config/quiz-flag";

// The quiz toggle comes from the server when it exists; until then the env flag, and default OFF.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isQuizEnabled", () => {
  it("defaults to OFF when neither the server nor the env says anything", () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "");
    expect(isQuizEnabled()).toBe(false);
    expect(isQuizEnabled(null)).toBe(false);
  });

  it("reads the env flag when the server gives no value", () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "1");
    expect(isQuizEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "true");
    expect(isQuizEnabled(undefined)).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "0");
    expect(isQuizEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "false");
    expect(isQuizEnabled()).toBe(false);
  });

  it("treats any other env text as not set (OFF)", () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "yes");
    expect(isQuizEnabled()).toBe(false);
  });

  it("a server value wins over the env flag, in both directions", () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "1");
    expect(isQuizEnabled(false)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "0");
    expect(isQuizEnabled(true)).toBe(true);
  });
});
