import { describe, expect, it } from "vitest";
import type { FaceBox } from "@/src/camera/face-anchor";
import { pickPrimaryHand } from "@/src/camera/primary-hand";
import {
  HAND_ROLE_LABEL,
  classifyHandRoles,
  countHandRoles,
  faceOverlapShare,
  playerRegion,
} from "@/src/components/nui-lab/lab-roles";
import { handAt } from "../camera/hand-points";

/** Player's face: centre x 0.5, top y 0.2, 0.2 wide, 0.25 high (normalised). */
const face: FaceBox = { x: 0.4, y: 0.2, w: 0.2, h: 0.25 };

/** The player's hand, raised above the head, wrist inside the player region. */
const playerHand = handAt(0.5, 0.05, 0.3);
/** A hand whose box lies inside the face box: the face misread as a hand. */
const faceMisread = handAt(0.5, 0.33, 0.2);
/** A hand at the left edge of the frame, far to the side of the player. */
const bystanderSide = handAt(0.05, 0.1, 0.3);
/** A second hand inside the player region, not the one the game locks. */
const secondInRegion = handAt(0.6, 0.1, 0.3);

describe("classifyHandRoles", () => {
  it("without a face, only the far hand is labelled; the rest are primary or other", () => {
    const far = handAt(0.1, 0.2, 0.05);
    expect(classifyHandRoles([far, playerHand, secondInRegion], 1, null)).toEqual(["far", "primary", "other"]);
  });

  it("marks the player's hand as primary when it is in the region", () => {
    expect(classifyHandRoles([playerHand], 0, face)).toEqual(["primary"]);
  });

  it("marks a hand that lies mostly over the face as a face misread", () => {
    expect(classifyHandRoles([faceMisread], null, face)).toEqual(["face"]);
  });

  it("marks a hand beside the player as outside the player area", () => {
    expect(classifyHandRoles([bystanderSide], null, face)).toEqual(["outside"]);
  });

  it("keeps a second hand inside the region as other, not outside", () => {
    expect(classifyHandRoles([playerHand, secondInRegion], 0, face)).toEqual(["primary", "other"]);
  });

  it("agrees with the game's pick: the primary hand the tracker picks is the one labelled primary", () => {
    const hands = [bystanderSide, faceMisread, playerHand];
    const pick = pickPrimaryHand(hands, null, 0, face);
    expect(pick.index).toBe(2);
    expect(classifyHandRoles(hands, pick.index, face)[2]).toBe("primary");
  });
});

describe("faceOverlapShare", () => {
  it("is 1 for a hand whose box lies inside the face box", () => {
    expect(faceOverlapShare(faceMisread, face)).toBeCloseTo(1, 6);
  });

  it("is 0 for a hand that does not touch the face", () => {
    expect(faceOverlapShare(bystanderSide, face)).toBe(0);
  });
});

describe("playerRegion", () => {
  it("spans 1.6 face widths to each side and 1 face height above to 4 below the face", () => {
    const r = playerRegion(face);
    expect(r.x0).toBeCloseTo(0.5 - 1.6 * 0.2, 6);
    expect(r.x1).toBeCloseTo(0.5 + 1.6 * 0.2, 6);
    expect(r.y0).toBeCloseTo(0.2 - 1.0 * 0.25, 6);
    expect(r.y1).toBeCloseTo(0.2 + 4.0 * 0.25, 6);
  });
});

describe("countHandRoles", () => {
  it("counts each rejected kind, and the primary and other hands separately", () => {
    const roles = ["far", "face", "outside", "outside", "primary", "other"] as const;
    expect(countHandRoles([...roles])).toEqual({ far: 1, face: 1, outside: 2, primary: 1, other: 1 });
  });
});

describe("HAND_ROLE_LABEL", () => {
  it("uses the Indonesian labels the owner reads on the page", () => {
    expect(HAND_ROLE_LABEL.far).toBe("diabaikan (jauh)");
    expect(HAND_ROLE_LABEL.face).toBe("wajah, bukan tangan");
    expect(HAND_ROLE_LABEL.outside).toBe("di luar area pemain");
  });
});
