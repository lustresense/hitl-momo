import { CAMERA_MESSAGES, type CameraFailureReason } from "@/src/camera/messages";

/**
 * Copy layar Sampul, Gerbang Kamera+Mik, Intro Momo, Buka Buku, dan Nama (r8.3).
 * Disalin 1:1 dari proto-html/r83/index.html & onboarding/cam/index.html.
 * Aturan Owner:
 * - O-8: gunakan "Level", bukan "Bab".
 * - O-4 / O-15: tanpa nama contoh "Bima" di copy produksi; fallback ketik guru tanpa dead-end.
 */

export const COVER_HERO_COPY = {
  stageAriaLabel: "Sampul Sketchbook Universe",
  wordmarkTop: "SKETCHBOOK",
  wordmarkBottom: "UNIVERSE",
  taglineLine1: "Di dunia buku gambar ini, kamu yang pegang kendali.",
  taglineLine2: "Cukup gerakin tangan di depan layar buat bantu Momo.",
  momoSleepAriaLabel: "Momo tidur tegak dengan bagian bawah di belakang kartu kamera",
  momoAwakeAriaLabel: "Momo",
} as const;

/** proto-html/r83/index.html:452-459, 500-506, 824, 850-853, 1086-1088 */
export const COVER_GATE_COPY = {
  gateAriaLabel: "Izin kamera",
  speakerName: "Momo",
  mumbleLines: [
    "Zzz... kamera... zzz...",
    "Zzz... kok kayak ada orang ya...",
    "Eh... beneran ada orang... bangunin aku dong, pakai kameranya.",
  ] as const,
  flashUnchecked: "Zzz... centang dulu, ya...",
  flashNeedContinue: "Zzz... pencet Lanjut dulu...",
  noteTitle: "Soal kamera",
  noteBody:
    "Kamera dipakai buat baca gerakan tanganmu. Videonya nggak direkam dan diproses langsung di browser.",
  checkLabel: "Aku ngerti dan setuju kameranya dinyalakan.",
  goLabel: "Lanjut",
  doneLabel: "Sudah",
  cameraCardLabel: "Kamera",
  cameraCardAriaLabel: "Kartu kamera Sketchbook Universe",
  cameraPreviewLabel: "Pratinjau kamera",
  cameraOpeningLabel: "Membuka kamera…",
  cameraReadyLabel: "Kamera siap!",
  cameraSimLegend: "SIMULASI PRATINJAU",
  cameraSelectDefault: "Kamera depan",
  cameraSelectAriaLabel: "Pilih kamera",
  toggleOnLabel: "Nyalakan kamera",
  toggleOffLabel: "Matikan kamera",
  toggleLockedTitle: "Centang dan pencet Lanjut dulu",
  cameraOffNudge: "Aku belum bisa lihat kamu nih. Coba nyalakan kameranya, ya.",
  cameraDeniedMumble: "Kameranya belum bisa nyala, nggak apa-apa! Kita tetap bisa lanjut pakai mouse atau sentuh.",
  cameraFallbackButton: "Lanjut tanpa kamera",
  logoAriaLabel: "Sketchbook Universe",
} as const;

/** Pesan error kamera singkat dalam Bahasa Indonesia (sumber tunggal dari src/camera/messages.ts). */
export const COVER_CAMERA_ERROR_COPY: Readonly<Record<CameraFailureReason, string>> = CAMERA_MESSAGES;

/** proto-html/r83/index.html:793-798, 507 */
export const COVER_INTRO_COPY = {
  lines: [
    "Aku Momo, gambar satu-satunya yang hidup di dunia Sketchbook Universe.",
    "Aku barusan menemukan **Thinman**.",
    "Kayaknya dia butuh bantuanmu supaya bisa hidup juga sepertiku.",
    "Yuk, antar dia ke tempat yang tepat.",
  ] as const,
  ayoLabel: "Ayo!",
  ayoAriaLabel: "Ayo, cubit dan tahan",
} as const;

/** proto-html/r83/index.html:509-516, 951-953, 1138, 1147-1179 */
export const COVER_NAME_COPY = {
  bookAriaLabel: "Transisi buka buku dari cover ke halaman dalam",
  pageAriaLabel: "Halaman kenalan: sebut namamu",
  heading: "SIAPA NAMAMU?",
  subheading: "Sebelum masuk, kenalan dulu sama Momo, ya.",
  bubbleInitial: "Sebelum kita masuk, kenalan dulu, yuk. Siapa namamu?",
  bubbleInstruction: 'Cubit dan tahan di mana aja sampai lingkaran "Mulai bicara" penuh, lalu sebut namamu.',
  bubbleListening: "Aku dengerin… sebut namamu, ya. Cubitnya sudah boleh dilepas.",
  bubbleNotHeard: "Hmm, suaramu belum kedengaran. Cubit dan tahan lagi, lalu sebut namamu.",
  bubbleRetry: 'Oke, sekali lagi. Cubit dan tahan "Mulai bicara", lalu sebut namamu.',
  bubbleTypedPrompt: "Boleh juga diketik. Tulis namamu di kolom itu, ya.",
  startLabel: "Mulai bicara",
  startAriaLabel: "Mulai bicara, cubit dan tahan",
  againLabel: "Ulangi",
  againAriaLabel: "Ulangi, cubit dan tahan",
  yesLabel: "Ya, itu namaku",
  yesAriaLabel: "Ya, itu namaku, cubit dan tahan",
  /** Fallback ketik chrome untuk guru / saat STT tidak tersedia (O-4, O-15). */
  typedLinkLabel: "Mik nggak bisa? Ketik nama",
  typedBadgeLabel: "Ketik nama",
  typedUnavailableNote: "Pengenalan suara belum tersedia di sini. Guru atau kamu bisa ketik namamu di kolom ini.",
  typedPlaceholder: "Ketik namamu",
  typedInputAriaLabel: "Ketik namamu",
  typedSubmitLabel: "Pakai",
  typedEmptyHint: "Tulis minimal satu huruf buat namamu, ya.",
  /** Label khusus dev saat NEXT_PUBLIC_DEV_TOOLS=1 (O-4, O-15). */
  simBadgeLabel: "SIMULASI",
  simUnavailableNote: "SIMULASI: mik tidak terbaca di sini. Ketik namamu atau pakai tombol simulasi.",
  simSampleActionLabel: "Isi contoh (SIMULASI)",
  /** Tombol ulangi cover (dev saja, O-9). */
  replayLabel: "Ulangi cover",
} as const;

export function formatCoverIntroLine0(studentName?: string): string {
  const trimmed = studentName?.trim() ?? "";
  if (!trimmed) return COVER_INTRO_COPY.lines[0];
  return `Hai, ${trimmed}! Aku Momo, gambar satu-satunya yang hidup di dunia Sketchbook Universe.`;
}

export function formatNameConfirmPrompt(name: string): string {
  return `Namamu ${name}, ya? Kalau benar, dekatkan tangan ke "Ya, itu namaku" lalu cubit dan tahan. Kalau salah, ke "Ulangi".`;
}

export function formatNameGreeting(name: string): string {
  return `Senang kenalan sama kamu, ${name}!`;
}
