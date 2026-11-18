import { describe, expect, it } from "vitest";
import { SWIPE_CONFIG, SwipeCommander, type SwipeKind } from "@/src/components/nui-lab/lab-swipe";
import type { HandPose } from "@/src/input/hand-gesture";

/**
 * NUI-R17-03 (REV4): Undo and Redo by swipe, lab-only. The mapping under test (one finger + left = Undo,
 * two fingers + right = Redo) is a CANDIDATE, not a product decision. Evidence class: UNIT_ONLY (synthetic motion).
 * Units: hand spans; the hand span is 1.0 here, so a travel of 1.5 means 1.5 hand widths.
 */
const FPS = 30;
const dt = 1000 / FPS;

interface Run {
  cmd: SwipeCommander;
  fired: SwipeKind[];
  t: number;
}
function start(): Run {
  return { cmd: new SwipeCommander(), fired: [], t: 1000 };
}
function feed(r: Run, pose: HandPose, x: number, y = 0, permitted = true): void {
  r.t += dt;
  const k = r.cmd.feed({ pose, x, y, spanPx: 1, nowMs: r.t, permitted });
  if (k) r.fired.push(k);
}
/** Hold still, then move `travel` spans horizontally in `ms`, then hold still again. */
function swipe(r: Run, pose: HandPose, x0: number, travel: number, ms: number, wobbleY = 0): number {
  for (let i = 0; i < 6; i++) feed(r, pose, x0);
  const n = Math.max(2, Math.round(ms / dt));
  for (let i = 1; i <= n; i++) feed(r, pose, x0 + (travel * i) / n, wobbleY * Math.sin(i));
  for (let i = 0; i < 6; i++) feed(r, pose, x0 + travel);
  return x0 + travel;
}

describe("a still pose never fires", () => {
  it("one finger held for 3 seconds: no Undo", () => {
    const r = start();
    for (let i = 0; i < 90; i++) feed(r, "one-finger", 2);
    expect(r.fired).toEqual([]);
    expect(r.cmd.debug().phase).toBe("pose-armed");
  });

  it("two fingers held for 3 seconds: no Redo", () => {
    const r = start();
    for (let i = 0; i < 90; i++) feed(r, "two-fingers", 2);
    expect(r.fired).toEqual([]);
  });
});

describe("candidate mapping", () => {
  it("one finger swipe LEFT = Undo, exactly once", () => {
    const r = start();
    swipe(r, "one-finger", 5, -2, 350);
    expect(r.fired).toEqual(["undo"]);
  });

  it("two fingers swipe RIGHT = Redo, exactly once", () => {
    const r = start();
    swipe(r, "two-fingers", 1, 2, 350);
    expect(r.fired).toEqual(["redo"]);
  });

  it("the wrong direction for the pose does nothing (one finger RIGHT, two fingers LEFT)", () => {
    const a = start();
    swipe(a, "one-finger", 1, 2, 350);
    expect(a.fired).toEqual([]);
    const b = start();
    swipe(b, "two-fingers", 5, -2, 350);
    expect(b.fired).toEqual([]);
  });
});

describe("noise and slow drifts never fire", () => {
  it("tremor: left-right jitter of 0.2 span around a point", () => {
    const r = start();
    for (let i = 0; i < 120; i++) feed(r, "one-finger", 3 + 0.2 * Math.sin(i * 1.7), 0.1 * Math.cos(i));
    expect(r.fired).toEqual([]);
  });

  it("a slow drift of 2 spans over 4 seconds is not a swipe", () => {
    const r = start();
    swipe(r, "one-finger", 5, -2, 4000);
    expect(r.fired).toEqual([]);
  });

  it("a short move of 0.8 span is not a swipe", () => {
    const r = start();
    swipe(r, "one-finger", 5, -0.8, 250);
    expect(r.fired).toEqual([]);
  });

  it("a mostly vertical move is not a swipe", () => {
    const r = start();
    for (let i = 0; i < 6; i++) feed(r, "one-finger", 5, 0);
    for (let i = 1; i <= 10; i++) feed(r, "one-finger", 5 - 0.1 * i, 0.3 * i);
    expect(r.fired).toEqual([]);
  });

  it("a zig-zag (large path, small net travel) is not a swipe", () => {
    const r = start();
    for (let i = 0; i < 6; i++) feed(r, "one-finger", 5);
    for (let i = 0; i < 20; i++) feed(r, "one-finger", 5 - 0.9 * ((i % 2) * 2 - 1) * 1, 0);
    expect(r.fired).toEqual([]);
  });
});

describe("one swipe is one action", () => {
  it("a long continued swipe fires once, not repeatedly", () => {
    const r = start();
    swipe(r, "one-finger", 10, -8, 900);
    expect(r.fired).toEqual(["undo"]);
  });

  it("a second swipe right after the first is held by the cooldown; after the cooldown and a still hand it fires again", () => {
    const r = start();
    let x = swipe(r, "one-finger", 10, -2, 350);
    expect(r.fired).toEqual(["undo"]);
    x = swipe(r, "one-finger", x, -2, 300); // inside the cooldown (800 ms), the hand is not "still" first
    expect(r.fired).toEqual(["undo"]);
    for (let i = 0; i < Math.ceil(SWIPE_CONFIG.cooldownMs / dt) + 10; i++) feed(r, "one-finger", x); // wait + still
    swipe(r, "one-finger", x, -2, 350);
    expect(r.fired).toEqual(["undo", "undo"]);
  });
});

describe("anything that makes the hand untrustworthy cancels the swipe in progress", () => {
  /** 14 frames of steady leftward motion, 0.12 span each = 1.68 spans in 470 ms: fires if nothing interrupts it. */
  const steady = (r: Run, pose: HandPose, from: number, to: number, hook?: (i: number) => void) => {
    for (let i = from; i <= to; i++) {
      hook?.(i);
      feed(r, pose, 5 - 0.12 * i);
    }
  };

  it("control: the uninterrupted motion fires Undo", () => {
    const r = start();
    for (let i = 0; i < 6; i++) feed(r, "one-finger", 5);
    steady(r, "one-finger", 1, 14);
    expect(r.fired).toEqual(["undo"]);
  });

  it("losing the lock (permitted=false) in mid swipe cancels it", () => {
    const r = start();
    for (let i = 0; i < 6; i++) feed(r, "one-finger", 5);
    for (let i = 1; i <= 14; i++) {
      r.t += dt;
      const k = r.cmd.feed({ pose: "one-finger", x: 5 - 0.12 * i, y: 0, spanPx: 1, nowMs: r.t, permitted: i !== 6 });
      if (k) r.fired.push(k);
    }
    expect(r.fired).toEqual([]);
    expect(r.cmd.debug().lastCancel).toBe("lock");
  });

  it("an explicit cancel (hand lost, new acquisition) clears the buffer and the streak", () => {
    const r = start();
    for (let i = 0; i < 6; i++) feed(r, "one-finger", 5);
    steady(r, "one-finger", 1, 5);
    r.cmd.cancel("new-acquisition");
    expect(r.cmd.debug().phase).toBe("idle");
    expect(r.cmd.debug().lastCancel).toBe("new-acquisition");
    steady(r, "one-finger", 6, 14);
    expect(r.fired).toEqual([]);
  });

  it("changing pose mid swipe (one finger to two fingers) restarts the proof", () => {
    const r = start();
    for (let i = 0; i < 6; i++) feed(r, "one-finger", 5);
    steady(r, "one-finger", 1, 6);
    steady(r, "two-fingers", 7, 14);
    expect(r.fired).toEqual([]);
  });

  it("other poses (pinch, palm, fist) never fire and reset the machine", () => {
    for (const pose of ["pinch", "open-palm", "fist", "thumb-up", "none"] as const) {
      const r = start();
      swipe(r, pose, 5, -3, 300);
      expect(r.fired).toEqual([]);
      expect(r.cmd.debug().phase).toBe("idle");
    }
  });
});
