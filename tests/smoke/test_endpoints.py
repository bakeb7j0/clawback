"""Smoke tests for endpoint validation against a running container.

These tests hit real HTTP endpoints on a running Docker container.
The base URL is provided via the SMOKE_TEST_URL environment variable
(default: http://localhost:8080). Auth tests use SMOKE_TEST_AUTH_URL
(default: http://localhost:8081) which points to a container started
with CLAWBACK_SECRET=test-secret.

All HTTP calls use urllib.request (stdlib) — no additional dependencies.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("SMOKE_TEST_URL", "http://localhost:8080")
AUTH_URL = os.environ.get("SMOKE_TEST_AUTH_URL", "http://localhost:8081")


def _get(url):
    """Issue a GET request and return (status, headers, body)."""
    req = urllib.request.Request(url)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, resp.headers, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8")


def _post(url, data=None, content_type=None):
    """Issue a POST request and return (status, headers, body)."""
    if data is not None:
        if isinstance(data, str):
            data = data.encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, resp.headers, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8")


def _put(url, data=None, content_type=None):
    """Issue a PUT request and return (status, headers, body)."""
    if data is not None:
        if isinstance(data, str):
            data = data.encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, resp.headers, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8")


# ── Unauthenticated endpoint tests ──────────────────────────────────


def test_health_returns_200_with_status_ok():
    """GET /health returns 200 with {"status": "ok"}."""
    status, _headers, body = _get(f"{BASE_URL}/health")
    assert status == 200
    data = json.loads(body)
    assert data["status"] == "ok"


def test_index_returns_200_with_html():
    """GET / returns 200 with HTML content."""
    status, headers, _body = _get(f"{BASE_URL}/")
    assert status == 200
    assert "text/html" in headers.get("Content-Type", "")


def test_sessions_list_returns_200_with_json():
    """GET /api/sessions returns 200 with JSON containing 'sessions' key."""
    status, _headers, body = _get(f"{BASE_URL}/api/sessions")
    assert status == 200
    data = json.loads(body)
    assert "sessions" in data


def test_session_not_found_returns_404():
    """GET /api/sessions/nonexistent returns 404."""
    status, _headers, _body = _get(f"{BASE_URL}/api/sessions/nonexistent")
    assert status == 404


def test_upload_rejects_missing_file():
    """POST /api/sessions/upload with no file returns 400."""
    status, _headers, body = _post(
        f"{BASE_URL}/api/sessions/upload",
        data=b"",
        content_type="application/x-www-form-urlencoded",
    )
    assert status == 400


def test_annotations_rejects_invalid_session():
    """PUT /api/sessions/nonexistent/annotations returns 404."""
    status, _headers, _body = _put(
        f"{BASE_URL}/api/sessions/nonexistent/annotations",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert status == 404


# ── Auth-gated endpoint tests (container with CLAWBACK_SECRET) ──────


def test_login_page_accessible_when_secret_set():
    """GET /login returns 200 with a login form; /api/sessions returns 401."""
    # Login page should be accessible
    status, _headers, body = _get(f"{AUTH_URL}/login")
    assert status == 200
    assert "login" in body.lower()

    # API should require auth
    status, _headers, _body = _get(f"{AUTH_URL}/api/sessions")
    assert status == 401


def test_auth_cookie_grants_access():
    """POST /login with correct secret returns Set-Cookie; cookie grants API access."""
    opener = urllib.request.build_opener(_NoRedirectHandler())

    # POST login with the correct secret
    login_data = urllib.parse.urlencode({"secret": "test-secret"}).encode("utf-8")
    req = urllib.request.Request(
        f"{AUTH_URL}/login",
        data=login_data,
        method="POST",
    )
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    resp = opener.open(req)
    assert resp.status == 302, f"Expected 302 redirect, got {resp.status}"

    # Extract Set-Cookie header manually — the cookie has Secure flag so
    # CookieJar won't replay it over plain HTTP in CI
    set_cookie = resp.headers.get("Set-Cookie", "")
    assert "clawback_secret=" in set_cookie, "Expected clawback_secret cookie in response"

    # Parse the cookie value and replay it via header
    cookie_value = set_cookie.split("clawback_secret=")[1].split(";")[0]
    api_req = urllib.request.Request(f"{AUTH_URL}/api/sessions")
    api_req.add_header("Cookie", f"clawback_secret={cookie_value}")

    try:
        api_resp = urllib.request.urlopen(api_req)
        status = api_resp.status
        body = api_resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8")

    assert status == 200, f"Expected 200 with cookie auth, got {status}"
    data = json.loads(body)
    assert "sessions" in data


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Handler that prevents automatic redirect following."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

    def http_error_302(self, req, fp, code, msg, headers):
        return fp

    http_error_301 = http_error_302
    http_error_303 = http_error_302
    http_error_307 = http_error_302
    http_error_308 = http_error_302
