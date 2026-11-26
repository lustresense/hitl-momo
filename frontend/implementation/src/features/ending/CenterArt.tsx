"use client";

import { useId } from "react";
import { ENDING_COPY } from "@/src/domain/copy/ending";

export interface CenterArtProps {
  readonly className?: string;
}

function fitTextLength(text: string, fontSize: number): number | undefined {
  return text.length * fontSize * 0.56 > 54 ? 54 : undefined;
}

/**
 * Ilustrasi SVG Pusat Halaman r8.3 (port 1:1 `proto-html/r83/shared/end/center-art.js`).
 * `<defs>` memakai prefix `useId()` agar aman di React StrictMode dan ekspor statis.
 */
export function CenterArt({ className }: CenterArtProps) {
  const uid = useId().replace(/:/g, "");
  const roughId = `${uid}-rough`;
  const dirtId = `${uid}-dirt`;
  const cloudId = `${uid}-cloud`;
  const cityId = `${uid}-city`;

  const small = ENDING_COPY.centerArt.signpostSmall;
  const big = ENDING_COPY.centerArt.signpostBig;

  return (
    <svg
      className={className ? `art-svg ${className}` : "art-svg"}
      viewBox="0 0 490 325"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={ENDING_COPY.centerArt.ariaLabel}
      data-testid="r83-ending-center-art"
    >
      <defs>
        <filter id={roughId}>
          <feTurbulence type="fractalNoise" baseFrequency=".075" numOctaves="1" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="0.7" />
        </filter>
        <pattern id={dirtId} width="46" height="46" patternUnits="userSpaceOnUse">
          <rect width="46" height="46" fill="#a9733f" />
          <path
            d="M0 12q11-7 23 0t23 0M0 34q11-7 23 0t23 0"
            stroke="#7e5128"
            strokeWidth="1.3"
            fill="none"
            opacity=".55"
          />
          <path d="M8 22l5 3M30 4l4 3M36 40l5-2" stroke="#c28f58" strokeWidth="2" opacity=".6" />
          <path
            d="M6 9l8 -3M22 20l11 -5M3 37l7 -3M37 24l7 -3"
            stroke="#543e2b"
            strokeWidth=".9"
            strokeLinecap="round"
            opacity=".22"
          />
          <circle cx="26" cy="10" r="1" fill="#f1ddba" opacity=".45" />
          <circle cx="13" cy="30" r="1.2" fill="#563d29" opacity=".24" />
        </pattern>
        <g id={cloudId} fill="#fcf9ef" stroke="#aaa99f" strokeWidth="1.8" strokeLinecap="round">
          <path d="M0 40q-8-24 22-26q8-22 38-12q24-8 34 14q22 4 14 24z" />
          <path d="M12 30q18-6 30 0M50 26q16-6 30 2" fill="none" opacity=".7" />
          <path
            d="M14 38l8 -4M30 40l8 -5M60 36l8 -5M84 37l7 -4"
            fill="none"
            stroke="#a8a59e"
            strokeWidth=".9"
            opacity=".52"
            strokeLinecap="round"
          />
        </g>
        <g id={cityId} fill="#d6d3c8" opacity=".42">
          <path d="M0 325V230h26v-40h30v60h22v-90h34v110h26v-60h30v100h30v-70h40v90z" />
        </g>
      </defs>

      <use href={`#${cityId}`} transform="translate(-10 20)" />
      <g className="cm" data-d="8">
        <use href={`#${cloudId}`} transform="translate(20 40)" opacity=".8" />
      </g>
      <g className="cm" data-d="-10">
        <use href={`#${cloudId}`} transform="translate(330 70) scale(.8)" opacity=".7" />
      </g>
      <g className="cm" data-d="6">
        <use href={`#${cloudId}`} transform="translate(190 120) scale(.6)" opacity=".6" />
      </g>

      <g filter={`url(#${roughId})`} stroke="#1e2126" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M-10 262Q120 236 245 250T500 246V330H-10z" fill={`url(#${dirtId})`} />
        <path d="M-10 262Q120 236 245 250T500 246V256Q380 262 245 260T-10 272z" fill="#7ea142" />
      </g>

      <g transform="translate(96 252)">
        <path d="M0 0V-54" stroke="#1e2126" strokeWidth="3.5" strokeLinecap="round" />
        <g transform="translate(0 0)">
          <path
            d="M-58 -50h58l14 13l-14 13h-58z"
            fill="#df6930"
            stroke="#1e2126"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <text textAnchor="middle" fontWeight="700" fill="#1e2126">
            <tspan
              x="-29"
              y="-40"
              fontSize="5"
              textLength={fitTextLength(small, 5)}
              lengthAdjust="spacingAndGlyphs"
            >
              {small}
            </tspan>
            <tspan
              x="-29"
              y="-30.6"
              fontSize="7.4"
              textLength={fitTextLength(big, 7.4)}
              lengthAdjust="spacingAndGlyphs"
            >
              {big}
            </tspan>
          </text>
        </g>
      </g>
    </svg>
  );
}
