/**
 * Unit tests for MoNUI-7 Rescue State Machine (`tests/nui-lab/monui7-rescue.test.ts`).
 *
 * Enforces T22 & Lampiran A:
 * - NORMAL -> miss >= 100ms -> SEARCH
 * - SEARCH -> mpHand present -> NORMAL
 * - SEARCH -> box >= 0.35 & crop 21 points -> RESCUE_TRACK
 * - SEARCH -> box present & crop null >= 500ms -> POSITION_ONLY
 * - SEARCH -> no box & no crop >= 2000ms -> LOST
 * - RESCUE_TRACK -> mpHand present -> NORMAL
 * - RESCUE_TRACK -> crop fails 3 times in a row -> SEARCH
 * - POSITION_ONLY -> crop provides 21 points -> RESCUE_TRACK
 * - POSITION_ONLY -> mpHand present -> NORMAL
 * - POSITION_ONLY -> box absent >= 2000ms -> LOST
 * - LOST -> mpHand present -> NORMAL
 * - LOST -> box + points present -> RESCUE_TRACK
 * - Crop square math: scale 1.6, aspect 1:1, clamping to [0, 1]
 * - Landmark unmapping precision
 */
import { describe, expect, it } from "vitest";
import {
  CROP_SCALE,
  LOST_PROMPT_AFTER_MS,
  POSITION_ONLY_AFTER_MS,
  RESCUE_ENTER_MISS_MS,
  RESCUE_TRACK_MAX_FAILS,
  RescueFSM,
  YOLO_INTERVAL_MS,
  YOLO_MIN_SCORE,
  computeCropSquareFromBox,
  computeCropSquareFromLandmarks,
  unmapLandmarksFromCrop,
} from "../../src/components/nui-lab/bench/monui7-rescue";

function makeDummyPoints(n = 21, base = 0.5): Array<{ x: number; y: number; z: number }> {
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: base + (i % 5) * 0.02, y: base + Math.floor(i / 5) * 0.02, z: 0 });
  }
  return pts;
}

describe("MoNUI-7 Rescue State Machine (T22 / Lampiran A)", () => {
  it("exports required prototype constants with exact values", () => {
    expect(RESCUE_ENTER_MISS_MS).toBe(100);
    expect(YOLO_INTERVAL_MS).toBe(200);
    expect(YOLO_MIN_SCORE).toBe(0.35);
    expect(CROP_SCALE).toBe(1.6);
    expect(POSITION_ONLY_AFTER_MS).toBe(500);
    expect(LOST_PROMPT_AFTER_MS).toBe(2000);
    expect(RESCUE_TRACK_MAX_FAILS).toBe(3);
  });

  it("schedules YOLO strictly in SEARCH window at 5Hz (200ms) and skips on pending camera frame", () => {
    const fsm = new RescueFSM("SEARCH");

    // t=0: first tick in SEARCH -> shouldRunYolo is true
    let res = fsm.update({ t: 0, mpHand: false });
    expect(res.shouldRunYolo).toBe(true);

    // t=100: < 200ms elapsed -> shouldRunYolo is false (5 Hz limit)
    res = fsm.update({ t: 100, mpHand: false });
    expect(res.shouldRunYolo).toBe(false);

    // t=200: >= 200ms elapsed but camera frame pending -> shouldRunYolo is false!
    res = fsm.update({ t: 200, mpHand: false, hasPendingFrame: true });
    expect(res.shouldRunYolo).toBe(false);

    // t=210: pending cleared and >= 200ms elapsed -> shouldRunYolo is true
    res = fsm.update({ t: 210, mpHand: false, hasPendingFrame: false });
    expect(res.shouldRunYolo).toBe(true);

    // After running at t=210, next run requires >= 410ms
    res = fsm.update({ t: 300, mpHand: false });
    expect(res.shouldRunYolo).toBe(false);
  });

  it("does NOT run YOLO in LOST state", () => {
    const fsm = new RescueFSM("LOST");

    // In LOST state, shouldRunYolo must always be false
    const res = fsm.update({ t: 1000, mpHand: false });
    expect(res.state).toBe("LOST");
    expect(res.shouldRunYolo).toBe(false);
  });

  it("transitions NORMAL -> SEARCH after missing hand >= 100ms", () => {
    const fsm = new RescueFSM("NORMAL");
    expect(fsm.state).toBe("NORMAL");

    // Frame at t=0: hand missing, but not yet 100ms
    let res = fsm.update({ t: 0, mpHand: false });
    expect(res.state).toBe("NORMAL");
    expect(res.event).toBeNull();

    // Frame at t=50: still NORMAL
    res = fsm.update({ t: 50, mpHand: false });
    expect(res.state).toBe("NORMAL");

    // Frame at t=100: reaches 100ms -> transitions to SEARCH
    res = fsm.update({ t: 100, mpHand: false });
    expect(res.state).toBe("SEARCH");
    expect(res.event).toBe("RESCUE_START");
  });

  it("transitions SEARCH -> NORMAL immediately when mpHand reappears", () => {
    const fsm = new RescueFSM("SEARCH");

    const res = fsm.update({ t: 200, mpHand: true });
    expect(res.state).toBe("NORMAL");
  });

  it("transitions SEARCH -> RESCUE_TRACK when YOLO box >= 0.35 and crop gives 21 points", () => {
    const fsm = new RescueFSM("SEARCH");
    const points21 = makeDummyPoints(21);

    const res = fsm.update({
      t: 200,
      mpHand: false,
      yolo: { box: [0.3, 0.3, 0.7, 0.7], score: 0.65 },
      crop: points21,
    });

    expect(res.state).toBe("RESCUE_TRACK");
    expect(res.event).toBe("RESCUE_SUCCESS");
    expect(res.cropBox).toBeDefined();
  });

  it("transitions SEARCH -> POSITION_ONLY when box present but no landmarks for >= 500ms", () => {
    const fsm = new RescueFSM("SEARCH");

    // t=0: YOLO sees box
    let res = fsm.update({
      t: 0,
      mpHand: false,
      yolo: { box: [0.4, 0.4, 0.6, 0.6], score: 0.5 },
      crop: null,
    });
    expect(res.state).toBe("SEARCH");

    // t=400: still SEARCH
    res = fsm.update({
      t: 400,
      mpHand: false,
      yolo: { box: [0.4, 0.4, 0.6, 0.6], score: 0.5 },
      crop: null,
    });
    expect(res.state).toBe("SEARCH");

    // t=500: >= 500ms -> POSITION_ONLY
    res = fsm.update({
      t: 500,
      mpHand: false,
      yolo: { box: [0.4, 0.4, 0.6, 0.6], score: 0.5 },
      crop: null,
    });
    expect(res.state).toBe("POSITION_ONLY");
    expect(res.event).toBe("POSITION_ONLY_ENTER");
    expect(res.positionOnly).toEqual({ cx: 0.5, cy: 0.5, score: 0.5 });
  });

  it("transitions SEARCH -> LOST when neither box nor points for >= 2000ms", () => {
    const fsm = new RescueFSM("SEARCH");

    // t=0
    let res = fsm.update({ t: 0, mpHand: false, yolo: null, crop: null });
    expect(res.state).toBe("SEARCH");

    // t=1900
    res = fsm.update({ t: 1900, mpHand: false, yolo: null, crop: null });
    expect(res.state).toBe("SEARCH");

    // t=2000: >= 2000ms -> LOST
    res = fsm.update({ t: 2000, mpHand: false, yolo: null, crop: null });
    expect(res.state).toBe("LOST");
    expect(res.event).toBe("RESCUE_FAIL");
  });

  it("transitions RESCUE_TRACK -> SEARCH after 3 consecutive crop failures", () => {
    const fsm = new RescueFSM("RESCUE_TRACK");

    // Fail 1
    let res = fsm.update({ t: 100, mpHand: false, crop: null });
    expect(res.state).toBe("RESCUE_TRACK");

    // Fail 2
    res = fsm.update({ t: 200, mpHand: false, crop: null });
    expect(res.state).toBe("RESCUE_TRACK");

    // Fail 3 -> transitions back to SEARCH
    res = fsm.update({ t: 300, mpHand: false, crop: null });
    expect(res.state).toBe("SEARCH");
  });

  it("transitions POSITION_ONLY -> RESCUE_TRACK when crop succeeds", () => {
    const fsm = new RescueFSM("POSITION_ONLY");
    const points21 = makeDummyPoints(21);

    const res = fsm.update({
      t: 100,
      mpHand: false,
      yolo: { box: [0.4, 0.4, 0.6, 0.6], score: 0.5 },
      crop: points21,
    });

    expect(res.state).toBe("RESCUE_TRACK");
    expect(res.event).toBe("POSITION_ONLY_EXIT");
  });

  it("transitions LOST -> NORMAL on mpHand or RESCUE_TRACK on box+points", () => {
    const fsm1 = new RescueFSM("LOST");
    let res = fsm1.update({ t: 100, mpHand: true });
    expect(res.state).toBe("NORMAL");

    const fsm2 = new RescueFSM("LOST");
    const points21 = makeDummyPoints(21);
    res = fsm2.update({
      t: 100,
      mpHand: false,
      yolo: { box: [0.4, 0.4, 0.6, 0.6], score: 0.5 },
      crop: points21,
    });
    expect(res.state).toBe("RESCUE_TRACK");
  });

  it("computes square crop with 1.6x scale clamped to [0, 1]", () => {
    // Centered 0.2 x 0.2 box: cx=0.5, cy=0.5. Side = 0.2 * 1.6 = 0.32
    const crop = computeCropSquareFromBox([0.4, 0.4, 0.6, 0.6], 1.6);
    expect(crop[0]).toBeCloseTo(0.5 - 0.16, 4); // 0.34
    expect(crop[1]).toBeCloseTo(0.5 - 0.16, 4); // 0.34
    expect(crop[2]).toBeCloseTo(0.5 + 0.16, 4); // 0.66
    expect(crop[3]).toBeCloseTo(0.5 + 0.16, 4); // 0.66

    // Near border: should clamp to 0 and 1
    const nearBorder = computeCropSquareFromBox([0.05, 0.05, 0.25, 0.25], 1.6);
    expect(nearBorder[0]).toBe(0); // clamped at 0
    expect(nearBorder[1]).toBe(0);
  });

  it("unmaps landmarks from crop coordinates back to full frame accurately", () => {
    const crop: [number, number, number, number] = [0.2, 0.3, 0.6, 0.7]; // width 0.4, height 0.4
    const pts = [{ x: 0.5, y: 0.5, z: 0.1 }]; // center of crop

    const unmapped = unmapLandmarksFromCrop(pts, crop);
    // frameX = 0.2 + 0.5 * 0.4 = 0.40
    // frameY = 0.3 + 0.5 * 0.4 = 0.50
    expect(unmapped[0]!.x).toBeCloseTo(0.40, 4);
    expect(unmapped[0]!.y).toBeCloseTo(0.50, 4);
  });
});
