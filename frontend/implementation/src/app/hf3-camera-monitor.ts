import {
  BlackFrameDetector,
  CameraExposureController,
  probeCameraExposureCapabilities,
  type ExposureControlState,
  type ExposureControlStatus,
} from "@/src/components/nui-lab/bench/r20-lowlight";
import type { CpuWorkerResult } from "@/src/components/nui-lab/bench/r20-worker-client";

const FPS_WINDOW_MS = 2000;
const FPS_MIN_SPAN_MS = 500;
const MAX_TIMESTAMPS = 120;

export interface Hf3CameraMonitorSnapshot {
  readonly fps: number | null;
  readonly exposureState: ExposureControlState;
  readonly exposureLocked: boolean;
  readonly isBlack: boolean;
  readonly blackMessage: string | null;
}

const DEFAULT_SNAPSHOT: Hf3CameraMonitorSnapshot = {
  fps: null,
  exposureState: "unsupported",
  exposureLocked: false,
  isBlack: false,
  blackMessage: null,
};

/**
 * Coordinates R23B-HF3 low-light camera guards for R83: rolling unique-frame FPS,
 * `CameraExposureController` (`<= 33.3 ms` lock/auto-revert), and 2 s black-frame detection.
 */
export class Hf3CameraMonitor {
  private track: MediaStreamTrack | null = null;
  private exposure: CameraExposureController | null = null;
  private readonly blackDetector = new BlackFrameDetector();
  private readonly timestamps: number[] = [];
  private readonly onChange?: (snapshot: Hf3CameraMonitorSnapshot) => void;
  private readonly allowExposureLock: boolean;
  private lastVideoTime = -1;
  private lastStatus: ExposureControlStatus | null = null;
  private lastSnapshot: Hf3CameraMonitorSnapshot = DEFAULT_SNAPSHOT;

  constructor(onChange?: (snapshot: Hf3CameraMonitorSnapshot) => void, options?: { allowExposureLock?: boolean }) {
    this.onChange = onChange;
    this.allowExposureLock = options?.allowExposureLock ?? true;
  }

  attachTrack(track: MediaStreamTrack | null | undefined): void {
    const next = track ?? null;
    if (next === this.track) return;
    this.exposure?.dispose();
    this.track = next;
    this.blackDetector.reset();
    this.timestamps.length = 0;
    this.lastVideoTime = -1;
    if (!next) {
      this.exposure = null;
      this.lastStatus = null;
      this.updateSnapshot(null, false, null);
      return;
    }
    const caps = probeCameraExposureCapabilities(next);
    if (!this.allowExposureLock) {
      this.exposure = null;
      this.lastStatus = null;
      if (
        caps.currentExposureMode === "manual" &&
        caps.exposureMode?.includes("continuous") &&
        typeof next.applyConstraints === "function"
      ) {
        void next.applyConstraints({ advanced: [{ exposureMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      }
      this.updateSnapshot(null, false, null);
      return;
    }
    this.exposure = new CameraExposureController(next, caps, {
      onStatusChange: (status) => {
        this.lastStatus = status;
        this.updateSnapshot(this.lastSnapshot.fps, this.lastSnapshot.isBlack, this.lastSnapshot.blackMessage);
      },
    });
    this.lastStatus = this.exposure.getStatus();
    this.updateSnapshot(null, false, null);
  }

  onVideoFrame(track: MediaStreamTrack | null | undefined, videoTime: number, nowMs: number): void {
    this.attachTrack(track);
    if (videoTime === this.lastVideoTime) return;
    this.lastVideoTime = videoTime;
    this.timestamps.push(nowMs);
    this.pruneTimestamps(nowMs);
  }

  getUniqueCaptureFps(nowMs: number): number | null {
    this.pruneTimestamps(nowMs);
    if (this.timestamps.length < 2) return null;
    const spanMs = nowMs - this.timestamps[0]!;
    if (spanMs < FPS_MIN_SPAN_MS) return null;
    return Math.round((((this.timestamps.length - 1) * 1000) / spanMs) * 10) / 10;
  }

  onWorkerResult(res: CpuWorkerResult, nowMs: number): Hf3CameraMonitorSnapshot {
    const lumaP50 = typeof res.lumaStats?.p50 === "number" ? res.lumaStats.p50 : null;
    const black = this.blackDetector.update(lumaP50, nowMs);
    const fps = this.getUniqueCaptureFps(nowMs);
    if (this.exposure) {
      void this.exposure.update(fps, nowMs).then((status) => {
        if (!this.exposure) return;
        this.lastStatus = status;
        this.updateSnapshot(this.lastSnapshot.fps, this.lastSnapshot.isBlack, this.lastSnapshot.blackMessage);
      });
      this.lastStatus = this.exposure.getStatus();
    }
    return this.updateSnapshot(fps, black.isBlack, black.message);
  }

  getSnapshot(): Hf3CameraMonitorSnapshot {
    return this.lastSnapshot;
  }

  dispose(): void {
    this.exposure?.dispose();
    this.exposure = null;
    this.track = null;
    this.blackDetector.reset();
    this.timestamps.length = 0;
    this.lastVideoTime = -1;
    this.lastStatus = null;
    this.lastSnapshot = DEFAULT_SNAPSHOT;
  }

  private pruneTimestamps(nowMs: number): void {
    const cutoff = nowMs - FPS_WINDOW_MS;
    while (this.timestamps.length > MAX_TIMESTAMPS || (this.timestamps.length > 0 && this.timestamps[0]! < cutoff)) {
      this.timestamps.shift();
    }
  }

  private updateSnapshot(fps: number | null, isBlack: boolean, blackMessage: string | null): Hf3CameraMonitorSnapshot {
    const st = this.lastStatus;
    const next: Hf3CameraMonitorSnapshot = {
      fps,
      exposureState: st?.state ?? "unsupported",
      exposureLocked: Boolean(st?.locked && !st.reverted),
      isBlack,
      blackMessage,
    };
    const prev = this.lastSnapshot;
    if (
      prev.fps !== next.fps || prev.exposureState !== next.exposureState ||
      prev.exposureLocked !== next.exposureLocked || prev.isBlack !== next.isBlack || prev.blackMessage !== next.blackMessage
    ) {
      this.lastSnapshot = next;
      this.onChange?.(next);
    }
    return this.lastSnapshot;
  }
}
