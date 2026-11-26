import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NIB_LANDMARK_INDEX,
  POINTER_LANDMARK_INDEX,
  T_GAP_MAX_MS,
  T_GAP_MIN_MS,
  chase,
  clickPointAt,
  createLossHold,
  createNibFilter,
  createOwnerLock,
  createPinchDetector,
  createPointerFilter,
  createRollbackBuffer,
  fromComputeSpace,
  isOpenHand,
  mapControlBox,
  pinchRatio,
  toComputeSpace,
  type Pt,
  type TimedPt,
  type Viewport,
} from "@/src/nui/sources/hand";

interface FixtureFrame {
  t: number;
  aspect: number;
  lm: ReadonlyArray<readonly [number, number]> | null;
  captureFrameId?: number;
}

interface LandmarkFixture {
  totalFrames: number;
  frames: ReadonlyArray<FixtureFrame>;
}

const VP: Viewport = { w: 1280, h: 720 };

function loadFixture(name: string): LandmarkFixture {
  const path = resolve(process.cwd(), "tests/fixtures", name);
  return JSON.parse(readFileSync(path, "utf8")) as LandmarkFixture;
}

function replayFixture(fixture: LandmarkFixture) {
  const ownerLock = createOwnerLock();
  const lossHold = createLossHold();
  const pointer = createPointerFilter();
  const pinch = createPinchDetector();
  const rollback = createRollbackBuffer();
  const nib = createNibFilter();

  let displayPt: Pt | null = null;
  let lastT: number | null = null;
  let lastCaptureId: number | undefined;
  let activeStroke: TimedPt[] | null = null;

  let trackedFrames = 0;
  let heldFrames = 0;
  let expiredCount = 0;
  let pinchOnCount = 0;
  let pinchOffCount = 0;
  let completedStrokes = 0;

  for (const frame of fixture.frames) {
    const dtMs = lastT === null ? 0 : Math.max(0, frame.t - lastT);
    lastT = frame.t;

    const unique =
      frame.captureFrameId === undefined ? true : frame.captureFrameId !== lastCaptureId;
    lastCaptureId = frame.captureFrameId;

    const lm: Pt[] | null =
      frame.lm && frame.lm.length === 21 ? frame.lm.map(([x, y]) => ({ x, y })) : null;
    const open = lm ? isOpenHand(lm, frame.aspect) : false;
    const hands = lm ? [{ id: 1, open }] : [];
    const owner = ownerLock.update(frame.t, hands, lossHold.tGap());
    const visible = owner !== null && lm !== null;
    const hold = lossHold.update(frame.t, visible, open);

    expect(lossHold.tGap()).toBeGreaterThanOrEqual(T_GAP_MIN_MS);
    expect(lossHold.tGap()).toBeLessThanOrEqual(T_GAP_MAX_MS);

    if (hold.expired) {
      expiredCount++;
      pointer.reset();
      pinch.reset();
      rollback.clear();
      nib.reset();
      if (activeStroke) {
        completedStrokes++;
        activeStroke = null;
      }
      continue;
    }

    if (hold.state === "held") {
      heldFrames++;
      expect(hold.frozen).toBe(true);
      continue;
    }

    if (hold.state !== "tracking" || !lm) continue;
    trackedFrames++;

    const r = pinchRatio(lm, frame.aspect);
    expect(r).not.toBeNull();
    const pRes = pinch.update(r!, frame.t, unique);
    expect(pRes.strength).toBeGreaterThanOrEqual(0);
    expect(pRes.strength).toBeLessThanOrEqual(1);

    const mcp5 = lm[POINTER_LANDMARK_INDEX]!;
    const filtered = pointer.update(mcp5, frame.t, pRes.pinch, frame.aspect, VP);
    expect(Number.isFinite(filtered.x) && Number.isFinite(filtered.y)).toBe(true);
    expect(filtered.x).toBeGreaterThanOrEqual(0);
    expect(filtered.x).toBeLessThanOrEqual(VP.w);
    expect(filtered.y).toBeGreaterThanOrEqual(0);
    expect(filtered.y).toBeLessThanOrEqual(VP.h);

    displayPt = displayPt ? chase(displayPt, filtered, dtMs) : filtered;
    expect(displayPt.x).toBeGreaterThanOrEqual(0);
    expect(displayPt.x).toBeLessThanOrEqual(VP.w);
    expect(displayPt.y).toBeGreaterThanOrEqual(0);
    expect(displayPt.y).toBeLessThanOrEqual(VP.h);

    rollback.push({ x: displayPt.x, y: displayPt.y, t: frame.t, hoverId: "canvas" });

    const tipRaw = mapControlBox(fromComputeSpace(toComputeSpace(lm[NIB_LANDMARK_INDEX]!, frame.aspect), frame.aspect), VP);
    const nibPt = nib.update(tipRaw, frame.t);
    expect(Number.isFinite(nibPt.x) && Number.isFinite(nibPt.y)).toBe(true);

    if (pRes.event === "on") {
      pinchOnCount++;
      const cp = clickPointAt(rollback, frame.t);
      expect(cp).not.toBeNull();
      expect(Number.isFinite(cp!.x) && Number.isFinite(cp!.y)).toBe(true);
      activeStroke = nib.begin(frame.t);
      expect(activeStroke.length).toBeGreaterThanOrEqual(1);
    } else if (pRes.pinch && activeStroke) {
      activeStroke.push(nibPt);
    } else if (pRes.event === "off") {
      pinchOffCount++;
      if (activeStroke) {
        const trimmed = nib.end(activeStroke, frame.t);
        expect(trimmed.length).toBeGreaterThanOrEqual(1);
        completedStrokes++;
        activeStroke = null;
      }
    }
  }

  return { trackedFrames, heldFrames, expiredCount, pinchOnCount, pinchOffCount, completedStrokes };
}

describe("R1 hand pipeline read-only smoke replay on repo fixtures", () => {
  it("replays t004-real-landmarks.json cleanly with tracking, pinches, holds, and expiries", () => {
    const summary = replayFixture(loadFixture("t004-real-landmarks.json"));
    expect(summary.trackedFrames).toBeGreaterThan(500);
    expect(summary.heldFrames).toBeGreaterThan(0);
    expect(summary.expiredCount).toBeGreaterThan(0);
    expect(summary.pinchOnCount).toBeGreaterThan(0);
    expect(summary.completedStrokes).toBeGreaterThan(0);
  });

  it("replays t002-draw-replay.json cleanly with finite outputs", () => {
    const summary = replayFixture(loadFixture("t002-draw-replay.json"));
    expect(summary.trackedFrames).toBeGreaterThan(0);
    expect(summary.pinchOnCount).toBeGreaterThanOrEqual(summary.pinchOffCount);
  });
});
