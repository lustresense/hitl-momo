import http.client
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

os.chdir(os.environ['MNV2_STATIC_DIR'])

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".task": "application/octet-stream"}
    def list_directory(self, path):
        self.send_error(403, "Directory listing disabled")
        return None
    def setup(self):
        super().setup()
        self.connection.settimeout(10)
    def do_POST(self):
        if urlsplit(self.path).path != '/api/predict':
            return self.send_error(404)
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if n <= 0 or n > 262144:
                return self.send_error(413)
            body = self.rfile.read(n)
            conn = http.client.HTTPConnection('127.0.0.1', 5567, timeout=10)
            try:
                conn.request('POST', '/api/predict', body, {'Content-Type': 'application/json'})
                response = conn.getresponse()
                data = response.read(65537)
                if len(data) > 65536:
                    return self.send_error(502)
                self.send_response(response.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            finally:
                conn.close()
        except (OSError, ValueError, http.client.HTTPException):
            self.send_error(503)
    def do_GET(self):
        parts = urlsplit(self.path)
        candidate = Path('.' + parts.path + '.html')
        if not Path('.' + parts.path).is_file() and candidate.is_file():
            self.path = urlunsplit((parts.scheme, parts.netloc, parts.path + '.html', parts.query, parts.fragment))
        super().do_GET()

ThreadingHTTPServer(('127.0.0.1', 5555), Handler).serve_forever()
