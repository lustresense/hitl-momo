import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { StudentRulerSelector, RULER_SETTLE_MS } from "@/src/components/onboarding/StudentRulerSelector";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
// Momo's chat timing is not under test: show her lines and the cue at once.
vi.mock("@/src/components/momo/MomoGuide", () => ({
  MomoGuide: ({ step, children }: { step: { lines: string[] } | null; children?: ReactNode }) => (
    <div data-testid="number-momo">
      <p data-testid="momo-lines">{step?.lines.join(" | ")}</p>
      {children}
    </div>
  ),
}));

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
const lines = () => screen.getByTestId("momo-lines").textContent ?? "";

describe("StudentRulerSelector (PRD 0.0.16 R3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
    const stored = new Map<string, string>([["sketchbook.studentNumber", "20"]]);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("has no buttons; Momo guides, then asks about the number once the ruler rests", () => {
    render(<StudentRulerSelector onConfirm={() => {}} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(lines()).toContain("Sebelum masuk, pilih dulu nomor absenmu.");
    expect(screen.queryByTestId("number-thumb")).toBeNull();
    advance(RULER_SETTLE_MS + 50);
    expect(lines()).toBe("Bener nomor absenmu 20?");
    expect(screen.getByTestId("number-thumb").getAttribute("data-hold-ms")).toBe("2000");
  });

  it("moving the ruler hides the question; it returns for the new number when it stops", () => {
    render(<StudentRulerSelector onConfirm={() => {}} />);
    advance(RULER_SETTLE_MS + 50);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(screen.queryByTestId("number-thumb")).toBeNull();
    advance(RULER_SETTLE_MS / 2);
    expect(screen.queryByTestId("number-thumb")).toBeNull();
    advance(RULER_SETTLE_MS);
    expect(lines()).toBe("Bener nomor absenmu 21?");
  });

  it("a 2 s thumbs-up confirms the shown number", () => {
    const onConfirm = vi.fn();
    render(<StudentRulerSelector onConfirm={onConfirm} />);
    advance(RULER_SETTLE_MS + 50);
    act(() => simulateThumb(true));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(700);
    expect(onConfirm).toHaveBeenCalledWith(20);
  });

  it("a taken number makes Momo confused and shows no thumb", () => {
    render(<StudentRulerSelector onConfirm={() => {}} takenNumbers={[20]} />);
    advance(RULER_SETTLE_MS + 50);
    expect(lines()).toMatch(/sudah ada yang pakai/);
    expect(screen.queryByTestId("number-thumb")).toBeNull();
  });
});
