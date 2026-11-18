import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LevelIntro } from "@/src/components/level/LevelIntro";
import { LEVELS } from "@/src/domain/levels";
import { introLines, nudgeLines } from "@/src/domain/world-intro-script";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
vi.mock("gsap", async () => {
  const { gsapClockStub } = await import("./gsap-clock-stub");
  const gsap = gsapClockStub();
  return { gsap, default: gsap };
});

beforeEach(() => {
  // Reduced motion: the story is typed without letters, and the thumb and the rise run at their normal length.
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetThumbTrackerForTest();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const advance = (ms: number) => { for (let t = 0; t < ms; t += 25) act(() => { vi.advanceTimersByTime(25); }); };

/** Runs the story until the thumb is on screen (its lines are typed and read first). */
function advanceUntilThumb(limit = 180000) {
  for (let t = 0; t < limit; t += 25) {
    if (screen.queryByTestId("intro-continue")) return;
    advance(25);
  }
  throw new Error("the thumb never appeared");
}

describe("LevelIntro (PRD 0.0.16 R6, R10, R15)", () => {
  it("story names the signpost, never the flag; nudge never orders", () => {
    for (const s of [1, 2, 3]) {
      expect(introLines(s).join(" ")).not.toMatch(/bendera/);
      const n = nudgeLines(s).join(" ");
      expect(n).toMatch(/\?/);
      expect(n).not.toMatch(/jangan|harus gambar|\(|\)/i);
    }
  });

  it("the intro shows no picture cards: the drawing page offers them instead", () => {
    render(<LevelIntro level={LEVELS[0]!} onFinish={vi.fn()} />);
    advanceUntilThumb();
    expect(screen.queryByTestId("intro-cards")).toBeNull();
    expect(document.querySelector("[data-testid^=intro-card-]")).toBeNull();
    expect(screen.getByTestId("intro-continue")).toBeTruthy();
  });

  it("a thumbs-up after the story rises to the sky and hands over", () => {
    const onFinish = vi.fn();
    render(<LevelIntro level={LEVELS[1]!} onFinish={onFinish} />);
    advanceUntilThumb();
    act(() => simulateThumb(false));
    advance(100); // the thumb is down first: the ring arms only after it has been seen down
    act(() => simulateThumb(true));
    advance(1200);
    expect(screen.getByTestId("level-intro").getAttribute("data-phase")).toBe("rise");
    advance(3500);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
