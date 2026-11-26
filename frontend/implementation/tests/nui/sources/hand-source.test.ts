import { describe, expect, it, vi } from "vitest";
import type { InputSample } from "@/src/nui/core/types";
import type { HandDetector, HandFrame, HandLandmark } from "@/src/nui/sources/hand-detector";
import { HandSource } from "@/src/nui/sources/hand-source";

class MockHandDetector implements HandDetector {
  private readonly listeners = new Set<(f: HandFrame) => void>();
  started = false;
  stopped = false;
  failStartWith: Error | null = null;

  async start(): Promise<void> {
    if (this.failStartWith) throw this.failStartWith;
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  subscribe(cb: (frame: HandFrame) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(frame: HandFrame): void {
    for (const cb of [...this.listeners]) cb(frame);
  }
}

/** Buat 21 landmark tangan sintetis dengan MCP5 dan jarak cubit terkendali. */
function makeHand(opts: {
  mcpX?: number;
  mcpY?: number;
  pinchRatio?: number;
  open?: boolean;
}): HandLandmark[] {
  const mcpX = opts.mcpX ?? 0.5;
  const mcpY = opts.mcpY ?? 0.5;
  const palm = 0.2;
  const open = opts.open ?? true;
  const r = opts.pinchRatio ?? (open ? 0.65 : 0.18);
  const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: mcpX, y: mcpY, z: 0 }));

  // Wrist (0) & middle MCP (9): |P0-P9| = palm
  lm[0] = { x: mcpX, y: mcpY + palm, z: 0 };
  lm[9] = { x: mcpX, y: mcpY, z: 0 };
  lm[5] = { x: mcpX, y: mcpY, z: 0 };

  // Index tip (8) & thumb tip (4): vertical gap = r * palm (same axis as P0-P9 so aspect cancels cleanly!)
  const tipY = open ? mcpY - 0.14 : mcpY - 0.04;
  lm[6] = { x: mcpX, y: mcpY - 0.06, z: 0 };
  lm[8] = { x: mcpX, y: tipY, z: 0 };
  lm[4] = { x: mcpX, y: tipY + r * palm, z: 0 };

  // Remaining fingers (12/10, 16/14, 20/18)
  for (const [tip, pip] of [
    [12, 10],
    [16, 14],
    [20, 18],
  ] as const) {
    lm[pip] = { x: mcpX, y: mcpY - 0.05, z: 0 };
    lm[tip] = { x: mcpX, y: open ? mcpY - 0.15 : mcpY + 0.02, z: 0 };
  }
  return lm;
}

function frame(t: number, hands: HandLandmark[][]): HandFrame {
  return { t, videoWidth: 1280, videoHeight: 720, hands };
}

describe("HandSource (R1 assembly over HandDetector)", () => {
  it("acquires after 2 open frames, exposes raw/filtered coords, and rolls back clickPoint by 200ms", () => {
    const detector = new MockHandDetector();
    const samples: InputSample[] = [];
    const hs = new HandSource({
      detector,
      getViewport: () => ({ w: 1280, h: 720 }),
    });
    hs.subscribe((s) => samples.push(s));
    hs.start();

    // Frame 1 open: not tracking yet (REACQUIRE_OPEN_FRAMES = 2).
    detector.emit(frame(0, [makeHand({ mcpX: 0.7, mcpY: 0.45, open: true })]));
    expect(samples).toHaveLength(0);
    expect(hs.getStatus().ownerActive).toBe(false);

    // Frame 2..9 steady open hand at mcpX=0.7 -> mirrored raw.x = 0.3.
    for (let t = 33; t <= 330; t += 33) {
      detector.emit(frame(t, [makeHand({ mcpX: 0.7, mcpY: 0.45, open: true })]));
    }
    expect(hs.getStatus().ownerActive).toBe(true);
    expect(hs.getStatus().frozen).toBe(false);
    expect(hs.getStatus().raw?.x).toBeCloseTo(0.3, 3);
    const stableBeforePinch = samples[samples.length - 1]!;

    // During the last ~120ms before pinch, hand jerks rapidly toward mcpX=0.35 (right side of screen).
    detector.emit(frame(380, [makeHand({ mcpX: 0.56, mcpY: 0.45, open: true })]));
    detector.emit(frame(430, [makeHand({ mcpX: 0.42, mcpY: 0.45, open: true })]));
    // 2 unique pinched frames (r = 0.18 < 0.30) -> PINCH_ON at t=500.
    detector.emit(frame(470, [makeHand({ mcpX: 0.35, mcpY: 0.45, open: false, pinchRatio: 0.18 })]));
    detector.emit(frame(500, [makeHand({ mcpX: 0.35, mcpY: 0.45, open: false, pinchRatio: 0.18 })]));

    const onSample = samples[samples.length - 1]!;
    expect(onSample.pinch).toBe(true);
    expect(onSample.clickPoint).toBeDefined();
    // Rollback at t = 500 - 200 = 300ms must be close to the stable pre-jerk position, NOT the drifted x!
    expect(Math.abs((onSample.clickPoint?.x ?? 0) - stableBeforePinch.x)).toBeLessThan(35);
    expect(Math.abs(onSample.x - (onSample.clickPoint?.x ?? 0))).toBeGreaterThan(50);

    // Nib rollback seed & tail trim work on the assembled NibFilter.
    const seed = hs.beginNib(500);
    expect(seed.length).toBeGreaterThan(0);
    const trimmed = hs.endNib(
      [
        { x: 10, y: 10, t: 100 },
        { x: 20, y: 20, t: 350 },
        { x: 90, y: 90, t: 480 },
      ],
      500,
    );
    expect(trimmed).toHaveLength(1);
    hs.stop();
  });

  it("freezes during short loss (< T_gap), ignores stranger hand, and expires cleanly (> T_gap)", () => {
    const detector = new MockHandDetector();
    const samples: InputSample[] = [];
    const hs = new HandSource({ detector, getViewport: () => ({ w: 1000, h: 600 }) });
    hs.subscribe((s) => samples.push(s));
    hs.start();

    // Acquire owner on left side (mcpX = 0.8 -> mirrored 0.2).
    detector.emit(frame(0, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    detector.emit(frame(33, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    detector.emit(frame(66, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    expect(hs.getStatus().ownerActive).toBe(true);
    const ownerX = samples[samples.length - 1]!.x;

    // Stranger enters far away (mcpX = 0.2) while owner is still there -> ignored.
    detector.emit(
      frame(99, [
        makeHand({ mcpX: 0.8, mcpY: 0.5, open: true }),
        makeHand({ mcpX: 0.2, mcpY: 0.5, open: true }),
      ]),
    );
    expect(Math.abs(samples[samples.length - 1]!.x - ownerX)).toBeLessThan(15);

    // Owner disappears at t=200 (101ms < T_gap=250ms), stranger remains -> FROZEN, control does NOT switch!
    detector.emit(frame(200, [makeHand({ mcpX: 0.2, mcpY: 0.5, open: true })]));
    expect(hs.getStatus().frozen).toBe(true);
    expect(hs.getStatus().ownerActive).toBe(true);
    expect(samples[samples.length - 1]!.inFrame).toBe(true);
    expect(Math.abs(samples[samples.length - 1]!.x - ownerX)).toBeLessThan(15);

    // Beyond T_gap (t=400 > 99 + 250): expires, resets, emits inFrame=false & pinch=false.
    detector.emit(frame(400, []));
    expect(hs.getStatus().frozen).toBe(false);
    expect(hs.getStatus().ownerActive).toBe(false);
    const expiredSample = samples[samples.length - 1]!;
    expect(expiredSample.inFrame).toBe(false);
    expect(expiredSample.pinch).toBe(false);
    hs.stop();
  });

  it("fails closed when detector.start() rejects", async () => {
    const detector = new MockHandDetector();
    detector.failStartWith = new Error("NotAllowedError");
    const onError = vi.fn();
    const hs = new HandSource({ detector, onError });
    hs.start();

    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(hs.getStatus().error).toContain("NotAllowedError");
    expect(hs.getStatus().ownerActive).toBe(false);
  });

  it("keeps HandSource T_gap synced with lossHold.tGap() at 120ms/frame despite 33ms empty frames & stranger (BERAT-2)", () => {
    const detector = new MockHandDetector();
    const samples: InputSample[] = [];
    const hs = new HandSource({ detector, getViewport: () => ({ w: 1000, h: 600 }) });
    hs.subscribe((s) => samples.push(s));
    hs.start();

    // Low-light cadence: 120ms per owner frame => lossHold.tGap() = clamp(3 * 120, 250, 500) = 360ms.
    detector.emit(frame(0, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    detector.emit(frame(120, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    detector.emit(frame(240, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    detector.emit(frame(360, [makeHand({ mcpX: 0.8, mcpY: 0.5, open: true })]));
    expect(hs.getStatus().ownerActive).toBe(true);
    const ownerX = samples[samples.length - 1]!.x;

    // Owner disappears; fast 33ms frames with an open stranger on the far right arrive for 280ms (> 250ms, <= 360ms).
    for (let t = 393; t <= 640; t += 33) {
      detector.emit(frame(t, [makeHand({ mcpX: 0.2, mcpY: 0.5, open: true })]));
    }
    expect(hs.getStatus().frozen).toBe(true);
    expect(hs.getStatus().ownerActive).toBe(true);
    expect(hs.getStatus().holdState).toBe("held");
    expect(Math.abs(samples[samples.length - 1]!.x - ownerX)).toBeLessThan(15);

    // Owner returns at t=680 (320ms missing <= 360ms) while pinching -> resumes cleanly without hijack or reset!
    detector.emit(
      frame(680, [
        makeHand({ mcpX: 0.8, mcpY: 0.5, open: false, pinchRatio: 0.18 }),
        makeHand({ mcpX: 0.2, mcpY: 0.5, open: true }),
      ]),
    );
    expect(hs.getStatus().frozen).toBe(false);
    expect(hs.getStatus().ownerActive).toBe(true);
    expect(hs.getStatus().holdState).toBe("tracking");
    expect(Math.abs(samples[samples.length - 1]!.x - ownerX)).toBeLessThan(15);
    hs.stop();
  });

  it("emits preferredHoverId from mostHovered(400ms) on PINCH_ON (BERAT-3)", () => {
    const detector = new MockHandDetector();
    const samples: InputSample[] = [];
    const hs = new HandSource({
      detector,
      getViewport: () => ({ w: 1000, h: 600 }),
      getHoverId: (x) => (x < 500 ? "target-left" : "target-right"),
    });
    hs.subscribe((s) => samples.push(s));
    hs.start();

    // Acquire & hover left (mcpX=0.75 -> mirrored 0.25 -> viewport x < 500) for ~260ms
    for (let t = 0; t <= 264; t += 33) {
      detector.emit(frame(t, [makeHand({ mcpX: 0.75, mcpY: 0.45, open: true })]));
    }
    // Smooth drift right (< HAND_MATCH_MAX_DIST=0.35 per step) into pinch onset (2 frames)
    detector.emit(frame(297, [makeHand({ mcpX: 0.52, mcpY: 0.45, open: true })]));
    detector.emit(frame(330, [makeHand({ mcpX: 0.28, mcpY: 0.45, open: false, pinchRatio: 0.18 })]));
    detector.emit(frame(363, [makeHand({ mcpX: 0.28, mcpY: 0.45, open: false, pinchRatio: 0.18 })]));

    const onSample = samples[samples.length - 1]!;
    expect(onSample.pinch).toBe(true);
    expect(onSample.preferredHoverId).toBe("target-left");
    hs.stop();
  });

  it("tracks rigid palm center for main cursor and anchors pencil nib to MCP5 on pinch without fingertip jitter", () => {
    const detector = new MockHandDetector();
    const samples: InputSample[] = [];
    const hs = new HandSource({ detector, getViewport: () => ({ w: 1280, h: 720 }) });
    hs.subscribe((s) => samples.push(s));
    hs.start();

    // Steady hand; index fingertip (lm[8]) jitters wildly while palm & MCP5 stay still.
    for (let i = 0; i < 6; i++) {
      const lm = makeHand({ mcpX: 0.5, mcpY: 0.45, open: true });
      lm[8] = { x: 0.5 + (i % 2 === 0 ? 0.12 : -0.12), y: 0.31, z: 0 };
      detector.emit(frame(i * 33, [lm]));
    }
    const hoverSample = samples[samples.length - 1]!;
    expect(Math.abs((hoverSample.nib?.x ?? 0) - hoverSample.x)).toBeLessThan(1);
    expect(Math.abs((hoverSample.nib?.y ?? 0) - hoverSample.y)).toBeLessThan(1);

    // Pinch starts while palm & MCP5 stay still -> zero jump on both display and nib!
    for (let i = 6; i < 8; i++) {
      const lm = makeHand({ mcpX: 0.5, mcpY: 0.45, open: false, pinchRatio: 0.18 });
      detector.emit(frame(i * 33, [lm]));
    }
    const pinchStart = samples[samples.length - 1]!;
    expect(pinchStart.pinch).toBe(true);
    expect(Math.abs(pinchStart.x - hoverSample.x)).toBeLessThan(2);
    expect(Math.abs((pinchStart.nib?.x ?? 0) - hoverSample.x)).toBeLessThan(2);

    // Move MCP5 right (mirrored X increases -> raw mcpX decreases) while pinching -> nib follows MCP5 cleanly.
    const movedLm = makeHand({ mcpX: 0.5, mcpY: 0.45, open: false, pinchRatio: 0.18 });
    movedLm[5] = { x: 0.42, y: 0.45, z: 0 };
    detector.emit(frame(8 * 33, [movedLm]));
    const dragged = samples[samples.length - 1]!;
    expect((dragged.nib?.x ?? 0) - (pinchStart.nib?.x ?? 0)).toBeGreaterThan(20);
    hs.stop();
  });
});
