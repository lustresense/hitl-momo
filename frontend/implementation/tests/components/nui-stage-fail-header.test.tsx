import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailOverlay } from "@/src/components/game/FailOverlay";
import { StageHeader } from "@/src/components/game/StageHeader";
import { SuccessPopup } from "@/src/components/game/SuccessPopup";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx, placeBox, resetHandGesture, setHandGesture, type Box } from "./gesture-stub";

vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./gesture-stub");
  return { ...actual, useHandGesture: stub.useHandGestureStub };
});
vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

// Three action buttons side by side, as on the fail overlay. Each fingertip spot is inside exactly one of them.
const ROW: Record<"retry" | "reposition" | "redraw", Box> = {
  retry: { left: 40, top: 500, width: 220, height: 60 },
  reposition: { left: 300, top: 500, width: 220, height: 60 },
  redraw: { left: 560, top: 500, width: 220, height: 60 },
};
const at = (box: Box) => cursorAtPx(box.left + box.width / 2, box.top + box.height / 2);
const OUTSIDE = cursorAtPx(10, 10);

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => {
    vi.advanceTimersByTime(16);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetHandGesture();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderFail() {
  const handlers = { onRetry: vi.fn(), onReposition: vi.fn(), onRedraw: vi.fn() };
  render(<FailOverlay failReason="Papan terlalu pendek." {...handlers} />);
  // Momo types her lines first; the action buttons appear after that.
  advance(4000);
  const retry = screen.getByTestId("btn-retry-cycle");
  const reposition = screen.getByTestId("btn-reposition");
  const redraw = screen.getByTestId("btn-redraw-gameplay");
  placeBox(retry, ROW.retry);
  placeBox(reposition, ROW.reposition);
  placeBox(redraw, ROW.redraw);
  return { ...handlers, retry, reposition, redraw };
}

describe("FailOverlay: the three actions are NUI buttons", () => {
  it("in camera mode each action shows the dwell ring", () => {
    forceInputMode("camera");
    const { retry, reposition, redraw } = renderFail();
    expect(retry.getAttribute("data-mode")).toBe("camera");
    expect(reposition.getAttribute("data-mode")).toBe("camera");
    expect(redraw.getAttribute("data-mode")).toBe("camera");
  });

  it("a fingertip resting on Coba lagi fires it once after 1.2 s, and no other action", () => {
    forceInputMode("camera");
    const { onRetry, onReposition, onRedraw } = renderFail();
    advance(50);
    act(() => setHandGesture({ handVisible: true, cursor: at(ROW.retry) }));
    advance(1100);
    expect(onRetry).not.toHaveBeenCalled();
    advance(300);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReposition).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
  });

  it("only the action under the fingertip fills; the neighbours stay empty", () => {
    forceInputMode("camera");
    const { reposition, redraw, retry } = renderFail();
    advance(50);
    act(() => setHandGesture({ handVisible: true, cursor: at(ROW.reposition) }));
    advance(600);
    expect(Number(reposition.getAttribute("data-progress"))).toBeGreaterThan(0);
    expect(retry.getAttribute("data-progress")).toBe("0");
    expect(redraw.getAttribute("data-progress")).toBe("0");
  });

  it("with the mouse (fallback) a plain click fires the action at once, with no ring", () => {
    forceInputMode("fallback");
    const { onRetry, onReposition, onRedraw, retry, reposition, redraw } = renderFail();
    act(() => setHandGesture({ handVisible: true, cursor: at(ROW.redraw) }));
    advance(1500);
    expect(onRedraw).not.toHaveBeenCalled();
    expect(redraw.getAttribute("data-mode")).toBe("fallback");
    fireEvent.click(retry);
    fireEvent.click(reposition);
    fireEvent.click(redraw);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReposition).toHaveBeenCalledTimes(1);
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it("a fingertip outside every action fires nothing", () => {
    forceInputMode("camera");
    const { onReposition } = renderFail();
    advance(50);
    act(() => setHandGesture({ handVisible: true, cursor: OUTSIDE }));
    advance(200);
    expect(onReposition).not.toHaveBeenCalled();
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
