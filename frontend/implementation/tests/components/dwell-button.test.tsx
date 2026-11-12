import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishHand, resetHandCursorForTest, retireHand, type HandCursorPoint, type HandSource } from "@/src/camera/hand-cursor-store";
import { DwellButton } from "@/src/components/ui/DwellButton";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { cursorAtPx } from "./gesture-stub";

// The shared tracker is replaced by a spy: these tests check when the dwell asks for it, not MediaPipe.
const { acquire, release } = vi.hoisted(() => {
  const release = vi.fn();
  return { release, acquire: vi.fn(() => release) };
});
vi.mock("@/src/camera/thumb-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/camera/thumb-tracker")>();
  return { ...actual, acquireThumbTracker: acquire };
});

type Box = { left: number; top: number; width: number; height: number };

/** Gives the button a fixed on-screen rectangle (jsdom lays nothing out). */
function place(el: HTMLElement, box: Box) {
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

const BOX: Box = { left: 100, top: 100, width: 240, height: 60 };
const INSIDE = cursorAtPx(200, 130);
const OUTSIDE = cursorAtPx(20, 20);

/**
 * A reader on the screen: a driver publishes its fingertip every frame, so the test publishes at 60 fps too.
 * `readFrom` sets what it reports; `null` means no hand in view.
 */
let reader: { cursor: HandCursorPoint | null; source: HandSource } | null = null;
function readFrom(cursor: HandCursorPoint | null, source: HandSource = "drawing") {
  reader = { cursor, source };
  // A driver's frame is a React-visible event on the page: flush the subscribers inside act, as the app does.
  act(() => publishHand({ cursor, source }));
}
/** The driver stopped: it retires its reader, and the test stops replaying its frames. */
function stopReader(source: HandSource) {
  reader = null;
  act(() => retireHand(source));
}
function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) {
    act(() => {
      if (reader) publishHand({ cursor: reader.cursor, source: reader.source });
      vi.advanceTimersByTime(16);
    });
  }
}

function useFakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
}

describe("DwellButton in camera mode (the fingertip hovers)", () => {
  beforeEach(() => {
    useFakeClock();
    resetInputModeForTest();
    resetHandCursorForTest();
    reader = null;
    acquire.mockClear();
    release.mockClear();
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function setup(props: { dwellMs?: number; disabled?: boolean } = {}) {
    const onActivate = vi.fn();
    render(
      <DwellButton onActivate={onActivate} label="Pakai papan" testId="target" dwellMs={props.dwellMs} disabled={props.disabled}>
        papan
      </DwellButton>,
    );
    const el = screen.getByTestId("target");
    place(el, BOX);
    // The page's own driver is the reader on these screens: the button must not start a tracker of its own.
    readFrom(null, "drawing");
    return { onActivate, el };
  }

  it("fires once after the full dwell (1200 ms by default) with the fingertip inside", () => {
    const { onActivate } = setup();
    advance(50);
    readFrom(INSIDE);
    advance(1100);
    expect(onActivate).not.toHaveBeenCalled();
    advance(300);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("the ring fills while the fingertip stays on the button", () => {
    const { el } = setup();
    advance(50);
    readFrom(INSIDE);
    advance(600);
    const pct = Number(el.getAttribute("data-progress"));
    expect(pct).toBeGreaterThan(40);
    expect(pct).toBeLessThan(60);
  });

  it("leaving the button drains the ring slowly, not at once", () => {
    const { el } = setup();
    advance(50);
    readFrom(INSIDE);
    advance(600);
    readFrom(OUTSIDE);
    advance(160);
    const drained = Number(el.getAttribute("data-progress"));
    expect(drained).toBeGreaterThan(0);
    expect(drained).toBeLessThan(50);
    advance(2000);
    expect(el.getAttribute("data-progress")).toBe("0");
  });

  it("latches: staying on the button after it fired does not fire again", () => {
    const { onActivate } = setup();
    advance(50);
    readFrom(INSIDE);
    advance(1400);
    expect(onActivate).toHaveBeenCalledTimes(1);
    advance(3000);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("must leave the button before it can fire again", () => {
    const { onActivate } = setup();
    advance(50);
    readFrom(INSIDE);
    advance(1400);
    readFrom(OUTSIDE);
    advance(50);
    readFrom(INSIDE);
    advance(1400);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("a button already under the fingertip when it appears waits until the fingertip has left it once", () => {
    const { onActivate } = setup();
    readFrom(INSIDE);
    advance(1500);
    expect(onActivate).not.toHaveBeenCalled();
    readFrom(OUTSIDE);
    advance(50);
    readFrom(INSIDE);
    advance(1400);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("honours a shorter dwellMs", () => {
    const { onActivate } = setup({ dwellMs: 600 });
    advance(50);
    readFrom(INSIDE);
    advance(500);
    expect(onActivate).not.toHaveBeenCalled();
    advance(200);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("of two overlapping buttons only the first under the fingertip fills; the other stays empty", () => {
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    render(
      <>
        <DwellButton onActivate={onFirst} label="Satu" testId="first">satu</DwellButton>
        <DwellButton onActivate={onSecond} label="Dua" testId="second">dua</DwellButton>
      </>,
    );
    place(screen.getByTestId("first"), BOX);
    place(screen.getByTestId("second"), { ...BOX, top: 120 }); // overlaps the first, both contain the fingertip
    readFrom(null, "drawing");
    advance(50);
    readFrom(INSIDE);
    advance(600);
    expect(screen.getByTestId("second").getAttribute("data-progress")).toBe("0");
    advance(800);
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).not.toHaveBeenCalled();
  });

  it("a mouse click still activates at once", () => {
    const { onActivate, el } = setup();
    fireEvent.click(el);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("disabled: neither dwell nor click activates", () => {
    const { onActivate, el } = setup({ disabled: true });
    advance(50);
    readFrom(INSIDE);
    advance(1500);
    fireEvent.click(el);
    expect(onActivate).not.toHaveBeenCalled();
    expect(el.getAttribute("data-progress")).toBe("0");
  });

  it("exposes the NUI markers: data-nui-target, aria-label and camera mode", () => {
    const { el } = setup();
    expect(el.hasAttribute("data-nui-target")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("Pakai papan");
    expect(el.getAttribute("data-mode")).toBe("camera");
  });
});

describe("DwellButton reads the one shared hand cursor", () => {
  beforeEach(() => {
    useFakeClock();
    resetInputModeForTest();
    resetHandCursorForTest();
    reader = null;
    acquire.mockClear();
    release.mockClear();
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function mount() {
    const onActivate = vi.fn();
    render(<DwellButton onActivate={onActivate} label="Keluar" testId="target">keluar</DwellButton>);
    const el = screen.getByTestId("target");
    place(el, BOX);
    return { onActivate, el };
  }

  it("with no page reader it starts the shared tracker after a short wait, and the tracker's fingertip drives the dwell", () => {
    const { onActivate } = mount();
    advance(400);
    expect(acquire).toHaveBeenCalledTimes(1);
    readFrom(INSIDE, "tracker");
    advance(1300);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("with a page reader on the screen it never starts a tracker", () => {
    const { onActivate } = mount();
    readFrom(OUTSIDE, "drawing");
    advance(50);
    readFrom(INSIDE, "drawing");
    advance(1500);
    expect(acquire).not.toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("a reader that is still starting (published in the same tick) prevents the tracker", () => {
    mount();
    readFrom(null, "gameplay");
    advance(1000);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("releases the tracker it started as soon as a page reader appears", () => {
    mount();
    advance(400);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    readFrom(null, "drawing");
    advance(16);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("when the page reader stops, the button takes the tracker again", () => {
    mount();
    readFrom(null, "gameplay");
    advance(400);
    expect(acquire).not.toHaveBeenCalled();
    stopReader("gameplay");
    advance(400);
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it("releases its tracker when it unmounts", () => {
    const { el } = mount();
    expect(el).toBeTruthy();
    advance(400);
    cleanup();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the fingertip is over an element that covers the button", () => {
    const { onActivate, el } = mount();
    const cover = document.createElement("div");
    document.body.appendChild(cover);
    const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => cover });
    try {
      readFrom(INSIDE, "drawing");
      advance(1500);
      expect(onActivate).not.toHaveBeenCalled();
      expect(el.getAttribute("data-progress")).toBe("0");
    } finally {
      if (original) Object.defineProperty(document, "elementFromPoint", original);
      else delete (document as unknown as Record<string, unknown>).elementFromPoint;
      cover.remove();
    }
  });

  it("fires when the topmost element under the fingertip is a descendant of the button", () => {
    const { onActivate, el } = mount();
    const child = document.createElement("span");
    el.appendChild(child);
    const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => child });
    try {
      readFrom(OUTSIDE, "drawing");
      advance(50); // the fingertip starts outside, so the button is armed
      readFrom(INSIDE, "drawing");
      advance(1400);
      expect(onActivate).toHaveBeenCalledTimes(1);
    } finally {
      if (original) Object.defineProperty(document, "elementFromPoint", original);
      else delete (document as unknown as Record<string, unknown>).elementFromPoint;
    }
  });
});

describe("DwellButton in fallback mode (no camera)", () => {
  beforeEach(() => {
    useFakeClock();
    resetInputModeForTest();
    resetHandCursorForTest();
    reader = null;
    acquire.mockClear();
    forceInputMode("fallback");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a click activates directly, no dwell ring is used and no tracker is started", () => {
    const onActivate = vi.fn();
    render(<DwellButton onActivate={onActivate} label="Coba lagi" testId="target">Coba lagi</DwellButton>);
    const el = screen.getByTestId("target");
    place(el, BOX);
    readFrom(INSIDE, "tracker");
    advance(1500);
    expect(onActivate).not.toHaveBeenCalled();
    expect(el.getAttribute("data-progress")).toBe("0");
    expect(acquire).not.toHaveBeenCalled();
    fireEvent.click(el);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(el.getAttribute("data-mode")).toBe("fallback");
  });
});

describe("DwellButton shapes for the corner, the submit and the mission hint", () => {
  beforeEach(() => {
    useFakeClock();
    resetInputModeForTest();
    resetHandCursorForTest();
    reader = null;
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("an icon-only button keeps its name for screen readers and hides the text", () => {
    render(
      <DwellButton onActivate={vi.fn()} iconOnly label="Keluar Level" title="Keluar level" testId="corner">
        Keluar
      </DwellButton>,
    );
    const el = screen.getByTestId("corner");
    expect(el.getAttribute("aria-label")).toBe("Keluar Level");
    expect(el.getAttribute("title")).toBe("Keluar level");
    expect(el.classList.contains("dwell-btn--icon-only")).toBe(true);
  });

  it("the tone and the bare frame are classes the stylesheet can target", () => {
    render(
      <>
        <DwellButton onActivate={vi.fn()} tone="accent" testId="accent">Tebak</DwellButton>
        <DwellButton onActivate={vi.fn()} tone="cue" testId="cue">Ayo</DwellButton>
        <DwellButton onActivate={vi.fn()} bare testId="bare">Tutup</DwellButton>
      </>,
    );
    expect(screen.getByTestId("accent").classList.contains("dwell-btn--accent")).toBe(true);
    expect(screen.getByTestId("cue").classList.contains("dwell-btn--cue")).toBe(true);
    expect(screen.getByTestId("bare").classList.contains("dwell-btn--bare")).toBe(true);
  });

  it("forwards its ref to the real button, so a dialog can focus its primary action", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<DwellButton ref={ref} onActivate={vi.fn()} testId="focusable">Mulai</DwellButton>);
    expect(ref.current).toBe(screen.getByTestId("focusable"));
  });
});
