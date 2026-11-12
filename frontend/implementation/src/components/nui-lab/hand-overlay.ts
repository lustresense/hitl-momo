/**
 * Draws the 21 landmarks of every hand over the mirrored preview. Pure over a 2D-context subset, so the
 * test can check colours and positions without a real canvas.
 */
import { MIN_HAND_SIZE, handSize } from "@/src/camera/primary-hand";
import type { Landmark } from "@/src/input/types";

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
  | "fillText"
  | "measureText"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "font"
  | "textBaseline"
>;

/**
 * `hands` are in camera space (0..1); the preview is mirrored, so x is flipped here. `primaryIndex` is
 * drawn in orange, the rest in grey. A hand smaller than MIN_HAND_SIZE is labelled as far away.
 */
export function drawHands(
  ctx: OverlayContext,
  hands: Landmark[][],
  primaryIndex: number | null,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
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

    if (handSize(hand) < MIN_HAND_SIZE) drawFarLabel(ctx, "diabaikan (jauh)", pts[0]!);
  });
}

function drawFarLabel(ctx: OverlayContext, text: string, at: { x: number; y: number }): void {
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textBaseline = "top";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = OVERLAY_COLORS.labelBackground;
  ctx.fillRect(at.x + 8, at.y + 8, w, 22);
  ctx.fillStyle = OVERLAY_COLORS.labelText;
  ctx.fillText(text, at.x + 13, at.y + 12);
}
