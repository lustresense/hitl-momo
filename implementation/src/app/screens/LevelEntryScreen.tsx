/**
 * Level-selection screen: the ribbon bookmarks. `entryHold` keeps it mounted (inert) while the
 * drawing screen slides in over it.
 */
import { LEVELS, type LevelDefinition } from "@/src/domain/levels";
import { LevelRibbonBookmark } from "@/src/components/level/LevelRibbonBookmark";

export interface LevelEntryScreenProps {
  entryHold: boolean;
  onSelectLevel: (level: LevelDefinition) => void;
  isLevelUnlocked: (stage: number) => boolean;
}

export function LevelEntryScreen({ entryHold, onSelectLevel, isLevelUnlocked }: LevelEntryScreenProps) {
  return (
    <section id="screen-level-entry" aria-label="Pilih level" data-entry-hold={entryHold ? "" : undefined}>
      <h1 className="visually-hidden">Sketchbook Universe</h1>
      <LevelRibbonBookmark levels={LEVELS} onSelectLevel={onSelectLevel} isLevelUnlocked={isLevelUnlocked} />
    </section>
  );
}
