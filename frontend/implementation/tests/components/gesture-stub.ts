/**
 * Test double for the shared hand tracker, used through vi.mock("@/src/hooks/useHandGesture").
 * setHandGesture() plays the part of the tracker's frame loop: every mounted consumer re-renders with the
 * new reading, the same way the real hook does when the tracker publishes.
 */
import { useEffect, useState } from "react";
import { vi } from "vitest";
import type { HandGestureState } from "@/src/camera/thumb-tracker";
import { publishHand, retireHand, touchHandReader } from "@/src/camera/hand-cursor-store";

const IDLE: HandGestureState = { ready: true, handVisible: false, thumbUp: false, pinch: false, cursor: null };

let current: HandGestureState = IDLE;
const listeners = new Set<(state: HandGestureState) => void>();

/**
 * The stub stands for the one reader on the screen. It publishes like a driver, and it keeps publishing while the
 * test holds the hand: a real reader publishes every frame, and the store forgets a silent reader after 500 ms.
 */
const STUB_HEARTBEAT_MS = 200;
let beat: ReturnType<typeof setTimeout> | null = null;

function keepReaderAlive(): void {
  if (beat !== null) return;
  const tick = () => {
    touchHandReader("drawing");
    beat = setTimeout(tick, STUB_HEARTBEAT_MS);
  };
  beat = setTimeout(tick, STUB_HEARTBEAT_MS);
}

function stopKeepingReaderAlive(): void {
  if (beat !== null) clearTimeout(beat);
  beat = null;
}

function publishToStore(): void {
  publishHand({ cursor: current.handVisible ? current.cursor : null, thumbUp: current.thumbUp, pinch: current.pinch, source: "drawing" });
  keepReaderAlive();
}

export function setHandGesture(patch: Partial<HandGestureState>): void {
  current = { ...current, ...patch };
  publishToStore();
  for (const listener of [...listeners]) listener(current);
}

export function resetHandGesture(): void {
  current = IDLE;
  stopKeepingReaderAlive();
  retireHand("drawing");
  listeners.clear();
}

export type Box = { left: number; top: number; width: number; height: number };

/** Gives an element a fixed on-screen rectangle, since jsdom lays nothing out. */
export function placeBox(el: HTMLElement, box: Box): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON() {},
  } as DOMRect);
}

/** Normalised cursor for a point in CSS pixels of the jsdom viewport (innerWidth x innerHeight). */
export function cursorAtPx(x: number, y: number): { x: number; y: number } {
  return { x: x / window.innerWidth, y: y / window.innerHeight };
}

/** Same signature as the real useHandGesture(active); only subscribes while active, like the real one. */
export function useHandGestureStub(active = true): HandGestureState {
  const [state, setState] = useState<HandGestureState>(current);
  useEffect(() => {
    if (!active) return;
    setState(current);
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, [active]);
  return state;
}
