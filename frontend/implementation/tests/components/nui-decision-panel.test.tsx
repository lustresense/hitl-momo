import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
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

const PREDICTION: PredictionResult = {
  candidates: [
    { label: "papan", confidence: 0.6 },
    { label: "batu", confidence: 0.3 },
    { label: "tali", confidence: 0.1 },
  ],
};
// Top-3 is papan, batu, tali: the two other labels are the override choices, in this order (1 and 2 fingers).
const LEVEL = { ...LEVELS[0]!, vocabulary: ["papan", "batu", "tali", "tangga", "ember"] };

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

function renderPanel() {
  const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn() };
  render(<DecisionPanel prediction={PREDICTION} level={LEVEL} {...fns} />);
  // The rings arm only after the tracker has been seen with no pose: let them see the empty hand first.
  advance(64);
  return fns;
}

/** Holds a pose for `ms`, then lets the hand go and waits so the ring re-arms. */
function hold(pose: HandPose, ms = 1600) {
  act(() => setPose(pose));
  advance(ms);
  act(() => setPose("none"));
  advance(64);
}

describe("DecisionPanel: choosing with the fingers and the thumb", () => {
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

  it("one finger is Terima: holding it fills the ring and accepts once", () => {
    const fns = renderPanel();
    act(() => setPose("one-finger"));
    advance(1000);
    expect(fns.onAccept).not.toHaveBeenCalled();
    advance(700);
    expect(fns.onAccept).toHaveBeenCalledTimes(1);
    expect(fns.onCorrect).not.toHaveBeenCalled();
  });

  it("two and three fingers pick candidates 2 and 3 with that rank", () => {
    const fns = renderPanel();
    hold("two-fingers");
    expect(fns.onCorrect).toHaveBeenCalledTimes(1);
    expect(fns.onCorrect).toHaveBeenLastCalledWith(2);
    expect(fns.onAccept).not.toHaveBeenCalled();
  });

  it("three fingers picks candidate 3", () => {
    const fns = renderPanel();
    hold("three-fingers");
    expect(fns.onCorrect).toHaveBeenCalledTimes(1);
    expect(fns.onCorrect).toHaveBeenLastCalledWith(3);
  });

  it("a hold shorter than the ring time picks nothing", () => {
    const fns = renderPanel();
    act(() => setPose("one-finger"));
    advance(1000);
    act(() => setPose("none"));
    advance(2000);
    expect(fns.onAccept).not.toHaveBeenCalled();
  });

  it("other poses pick nothing: a thumbs-up, a fist, a split palm", () => {
    const fns = renderPanel();
    hold("thumb-up", 2600);
    hold("fist", 2600);
    hold("split-palm", 2600);
    expect(fns.onAccept).not.toHaveBeenCalled();
    expect(fns.onCorrect).not.toHaveBeenCalled();
    expect(fns.onOverride).not.toHaveBeenCalled();
    expect(fns.onRedraw).not.toHaveBeenCalled();
    expect(screen.queryByTestId("override-picker")).toBeNull();
  });

  it("after one decision the candidates are locked and show the lock", () => {
    const fns = renderPanel();
    hold("three-fingers");
    expect(fns.onCorrect).toHaveBeenCalledWith(3);
    hold("one-finger");
    hold("two-fingers");
    expect(fns.onAccept).not.toHaveBeenCalled();
    expect(fns.onCorrect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("btn-accept").getAttribute("data-state")).toBe("locked");
  });

  it("a ring must be released before it fills again: a pose held from before the mount does not count", () => {
    act(() => setPose("one-finger"));
    const fns = renderPanel();
    advance(2000);
    expect(fns.onAccept).not.toHaveBeenCalled();
    act(() => setPose("none"));
    advance(64);
    hold("one-finger");
    expect(fns.onAccept).toHaveBeenCalledTimes(1);
  });

  it("Bukan ini (open palm) opens the other labels, without the candidates' rings firing", () => {
    const fns = renderPanel();
    hold("open-palm");
    expect(screen.getByTestId("override-picker")).toBeTruthy();
    // Only labels outside the Top-3 are offered.
    expect(screen.queryByTestId("override-option-papan")).toBeNull();
    expect(screen.getByTestId("override-option-tangga")).toBeTruthy();
    expect(screen.getByTestId("override-option-ember")).toBeTruthy();
    expect(screen.getByTestId("btn-override").getAttribute("aria-expanded")).toBe("true");
    expect(fns.onAccept).not.toHaveBeenCalled();
  });

  it("while the other labels are open the Top-3 rings are locked, so one finger picks a label and not Terima", () => {
    const fns = renderPanel();
    hold("open-palm");
    hold("one-finger");
    expect(fns.onAccept).not.toHaveBeenCalled();
    expect(screen.getByTestId("override-option-tangga").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("btn-accept").getAttribute("data-state")).toBe("locked");
  });

  it("a label is chosen by its finger count and committed only by the thumb (Pakai), once", () => {
    const fns = renderPanel();
    hold("open-palm");
    hold("two-fingers");
    expect(screen.getByTestId("override-option-ember").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("override-option-tangga").getAttribute("aria-pressed")).toBe("false");
    expect(fns.onOverride).not.toHaveBeenCalled();
    hold("thumb-up", 2300);
    expect(fns.onOverride).toHaveBeenCalledTimes(1);
    expect(fns.onOverride).toHaveBeenCalledWith("ember");
  });

  it("Gambar lagi (pinch) is a recovery: it fires onRedraw once and decides nothing", () => {
    const fns = renderPanel();
    hold("pinch");
    expect(fns.onRedraw).toHaveBeenCalledTimes(1);
    expect(fns.onAccept).not.toHaveBeenCalled();
    expect(fns.onCorrect).not.toHaveBeenCalled();
    expect(fns.onOverride).not.toHaveBeenCalled();
  });

  it("Gambar lagi reads as a recovery: the copy is Gambar lagi, it is the last item, and it is smaller than the decisions", () => {
    renderPanel();
    const redraw = screen.getByTestId("btn-redraw");
    expect(redraw.textContent).toContain("Gambar lagi");
    expect(screen.queryByText(/Gambar ulang/)).toBeNull();
    expect(redraw.parentElement?.lastElementChild).toBe(redraw);
    const css = readFileSync(resolve(process.cwd(), "src/components/decision/DecisionPanel.css"), "utf8");
    const minHeight = Number(css.match(/\.nui-decision__redraw\s*\{[^}]*min-height:\s*(\d+)px/)?.[1]);
    expect(minHeight).toBeGreaterThanOrEqual(44);
    expect(minHeight).toBeLessThan(56);
  });

  it("the candidate rings keep the Top-3 facts: label, percent and rank in one button each", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /papan/i }).textContent).toContain("60%");
    expect(screen.getByRole("button", { name: /batu/i }).textContent).toContain("30%");
    expect(screen.getByRole("button", { name: /tali/i }).textContent).toContain("10%");
  });

  it("the decision screen has no cursor: no hand cursor and no dwell button", () => {
    const { container } = render(<DecisionPanel prediction={PREDICTION} level={LEVEL} onAccept={() => {}} onCorrect={() => {}} onOverride={() => {}} onRedraw={() => {}} />);
    expect(container.querySelector(".dwell-btn")).toBeNull();
    expect(container.querySelector(".hand-cursor")).toBeNull();
  });
});

describe("DecisionPanel: fallback (mouse, touch, keyboard)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetPose();
    forceInputMode("fallback");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a press held on Terima accepts once; a plain click does nothing", () => {
    const fns = renderPanel();
    const accept = screen.getByTestId("btn-accept");
    fireEvent.click(accept);
    expect(fns.onAccept).not.toHaveBeenCalled();
    fireEvent.pointerDown(accept);
    advance(1600);
    fireEvent.pointerUp(accept);
    expect(fns.onAccept).toHaveBeenCalledTimes(1);
  });

  it("a fallback press ignores hand poses", () => {
    const fns = renderPanel();
    act(() => setPose("one-finger"));
    advance(3000);
    expect(fns.onAccept).not.toHaveBeenCalled();
  });
});
