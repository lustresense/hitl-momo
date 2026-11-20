# MoNUI-7 R23 — Dataset Inspection Table (T12)

- **Date:** 2026-11-20
- **Auditor:** W-DATA subagent (MoNUI-7 R23)
- **Mandate Reference:** `NUI_R23-02 v1.1.0` §6 T12

---

## 1. Dataset Inspection Matrix

| ID | Dataset Name | Source / Format | Total Files / Frames | Resolution | Face Present? | Full Frame vs Crop | Light Condition / Strata | Annotation Structure | R23 Status & Usability |
|---|---|---|---|---|---|---|---|---|---|
| **A1** | **HANDS RGB-D v2** (`ndrczc35bt.2`) | Mendeley API / ZIP (Range) | 2,700 curated frames (12,000 total across 5 subjects) | 960 × 540 | No (desktop interaction space) | Full frame | Controlled indoor with clutter | JSON `r22_hands_rgbd_bbox_splits.json` with `xywh_px` & `xyxy_norm` | **PASS** — Ingested 2,700 frames (T11d). |
| **A2** | **IPN Hand + HandS** | Google Drive MP4 + Server GT Zip | 200 videos (29 subjects, 801k frames) | 640 × 480 | Yes (seated subject upper body) | Full frame | Natural indoor variation | `IPN_HandS_landmarks_GT.zip`: JSON per video, `pose_landmarks`, `hand_landmarks` (21 3D normalized pts) | **BLOCKED (IPN_GDRIVE)** — Google Drive quota exceeded on video archives. |
| **A3** | **HandGesture-5G v2** (`wj25crzdbm.2`) | Mendeley ZIP (Range) | 1,797 unique images (38 clusters) | 1280 × 720+ (variable smartphone) | Minor / cropped torso | Full frame | Exposure labels: `Low`, `Normal`, `High` | Filename and cluster metadata | **PASS** — Darkpool eligible (`Low` exposure stratum). |
| **A4** | **Natural RGB v3** (`n66hhk695h.3`) | Mendeley `Root.zip` (382 MB) | 1,352 clips (26 participants) | 640 × 480 | Yes (seated participants) | Full frame | 6 strata: `Normal`, `Backlit`, `Dim`, `Direct Sunlight`, `Side Lit`, `Dark` | Video metadata CSV with rank apex annotations | **PASS** — Darkpool eligible (`Dim` & `Backlit` strata). |
| **A5** | **bxr7 v2** (`bxr7kx84y6.2`) | Mendeley ZIPs + Local cache | 24 ZIPs (3,712+ JPGs); 1,560 imgs in `dim_light_1` | 1280 × 720 | No (overhead board game desk) | Full frame | `Dim Light` (low-light game sessions) vs `Natural Light` | Frame-sequence image directories per game | **PASS** — `dim_light_1.zip` locked test; remaining dim for train darkpool. |
| **A6** | **BISINDO v2** (`235c78xbmk.2`) | Mendeley API / MP4 + JPG | 26 MP4 videos + 19,760 frames | 1920 × 1080 (scaled ≤640) | Yes (faces blurred) | Full frame | Low-light indoor, bright indoor, outdoor | Pascal VOC XML per frame | **PASS** — Low-light indoor subset for darkpool. |
| **A7** | **EHG-7** | Zenodo `16949855` | 4-part split tarball (`.000`..`.003`) | Mixed RGB-D | Unknown | Multi-stream | 7 dynamic gestures under dark conditions | Multi-part split tarball archive | **NOT_USED** — Archive is a split multi-part tarball, cannot be read via Range. |
| **A8** | **Open Images V7** (Human hand) | AWS S3 Unsigned / Downloader | 26,751 selected (75k+ boxes) | Variable (downscaled ≤ 640 px) | Incidental in real scenes | Full frame | Uncontrolled wild photography | CSV boxes `[XMin, YMin, XMax, YMax]`, filtered unrotated non-group | **PASS** — Ingestion active via batch downloader (T11b). |
| **A9** | **ASLAD-190K** (`2fgpn5dwgc.2`) | Mendeley ZIPs | 190,000 images | Cropped hand boxes | No (tight hand crops) | **Potongan tangan (Cropped)** | Studio / indoor lighting | Pre-cropped images + 21 landmark CSV | **NOT_USED** — Contains only hand crops, not full frame interaction scenes. |
| **A10** | **Depth Camera D435** (`8ffrgcmjkm.1`) | Mendeley API / ZIP | Depth & RGB frames | 640 × 480 | No / desktop setup | Full frame | Cluttered desk and ambient light | RealSense D435 aligned RGB-D | **PASS** — CC BY 4.0 verified, darkpool candidate. |
| **A11** | **EgoHands** | Roboflow Universe / IU | 4,800 frames | 1280 × 720 | Incidental hands | Full frame egocentric | Indoor interaction tables | Roboflow polygon / box exports | **SKIP** — Roboflow Universe requires login / API key or triggers Cloudflare challenge. |
| **A13** | **HaGRID v2** | SberCloud OBS ZIP64 (Range) | 1,086,168 total; 67,846 sampled | 512 × 512 | Incidental / blurred | Full frame | Real-world indoor/outdoor illumination | JSON per class/split: `bboxes`, `labels`, `user_id`, 21 `hand_landmarks` | **PASS** — Ingestion active via 8-worker HTTP Range (T11a). |

---

## 2. Specific Verification Notes per Mandate §6

1. **A9 ASLAD-190K Full Frame vs Crop Verification:**
   - Inspection of `ASLAD-96K.zip`, `ASLAD-190K.zip`, and `ASLAD-190K_Letters.jpg` confirms that all images are tight bounding-box crops around hand regions only.
   - In accordance with mandate §6 rule (*"A9 hanya berisi potongan tangan: NOT_USED"*), **A9 is formally marked `NOT_USED`**.

2. **A7 EHG-7 Archive Structure Verification:**
   - Inspection of Zenodo record `16949855` shows file assets: `EHG-7.tar.gz.000`, `EHG-7.tar.gz.001`, `EHG-7.tar.gz.002`, `EHG-7.tar.gz.003`.
   - In accordance with mandate §6 rule (*"A7 EHG-7 hanya kalau tiap bagian adalah zip utuh yang bisa dibaca Range. Kalau arsip terpecah: NOT_USED"*), **A7 is formally marked `NOT_USED`**.

3. **A10 Depth Camera D435 License Verification:**
   - Official Mendeley license confirmed as `CC BY 4.0` (verified in T02 and live API).
   - RGB frames include cluttered background interaction settings, eligible for darkpool/detector evaluation.

4. **A2 IPN Hand Google Drive Status:**
   - Video downloads blocked by Google Drive download quota (*"Too many users have viewed or downloaded this file recently"*).
   - Landmark ground-truth `IPN_HandS_landmarks_GT.zip` (SHA-256 `493bf536...`) is verified and present on disk.
   - Status marked **`BLOCKED (IPN_GDRIVE)`** per mandate §6 T11c step 7.

5. **A11 EgoHands Roboflow Gate:**
   - Roboflow Universe (`brad-dwyer/egohands-public`) enforces authentication / API key and presents Cloudflare Turnstile anti-bot challenge.
   - Status marked **`SKIP (ROBOFLOW_AUTH_REQUIRED)`** in strict accordance with mandate §6 T11e and agent behavioral guidelines.
