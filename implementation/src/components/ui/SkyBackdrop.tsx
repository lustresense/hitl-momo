/**
 * The drawing page is the sky above Thinman's world: dotted sketchbook paper with hand-drawn clouds
 * drifting slowly. Purely decorative (aria-hidden) and shared by the drawing screen and the level intro,
 * so the camera can rise from the world into the very same sky without a visual jump.
 */
const CLOUD = "M24 92 C4 92 2 62 26 60 C26 34 62 26 80 46 C92 20 134 20 144 46 C168 36 196 54 190 74 C214 74 216 94 192 94 Z";

function Cloud({ className }: { className: string }) {
  return (
    <svg className={`sky-cloud ${className}`} viewBox="0 0 220 110" aria-hidden="true" focusable="false">
      <path d={CLOUD} fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M52 78 q14 -9 28 0 M110 66 q12 -8 24 0 M150 82 q10 -6 20 0" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

export function SkyBackdrop({ className }: { className?: string }) {
  return (
    <div className={`sky-backdrop${className ? " " + className : ""}`} aria-hidden="true">
      <Cloud className="sky-cloud--a" />
      <Cloud className="sky-cloud--b" />
      <Cloud className="sky-cloud--c" />
      <Cloud className="sky-cloud--d" />
    </div>
  );
}
