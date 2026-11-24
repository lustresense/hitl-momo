// @vitest-environment jsdom
/**
 * R23-HF2 Erase Resilience & Radius Unit & Replay Tests (`tests/nui-lab/hf2-erase-resilience.test.ts`).
 *
 * Enforces R23-HF2 Requirements:
 * 1. When ERASE is active and hand is lost <= 300 ms, erase is continued at last position (like ink grace), then stops if loss > 300 ms.
 * 2. Erase cursor uses the same One-Euro filter as ink cursor.
 * 3. Radius hapus x1.5: DEFAULT_LAB_ERASER_CSS_PX = 24 (48 canvas px).
 * 4. Replay test on erase segment from S-023fb796 (T003): erase does not break across brief losses <= 300 ms.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateR19Model } from "@/src/components/nui-lab/r19/r19_loader";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import type { Landmark, StrokeStore } from "@/src/input/types";
import { MEDIAN_SKELETONS, placeHand } from "../input/realistic-hands";

const R20_C4_MODEL = validateR19Model(
  JSON.parse(readFileSync(resolve(process.cwd(), "public/models/r20-c4-model.json"), "utf8")),
);

/**
 * Helper to inspect StrokeStore erase pass status during unit & replay tests.
 * Cast is used because LabAnalyzer.store is private and no public isErasing getter exists
 * (Rule 1: keep production code unchanged, permit `as unknown as {...}` in test).
 */
function isStoreErasing(analyzer: LabAnalyzer): boolean {
  return (analyzer as unknown as { store: StrokeStore }).store.isErasing();
}

function toLandmarks(pairs: Array<[number, number]> | null): Landmark[] | undefined {
  if (!pairs || pairs.length < 21) return undefined;
  return pairs.map(([x, y]) => ({ x, y, z: 0 }));
}

describe("R23-HF2 Erase Resilience & Motion Smoothing", () => {
  it("enforces eraser radius x1.5 (24 CSS px, 48 canvas px)", () => {
    const analyzer = new LabAnalyzer({ route: "canvas", fullFrameLock: true, enableInk: true });
    analyzer.enableR19(R20_C4_MODEL, 0);
    expect(analyzer.eraserRadiusCanvasPx).toBe(48);
    const snap = analyzer.snapshot(100);
    expect(snap.eraserRadiusCanvasPx).toBe(48);
  });

  it("replays S-023fb796-T003 erase segment without breaking across short losses <= 300ms", () => {
    const fixturePath = resolve(__dirname, "../fixtures/s023-t003-erase-segment.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const fixture = JSON.parse(raw) as {
      trialId: string;
      frames: Array<{
        fid: number;
        t: number;
        actionIntent: string;
        actionAccepted: boolean;
        actionRejectedReason: string | null;
        lm: Array<[number, number]> | null;
      }>;
    };

    const analyzer = new LabAnalyzer({
      route: "canvas",
      fullFrameLock: true,
      enableInk: true,
      preset: "default-any-pinch",
    });
    analyzer.enableR19(R20_C4_MODEL, 0);

    const aspect = 16 / 9;

    // Add initial stroke to canvas
    analyzer.beginPointerStroke({ x: 300, y: 300 });
    analyzer.movePointerStroke({ x: 400, y: 400 });
    analyzer.endPointerStroke();
    expect(analyzer.strokes().completed.length).toBe(1);

    // Initial hand entrance: acquire and arm with fist sharing exact wrist and scale as f0Lm, then transition to FIVE
    const f0Lm = toLandmarks(fixture.frames[0]!.lm)!;
    const span = Math.hypot((f0Lm[9]!.x - f0Lm[0]!.x) * (16 / 9), f0Lm[9]!.y - f0Lm[0]!.y);
    const armingFist = placeHand(MEDIAN_SKELETONS.fist, {
      cx: f0Lm[0]!.x,
      cy: f0Lm[0]!.y,
      span,
      aspect: 16 / 9,
    });
    analyzer.analyse({ landmarks: [armingFist], inferMs: 10, nowMs: 190200, aspect });
    analyzer.analyse({ landmarks: [armingFist], inferMs: 10, nowMs: 190280, aspect });

    let shortLossCount = 0;
    let postLossReacquireCount = 0;
    let eraseActiveFrames = 0;

    for (let i = 0; i < fixture.frames.length; i++) {
      const f = fixture.frames[i]!;
      const lm = toLandmarks(f.lm);
      analyzer.analyse({
        landmarks: lm ? [lm] : [],
        inferMs: 10,
        nowMs: f.t,
        aspect,
      });
      const snap = analyzer.snapshot(f.t);
      const res = snap.actionResolution;

      if (!lm) {
        // Brief loss frame (fids 517, 522, 524)
        shortLossCount++;
        expect(snap.actionIntent).toBe("ERASE");
        expect(snap.actionAccepted).toBe(true);
        expect(res.allowEraseMutation).toBe(true);
        expect(res.inLossGrace).toBe(true);
        // Store must still be actively erasing during short loss grace!
        expect(isStoreErasing(analyzer)).toBe(true);
      } else if (i > 0 && !fixture.frames[i - 1]!.lm) {
        // First frame returning from brief loss (fids 518, 523, 525)
        // In buggy R23-HF1, these were rejected with "Telapak hapus butuh stabil >= 160 ms"
        postLossReacquireCount++;
        expect(snap.actionIntent).toBe("ERASE");
        expect(snap.actionAccepted).toBe(true);
        expect(res.allowEraseMutation).toBe(true);
        expect(isStoreErasing(analyzer)).toBe(true);
      }

      if (isStoreErasing(analyzer)) {
        eraseActiveFrames++;
      }
    }

    expect(shortLossCount).toBe(3); // fids 517, 522, 524
    expect(postLossReacquireCount).toBe(3); // fids 518, 523, 525
    // Once established at fid 505, erase remains active continuously through fid 533 (27 frames)
    expect(eraseActiveFrames).toBeGreaterThanOrEqual(27);
  });

  it("stops erase cleanly when hand loss exceeds 300ms", () => {
    const fixturePath = resolve(__dirname, "../fixtures/s023-t003-erase-segment.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const fixture = JSON.parse(raw);

    const analyzer = new LabAnalyzer({
      route: "canvas",
      fullFrameLock: true,
      enableInk: true,
    });
    analyzer.enableR19(R20_C4_MODEL, 0);
    const aspect = 16 / 9;

    // Establish active erase using frames from fixture after arming
    const f0Lm = toLandmarks(fixture.frames[0]!.lm)!;
    const span = Math.hypot((f0Lm[9]!.x - f0Lm[0]!.x) * (16 / 9), f0Lm[9]!.y - f0Lm[0]!.y);
    const armingFist = placeHand(MEDIAN_SKELETONS.fist, {
      cx: f0Lm[0]!.x,
      cy: f0Lm[0]!.y,
      span,
      aspect: 16 / 9,
    });
    analyzer.analyse({ landmarks: [armingFist], inferMs: 10, nowMs: 190200, aspect });
    analyzer.analyse({ landmarks: [armingFist], inferMs: 10, nowMs: 190280, aspect });

    for (let i = 0; i < 4; i++) {
      const f = fixture.frames[i]!;
      analyzer.analyse({
        landmarks: [toLandmarks(f.lm)!],
        inferMs: 10,
        nowMs: f.t,
        aspect,
      });
    }
    const lastTrackedT = fixture.frames[3]!.t;
    expect(isStoreErasing(analyzer)).toBe(true);

    // Short loss at 200ms into loss (lastTrackedT + 200ms <= 300ms) -> within 300ms grace -> still erasing
    analyzer.analyse({ landmarks: [], inferMs: 10, nowMs: lastTrackedT + 30, aspect });
    analyzer.analyse({ landmarks: [], inferMs: 10, nowMs: lastTrackedT + 200, aspect });
    expect(isStoreErasing(analyzer)).toBe(true);

    // Hand loss exceeds 300ms (lastTrackedT + 350ms > 300ms) -> grace expires, erase stops!
    analyzer.analyse({ landmarks: [], inferMs: 10, nowMs: lastTrackedT + 350, aspect });
    expect(isStoreErasing(analyzer)).toBe(false);
  });

  it("applies One-Euro smoothing filter to erase cursor position", () => {
    const analyzer = new LabAnalyzer({
      route: "canvas",
      cursorFilterMode: "one-euro",
      fullFrameLock: true,
      enableInk: true,
    });
    analyzer.enableR19(R20_C4_MODEL, 0);
    const aspect = 16 / 9;

    const armingFist = placeHand(MEDIAN_SKELETONS.fist, { cx: 0.5, cy: 0.5, aspect });
    analyzer.analyse({ landmarks: [armingFist], inferMs: 10, nowMs: 1000, aspect });
    analyzer.analyse({ landmarks: [armingFist], inferMs: 10, nowMs: 1050, aspect });

    // Initial palm position at cx: 0.5, cy: 0.5 for >= 160ms to establish erase
    const palm1 = placeHand(MEDIAN_SKELETONS.palm, { cx: 0.5, cy: 0.5, aspect });
    analyzer.analyse({ landmarks: [palm1], inferMs: 10, nowMs: 1100, aspect });
    analyzer.analyse({ landmarks: [palm1], inferMs: 10, nowMs: 1150, aspect });
    analyzer.analyse({ landmarks: [palm1], inferMs: 10, nowMs: 1200, aspect });
    analyzer.analyse({ landmarks: [palm1], inferMs: 10, nowMs: 1270, aspect });
    const snap1 = analyzer.snapshot(1270);
    expect(snap1.actionIntent).toBe("ERASE");
    expect(snap1.actionAccepted).toBe(true);
    expect(isStoreErasing(analyzer)).toBe(true);
    expect(snap1.cursor).not.toBeNull();
    expect(snap1.cursor!.erasing).toBe(true);

    // Shift palm to cx: 0.58 at t=1300ms (jump = 0.08 <= MAX_JUMP 0.15)
    const palm2 = placeHand(MEDIAN_SKELETONS.palm, { cx: 0.58, cy: 0.5, aspect });
    analyzer.analyse({ landmarks: [palm2], inferMs: 10, nowMs: 1300, aspect });
    const snap2 = analyzer.snapshot(1300);

    expect(snap2.cursor).not.toBeNull();
    expect(snap2.cursor!.erasing).toBe(true);
    // Palm center normalizes with horizontal camera mirror (1 - x), so moving camera cx 0.5 -> 0.58
    // moves canvas cursor left (higher camera x -> lower canvas x).
    // One-Euro filter smooths the cursor: response is between previous x and target raw x (~576 px).
    expect(snap2.cursor!.x).toBeLessThan(snap1.cursor!.x);
    expect(snap2.cursor!.x).toBeGreaterThan(570);
  });
});
