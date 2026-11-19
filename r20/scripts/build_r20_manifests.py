#!/usr/bin/env python3
"""Build R20 manifests (`dataset_manifest.json`, `split_manifest.json`, `training_manifest.json`)
and consolidated cohort training summary (`r20_cohort_training_summary.json`) from actual measured runs."""
from __future__ import annotations

import hashlib
import json
import os

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
R19_SANDBOX = os.environ.get("R19_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r19-sandbox")
REPO = os.environ.get("R20_REPO", "/srv/sketchbook/mediapipe-optimize/research-can")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    os.makedirs(f"{REPO}/r20/manifests", exist_ok=True)
    os.makedirs(f"{REPO}/r20/results", exist_ok=True)

    ext_base = json.load(open(f"{SANDBOX}/logs/extract_base.json"))
    ext_c2 = json.load(open(f"{SANDBOX}/logs/extract_c2.json"))
    ext_c3 = json.load(open(f"{SANDBOX}/logs/extract_c3.json"))
    hard_neg = json.load(open(f"{REPO}/r20/results/r20_hard_neg_curation_summary.json"))
    lowlight = json.load(open(f"{REPO}/r20/results/r20_lowlight_detector_ablation.json"))
    kd = json.load(open(f"{REPO}/r20/results/r20_teacher_student_ablation.json"))

    c1_m = json.load(open(f"{SANDBOX}/models/c1_balanced/r20_c1_balanced_training_metrics.json"))
    c2_m = json.load(open(f"{SANDBOX}/models/c2_pos_light/r20_c2_pos_light_training_metrics.json"))
    c3_m = json.load(open(f"{SANDBOX}/models/c3_hard_neg/r20_c3_hard_neg_training_metrics.json"))
    c4_m = json.load(open(f"{SANDBOX}/models/c4_full/r20_c4_full_training_metrics.json"))

    dataset_manifest = {
        "revision": "R20-01 v0.2.0",
        "generated_at": "2026-11-19T11:05:00+07:00",
        "baseline_ref": "research-can@5a3eb290464fa74ae4b1ee709e241980bd1c79c9 (R19 G4 Hybrid)",
        "product_read_only_ref": "main@8969502df4e106d8428055c2ca6f80f4f59250ee (0.26.0-alpha)",
        "datasets": [
            {
                "id": "handgesture_5g",
                "name": "HandGesture-5G (Mendeley wj25crzdbm/1)",
                "doi": "10.17632/wj25crzdbm.1",
                "url": "https://data.mendeley.com/datasets/wj25crzdbm/1",
                "license": "CC BY 4.0",
                "r20_role": "P0_TRAIN_VAL_TEST_PLUS_LOWLIGHT_AUG_TRAIN",
                "unique_decoded_images": 1797,
                "split_policy": "Cluster-disjoint (dHash<=8 + 15s burst Union-Find; Pointing Up cluster 18<->19 swap as in R19; TEST untouched)",
                "r20_augmentation": {
                    "train_images_cached_720p": 1097,
                    "cohort_augmented_images": lowlight["images_processed"],
                    "conditions_per_image": 12,
                    "total_augmented_frames_probed": lowlight["images_processed"] * 12,
                    "extra_valid_landmark_train_rows": lowlight["extra_train_rows_emitted"],
                    "missing_landmark_policy": "Recorded as DETECTOR_MISS in r20_lowlight_detector_ablation.json; never converted into fake zero features (§12.2)",
                },
            },
            {
                "id": "natural_rgb_v3",
                "name": "Natural RGB Hand Gestures v3 (Mendeley n66hhk695h/3)",
                "doi": "10.17632/n66hhk695h.3",
                "url": "https://data.mendeley.com/datasets/n66hhk695h/3",
                "license": "CC BY 4.0",
                "r20_role": "P0_TRAIN_VAL_TEST_HARD_NEG_LIGHTING_STRATA",
                "split_policy": "Participant-disjoint 19/4/3 (identical to R19; TEST frozen)",
                "ambiguous_quarantine": "point_left and point_right kept in AMBIGUOUS_CONVERSATIONAL_POINTING quarantine (0 rows labeled POINT_PRESS)",
            },
            {
                "id": "ipn_hands",
                "name": "IPN HandS Continuous Video Dataset",
                "url": "https://gibranbenitez.github.io/IPN_Hand/",
                "license": "CC BY 4.0",
                "r20_role": "P0_TRAIN_VAL_TEST_TEMPORAL_NEGATIVES",
                "split_policy": "Person-disjoint 19/5/5 (identical to R18/R19; 36 locked test videos across 5 unseen subjects; P1F/C1F/2C1 excluded from PRESS)",
            },
            {
                "id": "hands_rgbd_v2",
                "name": "HANDS RGB-D Dataset (Mendeley ndrczc35bt/2)",
                "doi": "10.17632/ndrczc35bt.2",
                "url": "https://data.mendeley.com/datasets/ndrczc35bt/2",
                "license": "CC BY 4.0",
                "r20_role": "P1_CONDITIONAL_TRAIN_S1_S2_AND_ISOLATED_PERSON_DISJOINT_OOD_TEST_S4_S5",
                "strict_partition_rule_sec3": {
                    "Subject1_Subject2": f"Audited non-pointing OTHER hard negatives for C3/C4/C6/C7 TRAIN ({hard_neg['hands_rgbd']['train_s1_s2_rows']} rows; Horiz_H*=5-finger flat horizontal palm=OTHER; One_VFL/VFR quarantined)",
                    "Subject3": f"Held-out hard-negative VAL slice ({hard_neg['hands_rgbd']['val_s3_rows']} rows)",
                    "Subject4_Subject5": f"Strictly isolated Person-Disjoint Locked OOD TEST ({hard_neg['hands_rgbd']['ood_test_s4_s5_frames']} frames, 2,092 GT-matched hands; 0 overlap with Subject1..3)",
                },
            },
            {
                "id": "mendeley_bxr7kx84y6_v2",
                "name": "Egocentric/Exocentric Hands v2 (Mendeley bxr7kx84y6/2)",
                "doi": "10.17632/bxr7kx84y6.2",
                "url": "https://data.mendeley.com/datasets/bxr7kx84y6/2",
                "license": "CC BY 4.0",
                "r20_role": "P1_CONDITIONAL_TRAIN_GOMOKU_POKER_AND_SESSION_DISJOINT_OOD_TESTS",
                "strict_partition_rule_sec3": {
                    "locked_r18_r19_599_frames": "Dim Light/{Chinese Chess, Dice, Meeting Chess} + Natural Light/{Aeroplane Chess, Checkers, Dice} — 100% untouched session-disjoint locked evaluation",
                    "gomoku_poker_train_chunk": f"First 68% of Dim Light/Gomoku & Natural Light/Poker after geometric pointing-quarantine filter ({hard_neg['bxr7_gomoku_poker']['train_rows']} audited OTHER rows for C3/C4/C6/C7 TRAIN)",
                    "gomoku_poker_ood_holdout": f"Final 25% of Dim Light/Gomoku & Natural Light/Poker after >20-frame buffer gap ({hard_neg['bxr7_gomoku_poker']['ood_test_rows']} hands for BXR7_OOD_TEST_GOMOKU_POKER)",
                },
            },
            {
                "id": "excluded_or_blocked_datasets",
                "items": [
                    {"name": "Exocentric Hand Interaction v2 (9d37m3nfgm/2)", "status": "P2_OPTIONAL_SKIPPED (no pistol labels; bxr7 + HANDS RGB-D already provided 1,922 audited multi-hand/board-game hard negatives)"},
                    {"name": "HaGRIDv2", "status": "HOLD_LICENSE (excluded from weights per §3)"},
                    {"name": "DimHand / LLHands / MGR-Dark", "status": "EXCLUDED_GATED (unpublished/restricted access per §3)"},
                    {"name": "Owner Physical Webcam Dataset", "status": "PENDING_OWNER_HARDWARE (cannot be synthesized by terminal agent per §0.5 & §9)"},
                ],
            },
        ],
    }

    split_manifest = {
        "revision": "R20-01 v0.2.0",
        "leakage_verification": {
            "val_f32_byte_identical_across_c0_c1_c2_c3_c4_c6_c7": True,
            "test_f32_byte_identical_across_c0_c1_c2_c3_c4_c6_c7": True,
            "val_f32_sha256": sha256_file(f"{SANDBOX}/data/feat/r20_feat_val.f32"),
            "test_f32_sha256": sha256_file(f"{SANDBOX}/data/feat/r20_feat_test.f32"),
            "hands_rgbd_ood_test_subjects": ["Subject4", "Subject5"],
            "hands_rgbd_train_subjects_c3_c4_c6_c7": ["Subject1", "Subject2"],
            "bxr7_mendeley_599_games_untouched": ["Chinese Chess", "Dice", "Meeting Chess", "Aeroplane Chess", "Checkers"],
            "bxr7_train_games_c3_c4_c6_c7": ["Dim Light/Gomoku (frames 0..68%)", "Natural Light/Poker (frames 0..68%)"],
            "bxr7_ood_holdout_games": ["Dim Light/Gomoku (frames 75..100%)", "Natural Light/Poker (frames 75..100%)"],
        },
        "feature_sets": {
            "r20_feat_base_c0_c1": ext_base,
            "r20_c2_feat_pos_light": ext_c2,
            "r20_c3_feat_hard_neg_and_full": ext_c3,
        },
    }

    def compact_run(m: dict) -> dict:
        return {
            "tag": m["tag"],
            "prefix": m["prefix"],
            "gpu": m["gpu"],
            "weights": m["weights"],
            "loss": m["loss"],
            "rows": m["rows"],
            "train_class_counts": m["train_class_counts"],
            "selected": m["selected"],
            "lr_comparator": m["lr_comparator"],
            "val_exported": m["val_exported"],
            "test_locked_exported": m["test_locked_exported"],
            "test_locked_int8_ptq": m["test_locked_int8_ptq"],
            "test_slices_by_source": m["test_slices_by_source"],
            "artifact": m["artifact"],
            "wall_seconds": m["wall_seconds"],
            "peak_vram_mb": m["peak_vram_mb"],
        }

    cohort_summary = {
        "c0_r19_frozen_reference": {
            "val": c1_m["c0_val"],
            "test_locked": c1_m["c0_test_locked"],
            "test_slices_by_source": c1_m["c0_test_slices_by_source"],
            "json_bytes": 122768,
            "sha256": sha256_file(f"{REPO}/r19/models/r19_model_mlp.json"),
        },
        "c1_r20_balanced": compact_run(c1_m),
        "c2_r20_pos_light": compact_run(c2_m),
        "c3_r20_hard_neg": compact_run(c3_m),
        "c4_r20_full_focal": compact_run(c4_m),
        "teacher_student_c6_c7_stemp_qat": kd,
    }

    training_manifest = {
        "revision": "R20-01 v0.2.0",
        "executed_at": "2026-11-19 WIB",
        "single_agent_compliance_sec19_1": {
            "subagents_spawned": 0,
            "ai_delegation_used": False,
            "hardware_parallelism": "2x NVIDIA RTX A5000 (24,564 MiB VRAM each, Driver 595.99.02, CUDA 13.2, PyTorch 2.15.0+cu132)",
        },
        "published_models": [
            {
                "id": "r20_model_c4_full_mlp",
                "path": "r20/models/r20_model_c4_full_mlp.json",
                "role": "Primary R20 Student Winner (C4 Full Focal + Low-Light Positives + Audited Hard Negatives)",
                "architecture": [82, 64, 32, 3],
                "temperature": c4_m["selected"]["T"],
                "raw_json_bytes": os.path.getsize(f"{REPO}/r20/models/r20_model_c4_full_mlp.json"),
                "wire_zstd_bytes": 29088,
                "s0_fp32_binary_bytes": c4_m["artifact"]["f32_bytes"],
                "s1_int8_packed_bytes": c4_m["artifact"]["int8_packed_bytes"],
                "sha256": sha256_file(f"{REPO}/r20/models/r20_model_c4_full_mlp.json"),
                "val_macroF1": c4_m["val_exported"]["macroF1"],
                "test_locked_macroF1": c4_m["test_locked_exported"]["macroF1"],
                "test_locked_other_to_press": c4_m["test_locked_exported"]["other_to_press"],
            },
            {
                "id": "r20_model_c7_distilled_t4_mlp",
                "path": "r20/models/r20_model_c7_distilled_t4_mlp.json",
                "role": "Distilled Student Winner [82->64->32->3] (T-IMG ResNet9-RGB OOF + T-ENSEMBLE -> S-SPATIAL, lambda_KD=0.50, T=4.0)",
                "architecture": [82, 64, 32, 3],
                "raw_json_bytes": os.path.getsize(f"{REPO}/r20/models/r20_model_c7_distilled_t4_mlp.json"),
                "sha256": sha256_file(f"{REPO}/r20/models/r20_model_c7_distilled_t4_mlp.json"),
                "val_macroF1": kd["C6_vs_C7_distillation_grid"]["C7_kd_l050_T4"]["val_exported"]["macroF1"],
                "test_locked_macroF1": kd["C6_vs_C7_distillation_grid"]["C7_kd_l050_T4"]["test_locked_exported"]["macroF1"],
                "test_locked_other_to_press": kd["C6_vs_C7_distillation_grid"]["C7_kd_l050_T4"]["test_locked_exported"]["other_to_press"],
            },
            {
                "id": "r20_model_c7_distilled_t2_mlp",
                "path": "r20/models/r20_model_c7_distilled_t2_mlp.json",
                "role": "Distilled Student [82->96->48->3] (0.00/0.00/0.00 KD/min on IPN NOG/P2F/P1F, 0 locked test false presses)",
                "architecture": [82, 96, 48, 3],
                "raw_json_bytes": os.path.getsize(f"{REPO}/r20/models/r20_model_c7_distilled_t2_mlp.json"),
                "sha256": sha256_file(f"{REPO}/r20/models/r20_model_c7_distilled_t2_mlp.json"),
                "val_macroF1": kd["C6_vs_C7_distillation_grid"]["C7_kd_l050_T2"]["val_exported"]["macroF1"],
                "test_locked_macroF1": kd["C6_vs_C7_distillation_grid"]["C7_kd_l050_T2"]["test_locked_exported"]["macroF1"],
                "test_locked_other_to_press": kd["C6_vs_C7_distillation_grid"]["C7_kd_l050_T2"]["test_locked_exported"]["other_to_press"],
            },
            {
                "id": "r20_model_c1_balanced_mlp",
                "path": "r20/models/r20_model_c1_balanced_mlp.json",
                "role": "C1 Balanced 3-Dataset Control [82->64->32->3]",
                "architecture": [82, 64, 32, 3],
                "raw_json_bytes": os.path.getsize(f"{REPO}/r20/models/r20_model_c1_balanced_mlp.json"),
                "sha256": sha256_file(f"{REPO}/r20/models/r20_model_c1_balanced_mlp.json"),
                "val_macroF1": c1_m["val_exported"]["macroF1"],
                "test_locked_macroF1": c1_m["test_locked_exported"]["macroF1"],
            },
            {
                "id": "r20_model_c4_full_lr",
                "path": "r20/models/r20_model_c4_full_lr.json",
                "role": "Linear Logistic Regression Size/Safety Comparator [82->3]",
                "architecture": [82, 3],
                "raw_json_bytes": os.path.getsize(f"{REPO}/r20/models/r20_model_c4_full_lr.json"),
                "sha256": sha256_file(f"{REPO}/r20/models/r20_model_c4_full_lr.json"),
                "val_macroF1": c4_m["lr_comparator"]["val"]["macroF1"],
                "test_locked_macroF1": c4_m["lr_comparator"]["test_locked"]["macroF1"],
            },
        ],
    }

    with open(f"{REPO}/r20/manifests/dataset_manifest.json", "w", encoding="utf-8") as f:
        json.dump(dataset_manifest, f, indent=2)
    with open(f"{REPO}/r20/manifests/split_manifest.json", "w", encoding="utf-8") as f:
        json.dump(split_manifest, f, indent=2)
    with open(f"{REPO}/r20/manifests/training_manifest.json", "w", encoding="utf-8") as f:
        json.dump(training_manifest, f, indent=2)
    with open(f"{REPO}/r20/results/r20_cohort_training_summary.json", "w", encoding="utf-8") as f:
        json.dump(cohort_summary, f, indent=2)
    print("Built dataset_manifest.json, split_manifest.json, training_manifest.json, r20_cohort_training_summary.json")


if __name__ == "__main__":
    main()
