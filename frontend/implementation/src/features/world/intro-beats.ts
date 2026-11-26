import { formatCharacterText } from "@/src/config/character-tokens";
import { WORLD_LEVEL_COPY, normalizeWorldStage, type WorldIntroFocus } from "@/src/domain/copy/world";

export type IntroPhase = "drop" | "story" | "nudge" | "rise" | "sky";

export interface IntroBeat {
  readonly kind: "story" | "nudge";
  readonly focus: WorldIntroFocus;
  readonly lines: readonly string[];
}

export const INTRO_CLAMP = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/**
 * Mengelompokkan baris cerita & dorongan menjadi beat (port intro.js:12-23):
 * baris berurutan dengan topik sama berbagi satu bubble, dan baris tanpa fokus
 * mewarisi fokus sebelumnya agar spotlight tidak keluar-masuk sia-sia.
 */
export function buildIntroBeats(stage: number, characterDisplayName?: string | null): IntroBeat[] {
  const s = normalizeWorldStage(stage);
  const lv = WORLD_LEVEL_COPY[s];
  const items: Array<{ kind: "story" | "nudge"; focus: WorldIntroFocus | null; text: string }> = [
    ...lv.story.map((t, i) => ({
      kind: "story" as const,
      focus: lv.focus[i] ?? "thinman",
      text: formatCharacterText(t, characterDisplayName),
    })),
    ...lv.nudge.map((t, i) => ({
      kind: "nudge" as const,
      focus: i === 1 ? ("ahead" as const) : null,
      text: formatCharacterText(t, characterDisplayName),
    })),
  ];

  const beats: IntroBeat[] = [];
  let eff: WorldIntroFocus = items[0]?.focus ?? "thinman";
  for (const item of items) {
    eff = item.focus ?? eff;
    const last = beats[beats.length - 1];
    if (last && last.kind === item.kind && last.focus === eff) {
      (last.lines as string[]).push(item.text);
    } else {
      beats.push({ kind: item.kind, focus: eff, lines: [item.text] });
    }
  }
  return beats;
}

export function computeMomoIntroSpot(
  focus: WorldIntroFocus,
  vp: { w: number; h: number },
  momoBase: { w: number; h: number },
  thinmanRect: DOMRect | null | undefined,
): { x: number; y: number; s: number } {
  const s = 0.8;
  if (focus === "thinman") {
    if (thinmanRect && thinmanRect.width > 0) {
      return {
        x: INTRO_CLAMP(
          thinmanRect.right + momoBase.w * s * 0.55 + 40,
          (momoBase.w * s) / 2 + 16,
          vp.w - (momoBase.w * s) / 2 - 16,
        ),
        y: INTRO_CLAMP(thinmanRect.top - momoBase.h * s * 0.32, (momoBase.h * s) / 2 + 12, vp.h * 0.5),
        s,
      };
    }
    return { x: vp.w * 0.3, y: vp.h * 0.38, s };
  }
  return { x: vp.w * 0.5, y: Math.max((momoBase.h * s) / 2 + 12, vp.h * 0.22), s };
}

export function computeLitIntroSpot(
  focus: WorldIntroFocus,
  vp: { w: number; h: number },
  thinmanRect: DOMRect | null | undefined,
): { x: number; y: number; r: number } {
  if (focus === "thinman") {
    if (thinmanRect && thinmanRect.width > 0) {
      return {
        x: thinmanRect.left + thinmanRect.width / 2,
        y: thinmanRect.top + thinmanRect.height / 2,
        r: Math.max(110, Math.round(vp.h * 0.22)),
      };
    }
    return { x: vp.w * 0.2, y: vp.h * 0.8, r: Math.max(110, Math.round(vp.h * 0.22)) };
  }
  return { x: vp.w * 0.62, y: vp.h * 0.8, r: Math.max(140, Math.round(vp.w * 0.2)) };
}
