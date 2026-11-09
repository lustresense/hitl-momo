import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult } from "@/src/domain/types";
import { cursorAtPx, resetHandGesture, setHandGesture } from "./gesture-stub";

vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./gesture-stub");
  return { ...actual, useHandGesture: stub.useHandGestureStub };
});

const PREDICTION: PredictionResult = {
  candidates: [
    { label: "papan", confidence: 0.6 },
    { label: "batu", confidence: 0.3 },
    { label: "tali", confidence: 0.1 },
  ],
};
const LEVEL = { ...LEVELS[0]!, vocabulary: ["papan", "batu", "tali", "tangga", "ember"] };

type Box = { left: number; top: number; width: number; height: number };
function place(el: HTMLElement, box: Box) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: box.left, top: box.top, width: box.width, height: box.height,
    right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON() {},
  } as DOMRect);
}

/** Stacked buttons, 80 px apart, so the fingertip can rest on exactly one of them. */
const SLOT: Record<string, Box> = {
  "btn-accept": { left: 100, top: 100, width: 260, height: 60 },
  "btn-correct-2": { left: 100, top: 180, width: 260, height: 60 },
  "btn-correct-3": { left: 100, top: 260, width: 260, height: 60 },
  "btn-override": { left: 100, top: 340, width: 260, height: 60 },
  "btn-redraw": { left: 100, top: 520, width: 260, height: 60 },
};
const center = (id: string) => cursorAtPx(SLOT[id]!.left + SLOT[id]!.width / 2, SLOT[id]!.top + SLOT[id]!.height / 2);

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

function renderPanel() {
  const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn() };
  render(<DecisionPanel prediction={PREDICTION} level={LEVEL} {...fns} />);
  for (const id of Object.keys(SLOT)) {
    const el = screen.queryByTestId(id);
    if (el) place(el, SLOT[id]!);
  }
  return fns;
}

/** Holds the fingertip on a button: first outside (arms it), then inside for the full dwell. */
function hold(id: string, ms = 1300) {
  act(() => setHandGesture({ handVisible: true, cursor: cursorAtPx(0, 0) }));
  advance(50);
  act(() => setHandGesture({ cursor: center(id) }));
  advance(ms);
}

describe("DecisionPanel: choosing with the hand", () => {
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

  it("the rank-1 candidate is Terima: a 1.2 s dwell accepts once", () => {
    const fns = renderPanel();
    hold("btn-accept", 1100);
    expect(fns.onAccept).not.toHaveBeenCalled();
    advance(300);
    expect(fns.onAccept).toHaveBeenCalledTimes(1);
    expect(fns.onCorrect).not.toHaveBeenCalled();
  });

  it("rank 2 and rank 3 are picks: a dwell on each commits Correct with that rank", () => {
    const fns = renderPanel();
    hold("btn-correct-2");
    expect(fns.onCorrect).toHaveBeenCalledTimes(1);
    expect(fns.onCorrect).toHaveBeenLastCalledWith(2);
    expect(fns.onAccept).not.toHaveBeenCalled();
  });

  it("after one decision the other candidates are locked", () => {
    const fns = renderPanel();
    hold("btn-correct-3");
    expect(fns.onCorrect).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByTestId("btn-accept"));
    fireEvent.click(screen.getByTestId("btn-correct-2"));
    expect(fns.onAccept).not.toHaveBeenCalled();
    expect(fns.onCorrect).toHaveBeenCalledTimes(1);
  });

  it("Bukan ini opens the other labels as big buttons; picking one does not commit until Pakai", () => {
    const fns = renderPanel();
    fireEvent.click(screen.getByTestId("btn-override"));
    expect(screen.getByTestId("override-picker")).toBeTruthy();
    // only labels outside the Top-3 are offered
    expect(screen.queryByTestId("override-option-papan")).toBeNull();
    expect(screen.getByTestId("override-option-tangga")).toBeTruthy();
    expect(screen.getByTestId("override-option-ember")).toBeTruthy();

    fireEvent.click(screen.getByTestId("override-option-tangga"));
    expect(fns.onOverride).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("override-confirm"));
    expect(fns.onOverride).toHaveBeenCalledTimes(1);
    expect(fns.onOverride).toHaveBeenCalledWith("tangga");
  });

  it("with the hand: a dwell on a label chooses it, a dwell on Pakai commits it once", () => {
    const fns = renderPanel();
    fireEvent.click(screen.getByTestId("btn-override"));
    const label = screen.getByTestId("override-option-ember");
    place(label, { left: 100, top: 420, width: 260, height: 60 });
    act(() => setHandGesture({ handVisible: true, cursor: cursorAtPx(0, 0) }));
    advance(50);
    act(() => setHandGesture({ cursor: cursorAtPx(230, 450) }));
    advance(1300);
    expect(fns.onOverride).not.toHaveBeenCalled();
    expect(screen.getByTestId("override-option-ember").getAttribute("aria-pressed")).toBe("true");

    const confirm = screen.getByTestId("override-confirm");
    place(confirm, { left: 100, top: 500, width: 260, height: 60 });
    act(() => setHandGesture({ cursor: cursorAtPx(0, 0) }));
    advance(50);
    act(() => setHandGesture({ cursor: cursorAtPx(230, 530) }));
    advance(1300);
    expect(fns.onOverride).toHaveBeenCalledTimes(1);
    expect(fns.onOverride).toHaveBeenCalledWith("ember");
  });

  it("Gambar ulang is a dwell button outside the decisions and calls onRedraw once", () => {
    const fns = renderPanel();
    hold("btn-redraw");
    expect(fns.onRedraw).toHaveBeenCalledTimes(1);
    expect(fns.onAccept).not.toHaveBeenCalled();
    expect(fns.onCorrect).not.toHaveBeenCalled();
    expect(fns.onOverride).not.toHaveBeenCalled();
  });

  it("the candidate buttons keep the Top-3 facts: label, percent and rank in one button each", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /papan/i }).textContent).toContain("60%");
    expect(screen.getByRole("button", { name: /batu/i }).textContent).toContain("30%");
    expect(screen.getByRole("button", { name: /tali/i }).textContent).toContain("10%");
  });
});
