// @vitest-environment jsdom
/**
 * R12b-FLOW: ruler -> tutorial cards -> level list is a page turn. The real BookFlip (GSAP) and the real hand-off hook
 * run together. The old screen's Momo fades while the leaf lifts; the new screen mounts only at the midpoint (edge-on);
 * until then the old Momo stays the only Momo. GSAP ticks on real frames, so these tests use real timers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { BookFlip, BOOK_FLIP_DURATION } from "@/src/components/ui/BookFlip";
import { useScreenHandoff, SCREEN_FADE_MS } from "@/src/app/hooks/useScreenHandoff";

type Screen = "ruler" | "cards";

/** Event log (in order) plus the time of each event, so the test can check the midpoint timing too. */
function Harness({ log }: { log: Array<{ event: string; at: number }> }) {
  const handoff = useScreenHandoff();
  const [current, setCurrent] = useState<Screen>("ruler");
  const [book, setBook] = useState(0);

  useEffect(() => {
    if (current === "cards") log.push({ event: "mount:cards", at: performance.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          handoff.turn(() => setCurrent("cards"));
          setBook((n) => n + 1);
        }}
      >
        Lanjut
      </button>
      <div
        data-testid="screen"
        className={handoff.entering ? "screen-handoff is-entering" : handoff.leaving ? "screen-handoff is-leaving" : "screen-handoff"}
      >
        <div className="momo-guide" data-testid="momo">
          {current === "ruler" ? "Momo di penggaris" : "Momo di kartu"}
        </div>
      </div>
      <BookFlip
        playKey={book}
        direction="open"
        onMidpoint={() => {
          log.push({ event: "midpoint", at: performance.now() });
          handoff.midpoint();
        }}
      />
    </>
  );
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function momoCount() {
  return document.querySelectorAll('[data-testid="momo"]').length;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ruler -> cards page turn (R12b-FLOW)", () => {
  for (const reduce of [false, true]) {
    it(`the cards mount only after the midpoint, never before (reduced motion: ${reduce})`, async () => {
      setReducedMotion(reduce);
      const log: Array<{ event: string; at: number }> = [];
      render(<Harness log={log} />);
      expect(screen.getByTestId("screen").textContent).toContain("Momo di penggaris");

      const tapAt = performance.now();
      act(() => screen.getByText("Lanjut").click());
      // Right after the tap the old screen is still there, leaving, and the new one is not mounted.
      expect(log.some((e) => e.event === "mount:cards")).toBe(false);
      expect(screen.getByTestId("screen").className).toContain("is-leaving");

      await waitFor(() => expect(log.some((e) => e.event === "midpoint")).toBe(true), { timeout: 3000 });
      await waitFor(() => expect(log.some((e) => e.event === "mount:cards")).toBe(true));
      const events = log.map((e) => e.event);
      expect(events.indexOf("midpoint")).toBeLessThan(events.indexOf("mount:cards"));
      const midAt = log.find((e) => e.event === "midpoint")!.at;
      // Edge-on is half the turn: not before ~the half (allow 150 ms of timer slack either way).
      expect(midAt - tapAt).toBeGreaterThanOrEqual((BOOK_FLIP_DURATION * 1000) / 2 - 150);
      expect(screen.getByTestId("screen").textContent).toContain("Momo di kartu");
    });
  }

  it("until the midpoint the old Momo is the only Momo, and the new one arrives only after the swap", async () => {
    setReducedMotion(false);
    const log: Array<{ event: string; at: number }> = [];
    render(<Harness log={log} />);
    act(() => screen.getByText("Lanjut").click());
    const seenBeforeSwap: string[] = [];
    while (!log.some((e) => e.event === "midpoint")) {
      // Sampled only before the midpoint: the new Momo must not be mounted yet.
      expect(momoCount()).toBe(1);
      expect(log.some((e) => e.event === "mount:cards")).toBe(false);
      seenBeforeSwap.push(screen.getByTestId("momo").textContent ?? "");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
    }
    expect(seenBeforeSwap.length).toBeGreaterThan(3);
    expect(seenBeforeSwap.every((t) => t.includes("Momo di penggaris"))).toBe(true);
  });

  it("the incoming screen settles back to a plain wrapper once its fade has ended", async () => {
    setReducedMotion(false);
    render(<Harness log={[]} />);
    act(() => screen.getByText("Lanjut").click());
    await waitFor(() => expect(screen.getByTestId("screen").className).toBe("screen-handoff is-entering"), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId("screen").className).toBe("screen-handoff"), {
      timeout: SCREEN_FADE_MS + 1500,
    });
  });
});
