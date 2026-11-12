/**
 * Single seam between the webcam <video> and every MediaPipe detectForVideo call.
 *
 * Contract (owned by the lead; W-CLAHE fills in the enhancement, W-HAND routes every detector through it):
 * - `frameForDetection(video)` returns what the detector should see for this frame: the video itself
 *   (baseline) or a canvas with low-light enhancement applied.
 * - It must never throw and never block for long; on any failure it returns the video.
 *
 * Landmarks from a canvas are normalised (0..1), like those from the video, and the canvas has the
 * same aspect ratio, so overlay and cursor mapping do not change when the enhanced frame is used.
 */
import { claheRgba } from "./clahe";
import { meanLuma } from "./luma";

export type DetectionFrame = HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;

export type LowLightMode = "auto" | "off" | "on";

/** Mean image luma (0..1) below which a frame counts as dark. Starting value, not measured. */
export const DARK_LUMA = 0.28;
/** How often the scene brightness is re-measured in auto mode. */
export const LUMA_SAMPLE_INTERVAL_MS = 500;
/** Width of the enhancement canvas. Small on purpose: CLAHE cost scales with pixels. */
export const ENHANCE_WIDTH = 320;

export interface FrameSourceStats {
  mode: LowLightMode;
  /** Last measured mean luma (0..1), or null before the first sample. */
  lastLuma: number | null;
  /** Duration of the last CLAHE pass in ms, or null if none ran yet. */
  lastClaheMs: number | null;
  /** True when the last frame handed to a detector was the enhanced canvas. */
  enhancing: boolean;
}

/** The subset of a 2D canvas context this module uses. */
interface Surface2D {
  drawImage(source: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  putImageData(image: ImageData, dx: number, dy: number): void;
}

export interface FrameSourceDeps {
  now(): number;
  createCanvas(): HTMLCanvasElement;
}

export interface FrameSource {
  frameForDetection(video: HTMLVideoElement): DetectionFrame;
  setLowLightEnhancement(mode: LowLightMode): void;
  getFrameSourceStats(): FrameSourceStats;
}

/** Builds an independent frame source. The module-level functions below use one default instance. */
export function createFrameSource(deps: FrameSourceDeps): FrameSource {
  let mode: LowLightMode = "auto";
  let darkNow = false;
  let lastSampleAt = Number.NEGATIVE_INFINITY;
  let lastLuma: number | null = null;
  let lastClaheMs: number | null = null;
  let enhancing = false;
  let canvas: HTMLCanvasElement | null = null;
  let surface: Surface2D | null = null;

  /** Draws the video into the small canvas and returns its pixels, or null if no context. */
  function drawScaled(video: HTMLVideoElement): ImageData | null {
    const width = ENHANCE_WIDTH;
    const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
    if (!canvas) canvas = deps.createCanvas();
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (!surface) {
      surface = canvas.getContext("2d", { willReadFrequently: true }) as Surface2D | null;
      if (!surface) return null;
    }
    surface.drawImage(video, 0, 0, width, height);
    return surface.getImageData(0, 0, width, height);
  }

  function frameForDetection(video: HTMLVideoElement): DetectionFrame {
    try {
      if (mode === "off") {
        enhancing = false;
        return video;
      }
      if (!video.videoWidth || !video.videoHeight) return video;

      const now = deps.now();
      let image: ImageData | null = null;

      if (mode === "auto" && now - lastSampleAt >= LUMA_SAMPLE_INTERVAL_MS) {
        lastSampleAt = now;
        image = drawScaled(video);
        if (!image) return video;
        lastLuma = meanLuma(image.data, image.width, image.height, 2);
        darkNow = lastLuma < DARK_LUMA;
      }

      const useCanvas = mode === "on" || darkNow;
      if (!useCanvas) {
        enhancing = false;
        return video;
      }

      image ??= drawScaled(video);
      if (!image || !canvas || !surface) return video;

      // CLAHE is in place on the scaled pixels; the detector sees the enhanced canvas.
      const t0 = deps.now();
      claheRgba(image.data, image.width, image.height, {}, image.data);
      lastClaheMs = deps.now() - t0;
      surface.putImageData(image, 0, 0);
      enhancing = true;
      return canvas;
    } catch {
      // A detector must keep running even if enhancement breaks; fall back to the raw video.
      enhancing = false;
      return video;
    }
  }

  return {
    frameForDetection,
    setLowLightEnhancement(next: LowLightMode) {
      mode = next;
      // Re-sample at once, so a mode change does not wait out the interval.
      lastSampleAt = Number.NEGATIVE_INFINITY;
      darkNow = false;
    },
    getFrameSourceStats(): FrameSourceStats {
      return { mode, lastLuma, lastClaheMs, enhancing };
    },
  };
}

const defaultSource = createFrameSource({
  now: () => performance.now(),
  createCanvas: () => document.createElement("canvas"),
});

/** What every detector should be given for this video frame. Video itself unless the scene is dark. */
export function frameForDetection(video: HTMLVideoElement): DetectionFrame {
  return defaultSource.frameForDetection(video);
}

export function setLowLightEnhancement(mode: LowLightMode): void {
  defaultSource.setLowLightEnhancement(mode);
}

export function getFrameSourceStats(): FrameSourceStats {
  return defaultSource.getFrameSourceStats();
}
