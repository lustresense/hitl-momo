import { classifyCameraError, messageFor } from "@/src/camera/messages";
import { getSharedStream } from "@/src/camera/shared-stream";
import { startLabCamera } from "@/src/components/nui-lab/lab-camera";
import type { CpuWorkerResult, LabCpuWorkerClient } from "@/src/components/nui-lab/bench/r20-worker-client";
import { env } from "@/src/config/env";
import { WebcamHandDetector } from "@/src/nui/dev/webcam-hand-detector";
import type { HandDetector, HandFrame, HandLandmark } from "@/src/nui/sources/hand-detector";
import { Hf3CameraMonitor, type Hf3CameraMonitorSnapshot } from "./hf3-camera-monitor";
import { claimMonuiWorker } from "./monui-worker-warmup";

const WASM_ROOT = "/mediapipe/wasm";

export type MonuiYoloStatus = "idle" | "ready" | "running" | "detected" | "disabled" | "auto-off" | "fallback";

export interface MonuiTelemetry {
  readonly mode: "worker" | "fallback";
  readonly rescueState: string;
  readonly activePass: string;
  readonly rescueReason: string | null;
  readonly yoloStatus: MonuiYoloStatus;
  readonly preprocessPass: string;
}

export interface MonuiHandDetectorOptions {
  readonly getVideo?: () => HTMLVideoElement | null;
  readonly modelUrl?: string;
  readonly wasmRoot?: string;
  readonly yoloEnabled?: boolean;
  readonly onStatus?: (status: { state: "idle" | "starting" | "ready" | "error"; message: string }) => void;
  readonly onTelemetry?: (telemetry: MonuiTelemetry) => void;
  readonly onHf3State?: (snapshot: Hf3CameraMonitorSnapshot) => void;
  readonly createWorker?: () => Worker;
  readonly createFallback?: () => HandDetector;
}

function isLiveStream(value: unknown): value is MediaStream {
  if (!value || typeof value !== "object") return false;
  const fn = (value as { getVideoTracks?: unknown }).getVideoTracks;
  return typeof fn === "function" && (value as MediaStream).getVideoTracks().some((t) => t.readyState === "live");
}

function baseTelemetry(mode: "worker" | "fallback", yoloStatus: MonuiYoloStatus): MonuiTelemetry {
  return { mode, rescueState: "NORMAL", activePass: "A0_raw", rescueReason: null, yoloStatus, preprocessPass: "A0_raw" };
}

function workerTelemetry(res: CpuWorkerResult, yoloEnabled: boolean, yoloAutoOff: boolean): MonuiTelemetry {
  const preprocessPass = res.lumaStats?.passUsed ?? res.luma?.activePass ?? "A0_raw";
  const rescueState = res.rescueState ?? "NORMAL";
  const rescueReason =
    res.rescueAutoOff?.reason ?? res.failClosedReason ?? (rescueState !== "NORMAL" ? rescueState : null);
  const yoloStatus: MonuiYoloStatus = !yoloEnabled
    ? "disabled"
    : yoloAutoOff || res.rescueAutoOff?.reason === "LATENCY_P50_GT_120MS"
      ? "auto-off"
      : res.yoloRan
        ? typeof res.yoloScore === "number" ? "detected" : "running"
        : "ready";
  return { mode: "worker", rescueState, activePass: preprocessPass, rescueReason, yoloStatus, preprocessPass };
}

/**
 * Adapter `HandDetector` berbasis mechanism `main` (`LabCpuWorkerClient` + `r20-hand.worker.ts`):
 * 1x CPU HandLandmarker di Web Worker, HF3 auto-preprocess cahaya redup, dan MoNUI-7 YOLO Rescue FSM
 * (gagal-tertutup bila model ONNX tidak ada). Jatuh aman ke `WebcamHandDetector` jika Worker gagal init.
 */
export class MonuiHandDetector implements HandDetector {
  private readonly opts: MonuiHandDetectorOptions;
  private readonly modelUrl: string;
  private readonly wasmRoot: string;
  private readonly listeners = new Set<(frame: HandFrame) => void>();

  private running = false;
  private wasStarted = false;
  private inErrorState = false;
  private yoloAutoOff = false;
  private gen = 0;
  private rafId: number | null = null;
  private captureFrameId = 0;
  private lastVideoTime = -1;
  private lastEmittedT = 0;
  private enqueueInFlight = false;
  private video: HTMLVideoElement | null = null;
  private ownStream: MediaStream | null = null;
  private workerClient: LabCpuWorkerClient | null = null;
  private fallback: HandDetector | null = null;
  private unsubFallback: (() => void) | null = null;
  private readonly hf3Monitor: Hf3CameraMonitor;

  constructor(options: MonuiHandDetectorOptions = {}) {
    this.opts = options;
    this.modelUrl = options.modelUrl ?? env.mediapipeModelUrl;
    this.wasmRoot = options.wasmRoot ?? WASM_ROOT;
    this.hf3Monitor = new Hf3CameraMonitor(options.onHf3State, { allowExposureLock: false });
  }

  getHf3State(): Hf3CameraMonitorSnapshot {
    return this.hf3Monitor.getSnapshot();
  }

  subscribe(cb: (frame: HandFrame) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  async start(): Promise<void> {
    if (this.running || typeof window === "undefined" || typeof navigator === "undefined") return;
    this.running = true;
    this.wasStarted = true;
    this.inErrorState = false;
    this.yoloAutoOff = false;
    this.lastVideoTime = -1;
    this.lastEmittedT = 0;
    this.enqueueInFlight = false;
    const token = ++this.gen;
    this.opts.onStatus?.({ state: "starting", message: "Membuka kamera dan worker MoNUI-7..." });

    const canUseWorker =
      Boolean(this.opts.createWorker) || (typeof Worker !== "undefined" && typeof createImageBitmap === "function");
    if (canUseWorker) {
      const outcome = await this.tryStartWorker(token);
      if (outcome !== "fallback" || !this.running || token !== this.gen) return;
    }
    await this.startFallbackDetector(token);
  }

  stop(): void {
    const emitIdle = this.wasStarted && !this.inErrorState;
    this.wasStarted = false;
    this.cleanup();
    if (emitIdle) this.opts.onStatus?.({ state: "idle", message: "Kamera mati (fallback mouse/sentuh aktif)" });
  }

  private cleanup(): void {
    this.running = false;
    this.enqueueInFlight = false;
    this.gen++;
    if (this.rafId !== null && typeof window !== "undefined") { window.cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.hf3Monitor.dispose();
    this.workerClient?.close("detector-stopped");
    this.workerClient = null;
    this.unsubFallback?.();
    this.unsubFallback = null;
    if (this.fallback) { try { this.fallback.stop(); } catch { /* best effort */ } this.fallback = null; }
    if (this.video) { try { this.video.pause(); } catch { /* ignore */ } this.video.srcObject = null; this.video = null; }
    if (this.ownStream) { for (const track of this.ownStream.getTracks()) track.stop(); this.ownStream = null; }
  }

  private async tryStartWorker(token: number): Promise<"started" | "fallback" | "aborted" | "camera-error"> {
    const client = await this.initWorkerClient(token);
    if (!client) return !this.running || token !== this.gen ? "aborted" : "fallback";
    this.workerClient = client;

    try {
      const ok = await this.acquireAndPlayVideo(token);
      if (!ok || !this.running || token !== this.gen) {
        if (this.workerClient === client) { client.close("stale-camera"); this.workerClient = null; }
        return "aborted";
      }
    } catch (err: unknown) {
      if (token === this.gen) this.failWithError(err);
      return "camera-error";
    }

    this.opts.onStatus?.({ state: "ready", message: "Kamera aktif (CPU Worker · MoNUI-7)" });
    this.opts.onTelemetry?.(baseTelemetry("worker", (this.opts.yoloEnabled ?? true) ? "ready" : "disabled"));
    this.rafId = window.requestAnimationFrame(this.loop);
    return "started";
  }

  private async initWorkerClient(token: number): Promise<LabCpuWorkerClient | null> {
    let client: LabCpuWorkerClient | null = null;
    let ready = false;
    try {
      client = await claimMonuiWorker(
        { wasmRoot: this.wasmRoot, modelUrl: this.modelUrl, yoloEnabled: this.opts.yoloEnabled ?? true },
        {
          createWorker: this.opts.createWorker,
          onResult: (res) => this.handleWorkerResult(token, res),
          onReleaseAll: () => { if (ready && this.running && token === this.gen) this.emitFrame(Math.max(this.lastEmittedT, performance.now()), []); },
          onError: (err) => {
            if (ready && this.running && token === this.gen && client && !client.getTelemetry().ready && err.includes("Worker berhenti")) {
              this.failWithError(new Error(err));
            }
          },
        },
      );
      if (!this.running || token !== this.gen) { client.close("stale-init"); return null; }
      ready = true;
      return client;
    } catch {
      client?.close("init-failed");
      return null;
    }
  }

  private async startFallbackDetector(token: number): Promise<void> {
    if (!this.running || token !== this.gen) return;
    let reportedError = false;
    const fb = this.opts.createFallback?.() ?? new WebcamHandDetector({
      getVideo: this.opts.getVideo,
      modelUrl: this.modelUrl,
      onStatus: (status) => {
        if (status.state === "error") { reportedError = true; this.inErrorState = true; }
        this.opts.onStatus?.(status);
      },
    });
    this.fallback = fb;
    this.unsubFallback = fb.subscribe((frame) => { if (this.running && token === this.gen) for (const cb of [...this.listeners]) cb(frame); });
    this.opts.onTelemetry?.(baseTelemetry("fallback", "fallback"));
    try {
      await fb.start();
    } catch (err: unknown) {
      if (token !== this.gen) return;
      if (reportedError) { this.wasStarted = false; this.cleanup(); return; }
      this.failWithError(err);
    }
  }

  private failWithError(err: unknown): void {
    const msg = typeof err === "string" ? err : messageFor(classifyCameraError(err));
    this.inErrorState = true;
    this.wasStarted = false;
    this.cleanup();
    this.opts.onStatus?.({ state: "error", message: msg });
  }

  private handleWorkerResult(token: number, res: CpuWorkerResult): void {
    if (!this.running || token !== this.gen) return;
    if (res.rescueAutoOff?.reason === "LATENCY_P50_GT_120MS") this.yoloAutoOff = true;
    this.opts.onTelemetry?.(workerTelemetry(res, this.opts.yoloEnabled ?? true, this.yoloAutoOff));
    this.hf3Monitor.onWorkerResult(res, performance.now());
    const hands: HandLandmark[][] = res.landmarks.map((hand) => hand.map((p) => ({ x: p.x, y: p.y, z: p.z })));
    this.emitFrame(res.captureTimestampMs ?? res.timestampMs ?? performance.now(), hands);
    if (this.running && token === this.gen && this.video && this.video.currentTime !== this.lastVideoTime) this.trySubmitFrame();
  }

  private emitFrame(t: number, hands: HandLandmark[][]): void {
    if (!this.running) return;
    this.lastEmittedT = Math.max(this.lastEmittedT, t);
    const frame: HandFrame = { t, videoWidth: this.video?.videoWidth || 1280, videoHeight: this.video?.videoHeight || 720, hands };
    for (const cb of [...this.listeners]) cb(frame);
  }

  private readonly loop = (): void => {
    if (!this.running || !this.video || !this.workerClient) return;
    this.rafId = window.requestAnimationFrame(this.loop);
    this.trySubmitFrame();
  };

  private activeTrack(): MediaStreamTrack | null {
    const src = (this.ownStream ?? this.video?.srcObject) as MediaStream | null | undefined;
    return src && typeof src.getVideoTracks === "function" ? src.getVideoTracks()[0] ?? null : null;
  }

  private trySubmitFrame(): void {
    if (!this.running || !this.video || !this.workerClient || this.enqueueInFlight) return;
    if ((typeof document !== "undefined" && document.hidden) || this.video.readyState < 2) return;
    const videoTime = this.video.currentTime;
    if (videoTime === this.lastVideoTime) return;
    const token = this.gen;
    this.enqueueInFlight = true;
    const now = performance.now();
    this.captureFrameId += 1;
    void this.workerClient.submitFrame(this.video, now, { captureFrameId: this.captureFrameId, captureTimestampMs: now }).then(
      (submitted) => { if (token === this.gen) { this.enqueueInFlight = false; if (submitted && this.running) { this.lastVideoTime = videoTime; this.hf3Monitor.onVideoFrame(this.activeTrack(), videoTime, now); } } },
      () => { if (token === this.gen) this.enqueueInFlight = false; },
    );
  }

  private async acquireAndPlayVideo(token: number): Promise<boolean> {
    const host = this.opts.getVideo?.() ?? null;
    const shared = getSharedStream();
    let stream: MediaStream | null = isLiveStream(shared) ? shared : host && isLiveStream(host.srcObject) ? host.srcObject : null;
    if (!stream && !(host && host.readyState >= 2 && host.videoWidth > 0)) {
      const acquired = await startLabCamera(typeof navigator !== "undefined" ? navigator.mediaDevices : undefined);
      if (acquired.kind === "error") { if (this.running && token === this.gen) this.failWithError(acquired.message); return false; }
      if (!this.running || token !== this.gen) { for (const t of acquired.stream.getTracks()) t.stop(); return false; }
      this.ownStream = acquired.stream; stream = acquired.stream;
    }
    if (!this.running || token !== this.gen) return false;
    const video = stream ? host ?? document.createElement("video") : host;
    if (!video) return false;
    if (stream) { video.muted = true; video.playsInline = true; if (video.srcObject !== stream) video.srcObject = stream; }
    this.video = video;
    await video.play();
    if (!this.running || token !== this.gen) return false;
    this.hf3Monitor.attachTrack(this.activeTrack());
    return true;
  }
}
