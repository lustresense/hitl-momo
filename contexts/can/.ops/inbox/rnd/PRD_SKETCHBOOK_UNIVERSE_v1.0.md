# PRODUCT REQUIREMENTS DOCUMENT
# Sketchbook Universe — Author-Side Interactive Product

**Version:** 1.0  
**Date:** 2026-08-22  
**Owner:** R&D  
**Product authority:** CAN(USER) — Project Owner / Product & R&D Lead / Final Approver  
**Execution audience:** IT Worker  
**Internal/IP name:** Sketchbook Universe  
**Primary users:** SMP grades 7–9

---

## 0. PURPOSE

This is the Product Requirements Document for the application itself.

It defines what the product must do, the student experience, product semantics, author/partner boundaries, acceptance criteria, and the worker's delivery target.

This PRD does not replace repository governance. If something conflicts, use:
1. latest explicit instruction from CAN(USER);
2. current `CHANGELOG.md`;
3. current `SOURCE_OF_TRUTH.md`;
4. this PRD;
5. actual current implementation evidence;
6. supporting proposal/meeting/research evidence.

Do not let archive, old proposal wording, AI summaries, or stale memories override governed decisions.

---

# 1. PRODUCT DEFINITION

Sketchbook Universe is one integrated interactive AI-literacy experience for SMP students.

The central learning behavior is:

> The student evaluates AI output instead of treating it as automatically correct.

Canonical loop:

```text
DRAW
  ↓
AI TOP-3 PREDICTIONS + CONFIDENCE
  ↓
HUMAN EVALUATION
  ↓
ACCEPT / CORRECT / OVERRIDE
  ↓
FINAL LABEL / DECISION
  ↓
2D GAMEPLAY CONSEQUENCE
  ↓
RETRY / REVISE / CONTINUE / COMPLETE
```

Redraw is an iteration/recovery route back to drawing. It is not a fourth peer HITL decision.

Experience hierarchy:

```text
INTERACTION
   ↓
GAMEPLAY / STORYLINE
   ↓
EDUCATION THROUGH EXPERIENCE
```

The student—not the AI and not Momo—is the final decision maker.

---

# 2. PRODUCT GOALS

## PG-01 — Make AI uncertainty visible
Show multiple plausible predictions and confidence information rather than one authoritative answer.

## PG-02 — Require human validation
The student must explicitly decide what to do with model output before it affects gameplay.

## PG-03 — Preserve human agency
The student can Accept, Correct, or Override.

## PG-04 — Make the decision consequential
The final human decision creates an observable gameplay consequence.

## PG-05 — Support iteration and recovery
The student can revise, redraw, retry, repeat, and recover from failure.

## PG-06 — Stay understandable for SMP users
Prioritize clarity, understandable confidence, visible state, and obvious next actions.

## PG-07 — Remain integration-ready
The author-side implementation must run with explicit development mocks while the partner classifier/backend remains replaceable through adapters.

---

# 3. NON-GOALS / FORBIDDEN PRODUCT EXPANSION

Do not silently add:
- chatbot or free-form AI conversation;
- LLM/RAG/NLP as a student-facing feature;
- voice assistant;
- Momo as object creator;
- Momo as final decision maker;
- active space/planet theme;
- pre/post test as default evaluation;
- artificial confidence manipulation;
- forced wrong model predictions;
- final login/history system;
- final admin/superadmin system;
- final dashboard/export;
- K-Means analytics;
- final database schema;
- model training;
- QuickDraw dataset experimentation;
- CNN/MobileNet training;
- partner-owned classifier;
- final Momo visual;
- universal object semantics;
- final MediaPipe/camera dependency unless explicitly confirmed later.

---

# 4. TARGET USER

Primary target: **SMP students, grades 7–9**.

Product implications:
- no technical AI knowledge assumed;
- confidence must be readable but not presented as certainty;
- decision states must be visually distinguishable;
- failure must expose a clear recovery action;
- the student remains the evaluator.

Do not claim unsupported psychological/cognitive outcomes.

---

# 5. PRODUCT ROLES / LORE

## 5.1 Illustrator / Student
The student is the Illustrator from outside the sketchbook world.

The Illustrator:
- creates the object;
- observes predictions;
- evaluates AI;
- makes the final decision;
- determines what enters gameplay through that decision.

## 5.2 Momo
Momo is a contextual companion / pattern reader.

Momo may:
- show short contextual text bubbles;
- direct attention to Top-3;
- prompt comparison;
- react to decisions;
- provide recovery guidance;
- react to progression.

Momo must not:
- create the student's object;
- decide for the student;
- require voice;
- become a chatbot;
- require LLM/NLP/RAG/free chat.

Final Momo visual remains unresolved and replaceable.

---

# 6. OWNERSHIP

## 6.1 Author-side scope — this worker may implement
- student-facing interaction;
- UI/UX;
- drawing/input UI;
- canvas input;
- interface-side preprocessing;
- input abstraction;
- Top-3/confidence presentation;
- Accept/Correct/Override;
- final decision state;
- Redraw/retry/revision;
- 2D gameplay;
- Solid/Danger behavior consequence;
- Momo contextual presentation;
- level progression framework;
- event-flow hooks;
- explicit development mocks;
- frontend/domain tests;
- integration adapters.

## 6.2 Partner-owned scope — do not take over
- classifier/model training;
- QuickDraw/model experimentation;
- real prediction model;
- real confidence output;
- shared production data contract;
- logging/database backend;
- dashboard/export;
- pattern-analysis pipeline.

The worker may define frontend-facing seams/adapters only.

---

# 7. GLOBAL PRODUCT FLOW

Three primary phases:

```text
PHASE A — DRAW / INPUT
        ↓
PHASE B — PREDICTION EVALUATION + HUMAN DECISION
        ↓
PHASE C — GAMEPLAY CONSEQUENCE
```

The application must support:
- start / level entry;
- drawing;
- clear/revise;
- submit;
- prediction loading;
- prediction error;
- Top-3 display;
- confidence display;
- Accept;
- Correct;
- Override;
- Redraw;
- final decision;
- gameplay consequence;
- fail;
- retry;
- repeat cycle;
- success;
- level complete;
- summary/end state where appropriate.

No dead-end state.

---

# 8. FUNCTIONAL REQUIREMENTS

## FR-01 — Drawing workspace
Provide:
- drawable area;
- clear/restart action;
- submit action;
- empty drawing validation;
- normalized output for the prediction provider;
- redraw/revision support.

A pointer/touch canvas is sufficient for the development vertical slice.

Finger tracking / MediaPipe stays behind an input abstraction unless explicitly confirmed later.

## FR-02 — Prediction-provider boundary
Submitting a valid drawing calls a prediction-provider interface.

States:
- idle;
- loading;
- success;
- failure;
- retry/recovery.

Provider failure must not silently become fabricated real output.

## FR-03 — Top-3 prediction UI
On success, show:
- exactly three candidates when Top-3 is returned;
- label;
- rank;
- confidence;
- enough distinction for comparison.

Confidence is not proof of correctness.

## FR-04 — Accept
Meaning: student agrees with rank 1.

Behavior:
- rank 1 becomes final label;
- decision type = `accept`;
- source rank = 1;
- gameplay transition becomes valid.

## FR-05 — Correct
Meaning: intended label is in Top-3 but not rank 1.

Behavior:
- student chooses rank 2 or rank 3;
- chosen candidate becomes final label;
- decision type = `correct`;
- source rank preserved.

Correct is not arbitrary text override.

## FR-06 — Override
Meaning: student rejects all Top-3.

Behavior:
- provide/select another intended label;
- reject empty/invalid input;
- alternative becomes final label;
- decision type = `override`.

Exact Override UI remains reversible/unlocked. Use the smallest understandable implementation without pretending it is final.

## FR-07 — Redraw / retry
Redraw:
- returns to drawing;
- allows revision/replacement;
- resets appropriate prediction/decision state;
- preserves broader level context where appropriate.

Redraw is **not** a fourth peer decision beside Accept/Correct/Override.

## FR-08 — Final decision state
Before gameplay, explicitly resolve the human decision.

Conceptually:

```ts
type HumanDecision =
  | { type: "accept"; finalLabel: string; sourceRank: 1 }
  | { type: "correct"; finalLabel: string; sourceRank: 2 | 3 }
  | { type: "override"; finalLabel: string }
```

Gameplay consumes the resolved human decision—not raw rank-1 output.

## FR-09 — Gameplay behavior mapping
Map final label to a level-context behavior.

Active semantics:
- `Solid`
- `Danger`

Mapping must be configurable and context-aware.

Do not assume object X is globally always Solid/Danger.

Conceptually:

```ts
type ObjectBehavior = "solid" | "danger" | "unresolved"

interface BehaviorResolver {
  resolve(finalLabel: string, levelContext: LevelContext): ObjectBehavior
}
```

Unresolved labels produce a controlled fallback.

## FR-10 — Solid consequence
Configured Solid produces a visible useful/solid 2D gameplay consequence appropriate to the level.

## FR-11 — Danger consequence
Configured Danger produces a visible dangerous/failure consequence with a recovery path.

## FR-12 — 2D gameplay loop
Must be able to:
- consume resolved behavior;
- show consequence;
- reach failure/success;
- recover/retry;
- repeat interaction;
- reach level completion.

Exact character-control scheme remains unresolved.

## FR-13 — Level progression framework
Support configurable progression:

### Stage 1 — Foundation
Understand draw → prediction → decision → consequence.

### Stage 2 — Ambiguity / comparison
Emphasize Top-3 comparison, confidence, Correct/Override.

### Stage 3 — Critical validation
Emphasize deliberate validation instead of blind acceptance.

Do not invent final object lists, confidence bands, traps, deception scripts, or story text.

## FR-14 — Momo contextual guidance
Momo may show state-driven text bubbles:
- drawing cue;
- prediction comparison cue;
- decision reaction;
- recovery message;
- progression message.

No free-form generative chat required.

## FR-15 — Error/recovery handling
Handle:
- empty drawing;
- prediction loading;
- provider failure;
- malformed prediction response;
- invalid Override;
- unresolved behavior;
- gameplay failure;
- Redraw;
- restart.

Every error must offer a clear next action.

## FR-16 — Development mock prediction provider
Required until partner classifier exists.

Requirements:
- clearly named mock/dev;
- deterministic fixtures preferred;
- Top-3/confidence shape;
- usable for acceptance tests;
- never presented as measured classifier performance.

## FR-17 — Prediction normalization seam

Conceptual internal contract:

```ts
type PredictionCandidate = {
  label: string
  confidence: number
}

type PredictionResult = {
  candidates: [
    PredictionCandidate,
    PredictionCandidate,
    PredictionCandidate
  ]
}

interface PredictionProvider {
  predict(input: DrawingInput): Promise<PredictionResult>
}
```

This is internal normalization, not final partner wire schema.

## FR-18 — Interaction event seam
Provide a clean boundary for future partner logging.

Relevant concepts may include:
- drawing submitted;
- prediction displayed;
- decision type;
- selected rank;
- final label;
- Redraw;
- gameplay result;
- level progression.

Do not invent final production database/event schema.

---

# 9. VISUAL / UI REQUIREMENTS

Visual authority:
1. explicit CAN(USER) selection/instruction;
2. selected Dola reference;
3. current active design assets;
4. neutral replaceable placeholder.

Do not revive the old space/planet direction.

Dola is Visual R&D. Engineering implements selected references, not every generated exploration.

If no selected Dola reference exists:
- use functional replaceable placeholders;
- do not lock a new final visual direction.

UI must clearly distinguish:
- drawing;
- loading;
- prediction evaluation;
- Accept;
- Correct;
- Override;
- Redraw;
- gameplay;
- errors;
- success/failure.

Keep visual assets/tokens replaceable without rewriting domain logic.

---

# 10. ARCHITECTURE REQUIREMENTS

Keep concerns separable:
1. drawing/input;
2. preprocessing/normalization;
3. prediction provider;
4. Top-3 presentation;
5. human-decision resolver;
6. final-decision state;
7. level configuration;
8. behavior resolver;
9. gameplay runtime;
10. Momo presentation;
11. event sink;
12. app state/flow.

Avoid one monolithic controller.

Architecture must allow:
- provider replacement;
- input modality replacement;
- Dola/Momo visual replacement;
- level-content iteration;
- independent testing.

---

# 11. TECHNOLOGY STATUS AND WORKER AUTONOMY

The following are not product-final merely because they exist in old documents:
- KAPLAY.js/Kaboom;
- MediaPipe;
- TensorFlow.js;
- CNN;
- MobileNet;
- SQLite;
- REST;
- K-Means;
- any frontend framework;
- any game engine.

If `implementation/` has no active stack, the worker may choose the smallest maintainable browser-first stack that satisfies this PRD.

Worker does not need R&D approval for ordinary reversible engineering choices such as:
- framework;
- build tool;
- state approach;
- test framework;
- file organization;
- dev dependencies;

provided the choice does not change product semantics, ownership, user flow, visual direction, research method, or partner contract.

Document the choice and rationale.

Escalate only true product decisions.

---

# 12. NON-FUNCTIONAL REQUIREMENTS

## NFR-01 — Explicit state
Core state transitions must be represented clearly enough to test.

## NFR-02 — Recoverability
Provider/game failures must not require full app restart.

## NFR-03 — Replaceability
Provider, visuals, level config, and input modality must be replaceable.

## NFR-04 — Testability
Accept, Correct, Override, Redraw, provider failure, Solid, and Danger must be testable.

## NFR-05 — No fake AI
Mock/dev output never masquerades as real model output.

## NFR-06 — Secret safety
No credentials embedded in source.

## NFR-07 — Maintainability
Avoid unnecessary framework proliferation and duplicated state.

## NFR-08 — Browser-first
Unless actual current implementation evidence requires otherwise, keep the author-side experience runnable in a browser.

---

# 13. REQUIRED USER FLOW

```text
START / LEVEL ENTRY
        ↓
DRAWING
        ├── clear/revise
        ↓
SUBMIT
        ├── invalid → drawing feedback
        ↓
PREDICTION LOADING
        ├── failure → retry / redraw
        ↓
TOP-3 + CONFIDENCE
        ├── redraw → DRAWING
        ├── ACCEPT ─────────┐
        ├── CORRECT ────────┤
        └── OVERRIDE ───────┤
                            ↓
                       FINAL LABEL
                            ↓
                   BEHAVIOR RESOLUTION
                            ↓
                      2D GAMEPLAY
                    ┌───────┴────────┐
                    ↓                ↓
                  FAIL            SUCCESS
                    ↓                ↓
              RETRY/REDRAW       NEXT CYCLE /
                                 LEVEL COMPLETE
```

---

# 14. ACCEPTANCE CRITERIA

- **AC-01** Student can draw, clear/revise, and submit.
- **AC-02** Successful provider displays Top-3 + confidence.
- **AC-03** Accept resolves rank 1.
- **AC-04** Correct can resolve rank 2.
- **AC-05** Correct can resolve rank 3.
- **AC-06** Override can resolve a valid non-Top-3 label.
- **AC-07** Gameplay cannot start before final decision.
- **AC-08** Redraw returns to drawing and is not peer fourth decision.
- **AC-09** Solid produces visible configured consequence.
- **AC-10** Danger produces failure/danger + recovery.
- **AC-11** Provider failure is visible and recoverable.
- **AC-12** Momo guides but never creates/decides.
- **AC-13** Loop can repeat and reach level completion.
- **AC-14** Full author-side vertical slice works with explicit mock provider.
- **AC-15** Real partner provider can replace mock through adapter.
- **AC-16** Selected Dola/Momo visuals can replace placeholders without domain rewrite.

---

# 15. REQUIRED VERIFICATION

Produce evidence for:
- clean documented setup;
- application starts;
- build succeeds;
- typecheck/lint where applicable;
- state-flow tests;
- Accept;
- Correct rank 2;
- Correct rank 3;
- Override;
- Redraw;
- empty drawing;
- provider failure;
- malformed prediction;
- Solid;
- Danger;
- at least one complete vertical slice;
- no unexplained critical runtime/console errors in verified flow.

Manual screenshots are useful but not a substitute for executable checks where practical.

---

# 16. DEFINITION OF DONE — AUTHOR SIDE

Author-side implementation satisfies PRD v1.0 when:
1. clean setup starts the app;
2. drawing works;
3. provider boundary returns Top-3/confidence;
4. Accept works;
5. Correct rank 2/3 works;
6. Override works;
7. final decision is explicit;
8. Redraw/retry works;
9. Solid/Danger consequences work;
10. gameplay can fail/recover/repeat/complete;
11. Momo respects its role;
12. partner systems remain behind adapters;
13. mocks are explicit;
14. tests/verification pass;
15. no revoked concept is restored;
16. unresolved product decisions remain unresolved;
17. final worker report contains real evidence.

Do not claim the entire PA is finished while partner-side model/data/backend or academic work remains incomplete.

---

# 17. CURRENT UNRESOLVED ITEMS

Do not silently finalize:
- Momo visual;
- exact level objects;
- obstacle layout;
- exact confidence visual style;
- final Override control;
- character-control scheme;
- MediaPipe/camera use;
- login/history;
- production event/log schema;
- dashboard;
- confidence manipulation;
- application stack as a governed academic/product decision.

Reversible engineering choices are allowed where needed.
