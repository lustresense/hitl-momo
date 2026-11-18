# ONNX Hand Research — kandidat model 21 keypoint jari untuk Sketchbook Universe NUI

**Tanggal riset:** 11 November 2026
**Status:** riset saja, tanpa perubahan kode, tanpa unduhan model ke repo. Ukuran file di bawah berasal dari header HTTP (`Content-Length`), bukan dari unduhan penuh.
**Acuan:** `PANDUAN-NUI-2026-11-10.md` bagian 1, 6, 7. Penanda `UNVERIFIED` berarti belum bisa dibuktikan dari sumber primer.

---

## 1. Inventaris aset yang sudah ada di repo (PANDUAN 7.1)

| Aset | Lokasi | Ukuran | Catatan |
|---|---|---|---|
| `hand_landmarker.task` (MediaPipe) | `frontend/implementation/public/models/hand_landmarker.task` | 7.819.105 byte | SHA-256 awal `fbc2a300…`, identik dengan salinan di `docs/history/dias/...`. Ukuran sama dengan `Content-Length` URL resmi Google (lihat 3.1). |
| Model ONNX | tidak ada | — | Tidak ada `.onnx`, `.tflite` atau `rtmpose` di repo. |
| Dependensi `onnxruntime-web` | tidak ada | — | `frontend/implementation/package.json` hanya memuat `@mediapipe/tasks-vision ^0.10.14`. |

## 2. Kandidat dan verifikasi

### 2.1 MediaPipe Hand Landmarker (baseline, sudah dipakai)
- **Output:** 21 landmark, urutan terdokumentasi: 0 WRIST, 1–4 THUMB (CMC, MCP, IP, TIP), 5–8 INDEX, 9–12 MIDDLE, 13–16 RING, 17–20 PINKY. Sumber: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- **Default:** `numHands` 1; `minHandDetectionConfidence`, `minHandPresenceConfidence`, `minTrackingConfidence` masing-masing 0.5 (sumber yang sama).
- **Ukuran:** `hand_landmarker.task` 7.819.105 byte (HEAD ke https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task). Halaman Google tidak mencantumkan ukuran.
- **Lisensi:** kode `google-ai-edge/mediapipe` Apache-2.0 (https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE). Lisensi khusus model hanya dikonfirmasi lewat mirror pihak ketiga (https://huggingface.co/unity/sentis-hand-landmark), jadi **sebagian UNVERIFIED** untuk model. Halaman resmi tidak menyatakan lisensi model.
- **Paket npm:** `@mediapipe/tasks-vision` berlisensi Apache-2.0; ukuran unpacked 31,4 MB (registry npm, dicek 11 Nov 2026).
- **Hand-specific:** ya. Dipakai langsung di game.

### 2.2 RTMPose-m hand (MMPose, COCO-WholeBody hand, 256×256)
- **Output:** 21 keypoint, urutan COCO-WholeBody: 0 wrist, 1–4 thumb1–4, 5–8 forefinger1–4, 9–12 middle_finger1–4, 13–16 ring_finger1–4, 17–20 pinky_finger1–4. Secara indeks sejajar dengan MediaPipe, tetapi definisi anatomi tiap titik (mis. thumb1 = CMC atau MCP) **UNVERIFIED**; perlu uji visual. Sumber: https://raw.githubusercontent.com/open-mmlab/mmpose/main/configs/_base_/datasets/coco_wholebody_hand.py
- **Format output:** SimCC (`simcc_x`, `simcc_y`), decode argmax dibagi split ratio 2.0. Preprocessing (mean/std, BGR→RGB) ada di contoh ORT pihak ketiga; **konfigurasi resmi belum dibaca → UNVERIFIED**. Sumber: https://huggingface.co/tasmulaev/rtmpose-m-distill
- **Model config:** `rtmpose-m_8xb32-210e_coco-wholebody-hand-256x256.py`, checkpoint Hand5. Akurasi: PCK@0.2 81,5 (COCO-WholeBody-Hand), 96,4 (Hand5); halaman tidak memuat AP. Sumber: https://github.com/open-mmlab/mmpose/blob/main/projects/rtmpose/README.md (status "alpha version").
- **Ukuran ONNX:** zip ONNX `rtmpose-m_simcc-hand5…zip` = **51.270.352 byte** (HEAD ke `download.openmmlab.com/.../onnx_sdk/`). Ukuran isi zip tidak diverifikasi.
- **Perlu detector tangan?** Ya. Model top-down: butuh crop tangan. Detector resmi: RTMDet-nano hand 320×320, zip ONNX **3.840.129 byte**, AP 76,0 pada OneHand10K (sumber yang sama dengan MMPose README di atas).
- **Biaya browser:** dua inference per frame (detector + pose) → **UNVERIFIED** angka FPS/GPU. Pengukuran belum dilakukan.
- **Lisensi:**
  - Kode MMPose: Apache-2.0 menurut mirror (https://github.com/Billccx/mmpose), README resmi tidak memuat lisensi yang bisa diambil → **UNVERIFIED** dari sumber resmi.
  - rtmlib: Apache-2.0, tanpa dependensi mmcv/mmpose; backend `onnxruntime` ada (https://github.com/Tau-J/rtmlib). Peringatan di sana: bobot yang dilatih dengan dataset non-komersial berada di isu terpisah.
  - **Bobot dan data latih:** COCO-WholeBody hanya untuk riset dan non-komersial (https://www.github.com/jin-s13/COCO-WholeBody ; anotasi CC BY 4.0 dengan syarat kontak untuk komersial). InterHand2.6M CC-BY-NC 4.0 (mirror: https://awesome.ecosyste.ms/projects/github.com%2Ffacebookresearch%2Finterhand2.6m). Daftar dataset Hand5 **NOT FOUND**; lisensi bobot tidak bisa dipastikan.

### 2.3 Turunan pihak ketiga: `tasmulaev/rtmpose-m-distill`
- Self-distillation dari checkpoint Hand5, 21 keypoint, SimCC, 256×256, drop-in replacement. Lisensi di kartu: apache-2.0 (https://huggingface.co/tasmulaev/rtmpose-m-distill).
- Lisensi turunan tidak menghapus syarat data Hand5 → **risiko sama dengan 2.2**.
- Ukuran ONNX **UNVERIFIED** (hanya `.pth` 55 MB disebut). Klaim "blur-robust" berasal dari kartu model dan belum diuji.

### 2.4 OpenCV Zoo `handpose_estimation_mediapipe` (ONNX, konversi MediaPipe)
- 21 keypoint per tangan; file `handpose_estimation_mediapipe_2023feb_int8bq.onnx` (int8 block-quantized). Lisensi Apache-2.0 (https://huggingface.co/opencv/handpose_estimation_mediapipe/blob/main/README.md).
- Pemetaan indeks dan shape input/output **tidak tercantum** di halaman → **UNVERIFIED**. Peringatan di halaman: versi int8 dapat menghasilkan hasil tidak valid akibat penurunan akurasi.
- Ini **bukan model independen**: ini model MediaPipe yang diekspor ulang. Gunanya sebagai fallback ONNX dengan semantik yang sama, bukan sebagai pembanding kedua.

### 2.5 OpenPose hand (CMU)
- 21 keypoint per tangan, tetapi lisensi **non-komersial** dengan lisensi komersial terpisah (sumber mirror, https://github.com/cyummy/openpose). Lisensi resmi belum dibaca → UNVERIFIED. **Tidak direkomendasikan** untuk pameran komersial atau ambigu.

## 3. Ringkasan perbandingan

| Kandidat | Keypoint | Ukuran | Detector | Lisensi | Browser |
|---|---|---|---|---|---|
| MediaPipe `.task` | 21, terdokumentasi | 7,8 MB | sudah termasuk | Apache-2.0 (model: sebagian UNVERIFIED) | sudah dipakai |
| RTMPose-m hand5 ONNX | 21, COCO-WB | 51,3 MB zip + RTMDet 3,8 MB zip | perlu RTMDet | kode Apache; data non-komersial | dua inference, UNVERIFIED |
| tasmulaev distill | 21, SimCC | UNVERIFIED | perlu detector | apache-2.0 di kartu; data turunan | UNVERIFIED |
| OpenCV MediaPipe ONNX | 21, mapping UNVERIFIED | UNVERIFIED | sudah termasuk | Apache-2.0 | UNVERIFIED |
| OpenPose hand | 21 | UNVERIFIED | — | non-komersial | tidak dipertimbangkan |

**Runtime:** `onnxruntime-web` 1.31.1 (npm) unpacked 150,6 MB (semua build; ukuran wasm yang dimuat tidak diverifikasi). Backend: wasm (CPU, semua operator), webgl/webgpu/webnn (sebagian operator). Sumber: https://onnxruntime.ai/docs/tutorials/web/ . Keterangan secure context WebGPU **tidak ada di halaman itu → UNVERIFIED**.

## 4. Arti "kombinasi" (PANDUAN 7.6)

Secara teknis, "kombinasi" yang layak adalah **satu jalur utama plus opsi tambahan, bukan tiga model paralel**:
1. **Baseline:** MediaPipe Hand Landmarker (21 landmark, sudah ada).
2. **Filter:** One Euro pada koordinat tampilan/kuas, dengan dt dari timestamp frame (bukan model AI).
3. **Contrast opsional:** CLAHE pada luminance sebelum deteksi, hanya saat gelap (bukan model AI).
4. **ONNX opsional:** hanya sebagai fallback atau ablation saat MediaPipe gagal, dan hanya jika model hand-specific terbukti kompatibel dan ringan.

Ketiganya tidak harus berjalan bersamaan. Pada satu frame, inference berat hanya satu.

## 5. Rekomendasi untuk pameran

1. **Pertahankan MediaPipe sebagai jalur utama.** Ia sudah ada di repo, berukuran 7,8 MB, 21 landmark terdokumentasi, dan tidak menambah runtime.
2. **Jangan memasukkan RTMPose ke build pameran.** Alasan: dua model per frame, ukuran sekitar 55 MB, `onnxruntime-web` menambah beban, dan lisensi data (COCO-WholeBody, InterHand2.6M) bersifat non-komersial. Pertanyaan lisensi ini harus dibawa ke Owner/legal sebelum dipakai di luar riset.
3. **Jika fallback ONNX tetap ingin dicoba**, lakukan ablation offline terlebih dahulu, dengan model yang lisensinya paling jelas. Calon: OpenCV MediaPipe ONNX (Apache-2.0), dengan catatan bahwa ia bukan pembanding independen.
4. **Risiko yang harus disampaikan jujur:** tidak ada pengujian kamera di sandbox; benefit CLAHE dan One Euro belum terbukti; FPS browser untuk RTMPose belum diukur; ukuran wasm `onnxruntime-web` belum diukur; pemetaan indeks RTMPose dan OpenCV belum divalidasi secara visual.

## 6. Sumber

- MediaPipe Hand Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- MediaPipe LICENSE: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- MMPose RTMPose README: https://github.com/open-mmlab/mmpose/blob/main/projects/rtmpose/README.md
- MMPose COCO-WholeBody hand meta: https://raw.githubusercontent.com/open-mmlab/mmpose/main/configs/_base_/datasets/coco_wholebody_hand.py
- rtmlib: https://github.com/Tau-J/rtmlib
- tasmulaev/rtmpose-m-distill: https://huggingface.co/tasmulaev/rtmpose-m-distill
- OpenCV Zoo MediaPipe handpose: https://huggingface.co/opencv/handpose_estimation_mediapipe/blob/main/README.md
- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/
- COCO-WholeBody: https://www.github.com/jin-s13/COCO-WholeBody (lisensi dikutip dari hasil pencarian; halaman tidak dibuka langsung, UNVERIFIED)
- InterHand2.6M lisensi (mirror): https://awesome.ecosyste.ms/projects/github.com%2Ffacebookresearch%2Finterhand2.6m
- Unity mirror model MediaPipe: https://huggingface.co/unity/sentis-hand-landmark
- npm registry: `onnxruntime-web` 1.31.1, `@mediapipe/tasks-vision` (dicek 11 Nov 2026)
