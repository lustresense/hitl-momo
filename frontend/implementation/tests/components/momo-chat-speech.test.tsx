import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { LETTER_MS, MomoChat, dwellMs, typingMs } from "@/src/components/momo/MomoChat";

// The avatar is a separate animated slot (its own tests cover it); these tests are about the speech bubble.
vi.mock("@/src/components/momo/MomoAvatar", () => ({ MomoAvatar: () => null }));

const SHORT = "Halo, aku Momo."; // 15 letters: dots 410 ms, then one letter every 30 ms
const SECOND = "Ayo kita mulai!"; // 15 letters
const LONG = "Lorong ini berkabut dan lantainya penuh duri, jadi jalan pelan-pelan ya, Thinman harus keluar sampai papan petunjuk!";
const BOLD = "Aku barusan menemukan **Thinman**."; // shown as "Aku barusan menemukan Thinman."
const PLAIN_BOLD = "Aku barusan menemukan Thinman.";

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

  it("a long line is typed at the same 30 ms per letter as a short one (no speed-up to make it fit)", () => {
    expect(LONG.length).toBeGreaterThan(90);
    expect(LETTER_MS).toBe(30);
    render(<MomoChat lines={LONG} testId="speech" />);
    const doneAt = typingMs(LONG) + LONG.length * 30; // dots, then every letter
    tick(doneAt - 30);
    expect(bubbleText()).not.toBe(LONG);
    tick(35);
    expect(bubbleText()).toBe(LONG);
  });
});

describe("MomoChat has no skip: a tap, click, Space or Enter never shows a line early (Owner: the thumb is not a skip)", () => {
  it("a click on the typing line changes nothing", () => {
    render(<MomoChat lines={[SHORT, SECOND]} testId="speech" />);
    tick(500);
    expect(bubbleText()).toBe(SHORT.slice(0, 3));
    fireEvent.click(bubble()!);
    expect(bubbleText()).toBe(SHORT.slice(0, 3));
    tick(30);
    expect(bubbleText()).toBe(SHORT.slice(0, 4)); // typing carried on as normal
  });

  it("Space and Enter on the typing line change nothing", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(445);
    expect(bubbleText()).toBe("H");
    fireEvent.keyDown(bubble()!, { key: " " });
    expect(bubbleText()).toBe("H");
    fireEvent.keyDown(bubble()!, { key: "Enter" });
    expect(bubbleText()).toBe("H");
  });

  it("the typing line is plain text: no button role, no tab stop, no skip marker", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(440);
    const row = bubble()!;
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(row.getAttribute("data-skippable")).toBeNull();
    expect(row.getAttribute("aria-label")).toBeNull();
  });

  it("the live region is kept (screen readers still get the lines)", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    expect(document.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("MomoChat reading pauses match the reference timing", () => {
  it("dots and reading pause are the same functions as the Can reference (typingMs, dwellMs unchanged)", () => {
    expect(typingMs(SHORT)).toBe(410);
    expect(typingMs(LONG)).toBe(800);
    expect(dwellMs(SHORT)).toBe(1410);
    expect(dwellMs(LONG)).toBe(900 + LONG.length * 34);
  });

  it("the line stays on screen for its full dwell before the next one starts", () => {
    render(<MomoChat lines={[SHORT, SECOND]} testId="speech" />);
    tick(860 + dwellMs(SHORT) - 20);
    expect(bubbleText()).toBe(SHORT);
    tick(40);
    expect(dotsShown()).toBe(true);
  });
});

describe("MomoChat bold markers: **word** is shown in bold, the markers are never shown or typed", () => {
  it("renders **word** as strong text and never shows the stars", () => {
    render(<MomoChat lines={BOLD} testId="speech" />);
    tick(typingMs(PLAIN_BOLD) + PLAIN_BOLD.length * 30 + 5);
    const strong = document.querySelector('[data-testid="speech"] strong');
    expect(strong?.textContent).toBe("Thinman");
    expect(bubbleText()).toBe(PLAIN_BOLD);
    expect(document.querySelector('[role="status"]')!.textContent).toBe(PLAIN_BOLD);
  });

  it("types the bold word letter by letter, and no star is ever on screen", () => {
    render(<MomoChat lines={BOLD} testId="speech" />);
    const prefix = PLAIN_BOLD.indexOf("Thinman") + 2; // "Th" is on screen
    tick(typingMs(PLAIN_BOLD) + prefix * 30 + 5);
    expect(bubbleText()).toBe(PLAIN_BOLD.slice(0, prefix));
    expect(document.querySelector('[data-testid="speech"] strong')?.textContent).toBe("Th");
    expect(bubbleText()!.includes("*")).toBe(false);
  });

  it("the timing counts the visible letters only, never the markers", () => {
    expect(typingMs(BOLD)).toBe(typingMs(PLAIN_BOLD));
    expect(dwellMs(BOLD)).toBe(dwellMs(PLAIN_BOLD));
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

  it("the line still typing is outside the live region", () => {
    render(<MomoChat lines={SHORT} testId="speech" />);
    tick(440); // one letter on screen
    const typingRow = bubble()!;
    expect(typingRow.textContent).toBe("H");
    expect(typingRow.closest('[role="status"]')).toBeNull();
    tick(420); // complete: the whole line is now the one the live region reads
    expect(bubble()!.closest('[role="status"]')).not.toBeNull();
  });
});

describe("MomoChat finishing: onDone (last line typed) and onAllShown (typed and read)", () => {
  it("onDone fires once when the last line is fully typed; the cue waits for onAllShown", () => {
    const onDone = vi.fn();
    render(
      <MomoChat lines={[SHORT]} testId="speech" onDone={onDone}>
        <button type="button" data-testid="cue">Lanjut</button>
      </MomoChat>,
    );
    tick(440);
    expect(onDone).not.toHaveBeenCalled();
    tick(420);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="cue"]')).toBeNull();
    tick(dwellMs(SHORT));
    expect(document.querySelector('[data-testid="cue"]')).not.toBeNull();
    tick(2000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("onAllShown fires once, after the last line is typed AND its reading pause has passed", () => {
    const onAllShown = vi.fn();
    render(<MomoChat lines={[SHORT, SECOND]} testId="speech" onAllShown={onAllShown} />);
    // Line 1: dots 410 + 450 typing, then dwell 1410. Line 2: dots 410 + 450 typing, then dwell 1410.
    const lastTyped = 860 + dwellMs(SHORT) + 410 + 450; // 3130 ms
    tick(lastTyped + dwellMs(SECOND) - 20);
    expect(onAllShown).not.toHaveBeenCalled();
    tick(25);
    expect(onAllShown).toHaveBeenCalledTimes(1);
    tick(5000);
    expect(onAllShown).toHaveBeenCalledTimes(1);
  });

  it("onAllShown with reduced motion waits for the dwell of the last line too", () => {
    setReducedMotion(true);
    const onAllShown = vi.fn();
    render(<MomoChat lines={SHORT} testId="speech" onAllShown={onAllShown} />);
    expect(onAllShown).not.toHaveBeenCalled();
    tick(dwellMs(SHORT) - 20);
    expect(onAllShown).not.toHaveBeenCalled();
    tick(25);
    expect(onAllShown).toHaveBeenCalledTimes(1);
  });

  it("extrasFrom=last shows its children only once onAllShown has fired", () => {
    render(
      <MomoChat lines={SHORT} testId="speech" extrasFrom="last">
        <button type="button" data-testid="cue">Lanjut</button>
      </MomoChat>,
    );
    tick(860 + dwellMs(SHORT) - 20);
    expect(document.querySelector('[data-testid="cue"]')).toBeNull();
    tick(25);
    expect(document.querySelector('[data-testid="cue"]')).not.toBeNull();
  });
});
