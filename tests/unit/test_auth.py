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


# -- Secret configured: unauthenticated requests blocked --


def test_no_secret_returns_401(secret_app):
    """Requests without a secret return 401."""
    with secret_app.test_client() as c:
        r = c.get("/")
        assert r.status_code == 401


def test_wrong_secret_query_returns_401(secret_app):
    """Requests with wrong secret in query param return 401."""
    with secret_app.test_client() as c:
        r = c.get("/?secret=wrong-secret")
        assert r.status_code == 401


def test_wrong_secret_header_returns_401(secret_app):
    """Requests with wrong secret in header return 401."""
    with secret_app.test_client() as c:
        r = c.get("/", headers={"X-Clawback-Secret": "wrong-secret"})
        assert r.status_code == 401


def test_401_body_contains_unauthorized(secret_app):
    """401 response contains a meaningful error message."""
    with secret_app.test_client() as c:
        r = c.get("/")
        assert b"401 Unauthorized" in r.data


# -- Secret configured: authenticated requests allowed --


def test_correct_secret_query_param(secret_app):
    """Correct secret via query parameter grants access."""
    with secret_app.test_client() as c:
        r = c.get("/?secret=test-secret-42")
        assert r.status_code == 200


def test_correct_secret_header(secret_app):
    """Correct secret via X-Clawback-Secret header grants access."""
    with secret_app.test_client() as c:
        r = c.get("/", headers={"X-Clawback-Secret": "test-secret-42"})
        assert r.status_code == 200


def test_correct_secret_api_access(secret_app):
    """API routes are accessible with correct secret."""
    with secret_app.test_client() as c:
        r = c.get("/api/sessions?secret=test-secret-42")
        assert r.status_code == 200


def test_correct_secret_static_access(secret_app):
    """Static files are accessible with correct secret."""
    with secret_app.test_client() as c:
        r = c.get("/static/css/style.css?secret=test-secret-42")
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
