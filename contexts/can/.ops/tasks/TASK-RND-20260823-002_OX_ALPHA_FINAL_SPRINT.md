# MASTER WORKER CAMPAIGN
# TASK-RND-20260823-002 — OX ALPHA FINAL SPRINT
## Migrate → Complete → Verify → Handoff

**ROLE:** WORKER  
**PARENT:** R&D / Acting Orchestrator  
**TASK_ID:** TASK-RND-20260823-002  
**DATE:** 2026-08-23  
**TARGET:** Bring the CAN(USER)-owned application side of Sketchbook Universe as close to implementation-complete as current product decisions allow.

---

# 0. EXECUTIVE DIRECTIVE

You already completed `TASK-RND-20260822-001` and produced a working author-side vertical slice.

This is the next campaign.

Do NOT merely add one feature.

Your job is to take the current actual implementation and push the CAN(USER)-owned application toward a maintainable near-final engineering state while preserving product governance.

This campaign contains multiple subtasks in one file.

You must execute them sequentially and continuously.

Do not stop after:
- auditing;
- planning;
- migrating the stack;
- implementing one feature;
- making tests green once.

Continue until all non-blocked campaign tasks and the Final Definition of Done are satisfied.

Use the loop:

```text
READ CURRENT TRUTH
→ AUDIT ACTUAL SOURCE
→ CREATE ROLLBACK SAFETY
→ MIGRATE
→ IMPLEMENT
→ TEST
→ REVIEW
→ FIX
→ CONTINUE
→ FINAL FULL VERIFICATION
→ HANDOFF
```

Ordinary reversible engineering choices are delegated to you.

Do not repeatedly ask CAN(USER) to choose libraries, folders, minor component patterns, exact variable names, testing helpers, or similar engineering details.

If one genuinely unresolved PRODUCT decision blocks only one feature:
1. record it in `.ops/outbox/rnd/RND_DECISION_REQUIRED.md`;
2. implement a reversible placeholder/adapter when possible;
3. continue every non-blocked task.

---

# 1. SOURCE AUTHORITY — READ AGAIN BEFORE TOUCHING CODE

Do not rely only on your memory from the previous OpenCode session.

Before modifying implementation, read/reconcile the CURRENT repository copies of:

1. `INSTRUCTION.md`
2. `SOURCE_OF_TRUTH.md`
3. `CHANGELOG.md`
4. `AGENTS.md`
5. `PROJECT_MEMORY.md`
6. `WORKING_CONTEXT.md`
7. `docs/team/TEAM_OPERATING_MODEL.md`
8. `docs/team/ROLE_PROTOCOL.md`
9. `.ops/inbox/rnd/PRD_SKETCHBOOK_UNIVERSE_v1.0.md`
10. `.ops/tasks/TASK-RND-20260822-001_FULL_AUTHOR_SIDE_IMPLEMENTATION.md`
11. `.ops/results/OPENCODE_WORKER_REPORT.md`
12. `implementation/IMPLEMENTATION_AUDIT.md`
13. the ACTUAL current `implementation/**` source/tests/config

Then inspect:
- current selected design references only if they exist;
- proposal/meeting/research evidence only if a specific requirement needs evidence.

Do NOT bulk-read `archive/` to inflate context coverage.

Do NOT claim you read a binary/PDF/image merely because you listed its path.

---

# 2. CURRENT PRODUCT TRUTH THAT THIS CAMPAIGN MUST PRESERVE

Unless a newer repository governance file explicitly says otherwise:

## Product

Internal/IP name:
**Sketchbook Universe**

Primary target:
**SMP grades 7–9**

Canonical HITL loop:

```text
DRAW
→ TOP-3 + CONFIDENCE
→ HUMAN EVALUATION
→ ACCEPT / CORRECT / OVERRIDE
→ FINAL LABEL
→ GAMEPLAY BEHAVIOR
→ 2D CONSEQUENCE
→ RETRY / REPEAT / COMPLETE
```

## Redraw

Redraw is:
- revision;
- recovery;
- iteration back to drawing.

Redraw is NOT automatically a fourth peer decision beside:
- Accept;
- Correct;
- Override.

## Illustrator / student

The student:
- creates the object;
- evaluates AI output;
- makes the final decision.

## Momo

Momo:
- contextual companion/pattern reader;
- text bubbles are enough;
- may guide attention/recovery.

Momo must NOT:
- create objects;
- decide for the student;
- become chatbot;
- use required voice/NLP/LLM/RAG/free conversation.

Momo final visual is not final.

## Gameplay

Active semantic behavior concepts:
- Solid;
- Danger.

Exact objects/level scripts remain configurable unless current governance says otherwise.

Do not manipulate model confidence or fabricate model mistakes as a hidden educational mechanism.

---

# 3. LATEST CAN(USER) ENGINEERING OWNERSHIP DIRECTIVE

This section is a CURRENT explicit implementation directive for this campaign.

## CAN(USER)-owned application side

You are implementing:

### A. Product frontend
- web application shell;
- UI/UX implementation;
- drawing interface;
- Top-3/confidence presentation;
- Accept/Correct/Override;
- Momo UI placement/text bubbles;
- responsive/frontend behavior.

### B. Interactive/game runtime
- KAPLAY.js;
- game scene/runtime;
- Solid/Danger consequence;
- collision/physics needed by current gameplay;
- level flow;
- game-state integration.

### C. Input side
- normal pointer/touch drawing;
- MediaPipe hand/finger input implementation;
- input normalization;
- fallback/recovery.

### D. Integration edge
- client-side adapter/interface consuming partner model output;
- mock → real provider replaceability;
- runtime response validation;
- error handling.

### E. frontend-side QA/testing/documentation

## Partner side

Partner owns the ML/model AI work, including:
- QuickDraw/model experimentation;
- MobileNet/other classifier experimentation;
- training;
- actual classifier;
- real model metrics;
- actual prediction generation implementation.

## BACKEND RULE — IMPORTANT

Do NOT invent a generic "backend team" for this task.

Do NOT build:
- application backend;
- Next API Routes for product logic;
- Route Handlers as a fake partner backend;
- Server Actions for product persistence;
- database;
- authentication;
- admin;
- dashboard;
- logging service;
- model proxy;
- production event backend.

The current application must remain usable with mock/dev adapters.

If the partner later provides an endpoint, the frontend may call it through a client adapter.

Backend ownership is NOT to be inferred by this worker.

---

# 4. HARD ENGINEERING DIRECTIVES FOR THIS CAMPAIGN

CAN(USER) explicitly requests the following engineering direction now.

These are coding directives for this sprint. Do not retroactively claim that older proposal documents already locked them.

## 4.1 Application shell

Migrate the current Vite/vanilla frontend to:

**Next.js App Router + TypeScript**

Use a current STABLE Next.js release compatible with the actual Node environment.

Do not choose a prerelease/canary build merely to be "latest".

## 4.2 Frontend-only Next architecture

Next.js is the frontend/application shell only.

Prefer a static/browser-first architecture.

If technically compatible with the final implementation, configure static export (`output: "export"` or current equivalent).

Do not create backend functionality just because Next supports it.

Browser-dependent code must stay behind correct client boundaries.

## 4.3 Interactive runtime

Replace the hand-rolled custom AABB gameplay runtime with:

**KAPLAY.js**

Use the current stable KAPLAY package.

Avoid KAPLAY v4000 prerelease/alpha unless a verified blocking incompatibility makes the stable release unusable.

KAPLAY must be client-only and safely initialized/cleaned up inside Next/React lifecycle.

Prefer a scoped KAPLAY context (`global: false`) or current equivalent rather than polluting global state.

## 4.4 Hand tracking

Implement browser hand/finger input with current official MediaPipe Tasks Vision tooling.

Preferred current JS package family:

`@mediapipe/tasks-vision`

Use Hand Landmarker/current official browser API, not an obsolete API merely because an old proposal referenced it.

MediaPipe must:
- be browser/client-only;
- not run on SSR;
- start only when needed;
- clean up camera/tracker resources when leaving drawing mode;
- gracefully handle permission denial/no camera/no detected hand;
- preserve pointer/touch fallback.

## 4.5 Momo

Do NOT invent final Momo artwork.

Create:
- replaceable Momo asset slot/component;
- placeholder clearly marked;
- text bubble system.

The final mascot will be supplied later.

## 4.6 Visual direction

If `design/visual/references/dola/selected/` contains selected references:
- inspect them;
- apply relevant implementation guidance.

If it is empty:
- produce a polished functional neutral UI;
- do not create a fake "final art direction".

Avoid obvious AI-slop:
- no generic SaaS dashboard aesthetic;
- no unnecessary glassmorphism;
- no random gradients everywhere;
- no excessive nested cards;
- no giant marketing hero page;
- no decorative fake analytics;
- no gratuitous emoji decoration.

The product should feel like an interactive sketchbook/game, not an admin dashboard.

Use design tokens and replaceable assets so CAN(USER) can later art-direct/polish the interface.

---

# 5. MIGRATION SAFETY RULES

The previous worker reports a passing Vite vertical slice.

Do not destroy working behavior blindly.

Before migration:

1. inspect actual current source;
2. run the existing verification suite and record baseline;
3. create a SOURCE-ONLY rollback artifact under:
   `scratch/ox-final-sprint-2026-08-23/`
4. exclude:
   - `node_modules`;
   - `dist`;
   - caches;
5. document baseline results.

Do not edit `archive/`.

Do not use destructive Git cleanup.

Do not push Git.

Do not commit unless explicitly authorized by CAN(USER).

After the Next migration succeeds, preserve the rollback artifact only as a temporary safety artifact and list it in the final report.

---

# 6. TARGET ARCHITECTURE

Exact filenames may differ when justified, but preserve these conceptual boundaries.

```text
implementation/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── src/
│   ├── app/
│   │   ├── SketchbookApp.tsx
│   │   ├── app-reducer.ts
│   │   └── state-machine.ts
│   │
│   ├── domain/
│   │   ├── types.ts
│   │   ├── decision-resolver.ts
│   │   ├── behavior-resolver.ts
│   │   ├── levels.ts
│   │   ├── momo-script.ts
│   │   └── events.ts
│   │
│   ├── input/
│   │   ├── types.ts
│   │   ├── pointer-input.ts
│   │   ├── mediapipe-input.ts
│   │   ├── hand-gesture.ts
│   │   ├── smoothing.ts
│   │   └── normalize.ts
│   │
│   ├── prediction/
│   │   ├── prediction-provider.ts
│   │   ├── mock-prediction-provider.ts
│   │   ├── partner-http-provider.ts
│   │   └── validation.ts
│   │
│   ├── game/
│   │   ├── kaplay-runtime.ts
│   │   ├── scenes/
│   │   ├── entities/
│   │   ├── behavior-spawner.ts
│   │   └── game-controller.ts
│   │
│   ├── components/
│   │   ├── drawing/
│   │   ├── prediction/
│   │   ├── decision/
│   │   ├── game/
│   │   ├── momo/
│   │   └── shared/
│   │
│   ├── hooks/
│   ├── config/
│   └── styles/
│
├── public/
│   ├── assets/
│   │   └── momo-placeholder/
│   └── models/
│       └── [MediaPipe model asset if bundled]
│
├── tests/
├── e2e/
├── docs/
├── package.json
├── next.config.*
├── tsconfig.json
└── README.md
```

Architecture invariant:

```text
INPUT PROVIDER
      ↓
NORMALIZED DRAWING
      ↓
PREDICTION PROVIDER
      ↓
TOP-3
      ↓
HUMAN DECISION
      ↓
FINAL LABEL
      ↓
BEHAVIOR RESOLVER
      ↓
KAPLAY GAME
```

Gameplay must never directly trust rank-1 classifier output without the human-decision step.

---

# 7. CAMPAIGN TASKS

## TASK 00 — Re-bootstrap and baseline audit

Required.

- Re-read required governance/context.
- Inspect current source/package lock/tests.
- Run current Vite baseline typecheck/tests/build/E2E.
- Compare actual behavior with old worker report.
- Create source rollback artifact.
- Create `implementation/docs/FINAL_SPRINT_BASELINE.md`.

Then continue automatically.

---

## TASK 01 — Migrate Vite → Next.js App Router

Required.

- Replace Vite application shell.
- Preserve tested pure domain logic where correct.
- Convert direct DOM imperative UI into React components/state boundaries.
- Do not rewrite correct domain logic only to look "React-like".
- Keep KAPLAY/MediaPipe/browser code client-only.
- No API routes.
- No auth.
- No database.
- No Server Actions for product persistence.
- Static export when compatible.
- Provide scripts for dev/build/typecheck/test/E2E.

Migration is complete only when equivalent core HITL behavior remains tested.

---

## TASK 02 — Preserve/refine HITL domain layer

Required.

- Accept = rank 1.
- Correct = deliberate rank 2 or 3.
- Override = valid non-Top-3 intended label via reversible UX.
- Redraw = recovery.
- explicit final `HumanDecision`.
- gameplay blocked until final decision exists.
- illegal transitions rejected.
- domain independent from React/KAPLAY.
- comprehensive tests.

Do not duplicate business rules inside components.

---

## TASK 03 — Complete React application-state flow

Required states:

```text
LEVEL ENTRY
DRAWING
PREDICTING
PREDICTION ERROR
EVALUATING
DECISION VALIDATION
GAMEPLAY
GAMEPLAY FAILURE
CYCLE SUCCESS
LEVEL COMPLETE
```

- no dead ends;
- deterministic transitions;
- avoid duplicated state across React/KAPLAY/provider;
- preserve level context appropriately.

---

## TASK 04 — Replace custom gameplay runtime with KAPLAY

Required.

### Lifecycle
- client-only;
- one controlled runtime instance;
- cleanup on unmount;
- no duplicate loops/listeners.

### Gameplay
Support:
- level context;
- player placeholder;
- ground/platforms;
- goal;
- generated behavior object;
- Solid;
- Danger;
- unresolved fallback;
- failure;
- retry;
- repeated cycle;
- level complete.

### Semantic integration
`HumanDecision.finalLabel`
→ behavior resolver
→ KAPLAY.

Never spawn raw rank-1 prediction directly.

### Character control
Character-control scheme is not to be falsely declared final.

Implement a controller abstraction.
A deterministic auto/demo controller may remain the default provisional mode.

Do not revive old left/right/jump claims as approved facts unless current governance explicitly locks them.

---

## TASK 05 — MediaPipe hand/finger drawing input

Required for this sprint.

Implement behind the normalized input abstraction.

Support:
- camera permission;
- camera preview/state;
- live Hand Landmarker;
- index-finger cursor mapping;
- smoothing;
- drawing into same stroke representation;
- cleanup;
- pointer/touch fallback.

### Provisional gesture
Exact gesture is not product-final.

Preferred reversible DEV implementation:
- index-finger position;
- thumb-index pinch threshold toggles ink/draw;
- visible detected/cursor/drawing-state indicators.

Mark it provisional.

### Mapping
- handle mirrored camera correctly;
- clamp coordinates;
- handle tracking loss;
- avoid jump lines after reacquisition.

### Failures
- denied permission;
- unavailable camera;
- model asset error;
- tracker error;
- no hand;
- lost hand.

All must fall back to pointer/touch without app restart.

MediaPipe/camera must stop outside the drawing phase.

---

## TASK 06 — Drawing workspace productionization

Required.

Support mouse/touch/MediaPipe through one stroke model.

- correct high-DPI sizing;
- resize resilience;
- clear;
- submit validation;
- ink detection;
- current input-mode indicator;
- camera state;
- normalized output;
- optional simple undo if safe.

Do not build Photoshop.

---

## TASK 07 — Prediction provider + partner integration edge

Required.

NO backend.

Keep internal:

```ts
interface PredictionProvider {
  predict(input: DrawingInput): Promise<PredictionResult>
}
```

### MockPredictionProvider
- deterministic;
- DEV/MOCK labels;
- failure/malformed fixtures;
- no fake model-performance claims.

### PartnerHttpPredictionProvider
Frontend/client adapter only.

- enabled only when config exists;
- call partner endpoint directly;
- timeout/abort;
- non-2xx errors;
- runtime response validation;
- Top-3 validation;
- confidence validation;
- explicit mapping to internal result.

Do not create the endpoint.
Do not create Next proxy route.
Do not assume final wire schema.

Create:
`implementation/docs/PARTNER_PREDICTION_ADAPTER_SPEC.md`

Clearly separate INTERNAL EXPECTATION vs EXAMPLE vs PARTNER-TBD.

---

## TASK 08 — Top-3 + confidence UI productionization

Required.

- exactly 3 when valid;
- rank;
- label;
- confidence;
- confidence not framed as correctness;
- keyboard;
- touch;
- selected state;
- loading;
- error/malformed state;
- responsive.

No decorative analytics dashboard.

---

## TASK 09 — Accept / Correct / Override UX

Required.

### Accept
Accept rank 1.

### Correct
Explicitly select rank 2 or rank 3.
Never auto-select rank 2.

### Override
Keep reversible.

If vocabulary picker remains:
- exclude Top-3;
- validate selection;
- clearly mean "none of these".

If text fallback is added:
- minimal;
- validated;
- do not turn Correct into free text.

Record provisional UX in:
`implementation/docs/PROVISIONAL_PRODUCT_UI.md`

### Redraw
Keep separate from three HITL decisions.

---

## TASK 10 — Level/gameplay framework

Required.

Preserve conceptual stages:

1. Foundation
2. Ambiguity/comparison
3. Critical validation

Do not manipulate confidence to fake learning difficulty.

Use config/data for:
- metadata;
- stage instruction;
- behavior mapping;
- scene geometry;
- cycles;
- vocabulary;
- placeholder content.

All 3 stages must run end-to-end.

Keep exact content provisional where not governed.

---

## TASK 11 — Momo boundary

Required.

- replaceable avatar slot;
- placeholder;
- text bubbles;
- responsive placement;
- messages follow actual state;
- no chat input;
- no speech;
- no LLM;
- no object creation.

Use selected asset only if clearly selected.

---

## TASK 12 — UI/UX cleanup without fake final art direction

Required.

Goal:
CAN(USER) should mainly need manual visual/art-direction polish later.

Ensure:
- clear hierarchy;
- drawing/game are primary;
- coherent sketchbook/game shell;
- consistent controls;
- usable spacing;
- responsive;
- loading/error/disabled states;
- focus states;
- touch-friendly sizes;
- semantic controls;
- keyboard support;
- color not sole signal.

Build replaceable design tokens.

Do not spend unlimited time inventing final art.

---

## TASK 13 — Runtime/error resilience

Required.

Handle/test:
- empty drawing;
- camera denied;
- camera unavailable;
- MediaPipe init failure;
- tracker loss;
- prediction timeout;
- provider failure;
- malformed response;
- wrong Top-3 count;
- invalid confidence;
- invalid Correct;
- invalid Override;
- unresolved behavior;
- KAPLAY init failure;
- retry;
- Redraw;
- remount;
- level reset.

Never silently fabricate a real prediction.

---

## TASK 14 — Expand tests to near-final author-side coverage

Required.

### Domain/unit
- Accept;
- Correct rank 2;
- Correct rank 3;
- invalid Correct;
- Override valid;
- Override empty;
- Override Top-3 duplicate;
- Redraw;
- Solid;
- Danger;
- unresolved;
- provider validation;
- normalization;
- smoothing;
- hand landmark coordinate mapping;
- pinch/draw gesture;
- state transitions.

### React/components
Cover:
- Top-3;
- Correct picker;
- Override;
- errors;
- key app phase behavior.

### Game
Cover:
- final decision → behavior;
- Solid;
- Danger;
- recovery;
- repeat;
- complete.

### Browser E2E
At minimum:
1. load;
2. level entry;
3. pointer drawing;
4. mock prediction;
5. Top-3 exactly 3;
6. Accept;
7. Correct #2;
8. Correct #3;
9. Override;
10. Redraw;
11. provider fail/retry;
12. malformed provider;
13. Solid;
14. Danger/recovery;
15. repeat;
16. complete;
17. responsive smoke;
18. keyboard smoke;
19. no critical console errors.

MediaPipe E2E must not falsely claim a physical webcam was used.
Use injected/fake landmarks for automation + document a separate manual real-camera smoke test.

---

## TASK 15 — Performance/resource hygiene

Required but pragmatic.

Check:
- duplicate KAPLAY loops;
- leaked listeners;
- React rerender churn;
- camera/tracker cleanup;
- object cleanup;
- repeated-cycle memory growth;
- bundle/chunk sanity.

Optional DEV diagnostics:
- FPS;
- MediaPipe processing timing;
- prediction latency.

Do not report these as academic measured results.

---

## TASK 16 — Dependency/code-health audit

Required after green feature work.

Check/remove where verified obsolete:
- Vite-only files/dependencies;
- old custom AABB renderer/runtime;
- duplicate state machines;
- unused packages;
- dead code;
- giant components;
- circular imports;
- leaked browser globals;
- stale DEV hooks;
- accidental server/backend code.

Do not do a giant aesthetic rewrite just for clean-code ideology.

Do not run Ponytail as destructive auto-refactor in this sprint.

---

## TASK 17 — Documentation completion

Required.

Create/update:

### `implementation/README.md`
- install;
- run;
- build;
- typecheck;
- tests;
- E2E;
- camera smoke;
- architecture;
- mock vs partner;
- env variables;
- known placeholders.

### `implementation/.env.example`
Safe public config names only.

Examples:
- `NEXT_PUBLIC_PREDICTION_MODE=mock`
- `NEXT_PUBLIC_PREDICTION_ENDPOINT=`
- `NEXT_PUBLIC_DRAW_INPUT_MODE=pointer`

No secrets.

### `implementation/docs/ARCHITECTURE.md`
Explain Next/React/domain/MediaPipe/provider/KAPLAY/state ownership.

### `implementation/docs/PARTNER_PREDICTION_ADAPTER_SPEC.md`
Internal adapter specification.

### `implementation/docs/PROVISIONAL_PRODUCT_UI.md`
List non-final implementation details:
- Momo placeholder;
- level content;
- Override control;
- MediaPipe gesture;
- character controller;
- visual tokens.

### `implementation/docs/MANUAL_QA_CHECKLIST.md`
Checklist for CAN(USER).

### `implementation/docs/HANDOFF_FOR_NEXT_WORKER.md`
Critical continuity artifact if Ox Alpha disappears.

Include:
- architecture;
- modules;
- commands;
- real/mock;
- provisional items;
- bugs;
- next work;
- exact files future worker reads first.

---

## TASK 18 — Manual QA preparation

Required.

Do NOT claim CAN(USER) manual QA happened.

Checklist should include:
- launch;
- desktop;
- small viewport;
- mouse;
- touch;
- camera permission;
- hand detection;
- provisional draw gesture;
- clear/redraw;
- Top-3;
- confidence;
- Accept;
- Correct;
- Override;
- Solid;
- Danger;
- failure/recovery;
- stages;
- Momo;
- visual weirdness;
- console errors.

Mark physical-device/camera checks explicitly.

---

## TASK 19 — Final regression gate

Required.

Final run:
- install;
- typecheck;
- lint if configured;
- tests;
- production build;
- E2E;
- static/export check if configured;
- manual/documented camera smoke.

No unexplained failure.

Compare final behavior against TASK-001 and ensure no core semantic regression.

---

## TASK 20 — Final report

Create:

`.ops/results/OX_ALPHA_FINAL_SPRINT_REPORT.md`

Do not overwrite old report.

Required sections:

1. STATUS
2. CAMPAIGN TASK ID
3. GOVERNANCE FILES READ
4. ACTUAL STARTING STATE
5. BASELINE VERIFICATION
6. MIGRATION SUMMARY
7. FINAL STACK
8. FINAL ARCHITECTURE
9. FILES CREATED/CHANGED/REMOVED
10. NEXT.JS RESULT
11. KAPLAY RESULT
12. MEDIAPIPE RESULT
13. POINTER/TOUCH FALLBACK RESULT
14. HITL RESULT
15. TOP-3/CONFIDENCE RESULT
16. ACCEPT/CORRECT/OVERRIDE RESULT
17. REDRAW RESULT
18. GAMEPLAY/LEVEL RESULT
19. MOMO RESULT
20. PARTNER ADAPTER RESULT
21. UI/RESPONSIVE RESULT
22. TEST COMMANDS + ACTUAL RESULTS
23. E2E RESULT
24. REAL CAMERA VERIFICATION — exactly what was/was not physically tested
25. MOCKS/PLACEHOLDERS
26. PARTNER DEPENDENCIES
27. UNRESOLVED PRODUCT ITEMS
28. KNOWN TECHNICAL DEBT
29. SECURITY/SECRETS CHECK
30. EXACT RUN INSTRUCTIONS
31. MANUAL QA REQUIRED
32. WHAT IS LEFT BEFORE USER TESTING
33. NEXT WORKER TASK
34. CLAIMS YOU CANNOT VERIFY

Top summary:

```text
AUTHOR-SIDE ENGINEERING STATUS:
[NEAR-COMPLETE / PARTIAL / BLOCKED]

NEXT FRONTEND:
[PASS/FAIL]

KAPLAY:
[PASS/FAIL]

MEDIAPIPE:
[PASS/PARTIAL/FAIL]

POINTER FALLBACK:
[PASS/FAIL]

HITL FLOW:
[PASS/FAIL]

TESTS:
[x/y]

E2E:
[x/y]

PARTNER MODEL:
[MOCK / REAL ADAPTER CONFIGURED]

MANUAL QA:
[PENDING CAN(USER)]
```

Never report COMPLETE just because files were generated.

---

# 8. FINAL DEFINITION OF DONE

Successful sprint = CAN(USER)-owned app is near implementation-complete and primarily waiting on:

- final Momo/visual assets from CAN(USER)/Dola;
- real partner classifier endpoint/contract;
- product items deliberately kept provisional;
- CAN(USER) manual QA;
- actual user testing/evaluation;
- academic document revisions.

Engineering should include:

- Next App Router;
- no invented backend;
- TypeScript;
- preserved HITL semantics;
- pointer/touch drawing;
- MediaPipe hand input;
- graceful fallback;
- Top-3/confidence;
- Accept/Correct/Override;
- Redraw;
- final decision;
- KAPLAY runtime;
- Solid/Danger;
- fail/retry/repeat/complete;
- 3-stage framework;
- Momo placeholder/text;
- mock provider;
- partner client adapter;
- error handling;
- responsive UI;
- automated tests;
- real-browser E2E;
- docs;
- next-worker handoff.

---

# 9. STOP CONDITIONS

Do NOT stop for:
- normal component architecture;
- CSS method;
- module naming;
- test helper;
- KAPLAY scene organization;
- smoothing constant tuning;
- MediaPipe implementation detail;
- ordinary migration refactors;
- fixable build/test failures.

Escalate only when:
1. newer governance conflicts;
2. safe provisional behavior is impossible without inventing product truth;
3. external credential/partner service is required and mock cannot substitute;
4. destructive/out-of-scope file changes are required;
5. environment failure cannot be repaired safely.

Continue all other tasks.

---

# 10. AUTHORIZED WRITE SCOPE

Allowed:
- `implementation/**`
- `.ops/results/**`
- `.ops/outbox/rnd/**`
- `scratch/ox-final-sprint-2026-08-23/**`

Forbidden without explicit approval:
- `INSTRUCTION.md`
- `CHANGELOG.md`
- `SOURCE_OF_TRUTH.md`
- `AGENTS.md`
- `PROJECT_MEMORY.md`
- `WORKING_CONTEXT.md`
- proposal
- meetings
- research papers
- `archive/**`
- partner ML/model code

Do NOT:
- git push;
- destructive reset/clean;
- mass-delete unrelated files;
- store secrets;
- build backend;
- train models;
- fabricate evaluation.

---

# 11. PRIORITY IF OX ALPHA AVAILABILITY BECOMES LIMITED

## P0
1. governance/source read
2. rollback
3. Next migration
4. preserve HITL/tests
5. KAPLAY
6. MediaPipe + pointer fallback
7. full main flow
8. build/tests/E2E

## P1
9. partner adapter
10. error/recovery
11. responsive/accessibility
12. docs/handoff

## P2
13. extra diagnostics
14. nonessential polish

Never trade correctness for decorative UI.

---

# 12. FINAL SELF-AUDIT

Before reporting:

- Did I really migrate Vite → Next instead of just wrapping it?
- Is Vite runtime gone?
- Is gameplay actually KAPLAY?
- Was custom AABB removed only after replacement verification?
- Does MediaPipe actually produce normalized strokes?
- Does pointer/touch survive camera failure?
- Does camera stop outside drawing?
- Is Redraw still recovery?
- Is Correct still rank 2/3?
- Does gameplay consume final human decision?
- Did I accidentally build backend?
- Did I touch partner ML work?
- Are mock predictions clearly mock?
- Did I call provisional UI/art final?
- Did required tests actually run?
- Did real-browser E2E run?
- Did I falsely claim physical camera verification?
- Can another worker continue if Ox disappears?

Investigate any uncertain answer before final reporting.

---

# 13. START NOW

Interpret this campaign as authorization to:

> aggressively complete the CAN(USER)-owned Sketchbook Universe application using Next.js + KAPLAY + MediaPipe while preserving current product governance, excluding backend/partner-ML work, and continuing autonomously through migration, implementation, verification, cleanup, and handoff.

Begin with TASK 00.

Do not wait for another planning approval.
