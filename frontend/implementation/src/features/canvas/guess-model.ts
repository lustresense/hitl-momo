import { CANVAS_COPY, guessQuestionLine } from "@/src/domain/copy/canvas";
import type { LevelDefinition } from "@/src/domain/levels";
import { confidencePercent, momoLevelTone, type MomoMood } from "@/src/domain/momo-script";
import type { LevelContext, PredictionCandidate, PredictionResult } from "@/src/domain/types";

export interface GuessRowModel {
  readonly rank: 1 | 2 | 3;
  readonly label: string;
  readonly displayLabel: string;
  readonly percent: number;
  readonly actionKind: "accept" | "correct";
  readonly actionVerb: "Terima" | "Pakai";
}

export interface OverrideCatalogItem {
  readonly labelId: string;
  readonly displayName: string;
}

export interface GuessProvenanceModel {
  readonly mode: "mock" | "partner";
  readonly isMock: boolean;
  readonly badgeText: string;
}

export interface GuessModel {
  readonly rows: readonly GuessRowModel[];
  readonly provenance: GuessProvenanceModel;
  readonly overrideOptions: readonly OverrideCatalogItem[];
  readonly momoLines: readonly string[];
  readonly momoMood: MomoMood;
  readonly momoFog: number;
}

export function formatObjectLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed;
}

/**
 * Resolves provenance cleanly without ever using the sandbox "Demo" chip.
 * Any result explicitly carrying `provenance.mode === "mock"` remains marked Mock.
 */
export function resolveGuessProvenance(
  providerMode: "mock" | "partner",
  prediction: PredictionResult | null,
): GuessProvenanceModel {
  const effectiveMode: "mock" | "partner" =
    prediction?.provenance?.mode === "mock"
      ? "mock"
      : prediction?.provenance?.mode === "partner"
        ? "partner"
        : providerMode;
  return {
    mode: effectiveMode,
    isMock: effectiveMode === "mock",
    badgeText: effectiveMode === "mock" ? CANVAS_COPY.guess.provenance.mock : CANVAS_COPY.guess.provenance.partner,
  };
}

/**
 * Invariant Override (§2.4 butir 8): mengambil katalog level dari `src/domain/levels.ts`
 * dan membuang seluruh label yang sudah ada di Top-3.
 */
export function overrideCatalogFor(
  level: Pick<LevelDefinition, "catalog"> | LevelContext,
  top3: readonly (PredictionCandidate | Pick<PredictionCandidate, "label"> | string)[],
): OverrideCatalogItem[] {
  const excluded = new Set(
    top3.map((entry) => (typeof entry === "string" ? entry : entry.label).trim().toLowerCase()),
  );
  const rawCatalog: readonly { labelId: string; displayName: string }[] =
    "catalog" in level && Array.isArray(level.catalog)
      ? level.catalog
      : "vocabulary" in level
        ? level.vocabulary.map((labelId) => ({ labelId, displayName: formatObjectLabel(labelId) }))
        : [];

  const seen = new Set<string>();
  const out: OverrideCatalogItem[] = [];
  for (const item of rawCatalog) {
    const key = item.labelId.trim().toLowerCase();
    if (!key || excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      labelId: item.labelId,
      displayName: item.displayName || formatObjectLabel(item.labelId),
    });
  }
  return out;
}

/**
 * Builds the view model for GuessPanel directly from provider `PredictionResult`
 * (real labels & confidences only; never calls heuristics).
 */
export function buildGuessModel(
  prediction: PredictionResult,
  level: LevelDefinition,
  providerMode: "mock" | "partner",
): GuessModel {
  const nameLookup = new Map<string, string>();
  for (const item of level.catalog) {
    nameLookup.set(item.labelId.trim().toLowerCase(), item.displayName);
  }

  const rows: GuessRowModel[] = prediction.candidates.map((candidate, index) => {
    const rank = (index + 1) as 1 | 2 | 3;
    const key = candidate.label.trim().toLowerCase();
    const displayLabel = nameLookup.get(key) ?? formatObjectLabel(candidate.label);
    return {
      rank,
      label: candidate.label,
      displayLabel,
      percent: confidencePercent(candidate.confidence),
      actionKind: rank === 1 ? "accept" : "correct",
      actionVerb: rank === 1 ? CANVAS_COPY.guess.acceptVerb : CANVAS_COPY.guess.correctVerb,
    };
  });

  const provenance = resolveGuessProvenance(providerMode, prediction);
  const overrideOptions = overrideCatalogFor(level, prediction.candidates);
  const tone = momoLevelTone(level.stage);
  const first = rows[0];
  const second = rows[1];
  const momoLines = first
    ? [
        guessQuestionLine(level.stage, first.label, first.percent, second?.label),
        CANVAS_COPY.guess.compareReminder,
        CANVAS_COPY.guess.pickInstruction,
      ]
    : [CANVAS_COPY.guess.compareReminder];

  return {
    rows,
    provenance,
    overrideOptions,
    momoLines,
    momoMood: tone.guessMood,
    momoFog: tone.fog,
  };
}
