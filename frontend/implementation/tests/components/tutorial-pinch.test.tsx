import { act, cleanup, render, screen } from "@testing-library/react";
import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { publishHandForTest, resetThumbTrackerForTest, simulatePinch } from "@/src/camera/thumb-tracker";
import { key, mockRect, pointer, stubCanvas2d } from "./tutorial-helpers";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

/*
 * Deterministic clock. The card choreography runs on GSAP timelines and on the app's own timers (Momo's typing, the
 * card read pause). Real waits made these tests slow and timed out when the suite runs in parallel, so the timers
 * and GSAP's root timeline move only when a test calls advance(). GSAP's ticker is kept off requestAnimationFrame.
 */
beforeEach(() => {
  resetInputModeForTest();
  resetThumbTrackerForTest();
  stubCanvas2d();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // GSAP's ticker started on the real rAF when the module loaded. Restart it so it only ticks through the stub.
  gsap.ticker.sleep();
  gsap.ticker.wake();
});
afterEach(() => {
  cleanup();
  resetThumbTrackerForTest();
  resetInputModeForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const STEP_MS = 16;

/** Moves the app timers and GSAP's root timeline together by `ms`, in frame-sized steps so each stage runs in order. */
async function advance(ms: number) {
  for (let left = ms; left > 0; left -= STEP_MS) {
    const step = Math.min(STEP_MS, left);
    await act(async () => {
      vi.advanceTimersByTime(step);
      gsap.updateRoot(gsap.globalTimeline.time() + step / 1000);
    });
  }
}

/** Advances in frame steps until `cond` holds; fails with `label` after `maxMs` of fake time. */
async function until(cond: () => boolean, label: string, maxMs = 8000) {
  for (let t = 0; t <= maxMs; t += STEP_MS) {
    if (cond()) return;
    await advance(STEP_MS);
  }
  throw new Error(`not reached: ${label}`);
}

/** Twenty-one landmarks with the index tip at a mirrored cursor x (0..1). The pinch itself is the test hook. */
function handAt(cursorX: number) {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  hand[8] = { x: 1 - cursorX, y: 0.5, z: 0 };
  return hand;
}
const walkLeft = () => Number.parseFloat(screen.getByTestId("tutorial-walk-man").style.left);

async function openCard1() {
  await act(async () => {
    render(<TutorialBrochure onStart={() => {}} />);
  });
  await until(() => !!document.querySelector(".tutorial-card-1.is-open"), "card 1 open");
}

describe("card 1: Thinman follows the hand (R4, cubit + geser)", () => {
  it("starts with a locked thumb, the pinch-and-drag line, and Thinman still", async () => {
    forceInputMode("camera");
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    const thumb = screen.getByTestId("tutorial-thumb-1");
    expect(thumb.getAttribute("data-locked")).toBe("true");
    expect(screen.queryByRole("button", { name: "Lanjut" })).toBeNull();
    expect(document.querySelector(".tutorial-card-1 .tut-gesture")?.textContent).toBe("Cubit dan geser Thinman ke kanan sampai menyentuh bendera.");
    await advance(1200);
    expect(screen.getByTestId("tutorial-walk").className).not.toMatch(/is-complete/);
  }, 15000);

  it("a pinch drags Thinman with the hand, and letting go stops him where he is", async () => {
    forceInputMode("camera");
    await openCard1();
    act(() => publishHandForTest(handAt(0.3)));
    act(() => simulatePinch(true));
    act(() => publishHandForTest(handAt(0.4)));
    await until(() => Math.abs(walkLeft() - 26) < 0.5, "Thinman at 26");
    act(() => simulatePinch(false));
    act(() => publishHandForTest(handAt(0.7)));
    await advance(100);
    expect(walkLeft()).toBeCloseTo(26, 0);
  }, 15000);

  it("moving the hand without a pinch does not move Thinman", async () => {
    forceInputMode("camera");
    await openCard1();
    act(() => publishHandForTest(handAt(0.2)));
    act(() => publishHandForTest(handAt(0.9)));
    await advance(100);
    expect(walkLeft()).toBeCloseTo(14, 0);
  }, 15000);

  it("a pinch that reaches the flag stops him there, and he cannot be pushed on", async () => {
    forceInputMode("camera");
    await openCard1();
    act(() => publishHandForTest(handAt(0.3)));
    act(() => simulatePinch(true));
    act(() => publishHandForTest(handAt(0.95)));
    await until(() => /is-complete/.test(screen.getByTestId("tutorial-walk").className), "walk complete");
    expect(walkLeft()).toBeCloseTo(76, 0);
    act(() => publishHandForTest(handAt(0.05)));
    await advance(100);
    expect(walkLeft()).toBeCloseTo(76, 0);
    act(() => simulatePinch(false));
  }, 15000);
});

describe("card 1 fallback: mouse drag and arrow keys (no keyboard hint on screen)", () => {
  it("the mouse moves Thinman only while the button is held", async () => {
    forceInputMode("fallback");
    await openCard1();
    const scene = screen.getByTestId("tutorial-walk");
    mockRect(scene);
    pointer(scene, "pointermove", 60);
    await advance(50);
    expect(walkLeft()).toBeCloseTo(14, 0); // hover does nothing
    pointer(scene, "pointerdown", 30);
    expect(walkLeft()).toBeCloseTo(30, 0);
    pointer(scene, "pointermove", 50);
    expect(walkLeft()).toBeCloseTo(50, 0);
    pointer(scene, "pointerup", 50);
    pointer(scene, "pointermove", 70);
    expect(walkLeft()).toBeCloseTo(50, 0);
  }, 15000);

  it("the arrow keys step Thinman", async () => {
    forceInputMode("fallback");
    await openCard1();
    const before = walkLeft();
    key("ArrowRight");
    expect(walkLeft()).toBeGreaterThan(before);
    key("ArrowLeft");
    key("ArrowLeft");
    expect(walkLeft()).toBeCloseTo(before - 3, 0);
  }, 15000);
});
