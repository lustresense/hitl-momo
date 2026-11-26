import { describe, expect, it } from "vitest";
import {
  ENDING_PHASES,
  canAdvanceEndingPhase,
  createInitialEndingState,
  endingReducer,
  getEndingMomoAnchor,
  isEndingFrontRigActive,
  isEndingJoystickEnabled,
  sortRecapsByLevel,
  type EndingEvent,
} from "@/src/features/ending/ending-machine";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import {
  ENDING_COPY,
  formatEndingRecapCounts,
  formatEndingRecapLabel,
  formatEndingRecapTitle,
} from "@/src/domain/copy/ending";
import { recapTotals } from "@/src/components/ending/recap-summary";

describe("ending-machine", () => {
  it("exposes exact 5 phases in sandbox order", () => {
    expect(ENDING_PHASES).toEqual(["payung", "kolam", "bicara", "rekap", "akhir"]);
    expect(canAdvanceEndingPhase("payung", "kolam")).toBe(true);
    expect(canAdvanceEndingPhase("payung", "bicara")).toBe(false);
    expect(canAdvanceEndingPhase("akhir", "payung")).toBe(false);
  });

  it("walks full 5-phase flow payung -> kolam -> bicara -> rekap -> akhir with recorded recaps", () => {
    let s = createInitialEndingState({ recapCount: 3 });
    expect(s.phase).toBe("payung");
    expect(s.thinmanAlive).toBe(false);
    expect(isEndingJoystickEnabled(s)).toBe(false);
    expect(isEndingFrontRigActive(s)).toBe(false);
    expect(getEndingMomoAnchor(s)).toBe("corner");

    // 1. Payung
    s = endingReducer(s, { type: "PAYUNG_TOUCHDOWN" });
    expect(s.payungSubPhase).toBe("landed");
    s = endingReducer(s, { type: "PAYUNG_DONE" });
    expect(s.phase).toBe("kolam");
    expect(s.kolamSubPhase).toBe("walk");
    expect(isEndingJoystickEnabled(s)).toBe(true);
    expect(getEndingMomoAnchor(s)).toBe("corner");

    // 2. Kolam (walk -> dive -> emerged)
    s = endingReducer(s, { type: "POND_REACHED" });
    expect(s.kolamSubPhase).toBe("diving");
    expect(isEndingJoystickEnabled(s)).toBe(false);

    s = endingReducer(s, { type: "DIVE_DONE" });
    expect(s.kolamSubPhase).toBe("emerged");
    expect(s.thinmanAlive).toBe(true);
    expect(isEndingJoystickEnabled(s)).toBe(false);

    s = endingReducer(s, { type: "KOLAM_DONE" });
    expect(s.phase).toBe("bicara");
    expect(s.bicaraSubPhase).toBe("walking-to-spot");
    expect(getEndingMomoAnchor(s)).toBe("ending");

    // 3. Bicara (auto-walk -> turn -> 3 lines -> Aku mengerti)
    s = endingReducer(s, { type: "BICARA_SPOT_REACHED" });
    expect(s.bicaraSubPhase).toBe("turning");
    s = endingReducer(s, { type: "BICARA_TURN_DONE" });
    expect(s.bicaraSubPhase).toBe("speaking");
    expect(s.talkLineIndex).toBe(0);
    expect(isEndingFrontRigActive(s)).toBe(true);
    expect(isEndingJoystickEnabled(s)).toBe(false);

    s = endingReducer(s, { type: "BICARA_NEXT_LINE" });
    expect(s.talkLineIndex).toBe(1);
    s = endingReducer(s, { type: "BICARA_NEXT_LINE" });
    expect(s.talkLineIndex).toBe(2);
    s = endingReducer(s, { type: "BICARA_NEXT_LINE" });
    expect(s.bicaraSubPhase).toBe("waiting-confirm");

    s = endingReducer(s, { type: "BICARA_CONFIRMED" });
    expect(s.phase).toBe("rekap");
    expect(s.rekapSubPhase).toBe("intro");

    // 4. Rekap (intro -> flying 3 items -> counts -> waiting-next)
    s = endingReducer(s, { type: "REKAP_INTRO_DONE" });
    expect(s.rekapSubPhase).toBe("flying");
    s = endingReducer(s, { type: "REKAP_ITEM_LANDED" });
    s = endingReducer(s, { type: "REKAP_ITEM_LANDED" });
    s = endingReducer(s, { type: "REKAP_ITEM_LANDED" });
    expect(s.revealedRecapCount).toBe(3);

    s = endingReducer(s, { type: "REKAP_FLY_DONE" });
    expect(s.rekapSubPhase).toBe("counts");
    s = endingReducer(s, { type: "REKAP_COUNTS_DONE" });
    expect(s.rekapSubPhase).toBe("waiting-next");

    s = endingReducer(s, { type: "REKAP_CONFIRMED" });
    expect(s.phase).toBe("akhir");
    expect(s.akhirSubPhase).toBe("speaking");
    expect(s.finishLineIndex).toBe(0);

    // 5. Akhir (2 finish lines -> waiting-back -> completed)
    s = endingReducer(s, { type: "AKHIR_NEXT_LINE" });
    expect(s.finishLineIndex).toBe(1);
    s = endingReducer(s, { type: "AKHIR_NEXT_LINE" });
    expect(s.akhirSubPhase).toBe("waiting-back");
    expect(s.completed).toBe(false);

    s = endingReducer(s, { type: "AKHIR_CONFIRMED" });
    expect(s.completed).toBe(true);

    // Duplicate confirm is ignored cleanly
    const again = endingReducer(s, { type: "AKHIR_CONFIRMED" });
    expect(again).toBe(s);
  });

  it("handles empty recaps (recapCount === 0) honestly without sample data", () => {
    let s = createInitialEndingState({ recapCount: 0, initialPhase: "rekap" });
    expect(s.recapCount).toBe(0);
    s = endingReducer(s, { type: "REKAP_INTRO_DONE" });
    expect(s.rekapSubPhase).toBe("counts");
    expect(s.revealedRecapCount).toBe(0);

    s = endingReducer(s, { type: "REKAP_COUNTS_DONE" });
    expect(s.rekapSubPhase).toBe("waiting-next");
    s = endingReducer(s, { type: "REKAP_CONFIRMED" });
    expect(s.phase).toBe("akhir");

    expect(formatEndingRecapCounts(recapTotals([]))).toBe(ENDING_COPY.rekap.emptyMessage);
  });

  it("blocks invalid out-of-phase transitions strictly", () => {
    const start = createInitialEndingState({ recapCount: 2 });
    const invalidEvents: EndingEvent[] = [
      { type: "POND_REACHED" },
      { type: "DIVE_DONE" },
      { type: "KOLAM_DONE" },
      { type: "BICARA_CONFIRMED" },
      { type: "REKAP_CONFIRMED" },
      { type: "AKHIR_CONFIRMED" },
    ];
    for (const ev of invalidEvents) {
      expect(endingReducer(start, ev)).toBe(start);
    }
  });

  it("sorts recaps by level order and normalizes Bab -> Level (O-8) without fabricating items", () => {
    const sq = [[{ x: 0, y: 0 }, { x: 10, y: 10 }]];
    const unordered: LevelRecap[] = [
      { levelId: "stage-3-validation", title: "Bab 3", strokes: sq, finalLabel: "ember", category: "netral", decision: "override", firstGuess: "ular" },
      { levelId: "stage-1-foundation", title: "Bab 1", strokes: sq, finalLabel: "tangga", category: "padat", decision: "accept", firstGuess: "tangga", redrawCount: 1 },
      { levelId: "stage-2-ambiguity", title: "Bab 2", strokes: sq, finalLabel: "jembatan", category: "padat", decision: "correct", firstGuess: "bangku", redrawCount: 2 },
    ];
    const sorted = sortRecapsByLevel(unordered);
    expect(sorted.map((r) => r.levelId)).toEqual([
      "stage-1-foundation",
      "stage-2-ambiguity",
      "stage-3-validation",
    ]);
    expect(sorted.map((r) => formatEndingRecapTitle(r.title, r.levelId))).toEqual([
      "Level 1",
      "Level 2",
      "Level 3",
    ]);
    expect(formatEndingRecapLabel("papan luncur")).toBe("Papan luncur");
    expect(sortRecapsByLevel([])).toEqual([]);
  });
});
