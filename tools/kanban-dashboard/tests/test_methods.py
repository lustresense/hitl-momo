import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
from typing import Optional
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import http.client

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import create_server
from db import ALLOWED_BOARDS

TEST_TOKEN = "method-gate-token-12345"


class TestHTTPMethodsAndSecurityHeaders(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.test_db_path = os.path.join(cls.temp_dir.name, "methods_test.db")
        conn = sqlite3.connect(cls.test_db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT,
                assignee TEXT,
                status TEXT NOT NULL,
                priority INTEGER DEFAULT 5,
                created_by TEXT,
                created_at INTEGER,
                started_at INTEGER,
                completed_at INTEGER,
                block_kind TEXT,
                block_recurrences INTEGER DEFAULT 0,
                consecutive_failures INTEGER DEFAULT 0,
                goal_mode INTEGER DEFAULT 0,
                tenant TEXT DEFAULT 'default',
                workspace_path TEXT,
                branch_name TEXT,
                claim_lock TEXT,
                worker_pid INTEGER,
                last_failure_error TEXT,
                idempotency_key TEXT,
                result TEXT,
                skills TEXT,
                model_override TEXT,
                provider_override TEXT,
                session_id TEXT,
                current_run_id INTEGER,
                workflow_template_id TEXT,
                current_step_key TEXT,
                project_id TEXT
            )
        """)
        conn.commit()
        conn.close()

        ALLOWED_BOARDS["methods-test"] = {
            "label": "Methods Test",
            "path": cls.test_db_path,
        }

        cls.server = create_server(host="127.0.0.1", port=0, auth_token=TEST_TOKEN)
        cls.port = cls.server.server_port
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp_dir.cleanup()
        ALLOWED_BOARDS.pop("methods-test", None)

    def _request_raw(self, method: str, path: str, token: Optional[str] = None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        conn.request(method, path, headers=headers)
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp.status, resp.headers, body

    # --- HEAD Tests ---
    def test_head_unauthenticated_returns_401_with_security_headers_and_no_body(self):
        status, headers, body = self._request_raw("HEAD", "/api/boards", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(body, b"", "HEAD response must not contain a message body")

    def test_head_authenticated_returns_405_with_security_headers_and_no_body(self):
        status, headers, body = self._request_raw("HEAD", "/api/boards", token=TEST_TOKEN)
        self.assertEqual(status, 405)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(body, b"", "HEAD response must not contain a message body")

    # --- OPTIONS Tests ---
    def test_options_unauthenticated_returns_401_with_security_headers(self):
        status, headers, body = self._request_raw("OPTIONS", "/api/boards", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        data = json.loads(body.decode("utf-8"))
        self.assertIn("error", data)

    def test_options_authenticated_returns_405_with_security_headers(self):
        status, headers, body = self._request_raw("OPTIONS", "/api/boards", token=TEST_TOKEN)
        self.assertEqual(status, 405)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        data = json.loads(body.decode("utf-8"))
        self.assertIn("error", data)

    # --- TRACE Tests ---
    def test_trace_unauthenticated_returns_401_with_security_headers(self):
        status, headers, body = self._request_raw("TRACE", "/api/boards", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        data = json.loads(body.decode("utf-8"))
        self.assertIn("error", data)

    def test_trace_authenticated_returns_405_with_security_headers(self):
        status, headers, body = self._request_raw("TRACE", "/api/boards", token=TEST_TOKEN)
        self.assertEqual(status, 405)
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        data = json.loads(body.decode("utf-8"))
        self.assertIn("error", data)

    # --- Arbitrary Unsupported Methods (e.g. FOO, BAR, CONNECT) ---
    def test_arbitrary_method_unauthenticated_returns_401_with_security_headers(self):
        for method in ["FOO", "BAR", "CUSTOM", "CONNECT"]:
            status, headers, body = self._request_raw(method, "/api/boards", token=None)
            self.assertEqual(status, 401, f"Method {method} unauthenticated should return 401")
            self.assertEqual(headers.get("Cache-Control"), "no-store")
            self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")

    def test_arbitrary_method_authenticated_returns_405_with_security_headers(self):
        for method in ["FOO", "BAR", "CUSTOM", "CONNECT"]:
            status, headers, body = self._request_raw(method, "/api/boards", token=TEST_TOKEN)
            self.assertEqual(status, 405, f"Method {method} authenticated should return 405")
            self.assertEqual(headers.get("Cache-Control"), "no-store")
            self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
            data = json.loads(body.decode("utf-8"))
            self.assertIn("error", data)

    # --- Protocol Error / send_error Security Headers ---
    def test_send_error_carries_security_headers_and_no_html_trace(self):
        import socket
        s = socket.create_connection(("127.0.0.1", self.port))
        s.sendall(b"GET / INVALID_PROTOCOL_VERSION\r\n\r\n")
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
        s.close()

        self.assertTrue(data.startswith(b"HTTP/1.0 400") or data.startswith(b"HTTP/1.1 400"), f"Actual response: {data[:100]}")
        self.assertIn(b"cache-control: no-store", data.lower())
        self.assertIn(b"referrer-policy: no-referrer", data.lower())
        self.assertIn(b"x-content-type-options: nosniff", data.lower())
        self.assertNotIn(b"<html", data.lower())

    # --- Methods across diverse route paths ---
    def test_unsupported_methods_across_routes(self):
        routes = ["/", "/static/app.js", "/api/boards", "/api/boards/methods-test/tasks", "/api/nonexistent"]
        for route in routes:
            # Unauthenticated HEAD -> 401 with security headers and empty body
            status, headers, body = self._request_raw("HEAD", route, token=None)
            self.assertEqual(status, 401, f"HEAD unauth on {route} should be 401")
            self.assertEqual(headers.get("Cache-Control"), "no-store")
            self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(body, b"")

            # Authenticated HEAD -> 405 with security headers and empty body
            status, headers, body = self._request_raw("HEAD", route, token=TEST_TOKEN)
            self.assertEqual(status, 405, f"HEAD auth on {route} should be 405")
            self.assertEqual(headers.get("Cache-Control"), "no-store")
            self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
            self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(body, b"")

            # Unauthenticated OPTIONS -> 401
            status, headers, body = self._request_raw("OPTIONS", route, token=None)
            self.assertEqual(status, 401, f"OPTIONS unauth on {route} should be 401")
            self.assertEqual(headers.get("Cache-Control"), "no-store")

            # Authenticated OPTIONS -> 405
            status, headers, body = self._request_raw("OPTIONS", route, token=TEST_TOKEN)
            self.assertEqual(status, 405, f"OPTIONS auth on {route} should be 405")
            self.assertEqual(headers.get("Cache-Control"), "no-store")

            # Unauthenticated FOO -> 401
            status, headers, body = self._request_raw("FOO", route, token=None)
            self.assertEqual(status, 401, f"FOO unauth on {route} should be 401")
            self.assertEqual(headers.get("Cache-Control"), "no-store")

            # Authenticated FOO -> 405
            status, headers, body = self._request_raw("FOO", route, token=TEST_TOKEN)
            self.assertEqual(status, 405, f"FOO auth on {route} should be 405")
            self.assertEqual(headers.get("Cache-Control"), "no-store")

    # --- Unconfigured auth gate across methods ---
    def test_unconfigured_auth_gate_rejects_all_methods(self):
        raw_server = create_server(host="127.0.0.1", port=0, auth_token=None)
        raw_port = raw_server.server_port
        raw_thread = threading.Thread(target=raw_server.serve_forever, daemon=True)
        raw_thread.start()

        try:
            for method in ["GET", "HEAD", "OPTIONS", "TRACE", "POST", "FOO"]:
                conn = http.client.HTTPConnection("127.0.0.1", raw_port)
                conn.request(method, "/api/boards")
                resp = conn.getresponse()
                body = resp.read()
                conn.close()

                self.assertEqual(resp.status, 401)
                self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
                self.assertEqual(resp.headers.get("Referrer-Policy"), "no-referrer")
                self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")
                if method == "HEAD":
                    self.assertEqual(body, b"")
                else:
                    data = json.loads(body.decode("utf-8"))
                    self.assertIn("unconfigured", data["error"].lower())
        finally:
            raw_server.shutdown()
            raw_server.server_close()

    # --- Non-loopback rejection across methods ---
    def test_non_loopback_client_rejected_across_methods(self):
        # Subclass handler to simulate non-loopback client
        from server import KanbanHTTPHandler

        class MockExternalHandler(KanbanHTTPHandler):
            def _is_loopback_client(self):
                return False

        ext_server = create_server(host="127.0.0.1", port=0, auth_token=TEST_TOKEN)
        ext_server.RequestHandlerClass = MockExternalHandler
        ext_port = ext_server.server_port
        ext_thread = threading.Thread(target=ext_server.serve_forever, daemon=True)
        ext_thread.start()

        try:
            for method in ["GET", "HEAD", "OPTIONS", "TRACE", "POST", "FOO"]:
                conn = http.client.HTTPConnection("127.0.0.1", ext_port)
                conn.request(method, "/api/boards", headers={"Authorization": f"Bearer {TEST_TOKEN}"})
                resp = conn.getresponse()
                body = resp.read()
                conn.close()

                self.assertEqual(resp.status, 403)
                self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
                self.assertEqual(resp.headers.get("Referrer-Policy"), "no-referrer")
                self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")
                if method == "HEAD":
                    self.assertEqual(body, b"")
                else:
                    data = json.loads(body.decode("utf-8"))
                    self.assertIn("non-loopback", data["error"].lower())
        finally:
            ext_server.shutdown()
            ext_server.server_close()


if __name__ == "__main__":
    unittest.main()
