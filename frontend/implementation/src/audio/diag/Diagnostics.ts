import type { DiagEvent, DropReason } from "../types";

const LOG_SIZE = 240;

/**
 * Cheap always-on counters plus an optional ring-buffer event log.
 * The log only records while `logging` is true (developer builds / Audio Lab), so student sessions pay almost nothing.
 */
export class Diagnostics {
  logging = false;
  readonly counters: Record<string, number> = {};
  readonly dropped: Record<string, number> = {};
  private readonly ring: DiagEvent[] = [];
  private readonly listeners = new Set<(e: DiagEvent) => void>();
  private readonly t0: number;

  constructor(private readonly now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now())) {
    this.t0 = this.now();
  }

  count(key: string, n = 1): void {
    this.counters[key] = (this.counters[key] ?? 0) + n;
  }

  drop(reason: DropReason, id: string, detail?: string): void {
    this.dropped[reason] = (this.dropped[reason] ?? 0) + 1;
    this.log("drop", id, detail ? `${reason}: ${detail}` : reason);
  }

  log(kind: DiagEvent["kind"], id: string, detail?: string): void {
    if (!this.logging && this.listeners.size === 0) return;
    const e: DiagEvent = detail === undefined ? { t: Math.round(this.now() - this.t0), kind, id } : { t: Math.round(this.now() - this.t0), kind, id, detail };
    if (this.logging) {
      this.ring.push(e);
      if (this.ring.length > LOG_SIZE) this.ring.shift();
    }
    for (const l of this.listeners) l(e);
  }

  events(): readonly DiagEvent[] {
    return this.ring;
  }

  clearLog(): void {
    this.ring.length = 0;
  }

  subscribe(l: (e: DiagEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
