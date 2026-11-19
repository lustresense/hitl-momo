/**
 * R20 Student Classifier Runtime (`r20_model.ts` — pure TypeScript/CPU, zero external runtime dependencies).
 *
 * Implements §12.4 student weight formats for side-by-side browser & CPU benchmark comparison:
 *  - `S0 FP32 JSON` (`R20Fp32JsonClassifier`, drop-in compatible with `R19ExportedModel` / `R19Classifier`)
 *  - `S0 FP32 Compact Binary` (`R20Fp32BinaryClassifier`, reads little-endian Float32Array buffer directly)
 *  - `S1 / S3 INT8 Per-Channel Quantized Weights` (`R20Int8Classifier`, Int8Array weights + Float32 scales)
 */
import { R19_FEATURE_COUNT, R19_LABELS, type R19Label } from "../../r19/candidates/r19_features";
import type { R19ExportedModel } from "../../r19/candidates/r19_model";

export type { R19ExportedModel as R20ExportedFp32Model };

export interface R20ExportedInt8Layer {
  W_q: number[][];
  scales: number[];
  b: number[];
}

export interface R20ExportedInt8Model {
  name: string;
  version: string;
  quantization: string;
  license_provenance: string;
  labels: string[];
  feature_names: string[];
  mean: number[];
  std: number[];
  temperature: number;
  layers: R20ExportedInt8Layer[];
  packed_binary_bytes?: number;
}

export interface R20Prediction {
  topLabel: R19Label;
  topProb: number;
  probs: number[];
}

/** S0 FP32 JSON Classifier (identical math to R19Classifier for zero-regression compatibility). */
export class R20Fp32JsonClassifier {
  private readonly W: Float64Array[];
  private readonly b: Float64Array[];
  private readonly dims: number[];
  private readonly bufs: Float64Array[];
  private readonly z: Float64Array;
  private readonly temp: number;
  readonly labels: string[];

  constructor(readonly model: R19ExportedModel) {
    if (model.mean.length !== model.std.length) {
      throw new Error(`R20 std dim mismatch: ${model.mean.length} vs ${model.std.length}`);
    }
    this.labels = model.labels.length > 0 ? [...model.labels] : [...R19_LABELS];
    this.dims = [model.mean.length, ...model.layers.map((l) => l.b.length)];
    this.W = model.layers.map((l) => Float64Array.from(l.W.flat()));
    this.b = model.layers.map((l) => Float64Array.from(l.b));
    this.bufs = this.dims.slice(1).map((d) => new Float64Array(d));
    this.z = new Float64Array(model.mean.length);
    this.temp = Number.isFinite(model.temperature) && model.temperature > 0 ? model.temperature : 1.0;
  }

  get inputDim(): number {
    return this.dims[0]!;
  }

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
    for (let j = 0; j < exps.length; j++) exps[j] = exps[j]! / sum;
    return exps;
  }

  predict(x: ArrayLike<number>): R20Prediction {
    const probs = this.proba(x);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[best]!) best = i;
    return {
      topLabel: (this.labels[best] ?? "OTHER") as R19Label,
      topProb: probs[best]!,
      probs,
    };
  }
}

/**
 * S0 FP32 Compact Binary Classifier (`r20_*.f32`).
 * Layout: `[mean(d), std(d), T(1), W_0(d*h1), b_0(h1), W_1(h1*h2), b_1(h2), ...]`.
 */
export class R20Fp32BinaryClassifier {
  private readonly mean: Float32Array;
  private readonly std: Float32Array;
  private readonly temp: number;
  private readonly W: Float32Array[];
  private readonly b: Float32Array[];
  private readonly dims: number[];
  private readonly bufs: Float32Array[];
  private readonly z: Float32Array;
  readonly labels: string[];

  constructor(buf: ArrayBuffer, dims: number[] = [R19_FEATURE_COUNT, 64, 32, 3], labels: readonly string[] = R19_LABELS) {
    const f32 = new Float32Array(buf);
    const d0 = dims[0]!;
    let off = 0;
    this.mean = f32.subarray(off, off + d0);
    off += d0;
    this.std = f32.subarray(off, off + d0);
    off += d0;
    this.temp = f32[off]! > 0 ? f32[off]! : 1.0;
    off += 1;
    this.dims = [...dims];
    this.labels = [...labels];
    this.W = [];
    this.b = [];
    this.bufs = [];
    for (let l = 0; l < dims.length - 1; l++) {
      const din = dims[l]!;
      const dout = dims[l + 1]!;
      this.W.push(f32.subarray(off, off + din * dout));
      off += din * dout;
      this.b.push(f32.subarray(off, off + dout));
      off += dout;
      this.bufs.push(new Float32Array(dout));
    }
    if (off !== f32.length) {
      throw new Error(`R20Fp32BinaryClassifier buffer length mismatch: expected ${off} floats, got ${f32.length}`);
    }
    this.z = new Float32Array(d0);
  }

  proba(x: ArrayLike<number>): number[] {
    const { dims, W, b, bufs, z, mean, std, temp } = this;
    for (let i = 0; i < dims[0]!; i++) {
      const s = std[i]!;
      z[i] = (x[i]! - mean[i]!) / (s > 1e-6 ? s : 1.0);
    }
    let prev: Float32Array = z;
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
    for (let j = 0; j < exps.length; j++) exps[j] = exps[j]! / sum;
    return exps;
  }
}

/**
 * S1 / S3 Per-Channel INT8 Weights + FP32 Scales Classifier.
 * Evaluates whether integer weight storage (`Int8Array`) with per-output-channel scale multiplication
 * matches FP32 accuracy and compares CPU inference latency (§12.4).
 */
export class R20Int8Classifier {
  private readonly Wq: Int8Array[];
  private readonly scales: Float64Array[];
  private readonly b: Float64Array[];
  private readonly dims: number[];
  private readonly bufs: Float64Array[];
  private readonly z: Float64Array;
  private readonly temp: number;
  readonly labels: string[];

  constructor(readonly model: R20ExportedInt8Model) {
    this.labels = model.labels.length > 0 ? [...model.labels] : [...R19_LABELS];
    this.dims = [model.mean.length, ...model.layers.map((l) => l.b.length)];
    this.Wq = model.layers.map((l) => Int8Array.from(l.W_q.flat()));
    this.scales = model.layers.map((l) => Float64Array.from(l.scales));
    this.b = model.layers.map((l) => Float64Array.from(l.b));
    this.bufs = this.dims.slice(1).map((d) => new Float64Array(d));
    this.z = new Float64Array(model.mean.length);
    this.temp = Number.isFinite(model.temperature) && model.temperature > 0 ? model.temperature : 1.0;
  }

  proba(x: ArrayLike<number>): number[] {
    const { dims, Wq, scales, b, bufs, z, model, temp } = this;
    for (let i = 0; i < dims[0]!; i++) {
      const s = model.std[i]!;
      z[i] = (x[i]! - model.mean[i]!) / (s > 1e-6 ? s : 1.0);
    }
    let prev: Float64Array = z;
    for (let l = 0; l < Wq.length; l++) {
      const out = bufs[l]!;
      const din = dims[l]!;
      const dout = dims[l + 1]!;
      const wq = Wq[l]!;
      const sc = scales[l]!;
      for (let j = 0; j < dout; j++) out[j] = 0;
      for (let i = 0; i < din; i++) {
        const v = prev[i]!;
        const row = i * dout;
        for (let j = 0; j < dout; j++) {
          out[j] = out[j]! + v * wq[row + j]!;
        }
      }
      for (let j = 0; j < dout; j++) {
        let val = out[j]! * sc[j]! + b[l]![j]!;
        if (l < Wq.length - 1 && val < 0) val = 0;
        out[j] = val;
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
    for (let j = 0; j < exps.length; j++) exps[j] = exps[j]! / sum;
    return exps;
  }

  predict(x: ArrayLike<number>): R20Prediction {
    const probs = this.proba(x);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[best]!) best = i;
    return {
      topLabel: (this.labels[best] ?? "OTHER") as R19Label,
      topProb: probs[best]!,
      probs,
    };
  }
}
