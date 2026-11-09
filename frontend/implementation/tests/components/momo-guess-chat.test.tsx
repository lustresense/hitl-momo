import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomoGuessChat } from "@/src/components/prediction/MomoGuessChat";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import { cursorAtPx, placeBox, resetHandGesture, setHandGesture, type Box } from "./gesture-stub";

vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./gesture-stub");
  return { ...actual, useHandGesture: stub.useHandGestureStub };
});

const prediction: PredictionResult = { candidates: [{ label: "papan", confidence: 0.5 }, { label: "balok", confidence: 0.3 }, { label: "tangga", confidence: 0.2 }] };
const BOX_FOR: Record<string, Box> = {
  "btn-accept": { left: 100, top: 100, width: 260, height: 60 },
  "btn-correct-2": { left: 100, top: 180, width: 260, height: 60 },
  "btn-correct-3": { left: 100, top: 260, width: 260, height: 60 },
  "btn-override": { left: 100, top: 340, width: 260, height: 60 },
  "btn-redraw": { left: 100, top: 520, width: 260, height: 60 },
  "btn-retry-prediction": { left: 100, top: 100, width: 260, height: 60 },
};

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

/** Parks the fingertip outside, places the button, then rests the fingertip on it for `ms`. */
function hoverOn(testId: string, ms: number) {
  const box = BOX_FOR[testId]!;
  act(() => setHandGesture({ handVisible: true, cursor: cursorAtPx(10, 10) }));
  advance(50);
  act(() => setHandGesture({ cursor: cursorAtPx(box.left + box.width / 2, box.top + box.height / 2) }));
  advance(ms);
}

describe("MomoGuessChat", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetHandGesture();
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const setup = (phase: "evaluating" | "prediction-error" = "evaluating") => {
    const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn(), onRetry: vi.fn() };
    render(<MomoGuessChat phase={phase} prediction={prediction} predictionMode="mock" level={LEVELS[0]!} {...fns} />);
    for (const id of Object.keys(BOX_FOR)) {
      const el = screen.queryByTestId(id);
      if (el) placeBox(el, BOX_FOR[id]!);
    }
    return fns;
  };

  it("shows Top-3 with provider percents and keeps the heading and test ids", () => {
    setup();
    expect(screen.getByRole("heading", { name: /tebakan momo/i })).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    for (const id of ["btn-accept", "btn-correct-2", "btn-correct-3", "btn-override", "btn-redraw", "prediction-source"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it("Terima (rank 1) commits only after a full 1.2 s dwell, once", () => {
    const { onAccept } = setup();
    hoverOn("btn-accept", 1100);
    expect(onAccept).not.toHaveBeenCalled();
    advance(300);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("picking rank 2 on the chat commits Correct with 2, never Accept", () => {
    const { onAccept, onCorrect } = setup();
    hoverOn("btn-correct-2", 1300);
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(2);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("Gambar ulang dwells to onRedraw; Esc still redraws", () => {
    const { onRedraw } = setup();
    hoverOn("btn-redraw", 1300);
    expect(onRedraw).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onRedraw).toHaveBeenCalledTimes(2);
  });

  it("error phase: Coba lagi is a dwell button that retries once", () => {
    const { onRetry, onRedraw } = setup("prediction-error");
    expect(screen.getByTestId("popup-error")).toBeTruthy();
    hoverOn("btn-retry-prediction", 1300);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRedraw).not.toHaveBeenCalled();
  });

  it("the Top-3 chat shows exactly one hand cursor while the hand is visible", () => {
    setup();
    act(() => setHandGesture({ handVisible: true, cursor: cursorAtPx(300, 300) }));
    expect(document.querySelectorAll("[data-hand-cursor]")).toHaveLength(1);
  });
});
