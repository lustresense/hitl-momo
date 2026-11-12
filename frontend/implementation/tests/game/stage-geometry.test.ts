import { describe, expect, it } from 'vitest';
import { getStageGeometry, type Point, type Rect, type StageGeometry } from '@/src/game/stage-geometry';

const scale = 800 / 490;
const offsetY = (450 - 325 * scale) / 2;
const sourceRect = (r: Rect) => ({ x: r.x / scale, y: (r.y - offsetY) / scale, w: r.w / scale, h: r.h / scale });
const expectSourceRect = (r: Rect, expected: Rect) => {
  const actual = sourceRect(r);
  for (const key of ['x', 'y', 'w', 'h'] as const) expect(actual[key]).toBeCloseTo(expected[key]);
};

describe('stage geometry contract', () => {
  it.each([1, 2, 3] as const)('maps stage %i into the sliced physics world with a foot spawn', (stage) => {
    const g: StageGeometry = getStageGeometry(stage);
    const foot: Point = g.spawn;
    expect(g.stage).toBe(stage);
    expect(g.sceneIndex).toBe(stage);
    expect(g.source).toEqual({ width: 490, height: 325 });
    expect(g.world).toEqual({ width: 800, height: 450 });
    expect(g.platforms.some(p => foot.x >= p.x && foot.x <= p.x + p.w && Math.abs(foot.y - p.y) < 0.001)).toBe(true);
    expectSourceRect({ x: 0, y: offsetY, ...g.object }, { x: 0, y: 0, w: 80, h: 12 });
    expect(g.killY).toBeGreaterThan(g.world.height);
    expect(g.killY).toBeCloseTo(350 * scale + offsetY);
    expect(new Set([...g.platforms, ...g.hazards].map(p => p.id)).size).toBe(g.platforms.length + g.hazards.length);
  });
  it('keeps level 1 cliffs separate, with a flag-height goal', () => {
    const g = getStageGeometry(1);
    expect(g.platforms).toHaveLength(2);
    expectSourceRect(g.platforms[0]!, { x: 0, y: 196, w: 154, h: 129 });
    expectSourceRect(g.platforms[1]!, { x: 358, y: 192, w: 132, h: 133 });
    expectSourceRect(g.goal, { x: 446, y: 168, w: 24, h: 24 });
    expect(g.hazards).toEqual([]);
    expect(g.object.w).toBeLessThan(g.platforms[1]!.x - g.platforms[0]!.w);
  });
  it('keeps level 2 caps, grass tuft, ledges and the summit flag on the artwork', () => {
    const g = getStageGeometry(2);
    const byId: Record<string, Rect> = {
      'start-cap': { x: 40, y: 190, w: 74, h: 12 }, 'middle-cap': { x: 146, y: 130, w: 74, h: 10 },
      'low-cap': { x: 254, y: 190, w: 60, h: 9 }, 'roof-cap': { x: 334, y: 130, w: 94, h: 10 },
      'grass-block': { x: 170, y: 116, w: 28, h: 16 }, 'lower-ledge': { x: 82, y: 262, w: 68, h: 9 },
      'upper-ledge': { x: 300, y: 86, w: 56, h: 9 },
    };
    for (const [id, r] of Object.entries(byId)) {
      const platform = g.platforms.find((p) => p.id === `stage-2-${id}`);
      expect(platform, id).toBeDefined();
      expectSourceRect(platform!, r);
    }
    expectSourceRect(g.goal, { x: 367, y: 42, w: 24, h: 24 });
    expect(g.hazards).toEqual([]);
  });
  it('uses level 3 visible intermediate supports and static spike floor', () => {
    const g = getStageGeometry(3);
    const expected = [
      { x: 0, y: 198, w: 130, h: 127 }, { x: 362, y: 160, w: 128, h: 165 },
      { x: 184, y: 262, w: 66, h: 30 }, { x: 204, y: 150, w: 76, h: 9 },
      { x: 304, y: 212, w: 52, h: 9 },
    ];
    expect(g.platforms).toHaveLength(expected.length);
    expected.forEach((r, i) => expectSourceRect(g.platforms[i]!, r));
    expect(g.hazards).toHaveLength(1);
    expectSourceRect(g.hazards[0]!, { x: 130, y: 278, w: 238, h: 47 });
    expectSourceRect(g.goal, { x: 424, y: 136, w: 24, h: 24 });
  });
});

/**
 * Level 2 buildings as StageArtwork scene 2 draws them (source units). Each building is a set of
 * drawn rects; the right one also has a gable (solid triangle) from its peak at y 62 to the cap at y 130.
 */
const BUILDINGS = {
  left: { rects: [[40, 190, 74, 12], [44, 196, 66, 129]] as const, owns: (id: string) => id === 'stage-2-start-cap' || id === 'stage-2-left-body' },
  middle: { rects: [[146, 130, 74, 10], [150, 136, 66, 189], [170, 116, 28, 16]] as const, owns: (id: string) => ['stage-2-middle-cap', 'stage-2-middle-body', 'stage-2-grass-block'].includes(id) },
  right: { rects: [[334, 130, 94, 10], [340, 136, 82, 189]] as const, gable: true, owns: (id: string) => id === 'stage-2-right-body' || id.startsWith('stage-2-roof-') },
} as const;
const PEAK_Y = 62;
const CAP_Y = 130;

/** Horizontal drawn spans of a building at source height y. */
function drawnSpans(b: { rects: readonly (readonly [number, number, number, number])[]; gable?: boolean }, y: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const [x, ry, w, h] of b.rects) if (y >= ry && y < ry + h) spans.push([x, x + w]);
  if (b.gable && y >= PEAK_Y && y < CAP_Y) spans.push([330 + (CAP_Y - y) * 48 / 68, 432 - (CAP_Y - y) * 54 / 68]);
  return mergeSpans(spans);
}

function mergeSpans(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

describe('level 2 solid buildings (collision matches the drawing)', () => {
  it.each(['left', 'middle', 'right'] as const)('%s building: solid from its roof to the SVG base, edges within 2 SVG units of the drawing', (name) => {
    const g = getStageGeometry(2);
    const building = BUILDINGS[name];
    const own = g.platforms.filter((p) => building.owns(p.id)).map(sourceRect);
    const gaps: string[] = [];
    const widthErrors: string[] = [];
    // Rows every quarter unit, sampled at mid-row so shared edges are not tested exactly.
    for (let row = PEAK_Y; row < 325; row += 0.25) {
      const y = row + 0.125;
      const drawn = drawnSpans(building, y);
      const physical = mergeSpans(own.filter((r) => y >= r.y && y < r.y + r.h).map((r) => [r.x, r.x + r.w] as [number, number]));
      if (drawn.length === 0) {
        if (physical.length) widthErrors.push(`y=${y}: collider where the drawing has none`);
        continue;
      }
      for (const [a, b] of drawn) {
        for (let x = a + 0.125; x < b; x += 0.25) {
          if (!physical.some(([pa, pb]) => x >= pa - 1e-6 && x <= pb + 1e-6)) gaps.push(`y=${y} x=${x.toFixed(2)}`);
        }
      }
      if (physical.length === 0) {
        gaps.push(`y=${y}: no collider at all`);
        continue;
      }
      const [dl] = drawn[0]!;
      const dr = drawn.at(-1)![1];
      const [pl] = physical[0]!;
      const pr = physical.at(-1)![1];
      if (Math.abs(pl - dl) > 2 || Math.abs(pr - dr) > 2) widthErrors.push(`y=${y}: drawn ${dl.toFixed(1)}..${dr.toFixed(1)} vs collider ${pl.toFixed(1)}..${pr.toFixed(1)}`);
    }
    expect(gaps.slice(0, 5), 'no passable gap inside the drawing').toEqual([]);
    expect(widthErrors.slice(0, 5), 'edges match the drawing').toEqual([]);
  });

  it('the roof collider reaches the drawn peak (y 62), not an inscribed step 4 units lower', () => {
    const g = getStageGeometry(2);
    const roofTop = Math.min(...g.platforms.filter((p) => BUILDINGS.right.owns(p.id)).map((p) => sourceRect(p).y));
    expect(roofTop).toBeCloseTo(PEAK_Y, 1);
  });
});
