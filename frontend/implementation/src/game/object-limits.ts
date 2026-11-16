/**
 * How big the student's object may be in each level, in STAGE SOURCE units (the art grid, 490 x 325).
 * The collider of an object is its drawing's own box: the drawing is scaled (keeping its proportions) until it
 * fills the largest box of its level, so what the student sees is what Thinman stands on or bumps into.
 *
 *   maxW x maxH  the largest box a drawing can fill (a wide scribble hits maxW, a tall one maxH);
 *   minW x minH  the smallest box: a dot or a straight line still gets a thin plank to stand on.
 *
 * One entry per level, tuned with that level's solvability tests (one object alone must never solve a level,
 * and the level must stay solvable with the minDrawings objects a normal drawing gives).
 */
export interface ObjectLimitsSource {
  maxW: number;
  maxH: number;
  minW: number;
  minH: number;
}

export const OBJECT_LIMITS_SOURCE: Record<1 | 2 | 3, ObjectLimitsSource> = {
  1: { maxW: 60, maxH: 36, minW: 24, minH: 6 },
  // L2: narrower than the others. Thinman's spawn column (x 113.7-137.7) may not be covered below y 230, and the
  // middle building starts at x 238.4, so the first step beside him has only 100.7 world px; maxW 50 (81.6 world) leaves 19.
  2: { maxW: 50, maxH: 36, minW: 24, minH: 6 },
  3: { maxW: 80, maxH: 36, minW: 24, minH: 6 },
};
