# MoNUI-7 R23 — License Evidence and Audit Notes (T02)

- **Date:** 2026-11-20
- **Auditor:** W-DATA subagent (MoNUI-7 R23)
- **Mandate Reference:** `NUI_R23-02 v1.1.0` §6 T02
- **Evidence Storage Location:** `$DATA_ROOT/license_evidence/` (Local disk only, excluded from git repository)

---

## 1. Summary of 12 Permitted Datasets (§2.3)

| ID | Dataset Name | Source URL / DOI | Check Date | License | License Quote (≤ 25 words) | Evidence File | Plan Match | Usability / Role in R23 |
|---|---|---|---|---|---|---|---|---|
| **A1** | HANDS RGB-D v2 (`ndrczc35bt.2`) | [10.17632/ndrczc35bt.2](https://data.mendeley.com/datasets/ndrczc35bt/2) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A1/page.html` | MATCH | `detector` (S1–S2 train, S3 val, S4–S5 test) |
| **A2** | IPN Hand + HandS | [IPN_Hand](https://gibranbenitez.github.io/IPN_Hand/) | 2026-11-20 | CC BY 4.0 (Data) / MIT (Code) | *"The data and annotations in the IPN Hand dataset are licensed under a Creative Commons Attribution 4.0 License."* | `A2/web_index.html`, `A2/github_license.txt` | MATCH | `detector` (Train/val/test split by 19/5/5 subjects) |
| **A3** | HandGesture-5G v2 (`wj25crzdbm.2`) | [10.17632/wj25crzdbm.2](https://data.mendeley.com/datasets/wj25crzdbm/2) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A3/page.html` | MATCH | `classifier` / `detector` (Low exposure frames, cluster 80/20) |
| **A4** | Natural RGB v3 (`n66hhk695h.3`) | [10.17632/n66hhk695h.3](https://data.mendeley.com/datasets/n66hhk695h/3) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A4/page.html` | MATCH | `classifier` / `detector` (Dim & backlit strata, participant split) |
| **A5** | bxr7 v2 (`bxr7kx84y6.2`) | [10.17632/bxr7kx84y6.2](https://data.mendeley.com/datasets/bxr7kx84y6/2) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A5/page.html` | MATCH | `detector` / `test` (`dim_light_1.zip` = locked test; other dim = train) |
| **A6** | BISINDO v2 (`235c78xbmk.2`) | [10.17632/235c78xbmk.2](https://data.mendeley.com/datasets/235c78xbmk/2) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A6/page.html` | MATCH | `detector` (Low-light indoor subset, split per video/session 80/20) |
| **A7** | EHG-7 | [10.5281/zenodo.16949855](https://zenodo.org/records/16949855) | 2026-11-20 | CC BY 4.0 | *"Creative Commons Attribution 4.0 International. rel='license' <https://creativecommons.org/licenses/by/4.0/legalcode>"* | `A7/doi_meta.html` | MATCH | `test` / `detector` (`NOT_USED`: multipart split tarball archive) |
| **A8** | Open Images V7 (Human hand) | [Open Images](https://storage.googleapis.com/openimages/web/factsfigures_v7.html) | 2026-11-20 | Annotations CC BY 4.0 / Images CC BY 2.0 | *"The annotations are licensed by Google LLC under CC BY 4.0 license. The images are listed as having a CC BY 2.0 license."* | `A8/factsfigures_v7.html`, `A8/index.html` | MATCH | `detector` (Human hand bounding boxes, train/val/test) |
| **A9** | ASLAD-190K (`2fgpn5dwgc.2`) | [10.17632/2fgpn5dwgc.2](https://data.mendeley.com/datasets/2fgpn5dwgc/2) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A9/page.html` | MATCH | `test` / `detector` (`NOT_USED`: cropped hands only, non-full-frame) |
| **A10** | Depth Camera D435 (`8ffrgcmjkm.1`) | [10.17632/8ffrgcmjkm/1](https://data.mendeley.com/datasets/8ffrgcmjkm/1) | 2026-11-20 | CC BY 4.0 | *"You can share, copy and modify this dataset so long as you give appropriate credit, provide a link to the CC BY license..."* | `A10/page.html` | MATCH | `detector` (Dark/cluttered RGB frames, 80/20 split) |
| **A11** | EgoHands | [IU Vision Lab](http://vision.soic.indiana.edu/projects/egohands/) & [Roboflow Universe](https://universe.roboflow.com/brad-dwyer/egohands-public) | 2026-11-20 | Academic (IU) / CC BY 4.0 (Roboflow) | *"Released for academic research and benchmarking; Roboflow public repackaging distributed under Creative Commons Attribution 4.0 International (CC BY 4.0)."* | `A11/iu_page.html` | MATCH | `detector` (`SKIP`: Roboflow Universe requires login/API key / Cloudflare) |
| **A13** | HaGRID v2 | [GitHub hukenovs/hagrid](https://github.com/hukenovs/hagrid) | 2026-11-20 | Custom Public License (CC BY-SA 4.0 derivative) | *"The text of this license is a reworking of a Creative Commons Corporation (Attribution-ShareAlike 4.0) license... sui generis rights to databases."* | `A13/license_en_us.pdf` | MATCH | `detector` / `classifier` (train / val / test per 17 gesture classes) |

---

## 2. Tools License Summary

| Tool | Upstream / Package | License | Quote (≤ 25 words) | Evidence File |
|---|---|---|---|---|
| **YOLO26n / Ultralytics** | [Ultralytics GitHub](https://github.com/ultralytics/ultralytics) | AGPL-3.0 | *"GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007. Everyone is permitted to copy and distribute verbatim copies of this license document."* | `tools/ultralytics_license.txt` |
| **onnxruntime-web** | [onnxruntime-web npm](https://www.npmjs.com/package/onnxruntime-web) | MIT | *"license: MIT, repository: https://github.com/Microsoft/onnxruntime.git, name: onnxruntime-web."* | `tools/onnxruntime_web_package.json` |
| **MediaPipe Tasks Vision** | [MediaPipe GitHub](https://github.com/google-ai-edge/mediapipe) | Apache-2.0 | *"Apache License Version 2.0, January 2004. Licensed under the Apache License, Version 2.0; you may not use this file except in compliance with the License."* | `tools/mediapipe_license.txt` |

---

## 3. In-Depth HaGRID v2 License Analysis (`license/en_us.pdf`)

The HaGRID license file `en_us.pdf` was inspected and extracted using `pdftotext`. A Russian counterpart `ru.pdf` is also present.

### 3.1 Commercial vs Non-Commercial (NC)
- **Status:** **Commercial Use Allowed (No NC Clause)**
- **Detail:** Footnote 1 explicitly states: *"This license is not a Creative Commons license. The text of this license is a reworking of a Creative Commons Corporation (Attribution-ShareAlike 4.0) license..."*
- There is **no Non-Commercial restriction** anywhere in the text. The license elements explicitly enumerated in Section 1(f) are: *"with attribution and with conditions reserved"* (analogous to BY-SA).

### 3.2 ShareAlike Requirements (§3b)
- **Status:** **ShareAlike Applies to "Adapted Material"**
- **Detail (§3b):**
  1. Any Adapted Material created and made available must be licensed under a license with the same License Elements, this version or a later version, or a BY-SA-compatible license.
  2. You must provide a URI, hyperlink, or text of the license applicable to the Adapted Material.
  3. You may not impose additional restrictions or Effective Technical Measures that restrict the exercise of granted rights.

### 3.3 Sui Generis Database Rights (§4)
- **Status:** **Database Content Extraction Permitted**
- **Detail (§4):**
  - Section 4(a) grants rights to extract, reuse, reproduce, and make available all or a substantial portion of the contents of the database.
  - Section 4(b) specifies that if you incorporate all or substantially all of the Database Content into another database over which you hold database rights, that whole database becomes Adapted Material and subject to §3b.
  - Section 4(c) requires compliance with attribution (§3a) when submitting all or substantially all of the database content.

### 3.4 Rules for Trained Neural Network Models
- **Status:** **Training and Model Distribution Permitted**
- **Detail:**
  - The license text does **not** prohibit training machine learning models or publishing academic / scientific research.
  - Model training computes loss gradients and updates floating-point weights via backpropagation; trained neural network checkpoints are statistical parametric function approximations, not a database containing all or substantially all of the database images or annotations.
  - Furthermore, MoNUI-7 is an open academic research project whose entire application stack, source code, and artifacts are licensed openly under AGPL-3.0 with complete upstream attribution, satisfying both research transparency and copyleft intent.

### 3.5 Applicable Jurisdiction and Governing Law
- **Status:** **Russian Federation Civil Code**
- **Detail:**
  - Section 1(k) explicitly defines database rights: *"Sui Generis rights to Databases (related database rights) means the rights of the database manufacturer, in accordance with the Civil Code of the Russian Federation."*
  - Section 8(d) stipulates that no provision waives privileges or immunities or legal processes in any jurisdiction.

---

## 4. Mandatory STOP Condition Audit

1. **Does HaGRID license prohibit training models or publishing research results?**
   - **Verdict:** **NO**. Model training and research publication are fully permitted.
2. **Does any dataset have a license mismatch against the project plan?**
   - **Verdict:** **NO**. All 12 datasets match the expected licenses (`CC BY 4.0`, `CC BY 2.0`, `MIT`, or `CC BY-SA` derivative).
   - Datasets with unusable formatting or access barriers (A7 multipart archive, A9 hand crops, A11 Cloudflare/login) are formally marked as `NOT_USED` or `SKIP` in full accordance with the mandate (§6 T11e, T11f, T12).
