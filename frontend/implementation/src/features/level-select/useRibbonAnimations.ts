"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import type { LevelDefinition } from "@/src/domain/levels";
import type { RibbonDomRefs } from "./RibbonSlot";
import { NOTCHES_TO_ARM, NOTCH_PX } from "./ribbon-layout";

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Always returns `false` to preserve 1:1 `sandbox-r8.3` GSAP choreography parity
 * across level-select ribbon animations (including on Windows devices where OS "Animation Effects" is disabled).
 */
export const prefersReducedMotion = (): boolean => false;

export interface RibbonAnimationContext {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly statusChipRef: RefObject<HTMLSpanElement | null>;
  readonly hintRef: RefObject<HTMLDivElement | null>;
  readonly refsByStage: MutableRefObject<Map<number, RibbonDomRefs>>;
  readonly lenMapRef: MutableRefObject<Map<number, { length: number }>>;
  readonly shelfHeight: number;
  readonly entryHold: boolean;
  readonly freshStage: number | null;
  readonly revealed: boolean;
  readonly statusMessage: string;
  readonly paintRibbon: (stage: number, length: number) => void;
  readonly hideBubble: () => void;
  readonly onSelectLevel: (level: LevelDefinition) => void;
}

/**
 * Mengelola seluruh timeline/tween GSAP pada layar Pilih Level secara idempoten (StrictMode + `ctx.revert()`).
 */
export function useRibbonAnimations({
  rootRef,
  statusChipRef,
  hintRef,
  refsByStage,
  lenMapRef,
  shelfHeight,
  entryHold,
  freshStage,
  revealed,
  statusMessage,
  paintRibbon,
  hideBubble,
  onSelectLevel,
}: RibbonAnimationContext) {
  const activeTweens = useRef(new Set<gsap.core.Animation>());
  /** Stage whose unlock reveal already sounded: the reveal effect re-runs on resize / StrictMode and must not replay it. */
  const unlockSoundedRef = useRef<number | null>(null);

  const trackTween = useCallback(<T extends gsap.core.Animation>(anim: T, onDone?: () => void): T => {
    activeTweens.current.add(anim);
    anim.eventCallback("onComplete", () => {
      activeTweens.current.delete(anim);
      onDone?.();
    });
    return anim;
  }, []);

  useIsoLayoutEffect(() => {
    if (entryHold || typeof window === "undefined") return;
    let dropSounded = false;
    const ctx = gsap.context(() => {
      gsap.from(".bm-slot", {
        opacity: 0,
        y: -60,
        duration: 0.6,
        stagger: 0.12,
        ease: "back.out(1.4)",
        clearProps: "transform,opacity",
        // One drop sound for the whole shelf; a reverted (StrictMode / dep change) run never starts, so it never sounds.
        onStart: () => { if (!dropSounded) { dropSounded = true; audio.emit("ribbon.drop"); } },
      });
      if (hintRef.current) gsap.fromTo(hintRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }, rootRef);
    return () => ctx.revert();
  }, [entryHold, rootRef, hintRef]);

  useIsoLayoutEffect(() => {
    if (!revealed || freshStage === null || entryHold) return;
    const refs = refsByStage.current.get(freshStage);
    const lenObj = lenMapRef.current.get(freshStage);
    if (!refs?.btn || !lenObj) return;
    if (unlockSoundedRef.current !== freshStage) {
      unlockSoundedRef.current = freshStage; // freshStage non-null means consumeFreshUnlock() really returned this stage
      audio.emit("ribbon.unlock");
    }
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .to(refs.btn, { x: -6, duration: 0.06 })
        .to(refs.btn, { x: 6, duration: 0.07 })
        .to(refs.btn, { x: -4, duration: 0.06 })
        .to(refs.btn, { x: 0, duration: 0.06 });
      const from = Math.round(shelfHeight * 0.66);
      paintRibbon(freshStage, from);
      gsap.to(lenObj, {
        length: shelfHeight,
        duration: 0.9,
        ease: "elastic.out(1, 0.45)",
        onUpdate: () => paintRibbon(freshStage, lenObj.length),
      });
    }, rootRef);
    return () => ctx.revert();
  }, [revealed, freshStage, entryHold, shelfHeight, paintRibbon, rootRef, refsByStage, lenMapRef]);

  useIsoLayoutEffect(() => {
    if (!statusMessage || !statusChipRef.current) return;
    const ctx = gsap.context(() => {
      if (statusChipRef.current) {
        gsap.fromTo(statusChipRef.current, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
      }
    }, rootRef);
    return () => ctx.revert();
  }, [statusMessage, statusChipRef, rootRef]);

  useEffect(() => {
    const tweens = activeTweens.current;
    return () => {
      for (const anim of tweens) anim.kill();
      tweens.clear();
    };
  }, []);

  const launchRibbon = useCallback(
    (level: LevelDefinition, restLength: number) => {
      const refs = refsByStage.current.get(level.stage);
      const lenObj = lenMapRef.current.get(level.stage);
      audio.emit("ribbon.launch"); // from a released armed pull or from the tap / Enter auto-pull; the controller's launching flag makes it single
      if (!refs?.btn || !lenObj) {
        hideBubble();
        onSelectLevel(level);
        return;
      }
      gsap.killTweensOf(lenObj);
      const tl = gsap.timeline();
      tl.to(lenObj, {
        length: restLength + 24,
        duration: 0.12,
        ease: "power2.out",
        onUpdate: () => paintRibbon(level.stage, lenObj.length),
      }).to(lenObj, {
        length: restLength,
        duration: 0.18,
        ease: "power1.in",
        onUpdate: () => paintRibbon(level.stage, lenObj.length),
      });
      tl.fromTo(refs.btn, { y: 0 }, { y: -Math.round(shelfHeight * 0.22), duration: 0.42, ease: "back.out(2.2)" }, 0.12)
        .to(refs.btn, { y: 0, duration: 0.5, ease: "bounce.out" }, 0.62);
      tl.add(() => {
        hideBubble();
        onSelectLevel(level);
      }, 0.5);
      trackTween(tl);
    },
    [refsByStage, lenMapRef, shelfHeight, hideBubble, onSelectLevel, paintRibbon, trackTween],
  );

  const autoPullRibbon = useCallback(
    (level: LevelDefinition, restLength: number) => {
      const lenObj = lenMapRef.current.get(level.stage);
      if (!lenObj) {
        launchRibbon(level, restLength);
        return;
      }
      gsap.killTweensOf(lenObj);
      const tween = gsap.to(lenObj, {
        length: restLength + NOTCHES_TO_ARM * NOTCH_PX,
        duration: 0.42,
        ease: "power1.inOut",
        onUpdate: () => paintRibbon(level.stage, lenObj.length),
      });
      trackTween(tween, () => launchRibbon(level, restLength));
    },
    [lenMapRef, launchRibbon, paintRibbon, trackTween],
  );

  const shakeLockedRibbon = useCallback(
    (stage: number) => {
      const btn = refsByStage.current.get(stage)?.btn;
      if (!btn) return;
      gsap.killTweensOf(btn);
      trackTween(gsap.timeline().to(btn, { x: -7, duration: 0.07 }).to(btn, { x: 7, duration: 0.08 }).to(btn, { x: 0, duration: 0.07 }));
    },
    [refsByStage, trackTween],
  );

  return useMemo(
    () => ({ trackTween, launchRibbon, autoPullRibbon, shakeLockedRibbon }),
    [trackTween, launchRibbon, autoPullRibbon, shakeLockedRibbon],
  );
}
