import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SuccessPopup } from "@/src/components/game/SuccessPopup";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));
const advance = (ms: number) => { for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); }); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  resetInputModeForTest();
  resetThumbTrackerForTest();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("SuccessPopup Lanjut (PRD 0.0.16 R8.5)", () => {
  it("is a 1 s ThumbConfirm with testId btn-continue; a thumbs-up continues once", () => {
    const onContinue = vi.fn();
    render(<SuccessPopup onContinue={onContinue} />);
    advance(600);
    const thumb = screen.getByTestId("btn-continue");
    expect(thumb.getAttribute("data-mode")).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
    act(() => simulateThumb(true));
    advance(1200);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe("SuccessPopup: the thumb is the only action, and the list opens by itself", () => {
  it("in camera mode Lanjut is a thumb ring (no mouse button), so a fingertip never needs a click", () => {
    render(<SuccessPopup onContinue={vi.fn()} />);
    advance(600);
    expect(screen.getByTestId("btn-continue").tagName).toBe("DIV");
    expect(screen.getByTestId("btn-continue").getAttribute("data-mode")).toBe("camera");
  });

  it("when nobody confirms, the finished chat opens the level list once by itself", () => {
    const onContinue = vi.fn();
    render(<SuccessPopup onContinue={onContinue} />);
    advance(12000);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
