import contextlib, http.client, os, pathlib, socket, subprocess, sys, tempfile, time, unittest
HERE=pathlib.Path(__file__).resolve().parent
class ProxyRegression(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(); root=pathlib.Path(cls.tmp.name); cls.root=root
  (root/'index.html').write_text('home'); (root/'nui-lab').mkdir(); (root/'nui-lab/canvas.html').write_text('canvas')
  for ext in ('wasm','onnx','task'): (root/('test.'+ext)).write_bytes(b'test')
  (root/'private').mkdir(); (root/'private/hidden.txt').write_text('private')
  with contextlib.closing(socket.socket()) as s: s.bind(('127.0.0.1',0)); cls.port=s.getsockname()[1]
  script=(HERE/'dev-proxy.py').read_text().replace("('127.0.0.1', 5555)","('127.0.0.1', %d)" % cls.port)
  cls.proc=subprocess.Popen([sys.executable,'-c',script],env={**os.environ,'MNV2_STATIC_DIR':str(root)},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for _ in range(100):
   try:
    with socket.create_connection(('127.0.0.1',cls.port),timeout=.1): return
   except OSError: time.sleep(.05)
  raise RuntimeError('proxy failed to start')
 @classmethod
 def tearDownClass(cls): cls.proc.terminate();cls.proc.wait(timeout=5);cls.tmp.cleanup()
 def get(self,path):
  c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=3);c.request('GET',path);r=c.getresponse();result=(r.status,{k.lower():v for k,v in r.getheaders()},r.read());c.close();return result
 def test_pages_and_baseline_headers(self):
  for path,body in [('/',b'home'),('/nui-lab/canvas',b'canvas')]:
   status,headers,data=self.get(path);self.assertEqual((status,data),(200,body));self.assertTrue(headers.get('content-type','').startswith('text/html'));self.assertEqual(headers.get('content-length'),str(len(body)));self.assertIn('last-modified',headers);self.assertIn('server',headers);self.assertIn('date',headers)
 def test_mime(self):
  for ext,typ in [('wasm','application/wasm'),('onnx','application/octet-stream'),('task','application/octet-stream')]:
   with self.subTest(ext=ext): self.assertEqual(self.get('/test.'+ext)[1].get('content-type'),typ)
 def test_no_directory_listing(self):
  status,_,data=self.get('/private/');self.assertIn(status,(403,404));self.assertNotIn(b'hidden.txt',data)
class LockContract(unittest.TestCase):
 def test_bounded_wait(self):
  source=(HERE/'server.py').read_text();self.assertIn('lock.acquire(timeout=2)',source)
if __name__=='__main__': unittest.main(verbosity=2)
