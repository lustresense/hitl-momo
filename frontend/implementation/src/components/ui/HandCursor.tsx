"use client";
/**
 * The hand's cursor: a dot at the index fingertip, drawn above all UI, so the student sees where a resting
 * hand will select. It is shown only in camera mode while a reader publishes a hand, and it never takes a click.
 * It reads the shared hand cursor store and starts no tracker of its own.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHandCursor } from "../../hooks/useHandCursor";
import { useInputMode } from "../../hooks/useHandGesture";
import "./HandCursor.css";

// Only the first mounted cursor draws. A counter, not the DOM: two cursors mounted in one commit both see an
// empty DOM, so a DOM check would let both draw.
let mountedCursors = 0;

export function HandCursor() {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    mountedCursors += 1;
    setOwner(mountedCursors === 1);
    return () => {
      mountedCursors -= 1;
    };
  }, []);
  return owner ? <HandCursorDot /> : null;
}

function HandCursorDot() {
  const mode = useInputMode();
  const sample = useHandCursor();
  const cursor = sample?.cursor ?? null;
  if (mode !== "camera" || !cursor) return null;
  const x = cursor.x * window.innerWidth;
  const y = cursor.y * window.innerHeight;
  return createPortal(
    <div className="hand-cursor" data-hand-cursor="" aria-hidden="true" style={{ left: x, top: y, pointerEvents: "none" }} />,
    document.body,
  );
}
