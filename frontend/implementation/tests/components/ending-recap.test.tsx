import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CenterOfPage } from "@/src/components/ending/CenterOfPage";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import { resetInputModeForTest, forceInputMode } from "@/src/input/input-mode";
import { resetThumbTrackerForTest } from "@/src/camera/thumb-tracker";
import { FORBIDDEN_JUDGEMENT_WORDS } from "./ending-copy-rules";

vi.mock("@/src/camera/hand-landmarker", () => ({ createHandLandmarker: vi.fn(() => new Promise(() => {})) }));

const sq = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]];
const three: LevelRecap[] = [
  { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "papan", category: "padat", decision: "accept", firstGuess: "papan" },
  { levelId: "stage-2-ambiguity", title: "Bab 2", strokes: sq, finalLabel: "balok", category: "padat", decision: "correct", firstGuess: "papan" },
  { levelId: "stage-3-validation", title: "Bab 3", strokes: sq, finalLabel: "tangga", category: "bahaya", decision: "override", firstGuess: "tali" },
];

function renderRecap(recaps: LevelRecap[]) {
  return render(<CenterOfPage recaps={recaps} onChoose={vi.fn()} initialStage="recap" quizEnabled={false} />);
}
const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  resetInputModeForTest();
  resetThumbTrackerForTest();
  forceInputMode("camera");
});
afterEach(() => cleanup());

describe("recap counts come only from recorded data", () => {
  it("counts the objects, the three decisions, and first guesses that were changed", () => {
    renderRecap(three);
    expect(text("recap-count-objects")).toBe("Benda yang digambar: 3");
    expect(text("recap-count-accept")).toBe("Terima: 1");
    expect(text("recap-count-correct")).toBe("Pilih lain: 1");
    expect(text("recap-count-override")).toBe("Bukan semua: 1");
    // Bab 1 kept Momo's first guess; Bab 2 and Bab 3 did not.
    expect(text("recap-count-guess-changed")).toBe("Tebakan pertama yang diubah: 2");
  });

  it("says tidak tercatat for a redraw count nobody recorded", () => {
    renderRecap(three);
    expect(text("recap-count-redraw")).toBe("Gambar lagi: tidak tercatat");
  });

  it("adds up redraw counts when they are recorded", () => {
    renderRecap(three.map((r, i) => ({ ...r, redrawCount: i === 0 ? 1 : 2 })));
    expect(text("recap-count-redraw")).toBe("Gambar lagi: 5 kali");
  });

  it("with no recorded data every count says tidak tercatat, and no card is made up", () => {
    renderRecap([]);
    for (const id of ["recap-count-objects", "recap-count-accept", "recap-count-correct", "recap-count-override", "recap-count-redraw", "recap-count-guess-changed"]) {
      expect(text(id)!.endsWith("tidak tercatat")).toBe(true);
    }
    expect(screen.queryAllByTestId(/^recap-card-/)).toHaveLength(0);
    expect(screen.getByTestId("recap-empty").textContent).toBe("tidak tercatat");
  });
});

describe("recap cards show what was recorded for each level", () => {
  it("shows the first guess with its percent when the provider gave one", () => {
    renderRecap([{ ...three[0]!, firstGuessConfidence: 0.72 }, three[1]!]);
    const card = screen.getByTestId("recap-card-stage-1-foundation");
    expect(within(card).getByText("Tebakan pertama Momo: papan, 72%")).toBeTruthy();
    const plain = screen.getByTestId("recap-card-stage-2-ambiguity");
    expect(within(plain).getByText("Tebakan pertama Momo: papan")).toBeTruthy();
  });

  it("shows the decision, the final label and the behavior in plain words", () => {
    renderRecap(three);
    const card = screen.getByTestId("recap-card-stage-3-validation");
    expect(within(card).getByText("Keputusanmu: Bukan semua")).toBeTruthy();
    expect(within(card).getByText("Label akhir: tangga")).toBeTruthy();
    expect(within(card).getByText("Perilaku: Bahaya")).toBeTruthy();
    expect(within(screen.getByTestId("recap-card-stage-1-foundation")).getByText("Perilaku: Aman")).toBeTruthy();
  });

  it("draws the student's own strokes as the thumbnail", () => {
    renderRecap(three);
    const path = within(screen.getByTestId("recap-card-stage-1-foundation")).getByRole("img").querySelector("path");
    expect(path?.getAttribute("d")?.startsWith("M")).toBe(true);
  });

  it("a missing stroke set or first guess says tidak tercatat instead of an empty picture or a guess", () => {
    renderRecap([{ ...three[0]!, strokes: [], firstGuess: "" }]);
    const card = screen.getByTestId("recap-card-stage-1-foundation");
    expect(within(card).getAllByText(/tidak tercatat/)).toHaveLength(2);
    expect(within(card).queryByRole("img")).toBeNull();
  });
});

describe("recap copy is neutral", () => {
  it("has no grading word, no brackets and no score", () => {
    const { container } = renderRecap(three);
    const copy = (container.querySelector("[data-testid='ending-recap']")?.textContent ?? "").toLowerCase();
    expect(copy.length).toBeGreaterThan(40);
    for (const word of FORBIDDEN_JUDGEMENT_WORDS) expect(copy).not.toMatch(new RegExp(`\\b${word}\\b`));
    expect(copy).not.toMatch(/[()]/);
    expect(copy).not.toMatch(/skor|score|poin/);
  });
});
