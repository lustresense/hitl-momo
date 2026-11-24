/**
 * Unit tests for MoNUI-7 YOLO module (`tests/nui-lab/monui7-yolo.test.ts`).
 *
 * Enforces T21:
 * - Letterbox math and coordinate inversion back to [0, 1] frame space.
 * - Padding 114 / 255 check.
 * - Parsing both end-to-end [1, N, 6] and standard [1, 5, N] output shapes.
 * - Score filtering with default 0.35 threshold.
 * - SHA-256 verification (matches vs rejects).
 * - STRICT: Uses synthetic tensors ONLY, zero external image files.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  YOLO_DEFAULT_CONFIDENCE,
  YOLO_INPUT_SIZE,
  YOLO_LETTERBOX_PAD,
  YOLO_MODEL_SHA256,
  YOLO_MODEL_URL,
  applyNms,
  computeIoU,
  letterboxRgbaToNchw,
  parseYoloOutput,
  unletterboxBox,
  verifySha256,
} from "../../src/components/nui-lab/bench/monui7-yolo";

describe("MoNUI-7 YOLO (T21) Unit Tests", () => {
  it("letterboxes 640x360 (16:9) correctly into 320x320 with pad 114", () => {
    const srcW = 640;
    const srcH = 360;
    const rgba = new Uint8ClampedArray(srcW * srcH * 4);

    // Set pixel (160, 90) to Red
    const idx = (90 * srcW + 160) * 4;
    rgba[idx] = 255; // R
    rgba[idx + 1] = 0; // G
    rgba[idx + 2] = 0; // B
    rgba[idx + 3] = 255;

    const { tensor, meta } = letterboxRgbaToNchw(rgba, srcW, srcH, 320, 114);

    expect(meta.scale).toBeCloseTo(320 / 640, 4); // 0.5
    expect(meta.newW).toBe(320);
    expect(meta.newH).toBe(180);
    expect(meta.padLeft).toBe(0);
    expect(meta.padTop).toBe(70); // (320 - 180) / 2 = 70

    // Top padding region (e.g. y = 10, x = 100) must be 114 / 255
    const padValExpected = 114 / 255;
    const topPadIdx = 10 * 320 + 100;
    expect(tensor[topPadIdx]).toBeCloseTo(padValExpected, 4); // R channel
    expect(tensor[320 * 320 + topPadIdx]).toBeCloseTo(padValExpected, 4); // G channel
    expect(tensor[2 * 320 * 320 + topPadIdx]).toBeCloseTo(padValExpected, 4); // B channel
  });

  it("letterboxes 480x640 (tall 3:4) correctly into 320x320", () => {
    const srcW = 480;
    const srcH = 640;
    const rgba = new Uint8ClampedArray(srcW * srcH * 4);

    const { meta } = letterboxRgbaToNchw(rgba, srcW, srcH, 320, 114);

    expect(meta.scale).toBeCloseTo(320 / 640, 4); // 0.5
    expect(meta.newW).toBe(240); // 480 * 0.5
    expect(meta.newH).toBe(320); // 640 * 0.5
    expect(meta.padLeft).toBe(40); // (320 - 240) / 2 = 40
    expect(meta.padTop).toBe(0);
  });

  it("unletterboxes box accurately back to full frame [0, 1] coordinates", () => {
    const meta = {
      srcW: 1920,
      srcH: 1080,
      newW: 320,
      newH: 180,
      padLeft: 0,
      padTop: 70,
      scale: 320 / 1920,
    };

    // A detection spanning 100x100 at center of active area (x: 110..210, y: 70+40..70+140)
    const box320: [number, number, number, number] = [110, 110, 210, 210];
    const frameBox = unletterboxBox(box320, meta);

    // x1 = (110 - 0) / 320 = 0.34375
    // y1 = (110 - 70) / 180 = 40 / 180 = 0.2222...
    // x2 = (210 - 0) / 320 = 0.65625
    // y2 = (210 - 70) / 180 = 140 / 180 = 0.7777...
    expect(frameBox[0]).toBeCloseTo(110 / 320, 4);
    expect(frameBox[1]).toBeCloseTo(40 / 180, 4);
    expect(frameBox[2]).toBeCloseTo(210 / 320, 4);
    expect(frameBox[3]).toBeCloseTo(140 / 180, 4);
  });

  it("parses end-to-end output shape [1, N, 6] and filters score >= 0.35", () => {
    const meta = {
      srcW: 640,
      srcH: 480,
      newW: 320,
      newH: 240,
      padLeft: 0,
      padTop: 40,
      scale: 0.5,
    };

    // 3 detections in [1, 3, 6]
    // Det 0: high score (0.85) -> KEEP
    // Det 1: below threshold (0.20) -> FILTER OUT
    // Det 2: moderate score (0.50) -> KEEP
    const data = new Float32Array([
      // bx1, by1, bx2, by2, score, classId
      10, 50, 100, 150, 0.85, 0,
      20, 60, 80, 120, 0.20, 0,
      50, 80, 150, 200, 0.50, 0,
    ]);

    const detections = parseYoloOutput(data, [1, 3, 6], meta, 0.35);

    expect(detections).toHaveLength(2);
    expect(detections[0]!.score).toBeCloseTo(0.85, 4);
    expect(detections[0]!.classId).toBe(0);
    expect(detections[1]!.score).toBeCloseTo(0.50, 4);
  });

  it("parses raw YOLO head output shape [1, 5, 4] (cx, cy, w, h, class0_score)", () => {
    const meta = {
      srcW: 320,
      srcH: 320,
      newW: 320,
      newH: 320,
      padLeft: 0,
      padTop: 0,
      scale: 1.0,
    };

    // Shape [1, 5, 3] -> 5 channels x 3 anchors
    // Channels:
    // ch0: cx = [100, 200, 50]
    // ch1: cy = [100, 200, 50]
    // ch2: w  = [40, 60, 20]
    // ch3: h  = [40, 60, 20]
    // ch4: s  = [0.80, 0.15, 0.45]
    const numAnchors = 3;
    const data = new Float32Array(5 * numAnchors);

    // cx
    data[0 * numAnchors + 0] = 100;
    data[0 * numAnchors + 1] = 200;
    data[0 * numAnchors + 2] = 50;

    // cy
    data[1 * numAnchors + 0] = 100;
    data[1 * numAnchors + 1] = 200;
    data[1 * numAnchors + 2] = 50;

    // w
    data[2 * numAnchors + 0] = 40;
    data[2 * numAnchors + 1] = 60;
    data[2 * numAnchors + 2] = 20;

    // h
    data[3 * numAnchors + 0] = 40;
    data[3 * numAnchors + 1] = 60;
    data[3 * numAnchors + 2] = 20;

    // score
    data[4 * numAnchors + 0] = 0.80;
    data[4 * numAnchors + 1] = 0.15; // filtered
    data[4 * numAnchors + 2] = 0.45;

    const detections = parseYoloOutput(data, [1, 5, 3], meta, 0.35);

    expect(detections).toHaveLength(2);
    expect(detections[0]!.score).toBeCloseTo(0.80, 4);
    // Box: cx=100, cy=100, w=40, h=40 -> [80, 80, 120, 120] -> [80/320, 80/320, 120/320, 120/320]
    expect(detections[0]!.box[0]).toBeCloseTo(80 / 320, 4);
    expect(detections[0]!.box[1]).toBeCloseTo(80 / 320, 4);
    expect(detections[0]!.box[2]).toBeCloseTo(120 / 320, 4);
    expect(detections[0]!.box[3]).toBeCloseTo(120 / 320, 4);

    expect(detections[1]!.score).toBeCloseTo(0.45, 4);
  });

  it("verifies SHA-256 correctly (matches on valid, fails on mismatch)", async () => {
    const testData = new TextEncoder().encode("monui7-yolo-sha256-test");
    const expected = "287531930fc90d76bf8f826b3f328cca0e900a70ff3e4905b800544908fc668c";

    const ok = await verifySha256(testData, expected);
    expect(ok).toBe(true);

    const fail = await verifySha256(testData, "0000000000000000000000000000000000000000000000000000000000000000");
    expect(fail).toBe(false);
  });

  it("verifies release ONNX model at public/models matches expected YOLO_MODEL_SHA256", async () => {
    const modelPath = resolve(process.cwd(), "public" + YOLO_MODEL_URL);
    const buffer = readFileSync(modelPath);
    const ok = await verifySha256(buffer, YOLO_MODEL_SHA256);
    expect(ok).toBe(true);
  });

  it("computes bounding box IoU accurately", () => {
    // Identical boxes -> IoU 1.0
    expect(computeIoU([0.1, 0.1, 0.5, 0.5], [0.1, 0.1, 0.5, 0.5])).toBeCloseTo(1.0, 5);

    // Disjoint boxes -> IoU 0.0
    expect(computeIoU([0.0, 0.0, 0.2, 0.2], [0.5, 0.5, 0.8, 0.8])).toBe(0.0);

    // Half-overlap box: [0, 0, 2, 1] & [1, 0, 3, 1] -> inter=1x1=1, union=2+2-1=3 -> IoU 1/3
    expect(computeIoU([0.0, 0.0, 0.2, 0.1], [0.1, 0.0, 0.3, 0.1])).toBeCloseTo(1 / 3, 4);
  });

  it("applies NMS suppressing overlapping boxes (IoU >= 0.5) to a single winning box", () => {
    // Two highly overlapping boxes (IoU > 0.8) for class 0
    // Box 1: score 0.90
    // Box 2: score 0.75
    const detections = [
      { box: [0.2, 0.2, 0.4, 0.4] as [number, number, number, number], score: 0.90, classId: 0 },
      { box: [0.21, 0.21, 0.41, 0.41] as [number, number, number, number], score: 0.75, classId: 0 },
      // Box 3: non-overlapping distinct hand, score 0.80
      { box: [0.6, 0.6, 0.8, 0.8] as [number, number, number, number], score: 0.80, classId: 0 },
    ];

    const result = applyNms(detections, 0.5);

    // Box 2 should be suppressed by Box 1
    expect(result).toHaveLength(2);
    expect(result[0]!.score).toBe(0.90);
    expect(result[1]!.score).toBe(0.80);
  });

  it("suppresses overlapping raw YOLO anchors via NMS in parseYoloOutput (two overlapping anchors -> 1 box)", () => {
    const meta = {
      srcW: 320,
      srcH: 320,
      newW: 320,
      newH: 320,
      padLeft: 0,
      padTop: 0,
      scale: 1.0,
    };

    // Shape [1, 5, 2] -> 2 overlapping anchors at the same hand location
    // Anchor 0: cx=100, cy=100, w=40, h=40, score=0.88
    // Anchor 1: cx=102, cy=101, w=41, h=40, score=0.72 (IoU > 0.80 with Anchor 0)
    const numAnchors = 2;
    const data = new Float32Array(5 * numAnchors);

    // cx
    data[0 * numAnchors + 0] = 100;
    data[0 * numAnchors + 1] = 102;
    // cy
    data[1 * numAnchors + 0] = 100;
    data[1 * numAnchors + 1] = 101;
    // w
    data[2 * numAnchors + 0] = 40;
    data[2 * numAnchors + 1] = 41;
    // h
    data[3 * numAnchors + 0] = 40;
    data[3 * numAnchors + 1] = 40;
    // score
    data[4 * numAnchors + 0] = 0.88;
    data[4 * numAnchors + 1] = 0.72;

    const detections = parseYoloOutput(data, [1, 5, 2], meta, 0.35, 0.5);

    // NMS must suppress anchor 1, leaving only anchor 0!
    expect(detections).toHaveLength(1);
    expect(detections[0]!.score).toBeCloseTo(0.88, 4);
    expect(detections[0]!.box[0]).toBeCloseTo(80 / 320, 4);
  });
});
