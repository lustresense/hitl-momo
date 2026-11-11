/**
 * Hand control of the world stage: runs the GameplayHandDriver while GameStage says the stage is
 * in camera mode (no toggle), and shows the status text the student sees.
 */
import { useEffect, useState, type MutableRefObject } from "react";
import type { GameplayHandDriver, GameplayStatus } from "@/src/input/gameplay-hand-driver";
import type { GameplayInput } from "./useGameplayInput";
import type { GameStageProps, InputMode, StageOutcome, StagePhase } from "../game-stage-types";
import { publishSteerAngle } from "../steer-reading";

const PREPARING_CAMERA = "Menyiapkan kamera";

const STATUS_TEXT: Record<GameplayStatus, string> = {
  tracking: "Tangan terbaca",
  "tracking-lost": "Tangan tidak terlihat",
  initializing: PREPARING_CAMERA,
  "camera-unavailable": "Kamera gagal, pakai keyboard",
  error: "Kamera gagal, pakai keyboard",
};

interface UseHandControlOptions {
  ready: boolean;
  phase: StagePhase;
  outcome: StageOutcome | null;
  /** Decided by GameStage. The hand reader runs only in "camera". */
  mode: InputMode;
  input: GameplayInput;
  /** Always points at the newest props (the driver callbacks outlive renders). */
  latest: MutableRefObject<GameStageProps>;
  movePlacementToHandCursor: (cursor: { x: number; y: number }) => void;
  /** The hand reader could not start or crashed: GameStage switches the stage to fallback (R13). */
  onHandFailed: () => void;
}

export function useHandControl({
  ready,
  phase,
  outcome,
  mode,
  input,
  latest,
  movePlacementToHandCursor,
  onHandFailed,
}: UseHandControlOptions) {
  // The student never sees a developer label: the first status is the honest "preparing" one.
  const [status, setStatus] = useState(PREPARING_CAMERA);
  const { arbiter, sendCombinedInput } = input;
  // Placing and gameplay share one reader. The phase change alone must not reload MediaPipe.
  const readerWanted = ready && mode === "camera" && !outcome && (phase === "placing" || phase === "gameplay");

  useEffect(() => {
    sendCombinedInput();
    if (!readerWanted) return;
    let cancelled = false;
    let driver: GameplayHandDriver | null = null;
    // A fresh start opts in again after an earlier camera revoke (arbiter R5).
    arbiter.dispatch({ type: "camera", status: "ok" });

    async function startDriver() {
      const { GameplayHandDriver: DriverClass } = await import("@/src/input/gameplay-hand-driver");
      if (cancelled) return;
      const video = document.querySelector<HTMLVideoElement>(".global-camera-host .camera-video");
      if (!video) {
        setStatus("Kamera belum tersedia");
        onHandFailed();
        return;
      }
      driver = new DriverClass({
        video,
        onStatus: (next) => {
          if (cancelled) return;
          setStatus(STATUS_TEXT[next]);
          if (next === "camera-unavailable") arbiter.dispatch({ type: "camera", status: "revoked" });
          if (next === "camera-unavailable" || next === "error") {
            onHandFailed();
            sendCombinedInput();
          }
        },
        onDiagnostic: (info) => {
          if (cancelled) return;
          if (info.message) setStatus(info.message);
          else if (info.delegate) setStatus("Tangan (" + info.delegate + ")");
        },
        onFrame: (frame) => {
          if (cancelled) return;
          // The dial reads the finger angle; no direction (no hand, flat finger) shows as "not read".
          publishSteerAngle(frame.tracked ? frame.angle : null);
          arbiter.dispatch({
            type: "hand-frame",
            frame: {
              tracked: frame.tracked,
              cursor: frame.cursor ? { x: frame.cursor.x, y: frame.cursor.y } : null,
              pinched: frame.pinched,
              input: frame.input,
            },
          });
          if (!frame.tracked) {
            sendCombinedInput();
            return;
          }
          if (latest.current.phase === "gameplay") {
            sendCombinedInput();
          } else if (latest.current.phase === "placing" && frame.cursor && frame.pinched) {
            movePlacementToHandCursor(frame.cursor);
          }
        },
      });
      await driver.start();
      if (cancelled) void driver.stop();
    }
    void startDriver();

    return () => {
      cancelled = true;
      void driver?.stop();
      publishSteerAngle(null);
      sendCombinedInput();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerWanted]);

  return { status };
}
