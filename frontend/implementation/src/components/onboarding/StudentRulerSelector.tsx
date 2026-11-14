"use client";

/**
 * The number ruler (BIGPROMPT 6.2, storyboard scenes 6-8). Three phases:
 * focus: Momo is big in the middle, the page is dimmed, the ruler is locked and only Momo speaks;
 * docking: the scrim fades and Momo shrinks into the bottom-right corner;
 * docked: the student moves the ruler. Momo asks "Benar ini nomor absenmu, N?" only after the ruler has rested
 * 0.6 s and the sentence is said; the thumbs-up (2 s) confirms once.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
import type { GuideStep } from "@/src/domain/guide-script";
import {
  RULER_CLASS_OFFLINE_STEP,
  RULER_FOCUS_STEP,
  RULER_HINT_STEP,
  RULER_QUIET_STEP,
  RULER_TAKEN_STEP,
  rulerAskStep,
} from "@/src/domain/ruler-script";
import { useHandGesture, useInputMode } from "@/src/hooks/useHandGesture";
import { Icon } from "../ui/Icon";
import { MomoGuide } from "../momo/MomoGuide";
import { ThumbConfirm } from "../ui/ThumbConfirm";
import "./StudentRulerSelector.css";

const MAX = 30;
const GAP = 4;
const CYCLE = MAX + GAP;
const SPACING = 44;
const POOL = 44;
const HALF = Math.floor(POOL / 2);
const STORAGE_KEY = "sketchbook.studentNumber";
/** The ruler counts as "settled" once the snap is done and nobody moved it for this long. */
export const RULER_SETTLE_MS = 600;
/** Reading pause after Momo's last line before she moves on (reading time is never skipped). */
export const RULER_READ_PAUSE_MS = 1500;
/** Momo's move from the middle to the corner. The scrim fades in its first 0.4 s. */
export const RULER_DOCK_MS = 600;
const FOCUS_HEIGHT = 320;
const DOCKED_HEIGHT = 150;
/** Momo waits this long before her first line, so the dimmed page shows first. */
const START_DELAY_MS = 500;
/** A hand moved across the whole camera frame moves the ruler this many numbers. */
const HAND_SLOTS_PER_FRAME = 14;

export type ClassStatus = "none" | "joining" | "joined" | "failed";

const mod = (number: number, divisor: number) => ((number % divisor) + divisor) % divisor;
const numberAt = (slot: number) => (mod(slot, CYCLE) < MAX ? mod(slot, CYCLE) + 1 : null);

function snap(slot: number) {
  const position = mod(slot, CYCLE);
  if (position < MAX) return slot;
  const before = position - (MAX - 1);
  const after = CYCLE - position;
  return before <= after ? slot - before : slot + after;
}

function step(slot: number, direction: number) {
  let next = slot + direction;
  while (numberAt(next) === null) next += direction;
  return next;
}

/** The number the student kept on this device, or null when there is none. */
function readSavedNumber(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(saved) && saved >= 1 && saved <= MAX ? saved : null;
  } catch {
    return null;
  }
}

/** Written only when the student moves the ruler, so a visit that never moves it leaves nothing behind. */
function writeSavedNumber(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Selection remains usable when browser storage is unavailable.
  }
}

type Phase = "focus" | "docking" | "docked";

export function StudentRulerSelector({
  onConfirm,
  takenNumbers = [],
  classStatus,
}: {
  onConfirm: (selectedNumber: number) => void;
  takenNumbers?: number[];
  /** The class session. "none" and "failed" mean the number is only kept on this device (Momo says so). */
  classStatus?: ClassStatus;
}) {
  const root = useRef<HTMLDivElement>(null);
  // A new student starts at number 1 (position 0); a number kept on this device replaces it below.
  const position = useRef(0);
  const target = useRef(0);
  const shownNumber = useRef(1);
  const didHydrate = useRef(false);
  const drag = useRef({ active: false, moved: false, x: 0, start: 0, lastX: 0, time: 0, velocity: 0 });
  /** Camera drag: the fingertip's x and the ruler position when the pinch began. */
  const handDrag = useRef<{ x0: number; start: number } | null>(null);
  const [value, setValue] = useState(1);
  const [bump, setBump] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("focus");
  const [introDone, setIntroDone] = useState(false);
  const [settled, setSettled] = useState(false);
  const [moved, setMoved] = useState(false);
  const movedRef = useRef(false);
  /** The thumbs-up was given: the number is final and the ring is gone. */
  const [finalNumber, setFinalNumber] = useState<number | null>(null);
  const finalRef = useRef<number | null>(null);
  const sentRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const valueRef = useRef(value);
  valueRef.current = value;
  const isTaken = takenNumbers.includes(value);
  const offlineClass = classStatus === "none" || classStatus === "failed";
  /** Locked during Momo's focus phase and once the number is final. */
  const locked = phase !== "docked" || finalNumber !== null;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsettle = useCallback(() => {
    setSettled(false);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }, []);
  const armSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (!drag.current.active && !handDrag.current) setSettled(true);
    }, RULER_SETTLE_MS);
  }, []);
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const markMoved = useCallback(() => {
    if (movedRef.current) return;
    movedRef.current = true;
    setMoved(true);
  }, []);

  const go = useCallback((slot: number) => {
    markMoved();
    unsettle();
    armSettle();
    const snapped = snap(Math.round(slot));
    target.current = snapped;
    const next = numberAt(snapped)!;
    writeSavedNumber(next);
    if (next !== shownNumber.current) {
      shownNumber.current = next;
      setValue(next);
      setBump(false);
      requestAnimationFrame(() => setBump(true));
    }
  }, [armSettle, markMoved, unsettle]);

  // Momo's focus phase: she says her sentence, rests, then the scrim fades and she moves to the corner.
  useEffect(() => {
    if (phase === "focus" && introDone) {
      const timer = setTimeout(() => setPhase("docking"), RULER_READ_PAUSE_MS);
      return () => clearTimeout(timer);
    }
    if (phase === "docking") {
      const timer = setTimeout(() => setPhase("docked"), RULER_DOCK_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase, introDone]);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const kept = readSavedNumber();
    if (kept === null) return;
    const savedSlot = kept - 1;
    position.current = savedSlot;
    target.current = savedSlot;
    shownNumber.current = kept;
    setValue(kept);
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const ticks = Array.from(element.querySelectorAll<HTMLElement>(".student-ruler-tick"));
    let frame = 0;

    const render = () => {
      if (!drag.current.active && !handDrag.current) {
        position.current += (target.current - position.current) * 0.18;
        if (Math.abs(target.current - position.current) < 0.001) position.current = target.current;
      }
      const width = element.clientWidth;
      const firstSlot = Math.floor(position.current) - HALF;
      ticks.forEach((tick, index) => {
        const slot = firstSlot + index;
        const number = numberAt(slot);
        const major = number !== null && (number === 1 || number % 5 === 0);
        tick.style.transform = `translate3d(${width / 2 + (slot - position.current) * SPACING}px,0,0)`;
        tick.classList.toggle("is-gap", number === null);
        tick.classList.toggle("is-major", major);
        const label = tick.querySelector("span");
        if (label) label.textContent = major ? String(number) : "";
      });
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Camera mode: a pinch grabs the ruler, moving the hand sideways slides it, letting go snaps to the nearest number.
  const inputMode = useInputMode();
  const gesture = useHandGesture(inputMode === "camera" && phase === "docked" && finalNumber === null);
  const { pinch, cursor } = gesture;
  useEffect(() => {
    if (lockedRef.current) return;
    const current = handDrag.current;
    if (pinch && cursor) {
      if (!current) {
        handDrag.current = { x0: cursor.x, start: position.current };
        markMoved();
        unsettle();
        setDragging(true);
      } else {
        // Mirrored cursor: a hand moving right lowers the number, the same as a mouse drag to the right.
        position.current = current.start - (cursor.x - current.x0) * HAND_SLOTS_PER_FRAME;
        const liveSlot = snap(Math.round(position.current));
        const liveNum = numberAt(liveSlot);
        if (liveNum !== null && liveNum !== shownNumber.current) {
          shownNumber.current = liveNum;
          setValue(liveNum);
        }
      }
      return;
    }
    if (current) {
      handDrag.current = null;
      setDragging(false);
      go(position.current);
    }
  }, [pinch, cursor, go, markMoved, unsettle]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      go(step(target.current, 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      go(step(target.current, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      go(Math.round(position.current / CYCLE) * CYCLE);
    } else if (event.key === "End") {
      event.preventDefault();
      go(29 + CYCLE * Math.round((position.current - 29) / CYCLE));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    markMoved();
    drag.current = {
      active: true,
      moved: false,
      x: event.clientX,
      start: position.current,
      lastX: event.clientX,
      time: performance.now(),
      velocity: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    unsettle();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state.active) return;
    if (Math.abs(event.clientX - state.x) > 4) state.moved = true;
    position.current = state.start - (event.clientX - state.x) / SPACING;
    const liveSlot = snap(Math.round(position.current));
    const liveNum = numberAt(liveSlot);
    if (liveNum !== null && liveNum !== shownNumber.current) {
      shownNumber.current = liveNum;
      setValue(liveNum);
    }
    const now = performance.now();
    const elapsed = Math.max(1, now - state.time);
    state.velocity = 0.7 * state.velocity + 0.3 * ((event.clientX - state.lastX) / elapsed);
    state.lastX = event.clientX;
    state.time = now;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    setDragging(false);
    if (!state.moved) {
      const bounds = event.currentTarget.getBoundingClientRect();
      go(position.current + (event.clientX - bounds.left - event.currentTarget.clientWidth / 2) / SPACING);
    } else {
      if (performance.now() - state.time > 100) state.velocity = 0;
      go(position.current - (state.velocity * 350) / SPACING);
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (lockedRef.current) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) >= 2) go(step(target.current, delta > 0 ? 1 : -1));
  };

  // The thumbs-up: once per number. A class that is not joined gets Momo's honest line first, then the send.
  const send = (chosen: number) => {
    if (sentRef.current) return;
    sentRef.current = true;
    onConfirmRef.current(chosen);
  };
  const onThumbConfirm = () => {
    if (finalRef.current !== null) return;
    const chosen = valueRef.current;
    finalRef.current = chosen;
    setFinalNumber(chosen);
    if (!offlineClass) send(chosen);
  };
  const onMomoDone = () => {
    if (phase === "focus") {
      setIntroDone(true);
      return;
    }
    const chosen = finalRef.current;
    if (chosen === null || sentRef.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      send(chosen);
    }, RULER_READ_PAUSE_MS);
  };

  const quiet = moved && !settled;
  /** Idle pinch demo: the body of the ruler slides left-right; the white centre marker itself never moves. */
  const hinting = phase === "docked" && !moved && !dragging && finalNumber === null;
  let momoStep: GuideStep;
  if (phase !== "docked") momoStep = RULER_FOCUS_STEP;
  else if (finalNumber !== null) momoStep = offlineClass ? RULER_CLASS_OFFLINE_STEP : rulerAskStep(finalNumber);
  else if (isTaken) momoStep = RULER_TAKEN_STEP;
  else if (settled) momoStep = rulerAskStep(value);
  else if (quiet) momoStep = RULER_QUIET_STEP;
  else momoStep = RULER_HINT_STEP;
  const showRing = phase === "docked" && settled && !isTaken && finalNumber === null;

  return (
    <section className="student-number-screen" aria-labelledby="student-number-heading">
      <div className="student-number-content">
        <h1 id="student-number-heading" className="visually-hidden">GESER PENGGARIS SESUAI NOMOR ABSENMU</h1>
        <div className="student-number-readout" aria-live="polite">
          <span key={value} className={`student-number-value${isTaken ? " is-taken" : " is-available"}${bump ? " is-bump" : ""}`}>{value}</span>
        </div>
        <div className="student-ruler-wrap">
          <div
            ref={root}
            className={`student-ruler${dragging ? " is-grabbing" : ""}${hinting ? " is-hinting" : ""}`}
            role="slider"
            aria-label="Nomor absen"
            aria-valuemin={1}
            aria-valuemax={30}
            aria-valuenow={value}
            aria-valuetext={`${value} dari 30${isTaken ? ", sudah diambil" : ""}`}
            aria-disabled={locked || undefined}
            tabIndex={locked ? -1 : 0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {/* The pinch hint slides this whole body left and right; the white centre marker stays put. */}
            <div className="student-ruler-track">
              {Array.from({ length: POOL }, (_, index) => (
                <div className="student-ruler-tick" key={index}><span /></div>
              ))}
            </div>
            <div className="student-ruler-needle" aria-hidden="true" />
            {/* Papercraft grab handle on the centre marker: the sign that the ruler can be moved. */}
            <div
              className={`student-ruler-handle${dragging ? " is-active is-dragging" : ""}`}
              data-testid="student-ruler-handle"
              aria-hidden="true"
            >
              <div className="student-ruler-handle-ring" data-testid="student-ruler-handle-ring" />
              <div className="student-ruler-handle-icon" data-testid="student-ruler-handle-icon">
                <Icon name="hand-draw" size={26} />
              </div>
              <div className="student-ruler-handle-grips">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`student-ruler-scrim${phase === "focus" ? " is-on" : ""}`} data-testid="ruler-scrim" aria-hidden="true" />
      {/* The wrapper only names the phase; MomoGuide's own fixed box is moved and sized from our CSS. */}
      <div className={`student-ruler-momo is-${phase}`}>
        <MomoGuide
          step={momoStep}
          height={phase === "docked" ? DOCKED_HEIGHT : FOCUS_HEIGHT}
          startDelay={START_DELAY_MS}
          extrasFrom="last"
          testId="number-momo"
          onDone={onMomoDone}
        >
          {showRing ? (
            <ThumbConfirm holdMs={2000} label={`Tahan jempol untuk nomor ${value}`} onConfirm={onThumbConfirm} testId="number-thumb" />
          ) : null}
        </MomoGuide>
      </div>
    </section>
  );
}
