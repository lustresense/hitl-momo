import type { CreateSubmissionRequest, RecordOutcomeRequest } from "./submission-client";
import { SubmissionClient } from "./submission-client";
import { ApiError } from "./http-client";

export type OutboxJobStatus = "pending" | "sending" | "acknowledged" | "failed" | "blocked";

export interface BaseOutboxJob {
  id: string;
  submissionKey: string;
  status: OutboxJobStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  nextRetryAt?: number;
  lastError?: string;
}

export interface SubmissionOutboxJob extends BaseOutboxJob {
  type: "submission";
  payload: CreateSubmissionRequest;
  serverSubmissionId?: number;
}

export interface OutcomeOutboxJob extends BaseOutboxJob {
  type: "outcome";
  payload: RecordOutcomeRequest;
  submissionId?: number;
}

export type OutboxJob = SubmissionOutboxJob | OutcomeOutboxJob;

export interface OutboxStats {
  pending: number;
  sending: number;
  acknowledged: number;
  blocked: number;
  failed: number;
}

export interface OutboxStorageAdapter {
  getAll(): Promise<OutboxJob[]>;
  get(id: string): Promise<OutboxJob | undefined>;
  put(job: OutboxJob): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryOutboxStorage implements OutboxStorageAdapter {
  private jobs = new Map<string, OutboxJob>();

  async getAll(): Promise<OutboxJob[]> {
    return Array.from(this.jobs.values());
  }

  async get(id: string): Promise<OutboxJob | undefined> {
    return this.jobs.get(id);
  }

  async put(job: OutboxJob): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async delete(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async clear(): Promise<void> {
    this.jobs.clear();
  }
}

export class IndexedDbOutboxStorage implements OutboxStorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly dbName = "sketchbook_outbox_db";
  private readonly storeName = "outbox_jobs";

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB not available"));
        return;
      }
      const req = window.indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("submissionKey", "submissionKey", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  async getAll(): Promise<OutboxJob[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as OutboxJob[]);
      req.onerror = () => reject(req.error);
    });
  }

  async get(id: string): Promise<OutboxJob | undefined> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as OutboxJob | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async put(job: OutboxJob): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.put(job);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export interface OutboxQueueOptions {
  client: SubmissionClient;
  storage?: OutboxStorageAdapter;
  tokenProvider?: () => string | undefined;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export class OutboxQueue {
  private readonly client: SubmissionClient;
  private readonly storage: OutboxStorageAdapter;
  private readonly tokenProvider?: () => string | undefined;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private activeProcessingPromise: Promise<void> | null = null;
  private listeners = new Set<(stats: OutboxStats) => void>();

  constructor(options: OutboxQueueOptions) {
    this.client = options.client;
    this.tokenProvider = options.tokenProvider;
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;

    if (options.storage) {
      this.storage = options.storage;
    } else if (typeof window !== "undefined" && window.indexedDB) {
      this.storage = new IndexedDbOutboxStorage();
    } else {
      this.storage = new MemoryOutboxStorage();
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", () => {
        void this.process();
      });
    }
  }

  addListener(listener: (stats: OutboxStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Re-run processing after a backoff. Without this, failed jobs wait for an unrelated trigger. */
  private scheduleRetry(delayMs: number): void {
    if (typeof setTimeout !== "function") return;
    setTimeout(() => {
      void this.process();
    }, Math.max(0, delayMs) + 25);
  }

  private notify(): void {
    void this.getStats().then((stats) => {
      for (const listener of this.listeners) {
        try {
          listener(stats);
        } catch {
          /* ignore listener errors */
        }
      }
    });
  }

  async getStats(): Promise<OutboxStats> {
    const jobs = await this.storage.getAll();
    const stats: OutboxStats = {
      pending: 0,
      sending: 0,
      acknowledged: 0,
      blocked: 0,
      failed: 0,
    };
    for (const job of jobs) {
      stats[job.status]++;
    }
    return stats;
  }

  async enqueueSubmission(payload: CreateSubmissionRequest): Promise<string> {
    const existing = await this.storage.getAll();
    const found = existing.find(
      (j) => j.type === "submission" && j.submissionKey === payload.submission_key
    );
    if (found) {
      return found.id;
    }

    const id = `sub_${payload.submission_key}`;
    const job: SubmissionOutboxJob = {
      id,
      type: "submission",
      submissionKey: payload.submission_key,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.storage.put(job);
    this.notify();
    void this.process();
    return id;
  }

  async enqueueOutcome(submissionKey: string, payload: RecordOutcomeRequest): Promise<string> {
    const existing = await this.storage.getAll();
    const submissionJob = existing.find(
      (j) => j.type === "submission" && j.submissionKey === submissionKey
    ) as SubmissionOutboxJob | undefined;

    const id = `out_${submissionKey}`;
    const job: OutcomeOutboxJob = {
      id,
      type: "outcome",
      submissionKey,
      submissionId: submissionJob?.serverSubmissionId,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.storage.put(job);
    this.notify();
    void this.process();
    return id;
  }

  private calculateBackoff(attempts: number): number {
    const exp = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, attempts));
    const jitter = Math.random() * 0.3 * exp;
    return exp + jitter;
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof ApiError) {
      if (err.code === "network" || err.code === "timeout" || err.code === "server-error" || err.code === "rate-limited") {
        return true;
      }
      return false;
    }
    return true;
  }

  async process(): Promise<void> {
    if (this.activeProcessingPromise) {
      await this.activeProcessingPromise;
      return;
    }

    this.activeProcessingPromise = this.doProcess();
    try {
      await this.activeProcessingPromise;
    } finally {
      this.activeProcessingPromise = null;
    }
  }

  private async doProcess(): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }

    let iterations = 0;
    while (iterations < 20) {
      iterations++;
      const jobs = await this.storage.getAll();
      const now = Date.now();

      const executable = jobs.filter((job) => {
        if (job.status !== "pending") return false;
        if (job.nextRetryAt && job.nextRetryAt > now) return false;
        return true;
      });

      if (executable.length === 0) {
        break;
      }

      for (const job of executable) {
        if (job.type === "submission") {
          await this.processSubmissionJob(job);
        } else if (job.type === "outcome") {
          await this.processOutcomeJob(job);
        }
      }
    }
    this.notify();
  }

  private async processSubmissionJob(job: SubmissionOutboxJob): Promise<void> {
    job.status = "sending";
    job.attempts++;
    job.updatedAt = Date.now();
    await this.storage.put(job);

    try {
      const token = this.tokenProvider ? this.tokenProvider() : undefined;
      const res = await this.client.createSubmission(job.payload, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });

      job.status = "acknowledged";
      job.serverSubmissionId = res.id;
      job.updatedAt = Date.now();
      await this.storage.put(job);

      // Resolve any pending outcome jobs waiting for this submissionId
      const allJobs = await this.storage.getAll();
      const waitingOutcome = allJobs.find(
        (j) => j.type === "outcome" && j.submissionKey === job.submissionKey && !j.submissionId
      ) as OutcomeOutboxJob | undefined;

      if (waitingOutcome) {
        waitingOutcome.submissionId = res.id;
        waitingOutcome.updatedAt = Date.now();
        await this.storage.put(waitingOutcome);
      }
    } catch (err) {
      const retryable = this.isRetryable(err);
      job.lastError = err instanceof Error ? err.message : String(err);
      job.updatedAt = Date.now();

      if (retryable) {
        job.status = "pending";
        job.nextRetryAt = Date.now() + this.calculateBackoff(job.attempts);
        this.scheduleRetry(job.nextRetryAt - Date.now());
      } else {
        job.status = "blocked";
      }
      await this.storage.put(job);
    }
  }

  private async processOutcomeJob(job: OutcomeOutboxJob): Promise<void> {
    if (!job.submissionId) {
      const allJobs = await this.storage.getAll();
      const sub = allJobs.find(
        (j) => j.type === "submission" && j.submissionKey === job.submissionKey
      ) as SubmissionOutboxJob | undefined;

      if (sub && sub.serverSubmissionId) {
        job.submissionId = sub.serverSubmissionId;
      } else {
        return;
      }
    }

    job.status = "sending";
    job.attempts++;
    job.updatedAt = Date.now();
    await this.storage.put(job);

    try {
      const token = this.tokenProvider ? this.tokenProvider() : undefined;
      await this.client.recordOutcome(job.submissionId, job.payload, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });

      job.status = "acknowledged";
      job.updatedAt = Date.now();
      await this.storage.put(job);
    } catch (err) {
      const retryable = this.isRetryable(err);
      job.lastError = err instanceof Error ? err.message : String(err);
      job.updatedAt = Date.now();

      if (retryable) {
        job.status = "pending";
        job.nextRetryAt = Date.now() + this.calculateBackoff(job.attempts);
        this.scheduleRetry(job.nextRetryAt - Date.now());
      } else {
        job.status = "blocked";
      }
      await this.storage.put(job);
    }
  }
}
