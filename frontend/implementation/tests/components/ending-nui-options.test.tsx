import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetHandCursorForTest, publishHand, type HandCursorPoint } from "@/src/camera/hand-cursor-store";
import { acquireThumbTracker, resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, type Box } from "./gesture-stub";

// The closing's choice (Main lagi / Selesai) is NUI: a resting fingertip selects an option, a click selects it at
// once, and the 2 s thumb confirms. The page has no hand reader of its own, so the options use the shared tracker.
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: vi.fn(actual.acquireThumbTracker) };
});

const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];
const recaps: LevelRecap[] = [
  { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "papan", category: "padat", decision: "accept", firstGuess: "papan" },
];
const OPTION: Record<"again" | "finish", Box> = {
  again: { left: 60, top: 420, width: 260, height: 60 },
  finish: { left: 360, top: 420, width: 260, height: 60 },
};
const at = (box: Box) => cursorAtPx(box.left + box.width / 2, box.top + box.height / 2);
const OUTSIDE = cursorAtPx(5, 5);

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

function renderChoice(onChoose = vi.fn()) {
  render(<CenterOfPage recaps={recaps} onChoose={onChoose} initialStage="choice" />);
  placeBox(screen.getByTestId("ending-play-again"), OPTION.again);
  placeBox(screen.getByTestId("ending-finish"), OPTION.finish);
  return { onChoose, again: screen.getByTestId("ending-play-again"), finish: screen.getByTestId("ending-finish") };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetHandCursorForTest();
  resetThumbTrackerForTest();
  vi.mocked(acquireThumbTracker).mockClear();
  cursor = null;
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ending choice, camera mode", () => {
  it("the two options are dwell controls; Selesai is the default choice", () => {
    const { again, finish } = renderChoice();
    expect(again.getAttribute("data-mode")).toBe("camera");
    expect(finish.getAttribute("aria-pressed")).toBe("true");
    expect(again.getAttribute("aria-pressed")).toBe("false");
  });

  it("a fingertip resting 1.2 s on Main lagi selects it, and only it fills", () => {
    const { again, finish, onChoose } = renderChoice();
    readFrom(null);
    advance(50);
    readFrom(at(OPTION.again));
    advance(600);
    expect(Number(again.getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(finish.getAttribute("data-progress")).toBe("0");
    advance(800);
    expect(again.getAttribute("aria-pressed")).toBe("true");
    expect(finish.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("ending-confirm").getAttribute("aria-label")).toBe("Tahan jempol untuk main lagi");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("after the choice, a 2 s thumb confirms it once", () => {
    const { onChoose, again } = renderChoice();
    readFrom(null);
    advance(50);
    readFrom(at(OPTION.again));
    advance(1300);
    readFrom(null);
    expect(again.getAttribute("aria-pressed")).toBe("true");
    act(() => simulateThumb(true));
    advance(1500);
    expect(onChoose).not.toHaveBeenCalled();
    advance(700);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("again");
  });

  it("with no page reader the options start the shared tracker after the short wait", () => {
    renderChoice();
    advance(400);
    expect(vi.mocked(acquireThumbTracker)).toHaveBeenCalled();
  });
});

describe("ending choice, fallback mode", () => {
  it("a click selects the option at once, with no ring", () => {
    forceInputMode("fallback");
    const { again, finish } = renderChoice();
    expect(again.getAttribute("data-mode")).toBe("fallback");
    fireEvent.click(again);
    expect(again.getAttribute("aria-pressed")).toBe("true");
    expect(finish.getAttribute("aria-pressed")).toBe("false");
  });
});
