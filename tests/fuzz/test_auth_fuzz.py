"""Fuzz tests for authentication using Hypothesis.

Verifies that the auth middleware and login endpoint handle
arbitrary credentials without crashing (no 500 errors).
"""

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

# Suppress function_scoped_fixture check — Flask test clients are
# safe to reuse across Hypothesis examples.
FUZZ_SETTINGS = settings(
    max_examples=200,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


@given(secret=st.text(max_size=500))
@FUZZ_SETTINGS
def test_login_post_handles_random_secrets(auth_client, secret):
    """POST /login with random secret values returns 401, never 500."""
    response = auth_client.post(
        "/login",
        data={"secret": secret},
        content_type="application/x-www-form-urlencoded",
    )
    assert response.status_code != 500


@given(cookie_value=st.text(max_size=500))
@FUZZ_SETTINGS
def test_auth_cookie_handles_random_values(auth_client, cookie_value):
    """Requests with random clawback_secret cookie values return 401 redirect, never 500."""
    auth_client.set_cookie("clawback_secret", cookie_value, domain="localhost")
    response = auth_client.get("/api/sessions")
    assert response.status_code != 500


# HTTP headers cannot contain newline characters (rejected by Werkzeug
# before the request reaches the app), so we filter them out.
_header_safe_text = st.text(max_size=500).filter(lambda s: "\n" not in s and "\r" not in s)


@given(header_value=_header_safe_text)
@FUZZ_SETTINGS
def test_auth_header_handles_random_values(auth_client, header_value):
    """Requests with random X-Clawback-Secret header values return 401, never 500."""
    response = auth_client.get(
        "/api/sessions",
        headers={"X-Clawback-Secret": header_value},
    )
    assert response.status_code != 500
