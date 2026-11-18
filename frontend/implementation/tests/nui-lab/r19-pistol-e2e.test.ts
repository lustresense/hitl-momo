import { describe, expect, it } from "vitest";
import { LabAnalyzer, type LabSnapshot } from "@/src/components/nui-lab/lab-analyzer";
import { R19RuntimePipeline } from "@/src/components/nui-lab/r19/r19_integrated";
import {
  ASPECT,
  MEDIAN_SKELETONS,
  NEUTRAL,
  PINCH,
  cls,
  fistHand,
  loadRealR19Model,
  originForPalm,
  pinchHand,
  pinchSkeleton,
  pistolBuild,
  pistolSkeleton,
  placeHand,
  skel,
  startLabSession,
  type RealisticClass,
} from "./lab-rig";

/** Realistic thumbs-up skeleton (all 4 fingers curled, thumb lifted clearly above knuckles). */
function thumbUpSkeleton(cx = 0.5, cy = 0.6): ReturnType<typeof placeHand> {
  const s = MEDIAN_SKELETONS.fist.map(([x, y]) => [x, y] as [number, number]);
  s[1] = [-0.45, 0.55];
  s[2] = [-0.62, 1.08];
  s[3] = [-0.68, 1.52];
  s[4] = [-0.70, 1.92];
  return placeHand(s, { aspect: ASPECT, cx, cy });
}

function feedFrames(
  lab: LabAnalyzer,
  lm: ReturnType<typeof pistolSkeleton> | null,
  count: number,
  startMs: number,
  dtMs = 33,
): { snaps: LabSnapshot[]; endMs: number } {
  const snaps: LabSnapshot[] = [];
  let t = startMs;
  for (let i = 0; i < count; i++) {
    t += dtMs;
    lab.analyse({ landmarks: lm ? [lm] : [], inferMs: 5, nowMs: t, aspect: ASPECT });
    snaps.push(lab.snapshot(t));
  }
  return { snaps, endMs: t };
}

function anyKeysActive(s: LabSnapshot): boolean {
  const vk = s.r19.virtualKey;
  return vk.left || vk.right || vk.jump;
}

describe("R19 G4 Hybrid Pistol E2E (real exported MLP + PistolVirtualKeyFSM)", () => {
  it("loads the real model into both R19RuntimePipeline and LabAnalyzer", () => {
    const model = loadRealR19Model();
    const pipeline = new R19RuntimePipeline(model, ASPECT);
    const readyLm = pistolSkeleton(0, true, { aspect: ASPECT });
    const step1 = pipeline.step(readyLm, 1000);
    const step2 = pipeline.step(readyLm, 1033);
    expect(step1.probs).toHaveLength(3);
    expect(step2.geomState).toBe("POINT_PRESS");

    const { lab } = startLabSession();
    expect(lab.snapshot(0).classifierMode).toBe("r19-g4-hybrid");
    expect(lab.snapshot(0).modelState).toBe("ready");
    expect(lab.snapshot(0).modelError).toBeNull();
  });

  it("fails closed when model is unloaded or failR19 is called (zero actions, zero fallback)", () => {
    const unloaded = startLabSession({ enableModel: false, enableInk: true });
    expect(unloaded.lab.snapshot(0).modelState).toBe("unloaded");

    const press = pistolBuild(0, true);
    const frames = [
      ...Array.from({ length: 6 }, () => press(0.5, 0.55)),
      ...Array.from({ length: 6 }, () => PINCH(0.5, 0.55)),
      ...Array.from({ length: 6 }, () => cls("palm")(0.5, 0.55)),
    ];
    for (const lm of frames) {
      unloaded.feedLm(lm);
      const s = unloaded.lab.snapshot(unloaded.now());
      expect(s.drawingAction).toBeNull();
      expect(s.inkAllowed).toBe(false);
      expect(s.r19.virtualKey.left).toBe(false);
      expect(s.r19.virtualKey.right).toBe(false);
      expect(s.r19.virtualKey.jump).toBe(false);
      expect(s.r19.guards.swipeAction).toBeNull();
    }
    expect(unloaded.lab.strokes().completed).toHaveLength(0);
    expect(unloaded.lab.strokes().active).toBeNull();

    // Now test failR19("network error") after a model had been active
    const failed = startLabSession({ enableModel: true, enableInk: true });
    failed.hold(press, 5);
    expect(failed.lab.snapshot(failed.now()).r19.virtualKey.right).toBe(true);

    failed.lab.failR19("network error", failed.now() + 10);
    const afterFail = failed.lab.snapshot(failed.now() + 10);
    expect(afterFail.modelState).toBe("error");
    expect(afterFail.modelError).toBe("network error");
    expect(anyKeysActive(afterFail)).toBe(false);

    for (const lm of [press(0.5, 0.55), PINCH(0.5, 0.55), cls("palm")(0.5, 0.55)]) {
      failed.feedLm(lm);
      const s = failed.lab.snapshot(failed.now());
      expect(s.modelState).toBe("error");
      expect(anyKeysActive(s)).toBe(false);
      expect(s.drawingAction).toBeNull();
      expect(s.r19.guards.swipeAction).toBeNull();
    }
    expect(failed.lab.strokes().completed).toHaveLength(0);
  });

  it("POINT_READY (folded thumb) NEVER emits KEYDOWN or left/right/jump across RIGHT, LEFT, UP, UP_RIGHT, UP_LEFT", () => {
    const { lab } = startLabSession({ enableInk: false });
    let t = 1000;
    const angles: Array<{ angle: number; expectedDir: string }> = [
      { angle: 0, expectedDir: "RIGHT" },
      { angle: 180, expectedDir: "LEFT" },
      { angle: 90, expectedDir: "UP" },
      { angle: 55, expectedDir: "UP_RIGHT" },
      { angle: 125, expectedDir: "UP_LEFT" },
    ];

    for (const { angle, expectedDir } of angles) {
      const { lab: angleLab } = startLabSession({ enableInk: false });
      const readyLm = pistolSkeleton(angle, false, { aspect: ASPECT });
      const res = feedFrames(angleLab, readyLm, 6, 1000, 33);
      const locked = res.snaps.filter((s) => s.lockStatus === "locked");
      expect(locked.length, `angle=${angle}`).toBeGreaterThanOrEqual(5);
      for (const s of locked) {
        expect(s.r19.state, `angle=${angle} sub=${s.r19.subClass} reason=${s.r19.reason} probs=${JSON.stringify(s.r19.probs)}`).toBe("POINT_READY");
        expect(s.r19.virtualKey.event).not.toBe("KEYDOWN");
        expect(s.r19.virtualKey.event).not.toBe("HELD");
        expect(anyKeysActive(s)).toBe(false);
        expect(s.r19.virtualKey.keydowns).toBe(0);
      }
      expect(locked.at(-1)!.r19.directionLabel).toBe(expectedDir);
    }
  });

  it("POINT_PRESS (thumb open) emits KEYDOWN then HELD on RIGHT, LEFT, UP, UP_RIGHT, UP_LEFT, and DOWN stays neutral/stop", () => {
    const cases: Array<{
      angle: number;
      dir: string;
      left: boolean;
      right: boolean;
      jump: boolean;
    }> = [
      { angle: 0, dir: "RIGHT", left: false, right: true, jump: false },
      { angle: 180, dir: "LEFT", left: true, right: false, jump: false },
      { angle: 90, dir: "UP", left: false, right: false, jump: true },
      { angle: 55, dir: "UP_RIGHT", left: false, right: true, jump: true },
      { angle: 125, dir: "UP_LEFT", left: true, right: false, jump: true },
    ];

    for (const c of cases) {
      const { lab } = startLabSession({ enableInk: false });
      const lm = pistolSkeleton(c.angle, true, { aspect: ASPECT });
      const { snaps } = feedFrames(lab, lm, 5, 1000, 33);
      const events = snaps.map((s) => s.r19.virtualKey.event);
      expect(events).toContain("KEYDOWN");
      expect(events.at(-1)).toBe("HELD");
      const keydownIdx = events.indexOf("KEYDOWN");
      const heldIdx = events.indexOf("HELD");
      expect(keydownIdx).toBeGreaterThanOrEqual(0);
      expect(heldIdx).toBeGreaterThan(keydownIdx);

      const atKeydown = snaps[keydownIdx]!;
      expect(atKeydown.r19.state).toBe("POINT_PRESS");
      expect(atKeydown.r19.directionLabel).toBe(c.dir);
      expect(atKeydown.r19.virtualKey.left).toBe(c.left);
      expect(atKeydown.r19.virtualKey.right).toBe(c.right);
      expect(atKeydown.r19.virtualKey.jump).toBe(c.jump);
    }

    // DOWN (-90° and -45° below horizontal) = neutral/stop (never triggers left/right/jump)
    for (const downAngle of [-90, -45]) {
      const { lab } = startLabSession({ enableInk: false });
      const downLm = pistolSkeleton(downAngle, true, { aspect: ASPECT });
      const { snaps } = feedFrames(lab, downLm, 6, 1000, 33);
      const locked = snaps.filter((s) => s.lockStatus === "locked");
      expect(locked.length).toBeGreaterThanOrEqual(5);
      for (const s of locked) {
        expect(s.r19.state).toBe("POINT_PRESS");
        expect(s.r19.directionLabel).toBe("DOWN");
        expect(s.r19.virtualKey.zone).toBe("stop");
        expect(anyKeysActive(s)).toBe(false);
        expect(s.r19.virtualKey.keydowns).toBe(0);
      }
    }
  });

  it.each([
    { label: "30 Hz", dtMs: 33, holdRightFrames: 4, holdJumpFrames: 3 },
    { label: "60 Hz", dtMs: 16, holdRightFrames: 6, holdJumpFrames: 5 },
  ])(
    "RIGHT -> UP_RIGHT (RIGHT+JUMP) -> RIGHT sweep at $label keeps right=true continuously and fires jump once",
    ({ dtMs, holdRightFrames, holdJumpFrames }) => {
      const { lab } = startLabSession({ enableInk: false });
      let t = 1000;
      const trace: LabSnapshot[] = [];

      const runAngle = (angle: number, count: number) => {
        const lm = pistolSkeleton(angle, true, { aspect: ASPECT });
        const res = feedFrames(lab, lm, count, t, dtMs);
        t = res.endMs;
        trace.push(...res.snaps);
      };

      // Arm RIGHT
      runAngle(0, holdRightFrames);
      const firstRightIdx = trace.findIndex((s) => s.r19.virtualKey.right);
      expect(firstRightIdx).toBeGreaterThanOrEqual(0);

      // Sweep continuously across the 30..45° boundary into UP_RIGHT (65° -> 55° -> 45°) and back to RIGHT
      for (const a of [18, 32, 38, 45, 55]) runAngle(a, 1);
      runAngle(65, holdJumpFrames);
      for (const a of [55, 45, 38, 32, 18]) runAngle(a, 1);
      runAngle(0, holdRightFrames);

      const activeTrace = trace.slice(firstRightIdx);
      expect(activeTrace.every((s) => s.r19.virtualKey.right === true)).toBe(true);
      expect(activeTrace.every((s) => s.r19.virtualKey.left === false)).toBe(true);
      expect(activeTrace.some((s) => s.r19.virtualKey.event === "KEYUP")).toBe(false);

      const jumpFrames = activeTrace.filter((s) => s.r19.virtualKey.jumpFiredThisFrame);
      expect(jumpFrames).toHaveLength(1);
      expect(trace.at(-1)!.r19.virtualKey.jumps).toBe(1);
      expect(trace.at(-1)!.r19.virtualKey.jump).toBe(false);
      expect(trace.at(-1)!.r19.virtualKey.right).toBe(true);
    },
  );

  it("thumb fold (POINT_PRESS -> POINT_READY) emits immediate KEYUP with releaseReason and clears all keys", () => {
    const { lab } = startLabSession({ enableInk: false });
    const pressLm = pistolSkeleton(0, true, { aspect: ASPECT });
    const readyLm = pistolSkeleton(0, false, { aspect: ASPECT });

    const r1 = feedFrames(lab, pressLm, 5, 1000, 33);
    expect(r1.snaps.at(-1)!.r19.virtualKey.right).toBe(true);

    const r2 = feedFrames(lab, readyLm, 3, r1.endMs, 33);
    const releaseFrame = r2.snaps[0]!;
    expect(releaseFrame.r19.state).toBe("POINT_READY");
    expect(releaseFrame.r19.virtualKey.event).toBe("KEYUP");
    expect(releaseFrame.r19.virtualKey.releaseReason).toBe("point-ready");
    expect(releaseFrame.r19.virtualKey.keyups).toBe(1);
    expect(anyKeysActive(releaseFrame)).toBe(false);
    expect(r2.snaps.at(-1)!.r19.virtualKey.event).toBe("NONE");
  });

  it("dorsal right-hand pointing LEFT transitions POINT_READY -> POINT_PRESS (left=true) with zero false pinch/erase/two-fingers", () => {
    const { lab } = startLabSession({ enableInk: true });
    const dorsalReady = pistolSkeleton(180, false, { aspect: ASPECT, dorsal: true, mirror: true });
    const dorsalPress = pistolSkeleton(180, true, { aspect: ASPECT, dorsal: true, mirror: true });

    const r1 = feedFrames(lab, dorsalReady, 5, 1000, 33);
    const lockedR1 = r1.snaps.filter((s) => s.lockStatus === "locked");
    expect(lockedR1.length).toBeGreaterThanOrEqual(4);
    for (const s of lockedR1) {
      expect(s.r19.state).toBe("POINT_READY");
      expect(s.r19.directionLabel).toBe("LEFT");
      expect(anyKeysActive(s)).toBe(false);
      expect(s.r19.guards.pinchActive).toBe(false);
      expect(s.r19.guards.eraseActive).toBe(false);
      expect(s.pose).not.toBe("two-fingers");
      expect(s.pose).not.toBe("pinch");
    }

    const r2 = feedFrames(lab, dorsalPress, 5, r1.endMs, 33);
    const last = r2.snaps.at(-1)!;
    expect(last.r19.state).toBe("POINT_PRESS");
    expect(last.r19.directionLabel).toBe("LEFT");
    expect(last.r19.virtualKey.left).toBe(true);
    expect(last.r19.virtualKey.right).toBe(false);
    expect(last.r19.virtualKey.jump).toBe(false);
    expect(last.r19.guards.pinchActive).toBe(false);
    expect(last.r19.guards.eraseActive).toBe(false);
    expect(last.pose).not.toBe("two-fingers");
    expect(last.pose).not.toBe("pinch");
    expect(lab.strokes().completed).toHaveLength(0);
    expect(lab.strokes().active).toBeNull();
  });

  it("hand lost (NO_HAND) emits immediate RELEASE_ALL with zero stuck keys", () => {
    const { lab } = startLabSession({ enableInk: false });
    const pressLm = pistolSkeleton(0, true, { aspect: ASPECT });
    const r1 = feedFrames(lab, pressLm, 5, 1000, 33);
    expect(r1.snaps.at(-1)!.r19.virtualKey.right).toBe(true);

    const r2 = feedFrames(lab, null, 2, r1.endMs, 33);
    const lostFrame = r2.snaps[0]!;
    expect(lostFrame.r19.state).toBe("NO_HAND");
    expect(lostFrame.r19.virtualKey.event).toBe("RELEASE_ALL");
    expect(lostFrame.r19.virtualKey.releaseAlls).toBe(1);
    expect(anyKeysActive(lostFrame)).toBe(false);
    expect(r2.snaps[1]!.r19.virtualKey.event).toBe("NONE");
  });

  it("negative poses (thumb-up, two-fingers, three, four, five palm, fist, pinch) NEVER fire pistol KEYDOWN or left/right/jump", () => {
    const negatives: Array<{ name: string; lm: ReturnType<typeof pistolSkeleton> }> = [
      { name: "thumb-up", lm: thumbUpSkeleton() },
      { name: "two-fingers", lm: placeHand(MEDIAN_SKELETONS.two_up, { aspect: ASPECT, cx: 0.5, cy: 0.6 }) },
      { name: "three", lm: placeHand(MEDIAN_SKELETONS.three, { aspect: ASPECT, cx: 0.5, cy: 0.6 }) },
      { name: "four", lm: placeHand(MEDIAN_SKELETONS.four, { aspect: ASPECT, cx: 0.5, cy: 0.6 }) },
      { name: "five-palm", lm: placeHand(MEDIAN_SKELETONS.palm, { aspect: ASPECT, cx: 0.5, cy: 0.6 }) },
      { name: "fist", lm: fistHand() },
      { name: "pinch", lm: placeHand(pinchSkeleton(0.05), { aspect: ASPECT, cx: 0.5, cy: 0.6 }) },
    ];

    for (const neg of negatives) {
      const { lab } = startLabSession({ enableInk: false });
      const { snaps } = feedFrames(lab, neg.lm, 8, 1000, 33);
      const locked = snaps.filter((s) => s.lockStatus === "locked");
      expect(locked.length, neg.name).toBeGreaterThanOrEqual(7);
      for (const s of locked) {
        expect(s.r19.state, neg.name).toBe("OTHER");
        expect(s.r19.virtualKey.keydowns, neg.name).toBe(0);
        expect(anyKeysActive(s), neg.name).toBe(false);
      }
    }
  });

  it("releaseAll('browser-hidden') and stop() immediately drop all virtual keys and increment releaseAlls", () => {
    const { lab } = startLabSession({ enableInk: false });
    const pressLm = pistolSkeleton(45, true, { aspect: ASPECT });
    const r1 = feedFrames(lab, pressLm, 5, 1000, 33);
    expect(r1.snaps.at(-1)!.r19.virtualKey.right).toBe(true);

    lab.releaseAll("browser-hidden", r1.endMs + 10);
    const hiddenSnap = lab.snapshot(r1.endMs + 10);
    expect(hiddenSnap.r19.virtualKey.event).toBe("RELEASE_ALL");
    expect(hiddenSnap.r19.virtualKey.releaseAlls).toBe(1);
    expect(hiddenSnap.r19.virtualKey.releaseReason).toBe("browser-hidden");
    expect(anyKeysActive(hiddenSnap)).toBe(false);

    // Re-arm and press again, then call stop()
    const r2 = feedFrames(lab, pressLm, 5, r1.endMs + 50, 33);
    expect(r2.snaps.at(-1)!.r19.virtualKey.right).toBe(true);

    lab.stop(r2.endMs + 10);
    const stoppedSnap = lab.snapshot(r2.endMs + 10);
    expect(stoppedSnap.r19.virtualKey.event).toBe("RELEASE_ALL");
    expect(stoppedSnap.r19.virtualKey.releaseAlls).toBe(2);
    expect(stoppedSnap.r19.virtualKey.releaseReason).toBe("stop");
    expect(anyKeysActive(stoppedSnap)).toBe(false);
  });

  it("Canvas mode (enableInk: true) blocks Pistol drawing/erasing, allows pinch draw and 5-finger erase, and blocks 4-finger/fist erase", () => {
    const r = startLabSession({ enableInk: true });
    // 1. POINT_READY and POINT_PRESS never draw or erase
    r.hold(pistolBuild(0, false), 5);
    r.hold(pistolBuild(0, true), 5);
    r.hold(pistolBuild(90, true), 5);
    expect(r.lab.strokes().completed).toHaveLength(0);
    expect(r.lab.strokes().active).toBeNull();

    // 2. Pinch draws cleanly after neutral release
    r.hold(NEUTRAL, 3);
    r.glide(NEUTRAL, 0.62, 0.5);
    r.hold(NEUTRAL, 3);
    for (let i = 0; i <= 20; i++) r.put(PINCH, 0.62 - i * 0.012, 0.5);
    r.hold(NEUTRAL, 8);

    const completedCount = r.lab.strokes().completed.length;
    expect(completedCount).toBe(1);
    const pointsBeforeErase = r.lab.strokes().completed.reduce((n, st) => n + st.length, 0);
    expect(pointsBeforeErase).toBeGreaterThan(8);

    // Compute midpoint of the drawn stroke in canvas px
    const pts = r.lab.strokes().completed.flat();
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const midX = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;

    const sweepOver = (c: RealisticClass, y0: number, y1: number) => {
      const startO = originForPalm(MEDIAN_SKELETONS[c], midX, y0);
      r.glide(NEUTRAL, startO.cx, startO.cy);
      r.hold(NEUTRAL, 3);
      r.hold(cls(c), 6);
      const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 20));
      for (let i = 0; i <= n; i++) {
        const o = originForPalm(MEDIAN_SKELETONS[c], midX, y0 + ((y1 - y0) * i) / n);
        r.put(cls(c), o.cx, o.cy);
      }
      r.hold(NEUTRAL, 4);
    };

    // 3. 4-finger and fist NEVER erase
    sweepOver("four", maxY + 150, minY - 150);
    expect(r.lab.strokes().completed).toHaveLength(1);
    expect(r.lab.strokes().completed.reduce((n, st) => n + st.length, 0)).toBe(pointsBeforeErase);

    sweepOver("fist", maxY + 150, minY - 150);
    expect(r.lab.strokes().completed).toHaveLength(1);
    expect(r.lab.strokes().completed.reduce((n, st) => n + st.length, 0)).toBe(pointsBeforeErase);

    // 4. 5-finger palm erases cleanly (cuts the single stroke into two separate fragments or removes points)
    sweepOver("palm", maxY + 150, minY - 150);
    const afterPalm = r.lab.strokes().completed;
    const pointsAfterPalm = afterPalm.reduce((n, st) => n + st.length, 0);
    expect(afterPalm.length > 1 || pointsAfterPalm < pointsBeforeErase).toBe(true);

    // Pinch direct hand check (regression guard for hand-fixtures pinchHand; glide wrist near y=0.9 first)
    const rPinch = startLabSession({ enableInk: true });
    rPinch.glide(NEUTRAL, 0.5, 0.9);
    rPinch.hold(NEUTRAL, 3);
    for (let i = 0; i < 10; i++) rPinch.feedLm(pinchHand(0.4 + i * 0.015));
    rPinch.hold(NEUTRAL, 6);
    expect(rPinch.lab.strokes().completed).toHaveLength(1);
  });
});
