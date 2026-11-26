"use client";

import { useEffect, useState } from "react";
import { FAR_CLOUDS, NEAR_CLOUDS, scaleCloudWidth } from "@/src/features/world/sky-transition";

/**
 * Clouds for the camera rise only. The drawing page itself is clean paper "in the sky": the student passes
 * through this band of clouds on the way up and then sees none. Decorative (aria-hidden).
 */
const CLOUD = "M24 92 C4 92 2 62 26 60 C26 34 62 26 80 46 C92 20 134 20 144 46 C168 36 196 54 190 74 C214 74 216 94 192 94 Z";
const BASE_VIEWPORT_W = 1440;

function Cloud({ x, y, w, flip }: { x: number; y: number; w: number; flip?: boolean }) {
  return (
    <svg className="sky-cloud" style={{ left: `${x}%`, top: `${y}%`, width: w, transform: flip ? "scaleX(-1)" : undefined }} viewBox="0 0 220 110" aria-hidden="true" focusable="false">
      <path d={CLOUD} fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M52 78 q14 -9 28 0 M110 66 q12 -8 24 0 M150 82 q10 -6 20 0" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

/** Far clouds hang in the band; near clouds are a separate layer so the camera move can rush them past. */
export function CloudBand({ layer }: { layer: "far" | "near" }) {
  const [viewportW, setViewportW] = useState(BASE_VIEWPORT_W);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setViewportW(window.innerWidth || BASE_VIEWPORT_W);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const clouds = layer === "far" ? FAR_CLOUDS : NEAR_CLOUDS;
  return (
    <div className={`cloud-band cloud-band--${layer}`} aria-hidden="true">
      {clouds.map((bp, idx) => (
        <Cloud
          key={`${layer}-${idx}`}
          x={bp.xPct}
          y={bp.yPct}
          w={scaleCloudWidth(bp.baseWidthPx, viewportW)}
          flip={bp.flip}
        />
      ))}
    </div>
  );
}
