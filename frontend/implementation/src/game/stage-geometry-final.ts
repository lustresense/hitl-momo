/**
 * Bab 4 (Pembuktian) geometry, in the same source/physics mapping as stage-geometry.ts.
 * Kept in its own module because stage-geometry.ts still types its stage as 1|2|3.
 *
 * Layout (source units, 490x325): a left cliff, a spike pit under a wide gap, and a tall tower on the
 * right. The tower top is about 240 physics units above the cliff, so a single jump (about 84 units)
 * cannot reach it. Solver check (tests/game/final-level-solvability.test.ts): two objects never solve
 * it, the three-step staircase does, and each object can move 6 units in any direction.
 */
import type { Point, Rect } from './stage-geometry';

export interface FinalStageGeometry {
  stage: 4;
  sceneIndex: 4;
  source: { width: number; height: number };
  world: { width: number; height: number };
  platforms: Array<Rect & { id: string }>;
  hazards: Array<Rect & { id: string }>;
  /** Foot anchor; same 24x40 body as the other stages. */
  spawn: Point;
  goal: Rect;
  object: { w: number; h: number };
  killY: number;
}

const SOURCE = { width: 490, height: 325 } as const;
const WORLD = { width: 800, height: 450 } as const;

/**
 * Same centred slice as stage-transform.ts (SVG xMidYMid slice). Kept local only because that module
 * types its input as StageGeometry; once StageGeometry admits stage 4, call sourceToPhysics instead.
 */
function toPhysics(point: Point): Point {
  const scale = Math.max(WORLD.width / SOURCE.width, WORLD.height / SOURCE.height);
  const offsetX = (WORLD.width - SOURCE.width * scale) / 2;
  const offsetY = (WORLD.height - SOURCE.height * scale) / 2;
  return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
}

export function getFinalStageGeometry(): FinalStageGeometry {
  const scale = Math.max(WORLD.width / SOURCE.width, WORLD.height / SOURCE.height);
  const rect = (x: number, y: number, w: number, h: number): Rect => ({ ...toPhysics({ x, y }), w: w * scale, h: h * scale });
  const g: FinalStageGeometry = {
    stage: 4,
    sceneIndex: 4,
    source: { ...SOURCE },
    world: { ...WORLD },
    platforms: [
      // Left cliff: the spawn ledge. Its top is the ground the student starts on.
      { id: 'stage-4-left-cliff', ...rect(0, 198, 100, 127) },
      // Tall tower on the right: the goal sits on its top.
      { id: 'stage-4-right-tower', ...rect(385, 50, 105, 275) },
    ],
    // One danger obstacle: the spike pit under the gap. Falling in is a hit, not a fall to the bottom.
    hazards: [{ id: 'stage-4-spike-pit', ...rect(100, 282, 285, 43) }],
    spawn: toPhysics({ x: 40, y: 198 }),
    // 24x24 flag box above the tower top, as in the other stages (goal(x, footY) there).
    goal: rect(445 - 12, 50 - 24, 24, 24),
    object: { w: 80 * scale, h: 12 * scale },
    killY: toPhysics({ x: 0, y: 350 }).y,
  };
  return g;
}
