import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  LevelRibbonBookmark,
  MIN_RIBBON_W,
  RIBBON_SHADOW,
  THUMB_PILL_W,
  shelfGap,
  shelfLayout,
} from "@/src/components/level/LevelRibbonBookmark";
import { LEVELS } from "@/src/domain/levels";

/** `.bm-page` side padding (98-kit-flow.css): the shelf may use the screen minus 16 px on each side. */
const PAGE_GUTTER = 16;
const setSize = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
};

/** Width one row of `n` ribbons takes. The thumb pill under the next ribbon can be wider than its ribbon. */
function rowWidth(w: number, n: number, viewport: number): number {
  return n * (w + RIBBON_SHADOW) + shelfGap(viewport) * (n - 1) + Math.max(0, THUMB_PILL_W - w);
}

beforeEach(() => setSize(1000, 768));
afterEach(() => cleanup());

describe("shelf layout: ribbons fit the screen (pure width arithmetic)", () => {
  it("gap follows the CSS: 14 px on phones, clamp(26px, 5vw, 76px) above", () => {
    expect(shelfGap(375)).toBe(14);
    expect(shelfGap(600)).toBe(14);
    expect(shelfGap(800)).toBe(40);
    expect(shelfGap(1600)).toBe(76);
  });

  it("a wide screen keeps all four bookmarks in one row", () => {
    const d = shelfLayout(LEVELS.length, 1000, 768);
    expect(d.perRow).toBe(LEVELS.length);
    expect(rowWidth(d.w, d.perRow, 1000)).toBeLessThanOrEqual(1000 - 2 * PAGE_GUTTER);
  });

  it.each([320, 360, 375, 390, 414, 430])("a %i px phone wraps four bookmarks into two rows", (width) => {
    const d = shelfLayout(LEVELS.length, width, 700);
    expect(d.perRow).toBe(2);
    expect(Math.ceil(LEVELS.length / d.perRow)).toBe(2);
    // Two rows are kept shorter so the whole page stays near one screen tall.
    expect(d.h).toBeLessThanOrEqual(330);
  });

  it("from 320 to 1280 px every row fits the page and no ribbon is narrower than MIN_RIBBON_W", () => {
    for (let width = 320; width <= 1280; width += 4) {
      const d = shelfLayout(LEVELS.length, width, 700);
      expect(d.w, `ribbon width at ${width}px`).toBeGreaterThanOrEqual(MIN_RIBBON_W);
      expect(rowWidth(d.w, d.perRow, width), `row at ${width}px`).toBeLessThanOrEqual(width - 2 * PAGE_GUTTER);
    }
  });

  it("the old fixed 84 px minimum would have put four ribbons in one row wider than a 375 px screen", () => {
    // 4 * (84 + 7) + 3 * 14 = 406 px > 343 px: why four ribbons now wrap to two rows on a phone.
    const oneRow = 4 * (MIN_RIBBON_W + RIBBON_SHADOW) + 3 * shelfGap(375);
    expect(oneRow).toBeGreaterThan(375 - 2 * PAGE_GUTTER);
    expect(shelfLayout(LEVELS.length, 375, 700).perRow).toBe(2);
  });
});

describe("shelf layout in the rendered page", () => {
  it("on a 375 px screen the bookmark labels fit inside their ribbon", () => {
    setSize(375, 700);
    render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={() => {}} />);
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".bm-ribbon"));
    expect(cards).toHaveLength(LEVELS.length);
    for (const card of cards) {
      const ribbon = parseFloat(card.style.width);
      const name = card.querySelector<HTMLElement>(".bm-name");
      expect(name, "label").toBeTruthy();
      expect(parseFloat(name!.style.maxWidth), `label box of ${card.dataset.stage}`).toBeLessThanOrEqual(ribbon);
    }
  });
});
