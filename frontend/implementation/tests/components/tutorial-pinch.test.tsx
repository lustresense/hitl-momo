import { act, cleanup, render, screen } from "@testing-library/react";
import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { publishHandForTest, resetThumbTrackerForTest, simulatePinch } from "@/src/camera/thumb-tracker";
import { key, mockRect, pointer, stubCanvas2d } from "./tutorial-helpers";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

beforeEach(() => {
  resetInputModeForTest();
  resetThumbTrackerForTest();
  stubCanvas2d();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
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

async function advance(ms: number) {
  for (let left = ms; left > 0; left -= STEP_MS) {
    const step = Math.min(STEP_MS, left);
    await act(async () => {
      vi.advanceTimersByTime(step);
      gsap.updateRoot(gsap.globalTimeline.time() + step / 1000);
    });
  }
}

async function until(cond: () => boolean, label: string, maxMs = 8000) {
  for (let t = 0; t <= maxMs; t += STEP_MS) {
    if (cond()) return;
    await advance(STEP_MS);
  }
  throw new Error("not reached: " + label);
}

/** Hand with only index finger extended, pointing RIGHT (tip.x < knuckle.x for positive angle) */
function handOneFinger(cursorX: number) {
  // cursorX 0..1 across camera frame: 0 = right edge, 1 = left edge
  // knuckle at cursorX, tip further right (smaller x) for pointing right
  const knuckleX = 1 - cursorX;
  const tipX = knuckleX - 0.15; // tip right of knuckle
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0 }));
  hand[0] = { x: 0.5, y: 0.7, z: 0 };           // wrist
  hand[9] = { x: knuckleX, y: 0.3, z: 0 };      // index MCP (knuckle)
  hand[8] = { x: tipX, y: 0.15, z: 0 };         // index tip - far from wrist = extended
  hand[7] = { x: tipX + 0.05, y: 0.2, z: 0 };   // index PIP
  hand[6] = { x: knuckleX, y: 0.3, z: 0 };      // index MCP (duplicate of 9)
  // Middle, ring, pinky curled: tip closer to wrist than PIP
  hand[12] = { x: 0.55, y: 0.55, z: 0 }; hand[11] = { x: 0.55, y: 0.5, z: 0 }; hand[10] = { x: 0.55, y: 0.45, z: 0 };
  hand[16] = { x: 0.5, y: 0.55, z: 0 }; hand[15] = { x: 0.5, y: 0.5, z: 0 }; hand[14] = { x: 0.5, y: 0.45, z: 0 };
  hand[20] = { x: 0.45, y: 0.55, z: 0 }; hand[19] = { x: 0.45, y: 0.5, z: 0 }; hand[18] = { x: 0.45, y: 0.45, z: 0 };
  // Thumb relaxed
  hand[2] = { x: 0.4, y: 0.6, z: 0 }; hand[3] = { x: 0.4, y: 0.55, z: 0 }; hand[4] = { x: 0.4, y: 0.65, z: 0 };
  hand[5] = { x: 0.5, y: 0.5, z: 0 };
  return hand;
}

/** Hand with pinch: thumb near index tip */
function handForPinch(cursorX: number) {
  const knuckleX = 1 - cursorX;
  const tipX = knuckleX - 0.15;
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0 }));
  hand[0] = { x: 0.5, y: 0.7, z: 0 };
  hand[9] = { x: knuckleX, y: 0.3, z: 0 };
  hand[8] = { x: tipX, y: 0.15, z: 0 };
  hand[7] = { x: tipX + 0.05, y: 0.2, z: 0 };
  hand[6] = { x: knuckleX, y: 0.3, z: 0 };
  // Middle, ring, pinky curled
  hand[12] = { x: 0.55, y: 0.55, z: 0 }; hand[11] = { x: 0.55, y: 0.5, z: 0 }; hand[10] = { x: 0.55, y: 0.45, z: 0 };
  hand[16] = { x: 0.5, y: 0.55, z: 0 }; hand[15] = { x: 0.5, y: 0.5, z: 0 }; hand[14] = { x: 0.5, y: 0.45, z: 0 };
  hand[20] = { x: 0.45, y: 0.55, z: 0 }; hand[19] = { x: 0.45, y: 0.5, z: 0 }; hand[18] = { x: 0.45, y: 0.45, z: 0 };
  // Thumb near index tip for pinch (tipGap < ipGap * 0.42)
  hand[2] = { x: tipX + 0.02, y: 0.2, z: 0 }; hand[3] = { x: tipX + 0.01, y: 0.25, z: 0 }; hand[4] = { x: tipX, y: 0.15, z: 0 };
  hand[5] = { x: 0.5, y: 0.5, z: 0 };
  return hand;
}

const walkLeft = () => Number.parseFloat(screen.getByTestId("tutorial-walk-man").style.left);

async function openCard1() {
  await act(async () => {
    render(<TutorialBrochure onStart={() => {}} />);
  });
  await until(() => !!document.querySelector(".tutorial-card-1.is-open"), "card 1 open");
}

function pushHandFrames(hand: ReturnType<typeof handForPinch>, count = 6) {
  for (let i = 0; i < count; i++) {
    act(() => publishHandForTest(hand));
    vi.advanceTimersByTime(STEP_MS);
    gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
  }
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
    expect(document.querySelector(".tutorial-card-1 .tut-gesture")?.textContent).toBe("Arahkan telunjuk ke kanan untuk jalan, ke atas untuk lompat.");
    await advance(1200);
    expect(screen.getByTestId("tutorial-walk").className).not.toMatch(/is-complete/);
  }, 15000);

  it("a pinch drags Thinman with the hand, and letting go stops him where he is", async () => {
    forceInputMode("camera");
    await openCard1();
    act(() => simulatePinch(true));
    const hand = handForPinch(0.3);
    pushHandFrames(hand, 10);
    await until(() => Math.abs(walkLeft() - 26) < 0.5, "Thinman at 26");
    act(() => simulatePinch(false));
    const handReleased = handOneFinger(0.7);
    for (let i = 0; i < 2; i++) {
      act(() => publishHandForTest(handReleased));
      vi.advanceTimersByTime(STEP_MS);
      gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
    }
    await advance(100);
    expect(walkLeft()).toBeCloseTo(26, 0);
  }, 15000);

  it("moving the hand without a pinch does not move Thinman", async () => {
    forceInputMode("camera");
    await openCard1();
    const hand1 = handOneFinger(0.2);
    const hand2 = handOneFinger(0.9);
    for (let i = 0; i < 6; i++) {
      act(() => publishHandForTest(hand1));
      vi.advanceTimersByTime(STEP_MS);
      gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
    }
    for (let i = 0; i < 6; i++) {
      act(() => publishHandForTest(hand2));
      vi.advanceTimersByTime(STEP_MS);
      gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
    }
    await advance(100);
    expect(walkLeft()).toBeCloseTo(14, 0);
  }, 15000);

  it("a pinch that reaches the flag stops him there, and he cannot be pushed on", async () => {
    forceInputMode("camera");
    await openCard1();
    act(() => simulatePinch(true));
    const hand1 = handForPinch(0.3);
    const hand2 = handForPinch(0.95);
    for (let i = 0; i < 6; i++) {
      act(() => publishHandForTest(hand1));
      vi.advanceTimersByTime(STEP_MS);
      gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
    }
    for (let i = 0; i < 16; i++) {
      act(() => publishHandForTest(hand2));
      vi.advanceTimersByTime(STEP_MS);
      gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
    }
    await until(() => /is-complete/.test(screen.getByTestId("tutorial-walk").className), "walk complete");
    expect(walkLeft()).toBeCloseTo(76, 0);
    act(() => publishHandForTest(handOneFinger(0.05)));
    vi.advanceTimersByTime(STEP_MS);
    gsap.updateRoot(gsap.globalTimeline.time() + STEP_MS / 1000);
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
    expect(walkLeft()).toBeCloseTo(14, 0);
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
