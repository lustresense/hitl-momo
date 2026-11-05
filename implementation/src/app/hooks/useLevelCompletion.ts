/**
 * Remembers a finished level so the next stage unlocks (see level-progress).
 */
import { useEffect } from "react";
import { getLevel } from "@/src/domain/levels";
import type { FlowStateSnapshot } from "../state-machine";
import { recordCompletedStage } from "../level-progress";

export function useLevelCompletion(snapshot: FlowStateSnapshot | null) {
  useEffect(() => {
    if (snapshot?.phase !== "complete" || !snapshot.levelId || typeof window === "undefined") return;
    const completedLevel = getLevel(snapshot.levelId);
    if (!completedLevel) return;
    recordCompletedStage(completedLevel.stage);
  }, [snapshot?.phase, snapshot?.levelId]);
}
