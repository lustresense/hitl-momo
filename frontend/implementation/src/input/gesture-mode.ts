/**
 * One gesture router for the whole app (REVISI §18C). A screen states its mode; `allowedActions(mode)` says which
 * hand pose may do what in that mode. The same pose can mean different things in different modes, and a pose
 * that is not in the mode's map does nothing. Screens import the mode constants and `actionFor`; nothing else
 * decides what a gesture means.
 *
 * Pure: no DOM, no timers. The hold-to-confirm ring (GestureRing) and the latch belong to the screen.
 */
import type { HandPose } from "./hand-gesture";

export const MODE_CANVAS_DRAWING = "MODE_CANVAS_DRAWING";
/** The student has finished; a thumbs-up asks for the Top-3. */
export const MODE_CANVAS_PREDICT_TRIGGER = "MODE_CANVAS_PREDICT_TRIGGER";
/** The sticker is on the canvas after the decision: throw it into the world, or draw again. */
export const MODE_CANVAS_STAMP_READY = "MODE_CANVAS_STAMP_READY";
/** A new sticker has landed: put it here, draw again, or grab it. */
export const MODE_GAMEPLAY_PLACEMENT = "MODE_GAMEPLAY_PLACEMENT";
/** The object is placed and the camera drives Thinman / the object: grab, turn it (palm and twist), steer. */
export const MODE_GAMEPLAY_EXPLORATION_CAM = "MODE_GAMEPLAY_EXPLORATION_CAM";
/** Top-3 candidates: 1/2/3 fingers pick, open palm = not this one, pinch = draw again. */
export const MODE_TOP3_PANEL = "MODE_TOP3_PANEL";
/** The list of other labels after "Bukan ini": 1/2/3 fingers pick (4 and 5: see fingerCountAction). */
export const MODE_TOP3_ALTERNATIVES = "MODE_TOP3_ALTERNATIVES";
/** A dialog or a story line that needs an acknowledgement (thumbs-up only). */
export const MODE_DIALOG_ACK = "MODE_DIALOG_ACK";
/** Tutorial cards: thumbs-up acknowledges, the rest is the card's practice (drawing poses on card 3). */
export const MODE_TUTORIAL = "MODE_TUTORIAL";
/** Cover: the wave is motion (WaveTracker), not a pose, so no pose acts here. */
export const MODE_COVER_WAVE = "MODE_COVER_WAVE";
/** Level picker: 1/2/3 fingers pick the chapter. */
export const MODE_LEVEL_SELECT = "MODE_LEVEL_SELECT";
/** Failed attempt: 1 finger retry, 2 fingers move the object, 3 fingers draw again. */
export const MODE_FAIL = "MODE_FAIL";

export type GestureMode =
  | typeof MODE_CANVAS_DRAWING
  | typeof MODE_CANVAS_PREDICT_TRIGGER
  | typeof MODE_CANVAS_STAMP_READY
  | typeof MODE_GAMEPLAY_PLACEMENT
  | typeof MODE_GAMEPLAY_EXPLORATION_CAM
  | typeof MODE_TOP3_PANEL
  | typeof MODE_TOP3_ALTERNATIVES
  | typeof MODE_DIALOG_ACK
  | typeof MODE_TUTORIAL
  | typeof MODE_COVER_WAVE
  | typeof MODE_LEVEL_SELECT
  | typeof MODE_FAIL;

export type GestureAction =
  | "draw"
  | "erase"
  | "undo"
  | "redo"
  | "request-prediction"
  | "throw"
  | "redraw"
  | "place"
  | "grab"
  | "rotate"
  | "steer"
  | "choose-1"
  | "choose-2"
  | "choose-3"
  | "choose-4"
  | "choose-5"
  | "not-this"
  | "ack"
  | "pinch"
  | "retry"
  | "move-object"
  | "level-1"
  | "level-2"
  | "level-3";

type ActionMap = Partial<Record<HandPose, GestureAction>>;

const MAPS: Record<GestureMode, ActionMap> = {
  [MODE_CANVAS_DRAWING]: { pinch: "draw", fist: "erase", "open-palm": "erase", "one-finger": "undo", "two-fingers": "redo" },
  [MODE_CANVAS_PREDICT_TRIGGER]: { "thumb-up": "request-prediction" },
  [MODE_CANVAS_STAMP_READY]: { "thumb-up": "throw", "open-palm": "redraw" },
  [MODE_GAMEPLAY_PLACEMENT]: { "thumb-up": "place", "open-palm": "redraw", pinch: "grab" },
  // The palm (open or split) starts the turn; the stage reads its roll, so a still palm does not turn the object.
  [MODE_GAMEPLAY_EXPLORATION_CAM]: { pinch: "grab", "open-palm": "rotate", "split-palm": "rotate", "one-finger": "steer" },
  [MODE_TOP3_PANEL]: { "one-finger": "choose-1", "two-fingers": "choose-2", "three-fingers": "choose-3", "open-palm": "not-this", pinch: "redraw" },
  [MODE_TOP3_ALTERNATIVES]: { "one-finger": "choose-1", "two-fingers": "choose-2", "three-fingers": "choose-3" },
  [MODE_DIALOG_ACK]: { "thumb-up": "ack" },
  [MODE_TUTORIAL]: { "thumb-up": "ack", pinch: "pinch", fist: "erase", "open-palm": "erase", "one-finger": "undo", "two-fingers": "redo" },
  [MODE_COVER_WAVE]: {},
  [MODE_LEVEL_SELECT]: { "one-finger": "level-1", "two-fingers": "level-2", "three-fingers": "level-3" },
  [MODE_FAIL]: { "one-finger": "retry", "two-fingers": "move-object", "three-fingers": "redraw" },
};

/** The poses that may act in `mode`, and what each one does. A copy: callers cannot change the router. */
export function allowedActions(mode: GestureMode): Readonly<ActionMap> {
  return { ...MAPS[mode] };
}

/** The action of `pose` in `mode`, or null when that pose does nothing there. */
export function actionFor(mode: GestureMode, pose: HandPose): GestureAction | null {
  return MAPS[mode][pose] ?? null;
}

/** Finger counts 1..5 as a choice (for lists of 4 or 5 items, where no pose exists yet); null otherwise. */
export function fingerCountAction(count: number): GestureAction | null {
  switch (count) {
    case 1: return "choose-1";
    case 2: return "choose-2";
    case 3: return "choose-3";
    case 4: return "choose-4";
    case 5: return "choose-5";
    default: return null;
  }
}
