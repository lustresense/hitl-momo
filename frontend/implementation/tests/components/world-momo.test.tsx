import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { WorldMomo, RELIEF_BEAT_MS } from "../../src/components/game/WorldMomo";
import { resetCorrectionReliefForTests } from "../../src/domain/momo-script";
import type { HumanDecision } from "../../src/domain/types";

const base = { entered: true, outcome: null, phase: "gameplay" as const, canvasRef: { current: null }, geometry: null, position: 0, placementY: 0, poke: 0, onPoke: () => {} };
const decision = (type: HumanDecision["type"]) => ({ type, finalLabel: "papan", sourceRank: 2 }) as unknown as HumanDecision;

beforeEach(() => { resetCorrectionReliefForTests(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WorldMomo (R15 copy, R16 relief)", () => {
  it("tells Thinman to walk to the signpost", () => {
    const { getByTestId } = render(<WorldMomo {...base} decision={decision("accept")} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(getByTestId("world-momo").textContent).toContain("papan petunjuk");
  });
  it("first correction plays the relief beats once, then the normal line", () => {
    const d = decision("correct");
    const { getByTestId, unmount } = render(<WorldMomo {...base} decision={d} />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(getByTestId("world-momo").textContent).toContain("aku salah ya");
    for (let i = 0; i < 20; i++) act(() => { vi.advanceTimersByTime(RELIEF_BEAT_MS / 2); });
    expect(getByTestId("world-momo").textContent).toContain("papan petunjuk");
    unmount();
    render(<WorldMomo {...base} decision={decision("override")} />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(document.body.textContent).not.toContain("aku salah ya");
  });
});
