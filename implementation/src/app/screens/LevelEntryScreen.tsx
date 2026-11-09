/**
 * Level-selection screen: the ribbon bookmarks. `entryHold` keeps it mounted (inert) while the
 * drawing screen slides in over it.
 */
import { LEVELS, type LevelDefinition } from "@/src/domain/levels";
import { MomoGuide } from "@/src/components/momo/MomoGuide";
import { levelListStep } from "@/src/domain/guide-script";
import { LevelRibbonBookmark } from "@/src/components/level/LevelRibbonBookmark";
import { PageEdgeWalkers } from "@/src/components/level/PageEdgeWalkers";

export interface LevelEntryScreenProps {
  entryHold: boolean;
  onSelectLevel: (level: LevelDefinition) => void;
  isLevelUnlocked: (stage: number) => boolean;
  /** R9: the student finished the closing; the easter egg walks along the page edge. */
  finished?: boolean;
}

export function LevelEntryScreen({ entryHold, onSelectLevel, isLevelUnlocked, finished = false }: LevelEntryScreenProps) {
  const unlocked = LEVELS.filter((level) => isLevelUnlocked(level.stage)).length;
  return (
    <section id="screen-level-entry" aria-label="Pilih level" data-entry-hold={entryHold ? "" : undefined}>
      <h1 className="visually-hidden">Sketchbook Universe</h1>
      <LevelRibbonBookmark levels={LEVELS} onSelectLevel={onSelectLevel} isLevelUnlocked={isLevelUnlocked} />
      {finished && !entryHold && <PageEdgeWalkers />}
      {!entryHold && <MomoGuide step={levelListStep(unlocked)} startDelay={900} testId="levels-momo" />}
    </section>
  );
}
