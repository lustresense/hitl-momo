// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabCpuWorkerClient } from "@/src/components/nui-lab/bench/r20-worker-client";
import {
  claimMonuiWorker,
  getMonuiWarmupStatus,
  resetMonuiWarmupForTest,
  subscribeMonuiWarmupStatus,
  warmMonuiWorker,
  type MonuiWarmupStatus,
} from "@/src/app/monui-worker-warmup";

const OPTS = {
  wasmRoot: "/mediapipe/wasm",
  modelUrl: "/models/hand_landmarker.task",
  yoloEnabled: false,
} as const;

class FakeWarmupWorker {
  static instances: FakeWarmupWorker[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  initCount = 0;
  terminated = false;
  lastEpoch = 1;

  constructor(private readonly mode: "ok" | "fail" = "ok") {
    FakeWarmupWorker.instances.push(this);
  }

  postMessage(msg: { type: string; sessionEpoch: number }): void {
    if (msg.type === "INIT") {
      this.initCount++;
      this.lastEpoch = msg.sessionEpoch;
      queueMicrotask(() => {
        if (this.mode === "fail") {
          this.onmessage?.({
            data: { type: "ERROR", sessionEpoch: this.lastEpoch, stage: "init", message: "WASM failed" },
          } as MessageEvent);
          return;
        }
        this.onmessage?.({
          data: { type: "PROGRESS", sessionEpoch: this.lastEpoch, stage: "warming" },
        } as MessageEvent);
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              type: "READY",
              sessionEpoch: this.lastEpoch,
              delegate: "CPU",
              gpuDelegateAttempted: false,
              gpuDelegateActive: false,
              numHands: 2,
              numHandsPolicy: "fixed-2",
              initSetOptionsCalls: 0,
              runtimeSetOptionsCalls: 0,
            },
          } as MessageEvent);
        });
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emitError(message = "runtime fail", stage: "init" | "detect" = "init"): void {
    this.onmessage?.({
      data: { type: "ERROR", sessionEpoch: this.lastEpoch, stage, message },
    } as MessageEvent);
  }

  emitResult(frameId = 1): void {
    this.onmessage?.({
      data: {
        type: "RESULT",
        sessionEpoch: this.lastEpoch,
        frameId,
        captureFrameId: frameId,
        processedFrameId: frameId,
        processedSeq: 1,
        captureTimestampMs: 100,
        timestampMs: 100,
        aspect: 4 / 3,
        delegate: "CPU",
        gpuDelegateAttempted: false,
        gpuDelegateActive: false,
        numHandsActive: 2,
        initSetOptionsCalls: 0,
        runtimeSetOptionsCalls: 0,
        landmarks: [],
        handedness: [],
        mpRawHandCount: 0,
        mpHandednessScores: [],
        luma: { meanLuma: 0.4, centerLuma: 0.4, isDark: false, isBacklight: false, activePass: "A0_raw" },
        lumaStats: {
          mean: 0.4, center: 0.4, p10: 0.2, p50: 0.4, p95: 0.7,
          nearWhiteHandPct: null, blurProxy: 50, noiseProxy: 1, isBacklight: false, passUsed: "A0_raw",
        },
        timing: { preprocessMs: 0.2, detectMs: 5, setOptionsMs: 0, workerTotalMs: 6, detectorCalls: 1 },
        ownerGuard: {
          activeNumHands: 2, policy: "fixed-2", bystanderAudits: 0, bystanderDetections: 0,
          ownerJumpRejects: 0, ownerSizeRejects: 0, ambiguousHolds: 0, handednessProbes: 0,
          bystanderCooldown: 0, trackId: 1, locked: false,
        },
        ownerTrack: { locked: false, trackId: 1, handCount: 0, ambiguousHold: false, rejectReason: "no-hand" },
        failClosedReason: null,
        monotonicClamps: 0,
      },
    } as MessageEvent);
  }
}

describe("monui-worker-warmup (cold-start preload + 0-ms claim)", () => {
  afterEach(() => {
    resetMonuiWarmupForTest();
    FakeWarmupWorker.instances = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes loading -> warming -> ready and lets claimMonuiWorker reuse the warmed Worker without duplicate init", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker("ok") as unknown as Worker;
        }
      },
    );

    const seen: MonuiWarmupStatus["kind"][] = [];
    const unsub = subscribeMonuiWarmupStatus((s) => seen.push(s.kind));

    await Promise.all([warmMonuiWorker(OPTS), warmMonuiWorker(OPTS)]);
    expect(FakeWarmupWorker.instances).toHaveLength(1);
    expect(seen).toEqual(["idle", "loading", "warming", "ready"]);
    expect(getMonuiWarmupStatus().kind).toBe("ready");

    const results: number[] = [];
    const client = await claimMonuiWorker(OPTS, {
      onResult: (r) => results.push(r.frameId),
    });
    // Reuses the single warmed worker instance (0 duplicate downloads/coldstarts)
    expect(FakeWarmupWorker.instances).toHaveLength(1);
    FakeWarmupWorker.instances[0]!.emitResult();
    expect(results).toEqual([1]);

    client.close("test-done");
    expect(FakeWarmupWorker.instances[0]!.terminated).toBe(true);
    unsub();
  });

  it("shares an in-flight warmup promise when camera turns on before preload finishes and fails cleanly on error", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker("ok") as unknown as Worker;
        }
      },
    );

    const warmPromise = warmMonuiWorker(OPTS);
    const results: number[] = [];
    const client = await claimMonuiWorker(OPTS, {
      onResult: (r) => results.push(r.frameId),
    });
    await warmPromise;

    expect(FakeWarmupWorker.instances).toHaveLength(1);
    FakeWarmupWorker.instances[0]!.emitResult();
    expect(results).toEqual([1]);
    client.close("done");

    resetMonuiWarmupForTest();
    FakeWarmupWorker.instances = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker("fail") as unknown as Worker;
        }
      },
    );
    await warmMonuiWorker(OPTS);
    expect(getMonuiWarmupStatus().kind).toBe("failed");
  });

  it("gives concurrent double claimMonuiWorker during pending two distinct clients without cross-close", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker("ok") as unknown as Worker;
        }
      },
    );

    const resultsA: number[] = [];
    const resultsB: number[] = [];
    const warmPromise = warmMonuiWorker(OPTS);
    const [clientA, clientB] = await Promise.all([
      claimMonuiWorker(OPTS, { onResult: (r) => resultsA.push(r.frameId) }),
      claimMonuiWorker(OPTS, { onResult: (r) => resultsB.push(r.frameId) }),
    ]);
    await warmPromise;

    expect(clientA).not.toBe(clientB);
    expect(FakeWarmupWorker.instances).toHaveLength(2);
    expect(getMonuiWarmupStatus().kind).toBe("ready");

    // Aborting caller 1 ("stale-init") must not terminate or close caller 2's live client
    clientA.close("stale-init");
    expect(clientA.getTelemetry().closed).toBe(true);
    expect(FakeWarmupWorker.instances[0]!.terminated).toBe(true);
    expect(clientB.getTelemetry().closed).toBe(false);
    expect(clientB.getTelemetry().ready).toBe(true);
    expect(FakeWarmupWorker.instances[1]!.terminated).toBe(false);

    FakeWarmupWorker.instances[1]!.emitResult(42);
    expect(resultsB).toEqual([42]);
    expect(resultsA).toEqual([]);

    clientB.close("done");
  });

  it("discards unready or closed warm clients in both warmMonuiWorker and claimMonuiWorker", async () => {
    let idx = 0;
    const modes: Array<"ok" | "fail"> = ["ok", "fail", "ok", "fail", "ok"];
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker(modes[idx++] ?? "ok") as unknown as Worker;
        }
      },
    );

    // 1. Warm worker succeeds, then crashes and fails its auto-restart -> ready=false while warm is held
    await warmMonuiWorker(OPTS);
    expect(FakeWarmupWorker.instances).toHaveLength(1);
    FakeWarmupWorker.instances[0]!.onerror?.({ message: "worker died" } as ErrorEvent);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWarmupWorker.instances).toHaveLength(2);

    // claimMonuiWorker sees unready warm client, discards it, and creates fresh worker #3
    const claimed = await claimMonuiWorker(OPTS, { onResult: () => undefined });
    expect(FakeWarmupWorker.instances).toHaveLength(3);
    expect(FakeWarmupWorker.instances[1]!.terminated).toBe(true);
    expect(claimed.getTelemetry().ready).toBe(true);
    expect(claimed.getTelemetry().closed).toBe(false);
    claimed.close("done-1");

    // 2. Warm again (#4=fail -> wait: reset idx so #4 is ok, #5 is fail, #6 is ok)
    resetMonuiWarmupForTest();
    FakeWarmupWorker.instances = [];
    idx = 2; // modes[2]="ok", modes[3]="fail", modes[4]="ok"
    await warmMonuiWorker(OPTS);
    expect(FakeWarmupWorker.instances).toHaveLength(1);
    FakeWarmupWorker.instances[0]!.onerror?.({ message: "worker died" } as ErrorEvent);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWarmupWorker.instances).toHaveLength(2);

    // warmMonuiWorker also discards unready warm client and replaces it with fresh worker #3
    await warmMonuiWorker(OPTS);
    expect(FakeWarmupWorker.instances).toHaveLength(3);
    expect(FakeWarmupWorker.instances[1]!.terminated).toBe(true);
    expect(getMonuiWarmupStatus().kind).toBe("ready");

    // 3. Even if warm telemetry reports closed=true, claimMonuiWorker discards and replaces it
    const liveWarm = await claimMonuiWorker(OPTS, { onResult: () => undefined });
    liveWarm.close("done-2");

    await warmMonuiWorker(OPTS);
    const origGetTelemetry = LabCpuWorkerClient.prototype.getTelemetry;
    vi.spyOn(LabCpuWorkerClient.prototype, "getTelemetry").mockImplementationOnce(function (
      this: LabCpuWorkerClient,
    ) {
      return { ...origGetTelemetry.call(this), ready: true, closed: true };
    });
    const replaced = await claimMonuiWorker(OPTS, { onResult: () => undefined });
    expect(replaced.getTelemetry().ready).toBe(true);
    expect(replaced.getTelemetry().closed).toBe(false);
    expect(FakeWarmupWorker.instances).toHaveLength(5);
    replaced.close("done-3");
  });

  it("isolates callbacks per client across injected and live clients", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker("ok") as unknown as Worker;
        }
      },
    );

    const wA = new FakeWarmupWorker("ok");
    const wB = new FakeWarmupWorker("ok");

    const resA: number[] = [];
    const relA: string[] = [];
    const errA: string[] = [];
    const resB: number[] = [];
    const relB: string[] = [];
    const errB: string[] = [];
    const resC: number[] = [];
    const relC: string[] = [];
    const errC: string[] = [];

    const clientA = await claimMonuiWorker(OPTS, {
      createWorker: () => wA as unknown as Worker,
      onResult: (r) => resA.push(r.frameId),
      onReleaseAll: (reason) => relA.push(reason),
      onError: (err) => errA.push(err),
    });
    const clientB = await claimMonuiWorker(OPTS, {
      createWorker: () => wB as unknown as Worker,
      onResult: (r) => resB.push(r.frameId),
      onReleaseAll: (reason) => relB.push(reason),
      onError: (err) => errB.push(err),
    });

    await warmMonuiWorker(OPTS);
    const warmWorkerC = FakeWarmupWorker.instances[FakeWarmupWorker.instances.length - 1]!;
    const clientC = await claimMonuiWorker(OPTS, {
      onResult: (r) => resC.push(r.frameId),
      onReleaseAll: (reason) => relC.push(reason),
      onError: (err) => errC.push(err),
    });

    // Triggering another warmup must not hijack callbacks of clientA, clientB, or clientC
    await warmMonuiWorker({ ...OPTS, yoloEnabled: true });

    wA.emitResult(101);
    wB.emitResult(202);
    warmWorkerC.emitResult(303);
    wA.emitError("err-A");
    warmWorkerC.emitError("err-C");
    clientB.close("close-B");

    expect(resA).toEqual([101]);
    expect(resB).toEqual([202]);
    expect(resC).toEqual([303]);
    expect(errA).toEqual(["[init] err-A"]);
    expect(errB).toEqual([]);
    expect(errC).toEqual(["[init] err-C"]);
    expect(relA).toEqual(["worker-init-error"]);
    expect(relB).toEqual(["close-B"]);
    expect(relC).toEqual(["worker-init-error"]);

    clientA.close("done-A");
    clientC.close("done-C");
  });

  it("clears pending, closes failed client, and publishes failed when claimed pending job rejects", async () => {
    let mode: "fail" | "ok" = "fail";
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          return new FakeWarmupWorker(mode) as unknown as Worker;
        }
      },
    );

    const warmPromise = warmMonuiWorker(OPTS);
    const claimPromise = claimMonuiWorker(OPTS, { onResult: () => undefined });

    await expect(claimPromise).rejects.toThrow("WASM failed");
    await warmPromise;

    expect(FakeWarmupWorker.instances).toHaveLength(1);
    expect(FakeWarmupWorker.instances[0]!.terminated).toBe(true);
    expect(getMonuiWarmupStatus().kind).toBe("failed");

    // Subsequent claim creates a fresh client rather than reusing cleared pending job
    mode = "ok";
    const recovered = await claimMonuiWorker(OPTS, { onResult: () => undefined });
    expect(FakeWarmupWorker.instances).toHaveLength(2);
    expect(recovered.getTelemetry().ready).toBe(true);
    expect(getMonuiWarmupStatus().kind).toBe("ready");
    recovered.close("done");
  });
});
