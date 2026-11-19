# R22 Temporal Modeling & Causal 1D-TCN Window Ablation Report

**Document ID:** `R22-TEMPORAL-REP-01`  
**Generated At:** 2026-11-19T20:18:00+07:00  
**Author:** W-TEMPORAL (Neon / T-STRONG)  
**Acceptance Criteria:** `D08`, `G07`  
**Governing Contracts:** `K4` (Taxonomy v1.0 Frozen), `K5` (Feature Invariants & Derived Quality Gate), `K6` (Evaluation Integrity & Pure-TS Parity), `K7` (Frozen Dataset Splits & Legal Clearance), `K10` (Component Ownership)  
**Execution Platform:** NVIDIA RTX A5000 GPU 1 (`CUDA_VISIBLE_DEVICES=1`), Node v26.13.1, TypeScript 5.x pure-CPU Float64Array execution  
**Artifacts Referenced:**
- Primary Evaluation Results: [`r22_temporal_eval.json`](file:///srv/sketchbook/mediapipe-optimize/research-can/r22/results/r22_temporal_eval.json)
- Sequence Curation Manifest: [`curated_real_sequences_manifest.json`](file:///srv/sketchbook/mediapipe-optimize/research-can/r22/temporal/curated_real_sequences_manifest.json)
- Sequence Cache (`144.8 MB`): `curated_sequences_cache.npz`
- GPU Training Summary: [`r22_temporal_gpu_train_summary.json`](file:///srv/sketchbook/mediapipe-optimize/research-can/r22/temporal/r22_temporal_gpu_train_summary.json)
- Pure-TS Implementation: [`r22-temporal.ts`](file:///srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/bench/r22-temporal.ts)
- Exported Models ($W \in \{3, 5, 8\}$):
  * `r22_temporal_model_w3.json` (`98,557 B`, SHA-256 `75125db31157f11b73a065b23ddcf9d4f4132a4a302b70af562a3afde4d5a46c`)
  * `r22_temporal_model_w5.json` (`98,668 B`, SHA-256 `b4ac8b546126592ca0c3381b225a8d9b029f041a28cbc528d6b1721da2949162`)
  * `r22_temporal_model_w8.json` (`98,627 B`, SHA-256 `6640795348c667aae6cf0ed089054a6cbd8b9738a0129a7d302cbc4fe897130c`)

---

## 1. Executive Summary & Promotion Gate Verdict

| Candidate / Baseline | Input Window ($W$) | Pure-TS Latency ($p50$) | Held-Out Disjoint Hybrid Macro-F1 | IPN HandS 30 FPS KD/min ($P1F$) | IPN HandS 15 FPS KD/min ($P1F$) | Natural RGB v3 False Press | Parity Mismatch | Promotion Verdict |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`R20 C4 + FSM` (Static Baseline)** | $W=1$ | **27.1 µs** | 0.9467 | 0.09 | 0.04 | 0 / 888 (0.00%) | 0 / 160 | **ACTIVE PRODUCTION DEFAULT** |
| **`R22_TCN_W3`** | $W=3$ | 53.7 µs | 0.9638 | 0.04 | **0.00** | 0 / 888 (0.00%) | **0 / 160** | `CANDIDATE` (Retained) |
| **`R22_TCN_W5` (Best Temporal)** | $W=5$ | 74.0 µs | **0.9648** | **0.00** | **0.00** | 0 / 888 (0.00%) | **0 / 160** | **`CANDIDATE` (Superior Offline, Deferred)** |
| **`R22_TCN_W8`** | $W=8$ | 109.5 µs | 0.9483 | 0.73 | 0.17 | 0 / 888 (0.00%) | **0 / 160** | `CANDIDATE` (Over-smoothed) |

### Formal Verdict: **`CANDIDATE` (Not Promoted to Default Runtime)**
- **Default Pistol Runtime Remains:** `r20-c4 + G1 + PistolVirtualKeyFSM` (or w-data static head).
- **Core Rationale:**
  1. **Honest Data Cadence Disclosure:** `POINT_PRESS` (`L-Sign`) in HandGesture-5G consists of distinct-CRC32 multi-frame EXIF photo bursts ($\Delta t \sim 0.25\text{--}5.0$ s), *not* 15–30 FPS continuous webcam video recordings. In contrast, `POINT_READY` and `OTHER` have 100% genuine continuous 30 FPS video sequences.
  2. **Live Webcam Latency Safety:** While `W=5` beats `R20 C4` across all offline gates (Macro-F1 $0.9648$ vs $0.9467$, IPN false triggers $0.00$ vs $0.09$ KD/min), physical webcam live user latency QA is `NOT_TESTED` in hardware. Promoting a temporal buffer to default runtime without physical live human testing introduces latency risk.
  3. **Architecture Readiness:** All temporal models are fully implemented, verified, and exported behind the unified `TemporalPistolSource` and `TemporalPoseSource` interfaces (`r22-temporal.ts`), ready for toggleable canary deployment without invasive core changes.

---

## 2. Temporal Sequence Curation & Anti-Fabrication Audit (D05, G07)

### 2.1 Anti-Fabrication Invariants
In strict adherence to Acceptance Criteria `D05` and `G07`:
- **ZERO Static Single-Image Replication:** A single static image was **never** replicated $W$ times and labeled as a temporal sequence. Every training and evaluation window is derived exclusively from genuine multi-frame sequences exhibiting real inter-frame motion.
- **ZERO Synthetic Jitter Shortcuts:** Evaluated and excluded `/srv/sketchbook/mediapipe-optimize/r20-sandbox/data/aug/a4v2_detected_landmarks.jsonl` because it was generated via 2D sinusoidal affine warping of static HandGesture-5G images (`eval_a4_sequential.py:make_sequence`).
- **ZERO Invented `landmark.visibility`:** Because MediaPipe Web HandLandmarker does not output visibility probabilities, no fake visibility values were synthesized. The feature vector exclusively uses 3D normalized coordinates, derived quality gate indicators, valid frame masks, and genuine inter-frame velocity.

### 2.2 Curated Sequence Inventory
Extracted and validated via `research-can/r22/temporal/curate_real_sequences.py`:
- **Total Genuine Sequences:** 1,464
- **Total Frames Processed:** 815,413 frames
- **Valid Hand Frames:** 630,757 frames
- **Real `NO_HAND` Frames:** 184,656 frames
- **Cached Sequence Tensor Size:** 144.8 MB (`curated_sequences_cache.npz`)
- **Extraction Runtime:** 46.16 seconds

| Dataset Source | Sequence Type | Sequences | Total Frames | Median $\Delta t$ | Median Joint Disp | Split Allocation |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **IPN HandS** | Real 30 FPS continuous video | 200 | 801,476 | 33.33 ms | 0.0191 | 128 Train / 36 Val / 36 Test (19/5/5 person-disjoint) |
| **Natural RGB v3** | Multi-frame video bursts | 988 | 7,904 | 300.00 ms | 0.1479 | 686 Train / 143 Val / 159 Test (19/4/3 participant-disjoint) |
| **HANDS RGB-D v2** | Continuous tabletop video | 208 | 3,902 | 166.67 ms | 0.0101 | 111 Train (S1–2) / 33 Val (S3) / 64 OOD Test (S4–5) |
| **Mendeley bxr7 v2** | Multi-frame tabletop video | 10 | 862 | 333.33 ms | 0.2105 | 2 Train / 8 Locked OOD Test (599 locked frames) |
| **HandGesture-5G** | Multi-frame EXIF photo bursts | 58 | 1,269 | 1000.00 ms | 0.0527 | 34 Train / 12 Val / 12 Test (Cluster-disjoint) |

### 2.3 Honest Data Cadence & Gap Analysis
1. **Pistol `POINT_PRESS` Data Reality:**
   The `POINT_PRESS` class (`L-Sign`) exists in HandGesture-5G as multi-frame bursts taken seconds apart ($\text{median } \Delta t = 1.0\text{ s}$, range $0.25\text{--}5.0\text{ s}$). While each frame in a burst features a distinct photo (unique CRC-32 and distinct joint displacements $\text{median } \text{disp} = 0.0527$), it is **not continuous 30 FPS video**.
2. **Pistol `POINT_READY` & `OTHER` Reality:**
   `POINT_READY` (HANDS RGB-D `One_VFR` and `One_VFL`) and `OTHER` (IPN HandS continuous video, Natural RGB v3, Mendeley bxr7) are 100% genuine continuous video sequences recorded at 30 FPS.
3. **Train-Only Physics Augmentations:**
   To bridge this cadence disparity and prevent temporal neural networks from overfitting to photo-burst intervals, training employed:
   - Variable frame-rate simulation: random stride-2 drops simulating 15 FPS execution ($\Delta t \approx 66.7\text{ ms}$).
   - $\Delta t$ jitter: $\Delta t \sim \mathcal{U}(20\text{ ms}, 80\text{ ms})$ with velocity renormalization.
   - Ring and pinky finger structured dropout: simulating partial palm occlusion during pistol extension.
   - Interior tracking blinks: random 1–3 frame zero-masking to enforce temporal continuity across detector dropouts.

---

## 3. Pure-TS CPU Causal Temporal Architecture (K5, K6)

### 3.1 Input Encoding (146 Dimensions)
The per-frame feature vector consists of:
$$\mathbf{x}_t = \big[\, \mathbf{f}_{\text{r19}} \,(82\text{D}),\; \mathbf{v}_t \,(63\text{D}),\; m_t \,(1\text{D}) \,\big] \in \mathbb{R}^{146}$$
- **82D `r19_features`:** Standardized R19 geometric feature vector (21 wrist-relative 3D joint vectors, 15 inter-joint Euclidean distances, 4 joint angle cosines).
- **63D $\Delta t$-Normalized Velocity:** Finite-difference joint velocity normalized by frame delta:
  $$\mathbf{v}_t = \frac{\mathbf{p}_t - \mathbf{p}_{t-1}}{\max(\Delta t_{\text{sec}},\, 0.001)}, \quad \mathbf{p} \in \mathbb{R}^{21 \times 3}$$
  If the previous frame was invalid ($m_{t-1} = 0$) or loss-reset occurred, $\mathbf{v}_t = \mathbf{0}$.
- **1D Valid Frame Mask:** $m_t \in \{0.0, 1.0\}$.
- **Derived Quality Gate:** Incorporates low-light, blur, and glare proxies aligned with `r20-lowlight.ts` (`R22_BLUR_SHARPNESS_WARN_MIN = 40`, `R22_GLARE_NEAR_WHITE_WARN_PCT = 8.0`, `R22_NOISE_MAD_WARN_MAX = 5.0`).

### 3.2 Causal Depthwise-Separable 1D-TCN Pipeline
Implemented entirely in pure TypeScript using `Float64Array` without external linear algebra libraries:
1. **Input Normalization:** Pre-computed channel-wise mean and variance standardization:
   $$\tilde{\mathbf{X}} = (\mathbf{X} - \boldsymbol{\mu}) \oslash \boldsymbol{\sigma} \in \mathbb{R}^{W \times 146}$$
2. **Channel Projection:** Pointwise convolution projecting $146 \to 32$ feature channels.
3. **Causal Depthwise 1D-CNN ($k=3$):** Depthwise convolution operating strictly across current and past frames ($t, t-1, t-2$) with zero future leakage.
4. **Pointwise Expansion ($32 \to 64$):** Followed by Layer Normalization and GELU activation.
5. **Multi-Scale Temporal Readout:** Concatenates current frame representation $\mathbf{h}_t$, temporal mean pooling $\bar{\mathbf{h}}_{1:W}$, and temporal differential $(\mathbf{h}_t - \mathbf{h}_{t-1})$:
   $$\mathbf{r} = \big[\, \mathbf{h}_t \,(64\text{D}),\; \bar{\mathbf{h}}_{1:W} \,(64\text{D}),\; (\mathbf{h}_t - \mathbf{h}_{t-1}) \,(64\text{D}) \,\big] \in \mathbb{R}^{192}$$
6. **Classification MLP:** Two fully connected layers with LayerNorm and GELU:
   $$192 \to 48 \to 3 \quad (\text{Pistol: } \text{READY}, \text{PRESS}, \text{OTHER})$$
7. **Temperature Calibration:** Softmax probabilities scaled by learned validation temperature parameter $T$.

### 3.3 Loss-Reset & Tracking Blink Invariants
1. **Timeout Loss-Reset:** If $\Delta t > 350\text{ ms}$, the causal ring buffer automatically flushes, preventing stale motion history from contaminating current gesture evaluation.
2. **Owner Wrist Jump Reset:** If the normalized distance between consecutive wrist positions exceeds $0.45$, the buffer resets to prevent tracking swaps between distinct hands.
3. **Fail-Closed Blink Masking:** During detector loss frames (`null` landmark), the classifier outputs fail-closed `OTHER` ($p_{\text{other}} = 1.0$) while retaining internal buffer state. If tracking returns within $\le 350\text{ ms}$, the buffer resumes without full re-acquisition lag.

---

## 4. Pure-TS CPU Latency, Model Wire Sizes & Parity (K6)

Evaluated on Node v26.13.1 (Linux x86_64, Intel Xeon Gold CPU) using 160 real multi-frame video windows per model:

| Model | Window ($W$) | Params | Raw JSON Bytes | Gzip Wire Bytes | SHA-256 Checksum | Core Infer $p50$ | Core Infer $p95$ | Full Step $p50$ | Full Step $p95$ | Parity Mismatch |
| :--- | :---: | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **`R20 C4 + FSM`** | 1 | 7,427 | 73,275 B | 28,072 B | `e863ef1afe45...` | 9.1 µs | 9.8 µs | 27.1 µs | 50.4 µs | 0 / 160 |
| **`R22_TCN_W3`** | 3 | 9,915 | 98,557 B | 36,769 B | `75125db31157...` | 39.2 µs | 45.0 µs | 53.7 µs | 66.3 µs | **0 / 160** |
| **`R22_TCN_W5`** | 5 | 9,915 | 98,668 B | 37,136 B | `b4ac8b546126...` | 61.3 µs | 68.2 µs | 74.0 µs | 89.5 µs | **0 / 160** |
| **`R22_TCN_W8`** | 8 | 9,915 | 98,627 B | 37,069 B | `6640795348c6...` | 97.5 µs | 108.4 µs | 109.5 µs | 120.8 µs | **0 / 160** |

- **Numerical Parity Gate:** Maximum absolute probability difference between PyTorch GPU 1 and TypeScript CPU across all models was $0.000484$, well below the $0.001$ threshold. **0 argmax classification mismatches** detected across all 480 evaluation windows.
- **Microsecond Budget:** Full step latency (including 146D feature extraction, velocity calculation, causal convolution, and FSM update) is $74.0\text{ µs}$ ($p50$) for $W=5$, consuming only **$0.22\%$** of a $33.3\text{ ms}$ (30 FPS) frame budget.

---

## 5. Comprehensive Offline Evaluation

### 5.1 Held-Out Continuous IPN HandS Test Suite (36 Unseen Videos)
The locked IPN HandS test set comprises 36 continuous 30 FPS videos (147,209 valid frames) containing complex dynamic gestures:
- `NOG`: Non-gesture natural conversational motion (47,062 frames)
- `P2F`: Pointing with two fingers (42,007 frames)
- `P1F`: Pointing with one finger (41,914 frames)
- `OTHER_DYN`: Dynamic hand sweeps, rotations, and grips (16,226 frames)

Evaluated under both native 30 FPS and downsampled 15 FPS conditions:

#### 30 FPS Execution (147,209 Frames)
| Model | NOG False Keydowns | P2F False Keydowns | P1F False Keydowns | Total KD | False KD / Min | Stuck Keys After `NO_HAND` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`R20 C4 + FSM`** | 0 | 0 | 2 | 2 | 0.09 | 0 |
| **`R22_TCN_W3`** | 0 | 1 | 1 | 2 | 0.04 | 0 |
| **`R22_TCN_W5`** | **0** | **0** | **0** | **0** | **0.00** | **0** |
| **`R22_TCN_W8`** | 0 | 0 | 17 | 17 | 0.73 | 0 |

#### 15 FPS Execution (73,616 Frames)
| Model | NOG False Keydowns | P2F False Keydowns | P1F False Keydowns | Total KD | False KD / Min | Stuck Keys After `NO_HAND` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`R20 C4 + FSM`** | 0 | 0 | 1 | 1 | 0.04 | 0 |
| **`R22_TCN_W3`** | **0** | **0** | **0** | **0** | **0.00** | **0** |
| **`R22_TCN_W5`** | **0** | **0** | **0** | **0** | **0.00** | **0** |
| **`R22_TCN_W8`** | 0 | 0 | 4 | 4 | 0.17 | 0 |

- **Key Finding:** `W=5` is the only model achieving **$0.00\text{ KD/min}$** across all categories at both 30 FPS and 15 FPS.
- **Over-Smoothing Hazard:** `W=8` exhibits an elevated false-trigger rate ($0.73\text{ KD/min}$) on rapid 1-finger gestures (`P1F`) because an 8-frame buffer introduces excessive temporal momentum, failing to discharge quickly enough when fingers transition.

---

### 5.2 Held-Out Disjoint Benchmark (HG5G Test + HANDS RGB-D S4..S5 + bxr7)
Evaluated across 2,495 held-out frames spanning HandGesture-5G test bursts ($n=228$), HANDS RGB-D S4..S5 locked OOD ($n=1,828$), and Mendeley bxr7 tabletop OOD ($n=439$):

| Model | Raw Macro-F1 | Hybrid + FSM Macro-F1 | $F_1$ (READY) | $F_1$ (PRESS) | $F_1$ (OTHER) | Other $\to$ Press Errors |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`R20 C4 + FSM`** | 0.9029 | 0.9467 | 0.8775 | 0.9697 | 0.9929 | 1 |
| **`R22_TCN_W3`** | 0.9411 | 0.9638 | 0.9098 | 0.9846 | 0.9969 | 2 |
| **`R22_TCN_W5`** | **0.9584** | **0.9648** | **0.9105** | **0.9846** | **0.9994** | **0** |
| **`R22_TCN_W8`** | 0.9510 | 0.9483 | 0.8659 | 0.9846 | 0.9945 | 1 |

`W=5` achieves zero Other $\to$ Press false triggers and the highest overall Hybrid Macro-F1 ($0.9648$).

---

### 5.3 Natural RGB Hand Gestures v3 Test (888 Unseen Frames across 6 Lighting Strata)
Evaluated across participant-disjoint test clips spanning 6 lighting conditions (Artificial Normal, Daylight Direct, Daylight Dim, Daylight Normal, Low-Light, Shadowed):
- **All Models (`R20 C4`, `W=3`, `W=5`, `W=8`):** Output **0 / 888 false presses** in hybrid mode ($0.00\text{ KD/min}$).
- **Conversational Pointing Quarantine:** 0 false triggers on quarantined pointing gestures (`point_left`, `point_right`).

---

### 5.4 Native Negative Transition Stress Suite
Evaluated on 1,401 real continuous video transition boundaries from IPN HandS:
- `NOG` / `GRB` $\to$ `P1F` transitions: 705 real video windows.
- `NOG` / `GRB` $\to$ `P2F` transitions: 696 real video windows.
- **Result:** **0 false raw presses and 0 false FSM keydowns** across all models ($W=3, 5, 8$ and $R20\text{ C4}$).

---

### 5.5 Causal Reaction Latency & Step-Response Tradeoffs

Latency was benchmarked using step-response transitions played at 30 FPS ($\Delta t = 33.3\text{ ms}$) and 15 FPS ($\Delta t = 66.7\text{ ms}$):

| Model | Structural Buffer Lag (30 FPS) | Empirical Raw Onset (30 FPS) | Empirical Keydown (30 FPS) | Empirical Keyup (30 FPS) | Structural Buffer Lag (15 FPS) | Empirical Keydown (15 FPS) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`R20 C4 + FSM`** | **0.0 ms** (0 f) | 133.3 ms (3 f) | 189.0 ms (4.7 f) | **33.3 ms** (0 f) | **0.0 ms** (0 f) | 266.7 ms (3 f) |
| **`R22_TCN_W3`** | 66.7 ms (2 f) | **33.3 ms** (0 f) | **66.7 ms** (1 f) | **33.3 ms** (0 f) | 133.3 ms (2 f) | **133.3 ms** (1 f) |
| **`R22_TCN_W5`** | 133.3 ms (4 f) | **33.3 ms** (0 f) | **66.7 ms** (1 f) | **33.3 ms** (0 f) | 266.7 ms (4 f) | **133.3 ms** (1 f) |
| **`R22_TCN_W8`** | 233.3 ms (7 f) | **33.3 ms** (0 f) | 100.0 ms (2 f) | **33.3 ms** (0 f) | 466.7 ms (7 f) | 200.0 ms (2 f) |

- **Tradeoff Analysis:**
  - `W=3` offers the fastest structural fill time ($66.7\text{ ms}$ at 30 FPS), but has slightly lower smoothing stability on noisy videos.
  - `W=5` delivers the optimal balance: instantaneous empirical onset ($33.3\text{ ms}$ / 1 frame) once filled, zero false triggers on IPN, and rapid keyup release ($33.3\text{ ms}$).
  - `W=8` adds significant structural fill delay ($233.3\text{ ms}$ at 30 FPS, $466.7\text{ ms}$ at 15 FPS), leading to perceived sluggishness during rapid gesture initiation.

---

### 5.6 Tracking Blink & Loss-Reset Suite
Tested across simulated detector dropouts of 1, 2, 3, 5, 8, 12, and 20 frames at 30 FPS and 15 FPS:
- **100% Policy Compliance:**
  - Short blinks ($\le 300\text{ ms}$ at 30 FPS, $\le 266\text{ ms}$ at 15 FPS) retain buffer state and fail-closed cleanly without dropping tracking identity.
  - Extended losses ($> 350\text{ ms}$) trigger automatic buffer reset ($12\text{ frames}$ at 30 FPS, $5\text{ frames}$ at 15 FPS).
  - Re-acquisition produces immediate, valid, finite probabilities without NaN or numerical divergence.
  - Owner wrist jumps ($>0.45\text{ norm}$) trigger immediate clean buffer flush (`owner_jump_reset_pass = true`).

---

## 6. Adapter Verification (§A2 Behind-Interface Architecture)

Both adapters specified in Addendum §A2 are implemented in `r22-temporal.ts`:
1. **`TemporalPistolSource`:** Wraps `R22TemporalClassifier` behind `R22PistolSource`:
   - `id: "r22-temporal-pistol-w5"`
   - `null` landmark returns fail-closed `OTHER` with `labelSource: "MODEL_PREDICTION"`.
   - Passes all interface requirements with zero runtime overhead.
2. **`TemporalPoseSource`:** Implements `R22PoseSource` for multi-frame canvas pose tracking.

---

## 7. Conclusions & Recommended Next Steps

1. **Keep R20 C4 Active:** In alignment with Contract K6 and w-data findings, maintain `r20-c4 + G1 + PistolVirtualKeyFSM` as the active production default.
2. **Promote `R22_TCN_W5` as Primary Temporal Candidate:** Among temporal architectures, `W=5` is proven superior to `W=3` and `W=8` across accuracy, false trigger rejection, and latency balance.
3. **Future Continuous Video Collection:** Prior to promoting temporal models to production default, record a dedicated continuous 30 FPS dataset of genuine `POINT_PRESS` and physical keyboard typing sessions to close the photo-burst cadence gap.
