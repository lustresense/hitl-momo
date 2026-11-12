import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HAND_CURSOR_EPSILON,
  HAND_READER_TTL_MS,
  getHandCursor,
  hasActiveReader,
  publishHand,
  resetHandCursorForTest,
  retireHand,
  startHandHeartbeat,
  subscribeHandCursor,
  touchHandReader,
  type HandSample,
} from "@/src/camera/hand-cursor-store";

const at = (x: number, y = 0.5): HandSample => ({ cursor: { x, y }, source: "drawing" });

describe("shared hand cursor store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHandCursorForTest();
  });
  afterEach(() => {
    resetHandCursorForTest();
    vi.useRealTimers();
  });

  it("returns nothing and reports no reader before anything is published", () => {
    expect(getHandCursor()).toBeNull();
    expect(hasActiveReader()).toBe(false);
  });

  it("keeps the latest published fingertip and marks a driver as an active reader", () => {
    publishHand(at(0.25, 0.75));
    expect(getHandCursor()).toEqual({ cursor: { x: 0.25, y: 0.75 }, source: "drawing" });
    expect(hasActiveReader()).toBe(true);
  });

  it("a reader with no hand in view is still a reader (cursor null)", () => {
    publishHand({ cursor: null, source: "gameplay" });
    expect(hasActiveReader()).toBe(true);
    expect(getHandCursor()?.cursor).toBeNull();
  });

  it("the shared tracker alone is not a reader: a dwell may start it, and it must not count itself", () => {
    publishHand({ cursor: { x: 0.4, y: 0.4 }, source: "tracker" });
    expect(getHandCursor()?.source).toBe("tracker");
    expect(hasActiveReader()).toBe(false);
  });

  it("a driver's reader expires on its own after the TTL without a new publish", () => {
    publishHand(at(0.5));
    vi.advanceTimersByTime(HAND_READER_TTL_MS - 1);
    expect(hasActiveReader()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(hasActiveReader()).toBe(false);
    expect(getHandCursor()).toBeNull();
  });

  it("subscribers hear the expiry of a reader even when nothing else publishes", () => {
    const listener = vi.fn();
    subscribeHandCursor(listener);
    publishHand(at(0.5));
    listener.mockClear();
    vi.advanceTimersByTime(HAND_READER_TTL_MS + 5);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("a steady reader stays active while it keeps publishing", () => {
    for (let i = 0; i < 20; i++) {
      publishHand(at(0.5));
      vi.advanceTimersByTime(100);
    }
    expect(hasActiveReader()).toBe(true);
  });

  it("does not notify for a fingertip that moves less than the epsilon", () => {
    const listener = vi.fn();
    subscribeHandCursor(listener);
    publishHand(at(0.5));
    listener.mockClear();
    publishHand(at(0.5 + HAND_CURSOR_EPSILON / 2));
    publishHand(at(0.5 + HAND_CURSOR_EPSILON / 3));
    expect(listener).not.toHaveBeenCalled();
    // The stored value still follows the hand, so a reader never reports a stale position.
    expect(getHandCursor()?.cursor?.x).toBeCloseTo(0.5 + HAND_CURSOR_EPSILON / 3);
  });

  it("notifies once the fingertip has moved at least the epsilon from the last notified point", () => {
    const listener = vi.fn();
    subscribeHandCursor(listener);
    publishHand(at(0.5));
    listener.mockClear();
    publishHand(at(0.5 + HAND_CURSOR_EPSILON));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies when the cursor appears or disappears", () => {
    const listener = vi.fn();
    subscribeHandCursor(listener);
    publishHand({ cursor: null, source: "drawing" });
    listener.mockClear();
    publishHand(at(0.5));
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    publishHand({ cursor: null, source: "drawing" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a driver's cursor wins over the shared tracker while both publish", () => {
    publishHand({ cursor: { x: 0.9, y: 0.9 }, source: "tracker" });
    publishHand(at(0.1, 0.1));
    publishHand({ cursor: { x: 0.8, y: 0.8 }, source: "tracker" });
    expect(getHandCursor()).toEqual({ cursor: { x: 0.1, y: 0.1 }, source: "drawing" });
  });

  it("retireHand removes only that source; a null publish clears everything", () => {
    publishHand(at(0.2));
    publishHand({ cursor: { x: 0.8, y: 0.8 }, source: "tracker" });
    retireHand("drawing");
    expect(hasActiveReader()).toBe(false);
    expect(getHandCursor()?.source).toBe("tracker");
    publishHand(at(0.3));
    publishHand(null);
    expect(getHandCursor()).toBeNull();
    expect(hasActiveReader()).toBe(false);
  });

  it("an unsubscribed listener hears nothing more", () => {
    const listener = vi.fn();
    const unsub = subscribeHandCursor(listener);
    unsub();
    listener.mockClear();
    publishHand(at(0.5));
    expect(listener).not.toHaveBeenCalled();
  });

  it("a new subscriber is told the current value at once", () => {
    publishHand(at(0.42, 0.24));
    const listener = vi.fn();
    subscribeHandCursor(listener);
    expect(listener).toHaveBeenCalledWith({ cursor: { x: 0.42, y: 0.24 }, source: "drawing" });
  });

  it("a heartbeat keeps a reader alive while it loads its model (no frames yet)", () => {
    publishHand({ cursor: null, source: "drawing" });
    const stop = startHandHeartbeat("drawing");
    vi.advanceTimersByTime(HAND_READER_TTL_MS * 4);
    expect(hasActiveReader()).toBe(true);
    stop();
    vi.advanceTimersByTime(HAND_READER_TTL_MS + 5);
    expect(hasActiveReader()).toBe(false);
  });

  it("a touch refreshes a reader without changing its fingertip", () => {
    publishHand(at(0.6, 0.3));
    vi.advanceTimersByTime(HAND_READER_TTL_MS - 10);
    touchHandReader("drawing");
    vi.advanceTimersByTime(HAND_READER_TTL_MS - 10);
    expect(hasActiveReader()).toBe(true);
    expect(getHandCursor()?.cursor).toEqual({ x: 0.6, y: 0.3 });
  });

  it("a touch never brings back a reader that was retired", () => {
    publishHand(at(0.5));
    retireHand("drawing");
    touchHandReader("drawing");
    expect(hasActiveReader()).toBe(false);
    expect(getHandCursor()).toBeNull();
  });
});
