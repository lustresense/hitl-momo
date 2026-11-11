import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
import { LEVELS } from "@/src/domain/levels";
import type { HandPose } from "@/src/input/hand-gesture";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetPose, setPose } from "./pose-stub";

// The decision rings read the hand pose (no camera exists in tests).
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

/** The ring arms on the empty hand first, then the pose is held for `ms` and released. */
function hold(pose: HandPose, ms = 1600) {
  advance(64);
  act(() => setPose(pose));
  advance(ms);
  act(() => setPose("none"));
  advance(64);
}

const prediction = { candidates: [{ label: "papan", confidence: 0.6 }, { label: "batu", confidence: 0.3 }, { label: "tangga", confidence: 0.1 }] } as const;

function setup() {
  const onAccept = vi.fn();
  const onCorrect = vi.fn();
  const onOverride = vi.fn();
  render(
    <DecisionPanel
      prediction={{ candidates: [...prediction.candidates] }}
      level={{ ...LEVELS[0]!, vocabulary: ["papan", "batu", "tangga", "balok"] }}
      onAccept={onAccept}
      onCorrect={onCorrect}
      onOverride={onOverride}
      onRedraw={vi.fn()}
    />,
  );
  advance(64);
  return { onAccept, onCorrect, onOverride };
}

describe("Decision commits exactly once, on the decisive hold", () => {
  it("Correct: a two-finger hold on rank 2 commits once; a second hold does nothing", () => {
    const { onCorrect } = setup();
    hold("two-fingers");
    hold("two-fingers");
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(2);
  });

  it("Override: choosing a label alone does not commit; Pakai commits", () => {
    const { onOverride } = setup();
    hold("open-palm");
    // balok is the first label outside the Top-3 here, so one finger picks it
    hold("one-finger");
    expect(onOverride).not.toHaveBeenCalled();
    hold("thumb-up", 2100);
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(onOverride).toHaveBeenCalledWith("balok");
  });

  it("a held one-finger pose emits one Accept, however long it is held", () => {
    const { onAccept } = setup();
    hold("one-finger", 1600);
    advance(3000);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
