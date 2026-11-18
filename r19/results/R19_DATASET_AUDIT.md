# R19 Dataset Provenance, License, Accessibility & Disk-Budget Audit

- **Plan Reference:** [`[WIP] NUI_R19-01 v0.1.0`](../../docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md) (`Section 3`)
- **Audit Scope:** All **22** datasets in `NUI_R19-01` Section 3 (`7` Primary/HOLD/BLOCKED + `15` Backlog)
- **VM Free Disk Ceiling at Audit (`2026-11-18`):** `3,407,142,912 B` (`3.173 GiB`, `df -h`: `3.2G` / `95%` used on `/dev/sda2`). Mandatory floor maintained: **`>= 2.0 GiB` free** at all times.
- **Commercial License Policy:** Product weights may ONLY train on verified commercial-safe `CC BY 4.0` / `MIT` / `Apache-2.0` sources. Non-commercial (`CC BY-NC`, `CC BY-NC-ND`, academic-only) and custom ShareAlike (`HaGRIDv2`) datasets are strictly quarantined/held.

---

## 1. Verdict Summary

| Verdict | Count | Datasets |
|---|---:|---|
| **`SELECT`** | 3 | `HandGesture-5G` (`wj25crzdbm.1/.2`, Range-only), `IPN Hand / IPN HandS` (local cache), `Natural RGB Hand Gestures v3` (`n66hhk695h.3 Root.zip`) |
| **`EVAL_ONLY`** | 2 | `Egocentric/Exocentric Hands v2` (`bxr7kx84y6.2`, 2 cached slices), `HANDS RGB-D` (`ndrczc35bt.2`, selective Range directional/dorsal evaluation) |
| **`HOLD_LICENSE`** | 1 | `HaGRIDv2` (custom ShareAlike `license/en_us.pdf` Section 3(b) & 4; awaits Owner legal sign-off) |
| **`BLOCKED`** | 3 | `DimHand` (ACM MM 2026), `LLHands / XPose`, `MGR-Dark` |
| **`REJECT`** | 13 | `Exocentric Hand Interaction v2` (`9d37m3nfgm.2`), `Cambridge`, `NUS II`, `EgoHands`, `MediaPipe CSV`, `FreiHAND`, `RHD`, `InterHand2.6M`, `DexYCB`, `HO-3D`, `FPHA`, `LOL-v2 Real`, `See-in-the-Dark (SID)` |

---

## 2. Primary Shortlist, HOLD & BLOCKED Deep Audit (`7` Entries)

| Dataset | Tier | Official DOI / URL | License & Commercial Fit | Exact Archive / Local Size | Accessibility & Disk Strategy | Class & Pistol Fit | Verdict |
|---|---|---|---|---:|---|---|---|
| **HandGesture-5G** (Diptho et al., Jahangirnagar Univ., `v1 2026-06-30` / `v2 2026-07-01`) | `T1` | `10.17632/wj25crzdbm.1` ([Mendeley](https://data.mendeley.com/datasets/wj25crzdbm/1)) | **`CC BY 4.0`** (Commercial-safe w/ attribution) | Monolithic `GESTURE DATASET JU.zip` = **`5,176,227,373 B`** (`4.82 GiB`), SHA-256 `b86adb64...`; **dedup (`1,807` unique)** = `3,420,310,839 B` (`3.19 GiB`) comp | `HTTP 206 Range` verified; **846 exact CRC32 duplicates** (`IMG_* 2.JPG`) found in Central Directory! Stream unique entries in RAM; store landmarks + downscaled audit thumbnails only (`<= 150 MiB`), **never** download `4.82 GiB` zip | Only `CC BY 4.0` dataset with explicit **`L-Sign`** (`365` unique/`537` total) for `POINT_PRESS` + `Pointing Up` (`284`/`405`) + `Open Palm` (`439`/`661`), `Fist` (`338`/`542`), `V-Sign` (`381`/`508`) across dorsal/palmar & Low/Correct/High exposure | **`SELECT`** (Range stream + cluster split) |
| **IPN Hand / IPN HandS** (Benitez-Garcia et al., `2020` / `2025`) | `T1` | `10.3390/app15116321` / `10.1109/ICPR48806.2021.9412317` ([Page](https://gibranbenitez.github.io/IPN_Hand/)) | **`CC BY 4.0`** (GT/ann) + `Apache 2.0` (MP) + `MIT` (code) | **`1,049,697,730 B`** (`977.6 MiB`) **cached locally** across `annotations` (`82,274 B`), `GT` (`674,282,839 B`), `MPHands` (`375,332,617 B`) | Local cache (`0 B` new download); strict `person_id`-disjoint `19/5/5` split (`r18` validated) | `200` videos, `801,476` frames, `50` subjects. Has **`P1F` pointing (`POINT_READY` candidate)** and continuous `NOG/P2F/GRB/T*/OP2/Z*` **`OTHER` negatives**; **NO Pistol `POINT_PRESS` class** | **`SELECT`** (Local baseline & `OTHER` regression) |
| **Natural RGB Hand Gestures** (Rahat et al., AIUB, `v1 2025-05-12` vs `v3 2026-07-08`) | `T2` | `10.17632/n66hhk695h.3` (`v3`) / `.1` (`v1`) ([Mendeley](https://data.mendeley.com/datasets/n66hhk695h/1)) | **`CC BY 4.0`** (Commercial-safe w/ attribution) | **`v3 Root.zip` = `382,226,419 B` (`364.52 MiB`)**, SHA-256 `2257bb71...`; `v1 = 3.53 GiB` (`14` zips, kept separate) | Direct HTTP (`v3` only; `v1` skipped on disk budget); `v3` contains **26 participants** × `1,352` H.264 MP4 clips (`640x640 @ 30fps`) + `metadata.csv` | `13` classes (`104` clips/class) across bright, dim indoor, green/red LED, backlit, warm light: **`point_left`, `point_right`** (thumb state checked quantitatively before label mapping) + hard negatives (`thumbs_up`, `thumbs_down`, `peace_sign`, `ok_sign`, `fist`, `stop`) | **`SELECT`** (`v3 Root.zip`) |
| **Egocentric / Exocentric Hands v2** (Cui et al., UTM, `v2 2024-09-23`) | `T2` | `10.17632/bxr7kx84y6.2` ([Mendeley](https://data.mendeley.com/datasets/bxr7kx84y6/2)) | **`CC BY 4.0`** (Commercial-safe) | Full `24` zips = `8.17 GiB`; **2 local slices cached** = `456,578,207 B` (`435.43 MiB`, `3,712` JPGs) | Keep local 2 slices (`dim_light_1.zip`, `natural_light_1.zip`, `0 B` new download); do not download remaining `7.75 GiB` | Unlabeled natural hands in dim/natural lighting; low-light MediaPipe recall (`L0..L2`) & zero-false-PRESS `OTHER` stress | **`EVAL_ONLY`** (Local cached) |
| **Exocentric Hand Interaction v2** (Zadid et al., AIUB, `v2 2025-07-02`) | `T2` | `10.17632/9d37m3nfgm.2` ([Mendeley](https://data.mendeley.com/datasets/9d37m3nfgm/2)) | **`CC BY 4.0`** | Single zip `Exocentric View.zip` = `2,663,815,536 B` (`2.48 GiB`), SHA-256 `572d98ab...` | Would consume `78%` of free disk (`3.17 GiB`) | `7,221` unlabeled third-person PNG board-game frames (`Two/Three/Four Persons`), redundant with cached `bxr7kx84y6` | **`REJECT`** |
| **HaGRIDv2** (Nuzhdin et al., `arXiv:2412.01508`) | `HOLD` | `10.48550/arXiv.2412.01508` ([GitHub](https://github.com/hukenovs/hagrid)) | **Custom ShareAlike** (`license/en_us.pdf` Sec. 3(b) & 4; *not* CC, Russian-law reworked `CC BY-SA 4.0`) | `annotations.zip` = `719,041,314 B` (`685.7 MiB`); `512px` = `119.4 GB`; FullHD = `1.5 TB` | **Do NOT download or train product weights** without Owner legal clearance on Adapted Material ShareAlike | Contains MediaPipe landmarks for `thumb_index` (`L-shape`), `point`, `one`, `three_gun`, `like`, `fist`, `palm`, `no_gesture` | **`HOLD_LICENSE`** |
| **DimHand** (Zhan et al., ACM MM 2026) | `BLOCKED` | [`hanlingzhan.github.io/DimHand`](https://hanlingzhan.github.io/DimHand/) | **Non-commercial academic** (modal + `supp.pdf` D.4/D.5 + `CC BY-NC-ND 4.0`) | Unpublished multi-GB (`745,280` RGB-D frames, `0.1–10` lux) | Gated manual application unanswered; multi-GB archive exceeds VM disk | Sequential low-light 3D hand pose only; no commercial weights permitted | **`BLOCKED`** |

---

## 3. Backlog Audit (`15` Entries from `NUI_R19-01` Section 3)

| # | Dataset | Primary Source / DOI | Verified License & Commercial Safe? | Size & Access | Pistol / Pointing / Low-Light Content | Verdict & Rationale |
|---:|---|---|---|---|---|---|
| 1 | **Cambridge Hand Gesture** | [labicvl.github.io/ges_db.htm](https://labicvl.github.io/ges_db.htm) (`CVPR 2007`) | Academic purposes only (**No**) | `~1 GB`, legacy FTP | 3 shapes (`flat/spread/V`) × 3 motions | **REJECT** — Non-commercial/unclear license, legacy FTP, no pointing/L-Sign |
| 2 | **NUS Hand Posture II** | `10.1007/s11263-012-0560-5` ([NUS](https://www.ece.nus.edu.sg/stfpage/elepv/NUS-HandSet/)) | Academic research only (**No**) | `77,233,719 B` (`73.66 MiB`) | 10 postures `a–j` (`160x120`) + backgrounds | **REJECT** — Non-commercial academic terms & `160x120` resolution |
| 3 | **EgoHands** | [IU Project Page](https://vision.luddy.iu.edu/projects/egocentric-computer-vision.html) (`ICCV 2015`) | Academic / non-commercial (**No**) | `~1.1–1.3 GB` (primary zip URL retired) | Pixel masks only (`my/your L/R`) | **REJECT** — Academic provenance, broken zip URL, no gesture classes |
| 4 | **MediaPipe Hand Gesture CSVs** | Community Kaggle / GitHub CSVs | Uploader-mixed / unverified sources (**No**) | `~1–50 MB` | ASL / RPS normalized differently vs MP `0.10.x` | **REJECT** — Unverified provenance, normalization mismatch, no READY/PRESS |
| 5 | **FreiHAND** | [Uni Freiburg](https://lmb.informatik.uni-freiburg.de/projects/freihand/) (`ICCV 2019`) | *"Any commercial use is prohibited"* (**No**) | `~4.4 GB` (`3.7G` + `724M`) | 3D MANO/keypoints, no gesture classes | **REJECT** — Explicit commercial ban & exceeds free disk |
| 6 | **RHD / Rendered Handpose** | [Uni Freiburg](https://lmb.informatik.uni-freiburg.de/projects/hand3d/) (`arXiv:1705.01389`) | *"Any commercial use is prohibited"* (**No**) | `7.1 GB` | Synthetic Blender renders, no gesture classes | **REJECT** — Explicit commercial ban & synthetic domain gap |
| 7 | **InterHand2.6M** | [Project Page](https://mks0601.github.io/InterHand2.6M/) (`ECCV 2020`) | `CC BY-NC 4.0` (**No**) | `~80 GB` | Studio 3D hand keypoints, no gesture classes | **REJECT** — `CC BY-NC 4.0` & `~80 GB` infeasible |
| 8 | **DexYCB** | [dex-ycb.github.io](https://dex-ycb.github.io/) (`CVPR 2021`) | `CC BY-NC 4.0` data (**No**) | `119 GB` | 6D YCB object grasping | **REJECT** — `CC BY-NC 4.0` & `119 GB` infeasible |
| 9 | **HO-3D** | [TU Graz](https://www.tugraz.at/institute/icg/research/team-lepetit/research-projects/hand-object-3d-pose-annotation/) (`arXiv:2107.00887`) | *"not redistribute, modificate, or commercial usage"* (**No**) | Multi-GB (`77.5k+` frames) | 3D hand-object poses | **REJECT** — Explicit commercial/modification ban |
| 10 | **FPHA** | [Project Page](https://guiggh.github.io/publications/first-person-hands/) (`CVPR 2018`) | *"not redistribute, modificate, or commercial usage"* (**No**) | Multi-GB (`>100k` frames) | 45 daily object actions | **REJECT** — Explicit commercial ban & wrong classes |
| 11 | **HANDS RGB-D** | `10.17632/ndrczc35bt.2` ([Mendeley](https://data.mendeley.com/datasets/ndrczc35bt/2)) | **`CC BY 4.0`** (**Yes — Commercial-safe!**) | `6.52 GiB` v1 RGB / `8.86 GiB` v2 RGB-D (`5` subject zips, **HTTP Range supported**) | `29` static gestures incl. **`Horiz_HBL` (dorsal right-hand pointing left!)**, `Horiz_HBR/HFL/HFR`, digits `0–9`, `Span`, `TimeOut` | **`EVAL_ONLY`** — Selective HTTP Range extraction in RAM only (`0 B` zip stored) for real subject-disjoint dorsal/palmar pointing verification |
| 12 | **LOL-v2 Real** | Google Drive (`CVPR 2021`, HF mirror) | Upstream GDrive unlicensed (**No**) | `~588 MB` | Enhancement pairs only, **0 hands** | **REJECT** — Zero hand gestures & ambiguous upstream license |
| 13 | **See-in-the-Dark (SID)** | [GitHub](https://github.com/cchen156/Learning-to-See-in-the-Dark) (`CVPR 2018`) | `MIT` (**Yes**) | `77 GB` Bayer RAW | Raw low-light scenes, **0 hands** | **REJECT** — `77 GB` Bayer RAW, zero hand gestures |
| 14 | **LLHands / XPose** | Unpublished WACV paper (Samsung Research) | Proprietary / unpublished (**No**) | Unpublished (`~120k` frames) | 2D/3D low-light keypoints | **BLOCKED** — No public dataset URL or commercial license |
| 15 | **MGR-Dark** | OpenReview (`ACM MM`, availability on request) | Unpublished / request-only (**No**) | Unpublished | Multimodal dark RGB/Depth/IR gestures | **BLOCKED** — No public RGB URL or commercial license |

---

## 4. Storage & Legal Discipline Rules Enforced for R19 Execution
1. **Local Cache Reuse (`0 B`):** Reuse existing `IPN HandS` (`977.6 MiB`) and `bxr7kx84y6` (`435.43 MiB`) read-only without copying archives.
2. **Disk-Bounded Ingestion:** Only store `Natural RGB v3 Root.zip` (`364.52 MiB`), `HandGesture-5G` in-memory HTTP Range derived landmarks/crops (`<= 100 MiB`), and `HANDS RGB-D` Range-streamed directional landmarks (`<= 20 MiB`), retaining **`> 2.3 GiB` free** on `/`.
3. **Transition Gap Transparency:** Public `CC BY 4.0` datasets cover static `L-Sign` (`HandGesture-5G`), directional 1-finger pointing (`IPN P1F`, `Natural RGB point_*`, `HANDS RGB-D Horiz_H*`), and `OTHER` negatives, **NOT** continuous `POINT_READY -> POINT_PRESS -> POINT_RELEASE` thumb toggle video. Temporal FSM transitions are validated on explicit kinematic synthetic sequences cleanly labeled `SYNTHETIC`, and dynamic live thumb-toggle validation remains flagged for physical webcam collection (`PHYSICAL_WEBCAM = NOT_TESTED`).
