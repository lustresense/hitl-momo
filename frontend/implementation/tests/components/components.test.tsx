import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { HandPose } from "@/src/input/hand-gesture";
import { forceInputMode, resetInputModeForTest } from "@/src/input/input-mode";
import { resetHandGesture, setHandGesture } from "./gesture-stub";

/** The decision rings read the hand pose from the same tracker stub as the rest of this file. */
const FINGERS: Partial<Record<HandPose, number>> = { "one-finger": 1, "two-fingers": 2, "three-fingers": 3, "open-palm": 5 };
function setPose(pose: HandPose) {
  setHandGesture({ pose, fingerCount: FINGERS[pose] ?? 0, handVisible: pose !== "none", thumbUp: pose === "thumb-up", pinch: pose === "pinch" } as never);
}
import { Top3Panel } from "@/src/components/prediction/Top3Panel";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
import { PredictingScreen } from "@/src/components/prediction/PredictingScreen";
import { GlobalCamera } from "@/src/components/camera/GlobalCamera";
import { LevelRibbonBookmark } from "@/src/components/level/LevelRibbonBookmark";
import { StudentRulerSelector } from "@/src/components/onboarding/StudentRulerSelector";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";
import { LEVELS } from "@/src/domain/levels";
import type { PredictionResult, LevelContext } from "@/src/domain/types";

// Hand tracker stubbed: the decision buttons read the fingertip, and no camera exists in tests.
vi.mock("@/src/hooks/useHandGesture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/hooks/useHandGesture")>();
  const stub = await import("./gesture-stub");
  return { ...actual, useHandGesture: stub.useHandGestureStub };
});

let mockHasInk = false;
vi.mock("@/src/input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/input")>();
  return { ...actual, DrawingSurface: class {
    constructor(_canvas: HTMLCanvasElement, _video: HTMLVideoElement, options: { onInkChange?: (value: boolean) => void }) {
      if (mockHasInk) options.onInkChange?.(true);
    }
    resizeForDpr() {}
    dispose() {}
    undo() { return true; }
    clear() {}
  } };
});

afterEach(cleanup);

describe("DrawingScreen explicit prediction", () => {
 it("shows disabled prediction submit before ink and no placeholder catalog",()=>{mockHasInk=false;render(<DrawingScreen level={LEVELS[0]!} initialMode="pointer" feedback={null} surfaceOut={{current:null}} onSubmit={vi.fn()} onExit={vi.fn()}/>);expect(screen.queryByText(/Katalog DEMO/)).toBeNull();expect(screen.getByTestId("btn-submit-drawing").hasAttribute("disabled")).toBe(true);expect(screen.queryByLabelText("Tebakan AI")).toBeNull();});
 it("submit requests prediction without selecting catalog intent",()=>{mockHasInk=true;const submit=vi.fn();render(<DrawingScreen level={LEVELS[0]!} initialMode="pointer" feedback={null} surfaceOut={{current:null}} onSubmit={submit} onExit={vi.fn()}/>);expect(submit).not.toHaveBeenCalled();fireEvent.click(screen.getByTestId("btn-submit-drawing"));expect(submit).toHaveBeenCalledWith(null);mockHasInk=false;});
});

describe("StudentRulerSelector", () => {
  it("shows the required instruction and saves/navigates with the chosen number", () => {
    const stored = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    const onConfirm = vi.fn();
    render(<StudentRulerSelector onConfirm={onConfirm} />);

    expect(screen.getByRole("heading", { name: "GESER PENGGARIS SESUAI NOMOR ABSENMU" })).toBeTruthy();
    // Momo's focus phase locks the ruler (BIGPROMPT 6.2): a key press does nothing yet.
    // Moving, saving and the thumbs-up are covered in tests/components/ruler-confirm.test.tsx.
    const slider = screen.getByRole("slider", { name: "Nomor absen" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    // A new student starts at number 1 (BIGPROMPT 6.2 default), not 20.
    expect(slider.getAttribute("aria-valuenow")).toBe("1");
    expect(window.localStorage.getItem("sketchbook.studentNumber")).toBeNull();

    // PRD 0.0.16 R3: no "Lanjut ke Tutorial" button; confirmation is Momo's thumbs-up (tests/components/ruler-confirm.test.tsx).
    expect(screen.queryByRole("button", { name: /Lanjut ke Tutorial/ })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("announces a taken number", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => key === "sketchbook.studentNumber" ? "20" : null,
        setItem: () => {},
      },
    });
    render(<StudentRulerSelector onConfirm={() => {}} takenNumbers={[20]} />);
    expect(screen.getByText("20").className).toContain("is-taken");
    expect(screen.queryByText(/\/ 30/)).toBeNull();
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toContain("sudah diambil");
  });
});

const RESULT: PredictionResult = {
  candidates: [
    { label: "papan", confidence: 0.6 },
    { label: "batu", confidence: 0.3 },
    { label: "tali", confidence: 0.1 },
  ],
};

const LEVEL: LevelContext = {
  levelId: "test",
  stage: 2,
  cyclesRequired: 1,
  behaviorMap: {},
  vocabulary: ["papan", "batu", "tali", "tangga", "ember"],
  scene: { groundEndX: 100, gapStartX: 100, gapWidth: 50, goalX: 300 },
};

describe("Top3Panel (TASK 08)", () => {
  it("renders exactly 3 ranked candidates with confidence text", () => {
    render(<Top3Panel result={RESULT} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(screen.getByRole("listitem", { name: /Peringkat 1: papan/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Bar keyakinan 60 persen/i })).toBeTruthy();
    expect(document.querySelector('[data-rank="3"] .rank')?.textContent).toBe("3");
  });
});

describe("DecisionPanel (TASK 09)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    resetInputModeForTest();
    resetHandGesture();
    forceInputMode("camera");
  });
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 16) act(() => {
      vi.advanceTimersByTime(16);
    });
  };
  /** The ring arms on the empty hand first, then the pose is held for `ms` and released. */
  const hold = (pose: HandPose, ms = 1600) => {
    advance(64);
    act(() => setPose(pose));
    advance(ms);
    act(() => setPose("none"));
    advance(64);
  };

  it("Correct: a three-finger hold on candidate 3 commits once with rank 3; no other decision fires", () => {
    const onCorrect = vi.fn();
    const onAccept = vi.fn();
    render(<DecisionPanel prediction={RESULT} level={LEVEL} onAccept={onAccept} onCorrect={onCorrect} onOverride={() => {}} onRedraw={() => {}} />);
    expect(onCorrect).not.toHaveBeenCalled();
    hold("three-fingers");
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith(3);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("Override list offers only labels outside the Top-3 and needs Pakai to commit", () => {
    const onOverride = vi.fn();
    render(<DecisionPanel prediction={RESULT} level={LEVEL} onAccept={() => {}} onCorrect={() => {}} onOverride={onOverride} onRedraw={() => {}} />);
    hold("open-palm");
    expect(screen.queryByTestId("override-option-papan")).toBeNull();
    expect(screen.getByTestId("override-option-tangga")).toBeTruthy();
    expect(screen.getByTestId("override-option-ember")).toBeTruthy();
    expect(screen.queryByTestId("override-confirm")).toBeNull(); // nothing chosen yet
    hold("two-fingers"); // ember is the second label offered: two fingers
    expect(onOverride).not.toHaveBeenCalled();
    hold("thumb-up", 2100);
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(onOverride).toHaveBeenCalledWith("ember");
  });

  it("Redraw is a separate recovery action outside the three decisions", () => {
    const onRedraw = vi.fn();
    render(<DecisionPanel prediction={RESULT} level={LEVEL} onAccept={() => {}} onCorrect={() => {}} onOverride={() => {}} onRedraw={onRedraw} />);
    hold("pinch");
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });
});

describe("PredictingScreen (TASK 13 states)", () => {
  it("loading state shows progress without error actions", () => {
    render(<PredictingScreen error={false} detail={null} onRetry={() => {}} onRedraw={() => {}} />);
    expect(screen.getByText(/momo sedang membaca pola/i)).toBeTruthy();
    expect(screen.queryByTestId("btn-retry-prediction")).toBeNull();
  });

  it("error state exposes retry + redraw recovery routes", () => {
    const onRetry = vi.fn();
    const onRedraw = vi.fn();
    render(<PredictingScreen error detail="provider-unavailable" onRetry={onRetry} onRedraw={onRedraw} />);
    fireEvent.click(screen.getByTestId("btn-retry-prediction"));
    fireEvent.click(screen.getByTestId("btn-redraw-from-error"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("provider-unavailable");
  });
});

describe("GlobalCamera (Persistent Floating Camera)", () => {
  // PRD 0.0.16 R1/R13: camera mode is full NUI, the cover has no skip button any more.
  it("renders centered hero cover view when mode is cover, without a skip button", () => {
    render(<GlobalCamera mode="cover" modelUrl="/mock-model.task" />);
    const widget = screen.getByTestId("global-camera-widget");
    expect(widget.className).toContain("mode-cover");
    expect(screen.getByText(/Jarimu Adalah Kuas Ajaibnya!/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Lewati/i })).toBeNull();
  });

  it("renders docked floating widget with toggle-card styling when mode is floating", () => {
    render(<GlobalCamera mode="floating" modelUrl="/mock-model.task" />);
    const widget = screen.getByTestId("global-camera-widget");
    expect(widget.className).toContain("mode-floating");
    expect(widget.className).toContain("camera-prototype-root");
    const toggleCard = widget.querySelector(".toggle-card");
    expect(toggleCard).toBeTruthy();
  });

  it("keeps the exact same card + <video> node across cover -> floating (no unmount)", () => {
    const { rerender } = render(<GlobalCamera mode="cover" modelUrl="/mock-model.task" />);
    const cardBefore = screen.getByTestId("camera-card");
    const videoBefore = cardBefore.querySelector("video");
    expect(videoBefore).toBeTruthy();

    rerender(<GlobalCamera mode="floating" modelUrl="/mock-model.task" />);

    const cardAfter = screen.getByTestId("camera-card");
    expect(cardAfter).toBe(cardBefore);
    expect(cardAfter.querySelector("video")).toBe(videoBefore);
    expect(screen.getByTestId("global-camera-widget").className).toContain("mode-floating");
  });

  it("recesses on the drawing canvas without unmounting the camera card", () => {
    const { rerender } = render(<GlobalCamera mode="floating" modelUrl="/mock-model.task" recessed />);
    const cardBefore = screen.getByTestId("camera-card");
    expect(screen.getByTestId("global-camera-widget").className).toContain("is-recessed");

    rerender(<GlobalCamera mode="floating" modelUrl="/mock-model.task" />);

    expect(screen.getByTestId("camera-card")).toBe(cardBefore);
    expect(screen.getByTestId("global-camera-widget").className).not.toContain("is-recessed");
  });

  it("toggle switch changes camera active state", () => {
    render(<GlobalCamera mode="floating" modelUrl="/mock-model.task" />);
    const toggleSwitch = screen.getByTestId("btn-camera-toggle-switch");
    expect(toggleSwitch.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Nyalakan Kamera")).toBeTruthy();
    fireEvent.click(toggleSwitch);
    expect(toggleSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Kamera Aktif")).toBeTruthy();
  });
});

describe("LevelRibbonBookmark shelf", () => {
  it("renders three bookmarks on the spiral binding with a short heading", () => {
    render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={vi.fn()} />);
    const list = screen.getByTestId("level-list");
    expect(list.querySelectorAll(".bm-slot")).toHaveLength(3);
    expect(screen.getByText("Pilih bab")).toBeTruthy();
    expect(screen.getByTestId("level-card-1").querySelector(".bm-outer--body")?.getAttribute("d")).toContain("L");
  });
  it("marks the first level open and later ribbons locked with a padlock", () => {
    render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={vi.fn()} />);
    expect(screen.getByTestId("level-card-1").className).toContain("is-playable");
    expect(screen.getByTestId("level-card-1").dataset.state).toBe("open");
    expect(screen.getByTestId("level-card-2").className).toContain("is-locked");
    expect(screen.getByTestId("level-card-2").dataset.state).toBe("locked");
    expect(screen.getByTestId("level-card-3").querySelector(".bm-badge .nb-icon")).toBeTruthy();
  });
});
