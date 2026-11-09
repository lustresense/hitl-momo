import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MomoChat, dwellMs, typingMs } from "@/src/components/momo/MomoChat";

// The avatar is a separate animated slot (its own tests cover it); these tests are about the speech bubble.
vi.mock("@/src/components/momo/MomoAvatar", () => ({ MomoAvatar: () => null }));

const SHORT = "Halo, aku Momo."; // 15 letters: dots 410 ms, then one letter every 30 ms
const SECOND = "Ayo kita mulai!"; // 15 letters
const LONG = "Lorong ini berkabut dan lantainya penuh duri, jadi jalan pelan-pelan ya, Thinman harus keluar sampai papan petunjuk!";

/** Moves the fake clock in 5 ms steps. React commits (and schedules the next letter) between the steps. */
function tick(ms: number) {
  for (let t = 0; t < ms; t += 5) act(() => { vi.advanceTimersByTime(5); });
}
const bubble = () => document.querySelector('[data-testid="speech"] .momo-chat__bubble:not(.momo-chat__typing)') as HTMLElement | null;
const bubbleText = () => bubble()?.textContent ?? null;
const dotsShown = () => document.querySelector('[data-testid="speech"] .momo-chat__typing') !== null;

function setReducedMotion(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  setReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe("MomoChat typing effect (brief a)", () => {
  it("types one letter every 30 ms, after the typing dots", () => {
    expect(typingMs(SHORT)).toBe(410);
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(405);
    expect(dotsShown()).toBe(true);
    expect(bubbleText()).toBeNull();
    tick(35); // 440 ms: the first letter
    expect(bubbleText()).toBe("H");
    tick(30);
    expect(bubbleText()).toBe("Ha");
    tick(385); // 855 ms: fourteen letters, the last one is still missing
    expect(bubbleText()).toBe(SHORT.slice(0, 14));
    tick(5); // 860 ms: the whole line
    expect(bubbleText()).toBe(SHORT);
  });

  it("finishes a long line within 2.5 s in total, dots included", () => {
    expect(LONG.length).toBeGreaterThan(90);
    render(<MomoChat lines={LONG} testId="speech" />);
    tick(2400);
    expect(bubbleText()).not.toBe(LONG);
    tick(100);
    expect(bubbleText()).toBe(LONG);
  });
});

describe("MomoChat tap to finish the line (brief b)", () => {
  it("a tap on the bubble shows the whole line at once and does not move the conversation on", () => {
    const onDone = vi.fn();
    render(<MomoChat lines={[SHORT, SECOND]} testId="speech" onDone={onDone} />);
    tick(500);
    expect(bubbleText()).toBe(SHORT.slice(0, 3)); // still typing: the tap is what completes it
    fireEvent.click(bubble()!); // at 500 ms
    expect(bubbleText()).toBe(SHORT);
    tick(dwellMs(SHORT) - 20); // 1890 ms: the first line's dwell has not ended yet
    expect(bubbleText()).toBe(SHORT); // still the first line: the tap did not skip ahead
    expect(onDone).not.toHaveBeenCalled();
    tick(40); // 1930 ms: the dwell (ends at 1910 ms) is over, the second line starts with dots
    expect(dotsShown()).toBe(true);
    expect(bubbleText()).toBeNull();
    tick(1000); // 2930 ms: the second line is fully typed
    expect(bubbleText()).toBe(SECOND);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Space on the bubble shows the whole line", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(445); // only "H" is on screen
    expect(bubbleText()).toBe("H");
    fireEvent.keyDown(bubble()!, { key: " " });
    expect(bubbleText()).toBe(SHORT);
  });

  it("Enter on the bubble shows the whole line", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(445);
    expect(bubbleText()).toBe("H"); // still typing when Enter is pressed
    fireEvent.keyDown(bubble()!, { key: "Enter" });
    expect(bubbleText()).toBe(SHORT);
  });

  it("a tap after the line is finished changes nothing", () => {
    render(<MomoChat lines={[SHORT, SECOND]} testId="speech" />);
    tick(865); // first line complete, waiting out its dwell
    expect(bubbleText()).toBe(SHORT);
    fireEvent.click(bubble()!);
    expect(bubbleText()).toBe(SHORT);
    tick(dwellMs(SHORT) - 100);
    expect(bubbleText()).toBe(SHORT);
  });
});

describe("MomoChat reduced motion (brief c)", () => {
  it("shows each line in full at once, with no dots and no letters, and no line is lost", () => {
    setReducedMotion(true);
    render(<MomoChat lines={[SHORT, SECOND]} testId="speech" />);
    expect(bubbleText()).toBe(SHORT);
    expect(dotsShown()).toBe(false);
    tick(dwellMs(SHORT) + 5);
    expect(bubbleText()).toBe(SECOND);
    expect(dotsShown()).toBe(false);
  });

  it("typing off (lines appear immediately) also keeps every line, each one in full", () => {
    render(<MomoChat lines={[SHORT, SECOND]} typing={false} testId="speech" />);
    expect(bubbleText()).toBe(SHORT);
    tick(dwellMs(SHORT) + 5);
    expect(bubbleText()).toBe(SECOND);
  });

  it("stacked lines with typing off are all on screen at once (mission hint)", () => {
    render(<MomoChat lines={[SHORT, SECOND]} stack typing={false} testId="speech" />);
    const texts = Array.from(document.querySelectorAll('[data-testid="speech"] .momo-chat__bubble')).map((el) => el.textContent);
    expect(texts).toEqual([SHORT, SECOND]);
  });
});

describe("MomoChat keeps its text when props do not change (brief d)", () => {
  it("a new array with the same lines does not start the typing again", () => {
    const { rerender } = render(<MomoChat lines={[SHORT]} testId="speech" />);
    tick(600);
    const before = bubbleText();
    expect(before).toBe(SHORT.slice(0, 6));
    rerender(<MomoChat lines={[SHORT]} testId="speech" onDone={() => {}} />);
    expect(bubbleText()).toBe(before);
  });

  it("toggling typing off and back on with the same lines does not type them again", () => {
    const { rerender } = render(<MomoChat lines={SHORT} testId="speech" typing />);
    tick(1000);
    expect(bubbleText()).toBe(SHORT);
    rerender(<MomoChat lines={SHORT} testId="speech" typing={false} />);
    expect(bubbleText()).toBe(SHORT);
    rerender(<MomoChat lines={SHORT} testId="speech" typing />);
    expect(bubbleText()).toBe(SHORT);
    expect(dotsShown()).toBe(false);
  });

  it("new lines never show their full text before their own typing starts", () => {
    const { rerender, container } = render(<MomoChat lines={["Pertama satu.", "Kedua satu."]} testId="speech" />);
    tick(5000);
    const observer = new MutationObserver(() => {});
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    act(() => { rerender(<MomoChat lines={["Baru satu.", "Baru dua yang panjang."]} testId="speech" />); });
    const seen: string[] = [];
    for (const record of observer.takeRecords()) {
      record.addedNodes.forEach((node) => seen.push(node.textContent ?? ""));
      if (record.type === "characterData") seen.push(record.target.textContent ?? "");
    }
    observer.disconnect();
    expect(seen.some((text) => text.includes("Baru dua yang panjang."))).toBe(false);
    expect(seen.some((text) => text.includes("Baru satu."))).toBe(false);
  });
});

describe("MomoChat screen reader text (brief f)", () => {
  it("the polite live region reads each line once, when it is complete", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    const live = document.querySelector('[role="status"]') as HTMLElement | null;
    expect(live).not.toBeNull();
    expect(live!.getAttribute("aria-live")).toBe("polite");
    const observer = new MutationObserver(() => {});
    observer.observe(live!, { childList: true, subtree: true, characterData: true });
    tick(440); // one letter on screen: nothing is announced yet
    tick(420); // the line is complete
    const spoken: string[] = [];
    for (const record of observer.takeRecords()) {
      record.addedNodes.forEach((node) => spoken.push(node.textContent ?? ""));
      if (record.type === "characterData") spoken.push(record.target.textContent ?? "");
    }
    observer.disconnect();
    expect(spoken).toEqual([SHORT]);
  });

  it("the line still typing is outside the live region, named as a button and never aria-hidden while focusable", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(440); // one letter on screen
    const typingRow = bubble()!;
    expect(typingRow.textContent).toBe("H");
    expect(typingRow.closest('[role="status"]')).toBeNull();
    expect(typingRow.getAttribute("aria-hidden")).toBeNull();
    expect(typingRow.tabIndex).toBe(0);
    expect(typingRow.getAttribute("role")).toBe("button");
    expect(typingRow.getAttribute("aria-label")).toBe("Tampilkan teks lengkap");
    tick(420); // complete: the whole line is now the one the live region reads
    expect(bubble()!.closest('[role="status"]')).not.toBeNull();
  });
});

describe("MomoChat finishing and stacked lines", () => {
  it("calls onDone once, when the last line is fully typed, and shows the cue only then", () => {
    const onDone = vi.fn();
    render(
      <MomoChat lines={[SHORT]} testId="speech" onDone={onDone}>
        <button type="button" data-testid="cue">Lanjut</button>
      </MomoChat>,
    );
    tick(440);
    expect(onDone).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="cue"]')).toBeNull();
    tick(420);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="cue"]')).not.toBeNull();
    tick(2000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
