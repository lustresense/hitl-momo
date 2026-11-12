import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from . import classroom, dashboard
from .db import init_db
from .inference import load_model, predict_from_drawing

app = FastAPI(title="Momo Backend", version="0.14.1-alpha")
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
    allow_headers=["Authorization", "Content-Type"],
    # Lets the admin dashboard read export filenames cross-origin.
    expose_headers=["Content-Disposition"],
)


@app.on_event("startup")
def startup_event():
    init_db()
    # Warmup model during backend startup
    load_model()


MAX_PREDICT_POINTS = 20_000  # same cap as a classroom submission; /predict has no auth


class DrawingPayload(BaseModel):
    drawing: dict

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
def predict(payload: DrawingPayload):
    candidates = predict_from_drawing(payload.drawing)
    return {"candidates": candidates}


