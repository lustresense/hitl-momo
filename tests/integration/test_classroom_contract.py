"""Classroom contract tests: Can game client <-> Dias FastAPI backend.

Runs the real FastAPI app in-process against a temporary SQLite database.
No model weights are loaded here (inference is covered by verify_backend.py).

Run from repo root:  python -m pytest tests/integration -q
"""
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ["MOMO_DB_PATH"] = os.path.join(tempfile.mkdtemp(prefix="momo-contract-"), "contract.sqlite")
os.environ.setdefault("MODEL_PATH", str(ROOT / "weights" / "model_4_mobilenetv2_best.keras"))
sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import db as dbmod  # noqa: E402
from backend.app.classroom import OutcomeBody, SubmissionBody  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.passwords import hash_password  # noqa: E402

FIXTURES = ROOT / "contracts" / "fixtures"
JOIN_TOKEN = "tok-contract-123"
ALLOWED_ORIGIN = "http://localhost:3344"


@pytest.fixture(scope="module")
def client():
    # Model loading happens at startup; stub it so this file tests the HTTP contract only.
    import backend.app.main as main_mod
    main_mod.load_model = lambda: None  # startup hook only; predict is not exercised here
    with TestClient(app) as c:
        conn = sqlite3.connect(os.environ["MOMO_DB_PATH"])
        conn.execute("INSERT INTO schools (name, address) VALUES ('SMP Kontrak', '')")
        conn.execute(
            "INSERT INTO classes (school_id, name, student_count, join_token) VALUES (1, '7A', 30, ?)",
            (JOIN_TOKEN,),
        )
        conn.execute(
            "INSERT INTO users (email, name, password_hash, role, school_id) VALUES (?, 'Guru', ?, 'superadmin', NULL)",
            ("guru@contract.test", hash_password("rahasia-uji-123")),
        )
        conn.commit()
        conn.close()
        yield c


def _join(client, number, name="Siswa Uji"):
    r = client.post(f"/api/join/{JOIN_TOKEN}/students", json={"number": number, "name": name})
    assert r.status_code == 200, r.text
    return r.json()


def _submission(student_id, key="key-0000001", level="level-1"):
    return {
        "submission_key": key,
        "join_token": JOIN_TOKEN,
        "student_id": student_id,
        "level_id": level,
        "attempt_id": "att-1",
        "prediction_id": "pred-1",
        "strokes": [[{"x": 1.0, "y": 1.0}, {"x": 5.0, "y": 5.0}]],
        "candidates": [
            {"label": "kucing", "confidence": 0.6},
            {"label": "anjing", "confidence": 0.3},
            {"label": "bebek", "confidence": 0.1},
        ],
        "decision_type": "accept",
        "source_rank": 1,
        "final_label": "kucing",
        "redraw_count": 0,
    }


def _bearer(token):
    return {"authorization": f"Bearer {token}"}


def test_join_returns_legacy_fields_and_session_token(client):
    info = client.get(f"/api/join/{JOIN_TOKEN}").json()
    assert info["class_name"] == "7A" and info["student_count"] == 30
    body = _join(client, 3)
    for key in ("student_id", "number", "name", "class_name"):
        assert key in body
    assert len(body["student_session_token"]) >= 32
    assert body["expires_in"] == 8 * 3600
    assert "joined_at" in body


def test_submission_requires_session_token(client):
    sid = _join(client, 4)["student_id"]
    r = client.post("/api/submissions", json=_submission(sid, key="key-noauth-1"))
    assert r.status_code == 401


def test_submission_rejects_token_of_other_student(client):
    a = _join(client, 5)
    b = _join(client, 6)
    r = client.post("/api/submissions", json=_submission(b["student_id"], key="key-other-1"), headers=_bearer(a["student_session_token"]))
    assert r.status_code == 403


def test_create_then_retry_is_idempotent(client):
    s = _join(client, 7)
    tok = s["student_session_token"]
    body = _submission(s["student_id"], key="key-retry-0001")
    r1 = client.post("/api/submissions", json=body, headers=_bearer(tok))
    assert r1.status_code == 201
    assert r1.json()["status"] == "created"
    sub_id = r1.json()["id"]
    r2 = client.post("/api/submissions", json=body, headers=_bearer(tok))
    assert r2.status_code == 200
    assert r2.json() == {"id": sub_id, "status": "duplicate"}
    conn = sqlite3.connect(os.environ["MOMO_DB_PATH"])
    n = conn.execute("SELECT COUNT(*) FROM submissions WHERE submission_key = 'key-retry-0001'").fetchone()[0]
    conn.close()
    assert n == 1


def test_outcome_requires_owner_session(client):
    owner = _join(client, 8)
    other = _join(client, 9)
    sid = client.post("/api/submissions", json=_submission(owner["student_id"], key="key-outc-0001"),
                      headers=_bearer(owner["student_session_token"])).json()["id"]
    out = {"outcome": "success", "behavior": "solid", "retry_count": 0}
    assert client.patch(f"/api/submissions/{sid}/outcome", json=out).status_code == 401
    assert client.patch(f"/api/submissions/{sid}/outcome", json=out, headers=_bearer(other["student_session_token"])).status_code == 404
    r = client.patch(f"/api/submissions/{sid}/outcome", json=out, headers=_bearer(owner["student_session_token"]))
    assert r.status_code == 200 and r.json() == {"id": sid, "status": "updated"}


def test_outcome_rejects_unknown_behavior(client):
    s = _join(client, 10)
    sid = client.post("/api/submissions", json=_submission(s["student_id"], key="key-badout-1"),
                      headers=_bearer(s["student_session_token"])).json()["id"]
    r = client.patch(f"/api/submissions/{sid}/outcome", json={"outcome": "success", "behavior": "maybe"},
                     headers=_bearer(s["student_session_token"]))
    assert r.status_code == 422


def test_expired_session_is_rejected(client):
    s = _join(client, 11)
    conn = sqlite3.connect(os.environ["MOMO_DB_PATH"])
    conn.execute("UPDATE student_sessions SET expires_at = '2000-01-01T00:00:00+00:00' WHERE student_id = ?", (s["student_id"],))
    conn.commit()
    conn.close()
    r = client.post("/api/submissions", json=_submission(s["student_id"], key="key-expired-1"),
                    headers=_bearer(s["student_session_token"]))
    assert r.status_code == 401


def test_cors_allows_configured_origin_only(client):
    ok = client.options("/api/submissions", headers={"Origin": ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST",
                                                      "Access-Control-Request-Headers": "authorization,content-type"})
    assert ok.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    assert "access-control-allow-credentials" not in ok.headers
    bad = client.options("/api/submissions", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_dashboard_lists_submission_with_student_identity(client):
    s = _join(client, 12, name="Ani Uji")
    client.post("/api/submissions", json=_submission(s["student_id"], key="key-dash-0001"),
                headers=_bearer(s["student_session_token"]))
    login = client.post("/api/auth/login", json={"email": "guru@contract.test", "password": "rahasia-uji-123"})
    assert login.status_code == 200, login.text
    auth = {"authorization": f"Bearer {login.json()['token']}"}
    rows = client.get("/api/classes/1/submissions", headers=auth).json()
    mine = [r for r in rows if r["student_number"] == 12]
    assert mine, rows
    row = mine[0]
    assert row["student_name"] == "Ani Uji"
    assert row["final_label"] == "kucing" and row["decision_type"] == "accept"
    assert [c["label"] for c in row["candidates"]] == ["kucing", "anjing", "bebek"]


def test_init_db_is_idempotent_and_migrates():
    dbmod.init_db()
    dbmod.init_db()
    conn = sqlite3.connect(os.environ["MOMO_DB_PATH"])
    cols = {r[1] for r in conn.execute("PRAGMA table_info(submissions)")}
    idx = conn.execute("SELECT name FROM sqlite_master WHERE name = 'idx_submissions_student_key'").fetchone()
    conn.close()
    assert {"submission_key", "outcome", "behavior", "retry_count"} <= cols
    assert idx is not None


def test_shared_contract_fixtures_validate():
    """Fixtures are the shared contract. The Can client test checks its output against the same files."""
    import json

    sub = json.loads((FIXTURES / "submission-request.json").read_text(encoding="utf-8"))
    SubmissionBody.model_validate(sub)
    out = json.loads((FIXTURES / "outcome-request.json").read_text(encoding="utf-8"))
    OutcomeBody.model_validate(out)


def test_join_purges_expired_student_sessions(client):
    """Expired session rows are dead weight. A join cleans them, so the table cannot grow forever."""
    conn = sqlite3.connect(os.environ["MOMO_DB_PATH"])
    sid = _join(client, 6)["student_id"]
    conn.execute(
        "INSERT INTO student_sessions (token_hash, student_id, class_id, created_at, expires_at) "
        "VALUES ('expired-hash-1', ?, 1, '2020-01-01T00:00:00+00:00', '2020-01-02T00:00:00+00:00')",
        (sid,),
    )
    conn.commit()
    _join(client, 7)
    left = conn.execute("SELECT COUNT(*) FROM student_sessions WHERE token_hash = 'expired-hash-1'").fetchone()[0]
    conn.close()
    assert left == 0


def test_predict_rejects_oversized_drawing(client, monkeypatch):
    """/predict has no auth. A huge drawing must be refused before it costs CPU."""
    import backend.app.main as main_mod
    monkeypatch.setattr(main_mod, "predict_from_drawing", lambda d: [{"label": "x", "confidence": 1.0}])
    points = [{"x": float(i), "y": float(i)} for i in range(20_001)]
    r = client.post("/predict", json={"drawing": {"strokes": [points]}})
    assert r.status_code == 422


def test_predict_accepts_normal_drawing(client, monkeypatch):
    import backend.app.main as main_mod
    monkeypatch.setattr(main_mod, "predict_from_drawing", lambda d: [{"label": "x", "confidence": 1.0}])
    r = client.post("/predict", json={"drawing": {"strokes": [[{"x": 1.0, "y": 1.0}, {"x": 2.0, "y": 2.0}]]}})
    assert r.status_code == 200
    assert r.json()["candidates"][0]["label"] == "x"
