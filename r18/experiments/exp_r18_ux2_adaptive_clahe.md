# Experiment R18-UX2 — Adaptive `RAW-first` + Sticky `CLAHE-320` Recovery

- **Test Types:** `OFFLINE_DATASET` (Mendeley `bxr7kx84y6` v2 `CC BY 4.0`) + `SYNTHETIC` (`N0/N1` distractors)
- **Baseline:** `M0_baseline_auto_320` (`frame-source.ts`: `luma < 0.28` or backlight -> 320px CLAHE), `M1_raw_720p`
- **Candidates:** `M2_clahe_480p`, `M3_raw_first_recovery_clahe320` (RAW first; if dark/backlit AND RAW misses -> `clahe_320` + 5-frame sticky recovery), `M4_raw_first_recovery_clahe480_plus_skel`
- **Script & Results:** `PYTHONPATH=r18/scripts python r18/scripts/r18_ux2_adaptive.py` -> `r18/results/r18_ux2_adaptive.json`

## Quantitative Results (`240` sequential frames each + `40` `N0/N1` distractor scenes)
- **Mendeley DimLight (`240` frames):**
  - `M1_raw_720p`: det `52.08%`, dropouts `33`, `lat p50=22.42 ms / p95=31.45 ms`
  - `M0_baseline_auto_320`: det `60.83%`, dropouts `29`, `lat p50=28.27 ms / p95=37.72 ms`
  - `M3_raw_first_recovery_clahe320`: det **`64.58%`** (+12.50 pp vs RAW, +3.75 pp vs `M0`), dropouts `29`, `lat p50=29.32 ms / p95=42.80 ms` (`51` mode switches)
  - `M4_raw_first_recovery_clahe480_plus_skel`: det `64.17%`, `lat p50=32.67 ms / p95=47.41 ms`
- **Mendeley NaturalLight (`240` frames):**
  - `M1_raw_720p`: det `37.50%`, `lat p50=12.68 ms`
  - `M0_baseline_auto_320`: det `50.00%`, `tip8_step_p50=0.12149`
  - `M3_raw_first_recovery_clahe320`: det **`59.17%`**, `tip8_step_p50=0.10219`, `lat p50=30.08 ms / p95=41.46 ms`
- **Distractors (`N0_fan_sticks` 35 scenes, `N1_poster_hand` 5 scenes):**
  - `N0`: `raw_720` = `4/35` (`4` post-skel); `clahe_320` & `clahe_480` = `10/35` (`10` post-skel)
  - `N1`: `3/5` across all modes

## Conclusion & Tradeoffs
- **Selected Candidate Strategy:** `M3_raw_first_recovery_clahe320`. Avoids running CLAHE when `RAW` already detects hands in bright lighting (reducing `N0_fan_sticks` exposure and preserving large bright hands) while recovering more dark/backlit frames than static `auto_320`. Fallback dual-pass frames increase worst-case `p95` frame detect cost when switching modes.
