// @vitest-environment jsdom
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BENCH_EXPORT_SCHEMA,
  BENCH_EXPORT_SCHEMA_V1,
  BENCH_EXPORT_SCHEMA_V2_1,
  BENCH_EXPORT_SCHEMA_V2_2,
} from "@/src/components/nui-lab/bench/schema";
import {
  reanalyzeExport,
  validateExportFile,
  verifyExportChecksum,
} from "@/src/components/nui-lab/bench/export";
import { BenchSessionManager } from "@/src/components/nui-lab/bench/manager";
import { MemoryBenchStore } from "@/src/components/nui-lab/bench/store";
import { buildEngineConfig } from "@/src/components/nui-lab/bench/engines";

const APP = { version: "0.29.1-alpha+r23-monui7", gitCommit: "r23monui7test" };
const ENV = {
  userAgentFamily: "Chromium",
  platform: "Linux",
  hardwareConcurrency: 8,
  deviceMemoryGb: 16,
  devicePixelRatio: 1,
  viewport: { w: 1280, h: 720 },
  secureContext: true,
  storage: "memory-only" as const,
};
const CAM = { width: 1280, height: 720, frameRate: 30, deviceClass: "physical-presumed" as const };

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return await blob.text();
  const reader = new FileReader();
  return new Promise((res, rej) => {
    reader.onload = () => res(reader.result as string);
    reader.onerror = () => rej(reader.error);
    reader.readAsText(blob);
  });
}

describe("K8 v2.2 Telemetry & Multi-version Reader Compatibility (T25)", () => {
  it("exports contractVersion K8-v2.2 and schemaVersion nui-lab-bench-export/2.2 with SHA-256 integrity", async () => {
    const store = new MemoryBenchStore();
    let clock = 100;
    const mgr = new BenchSessionManager({
      openStore: async () => store,
      now: () => clock,
      wallMinuteIso: () => "2026-11-20T18:00:00.000Z",
    });

    await mgr.startSession({ consent: true, app: APP, environment: ENV });

    mgr.beginTrial({
      route: "canvas",
      source: "canvas-lab",
      engine: buildEngineConfig("r20-c4", "raw", "cpu-worker", true),
      camera: CAM,
    });

    // Record frame with MoNUI-7 v2.2 fields
    clock = 150;
    mgr.recordFrame({
      fid: 1,
      session: 1,
      lock: "LOCKED",
      t: 150,
      aspect: 16 / 9,
      rawPose: "pinch",
      stablePose: "pinch",
      fingers: 2,
      fingersLegacy: 2,
      fingerStates: ["closed", "touching", "touching", "open", "open"],
      thumb: { legacyRatio: 1.2, lateral: 1.2, ipAngleDeg: 160, open: true },
      pinchRatio: 0.12,
      r19State: "POINT_PRESS",
      r19SubClass: "pinch",
      vkeyEvent: "NONE",
      r19Probs: { ready: 0.05, press: 0.95, other: 0.0 },
      truth: "UNLABELLED",
      reject: "none",
      action: "draw",
      lm: Array.from({ length: 21 }, () => [0.5, 0.5]),
      det: "HAND",
      hands: 1,
      farHands: 0,
      luma: { mean: 0.5, center: 0.5, backlight: false, pass: "A0_raw" },
      timing: { mpMs: 15, preMs: 3, workerMs: 18, classifierMs: 0.1, pipelineMs: 20 },
      top3: [{ label: "pinch", p: 0.95 }],
      direction: "NEUTRAL",
      geometry: { pinchActive: true, eraseActive: false, swipe: null, thumbUp: false, isPinch: true },
      fsm: { state: "PINCH", event: "NONE", zone: "canvas", left: false, right: false, jump: false, releaseReason: null },
      rejectDetail: "none",
      jitter: null,
      droppedSincePrev: 0,
      // MoNUI-7 Lampiran E fields:
      rescueState: "NORMAL",
      yoloRan: false,
      yoloMs: null,
      yoloScore: null,
      cropTried: false,
      cropSuccess: false,
      positionOnly: null,
      guideState: "LOCKED",
    });

    // MoNUI-7 events
    mgr.event("RESCUE_START", { reason: "miss_100ms" }, "system");
    mgr.event("PRESET_CHANGED", { from: "default-any-pinch", to: "ok-pinch-only", source: "user" }, "system");
    mgr.event("GUIDE_PROMPT", { id: "LOCKED" }, "system");

    await mgr.finishSession("user-finish");

    const blob = await mgr.exportAll(APP);
    const text = await readBlobText(blob);
    const parsed = JSON.parse(text);

    // Assert v2.2 schema and contract headers
    expect(parsed.schema).toBe(BENCH_EXPORT_SCHEMA);
    expect(parsed.schemaVersion).toBe(BENCH_EXPORT_SCHEMA_V2_2);
    expect(parsed.contractVersion).toBe("K8-v2.2");

    // Cryptographic checksum verification
    const checksum = await verifyExportChecksum(text);
    expect(checksum.ok).toBe(true);

    // Export validation and reanalysis
    const problems = validateExportFile(parsed);
    expect(problems).toEqual([]);

    const re = reanalyzeExport(parsed);
    expect(re.ok).toBe(true);

    // Write synthetic v2.2 export fixture to disk
    const fixturePath = resolve(__dirname, "../fixtures/synthetic-k8-v2-2-export.json");
    writeFileSync(fixturePath, text, "utf8");
    expect(readFileSync(fixturePath, "utf8")).toBe(text);
  });

  it("reader maintains compatibility across v1, v2, v2.1, and v2.2", () => {
    // 1. v1 compatibility
    const v1Path = resolve(__dirname, "../fixtures/bench-v1-compat-sample.json");
    const v1Parsed = JSON.parse(readFileSync(v1Path, "utf8"));
    expect(v1Parsed.schema).toBe(BENCH_EXPORT_SCHEMA_V1);
    expect(validateExportFile(v1Parsed)).toEqual([]);
    expect(reanalyzeExport(v1Parsed).ok).toBe(true);

    // 2. v2 compatibility (constructed clone with schema "nui-lab-bench-export/2")
    const v2Clone = JSON.parse(JSON.stringify(v1Parsed));
    v2Clone.schema = BENCH_EXPORT_SCHEMA;
    v2Clone.contentSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    v2Clone.app = { version: "0.29.1", gitCommit: "abc1234" };
    for (const sess of v2Clone.sessions) {
      for (const fr of sess.frames) {
        fr.labelSource = "RULE_DERIVED";
      }
    }
    expect(validateExportFile(v2Clone)).toEqual([]);

    // 3. v2.1 compatibility
    const v21Clone = JSON.parse(JSON.stringify(v2Clone));
    v21Clone.schemaVersion = BENCH_EXPORT_SCHEMA_V2_1;
    v21Clone.contractVersion = "K8-v2.1";
    expect(validateExportFile(v21Clone)).toEqual([]);

    // 4. v2.2 compatibility
    const v22Path = resolve(__dirname, "../fixtures/synthetic-k8-v2-2-export.json");
    const v22Parsed = JSON.parse(readFileSync(v22Path, "utf8"));
    expect(v22Parsed.schemaVersion).toBe(BENCH_EXPORT_SCHEMA_V2_2);
    expect(v22Parsed.contractVersion).toBe("K8-v2.2");
    expect(validateExportFile(v22Parsed)).toEqual([]);
    expect(reanalyzeExport(v22Parsed).ok).toBe(true);
  });
});
