// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { FaceAnchor, faceBoxFromDetections, type FaceDetectorLike } from "@/src/camera/face-anchor";
import { FACE_LOST_MS } from "@/src/camera/hand-config";

const box = (originX: number, originY: number, width: number, height: number) => ({
  boundingBox: { originX, originY, width, height },
});

function video(over: Partial<HTMLVideoElement> = {}) {
  return { readyState: 4, currentTime: 0, videoWidth: 640, videoHeight: 480, ...over } as HTMLVideoElement;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("faceBoxFromDetections (pure)", () => {
  it("returns null when there is no face box", () => {
    expect(faceBoxFromDetections([], 640, 480)).toBeNull();
    expect(faceBoxFromDetections([{}], 640, 480)).toBeNull();
  });

  it("normalises the pixel box by the video size", () => {
    const b = faceBoxFromDetections([box(320, 96, 128, 144)], 640, 480);
    expect(b!.x).toBeCloseTo(0.5);
    expect(b!.y).toBeCloseTo(0.2);
    expect(b!.w).toBeCloseTo(0.2);
    expect(b!.h).toBeCloseTo(0.3);
  });

  it("picks the largest face", () => {
    const b = faceBoxFromDetections([box(300, 100, 100, 100), box(0, 0, 300, 300)], 640, 480);
    expect(b!.w).toBeCloseTo(300 / 640);
  });

  it("between two faces of the same size, picks the one nearer the middle of the frame", () => {
    const b = faceBoxFromDetections([box(0, 100, 100, 100), box(270, 100, 100, 100)], 640, 480);
    expect(b!.x + b!.w / 2).toBeCloseTo(0.5, 1);
  });

  it("ignores a box with no size", () => {
    expect(faceBoxFromDetections([box(10, 10, 0, 0)], 640, 480)).toBeNull();
  });
});

describe("FaceAnchor", () => {
  it("looks at the face about 4 times a second, not on every camera frame", async () => {
    let t = 0;
    const detectForVideo = vi.fn(() => ({ detections: [box(288, 96, 64, 96)] }));
    const detector: FaceDetectorLike = { detectForVideo, close: vi.fn() };
    const anchor = new FaceAnchor({ load: async () => detector, now: () => t });
    const v = video();

    anchor.update(v, t); // starts the model load
    await flush();
    for (let i = 0; i < 60; i++) {
      t = i * 33; // 2 s of 30 fps camera frames
      v.currentTime = i + 1;
      anchor.update(v, t);
    }
    expect(detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(detectForVideo.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it("reports the last seen face for FACE_LOST_MS, then reports none", async () => {
    let t = 0;
    let found = true;
    const detector: FaceDetectorLike = {
      detectForVideo: vi.fn(() => ({ detections: found ? [box(288, 96, 64, 96)] : [] })),
      close: vi.fn(),
    };
    const anchor = new FaceAnchor({ load: async () => detector, now: () => t });
    const v = video();
    anchor.update(v, t);
    await flush();

    t = 300;
    v.currentTime = 1;
    anchor.update(v, t);
    expect(anchor.current(t)).not.toBeNull();

    found = false; // the face leaves the frame
    t = 600;
    v.currentTime = 2;
    anchor.update(v, t);
    expect(anchor.current(t)).not.toBeNull(); // still held: a missed frame is not a lost face
    expect(anchor.current(300 + FACE_LOST_MS + 1)).toBeNull();
  });

  it("does nothing before the video has a frame", async () => {
    const detectForVideo = vi.fn(() => ({ detections: [box(288, 96, 64, 96)] }));
    const anchor = new FaceAnchor({ load: async () => ({ detectForVideo, close: vi.fn() }), now: () => 0 });
    anchor.update(video({ readyState: 1 } as never), 0);
    await flush();
    anchor.update(video({ readyState: 1 } as never), 1000);
    expect(detectForVideo).not.toHaveBeenCalled();
    expect(anchor.current(1000)).toBeNull();
  });

  it("never throws and reports no face when the model cannot load", async () => {
    const anchor = new FaceAnchor({ load: () => Promise.reject(new Error("404")), now: () => 0 });
    expect(() => anchor.update(video(), 0)).not.toThrow();
    await flush();
    expect(() => anchor.update(video(), 1000)).not.toThrow();
    expect(anchor.current(1000)).toBeNull();
  });

  it("gives up after repeated detector failures instead of calling it forever", async () => {
    let t = 0;
    const detectForVideo = vi.fn(() => {
      throw new Error("boom");
    });
    const anchor = new FaceAnchor({ load: async () => ({ detectForVideo, close: vi.fn() }), now: () => t });
    const v = video();
    anchor.update(v, t);
    await flush();
    for (let i = 1; i <= 10; i++) {
      t = i * 1000;
      v.currentTime = i;
      anchor.update(v, t);
    }
    expect(detectForVideo.mock.calls.length).toBe(3);
    expect(anchor.current(t)).toBeNull();
  });
});
