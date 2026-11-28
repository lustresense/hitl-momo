import type { Diagnostics } from "../diag/Diagnostics";

export interface CatalogEntry {
  readonly url: string;
}
export type Catalog = Readonly<Record<string, CatalogEntry>>;

interface FailInfo {
  error: string;
  attempts: number;
  at: number;
}

const RETRY_AFTER_MS = 4000;
const MAX_ATTEMPTS = 3;

/**
 * Fetch + decode cache for audio assets. Dedupes concurrent loads, remembers failures (retried a bounded number of times)
 * and never throws: a missing or broken file simply yields null so the game keeps running silently.
 */
export class BufferStore {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer | null>>();
  readonly failed = new Map<string, FailInfo>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly catalog: Catalog,
    private readonly fetchBuffer: (url: string) => Promise<ArrayBuffer>,
    private readonly diag: Diagnostics,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  has(id: string): boolean {
    return this.buffers.has(id);
  }

  load(id: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id);
    if (hit) return Promise.resolve(hit);
    const entry = this.catalog[id];
    if (!entry) {
      this.diag.drop("missing-asset", id, "not in catalog");
      return Promise.resolve(null);
    }
    const fail = this.failed.get(id);
    if (fail && (fail.attempts >= MAX_ATTEMPTS || this.now() - fail.at < RETRY_AFTER_MS)) return Promise.resolve(null);
    const pending = this.inflight.get(id);
    if (pending) return pending;
    const p = this.fetchAndDecode(id, entry.url).finally(() => {
      this.inflight.delete(id);
    });
    this.inflight.set(id, p);
    return p;
  }

  private async fetchAndDecode(id: string, url: string): Promise<AudioBuffer | null> {
    try {
      const raw = await this.fetchBuffer(url);
      const buf = await this.ctx.decodeAudioData(raw);
      this.buffers.set(id, buf);
      this.failed.delete(id);
      this.diag.count("loaded");
      this.diag.log("load", id, `${buf.duration.toFixed(2)}s`);
      return buf;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const prev = this.failed.get(id);
      this.failed.set(id, { error: msg, attempts: (prev?.attempts ?? 0) + 1, at: this.now() });
      this.diag.count("load-failed");
      this.diag.drop("load-failed", id, msg);
      return null;
    }
  }

  async preload(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.load(id)));
  }

  evict(id: string): void {
    this.buffers.delete(id);
  }

  list(): Array<{ id: string; bytesEstimate: number; seconds: number }> {
    return [...this.buffers.entries()].map(([id, b]) => ({ id, bytesEstimate: b.length * b.numberOfChannels * 4, seconds: b.duration }));
  }

  memoryBytes(): number {
    let n = 0;
    for (const b of this.buffers.values()) n += b.length * b.numberOfChannels * 4;
    return n;
  }
}
