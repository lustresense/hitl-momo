/**
 * R18-UX3 Exported Candidate Classifier Inference (pure TypeScript, browser-ready, no deps).
 * Loads dense ReLU MLP exported by ux3_train.py, applies z-score standardization + temperature-calibrated softmax.
 */
import { UX3_FEATURE_COUNT, UX3_LABELS, type Ux3Label } from "./ux3_features";

export interface Ux3ExportedModel {
  name: string;
  version: string;
  license_provenance: string;
  labels: string[];
  feature_names: string[];
  mean: number[];
  std: number[];
  temperature: number;
  layers: Array<{ W: number[][]; b: number[] }>;
}

export class Ux3Classifier {
  private readonly W: Float64Array[];
  private readonly b: Float64Array[];
  private readonly dims: number[];
  private readonly bufs: Float64Array[];
  private readonly z: Float64Array;
  private readonly temp: number;

  constructor(readonly model: Ux3ExportedModel) {
    if (model.labels.join() !== UX3_LABELS.join()) {
      throw new Error(`UX3 label mismatch: got ${model.labels.join()}`);
    }
    if (model.mean.length !== UX3_FEATURE_COUNT || model.std.length !== UX3_FEATURE_COUNT) {
      throw new Error(`UX3 feature dim mismatch: expected ${UX3_FEATURE_COUNT}, got ${model.mean.length}`);
    }
    this.dims = [model.mean.length, ...model.layers.map((l) => l.b.length)];
    this.W = model.layers.map((l) => Float64Array.from(l.W.flat()));
    this.b = model.layers.map((l) => Float64Array.from(l.b));
    this.bufs = this.dims.slice(1).map((d) => new Float64Array(d));
    this.z = new Float64Array(model.mean.length);
    this.temp = Number.isFinite(model.temperature) && model.temperature > 0 ? model.temperature : 1.0;
  }

  /** Temperature-calibrated class probabilities matching UX3_LABELS order. */
  proba(x: ArrayLike<number>): number[] {
    const { dims, W, b, bufs, z, model, temp } = this;
    for (let i = 0; i < dims[0]!; i++) {
      const s = model.std[i]!;
      z[i] = (x[i]! - model.mean[i]!) / (s > 1e-6 ? s : 1.0);
    }
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
      if (l < W.length - 1) {
        for (let j = 0; j < dout; j++) if (out[j]! < 0) out[j] = 0;
      }
      prev = out;
    }
    let mx = -Infinity;
    for (let j = 0; j < prev.length; j++) {
      const logit = prev[j]! / temp;
      if (logit > mx) mx = logit;
    }
    const exps = new Array<number>(prev.length);
    let sum = 0;
    for (let j = 0; j < prev.length; j++) {
      const e = Math.exp(prev[j]! / temp - mx);
      exps[j] = e;
      sum += e;
    }
    for (let j = 0; j < prev.length; j++) exps[j] = exps[j]! / sum;
    return exps;
  }

  predict(x: ArrayLike<number>, unknownThreshold = 0): { label: Ux3Label | "UNKNOWN"; conf: number; probs: number[] } {
    const probs = this.proba(x);
    let best = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i]! > probs[best]!) best = i;
    }
    const conf = probs[best]!;
    return {
      label: conf >= unknownThreshold ? UX3_LABELS[best]! : "UNKNOWN",
      conf,
      probs,
    };
  }
}
