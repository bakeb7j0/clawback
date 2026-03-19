"""Unit tests for optional shared-secret authentication middleware."""

import pytest

from app import create_app


@pytest.fixture()
def secret_app():
    """Flask test app with CLAWBACK_SECRET configured."""
    app = create_app({"TESTING": True, "CLAWBACK_SECRET": "test-secret-42"})
    return app


@pytest.fixture()
def open_app():
    """Flask test app without CLAWBACK_SECRET (open access)."""
    app = create_app({"TESTING": True, "CLAWBACK_SECRET": None})
    return app


# -- No secret configured: all routes accessible --


def test_open_index(open_app):
    """Index is accessible without secret when CLAWBACK_SECRET is unset."""
    with open_app.test_client() as c:
        r = c.get("/")
        assert r.status_code == 200


def test_open_api(open_app):
    """API is accessible without secret when CLAWBACK_SECRET is unset."""
    with open_app.test_client() as c:
        r = c.get("/api/sessions")
        assert r.status_code == 200


def test_open_health(open_app):
    """Health endpoint is accessible without secret when CLAWBACK_SECRET is unset."""
    with open_app.test_client() as c:
        r = c.get("/health")
        assert r.status_code == 200


# -- Secret configured: unauthenticated requests redirected/blocked --


def test_no_secret_redirects_to_login(secret_app):
    """Browser requests without a secret redirect to /login."""
    with secret_app.test_client() as c:
        r = c.get("/")
        assert r.status_code == 302
        assert "/login" in r.headers["Location"]


def test_api_no_secret_returns_401(secret_app):
    """API requests without a secret return 401 JSON."""
    with secret_app.test_client() as c:
        r = c.get("/api/sessions")
        assert r.status_code == 401
        assert r.json["error"] == "A valid secret is required"


def test_wrong_secret_header_returns_401(secret_app):
    """Requests with wrong secret in header return 401."""
    with secret_app.test_client() as c:
        r = c.get("/api/sessions", headers={"X-Clawback-Secret": "wrong-secret"})
        assert r.status_code == 401


def test_wrong_cookie_redirects_to_login(secret_app):
    """Requests with wrong cookie redirect to /login."""
    with secret_app.test_client() as c:
        c.set_cookie("clawback_secret", "wrong-secret")
        r = c.get("/")
        assert r.status_code == 302
        assert "/login" in r.headers["Location"]


# -- Secret configured: authenticated requests allowed --


def test_correct_secret_cookie(secret_app):
    """Correct secret via cookie grants access."""
    with secret_app.test_client() as c:
        c.set_cookie("clawback_secret", "test-secret-42")
        r = c.get("/")
        assert r.status_code == 200


def test_correct_secret_header(secret_app):
    """Correct secret via X-Clawback-Secret header grants access."""
    with secret_app.test_client() as c:
        r = c.get("/", headers={"X-Clawback-Secret": "test-secret-42"})
        assert r.status_code == 200


def test_correct_secret_api_access(secret_app):
    """API routes are accessible with correct secret via header."""
    with secret_app.test_client() as c:
        r = c.get(
            "/api/sessions", headers={"X-Clawback-Secret": "test-secret-42"}
        )
        assert r.status_code == 200


def test_correct_secret_static_access(secret_app):
    """Static files are accessible with correct cookie."""
    with secret_app.test_client() as c:
        c.set_cookie("clawback_secret", "test-secret-42")
        r = c.get("/static/css/style.css")
        assert r.status_code == 200


# -- Health endpoint always accessible --


def test_health_no_secret_required(secret_app):
    """Health endpoint is accessible without secret even when CLAWBACK_SECRET is set."""
    with secret_app.test_client() as c:
        r = c.get("/health")
        assert r.status_code == 200


def test_health_returns_ok(secret_app):
    """Health endpoint returns correct JSON."""
    with secret_app.test_client() as c:
        r = c.get("/health")
        assert r.json == {"status": "ok"}


# -- Login page --


def test_login_page_accessible_without_auth(secret_app):
    """GET /login is accessible without authentication."""
    with secret_app.test_client() as c:
        r = c.get("/login")
        assert r.status_code == 200
        assert b"Clawback" in r.data
        assert b'type="password"' in r.data


def test_login_redirects_when_no_secret_configured(open_app):
    """GET /login redirects to index when no secret is configured."""
    with open_app.test_client() as c:
        r = c.get("/login")
        assert r.status_code == 302
        assert "/" in r.headers["Location"]


def test_login_post_correct_secret_sets_cookie(secret_app):
    """POST /login with correct secret sets cookie and redirects."""
    with secret_app.test_client() as c:
        r = c.post("/login", data={"secret": "test-secret-42"})
        assert r.status_code == 302
        assert "/" in r.headers["Location"]
        cookie = next(
            (h for h in r.headers.getlist("Set-Cookie") if "clawback_secret" in h),
            None,
        )
        assert cookie is not None
        assert "HttpOnly" in cookie
        assert "SameSite=Lax" in cookie


def test_login_post_wrong_secret_shows_error(secret_app):
    """POST /login with wrong secret returns 401 with error message."""
    with secret_app.test_client() as c:
        r = c.post("/login", data={"secret": "wrong"})
        assert r.status_code == 401
        assert b"Invalid secret" in r.data


def test_login_post_empty_secret_shows_error(secret_app):
    """POST /login with empty secret returns 401."""
    with secret_app.test_client() as c:
        r = c.post("/login", data={"secret": ""})
        assert r.status_code == 401


def test_login_flow_end_to_end(secret_app):
    """Full login flow: redirect → login → cookie → access."""
    with secret_app.test_client() as c:
        # Unauthenticated → redirect to login
        r = c.get("/")
        assert r.status_code == 302

        # Submit correct secret
        r = c.post("/login", data={"secret": "test-secret-42"})
        assert r.status_code == 302

        # Cookie is now set — index should work
        r = c.get("/")
        assert r.status_code == 200
