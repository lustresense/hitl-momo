import { describe, expect, it } from "vitest";
import type { WorldCreation } from "@/src/game/creation-store";
import { generateSketchSvg } from "@/src/game/sketch-renderer";
import {
  createArtPlanCache,
  INK_PIXEL_SCALE,
  labelChipWidth,
  planCreationArt,
} from "@/src/game/runtime/creations";

/** Collision box of a stage-1 plank: 80x12 source units at the stage scale. The art must fit inside it. */
const PLANK = { w: 130.6, h: 19.6 };
const ink = {
  hasInk: true,
  aspectRatio: 2,
  strokes: [
    [
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
    ],
  ],
};

function creation(overrides: Partial<WorldCreation> = {}): WorldCreation {
  return { id: "c1", label: "papan", behavior: "solid", drawingInput: ink, x: 100, y: 300, ...PLANK, ...overrides };
}

/** The sprite source is the encodeURIComponent of the SVG markup; decode it back to check the markup. */
function svgOf(uri: string): string {
  return decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
}

/** Fill colours of the paper card the entry popup uses (solid, danger, unresolved). */
const CARD_COLOURS = ["#edd9be", "#f8d5cb", "#e5e9ec"];

describe("in-world creation art has no wrapping frame", () => {
  it.each(["solid", "danger", "unresolved"] as const)(
    "%s draws only the student's ink, with no rectangle around it",
    (behavior) => {
      const svg = generateSketchSvg(ink, { width: PLANK.w, height: PLANK.h, behavior, frame: "none" });
      expect(svg).not.toMatch(/<rect/);
      for (const colour of CARD_COLOURS) expect(svg).not.toContain(colour);
      expect(svg).toContain('stroke="#23211d"');
    },
  );

  it("the planned sprite for a solid plank is ink only", () => {
    const svg = svgOf(planCreationArt(creation()).inkUri);
    expect(svg).not.toMatch(/<rect/);
    expect(svg).toContain('class="student-strokes"');
  });

  it("a drawing-less danger object shows a dashed placeholder in its own colour, still without a frame", () => {
    const svg = svgOf(planCreationArt(creation({ behavior: "danger", drawingInput: null })).inkUri);
    expect(svg).toContain('stroke-dasharray="4 2"');
    expect(svg).toContain("#c0392b");
    expect(svg).not.toMatch(/<rect/);
  });

  it("keeps the entry-popup preview on its paper card (default frame, unchanged)", () => {
    const svg = generateSketchSvg(ink, { width: 220, height: 96, behavior: "solid", pixelScale: 3 });
    expect(svg).toMatch(/<rect/);
    expect(svg).toContain("#edd9be");
  });

  it("ink is thick enough to read on the 19.6-unit plank", () => {
    const svg = svgOf(planCreationArt(creation()).inkUri);
    const strokeWidth = Number(/stroke-width="([\d.]+)"/.exec(svg)?.[1]);
    expect(strokeWidth).toBeGreaterThanOrEqual(2.5);
    expect(strokeWidth).toBeLessThanOrEqual(3.5);
  });

  it("the sprite is rasterised at INK_PIXEL_SCALE so the renderer scales it back to the box", () => {
    const svg = svgOf(planCreationArt(creation()).inkUri);
    const w = Math.round(PLANK.w);
    const h = Math.round(PLANK.h);
    expect(svg).toContain(`width="${w * INK_PIXEL_SCALE}" height="${h * INK_PIXEL_SCALE}" viewBox="0 0 ${w} ${h}"`);
  });
});

describe("danger and unresolved objects stay visibly different without a frame", () => {
  it("danger gets a warning chip, solid does not", () => {
    expect(planCreationArt(creation({ behavior: "danger" })).label.warning).toBe(true);
    expect(planCreationArt(creation({ behavior: "solid" })).label.warning).toBe(false);
  });

  it("unresolved ink is dimmed (it has no collision); solid and danger stay fully opaque", () => {
    expect(planCreationArt(creation({ behavior: "unresolved" })).inkOpacity).toBeLessThan(1);
    expect(planCreationArt(creation({ behavior: "solid" })).inkOpacity).toBe(1);
    expect(planCreationArt(creation({ behavior: "danger" })).inkOpacity).toBe(1);
  });

  it("sizes the label pill from the word, plus room for the warning mark", () => {
    expect(labelChipWidth("papan", false)).toBe(46);
    expect(labelChipWidth("papan", true)).toBe(60);
  });

  it("carries the object's own label text into the chip", () => {
    expect(planCreationArt(creation({ label: "jembatan" })).label.text).toBe("jembatan");
  });
});

describe("art plan cache: strokes are fitted once per object", () => {
  it("returns the same plan for the same object, so re-drawing never re-fits the ink", () => {
    const cache = createArtPlanCache();
    const item = creation();
    expect(cache(item)).toBe(cache(item));
  });

  it("builds a new plan when the object's box changes", () => {
    const cache = createArtPlanCache();
    expect(cache(creation({ w: 60 }))).not.toBe(cache(creation()));
  });
});
