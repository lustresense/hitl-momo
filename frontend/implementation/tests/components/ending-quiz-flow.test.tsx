import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { QUIZ_LEAD_LINES } from "@/src/domain/ending-script";
import { resetInputModeForTest, forceInputMode } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];
const recaps: LevelRecap[] = [
  { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "papan", category: "padat", decision: "accept", firstGuess: "papan" },
];

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
function hold(ms: number) {
  act(() => simulateThumb(true));
  advance(ms);
  act(() => simulateThumb(false));
  advance(100);
}
const stage = () => screen.getByTestId("center-of-page").getAttribute("data-stage");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetThumbTrackerForTest();
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("quiz placement behind the flag", () => {
  it("flag OFF: the recap goes straight to the ending, with no quiz", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="recap" quizEnabled={false} />);
    advance(10000);
    hold(1100);
    expect(stage()).toBe("finish");
    expect(screen.queryByTestId("quiz-entry")).toBeNull();
    expect(screen.queryByText("Kuis belum tersedia")).toBeNull();
  });

  it("flag ON: after the recap Momo walks the student to the quiz placeholder, then on to the ending", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="recap" quizEnabled />);
    advance(10000);
    hold(1100);
    expect(stage()).toBe("quiz");
    advance(10000);
    expect(screen.getByText(QUIZ_LEAD_LINES[0])).toBeTruthy();
    expect(screen.getByTestId("quiz-entry")).toBeTruthy();
    expect(screen.getByText("Kuis belum tersedia")).toBeTruthy();
    hold(1100);
    expect(stage()).toBe("finish");
  });

  it("the env flag is used when no server value is given", () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "1");
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="recap" />);
    advance(10000);
    hold(1100);
    expect(stage()).toBe("quiz");
  });

  it("the server value wins over the env flag", () => {
    vi.stubEnv("NEXT_PUBLIC_QUIZ_ENABLED", "1");
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="recap" quizEnabled={false} />);
    advance(10000);
    hold(1100);
    expect(stage()).toBe("finish");
  });
});

describe("the ending never leaves on its own", () => {
  it("nothing calls onChoose until the student picks Kembali ke sampul", () => {
    const onChoose = vi.fn();
    render(<CenterOfPage recaps={recaps} onChoose={onChoose} initialStage="recap" quizEnabled={false} />);
    advance(10000);
    hold(1100);
    advance(60000);
    expect(stage()).toBe("finish");
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("ending-back-to-cover"));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("finish");
  });
});
