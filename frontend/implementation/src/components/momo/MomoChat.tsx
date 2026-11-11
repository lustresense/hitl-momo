"use client";
/**
 * Momo speaks like a chat contact: her artwork on one side and one speech bubble at a time. Lines replace each
 * other (typing dots, then the letters, then a short dwell before the next line), so the screen never fills up with
 * stacked bubbles. There is no name label: it is obviously Momo. Display only: Momo never takes input, decides, or
 * creates objects (lore invariant).
 *
 * Nothing skips ahead: a tap, click, Space or Enter does nothing, and every line types out and is read in full.
 * `**word**` in a line is shown in bold; the stars are never shown or typed.
 * `stack` keeps every line on screen at once; only the mission hint uses it.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MomoMood } from "@/src/domain/momo-script";
import { MomoAvatar } from "./MomoAvatar";
import "./MomoChat.css";

/** Time between two letters. Every line types at this speed, short or long. */
export const LETTER_MS = 30;

/** The line as the student reads it: the `**` bold markers are not letters, so they never count. */
export function plainText(line: string): string {
  return line.replace(/\*\*/g, "");
}

/** Typing beat (the dots) before a line starts: short for one-liners, a little longer for long lines. */
export function typingMs(line: string): number {
  return Math.min(800, 320 + plainText(line).length * 6);
}

/** How long a line stays before the next one replaces it (long enough to read, never long enough to bore). */
export function dwellMs(line: string): number {
  return 900 + plainText(line).length * 34;
}

/** A piece of a line: plain or bold. Unbalanced `**` markers are not bold at all (the line shows plain). */
export interface Segment {
  text: string;
  strong: boolean;
}

export function emphasisSegments(line: string): Segment[] {
  const parts = line.split("**");
  if (parts.length % 2 === 0) return [{ text: plainText(line), strong: false }];
  return parts.map((text, i) => ({ text, strong: i % 2 === 1 })).filter((s) => s.text.length > 0);
}

/** The first `n` letters of the segments, keeping their bold. */
function takeChars(segments: Segment[], n: number): Segment[] {
  let left = n;
  const out: Segment[] = [];
  for (const s of segments) {
    if (left <= 0) break;
    const text = s.text.slice(0, left);
    out.push({ text, strong: s.strong });
    left -= text.length;
  }
  return out;
}

function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) => (s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

export interface MomoChatProps {
  lines: string | string[];
  mood?: MomoMood;
  avatarHeight?: number;
  trackMotion?: boolean;
  flapKey?: number;
  waveKey?: number;
  sleeping?: boolean;
  /** Kabut Penghapus level 0..1 (R14): fog over Momo's face; a thick fog fades the bubble a little (still readable). */
  fog?: number;
  pointKey?: number;
  pointSide?: "left" | "right";
  /** Type the lines out (dots, then letters). Off = no dots and no letters: each line appears in full, in turn. */
  typing?: boolean;
  /** Wait this long before the first line starts (e.g. while Momo is still flying in). */
  startDelay?: number;
  /** Keep all lines visible together instead of replacing them one by one. */
  stack?: boolean;
  /** Fires once, when the last line is fully typed out. The reading pause after it may still be running. */
  onDone?: () => void;
  /** Fires once per set of lines, when the last line is typed out AND its reading pause has passed. */
  onAllShown?: () => void;
  /** Rendered under the bubble: from the first line (`first`) or only once everything is shown (`last`, see onAllShown). */
  extrasFrom?: "first" | "last" | "always";
  children?: ReactNode;
  className?: string;
  testId?: string;
  /** Mirror the layout so Momo is on the right (for the right edge of a screen). */
  side?: "left" | "right";
}

/** True when the student asked the system for less motion. Starts false so server and first client render match. */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduce;
}

/** wait: before the first line; dots: typing beat; type: letters; hold: line complete, dwell running; end: last line done. */
type Stage = "wait" | "dots" | "type" | "hold" | "end";

/**
 * One playthrough of the lines. A new content key starts a new run, so no frame shows the old position on new text.
 * `due` is the clock time (ms) when the current stage ends. Each stage is timed from the previous due time, not from
 * "now", so a slow frame never adds up over a long line. `null` = the stage has not been timed yet.
 * `chars` counts visible letters (bold markers excluded).
 */
interface Run {
  id: string;
  index: number;
  chars: number;
  stage: Stage;
  due: number | null;
}

function startRun(id: string, lines: readonly string[], startDelay: number): Run {
  if (lines.length === 0) return { id, index: -1, chars: 0, stage: "end", due: null };
  return { id, index: 0, chars: 0, stage: startDelay > 0 ? "wait" : "dots", due: null };
}

/** Shows the line on screen in full at once (fast mode only). The dwell still runs, so the conversation keeps its pace. */
function finishLine(run: Run, lines: readonly string[]): Run {
  if (run.stage !== "wait" && run.stage !== "dots" && run.stage !== "type") return run;
  const index = Math.max(0, run.index);
  return { ...run, index, chars: plainText(lines[index] ?? "").length, stage: "hold", due: null };
}

/** Milliseconds the current stage lasts, or null when nothing more happens. */
function stageMs(run: Run, lines: readonly string[], startDelay: number): number | null {
  const line = lines[run.index] ?? "";
  switch (run.stage) {
    case "wait":
      return startDelay;
    case "dots":
      return typingMs(line);
    case "type":
      return LETTER_MS;
    case "hold":
      return dwellMs(line);
    case "end":
      return null;
  }
}

/** The stage after the current one, timed from this stage's due time. */
function advance(run: Run, lines: readonly string[], startDelay: number): Run {
  const length = plainText(lines[run.index] ?? "").length;
  let next: Pick<Run, "index" | "chars" | "stage">;
  switch (run.stage) {
    case "wait":
      next = { index: run.index, chars: 0, stage: "dots" };
      break;
    case "dots":
      next = length === 0 ? { index: run.index, chars: 0, stage: "hold" } : { index: run.index, chars: 0, stage: "type" };
      break;
    case "type": {
      const chars = run.chars + 1;
      next = chars >= length ? { index: run.index, chars: length, stage: "hold" } : { index: run.index, chars, stage: "type" };
      break;
    }
    case "hold":
      next = run.index < lines.length - 1 ? { index: run.index + 1, chars: 0, stage: "dots" } : { index: run.index, chars: 0, stage: "end" };
      break;
    case "end":
      return run;
  }
  const following = { ...run, ...next };
  const ms = stageMs(following, lines, startDelay);
  return { ...following, due: ms === null || run.due === null ? null : run.due + ms };
}

export function MomoChat({
  lines,
  mood = "Tenang",
  avatarHeight = 96,
  trackMotion = false,
  flapKey,
  waveKey,
  sleeping,
  fog = 0,
  pointKey,
  pointSide,
  typing = true,
  startDelay = 0,
  stack = false,
  onDone,
  onAllShown,
  extrasFrom = "last",
  children,
  className,
  testId,
  side = "left",
}: MomoChatProps) {
  const list = useMemo(() => (Array.isArray(lines) ? lines : [lines]), [lines]);
  const key = list.join("␞");
  const runId = `${key}␟${startDelay}`;
  const reduce = usePrefersReducedMotion();
  /** Fast = no dots and no letters: every line shows in full (typing off, or reduced motion). */
  const fast = !typing || reduce;
  const last = list.length - 1;

  const [stored, setStored] = useState<Run>(() => startRun(runId, list, startDelay));
  let run = stored;
  if (stored.id !== runId) {
    run = startRun(runId, list, startDelay);
    setStored(run);
  }

  // Stacked lines in fast mode are all on screen at once (mission hint); otherwise lines replace each other.
  const view: Run = fast && stack
    ? { id: runId, index: last, chars: plainText(list[last] ?? "").length, stage: "end", due: null }
    : fast ? finishLine(run, list) : run;

  useEffect(() => {
    if (fast && stack) return; // every line is on screen already
    if (fast && (run.stage === "wait" || run.stage === "dots" || run.stage === "type")) {
      setStored((prev) => (prev === run ? finishLine(prev, list) : prev));
      return;
    }
    const ms = stageMs(run, list, startDelay);
    if (ms === null) return;
    if (run.due === null) {
      // The stage starts now: time it from here, then the timer below takes over.
      setStored((prev) => (prev === run ? { ...prev, due: Date.now() + ms } : prev));
      return;
    }
    const timer = setTimeout(() => setStored((prev) => (prev === run ? advance(prev, list, startDelay) : prev)), Math.max(0, run.due - Date.now()));
    return () => clearTimeout(timer);
    // `run` changes on every step; `list` is covered by `key` (same content, same run).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, fast, stack]);

  const lastTyped = view.index === last && (view.stage === "hold" || view.stage === "end");
  const allShown = view.index === last && view.stage === "end";

  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const doneFor = useRef<string | null>(null);
  useEffect(() => {
    if (!lastTyped || list.length === 0 || doneFor.current === runId) return;
    doneFor.current = runId;
    doneRef.current?.();
  }, [lastTyped, runId, list.length]);

  const allShownRef = useRef(onAllShown);
  allShownRef.current = onAllShown;
  const allShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!allShown || list.length === 0 || allShownFor.current === runId) return;
    allShownFor.current = runId;
    allShownRef.current?.();
  }, [allShown, runId, list.length]);

  const currentRaw = view.index >= 0 ? (list[view.index] ?? "") : "";
  const currentSegments = emphasisSegments(currentRaw);
  const typed = view.stage === "type";
  const fullNow = view.stage === "hold" || view.stage === "end";
  const shownSegments: Segment[] = fullNow ? currentSegments : typed ? takeChars(currentSegments, view.chars) : [];
  const showCurrent = shownSegments.some((s) => s.text.length > 0);
  /** A line typed out is replaced by its whole text once done: that replacement is the one thing screen readers announce. */
  const replacedAfterTyping = !fast && fullNow;
  const showDots = view.stage === "dots";
  const finished = allShown;
  const firstShown = view.index > 0 || (view.index === 0 && (view.chars > 0 || view.stage === "hold" || view.stage === "end"));
  const showExtras = children && list.length > 0 && (extrasFrom === "always" || (extrasFrom === "first" ? firstShown : finished));

  // Lines that are done (stacked ones, and the current one once typed) sit in the live region, so each is read once,
  // whole. The line still typing sits beside it, outside the live region and hidden from assistive tech, so no
  // half-typed letter is read out; its whole text is announced when it completes.
  const doneRows: Array<{ key: string; segments: Segment[]; settled: boolean }> = [];
  if (stack) {
    for (let i = 0; i < view.index; i++) doneRows.push({ key: `line-${i}`, segments: emphasisSegments(list[i] ?? ""), settled: false });
  }
  const typingNow = typed && showCurrent;
  if (showCurrent && !typed) {
    doneRows.push({ key: `line-${view.index}`, segments: shownSegments, settled: replacedAfterTyping });
  }

  return (
    <div className={`momo-chat momo-chat--${side}${className ? " " + className : ""}`} data-testid={testId} data-finished={finished ? "true" : "false"} data-foggy={fog >= 0.7 ? "true" : undefined}>
      <MomoAvatar className="momo-chat__avatar" expression={mood} height={avatarHeight} trackMotion={trackMotion} flapKey={flapKey} waveKey={waveKey} sleeping={sleeping} fog={fog} pointKey={pointKey} pointSide={pointSide} />
      <div className="momo-chat__col">
        <div className="momo-chat__thread">
          <div className="momo-chat__done" role="status" aria-live="polite" aria-relevant="additions">
            {doneRows.map((row) => (
              <div key={row.key} className={`momo-bubble momo-chat__bubble${row.settled ? " momo-chat__bubble--typed" : ""}`}>
                <Segments segments={row.segments} />
              </div>
            ))}
          </div>
          {showDots && (
            <div className="momo-chat__bubble momo-chat__typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          )}
          {typingNow && (
            <div key={`typing-${view.index}`} className="momo-bubble momo-chat__bubble" aria-hidden="true">
              <Segments segments={shownSegments} />
            </div>
          )}
        </div>
        {showExtras && <div className="momo-chat__extras">{children}</div>}
      </div>
    </div>
  );
}
