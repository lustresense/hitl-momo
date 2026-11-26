// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeCoverLayout,
  computeCurlFrame,
  CoverScreen,
  type CoverPhase,
} from "@/src/features/cover";
import { computeNameParkingPose, computeSpiralCount } from "@/src/features/cover/cover-layout";
import {
  COVER_GATE_COPY,
  COVER_INTRO_COPY,
  COVER_NAME_COPY,
  formatCoverIntroLine0,
  formatNameConfirmPrompt,
  formatNameGreeting,
} from "@/src/domain/copy/cover";
import { NuiProvider, TestSource, useNui, type NuiController } from "@/src/nui";
import { useEffect } from "react";

function mockRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
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

function NuiProbe({ onReady }: { onReady: (c: NuiController) => void }) {
  const controller = useNui();
  useEffect(() => {
    onReady(controller);
  }, [controller, onReady]);
  return null;
}

describe("CoverScreen & r8.3 cover parity", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.className = "";
  });

  it("matches r8.3 FL desktop (bigY = smallY - 36, PIP 22/26 150x120) and mobile geometry + diagonal curl math", () => {
    const desk = computeCoverLayout(1280, 720);
    expect(desk.FL).toBe(true);
    expect(desk.bigY).toBe(desk.smallY - 36);
    expect(desk.pipX).toBe(22);
    expect(desk.pipW).toBe(150);
    expect(desk.pipH).toBe(120);
    expect(desk.pipY).toBe(720 - 120 - 26);

    const mob = computeCoverLayout(390, 844);
    expect(mob.FL).toBe(false);
    expect(mob.pipX).toBe(13);
    expect(mob.pipW).toBe(125);
    expect(mob.pipH).toBe(100);
    expect(mob.pipY).toBe(844 - 100 - 20);

    const midCurl = computeCurlFrame(0.5, 1280, 720);
    expect(midCurl.frontVisible).toBe(true);
    expect(midCurl.frontClipD).toContain("M ");
    expect(midCurl.rulerClipPath).toContain("polygon(");
    expect(midCurl.flapD).toContain("M ");
    expect(midCurl.flapOpacity).toBeGreaterThan(0);

    const doneCurl = computeCurlFrame(1, 1280, 720);
    expect(doneCurl.frontVisible).toBe(false);
    expect(doneCurl.rulerClipPath).toBe("none");
  });

  it("renders sleep + consent gate, enforces check -> Lanjut lock, and provides zero dead-end fallback when camera is denied", async () => {
    const phases: CoverPhase[] = [];
    const getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(
      <CoverScreen
        hasJoinToken={false}
        onComplete={vi.fn()}
        onPhaseChange={(ph) => phases.push(ph)}
      />,
    );

    expect(screen.getByTestId("r83-cover-screen").getAttribute("data-ui")).toBe("r83");
    expect(screen.getByTestId("r83-cover-screen").getAttribute("data-variant")).toBe("cover");
    expect(screen.getByTestId("r83-cover-momo").classList.contains("sleeping")).toBe(true);
    expect(screen.getByTestId("r83-camera-card").classList.contains("locked")).toBe(true);
    expect(screen.getByTestId("r83-gate-mumble").textContent).toBe(COVER_GATE_COPY.mumbleLines[0]);
    expect(screen.getByText(COVER_GATE_COPY.noteBody)).toBeDefined();

    // Locked camera toggle nudges instead of waking Momo
    fireEvent.click(screen.getByTestId("r83-camera-toggle"));
    expect(screen.getByTestId("r83-gate-mumble").textContent).toBe(COVER_GATE_COPY.flashUnchecked);
    expect(screen.getByTestId("r83-cover-momo").classList.contains("sleeping")).toBe(true);

    // Check consent -> state 1 -> click Lanjut -> state 2
    fireEvent.click(screen.getByTestId("r83-gate-checkbox"));
    expect(screen.getByTestId("r83-camera-gate").getAttribute("data-state")).toBe("1");
    expect(screen.getByTestId("r83-gate-mumble").textContent).toBe(COVER_GATE_COPY.mumbleLines[1]);

    fireEvent.click(screen.getByTestId("r83-camera-toggle"));
    expect(screen.getByTestId("r83-gate-mumble").textContent).toBe(COVER_GATE_COPY.flashNeedContinue);

    fireEvent.click(screen.getByTestId("r83-gate-go"));
    expect(screen.getByTestId("r83-camera-gate").getAttribute("data-state")).toBe("2");
    expect(screen.getByTestId("r83-camera-card").classList.contains("locked")).toBe(false);

    // Toggle camera -> denied -> fallback button shown (zero dead-end)
    await act(async () => {
      fireEvent.click(screen.getByTestId("r83-camera-toggle"));
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const fallbackBtn = screen.getByTestId("r83-camera-fallback-btn");
    expect(fallbackBtn.textContent).toBe(COVER_GATE_COPY.cameraFallbackButton);
    expect(screen.getByTestId("r83-cover-momo").classList.contains("sleeping")).toBe(true);

    // Clicking fallback wakes Momo and progresses without camera
    fireEvent.click(fallbackBtn);
    expect(phases).toContain("wake");
    expect(screen.getByTestId("r83-cover-momo").classList.contains("awake")).toBe(true);
  });

  it("keeps #book hidden during Momo fly-out (0..1.97s), reveals #book at curl start without doodles/scrim/hero", () => {
    render(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="book-curl"
        onComplete={vi.fn()}
      />,
    );

    const book = screen.getByTestId("r83-book");
    const momo = screen.getByTestId("r83-cover-momo");
    // During Momo's 0..1.97s fly-out to the right, #book stays hidden so Momo is never covered
    expect(book.style.display).toBe("none");
    expect(momo.style.zIndex).toBe("8");

    // Advance past fly-out (1.97s) into the diagonal peel -> #book reveals & Momo rises to zIndex 38
    act(() => {
      gsap.updateRoot(gsap.globalTimeline.time() + 2.05);
    });
    expect(book.style.display).toBe("block");
    expect(momo.style.zIndex).toBe("38");

    const frontCover = screen.getByTestId("r83-book-front-cover");
    expect(frontCover.querySelector("#cover-binding-clone")).not.toBeNull();
    expect(frontCover.querySelector("#cover-doodles-clone")).toBeNull();
    expect(frontCover.querySelector("#cover-hero")).toBeNull();
    expect(book.querySelector("#ruler-scrim")).toBeNull();
  });

  it("greets initialStudentName on intro line 0, keeps inside page blank during peel, lands Momo at Tutorial parking pose, and hands off immediately at curl end", () => {
    const onComplete = vi.fn();
    render(
      <CoverScreen
        hasJoinToken={true}
        initialPhase="intro"
        initialStudentName="Rani"
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("r83-cover-bubble").textContent).toContain(formatCoverIntroLine0("Rani"));
    expect(screen.getByTestId("r83-name-page").textContent).toBe("");
    expect(screen.queryByTestId("r83-book-inside-bubble")).toBeNull();
    expect(COVER_GATE_COPY.noteBody).not.toContain("Mik");

    cleanup();
    render(
      <CoverScreen
        hasJoinToken={true}
        initialPhase="book-curl"
        initialStudentName="Rani"
        onComplete={onComplete}
      />,
    );

    const rulerPage = screen.getByTestId("r83-name-page");
    const momo = screen.getByTestId("r83-cover-momo");
    expect(rulerPage.textContent).toBe("");
    expect(rulerPage.querySelector("#name-card")).toBeNull();
    expect(rulerPage.querySelector(".ruler-heading")).toBeNull();
    expect(screen.queryByTestId("r83-book-inside-bubble")).toBeNull();
    expect(rulerPage.style.backgroundColor).toBe("var(--nb-paper)");
    expect(rulerPage.style.backgroundSize).toBe("22px 22px");

    // Advances to t = 3.70s (right when curl 1.97 + 1.70 = 3.67s & Momo 2.52 + 1.15 = 3.67s finish, ZERO dead pause)
    act(() => {
      for (let i = 0; i < 37; i++) {
        gsap.updateRoot(gsap.globalTimeline.time() + 0.1);
      }
    });

    const layout = computeCoverLayout(window.innerWidth || 1024, window.innerHeight || 768);
    const park = computeNameParkingPose(layout);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ studentName: "Rani", needsRuler: false });
    expect(momo.style.zIndex).toBe("38");
    expect(momo.style.transform).toContain(`translate3d(${park.x.toFixed(2)}px,${park.y.toFixed(2)}px,0)`);
    expect(momo.style.transform).toContain(`scale(${park.s.toFixed(4)})`);
    expect(screen.getByTestId("r83-book").style.display).toBe("block");
  });

  it("preserves standalone book-curl -> name flow with focus pose and 1.7s arrival when skipNameStep is false", () => {
    const phases: CoverPhase[] = [];
    const onComplete = vi.fn();
    render(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="book-curl"
        onPhaseChange={(ph) => phases.push(ph)}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByTestId("r83-book-inside-bubble")).toBeDefined();
    expect(screen.getByTestId("r83-name-page").querySelector(".ruler-heading")).not.toBeNull();

    // At t = 3.7s, standalone flow is still mid-arrival (finishes at 1.97 + 0.9 + 1.7 = 4.57s)
    act(() => {
      for (let i = 0; i < 37; i++) {
        gsap.updateRoot(gsap.globalTimeline.time() + 0.1);
      }
    });
    expect(phases).not.toContain("name");

    act(() => {
      for (let i = 0; i < 12; i++) {
        gsap.updateRoot(gsap.globalTimeline.time() + 0.1);
      }
    });
    expect(phases).toContain("name");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes name typed fallback -> NUI confirm (Rule B 2000ms) -> name-exit -> onComplete without PII leak or Bima in prod", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onComplete = vi.fn();

    let now = 0;
    const ts = new TestSource(() => now);
    let ctrl: NuiController | null = null;

    const { container } = render(
      <NuiProvider testSource={ts} clock={() => now}>
        <NuiProbe onReady={(c) => { ctrl = c; }} />
        <CoverScreen
          hasJoinToken={true}
          initialPhase="name"
          devTools={false}
          onComplete={onComplete}
        />
      </NuiProvider>,
    );

    // Production guardrails: no #replay, no SIMULASI, no Bima anywhere in DOM
    expect(screen.queryByTestId("r83-cover-replay")).toBeNull();
    expect(container.textContent).not.toContain("SIMULASI");
    expect(container.textContent).not.toContain("Bima");
    expect(screen.getByTestId("r83-sound-wave").querySelectorAll(".bar").length).toBe(13);

    // Arm "Mulai bicara" (Rule A, 1000ms) -> stt-lab unavailable -> auto-fallback to typed box
    const startEl = screen.getByTestId("r83-name-start");
    mockRect(startEl, { left: 400, top: 400, width: 140, height: 110 });
    await act(async () => {
      now = 100;
      ts.push({ t: now, x: 100, y: 100, pinch: true });
      for (let i = 0; i < 22; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 100, y: 100, pinch: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("r83-name-type").classList.contains("on")).toBe(true);
    expect(screen.getByTestId("r83-name-note").textContent).toBe(COVER_NAME_COPY.typedUnavailableNote);

    // Empty submit stays in name step with hint
    fireEvent.click(screen.getByTestId("r83-name-type-submit"));
    expect(screen.getByTestId("r83-name-note").textContent).toBe(COVER_NAME_COPY.typedEmptyHint);

    // Valid name submit -> normalizes to "Rani Putri" -> name-confirm
    await act(async () => {
      fireEvent.change(screen.getByTestId("r83-name-input"), { target: { value: "halo nama saya rani putri" } });
      fireEvent.click(screen.getByTestId("r83-name-type-submit"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("r83-name-heard").textContent).toBe("Rani Putri");
    expect(screen.getByTestId("r83-book-inside-bubble").textContent).toBe(formatNameConfirmPrompt("Rani Putri"));

    // Confirm "Ya, itu namaku" (Rule B, 2000ms) via NUI pinch nearest to right target
    const againEl = screen.getByTestId("r83-name-again");
    const yesEl = screen.getByTestId("r83-name-yes");
    mockRect(againEl, { left: 200, top: 420, width: 150, height: 110 });
    mockRect(yesEl, { left: 460, top: 420, width: 150, height: 110 });

    act(() => {
      now += 100;
      ts.push({ t: now, x: 520, y: 470, pinch: false });
      ctrl?.stepNow(now);
    });
    expect(yesEl.classList.contains("nui-lit")).toBe(true);

    await act(async () => {
      now += 40;
      ts.push({ t: now, x: 520, y: 470, pinch: true });
      for (let i = 0; i < 42; i++) {
        now += 50;
        ctrl?.stepNow(now);
      }
      ts.push({ t: now, x: 520, y: 470, pinch: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("r83-book-inside-bubble").textContent).toBe(formatNameGreeting("Rani Putri"));

    // Advance GSAP exit timeline -> onComplete({ studentName: "Rani Putri", needsRuler: true })
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        gsap.updateRoot(gsap.globalTimeline.time() + 0.05);
      }
      await Promise.resolve();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ studentName: "Rani Putri", needsRuler: true });

    // Privacy invariant: zero logs, zero storage writes
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("supports custom cameraSlot for Integrator GlobalCamera integration", () => {
    render(
      <CoverScreen
        hasJoinToken={false}
        cameraSlot={<div data-testid="r83-custom-cam-slot">GlobalCam</div>}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByTestId("r83-custom-cam-slot")).toBeDefined();
    expect(screen.getByTestId("r83-camera-card")).toBeDefined();
  });

  it("keeps #shade, #spot, and #bubble visible across intro -> ayo transition and in initialPhase=ayo", () => {
    const phases: CoverPhase[] = [];
    const { container } = render(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="intro"
        onPhaseChange={(ph) => phases.push(ph)}
        onComplete={vi.fn()}
      />,
    );

    const shade = container.querySelector("#shade") as HTMLElement;
    const spot = container.querySelector("#spot") as HTMLElement;
    const bubble = container.querySelector("#bubble") as HTMLElement;
    const confirm = container.querySelector("#confirm") as HTMLElement;
    const stage = container.querySelector("#stage") as HTMLElement;

    for (let step = 0; step < 4; step++) {
      act(() => {
        gsap.updateRoot(gsap.globalTimeline.time() + 4);
      });
    }

    expect(phases).toContain("ayo");
    expect(stage.getAttribute("data-phase")).toBe("ready");
    expect(stage.getAttribute("data-machine-phase")).toBe("ayo");
    expect(shade.style.opacity).toBe("0.92");
    expect(spot.style.opacity).toBe("1");
    expect(bubble.style.opacity).toBe("1");
    expect(bubble.textContent).toContain(COVER_INTRO_COPY.lines[COVER_INTRO_COPY.lines.length - 1]);

    act(() => {
      gsap.updateRoot(gsap.globalTimeline.time() + 1);
    });
    expect(confirm.style.opacity).toBe("1");
  });

  it("initializes initialPhase=ayo on final intro line with active spotlight halo", () => {
    const { container } = render(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="ayo"
        onComplete={vi.fn()}
      />,
    );
    const shade = container.querySelector("#shade") as HTMLElement;
    const spot = container.querySelector("#spot") as HTMLElement;
    const bubble = container.querySelector("#bubble") as HTMLElement;
    expect(shade.style.opacity).toBe("0.92");
    expect(spot.style.opacity).toBe("1");
    expect(bubble.style.opacity).toBe("1");
    expect(bubble.textContent).toContain(COVER_INTRO_COPY.lines[COVER_INTRO_COPY.lines.length - 1]);
  });

  it("suppresses #cam-nudge in camera-fallback flow and shows #cam-nudge when PIP camera is idle", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("Denied"), { name: "NotAllowedError" })),
      },
    });
    const { container } = render(<CoverScreen hasJoinToken={false} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("r83-gate-checkbox"));
    fireEvent.click(screen.getByTestId("r83-gate-go"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("r83-camera-toggle"));
    });
    fireEvent.click(screen.getByTestId("r83-camera-fallback-btn"));

    // Skip wake -> intro
    act(() => {
      gsap.updateRoot(gsap.globalTimeline.time() + 10);
    });
    const nudge = container.querySelector("#cam-nudge") as HTMLElement;
    expect(nudge.classList.contains("show")).toBe(false);

    // Controlled PIP camera turned off (`idle` when not in fallback mode) shows #cam-nudge
    cleanup();
    const res = render(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="name"
        cameraState={{ status: "live" }}
        onComplete={vi.fn()}
      />,
    );
    expect(res.container.querySelector("#cam-nudge")?.classList.contains("show")).toBe(false);
    res.rerender(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="name"
        cameraState={{ status: "idle" }}
        onComplete={vi.fn()}
      />,
    );
    expect(res.container.querySelector("#cam-nudge")?.classList.contains("show")).toBe(true);
  });

  it("matches responsive spiral count after layout without hydration mismatch and preserves cover CSS selectors", () => {
    const prevWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
      const { container } = render(<CoverScreen hasJoinToken={false} onComplete={vi.fn()} />);
      const binding = container.querySelector("#cover-binding");
      expect(binding?.querySelectorAll("i").length).toBe(computeSpiralCount(1280));
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: prevWidth });
    }

    const coverCamCss = readFileSync(resolve(process.cwd(), "src/features/cover/cover-camera.css"), "utf8");
    const coverCss = readFileSync(resolve(process.cwd(), "src/features/cover/cover.css"), "utf8");
    const paperCss = readFileSync(resolve(process.cwd(), "app/styles/112-r83-paper.css"), "utf8");

    expect(coverCamCss).toContain('[data-ui="r83"].r83-cover-root #camera.toggle-card');
    expect(coverCamCss).not.toContain('[data-ui="r83"] .r83-cover-root');
    expect(coverCamCss).toContain(".camera-select-wrap::after");
    expect(coverCss).toContain('[data-ui="r83"] #bubble .speaker, [data-ui="r83"] #gate .speaker { display: none !important; }');
    expect(coverCss).toContain("clamp(18px, var(--tail-y, 22px), 46px)");
    expect(paperCss).toContain("[data-ui=\"r83\"][data-variant=\"cover\"]::after {\n  z-index: -1;\n}");
    expect(paperCss).toContain('[data-ui="r83"] #book::before');
    expect(paperCss).toContain("order: 3 !important;");
  });

  it("launches Momo bounce (awake/Kaget) and expands #camera.on immediately while getUserMedia is still pending", async () => {
    let resolveStream: ((s: MediaStream) => void) | null = null;
    const pendingGum = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: pendingGum },
    });

    const { container } = render(<CoverScreen hasJoinToken={false} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("r83-gate-checkbox"));
    fireEvent.click(screen.getByTestId("r83-gate-go"));

    // Click toggle while getUserMedia is still pending (never resolved yet)
    act(() => {
      fireEvent.click(screen.getByTestId("r83-camera-toggle"));
    });

    expect(pendingGum).toHaveBeenCalledTimes(1);
    const stage = container.querySelector("#stage") as HTMLElement;
    const momo = screen.getByTestId("r83-cover-momo");
    const camCard = screen.getByTestId("r83-camera-card");
    const sleepZzz = container.querySelector("#sleep-zzz") as HTMLElement;
    const coverCamCss = readFileSync(resolve(process.cwd(), "src/features/cover/cover-camera.css"), "utf8");

    expect(stage.getAttribute("data-machine-phase")).toBe("camera-on");
    expect(camCard.classList.contains("on")).toBe(true);
    expect(momo.classList.contains("awake")).toBe(true);
    expect(momo.classList.contains("sleeping")).toBe(false);
    expect(sleepZzz.style.opacity).toBe("0");
    expect(coverCamCss).not.toContain(':not([data-phase="camera-on"])');

    // Cleanly resolve pending promise so no dangling promise remains
    const fakeTrack = { stop: vi.fn(), kind: "video", readyState: "live" } as unknown as MediaStreamTrack;
    const fakeStream = { getTracks: () => [fakeTrack], getVideoTracks: () => [fakeTrack] } as unknown as MediaStream;
    await act(async () => {
      resolveStream?.(fakeStream);
      await Promise.resolve();
    });
    expect(stage.getAttribute("data-machine-phase")).toBe("wake");
  });

  it("shows #skipbar only when devTools=true and skips one sandbox step per press", () => {
    const onCompleteProd = vi.fn();
    render(<CoverScreen hasJoinToken={false} initialPhase="intro" devTools={false} onComplete={onCompleteProd} />);
    expect(screen.queryByTestId("r83-skipbar")).toBeNull();
    cleanup();

    const phases: CoverPhase[] = [];
    const onCompleteDev = vi.fn();
    render(
      <CoverScreen
        hasJoinToken={false}
        initialPhase="sleep"
        devTools={true}
        onPhaseChange={(ph) => phases.push(ph)}
        onComplete={onCompleteDev}
      />,
    );

    const label = () => screen.getByTestId("r83-skipbar-label").textContent;
    const press = () => fireEvent.click(screen.getByTestId("r83-skipbar-btn"));
    expect(screen.getByTestId("r83-skipbar-btn").textContent).toBe("Lewati ›");

    // Same four steps as sandbox-r8.3: sleeping -> waking -> opening the book -> name.
    expect(label()).toBe("Kamera · Momo tidur");
    press();
    expect(phases.at(-1)).toBe("wake");
    expect(label()).toBe("Momo bangun");
    press();
    expect(phases.at(-1)).toBe("book-curl");
    expect(label()).toBe("Buka buku");
    press();
    expect(phases.at(-1)).toBe("name");
    expect(label()).toBe("Nama");
    expect(onCompleteDev).not.toHaveBeenCalled();
    press();
    expect(phases.at(-1)).toBe("handoff");
    expect(onCompleteDev).toHaveBeenCalledTimes(1);
    expect(onCompleteDev).toHaveBeenCalledWith({ studentName: "Teman", needsRuler: false, demoName: true });
  });
});
