import { beforeEach, describe, expect, it } from "vitest";
import { getCameraAssistState, publishCameraAssistState, resetCameraAssistStateForTest, subscribeCameraAssistState } from "@/src/camera/camera-assist-state";

beforeEach(resetCameraAssistStateForTest);

describe("single Momo camera failure recovery signal", () => {
  it("replays idle, reports failure once, then returns to ready and idle", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeCameraAssistState((next) => seen.push(next));
    publishCameraAssistState("failed");
    publishCameraAssistState("failed");
    publishCameraAssistState("ready");
    publishCameraAssistState("idle");
    expect(seen).toEqual(["idle", "failed", "ready", "idle"]);
    unsubscribe();
    publishCameraAssistState("failed");
    expect(seen).toHaveLength(4);
    expect(getCameraAssistState()).toBe("failed");
  });
});
