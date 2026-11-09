import { sourceToPhysics } from './stage-transform';
import { getFinalStageGeometry } from './stage-geometry-final';

export interface Point { x: number; y: number }
/** Top-left axis-aligned rectangle. */
export interface Rect extends Point { w: number; h: number }
export interface StageGeometry {
  stage: 1 | 2 | 3 | 4;
  sceneIndex: 1 | 2 | 3 | 4;
  source: { width: number; height: number };
  world: { width: number; height: number };
  platforms: Array<Rect & { id: string }>;
  hazards: Array<Rect & { id: string }>;
  /** Foot anchor; existing 24x40 physics body stays unchanged. */
  spawn: Point;
  goal: Rect;
  object: { w: number; h: number };
  killY: number;
}
export const STAGE_SOURCE = { width: 490, height: 325 } as const;
export const STAGE_WORLD = { width: 800, height: 450 } as const;

/**
 * StageArtwork scenes 1/2/3. All outputs except source use physics units.
 * Solid caps and walls; cliffs and building walls extend to SVG bottom. Goals: 24x24 above flag feet.
 * Objects: fixed 80x12 SVG-unit platforms, narrower than level 1's gap.
 * Level 2 requested 254..314 cap includes visible plank 258..310 + 4-unit lip.
 * Level 2 buildings are solid cap + wall blocks; the gable (330,130)-(378,62)-(432,130) is
 * solid too, so the drawing and the collider agree at every height.
 * Decorative ladder, paper and crown are not extra platforms/hazards.
 * PRD 0.0.16 R8.1: L3 stone block lowered (top 238 -> 262) so one drawn object is not enough at WALK_SPEED.
 * Runtime owns object stacking, balancing and existing player body dimensions.
 */
export function getStageGeometry(stage: 1 | 2 | 3 | 4): StageGeometry {
  if (stage === 4) return getFinalStageGeometry();
  const g: StageGeometry = {
    stage, sceneIndex: stage, source: { ...STAGE_SOURCE }, world: { ...STAGE_WORLD },
    platforms: [], hazards: [], spawn: { x: 0, y: 0 },
    goal: { x: 0, y: 0, w: 0, h: 0 }, object: { w: 0, h: 0 }, killY: 0,
  };
  const scale = Math.max(g.world.width / g.source.width, g.world.height / g.source.height);
  const rect = (x: number, y: number, w: number, h: number): Rect => ({ ...sourceToPhysics({ x, y }, g), w: w * scale, h: h * scale });
  const platform = (id: string, x: number, y: number, w: number, h: number) => g.platforms.push({ id: `stage-${stage}-${id}`, ...rect(x, y, w, h) });
  const goal = (x: number, footY: number) => rect(x - 12, footY - 24, 24, 24);
  switch (stage) {
    case 1:
      platform('left-cliff', 0, 196, 154, 129);
      platform('right-cliff', 358, 192, 132, 133);
      g.spawn = sourceToPhysics({ x: 42, y: 196 }, g);
      g.goal = goal(458, 192);
      break;
    case 2:
      // Each building is solid from its roof to the SVG base, so a body cannot walk through a side:
      // cap (roof slab) + body (wall) per building, and the gable is a solid triangle. The gable is
      // 2-unit bands sized at their lower edge: each band reaches the outer slope edge, overhanging
      // the drawing by at most 1.6 units (inside the 2-unit tolerance), with no gaps.
      platform('start-cap', 40, 190, 74, 12);
      platform('left-body', 44, 202, 66, 123);
      platform('middle-cap', 146, 130, 74, 10);
      platform('middle-body', 150, 140, 66, 185);
      platform('grass-block', 170, 116, 28, 16);
      platform('low-cap', 254, 190, 60, 9);
      platform('roof-cap', 334, 130, 94, 10);
      platform('right-body', 340, 140, 82, 185);
      for (let top = 62; top < 130; top += 2) {
        const bottom = top + 2;
        const left = 330 + (130 - bottom) * 48 / 68;
        const right = 432 - (130 - bottom) * 54 / 68;
        platform(`roof-${top}`, left, top, right - left, 2);
      }
      // Lower ledge runs up to the middle wall (x 150). A 16-unit notch was narrower than the 24 px body:
      // a body falling past the wall face caught the ledge corner and the minimum-push went into the wall.
      platform('lower-ledge', 82, 262, 68, 9);
      platform('upper-ledge', 300, 86, 56, 9);
      g.spawn = sourceToPhysics({ x: 77, y: 190 }, g);
      g.goal = goal(379, 66);
      break;
    case 3:
      platform('left-cliff', 0, 198, 130, 127);
      platform('right-cliff', 362, 160, 128, 165);
      platform('stone-block', 184, 262, 66, 30);
      platform('upper-ledge', 204, 150, 76, 9);
      platform('lower-ledge', 304, 212, 52, 9);
      g.hazards.push({ id: 'stage-3-spike-floor', ...rect(130, 278, 238, 47) });
      g.spawn = sourceToPhysics({ x: 48, y: 198 }, g);
      g.goal = goal(436, 160);
      break;
  }
  g.object = { w: 80 * scale, h: 12 * scale };
  g.killY = sourceToPhysics({ x: 0, y: 350 }, g).y;
  return g;
}
