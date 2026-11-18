import type { StrokePoint } from "../domain/types";

/** Raw stroke as captured in canvas pixel space. */
export type RawStroke = StrokePoint[];

/** Identifies the active drawing modality. */
export type InputModeId = "pointer" | "hand";

/** Camera/tracker lifecycle states surfaced to the UI (TASK 05/13). */
export type HandInputStatus =
  | { kind: "idle" }
  | { kind: "initializing" }
  /** `delegate` = MediaPipe backend actually in use ("GPU", "CPU (cadangan)") for diagnostics. */
  | { kind: "ready"; delegate?: string }
  | { kind: "drawing" }
  | { kind: "no-hand" }
  | { kind: "tracking-lost" }
  /** `message` = short Indonesian reason (<= 8 words) that is safe to show a student. */
  | { kind: "error"; reason: HandFailureReason; message?: string };

export type HandFailureReason =
  | "permission-denied"
  | "camera-unavailable"
  | "model-error"
  | "tracker-error";

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/**
 * Unified stroke sink shared by every input modality (TASK 06):
 * pointer/touch drivers and the MediaPipe hand driver all push
 * points into this one representation before normalization.
 */
type StoreOp = { kind: "stroke" } | { kind: "erase"; before: RawStroke[]; after: RawStroke[] };

export class StrokeStore {
  private strokes: RawStroke[] = [];
  private undone: RawStroke[] = [];
  private active: RawStroke | null = null;
  /** Parallel history so an eraser pass (PRD 0.0.16 R12 kepal) undoes like a stroke. */
  private ops: StoreOp[] = [];
  private redoOps: StoreOp[] = [];
  private eraseBefore: RawStroke[] | null = null;
  /** Eraser tool on (DrawingSurface.setErasing): pointer drags and the hand cursor erase instead of drawing. */
  eraserMode = false;
  /**
   * NUI Lab only: the eraser also cuts the segment BETWEEN two points that passes through its circle. The default
   * (false) only removes sample points inside the circle, so a fast stroke with sparse points can slip through
   * the eraser while visibly crossing it. The game and the tutorials keep the default.
   */
  eraseSegments = false;

  beginStroke(): void {
    if (!this.active) this.active = [];
    this.undone = [];
    this.redoOps = [];
  }

  addPoint(p: StrokePoint): void {
    if (!this.active) this.active = [];
    const last = this.active[this.active.length - 1];
    // Skip zero-distance jitter duplicates.
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) return;
    this.active.push(p);
  }

  endStroke(): void {
    if (this.active && this.active.length > 0) {
      this.strokes.push(this.active);
      this.ops.push({ kind: "stroke" });
      this.undone = [];
      this.redoOps = [];
    }
    this.active = null;
  }

  /**
   * Eraser: remove every point within `radius` of `p`, splitting strokes where they are cut.
   * Consecutive calls between beginErase/endErase form one undoable step.
   * Returns true when something was erased.
   */
  eraseAt(p: StrokePoint, radius: number): boolean {
    if (this.eraseBefore === null) this.beginErase();
    const r2 = radius * radius;
    let changed = false;
    const next: RawStroke[] = [];
    if (this.eraseSegments) {
      for (const stroke of this.strokes) {
        const pieces = cutStroke(stroke, p, radius);
        if (pieces.cut) changed = true;
        next.push(...pieces.runs);
      }
      if (changed) this.strokes = next.filter((s) => s.length > 0);
      return changed;
    }
    for (const stroke of this.strokes) {
      let run: RawStroke = [];
      let cut = false;
      for (const q of stroke) {
        if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= r2) {
          cut = true;
          if (run.length > 0) next.push(run);
          run = [];
        } else run.push(q);
      }
      if (run.length > 0) next.push(run);
      if (cut) changed = true;
    }
    if (changed) this.strokes = next.filter((s) => s.length > 0);
    return changed;
  }

  beginErase(): void {
    if (this.active) this.endStroke();
    this.eraseBefore = [...this.strokes];
  }

  endErase(): void {
    const before = this.eraseBefore;
    this.eraseBefore = null;
    if (!before) return;
    const same = before.length === this.strokes.length && before.every((s, i) => s === this.strokes[i]);
    if (same) return;
    this.ops.push({ kind: "erase", before, after: [...this.strokes] });
    this.undone = [];
    this.redoOps = [];
  }

  isErasing(): boolean {
    return this.eraseBefore !== null;
  }

  /** True while a stroke is open (pen down). */
  hasActiveStroke(): boolean {
    return this.active !== null;
  }

  /** Last point of the open stroke, if it has one. */
  lastActivePoint(): StrokePoint | null {
    return this.active && this.active.length > 0 ? this.active[this.active.length - 1]! : null;
  }

  getStrokes(): { completed: RawStroke[]; active: RawStroke | null } {
    return { completed: [...this.strokes], active: this.active };
  }

  /** True only when at least one finished/meaningful stroke exists. */
  hasInk(): boolean {
    return this.strokes.length > 0 || (this.active !== null && this.active.length >= 2);
  }

  /** Undo the last step: a completed stroke or a whole eraser pass. */
  undo(): boolean {
    if (this.eraseBefore) this.endErase();
    const op = this.ops[this.ops.length - 1];
    if (op?.kind === "erase") {
      this.ops.pop();
      this.strokes = [...op.before];
      this.redoOps.push(op);
      return true;
    }
    const popped = this.strokes.pop();
    if (popped) {
      if (op) this.ops.pop();
      this.undone.push(popped);
      this.redoOps.push({ kind: "stroke" });
      return true;
    }
    return false;
  }

  /** Re-applies the last undone step. */
  redo(): boolean {
    const op = this.redoOps[this.redoOps.length - 1];
    if (op?.kind === "erase") {
      this.redoOps.pop();
      this.strokes = [...op.after];
      this.ops.push(op);
      return true;
    }
    const restored = this.undone.pop();
    if (restored) {
      if (op) this.redoOps.pop();
      this.strokes.push(restored);
      this.ops.push({ kind: "stroke" });
      return true;
    }
    return false;
  }

  clear(): void {
    if (this.strokes.length > 0) {
      this.undone.push(...this.strokes);
      for (let i = 0; i < this.strokes.length; i++) this.redoOps.push({ kind: "stroke" });
    }
    this.strokes = [];
    this.active = null;
    this.ops = [];
    this.eraseBefore = null;
  }
}


/**
 * Cuts a stroke with a circle, segment by segment: points inside the circle go, and a segment that only passes
 * through it is trimmed at the circle edge (new end points are inserted on the edge). Returns the runs left over.
 */
function cutStroke(stroke: RawStroke, c: StrokePoint, radius: number): { runs: RawStroke[]; cut: boolean } {
  const r2 = radius * radius;
  const inside = (q: StrokePoint) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 <= r2;
  const runs: RawStroke[] = [];
  let run: RawStroke = [];
  let cut = false;
  const flush = () => {
    if (run.length > 0) runs.push(run);
    run = [];
  };
  for (let i = 0; i < stroke.length; i++) {
    const q = stroke[i]!;
    const qIn = inside(q);
    if (i > 0) {
      const a = stroke[i - 1]!;
      const aIn = inside(a);
      if (!aIn && !qIn) {
        // Both ends outside: does the segment still cross the circle?
        const dx = q.x - a.x;
        const dy = q.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 > 1e-9) {
          const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
          const nx = a.x + t * dx;
          const ny = a.y + t * dy;
          if ((nx - c.x) ** 2 + (ny - c.y) ** 2 <= r2) {
            // Entry and exit of the circle along the segment.
            const fx = a.x - c.x;
            const fy = a.y - c.y;
            const A = len2;
            const B = 2 * (fx * dx + fy * dy);
            const C = fx * fx + fy * fy - r2;
            const disc = B * B - 4 * A * C;
            if (disc > 0) {
              const root = Math.sqrt(disc);
              const t0 = (-B - root) / (2 * A);
              const t1 = (-B + root) / (2 * A);
              cut = true;
              if (t0 > 0) run.push({ x: a.x + t0 * dx, y: a.y + t0 * dy });
              flush();
              if (t1 < 1) run.push({ x: a.x + t1 * dx, y: a.y + t1 * dy });
            }
          }
        }
      } else if (!aIn && qIn) {
        // Entering: keep the part up to the circle edge.
        const dx = q.x - a.x;
        const dy = q.y - a.y;
        const fx = a.x - c.x;
        const fy = a.y - c.y;
        const A = dx * dx + dy * dy;
        const B = 2 * (fx * dx + fy * dy);
        const C = fx * fx + fy * fy - r2;
        const disc = B * B - 4 * A * C;
        if (A > 1e-9 && disc >= 0) {
          const t0 = (-B - Math.sqrt(disc)) / (2 * A);
          if (t0 > 0 && t0 < 1) run.push({ x: a.x + t0 * dx, y: a.y + t0 * dy });
        }
      } else if (aIn && !qIn) {
        // Leaving: restart at the circle edge.
        const dx = q.x - a.x;
        const dy = q.y - a.y;
        const fx = a.x - c.x;
        const fy = a.y - c.y;
        const A = dx * dx + dy * dy;
        const B = 2 * (fx * dx + fy * dy);
        const C = fx * fx + fy * fy - r2;
        const disc = B * B - 4 * A * C;
        if (A > 1e-9 && disc >= 0) {
          const t1 = (-B + Math.sqrt(disc)) / (2 * A);
          if (t1 > 0 && t1 < 1) run.push({ x: a.x + t1 * dx, y: a.y + t1 * dy });
        }
      }
    }
    if (qIn) {
      cut = true;
      flush();
    } else run.push(q);
  }
  flush();
  return { runs: runs.filter((r) => r.length > 0), cut };
}
