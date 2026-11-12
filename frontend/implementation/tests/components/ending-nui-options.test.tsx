import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetHandCursorForTest, publishHand, type HandCursorPoint } from "@/src/camera/hand-cursor-store";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, type Box } from "./gesture-stub";

// The closing ends on one NUI control, Kembali ke sampul: a resting fingertip selects it, a click fires it at once.
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];
const recaps: LevelRecap[] = [
  { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "papan", category: "padat", decision: "accept", firstGuess: "papan" },
];
const BOX: Box = { left: 120, top: 420, width: 260, height: 60 };
const at = (box: Box) => cursorAtPx(box.left + box.width / 2, box.top + box.height / 2);

let cursor: HandCursorPoint | null = null;
function readFrom(next: HandCursorPoint | null) {
  cursor = next;
  act(() => publishHand({ cursor: next, source: "tracker" }));
}
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      publishHand({ cursor, source: "tracker" });
      vi.advanceTimersByTime(16);
    });
  }
}

function renderFinish(onChoose = vi.fn()) {
  render(<CenterOfPage recaps={recaps} onChoose={onChoose} initialStage="finish" quizEnabled={false} />);
  advance(15000); // Momo's last line first; the control only appears after it
  const back = screen.getByTestId("ending-back-to-cover");
  placeBox(back, BOX);
  return { onChoose, back };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetHandCursorForTest();
  resetThumbTrackerForTest();
  cursor = null;
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ending finish, camera mode", () => {
  it("a fingertip resting on Kembali ke sampul selects it once", () => {
    const { onChoose, back } = renderFinish();
    expect(back.getAttribute("data-mode")).toBe("camera");
    readFrom(null);
    advance(50);
    readFrom(at(BOX));
    advance(1500);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("finish");
  });

  it("the control is not there while Momo is still talking", () => {
    render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="finish" quizEnabled={false} />);
    expect(screen.queryByTestId("ending-back-to-cover")).toBeNull();
  });
});

describe("ending finish, fallback mode", () => {
  it("a click fires it at once", () => {
    forceInputMode("fallback");
    const onChoose = vi.fn();
    render(<CenterOfPage recaps={recaps} onChoose={onChoose} initialStage="finish" quizEnabled={false} />);
    advance(15000);
    fireEvent.click(screen.getByTestId("ending-back-to-cover"));
    expect(onChoose).toHaveBeenCalledWith("finish");
  });
});
