import type { LevelRecap } from "@/src/components/ending/ending-types";
import { recapTotals } from "@/src/components/ending/recap-summary";
import type { MomoExpression } from "@/src/components/momo/momo-engine";
import {
  ENDING_AI_TALK_LINES,
  ENDING_AI_TALK_MOODS,
  ENDING_COPY,
  ENDING_FINISH_LINES,
  formatEndingRecapCounts,
} from "@/src/domain/copy/ending";
import type { AnchorName } from "@/src/features/shared/bubble-placement";
import type { EndingMachineState } from "./ending-machine";

export interface EndingDisplayState {
  readonly momoAnchor: AnchorName;
  readonly bubbleText: string;
  readonly bubbleVisible: boolean;
  readonly momoExpression: MomoExpression;
  readonly hintText: string;
  readonly hintTopRight: boolean;
}

/** Menghasilkan tampilan Momo, dialog, dan hint untuk fase aktif (murni, tanpa DOM). */
export function getEndingDisplay(
  state: EndingMachineState,
  recaps: readonly LevelRecap[],
  payungLineStep: 0 | 1 | 2 = 0,
): EndingDisplayState {
  switch (state.phase) {
    case "payung": {
      if (state.payungSubPhase === "falling") {
        return {
          momoAnchor: "corner",
          bubbleText: ENDING_COPY.payung.launchLine,
          bubbleVisible: true,
          momoExpression: "Bangga",
          hintText: ENDING_COPY.payung.hint,
          hintTopRight: false,
        };
      }
      const lineIdx = payungLineStep >= 2 ? 1 : 0;
      return {
        momoAnchor: "corner",
        bubbleText: ENDING_COPY.payung.landedLines[lineIdx],
        bubbleVisible: true,
        momoExpression: "Senang",
        hintText: ENDING_COPY.payung.hint,
        hintTopRight: false,
      };
    }

    case "kolam":
      if (state.kolamSubPhase === "emerged") {
        return {
          momoAnchor: "corner",
          bubbleText: ENDING_COPY.kolam.reactionLine,
          bubbleVisible: true,
          momoExpression: "Kaget",
          hintText: ENDING_COPY.kolam.hint,
          hintTopRight: false,
        };
      }
      return {
        momoAnchor: "corner",
        bubbleText: ENDING_COPY.kolam.promptLine,
        bubbleVisible: true,
        momoExpression: "Penasaran",
        hintText: ENDING_COPY.kolam.hint,
        hintTopRight: false,
      };

    case "bicara": {
      const showTalk =
        state.bicaraSubPhase === "speaking" || state.bicaraSubPhase === "waiting-confirm";
      const line =
        ENDING_AI_TALK_LINES[state.talkLineIndex] ??
        ENDING_AI_TALK_LINES[0];
      const mood = ENDING_AI_TALK_MOODS[state.talkLineIndex] ?? "Senang";
      return {
        momoAnchor: state.bicaraSubPhase === "walking-to-spot" ? "corner" : "ending",
        bubbleText: showTalk ? line : ENDING_COPY.kolam.reactionLine,
        bubbleVisible: showTalk,
        momoExpression: showTalk ? mood : "Senang",
        hintText: ENDING_COPY.bicara.hint,
        hintTopRight: true,
      };
    }

    case "rekap": {
      const showCounts =
        state.rekapSubPhase === "counts" || state.rekapSubPhase === "waiting-next";
      const text = showCounts
        ? formatEndingRecapCounts(recapTotals(recaps))
        : ENDING_COPY.rekap.introLines[0];
      return {
        momoAnchor: "ending",
        bubbleText: text,
        bubbleVisible: true,
        momoExpression: showCounts ? "Bangga" : "Senang",
        hintText: ENDING_COPY.rekap.hint,
        hintTopRight: true,
      };
    }

    case "akhir": {
      const line =
        ENDING_FINISH_LINES[state.finishLineIndex] ??
        ENDING_FINISH_LINES[0];
      return {
        momoAnchor: "ending",
        bubbleText: line,
        bubbleVisible: true,
        momoExpression: "Bangga",
        hintText: ENDING_COPY.akhir.hint,
        hintTopRight: true,
      };
    }
  }
}
