"use client";
/**
 * PRD 0.0.16 R4/R13 — React bridges for the shared thumb tracker and the input mode.
 * useHandGesture(active) holds the single tracker only while `active` (a ThumbConfirm is on screen).
 */
import { useEffect, useState } from "react";
import {
  acquireThumbTracker,
  getHandGestureState,
  simulatePinch,
  simulateThumb,
  subscribeHandGesture,
  type HandGestureState,
} from "../camera/thumb-tracker";
import { forceInputMode, getInputMode, subscribeInputMode, type InputMode } from "../input/input-mode";

export function useHandGesture(active = true): HandGestureState {
  const [state, setState] = useState<HandGestureState>(getHandGestureState);
  useEffect(() => {
    if (!active) return;
    const release = acquireThumbTracker();
    const unsub = subscribeHandGesture(setState);
    return () => {
      unsub();
      release();
    };
  }, [active]);
  return state;
}

export function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(getInputMode);
  useEffect(() => subscribeInputMode(setMode), []);
  return mode;
}

declare global {
  interface Window {
    /** TEST HOOKS ONLY: true = thumbs-up, false = hand without thumb, null = real tracking. */
    __skbThumb?: (value: boolean | null) => void;
    /** TEST HOOKS ONLY: true = pinch (cubit), false = open hand, null = real tracking. */
    __skbPinch?: (value: boolean | null) => void;
    /** TEST HOOKS ONLY: force "camera" or "fallback" mode, null = automatic. */
    __skbInputMode?: (mode: InputMode | null) => void;
  }
}

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_TEST_HOOKS === "1") {
  window.__skbThumb = simulateThumb;
  window.__skbPinch = simulatePinch;
  window.__skbInputMode = forceInputMode;
}
