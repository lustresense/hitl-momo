import { describe, expect, it } from "vitest";
import {
  REACQUIRE_OPEN_FRAMES,
  T_GAP_MAX_MS,
  T_GAP_MIN_MS,
  createLossHold,
  tGapFor,
} from "@/src/nui/sources/hand";

describe("tGapFor (clamp(3 * medianDt, 250, 500))", () => {
  it("matches R1 bounds and clamps fast/slow camera dts", () => {
    expect(T_GAP_MIN_MS).toBe(250);
    expect(T_GAP_MAX_MS).toBe(500);
    expect(REACQUIRE_OPEN_FRAMES).toBe(2);

    expect(tGapFor([])).toBe(250);
    expect(tGapFor([33, 33, 33])).toBe(250); // 3 * 33 = 99 -> 250
    expect(tGapFor([100, 100, 100])).toBe(300); // 3 * 100 = 300
    expect(tGapFor([140, 140, 140])).toBe(420); // 3 * 140 = 420
    expect(tGapFor([200, 200, 200])).toBe(500); // 3 * 200 = 600 -> 500
  });

  it("computes true median for unsorted even/odd lists and ignores non-positive/NaN values", () => {
    expect(tGapFor([120, 80])).toBe(300); // median 100 -> 300
    expect(tGapFor([1000, 110, 100, 120, 105])).toBe(330); // sorted [100,105,110,120,1000], median 110 -> 330
    expect(tGapFor([-50, 0, Number.NaN, 120, 120])).toBe(360);
    expect(tGapFor([0, -10, Number.NaN])).toBe(250);
  });
});

describe("createLossHold", () => {
  it("requires >= 2 consecutive open frames to start tracking from idle", () => {
    const hold = createLossHold();
    expect(hold.update(0, false, false)).toEqual({ state: "idle", frozen: false, expired: false });
    // Closed hand never acquires
    expect(hold.update(33, true, false)).toEqual({ state: "idle", frozen: false, expired: false });
    expect(hold.update(66, true, false)).toEqual({ state: "idle", frozen: false, expired: false });
    // 1 open frame -> still idle; interrupted by closed -> resets
    expect(hold.update(99, true, true)).toEqual({ state: "idle", frozen: false, expired: false });
    expect(hold.update(132, true, false)).toEqual({ state: "idle", frozen: false, expired: false });
    // 2 consecutive open frames -> tracking!
    expect(hold.update(165, true, true)).toEqual({ state: "idle", frozen: false, expired: false });
    expect(hold.update(198, true, true)).toEqual({ state: "tracking", frozen: false, expired: false });
  });

  it("freezes cursor without expiring during <= T_gap and resumes tracking immediately on return", () => {
    const hold = createLossHold();
    // Acquire at 33ms cadence (T_gap = 250ms)
    hold.update(0, true, true);
    expect(hold.update(33, true, true).state).toBe("tracking");
    expect(hold.update(66, true, false).state).toBe("tracking"); // pinching while tracked is fine
    expect(hold.tGap()).toBe(250);

    // Lost at t=100..316 (elapsed 250ms === T_gap -> still held!)
    expect(hold.update(100, false, false)).toEqual({ state: "held", frozen: true, expired: false });
    expect(hold.update(200, false, false)).toEqual({ state: "held", frozen: true, expired: false });
    expect(hold.update(316, false, false)).toEqual({ state: "held", frozen: true, expired: false });

    // Hand reappears within <= T_gap even while closed/pinched -> resumes without reacquire!
    expect(hold.update(316, true, false)).toEqual({ state: "tracking", frozen: false, expired: false });
    // Absence duration must NOT have polluted tGap()
    expect(hold.tGap()).toBe(250);
  });

  it("expires once when > T_gap, stays frozen while lost, and requires >= 2 open frames to reacquire", () => {
    const hold = createLossHold();
    hold.update(0, true, true);
    hold.update(33, true, true); // lastSeen = 33, T_gap = 250

    // Missing past T_gap (284 - 33 = 251 > 250) -> expires ONCE
    expect(hold.update(284, false, false)).toEqual({ state: "lost", frozen: true, expired: true });
    // Subsequent absent frames -> expired is false, still lost & frozen
    expect(hold.update(317, false, false)).toEqual({ state: "lost", frozen: true, expired: false });

    // Closed hand returning while lost -> still lost & frozen
    expect(hold.update(400, true, false)).toEqual({ state: "lost", frozen: true, expired: false });
    // 1st open frame -> still lost & frozen
    expect(hold.update(433, true, true)).toEqual({ state: "lost", frozen: true, expired: false });
    // 2nd consecutive open frame -> reacquired!
    expect(hold.update(466, true, true)).toEqual({ state: "tracking", frozen: false, expired: false });
  });

  it("adapts T_gap to slow low-light cameras (140ms dt => 420ms hold)", () => {
    const hold = createLossHold();
    hold.update(0, true, true);
    hold.update(140, true, true);
    hold.update(280, true, true);
    expect(hold.tGap()).toBe(420);

    // At 300ms missing (> 250ms, <= 420ms) -> STILL held!
    expect(hold.update(580, false, false)).toEqual({ state: "held", frozen: true, expired: false });
    // At 421ms missing (> 420ms) -> expires!
    expect(hold.update(701, false, false)).toEqual({ state: "lost", frozen: true, expired: true });
  });

  it("fails closed on a sudden camera stall > T_gap with no intermediate missing frames", () => {
    const hold = createLossHold();
    hold.update(0, true, true);
    hold.update(33, true, true); // lastSeen = 33, T_gap = 250

    // Camera stalls 600ms and next visible frame arrives at t=633 with open=true
    expect(hold.update(633, true, true)).toEqual({ state: "lost", frozen: true, expired: true });
    // Needs 1 more open frame (2 total) to reacquire
    expect(hold.update(666, true, true)).toEqual({ state: "tracking", frozen: false, expired: false });

    // reset() returns to idle cleanly
    hold.reset();
    expect(hold.tGap()).toBe(250);
    expect(hold.update(0, true, true)).toEqual({ state: "idle", frozen: false, expired: false });
  });
});
