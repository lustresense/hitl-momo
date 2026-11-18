# R19 Stage P1 Dataset Acquisition & MediaPipe Feature Curation Summary

## 1. Disk Budget & Integrity Verification
- **Final `/` Free Space:** `2,798,088,192 B` (`2.6059 GiB`) — `>= 2.0 GiB` floor satisfied: `True`

| Directory | Size (`du -sb`) | Budget Limit |
|---|---:|---|
| `n66hhk695h_v3/` | `382,226,419 B` | `Root.zip` (`382,226,419 B`) |
| `n66hhk695h_v3_derived/` | `32,432,014 B` | Derived JSONL + audit sheet |
| `handgesture_5g_derived/` | `6,958,463 B` | `< 50 MiB` (`True`) |
| `hands_rgbd_eval/` | `14,982,294 B` | `< 20 MiB` (`True`) |
| `work/` | `272,777 B` | Scripts + manifests |

## 2. Natural RGB Hand Gestures v3 (`10.17632/n66hhk695h.3`, `CC BY 4.0`)
- **Archive SHA-256:** `2257bb717af6451166d5ac74450c5f624c1f2960845894c549c14b6d2085a3d6` (`382,226,419 B`)
- **Clips / Sampled Frames:** `1352` / `1352` MP4 clips -> `10,816` frames (`0` clip failures)
- **JSONL:** `10,816` rows, `31,730,189 B`, SHA-256 `de9f75df73583402ffa0bc732636c23ffe5b6781dac67236efd8967c59a97cc8`, parse errors `0`
- **Overall L0 RAW Recall (`RunningMode.IMAGE`):** `57.78%` (`6,249`/`10,816`, misses `4,567`, L1 CLAHE320 recovered `365`)
- **Unbiased Stratified Paired Subset (`n=2704`):** `L0=62.91%` | `L1 CLAHE320=62.8%` | `M3=64.13%`
- **Participant-Disjoint Splits (`26` subjects):** `train`=19p/936c/7488f, `val`=4p/195c/1560f, `test`=3p/221c/1768f

## 3. HandGesture-5G (`10.17632/wj25crzdbm.1`, `CC BY 4.0`, HTTP Range Streaming Only)
- **Remote Zip:** `5,176,227,373 B` (`0 B` zip stored); `2653` image entries -> `846` CRC32 duplicates skipped -> `1807` unique entries
- **Decoded / HEIC Skips:** `1797` JPEGs decoded | `10` HEIC files skipped after PIL/cv2/ffmpeg attempts | `0` other decode errors
- **JSONL:** `1,797` rows, `6,508,455 B`, SHA-256 `6466e8d7e50f6906dd6698aaab4872ba9eb34c6a31c71ac37c12fc4831e121e9`, parse errors `0`
- **Detector Recall:** `L0 RAW=71.29%` (`1281/1797`, misses `516`) | `L1 CLAHE320=55.04%` | `M3=71.29%` | `both_miss=497`
- **Cluster-Disjoint Splits:** `38` atomic clusters (`max_size=194`); cross-split `same_day_model_dHash<=8`: `0`, cross-split `burst<=15s`: `0`

## 4. HANDS RGB-D (`10.17632/ndrczc35bt.2`, `CC BY 4.0`, `EVAL_ONLY` Range Slice)
- **Frames Streamed:** `2700` RGB PNGs across Subject1..5 (`0 B` zip/depth stored)
- **JSONL:** `2,700` rows, `14,505,513 B`, SHA-256 `96b22c405d709e5199996d48b6b928c037813d3fb1088e8aac45fe3cf2077083`, parse errors `0`

| Hand Label | GT Instances | L0 Matched (%) | L1 CLAHE320 (%) | M3 (%) | L0 Miss -> L1 Rec |
|---|---:|---:|---:|---:|---:|
| `Eight_VFL` | `100` | `77` (`77.0%`) | `48.0%` | `77.0%` | `0` |
| `Eight_VFR` | `100` | `78` (`78.0%`) | `70.0%` | `78.0%` | `0` |
| `Five_VFL` | `150` | `134` (`89.33%`) | `70.67%` | `89.33%` | `1` |
| `Five_VFR` | `150` | `131` (`87.33%`) | `81.33%` | `87.33%` | `3` |
| `Horiz_HBL` | `750` | `630` (`84.0%`) | `62.67%` | `84.0%` | `3` |
| `Horiz_HBR` | `750` | `636` (`84.8%`) | `77.07%` | `84.8%` | `2` |
| `Horiz_HFL` | `750` | `532` (`70.93%`) | `58.8%` | `70.93%` | `9` |
| `Horiz_HFR` | `750` | `593` (`79.07%`) | `73.07%` | `79.07%` | `9` |
| `One_VFL` | `150` | `102` (`68.0%`) | `31.33%` | `68.0%` | `0` |
| `One_VFR` | `150` | `110` (`73.33%`) | `62.67%` | `73.33%` | `1` |
| `Punch_VFL` | `150` | `88` (`58.67%`) | `35.33%` | `58.67%` | `1` |
| `Punch_VFR` | `150` | `102` (`68.0%`) | `52.0%` | `68.0%` | `0` |
| `Seven_VFL` | `100` | `79` (`79.0%`) | `48.0%` | `79.0%` | `2` |
| `Seven_VFR` | `100` | `80` (`80.0%`) | `77.0%` | `80.0%` | `4` |
| `Six_VFL` | `100` | `73` (`73.0%`) | `53.0%` | `73.0%` | `2` |
| `Six_VFR` | `100` | `74` (`74.0%`) | `67.0%` | `74.0%` | `1` |
| `Span_VFL` | `150` | `97` (`64.67%`) | `39.33%` | `64.67%` | `0` |
| `Span_VFR` | `150` | `116` (`77.33%`) | `64.0%` | `77.33%` | `0` |
| `TimeOut` | `150` | `108` (`72.0%`) | `38.67%` | `72.0%` | `1` |
| `Two_VFL` | `150` | `92` (`61.33%`) | `32.0%` | `61.33%` | `2` |
| `Two_VFR` | `150` | `126` (`84.0%`) | `75.33%` | `84.0%` | `1` |

