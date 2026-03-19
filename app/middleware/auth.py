"""Optional shared-secret authentication middleware.

When the CLAWBACK_SECRET config value is set, all routes except /health
require a matching secret via query parameter or header. When unset,
all routes are accessible without authentication.
"""

import hmac

from flask import current_app, request


def check_secret():
    """Flask before_request hook that enforces shared-secret auth.

    Returns None (allow) or a 401 tuple (deny).
    """
    secret = current_app.config.get("CLAWBACK_SECRET")
    if not secret:
        return None

    if request.path == "/health":
        return None

    provided = request.args.get("secret") or request.headers.get("X-Clawback-Secret")
    if provided and hmac.compare_digest(provided, secret):
        return None

    return _unauthorized_response()


def _unauthorized_response():
    """Return a minimal 401 HTML error page."""
    html = (
        "<!doctype html>"
        "<html><head><title>401 Unauthorized</title></head>"
        "<body><h1>401 Unauthorized</h1>"
        "<p>A valid secret is required to access this application.</p>"
        "</body></html>"
    )
    return html, 401
