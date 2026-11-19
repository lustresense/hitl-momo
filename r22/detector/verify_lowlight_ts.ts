/**
 * Verifies R22 TypeScript lowlight & glare functions in `bench/r20-lowlight.ts` directly.
 */
import { writeFileSync } from "node:fs";
import {
  A4V2_PIPELINE_INVENTORY,
  R22_DIM_RECOVERY_LUMA,
  analyzeFrameLuma,
  applyA4ChromaRecoveryInPlace,
  applyHighlightSoftKneeInPlace,
  applyR22CandidateRecoveryInPlace,
  probeCameraExposureCapabilities,
  reinhardExposureLutInPlace,
  reinhardWithSoftKneeInPlace,
  suppressShadowChromaNoiseInPlace,
} from "../../../r22-nui-lab/frontend/implementation/src/components/nui-lab/bench/r20-lowlight";

const OUT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/detector/r22_ts_lowlight_verification.json";

function makeSyntheticMonitorGlareBuffer(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) << 2;
      const inHand = x >= w * 0.3 && x <= w * 0.7 && y >= h * 0.25 && y <= h * 0.85;
      if (inHand) {
        // Monitor-lit hand with bright highlight skin pixels (luma ~ 0.82..0.95)
        const ramp = ((x - w * 0.3) / (w * 0.4));
        buf[idx] = Math.round(215 + 38 * ramp);     // R: 215..253
        buf[idx + 1] = Math.round(198 + 46 * ramp); // G: 198..244
        buf[idx + 2] = Math.round(186 + 52 * ramp); // B: 186..238
      } else {
        // Ultra-dark room wall (luma < 0.08) with synthetic chroma noise spike (reddish bias!)
        const spike = ((x * 37 + y * 17) % 19) - 9;
        buf[idx] = Math.max(0, Math.min(255, 16 + spike));
        buf[idx + 1] = Math.max(0, Math.min(255, 7 + Math.floor(spike / 2)));
        buf[idx + 2] = Math.max(0, Math.min(255, 5));
      }
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

function measureShadowChromaSpread(rgba: Uint8ClampedArray, rawRef: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const rl = (77 * rawRef[i]! + 150 * rawRef[i + 1]! + 29 * rawRef[i + 2]! + 128) >> 8;
    if (rl < 20) {
      const mx = Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
      const mn = Math.min(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
      sum += mx - mn;
      n++;
    }
  }
  return n > 0 ? Math.round((sum / n) * 100) / 100 : 0;
}

const w = 160;
const h = 90;
const raw = makeSyntheticMonitorGlareBuffer(w, h);
const handRoi = { minX: 0.3, minY: 0.25, maxX: 0.7, maxY: 0.85 };
const diagRaw = analyzeFrameLuma(raw, w, h, { step: 1, handRoi });
const diagNoRoi = analyzeFrameLuma(raw, w, h, { step: 1 });

// Compare A4v2 vs R22 on exact same buffer
const a4Buf = new Uint8ClampedArray(raw);
applyA4ChromaRecoveryInPlace(a4Buf, w, h, diagRaw.meanLuma, null);
const diagA4 = analyzeFrameLuma(a4Buf, w, h, { step: 1, handRoi });

const r22Buf = new Uint8ClampedArray(raw);
applyR22CandidateRecoveryInPlace(r22Buf, w, h, diagRaw.meanLuma, null, undefined, {
  variant: "r22_softknee_shadowclamp",
});
const diagR22 = analyzeFrameLuma(r22Buf, w, h, { step: 1, handRoi });

// Test standalone primitives
const kneeTest = new Uint8ClampedArray([252, 235, 220, 255, 120, 90, 70, 255]);
applyHighlightSoftKneeInPlace(kneeTest, 0.78, 0.94, 1.0);

const shadowTest = new Uint8ClampedArray([22, 6, 4, 255, 140, 100, 80, 255]);
suppressShadowChromaNoiseInPlace(shadowTest, 0.08, 0.85);

const reinhardKneeTest = new Uint8ClampedArray([230, 210, 195, 255, 30, 20, 15, 255]);
reinhardWithSoftKneeInPlace(reinhardKneeTest, 0.18, 0.48, 0.78, 0.94);

const reinhardOrigTest = new Uint8ClampedArray([230, 210, 195, 255, 30, 20, 15, 255]);
reinhardExposureLutInPlace(reinhardOrigTest, 0.18, 0.48);

// Test P10 camera probe (null, unsupported track, supported UVC track, throwing track)
const uvcNull = probeCameraExposureCapabilities(null);
const uvcUnsupported = probeCameraExposureCapabilities({} as MediaStreamTrack);
const uvcThrowing = probeCameraExposureCapabilities({
  getCapabilities() {
    throw new Error("Hardware error");
  },
} as unknown as MediaStreamTrack);
const uvcSupported = probeCameraExposureCapabilities({
  getCapabilities: () => ({
    exposureMode: ["continuous", "manual"],
    exposureCompensation: { min: -2, max: 2, step: 0.25 },
    whiteBalanceMode: ["continuous", "manual"],
  }),
  getSettings: () => ({
    exposureMode: "continuous",
    exposureCompensation: 0,
    whiteBalanceMode: "continuous",
  }),
} as unknown as MediaStreamTrack);

// Test T2 threshold on normal room lighting (meanLuma ~ 0.47)
const normalBuf = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < normalBuf.length; i += 4) {
  normalBuf[i] = 120;
  normalBuf[i + 1] = 120;
  normalBuf[i + 2] = 120;
  normalBuf[i + 3] = 255;
}
const normalDiag = analyzeFrameLuma(normalBuf, w, h, { step: 2 });

const out = {
  generated_at: new Date().toISOString(),
  a4v2_inventory: A4V2_PIPELINE_INVENTORY,
  r22_dim_recovery_luma: R22_DIM_RECOVERY_LUMA,
  t2_normal_luma_047_check: {
    meanLuma: normalDiag.meanLuma,
    shouldActivateDimRecoveryAt032: normalDiag.shouldActivateDimRecovery,
  },
  diagnostics_raw_vs_no_roi: {
    with_roi_nearWhiteHandPct: diagRaw.nearWhiteHandPct,
    without_roi_nearWhiteHandPct: diagNoRoi.nearWhiteHandPct,
    diagRaw,
  },
  same_frame_glare_shadow_comparison: {
    raw_nearWhiteHandPct: diagRaw.nearWhiteHandPct,
    a4v2_post_nearWhiteHandPct: diagA4.nearWhiteHandPct,
    r22_post_nearWhiteHandPct: diagR22.nearWhiteHandPct,
    raw_shadowChromaSpread: measureShadowChromaSpread(raw, raw),
    a4v2_shadowChromaSpread: measureShadowChromaSpread(a4Buf, raw),
    r22_shadowChromaSpread: measureShadowChromaSpread(r22Buf, raw),
  },
  primitive_checks: {
    softKneeHighlightPixel: Array.from(kneeTest.slice(0, 3)),
    softKneeUntouchedMidtonePixel: Array.from(kneeTest.slice(4, 7)),
    shadowClampDarkPixel: Array.from(shadowTest.slice(0, 3)),
    shadowClampUntouchedSkinPixel: Array.from(shadowTest.slice(4, 7)),
    reinhardOrigBrightPixel: Array.from(reinhardOrigTest.slice(0, 3)),
    reinhardSoftKneeBrightPixel: Array.from(reinhardKneeTest.slice(0, 3)),
  },
  p10_camera_probe: {
    uvcNull,
    uvcUnsupported,
    uvcThrowing,
    uvcSupported,
  },
};

writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
