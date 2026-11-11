// @vitest-environment jsdom
/**
 * `pace` scales every timed beat of Momo's speech (letters, typing dots, reading pause). Default 1 is the reference
 * timing and must not change; the cover uses a smaller pace so her whole intro fits the NUI-2 budget.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MomoChat, dwellMs, typingMs } from "@/src/components/momo/MomoChat";
import { MomoGuide } from "@/src/components/momo/MomoGuide";

vi.mock("@/src/components/momo/MomoAvatar", () => ({ MomoAvatar: () => null }));

const SHORT = "Halo, aku Momo."; // 15 letters
const SECOND = "Ayo kita mulai!"; // 15 letters

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Clock time (ms) at which onDone fires, measured in 5 ms steps. */
function doneAt(render1: () => void, onDone: () => void, calls: () => number): number {
  render1();
  let t = 0;
  while (calls() === 0 && t < 30_000) {
    act(() => { vi.advanceTimersByTime(5); });
    t += 5;
  }
  expect(onDone).toHaveBeenCalledTimes(1);
  return t;
}

describe("MomoChat pace", () => {
  it("default pace keeps the reference timing: last line typed at 3130 ms", () => {
    // dots 410 + 15 letters 450 + reading pause 1410, then dots 410 + 15 letters 450 = 3130 ms.
    const onDone = vi.fn();
    const t = doneAt(() => render(<MomoChat lines={[SHORT, SECOND]} onDone={onDone} />), onDone, () => onDone.mock.calls.length);
    expect(typingMs(SHORT) + 15 * 30 + dwellMs(SHORT) + typingMs(SECOND) + 15 * 30).toBe(3130);
    expect(t).toBe(3130);
  });

  it("pace 0.5 finishes the same lines in about half the time", () => {
    const onDone1 = vi.fn();
    const full = doneAt(() => render(<MomoChat lines={[SHORT, SECOND]} onDone={onDone1} />), onDone1, () => onDone1.mock.calls.length);
    cleanup();
    const onDoneHalf = vi.fn();
    const half = doneAt(() => render(<MomoChat lines={[SHORT, SECOND]} pace={0.5} onDone={onDoneHalf} />), onDoneHalf, () => onDoneHalf.mock.calls.length);
    expect(half).toBe(1565);
    expect(Math.abs(half - full / 2)).toBeLessThanOrEqual(5);
  });

  it("pace scales the letter speed too: half pace types one letter every 15 ms", () => {
    render(<MomoChat lines={SHORT} pace={0.5} testId="speech" />);
    // dots are 205 ms at half pace; the first letter lands 15 ms later.
    act(() => { vi.advanceTimersByTime(205 + 10); });
    expect(document.querySelector('[data-testid="speech"]')?.textContent ?? "").not.toContain("H");
    act(() => { vi.advanceTimersByTime(10); });
    expect(document.querySelector('[data-testid="speech"]')?.textContent ?? "").toContain("H");
  });
});

describe("MomoGuide forwards pace to its speech", () => {
  it("a guide step at pace 0.5 finishes at half the default time", () => {
    const step = { mood: "Senang" as const, lines: [SHORT, SECOND] };
    const onDone = vi.fn();
    const t = doneAt(() => render(<MomoGuide step={step} pace={0.5} onDone={onDone} />), onDone, () => onDone.mock.calls.length);
    expect(t).toBe(1565);
  });
});
