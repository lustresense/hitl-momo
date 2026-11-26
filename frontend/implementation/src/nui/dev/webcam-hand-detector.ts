import { env } from "@/src/config/env";
import { frameForDetection } from "@/src/camera/frame-source";
import type { CreatedHandLandmarker } from "@/src/camera/hand-landmarker";
import { returnHandLandmarker, takeHandLandmarker } from "@/src/camera/landmarker-warmup";
import { classifyCameraError, messageFor } from "@/src/camera/messages";
import { getSharedStream } from "@/src/camera/shared-stream";
import type { HandDetector, HandFrame, HandLandmark } from "../sources/hand-detector";

const WASM_ROOT = "/mediapipe/wasm";

export interface WebcamHandDetectorOptions {
  /** Elemen video preview milik harness (opsional); stream akan dipasang ke sini. */
  getVideo?: () => HTMLVideoElement | null;
  modelUrl?: string;
  onStatus?: (status: { state: "idle" | "starting" | "ready" | "error"; message: string }) => void;
}

/**
 * Adapter tipis `HandDetector` di atas `takeHandLandmarker`/`returnHandLandmarker` dan
 * `frameForDetection` milik repo eksisting (1 model tunggal, gagal-tertutup bila izin ditolak).
 */
export class WebcamHandDetector implements HandDetector {
  private readonly getVideo?: () => HTMLVideoElement | null;
  private readonly modelUrl: string;
  private readonly onStatus?: WebcamHandDetectorOptions["onStatus"];
  private readonly listeners = new Set<(frame: HandFrame) => void>();

  private running = false;
  private gen = 0;
  private rafId: number | null = null;
  private ownStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private leased: CreatedHandLandmarker | null = null;
  private lastVideoTime = -1;
  private healthy = true;

  constructor(options: WebcamHandDetectorOptions = {}) {
    this.getVideo = options.getVideo;
    this.modelUrl = options.modelUrl ?? env.mediapipeModelUrl;
    this.onStatus = options.onStatus;
  }

  subscribe(cb: (frame: HandFrame) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    this.running = true;
    const token = ++this.gen;
    this.healthy = true;
    this.lastVideoTime = -1;
    this.onStatus?.({ state: "starting", message: "Membuka kamera dan memuat detektor tangan..." });

    try {
      const stream = await this.acquireStream();
      if (!this.running || token !== this.gen) {
        this.releaseOwnStream();
        return;
      }
      const video = this.attachVideo(stream);
      await video.play();
      if (!this.running || token !== this.gen) {
        this.stop();
        return;
      }

      const leased = await takeHandLandmarker({ wasmRoot: WASM_ROOT, modelUrl: this.modelUrl });
      if (!this.running || token !== this.gen) {
        returnHandLandmarker(leased, { wasmRoot: WASM_ROOT, modelUrl: this.modelUrl }, true);
        return;
      }
      this.leased = leased;
      this.onStatus?.({ state: "ready", message: `Kamera aktif (${leased.delegate})` });
      this.rafId = window.requestAnimationFrame(this.loop);
    } catch (err: unknown) {
      const msg = messageFor(classifyCameraError(err));
      this.stopInternal(false);
      this.onStatus?.({ state: "error", message: msg });
      throw new Error(msg);
    }
  }

  stop(): void {
    this.stopInternal(true);
    this.onStatus?.({ state: "idle", message: "Kamera mati (fallback mouse/sentuh aktif)" });
  }

  private stopInternal(isHealthy: boolean): void {
    this.running = false;
    this.gen++;
    if (this.rafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.leased) {
      returnHandLandmarker(this.leased, { wasmRoot: WASM_ROOT, modelUrl: this.modelUrl }, isHealthy && this.healthy);
      this.leased = null;
    }
    if (this.video) {
      try {
        this.video.pause();
      } catch {
        /* ignore */
      }
      this.video.srcObject = null;
      this.video = null;
    }
    this.releaseOwnStream();
  }

  private async acquireStream(): Promise<MediaStream> {
    const shared = getSharedStream();
    if (shared && shared.getVideoTracks().some((t) => t.readyState === "live")) return shared;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Kamera tidak didukung di browser ini.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    this.ownStream = stream;
    return stream;
  }

  private attachVideo(stream: MediaStream): HTMLVideoElement {
    const host = this.getVideo?.();
    const v = host ?? document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    this.video = v;
    return v;
  }

  private releaseOwnStream(): void {
    if (!this.ownStream) return;
    this.ownStream.getTracks().forEach((track) => track.stop());
    this.ownStream = null;
  }

  private readonly loop = (): void => {
    if (!this.running || !this.video || !this.leased) return;
    this.rafId = window.requestAnimationFrame(this.loop);
    if (document.hidden || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const now = performance.now();
    try {
      const result = this.leased.landmarker.detectForVideo(frameForDetection(this.video), now);
      const hands: HandLandmark[][] = (result.landmarks ?? []).map((hand) =>
        hand.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      );
      const frame: HandFrame = {
        t: now,
        videoWidth: this.video.videoWidth || 1280,
        videoHeight: this.video.videoHeight || 720,
        hands,
      };
      for (const cb of [...this.listeners]) cb(frame);
    } catch (err: unknown) {
      this.healthy = false;
      const msg = messageFor(classifyCameraError(err));
      this.stopInternal(false);
      this.onStatus?.({ state: "error", message: msg });
    }
  };
}
