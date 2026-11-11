/**
 * Momo's lines on the number ruler (BIGPROMPT 6.2, storyboard scenes 6-8). Owned by the ruler screen; the shared
 * guide-script.ts keeps its older number lines for the tests that still read them.
 */
import type { GuideStep } from "./guide-script";

/** Focus phase: Momo is big in the middle, the ruler is dimmed and locked. */
export const RULER_FOCUS_STEP: GuideStep = {
  mood: "Penasaran",
  lines: ["Sebelum kita masuk, pilih nomor absenmu dulu, ya."],
};

/** Docked phase before the first move: a short cue, Momo stays visible in the corner. */
export const RULER_HINT_STEP: GuideStep = {
  mood: "Penasaran",
  lines: ["Geser penggarisnya sampai pas."],
};

/** The student is moving the ruler: Momo keeps quiet (no words) until it rests again. */
export const RULER_QUIET_STEP: GuideStep = { mood: "Penasaran", lines: [] };

/** The ruler rests on a free number: Momo asks, the thumb ring comes after this line. */
export function rulerAskStep(value: number): GuideStep {
  return { mood: "Penasaran", lines: [`Benar ini nomor absenmu, ${value}?`] };
}

export const RULER_TAKEN_STEP: GuideStep = {
  mood: "Bingung",
  lines: ["Nomor itu sudah ada yang pakai. Geser ke nomor lain ya."],
};

/** The class is not joined: the number is only kept on this device. Said honestly, never a made-up ID. */
export const RULER_CLASS_OFFLINE_STEP: GuideStep = {
  mood: "Tenang",
  lines: ["Nomormu kusimpan di perangkat ini. Kelas belum terhubung."],
};
