"use client";
/**
 * React bridges for the shared hand cursor store: the fingertip a screen should show, and whether a page's own
 * hand driver is reading the camera. Components re-render only when the store reports a change that matters.
 */
import { useEffect, useState } from "react";
import { getHandCursor, hasActiveReader, subscribeHandCursor, type HandSample } from "../camera/hand-cursor-store";

/** The fingertip to show now, or null when no reader (driver or tracker) is live. */
export function useHandCursor(): HandSample | null {
  const [sample, setSample] = useState<HandSample | null>(getHandCursor);
  useEffect(() => subscribeHandCursor(setSample), []);
  return sample;
}

/** True while a page's own driver (drawing or gameplay) is reading the camera. */
export function useHandReaderLive(): boolean {
  const [live, setLive] = useState(hasActiveReader);
  useEffect(() => subscribeHandCursor(() => setLive(hasActiveReader())), []);
  return live;
}
