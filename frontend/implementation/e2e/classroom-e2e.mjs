// Classroom E2E: class link -> join -> draw -> real /predict -> Accept -> POST /api/submissions
// -> database -> teacher dashboard. The first submission response is dropped after the server
// stored it, so the outbox must retry and the server must answer "duplicate".
//
// Env: JOIN_TOKEN, DB_PATH, TEACHER_EMAIL, TEACHER_PASSWORD, API_BASE, ADMIN_BASE, PYTHON, E2E_OUT
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, startStaticServer, launch, onboardToLevels, enterLevel, drawScribble, submitAndDecide, sleep, writeJson } from "./lib/harness.mjs";

const JOIN = process.env.JOIN_TOKEN ?? "tok-e2e-1";
const DB = process.env.DB_PATH;
const API = (process.env.API_BASE ?? "http://localhost:8000").replace(/\/+$/, "");
const ADMIN = (process.env.ADMIN_BASE ?? "http://localhost:3002/admin").replace(/\/+$/, "");
const EMAIL = process.env.TEACHER_EMAIL ?? "guru@e2e.test";
const PASS = process.env.TEACHER_PASSWORD;
const PY = process.env.PYTHON ?? "python3";
const OUT = process.env.E2E_OUT ?? path.join(ROOT, "e2e-out", "classroom");
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, extra = "") => { checks.push({ name, ok: !!ok, extra: String(extra).slice(0, 300) }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${extra ? " — " + String(extra).slice(0, 200) : ""}`); };
const log = m => console.log("  " + m);

// GAME_BASE: serve through Caddy (same origin as the API) instead of the local static server.
const { server, base: gameBase } = process.env.GAME_BASE
  ? { server: { close() {} }, base: process.env.GAME_BASE.replace(/\/+$/, "") }
  : await startStaticServer(path.join(ROOT, "out"), 3344);
const { browser, context, page, errors } = await launch({});
const net = [];
page.on("response", async r => {
  const u = r.url();
  if (!/\/api\/(join|submissions)|\/predict/.test(u)) return;
  let body = null; try { body = await r.json(); } catch { /* not json */ }
  net.push({ method: r.request().method(), url: u.replace(API, "<api>"), status: r.status(), body });
});

let postCount = 0;
await context.route("**/api/submissions", async route => {
  if (route.request().method() !== "POST") return route.continue();
  postCount++;
  if (postCount === 1) {
    // Server receives and stores the first delivery; the browser gets a network error instead.
    await route.fetch();
    return route.abort("connectionreset");
  }
  return route.continue();
});

try {
  const gameUrl = `${gameBase}/?kelas=${encodeURIComponent(JOIN)}`;
  await onboardToLevels(page, gameUrl, log);
  const studentNumber = Number(await page.evaluate(() => window.localStorage.getItem("sketchbook.studentNumber")));
  check("join: student number chosen on ruler", studentNumber >= 1, `number=${studentNumber}`);
  const joinResp = net.find(n => n.method === "POST" && /\/students$/.test(n.url));
  check("join: POST /api/join/{token}/students returned session token", joinResp?.status === 200 && typeof joinResp.body?.student_session_token === "string", joinResp ? `status=${joinResp.status}` : "no response");

  await enterLevel(page, 1, log);
  await drawScribble(page);
  const { labels, decision } = await submitAndDecide(page, { mode: "accept", log });
  log(`UI top-3 labels: ${JSON.stringify(labels)}`);

  // Wait for the outbox to deliver the decision after the dropped response.
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !net.some(n => n.method === "POST" && n.url.endsWith("/api/submissions") && n.status === 200)) await sleep(500);

  // Auto-submit can call /predict more than once; the UI shows the last answer.
  const predictResp = net.filter(n => /\/predict$/.test(n.url)).at(-1);
  check("predict: real backend answered 200 with 3 candidates", predictResp?.status === 200 && predictResp.body?.candidates?.length === 3, predictResp ? `status=${predictResp.status}` : "no /predict response");
  const predLabels = (predictResp?.body?.candidates ?? []).map(c => c.label);
  check("predict: UI shows the labels returned by the server", JSON.stringify(predLabels) === JSON.stringify(labels), `server=${JSON.stringify(predLabels)} ui=${JSON.stringify(labels)}`);
  check("submit: first delivery was dropped and retried (>=2 POSTs)", postCount >= 2, `posts=${postCount}`);
  const posts = net.filter(n => n.method === "POST" && n.url.endsWith("/api/submissions"));
  // The first response was dropped on purpose, so the browser only sees the retry's answer.
  // That answer must be "duplicate" and must point at the single row the server stored.
  const answered = posts.filter(n => n.status === 200 || n.status === 201);
  const lastAnswer = answered.at(-1);
  check("submit: retry was answered as duplicate (no second record)", lastAnswer?.body?.status === "duplicate", JSON.stringify(lastAnswer?.body ?? null));
  check("cors: browser cross-origin POST was answered (not blocked)", answered.length >= 1, `answers=${answered.length}`);
  const corsErr = errors.filter(e => /CORS|Access-Control/i.test(e.text));
  check("cors: no CORS console errors", corsErr.length === 0, corsErr.map(e => e.text).join(" | "));

  // Database: one row for this student and level, real candidates, stable key.
  const db = JSON.parse(execFileSync(PY, ["-c", `
import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1]); c.row_factory = sqlite3.Row
rows = c.execute("""SELECT s.id, s.submission_key, s.level_id, s.decision_type, s.final_label,
  s.candidates_json, s.prediction_id, s.attempt_id, s.redraw_count, st.number, st.name
  FROM submissions s JOIN students st ON st.id = s.student_id WHERE st.number = ?""", (int(sys.argv[2]),)).fetchall()
print(json.dumps([dict(r) for r in rows]))`, DB, String(studentNumber)]).toString());
  check("database: exactly one submission row for this student", db.length === 1, `rows=${db.length}`);
  if (db[0]) {
    const cands = JSON.parse(db[0].candidates_json).map(c => c.label);
    check("database: stored candidates equal UI top-3", JSON.stringify(cands) === JSON.stringify(labels), JSON.stringify(cands));
    check("database: row id equals the id the retry answered", String(db[0].id) === String(lastAnswer?.body?.id), `db=${db[0].id} answer=${lastAnswer?.body?.id}`);
    check("database: submission_key and attempt_id stored", !!db[0].submission_key && !!db[0].attempt_id, db[0].submission_key);
    // prediction_id is not produced by the backend /predict yet (PROPOSED in the plan): recorded, not claimed.
    check("database: prediction_id stored (NOT PRODUCED by backend /predict; expected null)", db[0].prediction_id === null, String(db[0].prediction_id));
    check("database: decision stored and level recorded", db[0].decision_type === "accept" && !!db[0].level_id, `${db[0].decision_type} ${db[0].level_id}`);
  }

  // Teacher dashboard API (same data the admin UI renders).
  const login = await (await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASS }) })).json();
  const rows = await (await fetch(`${API}/api/classes/1/submissions`, { headers: { authorization: `Bearer ${login.token}` } })).json();
  const mine = rows.filter(r => r.student_number === studentNumber);
  check("dashboard API: submission listed for the student", mine.length === 1, `rows=${mine.length}`);

  // Teacher dashboard UI in a separate browser page.
  const admin = await context.newPage();
  await admin.goto(`${ADMIN}/login`, { waitUntil: "domcontentloaded" });
  await admin.locator("input[type=email]").fill(EMAIL);
  await admin.locator("input[type=password]").fill(PASS);
  await admin.locator("button[type=submit]").click();
  await admin.waitForURL(u => !/\/login/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  await admin.goto(`${ADMIN}/kelas/1`, { waitUntil: "networkidle" }).catch(() => {});
  await admin.getByText(`Siswa ${studentNumber}`, { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {});
  const bodyText = await admin.locator("body").innerText().catch(() => "");
  check("dashboard UI: class page shows the student's row", bodyText.includes(`Siswa ${studentNumber}`), "");
  await admin.screenshot({ path: path.join(OUT, "dashboard-class-page.png"), fullPage: true }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, "game-after-decision.png") }).catch(() => {});
  check("game: no uncaught page errors", errors.filter(e => e.type === "pageerror").length === 0, errors.filter(e => e.type === "pageerror").map(e => e.text).join(" | "));
} catch (err) {
  check("run completed without exception", false, String(err?.stack ?? err).slice(0, 400));
} finally {
  writeJson(path.join(OUT, "classroom-e2e.json"), { checks, network: net, consoleErrors: errors.slice(0, 50) });
  await browser.close();
  server.close();
  const fail = checks.filter(c => !c.ok).length;
  console.log(`RESULT ${fail === 0 ? "PASS" : "FAIL"} checks=${checks.length - fail}/${checks.length}`);
  process.exit(fail === 0 ? 0 : 1);
}
