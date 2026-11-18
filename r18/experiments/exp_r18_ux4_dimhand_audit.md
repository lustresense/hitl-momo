# Experiment R18-UX4 — External Low-Light Dataset (`DimHand` ACM MM 2026) Audit

- **Status:** **`BLOCKED`** (`NOT_DOWNLOADED`, zero DimHand files on VM)
- **Evidence Files:** `r18/manifests/dataset_manifest.json`, `docs/attachments/DIMHAND_AUDIT_SUMMARY.md`
- **Audited Sources:** `https://hanlingzhan.github.io/DimHand/`, `https://github.com/HanlingZhan/DimHand`, `supp.pdf`

## Verified Findings
1. **Different Dataset from Mendeley:** Confirmed `DimHand` (`745,280` RGB+D frames, 5 RealSense D415i cameras, 15 subjects, 15 sequential actions, `0.1–10 lux`) is completely separate from Mendeley `bxr7kx84y6` (`CC BY 4.0`).
2. **Access Blocker:** No public download URL; gated behind manual Owner/Researcher web form (`api.web3forms.com` / `hanlingzhan@163.com`).
3. **License Blocker:** Application notice and `supp.pdf` D.4/D.5 + `CC BY-NC-ND 4.0` footer bar commercial product use and external redistribution of data or derived weights.
4. **Disk Blocker:** Full RGB+D archive size is unpublished and infeasible inside VM free disk (`4.0–4.8 GiB` free).
5. **Decision Boundaries Kept Unchanged:** Even if Owner obtains academic access on larger storage later, `DimHand` may only be used for **RGB-only offline evaluation** (`never` feed RealSense depth into the browser pipeline or distribute NC-restricted weights).
