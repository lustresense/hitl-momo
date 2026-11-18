#!/usr/bin/env python3
"""Build consolidated R19 Stage P1 data_curation_summary.json and .md from verified curated datasets."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from typing import Any

SANDBOX = "/srv/sketchbook/mediapipe-optimize/r19-sandbox"
DATA_DIR = os.path.join(SANDBOX, "data")
WORK_DIR = os.path.join(SANDBOX, "work")


def du_sb(path: str) -> int:
    if not os.path.exists(path):
        return 0
    out = subprocess.check_output(["du", "-sb", path], text=True).strip()
    return int(out.split()[0])


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_jsonl(path: str) -> dict[str, Any]:
    count = 0
    bad = 0
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            try:
                json.loads(line)
                count += 1
            except Exception:
                bad += 1
    return {
        "path": path,
        "bytes": os.path.getsize(path),
        "sha256": sha256_file(path),
        "rows": count,
        "parse_errors": bad,
    }


def main() -> None:
    usage = shutil.disk_usage("/")
    df_out = subprocess.check_output(["df", "-B1", "/"], text=True).strip()

    dirs = {
        "n66hhk695h_v3": os.path.join(DATA_DIR, "n66hhk695h_v3"),
        "n66hhk695h_v3_derived": os.path.join(DATA_DIR, "n66hhk695h_v3_derived"),
        "handgesture_5g_derived": os.path.join(DATA_DIR, "handgesture_5g_derived"),
        "hands_rgbd_eval": os.path.join(DATA_DIR, "hands_rgbd_eval"),
        "work": WORK_DIR,
    }
    du_bytes = {k: du_sb(v) for k, v in dirs.items()}

    datasets: dict[str, Any] = {}

    n66_stats_p = os.path.join(dirs["n66hhk695h_v3_derived"], "n66hhk695h_v3_stats.json")
    if os.path.exists(n66_stats_p):
        n66_stats = json.load(open(n66_stats_p))
        n66_jsonl = verify_jsonl(os.path.join(dirs["n66hhk695h_v3_derived"], "n66hhk695h_v3_landmarks.jsonl"))
        datasets["n66hhk695h_v3"] = {
            "stats": n66_stats,
            "jsonl_verified": n66_jsonl,
            "audit_image_sha256": sha256_file(os.path.join(dirs["n66hhk695h_v3_derived"], "point_samples_audit.jpg"))
            if os.path.exists(os.path.join(dirs["n66hhk695h_v3_derived"], "point_samples_audit.jpg"))
            else None,
        }

    hg5g_stats_p = os.path.join(dirs["handgesture_5g_derived"], "handgesture_5g_stats.json")
    if os.path.exists(hg5g_stats_p):
        hg_stats = json.load(open(hg5g_stats_p))
        hg_jsonl = verify_jsonl(os.path.join(dirs["handgesture_5g_derived"], "handgesture_5g_landmarks.jsonl"))
        datasets["handgesture_5g"] = {
            "stats": hg_stats,
            "jsonl_verified": hg_jsonl,
            "audit_image_sha256": sha256_file(os.path.join(dirs["handgesture_5g_derived"], "hg5g_samples_audit.jpg"))
            if os.path.exists(os.path.join(dirs["handgesture_5g_derived"], "hg5g_samples_audit.jpg"))
            else None,
        }

    hrgbd_stats_p = os.path.join(dirs["hands_rgbd_eval"], "hands_rgbd_eval_stats.json")
    if os.path.exists(hrgbd_stats_p):
        hr_stats = json.load(open(hrgbd_stats_p))
        hr_jsonl = verify_jsonl(os.path.join(dirs["hands_rgbd_eval"], "hands_rgbd_landmarks.jsonl"))
        datasets["hands_rgbd_eval"] = {
            "stats": hr_stats,
            "jsonl_verified": hr_jsonl,
            "audit_image_sha256": sha256_file(os.path.join(dirs["hands_rgbd_eval"], "hands_rgbd_horiz_audit.jpg"))
            if os.path.exists(os.path.join(dirs["hands_rgbd_eval"], "hands_rgbd_horiz_audit.jpg"))
            else None,
        }

    summary = {
        "disk_final": {
            "free_bytes": usage.free,
            "free_gib": round(usage.free / (1024 ** 3), 4),
            "above_2gib_floor": usage.free >= 2 * 1024 * 1024 * 1024,
            "df_b1_root": df_out,
        },
        "directory_sizes_bytes": du_bytes,
        "constraints_check": {
            "handgesture_5g_derived_lt_50MiB": du_bytes["handgesture_5g_derived"] < 50 * 1024 * 1024,
            "hands_rgbd_eval_lt_20MiB": du_bytes["hands_rgbd_eval"] < 20 * 1024 * 1024,
            "free_disk_ge_2GiB": usage.free >= 2 * 1024 * 1024 * 1024,
        },
        "datasets": datasets,
    }

    out_json = os.path.join(WORK_DIR, "data_curation_summary.json")
    with open(out_json, "w") as f:
        json.dump(summary, f, indent=2)

    # Render concise factual Markdown summary
    lines = [
        "# R19 Stage P1 Dataset Acquisition & MediaPipe Feature Curation Summary",
        "",
        "## 1. Disk Budget & Integrity Verification",
        f"- **Final `/` Free Space:** `{usage.free:,} B` (`{summary['disk_final']['free_gib']} GiB`) — `>= 2.0 GiB` floor satisfied: `{summary['disk_final']['above_2gib_floor']}`",
        "",
        "| Directory | Size (`du -sb`) | Budget Limit |",
        "|---|---:|---|",
        f"| `n66hhk695h_v3/` | `{du_bytes['n66hhk695h_v3']:,} B` | `Root.zip` (`382,226,419 B`) |",
        f"| `n66hhk695h_v3_derived/` | `{du_bytes['n66hhk695h_v3_derived']:,} B` | Derived JSONL + audit sheet |",
        f"| `handgesture_5g_derived/` | `{du_bytes['handgesture_5g_derived']:,} B` | `< 50 MiB` (`{du_bytes['handgesture_5g_derived'] < 50*1024*1024}`) |",
        f"| `hands_rgbd_eval/` | `{du_bytes['hands_rgbd_eval']:,} B` | `< 20 MiB` (`{du_bytes['hands_rgbd_eval'] < 20*1024*1024}`) |",
        f"| `work/` | `{du_bytes['work']:,} B` | Scripts + manifests |",
        "",
    ]

    if "n66hhk695h_v3" in datasets:
        s = datasets["n66hhk695h_v3"]["stats"]
        jv = datasets["n66hhk695h_v3"]["jsonl_verified"]
        ov = s["overall_sampled"]
        lines += [
            "## 2. Natural RGB Hand Gestures v3 (`10.17632/n66hhk695h.3`, `CC BY 4.0`)",
            f"- **Archive SHA-256:** `{s['root_zip_sha256']}` (`{s['root_zip_bytes']:,} B`)",
            f"- **Clips / Sampled Frames:** `{s['clips_decoded']}` / `{s['mp4_clips_in_zip']}` MP4 clips -> `{s['sampled_frames_total']:,}` frames (`{len(s['clip_decode_failures'])}` clip failures)",
            f"- **JSONL:** `{jv['rows']:,}` rows, `{jv['bytes']:,} B`, SHA-256 `{jv['sha256']}`, parse errors `{jv['parse_errors']}`",
            f"- **Overall L0 RAW Recall (`RunningMode.IMAGE`):** `{ov['l0_recall_pct']}%` (`{ov['l0_det']:,}`/`{ov['frames']:,}`, misses `{ov['l0_miss']:,}`, L1 CLAHE320 recovered `{ov['l0_miss_l1_rec']:,}`)",
            f"- **Unbiased Stratified Paired Subset (`n={ov['paired_n']}`):** `L0={ov['paired_l0_pct']}%` | `L1 CLAHE320={ov['paired_l1_clahe320_pct']}%` | `M3={ov['paired_m3_pct']}%`",
            f"- **Participant-Disjoint Splits (`{s['participants_total']}` subjects):** "
            + ", ".join(f"`{sp}`={v['n_participants']}p/{v['clips']}c/{v['frames']}f" for sp, v in s["participant_disjoint_splits"].items()),
            "",
        ]

    if "handgesture_5g" in datasets:
        s = datasets["handgesture_5g"]["stats"]
        jv = datasets["handgesture_5g"]["jsonl_verified"]
        ov = s["overall"]
        lines += [
            "## 3. HandGesture-5G (`10.17632/wj25crzdbm.1`, `CC BY 4.0`, HTTP Range Streaming Only)",
            f"- **Remote Zip:** `{s['zip_total_bytes']:,} B` (`0 B` zip stored); `{s['zip_image_entries']}` image entries -> `{s['crc32_duplicates_skipped']}` CRC32 duplicates skipped -> `{s['unique_crc32_entries']}` unique entries",
            f"- **Decoded / HEIC Skips:** `{s['decoded_images']}` JPEGs decoded | `{s['heic_decode_attempts']}` HEIC files skipped after PIL/cv2/ffmpeg attempts | `{len(s['other_decode_errors'])}` other decode errors",
            f"- **JSONL:** `{jv['rows']:,}` rows, `{jv['bytes']:,} B`, SHA-256 `{jv['sha256']}`, parse errors `{jv['parse_errors']}`",
            f"- **Detector Recall:** `L0 RAW={ov['l0_recall_pct']}%` (`{ov['l0_detected']}/{ov['total']}`, misses `{ov['l0_miss']}`) | `L1 CLAHE320={ov['l1_recall_pct']}%` | `M3={ov['m3_recall_pct']}%` | `both_miss={ov['both_miss']}`",
            f"- **Cluster-Disjoint Splits:** `{s['cluster_stats']['num_clusters']}` atomic clusters (`max_size={s['cluster_stats']['max_cluster_size']}`); cross-split `same_day_model_dHash<=8`: `{s['splits']['leakage_audit']['cross_split_same_cls_day_model_dhash_le_8']}`, cross-split `burst<=15s`: `{s['splits']['leakage_audit']['cross_split_burst_le_15s']}`",
            "",
        ]

    if "hands_rgbd_eval" in datasets:
        s = datasets["hands_rgbd_eval"]["stats"]
        jv = datasets["hands_rgbd_eval"]["jsonl_verified"]
        lines += [
            "## 4. HANDS RGB-D (`10.17632/ndrczc35bt.2`, `CC BY 4.0`, `EVAL_ONLY` Range Slice)",
            f"- **Frames Streamed:** `{s['frames_streamed']}` RGB PNGs across Subject1..5 (`0 B` zip/depth stored)",
            f"- **JSONL:** `{jv['rows']:,}` rows, `{jv['bytes']:,} B`, SHA-256 `{jv['sha256']}`, parse errors `{jv['parse_errors']}`",
            "",
            "| Hand Label | GT Instances | L0 Matched (%) | L1 CLAHE320 (%) | M3 (%) | L0 Miss -> L1 Rec |",
            "|---|---:|---:|---:|---:|---:|",
        ]
        for lbl, v in s["by_hand_label"].items():
            lines.append(
                f"| `{lbl}` | `{v['gt_instances']}` | `{v['l0_matched']}` (`{v['l0_recall_pct']}%`) | `{v['l1_recall_pct']}%` | `{v['m3_recall_pct']}%` | `{v['l0_miss_l1_recovered']}` |"
            )
        lines.append("")

    out_md = os.path.join(WORK_DIR, "data_curation_summary.md")
    with open(out_md, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote {out_json} and {out_md}")


if __name__ == "__main__":
    main()
