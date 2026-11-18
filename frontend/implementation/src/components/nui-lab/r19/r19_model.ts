/**
 * R19 Lightweight Exported Classifier Inference (pure TypeScript, browser-ready, zero deps).
 * Supports both linear Logistic Regression (`layers.length === 1`) and dense ReLU MLPs
 * with z-score standardization + temperature-calibrated softmax.
 */
import { R19_FEATURE_COUNT, R19_LABELS, type R19Label } from "./r19_features";

export interface R19ExportedModel {
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

export class R19Classifier {
  private readonly W: Float64Array[];
  private readonly b: Float64Array[];
  private readonly dims: number[];
  private readonly bufs: Float64Array[];
  private readonly z: Float64Array;
  private readonly temp: number;
  readonly labels: string[];

  constructor(readonly model: R19ExportedModel) {
    if (model.mean.length !== model.std.length) {
      throw new Error(`R19 std dim mismatch: ${model.mean.length} vs ${model.std.length}`);
    }
    if (model.feature_names.length > 0 && model.feature_names.length !== model.mean.length) {
      throw new Error(`R19 feature_names mismatch: ${model.feature_names.length} vs ${model.mean.length}`);
    }
    this.labels = model.labels.length > 0 ? [...model.labels] : [...R19_LABELS];
    this.dims = [model.mean.length, ...model.layers.map((l) => l.b.length)];
    this.W = model.layers.map((l) => Float64Array.from(l.W.flat()));
    this.b = model.layers.map((l) => Float64Array.from(l.b));
    this.bufs = this.dims.slice(1).map((d) => new Float64Array(d));
    this.z = new Float64Array(model.mean.length);
    this.temp = Number.isFinite(model.temperature) && model.temperature > 0 ? model.temperature : 1.0;
  }

  /** Expected input feature count (`R19_FEATURE_COUNT` for R19 models, `68` for G5 R18 transfer). */
  get inputDim(): number {
    return this.dims[0]!;
  }

  /** Temperature-calibrated class probabilities matching `model.labels`. */
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

  predict(x: ArrayLike<number>, unknownThreshold = 0): { label: R19Label | string; conf: number; probs: number[] } {
    const probs = this.proba(x);
    let best = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i]! > probs[best]!) best = i;
    }
    const conf = probs[best]!;
    return {
      label: conf >= unknownThreshold ? this.labels[best]! : "UNKNOWN",
      conf,
      probs,
    };
  }
}

export { R19_FEATURE_COUNT };
