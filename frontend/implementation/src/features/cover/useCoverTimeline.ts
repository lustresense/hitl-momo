"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { COVER_INTRO_COPY } from "@/src/domain/copy/cover";
import {
  applyCoverDomLayout,
  applySpotlightState,
  collectNameExitTargets,
  positionInsideBubble,
  setMomoCenterPose,
  useCoverTimelineRefs,
  type CoverTimelineRefs,
} from "./cover-dom-layout";
import { computeCoverLayout, computeNameParkingPose } from "./cover-layout";
import type { CoverAction, CoverCameraStatus, CoverPhase, GateNudge, GateState } from "./cover-machine";
import {
  runBookCurlPhaseTimeline,
  runCameraRequestLaunch,
  runNamePhaseTimeline,
  runWakePhaseTimeline,
  type CoverPhaseTimelineCallbacks,
} from "./cover-phase-timelines";

export type { CoverTimelineRefs };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface UseCoverTimelineOptions {
  readonly phase: CoverPhase;
  readonly gateState?: GateState;
  readonly cameraStatus?: CoverCameraStatus;
  readonly introLineIndex: number;
  readonly gateNudge: GateNudge;
  readonly insideBubbleText: string;
  readonly skipNameStep?: boolean;
  readonly dispatch: (action: CoverAction) => void;
  readonly onMomoMood: (mood: MomoExpression, opts?: { flap?: boolean; wave?: boolean }) => void;
  readonly onBookBubble: (text: string) => void;
}

export interface CoverTimelineState {
  readonly refs: CoverTimelineRefs;
  readonly viewportWidth: number;
  readonly pipMode: boolean;
  readonly morphing: boolean;
  readonly momoHeight: number;
  readonly nameReady: boolean;
  readonly bookRevealed: boolean;
}

const isPostCurlBookPhase = (phase: CoverPhase): boolean =>
  phase === "name" || phase === "name-confirm" || phase === "name-exit" || phase === "ruler";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hook animasi GSAP & layout sampul r8.3 (`useIsoLayoutEffect` + `ctx.revert()`,
 * idempoten di StrictMode, 0 state React per frame).
 */
export function useCoverTimeline({
  phase,
  gateState,
  cameraStatus = "idle",
  introLineIndex,
  gateNudge,
  insideBubbleText,
  skipNameStep = false,
  dispatch,
  onMomoMood,
  onBookBubble,
}: UseCoverTimelineOptions): CoverTimelineState {
  const refs = useCoverTimelineRefs();
  const [viewportWidth, setViewportWidth] = useState(1024);
  const [pipMode, setPipMode] = useState(() => phase !== "sleep" && phase !== "gate" && phase !== "camera-on" && phase !== "wake");
  const [morphing, setMorphing] = useState(false);
  const [nameReady, setNameReady] = useState(() => phase === "name" || phase === "name-confirm" || phase === "name-exit");
  const [bookRevealed, setBookRevealed] = useState(() => isPostCurlBookPhase(phase));
  const [momoHeight, setMomoHeight] = useState(() => computeCoverLayout(1024, 768).mH);

  const isRequestLaunching = phase === "camera-on" && cameraStatus === "requesting";
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const isRequestLaunchingRef = useRef(isRequestLaunching);
  isRequestLaunchingRef.current = isRequestLaunching;
  const requestLaunchAtRef = useRef<number | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const moodRef = useRef(onMomoMood);
  moodRef.current = onMomoMood;
  const bookBubbleRef = useRef(onBookBubble);
  bookBubbleRef.current = onBookBubble;
  const curlObjRef = useRef({ progress: 0 });
  const cameFromCurlRef = useRef(false);
  /** Edge flags for one-shot sounds, so a StrictMode re-run or an effect dep change (e.g. skipNameStep) does not repeat them. */
  const wakeStartledRef = useRef(false);
  const ayoRingSoundedRef = useRef(false);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const syncAll = () => {
      if (!active) return;
      const w = window.innerWidth || 1024;
      const h = window.innerHeight || 768;
      const layout = computeCoverLayout(w, h);
      setViewportWidth(w);
      setMomoHeight(layout.mH);
      if (!isRequestLaunchingRef.current) {
        applyCoverDomLayout(refs, phaseRef.current, layout);
      }
      refs.bookCurl.current?.resize();
    };
    syncAll();
    const raf = window.requestAnimationFrame(syncAll);
    const fonts = typeof document !== "undefined" ? (document as { readonly fonts?: FontFaceSet }).fonts : undefined;
    if (fonts?.ready) void fonts.ready.then(syncAll).catch(() => undefined);
    window.addEventListener("resize", syncAll);
    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", syncAll);
    };
  }, [phase, gateState, isRequestLaunching, refs]);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (phase === "name" || phase === "name-confirm") {
      positionInsideBubble(refs.bookInsideBubble.current, refs.momo.current, window.innerWidth || 1024, window.innerHeight || 768, 0);
    }
  }, [insideBubbleText, phase, refs]);

  useIsoLayoutEffect(() => {
    if (!gateNudge || prefersReducedMotion() || typeof window === "undefined") return;
    const targets = [refs.gate.current, refs.camera.current].filter(Boolean);
    if (!targets.length) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(targets, { x: 0 }, { keyframes: [{ x: -8 }, { x: 7 }, { x: -5 }, { x: 3 }, { x: 0 }], duration: 0.42, ease: "power1.out" });
    }, refs.root);
    return () => ctx.revert();
  }, [gateNudge, refs]);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    const layout = computeCoverLayout(w, h);

    const callbacks: CoverPhaseTimelineCallbacks = {
      reduced: false,
      skipNameStep,
      dispatch: (action) => dispatchRef.current(action),
      onMomoMood: (mood, opts) => moodRef.current(mood, opts),
      onBookBubble: (text) => bookBubbleRef.current(text),
      setPipMode,
      setMorphing,
      setNameReady,
      setBookRevealed,
      curlObj: curlObjRef.current,
      markCameFromCurl: (val) => { cameFromCurlRef.current = val; },
    };

    if (phase !== "wake") wakeStartledRef.current = false;
    if (phase !== "ayo") ayoRingSoundedRef.current = false;

    const ctx = gsap.context(() => {
      if (phase === "sleep" || phase === "gate" || phase === "camera-on") {
        setPipMode(false); setMorphing(false); setNameReady(false); setBookRevealed(false);
        cameFromCurlRef.current = false;
        curlObjRef.current.progress = 0;
        applySpotlightState(refs, 0, 0, 0);
        if (refs.hero.current) gsap.set(refs.hero.current, { opacity: 1 });
        if (refs.shadow.current) gsap.set(refs.shadow.current, { opacity: 0.12 });
        if (isRequestLaunching) {
          if (requestLaunchAtRef.current === null) {
            requestLaunchAtRef.current = performance.now();
            audio.emit("momo.startle"); // the toggle was really switched on: the card flies up and Momo is startled (once per request)
          }
          runCameraRequestLaunch(refs, layout, (mood, opts) => moodRef.current(mood, opts));
        } else {
          requestLaunchAtRef.current = null;
        }
        return;
      }

      if (phase === "wake") {
        const offsetSec =
          requestLaunchAtRef.current !== null
            ? Math.max(0, (performance.now() - requestLaunchAtRef.current) / 1000)
            : 0;
        setBookRevealed(false);
        // With no earlier request launch (denied -> continue without camera, dev skip) the wake timeline plays the same card launch itself.
        if (requestLaunchAtRef.current === null && !wakeStartledRef.current) audio.emit("momo.startle");
        wakeStartledRef.current = true;
        runWakePhaseTimeline(refs, layout, callbacks, offsetSec);
        return;
      }

      requestLaunchAtRef.current = null;

      if (phase === "intro") {
        setPipMode(true); setMorphing(false); setBookRevealed(false);
        if (refs.shade.current) gsap.to(refs.shade.current, { opacity: 0.92, duration: 1.0 });
        if (refs.spot.current) gsap.to(refs.spot.current, { opacity: 1, duration: 1.0 });
        if (refs.bubble.current) {
          gsap.fromTo(
            refs.bubble.current,
            { opacity: 0, y: 8, scale: 0.99 },
            { opacity: 1, y: 0, scale: 1, duration: 0.54 },
          );
        }
        return;
      }

      if (phase === "ayo") {
        setPipMode(true); setMorphing(false); setBookRevealed(false);
        moodRef.current("Senang");
        applySpotlightState(refs, 0.92, 1, 1);
        if (refs.confirm.current) {
          if (!ayoRingSoundedRef.current) {
            ayoRingSoundedRef.current = true;
            audio.emit("ui.ring_in"); // the "Ayo!" ring pops in (ring fire itself is the NUI bridge's sound)
          }
          gsap.fromTo(
            refs.confirm.current,
            { opacity: 0, y: 8, scale: 0.9 },
            { opacity: 1, y: 0, scale: 1, duration: 0.58, ease: "back.out(1.7)" },
          );
        }
        return;
      }

      if (phase === "book-curl") { runBookCurlPhaseTimeline(refs, layout, callbacks); return; }

      if (phase === "name") { setBookRevealed(true); runNamePhaseTimeline(refs, layout, cameFromCurlRef.current, callbacks); return; }

      if (phase === "name-confirm") {
        setPipMode(true); setNameReady(true); setBookRevealed(true);
        refs.bookCurl.current?.resize(); refs.bookCurl.current?.applyProgress(1);
        return;
      }

      if (phase === "name-exit") {
        setPipMode(true); setBookRevealed(true); moodRef.current("Semangat", { flap: true });
        const targets = collectNameExitTargets(refs);
        const tl = gsap.timeline({ onComplete: () => dispatchRef.current({ type: "NAME_EXIT_DONE" }) });
        tl.to({}, { duration: 0.7 });
        if (targets.length > 0) tl.to(targets, { opacity: 0, y: -18, scale: 0.96, duration: 0.55, stagger: 0.05, ease: "power2.inOut" });
        return;
      }

      if (phase === "ruler") {
        setPipMode(true); setBookRevealed(true);
        refs.bookCurl.current?.resize(); refs.bookCurl.current?.applyProgress(1);
        return;
      }

      if (phase === "handoff") {
        setPipMode(true); setMorphing(false); setBookRevealed(true);
        if (refs.momo.current) {
          refs.momo.current.style.zIndex = "38";
          const park = computeNameParkingPose(layout);
          setMomoCenterPose(refs.momo.current, park.x, park.y, park.s, 0, layout);
        }
        refs.bookCurl.current?.resize(); refs.bookCurl.current?.applyProgress(1);
      }
    }, refs.root);
    return () => ctx.revert();
  }, [phase, isRequestLaunching, refs, skipNameStep]);

  useIsoLayoutEffect(() => {
    if (phase !== "intro" || typeof window === "undefined") return;
    const line = COVER_INTRO_COPY.lines[introLineIndex];
    if (!line) return;
    const durationSec = Math.max(2.0, Math.min(3.6, line.length * 0.056));
    const layout = computeCoverLayout(window.innerWidth || 1024, window.innerHeight || 768);
    const hops: readonly number[] =
      introLineIndex === 0 ? [18] : introLineIndex === 1 ? [28] : introLineIndex === 2 ? [] : [22, 16];
    const ctx = gsap.context(() => {
      if (introLineIndex === 0) moodRef.current("Bangga", { flap: true });
      else if (introLineIndex === 1) {
        moodRef.current("Terkejut", { flap: true });
        gsap.delayedCall(0.7, () => moodRef.current("Senang"));
      } else if (introLineIndex === 2) moodRef.current("Berpikir");
      else moodRef.current("Semangat", { flap: true });

      if (hops.length > 0 && refs.momo.current) {
        const hopTl = gsap.timeline();
        for (const px of hops) {
          const hopProxy = { p: 0 };
          hopTl.to(hopProxy, {
            p: 1,
            duration: 0.36,
            ease: "none",
            onStart: () => audio.emit("momo.hop"), // one discrete greeting hop (cooldown covers a StrictMode re-run)
            onUpdate: () => {
              const y = layout.midCY - Math.sin(Math.PI * hopProxy.p) * px;
              setMomoCenterPose(refs.momo.current, layout.midCX, y, layout.finalScale, 0, layout);
            },
            onComplete: () => {
              setMomoCenterPose(refs.momo.current, layout.midCX, layout.midCY, layout.finalScale, 0, layout);
            },
          });
        }
      }

      gsap.delayedCall(durationSec, () => dispatchRef.current({ type: "INTRO_NEXT" }));
    }, refs.root);
    return () => ctx.revert();
  }, [phase, introLineIndex, refs]);

  return { refs, viewportWidth, pipMode, morphing, momoHeight, nameReady, bookRevealed };
}
