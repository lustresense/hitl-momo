import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomoGuessChat } from "@/src/components/prediction/MomoGuessChat";
import { GUESS_IDLE_MS, GUESS_STREAM_INTERVAL_MS, initialGuessStream, stepGuessStream, strokeSignature } from "@/src/components/prediction/guess-stream";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const prediction: PredictionResult = { candidates: [{ label: "papan", confidence: 0.5 }, { label: "balok", confidence: 0.3 }, { label: "tangga", confidence: 0.2 }] };
function advance(ms: number) { for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); }); }

describe("R11 guess stream timing", () => {
  it("throttles provisional calls to ~500 ms and asks once after 1 s of rest", () => {
    let s = initialGuessStream(0);
    let calls = 0, asks = 0;
    for (let t = 0; t <= 2000; t += 100) {
      const step = stepGuessStream(s, `1:${t}`, true, t); // strokes change every tick while drawing
      s = step.state; if (step.callProvisional) calls++; if (step.ask) asks++;
    }
    expect(calls).toBeLessThanOrEqual(2000 / GUESS_STREAM_INTERVAL_MS + 1);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(asks).toBe(0);
    for (let t = 2100; t <= 2000 + GUESS_IDLE_MS + 500; t += 100) {
      const step = stepGuessStream(s, "1:2000", true, t);
      s = step.state; if (step.ask) asks++;
    }
    expect(asks).toBe(1);
    expect(GUESS_IDLE_MS).toBe(1000);
  });
  it("drops a call while one is in flight and never asks on an empty canvas", () => {
    const s = { ...initialGuessStream(0), inFlight: true };
    expect(stepGuessStream(s, "1:5", true, 1000).callProvisional).toBe(false);
    let e = initialGuessStream(0);
    for (let t = 0; t < 3000; t += 100) { const st = stepGuessStream(e, "0:0", false, t); e = st.state; expect(st.ask).toBe(false); }
    expect(strokeSignature([[1, 2], [3]])).toBe("2:3");
  });
});

describe("MomoGuessChat", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const setup = () => {
    const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn(), onRetry: vi.fn() };
    render(<MomoGuessChat phase="evaluating" prediction={prediction} predictionMode="mock" level={LEVELS[0]!} {...fns} />);
    return fns;
  };

  it("shows Top-3 with provider percents and keeps the heading and test ids", () => {
    setup();
    expect(screen.getByRole("heading", { name: /tebakan momo/i })).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    for (const id of ["btn-accept", "btn-correct", "btn-override", "prediction-source"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("Terima commits only after a 2 s thumbs-up, once", () => {
    const { onAccept } = setup();
    advance(50); // a new ring arms only after it has seen no thumb (ThumbConfirm rule)
    act(() => simulateThumb(true));
    advance(1500);
    expect(onAccept).not.toHaveBeenCalled();
    advance(700);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("Pilih lain: tap opens the picker, picking a rank then a 2 s ring commits; Terima pauses meanwhile", () => {
    const { onCorrect, onAccept } = setup();
    fireEvent.click(screen.getByTestId("btn-correct"));
    expect(screen.getByTestId("correct-picker")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-testid=correct-picker] [data-rank="3"]') as HTMLElement);
    advance(50); // a new ring arms only after it has seen no thumb (ThumbConfirm rule)
    act(() => simulateThumb(true));
    advance(2200);
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(3);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("Bukan semua: select a label then hold the ring (fallback mode, mouse hold)", () => {
    forceInputMode("fallback");
    const { onOverride } = setup();
    fireEvent.click(screen.getByTestId("btn-override"));
    fireEvent.change(document.getElementById("override-select") as HTMLSelectElement, { target: { value: "batu" } });
    const ring = screen.getByTestId("override-confirm");
    advance(50);
    fireEvent.pointerDown(ring);
    advance(2200);
    expect(onOverride).toHaveBeenCalledWith("batu");
  });
});
