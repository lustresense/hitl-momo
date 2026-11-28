"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import type { MomoStageHandle } from "@/src/features/shared/MomoStage";
import type { PathPoint } from "@/src/features/shared/bubble-placement";
import type { WorldIntroFocus } from "@/src/domain/copy/world";
import { CAMERA_WORLD_Y_PERCENT, SKY_TRANSITION_DURATIONS } from "./sky-transition";
import { useIsoLayoutEffect } from "./world-ui-helpers";
import {
  INTRO_CLAMP,
  buildIntroBeats,
  computeLitIntroSpot,
  computeMomoIntroSpot,
  type IntroPhase,
} from "./intro-beats";

const SCENE_ENTER_DELAY_MS = 280;
const FLY_IN_MS = 950;
const GLIDE_MS = 1100;
const SPOT_S = 0.9;
const BOOK_OPEN_PAUSE_MS = 500;
const RISE_FINISH_MS = 2600;
/** "Lewati" sandbox mempercepat adegan 7x (`ui.js` `globalTimeline.timeScale(7)`). */
const SKIP_SPEED = 7;

export interface UseIntroTimelineOptions {
  readonly stage: number;
  readonly characterDisplayName?: string | null;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly cameraRef: RefObject<HTMLDivElement | null>;
  readonly nearRef: RefObject<HTMLDivElement | null>;
  readonly dimRef: RefObject<HTMLDivElement | null>;
  readonly chipRef: RefObject<HTMLDivElement | null>;
  readonly thinmanRef: RefObject<HTMLDivElement | null>;
  readonly momoRef: RefObject<MomoStageHandle | null>;
  readonly onReveal?: () => void;
  readonly onFinish: () => void;
}

export interface IntroTimelineState {
  readonly phase: IntroPhase;
  readonly bubbleText: string;
  readonly bubbleVisible: boolean;
  readonly mood: string;
  readonly flapKey: number;
  readonly ringVisible: boolean;
  readonly triggerRise: () => void;
  readonly skip: () => void;
}

export function useIntroTimeline(options: UseIntroTimelineOptions): IntroTimelineState {
  const { stage, characterDisplayName, rootRef, cameraRef, nearRef, dimRef, chipRef, thinmanRef, momoRef } = options;
  const finishRef = useRef(options.onFinish);
  finishRef.current = options.onFinish;
  const revealRef = useRef(options.onReveal);
  revealRef.current = options.onReveal;

  const [phase, setPhase] = useState<IntroPhase>("drop");
  const [bubbleText, setBubbleText] = useState("");
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [mood, setMood] = useState("Semangat");
  const [flapKey, setFlapKey] = useState(0);
  const [ringVisible, setRingVisible] = useState(false);

  const doneRef = useRef(false);
  const risingRef = useRef(false);
  /** Stage whose intro jingle already played (survives StrictMode effect re-runs; reset only by a new stage). */
  const jinglePlayedRef = useRef<number | null>(null);
  const spotRef = useRef({ x: 0, y: 0, r: 0 });
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const ctxRef = useRef<gsap.Context | null>(null);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current.clear();
  }, []);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timersRef.current.delete(id);
          resolve();
        }, ms);
        timersRef.current.add(id);
      }),
    [],
  );

  const finishNow = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    ctxRef.current?.revert();
    revealRef.current?.();
    finishRef.current();
  }, [clearTimers]);

  const paintSpot = useCallback(() => {
    const dim = dimRef.current;
    if (!dim) return;
    dim.style.setProperty("--spot-x", `${spotRef.current.x}px`);
    dim.style.setProperty("--spot-y", `${spotRef.current.y}px`);
    dim.style.setProperty("--spot-r", `${spotRef.current.r}px`);
  }, [dimRef]);

  const spotFor = useCallback(
    (focus: WorldIntroFocus) => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 720;
      const rect = momoRef.current?.rect();
      const s = momoRef.current?.pose().s ?? 1;
      const base = rect && rect.width > 0 ? { w: rect.width / Math.max(0.2, s), h: rect.height / Math.max(0.2, s) } : { w: 176, h: 261 };
      return computeMomoIntroSpot(focus, { w: vw, h: vh }, base, thinmanRef.current?.getBoundingClientRect());
    },
    [momoRef, thinmanRef],
  );

  const litFor = useCallback(
    (focus: WorldIntroFocus) => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 720;
      return computeLitIntroSpot(focus, { w: vw, h: vh }, thinmanRef.current?.getBoundingClientRect());
    },
    [thinmanRef],
  );

  const startRise = useCallback((speed: number) => {
    if (risingRef.current || doneRef.current) return;
    risingRef.current = true;
    clearTimers();
    setRingVisible(false);
    setBubbleVisible(false);
    setPhase("rise");
    setMood("Semangat");
    setFlapKey((k) => k + 1);
    // The 2.1 s camera rise (real speed only). The dev skip runs it 7x faster, so the long sounds would not match: silent.
    if (speed === 1) {
      audio.emit("world.rise");
      audio.emit("momo.whoosh");
    }

    const root = rootRef.current;
    const cam = cameraRef.current;
    const near = nearRef.current;
    const chip = chipRef.current;
    if (root && cam) {
      gsap.killTweensOf(spotRef.current);
      const play = () => {
        const dur = SKY_TRANSITION_DURATIONS.introRiseS;
        const tl = gsap.timeline();
        tl.to(cam, { yPercent: 0, duration: dur, ease: "power2.inOut" }, 0.36);
        if (near) tl.fromTo(near, { y: -220 }, { y: 260, duration: dur, ease: "power1.inOut" }, 0.36);
        tl.to(spotRef.current, { r: 0, duration: 0.6, onUpdate: paintSpot }, 0);
        if (chip) tl.to(chip, { opacity: 0, duration: 0.4 }, 0);
        tl.timeScale(speed);
      };
      if (speed !== 1 && ctxRef.current) {
        // "Lewati": keep the context, so the fast rise starts from the pose on screen.
        ctxRef.current.add(play);
      } else {
        ctxRef.current?.revert();
        ctxRef.current = gsap.context(play, root);
      }
    }

    void momoRef.current?.moveTo("corner", Math.round(1900 / speed));
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      setPhase("sky");
      finishNow();
    }, Math.round(RISE_FINISH_MS / speed));
    timersRef.current.add(id);
  }, [cameraRef, chipRef, clearTimers, finishNow, momoRef, nearRef, paintSpot, rootRef]);

  const triggerRise = useCallback(() => startRise(1), [startRise]);

  /** "Lewati": cerita berhenti, kamera tetap naik (dipercepat). Tekanan kedua saat naik langsung selesai. */
  const skip = useCallback(() => {
    if (risingRef.current) {
      finishNow();
      return;
    }
    startRise(SKIP_SPEED);
  }, [finishNow, startRise]);

  useIsoLayoutEffect(() => {
    let cancelled = false;
    doneRef.current = false;
    risingRef.current = false;
    const root = rootRef.current;
    const cam = cameraRef.current;
    const chip = chipRef.current;
    if (!root || !cam) return;

    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 720;
    spotRef.current = { x: vw / 2, y: vh / 2, r: 0 };
    paintSpot();

    const beats = buildIntroBeats(stage, characterDisplayName);

    ctxRef.current = gsap.context(() => {
      gsap.set(cam, { yPercent: CAMERA_WORLD_Y_PERCENT });
      if (chip) gsap.from(chip, { opacity: 0, y: -14, duration: 0.5, delay: 0.3 + SCENE_ENTER_DELAY_MS / 1000 });
    }, root);

    // Seed spotlight directly on the first focus target after camera placement so fading in never reveals a 0px dot at screen center.
    spotRef.current = litFor(beats[0]?.focus ?? "thinman");
    paintSpot();

    const run = async () => {
      await sleep(SCENE_ENTER_DELAY_MS + BOOK_OPEN_PAUSE_MS);
      if (cancelled || risingRef.current) return;
      // Intro start: the level jingle, once per stage (a StrictMode re-run cancels the first run before it gets here).
      if (jinglePlayedRef.current !== stage) {
        jinglePlayedRef.current = stage;
        audio.emit("jingle.level_intro");
      }
      await momoRef.current?.moveTo("side", 0);
      const first = spotFor(beats[0]?.focus ?? "thinman");
      const pose = momoRef.current?.pose() ?? { x: first.x, y: first.y, s: first.s, r: 0 };
      const flyPts: PathPoint[] = [
        { t: 0, x: pose.x, y: pose.y, s: pose.s, r: pose.r },
        { t: 0.55, x: (pose.x + first.x) / 2, y: Math.min(pose.y, first.y) - 40, s: (pose.s + first.s) / 2, r: -4 },
        { t: 1, x: first.x, y: first.y, s: first.s, r: 0 },
      ];
      setFlapKey((k) => k + 1);
      if (!cancelled && !risingRef.current) audio.emit("momo.whoosh");
      await momoRef.current?.moveAlong(flyPts, FLY_IN_MS);
      if (cancelled || risingRef.current) return;

      setPhase("story");
      let currentFocus: WorldIntroFocus | null = null;
      for (let bi = 0; bi < beats.length; bi++) {
        if (cancelled || risingRef.current) return;
        const beat = beats[bi]!;
        if (beat.kind === "nudge") setPhase("nudge");
        if (bi === 0 || beat.focus !== currentFocus) {
          const nextSpot = litFor(beat.focus);
          if (bi === 0) {
            spotRef.current = { ...nextSpot };
            paintSpot();
          } else {
            audio.emit("intro.spotlight");
            ctxRef.current?.add(() => {
              gsap.killTweensOf(spotRef.current);
              gsap.to(spotRef.current, { ...nextSpot, duration: SPOT_S, ease: "power2.inOut", onUpdate: paintSpot });
            });
            const sp = spotFor(beat.focus);
            const cur = momoRef.current?.pose() ?? { x: sp.x, y: sp.y, s: sp.s, r: 0 };
            const glidePts: PathPoint[] = [
              { t: 0, x: cur.x, y: cur.y, s: cur.s, r: cur.r },
              { t: 0.5, x: (cur.x + sp.x) / 2, y: Math.min(cur.y, sp.y) - 30, s: (cur.s + sp.s) / 2, r: -3 },
              { t: 1, x: sp.x, y: sp.y, s: sp.s, r: 0 },
            ];
            await momoRef.current?.moveAlong(glidePts, GLIDE_MS);
            if (cancelled || risingRef.current) return;
          }
        }
        currentFocus = beat.focus;
        setMood(beat.kind === "nudge" ? "Penasaran" : beat.focus === "ahead" ? "Berpikir" : "Senang");

        for (let li = 0; li < beat.lines.length; li++) {
          if (cancelled || risingRef.current) return;
          const line = beat.lines[li]!;
          setBubbleText(line);
          setBubbleVisible(true);
          if (li < beat.lines.length - 1) await sleep(INTRO_CLAMP(line.length * 55, 1700, 3600));
        }
        if (bi < beats.length - 1) {
          const lastLine = beat.lines[beat.lines.length - 1] ?? "";
          await sleep(INTRO_CLAMP(lastLine.length * 55, 1700, 3600));
        }
      }

      if (cancelled || risingRef.current) return;
      const finalBeat = beats[beats.length - 1];
      await sleep(INTRO_CLAMP((finalBeat?.lines[0]?.length ?? 20) * 45, 1500, 3000));
      if (!cancelled && !risingRef.current) setRingVisible(true);
    };

    void run();

    return () => {
      cancelled = true;
      clearTimers();
      gsap.killTweensOf(spotRef.current);
      ctxRef.current?.revert();
    };
  }, [cameraRef, characterDisplayName, chipRef, clearTimers, litFor, momoRef, paintSpot, rootRef, sleep, spotFor, stage]);

  return { phase, bubbleText, bubbleVisible, mood, flapKey, ringVisible, triggerRise, skip };
}
