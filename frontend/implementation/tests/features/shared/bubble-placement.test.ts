import { describe, expect, it } from "vitest";
import {
  ANCHOR_NAMES,
  BUBBLE_GAP,
  BUBBLE_REPLACE_MS,
  RING_AVOID_PAD,
  RING_DEFAULT_H,
  RING_DEFAULT_W,
  RING_GAP,
  RING_MARGIN,
  anchorPoint,
  createPlacementThrottle,
  momoBase,
  momoPath,
  parseBubbleSegments,
  placeBubble,
  placeRing,
  placementSignature,
  rectFromBounds,
  samplePath,
  type PathPoint,
  type Rect,
} from "@/src/features/shared/bubble-placement";

const vp = { w: 1280, h: 720 };
const base = momoBase(vp);
const rect = (cx: number, cy: number, w: number, h: number): Rect => ({
  left: cx - w / 2,
  top: cy - h / 2,
  right: cx + w / 2,
  bottom: cy + h / 2,
  width: w,
  height: h,
});

const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
  !(
    a.right + pad <= b.left ||
    a.left >= b.right + pad ||
    a.bottom + pad <= b.top ||
    a.top >= b.bottom + pad
  );

describe("momoBase", () => {
  it("follows viewport sizing rule (momo.js:108-111)", () => {
    expect(base.w).toBe(Math.round(Math.min(1280, 720 * 1.78) * 0.122));
    expect(base.h).toBe(Math.round((base.w * 2058) / 1389));
    expect(momoBase({ w: 300, h: 300 }).w).toBe(150);
    expect(momoBase({ w: 4000, h: 3000 }).w).toBe(260);
  });
});

describe("anchorPoint (all 6 anchors from ui.js + end.js)", () => {
  it("exports the exact 6 anchor names", () => {
    expect(ANCHOR_NAMES).toEqual(["corner", "side", "mid", "bottom", "strip", "ending"]);
  });

  it("corner sits top-left at scale 0.62", () => {
    const a = anchorPoint("corner", vp, base);
    expect(a.s).toBe(0.62);
    expect(a.x).toBeCloseTo(Math.min(Math.max(1280 * 0.026, 24), 50) + (base.w * 0.62) / 2);
    expect(a.y).toBeCloseTo(Math.min(Math.max(720 * 0.03, 22), 40) + (base.h * 0.62) / 2);
  });

  it("side sits at 16% width, 50% height, scale 1", () => {
    expect(anchorPoint("side", vp, base)).toEqual({ x: 204.8, y: 360, s: 1 });
  });

  it("mid centres the Momo+bubble group at y=0.46", () => {
    const a = anchorPoint("mid", vp, base);
    expect(a.y).toBeCloseTo(720 * 0.46);
    expect(a.s).toBeGreaterThanOrEqual(0.55);
    expect(a.s).toBeLessThanOrEqual(1);
    const mw = base.w * a.s;
    const bw = 384 + 42;
    const total = mw + 30 + bw;
    expect(a.x).toBeCloseTo((1280 - total) / 2 + mw / 2);

    const narrow = anchorPoint("mid", { w: 420, h: 720 }, base);
    expect(narrow.x).toBeGreaterThanOrEqual((base.w * narrow.s) / 2 + 12);
  });

  it("bottom is horizontally centred at bottom with scale 0.5..1", () => {
    const a = anchorPoint("bottom", vp, base);
    expect(a.x).toBe(640);
    expect(a.s).toBeGreaterThanOrEqual(0.5);
    expect(a.s).toBeLessThanOrEqual(1);
    expect(a.y).toBeCloseTo(720 - (base.h * a.s) / 2 - Math.min(Math.max(720 * 0.035, 20), 40));
  });

  it("strip sits bottom-right at scale 0.55", () => {
    const a = anchorPoint("strip", vp, base);
    expect(a.s).toBe(0.55);
    expect(a.x).toBeCloseTo(1280 - 25.6 - (base.w * 0.55) / 2);
    expect(a.y).toBeCloseTo(720 - (base.h * 0.55) / 2 - 21.6);
  });

  it("ending follows the hero rect and clamps inside viewport", () => {
    const a = anchorPoint("ending", vp, base, { right: 500, top: 300, height: 200 });
    expect(a.s).toBeGreaterThanOrEqual(0.5);
    expect(a.s).toBeLessThanOrEqual(0.85);
    expect(a.x).toBeCloseTo(500 + (base.w * a.s) / 2 + 22);
    expect(a.y).toBeCloseTo(288);

    const far = anchorPoint("ending", vp, base, { right: 5000, top: -900, height: 10 });
    expect(far.x).toBeCloseTo(1280 - (base.w * far.s) / 2 - 12);
    expect(far.y).toBeCloseTo((base.h * far.s) / 2 + 12);

    const fallback = anchorPoint("ending", vp, base);
    expect(fallback.x).toBeCloseTo(1280 * 0.4 + (base.w * fallback.s) / 2 + 22);
  });
});

describe("samplePath / momoPath", () => {
  const pts: PathPoint[] = [
    { t: 0, x: 0, y: 0, s: 1, r: 0 },
    { t: 0.5, x: 50, y: -26, s: 1.5, r: 4 },
    { t: 1, x: 100, y: 0, s: 2, r: 0 },
  ];

  it("hits keyframes at t=0, 0.5, 1 and interpolates smoothly in between", () => {
    expect(samplePath(pts, 0)).toEqual({ x: 0, y: 0, s: 1, r: 0 });
    expect(samplePath(pts, 0.5).x).toBeCloseTo(50);
    expect(samplePath(pts, 0.5).y).toBeCloseTo(-26);
    expect(samplePath(pts, 0.5).r).toBeCloseTo(4);
    expect(samplePath(pts, 1)).toEqual({ x: 100, y: 0, s: 2, r: 0 });

    const q1 = samplePath(pts, 0.25);
    expect(q1.x).toBeGreaterThan(0);
    expect(q1.x).toBeLessThan(50);
    expect(q1.y).toBeLessThan(0);

    // Clamps out-of-range t cleanly
    expect(samplePath(pts, -0.5)).toEqual({ x: 0, y: 0, s: 1, r: 0 });
    expect(samplePath(pts, 1.5)).toEqual({ x: 100, y: 0, s: 2, r: 0 });
  });

  it("handles degenerate 0- or 1-point paths safely", () => {
    expect(samplePath([], 0.5)).toEqual({ x: 0, y: 0, s: 1, r: 0 });
    expect(samplePath([{ t: 0, x: 12, y: 34, s: 0.8, r: 5 }], 0.5)).toEqual({
      x: 12,
      y: 34,
      s: 0.8,
      r: 5,
    });
  });

  it("momoPath returns null when within arrival threshold, else 3-point lifted arc", () => {
    expect(momoPath({ x: 10, y: 10, s: 1, r: 0 }, { x: 11, y: 11, s: 1.01 })).toBeNull();
    const p = momoPath({ x: 0, y: 100, s: 1, r: 0 }, { x: 200, y: 300, s: 0.5 }, 6);
    expect(p).toHaveLength(3);
    expect(p?.[0]).toEqual({ t: 0, x: 0, y: 100, s: 1, r: 0 });
    expect(p?.[1]).toEqual({ t: 0.5, x: 100, y: 74, s: 0.75, r: 6 });
    expect(p?.[2]).toEqual({ t: 1, x: 200, y: 300, s: 0.5, r: 0 });
  });
});

describe("placeBubble", () => {
  it("places bubble to right of Momo (tail left) with 30px gap and narrowed width", () => {
    const mr = rect(300, 360, 150, 220);
    const b = placeBubble({ anchor: "side", momo: mr, vp, extra: 30, height: 120 });
    expect(b.side).toBe("left");
    expect(b.left).toBe(Math.round(mr.right + BUBBLE_GAP));
    expect(b.width).toBe(
      Math.max(150, Math.min(Math.max(300, Math.min(420, 1280 * 0.24)), 1256) - (BUBBLE_GAP - 14)),
    );
    expect(b.top).toBe(Math.round(mr.top + mr.height * 0.1));
    expect(b.tailY).toBeGreaterThanOrEqual(34);
  });

  it("forces left tail for mid and ending anchors even on right half", () => {
    const mr = rect(1100, 300, 150, 220);
    expect(placeBubble({ anchor: "mid", momo: mr, vp, extra: 30, height: 100 }).side).toBe("left");
    expect(placeBubble({ anchor: "ending", momo: mr, vp, extra: 30, height: 100 }).side).toBe(
      "left",
    );
  });

  it("shrinks width to >= 150 when remaining room is tight", () => {
    const mr = rect(1100, 300, 150, 220);
    const b = placeBubble({ anchor: "mid", momo: mr, vp, extra: 30, height: 100 });
    expect(b.width).toBe(Math.max(150, 1280 - (mr.right + BUBBLE_GAP) - 10 - 30));
  });

  it("places bubble to left of Momo (tail right) on right half and honours renderedWidth", () => {
    const mr = rect(1100, 400, 150, 220);
    const b = placeBubble({ anchor: "strip", momo: mr, vp, extra: 30, height: 100 });
    expect(b.side).toBe("right");
    expect(b.left + b.width + 30).toBeLessThanOrEqual(mr.left - BUBBLE_GAP + 1);

    // Simulates CSS !important width on .has-extra (ui.js:113)
    const wide = placeBubble({
      anchor: "strip",
      momo: mr,
      vp,
      extra: 30,
      height: 180,
      renderedWidth: 460,
    });
    expect(wide.left).toBe(Math.round(mr.left - 460 - BUBBLE_GAP));
  });

  it("places bubble above Momo (side=up) for bottom anchor with clamped tailX", () => {
    const mr = rect(640, 600, 150, 220);
    const b = placeBubble({ anchor: "bottom", momo: mr, vp, extra: 30, height: 150 });
    expect(b.side).toBe("up");
    expect(b.width).toBe(Math.min(Math.max(360, Math.min(600, 1280 * 0.42)), 1256));
    expect(b.top).toBe(Math.round(mr.top - 150 - 10));
    expect(b.tailX).toBeGreaterThanOrEqual(36);
  });

  it("supports explicit down side override (bubble below Momo, tail at top)", () => {
    const mr = rect(640, 120, 140, 180);
    const b = placeBubble({
      anchor: "corner",
      momo: mr,
      vp,
      extra: 0,
      height: 100,
      sideOverride: "down",
    });
    expect(b.side).toBe("down");
    expect(b.top).toBe(Math.round(mr.bottom + 10));
    expect(b.tailX).toBeGreaterThanOrEqual(36);
  });

  it("clamps top to leave 96px bottom chrome clearance", () => {
    const b = placeBubble({
      anchor: "side",
      momo: rect(300, 700, 150, 220),
      vp,
      extra: 30,
      height: 200,
    });
    expect(b.top).toBe(720 - 200 - 96);
  });
});

describe("placeRing (ui.js:168-185)", () => {
  it("places ring directly under bubble by default", () => {
    const bubble = rectFromBounds(220, 120, 520, 220);
    const pos = placeRing({ anchor: bubble, vp });
    expect(pos.left).toBe(Math.round(370 - RING_DEFAULT_W / 2));
    expect(pos.top).toBe(Math.round(220 + RING_GAP));
  });

  it("moves ring beside bubble when bubble is above Momo (anchorIsBubbleUp)", () => {
    const bubble = rectFromBounds(360, 260, 920, 380);
    const pos = placeRing({ anchor: bubble, vp, anchorIsBubbleUp: true });
    expect(pos.left).toBe(Math.round(920 + RING_GAP));
    expect(pos.top).toBe(Math.round(320 - RING_DEFAULT_H / 2));
  });

  it("prefers right then left in side mode (beside drawing/sticker/object)", () => {
    const obj = rectFromBounds(500, 280, 700, 440);
    const rightPos = placeRing({ anchor: obj, vp, side: "side" });
    expect(rightPos.left).toBe(Math.round(700 + RING_GAP));

    // When right edge is near viewport border, flips to left
    const edgeObj = rectFromBounds(1120, 280, 1260, 440);
    const leftPos = placeRing({ anchor: edgeObj, vp, side: "side" });
    expect(leftPos.left).toBe(Math.round(1120 - RING_GAP - RING_DEFAULT_W));
  });

  it("avoids bottom-left camera PIP (#cam-pip)", () => {
    const camPip = rectFromBounds(20, 560, 190, 696);
    const anchor = rectFromBounds(40, 440, 180, 540);
    const pos = placeRing({ anchor, vp, side: "under", avoid: [camPip] });
    const ringRect = rectFromBounds(
      pos.left,
      pos.top,
      pos.left + RING_DEFAULT_W,
      pos.top + RING_DEFAULT_H,
    );
    expect(overlaps(ringRect, camPip, RING_AVOID_PAD)).toBe(false);
    expect(ringRect.left).toBeGreaterThanOrEqual(RING_MARGIN);
    expect(ringRect.top).toBeGreaterThanOrEqual(RING_MARGIN);
  });

  it("avoids hint chip (#su-hint) and Momo's bubble when pinned beside an object", () => {
    const obj = rectFromBounds(540, 470, 740, 620);
    const hintChip = rectFromBounds(420, 632, 860, 668);
    const bubble = rectFromBounds(748, 430, 1080, 590);
    const pos = placeRing({ anchor: obj, vp, side: "side", avoid: [hintChip, bubble] });
    const ringRect = rectFromBounds(
      pos.left,
      pos.top,
      pos.left + RING_DEFAULT_W,
      pos.top + RING_DEFAULT_H,
    );
    expect(overlaps(ringRect, hintChip, RING_AVOID_PAD)).toBe(false);
    expect(overlaps(ringRect, bubble, RING_AVOID_PAD)).toBe(false);
  });

  it("slides vertically along anchor when all 4 cardinal spots are blocked", () => {
    const obj = rectFromBounds(520, 260, 720, 420);
    const blockRight = rectFromBounds(728, 280, 840, 400);
    const blockLeft = rectFromBounds(400, 280, 512, 400);
    const blockBottom = rectFromBounds(560, 428, 680, 560);
    const blockTop = rectFromBounds(560, 130, 680, 252);

    const pos = placeRing({
      anchor: obj,
      vp,
      side: "side",
      avoid: [blockRight, blockLeft, blockBottom, blockTop],
    });
    const ringRect = rectFromBounds(
      pos.left,
      pos.top,
      pos.left + RING_DEFAULT_W,
      pos.top + RING_DEFAULT_H,
    );
    for (const blocker of [blockRight, blockLeft, blockBottom, blockTop]) {
      expect(overlaps(ringRect, blocker, RING_AVOID_PAD)).toBe(false);
    }
    expect(ringRect.left).toBeGreaterThanOrEqual(RING_MARGIN);
    expect(ringRect.right).toBeLessThanOrEqual(vp.w - RING_MARGIN);
    expect(ringRect.top).toBeGreaterThanOrEqual(RING_MARGIN);
    expect(ringRect.bottom).toBeLessThanOrEqual(vp.h - RING_MARGIN);
  });

  it("clamps inside viewport margins when screen is completely crowded", () => {
    const tinyVp = { w: 120, h: 140 };
    const anchor = rectFromBounds(10, 10, 110, 130);
    const pos = placeRing({ anchor, vp: tinyVp, ring: { w: 96, h: 112 } });
    expect(pos.left).toBeGreaterThanOrEqual(RING_MARGIN);
    expect(pos.left + 96).toBeLessThanOrEqual(tinyVp.w - RING_MARGIN);
    expect(pos.top).toBeGreaterThanOrEqual(RING_MARGIN);
    expect(pos.top + 112).toBeLessThanOrEqual(tinyVp.h - RING_MARGIN);
  });

  it("ignores null, undefined, and zero-width avoid entries", () => {
    const bubble = rectFromBounds(220, 120, 520, 220);
    const zeroRect = rectFromBounds(320, 232, 320, 344);
    const pos = placeRing({ anchor: bubble, vp, avoid: [null, undefined, zeroRect] });
    expect(pos.left).toBe(Math.round(370 - RING_DEFAULT_W / 2));
    expect(pos.top).toBe(Math.round(220 + RING_GAP));
  });
});

describe("createPlacementThrottle & placementSignature", () => {
  it("allows first, blocks same signature < 200ms, allows on change or timeout", () => {
    expect(BUBBLE_REPLACE_MS).toBe(200);
    const t = createPlacementThrottle();
    expect(t(0, "a")).toBe(true);
    expect(t(100, "a")).toBe(false);
    expect(t(150, "b")).toBe(true);
    expect(t(349, "b")).toBe(false);
    expect(t(350, "b")).toBe(true);
  });

  it("builds stable signatures that react to pose, anchor, text, extra, and viewport", () => {
    const baseSig = placementSignature({
      pose: { x: 100.14, y: 200.04, s: 0.62, r: 0 },
      anchor: "corner",
      visible: true,
      textLength: 12,
      hasExtra: false,
      vp,
    });
    const sameRounded = placementSignature({
      pose: { x: 100.12, y: 200.01, s: 0.6204, r: 0.001 },
      anchor: "corner",
      visible: true,
      textLength: 12,
      hasExtra: false,
      vp,
    });
    const moved = placementSignature({
      pose: { x: 101.0, y: 200.0, s: 0.62, r: 0 },
      anchor: "corner",
      visible: true,
      textLength: 12,
      hasExtra: false,
      vp,
    });
    expect(baseSig).toBe(sameRounded);
    expect(moved).not.toBe(baseSig);
  });
});

describe("parseBubbleSegments", () => {
  it("splits paired **bold** markers into safe text/bold segments", () => {
    expect(parseBubbleSegments("Halo, **Bima**! Ini **3 kartu**.")).toEqual([
      { text: "Halo, ", bold: false },
      { text: "Bima", bold: true },
      { text: "! Ini ", bold: false },
      { text: "3 kartu", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("keeps plain text, HTML-like text, and unclosed ** literal without throwing", () => {
    expect(parseBubbleSegments("Halo <script>alert(1)</script>")).toEqual([
      { text: "Halo <script>alert(1)</script>", bold: false },
    ]);
    expect(parseBubbleSegments("Halo **belum tutup")).toEqual([
      { text: "Halo **belum tutup", bold: false },
    ]);
    expect(parseBubbleSegments("")).toEqual([]);
  });
});
