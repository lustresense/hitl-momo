import { describe, expect, it, vi } from "vitest";
import {
  CHROME_SELECTOR,
  DIST_CENTER_WEIGHT,
  distanceToRect,
  isChrome,
  nearestItem,
  pickHoverTarget,
  rectContains,
  rectVisible,
  type Rect,
} from "@/src/nui/core";

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

describe("geometry", () => {
  describe("distanceToRect", () => {
    const box = rect(100, 100, 200, 200);

    it("returns 0 at the exact center", () => {
      expect(distanceToRect(box, 150, 150)).toBe(0);
    });

    it("returns 0.001 * center distance for points inside the rect", () => {
      expect(distanceToRect(box, 180, 190)).toBeCloseTo(Math.hypot(30, 40) * DIST_CENTER_WEIGHT, 10);
    });

    it("combines edge distance and 0.001 * center distance outside the rect", () => {
      // Point (230, 150): edge dx=30, dy=0; center dx=80, dy=0.
      expect(distanceToRect(box, 230, 150)).toBeCloseTo(30 + 80 * DIST_CENTER_WEIGHT, 10);
      // Diagonal corner (230, 240): edge hypot(30,40)=50; center hypot(80,90).
      expect(distanceToRect(box, 230, 240)).toBeCloseTo(50 + Math.hypot(80, 90) * DIST_CENTER_WEIGHT, 10);
    });

    it("breaks equal edge distance ties in favor of the closer center", () => {
      const small = rect(100, 100, 120, 120); // center (110, 110)
      const wide = rect(100, 100, 200, 120); // center (150, 110)
      // Point (105, 110) is inside both (edge dist = 0), closer to small's center.
      expect(distanceToRect(small, 105, 110)).toBeLessThan(distanceToRect(wide, 105, 110));
    });
  });

  describe("nearestItem", () => {
    it("returns null for an empty list", () => {
      expect(nearestItem([], 50, 50)).toBeNull();
    });

    it("returns the nearest item by edge + 0.001 * center distance", () => {
      const items: readonly (readonly [string, Rect])[] = [
        ["left", rect(0, 0, 100, 100)],
        ["right", rect(200, 0, 300, 100)],
      ];
      expect(nearestItem(items, 90, 50)).toBe("left");
      expect(nearestItem(items, 180, 50)).toBe("right");
    });

    it("resolves exact ties in favor of the earlier item", () => {
      const items: readonly (readonly [string, Rect])[] = [
        ["first", rect(0, 0, 100, 100)],
        ["second", rect(200, 0, 300, 100)],
      ];
      // Midpoint x=150 is equidistant from both boxes and both centers.
      expect(nearestItem(items, 150, 50)).toBe("first");
    });
  });

  describe("rectContains", () => {
    const box = rect(10, 20, 110, 120);

    it("includes interior points and all four borders", () => {
      expect(rectContains(box, 50, 70)).toBe(true);
      expect(rectContains(box, 10, 20)).toBe(true);
      expect(rectContains(box, 110, 120)).toBe(true);
      expect(rectContains(box, 10, 120)).toBe(true);
      expect(rectContains(box, 110, 20)).toBe(true);
    });

    it("excludes points just outside any edge and expands bounds when pad > 0", () => {
      expect(rectContains(box, 9.99, 70)).toBe(false);
      expect(rectContains(box, 110.01, 70)).toBe(false);
      expect(rectContains(box, 50, 19.99)).toBe(false);
      expect(rectContains(box, 50, 120.01)).toBe(false);
      expect(rectContains(box, 134, 70, 24)).toBe(true);
      expect(rectContains(box, 134.01, 70, 24)).toBe(false);
      expect(rectContains(box, -14, -4, 24)).toBe(true);
    });
  });

  describe("pickHoverTarget (sticky hover 24px)", () => {
    const pair: readonly (readonly [string, Rect])[] = [
      ["left", rect(100, 100, 164, 164)],
      ["right", rect(188, 100, 252, 164)],
    ];

    it("keeps previously lit target inside 24px pad even past midpoint, switches on direct hit or past pad", () => {
      // Past midpoint (176) toward right, still within left + 24px (<= 188) and outside right (< 188) -> sticks to left
      expect(pickHoverTarget(pair, 182, 132, "left", 24)).toBe("left");
      // Direct hit on right's edge/interior switches immediately to right
      expect(pickHoverTarget(pair, 188, 132, "left", 24)).toBe("right");
      // Moving back past midpoint inside right + 24px (>= 164) and outside left (> 164) -> sticks to right
      expect(pickHoverTarget(pair, 170, 132, "right", 24)).toBe("right");
      // Outside 24px pad vertically -> falls back to nearestItem
      expect(pickHoverTarget(pair, 182, 220, "left", 24)).toBe("right");
      // Disabled when pad = 0
      expect(pickHoverTarget(pair, 182, 132, "left", 0)).toBe("right");
    });
  });

  describe("pickHoverTarget (camera-zone partitioning for 2-3 choices)", () => {
    const vp = { w: 1200, h: 720 };

    it("partitions 2 vertically stacked choices across full viewport height with hysteresis", () => {
      // Unsorted order to prove sorting by vertical center (cy).
      // Band size = 720 / 2 = 360; hysteresis margin = max(24, 720 * 0.06) = 43.2.
      const stacked: readonly (readonly [string, Rect])[] = [
        ["gambar", rect(900, 300, 1080, 350)], // cy = 325
        ["lempar", rect(900, 180, 1080, 230)], // cy = 205
      ];

      // Far left of both buttons: top half picks lempar, bottom half picks gambar.
      expect(pickHoverTarget(stacked, 100, 200, null, 24, vp)).toBe("lempar");
      expect(pickHoverTarget(stacked, 100, 500, null, 24, vp)).toBe("gambar");

      // Hysteresis across band boundary y=360: prev="lempar" stays lit up to 360 + 43.2 = 403.2
      expect(pickHoverTarget(stacked, 100, 395, "lempar", 24, vp)).toBe("lempar");
      // Past hysteresis (> 403.2) switches cleanly to gambar
      expect(pickHoverTarget(stacked, 100, 410, "lempar", 24, vp)).toBe("gambar");

      // Reverse hysteresis: prev="gambar" stays lit up to 360 - 43.2 = 316.8
      expect(pickHoverTarget(stacked, 100, 325, "gambar", 24, vp)).toBe("gambar");
      expect(pickHoverTarget(stacked, 100, 310, "gambar", 24, vp)).toBe("lempar");
    });

    it("partitions 3 horizontally arranged choices across full viewport width with hysteresis", () => {
      // Band size = 1200 / 3 = 400 ([0..400], [400..800], [800..1200]); margin = max(24, 1200 * 0.06) = 72.
      const row: readonly (readonly [string, Rect])[] = [
        ["right", rect(820, 400, 960, 460)],
        ["left", rect(240, 400, 380, 460)],
        ["mid", rect(530, 400, 670, 460)],
      ];

      // Pointer far above buttons (y = 120) partitions cleanly into 3 equal horizontal zones.
      expect(pickHoverTarget(row, 150, 120, null, 24, vp)).toBe("left");
      expect(pickHoverTarget(row, 600, 120, null, 24, vp)).toBe("mid");
      expect(pickHoverTarget(row, 1080, 120, null, 24, vp)).toBe("right");

      // Hysteresis around mid [400..800] +/- 72 => [328..872]
      expect(pickHoverTarget(row, 340, 120, "mid", 24, vp)).toBe("mid");
      expect(pickHoverTarget(row, 860, 120, "mid", 24, vp)).toBe("mid");
      expect(pickHoverTarget(row, 320, 120, "mid", 24, vp)).toBe("left");
      expect(pickHoverTarget(row, 880, 120, "mid", 24, vp)).toBe("right");
    });

    it("prioritizes direct rect hit over viewport zone band and keeps prev on overlap", () => {
      // "gambar" sits physically at y=300..350 (which falls in band 0 [0..360]), yet direct hit must select "gambar".
      const stacked: readonly (readonly [string, Rect])[] = [
        ["lempar", rect(900, 180, 1080, 230)],
        ["gambar", rect(900, 300, 1080, 350)],
      ];
      expect(pickHoverTarget(stacked, 950, 325, "lempar", 24, vp)).toBe("gambar");

      // Overlapping rects: direct hit keeps prev if prev also contains (x, y).
      const overlap: readonly (readonly [string, Rect])[] = [
        ["a", rect(100, 100, 220, 220)],
        ["b", rect(180, 100, 300, 220)],
      ];
      expect(pickHoverTarget(overlap, 200, 160, "b", 24, vp)).toBe("b");
    });
  });

  describe("rectVisible", () => {
    it("returns true only for non-null rects with positive width and height", () => {
      expect(rectVisible(rect(0, 0, 10, 10))).toBe(true);
      expect(rectVisible(null)).toBe(false);
      expect(rectVisible(rect(10, 10, 10, 50))).toBe(false);
      expect(rectVisible(rect(10, 10, 50, 10))).toBe(false);
      expect(rectVisible(rect(50, 50, 10, 10))).toBe(false);
    });
  });

  describe("isChrome", () => {
    it("returns false for null, undefined, primitives, and non-matching objects", () => {
      expect(isChrome(null)).toBe(false);
      expect(isChrome(undefined)).toBe(false);
      expect(isChrome("button")).toBe(false);
      expect(isChrome(42)).toBe(false);
      expect(isChrome({})).toBe(false);
      expect(isChrome({ closest: () => null })).toBe(false);
    });

    it("passes the sandbox CHROME_SELECTOR to closest()", () => {
      const closest = vi.fn((sel: string) => (sel === CHROME_SELECTOR ? { id: "skipbar" } : null));
      expect(isChrome({ closest })).toBe(true);
      expect(closest).toHaveBeenCalledWith(CHROME_SELECTOR);
    });

    it("falls back to parentElement.closest() for text-like nodes without closest()", () => {
      const parent = { closest: (sel: string) => (sel.includes("[data-nui-off]") ? {} : null) };
      expect(isChrome({ parentElement: parent })).toBe(true);
      expect(isChrome({ parentElement: null })).toBe(false);
    });

    it("covers all seven sandbox chrome selectors from hand.js:23", () => {
      for (const part of ["#skipbar", "#gate", "#replay", "#hand-legend", ".name-typelink", "#name-type", "[data-nui-off]"]) {
        expect(CHROME_SELECTOR.split(",")).toContain(part);
      }
    });
  });
});
