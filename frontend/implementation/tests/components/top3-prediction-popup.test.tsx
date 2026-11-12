import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Top3PredictionPopup } from "@/src/components/prediction/Top3PredictionPopup";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import type { HandPose } from "@/src/input/hand-gesture";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetPose, setPose } from "./pose-stub";

// The decision rings read the hand pose: one finger, two, three, the open palm, the thumb and the pinch.
vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./pose-stub");
  return { ...actual, useHandGesture: stub.usePoseStub };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetPose();
  forceInputMode("camera");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

/** Holds a hand pose for `ms`, after the ring has seen the empty hand once (so it is armed), then lets go. */
function hold(pose: HandPose, ms = 1600) {
  advance(64);
  act(() => setPose(pose));
  advance(ms);
  act(() => setPose("none"));
  advance(64);
}

const mockPrediction: PredictionResult = {
  candidates: [
    { label: "jembatan", confidence: 0.88 },
    { label: "papan", confidence: 0.72 },
    { label: "balok", confidence: 0.45 },
  ],
};

const level1 = {
  ...LEVELS[0]!,
  vocabulary: ["jembatan", "papan", "balok", "tangga"],
};

describe("Top3PredictionPopup Component", () => {
  it("renders predicting phase locally without crash when prediction is null", () => {
    render(
      <Top3PredictionPopup
        phase="predicting"
        prediction={null}
        predictionMode="mock"
        level={level1}
        onAccept={vi.fn()}
        onCorrect={vi.fn()}
        onOverride={vi.fn()}
        onRedraw={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.queryByTestId("popup-predicting")).toBeNull();
    expect(screen.queryByText("Momo sedang menebak...")).toBeNull();
    expect(screen.queryByText("AI PARTNER")).toBeNull();
  });

  it("renders prediction-error phase and handles retry & redraw", () => {
    const onRetry = vi.fn();
    const onRedraw = vi.fn();

    render(
      <Top3PredictionPopup
        phase="prediction-error"
        prediction={null}
        errorDetail="Network timeout"
        predictionMode="mock"
        level={level1}
        onAccept={vi.fn()}
        onCorrect={vi.fn()}
        onOverride={vi.fn()}
        onRedraw={onRedraw}
        onRetry={onRetry}
      />
    );

    expect(screen.getByTestId("popup-error")).toBeDefined();
    expect(screen.getByText("Network timeout")).toBeDefined();

    hold("one-finger");
    expect(onRetry).toHaveBeenCalledTimes(1);

    hold("pinch");
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it("renders evaluating phase with 3 candidates and DEV badge", () => {
    render(
      <Top3PredictionPopup
        phase="evaluating"
        prediction={mockPrediction}
        predictionMode="mock"
        level={level1}
        onAccept={vi.fn()}
        onCorrect={vi.fn()}
        onOverride={vi.fn()}
        onRedraw={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId("popup-evaluating")).toBeDefined();
    expect(screen.getByText("Tebakan Momo")).toBeDefined();
    expect(screen.getByTestId("prediction-source").textContent).toContain("Demo: tebakan simulasi");

    // Check all 3 candidates
    expect(screen.getByText("jembatan")).toBeDefined();
    expect(screen.getByText("88%")).toBeDefined();
    expect(screen.getByText("papan")).toBeDefined();
    expect(screen.getByText("72%")).toBeDefined();
    expect(screen.getByText("balok")).toBeDefined();
    expect(screen.getByText("45%")).toBeDefined();

    // Check rank 1 badge
    expect(screen.getByLabelText("Pilihan Utama")).toBeDefined();
  });

  it("commits Accept decision on a one-finger hold (no separate confirm button)", () => {
    const onAccept = vi.fn();
    render(
      <Top3PredictionPopup
        phase="evaluating"
        prediction={mockPrediction}
        predictionMode="mock"
        level={level1}
        onAccept={onAccept}
        onCorrect={vi.fn()}
        onOverride={vi.fn()}
        onRedraw={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    hold("one-finger");
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("commits Correct decision with the held finger count (2 or 3) only", () => {
    const onCorrect = vi.fn();
    const onAccept = vi.fn();
    render(
      <Top3PredictionPopup
        phase="evaluating"
        prediction={mockPrediction}
        predictionMode="mock"
        level={level1}
        onAccept={onAccept}
        onCorrect={onCorrect}
        onOverride={vi.fn()}
        onRedraw={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    // Holding two fingers on candidate #2 is the decision: one hold, one commit
    hold("two-fingers");
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(2);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("commits Override decision with the chosen vocabulary label only after confirming", () => {
    const onOverride = vi.fn();
    render(
      <Top3PredictionPopup
        phase="evaluating"
        prediction={mockPrediction}
        predictionMode="mock"
        level={level1}
        onAccept={vi.fn()}
        onCorrect={vi.fn()}
        onOverride={onOverride}
        onRedraw={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    hold("open-palm");

    // Choosing a label alone does not commit; Pakai does
    hold("one-finger");
    expect(onOverride).not.toHaveBeenCalled();
    hold("thumb-up", 2100);
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(onOverride).toHaveBeenCalledWith("tangga");
  });

  it("invokes onRedraw when the pinch on Gambar lagi is held", () => {
    const onRedraw = vi.fn();
    render(
      <Top3PredictionPopup
        phase="evaluating"
        prediction={mockPrediction}
        predictionMode="mock"
        level={level1}
        onAccept={vi.fn()}
        onCorrect={vi.fn()}
        onOverride={vi.fn()}
        onRedraw={onRedraw}
        onRetry={vi.fn()}
      />
    );

    hold("pinch");
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it("invokes onRedraw when Escape key is pressed", () => {
    const onRedraw = vi.fn();
    render(
      <Top3PredictionPopup
        phase="evaluating"
        prediction={mockPrediction}
        predictionMode="mock"
        level={level1}
        onAccept={vi.fn()}
        onCorrect={vi.fn()}
        onOverride={vi.fn()}
        onRedraw={onRedraw}
        onRetry={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it("DrawingScreen remains mounted and freezes canvas pointer events when evaluating", () => {
    const surfaceRef = { current: null };
    render(
      <DrawingScreen
        level={level1}
        initialMode="pointer"
        feedback={null}
        surfaceOut={surfaceRef}
        onSubmit={vi.fn()}
        onExit={vi.fn()}
        active={false}
        phase="evaluating"
        prediction={mockPrediction}
      />
    );

    // Canvas is still in document!
    const canvas = screen.getByTestId("draw-canvas");
    expect(canvas).toBeDefined();
    expect(canvas.style.pointerEvents).toBe("none");

    // Floating popup is in document!
    expect(screen.getByTestId("popup-evaluating")).toBeDefined();

    // Camera mode keeps Tebak behind "Bantuan": open it first, as a student would. It stays disabled while evaluating.
    fireEvent.click(screen.getByTestId("btn-drawing-help"));
    expect(screen.getByTestId("btn-submit-drawing").hasAttribute("disabled")).toBe(true);
  });
});

