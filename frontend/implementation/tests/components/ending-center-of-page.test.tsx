import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import { ENDING_TIMING, EPILOG_LINES, strokesToPath, type LevelRecap } from "@/src/components/ending/ending-types";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
function advance(ms: number) { for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); }); }
const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];
const recaps: LevelRecap[] = [
  { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "papan", category: "padat", decision: "accept", firstGuess: "papan" },
  { levelId: "stage-2-ambiguity", title: "Bab 2", strokes: sq, finalLabel: "balok", category: "padat", decision: "correct", firstGuess: "papan" },
  { levelId: "stage-3-validation", title: "Bab 3", strokes: sq, finalLabel: "tangga", category: "padat", decision: "override", firstGuess: "tali" },
];

describe("R9 Pusat Halaman", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest(); resetThumbTrackerForTest();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("runs page, alive, overview, epilog, choice and confirms with a 2 s thumb", () => {
    const onChoose = vi.fn();
    render(<CenterOfPage recaps={recaps} onChoose={onChoose} />);
    const stage = () => screen.getByTestId("center-of-page").getAttribute("data-stage");
    expect(stage()).toBe("page");
    advance(ENDING_TIMING.page + 50);
    expect(stage()).toBe("alive");
    advance(ENDING_TIMING.alive + 50);
    expect(stage()).toBe("overview");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Keputusanmu: Pilih lain")).toBeTruthy();
    expect(screen.getByText("Tebakan pertama Momo: tali")).toBeTruthy();
    advance(50); act(() => simulateThumb(true)); advance(1100); act(() => simulateThumb(false)); advance(100);
    expect(stage()).toBe("epilog");
    advance(20000);
    expect(screen.getByText(EPILOG_LINES[2])).toBeTruthy();
    advance(50); act(() => simulateThumb(true)); advance(1100); act(() => simulateThumb(false)); advance(100);
    expect(stage()).toBe("choice");
    fireEvent.click(screen.getByTestId("ending-play-again"));
    advance(50); act(() => simulateThumb(true)); advance(1500);
    expect(onChoose).not.toHaveBeenCalled();
    advance(700);
    expect(onChoose).toHaveBeenCalledWith("again");
  });

  it("fits the student's strokes into the card", () => {
    const d = strokesToPath(sq, 120, 80);
    expect(d.startsWith("M")).toBe(true);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.max(...nums)).toBeLessThanOrEqual(120);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(strokesToPath([], 120, 80)).toBe("");
  });
});
