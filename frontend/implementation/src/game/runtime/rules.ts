/**
 * Pure geometry rules of the integrated stage: overlap, legal placement and goal contact.
 */
import type { WorldCreation } from "../creation-store";
import type { Rect, StageGeometry } from "../stage-geometry";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "./constants";

export function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - 1e-7 &&
    a.x + a.w > b.x + 1e-7 &&
    a.y < b.y + b.h - 1e-7 &&
    a.y + a.h > b.y + 1e-7
  );
}

/** Thinman's body as he stands at the start (spawn is the foot anchor; the body is 24 x 40). */
export function spawnBodyOf(g: StageGeometry): Rect {
  return { x: g.spawn.x - PLAYER_WIDTH / 2, y: g.spawn.y - PLAYER_HEIGHT, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/**
 * A placement is legal inside the world, off every platform, off every other committed solid, and never on top of
 * Thinman's start or the flag (a box there would pin him in or hide the goal).
 */
export function integratedPlacementAllowed(
  rect: Rect,
  g: StageGeometry,
  items: WorldCreation[],
  ignoreId?: string,
): boolean {
  return (
    [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) &&
    rect.w > 0 &&
    rect.h > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= g.world.width &&
    rect.y + rect.h <= g.world.height &&
    !g.platforms.some((platform) => rectanglesOverlap(rect, platform)) &&
    !rectanglesOverlap(rect, spawnBodyOf(g)) &&
    !rectanglesOverlap(rect, g.goal) &&
    !items.some(
      (item) => item.id !== ignoreId && item.behavior === "solid" && rectanglesOverlap(rect, item),
    )
  );
}

/** The goal needs real XY overlap; horizontal progress alone never counts. */
export function integratedGoalReached(player: Rect, goal: Rect): boolean {
  return rectanglesOverlap(player, goal);
}
