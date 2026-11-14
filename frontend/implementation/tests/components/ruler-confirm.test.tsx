import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentRulerSelector, RULER_SETTLE_MS } from "@/src/components/onboarding/StudentRulerSelector";
import { resetInputModeForTest } from "@/src/input/input-mode";
import { resetThumbTrackerForTest, simulateThumb } from "@/src/camera/thumb-tracker";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const KEY = "sketchbook.studentNumber";
const INTRO = "Sebelum kita masuk, pilih nomor absenmu dulu, ya.";
const HINT = "Geser penggarisnya sampai pas.";
const ask = (n: number) => `Benar ini nomor absenmu, ${n}?`;
const OFFLINE = "Nomormu kusimpan di perangkat ini. Kelas belum terhubung.";
/** Typing of the intro line (wait + dots + letters) ends about 2.6 s after mount. */
const INTRO_TYPED_MS = 3000;
/** Intro typed, then the reading pause, then the 0.6 s dock: Momo is small and the scrim is gone. */
const DOCKED_MS = 5200;
/** Each line starts after a 0.5 s wait, then types its dots and letters. Margins are generous. */
const HINT_TYPED_MS = 2500;
/** The ring fills only after the thumb was seen released once: a thumb raised before the ring shows does not count. */
const RING_SETTLE_MS = 100;

let store: Map<string, string>;

function advance(ms: number) {
  for (let t = 0; t < ms; t += 16) act(() => { vi.advanceTimersByTime(16); });
}
/** Advances in small steps until the condition holds. Typing speed belongs to MomoChat, so tests wait for the text. */
function advanceUntil(done: () => boolean, maxMs = 20_000) {
  for (let t = 0; t < maxMs && !done(); t += 16) act(() => { vi.advanceTimersByTime(16); });
}
const slider = () => screen.getByRole("slider", { name: "Nomor absen" });
const value = () => Number(slider().getAttribute("aria-valuenow"));
const momoWrap = () => document.querySelector(".student-ruler-momo") as HTMLElement;
const scrim = () => document.querySelector(".student-ruler-scrim") as HTMLElement;
const avatarHeight = () => (document.querySelector(".momo-chat__avatar") as HTMLElement).style.height;
const momoText = () => document.querySelector(".momo-chat")?.textContent ?? "";
const thumb = () => screen.queryByTestId("number-thumb");

function mount(props: Partial<Parameters<typeof StudentRulerSelector>[0]> = {}) {
  const onConfirm = vi.fn();
  const utils = render(<StudentRulerSelector onConfirm={onConfirm} {...props} />);
  return { onConfirm, ...utils };
}

describe("StudentRulerSelector: Momo focus, pick and confirm (BIGPROMPT 6.2, storyboard 6-8)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetThumbTrackerForTest();
    store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a new student starts at number 1 (not 20)", () => {
    mount();
    advance(DOCKED_MS);
    expect(value()).toBe(1);
    expect(slider().getAttribute("aria-valuetext")).toBe("1 dari 30");
  });

  it("the grab handle is drawn on the centre marker", () => {
    mount();
    const handle = screen.getByTestId("student-ruler-handle");
    expect(handle.querySelectorAll("span")).toHaveLength(3);
  });

  it("30 s without interaction: no question and no thumb ring", () => {
    const { onConfirm } = mount();
    advance(30_000);
    expect(momoText()).not.toContain("Benar ini nomor absenmu");
    expect(thumb()).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("focus phase: scrim on, Momo big in the middle, ruler locked", () => {
    mount();
    expect(momoWrap().classList.contains("is-focus")).toBe(true);
    expect(scrim().classList.contains("is-on")).toBe(true);
    expect(avatarHeight()).toBe("320px");
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(value()).toBe(1);
    advance(RULER_SETTLE_MS + 50);
    expect(thumb()).toBeNull();
  });

  it("focus phase says the pick sentence in full", () => {
    mount();
    advance(INTRO_TYPED_MS);
    expect(momoText()).toContain(INTRO);
  });

  it("after the sentence and a reading pause: scrim fades and Momo shrinks to the docked corner", () => {
    mount();
    advance(INTRO_TYPED_MS);
    expect(momoWrap().classList.contains("is-focus")).toBe(true);
    advance(DOCKED_MS - INTRO_TYPED_MS);
    expect(momoWrap().classList.contains("is-docked")).toBe(true);
    expect(scrim().classList.contains("is-on")).toBe(false);
    expect(avatarHeight()).toBe("150px");
    advance(HINT_TYPED_MS);
    expect(momoText()).toContain(HINT);
    expect(thumb()).toBeNull();
  });

  it("the ruler stays quiet until the student moves it; then Momo asks after 0.6 s of rest", () => {
    mount();
    advance(DOCKED_MS);
    expect(momoText()).not.toContain("Benar ini nomor absenmu");
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(value()).toBe(2);
    advance(RULER_SETTLE_MS / 2);
    expect(momoText()).not.toContain("Benar ini nomor absenmu");
    advanceUntil(() => momoText().includes(ask(2)));
    expect(momoText()).toContain(ask(2));
    advanceUntil(() => thumb() !== null);
    expect(thumb()?.getAttribute("data-hold-ms")).toBe("2000");
  });

  it("the thumb ring appears only after the question is fully said", () => {
    mount();
    advance(DOCKED_MS);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    advance(RULER_SETTLE_MS + 300);
    expect(thumb()).toBeNull();
    advanceUntil(() => thumb() !== null);
    expect(thumb()).not.toBeNull();
    expect(momoText()).toContain(ask(2));
  });

  it("moving the ruler again hides the ring at once", () => {
    mount();
    advance(DOCKED_MS);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    advanceUntil(() => thumb() !== null);
    expect(thumb()).not.toBeNull();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(thumb()).toBeNull();
  });

  it("a 2 s thumbs-up confirms the shown number exactly once", () => {
    const { onConfirm } = mount();
    advance(DOCKED_MS);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    advanceUntil(() => thumb() !== null);
    advance(RING_SETTLE_MS);
    act(() => simulateThumb(true));
    advance(1500);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(700);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(2);
    advance(5000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("the heading stays for screen readers but is visually hidden", () => {
    mount();
    const heading = screen.getByRole("heading", { name: "GESER PENGGARIS SESUAI NOMOR ABSENMU" });
    expect(heading.classList.contains("visually-hidden")).toBe(true);
  });

  it("shows no keyboard hints", () => {
    const { container } = mount();
    advance(DOCKED_MS);
    expect(container.textContent ?? "").not.toMatch(/panah|keyboard|tombol/i);
  });

  it("a saved number is shown, but nothing is asked before the student moves the ruler", () => {
    store.set(KEY, "7");
    mount();
    advance(INTRO_TYPED_MS);
    expect(momoWrap().classList.contains("is-focus")).toBe(true);
    expect(value()).toBe(7);
    advance(DOCKED_MS);
    advance(RULER_SETTLE_MS * 10);
    expect(momoText()).not.toContain(ask(7));
    expect(thumb()).toBeNull();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    advanceUntil(() => thumb() !== null);
    expect(momoText()).toContain(ask(7));
  });

  it("a taken number: Momo says so and offers no ring", () => {
    mount({ takenNumbers: [1] });
    advance(DOCKED_MS + HINT_TYPED_MS);
    expect(momoText()).toContain("Nomor itu sudah ada yang pakai. Geser ke nomor lain ya.");
    expect(thumb()).toBeNull();
  });

  it("no class session: after the thumbs-up Momo says so honestly, then the choice is sent once", () => {
    const { onConfirm } = mount({ classStatus: "failed" });
    advance(DOCKED_MS);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    advanceUntil(() => thumb() !== null);
    advance(RING_SETTLE_MS);
    act(() => simulateThumb(true));
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();
    advanceUntil(() => momoText().includes(OFFLINE));
    expect(momoText()).toContain(OFFLINE);
    expect(onConfirm).not.toHaveBeenCalled();
    advanceUntil(() => onConfirm.mock.calls.length > 0);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(2);
    advance(4000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a joined class: the thumbs-up sends the choice at once", () => {
    const { onConfirm } = mount({ classStatus: "joined" });
    advance(DOCKED_MS);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    advanceUntil(() => thumb() !== null);
    advance(RING_SETTLE_MS);
    act(() => simulateThumb(true));
    advance(2100);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(2);
  });

  it("unmount during the honest line cancels the send", () => {
    const { onConfirm, unmount } = mount({ classStatus: "none" });
    advance(DOCKED_MS);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    advanceUntil(() => thumb() !== null);
    advance(RING_SETTLE_MS);
    act(() => simulateThumb(true));
    advance(2300);
    unmount();
    advance(10_000);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("the handle renders pinch icon and ring feedback", () => {
    mount();
    const handle = screen.getByTestId("student-ruler-handle");
    expect(screen.getByTestId("student-ruler-handle-icon")).not.toBeNull();
    expect(screen.getByTestId("student-ruler-handle-ring")).not.toBeNull();
    expect(handle.querySelector(".nb-icon--gesture")).not.toBeNull();
  });

  it("the pinch hint slides the ruler body left-right, never the white centre marker", () => {
    mount();
    advance(DOCKED_MS);
    const ruler = slider();
    expect(ruler.classList.contains("is-hinting")).toBe(true);
    expect(ruler.querySelector(".student-ruler-track")).not.toBeNull();
    // The marker stays a static reference: it gains no motion class of its own.
    const handle = screen.getByTestId("student-ruler-handle");
    expect(handle.className).not.toMatch(/hint/);
    // First move ends the idle hint.
    fireEvent.keyDown(ruler, { key: "ArrowRight" });
    expect(ruler.classList.contains("is-hinting")).toBe(false);
  });

  it("slider updates large number in real time while dragging", () => {
    mount();
    advance(DOCKED_MS);
    expect(value()).toBe(1);

    // Start dragging
    fireEvent(slider(), new MouseEvent("pointerdown", { clientX: 200, bubbles: true }));
    expect(screen.getByTestId("student-ruler-handle").classList.contains("is-dragging")).toBe(true);

    // Drag left by 44px (SPACING is 44px, dragging left moves forward)
    act(() => { fireEvent(slider(), new MouseEvent("pointermove", { clientX: 156, bubbles: true })); });
    expect(value()).toBe(2);

    // Drag left by another 44px
    act(() => { fireEvent(slider(), new MouseEvent("pointermove", { clientX: 112, bubbles: true })); });
    expect(value()).toBe(3);

    // Release drag after settling velocity
    advance(150);
    act(() => { fireEvent(slider(), new MouseEvent("pointerup", { clientX: 112, bubbles: true })); });
    expect(value()).toBe(3);
  });
});
