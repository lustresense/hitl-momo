// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { ENDING_COPY } from "@/src/domain/copy/ending";
import { BackToCoverRing, EndingScreen } from "@/src/features/ending";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";

function ControllerProbe({ onReady }: { onReady: (ctrl: NuiController) => void }) {
  const ctrl = useNui();
  useEffect(() => {
    onReady(ctrl);
  }, [ctrl, onReady]);
  return null;
}

function mockElementRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

const sampleStrokesA = [[{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 60 }]];
const sampleStrokesB = [[{ x: 5, y: 40 }, { x: 80, y: 40 }]];
const sampleStrokesC = [[{ x: 20, y: 5 }, { x: 20, y: 70 }, { x: 60, y: 70 }]];

const realSessionRecaps: LevelRecap[] = [
  {
    levelId: "stage-1-foundation",
    title: "Bab 1",
    strokes: sampleStrokesA,
    finalLabel: "tangga",
    category: "padat",
    decision: "accept",
    firstGuess: "tangga",
    firstGuessConfidence: 0.84,
    redrawCount: 1,
  },
  {
    levelId: "stage-2-ambiguity",
    title: "Bab 2",
    strokes: sampleStrokesB,
    finalLabel: "jembatan",
    category: "padat",
    decision: "correct",
    firstGuess: "bangku",
    redrawCount: 2,
  },
  {
    levelId: "stage-3-validation",
    title: "Bab 3",
    strokes: sampleStrokesC,
    finalLabel: "ember",
    category: "netral",
    decision: "override",
    firstGuess: "kaktus",
    redrawCount: 0,
  },
];

describe("EndingScreen & BackToCoverRing (r8.3 5 fase penutup)", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("mounts phase 1 (payung) with Pusat Halaman SVG, parachute, and Thinman under [data-ui='r83']", () => {
    const onChoose = vi.fn();
    render(
      <EndingScreen
        recaps={realSessionRecaps}
        onChoose={onChoose}
        studentName="Rani"
      />,
    );

    const frame = screen.getByTestId("r83-ending-screen");
    expect(frame.getAttribute("data-ui")).toBe("r83");
    expect(screen.getByTestId("r83-ending-app").getAttribute("data-phase")).toBe("payung");
    expect(screen.getByTestId("r83-ending-center-art")).toBeDefined();
    const chute = screen.getByTestId("r83-ending-chute");
    const thinman = screen.getByTestId("r83-ending-thinman");
    expect(chute).toBeDefined();
    expect(thinman.getAttribute("data-alive")).toBe("false");
    // ParachuteScene must initialize Thinman side SVG, initial coordinates, and chute alignment on mount.
    expect(thinman.querySelector(".tm-art svg")).not.toBeNull();
    expect(thinman.style.left).toMatch(/%$/);
    expect(thinman.style.top).toMatch(/%$/);
    expect(chute.style.left).toMatch(/%$/);
    expect(chute.style.top).toMatch(/%$/);
    // Momo starts directly at the corner anchor without clipping or stray origin jump.
    const momo = frame.querySelector<HTMLElement>(".r83-momo");
    expect(momo?.getAttribute("data-anchor")).toBe("corner");
    expect(screen.getByText(ENDING_COPY.payung.launchLine)).toBeDefined();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("renders kolam phase with ink pond and keeps Thinman alive after bicara/rekap", () => {
    render(<EndingScreen recaps={realSessionRecaps} onChoose={vi.fn()} initialPhase="kolam" />);
    expect(screen.getByTestId("r83-ending-app").getAttribute("data-phase")).toBe("kolam");
    expect(screen.getByTestId("r83-ending-pond")).toBeDefined();
    const thinman = screen.getByTestId("r83-ending-thinman");
    expect(thinman.getAttribute("data-alive")).toBe("false");
    expect(thinman.querySelector(".tm-art svg")).not.toBeNull();
    expect(screen.getByTestId("r83-ending-hint").textContent).toBe(ENDING_COPY.kolam.hint);
  });

  it("renders recap from real session recaps with student strokes and Level titles (no sample balok/papan/tali)", () => {
    render(
      <EndingScreen
        recaps={realSessionRecaps}
        onChoose={vi.fn()}
        initialPhase="rekap"
      />,
    );

    const recapBox = screen.getByTestId("r83-ending-recap");
    expect(recapBox.textContent).toContain(ENDING_COPY.rekap.cardLabel);

    // Every recorded item uses O-8 "Level N" + student stroke SVG + real finalLabel
    const s1 = screen.getByTestId("r83-recap-slot-stage-1-foundation");
    const s2 = screen.getByTestId("r83-recap-slot-stage-2-ambiguity");
    const s3 = screen.getByTestId("r83-recap-slot-stage-3-validation");

    expect(within(s1).getByText("Level 1")).toBeDefined();
    expect(within(s1).getByText("Tangga")).toBeDefined();
    expect(s1.querySelector("svg.rc-art path")?.getAttribute("d")?.startsWith("M")).toBe(true);

    expect(within(s2).getByText("Level 2")).toBeDefined();
    expect(within(s2).getByText("Jembatan")).toBeDefined();
    expect(s2.querySelector("svg.rc-art path")?.getAttribute("d")?.startsWith("M")).toBe(true);

    expect(within(s3).getByText("Level 3")).toBeDefined();
    expect(within(s3).getByText("Ember")).toBeDefined();
    expect(s3.querySelector("svg.rc-art path")?.getAttribute("d")?.startsWith("M")).toBe(true);

    // Strict check: sandbox sample labels balok/papan/tali MUST NEVER appear
    const fullText = recapBox.textContent?.toLowerCase() ?? "";
    expect(fullText).not.toMatch(/\bbalok\b|\bpapan\b|\btali\b/);

    // Advance timers through intro (500ms) -> flying (2*430 + 750ms) -> counts (600ms) -> next ring
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      vi.advanceTimersByTime(1700);
    });
    expect(screen.getByTestId("r83-ending-screen").textContent).toContain(
      "Kamu setuju sama tebakanku 1 kali, pilih tebakan lain 1 kali, tolak semua 1 kali, gambar ulang 3 kali.",
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId("r83-ending-recap-next")).toBeDefined();
  });

  it("renders an honest empty recap when recaps is empty without fabricating sample cards", () => {
    render(<EndingScreen recaps={[]} onChoose={vi.fn()} initialPhase="rekap" />);

    const recapBox = screen.getByTestId("r83-ending-recap");
    const emptyMsg = screen.getByTestId("r83-recap-empty");
    expect(emptyMsg.textContent).toBe(ENDING_COPY.rekap.emptyMessage);
    expect(screen.queryAllByTestId(/^r83-recap-slot-/)).toHaveLength(0);

    const lower = recapBox.textContent?.toLowerCase() ?? "";
    expect(lower).not.toMatch(/\bbalok\b|\bpapan\b|\btali\b/);

    // Empty recap skips flying and advances intro -> counts -> Lanjut ring safely
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId("r83-ending-recap-next")).toBeDefined();
  });

  it("BackToCoverRing requires 2000ms Rule A pinch hold and fires onConfirm once", async () => {
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const onChoose = vi.fn();

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <ControllerProbe onReady={(c) => { ctrl = c; }} />
        <BackToCoverRing onConfirm={() => onChoose("finish")} />
      </NuiProvider>,
    );

    const ring = screen.getByTestId("r83-ending-back-to-cover");
    mockElementRect(ring, { left: 200, top: 200, width: 96, height: 112 });

    // Quick click (< 2000ms) does not fire
    act(() => {
      now = 100;
      ts.push({ t: now, x: 20, y: 20, inFrame: true, pinch: true });
      for (let i = 0; i < 6; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 20, y: 20, inFrame: true, pinch: false });
      ctrl?.stepNow(now);
    });
    await Promise.resolve();
    expect(onChoose).not.toHaveBeenCalled();

    // Hold Rule A anywhere (far from ring) for 2000ms -> fires onChoose("finish")
    await act(async () => {
      now += 1000; // drain previous partial progress
      ctrl?.stepNow(now);
      now += 60;
      ts.push({ t: now, x: 700, y: 500, inFrame: true, pinch: true });
      for (let i = 0; i < 42; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 700, y: 500, inFrame: true, pinch: false });
      await Promise.resolve();
    });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("finish");
  });

  it("EndingScreen in akhir phase shows FINISH_LINES and calls onChoose('finish') via BackToCoverRing", async () => {
    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;
    const onChoose = vi.fn();

    render(
      <NuiProvider testSource={ts} clock={() => now}>
        <ControllerProbe onReady={(c) => { ctrl = c; }} />
        <EndingScreen recaps={realSessionRecaps} onChoose={onChoose} initialPhase="akhir" />
      </NuiProvider>,
    );

    expect(screen.getByTestId("r83-ending-app").getAttribute("data-phase")).toBe("akhir");
    expect(screen.getByText(ENDING_COPY.akhir.lines[0])).toBeDefined();

    // Wait for finish line 0 -> line 1 -> BackToCoverRing
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(ENDING_COPY.akhir.lines[1])).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    const backRing = screen.getByTestId("r83-ending-back-to-cover");
    mockElementRect(backRing, { left: 300, top: 300, width: 96, height: 112 });

    await act(async () => {
      now = 100;
      ts.push({ t: now, x: 50, y: 50, inFrame: true, pinch: true });
      for (let i = 0; i < 42; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 50, y: 50, inFrame: true, pinch: false });
      await Promise.resolve();
    });

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("finish");
  });
});
