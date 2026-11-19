/**
 * Persistence for benchmark sessions. IndexedDB in browsers; an explicit in-memory store (clearly reported as
 * "memory-only") when IndexedDB is unavailable. Failures surface as thrown errors to the caller (the writer counts
 * them and the dashboard warns), never as silent loss.
 *
 * Layout:  sessions[sessionId] · trials[trialId, index sessionId] · chunks[[sessionId, kind, seq]]
 */
import {
  BENCH_DB_NAME,
  BENCH_DB_VERSION,
  type ChunkRecord,
  type RecordKind,
  type SessionMeta,
  type TrialMeta,
  type TrialSummary,
} from "./schema";

export interface StoredTrial {
  meta: TrialMeta;
  summary: TrialSummary | null;
}

export interface BenchStore {
  readonly kind: "indexeddb" | "memory-only";
  putSession(meta: SessionMeta): Promise<void>;
  getSession(sessionId: string): Promise<SessionMeta | null>;
  listSessions(): Promise<SessionMeta[]>;
  putTrial(t: StoredTrial): Promise<void>;
  listTrials(sessionId: string): Promise<StoredTrial[]>;
  putChunk(c: ChunkRecord): Promise<void>;
  /** Chunks of one kind, ordered by seq. */
  iterateChunks(sessionId: string, kind: RecordKind, visit: (c: ChunkRecord) => void): Promise<void>;
  countChunkItems(sessionId: string): Promise<Record<RecordKind, number>>;
  deleteSession(sessionId: string): Promise<void>;
  deleteAll(): Promise<void>;
  estimate(): Promise<{ usageBytes: number | null; quotaBytes: number | null }>;
  close(): void;
}

const KINDS: RecordKind[] = ["frames", "events", "perf"];

export class MemoryBenchStore implements BenchStore {
  readonly kind = "memory-only" as const;
  private sessions = new Map<string, SessionMeta>();
  private trials = new Map<string, StoredTrial>();
  private chunks = new Map<string, ChunkRecord>();
  /** Test hook: make the next N writes fail. */
  failNextWrites = 0;

  private maybeFail(): void {
    if (this.failNextWrites > 0) {
      this.failNextWrites--;
      throw new Error("MemoryBenchStore: simulated write failure");
    }
  }
  async putSession(meta: SessionMeta): Promise<void> {
    this.maybeFail();
    this.sessions.set(meta.sessionId, structuredClone(meta));
  }
  async getSession(id: string): Promise<SessionMeta | null> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }
  async listSessions(): Promise<SessionMeta[]> {
    return [...this.sessions.values()].map((s) => structuredClone(s));
  }
  async putTrial(t: StoredTrial): Promise<void> {
    this.maybeFail();
    this.trials.set(t.meta.trialId, structuredClone(t));
  }
  async listTrials(sessionId: string): Promise<StoredTrial[]> {
    return [...this.trials.values()].filter((t) => t.meta.sessionId === sessionId).sort((a, b) => a.meta.index - b.meta.index).map((t) => structuredClone(t));
  }
  async putChunk(c: ChunkRecord): Promise<void> {
    this.maybeFail();
    this.chunks.set(`${c.sessionId}|${c.kind}|${String(c.seq).padStart(9, "0")}`, structuredClone(c));
  }
  async iterateChunks(sessionId: string, kind: RecordKind, visit: (c: ChunkRecord) => void): Promise<void> {
    const keys = [...this.chunks.keys()].filter((k) => k.startsWith(`${sessionId}|${kind}|`)).sort();
    for (const k of keys) visit(this.chunks.get(k)!);
  }
  async countChunkItems(sessionId: string): Promise<Record<RecordKind, number>> {
    const out: Record<RecordKind, number> = { frames: 0, events: 0, perf: 0 };
    for (const c of this.chunks.values()) if (c.sessionId === sessionId) out[c.kind] += c.count;
    return out;
  }
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    for (const [k, t] of this.trials) if (t.meta.sessionId === sessionId) this.trials.delete(k);
    for (const [k, c] of this.chunks) if (c.sessionId === sessionId) this.chunks.delete(k);
  }
  async deleteAll(): Promise<void> {
    this.sessions.clear();
    this.trials.clear();
    this.chunks.clear();
  }
  async estimate() {
    return { usageBytes: null, quotaBytes: null };
  }
  close(): void {
    /* nothing to release */
  }
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbBenchStore implements BenchStore {
  readonly kind = "indexeddb" as const;
  private constructor(private db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB, name = BENCH_DB_NAME): Promise<IndexedDbBenchStore> {
    const req = factory.open(name, BENCH_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "sessionId" });
      if (!db.objectStoreNames.contains("trials")) {
        const s = db.createObjectStore("trials", { keyPath: "meta.trialId" });
        s.createIndex("sessionId", "meta.sessionId");
      }
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["sessionId", "kind", "seq"] });
    };
    const db = await reqToPromise(req);
    return new IndexedDbBenchStore(db);
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await txDone(tx);
  }
  putSession(meta: SessionMeta): Promise<void> {
    return this.put("sessions", meta);
  }
  async getSession(id: string): Promise<SessionMeta | null> {
    const tx = this.db.transaction("sessions", "readonly");
    const v = (await reqToPromise(tx.objectStore("sessions").get(id))) as SessionMeta | undefined;
    return v ?? null;
  }
  async listSessions(): Promise<SessionMeta[]> {
    const tx = this.db.transaction("sessions", "readonly");
    return (await reqToPromise(tx.objectStore("sessions").getAll())) as SessionMeta[];
  }
  putTrial(t: StoredTrial): Promise<void> {
    return this.put("trials", t);
  }
  async listTrials(sessionId: string): Promise<StoredTrial[]> {
    const tx = this.db.transaction("trials", "readonly");
    const all = (await reqToPromise(tx.objectStore("trials").index("sessionId").getAll(sessionId))) as StoredTrial[];
    return all.sort((a, b) => a.meta.index - b.meta.index);
  }
  putChunk(c: ChunkRecord): Promise<void> {
    return this.put("chunks", c);
  }
  async iterateChunks(sessionId: string, kind: RecordKind, visit: (c: ChunkRecord) => void): Promise<void> {
    const tx = this.db.transaction("chunks", "readonly");
    const range = IDBKeyRange.bound([sessionId, kind, 0], [sessionId, kind, Number.MAX_SAFE_INTEGER]);
    await new Promise<void>((resolve, reject) => {
      const cur = tx.objectStore("chunks").openCursor(range);
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve();
        visit(c.value as ChunkRecord);
        c.continue();
      };
      cur.onerror = () => reject(cur.error ?? new Error("IndexedDB cursor failed"));
    });
  }
  async countChunkItems(sessionId: string): Promise<Record<RecordKind, number>> {
    const out: Record<RecordKind, number> = { frames: 0, events: 0, perf: 0 };
    for (const k of KINDS) {
      await this.iterateChunks(sessionId, k, (c) => {
        out[k] += c.count;
      });
    }
    return out;
  }
  async deleteSession(sessionId: string): Promise<void> {
    const tx = this.db.transaction(["sessions", "trials", "chunks"], "readwrite");
    tx.objectStore("sessions").delete(sessionId);
    const trials = tx.objectStore("trials");
    const tr = trials.index("sessionId").openCursor(IDBKeyRange.only(sessionId));
    tr.onsuccess = () => {
      const c = tr.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
    tx.objectStore("chunks").delete(IDBKeyRange.bound([sessionId, "", 0], [sessionId, "\uffff", Number.MAX_SAFE_INTEGER]));
    await txDone(tx);
  }
  async deleteAll(): Promise<void> {
    const tx = this.db.transaction(["sessions", "trials", "chunks"], "readwrite");
    tx.objectStore("sessions").clear();
    tx.objectStore("trials").clear();
    tx.objectStore("chunks").clear();
    await txDone(tx);
  }
  async estimate() {
    try {
      const e = await navigator.storage?.estimate?.();
      return { usageBytes: e?.usage ?? null, quotaBytes: e?.quota ?? null };
    } catch {
      return { usageBytes: null, quotaBytes: null };
    }
  }
  close(): void {
    this.db.close();
  }
}

/** Open IndexedDB when the browser has it; otherwise the explicit memory-only store. */
export async function openBenchStore(): Promise<BenchStore> {
  if (typeof indexedDB === "undefined" || !indexedDB) return new MemoryBenchStore();
  try {
    return await IndexedDbBenchStore.open();
  } catch {
    return new MemoryBenchStore();
  }
}
