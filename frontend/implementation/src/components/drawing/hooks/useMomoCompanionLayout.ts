/**
 * Momo the drawing-screen companion keeps one place: the top-left corner, while drawing, guessing and showing the
 * result (Owner: jangan bergeser ke tengah/kanan saat menebak). Only the width she may use follows the window.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** The corner anchor, in px from the top-left of the drawing screen. */
export const COMPANION_POSITION = { x: 28, y: 24 } as const;
const RIGHT_GUTTER = 24;
const FALLBACK_WIDTH = 340;

function availableWidth(): number {
  return Math.max(0, window.innerWidth - COMPANION_POSITION.x - RIGHT_GUTTER);
}

export function useMomoCompanionLayout() {
  const companionRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(FALLBACK_WIDTH);

  // Measured after mount (not during render) so server and first client render match.
  useLayoutEffect(() => {
    setAvailable(availableWidth());
  }, []);

  useEffect(() => {
    const update = () => setAvailable(availableWidth());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return { companionRef, momoLayout: { ...COMPANION_POSITION, available } };
}
