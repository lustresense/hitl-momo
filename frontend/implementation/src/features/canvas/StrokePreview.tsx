"use client";

import { useMemo } from "react";
import type { DrawingInput } from "@/src/domain/types";
import { fitInkToBox } from "@/src/game/sketch-renderer";

export interface StrokePreviewProps {
  readonly drawingInput: DrawingInput | null | undefined;
  readonly className?: string;
}

const BOX_SIZE = 100;
const BOX_INSET = 8;

/**
 * Renders the student's normalized strokes as crisp vector ink inside thumbnails and stickers.
 * Reuses `fitInkToBox` from `sketch-renderer.ts` without live SVG filters (§5.6).
 */
export function StrokePreview({ drawingInput, className }: StrokePreviewProps) {
  const marks = useMemo(
    () => fitInkToBox(drawingInput?.strokes, { w: BOX_SIZE, h: BOX_SIZE }, { inset: BOX_INSET }),
    [drawingInput],
  );

  return (
    <svg
      className={className}
      viewBox={`0 0 ${BOX_SIZE} ${BOX_SIZE}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {marks.length > 0 ? (
        marks.map((mark, idx) => {
          if (mark.length === 1) {
            const pt = mark[0]!;
            return <circle key={idx} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r="2.2" fill="#1e2126" />;
          }
          const d = mark.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
          return (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke="#1e2126"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })
      ) : (
        <line
          x1="20"
          y1="50"
          x2="80"
          y2="50"
          stroke="#1e2126"
          strokeWidth="2.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
