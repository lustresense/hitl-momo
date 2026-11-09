import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
import { LEVELS } from "@/src/domain/levels";

// Hand tracker stubbed: the decision buttons read the fingertip, and no camera exists in tests.
vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./gesture-stub");
  return { ...actual, useHandGesture: stub.useHandGestureStub };
});

afterEach(cleanup);

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
  return { onAccept, onCorrect, onOverride };
}

describe("Decision commits exactly once, on the decisive tap", () => {
  it("Correct: a tap on rank 2 commits once; a second tap does nothing", () => {
    const { onCorrect } = setup();
    const pick = () => screen.getByTestId("btn-correct-2");
    fireEvent.click(pick());
    fireEvent.click(pick());
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(2);
  });

  it("Override: choosing a label alone does not commit; Pakai commits", () => {
    const { onOverride } = setup();
    fireEvent.click(screen.getByTestId("btn-override"));
    fireEvent.click(screen.getByTestId("override-option-balok"));
    expect(onOverride).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("override-confirm"));
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(onOverride).toHaveBeenCalledWith("balok");
  });

  it("double tap emits one Accept", () => {
    const { onAccept } = setup();
    fireEvent.click(screen.getByTestId("btn-accept"));
    fireEvent.click(screen.getByTestId("btn-accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
