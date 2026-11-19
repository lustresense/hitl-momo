/**
 * R20 feature extractor (`extract_r20_features.ts`).
 *
 * Re-uses the FROZEN R19 82-dim `R19FeatureTracker` (r19/candidates, untouched) so TS runtime and
 * training share one feature implementation. Compared with R19's extractor this version:
 *  - is path-parameterised via env (`R20_SANDBOX`, `R20_FEAT_OUT`) - no absolute /srv paths in logic;
 *  - keeps the SAME split policy as R19 (HG5G cluster-disjoint with the 18<->19 Pointing-Up swap,
 *    Natural RGB v3 participant-disjoint, IPN person-disjoint) so the locked TEST rows are identical
 *    to R19 and C0 vs C1..C4 comparisons are paired on the same TEST set;
 *  - writes per-row `sources`, `raw_labels`, `groups` (person/cluster/clip id) so the trainer can do
 *    per-source / per-group balancing and per-lighting slice metrics (R19 only stored aggregates);
 *  - optionally appends EXTRA TRAIN-ONLY rows from `--extra-jsonl <file>` (e.g. augmented HG5G
 *    re-extracted landmarks, audited hard negatives). Extra rows can never enter VAL/TEST.
 *
 * Usage: tsx extract_r20_features.ts --out-prefix r20_feat [--extra-jsonl a.jsonl --extra-jsonl b.jsonl]
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { R19_FEATURE_COUNT, R19_FEATURE_NAMES, R19_LABELS, R19FeatureTracker, type R19Label } from "../../r19/candidates/r19_features";
import type { Landmark } from "../../r19/candidates/pistol_types";

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
interface ExtraRow {
  source: string;
  raw_label: string;
  label: R19Label;
  group: string;
  aspect: number;
  weight: number;
  landmarks: number[][];
  has_history?: boolean;
}

const SANDBOX = process.env.R20_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const R19_SANDBOX = process.env.R19_SANDBOX || "/srv/sketchbook/mediapipe-optimize/r19-sandbox";
const REPO = process.env.R20_REPO || "/srv/sketchbook/mediapipe-optimize/research-can";
const HG5G_JSONL = `${R19_SANDBOX}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl`;
const N66_JSONL = `${R19_SANDBOX}/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl`;
const STREAM_IPN_PY = `${REPO}/r19/scripts/stream_ipn_split.py`;
const PYTHON_BIN = process.env.R20_PYTHON || `${SANDBOX}/.venv/bin/python`;
const OUT_DIR = process.env.R20_FEAT_OUT || `${SANDBOX}/data/feat`;

const LABEL_TO_ID: Record<R19Label, number> = { POINT_READY: 0, POINT_PRESS: 1, OTHER: 2 };
const N66_OTHER_CLASSES = new Set([
  "thumbs_up", "thumbs_down", "peace_sign", "ok_sign", "fist",
  "stop", "raised_hand", "palm_down_push", "wave", "come_here", "go",
]);
const N66_HARD_NEG = new Set(["thumbs_up", "thumbs_down", "ok_sign", "peace_sign"]);
const IPN_OTHER_CLASSES = new Set(["NOG", "P2F", "C2F", "2C2", "GRB", "TUP", "TDN", "TLT", "TRT", "OP2", "ZIN", "ZOT"]);
const IPN_CASUAL_1F = new Set(["P1F", "C1F", "2C1"]);

const toLm = (pts: number[][]): Landmark[] => pts.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2] ?? 0 }));

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
  return lm.map((p) => ({ x: p.x + dx + (rng() - 0.5) * 2 * scale, y: p.y + dy + (rng() - 0.5) * 2 * scale, z: p.z ?? 0 }));
}

class SplitWriter {
  private readonly fd: number;
  private readonly buf: Float32Array;
  private buffered = 0;
  private readonly chunkRows = 2048;
  readonly y: number[] = [];
  readonly sampleWeights: number[] = [];
  readonly sources: string[] = [];
  readonly rawLabels: string[] = [];
  readonly groups: string[] = [];
  readonly sourceCounts: Record<string, Record<R19Label, number>> = {};

  constructor(outDir: string, readonly prefix: string, readonly split: SplitName) {
    this.fd = openSync(`${outDir}/${prefix}_${split}.f32`, "w");
    this.buf = new Float32Array(this.chunkRows * R19_FEATURE_COUNT);
  }
  private flush(): void {
    if (this.buffered === 0) return;
    const byteLen = this.buffered * R19_FEATURE_COUNT * 4;
    const u8 = new Uint8Array(this.buf.buffer, 0, byteLen);
    let off = 0;
    while (off < byteLen) off += writeSync(this.fd, u8, off, byteLen - off);
    this.buffered = 0;
  }
  push(vec: number[], label: R19Label, weight: number, source: string, rawCls: string, group: string): void {
    if (vec.length !== R19_FEATURE_COUNT) return;
    const b = this.buffered * R19_FEATURE_COUNT;
    for (let i = 0; i < R19_FEATURE_COUNT; i++) this.buf[b + i] = vec[i]!;
    this.buffered++;
    if (this.buffered === this.chunkRows) this.flush();
    this.y.push(LABEL_TO_ID[label]);
    this.sampleWeights.push(Math.round(weight * 10000) / 10000);
    this.sources.push(source);
    this.rawLabels.push(rawCls);
    this.groups.push(group);
    const sc = (this.sourceCounts[source] ??= { POINT_READY: 0, POINT_PRESS: 0, OTHER: 0 });
    sc[label]++;
  }
  finish(): Record<string, unknown> {
    this.flush();
    closeSync(this.fd);
    writeFileSync(
      `${OUT_DIR}/${this.prefix}_${this.split}.meta.json`,
      JSON.stringify({
        split: this.split,
        rows: this.y.length,
        labels: R19_LABELS,
        feature_count: R19_FEATURE_COUNT,
        feature_names: R19_FEATURE_NAMES,
        source_counts: this.sourceCounts,
        y: this.y,
        sample_weights: this.sampleWeights,
        sources: this.sources,
        raw_labels: this.rawLabels,
        groups: this.groups,
      }),
    );
    return { rows: this.y.length, source_counts: this.sourceCounts };
  }
}

async function* streamIpn(split: SplitName): AsyncIterable<IpnVideo> {
  const child = spawn(PYTHON_BIN, [STREAM_IPN_PY, "--split", split], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line) as IpnVideo;
  const code: number = await new Promise((res) => child.on("close", (c) => res(c ?? 1)));
  if (code !== 0) throw new Error(`stream_ipn_split.py --split ${split} failed with ${code}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string): string[] => argv.flatMap((a, i) => (a === name ? [argv[i + 1]!] : []));
  const prefix = arg("--out-prefix")[0] || "r20_feat";
  const extraFiles = arg("--extra-jsonl");
  mkdirSync(OUT_DIR, { recursive: true });
  const writers: Record<SplitName, SplitWriter> = {
    train: new SplitWriter(OUT_DIR, prefix, "train"),
    val: new SplitWriter(OUT_DIR, prefix, "val"),
    test: new SplitWriter(OUT_DIR, prefix, "test"),
  };
  const rng = makeRng(20261118);

  // 1) HandGesture-5G (identical policy to R19)
  for (const line of readFileSync(HG5G_JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Hg5gRow;
    let split: SplitName = r.split;
    if (r.class_name === "Pointing Up") {
      if (r.cluster_id === 18) split = "val";
      else if (r.cluster_id === 19) split = "train";
    }
    const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
    if (!hand) continue;
    let lbl: R19Label | null = null;
    let wBase = 1.0;
    if (r.class_name === "Pointing Up") { lbl = "POINT_READY"; wBase = 1.65; }
    else if (r.class_name === "L-Sign") { lbl = "POINT_PRESS"; wBase = 1.9; }
    else if (r.class_name === "Fist" || r.class_name === "V-Sign" || r.class_name === "Open Palm_Open Hand") { lbl = "OTHER"; }
    if (!lbl) continue;
    const grp = `hg5g_c${r.cluster_id}`;
    const lm = toLm(hand.landmarks);
    const t = new R19FeatureTracker();
    const v = t.extract(lm, 0, r.aspect || 1);
    if (!v) continue;
    if (split === "train") {
      writers.train.push(v, lbl, wBase * 0.85, "hg5g_static", r.class_name, grp);
      const vh = t.extract(jitterLm(lm, rng, 0.0018), 100, r.aspect || 1);
      if (vh) writers.train.push(vh, lbl, wBase * 1.0, "hg5g_causal", r.class_name, grp);
      if (r.l0.n_hands > 0 && r.l1.n_hands > 0 && lbl !== "OTHER") {
        const vc = new R19FeatureTracker().extract(toLm(r.l1.hands[0]!.landmarks), 0, r.aspect || 1);
        if (vc) writers.train.push(vc, lbl, wBase * 0.7, "hg5g_l1_clahe", r.class_name, grp);
      }
    } else {
      writers[split].push(v, lbl, 1.0, "hg5g_static", r.class_name, grp);
    }
  }

  // 2) Natural RGB v3 OTHER (identical policy)
  const byClip = new Map<number, N66Row[]>();
  for (const line of readFileSync(N66_JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as N66Row;
    if (!N66_OTHER_CLASSES.has(r.class_name)) continue;
    const arr = byClip.get(r.clip_idx) ?? [];
    arr.push(r);
    byClip.set(r.clip_idx, arr);
  }
  for (const [, frames] of byClip) {
    frames.sort((a, b) => a.frame_idx - b.frame_idx);
    const t = new R19FeatureTracker();
    for (const r of frames) {
      const hand = r.l0.n_hands > 0 ? r.l0.hands[0] : r.l1.n_hands > 0 ? r.l1.hands[0] : null;
      if (!hand) { t.reset(); continue; }
      const v = t.extract(toLm(hand.landmarks), (r.frame_idx * 1000) / 30, r.aspect || 1);
      if (!v) continue;
      const w = r.split === "train" ? (N66_HARD_NEG.has(r.class_name) ? 0.85 : 0.55) : 1.0;
      writers[r.split].push(v, "OTHER", w, `n66_${r.lighting_stratum}`, r.class_name, `n66_${r.participant_id}`);
    }
  }

  // 3) IPN HandS (identical policy; P1F/C1F/2C1 stay excluded)
  for (const sp of ["train", "val", "test"] as const) {
    let seenNog = 0, seenOther = 0;
    for await (const vid of streamIpn(sp)) {
      const t = new R19FeatureTracker();
      for (const fr of vid.frames) {
        if (!fr.mp || fr.mp.length === 0) { t.reset(); continue; }
        const v = t.extract(toLm(fr.mp[0]!), (fr.f * 1000) / 30, 4 / 3);
        if (!v) continue;
        if (IPN_CASUAL_1F.has(fr.cls) || !IPN_OTHER_CLASSES.has(fr.cls)) continue;
        if (fr.cls === "NOG") {
          seenNog++;
          if (seenNog % (sp === "train" ? 28 : 25) !== 0) continue;
          writers[sp].push(v, "OTHER", sp === "train" ? 0.22 : 0.45, "ipn_nog", fr.cls, `ipn_${vid.person}`);
        } else {
          seenOther++;
          if (seenOther % (sp === "train" ? 20 : 18) !== 0) continue;
          writers[sp].push(v, "OTHER", sp === "train" ? 0.35 : 0.65, "ipn_neg_gesture", fr.cls, `ipn_${vid.person}`);
        }
      }
    }
  }

  // 4) Extra TRAIN-ONLY rows (C2/C3 augmentation, audited hard negatives)
  for (const f of extraFiles) {
    let n = 0;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as ExtraRow;
      const t = new R19FeatureTracker();
      const lm = toLm(r.landmarks);
      const v = t.extract(lm, r.has_history ? 100 : 0, r.aspect || 1);
      if (!v) continue;
      writers.train.push(v, r.label, r.weight, r.source, r.raw_label, r.group);
      n++;
    }
    console.error(`[extra] ${f}: ${n} TRAIN rows`);
  }

  const summary: Record<string, unknown> = { prefix, extraFiles };
  for (const sp of ["train", "val", "test"] as const) summary[sp] = writers[sp].finish();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
