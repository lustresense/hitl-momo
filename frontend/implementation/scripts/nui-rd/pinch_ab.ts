/**
 * R17-05 A/B on synthetic gap sweeps (evidence class UNIT_ONLY): baseline pinch gate vs the lab gate, same frames.
 * Run: ./node_modules/.bin/vite-node scripts/nui-rd/pinch_ab.ts
 * Hands are the real class-median `one` skeleton with the thumb tip placed at a chosen gap (see realistic-hands.ts),
 * placed in a 16:9 MediaPipe-style frame. Metrics:
 *  - holdInk: ink frames while the thumb hovers at a fixed, NON-touching gap (false start).
 *  - inkAtGap: the true thumb-index gap (spans) when the first ink point appears on an intentional closing pinch.
 *  - lagFrames: frames from contact (gap 0.05) to ink.
 *  - tailGap / tailPoints: gap and number of extra ink points after the user starts opening the fingers.
 */
import { closing, hold, releasing } from "../../tests/input/pinch-sweep";

const row = (...c: (string | number | null)[]) => c.map((x) => String(x ?? "-").padEnd(14)).join("");
console.log("A. HOLD at a fixed non-touching gap (ink points in 2 s; 0 = no false start)");
console.log(row("true gap", "baseline", "lab"));
for (const g of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]) console.log(row(g, hold("baseline", g), hold("lab", g)));
console.log("\nB. INTENTIONAL CLOSE (gap 1.0 -> 0.05): true gap at first ink, and frames from contact to ink");
console.log(row("closing sp/s", "base gap", "lab gap", "base lag", "lab lag"));
for (const v of [0.7, 1.5, 3, 6]) {
  const b = closing("baseline", v);
  const l = closing("lab", v);
  console.log(row(v, b.inkAtGap?.toFixed(2) ?? "-", l.inkAtGap?.toFixed(2) ?? "-", b.lagFrames, l.lagFrames));
}
console.log("\nC. RELEASE (gap 0.05 -> open): extra ink points once the gap is already > 0.5 span");
console.log(row("opening sp/s", "base tail", "lab tail", "base lastGap", "lab lastGap"));
for (const v of [0.7, 1.5, 3, 6]) {
  const b = releasing("baseline", v);
  const l = releasing("lab", v);
  console.log(row(v, b.tailPoints, l.tailPoints, b.lastInkGap?.toFixed(2) ?? "-", l.lastInkGap?.toFixed(2) ?? "-"));
}
