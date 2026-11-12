import { describe, expect, it } from "vitest";
import type { FaceBox } from "@/src/camera/face-anchor";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { handAt } from "../camera/hand-points";
import { gaussian, seededRandom } from "../input/ink-synthetic";
import { pinchHand } from "../input/hand-fixtures";
import { poseHand } from "../input/pose-fixtures";

const FRAME_MS = 33;

/** A large hand (the player) with its wrist at (x, y + size/2), as in the wave fixtures. */
const near = (x: number, y = 0.5) => handAt(x, y, 0.3);

describe("LabAnalyzer: which hand is the player's", () => {
  it("locks the near hand and counts the far one as ignored", () => {
    const a = new LabAnalyzer();
    a.analyse({ landmarks: [handAt(0.1, 0.2, 0.05), near(0.5)], inferMs: 8, nowMs: 1000 });
    const s = a.snapshot(1000);
    expect(s.handCount).toBe(2);
    expect(s.farHandCount).toBe(1);
    expect(s.primaryIndex).toBe(1);
    expect(s.primarySize).toBeCloseTo(0.3, 6);
  });

  it("keeps the locked hand when a second person's hand enters", () => {
    const a = new LabAnalyzer();
    a.analyse({ landmarks: [near(0.5)], inferMs: 8, nowMs: 1000 });
    // Stranger on the left (valid size, far from the locked wrist), player moved a little.
    a.analyse({ landmarks: [near(0.15, 0.2), near(0.52)], inferMs: 8, nowMs: 1000 + FRAME_MS });
    expect(a.snapshot(1000 + FRAME_MS).primaryIndex).toBe(1);
  });
});

describe("LabAnalyzer: numbers", () => {
  it("gives p50 and p95 of inference over the last two seconds", () => {
    const a = new LabAnalyzer();
    for (let i = 0; i < 20; i++) {
      a.analyse({ landmarks: [], inferMs: i + 1, nowMs: 1000 + i * 50 });
    }
    const s = a.snapshot(1950);
    expect(s.inferP50).toBe(10);
    expect(s.inferP95).toBe(19);
  });

  it("drops inference samples older than two seconds", () => {
    const a = new LabAnalyzer();
    for (let i = 0; i < 5; i++) a.analyse({ landmarks: [], inferMs: 100, nowMs: i * 40 });
    a.analyse({ landmarks: [], inferMs: 5, nowMs: 3000 });
    expect(a.snapshot(3000).inferP50).toBe(5);
  });

  it("counts detections in the last second", () => {
    const a = new LabAnalyzer();
    for (let i = 0; i < 30; i++) a.analyse({ landmarks: [], inferMs: 5, nowMs: i * FRAME_MS });
    expect(a.snapshot(1000).detectFps).toBe(30);
    expect(a.snapshot(2500).detectFps).toBe(0);
  });

  it("reports the pose of the primary hand with the same classifier as drawing", () => {
    const a = new LabAnalyzer();
    a.analyse({ landmarks: [pinchHand(0.5)], inferMs: 5, nowMs: 0 });
    expect(a.snapshot(0).pose).toBe("pinch");
    a.analyse({ landmarks: [poseHand("open-palm")], inferMs: 5, nowMs: FRAME_MS });
    expect(a.snapshot(FRAME_MS).pose).toBe("open-palm");
  });
});

describe("LabAnalyzer: jitter meter", () => {
  it("shows a steadier ink point than the raw fingertip for a still hand", () => {
    const a = new LabAnalyzer();
    const rand = seededRandom(7);
    for (let i = 0; i < 90; i++) {
      const jitter = (): number => 0.003 * gaussian(rand);
      const lm = near(0.5 + jitter(), 0.5 + jitter());
      a.analyse({ landmarks: [lm], inferMs: 5, nowMs: i * FRAME_MS });
    }
    const s = a.snapshot(89 * FRAME_MS);
    expect(s.still).toBe(true);
    expect(s.rawJitterPx).not.toBeNull();
    expect(s.inkJitterPx).not.toBeNull();
    expect(s.inkJitterPx!).toBeLessThan(s.rawJitterPx! / 2);
  });

  it("gives no jitter number while the hand is moving", () => {
    const a = new LabAnalyzer();
    for (let i = 0; i < 60; i++) a.analyse({ landmarks: [near(0.2 + i * 0.01)], inferMs: 5, nowMs: i * FRAME_MS });
    const s = a.snapshot(59 * FRAME_MS);
    expect(s.still).toBe(false);
    expect(s.rawJitterPx).toBeNull();
    expect(s.inkJitterPx).toBeNull();
  });
});

describe("LabAnalyzer: wave test", () => {
  it("completes on the player's sweep while a distractor hand moves randomly", () => {
    const a = new LabAnalyzer();
    const rand = seededRandom(3);
    a.startWaveTest();
    for (let i = 0; i < 150; i++) {
      const t = i * FRAME_MS;
      const player = near(0.5 + 0.3 * Math.sin((2 * Math.PI * t) / 800), 0.65);
      // Bystander further away (smaller) and far above the player's wrist, moving at random.
      const bystander = handAt(0.05 + 0.9 * rand(), 0.05 + 0.15 * rand(), 0.2);
      a.analyse({ landmarks: [bystander, player], inferMs: 5, nowMs: t });
    }
    const s = a.snapshot(149 * FRAME_MS);
    expect(s.wave.status).toBe("done");
    expect(s.wave.elapsedMs).not.toBeNull();
  });

  it("does not count a bystander's sweep while the player's hand is still", () => {
    const a = new LabAnalyzer();
    a.startWaveTest();
    for (let i = 0; i < 150; i++) {
      const t = i * FRAME_MS;
      const player = near(0.5, 0.65);
      const bystander = handAt(0.5 + 0.3 * Math.sin((2 * Math.PI * t) / 800), 0.1, 0.2);
      a.analyse({ landmarks: [bystander, player], inferMs: 5, nowMs: t });
    }
    expect(a.snapshot(149 * FRAME_MS).wave.status).toBe("running");
  });

  it("is idle until started", () => {
    const a = new LabAnalyzer();
    a.analyse({ landmarks: [near(0.5)], inferMs: 5, nowMs: 0 });
    expect(a.snapshot(0).wave.status).toBe("idle");
  });
});

describe("LabAnalyzer: ink preview", () => {
  it("draws a pinch as one stroke and ends it on release", () => {
    const a = new LabAnalyzer();
    for (let i = 0; i < 10; i++) a.analyse({ landmarks: [pinchHand(0.3 + i * 0.02)], inferMs: 5, nowMs: i * FRAME_MS });
    for (let i = 0; i < 6; i++) a.analyse({ landmarks: [poseHand("open-palm")], inferMs: 5, nowMs: (10 + i) * FRAME_MS });
    const strokes = a.strokes();
    expect(strokes.active).toBeNull();
    expect(strokes.completed).toHaveLength(1);
    expect(strokes.completed[0]!.length).toBeGreaterThanOrEqual(2);
  });

  it("forgets everything on reset", () => {
    const a = new LabAnalyzer();
    a.startWaveTest();
    a.analyse({ landmarks: [near(0.5)], inferMs: 5, nowMs: 0 });
    a.reset(0);
    const s = a.snapshot(0);
    expect(s.primaryIndex).toBeNull();
    expect(s.handCount).toBe(0);
    expect(s.wave.status).toBe("idle");
  });
});

describe("LabAnalyzer: jitter at the gate's 8 Hz floor", () => {
  it("still shows jitter when the detector runs only at the 8 Hz floor", () => {
    // The shared gate never runs slower than 8 Hz for normal detections: 125 ms between frames.
    // A 1.5 s window then holds about 12 samples, so the meter must not need 15 of them.
    const a = new LabAnalyzer();
    const rand = seededRandom(11);
    for (let i = 0; i < 20; i++) {
      const jitter = (): number => 0.003 * gaussian(rand);
      a.analyse({ landmarks: [near(0.5 + jitter(), 0.5 + jitter())], inferMs: 5, nowMs: i * 125 });
    }
    const s = a.snapshot(19 * 125);
    expect(s.still).toBe(true);
    expect(s.rawJitterPx).not.toBeNull();
  });
});

/** Player's face in camera space: centre x 0.5, top 0.2, 0.2 wide, 0.25 high. */
const face: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };

describe("LabAnalyzer: the face decides whose hand counts", () => {
  it("does not lock a hand beside the player, and labels it as outside the player area", () => {
    const a = new LabAnalyzer();
    const beside = handAt(0.05, 0.1, 0.3);
    const player = handAt(0.5, 0.05, 0.3);
    a.analyse({ landmarks: [beside, player], inferMs: 5, nowMs: 0, face });
    const s = a.snapshot(0);
    expect(s.primaryIndex).toBe(1);
    expect(s.handRoles).toEqual(["outside", "primary"]);
    expect(s.face).toEqual(face);
  });

  it("never locks a face misread as a hand, even when nothing else is in view", () => {
    const a = new LabAnalyzer();
    a.analyse({ landmarks: [handAt(0.5, 0.33, 0.25)], inferMs: 5, nowMs: 0, face });
    const s = a.snapshot(0);
    expect(s.primaryIndex).toBeNull();
    expect(s.handRoles).toEqual(["face"]);
  });

  it("has no face in the snapshot when none was passed", () => {
    const a = new LabAnalyzer();
    a.analyse({ landmarks: [near(0.5)], inferMs: 5, nowMs: 0 });
    expect(a.snapshot(0).face).toBeNull();
  });
});

describe("LabAnalyzer: wave test with the new rule", () => {
  it("counts a small hand's small sweep with that hand's own size", () => {
    const a = new LabAnalyzer();
    a.startWaveTest();
    for (let i = 0; i < 150; i++) {
      const t = i * FRAME_MS;
      // Hand size 0.1 (just above MIN_HAND_SIZE) and a 0.03 swing: too small for the default hand size.
      a.analyse({ landmarks: [handAt(0.5 + 0.03 * Math.sin((2 * Math.PI * t) / 800), 0.65, 0.1)], inferMs: 5, nowMs: t });
    }
    const s = a.snapshot(149 * FRAME_MS);
    expect(s.wave.status).toBe("done");
    expect(s.wave.reversals).toBeGreaterThanOrEqual(2);
  });
});

