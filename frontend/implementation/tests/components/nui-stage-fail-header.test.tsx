import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailOverlay } from "@/src/components/game/FailOverlay";
import { StageHeader } from "@/src/components/game/StageHeader";
import { SuccessPopup } from "@/src/components/game/SuccessPopup";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import type { HandPose } from "@/src/input/hand-gesture";
import { resetPose, setPose } from "./pose-stub";
import { placeBox, type Box } from "./gesture-stub";

vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./pose-stub");
  return { ...actual, useHandGesture: stub.usePoseStub };
});
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

/** The ring arms on the empty hand first, then the pose is held for `ms` and released. */
function hold(pose: HandPose, ms = 1600) {
  advance(64);
  act(() => setPose(pose));
  advance(ms);
  act(() => setPose("none"));
  advance(64);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetPose();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderFail() {
  const handlers = { onRetry: vi.fn(), onReposition: vi.fn(), onRedraw: vi.fn() };
  render(<FailOverlay failReason="Papan terlalu pendek." {...handlers} />);
  // Momo types her lines first; the action rings appear after that.
  advance(4000);
  return { ...handlers, retry: screen.getByTestId("btn-retry-cycle"), reposition: screen.getByTestId("btn-reposition"), redraw: screen.getByTestId("btn-redraw-gameplay") };
}

describe("FailOverlay: the three actions are finger rings", () => {
  it("in camera mode each action shows the ring, and there is no cursor", () => {
    forceInputMode("camera");
    const { retry, reposition, redraw } = renderFail();
    expect(retry.getAttribute("data-mode")).toBe("camera");
    expect(reposition.getAttribute("data-mode")).toBe("camera");
    expect(redraw.getAttribute("data-mode")).toBe("camera");
    expect(document.querySelector(".hand-cursor")).toBeNull();
    expect(document.querySelector(".dwell-btn")).toBeNull();
  });

  it("one finger holds Coba lagi: it fires once at 1.5 s, and no other action", () => {
    forceInputMode("camera");
    const { onRetry, onReposition, onRedraw } = renderFail();
    act(() => setPose("one-finger"));
    advance(1300);
    expect(onRetry).not.toHaveBeenCalled();
    advance(300);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReposition).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
  });

  it("two fingers hold Geser objek, three fingers hold Gambar lagi, each alone", () => {
    forceInputMode("camera");
    const { onRetry, onReposition, onRedraw } = renderFail();
    hold("two-fingers");
    expect(onReposition).toHaveBeenCalledTimes(1);
    hold("three-fingers");
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onReposition).toHaveBeenCalledTimes(1);
  });

  it("only the ring whose pose is held fills; the neighbours stay empty", () => {
    forceInputMode("camera");
    const { reposition, redraw, retry } = renderFail();
    advance(64);
    act(() => setPose("two-fingers"));
    advance(600);
    expect(Number(reposition.getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(retry.getAttribute("data-progress")).toBe("0");
    expect(redraw.getAttribute("data-progress")).toBe("0");
  });

  it("with the mouse (fallback) a press held for the ring time fires; a plain click does nothing", () => {
    forceInputMode("fallback");
    const { onRetry, onReposition, onRedraw, retry, reposition, redraw } = renderFail();
    fireEvent.click(retry);
    fireEvent.click(reposition);
    fireEvent.click(redraw);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onReposition).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
    fireEvent.pointerDown(redraw);
    advance(1600);
    fireEvent.pointerUp(redraw);
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(redraw.getAttribute("data-mode")).toBe("fallback");
  });

  it("the recovery action reads Gambar lagi, never Gambar ulang", () => {
    forceInputMode("camera");
    const { redraw } = renderFail();
    expect(redraw.textContent).toContain("Gambar lagi");
    expect(screen.queryByText(/Gambar ulang/)).toBeNull();
  });

  it("a thumbs-up on the fail screen picks no action (the thumb only confirms where a ring is shown)", () => {
    forceInputMode("camera");
    const { onRetry, onReposition, onRedraw } = renderFail();
    act(() => setPose("thumb-up"));
    advance(3000);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onReposition).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
  });

  it("a hand shape that is no count (a fist, an open palm) fires nothing", () => {
    forceInputMode("camera");
    const { onRetry, onReposition, onRedraw } = renderFail();
    hold("fist", 2600);
    hold("open-palm", 2600);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onReposition).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
  });
});

describe("StageHeader: Gambar lagi is a plain click target; hand toggles are gone", () => {
  const decision = { type: "accept" as const, finalLabel: "papan", sourceRank: 1 as const };

  // No dwell here: the stage already runs its own hand reader, and a dwell button would start a second one
  // (tests/components/nui-no-second-reader.test.tsx). The click is the route on this header.
  it("a click on Gambar lagi fires it once, in camera mode too", () => {
    forceInputMode("camera");
    const onDrawAgain = vi.fn();
    render(<StageHeader characterName="Thinman" decision={decision} onDrawAgain={onDrawAgain} />);
    fireEvent.click(screen.getByTestId("btn-draw-again"));
    expect(onDrawAgain).toHaveBeenCalledTimes(1);
  });

  it("a mouse click on Gambar lagi still fires at once in fallback", () => {
    forceInputMode("fallback");
    const onDrawAgain = vi.fn();
    render(<StageHeader characterName="Thinman" decision={decision} onDrawAgain={onDrawAgain} />);
    fireEvent.click(screen.getByTestId("btn-draw-again"));
    expect(onDrawAgain).toHaveBeenCalledTimes(1);
  });

  it.each(["camera", "fallback"] as const)("offers no hand or camera toggle in %s mode", (mode) => {
    forceInputMode(mode);
    render(<StageHeader characterName="Thinman" decision={decision} onDrawAgain={vi.fn()} />);
    expect(screen.queryByTestId("btn-hand-control")).toBeNull();
    expect(screen.queryByText(/Pakai keyboard|Kontrol tangan|Nyalakan kamera/)).toBeNull();
  });
});

describe("SuccessPopup: Lanjut keeps its thumb confirm, and the mouse can still hold it", () => {
  it("in fallback, holding the Lanjut control for 1 s continues once", () => {
    forceInputMode("fallback");
    const onContinue = vi.fn();
    render(<SuccessPopup onContinue={onContinue} />);
    advance(600);
    const lanjut = screen.getByTestId("btn-continue");
    fireEvent.pointerDown(lanjut);
    advance(1100);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
