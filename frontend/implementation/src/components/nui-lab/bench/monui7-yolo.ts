/**
 * MoNUI-7 YOLO Module for Web Worker (`bench/monui7-yolo.ts`).
 *
 * Implements T21:
 * - Letterboxing to 320x320 with padding 114.
 * - RGB scaling [0, 1] with NCHW layout.
 * - Parses YOLO outputs (both end-to-end [1, N, 6] and standard [1, 5, N] / [1, N, 5]).
 * - Maps bounding boxes back to normalized [0, 1] frame coordinates.
 * - Filters detections with confidence >= 0.35.
 * - SHA-256 verification on load (fail-closed).
 */

export const YOLO_INPUT_SIZE = 320;
export const YOLO_LETTERBOX_PAD = 114;
export const YOLO_DEFAULT_CONFIDENCE = 0.35;
export const YOLO_MODEL_URL = "/models/monui7-hand-yolo26n-320.onnx";
export const YOLO_MODEL_SHA256 = "97f778ea77f4dbf160e91dff021a463ab464cdbf27a34d067d5f28708dbf1ddb";

export interface LetterboxMeta {
  srcW: number;
  srcH: number;
  newW: number;
  newH: number;
  padLeft: number;
  padTop: number;
  scale: number;
}

export interface YoloDetection {
  /** Normalized [x1, y1, x2, y2] in full frame coordinates (0..1). */
  box: [number, number, number, number];
  score: number;
  classId: number;
  label?: string;
}

/**
 * Resizes and letterboxes an RGBA image buffer to 320x320 NCHW Float32Array.
 * Padding value is 114 / 255.
 */
export function letterboxRgbaToNchw(
  srcRgba: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  targetSize = YOLO_INPUT_SIZE,
  padVal = YOLO_LETTERBOX_PAD,
): { tensor: Float32Array; meta: LetterboxMeta } {
  const scale = Math.min(targetSize / srcW, targetSize / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padLeft = Math.floor((targetSize - newW) / 2);
  const padTop = Math.floor((targetSize - newH) / 2);

  const meta: LetterboxMeta = {
    srcW,
    srcH,
    newW,
    newH,
    padLeft,
    padTop,
    scale,
  };

  const channelSize = targetSize * targetSize;
  const tensor = new Float32Array(3 * channelSize);
  const normPad = padVal / 255;

  // Initialize tensor with padding value
  tensor.fill(normPad);

  const rOffset = 0;
  const gOffset = channelSize;
  const bOffset = channelSize * 2;

  // Nearest-neighbor / bilinear sampling into the centered ROI
  for (let dy = 0; dy < newH; dy++) {
    const sy = Math.min(srcH - 1, Math.floor(dy / scale));
    const targetY = padTop + dy;
    const targetRowOffset = targetY * targetSize;

    for (let dx = 0; dx < newW; dx++) {
      const sx = Math.min(srcW - 1, Math.floor(dx / scale));
      const targetX = padLeft + dx;
      const targetIdx = targetRowOffset + targetX;

      const srcIdx = (sy * srcW + sx) * 4;
      const r = srcRgba[srcIdx] ?? 0;
      const g = srcRgba[srcIdx + 1] ?? 0;
      const b = srcRgba[srcIdx + 2] ?? 0;
      tensor[rOffset + targetIdx] = r / 255;
      tensor[gOffset + targetIdx] = g / 255;
      tensor[bOffset + targetIdx] = b / 255;
    }
  }

  return { tensor, meta };
}

/**
 * Unletterboxes a box in 320x320 letterbox coordinates [bx1, by1, bx2, by2]
 * back to normalized frame coordinates [x1, y1, x2, y2] in [0, 1].
 */
export function unletterboxBox(
  box320: [number, number, number, number],
  meta: LetterboxMeta,
): [number, number, number, number] {
  const [bx1, by1, bx2, by2] = box320;
  const x1 = Math.max(0, Math.min(1, (bx1 - meta.padLeft) / meta.newW));
  const y1 = Math.max(0, Math.min(1, (by1 - meta.padTop) / meta.newH));
  const x2 = Math.max(0, Math.min(1, (bx2 - meta.padLeft) / meta.newW));
  const y2 = Math.max(0, Math.min(1, (by2 - meta.padTop) / meta.newH));
  return [x1, y1, x2, y2];
}

/**
 * Computes Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2].
 */
export function computeIoU(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number],
): number {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = Math.max(0, boxA[2] - boxA[0]) * Math.max(0, boxA[3] - boxA[1]);
  const boxBArea = Math.max(0, boxB[2] - boxB[0]) * Math.max(0, boxB[3] - boxB[1]);
  const unionArea = boxAArea + boxBArea - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Applies Non-Maximum Suppression (NMS) to detections with a given IoU threshold.
 */
export function applyNms(
  detections: YoloDetection[],
  iouThresh = 0.5,
): YoloDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const result: YoloDetection[] = [];

  for (const candidate of sorted) {
    let suppressed = false;
    for (const selected of result) {
      if (candidate.classId === selected.classId) {
        if (computeIoU(candidate.box, selected.box) >= iouThresh) {
          suppressed = true;
          break;
        }
      }
    }
    if (!suppressed) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Parses ONNX output tensor into detections, supporting:
 * - End-to-end NMS output: shape [1, N, 6] (x1, y1, x2, y2, score, classId)
 * - Raw YOLO head output: shape [1, 4 + C, N] or [1, N, 4 + C] (cx, cy, w, h, class_scores...) with IoU 0.5 NMS
 */
export function parseYoloOutput(
  data: Float32Array | number[],
  dims: readonly number[],
  meta: LetterboxMeta,
  minScore = YOLO_DEFAULT_CONFIDENCE,
  nmsIouThresh = 0.5,
): YoloDetection[] {
  const detections: YoloDetection[] = [];
  const getVal = (idx: number): number => data[idx] ?? 0;

  // Flattened length check
  if (!dims || dims.length < 2) return detections;

  const dim0 = dims[0] ?? 0;
  const dim1 = dims[1] ?? 0;
  const dim2 = dims[2] ?? 0;

  // Case 1: [1, N, 6] or [N, 6] - End-to-end YOLO26 format
  if ((dims.length === 3 && dim2 === 6) || (dims.length === 2 && dim1 === 6)) {
    const numDets = dims.length === 3 ? dim1 : dim0;
    for (let i = 0; i < numDets; i++) {
      const offset = i * 6;
      const score = getVal(offset + 4);
      if (score >= minScore) {
        const bx1 = getVal(offset);
        const by1 = getVal(offset + 1);
        const bx2 = getVal(offset + 2);
        const by2 = getVal(offset + 3);
        const classId = Math.round(getVal(offset + 5));
        const frameBox = unletterboxBox([bx1, by1, bx2, by2], meta);
        detections.push({ box: frameBox, score, classId });
      }
    }
    detections.sort((a, b) => b.score - a.score);
    return detections;
  }

  // Case 2: [1, 4 + C, N] - Standard Ultralytics YOLO head (e.g. [1, 5, 2100])
  if (dims.length === 3 && dim1 >= 5) {
    const channels = dim1;
    const numAnchors = dim2;
    const numClasses = channels - 4;

    for (let a = 0; a < numAnchors; a++) {
      let maxClassScore = 0;
      let bestClass = 0;
      for (let c = 0; c < numClasses; c++) {
        const s = getVal((4 + c) * numAnchors + a);
        if (s > maxClassScore) {
          maxClassScore = s;
          bestClass = c;
        }
      }

      if (maxClassScore >= minScore) {
        const cx = getVal(0 * numAnchors + a);
        const cy = getVal(1 * numAnchors + a);
        const w = getVal(2 * numAnchors + a);
        const h = getVal(3 * numAnchors + a);

        const bx1 = cx - w / 2;
        const by1 = cy - h / 2;
        const bx2 = cx + w / 2;
        const by2 = cy + h / 2;

        const frameBox = unletterboxBox([bx1, by1, bx2, by2], meta);
        detections.push({ box: frameBox, score: maxClassScore, classId: bestClass });
      }
    }
    return applyNms(detections, nmsIouThresh);
  }

  // Case 3: [1, N, 4 + C]
  if (dims.length === 3 && dim2 >= 5) {
    const numDets = dim1;
    const stride = dim2;
    const numClasses = stride - 4;

    for (let i = 0; i < numDets; i++) {
      const offset = i * stride;
      let maxClassScore = 0;
      let bestClass = 0;
      for (let c = 0; c < numClasses; c++) {
        const s = getVal(offset + 4 + c);
        if (s > maxClassScore) {
          maxClassScore = s;
          bestClass = c;
        }
      }

      if (maxClassScore >= minScore) {
        const cx = getVal(offset);
        const cy = getVal(offset + 1);
        const w = getVal(offset + 2);
        const h = getVal(offset + 3);

        const bx1 = cx - w / 2;
        const by1 = cy - h / 2;
        const bx2 = cx + w / 2;
        const by2 = cy + h / 2;

        const frameBox = unletterboxBox([bx1, by1, bx2, by2], meta);
        detections.push({ box: frameBox, score: maxClassScore, classId: bestClass });
      }
    }
    return applyNms(detections, nmsIouThresh);
  }

  return detections;
}

/**
 * Computes SHA-256 of buffer and compares against expected hex string.
 * Supports Web Crypto and Node crypto environments.
 */
export async function verifySha256(
  buffer: ArrayBuffer | Uint8Array,
  expectedHex: string,
): Promise<boolean> {
  let hex = "";
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    const rawBuffer = buffer instanceof Uint8Array ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
    const digest = await crypto.subtle.digest("SHA-256", rawBuffer as BufferSource);
    const bytes = new Uint8Array(digest);
    hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } else {
    try {
      const g = globalThis as { process?: { versions?: { node?: string } } };
      if (!g.process?.versions?.node) return false;
      const fn = new Function("m", "return require(m)");
      const nodeCrypto = fn("node:crypto");
      const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      hex = nodeCrypto.createHash("sha256").update(uint8).digest("hex");
    } catch {
      return false;
    }
  }
  return hex.toLowerCase() === expectedHex.trim().toLowerCase();
}
