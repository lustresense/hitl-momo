/**
 * Entry of the character book bundle. Re-exports the REAL runtime pieces (Momo engine + Thinman rig/adapter)
 * from implementation/src so the book shows exactly what the game draws. Read-only: nothing here edits implementation/.
 */
import gsap from "gsap";
import { MomoEngine, EXPRESSIONS, MOMO_ASPECT } from "../../implementation/src/components/momo/momo-engine";
import { CharacterAnimationAdapter } from "../../implementation/src/game/character/character-animation-adapter";
import { renderCharacterAFrontSvg, renderCharacterASideSvg } from "../../implementation/src/game/character/character-a-svg";
import { walkT } from "../../implementation/src/game/character/pose-math";
import { CHARACTER_A_CONFIG, POSES } from "../../implementation/src/game/character/character-rig-constants";

(window as unknown as { Sheet: unknown }).Sheet = {
  gsap,
  MomoEngine,
  EXPRESSIONS,
  MOMO_ASPECT,
  CharacterAnimationAdapter,
  renderCharacterAFrontSvg,
  renderCharacterASideSvg,
  CHARACTER_A_CONFIG,
  POSES,
  walkT,
};
