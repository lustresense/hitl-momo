import { describe, expect, it } from "vitest";
import {
  MomoGuideFSM,
  MOMO_GUIDE_CONSTANTS,
  MOMO_GUIDE_TEXTS,
} from "@/src/components/nui-lab/bench/monui7-momo-guide";

describe("MoNUI-7 MomoGuideFSM (Lampiran B)", () => {
  it("starts in GREET with initial greeting text and ink disabled", () => {
    const guide = new MomoGuideFSM();
    expect(guide.state).toBe("GREET");
    expect(guide.text).toBe("Halo! Tunjukkan lima jarimu ke aku dulu, ya.");
    expect(guide.isInkAllowed).toBe(false);
  });

  it("transitions from GREET to LOCKED after FIVE is held stably for >= 300 ms", () => {
    const guide = new MomoGuideFSM();

    // 0 ms: five starts
    let res = guide.update({ nowMs: 0, hasHand: true, fiveFingerValid: true });
    expect(res.state).toBe("GREET");
    expect(res.inkAllowed).toBe(false);

    // 200 ms: not yet 300 ms
    res = guide.update({ nowMs: 200, hasHand: true, fiveFingerValid: true });
    expect(res.state).toBe("GREET");
    expect(res.inkAllowed).toBe(false);

    // 350 ms: >= 300 ms -> LOCKED
    res = guide.update({ nowMs: 350, hasHand: true, fiveFingerValid: true });
    expect(res.state).toBe("LOCKED");
    expect(res.text).toBe("Sip, aku sudah lihat tanganmu. Silakan menggambar!");
    expect(res.inkAllowed).toBe(true);
    expect(res.promptEvent?.state).toBe("LOCKED");
  });

  it("transitions from LOCKED to DRAWING on drawingActive, hiding the speech bubble", () => {
    const guide = new MomoGuideFSM("LOCKED");
    expect(guide.state).toBe("LOCKED");
    expect(guide.isInkAllowed).toBe(true);

    const res = guide.update({
      nowMs: 1000,
      hasHand: true,
      fiveFingerValid: false,
      drawingActive: true,
    });

    expect(res.state).toBe("DRAWING");
    expect(res.text).toBeNull();
    expect(res.inkAllowed).toBe(true);
    expect(res.promptEvent).toBeNull();
  });

  it("transitions from DRAWING or LOCKED to ASK_FIVE_AGAIN when hand is lost >= 2000 ms or rescueState=LOST", () => {
    const guide = new MomoGuideFSM("DRAWING");
    guide.update({ nowMs: 500, hasHand: true, fiveFingerValid: false, drawingActive: true });

    // Hand lost for 1000 ms -> still DRAWING
    let res = guide.update({ nowMs: 1500, hasHand: false, fiveFingerValid: false });
    expect(res.state).toBe("DRAWING");

    // Hand lost for 2600 ms -> ASK_FIVE_AGAIN
    res = guide.update({ nowMs: 3100, hasHand: false, fiveFingerValid: false });
    expect(res.state).toBe("ASK_FIVE_AGAIN");
    expect(res.text).toBe("Tanganmu hilang dari pandanganku. Tunjukkan lima jari lagi, ya.");
    expect(res.inkAllowed).toBe(false);

    // Test immediate LOST via rescueState
    const guide2 = new MomoGuideFSM("LOCKED");
    const res2 = guide2.update({
      nowMs: 100,
      hasHand: false,
      fiveFingerValid: false,
      rescueState: "LOST",
    });
    expect(res2.state).toBe("ASK_FIVE_AGAIN");
    expect(res2.inkAllowed).toBe(false);
  });

  it("transitions to UNCLEAR_FINGERS when rescueState is POSITION_ONLY", () => {
    const guide = new MomoGuideFSM("LOCKED");
    const res = guide.update({
      nowMs: 1000,
      hasHand: false,
      fiveFingerValid: false,
      rescueState: "POSITION_ONLY",
    });

    expect(res.state).toBe("UNCLEAR_FINGERS");
    expect(res.text).toBe("Aku lihat tanganmu, tapi jarinya belum jelas. Coba dekatkan sedikit.");
    expect(res.inkAllowed).toBe(false);
  });

  it("transitions to ASK_LIGHT on persistent low ROI luma (< 0.10 for >= 3s)", () => {
    const guide = new MomoGuideFSM("LOCKED");

    // Low luma starts at 0 ms
    let res = guide.update({
      nowMs: 0,
      hasHand: true,
      fiveFingerValid: false,
      handRoiLumaP50: 0.08,
    });
    expect(res.state).toBe("LOCKED");

    // 2500 ms: not yet 3000 ms
    res = guide.update({
      nowMs: 2500,
      hasHand: true,
      fiveFingerValid: false,
      handRoiLumaP50: 0.08,
    });
    expect(res.state).toBe("LOCKED");

    // 3200 ms: >= 3000 ms -> ASK_LIGHT
    res = guide.update({
      nowMs: 3200,
      hasHand: true,
      fiveFingerValid: false,
      handRoiLumaP50: 0.08,
    });
    expect(res.state).toBe("ASK_LIGHT");
    expect(res.text).toBe("Ruangannya agak gelap. Coba nyalakan lampu di depanmu, ya.");
    expect(res.inkAllowed).toBe(false);
  });

  it("transitions to ASK_LIGHT on repeated hand loss in low frame lighting (>= 2 losses in 10s)", () => {
    const guide = new MomoGuideFSM("LOCKED");

    // Frame luma is 0.15 (< 0.20 threshold)
    // Loss 1 at 100 ms
    guide.update({ nowMs: 50, hasHand: true, fiveFingerValid: false, frameLumaMean: 0.15 });
    guide.update({ nowMs: 100, hasHand: false, fiveFingerValid: false, frameLumaMean: 0.15 });

    // Reacquired briefly
    guide.update({ nowMs: 500, hasHand: true, fiveFingerValid: false, frameLumaMean: 0.15 });

    // Loss 2 at 1200 ms -> triggers ASK_LIGHT
    const res = guide.update({
      nowMs: 1200,
      hasHand: false,
      fiveFingerValid: false,
      frameLumaMean: 0.15,
    });
    expect(res.state).toBe("ASK_LIGHT");
    expect(res.text).toBe("Ruangannya agak gelap. Coba nyalakan lampu di depanmu, ya.");
    expect(res.inkAllowed).toBe(false);
  });

  it("recovers from prompt states back to LOCKED after stable FIVE is re-acquired", () => {
    for (const promptState of ["ASK_FIVE_AGAIN", "UNCLEAR_FINGERS", "ASK_LIGHT"] as const) {
      const guide = new MomoGuideFSM(promptState);
      expect(guide.state).toBe(promptState);
      expect(guide.isInkAllowed).toBe(false);

      // Start FIVE at 100 ms
      guide.update({ nowMs: 100, hasHand: true, fiveFingerValid: true });
      expect(guide.state).toBe(promptState);

      // Re-acquired stable >= 300 ms at 450 ms
      const res = guide.update({ nowMs: 450, hasHand: true, fiveFingerValid: true });
      expect(res.state).toBe("LOCKED");
      expect(res.text).toBe("Sip, aku sudah lihat tanganmu. Silakan menggambar!");
      expect(res.inkAllowed).toBe(true);
    }
  });
});
