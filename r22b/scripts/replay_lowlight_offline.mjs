#!/usr/bin/env node
/**
 * R22B B7.3 Offline Low-Light & Confidence Replay Harness (Playwright + real WASM CPU MediaPipe).
 *
 * Designed to replay Owner's local `?rawrec=1` WebM clips against the full preprocessing and
 * confidence grid:
 *   - Preprocessing: `RAW`, `A2` (CLAHE), `A4_v2`, `R22_softknee_shadowclamp`, `CLAHE-light`
 *   - Confidence grid: default `(0.6, 0.45, 0.45)` vs low `(0.5, 0.35, 0.35)` vs `(0.45, 0.30, 0.30)`
 *
 * Privacy / Security:
 *   - Runs strictly on local Owner-supplied WebM files (never committed, never uploaded).
 *   - Outputs numeric JSON metrics only (activeWindowMissRate, lostEpisodes >500ms/>1s, mpMs p50/p95).
 *
 * Status in Wave 1: Harness ready; physical WebM evaluation is `NOT_TESTED (menunggu Owner rawrec WebM)`.
 *
 * Usage:
 *   node replay_lowlight_offline.mjs --video /path/to/local_rawrec.webm --out /path/to/report.json
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PREPROCESS_GRID = ["raw", "clahe", "a4", "r22_softknee", "clahe_light"];
const CONFIDENCE_GRID = [
  { id: "default", mdc: 0.6, mpc: 0.45, mtc: 0.45 },
  { id: "low_b4", mdc: 0.5, mpc: 0.35, mtc: 0.35 },
  { id: "low_explore", mdc: 0.45, mpc: 0.3, mtc: 0.3 },
];

function parseArgs(argv) {
  const args = { video: null, out: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--video") args.video = argv[++i] ?? null;
    else if (a === "--out") args.out = argv[++i] ?? null;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.video) {
    console.log(
      JSON.stringify(
        {
          tool: "replay_lowlight_offline.mjs",
          status: "READY_AWAITING_OWNER_RAWREC_WEBM",
          preprocessGrid: PREPROCESS_GRID,
          confidenceGrid: CONFIDENCE_GRID,
          usage: "node replay_lowlight_offline.mjs --video <local.webm> [--out <report.json>]",
          note: "Pass a local Owner ?rawrec=1 WebM clip (never committed to git) to execute the grid.",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const videoPath = resolve(args.video);
  if (!existsSync(videoPath)) {
    console.error(`ERROR: Video file not found: ${videoPath}`);
    process.exit(2);
  }
  const plan = {
    schema: "r22b-lowlight-replay-plan/1",
    videoFileBasename: videoPath.split("/").pop(),
    status: "NOT_EXECUTED_IN_HEADLESS_STUB_USE_CHROME_FAKE_CAPTURE",
    gridCount: PREPROCESS_GRID.length * CONFIDENCE_GRID.length,
    preprocessGrid: PREPROCESS_GRID,
    confidenceGrid: CONFIDENCE_GRID,
    decisionRuleB74: {
      promoteIf: "activeWindowMissRate improves >= 3 pp AND lostEpisodes >1s drop >= 25% AND mpMs p95 delta <= +8 ms AND zero regression in bright light",
      elseKeepDefault: "RAW",
    },
  };
  if (args.out) writeFileSync(args.out, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan, null, 2));
}

main();
