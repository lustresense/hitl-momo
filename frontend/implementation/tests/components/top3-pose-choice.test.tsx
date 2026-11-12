/**
 * Choices with the hand (ZA): Top-3, the label list of DecisionPanel and the fail screen read the finger POSE
 * through the one gesture router, never the raw finger count. countExtendedFingers counts the thumb too, so a
 * raw count of 1 can be a thumbs-up. These tests give the hand a pose and a count that disagree on purpose.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
import { FailOverlay } from "@/src/components/game/FailOverlay";
import { PredictingScreen } from "@/src/components/prediction/PredictingScreen";
import { Top3Panel } from "@/src/components/prediction/Top3Panel";
import { LEVELS } from "@/src/domain/levels";
import { momoLine } from "@/src/domain/momo-script";
import type { PredictionResult } from "@/src/domain/types";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import type { HandPose } from "@/src/input/hand-gesture";

// A hand the test controls: the pose and the finger count are set separately, as the real reader can disagree.
const hand = vi.hoisted(() => ({
  state: { ready: true, handVisible: false, thumbUp: false, pinch: false, cursor: null, pose: "none", fingerCount: 0 } as {
    ready: boolean;
    handVisible: boolean;
    thumbUp: boolean;
    pinch: boolean;
    cursor: null;
    pose: string;
    fingerCount: number;
  },
  listeners: new Set<(s: { ready: boolean; handVisible: boolean; thumbUp: boolean; pinch: boolean; cursor: null; pose: string; fingerCount: number }) => void>(),
}));

vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const { useEffect, useState } = await import("react");
  return {
    ...actual,
    useHandGesture: (active = true) => {
      const [state, set] = useState(hand.state);
      useEffect(() => {
        if (!active) return;
        set(hand.state);
        hand.listeners.add(set);
        return () => {
          hand.listeners.delete(set);
        };
      }, [active]);
      return state;
    },
  };
});

function setHand(pose: HandPose, fingerCount: number) {
  hand.state = { ...hand.state, pose, fingerCount, handVisible: pose !== "none", thumbUp: pose === "thumb-up", pinch: pose === "pinch" };
  for (const listener of [...hand.listeners]) listener({ ...hand.state });
}

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

/** The ring arms on the empty hand first; then the pose is held for `ms` and released. */
function hold(pose: HandPose, fingerCount: number, ms = 1600) {
  act(() => setHand(pose, fingerCount));
  advance(ms);
  act(() => setHand("none", 0));
  advance(64);
}

const PREDICTION: PredictionResult = {
  candidates: [
    { label: "papan", confidence: 0.6 },
    { label: "batu", confidence: 0.3 },
    { label: "tali", confidence: 0.1 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  forceInputMode("camera");
  hand.state = { ready: true, handVisible: false, thumbUp: false, pinch: false, cursor: null, pose: "none", fingerCount: 0 };
});

afterEach(() => {
  cleanup();
  hand.listeners.clear();
  vi.useRealTimers();
});

describe("Top-3 candidates: the pose picks the rank", () => {
  it("a thumbs-up whose finger count reads 1 picks no candidate", () => {
    const onPick = vi.fn();
    render(<Top3Panel result={PREDICTION} onPick={onPick} />);
    advance(64);
    hold("thumb-up", 1, 3000);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("two fingers pick rank 2 even when the raw count reads 1", () => {
    const onPick = vi.fn();
    render(<Top3Panel result={PREDICTION} onPick={onPick} />);
    advance(64);
    hold("two-fingers", 1);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it("a hold shorter than the ring does not pick", () => {
    const onPick = vi.fn();
    render(<Top3Panel result={PREDICTION} onPick={onPick} />);
    advance(64);
    hold("three-fingers", 3, 800);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("the label list after Bukan ini: the pose picks the label", () => {
  // Five labels: three are the Top-3, so the list offers the other two.
  const LEVEL = { ...LEVELS[0]!, vocabulary: ["papan", "batu", "tali", "tangga", "ember"] };

  function openList() {
    const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn() };
    render(<DecisionPanel prediction={PREDICTION} level={LEVEL} {...fns} />);
    advance(64);
    hold("open-palm", 5);
    expect(screen.getByTestId("override-picker")).toBeTruthy();
    return fns;
  }

  it("two fingers pick the second label even when the raw count reads 1, and a thumb commits it", () => {
    const fns = openList();
    hold("two-fingers", 1);
    expect(screen.getByTestId("override-option-ember").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("override-option-tangga").getAttribute("aria-pressed")).toBe("false");
    hold("thumb-up", 0, 2100);
    expect(fns.onOverride).toHaveBeenCalledWith("ember");
  });

  it("a thumbs-up whose finger count reads 1 picks no label", () => {
    const fns = openList();
    hold("thumb-up", 1, 3000);
    expect(screen.getByTestId("override-option-tangga").getAttribute("aria-pressed")).toBe("false");
    expect(fns.onOverride).not.toHaveBeenCalled();
  });

  it("four fingers pick the fourth label, and the open palm that shows four does not close the list", () => {
    const fourLabels = { ...LEVELS[0]!, vocabulary: ["papan", "batu", "tali", "a1", "a2", "a3", "a4"] };
    const fns = { onAccept: vi.fn(), onCorrect: vi.fn(), onOverride: vi.fn(), onRedraw: vi.fn() };
    render(<DecisionPanel prediction={PREDICTION} level={fourLabels} {...fns} />);
    advance(64);
    hold("open-palm", 5);
    expect(screen.getByTestId("override-picker")).toBeTruthy();
    // Four spread fingers with the thumb folded read as open-palm: the open-palm ring must not toggle the list shut.
    hold("open-palm", 4);
    expect(screen.getByTestId("override-picker")).toBeTruthy();
    expect(screen.getByTestId("override-option-a4").getAttribute("aria-pressed")).toBe("true");
    expect(fns.onOverride).not.toHaveBeenCalled();
  });
});

describe("fail screen: the pose picks the action", () => {
  it("one finger retries, two move the object, three draw again; a thumbs-up whose count reads 1 does nothing", () => {
    const onRetry = vi.fn();
    const onReposition = vi.fn();
    const onRedraw = vi.fn();
    render(<FailOverlay failReason="" onRetry={onRetry} onReposition={onReposition} onRedraw={onRedraw} />);
    advance(64);
    hold("thumb-up", 1, 3000);
    expect(onRetry).not.toHaveBeenCalled();
    hold("two-fingers", 1);
    expect(onReposition).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    hold("three-fingers", 3);
    expect(onRedraw).toHaveBeenCalledTimes(1);
    hold("one-finger", 1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("recovery copy says Gambar lagi", () => {
  it("the predicting error screen offers Gambar lagi and never Gambar ulang", () => {
    render(<PredictingScreen error detail={null} onRetry={() => undefined} onRedraw={() => undefined} />);
    expect(screen.getByTestId("btn-redraw-from-error").textContent).toContain("Gambar lagi");
    expect(screen.queryByText(/gambar ulang/i)).toBeNull();
  });

  it("the Momo lines say gambar lagi, never gambar ulang", () => {
    for (const moment of ["provider-error", "cycle-fail"] as const) {
      const text = momoLine(moment).join(" ");
      expect(text).toMatch(/gambar lagi/);
      expect(text).not.toMatch(/gambar ulang/i);
    }
  });
});
