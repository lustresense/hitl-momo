"use client";
/**
 * Level intro. The book has just opened onto Thinman's world (BookFlip, PRD 0.0.16 R6; no falling page). Momo flies
 * in at once and tells the story in short beats: a beat is a few lines about one thing, Thinman or the gap ahead,
 * and Momo glides to that spot while she talks. The stage is dark except for the spot she talks about. Only after
 * her last line and its reading pause does the "Aku mengerti" thumb appear; it lifts Momo and the camera up into
 * the sky, where the drawing page is. The drawing page's picture cards are not part of the intro any more.
 *
 * The drawing screen is already mounted underneath with the same sky, so the last frame of the camera move
 * and the first frame of the drawing page are identical (no fade, no jump). "Lewati cerita" ends it at once.
 *
 * NUI: the thumb follows the drawing page's own hand reader while that page runs one, so the intro never
 * starts a second tracker on the camera.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import type { LevelDefinition } from "@/src/domain/levels";
import { introLines, nudgeLines, NUDGE_TO_SKY } from "@/src/domain/world-intro-script";
import { MomoChat } from "../momo/MomoChat";
import { StageWorld } from "../stage-preview/StageWorld";
import { getStageGeometry } from "@/src/game/stage-geometry";
import type { SceneIndex } from "../stage-preview/scene-metadata";
import { DwellButton } from "../ui/DwellButton";
import { Icon } from "../ui/Icon";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import { ThinmanArt } from "../ui/ThinmanArt";
import { CloudBand } from "../ui/SkyBackdrop";
import { usePageThumb } from "./use-page-thumb";
import "./level-nui.css";
import "./level-intro.css";

/** Momo's first line waits this long after the book opens, so the bubble starts as she lands (not a silence). */
export const STORY_START_MS = 1500;
/** The BookFlip open takes about this long; Momo arrives once the page is visible. */
export const BOOK_OPEN_MS = 900;
/** Momo's fly-in, the same at normal and reduced motion. */
const FLY_IN_S = 0.95;
/** Momo's glide between the things she talks about. */
const GLIDE_S = 1.1;
/** The dark stage opens its spot on the next thing she talks about. */
const SPOT_S = 0.9;

type Phase = "drop" | "story" | "nudge" | "rise";
/** The camera column is three screens tall: clean sky on top, a band of clouds, then the world. */
const CAMERA_START = -66.6667;
/** What a line is about: Thinman, or the gap and the goal ahead. Null = general, no spot, Momo stays. */
type Focus = "thinman" | "ahead";

/**
 * Focus per story line, by index into introLines(). Keep in step with SCRIPT in world-intro-script.ts.
 * Line 0 of level 3 is about the hazard ahead, so Momo flies to the gap first there.
 */
const STORY_FOCUS: Record<1 | 2 | 3, Focus[]> = {
  1: ["thinman", "thinman", "ahead"],
  2: ["thinman", "thinman", "ahead"],
  3: ["ahead", "thinman", "thinman", "ahead"],
};
/** Focus per nudge line, by index into [...nudgeLines(), NUDGE_TO_SKY]. The sky line is general. */
const NUDGE_FOCUS: Array<Focus | null> = [null, "ahead", null];

type Kind = "story" | "nudge";
export interface Beat {
  kind: Kind;
  focus: Focus | null;
  lines: string[];
}

/** Consecutive lines about the same thing share one bubble, so Momo glides once per topic. */
export function buildBeats(stage: number, characterDisplayName?: string | null): Beat[] {
  const key = (stage >= 1 && stage <= 3 ? stage : 1) as 1 | 2 | 3;
  const story = introLines(stage, characterDisplayName).map((text, i) => ({ kind: "story" as Kind, focus: STORY_FOCUS[key][i] ?? "thinman", text }));
  const nudge = [...nudgeLines(stage, characterDisplayName), NUDGE_TO_SKY].map((text, i) => ({ kind: "nudge" as Kind, focus: NUDGE_FOCUS[i] ?? null, text }));
  const beats: Beat[] = [];
  for (const item of [...story, ...nudge]) {
    const last = beats[beats.length - 1];
    if (last && last.kind === item.kind && last.focus === item.focus) last.lines.push(item.text);
    else beats.push({ kind: item.kind, focus: item.focus, lines: [item.text] });
  }
  return beats;
}

export interface LevelIntroProps {
  level: LevelDefinition;
  characterDisplayName?: string | null;
  /** The camera arrived in the sky: the drawing page underneath may show now. */
  onReveal?: () => void;
  /** The intro is gone: hand over to the drawing page. */
  onFinish: () => void;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Where Momo's box should sit (screen px) to talk about a focus. Null = she stays where she is. */
function momoSpot(root: HTMLElement, focus: Focus | null): { left: number; top: number } | null {
  if (!focus) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Momo's box is at most 480 px wide and keeps 12 px from the right edge.
  const maxLeft = Math.max(12, vw - Math.min(480, vw - 56) - 12);
  if (focus === "thinman") {
    const rect = root.querySelector<HTMLElement>(".intro-thinman")?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      // Hovering just above and to the right of Thinman, on the left cliff, so she does not cover him.
      return { left: clamp(rect.left - 150, 12, maxLeft), top: clamp(rect.top - 300, 12, Math.max(12, vh - 340)) };
    }
    return { left: Math.round(vw * 0.16), top: Math.round(vh * 0.34) };
  }
  // The gap and the goal: Momo moves right, up in the sky, pointing down at them.
  return { left: clamp(Math.round(vw * 0.5), 12, maxLeft), top: Math.round(vh * 0.2) };
}

/** The lit patch of the stage (screen px): round Thinman, or the gap ahead. Radius 0 = the whole stage is dark. */
function litSpot(root: HTMLElement, focus: Focus | null): { x: number; y: number; r: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (focus === "thinman") {
    const rect = root.querySelector<HTMLElement>(".intro-thinman")?.getBoundingClientRect();
    if (rect && rect.width > 0) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: Math.max(110, Math.round(vh * 0.22)) };
    return { x: vw * 0.2, y: vh * 0.8, r: Math.max(110, Math.round(vh * 0.22)) };
  }
  if (focus === "ahead") return { x: vw * 0.62, y: vh * 0.8, r: Math.max(140, Math.round(vw * 0.2)) };
  return { x: vw * 0.5, y: vh * 0.5, r: 0 };
}

function paintSpot(dim: HTMLElement, spot: { x: number; y: number; r: number }) {
  dim.style.setProperty("--spot-x", `${spot.x}px`);
  dim.style.setProperty("--spot-y", `${spot.y}px`);
  dim.style.setProperty("--spot-r", `${spot.r}px`);
}

export function LevelIntro({ level, characterDisplayName, onReveal, onFinish }: LevelIntroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const momoRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  /** The spot is tweened as plain numbers, then painted into the dark layer's CSS variables. */
  const spotRef = useRef({ x: 0, y: 0, r: 0 });
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const finishedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("drop");
  const [beatIndex, setBeatIndex] = useState(0);
  const [flap, setFlap] = useState(0);
  const pageThumb = usePageThumb();
  const beats = useMemo(() => buildBeats(level.stage, characterDisplayName), [level.stage, characterDisplayName]);
  const spawn = getStageGeometry(level.stage as 1 | 2 | 3).spawn;
  const beat = beats[Math.min(beatIndex, beats.length - 1)]!;
  const isLast = beatIndex >= beats.length - 1;
  const started = phase === "story" || phase === "nudge";

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    timelineRef.current?.kill();
    revealRef.current?.();
    finishRef.current();
  }, []);

  /** Only after the last line and its reading pause (the thumb is shown only then). Lifts Momo and the camera. */
  const rise = useCallback(() => {
    if (phase !== "nudge" || finishedRef.current) return;
    setPhase("rise");
    setFlap((n) => n + 1);
    const camera = cameraRef.current;
    const momo = momoRef.current;
    if (!camera || !momo) {
      finish();
      return;
    }
    gsap.killTweensOf(momo);
    const tl = gsap.timeline({ onComplete: finish });
    timelineRef.current = tl;
    tl.to(momo, { y: "+=16", duration: 0.28, ease: "power2.out" })
      .to(momo, { y: 0, x: 0, duration: 1.15, ease: "power3.out" }, 0.28)
      .to(camera, { yPercent: 0, duration: 2.1, ease: "power2.inOut" }, 0.36)
      .fromTo(nearRef.current, { y: -220 }, { y: 260, duration: 2.1, ease: "power1.inOut" }, 0.36);
    // The wobble is decoration; reduced motion keeps the same flight without it.
    if (!reducedMotion()) tl.to(momo, { rotation: -6, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0.4);
    tl.to({}, { duration: 0.25 });
  }, [finish, phase]);

  /** Book open, then Momo flies in to the first beat's spot. Reduced motion flies in too, at the same length. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const camera = cameraRef.current;
    const momo = momoRef.current;
    if (!root || !camera || !momo) return;
    gsap.set(camera, { yPercent: CAMERA_START });
    gsap.set(root, { yPercent: 0, rotation: 0 });
    const spot = momoSpot(root, beats[0]?.focus ?? null) ?? { left: Math.round(window.innerWidth * 0.16), top: Math.round(window.innerHeight * 0.34) };
    const x = spot.left - momo.offsetLeft;
    const y = spot.top - momo.offsetTop;
    gsap.set(momo, { x: x - 120, y: y - 260, opacity: 0, scale: 0.82 });
    const tl = gsap.timeline({ delay: BOOK_OPEN_MS / 1000, onComplete: () => setPhase("story") });
    timelineRef.current = tl;
    tl.add(() => setFlap((n) => n + 1), 0).to(momo, { opacity: 1, x, y, scale: 1, duration: FLY_IN_S, ease: "power3.out" }, 0);
    return () => {
      tl.kill();
    };
    // Mount-time only: the intro is keyed by level in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Each beat: Momo glides to what she talks about, and the dark stage opens its spot there. */
  useEffect(() => {
    const root = rootRef.current;
    const momo = momoRef.current;
    const dim = dimRef.current;
    if (!started || !root || !momo) return;
    const focus = beats[Math.min(beatIndex, beats.length - 1)]?.focus ?? null;
    const spot = momoSpot(root, focus);
    if (spot) {
      gsap.to(momo, { x: spot.left - momo.offsetLeft, y: spot.top - momo.offsetTop, duration: GLIDE_S, ease: "power2.inOut", overwrite: "auto" });
    }
    if (dim) {
      gsap.to(spotRef.current, {
        ...litSpot(root, focus),
        duration: SPOT_S,
        ease: "power2.inOut",
        overwrite: "auto",
        onUpdate: () => paintSpot(dim, spotRef.current),
      });
    }
  }, [beatIndex, started, beats]);

  // Initial spot: centred and dark (radius 0) until the first beat opens it.
  useLayoutEffect(() => {
    const dim = dimRef.current;
    if (!dim) return;
    spotRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2, r: 0 };
    paintSpot(dim, spotRef.current);
  }, []);

  /** Next beat once this one is typed and read. The last beat keeps the thumb instead. */
  const advance = () => {
    if (beatIndex >= beats.length - 1) return;
    const next = beats[beatIndex + 1]!;
    setBeatIndex(beatIndex + 1);
    setPhase(next.kind);
  };

  useEffect(
    () => () => {
      timelineRef.current?.kill();
      const momo = momoRef.current;
      if (momo) gsap.killTweensOf(momo);
      gsap.killTweensOf(spotRef.current);
    },
    [],
  );

  const thumb = (
    <ThumbConfirm holdMs={1000} onConfirm={rise} label="Aku mengerti" className="intro-thumb" testId="intro-continue" externalThumbUp={pageThumb} />
  );

  return (
    <div
      ref={rootRef}
      className="level-intro"
      data-testid="level-intro"
      data-phase={phase}
      data-stage={level.stage}
      data-focus={started ? beat.focus ?? "none" : "none"}
    >
      <div ref={cameraRef} className="intro-camera">
        <div className="intro-sky" />
        <div className="intro-clouds">
          <CloudBand layer="far" />
          <div className="intro-clouds__near" ref={nearRef}>
            <CloudBand layer="near" />
          </div>
        </div>
        <div className="intro-world">
          <div className="intro-world__art">
            <StageWorld scene={level.stage as SceneIndex} gameplay />
            <ThinmanArt className="intro-thinman" style={{ left: `${(spawn.x / 800) * 100}%`, top: `${(spawn.y / 450) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* The dark stage: 55% black over everything except the spot Momo is talking about. Momo sits above it. */}
      <div ref={dimRef} className="intro-dim" data-testid="intro-dim" aria-hidden="true" />

      <div ref={momoRef} className={`intro-momo${phase === "rise" ? " is-flying" : ""}`}>
        <MomoChat
          lines={beat.lines}
          startDelay={beatIndex === 0 ? STORY_START_MS : 0}
          mood={phase === "rise" ? "Semangat" : beat.kind === "nudge" ? "Penasaran" : "Senang"}
          avatarHeight={290}
          trackMotion
          flapKey={flap}
          onAllShown={advance}
          extrasFrom="last"
          testId="intro-chat"
        >
          {isLast && phase === "nudge" ? thumb : undefined}
        </MomoChat>
      </div>

      <DwellButton
        iconOnly
        className="nb-iconbtn intro-skip"
        testId="intro-skip"
        label="Lewati cerita"
        title="Lewati cerita"
        onActivate={finish}
        icon={<Icon name="arrow-right" size={22} stroke={3} />}
      >
        Lewati cerita
      </DwellButton>
    </div>
  );
}
