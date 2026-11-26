/**
 * Kontrak detektor tangan. Kamera r83 wajib lewat antarmuka ini supaya adapter
 * MoNUI-7 nanti cukup satu implementasi. Sekarang hanya kontrak tipe.
 */
export interface HandLandmark {
  /** Ternormalisasi 0..1 terhadap frame video (belum dicermin). */
  x: number;
  y: number;
  z: number;
}

export interface HandFrame {
  /** ms, monoton (waktu capture). */
  t: number;
  videoWidth: number;
  videoHeight: number;
  /** 21 landmark per tangan yang terlihat; kosong bila tidak ada tangan. */
  hands: readonly (readonly HandLandmark[])[];
}

export interface HandDetector {
  /** Mulai memuat/menjalankan model; resolve saat siap mendeteksi. */
  start(): Promise<void>;
  stop(): void;
  /** Frame landmark; satu loop yang sama untuk kamera dan HandSource. */
  subscribe(cb: (frame: HandFrame) => void): () => void;
}
