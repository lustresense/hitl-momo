"use client";
/**
 * Tutorial: three number cards deal in, fan out, and each one in turn flies to the centre, flips and unfolds
 * into a little book (guide page + practice page). A card closes only on its thumb ("aku mengerti"), which is
 * offered after Momo has explained, the practice is done and the student has read for CARD_READ_MS (tutorial-card-gate).
 *
 * One GSAP timeline per step, transform-only. Practice pages use the same Thinman and the same gesture glyphs as the
 * game. The practice canvas is the real DrawingSurface, so the gestures are the drawing screen's gestures.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { gsap } from "gsap";
import { resolveCharacterDisplayName } from "@/src/config/character-tokens";
import { Icon, type IconName } from "../ui/Icon";
import { MomoGuide } from "../momo/MomoGuide";
import { ThinmanArt } from "../ui/ThinmanArt";
import { useHandGesture, useInputMode } from "@/src/hooks/useHandGesture";
import { renderCharacterASideSvg } from "@/src/game/character/character-a-svg";
import { walkT } from "@/src/game/character/pose-math";
import { tutorialCardCopy, tutorialHint, tutorialStep, TUTORIAL_PRACTICE_TOOLS, type TutorialMoment } from "@/src/domain/tutorial-script";
import { useDrawingSurface, type DrawingToolUsed } from "../drawing/hooks/useDrawingSurface";
import type { DrawingSurface } from "@/src/input";
import { getPrefersReducedMotion, subscribePrefersReducedMotion } from "./tutorial-motion";
import { CARD_READ_MS, cardGate, cardPhase, startCardGate, type CardEvent, type CardGate, type CardIndex } from "./tutorial-card-gate";
import { TUTORIAL_TIMING as T } from "./tutorial-timing";
import { tutorialLayout, type TutorialLayout } from "./tutorial-layout";
import { advanceWalkPhase, clampWalk, handWalkTarget, KEY_STEP, WALK_END } from "./tutorial-walk";
import { TutorialThumb } from "./TutorialThumb";
import "./TutorialBrochure.css";

export { CARD_READ_MS } from "./tutorial-card-gate";
export { advanceWalkPhase, TUTORIAL_STRIDE_PCT, WALK_END } from "./tutorial-walk";

interface TutorialBrochureProps {
  onStart(): void;
  /** Kept for the caller's signature. The tutorial has no skip: every card needs its practice. */
  onSkip?: () => void;
  characterDisplayName?: string | null;
}

type Tool = "draw" | "erase";
const CARDS: CardIndex[] = [0, 1, 2];
const FAN_ROT = [-5, 1.5, 5.5];
const EXIT = T.exit;

function computeLayout(): TutorialLayout {
  return tutorialLayout(window.innerWidth, window.innerHeight);
}

function Flag({ waving }: { waving: boolean }) {
  return (
    <svg className={`tut-flag${waving ? " is-waving" : ""}`} viewBox="0 0 60 80" aria-hidden="true" focusable="false">
      <path d="M8 76V6" stroke="#111" strokeWidth="4.5" strokeLinecap="round" />
      <path className="tut-flag__cloth" d="M10 6L52 20L10 36Z" fill="#ef7a37" stroke="#111" strokeWidth="3.4" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Practice page 1: walk Thinman to the flag ---------- */
interface WalkPlaygroundProps {
  onComplete(): void;
  /** Camera mode and card 1 open: a pinch drives Thinman with the hand. */
  live: boolean;
  /** Card 1 open: the arrow keys step Thinman. */
  keys: boolean;
}

function WalkPlayground({ onComplete, live, keys }: WalkPlaygroundProps) {
  const hand = useHandGesture(live);
  const [walk, setWalk] = useState({ pos: 14, phase: 0, facing: 1 });
  const [moved, setMoved] = useState(false);
  const [done, setDone] = useState(false);
  const posRef = useRef(14);
  const doneRef = useRef(false);
  const dragRef = useRef(false);
  const anchorRef = useRef<{ pos: number; x: number } | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  /** Every way of moving Thinman lands here. He stops at the flag and cannot be moved on afterwards. */
  const place = useCallback((target: number) => {
    if (doneRef.current || !Number.isFinite(target)) return;
    const from = posRef.current;
    const next = clampWalk(target);
    if (Math.abs(next - from) <= 0.2 && next < WALK_END) return; // tiny jitter does not move him
    posRef.current = next;
    const dx = next - from;
    setWalk((prev) => ({ pos: next, phase: advanceWalkPhase(prev.phase, dx), facing: dx < 0 ? -1 : 1 }));
    setMoved(true);
    if (next >= WALK_END) {
      posRef.current = WALK_END;
      doneRef.current = true;
      setDone(true);
      completeRef.current();
    }
  }, []);

  const percentOf = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * 100;
  };

  // Hand: the pinch anchors the hand, Thinman follows its travel, and letting go stops him.
  useEffect(() => {
    const cursor = hand.cursor;
    if (!live || doneRef.current || !hand.pinch || !cursor) {
      anchorRef.current = null;
      return;
    }
    if (!anchorRef.current) {
      anchorRef.current = { pos: posRef.current, x: cursor.x };
      return;
    }
    place(handWalkTarget(anchorRef.current.pos, anchorRef.current.x, cursor.x));
  }, [live, hand.pinch, hand.cursor, place]);

  // Keyboard fallback: the arrow keys step him (no key hint on screen).
  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        place(posRef.current + KEY_STEP);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        place(posRef.current - KEY_STEP);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, place]);

  // The real rig walk cycle (same walkT the game's CharacterAnimationAdapter uses), not two alternating poses.
  const pos = walk.pos;
  const walkSvg = moved ? renderCharacterASideSvg(walkT(walk.phase), 0) : "";
  return (
    <div
      className={`tut-scene tut-walk${done ? " is-complete" : ""}`}
      onPointerDown={(event) => {
        if (doneRef.current) return;
        dragRef.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* no capture support: the drag still works while the pointer stays over the scene */
        }
        place(percentOf(event));
      }}
      onPointerMove={(event) => {
        if (dragRef.current) place(percentOf(event));
      }}
      onPointerUp={() => {
        dragRef.current = false;
      }}
      onPointerCancel={() => {
        dragRef.current = false;
      }}
      data-testid="tutorial-walk"
    >
      <div className={`tut-handhint${moved ? " is-gone" : ""}`} aria-hidden="true">
        <Icon name="arrow-left" size={26} stroke={3} />
        <span className="tut-handhint__hand">
          <Icon name="hand-draw" size={44} stroke={2} />
        </span>
        <Icon name="arrow-right" size={26} stroke={3} />
      </div>
      <svg className="tut-walk__ground" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 14Q150 8 300 14T600 12" fill="none" stroke="#111" strokeWidth="6" strokeLinecap="round" />
        <path d="M30 24l-6 10M90 24l-5 9M170 25l-6 10M260 24l-5 10M350 25l-6 9M450 24l-5 10M530 25l-6 9" stroke="#111" strokeWidth="2.6" strokeLinecap="round" opacity=".45" />
      </svg>
      <div className="tut-walk__trail" style={{ width: `${Math.max(0, pos - 14)}%` }} aria-hidden="true" />
      <div className="tut-walk__man" style={{ left: `${pos}%` }} data-testid="tutorial-walk-man" data-walk-phase={walk.phase.toFixed(3)}>
        {moved ? (
          <span className="thinman-art" style={{ display: "block", transform: walk.facing < 0 ? "scaleX(-1)" : undefined }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: walkSvg }} />
        ) : (
          <ThinmanArt pose="stand" />
        )}
      </div>
      <div className="tut-walk__flag">
        <Flag waving={done} />
      </div>
      <span className={`tut-win${done ? " is-on" : ""}`} aria-hidden="true">
        <Icon name="check" size={34} stroke={4} />
      </span>
    </div>
  );
}

/* ---------- Practice page 2: safe vs dangerous ---------- */
function SafetyPlayground() {
  return (
    <div className="tut-scene tut-safety">
      <section className="tut-zone tut-zone--safe" aria-label="Aman dipijak">
        <span className="tut-zone__badge tut-zone__badge--ok">
          <Icon name="check" size={16} stroke={3.6} />
          Aman dipijak
        </span>
        <div className="tut-zone__stage">
          <svg viewBox="0 0 240 240" className="tut-zone__art" aria-hidden="true" focusable="false">
            <path d="M6 204Q120 198 234 204" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" />
            {/* block with brick lines */}
            <g stroke="#111" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
              <rect x="30" y="140" width="92" height="62" rx="4" fill="#d9a066" />
              <path d="M30 171h92M76 140v31M53 171v31M99 171v31" fill="none" strokeWidth="3" />
            </g>
            {/* ladder */}
            <g stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M158 202L170 96M196 202L208 96" />
              <path d="M162 176h36M165 148h36M168 122h36" strokeWidth="3.6" />
            </g>
            {/* plank */}
            <g stroke="#111" strokeWidth="3.6" strokeLinejoin="round">
              <rect x="130" y="206" width="104" height="14" rx="3" fill="#c28a52" transform="translate(-4 -8) rotate(-0.5 180 213)" />
            </g>
          </svg>
          <div className="tut-zone__man tut-zone__man--hop">
            <ThinmanArt pose="hop" />
          </div>
        </div>
      </section>
      <section className="tut-zone tut-zone--danger" aria-label="Kertas sobek">
        <span className="tut-zone__badge tut-zone__badge--bad">
          <Icon name="close" size={16} stroke={3.6} />
          Kertas sobek
        </span>
        <div className="tut-zone__stage">
          <svg viewBox="0 0 240 240" className="tut-zone__art" aria-hidden="true" focusable="false">
            <path d="M6 204Q120 198 234 204" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" />
            {/* spikes: the only danger on this card */}
            <g stroke="#111" strokeWidth="4" strokeLinejoin="round">
              <path d="M16 204l20-70 20 70z" fill="#f0e4cf" />
              <path d="M58 204l20-70 20 70z" fill="#f0e4cf" />
              <path d="M100 204l20-70 20 70z" fill="#f0e4cf" />
            </g>
          </svg>
          <div className="tut-zone__man tut-zone__man--ouch">
            <ThinmanArt pose="ouch" />
          </div>
        </div>
      </section>
      <i className="tut-tear" aria-hidden="true" />
    </div>
  );
}

/* ---------- Practice page 3: gesture practice on the real drawing surface ---------- */
const TOOLS: Array<{ id: (typeof TUTORIAL_PRACTICE_TOOLS)[number]; icon: IconName; label: string; aria: string }> = [
  { id: "draw", icon: "hand-draw", label: "Coret", aria: "Coret, gestur cubit" },
  { id: "erase", icon: "hand-erase", label: "Hapus", aria: "Hapus, gestur kepal" },
  { id: "undo", icon: "hand-undo", label: "Mundur", aria: "Mundur satu goresan, gestur dua jari" },
  { id: "redo", icon: "hand-redo", label: "Maju", aria: "Maju satu goresan, gestur telapak" },
];

interface DrawPlaygroundProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  tool: Tool;
  used: Record<string, boolean>;
  onTool(tool: Tool): void;
  onUndo(): void;
  onRedo(): void;
}

/** The canvas itself draws through DrawingSurface (pointer or hand); this page only shows the canvas and the tools. */
function DrawPlayground({ canvasRef, tool, used, onTool, onUndo, onRedo }: DrawPlaygroundProps) {
  const act = (id: (typeof TOOLS)[number]["id"]) => {
    if (id === "draw" || id === "erase") onTool(id);
    else if (id === "undo") onUndo();
    else onRedo();
  };
  return (
    <div className="tut-scene tut-draw">
      <div className="tut-draw__paper">
        <canvas ref={canvasRef} className="tut-draw__canvas" data-draw-canvas aria-label="Kanvas latihan" />
        {!used.draw && (
          <span className="tut-draw__ghost" aria-hidden="true">
            <Icon name="pencil" size={34} stroke={2.2} />
          </span>
        )}
      </div>
      <div className="tut-tools" role="toolbar" aria-label="Latihan gestur">
        {TOOLS.map((t) => {
          const active = (t.id === "draw" && tool === "draw") || (t.id === "erase" && tool === "erase");
          return (
            <button key={t.id} type="button" className={`nb-tool tut-tool${active ? " is-active" : ""}${used[t.id] ? " is-used" : ""}`} data-tool={t.id} aria-label={t.aria} aria-pressed={t.id === "draw" || t.id === "erase" ? active : undefined} onClick={() => act(t.id)}>
              <Icon name={t.icon} size={30} stroke={2} />
              <span className="nb-tool__label">{t.label}</span>
              <span className="tut-tool__tick" aria-hidden="true">
                <Icon name="check" size={12} stroke={4} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Component ---------- */
export function TutorialBrochure({ onStart, characterDisplayName }: TutorialBrochureProps) {
  const characterName = resolveCharacterDisplayName(characterDisplayName);
  const inputMode = useInputMode();
  const camera = inputMode === "camera";
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const flipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const playRefs = useRef<Array<HTMLElement | null>>([]);
  const layoutRef = useRef<TutorialLayout | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const busyRef = useRef(false);
  // The card whose page is open right now (-1 while none is). Read by timeline callbacks and resize, which
  // cannot see the state of this render.
  const openedRef = useRef<number>(-1);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const reducedRef = useRef(false);

  const [active, setActive] = useState<CardIndex | -1>(-1);
  const activeIndex = useRef<number>(0);
  activeIndex.current = active < 0 ? 0 : active;
  const [open, setOpen] = useState<CardIndex | -1>(-1);

  // One gate for the whole brochure. The ref answers synchronously (a double thumb cannot slip through);
  // the state re-renders the rings and Momo.
  const [gate, setGate] = useState<CardGate>(() => startCardGate(0));
  const gateRef = useRef(gate);
  const send = useCallback((event: CardEvent): boolean => {
    const before = gateRef.current;
    const after = cardGate(before, event);
    if (after === before) return false;
    gateRef.current = after;
    setGate(after);
    return true;
  }, []);
  const phase = cardPhase(gate);
  const [readStartedAt, setReadStartedAt] = useState<number | null>(null);

  const [tool, setTool] = useState<Tool>("draw");
  const [used, setUsed] = useState<Record<string, boolean>>({});
  const mark = useCallback((id: DrawingToolUsed) => setUsed((prev) => (prev[id] ? prev : { ...prev, [id]: true })), []);
  /** A tool counts only for a real change of the drawing, and only while card 3 is open. */
  const onToolUsed = useCallback(
    (id: DrawingToolUsed) => {
      const g = gateRef.current;
      if (g.index !== 2 || !g.opened || g.closing) return;
      mark(id);
    },
    [mark],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<DrawingSurface | null>(null);
  const drawing = useDrawingSurface({ canvasRef, surfaceOut: surfaceRef, initialMode: "pointer", active: open === 2, onToolUsed, fixedEraser: true });
  const { switchMode, undo, redo } = drawing;

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => getPrefersReducedMotion());
  useEffect(() => subscribePrefersReducedMotion(setPrefersReducedMotion), []);
  reducedRef.current = prefersReducedMotion;

  const applyLayout = useCallback(() => {
    const l = computeLayout();
    layoutRef.current = l;
    const root = rootRef.current;
    if (root) {
      root.style.setProperty("--gw", `${l.gw}px`);
      root.style.setProperty("--pw", `${l.pw}px`);
      root.style.setProperty("--oh", `${l.oh}px`);
      root.style.setProperty("--cy", `${l.cy}px`);
    }
    return l;
  }, []);

  /** Where a card rests when it is not the open one: a little numbered stamp in the row at the bottom. */
  const restPose = useCallback((i: number, _current: number, l: TutorialLayout) => {
    return { x: (i - 1) * l.miniGap, y: l.miniY, rotation: 0, scale: l.mini, opacity: 1 };
  }, []);

  /** Card i flies to the centre, flips, then its practice page unfolds. Momo's explanation starts at openedAt. */
  const openTimeline = useCallback(
    (i: CardIndex): gsap.core.Timeline => {
      const l = layoutRef.current!;
      const card = cardRefs.current[i]!;
      const flip = flipRefs.current[i]!;
      const play = playRefs.current[i]!;
      const O = T.open;
      const tl = gsap.timeline();
      tl.add(() => {
        setActive(i);
        cardRefs.current.forEach((c, j) => c && gsap.set(c, { zIndex: j === i ? 60 : j < i ? 10 + j : 30 - j }));
      }, 0);
      // The cards still waiting slide to the right-hand pile.
      for (let j = i + 1; j < 3; j++) {
        const c = cardRefs.current[j];
        if (c) tl.to(c, { ...restPose(j, i, l), duration: T.tuck.duration, ease: T.tuck.ease }, 0);
      }
      tl.to(card, { x: 0, y: 0, rotation: 0, scale: l.fit, opacity: 1, duration: O.toCentre, ease: "power3.inOut" }, 0)
        .to(flip, { rotationY: 180, duration: O.flip, ease: "power2.inOut" }, 0)
        .set(play, { opacity: 1 }, O.pageShowAt)
        .to(play, { rotationY: 0, duration: O.bifold, ease: "power3.out" }, O.bifoldAt)
        .to(card, { x: (-l.pw / 2) * l.fit, duration: O.bifold, ease: "power3.out" }, O.bifoldAt)
        .add(() => {
          openedRef.current = i;
          setOpen(i);
          send({ type: "OPENED", index: i });
        }, O.openedAt);
      // The practice canvas is sized once the page is flat and at its final scale.
      if (i === 2) tl.add(() => surfaceRef.current?.resizeForDpr(), O.canvasSizedAt);
      return tl;
    },
    [restPose, send],
  );

  /** The open book folds shut in one step and joins the done pile. */
  const closeTimeline = useCallback(
    (i: CardIndex): gsap.core.Timeline => {
      const l = layoutRef.current!;
      const card = cardRefs.current[i]!;
      const flip = flipRefs.current[i]!;
      const play = playRefs.current[i]!;
      const C = T.close;
      const tl = gsap.timeline();
      tl.add(() => {
        openedRef.current = -1;
        setOpen(-1);
      }, 0);
      tl.to(play, { rotationY: -92, duration: C.duration, ease: C.ease }, 0)
        .set(play, { opacity: 0 }, C.duration)
        .to(flip, { rotationY: 0, duration: C.duration, ease: C.ease }, 0)
        .to(card, { ...restPose(i, i + 1, l), duration: C.duration, ease: C.ease }, 0);
      return tl;
    },
    [restPose],
  );

  /** Close card `from` (its thumb was confirmed), pause, then open the next card. Card 3 leaves and the level list follows. */
  const goNext = useCallback(
    (from: CardIndex) => {
      if (busyRef.current) return;
      busyRef.current = true;
      // When the whole step has ended, measure the practice canvas again if card 3 is the open page. A resize
      // during the turn was skipped by onResize, and a measure taken mid-turn reads a transformed box.
      const tl = gsap.timeline({
        onComplete: () => {
          busyRef.current = false;
          if (openedRef.current === 2) surfaceRef.current?.resizeForDpr();
        },
      });
      timelineRef.current = tl;
      const at = T.close.duration + T.pause;
      tl.add(closeTimeline(from), 0);
      if (from < 2) {
        const next = (from + 1) as CardIndex;
        tl.add(() => send({ type: "START", index: next }), T.close.duration);
        tl.add(openTimeline(next), at);
      } else {
        const cards = cardRefs.current.filter(Boolean) as HTMLElement[];
        tl.to(cards, { y: -window.innerHeight, rotation: (i: number) => (i % 2 ? EXIT.startRotation : -EXIT.startRotation), duration: EXIT.duration, ease: EXIT.ease, stagger: EXIT.stagger }, at).add(
          () => onStartRef.current(),
          at + EXIT.duration + EXIT.stagger * 2,
        );
      }
    },
    [closeTimeline, openTimeline, send],
  );

  // Deal in, fan out, open the first card.
  useLayoutEffect(() => {
    const l = applyLayout();
    const cards = cardRefs.current as HTMLElement[];
    const plays = playRefs.current as HTMLElement[];
    const D = T.deal;
    gsap.set(plays, { transformPerspective: 1800, transformOrigin: "0% 50%", rotationY: -92, opacity: 0 });
    gsap.set(flipRefs.current as HTMLElement[], { rotationY: 0 });
    gsap.set(cards, { scale: l.s0 * 0.9, x: (i: number) => (i - 1) * l.gap, y: -l.vh * D.fromAboveVh, rotation: 0, opacity: 0, zIndex: (i: number) => 30 - i });
    const tl = gsap.timeline();
    timelineRef.current = tl;
    tl.to(cards, { opacity: 1, y: 0, scale: l.s0, rotation: (i: number) => FAN_ROT[i]!, duration: D.duration, ease: D.ease, stagger: D.stagger }).add(openTimeline(0), `+=${D.afterDeal}`);
    const onResize = () => {
      if (busyRef.current || timelineRef.current?.isActive()) return;
      const next = applyLayout();
      const current = activeIndex.current;
      cardRefs.current.forEach((c, i) => {
        if (!c) return;
        if (i === current) gsap.set(c, { scale: next.fit, x: (-next.pw / 2) * next.fit });
        else gsap.set(c, restPose(i, current, next));
      });
      // The canvas is sized from its transformed box: measure it again at the new fit scale.
      if (openedRef.current === 2) surfaceRef.current?.resizeForDpr();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      tl.kill();
      timelineRef.current?.kill();
    };
    // Mount-only: the timeline owns the choreography afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera: the practice canvas draws with the hand while card 3 is open; otherwise (and in fallback) the pointer.
  useEffect(() => {
    void switchMode(open === 2 && camera ? "hand" : "pointer");
  }, [open, camera, switchMode]);

  // The read time: starts once Momo and the practice are both done; the thumb is offered when it ends.
  useEffect(() => {
    if (phase !== "reading") {
      setReadStartedAt(null);
      return;
    }
    const index = gate.index;
    setReadStartedAt(Date.now());
    const timer = window.setTimeout(() => send({ type: "READ_DONE", index }), CARD_READ_MS);
    return () => window.clearTimeout(timer);
  }, [phase, gate.index, send]);

  // Card 3 is practised once all four tools have really changed the drawing.
  useEffect(() => {
    if (gate.index === 2 && TUTORIAL_PRACTICE_TOOLS.every((id) => used[id])) send({ type: "PRACTICE_DONE", index: 2 });
  }, [used, gate.index, send]);

  const onWalkComplete = useCallback(() => {
    send({ type: "PRACTICE_DONE", index: 0 });
  }, [send]);

  // Momo guides each card. While a card is folding shut the last thing she said stays (no flicker back to the start).
  const momentRef = useRef<TutorialMoment>("deal");

  /** Momo explained the card (her explanation lines, not the follow-up line after the practice). */
  const onMomoDone = () => {
    if (momentRef.current === "walk" || momentRef.current === "safety" || momentRef.current === "gesture") {
      send({ type: "MOMO_DONE", index: gateRef.current.index });
    }
  };

  const moment: TutorialMoment = momentFor(open, gate, momentRef.current);
  momentRef.current = moment;

  const confirm = (i: CardIndex) => {
    if (send({ type: "THUMB", index: i })) goNext(i);
  };

  return (
    <div ref={rootRef} className="tutorial-prototype-root tut" data-active={active}>
      <main className="tut-stage" aria-label="Tutorial tiga kartu">
        {CARDS.map((i) => {
          const copy = tutorialCardCopy(i, characterName);
          const hint = tutorialHint(i, camera, i === gate.index ? gate.practiceDone : true);
          const current = gate.index === i;
          const unlocked = current && open === i && phase === "ackEligible";
          return (
            <article
              key={i}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={`tut-card tutorial-card-${i + 1}${active === i ? " is-focused" : ""}${open === i ? " is-open" : ""}${active > i ? " is-done" : ""}`}
              data-index={i}
              aria-label={`Kartu tutorial ${i + 1}`}
            >
              <div
                ref={(el) => {
                  flipRefs.current[i] = el;
                }}
                className="tut-flip"
              >
                <section className="tut-face tut-front">
                  <span className="tut-front__stitch" aria-hidden="true" />
                  <span className="tut-front__number">{i + 1}</span>
                  <span className="tut-front__done" aria-hidden="true">
                    <Icon name="check" size={20} stroke={4} />
                  </span>
                </section>
                <section className="tut-face tut-back guide-panel">
                  <div className="tut-steps" aria-label={`Langkah ${i + 1} dari 3`}>
                    {[0, 1, 2].map((s) => (
                      <i key={s} className={s === i ? "is-now" : s < i ? "is-done" : ""} />
                    ))}
                  </div>
                  <h2 className="guide-title">{copy.title}</h2>
                  <p className="guide-copy">{copy.copy}</p>
                  <p className="tut-gesture">
                    <Icon name={hint.icon} size={22} stroke={2.4} />
                    <span>{hint.text}</span>
                  </p>
                  {/* The thumb is always on the card. Locked (grey, with a lock) until Momo, the practice and the read
                      time are done; then it is the real thumb. Card 3 reads the thumbs-up of the drawing surface. */}
                  <div className="brochure-cta brochure-cta--thumb" onClick={(event) => event.stopPropagation()}>
                    <TutorialThumb
                      testId={`tutorial-thumb-${i + 1}`}
                      holdMs={copy.holdMs}
                      label={copy.cta}
                      locked={!unlocked}
                      lockedLabel={current && gate.practiceDone ? "Baca dulu, ya" : "Coba dulu, ya"}
                      readStartedAt={current ? readStartedAt : null}
                      externalThumbUp={i === 2 ? drawing.handPose === "thumb-up" : undefined}
                      onConfirm={() => confirm(i)}
                    />
                  </div>
                </section>
              </div>
              <section
                ref={(el) => {
                  playRefs.current[i] = el;
                }}
                className="tut-play play-panel"
              >
                {i === 0 && <WalkPlayground onComplete={onWalkComplete} live={camera && open === 0 && !gate.practiceDone} keys={open === 0} />}
                {i === 1 && <SafetyPlayground />}
                {i === 2 && (
                  <DrawPlayground
                    canvasRef={canvasRef}
                    tool={tool}
                    used={used}
                    onTool={(next) => {
                      setTool(next);
                      surfaceRef.current?.setErasing(next === "erase");
                    }}
                    onUndo={() => undo()}
                    onRedo={() => redo()}
                  />
                )}
              </section>
            </article>
          );
        })}
      </main>
      <MomoGuide step={tutorialStep(moment, characterName, camera)} startDelay={moment === "deal" ? 900 : 250} onDone={onMomoDone} testId="tutorial-momo" />
    </div>
  );
}

/** Momo's moment: the card she is explaining, or the follow-up once the card's practice and her explanation are done. */
function momentFor(open: CardIndex | -1, gate: CardGate, last: TutorialMoment): TutorialMoment {
  if (open < 0) return last; // deal, or a card folding shut: keep what she last said
  const followUp = gate.momoDone && gate.practiceDone;
  if (open === 0) return followUp ? "walk-done" : "walk";
  if (open === 1) return "safety";
  return followUp ? "gesture-done" : "gesture";
}
