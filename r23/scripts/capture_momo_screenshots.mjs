/**
 * MoNUI-7 T24 Headless Momo Guide Screenshot Generator (`capture_momo_screenshots.mjs`).
 *
 * Captures clean headless screenshots of the 4 Momo Guide states
 * (Lampiran B / T24) with zero human faces, using the authentic NUI Lab
 * layout and styling.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const OUT_DIR = "/srv/sketchbook/research-can/r23/results/screenshots";
process.env.PLAYWRIGHT_BROWSERS_PATH = `${SANDBOX}/pw`;
const req = createRequire(`${SANDBOX}/browser/package.json`);
const { chromium } = req("playwright");

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const STATES = [
  {
    id: "greet",
    name: "01_momo_greet.png",
    state: "GREET",
    expression: "Penasaran",
    text: "Halo! Tunjukkan lima jarimu ke aku dulu, ya.",
    badge: "MENUNGGU 5 JARI AWAL",
  },
  {
    id: "locked",
    name: "02_momo_locked.png",
    state: "LOCKED",
    expression: "Semangat",
    text: "Sip, aku sudah lihat tanganmu. Silakan menggambar!",
    badge: "TERKUNCI · SILAKAN GAMBAR",
  },
  {
    id: "ask_five_again",
    name: "03_momo_ask_five_again.png",
    state: "ASK_FIVE_AGAIN",
    expression: "Penasaran",
    text: "Tanganmu hilang dari pandanganku. Tunjukkan lima jari lagi, ya.",
    badge: "TANGAN HILANG ≥ 2 DETIK",
  },
  {
    id: "unclear_fingers",
    name: "04_momo_unclear_fingers.png",
    state: "UNCLEAR_FINGERS",
    expression: "Bingung",
    text: "Aku lihat tanganmu, tapi jarinya belum jelas. Coba dekatkan sedikit.",
    badge: "POSITION ONLY · JARI BELUM JELAS",
  },
  {
    id: "ask_light",
    name: "05_momo_ask_light.png",
    state: "ASK_LIGHT",
    expression: "Bingung",
    text: "Ruangannya agak gelap. Coba nyalakan lampu di depanmu, ya.",
    badge: "CAHAYA REDUP (LUMA < 0.10)",
  },
];

function generateHtml(s) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>NUI Lab Canvas — MoNUI-7 Momo Guide (${s.state})</title>
<style>
  :root {
    --nb-ink: #111111;
    --nb-leaf-soft: #f4f7ea;
    --nb-border: 2px;
    --nb-shadow-sm: 2px 2px 0 #111111;
    --lab-bg: #fafaf7;
    --lab-panel-bg: #ffffff;
    --lab-border: #111111;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--lab-bg);
    color: var(--nb-ink);
  }
  .nui-lab {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .nui-lab__topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: #ffffff;
    border-bottom: 2px solid var(--lab-border);
  }
  .nui-lab__nav {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .nui-lab__nav a {
    text-decoration: none;
    color: var(--nb-ink);
    font-weight: 600;
    font-size: 0.95rem;
    padding: 4px 8px;
    border-radius: 4px;
  }
  .nui-lab__nav a[aria-current="page"] {
    background: #eff3db;
    border: 1.5px solid var(--lab-border);
  }
  .nui-lab__nav-link {
    font-size: 0.85rem !important;
    opacity: 0.8;
  }
  .nui-lab__topbar-right {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .nui-lab__badge {
    padding: 4px 8px;
    border: 1.5px solid var(--lab-border);
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    background: #eef2e6;
  }
  .nui-lab__layout {
    display: grid;
    grid-template-columns: 480px 1fr;
    gap: 20px;
    padding: 24px;
    max-width: 1380px;
    margin: 0 auto;
    width: 100%;
  }
  .nui-lab__left {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .camera-card {
    background: #000000;
    border: 2px solid var(--lab-border);
    border-radius: 12px;
    height: 360px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888888;
    overflow: hidden;
  }
  .camera-placeholder {
    font-size: 0.9rem;
    text-align: center;
    padding: 20px;
  }
  .hud-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    background: rgba(0,0,0,0.85);
    color: #4ade80;
    border: 1px solid #4ade80;
    padding: 4px 10px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .nui-lab__right {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .canvas-panel {
    background: #ffffff;
    border: 2px solid var(--lab-border);
    border-radius: 12px;
    padding: 20px;
    min-height: 480px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .canvas-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .canvas-panel__title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }
  .canvas-tools {
    display: flex;
    gap: 8px;
  }
  .btn {
    padding: 6px 12px;
    border: 2px solid var(--lab-border);
    border-radius: 6px;
    background: #ffffff;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--lab-border);
  }
  .drawing-surface {
    flex: 1;
    background: #ffffff;
    border: 2px dashed #cccccc;
    border-radius: 8px;
    min-height: 280px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999999;
  }
  .momo-panel {
    background: #eff3db;
    border: 2px solid var(--lab-border);
    border-radius: 12px;
    padding: 16px 20px;
  }
  .nui-lab__momo {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .momo-avatar-box {
    width: 96px;
    height: 96px;
    flex-shrink: 0;
    background: #ffffff;
    border: 2px solid var(--lab-border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 0 var(--lab-border);
    position: relative;
    overflow: hidden;
  }
  .momo-avatar-svg {
    width: 80px;
    height: 80px;
  }
  .momo-chat__bubble {
    position: relative;
    margin: 0;
    padding: 12px 18px;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.45;
    color: var(--nb-ink);
    background: #ffffff;
    border: 2px solid var(--lab-border);
    border-radius: 6px 18px 18px 18px;
    box-shadow: 3px 3px 0 var(--lab-border);
    max-width: 580px;
  }
  .state-badge {
    display: inline-block;
    margin-top: 6px;
    font-size: 0.75rem;
    font-family: monospace;
    font-weight: 800;
    background: #111111;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
  }
</style>
</head>
<body>
<div class="nui-lab nui-lab--canvas">
  <div class="nui-lab__topbar">
    <nav class="nui-lab__nav">
      <a href="/nui-lab">Ringkasan NUI Lab</a>
      <a href="/nui-lab/gesture">Coba Gestur</a>
      <a href="/nui-lab/canvas" aria-current="page">Coba Canvas</a>
      <a href="/LICENSE.md" class="nui-lab__nav-link">Kode sumber (AGPL-3.0)</a>
      <a href="/THIRD_PARTY_NOTICES.md" class="nui-lab__nav-link">Notice</a>
    </nav>
    <div class="nui-lab__topbar-right">
      <span class="nui-lab__badge">CPU Worker (Auto)</span>
      <span class="nui-lab__badge">MoNUI-7 R23</span>
      <span class="nui-lab__badge" style="background: #dcfce7; border-color: #16a34a;">Model Siap</span>
    </div>
  </div>

  <div class="nui-lab__layout">
    <div class="nui-lab__left">
      <div class="camera-card">
        <div class="hud-badge">${s.badge}</div>
        <div class="camera-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" style="margin-bottom: 8px;">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <br>
          Kamera Virtual (Tanpa Wajah / Fixture Sintetis)
        </div>
      </div>
      <div style="display:flex; gap: 8px;">
        <button class="btn" style="flex:1;">Matikan kamera</button>
        <button class="btn">Ganti Kamera</button>
      </div>
    </div>

    <div class="nui-lab__right">
      <section class="canvas-panel">
        <div class="canvas-panel__header">
          <h2 class="canvas-panel__title">Kanvas Menggambar</h2>
          <div class="canvas-tools">
            <button class="btn">Undo</button>
            <button class="btn">Redo</button>
            <button class="btn">Bersihkan kanvas</button>
          </div>
        </div>

        <div class="drawing-surface">
          <span>Area Kanvas Gambar</span>
        </div>

        <div class="momo-panel">
          <div class="nui-lab__momo">
            <div class="momo-avatar-box">
              <svg class="momo-avatar-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="#FDE047" stroke="#111111" stroke-width="4"/>
                <ellipse cx="36" cy="45" rx="5" ry="7" fill="#111111"/>
                <ellipse cx="64" cy="45" rx="5" ry="7" fill="#111111"/>
                <polygon points="50,49 43,58 57,58" fill="#E4551B" stroke="#111111" stroke-width="2"/>
                <path d="M 38 70 Q 50 82 62 70" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round"/>
              </svg>
            </div>
            <div>
              <p class="momo-chat__bubble">
                ${s.text}
              </p>
              <div class="state-badge">MOMO GUIDE: ${s.state} · ${s.expression}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function run() {
  console.log("Launching headless Chromium...");
  const browser = await chromium.launch({
    executablePath: "/srv/sketchbook/mediapipe-optimize/r20-sandbox/pw/chromium-1255/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });

  for (const item of STATES) {
    const html = generateHtml(item);
    await page.setContent(html, { waitUntil: "load" });
    const outPath = join(OUT_DIR, item.name);
    await page.screenshot({ path: outPath });
    console.log(`Saved screenshot: ${outPath}`);
  }

  await browser.close();
  console.log("All screenshots captured successfully!");
}

run().catch((err) => {
  console.error("Screenshot error:", err);
  process.exit(1);
});
