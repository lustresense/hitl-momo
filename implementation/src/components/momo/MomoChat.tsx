"use client";
/**
 * Momo speaks like a chat contact: her artwork on one side, her name, then message bubbles that arrive
 * one by one after a short "typing" beat. Display only: Momo never takes input, decides, or creates objects
 * (lore invariant). Every Momo line in the app (drawing cue, world, mission, win) goes through here, so
 * she always looks like the same speaker.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MomoMood } from "@/src/domain/momo-script";
import { MomoAvatar } from "./MomoAvatar";

/** Typing beat before a line shows: short for one-liners, a little longer for long lines. */
export function typingMs(line: string): number {
  return Math.min(900, 380 + line.length * 7);
}

export interface MomoChatProps {
  lines: string | string[];
  mood?: MomoMood;
  avatarHeight?: number;
  trackMotion?: boolean;
  flapKey?: number;
  /** Show the typing dots before each line. Off = lines appear immediately. */
  typing?: boolean;
  /** Wait this long before the first line starts (e.g. while Momo is still flying in). */
  startDelay?: number;
  /** Fires once, right after the last line is shown. */
  onDone?: () => void;
  /** Rendered under the bubbles once every line is shown (e.g. gesture choices). */
  children?: ReactNode;
  className?: string;
  testId?: string;
  /** Mirror the layout so Momo is on the right (for the right edge of a screen). */
  side?: "left" | "right";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MomoChat({
  lines,
  mood = "Tenang",
  avatarHeight = 96,
  trackMotion = false,
  flapKey,
  typing = true,
  startDelay = 0,
  onDone,
  children,
  className,
  testId,
  side = "left",
}: MomoChatProps) {
  const list = useMemo(() => (Array.isArray(lines) ? lines : [lines]), [lines]);
  const key = list.join("␞");
  const [shown, setShown] = useState(0);
  const [typingNow, setTypingNow] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const instant = !typing || prefersReducedMotion();
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (instant) {
      setShown(list.length);
      setTypingNow(false);
      timers.push(setTimeout(() => !cancelled && doneRef.current?.(), 0));
    } else {
      setShown(0);
      let at = startDelay;
      list.forEach((line, i) => {
        timers.push(setTimeout(() => !cancelled && setTypingNow(true), at));
        at += typingMs(line);
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setShown(i + 1);
            setTypingNow(i + 1 < list.length);
            if (i + 1 === list.length) doneRef.current?.();
          }, at),
        );
        at += 260;
      });
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // `key` stands for the content of `list`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, typing, startDelay]);

  const finished = shown >= list.length;
  return (
    <div className={`momo-chat momo-chat--${side}${className ? " " + className : ""}`} data-testid={testId} data-finished={finished ? "true" : "false"}>
      <MomoAvatar className="momo-chat__avatar" expression={mood} height={avatarHeight} trackMotion={trackMotion} flapKey={flapKey} />
      <div className="momo-chat__col">
        <div className="momo-chat__name">
          <span className="momo-chat__dot" aria-hidden="true" />
          Momo
        </div>
        <div className="momo-chat__thread" role="status" aria-live="polite">
          {list.slice(0, shown).map((line, i) => (
            <div key={i} className="momo-bubble momo-chat__bubble">
              {line}
            </div>
          ))}
          {typingNow && !finished && (
            <div className="momo-chat__bubble momo-chat__typing" aria-label="Momo sedang mengetik">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        {finished && children && <div className="momo-chat__extras">{children}</div>}
      </div>
    </div>
  );
}
