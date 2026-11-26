"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import gsap from "gsap";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import { TUTORIAL_COPY, getTutorialCards } from "@/src/domain/copy/tutorial";
import type { AnchorName } from "@/src/features/shared/bubble-placement";
import type { MomoStageHandle } from "@/src/features/shared/MomoStage";
import {
  buildCloseCardTimeline,
  buildDealTimeline,
  buildExitTimeline,
  buildOpenCardTimeline,
  forceOpenCardDom,
  resetCardsForDeal,
  type TutorialDomRefs,
} from "./tutorial-animations";
import {
  TUTORIAL_BUBBLE_HIDE_MS,
  TUTORIAL_CARD_INDICES,
  TUTORIAL_MOMO_GREET_MS,
  TUTORIAL_MOMO_INTRO_MS,
  TUTORIAL_TIMING,
  cardPhase,
  cardRestTransform,
  computeTutorialLayout,
  createTutorialFlowState,
  speechLineDelayMs,
  tutorialFlowReducer,
  type CardIndex,
  type R83TutorialLayout,
} from "./tutorial-machine";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function runSpeechLines(
  lines: readonly string[],
  onLine: (line: string) => void,
  onDone?: () => void,
): () => void {
  let alive = true;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const wait = (ms: number) =>
    new Promise<void>((r) => {
      timers.push(setTimeout(() => { if (alive) r(); }, ms));
    });
  void (async () => {
    for (let k = 0; k < lines.length && alive; k++) {
      onLine(lines[k]!);
      if (k < lines.length - 1) await wait(speechLineDelayMs(lines[k]!));
    }
    if (alive) onDone?.();
  })();
  return () => {
    alive = false;
    for (const id of timers) clearTimeout(id);
  };
}

export interface UseTutorialTimelineOptions {
  readonly characterName: string;
  readonly studentName?: string;
  readonly fromName?: boolean;
  readonly initialCard?: CardIndex;
  readonly onStart: () => void;
}

export function useTutorialTimeline({
  characterName,
  studentName = "",
  fromName = true,
  initialCard = 0,
  onStart,
}: UseTutorialTimelineOptions) {
  const [flow, dispatch] = useReducer(tutorialFlowReducer, initialCard, createTutorialFlowState);
  const [openedCard, setOpenedCard] = useState<number>(-1);
  const [resizeKey, setResizeKey] = useState(0);
  const [hintText, setHintText] = useState("");
  const [momoAnchor, setMomoAnchor] = useState<AnchorName>(() => (initialCard > 0 ? "strip" : "mid"));
  const [momoExpr, setMomoExpr] = useState<MomoExpression>("Senang");
  const [bubbleText, setBubbleText] = useState("");
  const [bubbleVisible, setBubbleVisible] = useState(false);

  const tutRef = useRef<HTMLDivElement | null>(null);
  const shadeRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const momoRef = useRef<MomoStageHandle | null>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([null, null, null]);
  const flipRefs = useRef<Array<HTMLDivElement | null>>([null, null, null]);
  const playRefs = useRef<Array<HTMLElement | null>>([null, null, null]);
  const doneRefs = useRef<Array<HTMLSpanElement | null>>([null, null, null]);
  const domRefsRef = useRef<TutorialDomRefs>({ cardRefs, flipRefs, playRefs, doneRefs });
  const layoutRef = useRef<R83TutorialLayout>(computeTutorialLayout(1280, 720));
  const openedRef = useRef(-1);
  /** Adegan yang sedang jalan (label bilah "Lewati"): sapaan, lalu kartu 0-2. */
  const [segment, setSegment] = useState<"intro" | CardIndex>("intro");
  const targetCardRef = useRef<CardIndex>(initialCard);
  /** Terisi hanya selama sapaan Momo, sebelum kartu dibagikan. */
  const skipIntroRef = useRef<(() => void) | null>(null);
  /** Animasi bagi / tutup-buka / keluar yang sedang jalan, plus cara memaksa keadaan akhirnya. */
  const motionRef = useRef<{ timeline: gsap.core.Timeline | null; finish: () => void } | null>(null);
  const advancedRef = useRef(new Set<CardIndex>());
  const exitingRef = useRef(false);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  const cards = getTutorialCards(characterName);
  const mountInitRef = useRef({ characterName, studentName, fromName, initialCard, cards });

  const applyCssVars = useCallback((l: R83TutorialLayout) => {
    layoutRef.current = l;
    const tut = tutRef.current;
    if (!tut) return;
    tut.style.setProperty("--gw", `${l.gw}px`);
    tut.style.setProperty("--pw", `${l.pw}px`);
    tut.style.setProperty("--oh", `${l.oh}px`);
    tut.style.setProperty("--cy", `${l.cy}px`);
  }, []);

  const syncOpenedDom = useCallback((idx: CardIndex) => {
    forceOpenCardDom(domRefsRef.current, layoutRef.current, idx);
    openedRef.current = idx;
    setOpenedCard(idx);
    if (idx === 2) setResizeKey((k) => k + 1);
  }, []);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const l = computeTutorialLayout(window.innerWidth || 1280, window.innerHeight || 720);
      applyCssVars(l);
      if (openedRef.current >= 0) syncOpenedDom(openedRef.current as CardIndex);
      else {
        TUTORIAL_CARD_INDICES.forEach((j) => {
          const el = domRefsRef.current.cardRefs.current[j];
          if (el) gsap.set(el, cardRestTransform(j, l));
        });
      }
    };
    applyCssVars(computeTutorialLayout(window.innerWidth || 1280, window.innerHeight || 720));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyCssVars, syncOpenedDom]);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const init = mountInitRef.current;
    const l = computeTutorialLayout(window.innerWidth || 1280, window.innerHeight || 720);
    applyCssVars(l);
    let alive = true;
    let dealt = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        timers.push(setTimeout(() => { if (alive) r(); }, ms));
      });
    advancedRef.current = new Set();
    exitingRef.current = false;
    targetCardRef.current = init.initialCard;

    const deal = () => {
      if (!alive || dealt) return;
      dealt = true;
      skipIntroRef.current = null;
      setSegment(init.initialCard);
      dispatch({ type: "DEAL_STARTED" });
      setHintText(init.cards[init.initialCard]!.hint);
      if (init.initialCard === 0) {
        setBubbleText(TUTORIAL_COPY.dealStartLine);
        setMomoExpr("Senang");
        setBubbleVisible(true);
      }
      let opened = false;
      const onOpened = () => {
        if (!alive || opened) return;
        opened = true;
        syncOpenedDom(init.initialCard);
        dispatch({ type: "CARD_OPENED", index: init.initialCard });
      };
      const timeline = buildDealTimeline(domRefsRef.current, shadeRef.current, layoutRef.current, init.initialCard, onOpened);
      motionRef.current = { timeline, finish: onOpened };
    };

    const ctx = gsap.context(() => {
      resetCardsForDeal(domRefsRef.current, l);
      if (init.initialCard === 0) {
        skipIntroRef.current = () => {
          setBubbleVisible(false);
          dispatch({ type: "INTRO_TO_STRIP" });
          setMomoAnchor("strip");
          void momoRef.current?.moveTo("strip", 0);
          deal();
        };
      }
      void (async () => {
        if (init.initialCard === 0) {
          setMomoAnchor("mid");
          await (init.fromName
            ? momoRef.current?.moveTo("mid", TUTORIAL_MOMO_INTRO_MS, -7)
            : momoRef.current?.moveTo("mid", 0));
          if (!alive || dealt) return;
          const nm = init.studentName.trim();
          setMomoExpr("Senang");
          setBubbleText(
            nm ? TUTORIAL_COPY.introNamed(nm, init.characterName) : TUTORIAL_COPY.introAnon(init.characterName),
          );
          setBubbleVisible(true);
          await wait(TUTORIAL_MOMO_GREET_MS);
          if (!alive || dealt) return;
          setBubbleVisible(false);
          await wait(TUTORIAL_BUBBLE_HIDE_MS);
          if (!alive || dealt) return;
          dispatch({ type: "INTRO_TO_STRIP" });
          setMomoAnchor("strip");
          await momoRef.current?.moveTo("strip", TUTORIAL_MOMO_INTRO_MS, 8);
          if (!alive || dealt) return;
        } else {
          dispatch({ type: "INTRO_TO_STRIP" });
          setMomoAnchor("strip");
          await momoRef.current?.moveTo("strip", 0);
        }

        deal();
      })();
    }, tutRef);

    return () => {
      alive = false;
      skipIntroRef.current = null;
      motionRef.current?.timeline?.kill();
      motionRef.current = null;
      for (const id of timers) clearTimeout(id);
      ctx.revert();
    };
  }, [applyCssVars, syncOpenedDom]);

  const openedIdx = flow.stage === "card-active" ? flow.activeCard : -1;
  const activeGate = openedIdx >= 0 ? flow.gates[openedIdx as CardIndex] : null;
  const practiceDoneForActive = activeGate ? activeGate.practiceDone : false;
  const momoDoneForActive = activeGate ? activeGate.momoDone : false;
  const closingForActive = activeGate ? activeGate.closing : false;

  const hasHint = Boolean(hintText);
  useIsoLayoutEffect(() => {
    const el = hintRef.current;
    if (!el || !hasHint) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25, clearProps: "opacity" });
    }, el);
    return () => ctx.revert();
  }, [hasHint]);

  useEffect(() => {
    if (flow.stage !== "card-active" || openedCard !== flow.activeCard || closingForActive) return;
    const idx = flow.activeCard;
    const doneLines = TUTORIAL_COPY.cardDoneMomoLines(idx, characterName);
    if (practiceDoneForActive && doneLines.length > 0) return;
    if (momoDoneForActive) return;
    const { mood, lines } = TUTORIAL_COPY.cardMomoLines(idx, characterName);
    setMomoExpr(mood);
    setBubbleVisible(true);
    return runSpeechLines(
      lines,
      (line) => setBubbleText(line),
      doneLines.length === 0 ? () => dispatch({ type: "MOMO_DONE", index: idx }) : undefined,
    );
  }, [flow.stage, flow.activeCard, openedCard, practiceDoneForActive, momoDoneForActive, closingForActive, characterName]);

  useEffect(() => {
    if (flow.stage !== "card-active" || openedCard !== flow.activeCard || closingForActive || !practiceDoneForActive) return;
    const idx = flow.activeCard;
    const doneLines = TUTORIAL_COPY.cardDoneMomoLines(idx, characterName);
    if (doneLines.length === 0) return;
    setMomoExpr("Senang");
    setBubbleVisible(true);
    return runSpeechLines(doneLines, (line) => setBubbleText(line), () => dispatch({ type: "MOMO_DONE", index: idx }));
  }, [flow.stage, flow.activeCard, openedCard, practiceDoneForActive, closingForActive, characterName]);

  /** Menutup satu kartu (sekali saja) lalu membuka kartu berikutnya, atau menutup tutorial. */
  const advanceFrom = useCallback(
    (idx: CardIndex) => {
      if (advancedRef.current.has(idx)) return;
      advancedRef.current.add(idx);
      dispatch({ type: "THUMB", index: idx });
      const clearOpened = () => {
        // GSAP can run this again after the next card has opened: it may only close its own card.
        if (openedRef.current !== idx) return;
        openedRef.current = -1;
        setOpenedCard(-1);
      };
      if (idx < 2) {
        const nextIdx = (idx + 1) as CardIndex;
        targetCardRef.current = nextIdx;
        setSegment(nextIdx);
        setHintText(cards[nextIdx]!.hint);
        let opened = false;
        const onOpened = () => {
          if (opened) return;
          opened = true;
          syncOpenedDom(nextIdx);
          dispatch({ type: "CARD_OPENED", index: nextIdx });
        };
        const timeline = gsap
          .timeline()
          .add(buildCloseCardTimeline(domRefsRef.current, layoutRef.current, idx, clearOpened), 0)
          .add(
            buildOpenCardTimeline(domRefsRef.current, layoutRef.current, nextIdx, onOpened),
            TUTORIAL_TIMING.close.duration + TUTORIAL_TIMING.pause,
          );
        motionRef.current = { timeline, finish: onOpened };
        return;
      }
      exitingRef.current = true;
      setBubbleVisible(false);
      setHintText("");
      let left = false;
      const leave = () => {
        if (left) return;
        left = true;
        dispatch({ type: "EXIT_DONE" });
        onStartRef.current();
      };
      buildExitTimeline(domRefsRef.current, shadeRef.current, layoutRef.current, clearOpened, leave);
      motionRef.current = { timeline: null, finish: leave };
    },
    [cards, syncOpenedDom],
  );

  const confirmCard = useCallback(
    (idx: CardIndex) => {
      if (cardPhase(flow.gates[idx]) !== "ackEligible") return;
      advanceFrom(idx);
    },
    [advanceFrom, flow.gates],
  );

  /** Memaksa animasi yang sedang jalan ke keadaan akhirnya (kartu terbuka, atau tutorial selesai). */
  const flushMotion = useCallback(() => {
    const motion = motionRef.current;
    if (!motion) return;
    motionRef.current = null;
    motion.timeline?.progress(1).kill();
    motion.finish();
  }, []);

  /** "Lewati" (paritas `kartu.js`): satu tekanan menyelesaikan adegan ini saja. */
  const skip = useCallback(() => {
    if (skipIntroRef.current) {
      skipIntroRef.current();
      return;
    }
    if (exitingRef.current) {
      flushMotion();
      return;
    }
    const idx = targetCardRef.current;
    flushMotion();
    if (openedRef.current !== idx) syncOpenedDom(idx);
    dispatch({ type: "CARD_OPENED", index: idx });
    dispatch({ type: "MOMO_DONE", index: idx });
    dispatch({ type: "PRACTICE_DONE", index: idx });
    dispatch({ type: "READ_DONE", index: idx });
    advanceFrom(idx);
  }, [advanceFrom, flushMotion, syncOpenedDom]);

  const skipLabel = segment === "intro" ? "Kartu tutorial" : cards[segment]!.label;

  return {
    tutRef, shadeRef, hintRef, momoRef, cardRefs, flipRefs, playRefs, doneRefs,
    cards, flow, openedCard, resizeKey, hintText, momoAnchor, momoExpr, bubbleText, bubbleVisible,
    markPracticeDone: useCallback((index: CardIndex) => dispatch({ type: "PRACTICE_DONE", index }), []),
    markReadDone: useCallback((index: CardIndex) => dispatch({ type: "READ_DONE", index }), []),
    confirmCard,
    skip,
    skipLabel,
  };
}
