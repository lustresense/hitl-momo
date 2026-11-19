// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  median5,
  motionGatedTemporalEmaInPlace,
  reinhardExposureLutInPlace,
  sepMedian5RgbaInPlace,
} from "@/src/components/nui-lab/bench/r20-lowlight";
import { LabCpuWorkerClient } from "@/src/components/nui-lab/bench/r20-worker-client";
import { WorkerOwnerGuard, type WorkerPoint3 } from "@/src/components/nui-lab/bench/worker-owner-guard";

function makeHandAt(wx: number, wy: number, size = 0.20): WorkerPoint3[] {
  return Array.from({ length: 21 }, (_, i) => ({
    x: wx + (i === 0 ? 0 : ((i % 5) / 4) * size),
    y: wy + (i === 0 ? 0 : (Math.floor(i / 5) / 4) * size),
    z: 0,
  }));
}

describe("WorkerOwnerGuard (R20-FIX P0.3 bystander takeover audit)", () => {
  it("starts at numHands=2, locks to numHands=1 on lone owner, and runs periodic 2-hand bystander audit probes", () => {
    const guard = new WorkerOwnerGuard({ enabled: true, lockConfirmFrames: 3, auditIntervalFrames: 5, bystanderCooldownFrames: 10 });
    const owner = makeHandAt(0.5, 0.5, 0.22);
    const hd = [{ categoryName: "Right", score: 0.95 }];

    expect(guard.beforeDetect()).toBe(2);
    for (let i = 0; i < 3; i++) {
      guard.beforeDetect();
      guard.afterDetect([owner], hd);
    }
    expect(guard.activeNumHands).toBe(1);

    // Locked frames until periodic 2-hand audit fires
    for (let i = 0; i < 5; i++) {
      expect(guard.beforeDetect()).toBe(1);
      guard.afterDetect([owner], hd);
    }
    // Frame 6 triggers periodic 2-hand bystander sweep
    expect(guard.beforeDetect()).toBe(2);
    expect(guard.bystanderAudits).toBe(1);

    // Bystander hand sneaking close (within 0.10!) is discovered on the audit frame -> enters bystanderCooldown & stays numHands=2!
    const closeBystander = makeHandAt(0.58, 0.52, 0.22);
    const res = guard.afterDetect([owner, closeBystander], [...hd, { categoryName: "Right", score: 0.9 }]);
    expect(res.nextNumHands).toBe(2);
    expect(res.landmarks).toHaveLength(2); // BOTH hands forwarded to FullFrameHandLock!
    expect(guard.bystanderDetections).toBe(1);
    expect(guard.telemetry().bystanderCooldown).toBe(10);
  });

  it("rejects far spatial jump AND close-range hand-size jump fail-closed in numHands=1 mode", () => {
    const guard = new WorkerOwnerGuard({ enabled: true, lockConfirmFrames: 2, maxJump: 0.18, maxSizeRatio: 1.6 });
    const owner = makeHandAt(0.5, 0.5, 0.20);
    const hd = [{ categoryName: "Right", score: 0.95 }];

    for (let i = 0; i < 2; i++) {
      guard.beforeDetect();
      guard.afterDetect([owner], hd);
    }
    expect(guard.activeNumHands).toBe(1);

    // Close-range bystander with different depth/size (within 0.05 distance, but 2x larger!) -> MUST reject fail-closed!
    const closeBigBystander = makeHandAt(0.52, 0.52, 0.42);
    const rSize = guard.afterDetect([closeBigBystander], hd);
    expect(rSize.failClosedReason).toBe("owner-size-reject");
    expect(rSize.landmarks).toEqual([]);
    expect(rSize.nextNumHands).toBe(2);
    expect(guard.ownerSizeRejects).toBe(1);

    // Re-lock and test spatial jump > 0.18
    for (let i = 0; i < 2; i++) {
      guard.beforeDetect();
      guard.afterDetect([owner], hd);
    }
    expect(guard.activeNumHands).toBe(1);
    const farBystander = makeHandAt(0.85, 0.5, 0.20);
    const rJump = guard.afterDetect([farBystander], hd);
    expect(rJump.failClosedReason).toBe("owner-jump-reject");
    expect(rJump.landmarks).toEqual([]);
    expect(rJump.nextNumHands).toBe(2);
    expect(guard.ownerJumpRejects).toBe(1);
  });

  it("triggers immediate numHands=2 verification probe on high-confidence handedness flip at close range", () => {
    const guard = new WorkerOwnerGuard({ enabled: true, lockConfirmFrames: 2 });
    const owner = makeHandAt(0.5, 0.5, 0.20);
    for (let i = 0; i < 2; i++) {
      guard.beforeDetect();
      guard.afterDetect([owner], [{ categoryName: "Right", score: 0.95 }]);
    }
    expect(guard.activeNumHands).toBe(1);

    const flipped = guard.afterDetect([makeHandAt(0.52, 0.51, 0.20)], [{ categoryName: "Left", score: 0.92 }]);
    expect(flipped.triggeredHandednessProbe).toBe(true);
    expect(flipped.nextNumHands).toBe(2);
    expect(guard.handednessProbes).toBe(1);
  });
});

describe("R20-FIX chroma-preserving low-light primitives", () => {
  it("median5 computes exact median on all 120 permutations of [1,2,3,4,5]", () => {
    const perms: number[][] = [];
    const permute = (arr: number[], l = 0) => {
      if (l === arr.length) {
        perms.push([...arr]);
        return;
      }
      for (let i = l; i < arr.length; i++) {
        [arr[l], arr[i]] = [arr[i]!, arr[l]!];
        permute(arr, l + 1);
        [arr[l], arr[i]] = [arr[i]!, arr[l]!];
      }
    };
    permute([1, 2, 3, 4, 5]);
    expect(perms).toHaveLength(120);
    for (const p of perms) {
      expect(median5(p[0]!, p[1]!, p[2]!, p[3]!, p[4]!)).toBe(3);
    }
  });

  it("reinhardExposureLutInPlace lifts dark skin tones while preserving R > G > B chroma ratio", () => {
    const px = new Uint8ClampedArray([24, 16, 12, 255]); // dark skin pixel
    reinhardExposureLutInPlace(px, 0.08, 0.48);
    expect(px[0]!).toBeGreaterThan(80);
    expect(px[0]!).toBeGreaterThan(px[1]!);
    expect(px[1]!).toBeGreaterThan(px[2]!);
    // Must not wash out to gray (R - B stays substantial!)
    expect(px[0]! - px[2]!).toBeGreaterThan(25);
  });

  it("sepMedian5RgbaInPlace removes impulse noise spikes without shifting uniform regions", () => {
    const w = 9;
    const h = 9;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      buf[i * 4] = 80;
      buf[i * 4 + 1] = 60;
      buf[i * 4 + 2] = 40;
      buf[i * 4 + 3] = 255;
    }
    // Inject salt spike at center (4,4)
    const c = (4 * w + 4) * 4;
    buf[c] = 255;
    buf[c + 1] = 255;
    buf[c + 2] = 255;
    sepMedian5RgbaInPlace(buf, w, h);
    expect(buf[c]).toBe(80);
    expect(buf[c + 1]).toBe(60);
    expect(buf[c + 2]).toBe(40);
  });

  it("motionGatedTemporalEmaInPlace smooths small noise but snaps immediately on large motion (no ghosting)", () => {
    const prev = new Uint8ClampedArray([100, 100, 100, 255, 50, 50, 50, 255]);
    const curr = new Uint8ClampedArray([108, 108, 108, 255, 180, 180, 180, 255]); // pix0 small noise (+8), pix1 motion (+130)
    motionGatedTemporalEmaInPlace(curr, prev, 28);
    expect(curr[0]).toBe(103); // smoothed (3*108 + 5*100 + 4)>>3 = 103
    expect(curr[4]).toBe(180); // snapped immediately, zero ghosting
  });
});

describe("LabCpuWorkerClient lifecycle: inFlight<=1, visibility RELEASE_ALL, crash auto-restart", () => {
  it("handles init, enforces inFlight<=1, releases keys on visibilitychange, and recovers on worker error", async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: ErrorEvent) => void) | null = null;
      posted: unknown[] = [];
      terminated = false;
      constructor() {
        workers.push(this);
      }
      postMessage(msg: { type: string; sessionEpoch: number }) {
        this.posted.push(msg);
        if (msg.type === "INIT") {
          queueMicrotask(() => {
            this.onmessage?.({
              data: { type: "READY", sessionEpoch: msg.sessionEpoch, delegate: "CPU", gpuDelegateAttempted: false, gpuDelegateActive: false, numHands: 2 },
            } as MessageEvent);
          });
        }
      }
      terminate() {
        this.terminated = true;
      }
    }

    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close: vi.fn() })));
    const releases: string[] = [];
    const restarts: Array<{ reason: string; attempt: number }> = [];
    const client = new LabCpuWorkerClient({
      wasmRoot: "/mediapipe/wasm",
      modelUrl: "/models/hand_landmarker.task",
      preprocess: "a4",
      createWorker: () => new FakeWorker() as unknown as Worker,
      onResult: vi.fn(),
      onReleaseAll: (r) => releases.push(r),
      onWorkerRestart: (reason, attempt) => restarts.push({ reason, attempt }),
    });

    await client.init();
    expect(client.getTelemetry().ready).toBe(true);
    expect(client.getTelemetry().delegate).toBe("CPU");

    const fakeVideo = { readyState: 4, videoWidth: 640, videoHeight: 360 } as unknown as HTMLVideoElement;
    expect(await client.submitFrame(fakeVideo, 100)).toBe(true);
    // Second submit while first is in-flight MUST drop cleanly (inFlight<=1)
    expect(await client.submitFrame(fakeVideo, 116)).toBe(false);
    expect(client.getTelemetry().maxInFlightObserved).toBe(1);
    expect(client.getTelemetry().framesDroppedBusy).toBe(1);

    // Tab hidden triggers fail-closed RELEASE_ALL
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(releases).toContain("browser-hidden");
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });

    // Simulate worker crash -> fail-closed RELEASE_ALL + automatic respawn!
    workers[0]!.onerror?.({ message: "wasm trap" } as ErrorEvent);
    await new Promise((r) => setTimeout(r, 20));
    expect(releases).toContain("worker-onerror");
    expect(restarts).toHaveLength(1);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
    expect(client.getTelemetry().ready).toBe(true);
    expect(client.getTelemetry().workerRestarts).toBe(1);

    client.close("test-end");
    expect(workers[1]!.terminated).toBe(true);
    vi.unstubAllGlobals();
  });
});
