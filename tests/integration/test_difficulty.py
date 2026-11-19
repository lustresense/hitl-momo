"""Per-level AI difficulty (migrated from MuhammadDias/HITL@94120d4).

Guards the migration rule: the feature is OFF by default and, while off, /predict keeps the
pre-migration contract ({"candidates": [3]} only, levelId ignored). Run from repo root:
    python -m pytest tests/integration/test_difficulty.py -q
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
# setdefault: share the DB when collected together with test_classroom_contract.py
os.environ.setdefault("MOMO_DB_PATH", os.path.join(tempfile.mkdtemp(prefix="momo-difficulty-"), "d.sqlite"))
os.environ.setdefault("MODEL_PATH", str(ROOT / "weights" / "model_4_mobilenetv2_best.keras"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import backend.app.main as main_mod  # noqa: E402
from backend.app import db as dbmod  # noqa: E402
from backend.app.difficulty import apply_difficulty  # noqa: E402

DRAWING = {"strokes": [[{"x": 2, "y": 2}, {"x": 26, "y": 26}], [{"x": 26, "y": 2}, {"x": 2, "y": 26}]]}


@pytest.fixture(scope="module")
def client():
    with TestClient(main_mod.app) as c:
        yield c


def test_flag_follows_env(monkeypatch):
    from backend.app.difficulty import difficulty_enabled
    monkeypatch.delenv("AI_DIFFICULTY_ENABLED", raising=False)
    assert difficulty_enabled() is False  # code default; docker-compose turns it on
    monkeypatch.setenv("AI_DIFFICULTY_ENABLED", "1")
    assert difficulty_enabled() is True


def test_predict_contract_unchanged_when_off(client, monkeypatch):
    monkeypatch.setattr(main_mod, "AI_DIFFICULTY_ENABLED", False)
    plain = client.post("/predict", json={"drawing": DRAWING})
    with_level = client.post("/predict", json={"drawing": DRAWING, "levelId": "stage-3-validation"})
    assert plain.status_code == with_level.status_code == 200
    assert set(plain.json()) == {"candidates"}
    assert plain.json() == with_level.json()
    assert len(plain.json()["candidates"]) == 3


def test_flag_on_but_level_disabled_is_raw_model(client, monkeypatch):
    raw = client.post("/predict", json={"drawing": DRAWING}).json()["candidates"]
    monkeypatch.setattr(main_mod, "AI_DIFFICULTY_ENABLED", True)
    r = client.post("/predict", json={"drawing": DRAWING, "levelId": "stage-3-validation"}).json()
    assert r["difficulty"] == {"levelId": "stage-3-validation", "value": 0}
    assert [c["label"] for c in r["candidates"]] == [c["label"] for c in raw]


def test_flag_on_and_level_enabled_flattens_confidence(client, monkeypatch):
    raw = client.post("/predict", json={"drawing": DRAWING}).json()["candidates"]
    with dbmod.connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO level_difficulty (level_id, enabled, difficulty) VALUES (?, 1, 100)",
            ("stage-3-validation",),
        )
    monkeypatch.setattr(main_mod, "AI_DIFFICULTY_ENABLED", True)
    r = client.post("/predict", json={"drawing": DRAWING, "levelId": "stage-3-validation"}).json()
    assert r["difficulty"]["value"] == 100
    assert len(r["candidates"]) == 3
    assert r["candidates"][0]["confidence"] <= raw[0]["confidence"] + 1e-9


def test_apply_difficulty_is_deterministic_and_keeps_true_top1_in_top2():
    labels = ["tangga", "pagar", "awan", "ember"]
    probs = [0.9, 0.05, 0.03, 0.02]
    a = apply_difficulty(labels, probs, 100, DRAWING, "stage-3-validation")
    b = apply_difficulty(labels, probs, 100, DRAWING, "stage-3-validation")
    assert a == b
    assert "tangga" in [c["label"] for c in a[:2]]
    assert apply_difficulty(labels, probs, 0, DRAWING, "x")[0] == {"label": "tangga", "confidence": 0.9}


def test_difficulty_settings_require_auth(client):
    assert client.get("/api/settings/difficulty").status_code == 401
    assert client.put("/api/settings/difficulty", json={"levels": []}).status_code in (401, 422)
