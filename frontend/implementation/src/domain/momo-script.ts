/**
 * FR-14: Momo is a contextual companion / pattern reader.
 * It may show short state-driven text bubbles. It must NEVER create the
 * student's object, decide for the student, or imply it can (lore invariant).
 * All lines are placeholder copy - final Momo visual/voice remains unlocked.
 */

export type MomoMoment =
  | "level-entry"
  | "drawing-cue"
  | "drawing-empty"
  | "predicting"
  | "provider-error"
  | "top3-compare"
  | "decision-accepted"
  | "decision-corrected"
  | "decision-overridden"
  | "solid-consequence"
  | "danger-consequence"
  | "fallback-consequence"
  | "cycle-success"
  | "cycle-fail"
  | "level-complete";

/** Placeholder guidance lines keyed by app state. */
const LINES: Record<MomoMoment, string> = {
  "level-entry": "Halo, aku Momo. Aku bisa membaca pola gambarmu, tapi tidak bisa menggambar. Kamu Illustrator-nya.",
  "drawing-cue": "Gambar objekmu di kanvas. Aku akan menebak apa yang kamu buat.",
  "drawing-empty": "Kanvasnya masih kosong. Gambar sesuatu dulu ya.",
  predicting: "Sedang kubaca goresanmu...",
  "provider-error": "Aku belum bisa membaca polanya. Coba lagi atau gambar ulang.",
  "top3-compare": "Ini tiga tebakanku. Persen bukan jaminan benar, bandingkan dulu.",
  "decision-accepted": "Kamu setuju dengan tebakan peringkat 1. Keputusan bagus kalau kamu sudah yakin.",
  "decision-corrected": "Kamu memilih tebakan lain dari Top-3. Bagus, kamu membandingkan dulu.",
  "decision-overridden": "Kamu menolak semua tebakan dan memilih sendiri. Kamu yang paling tahu ciptaanmu.",
  "solid-consequence": "Objekmu jadi pijakan yang kokoh. Silakan lewat!",
  "danger-consequence": "Objek itu berbahaya di halaman ini... hati-hati!",
  "fallback-consequence": "Hmm, aku belum tahu perilaku objek ini. Kuberikan versi netral dulu.",
  "cycle-success": "Berhasil! Mau lanjut?",
  "cycle-fail": "Tidak apa-apa gagal. Coba putuskan lagi, atau gambar ulang objekmu.",
  "level-complete": "Bab ini selesai! Keputusanmu tadi yang menentukan jalannya cerita.",
};

export function momoLine(moment: MomoMoment): string {
  return LINES[moment];
}

/** Visual mood of Momo per moment. Expression is decoration only: it never signals a "right" decision. */
export type MomoMood = "Senang" | "Tenang" | "Penasaran" | "Berpikir" | "Kaget" | "Sedih" | "Bingung" | "Ngantuk" | "Malu" | "Semangat" | "Kedip" | "Khawatir";

const MOODS: Record<MomoMoment, MomoMood> = {
  "level-entry": "Senang",
  "drawing-cue": "Tenang",
  "drawing-empty": "Bingung",
  predicting: "Berpikir",
  "provider-error": "Khawatir",
  "top3-compare": "Penasaran",
  "decision-accepted": "Senang",
  "decision-corrected": "Senang",
  "decision-overridden": "Penasaran",
  "solid-consequence": "Tenang",
  "danger-consequence": "Kaget",
  "fallback-consequence": "Bingung",
  "cycle-success": "Semangat",
  "cycle-fail": "Sedih",
  "level-complete": "Semangat",
};

export function momoMood(moment: MomoMoment): MomoMood {
  return MOODS[moment];
}

/* ------------------------------------------------------------------------------------------------
 * R14: Momo makin "halu" per level (Kabut Penghapus). Tone and fog only: the numbers Momo says always
 * come straight from the prediction provider (rule D: an effect never fakes confidence).
 * ---------------------------------------------------------------------------------------------- */

export type MomoTone = "confident" | "doubtful" | "humble";

export interface MomoLevelTone {
  tone: MomoTone;
  /** Kabut Penghapus level over Momo's face, 0..1. */
  fog: number;
  /** Expression while Momo reads the drawing / asks. */
  guessMood: MomoMood;
}

const TONES: Record<1 | 2 | 3, MomoLevelTone> = {
  1: { tone: "confident", fog: 0, guessMood: "Semangat" },
  2: { tone: "doubtful", fog: 0.4, guessMood: "Bingung" },
  3: { tone: "humble", fog: 0.9, guessMood: "Khawatir" },
};

/** Tone and fog for a level stage (1..3). Unknown stages fall back to L1. */
export function momoLevelTone(stage: number): MomoLevelTone {
  return TONES[(stage === 2 || stage === 3 ? stage : 1) as 1 | 2 | 3];
}

/** Provider confidence 0..1 shown as a whole percent. The only way a number reaches Momo's lines. */
export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/**
 * Momo's question once the student pauses (R11 step 2), in the level's tone (R14).
 * `label`/`confidence` are rank 1 from the provider, `second` is rank 2 (used by the doubtful tone).
 */
export function momoGuessQuestion(stage: number, label: string, confidence: number, second?: string): string {
  const pct = confidencePercent(confidence);
  switch (momoLevelTone(stage).tone) {
    case "confident":
      return `Gampang! Ini pasti ${label}, ${pct}%. Bener gak?`;
    case "doubtful":
      return second
        ? `${cap(label)}? Eh, atau ${second}? Kok aku jadi bingung. ${cap(label)} ${pct}%, bener gak?`
        : `${cap(label)}? Kok aku jadi bingung. ${pct}%, bener gak?`;
    default:
      return `Aku nggak bisa lihat jelas... mungkin ${label}, ${pct}%. Terserah kamu ya. Kamu yang lebih tahu.`;
  }
}

/** Short provisional mumble while the student is still drawing (R11 step 1). */
export function momoGuessMumble(stage: number, label: string | null): string {
  if (!label) return "hmm...";
  switch (momoLevelTone(stage).tone) {
    case "confident":
      return `${label}!`;
    case "doubtful":
      return `${label}? eh...`;
    default:
      return `${label}...?`;
  }
}

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/* ------------------------------------------------------------------------------------------------
 * R16: the first time in a session the student corrects Momo (Pilih lain or Bukan semua), she reacts once:
 * Kaget, then Malu, then Senang. A turning point of the story. Afterwards the usual reaction.
 * ---------------------------------------------------------------------------------------------- */

export interface MomoBeat {
  line: string;
  mood: MomoMood;
}

export const FIRST_CORRECTION_RELIEF: readonly MomoBeat[] = [
  { line: "Oh... aku salah ya?", mood: "Kaget" },
  { line: "Makasih udah benerin aku.", mood: "Malu" },
  { line: "Ternyata nggak apa-apa salah.", mood: "Senang" },
];

let correctedThisSession = false;

/**
 * Call when the student corrects Momo. Returns the relief beats the first time in this session, otherwise null.
 * Session = this page load (module state), so reloading starts a new session.
 */
export function takeFirstCorrectionRelief(): readonly MomoBeat[] | null {
  if (correctedThisSession) return null;
  correctedThisSession = true;
  return FIRST_CORRECTION_RELIEF;
}

/** True once the relief has played this session (read only, does not consume). */
export function hasPlayedCorrectionRelief(): boolean {
  return correctedThisSession;
}

/** Tests only: start a fresh session. */
export function resetCorrectionReliefForTests(): void {
  correctedThisSession = false;
}

/** Relief beats for a decision kind: only a correction (Pilih lain / Bukan semua) can trigger it, once per session. */
export function reliefForDecision(kind: "accept" | "correct" | "override"): readonly MomoBeat[] | null {
  return kind === "accept" ? null : takeFirstCorrectionRelief();
}
