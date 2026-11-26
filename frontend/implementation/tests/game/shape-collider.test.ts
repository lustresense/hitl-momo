import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DrawingInput } from "@/src/domain/types";
import type { WorldCreation } from "@/src/game/creation-store";
import { integratedPlacementAllowed } from "@/src/game/kaplay-runtime";
import { createCreationRenderer } from "@/src/game/runtime/creation-renderer";
import { hazardZone } from "@/src/game/runtime/footprint";
import {
  rasterizeCreationShape,
  shapeRectsForCreation,
  worldShapeRects,
} from "@/src/game/runtime/shape-collider";
import { getStageGeometry, type Rect } from "@/src/game/stage-geometry";
import { buildWorld, runPlan, solve } from "./level-reachability";

const plans = JSON.parse(readFileSync(new URL("../../e2e/lib/level-plans.json", import.meta.url), "utf8"));

const rectCoversPoint = (rects: readonly Rect[], x: number, y: number): boolean =>
  rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

function closedBoxForSize(w: number, h: number): DrawingInput {
  const scale = Math.max(w, h);
  const ox = (scale - w) / 2 / scale;
  const oy = (scale - h) / 2 / scale;
  const nx = (px: number) => ox + px / scale;
  const ny = (py: number) => oy + py / scale;
  return {
    hasInk: true,
    aspectRatio: w / h,
    strokes: [
      [
        { x: nx(0), y: ny(0) },
        { x: nx(w), y: ny(0) },
        { x: nx(w), y: ny(h) },
        { x: nx(0), y: ny(h) },
        { x: nx(0), y: ny(0) },
      ],
    ],
  };
}

const solidBlockDrawing: DrawingInput = closedBoxForSize(80, 50);

const uShapeDrawing: DrawingInput = {
  hasInk: true,
  aspectRatio: 1.5,
  // Open U-shape: interior center top is open to border flood-fill so center-top stays empty.
  strokes: [
    [
      { x: 0.05, y: 0.05 },
      { x: 0.05, y: 0.95 },
      { x: 0.95, y: 0.95 },
      { x: 0.95, y: 0.05 },
    ],
  ],
};

const lShapeDrawing: DrawingInput = {
  hasInk: true,
  aspectRatio: 1.2,
  // L-shape occupying left edge and bottom edge: upper-right corner is empty air.
  strokes: [
    [
      { x: 0.05, y: 0.05 },
      { x: 0.05, y: 0.92 },
      { x: 0.95, y: 0.92 },
    ],
  ],
};

const baseCreation = (over: Partial<WorldCreation> = {}): WorldCreation => ({
  id: "shape-c1",
  label: "tangga",
  behavior: "solid",
  drawingInput: solidBlockDrawing,
  x: 100,
  y: 200,
  w: 80,
  h: 50,
  ...over,
});

describe("rasterizeCreationShape (O-6 / shape.js port)", () => {
  it("falls back to full rotated box when strokes are empty or null", () => {
    const empty = rasterizeCreationShape(baseCreation({ drawingInput: null }));
    expect(empty.rects).toEqual([{ x: 0, y: 0, w: 80, h: 50 }]);

    const rot90 = rasterizeCreationShape(baseCreation({ drawingInput: null, angle: 90 }));
    expect(rot90.rects).toEqual([{ x: 0, y: 0, w: 50, h: 80 }]);
  });

  it("fills the interior of a closed stroke loop (closed square is solid inside)", () => {
    const res = rasterizeCreationShape(baseCreation());
    expect(res.rects.length).toBeGreaterThanOrEqual(1);
    expect(rectCoversPoint(res.rects, 40, 25)).toBe(true);
    expect(rectCoversPoint(res.rects, 20, 12)).toBe(true);
  });

  it("leaves open interior air empty for an open U-shape and empty corners for an L-shape", () => {
    const uRes = rasterizeCreationShape(baseCreation({ drawingInput: uShapeDrawing }));
    expect(rectCoversPoint(uRes.rects, 40, 10)).toBe(false);
    expect(rectCoversPoint(uRes.rects, 40, 47.5)).toBe(true);

    const lRes = rasterizeCreationShape(baseCreation({ drawingInput: lShapeDrawing }));
    // Upper-right quadrant is open air; lower-left is ink.
    expect(rectCoversPoint(lRes.rects, 65, 10)).toBe(false);
    expect(rectCoversPoint(lRes.rects, 19, 46)).toBe(true);
  });

  it("rotates the rasterised collider when angle is 90 / 180 / 270 and stays inside rotated box", () => {
    const base90 = baseCreation({ drawingInput: lShapeDrawing, w: 80, h: 50, angle: 90 });
    const res90 = rasterizeCreationShape(base90);
    for (const r of res90.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(50 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(80 + 1e-6);
    }
    // After 90deg clockwise rotation: old left vertical leg rotates to horizontal stroke centered at y~17.25.
    expect(rectCoversPoint(res90.rects, 30, 17.25)).toBe(true);
    expect(rectCoversPoint(res90.rects, 40, 65)).toBe(false);
  });

  it("preserves legacy single box and hazardZone when useShape is false", () => {
    expect(shapeRectsForCreation(baseCreation({ behavior: "solid", drawingInput: lShapeDrawing }), { useShape: false })).toEqual([
      { x: 0, y: 0, w: 80, h: 50 },
    ]);
    expect(shapeRectsForCreation(baseCreation({ behavior: "danger", drawingInput: lShapeDrawing }), { useShape: false })).toEqual([
      hazardZone(80, 50),
    ]);
  });

  it("offsets worldShapeRects by creation (x, y)", () => {
    const c = baseCreation({ x: 300, y: 120, drawingInput: uShapeDrawing });
    const world = worldShapeRects(c, { useShape: true });
    expect(world.every((r) => r.x >= 300 && r.y >= 120)).toBe(true);
  });
});

describe("createCreationRenderer with O-6 shapeCollider toggle", () => {
  function fakeKaplay() {
    const added: Array<{ children: unknown[]; comps: unknown[] }> = [];
    const makeObj = (comps: unknown[]) => {
      const children: unknown[] = [];
      const obj = {
        children,
        comps,
        exists: () => true,
        use(c: unknown) {
          comps.push(c);
        },
        add(childComps: unknown[]) {
          const c = makeObj(childComps);
          children.push(c);
          return c;
        },
      };
      return obj;
    };
    const k = {
      add: (comps: unknown[]) => {
        const obj = makeObj(comps);
        added.push(obj);
        return obj;
      },
      pos: (x: number, y: number) => ({ id: "pos", pos: { x, y } }),
      rect: () => ({ id: "rect" }),
      color: () => ({}),
      outline: () => ({}),
      rgb: () => ({}),
      text: () => ({}),
      loadSprite: () => Promise.resolve(),
      sprite: () => ({}),
      anchor: () => ({}),
      rotate: () => ({}),
      scale: () => ({}),
      opacity: () => ({}),
      area: (opt?: unknown) => ({ id: "area", opt }),
      body: (opt?: unknown) => ({ id: "body", opt }),
      vec2: (x = 0, y = 0) => ({ x, y }),
      Rect: class {
        constructor(
          readonly pos: unknown,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    };
    return { k: k as unknown as Parameters<typeof createCreationRenderer>[0], added };
  }

  it("uses single AABB on root when shapeCollider=false (legacy default)", () => {
    const { k, added } = fakeKaplay();
    const draw = createCreationRenderer(k, "sans", () => false, { shapeCollider: false });
    draw(baseCreation({ drawingInput: lShapeDrawing }), true);
    const root = added[0]!;
    const childColliders = root.children.filter((c) =>
      (c as { comps: Array<{ id?: string }> }).comps.some((comp) => comp.id === "area"),
    );
    expect(childColliders).toHaveLength(0);
    expect(root.comps.some((c) => (c as { id?: string }).id === "area")).toBe(true);
    expect(root.comps.some((c) => (c as { id?: string }).id === "body")).toBe(true);
  });

  it("attaches stroke-derived shape sub-colliders when shapeCollider=true for solid & danger", () => {
    const { k, added } = fakeKaplay();
    const draw = createCreationRenderer(k, "sans", () => false, { shapeCollider: true });
    draw(baseCreation({ drawingInput: lShapeDrawing, behavior: "danger", label: "kaktus" }), true);
    const root = added[0]!;
    const hazardChildren = root.children.filter((c) =>
      (c as { comps: unknown[] }).comps.includes("hazard"),
    );
    expect(hazardChildren.length).toBeGreaterThan(1);
    const meta = (hazardChildren[0] as { comps: Array<{ creationBehavior?: string; label?: string }> }).comps.find(
      (c) => typeof c === "object" && c !== null && "creationBehavior" in c,
    );
    expect(meta).toMatchObject({ creationBehavior: "danger", label: "kaktus" });
  });
});

describe("level solvability with O-6 shape colliders (L1-L3)", () => {
  for (const stage of [1, 2, 3] as const) {
    it(`L${stage}: closed drawn objects solve the level via worldShapeRects and 1 object stays unsolvable`, () => {
      const g = getStageGeometry(stage);
      const cycleDefs = plans[String(stage)].cycles as Array<{ x: number; y: number; w?: number; h?: number; label: string }>;
      const fallback = plans.objectSize as { w: number; h: number };
      const allRects: Array<Rect & { behavior: "solid" }> = [];
      for (const [idx, c] of cycleDefs.entries()) {
        const w = c.w ?? fallback.w;
        const h = c.h ?? fallback.h;
        expect(integratedPlacementAllowed({ x: c.x, y: c.y, w, h }, g, [])).toBe(true);
        const creation = baseCreation({
          id: `sol-${stage}-${idx}`,
          label: c.label,
          behavior: "solid",
          drawingInput: closedBoxForSize(w, h),
          x: c.x,
          y: c.y,
          w,
          h,
        });
        for (const r of worldShapeRects(creation, { useShape: true })) {
          allRects.push({ ...r, behavior: "solid" });
        }
      }
      const world = buildWorld(stage, allRects);
      if (stage === 3) {
        // L3 cycle[0] macro launchX=126 clips the 2px rounded corner at inset; reachability solver proves exact solvability.
        expect(solve(world).solvable).toBe(true);
      } else {
        const res = runPlan(world, plans[String(stage)].steps);
        expect(res.outcome, res.log.join("\n")).toBe("goal");
      }

      // Invariant: removing one drawn object leaves 1 object -> still not solvable
      const firstW = cycleDefs[0]!.w ?? fallback.w;
      const firstH = cycleDefs[0]!.h ?? fallback.h;
      const firstOnly = worldShapeRects(
        baseCreation({
          drawingInput: closedBoxForSize(firstW, firstH),
          x: cycleDefs[0]!.x,
          y: cycleDefs[0]!.y,
          w: firstW,
          h: firstH,
        }),
        { useShape: true },
      ).map((r) => ({ ...r, behavior: "solid" as const }));
      expect(solve(buildWorld(stage, firstOnly)).solvable).toBe(false);
    });
  }
});
