/**
 * Label map for the partner classifier (backend config.py CATEGORIES, 20 QuickDraw classes).
 *
 * - displayName: the Indonesian name a student reads in the Top-3. Presentation only.
 * - gameLabel: a level object (papan, balok, tangga, batu, duri, tali, ember) that the class
 *   truly stands for, or null. There is no false equivalence: null means the decision is
 *   "unresolved" in the game. Proposal for Dias and Can: contracts/LABEL_MAP_PROPOSAL.md.
 */
export interface ModelLabelEntry {
  /** Exact class name the model sends (lowercase, English). */
  modelLabel: string;
  displayName: string;
  gameLabel: string | null;
}

export const MODEL_LABEL_MAP: readonly ModelLabelEntry[] = [
  { modelLabel: "apple", displayName: "Apel", gameLabel: null },
  { modelLabel: "banana", displayName: "Pisang", gameLabel: null },
  { modelLabel: "bicycle", displayName: "Sepeda", gameLabel: null },
  { modelLabel: "bird", displayName: "Burung", gameLabel: null },
  { modelLabel: "book", displayName: "Buku", gameLabel: null },
  { modelLabel: "car", displayName: "Mobil", gameLabel: null },
  { modelLabel: "cat", displayName: "Kucing", gameLabel: null },
  { modelLabel: "cloud", displayName: "Awan", gameLabel: null },
  { modelLabel: "dog", displayName: "Anjing", gameLabel: null },
  { modelLabel: "fish", displayName: "Ikan", gameLabel: null },
  { modelLabel: "flower", displayName: "Bunga", gameLabel: null },
  { modelLabel: "house", displayName: "Rumah", gameLabel: null },
  { modelLabel: "moon", displayName: "Bulan", gameLabel: null },
  { modelLabel: "star", displayName: "Bintang", gameLabel: null },
  { modelLabel: "sun", displayName: "Matahari", gameLabel: null },
  { modelLabel: "tree", displayName: "Pohon", gameLabel: null },
  { modelLabel: "airplane", displayName: "Pesawat", gameLabel: null },
  { modelLabel: "sailboat", displayName: "Perahu layar", gameLabel: null },
  { modelLabel: "chair", displayName: "Kursi", gameLabel: null },
  { modelLabel: "mountain", displayName: "Gunung", gameLabel: null },
];

const BY_MODEL_LABEL = new Map(MODEL_LABEL_MAP.map((e) => [e.modelLabel, e] as const));

/** Matches a model label after trim and lowercasing. Undefined when the model class is not known here. */
export function lookupModelLabel(raw: string): ModelLabelEntry | undefined {
  return BY_MODEL_LABEL.get(raw.trim().toLowerCase());
}

/**
 * Candidate fields added by the label map. Optional so the demo and older fixtures still type-check.
 * Declaration merging, the same pattern as provenance.ts (src/domain/types.ts is not edited here).
 */
declare module "../domain/types" {
  interface PredictionCandidate {
    /** The label exactly as the model sent it (trimmed). Absent for demo candidates. */
    modelLabel?: string;
    /** Level object this candidate stands for; null when there is no honest equivalent. */
    gameLabel?: string | null;
  }
}
