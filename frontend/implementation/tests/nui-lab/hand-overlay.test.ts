import { describe, expect, it, vi } from "vitest";
import type { FaceBox } from "@/src/camera/face-anchor";
import {
  OVERLAY_COLORS,
  drawFaceArea,
  drawHands,
  type OverlayContext,
} from "@/src/components/nui-lab/hand-overlay";
import { handAt } from "../camera/hand-points";

interface Recorded {
  cleared: boolean;
  dots: { x: number; y: number; color: string }[];
  texts: string[];
  /** strokeRect calls as [x, y, w, h] in canvas px, with the colour in force. */
  rects: { box: [number, number, number, number]; color: string }[];
}

/** Player's face in camera space: centre x 0.5, top 0.2, 0.2 wide, 0.25 high. */
const face: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };

/** Records what the overlay paints; the canvas itself is not needed to check colours and positions. */
function recordingContext(): { ctx: OverlayContext; rec: Recorded } {
  const rec: Recorded = { cleared: false, dots: [], texts: [], rects: [] };
  let fillStyle = "";
  let strokeStyle = "";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
    },
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
    strokeRect: vi.fn((x: number, y: number, w: number, h: number) => {
      rec.rects.push({ box: [x, y, w, h], color: strokeStyle });
    }),
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

describe("drawHands: face labels", () => {
  it("labels a face misread and a hand beside the player, and leaves the player's hand unlabelled", () => {
    const { ctx, rec } = recordingContext();
    const faceMisread = handAt(0.5, 0.33, 0.2);
    const beside = handAt(0.05, 0.1, 0.3);
    const player = handAt(0.5, 0.05, 0.3);
    drawHands(ctx, [faceMisread, beside, player], 2, 400, 300, face);
    expect(rec.texts).toEqual(["wajah, bukan tangan", "di luar area pemain"]);
  });

  it("without a face, does not label a hand beside the player", () => {
    const { ctx, rec } = recordingContext();
    drawHands(ctx, [handAt(0.05, 0.1, 0.3), handAt(0.5, 0.05, 0.3)], 1, 400, 300, null);
    expect(rec.texts).toEqual([]);
  });
});

describe("drawFaceArea", () => {
  it("outlines the face and the player region in the mirrored preview, without clearing the hands", () => {
    const { ctx, rec } = recordingContext();
    drawFaceArea(ctx, face, 400, 300);
    expect(rec.cleared).toBe(false);
    expect(rec.rects).toHaveLength(2);
    // Face: x 0.4..0.6 mirrored to 0.4..0.6 (symmetric), so left = 160 px, width = 80 px.
    const [faceBox, region] = rec.rects.map((r) => r.box);
    expect(faceBox![0]).toBeCloseTo((1 - 0.6) * 400, 6);
    expect(faceBox![2]).toBeCloseTo(0.2 * 400, 6);
    // Region: x from 0.18 to 0.82 (mirrored 0.18..0.82), top 0.2 - 0.25 = -0.05 of the frame height.
    expect(region![0]).toBeCloseTo((1 - 0.82) * 400, 6);
    expect(region![2]).toBeCloseTo(0.64 * 400, 6);
    expect(region![1]).toBeCloseTo(-0.05 * 300, 6);
  });

  it("uses a colour that is not the primary-hand orange", () => {
    const { ctx, rec } = recordingContext();
    drawFaceArea(ctx, face, 400, 300);
    for (const r of rec.rects) expect(r.color).not.toBe(OVERLAY_COLORS.primary);
  });
});

describe("drawFaceArea: other faces", () => {
  it("outlines every other face in grey, mirrored like the player's face, after the player's two boxes", () => {
    const { ctx, rec } = recordingContext();
    const other: FaceBox = { x: 0.1, y: 0.3, w: 0.1, h: 0.1 };
    drawFaceArea(ctx, face, 400, 300, [other]);
    expect(rec.rects).toHaveLength(3);
    const [box, color] = [rec.rects[2]!.box, rec.rects[2]!.color];
    // x 0.1..0.2 mirrored to 0.8..0.9 of the width; y 0.3 and h 0.1 of the height.
    expect(box[0]).toBeCloseTo(0.8 * 400, 6);
    expect(box[1]).toBeCloseTo(0.3 * 300, 6);
    expect(box[2]).toBeCloseTo(0.1 * 400, 6);
    expect(box[3]).toBeCloseTo(0.1 * 300, 6);
    expect(color).toBe(OVERLAY_COLORS.other);
  });

  it("still outlines other faces when the player's face is not identified", () => {
    const { ctx, rec } = recordingContext();
    drawFaceArea(ctx, null, 400, 300, [{ x: 0.1, y: 0.3, w: 0.1, h: 0.1 }]);
    expect(rec.rects).toHaveLength(1);
    expect(rec.rects[0]!.color).toBe(OVERLAY_COLORS.other);
  });
});
