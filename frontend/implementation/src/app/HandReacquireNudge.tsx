"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { MomoAvatar } from "@/src/components/momo/MomoAvatar";
import { useNuiStatus, type NuiStatusSnapshot } from "@/src/nui/react";

const REACQUIRE_DEBOUNCE_MS = 900;
const REACQUIRE_COPY =
  "Tangannya kurang jelas nih! Coba buka 5 jarimu menghadap kamera sebentar biar aku bisa lihat lagi, ya.";

type NuiStatusWithReacquire = NuiStatusSnapshot & {
  readonly handNeedsOpenPose?: boolean;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Friendly Momo nudge prompting the student to briefly open 5 fingers toward the camera
 * when a hand is present in frame without being locked (debounced by 900ms).
 */
export function HandReacquireNudge() {
  const nuiStatus: NuiStatusWithReacquire = useNuiStatus();
  const handNeedsOpenPose = Boolean(nuiStatus.handNeedsOpenPose);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!handNeedsOpenPose) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setMounted(true);
      setVisible(true);
    }, REACQUIRE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [handNeedsOpenPose]);

  useEffect(() => {
    const el = cardRef.current;
    if (!mounted || !el) return;
    gsap.killTweensOf(el);
    const reduced = prefersReducedMotion();

    if (visible) {
      if (reduced) {
        gsap.set(el, { opacity: 1, scale: 1.18, y: 0 });
      } else {
        gsap.fromTo(
          el,
          { opacity: 0, scale: 0.85, y: 12 },
          { opacity: 1, scale: 1.18, y: 0, duration: 0.42, ease: "back.out(1.7)" },
        );
      }
      return;
    }

    if (reduced) {
      setMounted(false);
      return;
    }
    gsap.to(el, {
      opacity: 0,
      scale: 0.85,
      duration: 0.22,
      ease: "power2.in",
      onComplete: () => {
        setMounted(false);
      },
    });
  }, [mounted, visible]);

  useEffect(() => {
    const el = cardRef.current;
    return () => {
      if (el) gsap.killTweensOf(el);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="r83-reacquire-wrap"
      data-testid="r83-hand-reacquire-nudge"
      role="status"
      aria-live="polite"
    >
      <div ref={cardRef} className="r83-reacquire-card">
        <div className="r83-reacquire-momo">
          <MomoAvatar expression="Penasaran" height={138} label="Momo meminta tangan terbuka" />
        </div>
        <div className="r83-reacquire-bubble">
          <p className="r83-reacquire-copy">{REACQUIRE_COPY}</p>
        </div>
      </div>
    </div>
  );
}
