/**
 * RD-05: same subjects, same rows, four systems: baseline rule, revised rule, pilot LR, pilot MLP.
 *   ./node_modules/.bin/vite-node scripts/nui-rd/rd05_ab.ts <data_dir> <model_dir> [out.json]
 * TEST is scored once. The decision rule comes from rd05_budget.json, written before any model was scored.
 * Evidence class: DATASET (public static images). Latency = Node V8 on this container, not a student laptop or a browser.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { LABELS, accuracy, emptyConfusion, handFeatures, heuristicRead, macroF1, perClass, type Confusion, type Label } from "./rd_lib";
import { Pilot, type PilotModel } from "./rd_model";

const [dataDir, modelDir, outPath] = [process.argv[2], process.argv[3], process.argv[4]];
if (!dataDir || !modelDir) throw new Error("usage: rd05_ab.ts <data_dir> <model_dir> [out.json]");
const budget = JSON.parse(readFileSync(new URL("./rd05_budget.json", import.meta.url), "utf8"));
type Read = [string, number, string];
const test = JSON.parse(readFileSync(`${dataDir}/feat_test.json`, "utf8")) as { cls: string[]; label: Label[]; user: string[]; X: number[][]; base: Read[]; rev: Read[] };
const lr = new Pilot(JSON.parse(readFileSync(`${modelDir}/model_lr.json`, "utf8")) as PilotModel);
const mlp = new Pilot(JSON.parse(readFileSync(`${modelDir}/model_mlp.json`, "utf8")) as PilotModel);

// 1. parity: the TypeScript inference must reproduce the Python probabilities.
const parity = (p: Pilot, file: string) => {
  const d = JSON.parse(readFileSync(`${modelDir}/${file}`, "utf8")) as { X: number[][]; proba: number[][] };
  let worst = 0;
  d.X.forEach((x, i) => p.proba(x).forEach((v, j) => { worst = Math.max(worst, Math.abs(v - d.proba[i]![j]!)); }));
  return worst;
};
const parityLr = parity(lr, "parity_lr.json");
const parityMlp = parity(mlp, "parity_mlp.json");
if (parityLr > 1e-4 || parityMlp > 1e-4) throw new Error(`inference parity broken: lr ${parityLr} mlp ${parityMlp}`);

// 2. predictions
const N = test.X.length;
const preds: Record<string, Label[]> = {
  baseline: test.base.map((r) => r[2] as Label),
  revised: test.rev.map((r) => r[2] as Label),
  pilot_lr: test.X.map((x) => lr.predict(x)),
  pilot_mlp: test.X.map((x) => mlp.predict(x)),
};
const SEVEN = new Set<Label>(["FIVE", "FOUR", "THREE", "TWO", "ONE", "PINCH_LIKE", "OTHER"]);
const macro7 = (c: Confusion) => { const m = perClass(c).filter((x) => SEVEN.has(x.label) && x.support > 0); return m.reduce((s, x) => s + (x.f1 ?? 0), 0) / m.length; };
const confOf = (pred: Label[], idx?: number[]) => { const c = emptyConfusion(); (idx ?? [...Array(N).keys()]).forEach((i) => { c[test.label[i]!][pred[i]!] += 1; }); return c; };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const sources = [...new Set(test.cls)].sort();
const summary: Record<string, any> = {};
for (const [name, pred] of Object.entries(preds)) {
  const c = confOf(pred);
  const five = perClass(c).find((m) => m.label === "FIVE")!;
  // false-Hapus: baseline/revised erase only with palm pose AND count 5 (the lab's rule); the models say FIVE.
  const erase = (i: number) => name === "baseline" ? test.base[i]![0].endsWith("palm") && test.base[i]![1] === 5
    : name === "revised" ? test.rev[i]![0].endsWith("palm") && test.rev[i]![1] === 5 : pred[i] === "FIVE";
  let fh = 0, nonFive = 0, tp = 0, five_n = 0;
  const bySource: Record<string, { n: number; erasePct: number }> = {};
  sources.forEach((s) => { bySource[s] = { n: 0, erasePct: 0 }; });
  for (let i = 0; i < N; i++) {
    const e = erase(i);
    bySource[test.cls[i]!]!.n++; if (e) bySource[test.cls[i]!]!.erasePct++;
    if (test.label[i] === "FIVE") { five_n++; if (e) tp++; } else { nonFive++; if (e) fh++; }
  }
  for (const s of sources) bySource[s]!.erasePct = Math.round((1000 * bySource[s]!.erasePct) / bySource[s]!.n) / 10;
  summary[name] = {
    macroF1_9: r3(macroF1(c)), macroF1_7: r3(macro7(c)), accuracy: r3(accuracy(c)),
    five: { precision: five.precision && r3(five.precision), recall: five.recall && r3(five.recall), f1: five.f1 && r3(five.f1) },
    erase: { falseHapusPct: Math.round((10000 * fh) / nonFive) / 100, fiveRecallPct: Math.round((10000 * tp) / five_n) / 100, nonFive, five_n },
    bySource, perClass: perClass(c).map((m) => ({ ...m, precision: m.precision && r3(m.precision), recall: m.recall && r3(m.recall), f1: m.f1 && r3(m.f1) })),
    confusion: c,
  };
}

// 3. subject-cluster bootstrap (resample users with replacement) for the decision metrics.
const byUser = new Map<string, number[]>();
test.user.forEach((u, i) => { (byUser.get(u) ?? byUser.set(u, []).get(u)!).push(i); });
const users = [...byUser.keys()];
let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const ciOf = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return [r3(s[Math.floor(0.025 * s.length)]!), r3(s[Math.floor(0.975 * s.length)]!)]; };
const B = 200;
const boot: Record<string, { macro7: number[]; fh: number[]; rec: number[] }> = {};
const erasedBy = (name: string, i: number) => name === "revised" ? test.rev[i]![0].endsWith("palm") && test.rev[i]![1] === 5 : name === "baseline" ? test.base[i]![0].endsWith("palm") && test.base[i]![1] === 5 : preds[name]![i] === "FIVE";
for (const name of Object.keys(preds)) boot[name] = { macro7: [], fh: [], rec: [] };
const diffMacro: Record<string, number[]> = { pilot_lr: [], pilot_mlp: [] };
const diffFh: Record<string, number[]> = { pilot_lr: [], pilot_mlp: [] };
for (let b = 0; b < B; b++) {
  const idx: number[] = [];
  for (let k = 0; k < users.length; k++) idx.push(...byUser.get(users[Math.floor(rnd() * users.length)]!)!);
  const stat: Record<string, { m7: number; fh: number; rec: number }> = {};
  for (const name of Object.keys(preds)) {
    const c = confOf(preds[name]!, idx);
    let fh = 0, nf = 0, tp = 0, f5 = 0;
    for (const i of idx) { const e = erasedBy(name, i); if (test.label[i] === "FIVE") { f5++; if (e) tp++; } else { nf++; if (e) fh++; } }
    stat[name] = { m7: macro7(c), fh: (100 * fh) / nf, rec: (100 * tp) / f5 };
    boot[name]!.macro7.push(stat[name]!.m7); boot[name]!.fh.push(stat[name]!.fh); boot[name]!.rec.push(stat[name]!.rec);
  }
  for (const m of ["pilot_lr", "pilot_mlp"]) { diffMacro[m]!.push(stat[m]!.m7 - stat.revised!.m7); diffFh[m]!.push(stat[m]!.fh - stat.revised!.fh); }
}
for (const name of Object.keys(preds)) summary[name].ci95 = { macroF1_7: ciOf(boot[name]!.macro7), falseHapusPct: ciOf(boot[name]!.fh), fiveRecallPct: ciOf(boot[name]!.rec), bootstrap: `${B} resamples of ${users.length} subjects` };
const diffs = Object.fromEntries(["pilot_lr", "pilot_mlp"].map((m) => [m, { macroF1_7_minus_revised: ciOf(diffMacro[m]!), falseHapusPct_minus_revised: ciOf(diffFh[m]!) }]));

// 4. latency (Node V8): features + inference per hand, single thread, after warm-up.
const lms = test.X.slice(0, 1).length ? JSON.parse(readFileSync(`${dataDir}/landmarks_test.json`, "utf8")).slice(0, 2000).map((r: { lm: number[][] }) => r.lm.map(([x, y]: number[]) => ({ x: x!, y: y! }))) : [];
const time = (fn: (lm: { x: number; y: number }[]) => unknown) => {
  for (let w = 0; w < 3; w++) for (const lm of lms) fn(lm);
  const t: number[] = [];
  for (let rep = 0; rep < 5; rep++) for (const lm of lms) { const a = performance.now(); fn(lm); t.push(performance.now() - a); }
  t.sort((a, b) => a - b);
  return { n: t.length, p50_ms: Math.round(t[Math.floor(0.5 * t.length)]! * 1e4) / 1e4, p95_ms: Math.round(t[Math.floor(0.95 * t.length)]! * 1e4) / 1e4, p99_ms: Math.round(t[Math.floor(0.99 * t.length)]! * 1e4) / 1e4 };
};
const latency = {
  runtime: `node ${process.version}`, cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, note: "Node V8 in a cloud container. NOT a student laptop, NOT a browser, NOT under MediaPipe load.",
  heuristic_baseline: time((lm) => heuristicRead(lm, "baseline")),
  heuristic_revised: time((lm) => heuristicRead(lm, "revised")),
  features_only: time((lm) => handFeatures(lm)),
  features_plus_lr: time((lm) => lr.predict(handFeatures(lm)!)),
  features_plus_mlp: time((lm) => mlp.predict(handFeatures(lm)!)),
};

// 5. decision against the pre-recorded budget
const rv = summary.revised, verdictFor = (name: "pilot_lr" | "pilot_mlp") => {
  const m = summary[name];
  const a = m.erase.falseHapusPct <= rv.erase.falseHapusPct;
  const b = m.erase.fiveRecallPct >= rv.erase.fiveRecallPct - 2;
  const c = m.macroF1_7 >= rv.macroF1_7 + 0.03;
  const lat = latency[name === "pilot_lr" ? "features_plus_lr" : "features_plus_mlp"];
  const d = lat.p95_ms <= 1.0;
  const supportOk = LABELS.every((l) => (m.perClass.find((x: any) => x.label === l)?.support ?? 0) >= 200 || l === "OTHER" && false);
  const verdict = !supportOk ? "INSUFFICIENT_DATA" : a && b && c && d ? "PROMISING" : !a || !b || m.macroF1_7 < rv.macroF1_7 ? "REJECTED" : "REJECTED";
  return { a_falseHapus_le_revised: a, b_fiveRecall_within_2pt: b, c_macroF1_7_plus_0_03: c, d_p95_le_1ms: d, verdict };
};
const decision = { budget_file: "scripts/nui-rd/rd05_budget.json", pilot_lr: verdictFor("pilot_lr"), pilot_mlp: verdictFor("pilot_mlp"),
  not_covered: { pinch_near_vs_touch: "INSUFFICIENT_DATA (no HaGRID class separates near from touching; `ok` is a different pose)", swipe_temporal: "BLOCKED (IPN HandS landmark archives: Drive quota exceeded)", webcam: "NOT_TESTED", mapping_risk: "stop=FIVE is UNCERTAIN; fist read as thumb-up by the repo pose in both rule sets" } };

const out = { rows: N, users: users.length, parity: { lr_max_abs_diff: parityLr, mlp_max_abs_diff: parityMlp }, summary, bootstrapDiffVsRevised: diffs, latency, decision };
writeFileSync(outPath ?? `${dataDir}/rd05_results.json`, JSON.stringify(out, null, 1));
const row = (n: string) => { const s = summary[n]; return `${n.padEnd(10)} macroF1_9=${s.macroF1_9} macroF1_7=${s.macroF1_7} ci7=${JSON.stringify(s.ci95.macroF1_7)} acc=${s.accuracy} | FIVE P/R=${s.five.precision}/${s.five.recall} | falseHapus=${s.erase.falseHapusPct}% ci=${JSON.stringify(s.ci95.falseHapusPct)} recall=${s.erase.fiveRecallPct}%`; };
console.log(`TEST rows=${N} users=${users.length} parity lr=${parityLr.toExponential(2)} mlp=${parityMlp.toExponential(2)}`);
for (const n of Object.keys(preds)) console.log(row(n));
console.log("erase% by source (baseline | revised | lr | mlp) where any >= 0.5%:");
for (const s of sources) { const v = ["baseline", "revised", "pilot_lr", "pilot_mlp"].map((n) => summary[n].bySource[s].erasePct); if (v.some((x) => x >= 0.5)) console.log(" ", s.padEnd(11), v.join(" | ")); }
console.log("bootstrap diff vs revised", JSON.stringify(diffs));
console.log("latency", JSON.stringify(latency, null, 1));
console.log("decision", JSON.stringify(decision, null, 1));
