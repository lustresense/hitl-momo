import os
import sqlite3
from typing import Optional

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from . import classroom, dashboard
from .db import get_db, init_db
from .difficulty import apply_difficulty, difficulty_enabled, effective_difficulty
from .inference import load_model, predict_from_drawing, predict_probs

app = FastAPI(title="Momo Backend", version="0.30.1-alpha")
app.include_router(dashboard.router)
app.include_router(classroom.router)

# Browser origins allowed to call the API. Same-origin (Caddy) needs none; dev and
# split deployments set CORS_ORIGINS (comma-separated). Auth is a Bearer header, not cookies,
# so credentials are not allowed.
_DEFAULT_CORS = "http://localhost:3344,http://localhost:3002,http://localhost:3000,http://127.0.0.1:3344,http://127.0.0.1:3002"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", _DEFAULT_CORS).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    # X-Contract-Version: sent by the game when NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1.
    allow_headers=["Authorization", "Content-Type", "X-Contract-Version"],
    # Lets the admin dashboard read export filenames cross-origin.
    expose_headers=["Content-Disposition"],
)


@app.on_event("startup")
def startup_event():
    init_db()
    # Warmup model during backend startup
    load_model()


MAX_PREDICT_POINTS = 20_000  # same cap as a classroom submission; /predict has no auth


# Per-level AI difficulty (Dias, migrated from MuhammadDias/HITL@94120d4). ON by default since
# 0.30.0-alpha (levels agreed by Can + Dias 2026-11-19). AI_DIFFICULTY_ENABLED=0 turns it off;
# while off, /predict ignores levelId and returns exactly the pre-migration contract.
AI_DIFFICULTY_ENABLED = difficulty_enabled()


class DrawingPayload(BaseModel):
    drawing: dict
    # Optional; the game sends it only when NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1 (camelCase).
    level_id: Optional[str] = Field(default=None, alias="levelId")

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @field_validator("drawing")
    @classmethod
    def _limit_points(cls, drawing: dict) -> dict:
        strokes = drawing.get("strokes") or []
        total = sum(len(s) for s in strokes if isinstance(s, list))
        if total > MAX_PREDICT_POINTS:
            raise ValueError(f"Gambar terlalu besar (maks {MAX_PREDICT_POINTS} titik).")
        return drawing


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(payload: DrawingPayload, conn: sqlite3.Connection = Depends(get_db)):
    if not AI_DIFFICULTY_ENABLED:
        return {"candidates": predict_from_drawing(payload.drawing)}
    difficulty = effective_difficulty(conn, payload.level_id)
    if difficulty == 0:
        # No level sent, or level switched off: identical to the raw model path.
        candidates = predict_from_drawing(payload.drawing)
    else:
        labels, probs = predict_probs(payload.drawing)
        candidates = apply_difficulty(labels, probs, difficulty, payload.drawing, payload.level_id or "")
    return {
        "candidates": candidates,
        # For dashboards/logs: which level and how much the answer was degraded (0 = raw model).
        "difficulty": {"levelId": payload.level_id, "value": difficulty},
    }


