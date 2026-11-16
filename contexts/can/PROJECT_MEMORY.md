# Project Memory — Durable Bootstrap

## 2026-11-16 — Baseline-first NUI Lab 0.22.1-alpha, pending QA
Patch berbasis audit 0.22.0-alpha. Di lab Gesture/Canvas, classifier harus dimulai dari baseline game dan eksperimen hanya melalui opt-in; UI Pilih Ulang menjadi fallback saat ambiguous/unmatched-hand. Auto-release sesudah benar-benar kosong dan no-takeover saat bystander terlihat tetap berlaku. Bukti hanya source dan test yang ditulis, belum npm/Playwright/webcam. Tidak mengubah gesture mapping atau model MediaPipe; perubahan di review branch sebelum promosi main.

## 2026-11-16 — NUI Lab P0–P2 auto-lock eksperimen 0.22.0-alpha
Mandat M-039. Lab: jika kamera tanpa kandidat beberapa frame maka auto-release, satu kandidat baru yang stabil auto-lock tanpa klik; hands ambiguous menahan aksi. Bukan identifikasi manusia/biometrik. Cursor terpisah dari gate tinta dan mode eksperimen lab menguji pinch telunjuk terlipat/tiga-jari, dengan diagnostik ratio+reason. Game default dan mapping tetap. Bukti 12 V8 synthetic tests saja, belum npm/browser/webcam. Training dataset P3/P4 belum dilaksanakan.


## 2026-11-16 — NUI Lab di frontend `main`
Owner menginstruksikan integrasi NUI lab ke domain tunnel monorepo aktif, bukan branch terpisah. Empat route App Router tersedia; pipeline menggambar game/lab memakai pinch Coret, 5 jari Hapus, satu jari Undo, dua jari Redo. Kepalan tidak menghapus. Lab memiliki FullFrameHandLock tanpa face ROI untuk penggunaan seluruh frame; track ambigu/lost mengunci input sampai pengguna relock. Semua status kode `STATIC_ONLY / NOT_TESTED` sampai Ujang memverifikasi browser + webcam.


> AI-maintained, human-readable, **non-authoritative context**.
> Verify product decisions against `DECISIONS.md`.

Keep this file small. It is the Hermes-inspired "hot durable memory" layer; detailed experience belongs in ECC memory.

## Product identity
## 2026-11-15 — B04-004 Owner override (0.18.1-alpha, STATIC_ONLY)
- Owner memerintahkan ganti waving hand cover sesuai PRD opsi B. Product truth `DECISIONS.md` D-20261115-03: kamera OFF + Momo tidur, ON dan stream playable bangun Momo, lanjut bubble/animasi PIP/jempol, fallback tanpa kamera.
- Repo `ujang-monorepo` source/test patch 0.18.1-alpha, bukan bukti runtime. `0.18.0-alpha` sebelumnya tetap memerlukan wave; kini catatan itu historical. Jangan menghidupkan lagi wave sebagai syarat cover.
- Card1/3, camera card Claude, Momo text-only, model partner dan `main` tidak disentuh.

## 2026-11-15 — B04 GitHub implementation handoff (non-authoritative)
- Perintah Owner GAS untuk PRD REV-B04 pada branch `ujang-monorepo`. Source staging 0.18.0-alpha: readiness loader 80%, URL cam, bubble CSS, reusable model wave. Bukti STATIC_ONLY, build/webcam/deploy belum terbukti.
- `REV-B04-004` mengganti wake wave menjadi kamera ON adalah opsi yang BELUM DIKUNCI. Wave tetap. Card 3, Card 1, dan camera card Claude tidak disentuh.
- Lihat `REVISIONS.md`, `NOW.md`, dan `frontend/implementation/docs/execution/REV-B04-0.18.0-alpha.md`.

## Latest documented handoff (2026-11-15, non-authoritative)
- Sumber status aktif: `contexts/can/NOW.md`, `REVISIONS.md`; status source GitHub branch `ujang-monorepo` commit `cebbaa4`, global `0.17.0-alpha`, **STATIC_ONLY**.
- Setiap implementer harus membaca `contexts/can/AGENTS.md` lebih dulu dan menyinkronkan keputusan produk (`DECISIONS.md`), mandat (`project/OWNER_MANDATES.md`), revisi, NOW, konteks teknis, dan changelog root. Ini perintah Owner M-033.
- Ikon petunjuk gestur dibuat sendiri (D-20261115-01); perbedaan mapping tutorial vs keputusan lama tetap **Belum dikunci** (D-20261115-02). Jangan menyimpulkan tes webcam atau deploy berhasil.
- Pemilik instalasi/build/deploy = Ujang. Owner membuka URL web setelah deploy diverifikasi, tidak diminta menjalankan npm atau pip.


- Internal/IP name: **Sketchbook Universe**.
- One integrated PA system for AI literacy, not two separate applications.
- Target: SMP grades 7–9.

## Core experience

`Draw → Top-3 predictions + confidence → Accept / Correct / Override → final label/behavior → 2D gameplay consequence → interaction logging`

- Redraw/retry is a recovery/iteration path, not automatically a fourth peer decision in the Probe UI.
- Learning intent: students evaluate/validate probabilistic AI output instead of passively treating it as truth.
- Experience hierarchy: **Interaction → Gameplay/Storyline → Education**.

## Lore invariants

- The user is the **Illustrator** and the only creator of objects/final decision maker.
- **Momo** is a companion/pattern reader, not a creator.
- Momo does not require voice, NLP, LLM, RAG, or free conversation.
- Momo's final visual form is still unlocked.

## Ownership

- Author side: interaction, UI/UX, input preprocessing on the interface side, canvas/finger tracking if actually used, Top-3/confidence UI, student decision UI, 2D gameplay, Momo, event flow, mockups.
- Partner side: sketch classifier, prediction/confidence output, data contract, logging/database, dashboard/export, decision-pattern analysis.
- It remains one integrated system.

## Do not assume

These have historical discussion but are **not locked by memory alone**:
- frontend/game framework;
- MediaPipe/camera usage;
- model/CNN/MobileNet/TensorFlow.js details;
- database/REST/logging schema;
- login/history mechanism;
- confidence/error manipulation;
- character controls;
- detailed level scripts and confidence bands.

## Do not resurrect

Without a new explicit decision, do not restore:
- “Escape the Sketchbook” as formal title;
- Momo as an object creator;
- chatbot/LLM/RAG/NLP/voice as core feature;
- old space/planet direction as active visual direction;
- pre/post test as default evaluation;
- old AI-generated “final” claims.

## Repository memory architecture

- `SOUL.md`, `DECISIONS.md`, `SOURCE_OF_TRUTH.md`, `AGENTS.md` = governed control layer.
- `PROJECT_MEMORY.md` = compact durable AI memory.
- `WORKING_CONTEXT.md` = current-session continuation state.
- `.ecc/memory/` = long-term unreviewed context/handoffs/lessons.
- `.agents/skills/` = procedural memory.
- native Antigravity/Kilo memories = auxiliary accelerators, not canonical backup.
