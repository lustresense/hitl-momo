#!/usr/bin/env node
/**
 * Audio micro-benchmarks (M-047) on a static export built with NEXT_PUBLIC_DEV_TOOLS=1.
 *   OUT_DIR=/path/to/out node e2e/audio/audio-bench.mjs
 * Measures: wire bytes before any gesture (must contain no audio), unlock time, emit() call cost on warmed buffers,
 * engine latency fields, decoded-buffer memory, scene-change to first-track time. Headless null sink: output latency
 * of real hardware (and Bluetooth) is NOT_TESTED; `baseLatency`/`outputLatency` are what the browser reports here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, startStaticServer, sleep } from "../lib/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.resolve(HERE, "../../out");
const REPORT = process.env.REPORT ?? path.join(HERE, "logs", "audio-bench-report.json");
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
const { server, base } = await startStaticServer(OUT_DIR, 0);
const { browser, context, page } = await launch({ viewport: { width: 1280, height: 720 } });
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");

let bytes = 0, oggBytes = 0, oggCount = 0;
page.on("response", async (r) => {
  try {
    const n = (await r.body()).length;
    bytes += n;
    if (/\.ogg(\?|$)/.test(r.url())) { oggBytes += n; oggCount++; }
  } catch { /* redirects / aborted */ }
});
await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.locator('[data-testid="r83-entry-name-input"]').waitFor({ state: "visible", timeout: 40000 });
await sleep(1500);
const preGesture = { totalBytes: bytes, oggBytes, oggCount };

const res = { when: new Date().toISOString(), outDir: OUT_DIR, evidence: "BROWSER headless null sink", preGesture };
const t0 = Date.now();
await page.locator('[data-testid="r83-entry-name-input"]').click();
await page.keyboard.type("B", { delay: 10 });
await page.waitForFunction(() => window.__audioDiag?.state() === "running", null, { timeout: 8000 });
res.unlockMs = Date.now() - t0;
const sceneT = Date.now();
await page.waitForFunction(() => window.__audioDiag.snapshot().music.track === "bgm.dream", null, { timeout: 15000 });
res.firstMusicAfterUnlockMs = Date.now() - sceneT;
res.afterGesture = { totalBytes: bytes, oggBytes, oggCount };

// emit() cost with warmed buffers (distinct events, cooldown drops included: the realistic worst case is the hot path)
await page.evaluate(() => window.__audioDiag.warm(["group:core"]));
await sleep(2500);
res.emitCostMicros = await page.evaluate(() => {
  const a = window.__audioDiag;
  const ids = ["ui.tap", "ui.toggle_on", "momo.flap", "momo.hop", "bubble.show", "tool.tick", "nui.commit", "ui.ring_in"];
  const samples = [];
  for (let i = 0; i < 400; i++) {
    const t = performance.now();
    a.emit(ids[i % ids.length]);
    samples.push((performance.now() - t) * 1000);
  }
  samples.sort((x, y) => x - y);
  return { p50: +samples[200].toFixed(1), p95: +samples[380].toFixed(1), max: +samples[399].toFixed(1) };
});
const snap = await page.evaluate(() => window.__audioDiag.snapshot());
res.engine = { baseLatencyMs: snap.baseLatencyMs, outputLatencyMs: snap.outputLatencyMs, sampleRate: snap.sampleRate, bufferMemoryMB: snap.bufferMemoryMB, buffers: snap.loadedBuffers.length, counters: snap.counters, dropped: snap.dropped };
// long tasks during a burst of scene changes
await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ["longtask"] }); });
await page.evaluate(() => { ["cover", "tutorial", "levels", "canvas", "world1", "cover"].forEach((s, i) => setTimeout(() => window.__audioDiag.scene(s), i * 200)); });
await sleep(4000);
res.longTasksDuringSceneBurst = await page.evaluate(() => ({ count: window.__lt.length, maxMs: Math.round(Math.max(0, ...window.__lt)) }));
res.musicAfterBurst = (await page.evaluate(() => window.__audioDiag.snapshot().music));
fs.writeFileSync(REPORT, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
await browser.close();
server.close();
