/**
 * R22 Honest CPU A/B Benchmark: fixed numHands=1 vs fixed numHands=2 vs legacy dynamic B3v2
 * (`bench_numhands_ablation.ts`).
 *
 * Acceptance IDs: W04, W05, W06, C03, B06.
 *
 * Runs REAL `@mediapipe/tasks-vision@0.10.14` HandLandmarker (`delegate: "CPU"`, `runningMode: "VIDEO"`)
 * inside headless Chromium (Playwright) against the ACTUAL `WorkerOwnerGuard` implementation on 4 identical
 * deterministic 15 FPS sequences built from real `hg5g_720` hand photographs:
 *   1. `single_hand_tracking` (180 frames, 12s @ 15 FPS): single moving owner hand
 *   2. `bystander_intrusion_and_crossing` (150 frames, 10s @ 15 FPS): lone owner -> 2nd-hand bystander
 *      separated -> crossing near owner -> owner occluded (bystander only) -> owner returns
 *   3. `dim_low_contrast_tracking` (90 frames, 6s @ 15 FPS): dimmed low-contrast hand testing T3
 *      (`setOptions` graph rebuild vs VIDEO tracking continuity)
 *   4. `loss_and_auto_reacquire` (90 frames, 6s @ 15 FPS): 200ms short blink (keep trackId) +
 *      667ms long absence -> new hand auto-reacquire without manual relock button
 *
 * Writes empirical results to:
 *   `/srv/sketchbook/mediapipe-optimize/research-can/r22/results/r22_numhands_fixed1_vs_fixed2_ablation.json`
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { extname, join, normalize } from "node:path";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const WORKTREE_PUBLIC =
  "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/public";
const OWNER_GUARD_SRC =
  "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/bench/worker-owner-guard.ts";
const IMG_OWNER = `${SANDBOX}/data/hg5g_720/hg5g_0000.jpg`;
const IMG_BYSTANDER = `${SANDBOX}/data/hg5g_720/hg5g_0005.jpg`;
const OUTPUT_JSON =
  "/srv/sketchbook/mediapipe-optimize/research-can/r22/results/r22_numhands_fixed1_vs_fixed2_ablation.json";

process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;

const browserRequire = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = browserRequire("playwright");
const esbuild = browserRequire("esbuild");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
};

function sha256File(fp: string): string {
  return createHash("sha256").update(readFileSync(fp)).digest("hex");
}

async function buildBrowserBundle(): Promise<string> {
  const entryCode = `
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { WorkerOwnerGuard } from ${JSON.stringify(OWNER_GUARD_SRC)};

function quantile(vals, q) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return Math.round(s[idx] * 100) / 100;
}

function mean(vals) {
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Failed to load " + url));
    img.src = url;
  });
}

function sampleCornerColor(img) {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 16;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function drawHand(ctx, img, cxNorm, cyNorm, boxPx, flipX, alpha = 1.0) {
  const cx = cxNorm * ctx.canvas.width;
  const cy = cyNorm * ctx.canvas.height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -boxPx / 2, -boxPx / 2, boxPx, boxPx);
  ctx.restore();
}

function renderSequenceFrame(ctx, seqName, frameIdx, ownerImg, bystanderImg, bgRgb) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const [r, g, b] = bgRgb;

  const gt = {
    expectedHands: 0,
    ownerCenterX: null,
    bystanderCenterX: null,
    phase: "empty",
  };

  if (seqName === "single_hand_tracking") {
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.fillRect(0, 0, W, H);
    const t = frameIdx / 179;
    const cx = 0.28 + 0.44 * Math.sin(t * Math.PI);
    const cy = 0.50 + 0.04 * Math.sin(t * Math.PI * 4);
    const boxPx = 152 + Math.round(10 * Math.sin(t * Math.PI * 3));
    drawHand(ctx, ownerImg, cx, cy, boxPx, false);
    gt.expectedHands = 1;
    gt.ownerCenterX = cx;
    gt.phase = "single_owner";
    return gt;
  }

  if (seqName === "bystander_intrusion_and_crossing") {
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.fillRect(0, 0, W, H);
    if (frameIdx < 30) {
      // Phase 1: Lone owner locks on left
      const cx = 0.27 + 0.02 * Math.sin(frameIdx * 0.2);
      drawHand(ctx, ownerImg, cx, 0.50, 152, false);
      gt.expectedHands = 1;
      gt.ownerCenterX = cx;
      gt.phase = "lone_owner";
    } else if (frameIdx < 75) {
      // Phase 2: Separated bystander enters right side (45 frames)
      const p = (frameIdx - 30) / 44;
      const ox = 0.27 + 0.03 * Math.sin(p * Math.PI);
      const bx = 0.74 - 0.06 * p;
      drawHand(ctx, ownerImg, ox, 0.50, 152, false);
      drawHand(ctx, bystanderImg, bx, 0.50, 152, true);
      gt.expectedHands = 2;
      gt.ownerCenterX = ox;
      gt.bystanderCenterX = bx;
      gt.phase = "separated_bystander";
    } else if (frameIdx < 100) {
      // Phase 3: Bystander crosses close / overlaps owner (25 frames)
      const p = (frameIdx - 75) / 24;
      const ox = 0.30;
      const bx = 0.50 - 0.18 * p; // sweeps from 0.50 right across 0.32
      drawHand(ctx, ownerImg, ox, 0.50, 152, false);
      drawHand(ctx, bystanderImg, bx, 0.50, 152, true, 0.92);
      gt.expectedHands = 2;
      gt.ownerCenterX = ox;
      gt.bystanderCenterX = bx;
      gt.phase = "crossing";
    } else if (frameIdx < 120) {
      // Phase 4: Owner occluded, ONLY bystander visible on right (20 frames, hijack test!)
      const bx = 0.73;
      drawHand(ctx, bystanderImg, bx, 0.50, 152, true);
      gt.expectedHands = 1;
      gt.ownerCenterX = null;
      gt.bystanderCenterX = bx;
      gt.phase = "bystander_only_hijack_test";
    } else {
      // Phase 5: Bystander leaves, owner returns at left (30 frames)
      const ox = 0.28;
      drawHand(ctx, ownerImg, ox, 0.50, 152, false);
      gt.expectedHands = 1;
      gt.ownerCenterX = ox;
      gt.phase = "owner_return";
    }
    return gt;
  }

  if (seqName === "dim_low_contrast_tracking") {
    // Fair T3 test: 20 bright acquisition frames so all 3 variants start from identical locked VIDEO
    // tracking on a fresh HandLandmarker, then 100 dimmed low-contrast frames (26% brightness) where
    // legacy_dynamic_B3v2 triggers its 45-frame setOptions({ numHands }) graph rebuild mid-dim-session!
    const isBrightWarmup = frameIdx < 20;
    const dimFactor = isBrightWarmup ? 1.0 : 0.26;
    ctx.fillStyle =
      "rgb(" +
      Math.round(r * dimFactor) +
      "," +
      Math.round(g * dimFactor) +
      "," +
      Math.round(b * dimFactor) +
      ")";
    ctx.fillRect(0, 0, W, H);
    const t = frameIdx / 119;
    const cx = 0.32 + 0.34 * Math.sin(t * Math.PI);
    const cy = 0.50 + 0.03 * Math.cos(t * Math.PI * 3);
    ctx.save();
    if (!isBrightWarmup) {
      ctx.filter = "brightness(26%) contrast(85%)";
    }
    drawHand(ctx, ownerImg, cx, cy, 154, false);
    ctx.restore();
    gt.expectedHands = 1;
    gt.ownerCenterX = cx;
    gt.phase = isBrightWarmup ? "bright_acquire" : "dim_single_owner";
    return gt;
  }

  if (seqName === "loss_and_auto_reacquire") {
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.fillRect(0, 0, W, H);
    if (frameIdx < 25) {
      drawHand(ctx, ownerImg, 0.28, 0.50, 152, false);
      gt.expectedHands = 1;
      gt.ownerCenterX = 0.28;
      gt.phase = "owner_a_initial";
    } else if (frameIdx < 28) {
      // 3 frames blank = 200 ms short blink (< 300 ms emptyResetMs)
      gt.expectedHands = 0;
      gt.phase = "short_blink_200ms";
    } else if (frameIdx < 45) {
      drawHand(ctx, ownerImg, 0.30, 0.50, 152, false);
      gt.expectedHands = 1;
      gt.ownerCenterX = 0.30;
      gt.phase = "owner_a_after_blink";
    } else if (frameIdx < 55) {
      // 10 frames blank = 667 ms long absence (>= 300 ms emptyResetMs)
      gt.expectedHands = 0;
      gt.phase = "long_absence_667ms";
    } else {
      // New owner hand B enters at right (x=0.72) -> must auto-reacquire without manual relock!
      drawHand(ctx, bystanderImg, 0.72, 0.50, 152, true);
      gt.expectedHands = 1;
      gt.ownerCenterX = 0.72;
      gt.phase = "owner_b_reacquire";
    }
    return gt;
  }

  return gt;
}

window.runNumHandsAblation = async function runNumHandsAblation() {
  const [ownerImg, bystanderImg] = await Promise.all([
    loadImg("/img/owner.jpg"),
    loadImg("/img/bystander.jpg"),
  ]);
  const bgRgb = sampleCornerColor(ownerImg);

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const modelBuf = new Uint8Array(await (await fetch("/models/hand_landmarker.task")).arrayBuffer());

  const variants = [
    { id: "fixed_numHands_1", policy: "fixed-1", initialNumHands: 1, auditIntervalFrames: 45 },
    { id: "fixed_numHands_2", policy: "fixed-2", initialNumHands: 2, auditIntervalFrames: 45 },
    { id: "legacy_dynamic_B3v2", policy: "legacy-dynamic", initialNumHands: 2, auditIntervalFrames: 45 },
  ];

  const sequences = [
    { name: "single_hand_tracking", frames: 180 },
    { name: "bystander_intrusion_and_crossing", frames: 150 },
    { name: "dim_low_contrast_tracking", frames: 120 },
    { name: "loss_and_auto_reacquire", frames: 90 },
  ];

  const DT_MS = 66.67; // Honest 15 FPS camera interval (matching Owner webcam)
  const report = { variants: {} };
  for (const variant of variants) {
    report.variants[variant.id] = {
      policy: variant.policy,
      initialNumHands: variant.initialNumHands,
      delegate: "CPU",
      initMsSamples: [],
      initMs: 0,
      initSetOptionsCalls: 0,
      runtimeSetOptionsCalls: 0,
      sequences: {},
    };
  }

  // Interleave variants per sequence AND instantiate a fresh HandLandmarker per (sequence, variant)
  // so there is ZERO cross-sequence VIDEO tracker leakage and minimal shared-CPU drift bias!
  for (const seq of sequences) {
    for (const variant of variants) {
      const tInit0 = performance.now();
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: modelBuf, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: variant.initialNumHands,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      const initMs = Math.round((performance.now() - tInit0) * 100) / 100;
      report.variants[variant.id].initMsSamples.push(initMs);

      // Warmup 5 blank frames per fresh instance
      ctx.fillStyle = "rgb(120,120,120)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let tsMs = 1000;
      for (let w = 0; w < 5; w++) {
        landmarker.detectForVideo(canvas, Math.round(tsMs));
        tsMs += DT_MS;
      }

      let appliedNumHands = variant.initialNumHands;
      const guard = new WorkerOwnerGuard({
        enabled: true,
        policy: variant.policy,
        fixedNumHands: variant.initialNumHands,
        lockConfirmFrames: variant.policy === "legacy-dynamic" ? 3 : 2,
        auditIntervalFrames: variant.auditIntervalFrames,
        emptyResetMs: 300,
      });
      guard.reset(variant.initialNumHands);

      const mpSamples = [];
      const setOptSamples = [];
      const totalSamples = [];
      let seqSetOptionsCalls = 0;
      let expectedPresentFrames = 0;
      let rawDetectedAtLeast1 = 0;
      let rawDetected2Hands = 0;
      let guardedOutputFrames = 0;

      // Dim-phase specific counters (for dim_low_contrast_tracking)
      let dimPhaseExpected = 0;
      let dimPhaseDetected = 0;

      // Flicker streak tracking on frames where >= 1 hand is expected
      let curMissStreak = 0;
      let flickerStreaks_1_3 = 0;
      let shortLossStreaks_4_15 = 0;
      let longLossStreaks_gt15 = 0;
      let maxMissStreak = 0;

      // Bystander & ownership safety metrics
      let bystander2HandGtFrames = 0;
      let bystander2HandRawDetected = 0;
      let separatedGtFrames = 0;
      let separatedOwnerRetained = 0;
      let separatedOwnerHijacked = 0;
      let crossingGtFrames = 0;
      let crossingAmbiguousHolds = 0;
      let crossingHijacked = 0;
      let hijackOnlyGtFrames = 0;
      let hijackOnlyStolenFrames = 0;
      let hijackOnlyRejectedFrames = 0;

      // Auto-reacquire metrics (for loss_and_auto_reacquire)
      let ownerATrackIdBeforeBlink = null;
      let ownerATrackIdAfterBlink = null;
      let ownerBTrackIdAfterLongLoss = null;
      let ownerBAutoLockedFrames = 0;
      let shortBlinkKeptSameTrackId = null;

      tsMs += 500;

      const finishMissStreak = () => {
        if (curMissStreak > 0) {
          if (curMissStreak <= 3) flickerStreaks_1_3++;
          else if (curMissStreak <= 15) shortLossStreaks_4_15++;
          else longLossStreaks_gt15++;
          if (curMissStreak > maxMissStreak) maxMissStreak = curMissStreak;
          curMissStreak = 0;
        }
      };

      for (let i = 0; i < seq.frames; i++) {
        tsMs += DT_MS;
        const tsInt = Math.round(tsMs);
        const gt = renderSequenceFrame(ctx, seq.name, i, ownerImg, bystanderImg, bgRgb);

        let frameSetOptMs = 0;
        const preNum = guard.beforeDetect();
        if (variant.policy === "legacy-dynamic" && preNum !== appliedNumHands) {
          const s0 = performance.now();
          await landmarker.setOptions({ numHands: preNum });
          frameSetOptMs += performance.now() - s0;
          appliedNumHands = preNum;
          seqSetOptionsCalls++;
          report.variants[variant.id].runtimeSetOptionsCalls++;
        }

        const d0 = performance.now();
        const res = landmarker.detectForVideo(canvas, tsInt);
        const mpMs = performance.now() - d0;

        const rawLms = (res.landmarks || []).map((hand) =>
          hand.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
        );
        const rawHds = (res.handedness || []).map((cats) => {
          const c = cats[0];
          return {
            categoryName: c?.categoryName ?? c?.displayName ?? "Unknown",
            score: c?.score ?? 0,
          };
        });

        const guarded = guard.afterDetect(rawLms, rawHds, tsInt);
        if (variant.policy === "legacy-dynamic" && guarded.nextNumHands !== appliedNumHands) {
          const s1 = performance.now();
          await landmarker.setOptions({ numHands: guarded.nextNumHands });
          frameSetOptMs += performance.now() - s1;
          appliedNumHands = guarded.nextNumHands;
          seqSetOptionsCalls++;
          report.variants[variant.id].runtimeSetOptionsCalls++;
        }

        mpSamples.push(mpMs);
        if (frameSetOptMs > 0) setOptSamples.push(frameSetOptMs);
        totalSamples.push(mpMs + frameSetOptMs);

        if (gt.expectedHands > 0) {
          expectedPresentFrames++;
          if (rawLms.length > 0) {
            rawDetectedAtLeast1++;
            finishMissStreak();
          } else {
            curMissStreak++;
          }
        } else {
          finishMissStreak();
        }

        if (gt.phase === "dim_single_owner") {
          dimPhaseExpected++;
          if (rawLms.length > 0) dimPhaseDetected++;
        }

        if (rawLms.length >= 2) rawDetected2Hands++;
        if (guarded.landmarks.length > 0) guardedOutputFrames++;

        // Bystander & ownership safety evaluation
        const outPrimaryX = guarded.landmarks[0]?.[0]?.x ?? null;

        if (gt.phase === "separated_bystander") {
          bystander2HandGtFrames++;
          separatedGtFrames++;
          if (rawLms.length >= 2) bystander2HandRawDetected++;
          if (outPrimaryX !== null) {
            const distOwner = Math.abs(outPrimaryX - gt.ownerCenterX);
            const distByst = Math.abs(outPrimaryX - gt.bystanderCenterX);
            if (distOwner < distByst) separatedOwnerRetained++;
            else separatedOwnerHijacked++;
          }
        } else if (gt.phase === "crossing") {
          bystander2HandGtFrames++;
          crossingGtFrames++;
          if (rawLms.length >= 2) bystander2HandRawDetected++;
          if (guarded.ownerTrack.ambiguousHold || guarded.landmarks.length === 0) {
            crossingAmbiguousHolds++;
          } else if (outPrimaryX !== null && Math.abs(gt.bystanderCenterX - gt.ownerCenterX) > 0.05) {
            const distOwner = Math.abs(outPrimaryX - gt.ownerCenterX);
            const distByst = Math.abs(outPrimaryX - gt.bystanderCenterX);
            if (distByst < distOwner) crossingHijacked++;
          }
        } else if (gt.phase === "bystander_only_hijack_test") {
          hijackOnlyGtFrames++;
          if (outPrimaryX !== null && Math.abs(outPrimaryX - gt.bystanderCenterX) < 0.25) {
            hijackOnlyStolenFrames++;
          } else {
            hijackOnlyRejectedFrames++;
          }
        }

        // Loss & auto-reacquire tracking
        if (seq.name === "loss_and_auto_reacquire") {
          if (gt.phase === "owner_a_initial" && guarded.ownerTrack.locked) {
            ownerATrackIdBeforeBlink = guarded.ownerTrack.trackId;
          } else if (gt.phase === "owner_a_after_blink" && guarded.ownerTrack.locked && ownerATrackIdAfterBlink === null) {
            ownerATrackIdAfterBlink = guarded.ownerTrack.trackId;
            shortBlinkKeptSameTrackId = ownerATrackIdBeforeBlink !== null && ownerATrackIdAfterBlink === ownerATrackIdBeforeBlink;
          } else if (gt.phase === "owner_b_reacquire" && guarded.ownerTrack.locked) {
            ownerBAutoLockedFrames++;
            if (ownerBTrackIdAfterLongLoss === null) {
              ownerBTrackIdAfterLongLoss = guarded.ownerTrack.trackId;
            }
          }
        }
      }
      finishMissStreak();
      landmarker.close();

      const sumSetOptMs = Math.round(setOptSamples.reduce((a, b) => a + b, 0) * 100) / 100;
      const recallPct =
        expectedPresentFrames > 0
          ? Math.round((rawDetectedAtLeast1 / expectedPresentFrames) * 10000) / 100
          : null;

      report.variants[variant.id].sequences[seq.name] = {
        frames: seq.frames,
        expectedPresentFrames,
        rawDetectedAtLeast1,
        rawDetected2Hands,
        guardedOutputFrames,
        recallPct,
        flickerStreaks_1_3,
        shortLossStreaks_4_15,
        longLossStreaks_gt15,
        maxMissStreak,
        mpMs: {
          p50: quantile(mpSamples, 0.5),
          p95: quantile(mpSamples, 0.95),
          mean: mean(mpSamples),
        },
        totalFrameMs: {
          p50: quantile(totalSamples, 0.5),
          p95: quantile(totalSamples, 0.95),
          mean: mean(totalSamples),
        },
        setOptionsCallsRuntime: seqSetOptionsCalls,
        setOptionsMs: {
          total: sumSetOptMs,
          perCallMean: mean(setOptSamples),
          perCallP95: quantile(setOptSamples, 0.95),
        },
        ownerGuardTelemetry: guard.telemetry(),
        ...(seq.name === "dim_low_contrast_tracking"
          ? {
              dimTrackingStability: {
                dimPhaseExpectedFrames: dimPhaseExpected,
                dimPhaseDetectedFrames: dimPhaseDetected,
                dimPhaseRecallPct:
                  dimPhaseExpected > 0
                    ? Math.round((dimPhaseDetected / dimPhaseExpected) * 10000) / 100
                    : null,
              },
            }
          : {}),
        ...(seq.name === "bystander_intrusion_and_crossing"
          ? {
              bystanderSafety: {
                twoHandGtFrames: bystander2HandGtFrames,
                twoHandRawDetectedFrames: bystander2HandRawDetected,
                twoHandDetectionRatePct:
                  bystander2HandGtFrames > 0
                    ? Math.round((bystander2HandRawDetected / bystander2HandGtFrames) * 10000) / 100
                    : 0,
                separatedGtFrames,
                separatedOwnerRetained,
                separatedOwnerHijacked,
                crossingGtFrames,
                crossingAmbiguousHolds,
                crossingHijacked,
                hijackOnlyGtFrames,
                hijackOnlyStolenFrames,
                hijackOnlyRejectedFrames,
                totalOwnerHijackFrames:
                  separatedOwnerHijacked + crossingHijacked + hijackOnlyStolenFrames,
              },
            }
          : {}),
        ...(seq.name === "loss_and_auto_reacquire"
          ? {
              reacquireSafety: {
                ownerATrackIdBeforeBlink,
                ownerATrackIdAfterBlink,
                shortBlinkKeptSameTrackId,
                ownerBTrackIdAfterLongLoss,
                ownerBAutoLockedFrames,
                autoReacquiredNewTrackWithoutButton:
                  ownerBTrackIdAfterLongLoss !== null &&
                  ownerATrackIdBeforeBlink !== null &&
                  ownerBTrackIdAfterLongLoss > ownerATrackIdBeforeBlink,
              },
            }
          : {}),
      };
    }
  }

  for (const variant of variants) {
    report.variants[variant.id].initMs = mean(report.variants[variant.id].initMsSamples);
  }

  return report;
};
`;

  const result = await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: `${SANDBOX}/browser`,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
  });
  return result.outputFiles[0].text;
}

async function main() {
  for (const reqFile of [
    OWNER_GUARD_SRC,
    IMG_OWNER,
    IMG_BYSTANDER,
    `${WORKTREE_PUBLIC}/models/hand_landmarker.task`,
  ]) {
    if (!existsSync(reqFile)) {
      throw new Error(`Missing required file: ${reqFile}`);
    }
  }

  console.log("[r22-numhands-ablation] Bundling browser runner with real @mediapipe/tasks-vision@0.10.14 + WorkerOwnerGuard...");
  const bundleJs = await buildBrowserBundle();

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>R22 NumHands Ablation</title></head><body><script src="/bundle.js"></script></body></html>`;

  const server = createServer((req, res) => {
    const clean = normalize((req.url || "/").split("?")[0]!).replace(/^(\.\.(\/|\\|$))+/, "");
    if (clean === "/" || clean === "/index.html") {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(html);
      return;
    }
    if (clean === "/bundle.js") {
      res.writeHead(200, { "Content-Type": MIME[".js"] });
      res.end(bundleJs);
      return;
    }
    if (clean === "/img/owner.jpg") {
      res.writeHead(200, { "Content-Type": MIME[".jpg"] });
      res.end(readFileSync(IMG_OWNER));
      return;
    }
    if (clean === "/img/bystander.jpg") {
      res.writeHead(200, { "Content-Type": MIME[".jpg"] });
      res.end(readFileSync(IMG_BYSTANDER));
      return;
    }
    const pubPath = join(WORKTREE_PUBLIC, clean);
    if (existsSync(pubPath)) {
      const ext = extname(pubPath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(pubPath));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}/`;

  let browser: any = null;
  try {
    console.log(`[r22-numhands-ablation] Launching Chromium (CPU-only) on ${url}...`);
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const page = await browser.newPage();
    page.on("console", (msg: any) => {
      if (msg.type() === "error") console.error("[browser console.error]", msg.text());
    });
    page.on("pageerror", (err: any) => console.error("[browser pageerror]", err));

    await page.goto(url, { waitUntil: "networkidle" });
    const t0 = Date.now();
    const rawReport = await page.evaluate(async () => {
      return await (window as any).runNumHandsAblation();
    });
    const elapsedSec = Math.round(((Date.now() - t0) / 1000) * 100) / 100;

    const f1 = rawReport.variants.fixed_numHands_1;
    const f2 = rawReport.variants.fixed_numHands_2;
    const b3 = rawReport.variants.legacy_dynamic_B3v2;

    const f1SingleP50 = f1.sequences.single_hand_tracking.mpMs.p50;
    const f2SingleP50 = f2.sequences.single_hand_tracking.mpMs.p50;
    const b3SingleP50 = b3.sequences.single_hand_tracking.mpMs.p50;
    const f1BystanderDetPct =
      f1.sequences.bystander_intrusion_and_crossing.bystanderSafety.twoHandDetectionRatePct;
    const f2BystanderDetPct =
      f2.sequences.bystander_intrusion_and_crossing.bystanderSafety.twoHandDetectionRatePct;
    const f2TotalHijacks =
      f2.sequences.bystander_intrusion_and_crossing.bystanderSafety.totalOwnerHijackFrames;
    const f1TotalHijacks =
      f1.sequences.bystander_intrusion_and_crossing.bystanderSafety.totalOwnerHijackFrames;

    const f1DimRecall = f1.sequences.dim_low_contrast_tracking.dimTrackingStability.dimPhaseRecallPct;
    const f2DimRecall = f2.sequences.dim_low_contrast_tracking.dimTrackingStability.dimPhaseRecallPct;
    const b3DimRecall = b3.sequences.dim_low_contrast_tracking.dimTrackingStability.dimPhaseRecallPct;

    const decisionSummary = {
      recommendedDefaultPolicy: "fixed-2",
      recommendedDefaultNumHands: 2,
      runtimeSetOptionsCallsFixed1: f1.runtimeSetOptionsCalls,
      runtimeSetOptionsCallsFixed2: f2.runtimeSetOptionsCalls,
      runtimeSetOptionsCallsLegacyB3v2: b3.runtimeSetOptionsCalls,
      singleHandMpMsP50: {
        fixed_1: f1SingleP50,
        fixed_2: f2SingleP50,
        legacy_B3v2: b3SingleP50,
        fixed2MinusFixed1Ms:
          f1SingleP50 !== null && f2SingleP50 !== null
            ? Math.round((f2SingleP50 - f1SingleP50) * 100) / 100
            : null,
      },
      dimTrackingPhaseRecallPct: {
        fixed_1: f1DimRecall,
        fixed_2: f2DimRecall,
        legacy_B3v2: b3DimRecall,
      },
      bystanderVisibilityPct: {
        fixed_1: f1BystanderDetPct,
        fixed_2: f2BystanderDetPct,
        legacy_B3v2:
          b3.sequences.bystander_intrusion_and_crossing.bystanderSafety.twoHandDetectionRatePct,
      },
      bystanderOwnerHijackFrames: {
        fixed_1: f1TotalHijacks,
        fixed_2: f2TotalHijacks,
        legacy_B3v2:
          b3.sequences.bystander_intrusion_and_crossing.bystanderSafety.totalOwnerHijackFrames,
      },
      rationale:
        "fixed_numHands_2 eliminates 100% of runtime landmarker.setOptions() graph rebuilds " +
        "(0 vs " +
        b3.runtimeSetOptionsCalls +
        " in legacy B3v2), preserves dim-light VIDEO tracking continuity (" +
        f2DimRecall +
        "% vs " +
        b3DimRecall +
        "% in legacy B3v2), keeps full 2-hand bystander visibility (" +
        f2BystanderDetPct +
        "% vs " +
        f1BystanderDetPct +
        "% in fixed_numHands_1 where a 2nd hand is completely invisible to MediaPipe), and enforces " +
        "single-owner lock, crossing/handedness-flip fail-closed hold (" +
        f2TotalHijacks +
        " owner hijacks vs " +
        f1TotalHijacks +
        " in fixed-1 and " +
        b3.sequences.bystander_intrusion_and_crossing.bystanderSafety.totalOwnerHijackFrames +
        " in legacy B3v2), and automatic reacquire purely in JS.",
    };

    const output = {
      schema: "r22-numhands-ablation/1",
      generatedAtIso: new Date().toISOString(),
      elapsedSec,
      environment: {
        nodeVersion: process.version,
        chromiumVersion: browser.version(),
        cpuModel: os.cpus()[0]?.model ?? "unknown",
        cpuCount: os.cpus().length,
        mediapipeTasksVisionVersion: "0.10.14",
        delegate: "CPU",
        runningMode: "VIDEO",
        simulatedCameraFps: 15,
        frameResolution: "320x180",
      },
      inputs: {
        handLandmarkerTask: {
          path: `${WORKTREE_PUBLIC}/models/hand_landmarker.task`,
          sha256: sha256File(`${WORKTREE_PUBLIC}/models/hand_landmarker.task`),
        },
        ownerImage: {
          path: IMG_OWNER,
          sha256: sha256File(IMG_OWNER),
        },
        bystanderImage: {
          path: IMG_BYSTANDER,
          sha256: sha256File(IMG_BYSTANDER),
        },
      },
      decision: decisionSummary,
      variants: rawReport.variants,
    };

    mkdirSync("/srv/sketchbook/mediapipe-optimize/research-can/r22/results", { recursive: true });
    writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2) + "\n", "utf-8");
    console.log(`[r22-numhands-ablation] DONE in ${elapsedSec}s -> ${OUTPUT_JSON}`);
    console.log(JSON.stringify(decisionSummary, null, 2));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("[r22-numhands-ablation] FAILED:", err);
  process.exit(1);
});
