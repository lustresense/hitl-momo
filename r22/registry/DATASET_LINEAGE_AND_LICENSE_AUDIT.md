# R22 Dataset Lineage, License Gate, Split-Overlap & Candidate Provenance Audit (D01–D04, D10, D14)

- **Generated:** `2026-11-19T13:02:30Z` by `w-data` (`train_r22_heads_gpu.py --stage registry`)
- **Contract Versions:** `K4 = v1.0-FROZEN` | `K5 = r19-82d-v1` (SHA-256 `ed9349456a79284520adb2969a8a11eccd36500cc9d34fe24591f3f742559140`) | `K7 = v1.0-FROZEN`
- **Machine-Readable Artifacts:**
  - [`dataset_registry_r17_r20.json`](dataset_registry_r17_r20.json)
  - [`split_overlap_verification.json`](split_overlap_verification.json)

---

## 1. Legal Gate & Feature Compatibility Verification (D02, D04, D14)

| Gate / Policy Check | Result | Verified Evidence |
|---|---|---|
| **R17 `HaGRIDv2` (`HOLD_LICENSE`)** | **PASS (`0` rows)** | Custom Russian-law ShareAlike (`license/en_us.pdf` Sec. 3b & 4); **`0` rows** in R18, R19, R20, and R22 product weights; 0 bytes cached locally. |
| **`DimHand` / `LLHands` / `MGR-Dark` / NC Backlog (`BLOCKED`)** | **PASS (`0` rows)** | Non-commercial (`CC BY-NC` / `CC BY-NC-ND`) or unpublished/gated; **`0` rows** ingested. |
| **Owner Benchmark JSONs `S-07ba0cde` (`UNLABELLED_TELEMETRY`)** | **PASS (`0` GT rows)** | `four-trials.json` (`7,612` frames, SHA-256 `42c1f347f75dbe43…`) & `two-trials.json` (`4,080` frames, `7dfabfcc2fd22a41…`) have `truth="UNLABELLED"`. **`0` rows** used as supervised GT; strictly action-invariant & consistency diagnostics (`labelSource != "DATASET_GT"`). |
| **K5 Feature Encoder Parity (`r19_features.ts`, `82D`)** | **PASS (identical)** | Frontend & `r19/candidates` SHA-256 match identically: `ed9349456a79284520adb2969a8a11eccd36500cc9d34fe24591f3f742559140`. |
| **Legacy `68D` / `56D` Segregation (D04)** | **PASS (segregated)** | R18 `ux3_feat_{train,val,test}.f32` confirmed `feature_count=68` (`221,715 / 120,020 / 110,881` rows), strictly segregated and NEVER concatenated with `82D`. R19/R20/R22 re-encode IPN HandS directly from raw 21 landmarks in `IPN_HandS_landmarks_MPHands.zip` (`SHA-256 e511bb2b902207b8…`). |

---

## 2. Complete R17–R20 Unified Dataset Registry Summary (D01)

| Dataset | Origin | License (Verified) | Split Role | Subjects / Clusters / Videos | Local Verified SHA-256 (Primary) | Usage in R22 |
|---|---|---|---|---|---|---|
| **HandGesture-5G** (`wj25crzdbm.1`) | R19→R20→R22 | `CC BY 4.0` | `train \| val \| locked_test` | `38` clusters (`21 / 8 / 9`), `1,797` imgs (`846` CRC32 dups removed), `1,097` 720p train imgs | `jsonl`: `6466e8d7e50f6906…` | Pistol Head + Pose Head + R22 Train-Only Image/LM Augs |
| **Natural RGB v3** (`n66hhk695h.3`) | R19→R20→R22 | `CC BY 4.0` | `train \| val \| locked_test` | `26` participants (`19 / 4 / 3`), `1,352` clips, `10,816` frames (`6` light strata) | `jsonl`: `de9f75df73583402…` (`Root.zip` R19: `2257bb71…`) | Pistol `OTHER` (`point_left/right` quarantined) + Pose apex (`rank 3..5`) + `ok_sign` Pinch audit |
| **IPN HandS** (`gibranbenitez/IPN_Hand`) | R17→R18→R19→R20→R22 | `CC BY 4.0` / `Apache 2.0` | `train \| val \| locked_test` | `29` persons (`19 / 5 / 5`), `200` videos (`128 / 36 / 36`), `801,476` frames | `MPHands.zip`: `e511bb2b902207b8…` | Pistol `OTHER` (`P1F/C1F/2C1` held out as trap) + 36-video continuous FSM eval + Temporal (`w-temporal`) |
| **HANDS RGB-D v2** (`ndrczc35bt.2`) | R19→R20→R22 | `CC BY 4.0` | `train (S1..2) \| val (S3) \| locked_ood (S4..5)` | `5` subjects, `2,700` frames (`S4..S5` = `1,080` frames / `2,092` matched hands) | `jsonl`: `96b22c405d709e51…` | Pistol hard-neg `OTHER` (S1..2 train, S3 val, S4..5 OOD) + **Pose Head** (S1..2 train, S3 val, S4..5 locked OOD!) |
| **Mendeley `bxr7kx84y6.2`** (2 slices) | R18→R20→R22 | `CC BY 4.0` | `train (Gomoku/Poker 0..68%) \| locked_ood (599f + 75..100%)` | `2` zips (`3,712` JPGs): `5` games locked (`1,133` hands), `Gomoku/Poker` (`230` tr / `85` OOD) | `dim_1`: `2f91746c3622ace4…`, `nat_1`: `4655f7e42a6edac6…` | Pistol dim/natural hard-neg `OTHER` (`pointing-like` quarantined) + 2 locked session-disjoint OOD tests |
| **HaGRIDv2** (`arXiv:2412.01508`) | R17 (research only) | Custom ShareAlike | **`HOLD_LICENSE`** | `0` product rows | R17 ref: `ca27a177cc9f061e…` | **EXCLUDED** (0 rows in product weights) |
| **DimHand / LLHands / MGR-Dark / NC** | R18–R20 audit | `CC BY-NC*` / Gated | **`BLOCKED`** | `0` product rows | N/A | **BLOCKED** |
| **Owner `S-07ba0cde`** (`4T` & `2T`) | R20/R22 | Owner Numeric Telemetry | **`UNLABELLED_TELEMETRY`** | `4` trials (`7,612` frames; `T004` = `2,082` frames / `1,411` hand frames) | `4T`: `42c1f347f75dbe43…` | **0 supervised GT rows**; T004 pinch/replay consistency diagnostics only |

---

## 3. Programmatic Zero-Leakage Split Overlap Verification (D03)

All checks executed programmatically from raw disk artifacts (`split_overlap_verification.json`, **`overall_PASS: true`**):

| Dataset / Split Check | Overlap Count | Verification Details | Status |
|---|---:|---|---|
| **Locked VAL & TEST Feature Binary Byte-Identity** | `0` diffs | `r20_feat`, `r20_c2_feat`, `r20_c3_feat` share identical VAL (`5,067` rows, SHA `7aea311ba274…`) and TEST (`4,720` rows, SHA `6d3e6eebc495…`) | **PASS** |
| **HandGesture-5G Clusters / Sample IDs / Files / CRC32** | `0 / 0 / 0 / 0` | `21` train / `8` val / `9` test atomic clusters; `0` cross-split same-class `dHash<=8` or `15s` bursts *(note: `1407` cross-class studio pairs from different gestures share same day/phone, which is why person-disjoint Natural RGB v3, IPN, and HANDS RGB-D S4..5 OOD are mandatory alongside HG5G)* | **PASS** |
| **HandGesture-5G Train-Only Augs (`extra_hg5g_aug` + `hg5g_720`)** | `0` | All `1,915` augmented rows and `1,097` cached 720p images belong strictly to train clusters (`0` in val/test) | **PASS** |
| **Natural RGB v3 Participants / Clips / Sample IDs** | `0 / 0 / 0` | `19` train / `4` val / `3` test participants (`1,352` clips) | **PASS** |
| **IPN HandS Persons / Videos** | `0 / 0` | `19` train / `5` val / `5` test persons (`128 / 36 / 36` videos); leaky official 148/52 split rejected | **PASS** |
| **HANDS RGB-D Subjects / Filenames** | `0 / 0` | `Subject1..2` train (`1,692` pistol OTHER) vs `Subject3` val (`221`) vs `Subject4..5` locked OOD (`1,080` frames / `2,092` matched hands) | **PASS** |
| **Mendeley `bxr7kx84y6` Games & Temporal Buffer** | `0` | Locked `599`-frame 5 games (`Chinese Chess, Dice, Meeting Chess, Aeroplane Chess, Checkers`) have `0` overlap with `Gomoku/Poker`; `Gomoku` gap = `24` frames, `Poker` gap = `41` frames (`> 20` frame buffer) | **PASS** |

---

## 4. K4 Geometry-Verified Label Mapping Audit (D02, D06, D07)

Before mapping any source class to R22 K4 heads, every dataset class was audited geometrically on actual MediaPipe 21-point landmarks (never blindly mapped by folder name):

1. **Pose Head (`FIST / ONE / TWO / FIVE / OTHER`) Cleanliness Findings:**
   - **`HandGesture-5G`:** Static poses are geometrically crisp (`Fist` `ext=[0,0,0,0]`, `Pointing Up` `ext=[0.94,0,0,0.08]` `tl=0.68`, `V-Sign` `ext=[0.98,0.99,0.04,0.05]`, `Open Palm` `ext=[1,1,1,1]` `tl=1.85`, `L-Sign` `tl=2.09 -> OTHER`).
   - **`HANDS RGB-D`:** `Punch_VFL/VFR -> FIST`, `One_VFL/VFR -> ONE`, `Two_VFL/VFR -> TWO`, `Five_VFL/VFR + Horiz_HBL/HBR/HFL/HFR -> FIVE` (all `ext=[1,1,1,1]`, `tl=1.74..1.94`), `Six/Seven/Eight/Span -> OTHER` (gold-standard 3-finger & shaka hard negatives!). **`TimeOut` was EXCLUDED** after geometric audit revealed each single hand in the 2-hand T-pose has `ext=[1,1,1,1]`, `tl=1.61` (preventing false `FIVE -> OTHER` label noise!).
   - **`Natural RGB v3`:** Video-clip rank audit revealed `rank 0..1` are open-hand raise transitions (`fist` rank 0 had `ext=[0.78,0.69,0.63,0.71]`!). Therefore ONLY clip **apex frames (`rank 3..5`)** are mapped for static Pose supervision (`fist->FIST`, `peace_sign->TWO`, `raised_hand/stop->FIVE`, `ok_sign/thumbs_up/thumbs_down->OTHER`), while dynamic/conversational classes (`come_here, go, wave, palm_down_push, point_left, point_right`) remain quarantined.
2. **Pinch Head (`TOUCH / NEAR / OPEN`) `DATA_GAP` Audit (D07):**
   - **`0` legal `CC BY 4.0` datasets** contain frame-level ground truth separating physical thumb-index contact (`TOUCH`, `<= 0.30`) from intentional hover (`NEAR`, `0.30..0.50`).
   - `Natural RGB v3` `ok_sign` (`n=561`) has `58.5%` frames with `pinchRatio <= 0.30`, but represents a 3-extended-finger OK gesture with clip-level (not frame-contact) annotations.
   - `HandGesture-5G` `Fist` (`48.3%` in `0.30..0.50`) and `HANDS RGB-D` `Punch` (`43.1..49.4%` in `0.30..0.50`, `9.0..23.5% <= 0.30`) prove that **curled fists frequently produce small thumb-to-index distances** — confirming why folded-index pinch gates (`<= 0.20`) and non-fist constraints are mandatory.

---

## 5. Candidate New Legal Worst-Case Camera Sources Provenance Audit (D10)

| Candidate Source | DOI / URL | License (Live API Verified) | Content & Worst-Case Relevance | R22 Audit Verdict |
|---|---|---|---|---|
| **Mendeley `bpkd429sxt.1`** (Preinl, Nov 2025) | [`10.17632/bpkd429sxt.1`](https://data.mendeley.com/datasets/bpkd429sxt/1) | `CC BY 4.0` | 10-class pre-extracted MediaPipe Hands CSV landmarks (`GE01NU..GE19NU`) + `collage.jpg` | **`DEFERRED_PREEXTRACTED_UNVERIFIED`** — Legal, but lacks raw RGB frames (cannot run lowlight/blur/glare augmentation), lacks MP Hands version/aspect/subject IDs, and uses opaque `GE*` taxonomy with no pistol/pinch definitions. |
| **Multimodal BISINDO Corpus v2** (Hayati et al., Dec 2025) | [`10.17632/235c78xbmk.2`](https://data.mendeley.com/datasets/235c78xbmk/2) | `CC BY 4.0` | `19,760` Indonesian Sign Language (A–Z) frames/videos across **low-light indoor**, bright indoor, and outdoor scenes (faces blurred) | **`ELIGIBLE_FUTURE_LOWLIGHT_HARD_NEG`** — Commercial-safe with authentic Indonesian low-light/motion diversity; single-actor constraint means entire corpus must stay TRAIN-only `OTHER` hard negatives if ingested later. |
| **`bxr7kx84y6.2` Remaining 22 Upstream Zips** (Cui et al., Sep 2024) | [`10.17632/bxr7kx84y6.2`](https://data.mendeley.com/datasets/bxr7kx84y6/2) | `CC BY 4.0` | `~7.75 GiB` across 22 uncached zips of dim-light & natural-light interactive hands | **`ELIGIBLE_FUTURE_EXPANSION`** — 100% session-disjoint from cached `dim_light_1.zip` / `natural_light_1.zip` locked holdouts; streamable via HTTP 206 Range. |
| **Exocentric Hand Interaction v2** (Zadid et al., Jul 2025) | [`10.17632/9d37m3nfgm.2`](https://data.mendeley.com/datasets/9d37m3nfgm/2) | `CC BY 4.0` | `7,221` third-person PNG frames (`2.48 GiB`) with 2–4 interacting people | **`ELIGIBLE_FUTURE_BYSTANDER_HARD_NEG`** — Legal multi-hand distractor stress source; no gesture labels. |
