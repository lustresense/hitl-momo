# backend/app/inference.py
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import List, Dict, Tuple

import numpy as np
from PIL import Image, ImageDraw
import tensorflow as tf

# 1. Tambahkan ROOT_DIR ke sys.path agar Python bisa menemukan config.py di root
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# 2. Impor label dari config (BUKAN train.config)
import json
import re

from config import LEGACY_CATEGORIES
from .rasterize_ref import rasterize

DEFAULT_MODEL_FILE = "model_4_mobilenetv2_best.keras"


def drawing_to_tensor(drawing: dict) -> np.ndarray:
    """Rasterizer referensi pemilik: unit strokes -> (28,28,1)."""
    return rasterize(drawing.get("strokes", []))[0]


def _load_keras_compat(model_path: str):
    """Keras 3.13+ exports extra keys on Initializer/Layers; strip them if Keras 3.12 rejects them."""
    try:
        return tf.keras.models.load_model(model_path, safe_mode=True)
    except TypeError as exc:
        msg = str(exc)
        if not any(k in msg for k in ("input_axes", "output_axes", "renorm", "quantization_config")):
            raise
        init_base = tf.keras.initializers.Initializer
        layer_base = tf.keras.layers.Layer
        orig_init_fc = init_base.from_config.__func__
        orig_layer_fc = layer_base.from_config.__func__
        drop_init = ("input_axes", "output_axes")
        drop_layer = ("renorm", "renorm_clipping", "renorm_momentum", "quantization_config")

        @classmethod
        def _compat_init_fc(cls, config):
            return orig_init_fc(cls, {k: v for k, v in config.items() if k not in drop_init})

        @classmethod
        def _compat_layer_fc(cls, config):
            return orig_layer_fc(cls, {k: v for k, v in config.items() if k not in drop_layer})

        init_base.from_config = _compat_init_fc
        layer_base.from_config = _compat_layer_fc
        try:
            return tf.keras.models.load_model(model_path, safe_mode=True)
        finally:
            init_base.from_config = classmethod(orig_init_fc)
            layer_base.from_config = classmethod(orig_layer_fc)


@lru_cache(maxsize=1)
def load_model():
    """Memuat model Keras dan melakukan warmup dengan shape (1, 28, 28, 1)."""
    model_path = str(Path(os.getenv("WEIGHTS_DIR", str(ROOT_DIR / "weights"))) / os.getenv("MODEL_FILE", DEFAULT_MODEL_FILE))

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model tidak ditemukan di lokasi: {model_path}")

    print(f"Loading model dari: {model_path}")
    model = _load_keras_compat(model_path)

    # Warm-up menggunakan input shape (1, 28, 28, 1)
    dummy_input = np.zeros((1, 28, 28, 1), dtype=np.float32)
    model.predict(dummy_input, verbose=0)

    labels = _load_labels(model_path)
    n_out = int(model.output_shape[-1])
    if len(labels) != n_out:
        raise RuntimeError(f"Model punya {n_out} output tetapi daftar label berisi {len(labels)}.")
    print(f"Label model: {', '.join(labels)}")
    return model, labels


def _load_labels(model_path: str) -> List[str]:
    """Label per indeks output: dari <model>.labels.json hasil training, atau daftar lama.

    weights/model_4_mobilenetv2_best.keras -> weights/model_4_mobilenetv2.labels.json
    """
    stem = re.sub(r"(_best|_latest)?\.keras$", "", model_path)
    path = Path(f"{stem}.labels.json")
    if not path.exists():
        print("Label model: file .labels.json tidak ada, memakai kategori lama (LEGACY_CATEGORIES)")
        return list(LEGACY_CATEGORIES)
    data = json.loads(path.read_text())
    labels_id = data.get("labels_id", {})
    return [labels_id.get(c, c) for c in data["categories"]]


def predict_probs(drawing: dict) -> Tuple[List[str], List[float]]:
    """Jalankan inferensi dan kembalikan (label, probabilitas) untuk semua kelas."""
    model, labels = load_model()
    image = drawing_to_tensor(drawing)            # (28, 28, 1)
    image_batch = np.expand_dims(image, axis=0)    # (1, 28, 28, 1)
    probs = model.predict(image_batch, verbose=0)[0]
    return list(labels), [float(p) for p in probs]


def predict_from_drawing(drawing: dict) -> List[dict]:
    """Jalankan inferensi dari JSON drawing dan kembalikan top-3 hasil prediksi."""
    labels, probs = predict_probs(drawing)
    probs = np.asarray(probs)
    top3_idx = np.argsort(probs)[::-1][:3]

    candidates = []
    for idx in top3_idx:
        label = labels[int(idx)]
        candidates.append(
            {
                "label": label,
                "confidence": float(round(float(probs[idx]), 6)),
            }
        )
    return candidates