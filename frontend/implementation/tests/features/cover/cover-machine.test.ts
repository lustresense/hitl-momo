import { describe, expect, it } from "vitest";
import {
  COVER_PHASES,
  coverReducer,
  createInitialCoverState,
  isBookVisiblePhase,
  isNuiActivePhase,
  type CoverPhase,
} from "@/src/features/cover/cover-machine";

describe("cover-machine", () => {
  it("exposes all expected phases in order", () => {
    expect(COVER_PHASES).toEqual([
      "sleep",
      "gate",
      "camera-on",
      "wake",
      "intro",
      "ayo",
      "book-curl",
      "name",
      "name-confirm",
      "name-exit",
      "ruler",
      "handoff",
    ]);
  });

  it("walks the full happy path without join token (skips ruler straight to handoff)", () => {
    let state = createInitialCoverState({ hasJoinToken: false });
    expect(state.phase).toBe("sleep");
    expect(state.gateState).toBe(0);
    expect(isNuiActivePhase(state.phase)).toBe(false);
    expect(isBookVisiblePhase(state.phase)).toBe(false);

    // Locked camera click nudges unchecked without advancing
    state = coverReducer(state, { type: "CAMERA_TOGGLE_LOCKED" });
    expect(state.phase).toBe("sleep");
    expect(state.gateNudge).toBe("unchecked");

    // Check consent -> gate (state 1)
    state = coverReducer(state, { type: "GATE_CHECK", checked: true });
    expect(state.phase).toBe("gate");
    expect(state.gateState).toBe(1);
    expect(state.gateNudge).toBeNull();

    // Locked camera click in state 1 nudges need-go
    state = coverReducer(state, { type: "CAMERA_TOGGLE_LOCKED" });
    expect(state.phase).toBe("gate");
    expect(state.gateNudge).toBe("need-go");

    // Click Lanjut -> gate unlocked (state 2)
    state = coverReducer(state, { type: "GATE_CONFIRM" });
    expect(state.phase).toBe("gate");
    expect(state.gateState).toBe(2);

    // Toggle camera ON -> camera-on
    state = coverReducer(state, { type: "CAMERA_REQUEST" });
    expect(state.phase).toBe("camera-on");
    expect(state.cameraStatus).toBe("requesting");

    // Camera playable -> wake (NUI becomes active!)
    state = coverReducer(state, { type: "CAMERA_READY" });
    expect(state.phase).toBe("wake");
    expect(state.cameraStatus).toBe("live");
    expect(isNuiActivePhase(state.phase)).toBe(true);

    // Wake finishes -> intro
    state = coverReducer(state, { type: "WAKE_DONE" });
    expect(state.phase).toBe("intro");
    expect(state.introLineIndex).toBe(0);

    // Advance all 4 intro lines -> ayo
    state = coverReducer(state, { type: "INTRO_NEXT" });
    expect(state.phase).toBe("intro");
    expect(state.introLineIndex).toBe(1);
    state = coverReducer(state, { type: "INTRO_NEXT" });
    expect(state.introLineIndex).toBe(2);
    state = coverReducer(state, { type: "INTRO_NEXT" });
    expect(state.introLineIndex).toBe(3);
    state = coverReducer(state, { type: "INTRO_NEXT" });
    expect(state.phase).toBe("ayo");

    // Confirm Ayo ring -> book-curl
    state = coverReducer(state, { type: "AYO_CONFIRMED" });
    expect(state.phase).toBe("book-curl");
    expect(isBookVisiblePhase(state.phase)).toBe(true);

    // Curl done -> name
    state = coverReducer(state, { type: "BOOK_CURL_DONE" });
    expect(state.phase).toBe("name");

    // Capture name -> name-confirm
    state = coverReducer(state, { type: "NAME_CAPTURED", name: "Rani" });
    expect(state.phase).toBe("name-confirm");
    expect(state.studentName).toBe("Rani");

    // Retry name -> back to name, clears studentName
    state = coverReducer(state, { type: "NAME_RETRY" });
    expect(state.phase).toBe("name");
    expect(state.studentName).toBe("");

    // Capture again & confirm -> name-exit -> handoff (no join token)
    state = coverReducer(state, { type: "NAME_CAPTURED", name: "Rani Putri" });
    expect(state.phase).toBe("name-confirm");
    state = coverReducer(state, { type: "NAME_CONFIRMED" });
    expect(state.phase).toBe("name-exit");

    state = coverReducer(state, { type: "NAME_EXIT_DONE" });
    expect(state.phase).toBe("handoff");
    expect(state.needsRuler).toBe(false);
    expect(state.studentName).toBe("Rani Putri");
  });

  it("routes through ruler when entering via classroom link (hasJoinToken = true, O-3)", () => {
    let state = createInitialCoverState({ hasJoinToken: true, initialPhase: "name-confirm" });
    state = { ...state, studentName: "Siti" };
    state = coverReducer(state, { type: "NAME_CONFIRMED" });
    expect(state.phase).toBe("name-exit");

    state = coverReducer(state, { type: "NAME_EXIT_DONE" });
    expect(state.phase).toBe("ruler");
    expect(state.needsRuler).toBe(true);

    state = coverReducer(state, { type: "RULER_DONE" });
    expect(state.phase).toBe("handoff");
  });

  it("guarantees ZERO dead-end when camera permission is denied", () => {
    let state = createInitialCoverState({ hasJoinToken: false });
    state = coverReducer(state, { type: "GATE_CHECK", checked: true });
    state = coverReducer(state, { type: "GATE_CONFIRM" });
    state = coverReducer(state, { type: "CAMERA_REQUEST" });
    state = coverReducer(state, {
      type: "CAMERA_DENIED",
      error: "Izin kamera ditolak. Pakai mouse atau keyboard.",
    });

    expect(state.phase).toBe("camera-on");
    expect(state.cameraStatus).toBe("denied");
    expect(state.fallbackAvailable).toBe(true);
    expect(state.cameraError).toContain("Izin kamera ditolak");

    // Student continues via mouse/touch fallback -> wakes Momo & completes full flow
    state = coverReducer(state, { type: "CONTINUE_WITHOUT_CAMERA" });
    expect(state.phase).toBe("wake");
    expect(state.fallbackMode).toBe(true);

    state = coverReducer(state, { type: "WAKE_DONE" });
    state = coverReducer(state, { type: "INTRO_DONE" });
    state = coverReducer(state, { type: "AYO_CONFIRMED" });
    state = coverReducer(state, { type: "BOOK_CURL_DONE" });
    state = coverReducer(state, { type: "NAME_CAPTURED", name: "Dina" });
    state = coverReducer(state, { type: "NAME_CONFIRMED" });
    state = coverReducer(state, { type: "NAME_EXIT_DONE" });
    expect(state.phase).toBe("handoff");
    expect(state.studentName).toBe("Dina");
  });

  it("guarantees ZERO dead-end when camera hardware is unavailable even before toggle", () => {
    let state = createInitialCoverState({ hasJoinToken: false });
    state = coverReducer(state, { type: "GATE_CHECK", checked: true });
    state = coverReducer(state, { type: "GATE_CONFIRM" });
    state = coverReducer(state, {
      type: "CAMERA_UNAVAILABLE",
      error: "Kamera tidak ditemukan. Pakai mouse atau keyboard.",
    });

    expect(state.cameraStatus).toBe("unavailable");
    expect(state.fallbackAvailable).toBe(true);

    state = coverReducer(state, { type: "CONTINUE_WITHOUT_CAMERA" });
    expect(state.phase).toBe("wake");
    expect(state.fallbackMode).toBe(true);
  });

  it("ignores empty name capture and invalid out-of-phase transitions", () => {
    let state = createInitialCoverState({ hasJoinToken: false });
    // Cannot jump to book-curl or name-confirm from sleep
    expect(coverReducer(state, { type: "AYO_CONFIRMED" }).phase).toBe("sleep");
    expect(coverReducer(state, { type: "CAMERA_REQUEST" }).phase).toBe("sleep");

    state = createInitialCoverState({ hasJoinToken: false, initialPhase: "name" });
    state = coverReducer(state, { type: "NAME_CAPTURED", name: "   " });
    expect(state.phase).toBe("name");
    expect(state.studentName).toBe("");
  });

  it("allows unchecking consent before Lanjut and cleanly resets from any phase", () => {
    let state = createInitialCoverState({ hasJoinToken: true });
    state = coverReducer(state, { type: "GATE_CHECK", checked: true });
    expect(state.phase).toBe("gate");
    state = coverReducer(state, { type: "GATE_CHECK", checked: false });
    expect(state.phase).toBe("sleep");
    expect(state.gateState).toBe(0);

    const latePhases: CoverPhase[] = ["wake", "ayo", "book-curl", "name-confirm", "handoff"];
    for (const ph of latePhases) {
      const s = createInitialCoverState({ hasJoinToken: true, initialPhase: ph });
      const reset = coverReducer(s, { type: "RESET" });
      expect(reset.phase).toBe("sleep");
      expect(reset.gateState).toBe(0);
      expect(reset.studentName).toBe("");
      expect(reset.hasJoinToken).toBe(true);
    }
  });
});
