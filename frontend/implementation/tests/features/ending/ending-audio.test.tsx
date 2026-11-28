// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { EndingScreen } from "@/src/features/ending";
import { recapLandRate } from "@/src/features/ending/RecapChat";
import { END_STEP_DISTANCE } from "@/src/features/ending/usePondWalkerLoop";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";

const emit = vi.hoisted(() => vi.fn());
vi.mock("@/src/audio", () => ({
  audio: { emit, musicPatch: vi.fn(), duck: vi.fn() },
  PENTATONIC_RATES: [1, 1.122, 1.26, 1.498, 1.682, 2],
}));

const recaps: LevelRecap[] = [1, 2, 3].map((n) => ({
  levelId: `stage-${n}-x`,
  title: `Bab ${n}`,
  strokes: [[{ x: 10, y: 10 }, { x: 90, y: 60 }]],
  finalLabel: "tangga",
  category: "padat",
  decision: "accept",
  firstGuess: "tangga",
  firstGuessConfidence: 0.8,
  redrawCount: 0,
}));

function Probe({ onReady }: { onReady: (c: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => onReady(ctrl), [ctrl, onReady]);
  return null;
}

const calls = (id: string) => emit.mock.calls.filter(([i]) => i === id);

describe("ending audio wiring (UNIT_ONLY, audio mocked)", () => {
  beforeEach(() => {
    emit.mockClear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("steps the recap up the pentatonic per card, wrapping after five", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(recapLandRate)).toEqual([1, 1.122, 1.26, 1.498, 1.682, 1, 1.122]);
    expect(recapLandRate(-3)).toBe(1);
    expect(recapLandRate(Number.NaN)).toBe(1);
  });

  it("one footfall is a bit under half a walk cycle of travel", () => {
    expect(END_STEP_DISTANCE).toBeGreaterThan(20);
    expect(END_STEP_DISTANCE).toBeLessThan(35);
  });

  it("recap cards land with rising rates; the closing jingle plays once when the recap is confirmed, not on mount", async () => {
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <Probe onReady={(c) => { ctrl = c; }} />
        <EndingScreen recaps={recaps} onChoose={vi.fn()} initialPhase="rekap" />
      </NuiProvider>,
    );
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { vi.advanceTimersByTime(1700); });
    act(() => { vi.advanceTimersByTime(600); });
    expect(calls("recap.land").map(([, p]) => (p as { rate: number }).rate)).toEqual([1, 1.122, 1.26]);
    expect(calls("jingle.ending_close")).toHaveLength(0);

    const ring = screen.getByTestId("r83-ending-recap-next");
    Object.defineProperty(ring, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 300, top: 300, right: 396, bottom: 412, width: 96, height: 112, x: 300, y: 300, toJSON: () => ({}) }),
    });
    await act(async () => {
      now = 100;
      ts.push({ t: now, x: 50, y: 50, inFrame: true, pinch: true });
      for (let i = 0; i < 80; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 50, y: 50, inFrame: true, pinch: false });
      await Promise.resolve();
    });
    expect(screen.getByTestId("r83-ending-app").getAttribute("data-phase")).toBe("akhir");
    expect(calls("jingle.ending_close")).toHaveLength(1);
  });

  it("starting directly in the final phase (restart / capture) does not play the closing jingle", () => {
    render(<EndingScreen recaps={recaps} onChoose={vi.fn()} initialPhase="akhir" />);
    expect(calls("jingle.ending_close")).toHaveLength(0);
  });

  it("the parachute scene does not sound anything before its timeline reaches the canopy", () => {
    render(<EndingScreen recaps={recaps} onChoose={vi.fn()} />);
    expect(calls("ending.chute_open")).toHaveLength(0);
    expect(calls("ending.touchdown")).toHaveLength(0);
  });
});
