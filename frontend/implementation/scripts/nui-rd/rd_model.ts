/**
 * Research-only JS inference for the RD-04 pilot models (exported by rd_train.py). NOT imported by src/, not shipped.
 * Plain dense layers + ReLU + softmax, so the same few lines would run in a browser if the Owner ever approves it.
 */
import { LABELS, type Label } from "./rd_lib";

export interface PilotModel {
  name: string;
  labels: string[];
  feature_names: string[];
  mean: number[];
  std: number[];
  layers: Array<{ W: number[][]; b: number[] }>;
}

export class Pilot {
  private readonly W: Float64Array[];
  private readonly b: Float64Array[];
  private readonly dims: number[];
  private readonly bufs: Float64Array[];
  private readonly z: Float64Array;
  constructor(readonly model: PilotModel) {
    if (model.labels.join() !== LABELS.join()) throw new Error("label order mismatch");
    this.dims = [model.mean.length, ...model.layers.map((l) => l.b.length)];
    this.W = model.layers.map((l) => Float64Array.from(l.W.flat()));
    this.b = model.layers.map((l) => Float64Array.from(l.b));
    this.bufs = this.dims.slice(1).map((d) => new Float64Array(d));
    this.z = new Float64Array(model.mean.length);
  }
  /** Probabilities (a fresh array). */
  proba(x: ArrayLike<number>): number[] {
    const { dims, W, b, bufs, z, model } = this;
    for (let i = 0; i < dims[0]!; i++) z[i] = (x[i]! - model.mean[i]!) / model.std[i]!;
    let prev: Float64Array = z;
    for (let l = 0; l < W.length; l++) {
      const out = bufs[l]!;
      const din = dims[l]!;
      const dout = dims[l + 1]!;
      const w = W[l]!;
      for (let j = 0; j < dout; j++) out[j] = b[l]![j]!;
      for (let i = 0; i < din; i++) {
        const v = prev[i]!;
        const row = i * dout;
        for (let j = 0; j < dout; j++) out[j] = out[j]! + v * w[row + j]!;
      }
      if (l < W.length - 1) for (let j = 0; j < dout; j++) if (out[j]! < 0) out[j] = 0;
      prev = out;
    }
    let mx = -Infinity;
    for (const v of prev) if (v > mx) mx = v;
    const e = Array.from(prev, (v) => Math.exp(v - mx));
    const s = e.reduce((a, c) => a + c, 0);
    return e.map((v) => v / s);
  }
  predict(x: ArrayLike<number>): Label {
    const p = this.proba(x);
    let k = 0;
    for (let i = 1; i < p.length; i++) if (p[i]! > p[k]!) k = i;
    return LABELS[k]!;
  }
}
