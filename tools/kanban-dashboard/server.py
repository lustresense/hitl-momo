import hmac
import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Tuple
from urllib.parse import parse_qs, urlparse

from auth import (
    AuthStore,
    SessionManager,
    SessionData,
    LoginRateLimiter,
    SetupAlreadyCompletedError,
    CorruptStoreError,
    make_session_cookie,
    make_clear_cookie,
    validate_origin,
    SESSION_COOKIE_NAME,
)
from db import (
    ALLOWED_BOARDS,
    get_board_db_path,
    get_db_connection,
    get_boards_summary,
    get_tasks,
    get_task_detail,
    get_board_assignees,
    MIN_LIMIT,
    MAX_LIMIT,
    MIN_OFFSET,
    MAX_OFFSET,
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
}


class KanbanServer(HTTPServer):
    auth_token: Optional[str] = None
    auth_store: AuthStore
    session_manager: SessionManager
    rate_limiter: LoginRateLimiter

    def __init__(
        self,
        server_address: Tuple[str, int],
        RequestHandlerClass,
        auth_token: Optional[str] = None,
        auth_store_path: Optional[str] = None,
    ):
        super().__init__(server_address, RequestHandlerClass)
        self.auth_token = auth_token
        self.auth_store = AuthStore(auth_store_path)
        self.session_manager = SessionManager()
        self.rate_limiter = LoginRateLimiter()


class KanbanHTTPHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    default_request_version = "HTTP/1.1"
    server_version = "HermesKanbanServer/1.2"
    sys_version = ""

    def log_message(self, format, *args):
        # Quiet default logging in test/background.
        # Strictly ensures headers, query parameters, and tokens are never logged.
        pass

    def end_headers(self):
        sent_headers = set()
        headers_buf = getattr(self, "_headers_buffer", None)
        if isinstance(headers_buf, list):
            for raw_line in headers_buf:
                if isinstance(raw_line, (bytes, bytearray)) and b":" in raw_line:
                    key = raw_line.split(b":", 1)[0].decode("latin-1", "replace").strip().lower()
                    sent_headers.add(key)
        for k, v in SECURITY_HEADERS.items():
            if k.lower() not in sent_headers:
                self.send_header(k, v)
        if self._is_secure() and "strict-transport-security" not in sent_headers:
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        super().end_headers()

    def send_error(self, code: int, message: Optional[str] = None, explain: Optional[str] = None):
        self.close_connection = True
        if message is None:
            try:
                message, _ = self.responses.get(code, ("Error", ""))
            except Exception:
                message = "Error"
        self._send_error_json(code, str(message), extra_headers={"Connection": "close"})

    def _send_json(self, status_code: int, data: dict, extra_headers: Optional[dict] = None):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        # Explicitly no permissive CORS headers
        self.end_headers()
        if getattr(self, "command", None) != "HEAD":
            try:
                self.wfile.write(body)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _send_error_json(self, status_code: int, message: str, extra_headers: Optional[dict] = None):
        self._send_json(status_code, {"error": message}, extra_headers=extra_headers)

    def _send_file(self, filepath: str, content_type: str, extra_headers: Optional[dict] = None):
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            for k, v in SECURITY_HEADERS.items():
                self.send_header(k, v)
            if extra_headers:
                for k, v in extra_headers.items():
                    self.send_header(k, v)
            self.end_headers()
            if getattr(self, "command", None) != "HEAD":
                self.wfile.write(content)
            try:
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        except OSError:
            self._send_error_json(HTTPStatus.NOT_FOUND, "File not found")

    def _send_redirect(self, target_url: str):
        self.send_response(HTTPStatus.MOVED_PERMANENTLY)
        self.send_header("Location", target_url)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _is_loopback_client(self) -> bool:
        client_ip = self.client_address[0]
        return client_ip in ("127.0.0.1", "::1", "localhost")

    def _is_secure(self) -> bool:
        if os.environ.get("KANBAN_COOKIE_SECURE") == "1":
            return True
        headers = getattr(self, "headers", None)
        if not headers:
            return False
        proto = headers.get("X-Forwarded-Proto", "").strip().lower()
        if proto == "https":
            return True
        cf_visitor = headers.get("CF-Visitor", "").strip().lower()
        if '"scheme":"https"' in cf_visitor:
            return True
        return False

    def _is_insecure_forwarded(self) -> bool:
        headers = getattr(self, "headers", None)
        if not headers:
            return False
        proto = headers.get("X-Forwarded-Proto", "").strip().lower()
        if proto == "http":
            return True
        cf_visitor = headers.get("CF-Visitor", "").strip().lower()
        if '"scheme":"http"' in cf_visitor:
            return True
        return False

    def _get_cookie_val(self, cookie_name: str = SESSION_COOKIE_NAME) -> Optional[str]:
        raw_cookie = self.headers.get("Cookie", "")
        if not raw_cookie:
            return None
        try:
            from http.cookies import SimpleCookie
            cookie = SimpleCookie()
            cookie.load(raw_cookie)
            morsel = cookie.get(cookie_name)
            if morsel:
                return morsel.value
        except Exception:
            pass
        return None

    def _get_active_session(self) -> Optional[SessionData]:
        session_id = self._get_cookie_val()
        if not session_id:
            return None
        return self.server.session_manager.validate_session(session_id)

    def _extract_auth_token(self) -> Optional[str]:
        # Strict Bearer token extraction: Authorization: Bearer ***
        # No query string, no cookies, no custom headers accepted
        auth_header = self.headers.get("Authorization", "").strip()
        if auth_header.startswith("Bearer "):
            return auth_header[7:].strip()
        return None

    def _check_auth(self, query_params: dict) -> Tuple[bool, int, str]:
        """
        Enforce local gate, active session cookie, or constant-time Bearer token authentication.
        Fails closed on unconfigured or non-loopback clients.
        """
        # 1. Fail-closed if client is not loopback
        if not self._is_loopback_client():
            return False, HTTPStatus.FORBIDDEN, "Forbidden: Non-loopback client access denied"

        # 2. Check active authenticated session cookie
        session = self._get_active_session()
        if session and session.authenticated:
            return True, HTTPStatus.OK, ""

        # 3. Check Bearer token if present
        expected_token = getattr(self.server, "auth_token", None) or os.environ.get("KANBAN_AUTH_TOKEN")
        bearer_token = self._extract_auth_token()

        if bearer_token and expected_token:
            if hmac.compare_digest(bearer_token, expected_token):
                return True, HTTPStatus.OK, ""
            return False, HTTPStatus.UNAUTHORIZED, "Unauthorized: Invalid authentication token"

        if bearer_token and not expected_token:
            return False, HTTPStatus.UNAUTHORIZED, "Unauthorized: Invalid authentication token"

        # 4. Check if auth gate is configured (either password store or token)
        is_store_configured = False
        try:
            is_store_configured = self.server.auth_store.is_configured()
        except CorruptStoreError:
            return False, HTTPStatus.INTERNAL_SERVER_ERROR, "Internal server error: Corrupt auth store"

        if not expected_token and not is_store_configured:
            return (
                False,
                HTTPStatus.UNAUTHORIZED,
                "Unauthorized: Authentication gate is unconfigured. Set KANBAN_AUTH_TOKEN or complete first-run setup.",
            )

        return (
            False,
            HTTPStatus.UNAUTHORIZED,
            "Unauthorized: Authentication token required via Authorization: Bearer *** or session cookie",
        )

    def _auth_precheck(self, query_params: dict) -> bool:
        authorized, status, err_msg = self._check_auth(query_params)
        if not authorized:
            self._send_error_json(status, err_msg)
            return False
        return True

    def _handle_unsupported_method(self):
        cmd = getattr(self, "command", "REQUEST")
        if self._is_insecure_forwarded():
            if cmd == "HEAD":
                host = self.headers.get("Host", "").strip() or "kanban.momominum.tech"
                target_url = f"https://{host}{self.path}"
                return self._send_redirect(target_url)
            return self._send_error_json(
                HTTPStatus.FORBIDDEN,
                "Forbidden: Insecure HTTP request rejected. Access via HTTPS required.",
            )
        req_path = getattr(self, "path", "/") or "/"
        parsed = urlparse(req_path)
        query_params = parse_qs(parsed.query)
        if self._auth_precheck(query_params):
            self._send_error_json(
                HTTPStatus.METHOD_NOT_ALLOWED,
                f"Method {cmd} not allowed",
            )

    do_HEAD = _handle_unsupported_method
    do_OPTIONS = _handle_unsupported_method
    do_TRACE = _handle_unsupported_method
    do_PUT = _handle_unsupported_method
    do_DELETE = _handle_unsupported_method
    do_PATCH = _handle_unsupported_method
    do_CONNECT = _handle_unsupported_method

    def __getattr__(self, name: str):
        if name.startswith("do_"):
            return self._handle_unsupported_method
        raise AttributeError(f"'{type(self).__name__}' object has no attribute '{name}'")

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query_params = parse_qs(parsed.query)

            # Plaintext HTTP defense: reject unencrypted credentials and state mutations
            if self._is_insecure_forwarded():
                return self._send_error_json(
                    HTTPStatus.FORBIDDEN,
                    "Forbidden: Insecure HTTP request rejected. Access via HTTPS required.",
                )

            # Fail-closed for non-loopback clients
            if not self._is_loopback_client():
                return self._send_error_json(
                    HTTPStatus.FORBIDDEN,
                    "Forbidden: Non-loopback client access denied",
                )

            # State-changing authentication routes
            if path in ("/api/auth/setup", "/api/auth/login", "/api/auth/logout"):
                return self._handle_auth_post(path)

            # All other routes: POST is unsupported method (requires auth, returns 405)
            if self._auth_precheck(query_params):
                return self._send_error_json(
                    HTTPStatus.METHOD_NOT_ALLOWED,
                    "Method POST not allowed",
                )
        except Exception:
            return self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "Internal server error")

    def _handle_auth_post(self, path: str):
        # 1. CSRF Origin verification (fail-closed if missing or invalid)
        origin = self.headers.get("Origin")
        host = self.headers.get("Host")
        if not validate_origin(origin, host):
            return self._send_error_json(HTTPStatus.FORBIDDEN, "Forbidden: Invalid or missing request origin")

        # 2. Existing session & CSRF token from headers (mandatory for all state-changing auth endpoints)
        session = self._get_active_session()
        x_csrf = self.headers.get("X-CSRF-Token")
        if not session or not x_csrf or not hmac.compare_digest(x_csrf, session.csrf_token):
            return self._send_error_json(HTTPStatus.FORBIDDEN, "Forbidden: Missing or invalid CSRF token")

        # 3. Read request body safely
        content_length_str = self.headers.get("Content-Length", "0")
        try:
            content_length = int(content_length_str)
        except (ValueError, TypeError):
            return self._send_error_json(HTTPStatus.BAD_REQUEST, "Invalid Content-Length")

        if content_length < 0 or content_length > 16384:
            return self._send_error_json(HTTPStatus.BAD_REQUEST, "Payload too large")

        raw_body = self.rfile.read(content_length) if content_length > 0 else b""
        data = {}
        if raw_body:
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                return self._send_error_json(HTTPStatus.BAD_REQUEST, "Invalid JSON body")

        if path == "/api/auth/setup":
            password = data.get("password", "")
            confirm_password = data.get("confirm_password", "")
            if not isinstance(password, str) or not isinstance(confirm_password, str):
                return self._send_error_json(HTTPStatus.BAD_REQUEST, "Invalid password format")

            if password != confirm_password:
                return self._send_error_json(HTTPStatus.BAD_REQUEST, "Passwords do not match")

            if len(password) < 8:
                return self._send_error_json(HTTPStatus.BAD_REQUEST, "Password must be at least 8 characters")

            try:
                self.server.auth_store.setup_password(password)
            except SetupAlreadyCompletedError:
                return self._send_error_json(
                    HTTPStatus.CONFLICT,
                    "Setup already completed. Password setup is permanently disabled.",
                )
            except CorruptStoreError as e:
                return self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"Error: {e}")

            new_session = self.server.session_manager.rotate_session(session.session_id, authenticated=True)
            set_cookie = make_session_cookie(new_session.session_id, is_secure=self._is_secure())
            return self._send_json(
                HTTPStatus.OK,
                {"success": True, "csrf_token": new_session.csrf_token},
                extra_headers={"Set-Cookie": set_cookie},
            )

        if path == "/api/auth/login":
            client_ip = self.client_address[0]
            if not self.server.rate_limiter.check_allowed(client_ip):
                return self._send_error_json(
                    HTTPStatus.TOO_MANY_REQUESTS,
                    "Too many failed login attempts. Please wait before retrying.",
                )

            password = data.get("password", "")
            if not isinstance(password, str):
                return self._send_error_json(HTTPStatus.BAD_REQUEST, "Invalid password format")

            try:
                if not self.server.auth_store.is_configured():
                    return self._send_error_json(
                        HTTPStatus.BAD_REQUEST,
                        "Setup required: No admin password has been configured yet.",
                    )
                valid = self.server.auth_store.verify_password(password)
            except CorruptStoreError as e:
                return self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"Auth store error: {e}")

            if not valid:
                self.server.rate_limiter.record_failure(client_ip)
                return self._send_error_json(HTTPStatus.UNAUTHORIZED, "Invalid password")

            self.server.rate_limiter.record_success(client_ip)
            new_session = self.server.session_manager.rotate_session(session.session_id, authenticated=True)
            set_cookie = make_session_cookie(new_session.session_id, is_secure=self._is_secure())
            return self._send_json(
                HTTPStatus.OK,
                {"success": True, "csrf_token": new_session.csrf_token},
                extra_headers={"Set-Cookie": set_cookie},
            )

        if path == "/api/auth/logout":
            self.server.session_manager.destroy_session(session.session_id)
            clear_cookie = make_clear_cookie(is_secure=self._is_secure())
            return self._send_json(
                HTTPStatus.OK,
                {"success": True},
                extra_headers={"Set-Cookie": clear_cookie},
            )

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query_params = parse_qs(parsed.query)

            # Plaintext HTTP defense: redirect forwarded HTTP to HTTPS
            if self._is_insecure_forwarded():
                host = self.headers.get("Host", "").strip() or "kanban.momominum.tech"
                target_url = f"https://{host}{self.path}"
                return self._send_redirect(target_url)

            # Fail-closed for non-loopback clients across all routes
            if not self._is_loopback_client():
                return self._send_error_json(
                    HTTPStatus.FORBIDDEN,
                    "Forbidden: Non-loopback client access denied",
                )

            # 1. Root route -> static/index.html (data-free login shell without Bearer auth)
            if path in ("", "/"):
                index_path = os.path.join(STATIC_DIR, "index.html")
                return self._send_file(index_path, "text/html; charset=utf-8")

            # 2. Static files route -> /static/* (data-free assets without Bearer auth)
            if path.startswith("/static/"):
                rel_path = path[len("/static/"):]
                # Prevent directory traversal
                safe_base = os.path.abspath(STATIC_DIR)
                target_path = os.path.abspath(os.path.join(safe_base, rel_path))
                if not target_path.startswith(safe_base) or not os.path.isfile(target_path):
                    return self._send_error_json(HTTPStatus.NOT_FOUND, "Static file not found")
                mime_type, _ = mimetypes.guess_type(target_path)
                content_type = mime_type or "application/octet-stream"
                if mime_type in ("text/html", "text/css", "application/javascript", "text/javascript"):
                    content_type += "; charset=utf-8"
                return self._send_file(target_path, content_type)

            # 3. Auth status route -> /api/auth/status (unauthenticated pre-check with CSRF token)
            if path == "/api/auth/status":
                return self._handle_auth_status()

            # 4. Protected API routes -> require active session or Bearer token auth
            if path.startswith("/api/"):
                if not self._auth_precheck(query_params):
                    return
                return self._handle_api(path, query_params)

            # Unmatched route -> auth precheck then 404
            if not self._auth_precheck(query_params):
                return
            return self._send_error_json(HTTPStatus.NOT_FOUND, "Endpoint not found")

        except Exception:
            # Error redaction: Never reveal internal stack trace or DB paths
            return self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "Internal server error")

    def _handle_auth_status(self):
        try:
            setup_required = not self.server.auth_store.is_configured()
        except CorruptStoreError as e:
            return self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"Auth store corrupt: {e}")

        session = self._get_active_session()
        extra_headers = {}
        if not session:
            # Issue pre-auth session for CSRF token protection
            session = self.server.session_manager.create_session(authenticated=False)
            extra_headers["Set-Cookie"] = make_session_cookie(
                session.session_id,
                is_secure=self._is_secure(),
            )

        return self._send_json(
            HTTPStatus.OK,
            {
                "setup_required": setup_required,
                "authenticated": bool(session.authenticated),
                "csrf_token": session.csrf_token,
            },
            extra_headers=extra_headers if extra_headers else None,
        )

    def _handle_api(self, path: str, query_params: dict):
        parts = [p for p in path.strip("/").split("/") if p]
        # parts: ['api', ...]

        if len(parts) == 2 and parts[1] == "boards":
            # GET /api/boards
            summary = get_boards_summary()
            return self._send_json(HTTPStatus.OK, {"boards": summary})

        if len(parts) >= 3 and parts[1] == "boards":
            slug = parts[2]
            db_path = get_board_db_path(slug)
            if not db_path:
                return self._send_error_json(HTTPStatus.NOT_FOUND, f"Board '{slug}' not found")

            conn = get_db_connection(db_path)
            try:
                # GET /api/boards/{slug}/tasks
                if len(parts) == 4 and parts[3] == "tasks":
                    status = query_params.get("status", [None])[0]
                    assignee = query_params.get("assignee", [None])[0]
                    search = query_params.get("search", [None])[0]

                    raw_limit = query_params.get("limit", [str(50)])[0]
                    raw_offset = query_params.get("offset", [str(0)])[0]

                    # Strict integer parsing and bounds validation for pagination
                    try:
                        limit = int(raw_limit)
                    except (ValueError, TypeError):
                        return self._send_error_json(
                            HTTPStatus.BAD_REQUEST,
                            "Invalid limit: must be an integer",
                        )

                    try:
                        offset = int(raw_offset)
                    except (ValueError, TypeError):
                        return self._send_error_json(
                            HTTPStatus.BAD_REQUEST,
                            "Invalid offset: must be an integer",
                        )

                    if limit < MIN_LIMIT or limit > MAX_LIMIT:
                        return self._send_error_json(
                            HTTPStatus.BAD_REQUEST,
                            f"Invalid limit: must be between {MIN_LIMIT} and {MAX_LIMIT}",
                        )

                    if offset < MIN_OFFSET or offset > MAX_OFFSET:
                        return self._send_error_json(
                            HTTPStatus.BAD_REQUEST,
                            f"Invalid offset: must be between {MIN_OFFSET} and {MAX_OFFSET}",
                        )

                    tasks, total = get_tasks(
                        conn,
                        status=status,
                        assignee=assignee,
                        search=search,
                        limit=limit,
                        offset=offset,
                    )
                    return self._send_json(
                        HTTPStatus.OK,
                        {
                            "board": slug,
                            "total": total,
                            "limit": limit,
                            "offset": offset,
                            "tasks": tasks,
                        },
                    )

                # GET /api/boards/{slug}/tasks/{task_id}
                if len(parts) == 5 and parts[3] == "tasks":
                    task_id = parts[4]
                    task = get_task_detail(conn, task_id)
                    if not task:
                        return self._send_error_json(
                            HTTPStatus.NOT_FOUND,
                            f"Task '{task_id}' not found",
                        )
                    return self._send_json(HTTPStatus.OK, task)

                # GET /api/boards/{slug}/assignees
                if len(parts) == 4 and parts[3] == "assignees":
                    assignees = get_board_assignees(conn)
                    return self._send_json(
                        HTTPStatus.OK,
                        {"board": slug, "assignees": assignees},
                    )

                return self._send_error_json(
                    HTTPStatus.NOT_FOUND,
                    "Unknown board resource",
                )
            finally:
                conn.close()

        return self._send_error_json(
            HTTPStatus.NOT_FOUND,
            "API route not found",
        )


def create_server(
    host: str = "127.0.0.1",
    port: int = 9200,
    auth_token: Optional[str] = None,
    auth_store_path: Optional[str] = None,
) -> KanbanServer:
    # Fail-closed: Strictly refuse binding to any non-loopback host
    if host not in LOOPBACK_HOSTS:
        raise ValueError(
            f"Fail-closed: Binding to non-loopback host '{host}' is strictly forbidden. "
            "Kanban dashboard server must bind only to loopback (127.0.0.1)."
        )

    resolved_token = auth_token if auth_token is not None else os.environ.get("KANBAN_AUTH_TOKEN")

    return KanbanServer(
        (host, port),
        KanbanHTTPHandler,
        auth_token=resolved_token,
        auth_store_path=auth_store_path,
    )


if __name__ == "__main__":
    port = 9200
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    server = create_server("127.0.0.1", port)
    token_status = "active (token configured)" if server.auth_token else "unconfigured (fail-closed)"
    print(f"Kanban dashboard server running at http://127.0.0.1:{port}")
    print(f"Auth gate: {token_status}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()
