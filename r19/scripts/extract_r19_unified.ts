/**
 * R19 Unified Causal Feature Extractor (`extract_r19_unified.ts`).
 *
 * Streams strictly cluster/subject-disjoint splits from:
 *  - HandGesture-5G (`CC BY 4.0`, cluster-disjoint: `Pointing Up` -> POINT_READY, `L-Sign` -> POINT_PRESS,
 *    `Fist/V-Sign/Open Palm` -> OTHER)
 *  - Natural RGB Hand Gestures v3 (`CC BY 4.0`, participant-disjoint 19/4/3: 11 non-pointing classes -> OTHER;
 *    `point_left/point_right` held out as AMBIGUOUS_CONVERSATIONAL_POINTING for dedicated eval)
 *  - IPN HandS (`CC BY 4.0`, person-disjoint 19/5/5: `NOG/P2F/C2F/2C2/GRB/T* /OP2/Z*` -> OTHER;
 *    `P1F/C1F/2C1` held out by default as casual 1F pointing unless `--p1f-trap` ablation is active)
 *
 * Writes identical row sets, labels, and sample weights simultaneously for:
 *  - `r19_feat` (`82`-dim R19FeatureTracker)
 *  - `r18_ablation_feat` (`68`-dim Ux3FeatureTracker, G5 feature-set ablation)
 * Optionally writes `r19_p1f_trap` (`--p1f-trap`) to quantify P1F == POINT_PRESS conflation failure.
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { R19_FEATURE_COUNT, R19_FEATURE_NAMES, R19_LABELS, R19FeatureTracker, type R19Label } from "./r19_features";
import { UX3_FEATURE_COUNT, UX3_FEATURE_NAMES, Ux3FeatureTracker } from "../../r18-ux0-sandbox/candidates/ux3_features";
import type { Landmark } from "../../r18-ux0-sandbox/repo/frontend/implementation/src/input/types";

type SplitName = "train" | "val" | "test";

interface MpHand {
  handedness: string;
  landmarks: number[][];
}

interface Hg5gRow {
  sample_id: string;
  class_name: string;
  aspect: number;
  cluster_id: number;
  split: SplitName;
  l0: { n_hands: number; hands: MpHand[] };
  l1: { n_hands: number; hands: MpHand[] };
}

interface N66Row {
  sample_id: string;
  clip_idx: number;
  participant_id: string;
  class_name: string;
  lighting_stratum: string;
  frame_idx: number;
  aspect: number;
  split: SplitName;
  l0: { n_hands: number; hands: MpHand[] };
  l1: { n_hands: number; hands: MpHand[] };
}

interface IpnVideo {
  video: string;
  person: string;
  frames: Array<{ f: number; cls: string; mp: number[][][] }>;
}

const HG5G_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl";
const N66_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl";
const STREAM_IPN_PY = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/train/stream_ipn_split.py";
const PYTHON_BIN = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/.venv/bin/python";
const OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/unified_feat";

const LABEL_TO_ID: Record<R19Label, number> = { POINT_READY: 0, POINT_PRESS: 1, OTHER: 2 };
const N66_OTHER_CLASSES = new Set([
  "thumbs_up", "thumbs_down", "peace_sign", "ok_sign", "fist",
  "stop", "raised_hand", "palm_down_push", "wave", "come_here", "go",
]);
const N66_HARD_NEG = new Set(["thumbs_up", "thumbs_down", "ok_sign", "peace_sign"]);
const IPN_OTHER_CLASSES = new Set([
  "NOG", "P2F", "C2F", "2C2", "GRB", "TUP", "TDN", "TLT", "TRT", "OP2", "ZIN", "ZOT",
]);
const IPN_CASUAL_1F = new Set(["P1F", "C1F", "2C1"]);

function toLm(pts: number[][]): Landmark[] {
  return pts.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2] ?? 0 }));
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function jitterLm(lm: Landmark[], rng: () => number, scale = 0.002): Landmark[] {
  const dx = (rng() - 0.5) * 0.004;
  const dy = (rng() - 0.5) * 0.004;
  return lm.map((p) => ({
    x: p.x + dx + (rng() - 0.5) * 2 * scale,
    y: p.y + dy + (rng() - 0.5) * 2 * scale,
    z: p.z ?? 0,
  }));
}

class DualSplitWriter {
  private readonly fdR19: number;
  private readonly fdR18: number | null;
  private readonly bufR19: Float32Array;
  private readonly bufR18: Float32Array | null;
  private buffered = 0;
  private readonly chunkRows = 2048;

  readonly y: number[] = [];
  readonly sampleWeights: number[] = [];
  readonly sources: string[] = [];
  readonly rawLabels: string[] = [];
  readonly sourceCounts: Record<string, Record<R19Label, number>> = {};

  constructor(outDir: string, prefixR19: string, prefixR18: string | null, readonly split: SplitName) {
    this.fdR19 = openSync(`${outDir}/${prefixR19}_${split}.f32`, "w");
    this.bufR19 = new Float32Array(this.chunkRows * R19_FEATURE_COUNT);
    this.fdR18 = prefixR18 ? openSync(`${outDir}/${prefixR18}_${split}.f32`, "w") : null;
    this.bufR18 = prefixR18 ? new Float32Array(this.chunkRows * UX3_FEATURE_COUNT) : null;
  }

  private flush(): void {
    if (this.buffered === 0) return;
    const writeAll = (fd: number, buf: Float32Array, dim: number) => {
      const byteLen = this.buffered * dim * 4;
      const u8 = new Uint8Array(buf.buffer, 0, byteLen);
      let off = 0;
      while (off < byteLen) off += writeSync(fd, u8, off, byteLen - off);
    };
    writeAll(this.fdR19, this.bufR19, R19_FEATURE_COUNT);
    if (this.fdR18 !== null && this.bufR18) writeAll(this.fdR18, this.bufR18, UX3_FEATURE_COUNT);
    this.buffered = 0;
  }

  push(vec19: number[], vec18: number[] | null, label: R19Label, weight: number, source: string, rawCls: string): void {
    if (this.fdR18 !== null && (!vec18 || vec18.length !== UX3_FEATURE_COUNT)) return;
    if (vec19.length !== R19_FEATURE_COUNT) return;
    const b19 = this.buffered * R19_FEATURE_COUNT;
    for (let i = 0; i < R19_FEATURE_COUNT; i++) this.bufR19[b19 + i] = vec19[i]!;
    if (this.bufR18 && vec18) {
      const b18 = this.buffered * UX3_FEATURE_COUNT;
      for (let i = 0; i < UX3_FEATURE_COUNT; i++) this.bufR18[b18 + i] = vec18[i]!;
    }
    this.buffered++;
    if (this.buffered === this.chunkRows) this.flush();

    this.y.push(LABEL_TO_ID[label]);
    this.sampleWeights.push(Math.round(weight * 10000) / 10000);
    this.sources.push(source);
    this.rawLabels.push(rawCls);
    const sc = (this.sourceCounts[source] ??= { POINT_READY: 0, POINT_PRESS: 0, OTHER: 0 });
    sc[label]++;
  }

  finish(outDir: string, prefixR19: string, prefixR18: string | null, p1fTrap: boolean): Record<string, any> {
    this.flush();
    closeSync(this.fdR19);
    if (this.fdR18 !== null) closeSync(this.fdR18);
    const baseMeta = {
      split: this.split,
      rows: this.y.length,
      labels: R19_LABELS,
      p1f_conflated_as_press: p1fTrap,
      source_counts: this.sourceCounts,
      y: this.y,
      sample_weights: this.sampleWeights,
    };
    writeFileSync(
      `${outDir}/${prefixR19}_${this.split}.meta.json`,
      JSON.stringify({ ...baseMeta, feature_count: R19_FEATURE_COUNT, feature_names: R19_FEATURE_NAMES }),
    );
    if (prefixR18) {
      writeFileSync(
        `${outDir}/${prefixR18}_${this.split}.meta.json`,
        JSON.stringify({ ...baseMeta, feature_count: UX3_FEATURE_COUNT, feature_names: UX3_FEATURE_NAMES }),
      );
    }
    return { rows: this.y.length, source_counts: this.sourceCounts };
  }
}

async function* streamIpn(split: SplitName): AsyncIterable<IpnVideo> {
  const child = spawn(PYTHON_BIN, [STREAM_IPN_PY, "--split", split], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line) as IpnVideo;
  }
  const code: number = await new Promise((res) => child.on("close", (c) => res(c ?? 1)));
  if (code !== 0) throw new Error(`stream_ipn_split.py --split ${split} failed with ${code}`);
}

async function runExtraction(opts: { p1fTrap: boolean; prefixR19: string; prefixR18: string | null }): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const writers: Record<SplitName, DualSplitWriter> = {
    train: new DualSplitWriter(OUT_DIR, opts.prefixR19, opts.prefixR18, "train"),
    val: new DualSplitWriter(OUT_DIR, opts.prefixR19, opts.prefixR18, "val"),
    test: new DualSplitWriter(OUT_DIR, opts.prefixR19, opts.prefixR18, "test"),
  };
  const rng = makeRng(20261118);

  // 1) HandGesture-5G (cluster-disjoint; primary source of verified POINT_PRESS & POINT_READY)
  // Cluster swap (train cluster 18 <-> val cluster 19 on Pointing Up ONLY) increases val POINT_READY
  // support from 6 to 22 detected hands while preserving 0 shared clusters and keeping TEST untouched.
  const hgLines = readFileSync(HG5G_JSONL, "utf8").split("\n");
  for (const line of hgLines) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Hg5gRow;
    let effectiveSplit: SplitName = r.split;
    if (r.class_name === "Pointing Up") {
      if (r.cluster_id === 18) effectiveSplit = "val";
      else if (r.cluster_id === 19) effectiveSplit = "train";
    }
    const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
    if (!hand) continue;
    let lbl: R19Label | null = null;
    let wBase = 1.0;
    if (r.class_name === "Pointing Up") {
      lbl = "POINT_READY";
      wBase = 1.65;
    } else if (r.class_name === "L-Sign") {
      lbl = "POINT_PRESS";
      wBase = 1.9;
    } else if (r.class_name === "Fist" || r.class_name === "V-Sign" || r.class_name === "Open Palm_Open Hand") {
      lbl = "OTHER";
      wBase = 1.0;
    }
    if (!lbl) continue;

    const lm = toLm(hand.landmarks);
    const t19 = new R19FeatureTracker();
    const t18 = opts.prefixR18 ? new Ux3FeatureTracker() : null;
    const v19 = t19.extract(lm, 0, r.aspect || 1);
    const v18 = t18 ? t18.extract(lm, 0, r.aspect || 1) : null;
    if (!v19) continue;

    if (effectiveSplit === "train") {
      // Emit BOTH static frame (has_history=0) and causal steady-hold frame (has_history=1) in TRAIN only
      // so models cannot rely on a `has_history == 0` shortcut to separate static photos from video streams.
      writers.train.push(v19, v18, lbl, wBase * 0.85, "hg5g_static", r.class_name);
      const lm2 = jitterLm(lm, rng, 0.0018);
      const v19h = t19.extract(lm2, 100, r.aspect || 1);
      const v18h = t18 ? t18.extract(lm2, 100, r.aspect || 1) : null;
      if (v19h) writers.train.push(v19h, v18h, lbl, wBase * 1.0, "hg5g_causal", r.class_name);
      // Also train on real 320px CLAHE L1 landmarks when L0 already succeeded so MLP matches low-res fallback
      if (r.l0.n_hands > 0 && r.l1.n_hands > 0 && lbl !== "OTHER") {
        const t19c = new R19FeatureTracker();
        const t18c = opts.prefixR18 ? new Ux3FeatureTracker() : null;
        const lm1 = toLm(r.l1.hands[0]!.landmarks);
        const v19c = t19c.extract(lm1, 0, r.aspect || 1);
        const v18c = t18c ? t18c.extract(lm1, 0, r.aspect || 1) : null;
        if (v19c) writers.train.push(v19c, v18c, lbl, wBase * 0.7, "hg5g_l1_clahe", r.class_name);
      }
    } else {
      writers[effectiveSplit].push(v19, v18, lbl, 1.0, "hg5g_static", r.class_name);
    }
  }

  // 2) Natural RGB Hand Gestures v3 (participant-disjoint; 11 clean OTHER gestures across real lighting)
  const n66ByClip = new Map<number, N66Row[]>();
  const n66Lines = readFileSync(N66_JSONL, "utf8").split("\n");
  for (const line of n66Lines) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as N66Row;
    if (!N66_OTHER_CLASSES.has(r.class_name)) continue;
    const arr = n66ByClip.get(r.clip_idx) ?? [];
    arr.push(r);
    n66ByClip.set(r.clip_idx, arr);
  }
  for (const [, frames] of n66ByClip) {
    frames.sort((a, b) => a.frame_idx - b.frame_idx);
    const t19 = new R19FeatureTracker();
    const t18 = opts.prefixR18 ? new Ux3FeatureTracker() : null;
    for (const r of frames) {
      const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
      if (!hand) {
        t19.reset();
        t18?.reset();
        continue;
      }
      const nowMs = (r.frame_idx * 1000) / 30;
      const lm = toLm(hand.landmarks);
      const v19 = t19.extract(lm, nowMs, r.aspect || 1);
      const v18 = t18 ? t18.extract(lm, nowMs, r.aspect || 1) : null;
      if (!v19) continue;
      const w = r.split === "train" ? (N66_HARD_NEG.has(r.class_name) ? 0.85 : 0.55) : 1.0;
      writers[r.split].push(v19, v18, "OTHER", w, `n66_${r.lighting_stratum}`, r.class_name);
    }
  }

  // 3) IPN HandS (person-disjoint 19/5/5; continuous 30 Hz OTHER sequences; casual 1F held out unless --p1f-trap)
  for (const sp of ["train", "val", "test"] as const) {
    let seenNog = 0;
    let seenOther = 0;
    let seen1f = 0;
    for await (const vid of streamIpn(sp)) {
      const t19 = new R19FeatureTracker();
      const t18 = opts.prefixR18 ? new Ux3FeatureTracker() : null;
      for (const fr of vid.frames) {
        if (!fr.mp || fr.mp.length === 0) {
          t19.reset();
          t18?.reset();
          continue;
        }
        const nowMs = (fr.f * 1000) / 30;
        const lm = toLm(fr.mp[0]!);
        const v19 = t19.extract(lm, nowMs, 4 / 3);
        const v18 = t18 ? t18.extract(lm, nowMs, 4 / 3) : null;
        if (!v19) continue;

        if (IPN_CASUAL_1F.has(fr.cls)) {
          if (!opts.p1fTrap) continue;
          seen1f++;
          const stride = sp === "train" ? 4 : 6;
          if (seen1f % stride !== 0) continue;
          writers[sp].push(v19, v18, "POINT_PRESS", sp === "train" ? 0.75 : 1.0, "ipn_p1f_trap", fr.cls);
          continue;
        }
        if (!IPN_OTHER_CLASSES.has(fr.cls)) continue;

        if (fr.cls === "NOG") {
          seenNog++;
          const stride = sp === "train" ? 28 : 25;
          if (seenNog % stride !== 0) continue;
          writers[sp].push(v19, v18, "OTHER", sp === "train" ? 0.22 : 0.45, "ipn_nog", fr.cls);
        } else {
          seenOther++;
          const stride = sp === "train" ? 20 : 18;
          if (seenOther % stride !== 0) continue;
          writers[sp].push(v19, v18, "OTHER", sp === "train" ? 0.35 : 0.65, "ipn_neg_gesture", fr.cls);
        }
      }
    }
  }

  const summary: Record<string, any> = { prefixR19: opts.prefixR19, prefixR18: opts.prefixR18, p1fTrap: opts.p1fTrap };
  for (const sp of ["train", "val", "test"] as const) {
    summary[sp] = writers[sp].finish(OUT_DIR, opts.prefixR19, opts.prefixR18, opts.p1fTrap);
  }
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const p1fTrap = process.argv.includes("--p1f-trap");
  if (p1fTrap) {
    await runExtraction({ p1fTrap: true, prefixR19: "r19_p1f_trap_feat", prefixR18: null });
  } else {
    await runExtraction({ p1fTrap: false, prefixR19: "r19_feat", prefixR18: "r18_ablation_feat" });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
