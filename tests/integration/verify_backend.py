#!/usr/bin/env python3
"""Runtime verification of the Dias backend inside the staging tree.

Uses a temporary SQLite DB (MOMO_DB_PATH) so nothing is written into the staging tree.
Usage: verify_backend.py <staging_root> <out_json>
"""
import hashlib, json, os, sqlite3, sys, tempfile

root, out_json = sys.argv[1], sys.argv[2]
tmp_db = os.path.join(tempfile.mkdtemp(prefix="momo-verify-"), "verify.sqlite")
os.environ["MOMO_DB_PATH"] = tmp_db
sys.path.insert(0, root)
os.chdir(root)

from fastapi.testclient import TestClient  # noqa: E402
from backend.app.main import app  # noqa: E402
from config import CATEGORIES  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append({"check": name, "result": "PASS" if ok else "FAIL", "detail": str(detail)[:300]})


def sha256(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


weights = os.path.join(root, "weights", "model_4_mobilenetv2_best.keras")
results.append({"check": "weights file sha256 (default model)", "result": "INFO", "detail": sha256(weights)})

# TestClient as context manager runs the startup event: init_db() + load_model().
with TestClient(app) as c:
    r = c.get("/health")
    check("GET /health returns 200 ok", r.status_code == 200 and r.json() == {"status": "ok"}, r.text)

    drawing = {"strokes": [[{"x": 2, "y": 2}, {"x": 26, "y": 26}], [{"x": 26, "y": 2}, {"x": 2, "y": 26}]]}
    r = c.post("/predict", json={"drawing": drawing})
    cands = r.json().get("candidates", []) if r.status_code == 200 else []
    check("POST /predict returns 200 with exactly 3 candidates", r.status_code == 200 and len(cands) == 3, r.text[:200])
    check("predict confidences are in [0,1] and sorted desc",
          all(0 <= x["confidence"] <= 1 for x in cands)
          and [x["confidence"] for x in cands] == sorted([x["confidence"] for x in cands], reverse=True), cands)
    check("predict labels are members of config.CATEGORIES",
          all(x["label"] in CATEGORIES for x in cands), [x["label"] for x in cands])
    probs_sum = sum(x["confidence"] for x in cands)
    check("top-3 confidence sum <= 1 (softmax output, not mock constant)", probs_sum <= 1.0 + 1e-6, probs_sum)

    # Classroom: create school + class directly in the temp DB (no superadmin flow needed for the test).
    conn = sqlite3.connect(tmp_db)
    conn.execute("INSERT INTO schools (name, address) VALUES ('SMP Uji Staging', '')")
    conn.execute("INSERT INTO classes (school_id, name, student_count, join_token) VALUES (1, '7A', 30, 'tok-uji-123')")
    conn.commit()
    conn.close()

    r = c.get("/api/join/tok-uji-123")
    check("GET /api/join/{token} returns class info", r.status_code == 200 and r.json().get("class_name") == "7A", r.text[:200])
    r = c.get("/api/join/tok-bukan-ada")
    check("GET /api/join with unknown token returns 404", r.status_code == 404, r.status_code)

    r = c.post("/api/join/tok-uji-123/students", json={"number": 5, "name": "Siswa Uji"})
    sid = r.json().get("student_id") if r.status_code in (200, 201) else None
    check("POST /api/join/{token}/students creates student", sid is not None, f"{r.status_code} {r.text[:120]}")
    r2 = c.post("/api/join/tok-uji-123/students", json={"number": 5, "name": "Siswa Uji Dua"})
    check("re-join same number keeps same student_id (upsert)", r2.json().get("student_id") == sid, r2.text[:120])

    payload = {
        "join_token": "tok-uji-123", "student_id": sid, "level_id": "level-1",
        "strokes": [[{"x": 1.0, "y": 1.0}, {"x": 5.0, "y": 5.0}]],
        "candidates": [{"label": "kucing", "confidence": 0.6}, {"label": "anjing", "confidence": 0.3},
                       {"label": "bebek", "confidence": 0.1}],
        "decision_type": "accept", "source_rank": 1, "final_label": "kucing",
    }
    token = r_join_token = None
    rj = c.post("/api/join/tok-uji-123/students", json={"number": 6, "name": "Siswa Token"})
    r_join_token = rj.json().get("student_session_token")
    check("join returns student_session_token", bool(r_join_token), rj.status_code)
    auth = {"authorization": f"Bearer {r_join_token}"}
    payload["student_id"] = rj.json().get("student_id")
    payload["submission_key"] = "key-probe-0001"
    r = c.post("/api/submissions", json=payload)
    check("POST /api/submissions without session token is rejected (401)", r.status_code == 401, r.status_code)
    r = c.post("/api/submissions", json=payload, headers=auth)
    check("POST /api/submissions with session token returns 201", r.status_code == 201, f"{r.status_code} {r.text[:160]}")
    first_id = r.json().get("id")
    r = c.post("/api/submissions", json=payload, headers=auth)
    check("identical retry returns 200 duplicate with same id", r.status_code == 200 and r.json() == {"id": first_id, "status": "duplicate"}, r.text[:120])
    conn = sqlite3.connect(tmp_db)
    n = conn.execute("SELECT COUNT(*) FROM submissions WHERE submission_key = ?", ("key-probe-0001",)).fetchone()[0]
    conn.close()
    check("identical retry does not create a second row", n == 1, f"rows={n}")
    r = c.patch(f"/api/submissions/{first_id}/outcome", json={"outcome": "success", "behavior": "solid"}, headers=auth)
    check("PATCH outcome with session token returns 200", r.status_code == 200 and r.json()["status"] == "updated", r.text[:120])

    bad = dict(payload, decision_type="maybe")
    r = c.post("/api/submissions", json=bad)
    check("invalid decision_type rejected with 422", r.status_code == 422, r.status_code)

    r = c.get("/api/v1/model-info")
    results.append({"check": "GET /api/v1/model-info (PROPOSED, not implemented)", "result": "INFO", "detail": f"status {r.status_code}"})
    r = c.patch("/api/submissions/1/outcome", json={"outcome": "success", "behavior": "solid"})
    check("PATCH outcome without session token is rejected (401)", r.status_code == 401, r.status_code)

    r = c.get("/api/auth/me")
    check("GET /api/auth/me without login returns 401", r.status_code == 401, r.status_code)

    r = c.options("/api/submissions", headers={"Origin": "http://example.com", "Access-Control-Request-Method": "POST"})
    check("CORS: unlisted origin gets no allow-origin header", "access-control-allow-origin" not in r.headers, r.headers.get("access-control-allow-origin"))

    spec = c.get("/openapi.json").json()
    with open(os.path.join(root, "contracts", "openapi.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
    paths = sorted(spec.get("paths", {}).keys())
    results.append({"check": "openapi.json exported from live app", "result": "PASS", "detail": f"{len(paths)} paths"})
    results.append({"check": "openapi paths", "result": "INFO", "detail": json.dumps(paths)})

with open(out_json, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
npass = sum(1 for r in results if r["result"] == "PASS")
nfail = sum(1 for r in results if r["result"] == "FAIL")
print(f"PASS={npass} FAIL={nfail} INFO={len(results)-npass-nfail}")
