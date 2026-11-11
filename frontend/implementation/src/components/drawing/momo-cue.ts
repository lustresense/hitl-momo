/**
 * Which Momo moment and speech line the drawing screen shows for the current flow phase.
 */
import { momoGuessQuestion, momoLevelTone, type MomoMoment, type MomoMood } from "@/src/domain/momo-script";
import type { PredictionResult } from "@/src/domain/types";

export type DrawingPhase = "drawing" | "predicting" | "evaluating" | "prediction-error";

export interface MomoCue {
  moment: MomoMoment;
  /** `undefined` lets the bubble use its own default line for the moment. */
  message: string | string[] | undefined;
  /** Level tone (R14): expression override and fog while Momo reads or asks. */
  mood?: MomoMood;
  fog: number;
}

export interface MomoCueContext {
  stage: number;
  prediction: PredictionResult | null;
  /** Set while the idle prompt is up: Momo asks whether the drawing is finished (never predicts). */
  idleLine?: string | null;
}

export function resolveMomoCue(feedback: string | null, visualPhase: DrawingPhase, ctx?: MomoCueContext): MomoCue {
  const tone = momoLevelTone(ctx?.stage ?? 1);
  if (feedback === "empty-drawing") return { moment: "drawing-empty", message: undefined, fog: 0 };
  switch (visualPhase) {
    case "drawing":
      if (ctx?.idleLine) return { moment: "drawing-cue", message: ctx.idleLine, mood: "Penasaran", fog: 0 };
      return { moment: "drawing-cue", message: "Gambar objekmu dulu, ya. Nanti aku coba tebak!", fog: 0 };
    case "predicting":
      return { moment: "predicting", message: "Hmm... ini gambar apa, ya?", mood: tone.guessMood, fog: tone.fog };
    case "evaluating": {
      const [r1, r2] = ctx?.prediction?.candidates ?? [];
      // Numbers come only from the provider; tone changes the words, never the percent.
      const question = r1 && ctx ? momoGuessQuestion(ctx.stage, r1.label, r1.confidence, r2?.label) : "Aku punya tiga tebakan. Bandingkan dulu, ya.";
      return {
        moment: "top3-compare",
        message: [question, "Persen bukan jaminan benar. Kamu yang memutuskan."],
        mood: tone.guessMood,
        fog: tone.fog,
      };
    }
    default:
      return { moment: "provider-error", message: "Hmm, aku belum bisa membaca gambarmu. Mau coba lagi?", fog: 0 };
  }
}
