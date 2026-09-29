/**
 * TASK 05/06 — Cursor smoothing for hand-tracked drawing.
 * Simple exponential smoothing; constants are DEV-tunable and provisional.
 */
export class PointSmoother {
  private last: { x: number; y: number } | null = null;

  constructor(private readonly alpha = 0.45) {}

  reset(): void {
    this.last = null;
  }

  smooth(p: { x: number; y: number }): { x: number; y: number } {
    if (!this.last) {
      this.last = { ...p };
      return { ...p };
    }
    const a = this.alpha;
    this.last = {
      x: this.last.x * (1 - a) + p.x * a,
      y: this.last.y * (1 - a) + p.y * a,
    };
    return { ...this.last };
  }
}
