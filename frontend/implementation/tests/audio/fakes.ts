/** Minimal Web Audio fakes: enough surface for the audio engine, with hooks to inspect what was scheduled. */

export class FakeParam {
  value: number;
  calls: Array<{ op: string; v?: number; t?: number }> = [];
  constructor(v = 1) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push({ op: "set", v, t });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push({ op: "ramp", v, t });
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push({ op: "target", v, t });
    return this;
  }
  setValueCurveAtTime(curve: Float32Array, t: number): this {
    this.value = curve[curve.length - 1] ?? this.value;
    this.calls.push({ op: "curve", t });
    return this;
  }
  cancelScheduledValues(): this {
    this.calls.push({ op: "cancel" });
    return this;
  }
}

export class FakeNode {
  out: FakeNode[] = [];
  connect(n: FakeNode): FakeNode {
    this.out.push(n);
    return n;
  }
  disconnect(): void {
    this.out = [];
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}

export class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

export class FakePanner extends FakeNode {
  pan = new FakeParam(0);
}

export class FakeBuffer {
  constructor(
    public duration: number,
    public numberOfChannels = 2,
    public sampleRate = 48000,
  ) {}
  get length(): number {
    return Math.round(this.duration * this.sampleRate);
  }
}

export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeParam(1);
  detune = new FakeParam(0);
  startedAt: number | null = null;
  startOffset = 0;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  ended = false;
  start(t = 0, offset = 0): void {
    this.startedAt = t;
    this.startOffset = offset;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
  }
  /** test helper: simulate the node finishing */
  finish(): void {
    this.ended = true;
    this.onended?.();
  }
}

export class FakeContext {
  currentTime = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  sampleRate = 48000;
  baseLatency = 0.01;
  outputLatency = 0.02;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  private listeners: Array<() => void> = [];
  resumeBlocked = false;
  decodeDurations: Record<string, number> = {};
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor();
  }
  createStereoPanner(): FakePanner {
    return new FakePanner();
  }
  createMediaStreamDestination(): FakeNode & { stream: object } {
    return Object.assign(new FakeNode(), { stream: {} });
  }
  /** the raw buffer is a 4-byte float32 holding the duration (see fakeFetch) */
  decodeAudioData(raw: ArrayBuffer): Promise<FakeBuffer> {
    const d = new Float32Array(raw)[0] ?? 1;
    if (d < 0) return Promise.reject(new Error("EncodingError"));
    return Promise.resolve(new FakeBuffer(d));
  }
  resume(): Promise<void> {
    if (!this.resumeBlocked) {
      this.state = "running";
      this.fire();
    }
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    this.fire();
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
  addEventListener(type: string, l: () => void): void {
    if (type === "statechange") this.listeners.push(l);
  }
  private fire(): void {
    for (const l of this.listeners) l();
  }
  /** playing = started, not yet stopped/finished */
  active(): FakeSource[] {
    return this.sources.filter((s) => s.startedAt !== null && !s.ended);
  }
}

/** url -> duration in seconds; negative = decode error; missing key = HTTP 404. */
export function fakeFetch(map: Record<string, number>, log: string[] = []): (url: string) => Promise<ArrayBuffer> {
  return (url) => {
    log.push(url);
    const d = map[url];
    if (d === undefined) return Promise.reject(new Error("HTTP 404"));
    return Promise.resolve(new Float32Array([d]).buffer);
  };
}

export const flush = async (n = 6): Promise<void> => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};
