/**
 * Batched, back-pressured writer for benchmark records.
 *
 * Contract (tested): a record is either written, still queued, or COUNTED as dropped. Nothing disappears silently.
 *  - items are sealed into chunks of `chunkSize` (or after `flushMs`) so each IndexedDB transaction stays small and the
 *    UI thread is never asked to serialise thousands of frames at once;
 *  - one write in flight at a time; a failed write is retried with back-off and counted in `failures`;
 *  - above `maxQueueItems` the NEW items are dropped and `dropped[kind]` rises; the owner warning fires once per 500.
 */
import type { BenchStore } from "./store";
import type { ChunkRecord, RecordKind } from "./schema";

export interface WriterOptions {
  chunkSize?: number;
  flushMs?: number;
  maxQueueItems?: number;
  retryMs?: number;
  onWarning?: (message: string) => void;
  /** Injected for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export interface WriterStats {
  queuedItems: number;
  sealedChunks: number;
  written: Record<RecordKind, number>;
  dropped: Record<RecordKind, number>;
  failures: number;
  lastError: string | null;
}

const KINDS: RecordKind[] = ["frames", "events", "perf"];

export class ChunkWriter {
  private readonly chunkSize: number;
  private readonly flushMs: number;
  private readonly maxQueueItems: number;
  private readonly retryMs: number;
  private readonly onWarning: (m: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private buf: Record<RecordKind, unknown[]> = { frames: [], events: [], perf: [] };
  private seq: Record<RecordKind, number> = { frames: 0, events: 0, perf: 0 };
  private sealed: ChunkRecord[] = [];
  private pumping = false;
  private disposed = false;
  private timer: unknown = null;
  private retryTimer: unknown = null;
  private waiters: Array<() => void> = [];
  private dropWarned = 0;
  readonly written: Record<RecordKind, number> = { frames: 0, events: 0, perf: 0 };
  readonly dropped: Record<RecordKind, number> = { frames: 0, events: 0, perf: 0 };
  failures = 0;
  lastError: string | null = null;

  constructor(
    private readonly store: BenchStore,
    private readonly sessionId: string,
    opts: WriterOptions = {},
  ) {
    this.chunkSize = opts.chunkSize ?? 100;
    this.flushMs = opts.flushMs ?? 1000;
    this.maxQueueItems = opts.maxQueueItems ?? 6000;
    this.retryMs = opts.retryMs ?? 1500;
    this.onWarning = opts.onWarning ?? (() => undefined);
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get queuedItems(): number {
    let n = 0;
    for (const k of KINDS) n += this.buf[k].length;
    for (const c of this.sealed) n += c.count;
    return n;
  }

  /** Returns false (and counts it) when the item had to be dropped. */
  push(kind: RecordKind, item: unknown): boolean {
    if (this.disposed) {
      this.dropped[kind]++;
      return false;
    }
    if (this.queuedItems >= this.maxQueueItems) {
      this.dropped[kind]++;
      const total = this.dropped.frames + this.dropped.events + this.dropped.perf;
      if (total - this.dropWarned >= 500 || this.dropWarned === 0) {
        this.dropWarned = total;
        this.onWarning(
          `Penyimpanan tertinggal: ${total} catatan dibuang (antrian penuh). Hentikan sesi dan unduh data segera.`,
        );
      }
      return false;
    }
    this.buf[kind].push(item);
    if (this.buf[kind].length >= this.chunkSize) this.seal(kind);
    else this.armTimer();
    return true;
  }

  private seal(kind: RecordKind): void {
    const items = this.buf[kind];
    if (items.length === 0) return;
    this.buf[kind] = [];
    this.sealed.push({ sessionId: this.sessionId, kind, seq: this.seq[kind]++, count: items.length, items });
    void this.pump();
  }

  private armTimer(): void {
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      for (const k of KINDS) this.seal(k);
    }, this.flushMs);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    try {
      while (this.sealed.length > 0 && !this.disposed) {
        const head = this.sealed[0]!;
        try {
          await this.store.putChunk(head);
          this.sealed.shift();
          this.written[head.kind] += head.count;
        } catch (err) {
          this.failures++;
          this.lastError = err instanceof Error ? err.message : String(err);
          this.onWarning(`Gagal menyimpan ke penyimpanan lokal (${this.lastError}). Data ditahan di antrian dan dicoba lagi.`);
          if (this.retryTimer === null) {
            this.retryTimer = this.setTimer(() => {
              this.retryTimer = null;
              void this.pump();
            }, this.retryMs);
          }
          return;
        }
      }
    } finally {
      this.pumping = false;
      if (this.sealed.length === 0 && this.queuedItems === 0) {
        const w = this.waiters;
        this.waiters = [];
        for (const f of w) f();
      }
    }
  }

  /** Seal everything and resolve when the queue is empty (or reject after `timeoutMs` while writes keep failing). */
  async flush(timeoutMs = 8000): Promise<void> {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    for (const k of KINDS) this.seal(k);
    void this.pump();
    if (this.sealed.length === 0 && !this.pumping) return;
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`flush timeout: ${this.queuedItems} item(s) belum tersimpan (${this.lastError ?? "?"})`)), timeoutMs);
      this.waiters.push(() => {
        clearTimeout(to);
        resolve();
      });
    });
  }

  stats(): WriterStats {
    return {
      queuedItems: this.queuedItems,
      sealedChunks: this.sealed.length,
      written: { ...this.written },
      dropped: { ...this.dropped },
      failures: this.failures,
      lastError: this.lastError,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }
}
