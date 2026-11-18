/**
 * Draws the 21 landmarks of every hand over the mirrored preview. Pure over a 2D-context subset, so the
 * test can check colours and positions without a real canvas.
 */
import type { FaceBox } from "@/src/camera/face-anchor";
import type { Landmark } from "@/src/input/types";
import { HAND_ROLE_LABEL, classifyHandRoles, playerRegion, type HandRole } from "./lab-roles";

/** MediaPipe hand skeleton: 21 points, wrist = 0. */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const OVERLAY_COLORS = {
  /** The hand the game follows. Orange stands out on a webcam image. */
  primary: "#ea580c",
  /** Every other hand. */
  other: "#94a3b8",
  labelText: "#ffffff",
  labelBackground: "#0f172a",
} as const;

/** The subset of CanvasRenderingContext2D this module uses. */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "fill"
  | "arc"
  | "fillRect"
  | "strokeRect"
  | "fillText"
  | "measureText"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "font"
  | "textBaseline"
>;

/** Outline of the player's face and the area its hand may be in. Blue, so it differs from the hand colours. */
export const FACE_COLORS = {
  face: "#2563eb",
  region: "#7c3aed",
} as const;

/**
 * `hands` are in camera space (0..1); the preview is mirrored, so x is flipped here. `primaryIndex` is
 * drawn in orange, the rest in grey. With a `face`, each rejected hand is labelled with its reason
 * (far, face misread, outside the player area); without one only a far hand is labelled.
 */
export function drawHands(
  ctx: OverlayContext,
  hands: Landmark[][],
  primaryIndex: number | null,
  width: number,
  height: number,
  face: FaceBox | null = null,
): void {
  ctx.clearRect(0, 0, width, height);
  const roles = classifyHandRoles(hands, primaryIndex, face);
  hands.forEach((hand, i) => {
    if (hand.length < 21) return;
    const isPrimary = i === primaryIndex;
    const color = isPrimary ? OVERLAY_COLORS.primary : OVERLAY_COLORS.other;
    const pts = hand.map((p) => ({ x: (1 - p.x) * width, y: p.y * height }));

    ctx.strokeStyle = color;
    ctx.lineWidth = isPrimary ? 3 : 2;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a]!.x, pts[a]!.y);
      ctx.lineTo(pts[b]!.x, pts[b]!.y);
    }
    ctx.stroke();

    ctx.fillStyle = color;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, isPrimary ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const role: HandRole = roles[i]!;
    if (role !== "primary" && role !== "other") drawLabel(ctx, HAND_ROLE_LABEL[role], pts[0]!);
  });
}

/**
 * Outlines the player's face and the region its hand may be in (blue and purple), and every other face in grey, over
 * the preview. Does not clear: call it after drawHands. Boxes are mirrored like the hands so they line up.
 */
export function drawFaceArea(
  ctx: OverlayContext,
  face: FaceBox | null,
  width: number,
  height: number,
  others: FaceBox[] = [],
): void {
  const mirror = (x0: number, x1: number) => ({ left: (1 - x1) * width, w: (x1 - x0) * width });
  if (face) {
    const f = mirror(face.x, face.x + face.w);
    const r = playerRegion(face);
    const reg = mirror(r.x0, r.x1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = FACE_COLORS.face;
    ctx.strokeRect(f.left, face.y * height, f.w, face.h * height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = FACE_COLORS.region;
    ctx.strokeRect(reg.left, r.y0 * height, reg.w, (r.y1 - r.y0) * height);
  }
  // Other people in view: grey, so the owner sees the detector found them and that the game does not follow them.
  ctx.lineWidth = 1;
  ctx.strokeStyle = OVERLAY_COLORS.other;
  for (const o of others) {
    const m = mirror(o.x, o.x + o.w);
    ctx.strokeRect(m.left, o.y * height, m.w, o.h * height);
  }
}

function drawLabel(ctx: OverlayContext, text: string, at: { x: number; y: number }): void {
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textBaseline = "top";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = OVERLAY_COLORS.labelBackground;
  ctx.fillRect(at.x + 8, at.y + 8, w, 22);
  ctx.fillStyle = OVERLAY_COLORS.labelText;
  ctx.fillText(text, at.x + 13, at.y + 12);
}
