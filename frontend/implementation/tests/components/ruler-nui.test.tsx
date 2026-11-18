import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentRulerSelector } from "@/src/components/onboarding/StudentRulerSelector";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { publishHandForTest, resetThumbTrackerForTest, simulatePinch } from "@/src/camera/thumb-tracker";
import type { Landmark } from "@/src/input/types";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

/** 21 landmarks with the index fingertip (8) at `tipX` in the camera frame (not mirrored yet). */
function hand(tipX: number): Landmark[] {
  return Array.from({ length: 21 }, (_, i) => ({ x: i === 8 ? tipX : 0.5, y: 0.5, z: 0 }));
}
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
const value = () => Number(screen.getByRole("slider", { name: "Nomor absen" }).getAttribute("aria-valuenow"));

describe("StudentRulerSelector with the camera (NUI, BIGPROMPT 6.2 and NUI doc)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    });
  });
  afterEach(() => {
    cleanup();
    resetThumbTrackerForTest();
    vi.useRealTimers();
  });

  it("pinch and move the hand left: the ruler slides and releases on the nearest number", () => {
    render(<StudentRulerSelector onConfirm={() => {}} />);
    advance(5200);
    expect(value()).toBe(1);
    act(() => simulatePinch(true));
    act(() => publishHandForTest(hand(0.5)));
    act(() => publishHandForTest(hand(0.6)));
    act(() => publishHandForTest(hand(0.7)));
    act(() => simulatePinch(false));
    advance(50);
    expect(value()).toBeGreaterThan(1);
    expect(Number.isInteger(value())).toBe(true);
  });

  it("an open hand does not move the ruler", () => {
    render(<StudentRulerSelector onConfirm={() => {}} />);
    advance(5200);
    act(() => simulatePinch(false));
    act(() => publishHandForTest(hand(0.5)));
    act(() => publishHandForTest(hand(0.9)));
    advance(50);
    expect(value()).toBe(1);
  });

  it("a pinch during the focus phase does not move the ruler (it is locked)", () => {
    render(<StudentRulerSelector onConfirm={() => {}} />);
    act(() => simulatePinch(true));
    act(() => publishHandForTest(hand(0.5)));
    act(() => publishHandForTest(hand(0.9)));
    act(() => simulatePinch(false));
    advance(50);
    expect(value()).toBe(1);
  });
});
