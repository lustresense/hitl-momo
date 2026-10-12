import http.client
import json
import ssl
import sys

def verify_local():
    print("=== CHECKING LOCAL 127.0.0.1:9200 ===")
    conn = http.client.HTTPConnection("127.0.0.1", 9200, timeout=5)

    # 1. Auth status
    conn.request("GET", "/api/auth/status")
    resp = conn.getresponse()
    body = resp.read().decode("utf-8")
    print(f"Local /api/auth/status: {resp.status} {resp.reason}")
    data = json.loads(body)
    print(f"  setup_required: {data.get('setup_required')}")
    assert resp.status == 200, f"Expected 200, got {resp.status}"
    assert data.get("setup_required") is False, "Expected setup_required == False"

    # 2. Static index.html carries cache-busted query params
    conn.request("GET", "/")
    resp = conn.getresponse()
    html = resp.read().decode("utf-8")
    print(f"Local / index.html: {resp.status} {resp.reason}")
    assert resp.status == 200
    assert 'href="/static/style.css?v=1.2.1"' in html
    assert 'src="/static/app.js?v=1.2.1"' in html

    # 3. Static style.css contains .hidden rules
    conn.request("GET", "/static/style.css?v=1.2.1")
    resp = conn.getresponse()
    css = resp.read().decode("utf-8")
    print(f"Local style.css: {resp.status} {resp.reason}")
    assert resp.status == 200
    assert ".hidden {\n  display: none !important;\n}" in css
    assert "#auth-confirm-group.hidden {\n  display: none !important;\n}" in css

    # 4. Insecure HTTP forwarding redirects to HTTPS
    conn.request("GET", "/", headers={"Host": "kanban.momominum.tech", "X-Forwarded-Proto": "http"})
    resp = conn.getresponse()
    resp.read()
    print(f"Local forwarded HTTP GET: {resp.status} Location={resp.headers.get('Location')}")
    assert resp.status == 301
    assert resp.headers.get("Location") == "https://kanban.momominum.tech/"

    # 5. Secure HTTPS forwarding carries HSTS
    conn.request("GET", "/", headers={"Host": "kanban.momominum.tech", "X-Forwarded-Proto": "https"})
    resp = conn.getresponse()
    resp.read()
    hsts = resp.headers.get("Strict-Transport-Security")
    print(f"Local forwarded HTTPS GET: {resp.status} HSTS={hsts}")
    assert resp.status == 200
    assert hsts is not None and "max-age=" in hsts

    # 6. Insecure HTTP forwarding rejects POST
    conn.request("POST", "/api/auth/login", body="{}", headers={"Host": "kanban.momominum.tech", "X-Forwarded-Proto": "http", "Content-Type": "application/json"})
    resp = conn.getresponse()
    resp_body = resp.read().decode("utf-8")
    print(f"Local forwarded HTTP POST: {resp.status} body={resp_body}")
    assert resp.status == 403

    conn.close()
    print("Local verification PASSED!\n")


def verify_public():
    print("=== CHECKING PUBLIC kanban.momominum.tech ===")

    # 1. Public HTTPS
    ctx = ssl.create_default_context()
    conn_https = http.client.HTTPSConnection("kanban.momominum.tech", timeout=10, context=ctx)
    conn_https.request("GET", "/api/auth/status")
    resp = conn_https.getresponse()
    body = resp.read().decode("utf-8")
    print(f"Public HTTPS /api/auth/status: {resp.status} {resp.reason}")
    data = json.loads(body)
    print(f"  setup_required: {data.get('setup_required')}")
    print(f"  HSTS header: {resp.headers.get('Strict-Transport-Security')}")
    assert resp.status == 200
    assert data.get("setup_required") is False
    assert resp.headers.get("Strict-Transport-Security") is not None

    # 2. Public HTTPS index.html
    conn_https.request("GET", "/")
    resp = conn_https.getresponse()
    html = resp.read().decode("utf-8")
    print(f"Public HTTPS /: {resp.status} {resp.reason}")
    assert resp.status == 200
    assert 'href="/static/style.css?v=1.2.1"' in html
    assert 'src="/static/app.js?v=1.2.1"' in html

    # 3. Public HTTPS style.css?v=1.2.1
    conn_https.request("GET", "/static/style.css?v=1.2.1")
    resp = conn_https.getresponse()
    css = resp.read().decode("utf-8")
    print(f"Public HTTPS style.css: {resp.status} {resp.reason}")
    assert resp.status == 200
    assert ".hidden {\n  display: none !important;\n}" in css
    assert "#auth-confirm-group.hidden {\n  display: none !important;\n}" in css

    conn_https.close()

    # 4. Public HTTP request
    conn_http = http.client.HTTPConnection("kanban.momominum.tech", timeout=10)
    conn_http.request("GET", "/")
    resp_http = conn_http.getresponse()
    resp_http_body = resp_http.read().decode("utf-8", errors="replace")
    print(f"Public HTTP /: {resp_http.status} {resp_http.reason} Location={resp_http.headers.get('Location')}")
    assert resp_http.status in (301, 308)
    assert resp_http.headers.get("Location") == "https://kanban.momominum.tech/"

    conn_http.close()
    print("Public verification PASSED!\n")


if __name__ == "__main__":
    verify_local()
    verify_public()
    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")
