import { describe, expect, it } from "vitest";
import {
  DARK_LUMA,
  createFrameSource,
  frameForDetection,
  getFrameSourceStats,
  setLowLightEnhancement,
} from "../../src/camera/frame-source";

/** Fake webcam: a grey RGBA frame at its own resolution. */
class FakeVideo {
  pixels: Uint8ClampedArray;
  constructor(
    public videoWidth: number,
    public videoHeight: number,
    grey: number,
  ) {
    this.pixels = new Uint8ClampedArray(videoWidth * videoHeight * 4);
    this.setGrey(grey);
  }
  setGrey(grey: number) {
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = grey;
      this.pixels[i + 1] = grey;
      this.pixels[i + 2] = grey;
      this.pixels[i + 3] = 255;
    }
  }
}

/** Fake 2D canvas: nearest-neighbour drawImage, real pixel buffer, counts draws. */
class FakeCanvas {
  width = 300;
  height = 150;
  buffer = new Uint8ClampedArray(0);
  draws = 0;
  throwOnDraw = false;
  noContext = false;

  getContext(): unknown {
    if (this.noContext) return null;
    const canvas = this;
    return {
      drawImage(src: FakeVideo, _dx: number, _dy: number, dw: number, dh: number) {
        if (canvas.throwOnDraw) throw new Error("draw failed");
        canvas.draws++;
        canvas.width = dw;
        canvas.height = dh;
        canvas.buffer = new Uint8ClampedArray(dw * dh * 4);
        for (let y = 0; y < dh; y++) {
          for (let x = 0; x < dw; x++) {
            const sx = Math.floor((x * src.videoWidth) / dw);
            const sy = Math.floor((y * src.videoHeight) / dh);
            const si = (sy * src.videoWidth + sx) * 4;
            canvas.buffer.set(src.pixels.subarray(si, si + 4), (y * dw + x) * 4);
          }
        }
      },
      getImageData(_x: number, _y: number, w: number, h: number) {
        return { data: new Uint8ClampedArray(canvas.buffer), width: w, height: h };
      },
      putImageData(img: { data: Uint8ClampedArray }) {
        canvas.buffer = new Uint8ClampedArray(img.data);
      },
    };
  }
}

function harness() {
  let t = 0;
  const canvases: FakeCanvas[] = [];
  const source = createFrameSource({
    now: () => t,
    createCanvas: () => {
      const c = new FakeCanvas();
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
  });
  return {
    source,
    canvases,
    at(ms: number) {
      t = ms;
    },
    video(w: number, h: number, grey: number) {
      return new FakeVideo(w, h, grey) as unknown as HTMLVideoElement;
    },
  };
}

const DARK = 40; // luma ~0.16, below DARK_LUMA
const BRIGHT = 170; // luma ~0.67

describe("frameForDetection", () => {
  it("keeps the public signature: one video argument", () => {
    expect(frameForDetection.length).toBe(1);
  });

  it("returns the video itself for a bright scene in auto mode", () => {
    const h = harness();
    const video = h.video(640, 360, BRIGHT);
    expect(h.source.frameForDetection(video)).toBe(video);
  });

  it("returns an enhanced canvas for a dark scene in auto mode", () => {
    const h = harness();
    const video = h.video(640, 360, DARK);
    const frame = h.source.frameForDetection(video);

    expect(frame).not.toBe(video);
    expect(h.source.getFrameSourceStats().enhancing).toBe(true);
    expect(h.source.getFrameSourceStats().lastLuma).toBeLessThan(DARK_LUMA);
    expect(h.source.getFrameSourceStats().lastClaheMs).not.toBeNull();
  });

  it("draws the enhanced frame 320 px wide and keeps the aspect ratio", () => {
    const h = harness();
    h.source.setLowLightEnhancement("on");
    const wide = h.source.frameForDetection(h.video(1280, 720, DARK)) as unknown as FakeCanvas;
    expect([wide.width, wide.height]).toEqual([320, 180]);

    const boxy = h.source.frameForDetection(h.video(640, 480, DARK)) as unknown as FakeCanvas;
    expect([boxy.width, boxy.height]).toEqual([320, 240]);
  });

  it("samples luma at most every 500 ms", () => {
    const h = harness();
    const video = h.video(640, 360, BRIGHT);
    for (const ms of [0, 100, 499, 500, 900]) {
      h.at(ms);
      h.source.frameForDetection(video);
    }
    // Only the samples at t=0 and t=500 draw the video into the small canvas.
    expect(h.canvases[0]!.draws).toBe(2);
  });

  it("keeps enhancing dark frames between luma samples", () => {
    const h = harness();
    const video = h.video(640, 360, DARK);
    h.at(0);
    h.source.frameForDetection(video);
    h.at(100);
    const frame = h.source.frameForDetection(video);
    expect(frame).toBe(h.canvases[0]);
    expect(h.canvases[0]!.draws).toBe(2);
  });

  it("follows a scene that turns bright, but only after the next luma sample", () => {
    const h = harness();
    const video = h.video(640, 360, DARK);
    h.at(0);
    expect(h.source.frameForDetection(video)).not.toBe(video);

    (video as unknown as FakeVideo).setGrey(BRIGHT);

    h.at(200);
    expect(h.source.frameForDetection(video)).not.toBe(video); // still cached as dark
    h.at(500);
    expect(h.source.frameForDetection(video)).toBe(video);
  });

  it("never enhances when mode is off, and never creates the canvas", () => {
    const h = harness();
    h.source.setLowLightEnhancement("off");
    const video = h.video(640, 360, DARK);
    expect(h.source.frameForDetection(video)).toBe(video);
    expect(h.canvases.length).toBe(0);
  });

  it("always enhances when mode is on, even for a bright scene", () => {
    const h = harness();
    h.source.setLowLightEnhancement("on");
    const frame = h.source.frameForDetection(h.video(640, 360, BRIGHT));
    expect(frame).toBe(h.canvases[0]);
  });

  it("returns the video when the video has no size yet", () => {
    const h = harness();
    const video = h.video(0, 0, DARK);
    expect(h.source.frameForDetection(video)).toBe(video);
  });

  it("returns the video, never throws, when the canvas has no 2D context", () => {
    const h = harness();
    const video = h.video(640, 360, DARK);
    const broken = createFrameSource({
      now: () => 0,
      createCanvas: () => {
        const c = new FakeCanvas();
        c.noContext = true;
        return c as unknown as HTMLCanvasElement;
      },
    });
    expect(broken.frameForDetection(video)).toBe(video);
  });

  it("returns the video, never throws, when drawing fails", () => {
    const broken = createFrameSource({
      now: () => 0,
      createCanvas: () => {
        const c = new FakeCanvas();
        c.throwOnDraw = true;
        return c as unknown as HTMLCanvasElement;
      },
    });
    const video = new FakeVideo(640, 360, DARK) as unknown as HTMLVideoElement;
    expect(() => broken.frameForDetection(video)).not.toThrow();
    expect(broken.frameForDetection(video)).toBe(video);
  });

  it("returns the video in a plain node environment with no DOM (default instance)", () => {
    const video = new FakeVideo(640, 360, DARK) as unknown as HTMLVideoElement;
    expect(() => frameForDetection(video)).not.toThrow();
    expect(frameForDetection(video)).toBe(video);
  });
});

describe("setLowLightEnhancement and getFrameSourceStats", () => {
  it("reports the mode that was set", () => {
    setLowLightEnhancement("off");
    expect(getFrameSourceStats().mode).toBe("off");
    setLowLightEnhancement("auto");
    expect(getFrameSourceStats().mode).toBe("auto");
  });

  it("reports stats for an instance after a dark frame", () => {
    const h = harness();
    h.source.frameForDetection(h.video(640, 360, DARK));
    const stats = h.source.getFrameSourceStats();
    expect(stats.mode).toBe("auto");
    expect(typeof stats.lastLuma).toBe("number");
    expect(stats.lastClaheMs).toBeGreaterThanOrEqual(0);
  });
});
