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
