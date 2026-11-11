// @vitest-environment jsdom
/**
 * NUI-2 cover budget: the thumb ring must be visible and holdable at most 8 s after the wave, and all four of Momo's
 * lines must have been shown by then. Runs the REAL MomoGuide and MomoChat (no Momo stub) on fake timers, so the
 * numbers are the ones the student sees. Only GSAP, the model warm-up and the thumb button are replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { COVER_WAKE } from "@/src/domain/guide-script";
import { resetInputModeForTest } from "@/src/input/input-mode";

vi.mock("gsap", () => {
  const tl = { fromTo: vi.fn().mockReturnThis(), call: vi.fn().mockReturnThis(), kill: vi.fn() };
  const g = { fromTo: vi.fn(() => ({ kill: vi.fn() })), killTweensOf: vi.fn(), to: vi.fn(), set: vi.fn(), timeline: vi.fn(() => tl) };
  return { default: g, ...g };
});
vi.mock("@/src/camera/landmarker-warmup", () => ({
  warmHandLandmarker: vi.fn(async () => undefined),
  subscribeHandLandmarkerStatus: vi.fn(() => () => undefined),
  takeHandLandmarker: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock("@/src/components/momo/MomoAvatar", () => ({ MomoAvatar: () => null }));
// The real ring needs the hand tracker; the budget is about when it becomes holdable, so a plain button stands in.
vi.mock("@/src/components/ui/ThumbConfirm", () => ({
  ThumbConfirm: (p: { label?: string; onConfirm: () => void }) => (
    <button type="button" data-testid="cover-thumb" onClick={p.onConfirm}>{p.label}</button>
  ),
}));

/** The budget from the Owner's feedback (NUI-2): ring holdable within 8 s of the wave. */
const BUDGET_MS = 8000;
const STEP_MS = 10;
/** Every Momo line as the student reads it (bold markers are not shown). */
const PLAIN_LINES = COVER_WAKE.lines.map((line) => line.replace(/\*\*/g, ""));

function chatText(): string {
  return document.querySelector('[data-testid="cover-momo-chat"]')?.textContent ?? "";
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "1");
  resetInputModeForTest();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GlobalCamera cover budget (NUI-2: ring holdable <= 8 s after the wave)", () => {
  it("all four lines are shown and the thumb ring is holdable by 8 s after the wave", () => {
    render(<GlobalCamera mode="cover" modelUrl="/m" />);
    const wave = () => (window as Window & { __skbWave?: () => void }).__skbWave?.();
    act(() => { wave(); });

    const seen = new Set<string>();
    let thumbAt: number | null = null;
    for (let t = 0; t <= BUDGET_MS; t += STEP_MS) {
      const text = chatText();
      for (const line of PLAIN_LINES) if (text.includes(line)) seen.add(line);
      if (thumbAt === null && screen.queryByTestId("cover-thumb")) thumbAt = t;
      act(() => { vi.advanceTimersByTime(STEP_MS); });
    }

    const missing = PLAIN_LINES.filter((line) => !seen.has(line));
    expect(missing, `lines not shown within ${BUDGET_MS} ms`).toEqual([]);
    expect(thumbAt, `thumb ring appears at ${thumbAt} ms`).not.toBeNull();
    expect(thumbAt as number).toBeLessThanOrEqual(BUDGET_MS);
  });
});
