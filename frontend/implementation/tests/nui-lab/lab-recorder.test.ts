import { afterEach, describe, expect, it, vi } from "vitest";
import { LandmarkRecorder, MAX_RECORD_FRAMES, RECORD_SCHEMA, TRUTH_LABELS, validateRecord, type RecordFile, type TruthLabel } from "@/src/components/nui-lab/lab-recorder";
import { MEDIAN_SKELETONS, pinchSkeleton } from "../input/realistic-hands";
import { NEUTRAL, cls, rig, skel } from "./lab-rig";

/**
 * RD-02 (REV4): opt-in, local, numbers-only recorder. The scripted sequences below double as the fixtures for the cases the
 * ticket names: THREE, FIVE, PINCH-NEAR, PINCH-TOUCH, NO-GESTURE, a transition, NO-LANDMARK, and near-miss negatives.
 * Evidence class: UNIT_ONLY (synthetic motion on real class-median hands). No webcam, no person, no consent needed for these.
 */
afterEach(() => vi.unstubAllGlobals());

function session(script: (r: ReturnType<typeof rig>, label: (t: TruthLabel) => void) => void, opts = { experimental: true }) {
  const rec = new LandmarkRecorder();
  let truth: TruthLabel = "UNLABELLED";
  const r = rig(opts, (lab, lm, t) => rec.add(lab.snapshot(t), lm, truth, t, lab.snapshot(t).diag.lastCommand?.atMs ?? null));
  rec.start(true, r.now());
  script(r, (t) => { truth = t; });
  rec.stop();
  return rec.toFile();
}
const of = (f: RecordFile, t: TruthLabel) => f.frames.filter((x) => x.truth === t);

describe("consent and privacy", () => {
  it("refuses to start without an explicit yes, and keeps nothing", () => {
    const rec = new LandmarkRecorder();
    for (const bad of [false, undefined as unknown as boolean, "yes" as unknown as boolean]) expect(() => rec.start(bad, 0)).toThrow(/persetujuan/);
    expect(rec.isRecording).toBe(false);
    expect(rec.frameCount).toBe(0);
  });

  it("does nothing before start and after stop", () => {
    const rec = new LandmarkRecorder();
    const r = rig({ experimental: true }, (lab, lm, t) => rec.add(lab.snapshot(t), lm, "FIVE", t));
    r.hold(NEUTRAL, 5);
    expect(rec.frameCount).toBe(0);
    rec.start(true, r.now());
    r.hold(NEUTRAL, 3);
    rec.stop();
    r.hold(NEUTRAL, 3);
    expect(rec.frameCount).toBe(3);
  });

  it("discard() forgets the frames", () => {
    const f = session((r) => r.hold(NEUTRAL, 4));
    expect(f.frameCount).toBe(4);
    const rec = new LandmarkRecorder();
    rec.start(true, 0);
    rec.discard();
    expect(rec.toFile().frames).toEqual([]);
    expect(rec.isRecording).toBe(false);
  });

  it("makes no network call and writes nothing to storage while recording or exporting", () => {
    const trap = vi.fn(() => { throw new Error("outside call"); });
    vi.stubGlobal("fetch", trap);
    vi.stubGlobal("XMLHttpRequest", trap);
    vi.stubGlobal("WebSocket", trap);
    vi.stubGlobal("navigator", { sendBeacon: trap });
    const store = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("localStorage", store);
    vi.stubGlobal("sessionStorage", store);
    const f = session((r) => r.hold(cls("palm"), 6));
    new LandmarkRecorder().toJSON();
    expect(f.frameCount).toBe(6);
    expect(trap).not.toHaveBeenCalled();
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it("a frame carries exactly the documented numeric keys: no image, video, face, name or date field", () => {
    const f = session((r) => r.hold(cls("palm"), 3));
    expect(Object.keys(f.frames[0]!).sort()).toEqual(
      ["action", "aspect", "fingerStates", "fingers", "fingersLegacy", "lm", "lock", "pinchRatio", "rawPose", "reject", "session", "stablePose", "t", "thumb", "truth"],
    );
    expect(Object.keys(f).sort()).toEqual(["consent", "contains", "frameCount", "frames", "mode", "schema", "truncated"]);
    const text = JSON.stringify(f.frames);
    expect(text).not.toMatch(/image|video|blob|dataurl|face|name|email|date|userAgent/i);
  });

  it("caps memory: past MAX_RECORD_FRAMES frames it stops adding and says truncated", () => {
    const rec = new LandmarkRecorder();
    const r = rig({ experimental: true }, (lab, lm, t) => rec.add(lab.snapshot(t), lm, "NO_GESTURE", t));
    rec.start(true, 0);
    // Fill via the public path with cheap no-hand frames.
    for (let i = 0; i < MAX_RECORD_FRAMES + 5; i++) r.feedLm(null);
    expect(rec.frameCount).toBe(MAX_RECORD_FRAMES);
    expect(rec.toFile().truncated).toBe(true);
  }, 60_000);
});

describe("scripted cases from the ticket (fixtures)", () => {
  it("THREE: three fingers with the thumb tucked is read as three, truth THREE", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("THREE");
      r.hold(cls("three"), 20);
    });
    const last = of(f, "THREE").at(-1)!;
    expect(last.stablePose).toBe("three-fingers");
    expect(last.fingers).toBe(3);
    expect(last.action).toBe("none");
  });

  it("FIVE: an open palm with the thumb out is five fingers and, once stable, erases", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("FIVE");
      r.hold(cls("palm"), 20);
    });
    const last = of(f, "FIVE").at(-1)!;
    expect(last.fingers).toBe(5);
    expect(last.thumb?.open).toBe(true);
    expect(["open-palm", "split-palm"]).toContain(last.stablePose);
    expect(of(f, "FIVE").some((x) => x.action === "erase")).toBe(true);
  });

  it("near-miss negative for FIVE: four fingers with the thumb tucked never reaches the erase action", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("NO_GESTURE"); // the tester marks it: this hand must NOT erase
      r.hold(cls("four"), 20);
    });
    const last = of(f, "NO_GESTURE").at(-1)!;
    expect(last.fingers).toBe(4);
    expect(last.fingersLegacy).toBe(5); // what the old rule would have counted
    expect(of(f, "NO_GESTURE").every((x) => x.action !== "erase")).toBe(true);
  });

  it("PINCH-NEAR: a thumb hovering 0.5 span away is a near miss and never draws", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("PINCH_NEAR");
      r.hold(skel(pinchSkeleton(0.5)), 24);
    });
    const near = of(f, "PINCH_NEAR");
    expect(near.length).toBe(24);
    expect(near.every((x) => x.action === "none")).toBe(true);
    expect(near.every((x) => x.pinchRatio !== null && x.pinchRatio > 0.3)).toBe(true);
  });

  it("PINCH-TOUCH: touching tips draw, and the ratio the rule saw is recorded", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("PINCH_TOUCH");
      r.hold(skel(pinchSkeleton(0.05)), 24);
    });
    const touch = of(f, "PINCH_TOUCH");
    expect(touch.some((x) => x.action === "draw")).toBe(true);
    expect(Math.min(...touch.map((x) => x.pinchRatio ?? 9))).toBeLessThan(0.3);
  });

  it("NO-GESTURE: a relaxed L-shaped hand produces no action at all", () => {
    const f = session((r, label) => {
      label("NO_GESTURE");
      r.hold(NEUTRAL, 30);
    });
    expect(of(f, "NO_GESTURE").every((x) => x.action === "none")).toBe(true);
  });

  it("TRANSITION: pinch, open, palm is recorded in order with the labels the tester gave", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("PINCH_TOUCH"); r.hold(skel(pinchSkeleton(0.05)), 12);
      label("TRANSITION"); r.hold(NEUTRAL, 6);
      label("FIVE"); r.hold(cls("palm"), 12);
    });
    const order = f.frames.map((x) => x.truth).filter((t, i, a) => i === 0 || t !== a[i - 1]);
    expect(order).toEqual(["UNLABELLED", "PINCH_TOUCH", "TRANSITION", "FIVE"]);
    expect(of(f, "TRANSITION").length).toBe(6);
  });

  it("NO-LANDMARK: frames without a hand have null landmarks, a lock state and no action", () => {
    const f = session((r, label) => {
      r.hold(NEUTRAL, 4);
      label("NO_LANDMARK");
      for (let i = 0; i < 15; i++) r.feedLm(null);
    });
    const none = of(f, "NO_LANDMARK");
    expect(none.length).toBe(15);
    expect(none.every((x) => x.lm === null && x.action === "none")).toBe(true);
    expect(none.at(-1)!.lock).toBe("waiting");
  });

  it("baseline mode is recorded as baseline, with the legacy count equal to the active count", () => {
    const f = session((r, label) => {
      label("FIVE");
      r.hold(cls("four"), 6);
    }, { experimental: false });
    expect(f.mode).toBe("baseline");
    expect(f.frames.at(-1)!.fingers).toBe(f.frames.at(-1)!.fingersLegacy);
  });
});

describe("file format", () => {
  const sample = () => session((r, label) => { label("FIVE"); r.hold(cls("palm"), 8); label("NO_LANDMARK"); r.feedLm(null); });

  it("validates, survives a JSON round trip, and carries the schema id and the consent flag", () => {
    const f = sample();
    expect(f.schema).toBe(RECORD_SCHEMA);
    expect(validateRecord(f)).toEqual([]);
    const rec = new LandmarkRecorder();
    rec.start(true, 0);
    const text = rec.toJSON();
    expect(validateRecord(JSON.parse(text))).toEqual([]);
  });

  it("every truth label in the schema is one of the documented ones", () => {
    expect([...TRUTH_LABELS]).toEqual(["THREE", "FIVE", "PINCH_NEAR", "PINCH_TOUCH", "NO_GESTURE", "TRANSITION", "NO_LANDMARK", "UNLABELLED"]);
  });

  it("validateRecord rejects missing consent, bad landmarks, unknown labels, time going backwards, and an action without a hand", () => {
    const f = sample();
    const bad = JSON.parse(JSON.stringify(f)) as RecordFile;
    expect(validateRecord({ ...bad, consent: false })).toContain("consent flag missing: this data must not be used");
    bad.frames[1]!.lm = bad.frames[1]!.lm!.slice(0, 20);
    bad.frames[2]!.truth = "SELFIE" as never;
    bad.frames[4]!.t = -5;
    const last = bad.frames.at(-1)!;
    last.action = "erase";
    const p = validateRecord(bad);
    expect(p).toEqual(expect.arrayContaining(["frame 1: landmarks", "frame 2: truth label", "frame 4: time goes backwards", `frame ${bad.frames.length - 1}: action without a hand`]));
  });

  it("rounds landmarks to 4 decimals and times to whole ms (no false precision)", () => {
    const f = sample();
    for (const x of f.frames) {
      expect(Number.isInteger(x.t)).toBe(true);
      for (const p of x.lm ?? []) for (const v of p) expect(Math.round(v * 1e4) / 1e4).toBe(v);
    }
  });
});
