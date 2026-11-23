import hashlib
import json
import math
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
os.environ.setdefault('TF_NUM_INTRAOP_THREADS', '2')
os.environ.setdefault('TF_NUM_INTEROP_THREADS', '1')
import numpy as np
import tensorflow as tf
from rasterize_ref import rasterize

ROOT = Path(os.environ.get('MNV2_DIR', str(Path.home() / '.cache/r23-model-server')))
MODEL = ROOT / 'model_4_mobilenetv2_best.keras'
EXPECTED = 'ecd1638605ecdd61596bb518d80771af444e2698670a2babf16c109ac71d69bc'
with MODEL.open('rb') as f:
    if hashlib.file_digest(f, 'sha256').hexdigest() != EXPECTED:
        raise RuntimeError('model hash mismatch')
labels = json.loads((ROOT / 'model_4_mobilenetv2.labels.json').read_text())['categories']
expected_labels = ['ladder','stairs','bridge','bench','table','skateboard','cactus','campfire','lightning','saw','knife','sword','snake','spider','fence','zigzag','line','cloud','bucket','umbrella']
if labels != expected_labels:
    raise RuntimeError('label order mismatch')
model = tf.keras.models.load_model(MODEL, compile=False, safe_mode=True)
if model.input_shape != (None, 28, 28, 1) or model.output_shape != (None, 20):
    raise RuntimeError('model shape mismatch')
model(np.zeros((1,28,28,1), dtype=np.float32), training=False)
lock = threading.Lock()
rate_lock = threading.Lock()
requests = []

def allow_request():
    now = time.monotonic()
    with rate_lock:
        requests[:] = [t for t in requests if now - t < 60]
        if len(requests) >= 120:
            return False
        requests.append(now)
        return True

def validate(strokes):
    if not isinstance(strokes, list) or not 1 <= len(strokes) <= 512:
        raise ValueError('invalid strokes')
    n = 0
    for stroke in strokes:
        if not isinstance(stroke, list) or not stroke:
            raise ValueError('invalid stroke')
        for p in stroke:
            if not isinstance(p, dict):
                raise ValueError('invalid point')
            for key in ('x','y'):
                v = p.get(key)
                if isinstance(v, bool) or not isinstance(v, (int,float)) or not math.isfinite(v) or not 0 <= v <= 1:
                    raise ValueError('invalid coordinate')
            n += 1
            if n > 20000: raise ValueError('too many points')
    return strokes

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)
    def log_message(self, format, *args): pass
    def reply(self, status, obj):
        body=json.dumps(obj,allow_nan=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        self.reply(200, {'status':'ok'}) if self.path=='/health' else self.reply(404, {'error':'not found'})
    def do_POST(self):
        if self.path != '/api/predict': return self.reply(404, {'error':'not found'})
        if not allow_request(): return self.reply(429, {'error':'rate limit'})
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<=0 or n>262144: return self.reply(413, {'error':'payload size'})
            body=json.loads(self.rfile.read(n))
            strokes=validate(body['drawing']['strokes'])
            x=rasterize(strokes)
            if not lock.acquire(timeout=2): return self.reply(503, {'error':'busy'})
            try: probs=np.asarray(model(x,training=False))[0]
            finally: lock.release()
            if probs.shape!=(20,) or not np.isfinite(probs).all() or (probs<0).any() or (probs>1).any(): raise ValueError('invalid output')
            idx=np.argsort(-probs, kind='stable')[:3]
            self.reply(200, {'candidates':[{'label':labels[int(i)],'confidence':float(probs[i])} for i in idx], 'modelVersion':'mobilenetv2-keras'})
        except (ValueError, KeyError, TypeError, OverflowError): self.reply(400, {'error':'invalid drawing'})
        except (TimeoutError, socket.timeout): self.close_connection=True
        except Exception: self.reply(500, {'error':'inference failed'})

if __name__=='__main__':
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('MNV2_PORT','5567'))), Handler).serve_forever()
