// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { R83Bubble } from "@/src/features/shared/R83Bubble";
import { BUBBLE_GAP, type BubbleLayout, type Rect } from "@/src/features/shared/bubble-placement";

describe("R83Bubble content-box width & extra slot placement", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
    vi.restoreAllMocks();
  });

  it("reads borderPad = offsetWidth - bw0 for content-box bubbles without narrowing text area", () => {
    // Simulates box-sizing: content-box where padding (18*2) + border (3*2) = 42px outside CSS width.
    const PAD = 42;
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      const w = parseFloat(this.style.width);
      return Number.isFinite(w) ? Math.round(w + PAD) : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(88);

    const momoRight: Rect = { left: 1080, top: 440, right: 1220, bottom: 600, width: 140, height: 160 };
    const layouts: BubbleLayout[] = [];

    render(
      <R83Bubble
        text="Ini daftar levelnya. Dekatkan tangan ke pita **Level 1**, lalu cubit dan tarik ke bawah."
        anchor="strip"
        getMomoRect={() => momoRight}
        onLayout={(l) => layouts.push(l)}
      />,
    );

    const bubble = screen.getByRole("status");
    const last = layouts[layouts.length - 1];
    expect(last).toBeDefined();
    // Horizontal bubble width at 1280px = clamp(1280*0.24, 300, 420) = 307.2 (no 42px theft).
    expect(last?.width).toBeCloseTo(307.2, 1);
    expect(last?.side).toBe("right");
    // Left position respects Momo's left edge minus renderedWidth (307.2 + 42) and BUBBLE_GAP (30).
    expect(last?.left).toBe(Math.round(momoRight.left - Math.round(307.2 + PAD) - BUBBLE_GAP));
    expect(bubble.style.width).toBe("307.2px");
  });

  it("renders .has-extra and .r83-bubble__extra children safely when extra content is provided", () => {
    const momoLeft: Rect = { left: 120, top: 250, right: 276, bottom: 480, width: 156, height: 230 };
    render(
      <R83Bubble
        text="Ini tebakanku."
        anchor="side"
        getMomoRect={() => momoLeft}
        extra={
          <div className="momo-guess" data-testid="bubble-extra-guess">
            <div className="t3">
              <div className="t3-row">Tangga</div>
            </div>
          </div>
        }
      />,
    );

    const bubble = screen.getByRole("status");
    expect(bubble.className).toContain("has-extra");
    expect(bubble.className).toContain("is-visible");
    expect(bubble.style.pointerEvents).toBe("auto");
    expect(screen.getByTestId("bubble-extra-guess")).toBeDefined();
    expect(bubble.querySelector(".r83-bubble__extra")).not.toBeNull();
  });
});
