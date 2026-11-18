/**
 * R18-UX3 Feature Extraction using shared TS Ux3FeatureTracker:
 * Uses synchronous writeSync on copied chunk buffers so typed-array memory is NEVER mutated while queued.
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  UX3_FEATURE_COUNT,
  UX3_FEATURE_NAMES,
  UX3_LABELS,
  Ux3FeatureTracker,
  mapIpnClass,
  type Ux3Label,
} from "../candidates/ux3_features";
import type { Landmark } from "../repo/frontend/implementation/src/input/types";

interface SeqVideo {
  video: string;
  person: string;
  frames: Array<{ f: number; cls: string; mp: number[][][] }>;
}

const DERIVED_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/derived";
const RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results";
const ASPECT_IPN = 4 / 3;
const DT_MS = 1000 / 30;
const LABEL_INDEX = Object.fromEntries(UX3_LABELS.map((l, i) => [l, i])) as Record<Ux3Label, number>;
const toLm = (pts: number[][]): Landmark[] => pts.map(([x, y]) => ({ x: x!, y: y! }));

async function extractSplitFromIterator(
  name: string,
  iter: AsyncIterable<SeqVideo> | Iterable<SeqVideo>,
  subsampleTrain: boolean,
): Promise<void> {
  const binPath = `${DERIVED_DIR}/ux3_feat_${name}.f32`;
  const metaPath = `${DERIVED_DIR}/ux3_feat_${name}.meta.json`;
  const fd = openSync(binPath, "w");

  const CHUNK_ROWS = 4096;
  const chunk = new Float32Array(CHUNK_ROWS * UX3_FEATURE_COUNT);
  let bufferedRows = 0;
  const flushChunk = () => {
    if (bufferedRows === 0) return;
    const byteLen = bufferedRows * UX3_FEATURE_COUNT * 4;
    const u8 = new Uint8Array(chunk.buffer, 0, byteLen);
    let written = 0;
    while (written < byteLen) {
      written += writeSync(fd, u8, written, byteLen - written);
    }
    bufferedRows = 0;
  };

  const y: number[] = [];
  const rawCls: string[] = [];
  const persons = new Set<string>();
  const counts: Record<string, number> = {};
  let videos = 0;
  let droppedDegenerate = 0;

  for await (const vid of iter) {
    videos++;
    const person = vid.person ?? vid.video.split("_")[1]!;
    persons.add(person);
    const tracker = new Ux3FeatureTracker();
    for (const fr of vid.frames) {
      if (!fr.mp || fr.mp.length === 0) {
        tracker.reset();
        continue;
      }
      const vec = tracker.extract(toLm(fr.mp[0]!), fr.f * DT_MS, ASPECT_IPN);
      if (!vec) {
        droppedDegenerate++;
        continue;
      }
      if (subsampleTrain && (fr.cls === "NOG" || fr.cls === "P1F" || fr.cls === "P2F") && fr.f % 2 !== 0) {
        continue;
      }
      const base = bufferedRows * UX3_FEATURE_COUNT;
      for (let k = 0; k < UX3_FEATURE_COUNT; k++) chunk[base + k] = vec[k]!;
      bufferedRows++;
      if (bufferedRows === CHUNK_ROWS) flushChunk();

      const lbl = mapIpnClass(fr.cls);
      y.push(LABEL_INDEX[lbl]);
      rawCls.push(fr.cls);
      counts[lbl] = (counts[lbl] ?? 0) + 1;
    }
  }

  flushChunk();
  closeSync(fd);

  writeFileSync(
    metaPath,
    JSON.stringify({
      split: name,
      videos,
      persons: Array.from(persons).sort(),
      rows: y.length,
      dropped_degenerate: droppedDegenerate,
      feature_count: UX3_FEATURE_COUNT,
      feature_names: UX3_FEATURE_NAMES,
      labels: UX3_LABELS,
      class_counts: counts,
      y,
      raw_cls: rawCls,
    }),
  );
  console.log(`[extract ${name}] videos=${videos} persons=${persons.size} rows=${y.length} dropped=${droppedDegenerate}`, counts);
}

async function main() {
  mkdirSync(DERIVED_DIR, { recursive: true });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  async function* readTrain(): AsyncIterable<SeqVideo> {
    for await (const line of rl) {
      if (line.trim()) yield JSON.parse(line) as SeqVideo;
    }
  }
  await extractSplitFromIterator("train", readTrain(), true);

  const val = JSON.parse(readFileSync(`${RESULTS_DIR}/ipn_val_person_seq.json`, "utf8")) as SeqVideo[];
  await extractSplitFromIterator("val", val, false);

  const test = JSON.parse(readFileSync(`${RESULTS_DIR}/ipn_test_person_seq.json`, "utf8")) as SeqVideo[];
  await extractSplitFromIterator("test", test, false);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
