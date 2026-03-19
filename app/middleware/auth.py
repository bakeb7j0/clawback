"""Optional shared-secret authentication middleware.

When the CLAWBACK_SECRET config value is set, all routes except /health
and /login require a matching secret via cookie or header. When unset,
all routes are accessible without authentication.
"""

import hmac

from flask import current_app, redirect, request, url_for


def check_secret():
    """Flask before_request hook that enforces shared-secret auth.

    Returns None (allow), a redirect (to /login), or a 401 tuple (deny).
    """
    secret = current_app.config.get("CLAWBACK_SECRET")
    if not secret:
        return None

    if request.path in ("/health", "/login"):
        return None

    provided = (
        request.cookies.get("clawback_secret")
        or request.headers.get("X-Clawback-Secret")
    )
    if provided and hmac.compare_digest(provided, secret):
        return None

    if request.path.startswith("/api/"):
        return _unauthorized_json()

    return redirect(url_for("views.login"))


def _unauthorized_json():
    """Return a 401 JSON response for API consumers."""
    return {"error": "A valid secret is required"}, 401
