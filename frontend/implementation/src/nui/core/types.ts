/** Tipe bersama lapisan NUI r8.3 (PLAN §5.3.1). Tanpa DOM. */
export type SourceKind = "hand" | "mouse" | "touch" | "keyboard" | "test";

export interface Point {
  x: number;
  y: number;
}

export interface InputSample {
  /** ms, monoton (performance.now() atau capture time). */
  t: number;
  /** px viewport, sudah difilter; titik yang sama untuk gambar dan hit-test. */
  x: number;
  y: number;
  /** Tangan terlihat / pointer di dalam jendela. */
  inFrame: boolean;
  /** Cubit terkonfirmasi (hysteresis + debounce). */
  pinch: boolean;
  /** 0..1, hanya untuk umpan balik visual. */
  pinchStrength: number;
  /** Ujung telunjuk terfilter untuk tinta (hanya hand). */
  nib?: Point;
  /** Titik rollback saat PINCH_ON (hand); sama dengan x,y untuk mouse. */
  clickPoint?: Point;
  /** ID target yang paling sering disorot sebelum PINCH_ON (hand, Mode B; R1 400 ms). */
  preferredHoverId?: string;
  source: SourceKind;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** "any" = aturan A/B, "point" = aturan D (cubit harus mulai di target). */
export type TargetMode = "any" | "point";

/** Jenis aturan yang sedang berlaku untuk sebuah target. */
export type RuleKind = "A" | "B" | "D";

export interface TargetState {
  /** Isi ring 0..1. */
  p: number;
  lit: boolean;
  holding: boolean;
  kind: RuleKind;
  done: boolean;
  /** Waktu (clock engine) saat target menembak; 0 bila belum. */
  firedAt: number;
}

export interface TargetOptions {
  /** ID stabil target (opsional; dibuat otomatis bila kosong). */
  id?: string;
  getRect: () => Rect | null;
  /** Durasi isi ring langsung (dipakai apa adanya). */
  holdMs?: number;
  /** Label; bila holdMs kosong durasi diturunkan lewat holdDuration(). */
  label?: string;
  mode?: TargetMode;
  onFire?: () => void;
  /** Hit-test mode point; default: titik di dalam rect. */
  contains?: (x: number, y: number) => boolean;
}

export interface TargetHandle {
  readonly id: string;
  readonly state: TargetState;
  remove(): void;
  reset(): void;
}

export interface PointerState extends Point {
  down: boolean;
  in: boolean;
  key: boolean;
  moved: boolean;
}
