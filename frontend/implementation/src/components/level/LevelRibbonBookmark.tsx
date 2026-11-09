"use client";
/**
 * Level select: three bookmarks hang from the sketchbook's spiral binding.
 *   open   = orange, ready to pull      done   = green with a check      locked = grey, short, with a padlock
 * Pull a ribbon down by its ring (mouse drag for now; the NUI thumb gesture maps to the same pull later).
 * While pulling, the ribbon "clicks" every notch (tek, tek). Past the last notch the ring turns green; on
 * release (or a 2 s thumb on the next ribbon, PRD 0.0.16 R6) the ribbon bounces up and the book opens.
 * A click or Enter does the same pull by itself so nobody is stuck without a drag.
 * The ribbon that a win has just unlocked plays its own unlock animation when this page opens.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import type { LevelDefinition } from "@/src/domain/levels";
import { consumeFreshUnlock, isStageCompleted, nextStageToPlay } from "@/src/app/level-progress";
import { Icon } from "../ui/Icon";
import { ThumbConfirm } from "../ui/ThumbConfirm";

export interface LevelRibbonBookmarkProps {
  levels: LevelDefinition[];
  onSelectLevel: (level: LevelDefinition) => void;
  isLevelUnlocked?: (stage: number) => boolean;
}

/** Pull distance (px) per "tek" notch, and notches needed to arm the ribbon. */
export const NOTCH_PX = 38;
export const NOTCHES_TO_ARM = 4;
const PULL_MAX = 230;
const LOCK_RESIST = 0.07;
const LOCK_MAX = 12;
const TAIL = 44;
const SHADOW = 7;
/** Offset of each ribbon's shadow; the ribbon's svg is this much wider than the ribbon. */
export const RIBBON_SHADOW = SHADOW;
/** Narrowest ribbon that still fits "Pembuktian" (the longest label) beside its edge. */
export const MIN_RIBBON_W = 84;
/** Width of the "Mulai Bab n" thumb pill under the next ribbon (ThumbConfirm, 14px text). It can be wider than a ribbon. */
export const THUMB_PILL_W = 124;
/** Below this ribbon width the CSS inset of the label (36px) leaves too little room, so the label gets 8px. */
const NARROW_RIBBON_W = 120;
/** .bm-page side padding (98-kit-flow.css). */
const PAGE_GUTTER = 16;
/** Clear space kept on each side of the shelf for the pull notches and the ring (the old 2 * 14). */
const NOTCH_ROOM = 14;

type Dims = { w: number; h: number };
export interface ShelfDims extends Dims {
  /** Ribbons per row: all of them when one row keeps a readable label, else two per row. */
  perRow: number;
}

/** Gap between ribbons on the shelf, as the CSS in 98-kit-flow.css: 14px up to 600px wide, else clamp(26px, 5vw, 76px). */
export function shelfGap(width: number): number {
  if (width <= 600) return 14;
  return Math.min(76, Math.max(26, width * 0.05));
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * Ribbon size for a screen. A row must fit the page: its ribbons, their shadows, the gaps, and the thumb pill under
 * the next ribbon (the pill can be the widest item of its row). When four ribbons cannot keep a readable label in
 * one row, they wrap to two rows and get shorter, so the page stays near one screen tall. Pure, so tests can check
 * the arithmetic at any width.
 */
export function shelfLayout(count: number, viewportWidth: number, viewportHeight: number): ShelfDims {
  const gap = shelfGap(viewportWidth);
  const room = viewportWidth - 2 * PAGE_GUTTER - 2 * NOTCH_ROOM;
  // Widest ribbon when `n` ribbons share a row: the n ribbons take n-1 gaps and n shadows, and the thumb pill
  // stands in for one ribbon. Both limits must hold: n ribbons fit, and (n-1) ribbons plus the pill fit.
  const widestInRow = (n: number) => {
    const budget = room - gap * (n - 1) - RIBBON_SHADOW * n;
    return Math.floor(Math.min(budget / n, (budget - THUMB_PILL_W) / Math.max(1, n - 1)));
  };
  const perRow = widestInRow(count) >= MIN_RIBBON_W ? count : Math.min(count, 2);
  const rows = Math.ceil(count / perRow);
  const h = Math.round(rows > 1 ? clamp(viewportHeight * 0.42, 250, 330) : clamp(viewportHeight * 0.58, 290, 470));
  const w = Math.round(Math.min(184, h * 0.4, widestInRow(perRow)));
  return { w, h, perRow };
}

/** The shelf for the current window; a fixed size where there is no window (server render). */
function currentShelf(count: number): ShelfDims {
  if (typeof window === "undefined") return { w: 176, h: 430, perRow: count };
  return shelfLayout(count, window.innerWidth, window.innerHeight);
}

const outerPath = (w: number, l: number) => `M3 3H${w - 3}V${l - 3}L${w / 2} ${l - 3 - TAIL}L3 ${l - 3}Z`;
const stitchPath = (w: number, l: number) => `M15 15H${w - 15}V${l - 15}L${w / 2} ${l - 15 - TAIL + 9}L15 ${l - 15}Z`;

type SlotState = "open" | "done" | "locked";

interface BookmarkProps {
  level: LevelDefinition;
  state: SlotState;
  isNext: boolean;
  dims: Dims;
  /** Play the lock-breaking animation once. */
  unlocking: boolean;
  onLaunch: (level: LevelDefinition) => void;
  onLockedTug: (level: LevelDefinition) => void;
  onNotch: (count: number) => void;
}

function stageName(level: LevelDefinition): string {
  const part = level.title.split("·")[1];
  return (part ?? level.title).trim();
}

function Bookmark({ level, state, isNext, dims, unlocking, onLaunch, onLockedTug, onNotch }: BookmarkProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const lenState = useRef({ length: 0 });
  const busy = useRef(false);
  const drag = useRef<{ startY: number; raw: number; id: number; notch: number; armed: boolean } | null>(null);
  const suppressClick = useRef(false);
  const locked = state === "locked";
  // A locked ribbon hangs shorter, like a rolled-up scroll.
  const restLength = locked ? Math.round(dims.h * 0.66) : dims.h;

  const paint = useCallback(
    (length: number) => {
      const btn = btnRef.current;
      if (!btn) return;
      const { w } = dims;
      lenState.current.length = length;
      btn.style.setProperty("--bm-len", `${length}px`);
      const svg = btn.querySelector<SVGSVGElement>(".bm-shape");
      if (!svg) return;
      svg.setAttribute("viewBox", `0 0 ${w + SHADOW} ${length + SHADOW}`);
      svg.setAttribute("height", String(length + SHADOW));
      svg.querySelectorAll<SVGPathElement>(".bm-outer").forEach((p) => p.setAttribute("d", outerPath(w, length)));
      svg.querySelector<SVGPathElement>(".bm-stitch")?.setAttribute("d", stitchPath(w, length));
    },
    [dims],
  );

  // Keep geometry in sync with state/dimension changes (locked ribbons are shorter).
  useLayoutEffect(() => {
    gsap.killTweensOf(lenState.current);
    paint(restLength);
  }, [paint, restLength]);

  // Lock-breaking: the shackle jolts, the ribbon unrolls with a spring, then a burst ring.
  useEffect(() => {
    if (!unlocking || !btnRef.current) return;
    const btn = btnRef.current;
    const tl = gsap.timeline();
    tl.to(btn, { x: -6, duration: 0.06 }).to(btn, { x: 6, duration: 0.07 }).to(btn, { x: -4, duration: 0.06 }).to(btn, { x: 0, duration: 0.06 });
    return () => {
      tl.kill();
    };
  }, [unlocking]);
  useEffect(() => {
    if (state === "locked" || !unlocking) return;
    const from = Math.round(dims.h * 0.66);
    paint(from);
    gsap.to(lenState.current, { length: dims.h, duration: 0.9, ease: "elastic.out(1, 0.45)", onUpdate: () => paint(lenState.current.length) });
  }, [state, unlocking, dims.h, paint]);

  useEffect(() => () => {
    gsap.killTweensOf(lenState.current);
    if (btnRef.current) gsap.killTweensOf(btnRef.current);
  }, []);

  /**
   * PRD 0.0.16 R6: the confirmed ribbon snaps taut, then bounces UP (GSAP y negative + back.out) and the book
   * opens into the world (BookFlip, owned by the app shell, starts when onLaunch fires).
   */
  const launch = useCallback(() => {
    const btn = btnRef.current;
    if (!btn || busy.current) return;
    busy.current = true;
    const len = lenState.current;
    gsap.killTweensOf(len);
    const tl = gsap.timeline();
    tl.to(len, { length: restLength + 24, duration: 0.12, ease: "power2.out", onUpdate: () => paint(len.length) })
      .to(len, { length: restLength, duration: 0.18, ease: "power1.in", onUpdate: () => paint(len.length) });
    tl.fromTo(btn, { y: 0 }, { y: -Math.round(dims.h * 0.22), duration: 0.42, ease: "back.out(2.2)" }, 0.12)
      .to(btn, { y: 0, duration: 0.5, ease: "bounce.out" }, 0.62);
    tl.add(() => onLaunch(level), 0.5);
    tl.add(() => {
      busy.current = false;
    }, 1.15);
  }, [dims.h, level, onLaunch, paint, restLength]);

  /** A click: pull by itself, ticking through the notches like a real pull. */
  const autoPull = useCallback(() => {
    if (busy.current) return;
    const len = lenState.current;
    gsap.killTweensOf(len);
    const target = restLength + NOTCHES_TO_ARM * NOTCH_PX;
    let ticked = 0;
    gsap.to(len, {
      length: target,
      duration: 0.42,
      ease: "power1.inOut",
      onUpdate: () => {
        paint(len.length);
        const n = Math.floor((len.length - restLength) / NOTCH_PX);
        if (n > ticked) {
          ticked = n;
          onNotch(n);
        }
      },
      onComplete: launch,
    });
  }, [launch, onNotch, paint, restLength]);

  const begin = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (busy.current || drag.current) return;
    gsap.killTweensOf(lenState.current);
    drag.current = { startY: event.clientY, raw: 0, id: event.pointerId, notch: 0, armed: false };
    suppressClick.current = false;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture may be refused */
    }
    btnRef.current?.classList.add("is-pulling");
  };

  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    d.raw = Math.max(0, event.clientY - d.startY);
    if (d.raw > 4) suppressClick.current = true;
    const pull = locked
      ? Math.min(d.raw * LOCK_RESIST, LOCK_MAX)
      : Math.min(PULL_MAX, d.raw <= 40 ? d.raw : 40 + (d.raw - 40) * 0.8);
    paint(restLength + pull);
    if (!locked) {
      const n = Math.min(NOTCHES_TO_ARM, Math.floor(d.raw / NOTCH_PX));
      if (n !== d.notch) {
        if (n > d.notch) {
          onNotch(n);
          const el = btnRef.current;
          if (el) gsap.fromTo(el, { scaleX: 1.045 }, { scaleX: 1, duration: 0.22, ease: "back.out(3)", transformOrigin: "50% 0%" });
        }
        d.notch = n;
        if (btnRef.current) btnRef.current.dataset.notch = String(n);
      }
      const armed = n >= NOTCHES_TO_ARM;
      if (armed !== d.armed) {
        d.armed = armed;
        btnRef.current?.classList.toggle("is-armed", armed);
      }
    }
  };

  const end = (event: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    btnRef.current?.classList.remove("is-pulling", "is-armed");
    if (btnRef.current) delete btnRef.current.dataset.notch;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* already released */
    }
    const len = lenState.current;
    if (locked) {
      gsap.to(len, { length: restLength, duration: 0.5, ease: "elastic.out(1, 0.5)", onUpdate: () => paint(len.length) });
      if (!cancelled && d.raw > 6 && btnRef.current) {
        gsap.timeline().to(btnRef.current, { x: -8, duration: 0.07 }).to(btnRef.current, { x: 8, duration: 0.08 }).to(btnRef.current, { x: -5, duration: 0.07 }).to(btnRef.current, { x: 0, duration: 0.06 });
        onLockedTug(level);
      }
      return;
    }
    if (!cancelled && d.notch >= NOTCHES_TO_ARM) launch();
    else gsap.to(len, { length: restLength, duration: 0.9, ease: "elastic.out(1, 0.4)", onUpdate: () => paint(len.length) });
  };

  const click = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (locked) {
      onLockedTug(level);
      if (btnRef.current) gsap.timeline().to(btnRef.current, { x: -7, duration: 0.07 }).to(btnRef.current, { x: 7, duration: 0.08 }).to(btnRef.current, { x: 0, duration: 0.07 });
      return;
    }
    autoPull();
  };

  const name = stageName(level);
  const label = `Level ${level.stage}, ${name}${locked ? ", terkunci" : state === "done" ? ", sudah selesai" : ""}`;

  return (
    <div ref={slotRef} className={`bm-slot bm-${state}${isNext ? " is-next" : ""}${unlocking ? " is-unlocking" : ""}`} data-stage={level.stage}>
      <span className="bm-ring-clip" aria-hidden="true" />
      <button
        ref={btnRef}
        type="button"
        className={`bm-ribbon level-card ${locked ? "is-locked" : "is-playable"}`}
        style={{ width: dims.w, "--bm-w": `${dims.w}px` } as React.CSSProperties}
        data-testid={`level-card-${level.stage}`}
        data-level-id={`level-${level.stage}`}
        data-stage={level.stage}
        data-state={state}
        aria-label={label}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onClick={click}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (locked) onLockedTug(level);
          else autoPull();
        }}
      >
        <span className="bm-body">
        <svg className="bm-shape" width={dims.w + SHADOW} viewBox={`0 0 ${dims.w + SHADOW} ${restLength + SHADOW}`} aria-hidden="true" focusable="false">
          <path className="bm-outer bm-outer--shadow" d={outerPath(dims.w, restLength)} transform={`translate(${SHADOW} ${SHADOW})`} />
          <path className="bm-outer bm-outer--body" d={outerPath(dims.w, restLength)} />
          <path className="bm-stitch" d={stitchPath(dims.w, restLength)} />
        </svg>
        <span className="bm-content">
          <span className="bm-tag">Bab</span>
          <span className="bm-number">{level.stage}</span>
          <span className="bm-name" style={dims.w < NARROW_RIBBON_W ? { maxWidth: dims.w - 8 } : undefined}>
            {name}
          </span>
          <span className="bm-badge" aria-hidden="true">
            {locked ? <Icon name="lock" size={24} stroke={2.6} /> : state === "done" ? <Icon name="check" size={26} stroke={3.4} /> : <Icon name="play" size={22} stroke={2.4} fill="currentColor" />}
          </span>
        </span>
        <span className="bm-ring" aria-hidden="true">
          <Icon name="arrow-down" size={20} stroke={3.2} />
        </span>
        <span className="bm-notches" aria-hidden="true">
          {Array.from({ length: NOTCHES_TO_ARM }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        </span>
      </button>
      {isNext && (
        <ThumbConfirm
          holdMs={2000}
          onConfirm={launch}
          label={`Mulai Bab ${level.stage}`}
          className="bm-thumb"
          testId={`level-thumb-${level.stage}`}
        />
      )}
    </div>
  );
}

export function LevelRibbonBookmark({ levels, onSelectLevel, isLevelUnlocked }: LevelRibbonBookmarkProps) {
  const [dims, setDims] = useState<ShelfDims>(() => currentShelf(levels.length));
  const [status, setStatus] = useState("");
  const [freshStage] = useState(() => consumeFreshUnlock());
  const [revealed, setRevealed] = useState(freshStage === null);
  const notchTick = useRef(0);

  useEffect(() => {
    const onResize = () => setDims(currentShelf(levels.length));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [levels.length]);

  // The ribbon a win just unlocked stays locked for a beat, then breaks open.
  useEffect(() => {
    if (freshStage === null) return;
    const id = window.setTimeout(() => setRevealed(true), 750);
    return () => window.clearTimeout(id);
  }, [freshStage]);

  const stages = useMemo(() => levels.map((l) => l.stage), [levels]);
  const nextStage = nextStageToPlay(stages);
  const allDone = stages.every((s) => isStageCompleted(s));

  const onNotch = useCallback((count: number) => {
    notchTick.current = count;
    try {
      navigator.vibrate?.(6);
    } catch {
      /* haptics are optional */
    }
  }, []);

  const onLockedTug = useCallback((level: LevelDefinition) => {
    setStatus(`Selesaikan Bab ${level.stage - 1} dulu`);
  }, []);

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(""), 2400);
    return () => window.clearTimeout(id);
  }, [status]);

  return (
    <section className="level-ribbon-page bm-page" aria-label="Pilih bab cerita">
      <div className="bm-brand">
        <span className="bm-brand__mark" aria-hidden="true" />
        Sketchbook Universe
      </div>
      <div className="bm-binding" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      {/* Wraps to a second row on phones (see shelfLayout); on wide screens every ribbon stays in one row. */}
      <div className="bm-shelf level-list" role="group" aria-label="Daftar level" data-testid="level-list" style={{ flexWrap: "wrap", rowGap: 24 }}>
        {levels.map((level) => {
          const open = isLevelUnlocked ? isLevelUnlocked(level.stage) : level.stage === 1;
          const fresh = freshStage === level.stage;
          const locked = !open || (fresh && !revealed);
          const state: SlotState = locked ? "locked" : isStageCompleted(level.stage) ? "done" : "open";
          return (
            <Bookmark
              key={level.levelId}
              level={level}
              state={state}
              isNext={!locked && nextStage === level.stage}
              dims={dims}
              unlocking={fresh && revealed}
              onLaunch={onSelectLevel}
              onLockedTug={onLockedTug}
              onNotch={onNotch}
            />
          );
        })}
      </div>
      <div className="bm-foot">
        <h2 className="bm-title">
          <Icon name={allDone ? "star" : "pull-down"} size={26} stroke={2.8} fill={allDone ? "currentColor" : "none"} />
          {allDone ? "Semua bab selesai" : "Pilih bab"}
        </h2>
        <div className="bm-status" role="status" aria-live="polite">
          {status && (
            <span className="nb-chip">
              <span className="nb-chip__badge" style={{ background: "var(--nb-orange)", color: "var(--nb-ink)" }}>
                <Icon name="lock" size={12} stroke={3} />
              </span>
              {status}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
