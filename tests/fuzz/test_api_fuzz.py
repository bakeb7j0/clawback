"""Fuzz tests for API endpoints using Hypothesis.

Verifies that API endpoints handle arbitrary/malformed input without
crashing (no 500 errors).
"""

import json

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

# Suppress function_scoped_fixture check — Flask test clients are
# safe to reuse across Hypothesis examples.
FUZZ_SETTINGS = settings(
    max_examples=200,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


@given(query=st.text())
@FUZZ_SETTINGS
def test_sessions_list_never_500s(client, query):
    """GET /api/sessions with random query params never returns 500."""
    response = client.get(f"/api/sessions?q={query}")
    assert response.status_code != 500


@given(session_id=st.text(min_size=1))
@FUZZ_SETTINGS
def test_session_detail_handles_random_ids(client, session_id):
    """GET /api/sessions/<random_text> returns 404 or 200, never 500."""
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code != 500


@given(
    body=st.dictionaries(
        keys=st.text(min_size=1, max_size=50),
        values=st.one_of(
            st.text(),
            st.integers(),
            st.floats(allow_nan=False),
            st.booleans(),
            st.none(),
            st.lists(st.text(), max_size=5),
        ),
        max_size=20,
    )
)
@FUZZ_SETTINGS
def test_annotations_put_handles_random_json(client, body):
    """PUT /api/sessions/<id>/annotations with random JSON bodies.

    Should return 400 or 200, never 500.
    """
    response = client.put(
        "/api/sessions/fuzz-session/annotations",
        data=json.dumps(body),
        content_type="application/json",
    )
    assert response.status_code != 500


@given(data=st.binary(min_size=1, max_size=10000))
@FUZZ_SETTINGS
def test_annotations_put_handles_non_json(client, data):
    """PUT /api/sessions/<id>/annotations with random bytes as body.

    Should return 400, never 500.
    """
    response = client.put(
        "/api/sessions/fuzz-session/annotations",
        data=data,
        content_type="application/json",
    )
    assert response.status_code != 500
