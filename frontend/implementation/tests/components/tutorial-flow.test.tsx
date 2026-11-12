import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { CARD_READ_MS } from "@/src/components/onboarding/tutorial-card-gate";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest } from "@/src/camera/thumb-tracker";
import { mockRect, pointer, stubCanvas2d } from "./tutorial-helpers";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

// Real timers: GSAP and Momo's typing both run on real frames. The read time is the real CARD_READ_MS.
beforeEach(() => {
  resetInputModeForTest();
  resetThumbTrackerForTest();
  stubCanvas2d();
});
afterEach(() => {
  cleanup();
  resetThumbTrackerForTest();
  resetInputModeForTest();
  vi.restoreAllMocks();
});

const cardOpen = (n: number) => document.querySelector(`.tutorial-card-${n}.is-open`) !== null;
const toolUsed = (id: string) => document.querySelector(`[data-tool=${id}]`)?.classList.contains("is-used") ?? false;

describe("tutorial flow in fallback (R4): each card waits for Momo, the practice and the read time", () => {
  it("three cards: walk, read, thumb; the drawing gestures, read, a 2 s hold starts Level 1", async () => {
    forceInputMode("fallback");
    const onStart = vi.fn();
    await act(async () => {
      render(<TutorialBrochure onStart={onStart} />);
    });
    await waitFor(() => expect(cardOpen(1)).toBe(true), { timeout: 8000 });

    // Card 1: Thinman walks to the flag with the mouse. The thumb shows the lock and the reading label, not a button.
    const scene = screen.getByTestId("tutorial-walk");
    mockRect(scene);
    pointer(scene, "pointerdown", 80);
    pointer(scene, "pointerup", 80);
    const flagAt = Date.now();
    await waitFor(() => expect(screen.getByTestId("tutorial-thumb-1").textContent).toMatch(/Baca dulu, ya/), { timeout: 15000 });
    expect(screen.queryByRole("button", { name: "Lanjut" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Lanjut" })).toBeTruthy(), { timeout: 45000 });
    expect(Date.now() - flagAt).toBeGreaterThanOrEqual(CARD_READ_MS - 100);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Lanjut" }));
    await waitFor(() => expect(cardOpen(2)).toBe(true), { timeout: 15000 });
    expect(onStart).not.toHaveBeenCalled();

    // Card 2: no practice, but the thumb still waits for Momo and the read time.
    expect(screen.getByTestId("tutorial-thumb-2").getAttribute("data-locked")).toBe("true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Lanjut" })).toBeTruthy(), { timeout: 45000 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Lanjut" }));
    await waitFor(() => expect(cardOpen(3)).toBe(true), { timeout: 15000 });

    // Card 3: the four gestures on the real drawing surface; the thumb stays locked until all four really happened.
    expect(screen.getByTestId("tutorial-thumb-3").getAttribute("data-locked")).toBe("true");
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.tut-draw__canvas")!;
    mockRect(canvas);
    pointer(canvas, "pointerdown", 10);
    pointer(canvas, "pointermove", 40);
    pointer(canvas, "pointerup", 40);
    await waitFor(() => expect(toolUsed("draw")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Hapus, gestur kepal" }));
    pointer(canvas, "pointerdown", 10);
    pointer(canvas, "pointerup", 10);
    await waitFor(() => expect(toolUsed("erase")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Mundur satu goresan, gestur dua jari" }));
    await waitFor(() => expect(toolUsed("undo")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Maju satu goresan, gestur telapak" }));
    await waitFor(() => expect(toolUsed("redo")).toBe(true));

    // All four done: after Momo and the read time, the thumb offers "Mulai Level 1" and a 2 s hold starts Level 1.
    await waitFor(() => expect(screen.getByRole("button", { name: "Mulai Level 1" })).toBeTruthy(), { timeout: 45000 });
    const start = screen.getByRole("button", { name: "Mulai Level 1" });
    fireEvent.pointerDown(start);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1), { timeout: 15000 });
    fireEvent.pointerUp(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  }, 240000);
});
