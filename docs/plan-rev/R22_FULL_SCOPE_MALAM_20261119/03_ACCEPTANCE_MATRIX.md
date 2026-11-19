# R22 FULL SCOPE | Acceptance matrix, bukti wajib dan status

Ini daftar lengkap, **bukan jadwal bertahap**. AGY tidak boleh menghapus baris karena tenggat. `PASS` hanya dengan bukti baru. `NOT_TESTED` dan `FAIL` tetap dilaporkan, bukan disembunyikan.

| ID | Area | Kriteria wajib | Bukti minimal |
|---|---|---|---|
| U01 | Landing | `/nui-lab` berisi hanya dua CTA utama Gesture dan Canvas, tak ada menu engineering | screenshot dan DOM/route test |
| U02 | Layout desktop | Kamera kiri tetap saat konten kanan scroll mandiri | screenshot sebelum/sesudah scroll, browser smoke |
| U03 | Layout kamera | Tidak ada preview duplikat/blank besar, aspect correct, full hand visible | screenshot/aspect/responsive tests |
| U04 | Canvas kanan | Canvas dapat menggambar di viewport, terukur tanpa geser kamera | physical/video smoke + test |
| U05 | Sinkronisasi | Overlay camera/landmark/pred/action bertimestamp dan frame ID yang cocok | delayed-worker test dan stale UI |
| U06 | Simpel | Tak ada selector C4/C7, preprocess/light, detector, GT, scenario, benchmark start | UI snapshot test |
| U07 | CPU | Default hanya CPU Web Worker, model sebenarnya tercatat | startup trace + delegate telemetry |
| U08 | Mobile | Kamera/canvas tidak terpotong/overflow pada viewport kecil | responsivity screenshots |
| U09 | Aksesibilitas | Fokus, status, feedback kontras, tombol export usable | keyboard/ARIA/test |
| U10 | Error UX | Permission denied, camera closed, worker loading/errors punya feedback manusiawi | fault injection |
| W01 | MediaPipe | HandLandmarker tetap core, mode VIDEO, worker tanpa GPU | source + runtime worker trace |
| W02 | Frame unik | callback hasil worker tidak menginferensi frame identik tanpa alasan | unique frame instrumentation |
| W03 | FPS | capture unique FPS, detectHz, UI FPS dan dropped frames dipisahkan | JSON schema + measured trace |
| W04 | Tracking | no ongoing `setOptions` thrashing; per-session counters benar | worker logs + A/B fixed1/fixed2 |
| W05 | Safety bystander | hand kedua tidak mencuri owner aktif; ambiguous state hold | two-hand regression + real smoke |
| W06 | Auto reacquire | tidak perlu tombol relock; tangan baru stabil dapat reacquire dengan aman | owner state replay |
| W07 | No hand | loss/sensor error tidak membuat phantom gestures/stroke | fault test |
| W08 | Timestamp | frame age dan stale labelling bekerja | lag/backpressure simulator |
| C01 | Canonical pinch | satu sumber start/continue/end dengan hysteresis rapat | pinching, near-pinch negative tests |
| C02 | Action resolver | hanya satu eksekutor StrokeStore, rejected intent tidak mutate | unit/integration state diff |
| C03 | No pistol canvas | `POINT_READY/PRESS` tidak menutup stroke di Canvas | T004 replay regression |
| C04 | Re-arm | short blink tidak memaksa user lepas pinch yang sama | 62/99/220 ms replay |
| C05 | Long loss | lost panjang tidak tersambung sebagai ghost stroke | 603/12657 ms replay |
| C06 | Stroke continuity | stroke 9/10/11 continuity berdasar owner dan posisi | deterministic test + SVG/path diff |
| C07 | Draw semantics | hanya pinch rapat yang memulai tinta, near pinch tidak | test negative+positive |
| C08 | Erase | hanya 5 jari, bukan fist; size stable | pose fixture + actual stroke store |
| C09 | Fist neutral | fist sendiri tidak draw/erase/undo/redo | negative gesture replay |
| C10 | Undo | fist→1 jari sekali per arming; stack benar | FSM/stack test |
| C11 | Redo | fist→2 jari sekali per arming; stack benar | FSM/stack test |
| C12 | No swipe | swipe tidak jadi default Undo/Redo | route screenshot + events |
| C13 | Collision | guest hand/pistol/pinch saat command ditahan aman | ambiguity/fail closed tests |
| C14 | Smoothness | ink jitter & path lag dilaporkan, tidak smooth palsu | before-after measurements |
| C15 | Cursor vs ink | smoothing terpisah; stale frame tidak mutate | latency/behavior tests |
| C16 | Secondary hand | Existing eraser resizing/control audited; secondary hand does not draw or hijack primary | role-specific gesture tests |
| C17 | Accessible controls | Undo/Redo gesture no swipe, accessible button controls may remain | keyboard and UI test |
| B01 | Auto consent/session | consent satu kali; camera-on mulai trial otomatis | browser integration |
| B02 | Route transitions | gesture→canvas→gesture tersimpan sebagai trial independen | exported JSON with 3 trials |
| B03 | Visibility | hidden/pagehide/track ended diberi endReason dan aman | simulated lifecycle tests |
| B04 | Persistence | reload/crash tidak menghilangkan session atau double count | IndexedDB tests |
| B05 | Auto labels | prediction, state, action, reasons, quality berlabel sumber | sample JSON schema |
| B06 | No manual GT | tak perlu manual GT/scene label, tidak ada confusion matrix dari pred sendiri | UI + source assertion |
| B07 | Per-frame data | frame IDs, timestamp, luma percentiles, preprocess, hand, p95 stages, gaps | schema test+sample export |
| B08 | Canvas events | DRAW/ERASE/UNDO/REDO/stroke events dan gaps valid | test+4-trial replay |
| B09 | Missing/unknown | no-hand dipisah hidden/true unknown/active window | summary test |
| B10 | Export | satu JSON + optional CSV valid dan tidak corrupt setelah route change | parse/load/export test |
| B11 | Privacy | tidak otomatis menyimpan wajah/video/biometrik identitas, consent jelas | audit export payload |
| B12 | Drops | record drops per kind terukur, tidak diam-diam | pressure simulation |
| P01 | Existing A4 | inventory EMA/median/CLAHE/Reinhard/downscale; tidak remake | source links |
| P02 | A/B preprocessing | RAW/A4/candidate same input, effect/latency measured | ablation report |
| P03 | Lowlight | physical lowlight + dataset lighting evidence, tidak GT palsu | conditions + metrics |
| P04 | Glare | nearWhite/luma percentiles + soft-knee/exposure safe | ablation + clipping warnings |
| P05 | Motion blur | blur proxy, fast gesture fail-safe, real/synthetic separate | stress matrix |
| P06 | Noise | denoise no-ghosting, per-skin/background review | ROI comparison |
| P07 | 1-Euro | candidate tested vs baseline jitter and onset lag | tuning + latency curves |
| P08 | Frame dup | actual decoded/capture unique IDs, not inferred 40% | trace IDs |
| P09 | ROI | mask/crop A/B, full-frame coords, safety bystander | replay + capture transforms |
| P10 | Camera capability | UVC exposure probe optional and safe fallback | support matrix |
| D01 | Source registry | R17–R20 all source data/manifest audited | registry + hashes |
| D02 | Legal | HOLD_LICENSE/BLOCKED/NC not in product weights | license audit and model lineage |
| D03 | Leakage | user/video/duplicate split, augmentations train-only | overlap test |
| D04 | Feature compatibility | 68D vs 82D properly re-encoded or segregated | schema/unit tests |
| D05 | Pistol training | R22 candidate trained/evaluated vs C4/C7 heldout | model SHA + logs+class scores |
| D06 | Pose training | FIST/ONE/TWO/FIVE candidate trained with validated mapping or evidenced data gap | run manifest+GT lineage |
| D07 | Pinch training | valid contact/near-contact candidate trained or evidenced label gap | test+mapping |
| D08 | Temporal | real-sequence causal training + valid window/dt, no repeated static | run manifest + inference demo |
| D09 | Augmentation | blur, noise, glare, lowlight, compression, rotations, dropout | config seed + ablation |
| D10 | Dataset baru | legal source research for worst-case camera + eligibility | provenance report |
| D11 | Calibration | confidence calibration + negative false-trigger test | heldout metrics |
| D12 | Runtime model | model export works pure TS CPU; performance and bytes measured | browser CPU profile |
| D13 | Model comparison | R17/R18/R19/R20 and R22 benchmark without data leakage | comparable report |
| D14 | No self-GT | Owner JSON unlabeled properly handled | code/test labelSource |
| O01 | Custom detector data | legal hand bbox sources + train/val/test split, owner data not fake bbox | dataset artifact+license |
| O02 | Model Maker/TFLite | proof custom ObjectDetector loaded with metadata | worker smoke test |
| O03 | Crop/ROI | custom detector ROI correctly transforms hand landmarks | coordinate tests |
| O04 | CPU/heap/wire | second task runtime/memory/network measured, not assumed 0 | CDP/heap trace |
| O05 | Conditional default | alternate detector only activated if measured improvements | A/B decision evidence |
| T01 | Unit NUI | existing NUI suite plus new regressions passed/failed explicitly | test stdout+exit |
| T02 | E2E | camera route, consent, export, staleness, crash, navigation | traces/screenshots |
| T03 | No ghost actions | no phantom strokes, stuck key, repeated undo in targeted replay | deterministic logs |
| T04 | Memory stability | resource cleanup no leaked worker/stream/timers/IndexedDB queue | long-run profiler |
| T05 | CPU/frame | UI/unique camera/detectHz/p95 measured on cheap CPU profile | perf report |
| T06 | Network | cold transfer by journey below target <25MB or FAIL | CDP byte trace, cache cold |
| T07 | Physical QA | owner/device N1..N6 measured where access available, otherwise NOT_TESTED | video/JSON & conditions |
| T08 | Legacy gate | R19-origin full suite FAIL status distinct from R22 regression | baseline comparison reference |
| T09 | Repo isolation | only authorized scope, gameplay main unchanged | git diff + status + sha |
| T10 | Handoff | deploy dev approval, pinned commit, four routes smoke and rollback | Ujang report |

## Aturan evaluasi

- `PASS` = test aktual pada commit kandidat dengan alat/waktu/output yang terdokumentasi.
- `FAIL` = assertion gagal atau dampak negatif terbukti.
- `NOT_TESTED` = belum diuji, termasuk webcam fisik yang tak bisa diakses agent cloud.
- `BLOCKED` = ada dependensi nyata, seperti lisensi dataset, akses GPU, atau izin deploy; lampirkan bukti penyebab dan langkah mitigasi, jangan menghapus item.
- `CANDIDATE` = implementasi/prototype ada, tetapi belum terbukti memenuhi gate; belum otomatis menjadi runtime default.
- Semua angka `<25 MB`, p95 `150 ms`, target UI 60 FPS dan target `20 Hz` adalah **target acceptance prototype/legacy gate**, bukan hasil terukur R22. Jika webcam unik hanya 15 FPS, tulis 15 FPS; jangan menciptakan frame.
- Untuk no-hand atau false-positive tanpa GT independen, laporkan proxy/action invariants, tidak mengarang akurasi.

## Prioritas pekerjaan tidak berarti penghapusan

Ketergantungan logis bisa diurutkan (misal dataset legal → training; consent → recorder). **Namun tidak boleh ada item dipindah ke fase tiga hari, sprint berikutnya, atau dinyatakan tidak penting demi tenggat.** Worker lain harus mengerjakan area paralel. Hanya hasil verifikasi yang menentukan apakah suatu kandidat menjadi default produk.
