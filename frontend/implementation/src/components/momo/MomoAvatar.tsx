"use client";
import { useEffect, useRef } from "react";
import { MomoEngine, MOMO_ASPECT, clampFog, type MomoExpression } from "./momo-engine";

export interface MomoAvatarProps {
  expression: MomoExpression;
  /** Rendered height in px (width follows the artwork aspect). */
  height?: number;
  /** Let tail/wings trail the real on-screen movement of this element (flying / walking in). */
  trackMotion?: boolean;
  /** Change this number to make Momo flap once (arrival, celebration). */
  flapKey?: number;
  /** Change this number to make Momo greet with one wing (a wave hello). */
  waveKey?: number;
  /** Asleep: eyes shut. Set back to false and she wakes with the current expression. */
  sleeping?: boolean;
  /** Kabut Penghapus over the face, 0..1 (R14). Visual only. */
  fog?: number;
  /** Change this number to make Momo point with a wing toward `pointSide` (R16). */
  pointKey?: number;
  pointSide?: "left" | "right";
  className?: string;
  label?: string;
}

/** The Owner's animated Momo as a React slot. Purely visual: no input, no decisions, no object creation. */
export function MomoAvatar({ expression, height = 64, trackMotion = false, flapKey = 0, waveKey = 0, sleeping = false, fog = 0, pointKey = 0, pointSide = "right", className, label = "Momo" }: MomoAvatarProps) {
  const host = useRef<HTMLSpanElement>(null);
  const engine = useRef<MomoEngine | null>(null);
  const expressionRef = useRef(expression);
  expressionRef.current = expression;

  useEffect(() => {
    if (!host.current) return;
    const e = new MomoEngine(host.current, { trackMotion });
    e.set(expressionRef.current, true);
    engine.current = e;
    return () => { e.destroy(); engine.current = null; };
  }, [trackMotion]);

  // Going from asleep to awake plays the eyelid blinks first (wake), then the expression; otherwise set it at once.
  const wasSleeping = useRef(false);
  useEffect(() => {
    const e = engine.current;
    if (sleeping) e?.sleep();
    else if (wasSleeping.current) e?.wake(expression);
    else e?.set(expression);
    wasSleeping.current = sleeping;
  }, [expression, sleeping, trackMotion]);
  useEffect(() => { if (flapKey > 0) engine.current?.flap(); }, [flapKey]);
  useEffect(() => { engine.current?.setFog(fog); }, [fog, trackMotion]);
  useEffect(() => { if (pointKey > 0) engine.current?.point(pointSide); }, [pointKey, pointSide]);
  useEffect(() => { if (waveKey > 0) engine.current?.wave(); }, [waveKey]);

  return (
    <span
      ref={host}
      className={`momo-art${className ? " " + className : ""}`}
      role="img"
      aria-label={label}
      data-expression={sleeping ? "Tidur" : expression}
      data-fog={clampFog(fog).toFixed(2)}
      style={{ display: "inline-block", height, width: height * MOMO_ASPECT, flex: "0 0 auto", overflow: "visible" }}
    />
  );
}
