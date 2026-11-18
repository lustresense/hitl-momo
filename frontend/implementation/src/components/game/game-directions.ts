/**
 * Which on-screen direction buttons the hand is lighting up. Pure, so the rule is unit-tested.
 */
import { arbiterOutput, type ArbiterState } from "@/src/input/arbiter";
import type { DirectionKey } from "./game-stage-types";

const DIRECTIONS: readonly DirectionKey[] = ["left", "right", "jump"];
const NO_MANUAL = { left: false, right: false, jump: false };

/**
 * Directions the hand alone is giving Thinman right now. It reuses the arbiter's gameplay rules
 * (tracked, fresh, not locked out) with keyboard and buttons removed. A held keyboard/button
 * left or right overrides the hand, so the hand must not light a direction Thinman ignores.
 */
export function handDirections(state: ArbiterState): DirectionKey[] {
  const manualHorizontal =
    state.keyboard.left || state.keyboard.right || state.buttons.left || state.buttons.right;
  const hand = arbiterOutput({ ...state, keyboard: NO_MANUAL, buttons: NO_MANUAL });
  return DIRECTIONS.filter((dir) => hand[dir] && !(manualHorizontal && dir !== "jump"));
}
