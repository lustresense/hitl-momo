import { LabCpuWorkerClient, type CpuWorkerResult } from "@/src/components/nui-lab/bench/r20-worker-client";

export interface MonuiWorkerOptions {
  readonly wasmRoot: string;
  readonly modelUrl: string;
  readonly yoloEnabled?: boolean;
}

export type MonuiWarmupStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "warming"; readonly delegate: string }
  | { readonly kind: "ready"; readonly delegate: string }
  | { readonly kind: "failed"; readonly message: string };

export interface MonuiWorkerHandlers {
  readonly onResult: (res: CpuWorkerResult) => void;
  readonly onReleaseAll?: (reason: string) => void;
  readonly onWorkerRestart?: (reason: string, attempt: number) => void;
  readonly onError?: (err: string) => void;
  readonly createWorker?: () => Worker;
}

const DEFAULT_DELEGATE_LABEL = "CPU Worker · R23B-HF3";

let status: MonuiWarmupStatus = { kind: "idle" };
const listeners = new Set<(s: MonuiWarmupStatus) => void>();

interface WarmEntry {
  readonly key: string;
  readonly client: LabCpuWorkerClient;
}

interface PendingEntry {
  readonly key: string;
  readonly client: LabCpuWorkerClient;
  readonly promise: Promise<LabCpuWorkerClient>;
  claimed: boolean;
  settled: boolean;
}

let warm: WarmEntry | null = null;
let pending: PendingEntry | null = null;

function keyOf(opts: MonuiWorkerOptions): string {
  return `${opts.wasmRoot}|${opts.modelUrl}|${Boolean(opts.yoloEnabled)}`;
}

function publish(next: MonuiWarmupStatus): void {
  status = next;
  for (const cb of [...listeners]) cb(next);
}

const publishReady = (): void => publish({ kind: "ready", delegate: DEFAULT_DELEGATE_LABEL });
const publishFailed = (err: unknown): void =>
  publish({ kind: "failed", message: err instanceof Error ? err.message : "Gagal memuat model NUI." });

export function getMonuiWarmupStatus(): MonuiWarmupStatus { return status; }

export function subscribeMonuiWarmupStatus(cb: (s: MonuiWarmupStatus) => void): () => void {
  listeners.add(cb);
  cb(status);
  return () => { listeners.delete(cb); };
}

export function disposeWarmMonuiWorker(): void {
  if (!warm) return;
  warm.client.close("warmup-disposed");
  warm = null;
}

function getLiveWarm(key: string): LabCpuWorkerClient | null {
  if (!warm || warm.key !== key) return null;
  const t = warm.client.getTelemetry();
  if (t.ready && !t.closed) return warm.client;
  const stale = warm.client;
  warm = null;
  stale.close("warmup-stale");
  return null;
}

function bindHandlers(client: LabCpuWorkerClient, handlers: MonuiWorkerHandlers): void {
  const { onResult, onReleaseAll, onWorkerRestart, onError } = handlers;
  client.setCallbacks({ onResult, onReleaseAll, onWorkerRestart, onError, onProgress: undefined });
}

function makeWorkerClient(
  opts: MonuiWorkerOptions,
  handlers: MonuiWorkerHandlers,
  onProgress?: () => void,
): LabCpuWorkerClient {
  return new LabCpuWorkerClient({
    wasmRoot: opts.wasmRoot,
    modelUrl: opts.modelUrl,
    preprocess: "raw",
    yoloEnabled: Boolean(opts.yoloEnabled),
    dynamicOwnerLock: true,
    numHandsPolicy: "fixed-2",
    auditIntervalFrames: 45,
    captureWidth: 320,
    ...handlers,
    onProgress,
  });
}

async function initNewClient(
  opts: MonuiWorkerOptions,
  handlers: MonuiWorkerHandlers,
  failReason: string,
  trackStatus: boolean,
): Promise<LabCpuWorkerClient> {
  if (trackStatus) publish({ kind: "loading" });
  let initSettled = false;
  const onProgress = trackStatus
    ? () => { if (!initSettled) publish({ kind: "warming", delegate: "CPU Worker" }); }
    : undefined;
  const client = makeWorkerClient(opts, handlers, onProgress);
  try {
    await client.init();
    initSettled = true;
    client.setCallbacks({ onProgress: undefined });
    if (trackStatus) publishReady();
    return client;
  } catch (err) {
    initSettled = true;
    client.close(failReason);
    if (trackStatus) publishFailed(err);
    throw err;
  }
}

function completePending(entry: PendingEntry): void {
  const isCurrent = pending === entry;
  if (isCurrent) pending = null;
  if (!entry.claimed) {
    if (isCurrent) warm = { key: entry.key, client: entry.client };
    else entry.client.close("warmup-superseded");
  }
  if (isCurrent && !entry.settled) { entry.settled = true; publishReady(); }
}

function failPending(entry: PendingEntry, err: unknown, reason: string): void {
  const isCurrent = pending === entry;
  if (isCurrent) pending = null;
  entry.client.close(reason);
  if ((isCurrent || !pending) && !entry.settled) { entry.settled = true; publishFailed(err); }
}

/**
 * Downloads MediaPipe WASM + HandLandmarker model inside `r20-hand.worker.ts` and
 * runs blank-frame cold-start inference once. Safe to call from multiple routes.
 */
export async function warmMonuiWorker(opts: MonuiWorkerOptions): Promise<void> {
  const key = keyOf(opts);
  if (getLiveWarm(key)) { publishReady(); return; }
  if (pending?.key === key && !pending.client.getTelemetry().closed) {
    await pending.promise.catch(() => undefined);
    return;
  }
  if (typeof Worker === "undefined") {
    publish({ kind: "failed", message: "Web Worker tidak tersedia di browser ini." });
    return;
  }

  disposeWarmMonuiWorker();
  publish({ kind: "loading" });

  let initSettled = false;
  let job: PendingEntry | null = null;
  const client = makeWorkerClient(opts, { onResult: () => undefined }, () => {
    if (!initSettled && job && pending === job) publish({ kind: "warming", delegate: "CPU Worker" });
  });
  const entry: PendingEntry = {
    key, client, claimed: false, settled: false, promise: client.init().then(() => client),
  };
  job = entry;
  pending = entry;

  try {
    await entry.promise;
    initSettled = true;
    completePending(entry);
  } catch (err) {
    initSettled = true;
    failPending(entry, err, "warmup-failed");
  }
}

/**
 * Claims an already-warmed (or in-flight) Worker client so opening the camera
 * skips duplicate WASM/model download and cold-start inference.
 */
export async function claimMonuiWorker(
  opts: MonuiWorkerOptions,
  handlers: MonuiWorkerHandlers,
): Promise<LabCpuWorkerClient> {
  if (handlers.createWorker) return initNewClient(opts, handlers, "claim-injected-init-failed", false);

  const key = keyOf(opts);
  const warmed = getLiveWarm(key);
  if (warmed) {
    warm = null;
    bindHandlers(warmed, handlers);
    warmed.resetFrameWatermark();
    publishReady();
    return warmed;
  }

  if (pending?.key === key && !pending.claimed && !pending.client.getTelemetry().closed) {
    const job = pending;
    job.claimed = true;
    try {
      const client = await job.promise;
      completePending(job);
      bindHandlers(client, handlers);
      client.resetFrameWatermark();
      return client;
    } catch (err) {
      failPending(job, err, "claim-init-failed");
      throw err;
    }
  }

  const warmupInFlight = pending?.key === key;
  disposeWarmMonuiWorker();
  try {
    const client = await initNewClient(opts, handlers, "claim-init-failed", !warmupInFlight);
    if (warmupInFlight && status.kind !== "ready") publishReady();
    return client;
  } catch (err) {
    if (warmupInFlight && !pending && status.kind !== "ready" && status.kind !== "failed") publishFailed(err);
    throw err;
  }
}

export function resetMonuiWarmupForTest(): void {
  const currentPending = pending;
  pending = null;
  currentPending?.client.close("warmup-reset");
  disposeWarmMonuiWorker();
  status = { kind: "idle" };
  listeners.clear();
}
