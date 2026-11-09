"use client";
/**
 * The thumbs-up of a page's own hand reader, for a ThumbConfirm on a screen that has one (the drawing page under
 * the level intro and the level list). Undefined while no page reader is live: the ring then starts the shared
 * tracker itself, as on every screen without a reader. Passing it keeps a second MediaPipe model off the camera.
 *
 * It re-renders only when the thumb changes, not on every fingertip move (useHandCursor would, at frame rate).
 */
import { useEffect, useState } from "react";
import { getHandCursor, subscribeHandCursor } from "../../camera/hand-cursor-store";
import { useHandReaderLive } from "../../hooks/useHandCursor";

const readThumb = (): boolean => getHandCursor()?.thumbUp === true;

export function usePageThumb(): boolean | undefined {
  const live = useHandReaderLive();
  const [thumb, setThumb] = useState(readThumb);
  useEffect(() => subscribeHandCursor(() => setThumb(readThumb())), []);
  return live ? thumb : undefined;
}
