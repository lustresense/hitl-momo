import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulatePinch } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

// Real timers on purpose: the card choreography runs on GSAP, which needs real frames.

beforeEach(() => {
  resetInputModeForTest();
  resetThumbTrackerForTest();
});
afterEach(() => {
  cleanup();
  resetThumbTrackerForTest();
  vi.restoreAllMocks();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** jsdom has no 2D canvas. A stub lets a stroke and an undo count as practice (the card 3 unlock). */
function stubCanvas2d() {
  const ctx = {
    canvas: { width: 100, height: 50 },
    lineCap: "butt", lineJoin: "miter", lineWidth: 1, strokeStyle: "", globalCompositeOperation: "source-over",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setTransform() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
}

/** One stroke on the practice canvas, then Mundur: that is what unlocks card 3 (draw and undo). */
function practiceCard3() {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas.tut-draw__canvas")!;
  // jsdom has no pointer capture; the stroke only needs the pointer events.
  Object.assign(canvas, { setPointerCapture: () => {}, releasePointerCapture: () => {} });
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 10 });
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 10 });
  fireEvent.click(screen.getByRole("button", { name: "Mundur satu goresan" }));
}

/** jsdom has no PointerEvent: a pointermove carrying the clientX React reads. */
function pointerMove(el: Element, clientX: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX }));
  });
}
function mockRect(el: HTMLElement) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) });
}
const cardOpen = (n: number) => document.querySelector(`.tutorial-card-${n}`)?.classList.contains("is-open") ?? false;
const ringProgress = (testId: string) => Number(screen.getByTestId(testId).getAttribute("data-progress"));

describe("Tutorial card 1 with the pinch ring (PRD 0.0.16 R4/R5, cubit)", () => {
  it("camera: card 1 offers the pinch ring at once, and each card has a gesture line", async () => {
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    await waitFor(() => expect(screen.getByTestId("tutorial-pinch-1")).toBeTruthy(), { timeout: 4000 });
    expect(document.querySelector(".tutorial-card-1 .tut-gesture")?.textContent).toMatch(/cubit/i);
    expect(document.querySelectorAll(".tut-gesture")).toHaveLength(3);
  }, 15000);

  it("camera: a pinch fills the ring part way; letting go drains it, and the card stays put", async () => {
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    await waitFor(() => expect(screen.getByTestId("tutorial-pinch-1")).toBeTruthy(), { timeout: 4000 });
    await wait(100); // the ring arms on its first frame, when no pinch is held
    act(() => simulatePinch(true));
    await wait(400);
    const partial = ringProgress("tutorial-pinch-1");
    expect(partial).toBeGreaterThan(5);
    expect(partial).toBeLessThan(90);
    act(() => simulatePinch(false));
    await wait(1500);
    expect(cardOpen(1)).toBe(true);
    expect(screen.getByTestId("tutorial-walk").className).not.toMatch(/is-complete/);
  }, 15000);

  it("camera: a full pinch ring walks Thinman to the flag and moves card 1 on", async () => {
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    await waitFor(() => expect(screen.getByTestId("tutorial-pinch-1")).toBeTruthy(), { timeout: 4000 });
    await wait(100);
    act(() => simulatePinch(true));
    // About 1.2 s to fill, then about 1.4 s of walking; the generous timeouts only absorb a slow machine.
    await waitFor(() => expect(screen.getByTestId("tutorial-walk").className).toMatch(/is-complete/), { timeout: 8000 });
    await waitFor(() => expect(cardOpen(2)).toBe(true), { timeout: 10000 });
    expect(screen.queryByTestId("tutorial-pinch-1")).toBeNull();
    act(() => simulatePinch(false));
  }, 30000);

  it("camera: cards 2 and 3 advance with the pinch ring too; Level 1 starts only after the card 3 practice", async () => {
    stubCanvas2d();
    const onStart = vi.fn();
    await act(async () => {
      render(<TutorialBrochure onStart={onStart} />);
    });
    await waitFor(() => expect(screen.getByTestId("tutorial-pinch-1")).toBeTruthy(), { timeout: 4000 });
    await wait(100);
    act(() => simulatePinch(true));
    await waitFor(() => expect(cardOpen(2)).toBe(true), { timeout: 15000 });
    act(() => simulatePinch(false));

    // Card 2 ("Lanjut"): the same pinch ring, a 1 s pinch moves on.
    await waitFor(() => expect(screen.getByTestId("tutorial-pinch-2")).toBeTruthy(), { timeout: 4000 });
    expect(document.querySelector(".tutorial-card-2 .tut-gesture")?.textContent).toMatch(/cubit/i);
    await wait(100);
    act(() => simulatePinch(true));
    await waitFor(() => expect(cardOpen(3)).toBe(true), { timeout: 10000 });
    act(() => simulatePinch(false));

    // Card 3 ("Mulai Level 1"): locked until the practice is done, then a 2 s pinch starts Level 1.
    expect(screen.queryByTestId("tutorial-pinch-3")).toBeNull();
    practiceCard3();
    await waitFor(() => expect(screen.getByTestId("tutorial-pinch-3")).toBeTruthy(), { timeout: 4000 });
    await wait(100);
    act(() => simulatePinch(true));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1), { timeout: 10000 });
    act(() => simulatePinch(false));
  }, 40000);

  it("fallback: card 1 stays locked until Thinman reaches the flag, then the hold button moves on; card 2 holds the same way", async () => {
    act(() => forceInputMode("fallback"));
    await act(async () => {
      render(<TutorialBrochure onStart={() => {}} />);
    });
    expect(document.querySelector(".tutorial-card-1 .brochure-cta")?.getAttribute("data-locked")).toBe("true");
    expect(screen.queryByTestId("tutorial-pinch-1")).toBeNull();
    const scene = screen.getByTestId("tutorial-walk");
    mockRect(scene);
    pointerMove(scene, 77);
    const button = await screen.findByTestId("tutorial-pinch-1", undefined, { timeout: 4000 });
    expect(button.getAttribute("data-mode")).toBe("fallback");
    await wait(100); // the ring arms on its first frame, before the press
    fireEvent.pointerDown(button);
    await waitFor(() => expect(cardOpen(2)).toBe(true), { timeout: 8000 });
    fireEvent.pointerUp(button);

    // Card 2 holds with the mouse for 1 s, the same as the camera pinch ring.
    const second = await screen.findByTestId("tutorial-pinch-2", undefined, { timeout: 4000 });
    expect(second.getAttribute("data-mode")).toBe("fallback");
    await wait(100); // arms on its first frame, before the press
    fireEvent.pointerDown(second);
    await waitFor(() => expect(cardOpen(3)).toBe(true), { timeout: 8000 });
    fireEvent.pointerUp(second);
  }, 30000);
});
