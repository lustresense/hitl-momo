import importlib.util, json, threading, time, urllib.request, urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
spec=importlib.util.spec_from_file_location('candidate_server',Path(__file__).with_name('server.py')); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
s=ThreadingHTTPServer(('127.0.0.1',0),m.Handler);threading.Thread(target=s.serve_forever,daemon=True).start()
payload=json.dumps({'drawing':{'strokes':[[{'x':0.1,'y':0.1},{'x':0.9,'y':0.9}]]}}).encode();url='http://127.0.0.1:%d/api/predict'%s.server_port
def req():
 start=time.monotonic()
 try:
  with urllib.request.urlopen(urllib.request.Request(url,payload,{'Content-Type':'application/json'}),timeout=8) as r:return r.status,time.monotonic()-start
 except urllib.error.HTTPError as e:return e.code,time.monotonic()-start
m.lock.acquire();threading.Timer(.6,m.lock.release).start();status,elapsed=req();print('lock released:',status,round(elapsed,3));assert status==200 and .4<elapsed<3
m.lock.acquire();status,elapsed=req();m.lock.release();print('lock held:',status,round(elapsed,3));assert status==503 and 1.8<elapsed<3
s.shutdown()
