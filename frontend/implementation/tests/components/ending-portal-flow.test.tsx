import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import { ENDING_TIMING, type LevelRecap } from "@/src/components/ending/ending-types";
import { AI_TALK_LINES } from "@/src/domain/ending-script";
import { resetInputModeForTest, forceInputMode } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];
const recaps: LevelRecap[] = [
  { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "papan", category: "padat", decision: "accept", firstGuess: "papan" },
  { levelId: "stage-2-ambiguity", title: "Bab 2", strokes: sq, finalLabel: "balok", category: "padat", decision: "correct", firstGuess: "papan" },
  { levelId: "stage-3-validation", title: "Bab 3", strokes: sq, finalLabel: "tangga", category: "padat", decision: "override", firstGuess: "tali" },
];

/** Advance in 16 ms steps, so the ring and the typing run as they do in the browser. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
/** Hold the thumb for `ms`, then let it go. */
function hold(ms: number) {
  act(() => simulateThumb(true));
  advance(ms);
  act(() => simulateThumb(false));
  advance(100);
}
const stage = () => screen.getByTestId("center-of-page").getAttribute("data-stage");

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetThumbTrackerForTest();
  forceInputMode("camera");
  stubReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ending order: portal, Momo's words, thumb, recap", () => {
  it("the portal plays for 7 s by itself, then Momo speaks; no thumb while she speaks", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} />);
    expect(ENDING_TIMING.portal).toBe(7000);
    expect(stage()).toBe("portal");
    act(() => vi.advanceTimersByTime(ENDING_TIMING.portal - 1));
    expect(stage()).toBe("portal");
    act(() => vi.advanceTimersByTime(1));
    expect(stage()).toBe("talk");
    expect(screen.queryByTestId("ending-understood")).toBeNull();
    advance(1000);
    expect(screen.queryByTestId("ending-understood")).toBeNull();
  });

  it("after Momo's last line a thumb says Aku mengerti, and only the thumb opens the recap", () => {
    const onChoose = vi.fn();
    render(<CenterOfPage recaps={recaps} onChoose={onChoose} initialStage="talk" />);
    advance(40000); // long enough for all three lines; nothing moves on by itself
    expect(stage()).toBe("talk");
    expect(screen.getByText(AI_TALK_LINES[AI_TALK_LINES.length - 1]!)).toBeTruthy();
    const thumb = screen.getByTestId("ending-understood");
    expect(thumb.getAttribute("data-hold-ms")).toBe("1000");
    expect(thumb.getAttribute("aria-label")).toBe("Aku mengerti");
    hold(1100);
    expect(stage()).toBe("recap");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("the thumb is not there while the recap is still waiting for Momo's line to finish", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="recap" />);
    expect(screen.queryByTestId("ending-recap-next")).toBeNull();
    advance(30000);
    expect(stage()).toBe("recap");
    expect(screen.getByTestId("ending-recap-next")).toBeTruthy();
  });
});

describe("portal: Thinman goes in and comes out alive", () => {
  it("the portal phases change at their fixed times", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} />);
    const phase = () => screen.getByTestId("ending-portal").getAttribute("data-phase");
    act(() => vi.advanceTimersByTime(ENDING_TIMING.inside - 1));
    expect(phase()).toBe("enter");
    act(() => vi.advanceTimersByTime(1));
    expect(phase()).toBe("inside");
    act(() => vi.advanceTimersByTime(ENDING_TIMING.out - ENDING_TIMING.inside));
    expect(phase()).toBe("alive");
  });

  it("Momo reacts once Thinman is alive", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(ENDING_TIMING.out));
    advance(2000);
    expect(screen.getByText("Eh! Kamu... hidup?")).toBeTruthy();
  });

  it("reduced motion keeps the same 7 s length", () => {
    stubReducedMotion(true);
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(ENDING_TIMING.portal - 1));
    expect(stage()).toBe("portal");
    act(() => vi.advanceTimersByTime(1));
    expect(stage()).toBe("talk");
    expect(screen.getByTestId("center-of-page").className).toContain("is-reduce");
  });

  it("unmounting in the middle of the portal clears its timers", () => {
    const { unmount } = render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} />);
    unmount();
    expect(() => advance(10000)).not.toThrow();
  });
});
