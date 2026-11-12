"use client";
/**
 * The decided drawing as a sticker on the sky canvas (REVISI §18A). The student's own strokes with the final label
 * under them, on a strip of tape. Two hand rings sit under it:
 * - Lempar (thumbs-up held 2 s): the sticker slides down past the cloud band, then onThrow hands it to the world.
 * - Gambar lagi (open palm held 2 s): onRedraw clears the sticker and returns the canvas for a new drawing.
 * The pose meaning comes from the one gesture router (MODE_CANVAS_STAMP_READY); a mouse or touch hold fills the
 * same rings for the fallback mode. The ink is off on this canvas: the screen gates it, not this sticker.
 */
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { DrawingInput, ObjectBehavior } from "@/src/domain/types";
import { generateSketchDataUri } from "@/src/game/sketch-renderer";
import { MODE_CANVAS_STAMP_READY, actionFor } from "@/src/input/gesture-mode";
import type { HandPose } from "@/src/input/hand-gesture";
import { Icon } from "../ui/Icon";
import { FingerGlyph, GestureRing } from "../ui/GestureRing";
import "./StickerStamp.css";

/** A held pose (or press) that throws the sticker or sends the student back to drawing. */
export const STAMP_HOLD_MS = 2000;
/** The throw: the sticker slides down. Not shortened on reduced motion; only the extra spin is dropped there. */
export const STAMP_THROW_MS = 1200;
/** How far the sticker slides on a throw, as a share of the viewport height. */
const THROW_TRAVEL = 0.6;

/** Momo's line while the sticker waits on the canvas. */
export function stampMomoLine(label: string): string {
  return `${label} sudah jadi stiker! Tahan jempol kalau mau dilempar ke dunia, atau telapak terbuka kalau mau gambar lagi.`;
}

export interface StickerStampProps {
  /** The final label of the decision (the display text, never the level label). */
  label: string;
  behavior: ObjectBehavior;
  drawingInput: DrawingInput | null;
  /** The stable hand pose of the drawing hand (never "none" in fallback mode). */
  pose: HandPose;
  /** Fires once, after the throw animation. */
  onThrow(): void;
  /** Fires once when the open palm is held. */
  onRedraw(): void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export function StickerStamp({ label, behavior, drawingInput, pose, onThrow, onRedraw }: StickerStampProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [throwing, setThrowing] = useState(false);
  const onThrowRef = useRef(onThrow);
  onThrowRef.current = onThrow;

  const action = actionFor(MODE_CANVAS_STAMP_READY, pose);
  const throwActive = action === "throw";
  const redrawActive = action === "redraw";

  // A slight tilt, like a sticker put down by hand. gsap owns the transform from here on.
  useEffect(() => {
    if (sheetRef.current) gsap.set(sheetRef.current, { rotation: -1.5 });
  }, []);

  // The throw runs once: a single timer hands the sticker on, and unmounting cancels both the tween and the timer.
  useEffect(() => {
    if (!throwing) return;
    const sheet = sheetRef.current;
    const reduce = prefersReducedMotion();
    const tween = sheet
      ? gsap.to(sheet, {
          y: Math.round(window.innerHeight * THROW_TRAVEL),
          rotation: reduce ? -1.5 : 6,
          scale: 0.92,
          duration: STAMP_THROW_MS / 1000,
          ease: "power2.in",
        })
      : null;
    const timer = window.setTimeout(() => onThrowRef.current(), STAMP_THROW_MS);
    return () => {
      window.clearTimeout(timer);
      tween?.kill();
    };
  }, [throwing]);

  const src = generateSketchDataUri(drawingInput, { width: 380, height: 240, behavior, label, pixelScale: 3 });

  return (
    <div className="sticker-stamp" data-testid="sticker-stamp" data-state={throwing ? "throwing" : "ready"}>
      <div className="sticker-stamp__place">
        <div className="sticker-stamp__sheet" ref={sheetRef}>
          <span className="sticker-stamp__tape" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI of the student's own strokes */}
          <img className="sticker-stamp__art" alt={`Stiker ${label}`} src={src} />
          <p className="sticker-stamp__label">{label}</p>
        </div>
      </div>
      {!throwing && (
        <div className="sticker-stamp__actions">
          <GestureRing
            testId="btn-redraw-sticker"
            className="sticker-stamp__redraw"
            label="Gambar lagi"
            active={redrawActive}
            holdMs={STAMP_HOLD_MS}
            onConfirm={onRedraw}
            icon={<FingerGlyph count={5} size={28} />}
          />
          <GestureRing
            testId="btn-throw-sticker"
            className="sticker-stamp__throw"
            label="Lempar"
            active={throwActive}
            holdMs={STAMP_HOLD_MS}
            onConfirm={() => setThrowing(true)}
            icon={<Icon name="thumb-up" size={28} />}
          />
        </div>
      )}
    </div>
  );
}
