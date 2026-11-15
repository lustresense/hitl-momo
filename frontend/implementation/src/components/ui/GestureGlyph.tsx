/**
 * Original SVG hand drawings for the CURRENT NUI vocabulary (2026-11-15).
 * Self-authored vector geometry, no image downloads or third-party icon license.
 * Visually distinct finger counts: pinch, five fingers, one index finger, two fingers.
 * The right/up pointing cues reuse the one-index silhouette and rotate it in SVG.
 */
import type { CSSProperties } from "react";

export const GESTURE_GLYPH_NAMES = [
  "gesture-pinch",
  "gesture-five",
  "gesture-one",
  "gesture-two",
  "gesture-point-right",
  "gesture-point-up",
] as const;

export type GestureGlyphName = (typeof GESTURE_GLYPH_NAMES)[number];

export function isGestureGlyph(name: string): name is GestureGlyphName {
  return (GESTURE_GLYPH_NAMES as readonly string[]).includes(name);
}

const OUTLINES = {
  "gesture-pinch": "M19 57C14 54 10 46 10 41C10 37 13 35 16 36C19 37 23 42 26 43L31 35L28 28C26 25 27 22 30 21C33 20 35 22 37 25L40 15C41 11 44 10 47 12C50 14 49 17 48 21L45 33C49 33 52 36 52 40L49 51C48 55 45 57 41 57Z",
  "gesture-five": "M20 57C16 55 12 49 11 45L8 38C7 35 9 32 12 32C15 32 17 35 20 39L19 22C19 19 21 17 24 17C27 17 28 20 28 23L28 15C28 11 30 9 33 9C36 9 38 11 38 15L38 19L39 10C39 7 41 5 44 6C47 7 48 10 47 13L45 28L49 18C50 15 53 14 55 16C57 18 56 21 55 24L51 41L55 34C57 31 60 32 61 34C62 36 60 39 58 42L53 52C51 56 47 57 43 57Z",
  "gesture-one": "M20 57C16 55 12 49 12 45L10 39C9 36 11 33 14 33C17 33 19 36 21 40L22 14C22 10 24 8 27 8C30 8 32 10 32 14L32 34C34 31 37 30 40 32C42 33 43 35 43 37C45 34 48 33 50 35C53 37 52 40 52 43L50 51C49 55 45 57 41 57Z",
  "gesture-two": "M19 57C15 54 12 48 12 43L10 38C9 35 11 33 14 33C17 33 19 36 21 40L18 17C17 13 19 11 22 10C26 9 28 12 29 15L33 32L34 13C34 9 37 7 40 8C44 9 45 12 44 16L41 34C44 31 47 31 49 33C52 35 52 39 51 43L49 51C48 55 45 57 40 57Z",
} as const;

const DETAILS = {
  "gesture-pinch": "M28 47L35 45M41 39L44 39M36 28L34 32",
  "gesture-five": "M25 44L26 48M33 44L34 48M41 43L41 47",
  "gesture-one": "M31 44L36 45M40 43L44 44",
  "gesture-two": "M28 44L32 46M39 44L42 46",
} as const;

export interface GestureGlyphProps {
  name: GestureGlyphName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** Ink-and-paper art with a small orange tactile accent, matching the existing notebook visual system. */
export function GestureGlyph({ name, size = 30, className, style, title }: GestureGlyphProps) {
  const base = name === "gesture-point-right" || name === "gesture-point-up" ? "gesture-one" : name;
  const pointing = name === "gesture-point-right";
  const fingers = base === "gesture-five" ? "5" : base === "gesture-one" ? "1" : base === "gesture-two" ? "2" : "pinch";
  return (
    <svg
      className={["nb-icon", "nb-icon--gesture-cue", className].filter(Boolean).join(" ")}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-gesture-cue={name}
      data-fingers={fingers}
      style={style}
    >
      <g transform={pointing ? "rotate(90 32 32)" : undefined}>
        <path
          d={OUTLINES[base]}
          fill="var(--nb-paper, #fffaf0)"
          stroke="currentColor"
          strokeWidth={3.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d={DETAILS[base]} stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" opacity={0.7} />
        {base === "gesture-pinch" ? (
          <g stroke="var(--nb-orange, #ef7a37)" strokeWidth={2.8} strokeLinecap="round">
            <path d="M35 16L36 12M28 18L25 15M41 21L45 19" />
          </g>
        ) : null}
        {base === "gesture-five" ? (
          <circle cx="43" cy="51" r="3" fill="var(--nb-orange, #ef7a37)" />
        ) : null}
        {base === "gesture-one" || base === "gesture-two" ? (
          <path d="M21 52H31" stroke="var(--nb-orange, #ef7a37)" strokeWidth={2.8} strokeLinecap="round" />
        ) : null}
      </g>
    </svg>
  );
}
