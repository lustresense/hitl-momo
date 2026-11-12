import { describe, expect, it, vi } from "vitest";
import { OVERLAY_COLORS, drawHands, type OverlayContext } from "@/src/components/nui-lab/hand-overlay";
import { handAt } from "../camera/hand-points";

interface Recorded {
  cleared: boolean;
  dots: { x: number; y: number; color: string }[];
  texts: string[];
}

/** Records what the overlay paints; the canvas itself is not needed to check colours and positions. */
function recordingContext(): { ctx: OverlayContext; rec: Recorded } {
  const rec: Recorded = { cleared: false, dots: [], texts: [] };
  let fillStyle = "";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    clearRect: vi.fn(() => {
      rec.cleared = true;
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn((x: number, y: number) => {
      rec.dots.push({ x, y, color: fillStyle });
    }),
    fillRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      rec.texts.push(text);
    }),
    measureText: vi.fn(() => ({ width: 80 })),
  } as unknown as OverlayContext;
  return { ctx, rec };
}

describe("drawHands", () => {
  it("clears first, then draws the primary hand orange and the others grey", () => {
    const { ctx, rec } = recordingContext();
    const primary = handAt(0.5, 0.5, 0.3);
    const other = handAt(0.2, 0.5, 0.3);
    drawHands(ctx, [other, primary], 1, 400, 300);
    expect(rec.cleared).toBe(true);
    const primaryDots = rec.dots.filter((d) => d.color === OVERLAY_COLORS.primary);
    const otherDots = rec.dots.filter((d) => d.color === OVERLAY_COLORS.other);
    expect(primaryDots).toHaveLength(21);
    expect(otherDots).toHaveLength(21);
  });

  it("mirrors x so the drawing lines up with the mirrored preview", () => {
    const { ctx, rec } = recordingContext();
    const hand = handAt(0.2, 0.5, 0.3); // wrist (index 0) at x = 0.2 in camera space
    drawHands(ctx, [hand], 0, 400, 300);
    const wrist = rec.dots[0]!;
    expect(wrist.x).toBeCloseTo(0.8 * 400, 6);
    expect(wrist.y).toBeCloseTo(hand[0]!.y * 300, 6);
  });

  it("marks a far hand as ignored, and leaves a near non-primary hand unlabelled", () => {
    const { ctx, rec } = recordingContext();
    drawHands(ctx, [handAt(0.1, 0.2, 0.05), handAt(0.5, 0.5, 0.3)], 1, 400, 300);
    expect(rec.texts).toEqual(["diabaikan (jauh)"]);
  });

  it("draws nothing for a hand with fewer than 21 points", () => {
    const { ctx, rec } = recordingContext();
    drawHands(ctx, [[{ x: 0.5, y: 0.5 }]], null, 400, 300);
    expect(rec.dots).toHaveLength(0);
  });

  it("keeps the label text readable: white on a dark plate", () => {
    expect(OVERLAY_COLORS.labelText).toBe("#ffffff");
    expect(OVERLAY_COLORS.labelBackground).toBe("#0f172a");
  });
});
