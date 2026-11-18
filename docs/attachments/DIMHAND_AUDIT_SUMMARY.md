# External Dataset & License Audit Notes (R18 Reference)

> **Status:** Reference attachment (`AGENTS.md §2–3`), not a plan queue and not a product license approval.

## 1. DimHand (ACM Multimedia 2026)
- **Primary Sources Verified:** Project page (`https://hanlingzhan.github.io/DimHand/`), GitHub repo (`https://github.com/HanlingZhan/DimHand`), supplementary PDF (`supp.pdf`).
- **Status:** **`BLOCKED`** for VM download and product weight training.
- **Scale & Composition:** `745,280` RGB+Depth frames across 5 Intel RealSense D415i viewpoints, 15 subjects, 15 sequential actions (`00`–`14`) in dynamic low-light (`0.1`–`10 lux`).
- **Access Blocker:** No direct public dataset URL; download requires Owner/Researcher manual application form (`api.web3forms.com` / `hanlingzhan@163.com`).
- **License Blocker:** Application terms forbid commercial use and redistribution; `supp.pdf` sections D.4 (`commercial = prohibited`) & D.5 (`external distribution = No`) plus `CC BY-NC-ND 4.0` footer bar commercial distribution of derived model weights.
- **Storage Blocker:** Full RGB+D archive size is unpublished and exceeds the VM's remaining `~4.0–4.8 GiB` free space on `/`.
- **Safe Potential Role (if Owner obtains separate academic access on larger storage):** RGB-only offline failure-analysis benchmark (do NOT feed depth into runtime browser NUI). Zero DimHand files exist on the VM.

## 2. Other External Candidates Verified
| Dataset | License / Access | Verdict for R18 Sandbox |
| --- | --- | --- |
| **IPN HandS** (`annotations`, `GT`, `MPHands`) | `CC BY 4.0` (labels/GT) + MediaPipe `Apache 2.0` | **ADOPTED (`r18/models/ux3_model_*.json`)** — product-safe; official 148/52 split leaks 8 subjects, fixed via `r18/manifests/ipn_person_split.json` (`19/5/5`). |
| **Mendeley `bxr7kx84y6` v2** (`dim_light_1.zip`, `natural_light_1.zip`) | `CC BY 4.0` | **ADOPTED (Eval & UX2)** — 2/24 slices kept (`436 MiB`); real 720p webcam low/natural light hands & board clutter. |
| **HaGRIDv2 (`annotations.zip`, `719 MB`)** | Custom Russian ShareAlike license (`Section 3b/4`, no `-NC`) | **DEFERRED / REQUIRES_OWNER_LEGAL_SIGN_OFF** on ShareAlike obligations before product use; not downloaded on VM due to disk/licensing. Pre-trained R17 `.json` weights are not in Git/VM. |
| **AnyHand (NeurIPS 2026)** | `CC BY-NC-ND 4.0` | **REJECTED** (non-commercial & no-derivatives). |
| **PALM (3DV 2026)** | `CC BY-NC 4.0` + registration | **REJECTED** (non-commercial). |
| **Ego2Hands / DexYCB** | Unclear / `CC BY-NC 4.0`, `~90–119 GB` | **REJECTED** (license & storage infeasible). |
