/**
 * Finds the player's face so the wave rule only counts a hand near it (see primary-hand.ts).
 *
 * - Runs at FACE_DETECTIONS_PER_SECOND at most. A face does not move fast, and the hand model already uses the budget.
 * - Asks the SHARED gate on the FACE_LANE: one busy budget with the hand (inference-scheduler.ts). The face yields to
 *   the hand, and a frame the hand already read is not read again for the face.
 * - Never throws. No model, a failed load, or repeated errors mean "no face": callers then use the plain hand rule.
 */
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { frameForDetection, type DetectionFrame } from "./frame-source";
import { FACE_LANE, sharedDetectionGate, type DetectionGate } from "./inference-scheduler";
import { FACE_DETECTIONS_PER_SECOND, FACE_LOST_MS, FACE_MIN_CONFIDENCE, FACE_MODEL_PATH } from "./hand-config";

/** Face box in normalised frame units (0..1, top-left origin), the same space as the hand landmarks. */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the wave tracker needs from a face source. A test can pass a stub. */
export interface FaceSource {
  /** Looks at the frame if the rate allows. Never throws. */
  update(video: HTMLVideoElement, nowMs: number): void;
  /** The player's face, or null when none was seen within FACE_LOST_MS. */
  current(nowMs: number): FaceBox | null;
}

/** Whether the face model is in: still loading, ready, or given up (failed to load or failing on every try). */
export type FaceModelStatus = "loading" | "ready" | "unavailable";

/** The part of MediaPipe's FaceDetector that this module uses. */
export interface FaceDetectorLike {
  detectForVideo(frame: DetectionFrame, timestampMs: number): { detections: Array<{ boundingBox?: BoxPixels }> };
  close(): void;
}

interface BoxPixels {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const FACE_INTERVAL_MS = 1000 / FACE_DETECTIONS_PER_SECOND;
/** Failures in a row before the face source gives up for this page session. */
const MAX_FACE_FAILURES = 3;
const WASM_ROOT = "/mediapipe/wasm";

/** Every usable face box of one detection, normalised, in the order the detector gave them. */
export function faceBoxesFromDetections(
  detections: Array<{ boundingBox?: BoxPixels }>,
  videoWidth: number,
  videoHeight: number,
): FaceBox[] {
  const boxes: FaceBox[] = [];
  for (const d of detections) {
    const b = d.boundingBox;
    if (!b) continue;
    const box: FaceBox = {
      x: b.originX / videoWidth,
      y: b.originY / videoHeight,
      w: b.width / videoWidth,
      h: b.height / videoHeight,
    };
    if (box.w > 0 && box.h > 0) boxes.push(box);
  }
  return boxes;
}

/**
 * Index of the player's face among the boxes: the largest, and between similar faces the one nearer the middle of
 * the frame (the student sits in front of the camera). -1 when there is no box.
 */
function playerIndex(boxes: FaceBox[]): number {
  let best = -1;
  let bestScore = -Infinity;
  boxes.forEach((box, i) => {
    const centreX = box.x + box.w / 2;
    // Area first; the centre factor only breaks near-ties, it never makes a far-off large face lose to a tiny one.
    const score = box.w * box.h * (1 - Math.abs(centreX - 0.5));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * Picks the player's face from the detections (see playerIndex). Null when no detection has a usable box.
 */
export function faceBoxFromDetections(
  detections: Array<{ boundingBox?: BoxPixels }>,
  videoWidth: number,
  videoHeight: number,
): FaceBox | null {
  const boxes = faceBoxesFromDetections(detections, videoWidth, videoHeight);
  const i = playerIndex(boxes);
  return i < 0 ? null : boxes[i]!;
}

let loaded: Promise<FaceDetectorLike> | null = null;

/**
 * Loads the face model once per page. Shared by the warm-up and every FaceAnchor. A failed load is not retried in
 * this page session: the camera then runs on the plain hand rule.
 */
export function loadFaceDetector(wasmRoot = WASM_ROOT, modelUrl = FACE_MODEL_PATH): Promise<FaceDetectorLike> {
  if (!loaded) {
    loaded = (async () => {
      const vision = await FilesetResolver.forVisionTasks(wasmRoot);
      // CPU: the model is tiny, and a GPU delegate would copy every frame (see hand-landmarker.ts).
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: FACE_MIN_CONFIDENCE,
      });
      return detector as unknown as FaceDetectorLike;
    })();
  }
  return loaded;
}

export interface FaceAnchorOptions {
  /** Test seam: the detector loader. Default: loadFaceDetector(). */
  load?: () => Promise<FaceDetectorLike>;
  /** Clock in ms. Default: performance.now(). */
  now?: () => number;
  /**
   * Test seam: the gate the face asks. Default: the shared app-wide gate, so the face counts in the same budget
   * as the hand. A test passes its own gate on its own clock.
   */
  gate?: DetectionGate;
}

export class FaceAnchor implements FaceSource {
  private readonly load: () => Promise<FaceDetectorLike>;
  private readonly now: () => number;
  private readonly gate: DetectionGate;
  private detector: FaceDetectorLike | null = null;
  private loading = false;
  private unavailable = false;
  private failures = 0;
  private lastAttemptMs = Number.NEGATIVE_INFINITY;
  private face: FaceBox | null = null;
  private seenMs = Number.NEGATIVE_INFINITY;
  /** Every face box of the last detection, and which of them is the player's (-1 for none). */
  private boxes: FaceBox[] = [];
  private boxesPlayer = -1;
  private boxesMs = Number.NEGATIVE_INFINITY;

  constructor(options: FaceAnchorOptions = {}) {
    this.load = options.load ?? (() => loadFaceDetector());
    this.now = options.now ?? (() => performance.now());
    this.gate = options.gate ?? sharedDetectionGate;
  }

  update(video: HTMLVideoElement, nowMs: number): void {
    if (this.unavailable) return;
    if (nowMs - this.lastAttemptMs < FACE_INTERVAL_MS) return;
    if (!this.detector) {
      this.startLoad();
      return;
    }
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    this.lastAttemptMs = nowMs;
    const detector = this.detector;
    let result: ReturnType<FaceDetectorLike["detectForVideo"]> | null;
    try {
      result = this.gate.poll(this, video, (ts) => detector.detectForVideo(frameForDetection(video), ts), FACE_LANE);
      this.failures = 0;
    } catch {
      this.failures++;
      if (this.failures >= MAX_FACE_FAILURES) this.unavailable = true;
      return;
    }
    if (!result) return;
    this.boxes = faceBoxesFromDetections(result.detections, video.videoWidth, video.videoHeight);
    this.boxesPlayer = playerIndex(this.boxes);
    this.boxesMs = nowMs;
    if (this.boxesPlayer >= 0) {
      this.face = this.boxes[this.boxesPlayer]!;
      this.seenMs = nowMs;
    }
  }

  current(nowMs: number): FaceBox | null {
    return this.face && nowMs - this.seenMs <= FACE_LOST_MS ? this.face : null;
  }

  /**
   * The other faces in the last detection (not the player's), for the lab's grey boxes. Empty when that detection
   * is older than FACE_LOST_MS, so a face that left the frame does not stay on screen.
   */
  others(nowMs: number): FaceBox[] {
    if (nowMs - this.boxesMs > FACE_LOST_MS) return [];
    return this.boxes.filter((_, i) => i !== this.boxesPlayer);
  }

  /** Whether the face model is still loading, in use, or given up for this page session. */
  status(): FaceModelStatus {
    if (this.unavailable) return "unavailable";
    return this.detector ? "ready" : "loading";
  }

  private startLoad(): void {
    if (this.loading) return;
    this.loading = true;
    this.load().then(
      (d) => {
        this.detector = d;
      },
      () => {
        this.unavailable = true;
      },
    );
  }
}

/** TEST ONLY: forget the loaded face model. */
export function resetFaceDetectorForTest(): void {
  loaded = null;
}
