/**
 * Level-selection screen: the ribbon bookmarks. `entryHold` keeps it mounted (inert) while the
 * drawing screen slides in over it.
 */
import { LEVELS, type LevelDefinition } from "@/src/domain/levels";
import { MomoGuide } from "@/src/components/momo/MomoGuide";
import { levelListStep } from "@/src/domain/guide-script";
import { levelListCameraStep } from "@/src/domain/level-list-script";
import { useInputMode } from "@/src/hooks/useHandGesture";
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
  // Camera mode names the finger gesture; fallback keeps the pull wording.
  const camera = useInputMode() === "camera";
  const listStep = camera ? levelListCameraStep(unlocked) : levelListStep(unlocked);
  return (
    <section id="screen-level-entry" aria-label="Pilih level" data-entry-hold={entryHold ? "" : undefined}>
      <h1 className="visually-hidden">Sketchbook Universe</h1>
      {/* While the entry hold runs, the level intro is on top of this list: it must not read the hand. */}
      <LevelRibbonBookmark levels={LEVELS} onSelectLevel={onSelectLevel} isLevelUnlocked={isLevelUnlocked} paused={entryHold} />
      {finished && !entryHold && <PageEdgeWalkers />}
      {!entryHold && <MomoGuide step={listStep} startDelay={900} testId="levels-momo" />}
    </section>
  );
}
