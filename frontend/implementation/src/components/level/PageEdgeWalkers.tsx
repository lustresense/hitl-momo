"use client";
/**
 * R9 easter egg: after the closing, Thinman (walking on his own) and Momo stroll together along the page edge
 * of the level list. Decorative only; shown only once the student finished Level 3.
 */
import { useEffect, useState } from "react";
import { ThinmanArt } from "../ui/ThinmanArt";
import { MomoAvatar } from "../momo/MomoAvatar";

export function PageEdgeWalkers() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((n) => n + 1), 260);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="page-edge-walkers" data-testid="page-edge-walkers" aria-hidden="true">
      <div className="page-edge-walkers__pair">
        <ThinmanArt pose={step % 2 ? "walkA" : "walkB"} className="page-edge-walkers__thinman" />
        <MomoAvatar expression="Senang" height={64} className="page-edge-walkers__momo" />
      </div>
    </div>
  );
}
