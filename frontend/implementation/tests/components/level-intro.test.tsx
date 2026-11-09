import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LevelIntro } from "@/src/components/level/LevelIntro";
import { LEVELS } from "@/src/domain/levels";
import { introLines, nudgeLines } from "@/src/domain/world-intro-script";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

beforeEach(() => {
  // Reduced motion: no GSAP timing, the intro goes straight to the story.
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetThumbTrackerForTest();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const advance = (ms: number) => { for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(50); }); };

describe("LevelIntro (PRD 0.0.16 R6, R10, R15)", () => {
  it("story names the signpost, never the flag; nudge never orders", () => {
    for (const s of [1, 2, 3]) {
      expect(introLines(s).join(" ")).not.toMatch(/bendera/);
      const n = nudgeLines(s).join(" ");
      expect(n).toMatch(/\?/);
      expect(n).not.toMatch(/jangan|harus gambar|\(|\)/i);
    }
  });
  it("after the story, the level catalog cards and a 1 s thumb lead to the sky", () => {
    const onFinish = vi.fn();
    const level = LEVELS[0]!;
    render(<LevelIntro level={level} onFinish={onFinish} />);
    expect(screen.queryByTestId("intro-cards")).toBeNull();
    advance(9000);
    const cards = screen.getByTestId("intro-cards");
    for (const item of level.catalog) expect(cards.querySelector(`[data-testid="intro-card-${item.labelId}"] svg`)).not.toBeNull();
    expect(screen.getByTestId("intro-continue")).toBeTruthy();
  });
  it("a thumbs-up during the nudge rises to the sky", () => {
    const onFinish = vi.fn();
    render(<LevelIntro level={LEVELS[1]!} onFinish={onFinish} />);
    advance(9000);
    act(() => simulateThumb(true));
    advance(1500);
    expect(onFinish).toHaveBeenCalled();
  });
});
