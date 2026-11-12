import type { GuideStep } from "./guide-script";

/**
 * Momo's line on the level list in camera mode. The bab is chosen with 1, 2 or 3 fingers on its ring, so the line
 * names the gesture. Fallback (mouse, no camera) keeps levelListStep in guide-script.ts, which asks for a pull.
 * Lives here, not in guide-script.ts, because that file has one owner for its copy.
 */
export function levelListCameraStep(unlocked: number): GuideStep {
  const pick = "Tunjukkan 1, 2, atau 3 jarimu ke kamera buat memilih bab yang mau kamu mainkan!";
  if (unlocked <= 1) return { mood: "Semangat", lines: ["Ini bab-bab bukunya. Mulai dari Bab 1.", pick] };
  if (unlocked === 2) return { mood: "Senang", lines: ["Bab 2 sudah kebuka!", pick] };
  return { mood: "Senang", lines: ["Semua bab sudah kebuka!", pick] };
}
