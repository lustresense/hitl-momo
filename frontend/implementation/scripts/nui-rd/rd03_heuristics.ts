/**
 * RD-03: baseline (game) rule vs revised (lab) rule on REAL hand landmarks (HaGRIDv2 auto-landmarks, subject-disjoint).
 *   ./node_modules/.bin/vite-node scripts/nui-rd/rd03_heuristics.ts <data_dir> [out.json]
 * VAL is for calibration questions (the thumb threshold sweep). TEST is for reporting only.
 * Evidence class: DATASET (public static images, MediaPipe auto-landmarks). It is not webcam evidence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { THUMB_OPEN_LATERAL } from "../../src/input/hand-gesture";
import { LABELS, accuracy, emptyConfusion, macroF1, perClass, type Confusion, type Label } from "./rd_lib";

type Read = [string, number, string];
interface Feat { names: string[]; cls: string[]; label: Label[]; user: string[]; X: number[][]; base: Read[]; rev: Read[] }
const dir = process.argv[2];
if (!dir) throw new Error("usage: rd03_heuristics.ts <data_dir> [out.json]");
const load = (s: string): Feat => JSON.parse(readFileSync(`${dir}/feat_${s}.json`, "utf8"));
const LAT = (() => { const f = load("val").names.indexOf("thumb_lateral"); return f; })();

const palm = (p: string) => p === "open-palm" || p === "split-palm";
const erases = (r: Read) => palm(r[0]) && r[1] === 5;
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null);

function confusion(f: Feat, which: "base" | "rev"): Confusion {
  const c = emptyConfusion();
  f.label.forEach((l, i) => { c[l][f[which][i]![2] as Label] += 1; });
  return c;
}

/** Per source class: how often the rule lets the lab ERASE, and how often it reads count 3 / pose three-fingers. */
function bySource(f: Feat, which: "base" | "rev") {
  const out: Record<string, { n: number; eraseEligiblePct: number | null; count3Pct: number | null; threePosePct: number | null; count4Pct: number | null; count5Pct: number | null }> = {};
  const classes = [...new Set(f.cls)];
  for (const c of classes) {
    let n = 0, er = 0, c3 = 0, tp = 0, c4 = 0, c5 = 0;
    f.cls.forEach((k, i) => {
      if (k !== c) return;
      const r = f[which][i]!;
      n++; if (erases(r)) er++; if (r[1] === 3) c3++; if (r[0] === "three-fingers") tp++; if (r[1] === 4) c4++; if (r[1] === 5) c5++;
    });
    out[c] = { n, eraseEligiblePct: pct(er, n), count3Pct: pct(c3, n), threePosePct: pct(tp, n), count4Pct: pct(c4, n), count5Pct: pct(c5, n) };
  }
  return out;
}

/** Thumb threshold sweep on a split. The thumb rule is `lateral >= tau`; the other four fingers do not change. */
function sweep(f: Feat, taus: number[]) {
  const nonThumb = f.rev.map((r, i) => r[1] - (f.X[i]![LAT]! >= THUMB_OPEN_LATERAL ? 1 : 0));
  return taus.map((tau) => {
    const cnt = nonThumb.map((n, i) => n + (f.X[i]![LAT]! >= tau ? 1 : 0));
    const stat = (cls: string[], pred: (i: number) => boolean) => {
      let n = 0, k = 0;
      f.cls.forEach((c, i) => { if (cls.includes(c)) { n++; if (pred(i)) k++; } });
      return pct(k, n);
    };
    const eraseFor = (i: number) => palm(f.rev[i]![0]) && cnt[i] === 5; // pose kept at the shipped threshold (approximation)
    return {
      tau,
      fiveRecallPalmStopPct: stat(["palm", "stop"], eraseFor),
      falseHapusFourPct: stat(["four"], eraseFor),
      falseHapusNoGesturePct: stat(["no_gesture"], eraseFor),
      falseHapusOtherPct: (() => { let n = 0, k = 0; f.cls.forEach((c, i) => { if (!["palm", "stop"].includes(c)) { n++; if (eraseFor(i)) k++; } }); return pct(k, n); })(),
      threeCount3Pct: stat(["three"], (i) => cnt[i] === 3),
    };
  });
}

const out: Record<string, unknown> = { assumptions: { aspect: "16:9 assumed for every HaGRID frame", labels: "stop=FIVE is UNCERTAIN; no_gesture/three2/three3/... are OTHER", evidence: "DATASET, not webcam" } };
for (const split of ["val", "test"] as const) {
  const f = load(split);
  const res: Record<string, unknown> = { rows: f.X.length, users: new Set(f.user).size };
  for (const which of ["base", "rev"] as const) {
    const c = confusion(f, which);
    res[which] = { macroF1: Math.round(macroF1(c) * 1000) / 1000, accuracy: Math.round(accuracy(c) * 1000) / 1000, perClass: perClass(c), confusion: c, bySource: bySource(f, which) };
  }
  out[split] = res;
}
const taus = [0.9, 1.0, 1.1, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5, 1.6, 1.7];
out.sweepVal = sweep(load("val"), taus);
out.sweepTest = sweep(load("test"), taus);
// Pick tau on VAL only: maximise FIVE recall minus the false-Hapus rate on four, among taus.
const sv = out.sweepVal as ReturnType<typeof sweep>;
const score = (r: (typeof sv)[number]) => (r.fiveRecallPalmStopPct ?? 0) - 2 * (r.falseHapusFourPct ?? 0) - (r.falseHapusNoGesturePct ?? 0) * 0.5;
const best = sv.reduce((a, b) => (score(b) > score(a) ? b : a));
out.valBestTau = { tau: best.tau, objective: "recall(palm,stop) - 2*falseHapus(four) - 0.5*falseHapus(no_gesture), on VAL", shipped: THUMB_OPEN_LATERAL };
writeFileSync(process.argv[3] ?? `${dir}/rd03_results.json`, JSON.stringify(out, null, 1));

// ---- console summary ----
const T = out.test as { base: any; rev: any; rows: number; users: number };
const V = out.val as { base: any; rev: any; rows: number; users: number };
console.log(`VAL rows=${V.rows} users=${V.users}  TEST rows=${T.rows} users=${T.users}`);
for (const [name, r] of [["VAL", V], ["TEST", T]] as const) console.log(name, "macroF1 base", r.base.macroF1, "revised", r.rev.macroF1, "| acc base", r.base.accuracy, "revised", r.rev.accuracy);
console.log("\nTEST per class (P/R/F1) baseline vs revised");
for (const l of LABELS) {
  const b = T.base.perClass.find((m: any) => m.label === l), v = T.rev.perClass.find((m: any) => m.label === l);
  const f = (m: any) => `${m.precision?.toFixed(3) ?? "-"}/${m.recall?.toFixed(3) ?? "-"}/${m.f1?.toFixed(3) ?? "-"}`;
  console.log(l.padEnd(11), `n=${String(b.support).padEnd(6)}`, "base", f(b).padEnd(20), "rev", f(v));
}
console.log("\nTEST by source class: erase-eligible% / count3% / threePose%  (baseline -> revised)");
for (const c of Object.keys(T.base.bySource)) {
  const b = T.base.bySource[c], v = T.rev.bySource[c];
  console.log(c.padEnd(12), `n=${String(b.n).padEnd(5)}`, `${b.eraseEligiblePct} -> ${v.eraseEligiblePct}`.padEnd(16), `${b.count3Pct} -> ${v.count3Pct}`.padEnd(14), `${b.threePosePct} -> ${v.threePosePct}`);
}
console.log("\nThumb tau sweep on VAL (pose kept at shipped tau):");
for (const r of sv) console.log(JSON.stringify(r));
console.log("val-best", JSON.stringify(out.valBestTau));
const st = out.sweepTest as ReturnType<typeof sweep>;
console.log("TEST at shipped 1.3:", JSON.stringify(st.find((r) => r.tau === 1.3)), "\nTEST at val-best:", JSON.stringify(st.find((r) => r.tau === best.tau)));
