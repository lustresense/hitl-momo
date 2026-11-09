/**
 * Walls and roofs must stop the player where the artwork shows them.
 *
 * Each scenario drops or walks the 24x40 body toward a drawn solid and steps the headless
 * KAPLAY model. Invariant: the body never overlaps any drawn solid of the scene (no pass-through),
 * and a walk really reaches the face (so the invariant is not satisfied by never getting there).
 */
import { describe, expect, it } from "vitest";
import { getStageGeometry, type StageGeometry } from "@/src/game/stage-geometry";
import { sourceToPhysics } from "@/src/game/stage-transform";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "@/src/game/runtime/constants";
import { StageBody, playerPenetration, polyFrom, type Input, type Poly } from "./kaplay-body-model";

type Pt = readonly [number, number];
const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const NONE: Input = { left: false, right: false, jump: false };
const RIGHT: Input = { left: false, right: true, jump: false };
const LEFT: Input = { left: true, right: false, jump: false };
/** Pixel tolerance for overlap (KAPLAY resolves exactly; a fraction of a pixel is float noise). */
const EPS = 0.5;
/** Physics px per SVG unit (800 / 490); contact distances are reported in SVG units like the drawing contract. */
const PX_PER_UNIT = 800 / 490;

/** Solids as StageArtwork draws them (source units, SVG 490x325), including planks that sit on or against a building. */
const DRAWN: Record<1 | 2 | 3, Array<{ name: string; pts: Pt[] }>> = {
  1: [
    { name: "left-cliff-grass", pts: rectPts(0, 196, 154, 15) },
    { name: "left-cliff-dirt", pts: rectPts(0, 204, 152, 220) },
    { name: "right-cliff-grass", pts: rectPts(358, 192, 132, 15) },
    { name: "right-cliff-dirt", pts: [[360, 200], [490, 200], [490, 420], [356, 420]] },
  ],
  2: [
    { name: "left-cap", pts: rectPts(40, 190, 74, 12) },
    { name: "left-wall", pts: rectPts(44, 196, 66, 129) },
    { name: "middle-cap", pts: rectPts(146, 130, 74, 10) },
    { name: "middle-wall", pts: rectPts(150, 136, 66, 189) },
    { name: "middle-tuft", pts: rectPts(170, 116, 28, 16) },
    { name: "right-cap", pts: rectPts(334, 130, 94, 10) },
    { name: "right-wall", pts: rectPts(340, 136, 82, 189) },
    { name: "right-roof", pts: [[330, 130], [378, 62], [432, 130]] },
    { name: "lower-ledge", pts: rectPts(82, 262, 68, 9) },
    { name: "upper-ledge", pts: rectPts(300, 86, 56, 9) },
    { name: "low-cap", pts: rectPts(258, 190, 52, 9) },
  ],
  3: [
    { name: "left-cliff-grass", pts: rectPts(0, 198, 130, 15) },
    { name: "left-cliff-dirt", pts: rectPts(0, 206, 128, 119) },
    { name: "right-cliff-grass", pts: rectPts(362, 160, 128, 15) },
    { name: "right-cliff-dirt", pts: [[366, 168], [490, 168], [490, 325], [368, 325]] },
    { name: "stone-block", pts: rectPts(184, 262, 66, 30) },
    { name: "upper-ledge", pts: rectPts(204, 150, 76, 9) },
    { name: "lower-ledge", pts: rectPts(304, 212, 52, 9) },
  ],
};

interface Shape { name: string; poly: Poly }

/** Sutherland-Hodgman clip of a convex polygon to y <= limit: artwork below the visible world is not seen. */
function clipBelow(points: ReadonlyArray<readonly [number, number]>, limit: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const aIn = a[1] <= limit;
    const bIn = b[1] <= limit;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (limit - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), limit] as const);
    }
  }
  return out;
}

/** Drawn solids in physics px, clipped to the visible world (the stage canvas is 450 px tall). */
function drawnShapes(g: StageGeometry, stage: 1 | 2 | 3): Shape[] {
  return DRAWN[stage].flatMap(({ name, pts }) => {
    const physical = pts.map(([x, y]) => {
      const p = sourceToPhysics({ x, y }, g);
      return [p.x, p.y] as const;
    });
    const visible = clipBelow(physical, g.world.height);
    return visible.length >= 3 ? [{ name, poly: polyFrom(visible) }] : [];
  });
}

function worstOverlap(x: number, y: number, shapes: Shape[]): { depth: number; name: string } {
  let worst = { depth: 0, name: "" };
  for (const s of shapes) {
    const depth = playerPenetration(x, y, s.poly);
    if (depth > worst.depth) worst = { depth, name: s.name };
  }
  return worst;
}

/** Physics top-left of the body when its source top-left is (sx, sy). */
function startAt(g: StageGeometry, sx: number, sy: number) {
  return sourceToPhysics({ x: sx, y: sy }, g);
}

interface Walk {
  name: string;
  stage: 1 | 2 | 3;
  start: { x: number; y: number };
  input: Input;
  steps: number;
  /**
   * The drawn face the walk must reach. `face` is its physics x; the body's near edge must reach
   * it while the body overlaps the face vertically (`top`..`bottom`). Measured only there, because
   * a body that fell past a thin plank would otherwise walk on freely below it.
   */
  contact?: { face: number; side: "right-edge" | "left-edge"; top: number; bottom: number };
}

interface WalkResult {
  initial: { depth: number; name: string };
  worst: { depth: number; name: string; step: number };
  /** Distance between the body and the drawn face when the walk stopped, in SVG units. */
  contactGap: number | null;
}

function runWalk(w: Walk): WalkResult {
  const g = getStageGeometry(w.stage);
  const shapes = drawnShapes(g, w.stage);
  const body = new StageBody(w.start, g.platforms);
  const initial = worstOverlap(body.x, body.y, shapes);
  let worst = { depth: initial.depth, name: initial.name, step: -1 };
  let reach = w.input.right ? -Infinity : Infinity;
  // Below the visible world a body can fall past a face unseen; contact is only judged on screen.
  const visibleBottom = g.world.height;
  for (let i = 0; i < w.steps; i++) {
    body.step(w.input);
    const o = worstOverlap(body.x, body.y, shapes);
    if (o.depth > worst.depth) worst = { ...o, step: i };
    const level = w.contact ? body.y < Math.min(w.contact.bottom, visibleBottom) && body.y + PLAYER_HEIGHT > w.contact.top : true;
    if (!level) continue;
    if (w.input.right) reach = Math.max(reach, body.x + PLAYER_WIDTH);
    else if (w.input.left) reach = Math.min(reach, body.x);
  }
  let contactGap: number | null = null;
  if (w.contact) {
    const gapPx = w.contact.side === "right-edge" ? reach - w.contact.face : w.contact.face - reach;
    contactGap = gapPx / PX_PER_UNIT;
  }
  return { initial, worst, contactGap };
}

/** Level 2 buildings: approach each face from open air (24 px away) at several heights. */
const stage2Walks = (): Walk[] => {
  const g = getStageGeometry(2);
  const walks: Walk[] = [];
  const face = (x: number) => sourceToPhysics({ x, y: 0 }, g).x;
  const top = (y: number) => sourceToPhysics({ x: 0, y }, g).y;
  // Left faces (walk right into them).
  for (const [name, faceX, bodyTop] of [["left building", 44, 202], ["middle building", 150, 140], ["right building", 340, 140]] as const) {
    for (const dy of [4, 30, 60]) {
      walks.push({
        name: `${name}: walk right into the side, ${dy} px below its top`,
        stage: 2,
        start: { x: face(faceX) - PLAYER_WIDTH - 24, y: top(bodyTop) + dy },
        input: RIGHT,
        steps: 120,
        contact: { face: face(faceX), side: "right-edge", top: top(bodyTop), bottom: top(325) },
      });
    }
  }
  // Right faces (walk left into them).
  for (const [name, faceX, bodyTop] of [["left building", 110, 202], ["middle building", 216, 140], ["right building", 422, 140]] as const) {
    for (const dy of [4, 30]) {
      walks.push({
        name: `${name}: walk left into the side, ${dy} px below its top`,
        stage: 2,
        start: { x: face(faceX) + 24, y: top(bodyTop) + dy },
        input: LEFT,
        steps: 120,
        contact: { face: face(faceX), side: "left-edge", top: top(bodyTop), bottom: top(325) },
      });
    }
  }
  return walks;
};

/** Source-unit edge positions of one drawn shape at height y (empty when the shape is not at that height). */
function edgeXsAt(pts: readonly Pt[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    if (y < Math.min(y1, y2) || y > Math.max(y1, y2)) continue;
    xs.push(y1 === y2 ? x1 : x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    if (y1 === y2) xs.push(x2);
  }
  return xs;
}

/** A drawn object is its shapes minus the grass/dirt suffix: "right-cliff-grass" and "right-cliff-dirt" are one cliff. */
const objectOf = (name: string) => name.replace(/-(grass|dirt)$/, "");

/**
 * Stage 1 and 3: every drawn solid object, approached from both sides at two heights. The face is
 * the outermost drawn edge of that object (its grass strip can be wider than the dirt under it).
 * Starts outside the world or inside a drawn solid are not scenarios.
 */
const solidWalks = (stage: 1 | 3): Walk[] => {
  const g = getStageGeometry(stage);
  const shapes = drawnShapes(g, stage);
  const walks: Walk[] = [];
  for (const shape of DRAWN[stage]) {
    const object = DRAWN[stage].filter((s) => objectOf(s.name) === objectOf(shape.name));
    const ys = object.flatMap((s) => s.pts.map(([, py]) => py));
    const objTop = Math.min(...ys), objBottom = Math.max(...ys);
    const minY = Math.min(...shape.pts.map(([, py]) => py)), maxY = Math.max(...shape.pts.map(([, py]) => py));
    for (const dy of [4, 30]) {
      const y = minY + dy;
      if (y > maxY - 2) continue;
      const edges = object.flatMap((s) => (y >= Math.min(...s.pts.map(([, py]) => py)) && y <= Math.max(...s.pts.map(([, py]) => py)) ? edgeXsAt(s.pts, y) : []));
      if (!edges.length) continue;
      const leftFace = sourceToPhysics({ x: Math.min(...edges), y: 0 }, g).x;
      const rightFace = sourceToPhysics({ x: Math.max(...edges), y: 0 }, g).x;
      const top = sourceToPhysics({ x: 0, y }, g).y;
      const spanTop = sourceToPhysics({ x: 0, y: objTop }, g).y;
      const spanBottom = sourceToPhysics({ x: 0, y: objBottom }, g).y;
      // A plank shorter than the body falls past its face within a few steps, so it starts 1 px away;
      // a tall solid can be approached from 24 px away while the body stays level with it.
      const thin = (maxY - minY) * PX_PER_UNIT < 40;
      const gap = thin ? 1 : 24;
      const candidates: Walk[] = [
        { name: `${shape.name}: walk right into its left face, ${dy} units below top`, stage, start: { x: leftFace - PLAYER_WIDTH - gap, y: top }, input: RIGHT, steps: 120, contact: { face: leftFace, side: "right-edge", top: spanTop, bottom: spanBottom } },
        { name: `${shape.name}: walk left into its right face, ${dy} units below top`, stage, start: { x: rightFace + gap, y: top }, input: LEFT, steps: 120, contact: { face: rightFace, side: "left-edge", top: spanTop, bottom: spanBottom } },
      ];
      for (const c of candidates) {
        const inWorld = c.start.x >= 0 && c.start.x + PLAYER_WIDTH <= g.world.width;
        const free = worstOverlap(c.start.x, c.start.y, shapes).depth <= EPS;
        if (inWorld && free) walks.push(c);
      }
    }
  }
  return walks;
};

describe("level 2 buildings stop the player from the side", () => {
  it.each(stage2Walks().map((w) => [w.name, w] as const))("%s", (_name, walk) => {
    const r = runWalk(walk);
    expect(r.initial.depth, "scenario must start in open air").toBeLessThanOrEqual(EPS);
    expect(r.worst.depth, `body enters "${r.worst.name}" at step ${r.worst.step}`).toBeLessThanOrEqual(EPS);
    expect(r.contactGap, "walk must reach the face, not just avoid it").not.toBeNull();
    expect(Math.abs(r.contactGap ?? NaN), "contact distance from the drawn face").toBeLessThanOrEqual(2);
  });

  it("a body dropped onto the middle cap lands on the cap top, not inside the drawing", () => {
    const g = getStageGeometry(2);
    const shapes = drawnShapes(g, 2);
    const capTop = sourceToPhysics({ x: 0, y: 130 }, g).y;
    const body = new StageBody(startAt(g, 152, 100), g.platforms);
    for (let i = 0; i < 150; i++) body.step(NONE);
    expect(body.y + PLAYER_HEIGHT).toBeCloseTo(capTop, 0);
    expect(worstOverlap(body.x, body.y, shapes).depth).toBeLessThanOrEqual(EPS);
  });

  it("a body dropped onto the roof apex stands at the drawn apex (y 62), not 4 units lower", () => {
    const g = getStageGeometry(2);
    const shapes = drawnShapes(g, 2);
    const apexTop = sourceToPhysics({ x: 0, y: 62 }, g).y;
    const body = new StageBody(startAt(g, 378 - PLAYER_WIDTH / 2 / 1.6327, 20), g.platforms);
    for (let i = 0; i < 150; i++) body.step(NONE);
    expect(body.y + PLAYER_HEIGHT).toBeCloseTo(apexTop, 0);
    expect(worstOverlap(body.x, body.y, shapes).depth).toBeLessThanOrEqual(EPS);
  });

  it("a walk toward the roof's left slope stops at the slope, never inside the triangle", () => {
    const g = getStageGeometry(2);
    const walk: Walk = {
      name: "roof slope",
      stage: 2,
      start: startAt(g, 300, 100),
      input: RIGHT,
      steps: 120,
    };
    const r = runWalk(walk);
    expect(r.worst.depth, `body enters "${r.worst.name}" at step ${r.worst.step}`).toBeLessThanOrEqual(EPS);
  });
});

describe("stage 1 and stage 3 solids stop the player from the side (no pass-through found)", () => {
  for (const stage of [1, 3] as const) {
    it.each(solidWalks(stage).map((w) => [w.name, w] as const))("%s", (_name, walk) => {
      const r = runWalk(walk);
      expect(r.initial.depth, "scenario must start in open air").toBeLessThanOrEqual(EPS);
      expect(r.worst.depth, `body enters "${r.worst.name}" at step ${r.worst.step}`).toBeLessThanOrEqual(EPS);
      expect(r.contactGap, "walk must reach the face, not just avoid it").not.toBeNull();
      expect(Math.abs(r.contactGap ?? NaN), "contact distance from the drawn face (SVG units)").toBeLessThanOrEqual(2);
    });
  }
});

describe("level 2 lower ledge meets the middle building (no notch narrower than the body)", () => {
  it("the ledge's right end is flush with the middle wall: a 16 px notch lets a falling body's corner push it into the wall", () => {
    const g = getStageGeometry(2);
    const ledge = g.platforms.find((p) => p.id === "stage-2-lower-ledge")!;
    const wall = g.platforms.find((p) => p.id === "stage-2-middle-body")!;
    const notch = wall.x - (ledge.x + ledge.w);
    expect(Math.abs(notch), `notch ${notch.toFixed(2)} px (body is ${PLAYER_WIDTH} px wide)`).toBeLessThanOrEqual(0.01);
  });
});

describe("level 2 buildings with jump held (a jump in mid-air is ignored, so the side still stops the body)", () => {
  it.each(stage2Walks().map((w) => [w.name, { ...w, input: { ...w.input, jump: true }, contact: undefined }] as const))("%s", (_name, walk) => {
    const r = runWalk(walk);
    expect(r.initial.depth, "scenario must start in open air").toBeLessThanOrEqual(EPS);
    expect(r.worst.depth, `body enters "${r.worst.name}" at step ${r.worst.step}`).toBeLessThanOrEqual(EPS);
  });
});
