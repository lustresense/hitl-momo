/**
 * R22 Unit Tests for Pure-TS Causal Temporal Classifier (`bench/r22-temporal.ts`).
 * Covers Contract K5 (`r22-temporal-146d-v1`), Contract K6 validation, causal ring buffer,
 * loss-timeout reset, owner-jump reset, non-monotonic timestamp reset, and fail-closed NO_HAND.
 */
import { describe, expect, it } from "vitest";
import {
  R22_TEMPORAL_ENCODER_VERSION,
  R22_TEMPORAL_FEATURE_DIM,
  R22TemporalClassifier,
  R22TemporalFeatureExtractor,
  computeDerivedQualityGate,
  validateR22TemporalModel,
  type R22ExportedTemporalModel,
} from "@/src/components/nui-lab/bench/r22-temporal";
import { ASPECT, cls, pistolSkeleton } from "./lab-rig";

function makeTinyTemporalModel(windowSize: 3 | 5 | 8): R22ExportedTemporalModel {
  const c0 = 4;
  return {
    name: `unit-tcn-w${windowSize}`,
    version: "r22-unit-1",
    encoder_version: R22_TEMPORAL_ENCODER_VERSION,
    license_provenance: "UNIT_SYNTHETIC_ONLY",
    task: "pistol_3class",
    window_size: windowSize,
    feature_dim: R22_TEMPORAL_FEATURE_DIM,
    loss_reset_ms: 350,
    labels: ["POINT_READY", "POINT_PRESS", "OTHER"],
    feature_names: Array.from({ length: R22_TEMPORAL_FEATURE_DIM }, (_, i) => `f${i}`),
    mean: Array(R22_TEMPORAL_FEATURE_DIM).fill(0),
    std: Array(R22_TEMPORAL_FEATURE_DIM).fill(1),
    temperature: 1.0,
    proj: {
      W: Array.from({ length: R22_TEMPORAL_FEATURE_DIM }, () => Array(c0).fill(0.01)),
      b: Array(c0).fill(0),
    },
    tcn_blocks: [
      {
        kernel_size: 3,
        dilation: 1,
        dw_W: Array.from({ length: c0 }, () => [0.2, 0.3, 0.5]),
        dw_b: Array(c0).fill(0),
        pw_W: Array.from({ length: c0 }, () => Array(c0).fill(0.1)),
        pw_b: Array(c0).fill(0),
        residual: true,
      },
    ],
    head_layers: [
      {
        W: Array.from({ length: c0 * 3 }, (_, i) => [i === 0 ? 0.1 : 0, 0.05, 0.2]),
        b: [0, 0, 1.5],
      },
    ],
  };
}

describe("R22 Pure-TS Causal Temporal Classifier (K5, K6, D08, D12)", () => {
  it("validates K5/K6 temporal model schema and rejects mismatched encoder_version or feature_dim", () => {
    const valid = makeTinyTemporalModel(5);
    expect(validateR22TemporalModel(valid).window_size).toBe(5);
    expect(() => validateR22TemporalModel({ ...valid, encoder_version: "wrong-v0" })).toThrow(/encoder mismatch/);
    expect(() => validateR22TemporalModel({ ...valid, feature_dim: 82 })).toThrow(/feature_dim/);
  });

  it("extracts 146D finite features with real dt velocity and resets on loss-timeout, non-monotonic ts, and wrist teleport", () => {
    const ext = new R22TemporalFeatureExtractor({ lossResetMs: 350, maxJumpNorm: 0.45 });
    const h1 = pistolSkeleton(0, true, { aspect: ASPECT });
    const s1 = ext.step(h1, 1000, ASPECT);
    expect(s1.valid).toBe(true);
    expect(s1.features).toHaveLength(146);
    expect(s1.features[145]).toBe(1.0);
    expect(s1.didReset).toBe(false);

    // Step 2: 33ms later -> finite velocity populated
    const s2 = ext.step(h1, 1033, ASPECT);
    expect(s2.valid).toBe(true);
    expect(s2.dtMs).toBe(33);

    // Non-monotonic timestamp -> resets cleanly
    const sBack = ext.step(h1, 1010, ASPECT);
    expect(sBack.didReset).toBe(true);
    expect(sBack.resetReason).toBe("non-monotonic-timestamp");

    // Loss > 350 ms -> resets cleanly
    const sGap = ext.step(h1, 1500, ASPECT);
    expect(sGap.didReset).toBe(true);
    expect(sGap.resetReason).toBe("loss-timeout");

    // Large wrist jump (> 0.45) -> owner-jump-reset
    const farHand = cls("palm")(0.95, 0.9);
    const sJump = ext.step(farHand, 1533, ASPECT);
    expect(sJump.didReset).toBe(true);
    expect(sJump.resetReason).toBe("owner-jump-reset");
  });

  it("runs causal forward pass for W=3, W=5, W=8 and fails closed on NO_HAND without NaN", () => {
    for (const w of [3, 5, 8] as const) {
      const clf = new R22TemporalClassifier(makeTinyTemporalModel(w));
      const h = pistolSkeleton(0, true, { aspect: ASPECT });
      let t = 1000;
      for (let i = 0; i < w + 2; i++) {
        const res = clf.step(h, t, ASPECT);
        expect(res.valid).toBe(true);
        expect(res.failClosed).toBe(false);
        expect(res.probs).toHaveLength(3);
        const sum = res.probs.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
        expect(res.labelSource).toBe("MODEL_PREDICTION");
        t += 33;
      }

      // NO_HAND frame MUST fail closed cleanly
      const miss = clf.step(null, t + 33, ASPECT);
      expect(miss.valid).toBe(false);
      expect(miss.failClosed).toBe(true);
      expect(miss.label).toBe("OTHER");
    }

    // Quality gate flags low sharpness / glare without inventing visibility
    const q = computeDerivedQualityGate(cls("palm")(0.5, 0.5), ASPECT, { blurProxy: 15, nearWhiteHandPct: 12 });
    expect(q.plausible).toBe(true);
    expect(q.lowQualityWarning).toBe(true);
  });
});
