import gsap from "gsap";
import { audio, type AudioEventId } from "@/src/audio";
import {
  FAN_ROTATIONS,
  TUTORIAL_CARD_INDICES,
  TUTORIAL_TIMING,
  cardRestTransform,
  type CardIndex,
  type R83TutorialLayout,
} from "./tutorial-machine";

export interface TutorialDomRefs {
  readonly cardRefs: { current: Array<HTMLElement | null> };
  readonly flipRefs: { current: Array<HTMLDivElement | null> };
  readonly playRefs: { current: Array<HTMLElement | null> };
  readonly doneRefs: { current: Array<HTMLSpanElement | null> };
}

/**
 * Card sounds are emitted from timeline callbacks, so they follow the real animation. A dev "Lewati" fast-forwards a
 * running timeline with `progress(1)`, which would fire every callback in one tick: wrap that call in `withSilentAudio`.
 */
let audioSilenced = false;

export function withSilentAudio<T>(fn: () => T): T {
  const prev = audioSilenced;
  audioSilenced = true;
  try {
    return fn();
  } finally {
    audioSilenced = prev;
  }
}

const sfx = (id: AudioEventId): void => {
  if (!audioSilenced) audio.emit(id);
};

export function resetCardsForDeal(refs: TutorialDomRefs, layout: R83TutorialLayout): void {
  TUTORIAL_CARD_INDICES.forEach((k) => {
    const c = refs.cardRefs.current[k];
    const f = refs.flipRefs.current[k];
    const p = refs.playRefs.current[k];
    if (p) {
      gsap.set(p, { transformPerspective: 1800, transformOrigin: "0% 50%", rotationY: -92, opacity: 0 });
      p.style.pointerEvents = "none";
    }
    if (f) gsap.set(f, { rotationY: 0 });
    if (c) {
      gsap.set(c, {
        scale: layout.s0 * 0.9,
        x: (k - 1) * layout.gap,
        y: -layout.vh * TUTORIAL_TIMING.deal.fromAboveVh,
        rotation: 0,
        opacity: 0,
        zIndex: 30 - k,
      });
    }
  });
}

export function forceOpenCardDom(refs: TutorialDomRefs, layout: R83TutorialLayout, idx: CardIndex): void {
  TUTORIAL_CARD_INDICES.forEach((j) => {
    const c = refs.cardRefs.current[j];
    const f = refs.flipRefs.current[j];
    const p = refs.playRefs.current[j];
    if (!c || !f || !p) return;
    gsap.set(c, { zIndex: j === idx ? 60 : j < idx ? 10 + j : 30 - j });
    if (j < idx) {
      gsap.set(c, cardRestTransform(j, layout));
      gsap.set(f, { rotationY: 0 });
      c.classList.add("is-done");
      const doneEl = refs.doneRefs.current[j];
      if (doneEl) gsap.set(doneEl, { scale: 1 });
    } else if (j > idx) {
      gsap.set(c, cardRestTransform(j, layout));
    }
    if (j !== idx) p.style.pointerEvents = "none";
  });
  const activeEl = refs.cardRefs.current[idx];
  const activeFlip = refs.flipRefs.current[idx];
  const activePlay = refs.playRefs.current[idx];
  if (activeEl && activeFlip && activePlay) {
    gsap.set(activeEl, { x: (-layout.pw / 2) * layout.fit, y: 0, rotation: 0, scale: layout.fit, opacity: 1 });
    gsap.set(activeFlip, { rotationY: 180 });
    gsap.set(activePlay, { rotationY: 0, opacity: 1 });
    activePlay.style.pointerEvents = "auto";
  }
}

export function buildOpenCardTimeline(
  refs: TutorialDomRefs,
  layout: R83TutorialLayout,
  idx: CardIndex,
  onComplete: () => void,
) {
  const card = refs.cardRefs.current[idx];
  const flip = refs.flipRefs.current[idx];
  const play = refs.playRefs.current[idx];
  const O = TUTORIAL_TIMING.open;
  const tl = gsap.timeline();
  if (!card || !flip || !play) {
    onComplete();
    return tl;
  }
  tl.add(() => {
    TUTORIAL_CARD_INDICES.forEach((j) => {
      const el = refs.cardRefs.current[j];
      if (el) gsap.set(el, { zIndex: j === idx ? 60 : j < idx ? 10 + j : 30 - j });
    });
  }, 0);
  tl.add(() => sfx("card.flip"), 0).add(() => sfx("card.bifold"), O.bifoldAt);
  for (let j = idx + 1; j < 3; j++) {
    const restCard = refs.cardRefs.current[j];
    if (restCard) {
      tl.to(
        restCard,
        {
          ...cardRestTransform(j as CardIndex, layout),
          duration: TUTORIAL_TIMING.tuck.duration,
          ease: TUTORIAL_TIMING.tuck.ease,
        },
        0,
      );
    }
  }
  tl.to(card, { x: 0, y: 0, rotation: 0, scale: layout.fit, opacity: 1, duration: O.toCentre, ease: "power3.inOut" }, 0)
    .to(flip, { rotationY: 180, duration: O.flip, ease: "power2.inOut" }, 0)
    .set(play, { opacity: 1 }, O.pageShowAt)
    .to(play, { rotationY: 0, duration: O.bifold, ease: "power3.out" }, O.bifoldAt)
    .to(card, { x: (-layout.pw / 2) * layout.fit, duration: O.bifold, ease: "power3.out" }, O.bifoldAt)
    .add(() => {
      forceOpenCardDom(refs, layout, idx);
      onComplete();
    }, O.openedAt);
  return tl;
}

export function buildDealTimeline(
  refs: TutorialDomRefs,
  shade: HTMLDivElement | null,
  layout: R83TutorialLayout,
  initialCard: CardIndex,
  onOpened: () => void,
) {
  const D = TUTORIAL_TIMING.deal;
  const tl = gsap.timeline();
  if (shade) tl.to(shade, { backgroundColor: "rgba(17,17,17,.42)", duration: 0.6 }, 0);
  const cards = refs.cardRefs.current.filter((c): c is HTMLElement => c !== null);
  if (cards.length > 0) {
    tl.to(
      cards,
      {
        opacity: 1,
        y: 0,
        scale: layout.s0,
        rotation: (k: number) => FAN_ROTATIONS[k] ?? 0,
        duration: D.duration,
        ease: D.ease,
        stagger: D.stagger,
      },
      0,
    );
  }
  tl.add(buildOpenCardTimeline(refs, layout, initialCard, onOpened), D.duration + D.stagger * 2 + D.afterDeal);
  return tl;
}

export function buildCloseCardTimeline(
  refs: TutorialDomRefs,
  layout: R83TutorialLayout,
  idx: CardIndex,
  onBeforeClose: () => void,
) {
  const card = refs.cardRefs.current[idx];
  const flip = refs.flipRefs.current[idx];
  const play = refs.playRefs.current[idx];
  const doneEl = refs.doneRefs.current[idx];
  const C = TUTORIAL_TIMING.close;
  const tl = gsap.timeline();
  if (!card || !flip || !play) return tl;
  tl.add(() => {
    onBeforeClose();
    play.style.pointerEvents = "none";
    card.classList.add("is-done");
    sfx("card.close");
  }, 0)
    .to(play, { rotationY: -92, duration: C.foldDuration, ease: C.foldEase }, 0)
    .to(card, { x: 0, duration: C.toCentreDuration, ease: "power2.inOut" }, 0)
    .set(play, { opacity: 0 }, C.foldDuration)
    .to(flip, { rotationY: 0, duration: C.flipDuration, ease: C.easeTuck }, C.flipAt)
    .to(card, { ...cardRestTransform(idx, layout), duration: C.flipDuration, ease: C.easeTuck }, C.flipAt);
  if (doneEl) {
    tl.add(() => sfx("card.stamp"), C.flipAt + 0.25); // the green done stamp lands on the card front
    tl.to(doneEl, { scale: 1, duration: 0.55, ease: "back.out(2.2)" }, C.flipAt + 0.25);
  }
  return tl;
}

export function buildExitTimeline(
  refs: TutorialDomRefs,
  shade: HTMLDivElement | null,
  layout: R83TutorialLayout,
  onBeforeClose: () => void,
  onComplete: () => void,
) {
  const vh = typeof window !== "undefined" ? window.innerHeight || 720 : 720;
  const exitTl = gsap.timeline().add(buildCloseCardTimeline(refs, layout, 2, onBeforeClose), 0);
  exitTl.add(() => sfx("card.exit"), TUTORIAL_TIMING.close.duration + TUTORIAL_TIMING.pause * 0.4); // the three cards fly off
  const allCards = refs.cardRefs.current.filter((c): c is HTMLElement => c !== null);
  if (allCards.length > 0) {
    exitTl.to(
      allCards,
      {
        y: -vh,
        rotation: (k: number) => (k % 2 ? TUTORIAL_TIMING.exit.startRotation : -TUTORIAL_TIMING.exit.startRotation),
        duration: TUTORIAL_TIMING.exit.duration,
        ease: TUTORIAL_TIMING.exit.ease,
        stagger: TUTORIAL_TIMING.exit.stagger,
      },
      TUTORIAL_TIMING.close.duration + TUTORIAL_TIMING.pause * 0.4,
    );
  }
  if (shade) {
    exitTl.to(shade, { backgroundColor: "rgba(17,17,17,0)", duration: 0.4 }, TUTORIAL_TIMING.close.duration);
  }
  exitTl.eventCallback("onComplete", onComplete);
  return exitTl;
}
