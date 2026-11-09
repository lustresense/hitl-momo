"use client";
/**
 * Momo speaks like a chat contact: her artwork on one side and one speech bubble at a time. Lines replace each
 * other (typing dots, then the letters, then a short dwell before the next line), so the screen never fills up with
 * stacked bubbles. There is no name label: it is obviously Momo. Display only: Momo never takes input, decides, or
 * creates objects (lore invariant).
 *
 * A tap, click, Space or Enter on a bubble that is still typing shows the whole line at once. It never moves the
 * conversation on: the next line still waits for its dwell.
 * `stack` keeps every line on screen at once; only the mission hint uses it.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { MomoMood } from "@/src/domain/momo-script";
import { MomoAvatar } from "./MomoAvatar";
import "./MomoChat.css";

/** Typing beat (the dots) before a line starts: short for one-liners, a little longer for long lines. */
export function typingMs(line: string): number {
  return Math.min(800, 320 + line.length * 6);
}

/** Time between two letters. */
export const LETTER_MS = 30;
/** The dots and all letters of one line take at most this long, so a long line never drags on. */
export const TYPING_CAP_MS = 2500;

/** Milliseconds per letter: LETTER_MS, slower only when a long line would otherwise pass the cap. Whole ms. */
export function letterMs(line: string): number {
  const room = TYPING_CAP_MS - typingMs(line);
  return Math.max(1, Math.min(LETTER_MS, Math.floor(room / Math.max(1, line.length))));
}

/** How long a line stays before the next one replaces it (long enough to read, never long enough to bore). */
export function dwellMs(line: string): number {
  return 900 + line.length * 34;
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
  /** Fires once, when the last line is fully shown (typed out, or shown at once by a tap). */
  onDone?: () => void;
  /** Rendered under the bubble: from the first line (`first`) or only once the last line is shown (`last`). */
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

/** Shows the line on screen in full at once. The dwell still runs, so the conversation keeps its pace. */
function finishLine(run: Run, lines: readonly string[]): Run {
  if (run.stage !== "wait" && run.stage !== "dots" && run.stage !== "type") return run;
  const index = Math.max(0, run.index);
  return { ...run, index, chars: lines[index]?.length ?? 0, stage: "hold", due: null };
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
      return letterMs(line);
    case "hold":
      return dwellMs(line);
    case "end":
      return null;
  }
}

/** The stage after the current one, timed from this stage's due time. */
function advance(run: Run, lines: readonly string[], startDelay: number): Run {
  const line = lines[run.index] ?? "";
  let next: Pick<Run, "index" | "chars" | "stage">;
  switch (run.stage) {
    case "wait":
      next = { index: run.index, chars: 0, stage: "dots" };
      break;
    case "dots":
      next = line.length === 0 ? { index: run.index, chars: 0, stage: "hold" } : { index: run.index, chars: 0, stage: "type" };
      break;
    case "type": {
      const chars = run.chars + 1;
      next = chars >= line.length ? { index: run.index, chars: line.length, stage: "hold" } : { index: run.index, chars, stage: "type" };
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
    ? { id: runId, index: last, chars: list[last]?.length ?? 0, stage: "end", due: null }
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

  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const lastDone = view.index === last && (view.stage === "hold" || view.stage === "end");
  const doneFor = useRef<string | null>(null);
  useEffect(() => {
    if (!lastDone || list.length === 0 || doneFor.current === runId) return;
    doneFor.current = runId;
    doneRef.current?.();
  }, [lastDone, runId, list.length]);

  /** A tap, click, Space or Enter on a bubble still typing: show its whole line now. Anything else does nothing. */
  const skip = () => setStored((prev) => (prev.id === runId && (prev.stage === "dots" || prev.stage === "type") ? finishLine(prev, list) : prev));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      skip();
    }
  };

  const current = view.index >= 0 ? (list[view.index] ?? "") : "";
  const typed = view.stage === "type";
  const shown = view.stage === "hold" || view.stage === "end" ? current : typed ? current.slice(0, view.chars) : "";
  const showCurrent = shown.length > 0;
  /** A line typed out is replaced by its whole text once done: that replacement is the one thing screen readers announce. */
  const replacedAfterTyping = !fast && (view.stage === "hold" || view.stage === "end");
  const showDots = view.stage === "dots";
  const finished = lastDone;
  const firstShown = view.index > 0 || (view.index === 0 && (view.chars > 0 || view.stage === "hold" || view.stage === "end"));
  const showExtras = children && list.length > 0 && (extrasFrom === "always" || (extrasFrom === "first" ? firstShown : finished));

  // Lines that are done (stacked ones, and the current one once typed) sit in the live region, so each is read once,
  // whole. The line still typing sits beside it: it is focusable (Space/Enter/tap show the whole line), so it must
  // not be aria-hidden, and it is not in the live region, so no letter is read out.
  const doneRows: Array<{ key: string; text: string; settled: boolean }> = [];
  if (stack) {
    for (let i = 0; i < view.index; i++) doneRows.push({ key: `line-${i}`, text: list[i] ?? "", settled: false });
  }
  const typingNow = typed && showCurrent;
  if (showCurrent && !typed) {
    doneRows.push({ key: `line-${view.index}`, text: shown, settled: replacedAfterTyping });
  }

  return (
    <div className={`momo-chat momo-chat--${side}${className ? " " + className : ""}`} data-testid={testId} data-finished={finished ? "true" : "false"} data-foggy={fog >= 0.7 ? "true" : undefined}>
      <MomoAvatar className="momo-chat__avatar" expression={mood} height={avatarHeight} trackMotion={trackMotion} flapKey={flapKey} waveKey={waveKey} sleeping={sleeping} fog={fog} pointKey={pointKey} pointSide={pointSide} />
      <div className="momo-chat__col">
        <div className="momo-chat__thread">
          <div className="momo-chat__done" role="status" aria-live="polite" aria-relevant="additions">
            {doneRows.map((row) => (
              <div key={row.key} className={`momo-bubble momo-chat__bubble${row.settled ? " momo-chat__bubble--typed" : ""}`}>
                {row.text}
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
            <div
              key={`typing-${view.index}`}
              className="momo-bubble momo-chat__bubble"
              role="button"
              aria-label="Tampilkan teks lengkap"
              tabIndex={0}
              data-skippable="true"
              onClick={skip}
              onKeyDown={onKey}
            >
              {shown}
            </div>
          )}
        </div>
        {showExtras && <div className="momo-chat__extras">{children}</div>}
      </div>
    </div>
  );
}
