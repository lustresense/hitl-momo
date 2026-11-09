/**
 * One shared hand cursor for every NUI control on screen.
 *
 * A page's own hand reader (the drawing driver, the gameplay driver) and the shared thumb tracker publish the
 * index fingertip here. Dwell buttons and the hand cursor read it, so a screen with a reader never starts a
 * second MediaPipe model. Framework-free, like shared-stream: drivers publish without rendering.
 */
import type { HandPose } from "../input/hand-gesture";

export type HandSource = "drawing" | "gameplay" | "tracker";

export interface HandCursorPoint {
  x: number;
  y: number;
}

export interface HandSample {
  /** Index fingertip, mirrored and clamped to 0..1 (see indexTipNormalized); null while no hand is in view. */
  cursor: HandCursorPoint | null;
  pose?: HandPose;
  thumbUp?: boolean;
  pinch?: boolean;
  source: HandSource;
}

/** A reader that has not published for this long is gone (its loop stopped or the camera stalled). */
export const HAND_READER_TTL_MS = 500;
/** How often a reader that is still loading (no frames yet) tells the store it is alive. */
export const HAND_READER_HEARTBEAT_MS = 200;
/** Listeners are told only about a move of at least this much (normalized); the stored value always follows the hand. */
export const HAND_CURSOR_EPSILON = 0.003;

type Listener = (sample: HandSample | null) => void;
interface Entry {
  sample: HandSample;
  at: number;
}

const entries = new Map<HandSource, Entry>();
const listeners = new Set<Listener>();
/** What listeners were last told; a move is judged against this, so small moves cannot add up unnoticed. */
let notified: HandSample | null = null;
let notifiedReader = false;
let expiry: ReturnType<typeof setTimeout> | null = null;

function live(entry: Entry, now: number): boolean {
  return now - entry.at < HAND_READER_TTL_MS;
}

/** The sample to show: a page's driver beats the shared tracker, the newest publish wins among equals. */
function pick(now: number): HandSample | null {
  let best: { sample: HandSample; at: number; rank: number } | null = null;
  for (const entry of entries.values()) {
    if (!live(entry, now)) continue;
    const rank = entry.sample.source === "tracker" ? 1 : 2;
    if (!best || rank > best.rank || (rank === best.rank && entry.at > best.at)) {
      best = { sample: entry.sample, at: entry.at, rank };
    }
  }
  return best?.sample ?? null;
}

function readerLive(now: number): boolean {
  for (const [source, entry] of entries) {
    if (source !== "tracker" && live(entry, now)) return true;
  }
  return false;
}

function differs(a: HandSample | null, b: HandSample | null): boolean {
  if (a === null || b === null) return (a === null) !== (b === null);
  if (a.source !== b.source || a.pose !== b.pose || a.thumbUp !== b.thumbUp || a.pinch !== b.pinch) return true;
  if (a.cursor === null || b.cursor === null) return (a.cursor === null) !== (b.cursor === null);
  return Math.abs(a.cursor.x - b.cursor.x) >= HAND_CURSOR_EPSILON || Math.abs(a.cursor.y - b.cursor.y) >= HAND_CURSOR_EPSILON;
}

/** Drops expired readers, tells listeners when the shown sample or reader presence changed, and re-arms the expiry. */
function refresh(): void {
  const now = Date.now();
  for (const [source, entry] of entries) {
    if (!live(entry, now)) entries.delete(source);
  }
  const next = pick(now);
  const reader = readerLive(now);
  if (reader !== notifiedReader || differs(notified, next)) {
    notified = next;
    notifiedReader = reader;
    for (const listener of [...listeners]) listener(next);
  }
  armExpiry(now);
}

/** One timer, set for the moment the oldest reader runs out, so an expiry is noticed on time. */
function armExpiry(now: number): void {
  if (expiry !== null || entries.size === 0) return;
  let soonest = Infinity;
  for (const entry of entries.values()) soonest = Math.min(soonest, entry.at + HAND_READER_TTL_MS);
  expiry = setTimeout(() => {
    expiry = null;
    refresh();
  }, Math.max(0, soonest - now));
}

function clearExpiry(): void {
  if (expiry !== null) clearTimeout(expiry);
  expiry = null;
}

/**
 * A reader's frame: its fingertip (or null while no hand is in view) and pose. A null argument means no reader
 * at all, so it clears every source; a driver that stops calls retireHand for its own source instead.
 */
export function publishHand(sample: HandSample | null): void {
  if (sample === null) {
    entries.clear();
    clearExpiry();
    refresh();
    return;
  }
  const copy: HandSample = {
    ...sample,
    cursor: sample.cursor ? { x: sample.cursor.x, y: sample.cursor.y } : null,
  };
  entries.set(sample.source, { sample: copy, at: Date.now() });
  refresh();
}

/**
 * Keeps an existing reader alive without changing its fingertip. A reader that has not published yet is not
 * created here: only publishHand can start one, so a touch after a retire cannot bring a stopped reader back.
 */
export function touchHandReader(source: HandSource): void {
  const entry = entries.get(source);
  if (entry) entry.at = Date.now();
}

/** Touches the reader every heartbeat until the returned function is called. */
export function startHandHeartbeat(source: HandSource): () => void {
  const id = setInterval(() => touchHandReader(source), HAND_READER_HEARTBEAT_MS);
  return () => clearInterval(id);
}

/** A reader stopped: forget its source only, so another reader on screen keeps the cursor. */
export function retireHand(source: HandSource): void {
  if (!entries.delete(source)) return;
  refresh();
}

/** The fingertip to use now, or null when no reader (driver or tracker) is live. */
export function getHandCursor(): HandSample | null {
  return pick(Date.now());
}

/** True while a page's own driver (drawing or gameplay) is publishing. The shared tracker does not count. */
export function hasActiveReader(): boolean {
  return readerLive(Date.now());
}

/** Calls the listener now with the current sample, then on every change that matters (see HAND_CURSOR_EPSILON). */
export function subscribeHandCursor(listener: Listener): () => void {
  listeners.add(listener);
  listener(pick(Date.now()));
  return () => {
    listeners.delete(listener);
  };
}

/** TEST ONLY. */
export function resetHandCursorForTest(): void {
  entries.clear();
  listeners.clear();
  clearExpiry();
  notified = null;
  notifiedReader = false;
}
