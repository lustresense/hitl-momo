import os, sys, json, sqlite3, tempfile
root = sys.argv[1]
os.environ["MOMO_DB_PATH"] = os.path.join(tempfile.mkdtemp(prefix="momo-probe-"), "p.sqlite")
sys.path.insert(0, root); os.chdir(root)
from fastapi.testclient import TestClient
from backend.app.main import app
out = {}
with TestClient(app) as c:
    conn = sqlite3.connect(os.environ["MOMO_DB_PATH"])
    conn.execute("INSERT INTO schools (name,address) VALUES ('S','')")
    conn.execute("INSERT INTO classes (school_id,name,student_count,join_token) VALUES (1,'7A',30,'tok-p')")
    conn.execute("INSERT INTO students (class_id,number,name) VALUES (1,3,'x')"); conn.commit(); conn.close()
    # Exact shape of Can CreateSubmissionRequest (submission-client.ts) with a valid stroke set
    can_payload = {"submission_key": "k1", "attempt_id": "a1", "prediction_id": "p1", "level_id": "L1",
                   "strokes": [[{"x": 1, "y": 1}, {"x": 4, "y": 4}]], "decision_type": "accept",
                   "source_rank": 1, "final_label": "kucing", "redraw_count": 0}
    r = c.post("/api/submissions", json=can_payload)
    out["can_create_payload_status"] = r.status_code
    out["can_create_payload_detail"] = [e["loc"][-1] for e in r.json().get("detail", [])] if r.status_code == 422 else r.text[:120]
    r = c.patch("/api/submissions/1/outcome", json={"outcome": "success", "behavior": "solid", "retry_count": 0})
    out["can_recordOutcome_PATCH_status"] = r.status_code
print(json.dumps(out, indent=2))
