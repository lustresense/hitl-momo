import { describe, expect, it } from "vitest";
import type { FaceBox } from "@/src/camera/face-anchor";
import { LabAnalyzer } from "@/src/components/nui-lab/lab-analyzer";
import { handAt } from "../camera/hand-points";
import { gaussian, seededRandom } from "../input/ink-synthetic";
import { pinchHand, fistHand } from "../input/hand-fixtures";
import { poseHand } from "../input/pose-fixtures";
import { loadRealR19Model } from "./lab-rig";

const FRAME_MS = 33;

/** A large hand (the player) with its wrist at (x, y + size/2), as in the wave fixtures. */
const near = (x: number, y = 0.5) => handAt(x, y, 0.3);

function makeAnalyzer(
  opts: ConstructorParameters<typeof LabAnalyzer>[0] = {},
  enableModel = true,
): LabAnalyzer {
  const a = new LabAnalyzer(opts);
  if (enableModel) a.enableR19(loadRealR19Model(), 0);
  return a;
}

describe("LabAnalyzer: which hand is the player's", () => {
  it("locks the near hand and counts the far one as ignored", () => {
    const a = makeAnalyzer();
    a.analyse({ landmarks: [handAt(0.1, 0.2, 0.05), near(0.5)], inferMs: 8, nowMs: 1000 });
    const s = a.snapshot(1000);
    expect(s.handCount).toBe(2);
    expect(s.farHandCount).toBe(1);
    expect(s.primaryIndex).toBe(1);
    expect(s.primarySize).toBeCloseTo(0.3, 6);
  });

  it("keeps the locked hand when a second person's hand enters", () => {
    const a = makeAnalyzer();
    a.analyse({ landmarks: [near(0.5)], inferMs: 8, nowMs: 1000 });
    // Stranger on the left (valid size, far from the locked wrist), player moved a little.
    a.analyse({ landmarks: [near(0.15, 0.2), near(0.52)], inferMs: 8, nowMs: 1000 + FRAME_MS });
    expect(a.snapshot(1000 + FRAME_MS).primaryIndex).toBe(1);
  });
});

describe("LabAnalyzer: numbers", () => {
  it("gives p50 and p95 of inference over the last two seconds", () => {
    const a = makeAnalyzer();
    for (let i = 0; i < 20; i++) {
      a.analyse({ landmarks: [], inferMs: i + 1, nowMs: 1000 + i * 50 });
    }
    const s = a.snapshot(1950);
    expect(s.inferP50).toBe(10);
    expect(s.inferP95).toBe(19);
  });

  it("drops inference samples older than two seconds", () => {
    const a = makeAnalyzer();
    for (let i = 0; i < 5; i++) a.analyse({ landmarks: [], inferMs: 100, nowMs: i * 40 });
    a.analyse({ landmarks: [], inferMs: 5, nowMs: 3000 });
    expect(a.snapshot(3000).inferP50).toBe(5);
  });

  it("counts detections in the last second", () => {
    const a = makeAnalyzer();
    for (let i = 0; i < 30; i++) a.analyse({ landmarks: [], inferMs: 5, nowMs: i * FRAME_MS });
    expect(a.snapshot(1000).detectFps).toBe(30);
    expect(a.snapshot(2500).detectFps).toBe(0);
  });

  it("reports the pose of the primary hand with the same classifier as drawing", () => {
    const a = makeAnalyzer();
    a.analyse({ landmarks: [pinchHand(0.5)], inferMs: 5, nowMs: 0 });
    expect(a.snapshot(0).pose).toBe("pinch");
    a.analyse({ landmarks: [poseHand("open-palm")], inferMs: 5, nowMs: FRAME_MS });
    expect(a.snapshot(FRAME_MS).pose).toBe("open-palm");
  });
});

describe("LabAnalyzer: jitter meter", () => {
  it("shows a steadier ink point than the raw fingertip for a still hand", () => {
    const a = makeAnalyzer();
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
    const a = makeAnalyzer();
    for (let i = 0; i < 60; i++) a.analyse({ landmarks: [near(0.2 + i * 0.01)], inferMs: 5, nowMs: i * FRAME_MS });
    const s = a.snapshot(59 * FRAME_MS);
    expect(s.still).toBe(false);
    expect(s.rawJitterPx).toBeNull();
    expect(s.inkJitterPx).toBeNull();
  });
});

describe("LabAnalyzer: wave test", () => {
  it("completes on the player's sweep while a distractor hand moves randomly", () => {
    const a = makeAnalyzer();
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
    const a = makeAnalyzer();
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
    const a = makeAnalyzer();
    a.analyse({ landmarks: [near(0.5)], inferMs: 5, nowMs: 0 });
    expect(a.snapshot(0).wave.status).toBe("idle");
  });
});

describe("LabAnalyzer: ink preview", () => {
  it("draws a pinch as one stroke and ends it on release", () => {
    const a = makeAnalyzer({ preset: "default-any-pinch" });
    for (let i = 0; i < 10; i++) a.analyse({ landmarks: [pinchHand(0.3 + i * 0.02)], inferMs: 5, nowMs: i * FRAME_MS });
    for (let i = 0; i < 6; i++) a.analyse({ landmarks: [poseHand("open-palm")], inferMs: 5, nowMs: (10 + i) * FRAME_MS });
    const strokes = a.strokes();
    expect(strokes.active).toBeNull();
    expect(strokes.completed).toHaveLength(1);
    expect(strokes.completed[0]!.length).toBeGreaterThanOrEqual(2);
  });

  it("forgets everything on reset while keeping the loaded R19 model ready", () => {
    const a = makeAnalyzer();
    a.startWaveTest();
    a.analyse({ landmarks: [near(0.5)], inferMs: 5, nowMs: 0 });
    a.reset(0);
    const s = a.snapshot(0);
    expect(s.primaryIndex).toBeNull();
    expect(s.handCount).toBe(0);
    expect(s.wave.status).toBe("idle");
    expect(s.modelState).toBe("ready");
    expect(s.classifierMode).toBe("r19-g4-hybrid");
  });

  it("supports manual pointer fallback drawing, erasing, undo, redo, and clear", () => {
    const a = makeAnalyzer({ fullFrameLock: true, enableInk: true });
    a.beginPointerStroke({ x: 100, y: 100 });
    a.movePointerStroke({ x: 200, y: 100 });
    a.movePointerStroke({ x: 300, y: 100 });
    a.endPointerStroke();
    expect(a.strokes().completed).toHaveLength(1);

    a.erasePointer({ x: 200, y: 100 });
    a.endPointerErase();
    expect(a.strokes().completed.length).toBe(2);

    a.canvasAction("undo");
    expect(a.strokes().completed).toHaveLength(1);
    a.canvasAction("redo");
    expect(a.strokes().completed).toHaveLength(2);
    a.canvasAction("clear");
    expect(a.strokes().completed).toHaveLength(0);
  });
});

describe("LabAnalyzer: jitter at the gate's 8 Hz floor", () => {
  it("still shows jitter when the detector runs only at the 8 Hz floor", () => {
    // The shared gate never runs slower than 8 Hz for normal detections: 125 ms between frames.
    // A 1.5 s window then holds about 12 samples, so the meter must not need 15 of them.
    const a = makeAnalyzer();
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
    const a = makeAnalyzer();
    const beside = handAt(0.05, 0.1, 0.3);
    const player = handAt(0.5, 0.05, 0.3);
    a.analyse({ landmarks: [beside, player], inferMs: 5, nowMs: 0, face });
    const s = a.snapshot(0);
    expect(s.primaryIndex).toBe(1);
    expect(s.handRoles).toEqual(["outside", "primary"]);
    expect(s.face).toEqual(face);
  });

  it("never locks a face misread as a hand, even when nothing else is in view", () => {
    const a = makeAnalyzer();
    a.analyse({ landmarks: [handAt(0.5, 0.33, 0.25)], inferMs: 5, nowMs: 0, face });
    const s = a.snapshot(0);
    expect(s.primaryIndex).toBeNull();
    expect(s.handRoles).toEqual(["face"]);
  });

  it("has no face in the snapshot when none was passed", () => {
    const a = makeAnalyzer();
    a.analyse({ landmarks: [near(0.5)], inferMs: 5, nowMs: 0 });
    expect(a.snapshot(0).face).toBeNull();
  });
});

describe("LabAnalyzer: wave test with the new rule", () => {
  it("counts a small hand's small sweep with that hand's own size", () => {
    const a = makeAnalyzer();
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

describe("LabAnalyzer camera-wide lock and game cursor", () => {
  it("accepts a player hand beside the face and does not take over a second hand", () => {
    const lab = makeAnalyzer({ fullFrameLock: true });
    const beside = handAt(.14, .60, .18);
    const bystander = handAt(.83, .65, .24);
    lab.analyse({landmarks:[beside], inferMs:5, nowMs:0, face});
    expect(lab.snapshot(0).lockStatus).toBe("locking");
    lab.analyse({landmarks:[beside], inferMs:5, nowMs:33, face});
    expect(lab.snapshot(33).primaryIndex).toBe(0);
    lab.analyse({landmarks:[bystander,handAt(.16,.60,.18)], inferMs:5, nowMs:66, face});
    expect(lab.snapshot(66).primaryIndex).toBe(1);
    lab.analyse({landmarks:[bystander], inferMs:5, nowMs:1000, face});
    expect(lab.snapshot(1000).lockStatus).toBe("lost");
    expect(lab.snapshot(1000).primaryIndex).toBeNull();
    lab.resetHandLock(1001);
    lab.analyse({landmarks:[bystander], inferMs:5, nowMs:1100, face});
    expect(lab.snapshot(1100).lockStatus).toBe("locking");
  });
  it("reports cursor coordinates from the same stroke pipeline as the game", () => {
    const lab = makeAnalyzer({fullFrameLock:true});
    const hand = pinchHand(.5);
    lab.analyse({landmarks:[hand], inferMs:5, nowMs:0});
    lab.analyse({landmarks:[hand], inferMs:5, nowMs:33});
    const snap = lab.snapshot(33);
    expect(snap.primaryIndex).toBe(0);
    expect(snap.cursor).not.toBeNull();
    expect(snap.cursor!.x).toBeGreaterThanOrEqual(0);
    expect(snap.cursor!.x).toBeLessThanOrEqual(1280);
    expect(snap.cursor!.y).toBeGreaterThanOrEqual(0);
    expect(snap.cursor!.y).toBeLessThanOrEqual(720);
  });
  it("gesture-only mode never draws ink even when the pose is pinch", () => {
    const lab = makeAnalyzer({fullFrameLock:true,enableInk:false});
    const hand = pinchHand(.5);
    for(let i=0;i<8;i++)lab.analyse({landmarks:[hand],inferMs:5,nowMs:i*33});
    expect(lab.strokes().completed).toHaveLength(0);
    expect(lab.strokes().active).toBeNull();
    expect(lab.snapshot(231).cursor).toBeNull();
  });
});

describe("NUI Lab automated hand ownership, fail-closed R19 gate, and action safety", () => {
  it("fails closed before enableR19 and when failR19 is active, with zero fallback", () => {
    const lab = makeAnalyzer({ fullFrameLock: true, enableInk: true }, false);
    expect(lab.snapshot(0).modelState).toBe("unloaded");
    const hand = pinchHand(0.5);
    for (let i = 0; i < 6; i++) lab.analyse({ landmarks: [hand], inferMs: 5, nowMs: i * 33 });
    const unloaded = lab.snapshot(165);
    expect(unloaded.modelState).toBe("unloaded");
    expect(unloaded.pose).toBe("none");
    expect(unloaded.cursor).toBeNull();
    expect(unloaded.drawingAction).toBeNull();
    expect(unloaded.inkAllowed).toBe(false);
    expect(unloaded.r19.virtualKey.left).toBe(false);
    expect(unloaded.r19.virtualKey.right).toBe(false);
    expect(unloaded.r19.virtualKey.jump).toBe(false);
    expect(lab.strokes().completed).toHaveLength(0);
    expect(lab.strokes().active).toBeNull();

    lab.failR19("network error", 200);
    lab.analyse({ landmarks: [hand], inferMs: 5, nowMs: 233 });
    const errored = lab.snapshot(233);
    expect(errored.modelState).toBe("error");
    expect(errored.modelError).toBe("network error");
    expect(errored.drawingAction).toBeNull();
    expect(errored.cursor).toBeNull();
  });

  it("automatically reassigns after an empty camera, but never continues a stale pinch", () => {
    const lab = makeAnalyzer({ fullFrameLock: true, preset: "default-any-pinch" });
    const pinch = pinchHand(.5);
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:0});
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:33});
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:66});
    expect(lab.snapshot(66).cursor).not.toBeNull();
    expect(lab.strokes().active).toBeNull();
    expect(lab.snapshot(66).rejectionReason).toContain("dilepas");
    const original = lab.snapshot(66).acquisitionId;
    lab.analyse({landmarks:[],inferMs:5,nowMs:100});
    lab.analyse({landmarks:[],inferMs:5,nowMs:450});
    expect(lab.snapshot(450).lockStatus).toBe("waiting");
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:500});
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:533});
    expect(lab.snapshot(533).acquisitionId).toBeGreaterThan(original);
    expect(lab.snapshot(533).cursor).not.toBeNull();
    expect(lab.strokes().active).toBeNull();
    lab.analyse({landmarks:[fistHand()],inferMs:5,nowMs:566});
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:599});
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:632});
    lab.analyse({landmarks:[pinch],inferMs:5,nowMs:665});
    expect(lab.strokes().active).not.toBeNull();
  });

  it("publishes diagnostic ratio, finger states, and R19 G4 Hybrid MLP probabilities", () => {
    const lab = makeAnalyzer({ fullFrameLock: true, enableInk: false });
    lab.analyse({landmarks:[pinchHand(.5)],inferMs:5,nowMs:0});
    lab.analyse({landmarks:[pinchHand(.5)],inferMs:5,nowMs:33});
    const s = lab.snapshot(33);
    expect(s.pinchRatio).not.toBeNull();
    expect(s.pinchEnter).toBe(0.3);
    expect(s.pinchExit).toBe(0.42);
    expect(s.fingerStates).toHaveLength(4);
    expect(s.classifierMode).toBe("r19-g4-hybrid");
    expect(s.modelState).toBe("ready");
    expect(s.modelError).toBeNull();
    expect(s.lockReason).toBe("active");
    expect(s.r19.probs).not.toBeNull();
    expect(s.r19.probs!.ready + s.r19.probs!.press + s.r19.probs!.other).toBeCloseTo(1, 5);
  });
});
