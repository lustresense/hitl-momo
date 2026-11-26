/**
 * Copy kanvas, 5 alat, ring "Tebak Gambarku", panel Top-3, stiker, misi bohlam, dan error provider r8.3.
 * Memakai istilah "Level" (O-8, bukan "Bab") dan provenance Mock tanpa kata "Demo".
 */
function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export const CANVAS_COPY = {
  screenLabel: (stage: number) => `Level ${stage} · Canvas`,
  hint: "Cubit, tahan, geser di kertas = gambar · alat: tunjuk lalu cubit · Tebak Gambarku: tunjuk, cubit, tahan 2 detik",
  canvasAriaLabel: "Kanvas menggambar",
  toolbarAriaLabel: "Alat menggambar",
  tools: {
    pencil: { label: "Pensil", ariaLabel: "Pensil", title: "Pensil" },
    eraser: { label: "Hapus", ariaLabel: "Hapus", title: "Hapus sebagian goresan" },
    undo: { label: "Mundur", ariaLabel: "Mundur", title: "Mundur satu langkah" },
    redo: { label: "Maju", ariaLabel: "Maju", title: "Maju satu langkah" },
    clear: { label: "Bersihkan", ariaLabel: "Bersihkan", title: "Bersihkan kertas" },
  },
  momo: {
    cue: "Gambar bendamu di kertas ini: cubit, tahan, lalu geser. Nanti aku coba tebak!",
    recommend: (stage: number) =>
      `Untuk **Level ${stage}**, kamu bisa gambar benda-benda ini! Langsung cubit dan geser di kertas untuk mulai.`,
    empty: "Kanvasnya masih kosong. Gambar sesuatu dulu ya.",
    emptyAlert: "Gambar dulu sebelum menebak.",
    askIdle: "Sudah selesai? Tunjuk **Tebak Gambarku**, lalu cubit dan tahan sampai penuh. Masih mau mengubah juga boleh.",
    predicting: "Hmm... ini gambar apa, ya?",
    guessRingLabel: "Tebak Gambarku",
  },
  guess: {
    title: "Tebakan Momo",
    groupAriaLabel: "Tiga tebakan Momo dan keputusanmu",
    listAriaLabel: "Tiga tebakan teratas",
    predictingPlaceholder: "Momo lagi menebak…",
    acceptVerb: "Terima",
    correctVerb: "Pakai",
    otherCta: "Bukan ini, pilih lainnya",
    backCta: "Kembali",
    redrawCta: "Gambar lagi",
    otherHeading: "Benda lain di level ini:",
    otherEmpty: "Tidak ada benda lain di level ini.",
    compareReminder: "Persen bukan jaminan benar. Kamu yang memutuskan.",
    pickInstruction: "Dekatkan tanganmu ke jawaban yang benar, lalu cubit dan tahan sampai lingkarannya penuh.",
    otherPrompt: "Oke, bukan itu. Dekatkan tanganmu ke benda yang kamu gambar, lalu cubit dan tahan.",
    backPrompt: "Balik ke tebakanku. Pilih yang paling cocok, ya.",
    provenance: {
      mock: "Mode Mock: tebakan simulasi",
      partner: "Model partner",
    },
    errorAriaLabel: "Kendala prediksi AI",
    errorTitle: "Momo belum bisa menebak",
    errorMomoLine: "Hmm, aku belum bisa membaca gambarmu. Mau coba lagi?",
    errorFallbackDetail: "Terjadi kesalahan pada layanan prediksi.",
    retryCta: "Coba lagi",
    redrawErrorCta: "Gambar lagi",
  },
  sticker: {
    ariaLabel: "Stiker hasil gambar",
    throwLabel: "Lempar",
    redrawLabel: "Gambar lagi",
    alt: (label: string) => `Stiker ${label}`,
    line: (label: string) =>
      `${label} sudah jadi stiker! Cubit, lalu **sentil ke atas** buat melemparnya ke dunia. Kalau mau ulang, dekatkan tangan ke **Gambar lagi** dan tahan.`,
  },
  mission: {
    buttonAriaLabel: "Rekomendasi benda",
    buttonTitle: "Rekomendasi benda",
    dialogAriaLabel: "Rekomendasi benda untuk digambar",
    heading: "Bisa gambar benda ini:",
    examplesPrefix: "Contoh:",
    levelKicker: (stage: number) => `Level ${stage}`,
    formatTitle: (title: string) => title.replace(/^Bab\b/i, "Level"),
  },
} as const;

/** Pertanyaan Momo saat menampilkan Top-3 (store.js:51-57), persentase selalu dari provider asli. */
export function guessQuestionLine(stage: number, label: string, pct: number, second?: string): string {
  if (stage === 1) {
    return `Gampang! Ini pasti ${label}, ${pct}%. Bener gak?`;
  }
  if (stage === 2) {
    return second
      ? `${capitalize(label)}? Eh, atau ${second}? Kok aku jadi bingung. ${capitalize(label)} ${pct}%, bener gak?`
      : `${capitalize(label)}? Kok aku jadi bingung. ${pct}%, bener gak?`;
  }
  return `Aku nggak bisa lihat jelas... mungkin ${label}, ${pct}%. Terserah kamu ya. Kamu yang lebih tahu.`;
}
