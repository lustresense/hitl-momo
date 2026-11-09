FINAL BROWSER + VISUAL QA — Full Core Flow Automated Verification

AGY_MODEL: gemini-3.7-flash-high
ROLE: Worker (Browser QA + Visual Regression + Defect Fix)
Workspace: /srv/sketchbook/Sketchbook-Universe-v2/implementation

CURRENT VERIFIED STATE:
- Typecheck: PASS (tsc --noEmit)
- Unit tests: PASS (67/67 across 10 suites)
- Build: PASS (Next.js static export to out/)
- E2E: PASS (19/19 checks, exit 0)
- Dev server: Runs on port 3000/3210, serves app
- MediaPipe hand injection: Working (synthetic landmarks in E2E test #05)

OBJECTIVE:
Run canonical production preview from actual build, execute comprehensive browser/headless Playwright QA against entire core flow, capture screenshots, inspect console/runtime errors, validate visual rendering, and fix any clear reversible engineering defects found.

CORE FLOW TO VERIFY (automated):
1. Level entry → 3 cards visible (Stage 1, 2, 3)
2. Drawing canvas → pointer drawing visible, stroke submission
3. Prediction Top-3 → exactly 3 items, confidence displayed
4. Decision UI → Accept / Correct / Override all functional
5. KAPLAY gameplay → solid bridge, fallback bridge, hazard, unresolved behavior
6. Fail/retry paths → empty drawing rejected, redraw from evaluation, provider error handling
7. Completion → stage complete, cycle complete, repeat cycles

REQUIRED CHECKS:
- Browser console: zero critical errors (warn/info OK)
- KAPLAY rendering: canvas visible, objects spawn at correct positions, collision/physics behave, scene transitions smooth, overlays/z-index correct, canvas sizing responsive
- Viewports: desktop (1280x720) + smaller (390px) — no horizontal overflow, no clipping
- MediaPipe code path: synthetic hand injection works (already E2E verified), but DO NOT claim physical camera verified
- All interactive elements reachable, focusable, keyboard accessible

SCREENSHOTS REQUIRED (save to .ops/results/<TASK_ID>/screenshots/):
- Level selection screen
- Drawing canvas (empty + with stroke)
- Top-3 prediction panel
- Decision panel (Accept/Correct/Override states)
- KAPLAY gameplay: solid bridge consequence
- KAPLAY gameplay: fallback bridge consequence
- KAPLAY gameplay: hazard consequence
- KAPLAY gameplay: unresolved/fallback override
- Stage complete screen
- Empty drawing rejection feedback
- Redraw flow
- Provider error handling
- Mobile viewport (390px) — full page

WORKER ARTIFACTS (mandatory):
- WORKER_LOG.md — chronological: pages visited, actions, errors, screenshots captured, fixes attempted
- WORKER_CHANGELOG.md — files changed/created/deleted, behavior/config changes, reasons, limitations
- REPORT.md — objective, result, changed files, verification performed, pass/fail, unresolved issues, evidence paths, screenshots list

DEFECT HANDLING:
- If clear reversible engineering defect found (layout, console error, broken interaction, visual regression): fix in-scope, rerun typecheck + tests + build + relevant browser checks
- If defect requires product/creative decision or physical hardware: STOP, document in REPORT.md as HUMAN_QA_REQUIRED, do not fix

MODEL ROUTING:
- Routine browser inspection → gemini-3.7-flash-high
- Hard integration defect → gemini-3.1-pro-high (if available) or best available AGY pool
- NO Claude/GPT family (5-hour pool exhausted)
- NO Hermes coder fallback while AGY pools available

DONE CRITERIA:
1. All core flow steps verified with screenshots
2. Zero critical console errors
3. Viewport regression check PASS
4. Typecheck + tests + build PASS after any fixes
5. Worker artifacts complete
6. Screenshots saved to .ops/results/<TASK_ID>/screenshots/

OUT OF SCOPE:
- Physical MediaPipe camera verification (human QA only)
- Creative/product decisions
- Performance/load testing (unless obvious regression)