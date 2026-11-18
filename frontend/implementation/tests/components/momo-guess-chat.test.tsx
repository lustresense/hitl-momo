import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomoGuessChat } from "@/src/components/prediction/MomoGuessChat";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import type { HandPose } from "@/src/input/hand-gesture";
import { resetPose, setPose } from "./pose-stub";

vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./pose-stub");
  return { ...actual, useHandGesture: stub.usePoseStub };
});

const prediction: PredictionResult = { candidates: [{ label: "papan", confidence: 0.5 }, { label: "balok", confidence: 0.3 }, { label: "tangga", confidence: 0.2 }] };

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

/** The ring arms on the empty hand first, then the pose is held for `ms` and released. */
function hold(pose: HandPose, ms = 1600) {
  advance(64);
  act(() => setPose(pose));
  advance(ms);
  act(() => setPose("none"));
  advance(64);
}

describe("MomoGuessChat", () => {
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

  const setup = (phase: "evaluating" | "prediction-error" = "evaluating") => {
    const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn(), onRetry: vi.fn() };
    render(<MomoGuessChat phase={phase} prediction={prediction} predictionMode="mock" level={LEVELS[0]!} {...fns} />);
    advance(64);
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

  it("Terima (one finger) commits only after a full 1.5 s hold, once", () => {
    const { onAccept } = setup();
    act(() => setPose("one-finger"));
    advance(1300);
    expect(onAccept).not.toHaveBeenCalled();
    advance(300);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("picking rank 2 (two fingers) commits Correct with 2, never Accept", () => {
    const { onAccept, onCorrect } = setup();
    hold("two-fingers");
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(2);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("Gambar lagi (pinch) holds to onRedraw; Esc still redraws", () => {
    const { onRedraw } = setup();
    hold("pinch");
    expect(onRedraw).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onRedraw).toHaveBeenCalledTimes(2);
  });

  it("error phase: one finger holds Coba lagi and retries once; a pinch holds Revisi gambar", () => {
    const { onRetry, onRedraw } = setup("prediction-error");
    expect(screen.getByTestId("popup-error")).toBeTruthy();
    hold("one-finger");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRedraw).not.toHaveBeenCalled();
    hold("pinch");
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it("the Top-3 chat has no hand cursor: the decision is a finger count, not a pointer", () => {
    setup();
    act(() => setPose("none"));
    expect(document.querySelectorAll("[data-hand-cursor]")).toHaveLength(0);
    expect(document.querySelector(".hand-cursor")).toBeNull();
  });
});
