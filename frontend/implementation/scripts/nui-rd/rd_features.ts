/**
 * RD-04/05 step 2: landmarks (scratch JSON from rd_extract.py) -> features + the two heuristic reads, per split.
 *   ./node_modules/.bin/vite-node scripts/nui-rd/rd_features.ts <data_dir>
 * Writes feat_<split>.json next to the input. The output is derived from third-party data: keep it out of Git.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FEATURE_NAMES, handFeatures, heuristicRead, labelOf } from "./rd_lib";

const dir = process.argv[2];
if (!dir) throw new Error("usage: rd_features.ts <data_dir>");
// HaGRID frames are almost all 16:9 Full HD. Recorded as an assumption in the report.
const ASPECT = 16 / 9;
for (const split of ["train", "val", "test"] as const) {
  const rows = JSON.parse(readFileSync(`${dir}/landmarks_${split}.json`, "utf8")) as Array<{ c: string; k: string; u: string; lm: number[][] }>;
  const out = { names: FEATURE_NAMES, cls: [] as string[], label: [] as string[], user: [] as string[], X: [] as number[][], base: [] as Array<[string, number, string]>, rev: [] as Array<[string, number, string]> };
  let dropped = 0;
  for (const r of rows) {
    const lm = r.lm.map(([x, y]) => ({ x: x!, y: y! }));
    const f = handFeatures(lm, ASPECT);
    if (!f) { dropped++; continue; }
    const b = heuristicRead(lm, "baseline", ASPECT);
    const v = heuristicRead(lm, "revised", ASPECT);
    out.cls.push(r.c); out.label.push(labelOf(r.c)); out.user.push(r.u); out.X.push(f);
    out.base.push([b.pose, b.count, b.label]); out.rev.push([v.pose, v.count, v.label]);
  }
  writeFileSync(`${dir}/feat_${split}.json`, JSON.stringify(out));
  console.log(split, "rows", out.X.length, "dropped", dropped, "features", FEATURE_NAMES.length);
}
