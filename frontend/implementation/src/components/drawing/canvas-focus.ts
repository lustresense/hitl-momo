/**
 * Copy and timing of the drawing screen's own Momo moments: the focus phase on arrival (tool review, then the
 * level's catalog, then "Mulai Menggambar") and the idle question after 10 s without brush or eraser.
 * Momo's lines live here so the screen stays a composition; the copy follows the Owner's wording (no emoji).
 */

/** Idle time (ms) without brush, pinch, fist or pointer press before Momo asks whether the drawing is done. */
export const IDLE_PROMPT_MS = 10000;

export const FOCUS_START_LABEL = "Mulai Menggambar";

/** Camera mode: the four tools by their gesture (cubit, kepal, dua jari, telapak). */
export const FOCUS_TOOL_LINES_CAMERA: string[] = [
  "Ini empat alat di sebelah kanan.",
  "Gambar: cubit jarimu, lalu geser untuk mencoret.",
  "Hapus: kepalkan tangan untuk menghapus coretan.",
  "Mundur: tunjukkan dua jari. Maju: tunjukkan telapak tangan.",
];

/** Mouse and keyboard fallback: the same four tools by name, no gesture words. */
export const FOCUS_TOOL_LINES_POINTER: string[] = [
  "Ini empat alat di sebelah kanan: Gambar, Hapus, Mundur, dan Maju.",
];

export const FOCUS_CATALOG_LINES_CAMERA: string[] = [
  "Untuk level ini, kamu bisa menggambar benda-benda ini.",
  "Kalau sudah siap, acungkan jempol dan tahan.",
];

export const FOCUS_CATALOG_LINES_POINTER: string[] = [
  "Untuk level ini, kamu bisa menggambar benda-benda ini.",
  "Kalau sudah siap, tekan dan tahan tombol Mulai Menggambar.",
];

export const IDLE_PROMPT_LINE_CAMERA = "Sudah selesai gambarnya? Kalau sudah, acungkan jempol, ya.";
export const IDLE_PROMPT_LINE_POINTER = "Sudah selesai gambarnya? Kalau sudah, tekan ikon jempol di kanan bawah, ya.";
