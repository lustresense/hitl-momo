/** Words that grade the student or the AI. The closing must not use them (BIGPROMPT 6.9: no score, no "smart"). */
export const FORBIDDEN_JUDGEMENT_WORDS = [
  "pintar", "bodoh", "hebat", "bagus", "jelek", "buruk", "benar", "salah", "skor", "nilai", "sempurna",
  "kurang", "baik", "keren", "tepat", "akurat", "berhasil", "gagal", "juara", "peringkat", "bintang",
] as const;
