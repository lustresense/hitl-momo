import type { Landmark } from "@/src/input/types";

/**
 * A 21-point hand centred on x, wrist at index 0. A real MediaPipe hand always has 21 points, and the
 * primary-hand rule ignores anything smaller than MIN_HAND_SIZE, so the wave fixtures use this shape.
 */
export function handAt(x: number, y = 0.5, size = 0.3): Landmark[] {
  const pts: Landmark[] = [];
  for (let i = 0; i < 21; i++) pts.push({ x: x - size / 2 + (size * (i % 5)) / 4, y: y - size / 2 + (size * Math.floor(i / 5)) / 4 });
  pts[0] = { x, y: y + size / 2 };
  return pts;
}
