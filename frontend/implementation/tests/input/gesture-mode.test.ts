import { describe, expect, it } from "vitest";
import {
  MODE_CANVAS_DRAWING,
  MODE_CANVAS_PREDICT_TRIGGER,
  MODE_CANVAS_STAMP_READY,
  MODE_COVER_WAVE,
  MODE_DIALOG_ACK,
  MODE_FAIL,
  MODE_GAMEPLAY_EXPLORATION_CAM,
  MODE_GAMEPLAY_PLACEMENT,
  MODE_LEVEL_SELECT,
  MODE_TOP3_ALTERNATIVES,
  MODE_TOP3_PANEL,
  MODE_TUTORIAL,
  actionFor,
  allowedActions,
  fingerCountAction,
  type GestureMode,
} from "@/src/input/gesture-mode";
import type { HandPose } from "@/src/input/hand-gesture";

const ALL_MODES: GestureMode[] = [
  MODE_CANVAS_DRAWING,
  MODE_CANVAS_PREDICT_TRIGGER,
  MODE_CANVAS_STAMP_READY,
  MODE_GAMEPLAY_PLACEMENT,
  MODE_GAMEPLAY_EXPLORATION_CAM,
  MODE_TOP3_PANEL,
  MODE_TOP3_ALTERNATIVES,
  MODE_DIALOG_ACK,
  MODE_TUTORIAL,
  MODE_COVER_WAVE,
  MODE_LEVEL_SELECT,
  MODE_FAIL,
];

const EXPECTED: Record<GestureMode, Partial<Record<HandPose, string>>> = {
  [MODE_CANVAS_DRAWING]: { pinch: "draw", fist: "erase", "two-fingers": "undo", "split-palm": "redo", "open-palm": "redo" },
  [MODE_CANVAS_PREDICT_TRIGGER]: { "thumb-up": "request-prediction" },
  [MODE_CANVAS_STAMP_READY]: { "thumb-up": "throw", "open-palm": "redraw" },
  [MODE_GAMEPLAY_PLACEMENT]: { "thumb-up": "place", "open-palm": "redraw", pinch: "grab" },
  [MODE_GAMEPLAY_EXPLORATION_CAM]: { pinch: "grab", "open-palm": "rotate", "one-finger": "steer" },
  [MODE_TOP3_PANEL]: { "one-finger": "choose-1", "two-fingers": "choose-2", "three-fingers": "choose-3", "open-palm": "not-this", pinch: "redraw" },
  [MODE_TOP3_ALTERNATIVES]: { "one-finger": "choose-1", "two-fingers": "choose-2", "three-fingers": "choose-3" },
  [MODE_DIALOG_ACK]: { "thumb-up": "ack" },
  [MODE_TUTORIAL]: { "thumb-up": "ack", pinch: "pinch", fist: "erase", "two-fingers": "undo", "split-palm": "redo", "open-palm": "redo" },
  [MODE_COVER_WAVE]: {},
  [MODE_LEVEL_SELECT]: { "one-finger": "level-1", "two-fingers": "level-2", "three-fingers": "level-3" },
  [MODE_FAIL]: { "one-finger": "retry", "two-fingers": "move-object", "three-fingers": "redraw" },
};

describe("gesture-mode: one router, each mode allows only its own actions", () => {
  for (const mode of ALL_MODES) {
    it(`${mode} maps exactly its own poses`, () => {
      expect(allowedActions(mode)).toEqual(EXPECTED[mode]);
    });
  }

  it("the thumbs-up never draws, and the drawing pinch never acknowledges a dialog", () => {
    expect(actionFor(MODE_CANVAS_DRAWING, "thumb-up")).toBeNull();
    expect(actionFor(MODE_DIALOG_ACK, "pinch")).toBeNull();
    expect(actionFor(MODE_DIALOG_ACK, "thumb-up")).toBe("ack");
  });

  it("the same pose means a different action per mode (one source, state decides)", () => {
    expect(actionFor(MODE_CANVAS_DRAWING, "pinch")).toBe("draw");
    expect(actionFor(MODE_GAMEPLAY_EXPLORATION_CAM, "pinch")).toBe("grab");
    expect(actionFor(MODE_TOP3_PANEL, "pinch")).toBe("redraw");
    expect(actionFor(MODE_CANVAS_STAMP_READY, "open-palm")).toBe("redraw");
    expect(actionFor(MODE_GAMEPLAY_EXPLORATION_CAM, "open-palm")).toBe("rotate");
  });

  it("no pose outside a mode's map is an action: unknown and none give null", () => {
    expect(actionFor(MODE_COVER_WAVE, "thumb-up")).toBeNull();
    expect(actionFor(MODE_CANVAS_DRAWING, "none")).toBeNull();
  });

  it("fingerCountAction maps 1..5 fingers to choice 1..5 and nothing else", () => {
    expect(fingerCountAction(1)).toBe("choose-1");
    expect(fingerCountAction(4)).toBe("choose-4");
    expect(fingerCountAction(5)).toBe("choose-5");
    expect(fingerCountAction(0)).toBeNull();
    expect(fingerCountAction(6)).toBeNull();
  });
});
