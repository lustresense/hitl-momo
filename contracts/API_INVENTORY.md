# API Inventory — Sketchbook Universe

Source: FastAPI routers in `backend/app/main.py`, `backend/app/classroom.py`, `backend/app/dashboard.py`
(Dias canonical, source SHA `81bab5eb`). Status legend:

- `EXISTING` = route decorator found in backend source.
- `PROPOSED` = mentioned in planning docs only; **not** in source.
- `RUNTIME_VERIFIED` is NOT claimed here. Runtime status is recorded in `docs/migration/INTEGRATION_REPORT.md`.

Consumers were checked by grepping `frontend/implementation/src` (Can game) and `frontend/admin/lib` (Dias admin).

## Game-facing endpoints (Can client consumes)

| Method | Path | Status | Source | Consumer | Auth | Notes |
|---|---|---|---|---|---|---|
| GET | `/health` | EXISTING | `main.py:35` | ops | none | returns `{"status":"ok"}` |
| POST | `/predict` | EXISTING | `main.py:40` | Can `partner-http-provider` (via `NEXT_PUBLIC_PREDICTION_ENDPOINT`) | none | body `{"drawing": {...}}`; response `{"candidates": [...]}`. Real model loaded from `MODEL_PATH`; no mock path in backend |
| GET | `/api/join/{token}` | EXISTING | `classroom.py:30` | Can `api/classroom-client.ts:99` | class token in path | returns class_name, school_name, student_count, taken_numbers |
| POST | `/api/join/{token}/students` | EXISTING | `classroom.py:47` | Can `api/classroom-client.ts:108` | class token in path | body `{"number": int>=1, "name": str 1–80}`; upserts by (class, number) |
| POST | `/api/submissions` | EXISTING | `classroom.py:89` | Can `api/submission-client.ts` | **none** (class token inside body) | body includes `join_token`, `student_id`, `level_id`, `strokes`, `candidates`, `decision_type`, `source_rank`, `final_label`. **Not idempotent**: every call inserts a new row (`INSERT`, no unique key) |

## Admin-facing endpoints (Dias dashboard consumes)

| Method | Path | Status | Source | Consumer | Auth |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | EXISTING | `dashboard.py:72` | `frontend/admin/lib/api.ts:147` | email+password, 401 on failure |
| GET | `/api/auth/me` | EXISTING | `dashboard.py:81` | `api.ts:148` | `current_user` |
| POST | `/api/auth/logout` | EXISTING | `dashboard.py:86` | `api.ts:149` | session |
| GET | `/api/schools` | EXISTING | `dashboard.py:108` | `api.ts:151` | superadmin |
| POST | `/api/schools` | EXISTING | `dashboard.py:123` | `api.ts:152` | superadmin |
| GET | `/api/schools/{school_id}` | EXISTING | `dashboard.py:129` | `api.ts:153` | superadmin |
| POST | `/api/schools/{school_id}/admins` | EXISTING | `dashboard.py:161` | `api.ts:155` | superadmin |
| GET | `/api/classes` | EXISTING | `dashboard.py:189` | `api.ts:158` | current_user |
| POST | `/api/classes` | EXISTING | `dashboard.py:206` | `api.ts:160` | current_user |
| GET | `/api/classes/{class_id}` | EXISTING | `dashboard.py:220` | `api.ts:161` | current_user |
| DELETE | `/api/classes/{class_id}` | EXISTING | `dashboard.py:226` | `api.ts:162` | current_user |
| GET | `/api/classes/{class_id}/submissions` | EXISTING | `dashboard.py:233` | `api.ts:168` | current_user |
| GET | `/api/submissions/{submission_id}/image.png` | EXISTING | `dashboard.py:265` | admin | current_user |
| GET | `/api/classes/{class_id}/export.csv` | EXISTING | `dashboard.py:291` | admin | current_user |
| GET | `/api/classes/{class_id}/export.zip` | EXISTING | `dashboard.py:303` | admin | current_user |

## Proposed only (NOT implemented; do not treat as existing API)

| Method | Path | Status | Evidence of absence |
|---|---|---|---|
| GET | `/api/v1/model-info` | PROPOSED | `grep -rn "model-info" backend` → no match |
| PATCH | `/api/submissions/{id}/outcome` | PROPOSED | `grep -rn "/outcome" backend` → no match |

Also PROPOSED, not in source: `prediction_id`, `model_version`, idempotency keys, session token, rate limit. These are gaps for the Can–Dias contract, pending joint approval.

## Known contract risks found during inventory

1. `POST /api/submissions` has no auth and no idempotency. Retries from the outbox can create duplicate rows. Mitigation requires a server-side change, which needs joint Can + Dias approval.
2. `main.py` sets `allow_origins=["*"]` together with `allow_credentials=True`. Runtime probe (`docs/migration/INTEGRATION_REPORT.md`, check CORS) shows the server echoes any `Origin` back, so any website can make credentialed requests to the API when a teacher is logged in. This is a permissive CORS risk, not a broken setup. Needs a Dias decision; not changed here.
3. `/predict` has no auth. Acceptable for a demo; a production decision is open.
