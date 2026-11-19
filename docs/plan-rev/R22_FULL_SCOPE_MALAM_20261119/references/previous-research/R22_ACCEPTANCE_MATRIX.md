# R22 Acceptance Matrix dan Bukti Minimal

| ID | Skenario | Harapan yang diuji | Bukti wajib | Sifat |
|---|---|---|---|---|
| U01 | Masuk `/nui-lab` | Coba Gestur / Coba Canvas, tanpa dropdown engine, CPU, cahaya, GT | Video/screenshot actual | P0 |
| U02 | Gesture desktop scroll | Kamera kiri tetap terlihat, kanan scroll independen | UI test/resizing | P0 |
| U03 | Canvas desktop scroll | Kanvas kanan usable, kamera kiri tetap terlihat | UI test dan screen record | P0 |
| U04 | Sinkronisasi | Skeleton/pose/action berframe ID+timestamp, stale indicated; tidak menipu | frame-age E2E fixture | P0 |
| U05 | Consent + auto record | 1 persetujuan eksplisit, record otomatis tiap route setelah consent | recorder test | P0 |
| U06 | Export | Session gesture+canvas tersimpan, trial lengkap, no silent drop | JSON round-trip/reanalyse | P0 |
| M01 | R17–20 data lineage | Setiap data eligible tersedia + hash/provenance, dedup | registry | P0 |
| M02 | License | HOLD/NC/BLOCKED tidak masuk product weights | audit + manifest | P0 |
| M03 | Split | No subject/scene/video near duplicate leakage | split checker output | P0 |
| M04 | Train head pistol | R22 vs R20 C4 metrics pada heldout; per class | logs, model sha | P0 |
| M05 | Train pose head | FIST/ONE/TWO/FIVE only if label strong; else geometry | label audit or DATA_GAP | Conditional |
| M06 | Pinch head | TOUCH/NEAR/OPEN only if labels valid; else FSM | evidence or DATA_GAP | Conditional |
| M07 | Blur/light augmentation | TRAIN-only RGB before detector; no fake landmark | config+cohort metrics | P0 |
| M08 | Evaluation | detector miss separate from classifier accuracy | metric report | P0 |
| S01 | Pinch drawing | Stable stroke; no duplicate ghost stroke | stroke E2E + events | P0 |
| S02 | Five-finger eraser | Five erases; fist never erases | regression fixture | P0 |
| S03 | Undo | Stable fist→one only once per arming | FSM tests | P0 |
| S04 | Redo | Stable fist→two only once per arming | FSM tests | P0 |
| S05 | Hand lost | No paint/key action while invalid | frame replay | P0 |
| S06 | Second hand | No automatic input ownership transfer | multi-hand fixture | P0 |
| S07 | Pinch near | Near does not start stroke | near/contact test | P0 |
| S08 | Mode switch | No gesture action bleed | mode-state tests | P0 |
| S09 | Worker error/recovery | One worker active, key reset, session stays consistent | worker E2E | P0 |
| S10 | Lighting | A4 auto vs RAW compared, no manual choice | stress matrix | P0 |
| S11 | Blur | robust abstention on severe blur, no fabricated geometry | stress matrix | P0 |
| S12 | Freshness | No stale landmark presented as present | frame-age test | P0 |
| P01 | CPU perf | p50/p95 latency, detect Hz, FPS, size actually measured | browser trace/test | P0 |
| P02 | Owner field | Real webcam before/after at equivalent conditions or NOT_TESTED | Owner export/video | P0 |
| D01 | Deploy dev | explicit approval, revision pinned, rollback R20/R19 | Ujang deployment proof | Separate approval |

**Angka keras terukur dari Owner saat ini:** 7.612 frame total; Canvas 2.082 frame, 671 detector miss, 19 stroke, 5 unexpected break, 68 action reject events. Jangan mengarang target absolute FPS/accuracy. Verifikasi lintas kondisi, mode, dan perbandingan before-after.


## Tambahan gate v2 dari audit Google AI (wajib; detector tambahan conditional)

| ID | Kontrol | Bukti kelulusan yang diharapkan | Prioritas |
|---|---|---|---|
| G01 | R20 A4v2 feature parity | Inventori fungsi existing + ablation RAW/R20/candidate pada input identik; no 'renaming old feature' | P0 |
| G02 | True camera FPS | Pisahkan capture unique FPS, processed Hz, UI FPS; honest when sensor 10-15Hz | P0 |
| G03 | Timing gaps | Duplicate/skip/hidden/no-hand tetap memicu release dan fail-closed, no stuck key/ghost stroke | P0 |
| G04 | Tone-map safety | Audit clipping pre/post, fingertip contrast, peak brightness; sensor-clipped pixels tidak diklaim pulih | P0 |
| G05 | ROI robustness | Owner lock vs hand crossing/occlusion/exit ROI, masked and full-frame side-by-side | P0/Conditional |
| G06 | One-Euro | Stillness jitter reduction vs onset latency/p95/path error, no 0-lag claim | P1 |
| G07 | Temporal training supervision | True sequence/timestamps/subject-disjoint vs replicated static photo; heldout and causal no future info | P0 model |
| G08 | Independent labels | Pseudo-label, observed-action, GT dibedakan; no accuracy claims without GT | P0 |
| G09 | Dataset detector | Foto+bbox annotation legal accessible, model maker/export/load task API smoke | Conditional |
| G10 | Detector runtime | Dual task WASM/network, memory, CPU, inference p95; custom model compatibility | Conditional |
| G11 | Detector usefulness | Hand-present confirmed recall / distractor and end-to-end input success vs baseline physical clip | Conditional |
| G12 | Scope/priority | Custom detector may be DEFERRED, UI/recorder/gesture/Canvas cannot be blocked by it | P0 |

All thresholds proposed by Google AI (`>15%`, 45% ROI, 6–8 frame, 160KB, <0.4 ms, 0 false press) = *kandidat parameter*, not performance evidence.
