import json
import os
import secrets
import sys
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from server import create_server

def main():
    tmp_token = secrets.token_hex(16)
    server = create_server("127.0.0.1", port=0, auth_token=tmp_token)
    port = server.server_port
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    try:
        # 1. Unauthenticated root GET
        resp = urlopen(f"http://127.0.0.1:{port}/")
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        html = resp.read().decode("utf-8")
        assert "<!DOCTYPE html>" in html, "Missing <!DOCTYPE html>"
        assert "auth-modal" in html, "Missing auth-modal in static login shell"
        assert tmp_token not in html, "Secret token leaked into HTML"
        assert resp.headers.get("Cache-Control") == "no-store", "Missing Cache-Control: no-store"
        assert resp.headers.get("Referrer-Policy") == "no-referrer", "Missing Referrer-Policy: no-referrer"
        print("VERIFIED: root GET 200 static login shell without auth")

        # 2. Unauthenticated static asset GET
        resp = urlopen(f"http://127.0.0.1:{port}/static/app.js")
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        js = resp.read().decode("utf-8")
        assert "inMemoryToken" in js, "app.js missing inMemoryToken"
        assert tmp_token not in js, "Secret token leaked into JS"
        assert resp.headers.get("Cache-Control") == "no-store", "Missing Cache-Control: no-store"
        assert resp.headers.get("Referrer-Policy") == "no-referrer", "Missing Referrer-Policy: no-referrer"
        assert resp.headers.get("X-Content-Type-Options") == "nosniff", "Missing X-Content-Type-Options"
        print("VERIFIED: static asset GET 200 with security headers")

        # 3. Unauthenticated API GET -> 401
        try:
            urlopen(f"http://127.0.0.1:{port}/api/boards")
            assert False, "Expected 401 for unauthenticated API"
        except HTTPError as e:
            assert e.code == 401, f"Expected 401, got {e.code}"
            err_body = json.loads(e.read().decode("utf-8"))
            assert "token required" in err_body["error"].lower(), f"Unexpected error body: {err_body}"
            print("VERIFIED: unauthenticated /api/boards returns 401")

        # 4. Authenticated API GET -> 200
        req = Request(f"http://127.0.0.1:{port}/api/boards", headers={"Authorization": f"Bearer {tmp_token}"})
        resp = urlopen(req)
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode("utf-8"))
        assert "boards" in data, f"Missing 'boards' in response: {data}"
        print("VERIFIED: authenticated /api/boards returns 200")

        # 5. First-run password setup & session auth verification in fresh server instance
        import tempfile, shutil
        auth_dir = tempfile.mkdtemp()
        auth_store = os.path.join(auth_dir, "auth.json")
        pwd_server = create_server("127.0.0.1", port=0, auth_store_path=auth_store)
        pwd_port = pwd_server.server_port
        pwd_t = threading.Thread(target=pwd_server.serve_forever, daemon=True)
        pwd_t.start()

        try:
            # (a) Status pre-setup indicates setup_required
            st_req = Request(f"http://127.0.0.1:{pwd_port}/api/auth/status")
            st_resp = urlopen(st_req)
            assert st_resp.status == 200
            st_data = json.loads(st_resp.read().decode("utf-8"))
            assert st_data.get("setup_required") is True
            assert st_data.get("authenticated") is False
            csrf = st_data.get("csrf_token")
            raw_cookie = st_resp.headers.get("Set-Cookie", "")
            session_cookie = raw_cookie.split(";")[0]

            # (b) Complete one-time setup
            setup_payload = json.dumps({
                "password": "valid-admin-password-123",
                "confirm_password": "valid-admin-password-123"
            }).encode("utf-8")
            setup_req = Request(
                f"http://127.0.0.1:{pwd_port}/api/auth/setup",
                data=setup_payload,
                headers={
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrf,
                    "Origin": f"http://127.0.0.1:{pwd_port}",
                    "Cookie": session_cookie,
                }
            )
            setup_resp = urlopen(setup_req)
            assert setup_resp.status == 200
            setup_data = json.loads(setup_resp.read().decode("utf-8"))
            new_csrf = setup_data.get("csrf_token")
            setup_cookie = setup_resp.headers.get("Set-Cookie", "").split(";")[0]
            print("VERIFIED: first-run setup creates password and returns authenticated session")

            # (c) Access /api/boards with authenticated session cookie
            boards_req = Request(
                f"http://127.0.0.1:{pwd_port}/api/boards",
                headers={"Cookie": setup_cookie}
            )
            boards_resp = urlopen(boards_req)
            assert boards_resp.status == 200
            print("VERIFIED: session cookie grants access to /api/boards")

            # (d) Setup endpoint is permanently disabled (409)
            subsequent_setup_req = Request(
                f"http://127.0.0.1:{pwd_port}/api/auth/setup",
                data=setup_payload,
                headers={
                    "Content-Type": "application/json",
                    "X-CSRF-Token": new_csrf,
                    "Origin": f"http://127.0.0.1:{pwd_port}",
                    "Cookie": setup_cookie,
                }
            )
            try:
                urlopen(subsequent_setup_req)
                assert False, "Setup should be 409 after first run"
            except HTTPError as e:
                assert e.code == 409, f"Expected 409, got {e.code}"
                print("VERIFIED: setup endpoint permanently disabled (409)")

        finally:
            pwd_server.shutdown()
            pwd_server.server_close()
            shutil.rmtree(auth_dir)

    finally:
        server.shutdown()
        server.server_close()
        print("VERIFIED: server shut down cleanly (no persistent service)")

if __name__ == "__main__":
    main()
