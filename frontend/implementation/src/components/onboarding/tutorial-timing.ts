/**
 * Choreography timings of the tutorial brochure, in seconds (GSAP). Deal, open, flip and bifold are the 9f9d35d
 * values; the close is 1.0 s and the pause before the next card is 1.1 s (R4). These are production values:
 * tests use fake timers, not shorter numbers, and reduced motion does not speed the timelines up.
 */
export const TUTORIAL_TIMING = {
  deal: { duration: 0.95, ease: "back.out(1.25)", stagger: 0.13, afterDeal: 0.3, fromAboveVh: 0.6 },
  tuck: { duration: 0.75, ease: "power3.inOut" },
  open: {
    toCentre: 0.95,
    flip: 0.95,
    bifold: 0.8,
    bifoldAt: 0.88,
    /** When the practice page becomes visible (it is still folded). */
    pageShowAt: 0.9,
    /** When the practice page is fully flat and the card is open: the card's Momo speech starts here. */
    openedAt: 1.45,
    /** When the practice canvas is flat and can be sized to its final pixels. */
    canvasSizedAt: 1.7,
  },
  close: { duration: 1.0, ease: "power2.out" },
  /** Pause between a card closing and the next one opening. */
  pause: 1.1,
  exit: { duration: 0.6, ease: "power2.in", stagger: 0.07, startRotation: 8 },
} as const;
