import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureRing, type GestureRingProps } from "@/src/components/ui/GestureRing";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}

const ring = () => screen.getByTestId("gesture-ring");
const progress = () => Number(ring().getAttribute("data-progress"));

type Props = Partial<GestureRingProps>;

/** Mounts a ring; `view` re-renders it with new props, the way the parent screen does when the pose changes. */
function mount(initial: Props = {}) {
  const onConfirm = vi.fn();
  const base: GestureRingProps = { active: false, holdMs: 1500, onConfirm, label: "Coba lagi", ...initial };
  const utils = render(<GestureRing {...base} />);
  const view = (next: Props) => utils.rerender(<GestureRing {...base} {...next} onConfirm={onConfirm} />);
  return { onConfirm, view, unmount: utils.unmount };
}

describe("GestureRing: a finger pose fills the ring and confirms once", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("fills while the pose is active and fires onConfirm once at holdMs", () => {
    const { onConfirm, view } = mount();
    advance(32); // armed: the pose was seen absent
    view({ active: true });
    advance(1000);
    expect(progress()).toBeGreaterThan(40);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(700);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    advance(2000);
    expect(onConfirm).toHaveBeenCalledTimes(1); // latched while the pose stays
  });

  it("a pose shorter than holdMs does not fire, and losing it drains the ring", () => {
    const { onConfirm, view } = mount();
    advance(32);
    view({ active: true });
    advance(1000);
    const peak = progress();
    view({ active: false });
    advance(300);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress()).toBeLessThan(peak);
  });

  it("must release the pose before it can confirm again", () => {
    const { onConfirm, view } = mount();
    advance(32);
    view({ active: true });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    view({ active: false });
    advance(100);
    view({ active: true });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("a pose already held when the ring mounts does not fill it until the pose is released once", () => {
    const { onConfirm, view } = mount({ active: true });
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress()).toBe(0);
    view({ active: false });
    advance(32);
    view({ active: true });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a pose held through a lock must be released before the ring can fill after the unlock", () => {
    const { onConfirm, view } = mount({ locked: true });
    advance(32);
    view({ active: true });
    advance(1000);
    view({ locked: false });
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();
    view({ locked: false, active: false });
    advance(32);
    view({ locked: false, active: true });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a disabled ring never confirms", () => {
    const { onConfirm, view } = mount({ disabled: true });
    advance(32);
    view({ active: true });
    advance(3000);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(progress()).toBe(0);
  });

  it("unmounting mid-fill cancels the confirm", () => {
    const { onConfirm, view, unmount } = mount();
    advance(32);
    view({ active: true });
    advance(800);
    unmount();
    advance(3000);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("GestureRing: locked state", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    forceInputMode("camera");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stays visible, grey and padlocked, and shows the lockedProgress instead of a gesture fill", () => {
    const { onConfirm, view } = mount({ locked: true, lockedProgress: 0.4 });
    advance(32);
    view({ active: true });
    advance(3000);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(ring().getAttribute("data-state")).toBe("locked");
    expect(ring().getAttribute("aria-disabled")).toBe("true");
    expect(progress()).toBe(40);
    expect(ring().querySelector(".gesture-ring__lock")).not.toBeNull();
  });

  it("the lock is the visible state even when the reading progress is zero", () => {
    mount({ locked: true });
    expect(ring().getAttribute("data-state")).toBe("locked");
    expect(progress()).toBe(0);
  });

  it("unlocking hands the ring back to the gesture", () => {
    const { onConfirm, view } = mount({ locked: true, lockedProgress: 1 });
    advance(32);
    view({ locked: false, active: true });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("GestureRing: fallback (no camera) and keyboard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    forceInputMode("fallback");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a press held for holdMs fires once; a short press and a plain click do nothing", () => {
    const { onConfirm } = mount();
    const btn = screen.getByRole("button", { name: "Coba lagi" });
    fireEvent.pointerDown(btn);
    advance(1000);
    fireEvent.pointerUp(btn);
    advance(200);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.pointerDown(btn);
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(btn);
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("holding Enter or Space fills the ring like a press", () => {
    const { onConfirm } = mount();
    const btn = screen.getByRole("button", { name: "Coba lagi" });
    advance(32); // armed: the ring has seen no hold yet
    fireEvent.keyDown(btn, { key: "Enter" });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(btn, { key: "Enter" });
    advance(100);
    fireEvent.keyDown(btn, { key: " " });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(2);
    fireEvent.keyUp(btn, { key: " " });
  });

  it("releasing the pointer early cancels the fill", () => {
    const { onConfirm } = mount();
    const btn = screen.getByRole("button", { name: "Coba lagi" });
    fireEvent.pointerDown(btn);
    advance(1000);
    fireEvent.pointerLeave(btn);
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("GestureRing: markup", () => {
  beforeEach(() => {
    resetInputModeForTest();
    forceInputMode("camera");
  });
  afterEach(() => cleanup());

  it("is a real button named by its label, with the body text as children", () => {
    render(
      <GestureRing active={false} holdMs={1500} onConfirm={() => {}} label="Pilih papan, peringkat 1">
        <span>Papan</span>
      </GestureRing>,
    );
    const btn = screen.getByRole("button", { name: "Pilih papan, peringkat 1" });
    expect(btn.textContent).toContain("Papan");
  });

  it("the caption is the label when there are no children", () => {
    render(<GestureRing active={false} holdMs={1500} onConfirm={() => {}} label="Gambar lagi" />);
    expect(screen.getByRole("button", { name: "Gambar lagi" }).textContent).toContain("Gambar lagi");
  });

  it("passes aria-pressed and aria-expanded through for a selected choice and an open list", () => {
    render(<GestureRing active={false} holdMs={1500} onConfirm={() => {}} label="Pilih ember" pressed expanded />);
    const btn = screen.getByRole("button", { name: "Pilih ember" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the touch target at least 56 px in its stylesheet", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "src/components/ui/GestureRing.css"), "utf8");
    const minHeight = Number(css.match(/\.gesture-ring\s*\{[^}]*min-height:\s*(\d+)px/)?.[1]);
    expect(minHeight).toBeGreaterThanOrEqual(56);
  });
});
