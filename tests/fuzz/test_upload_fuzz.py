"""Fuzz tests for the upload endpoint using Hypothesis.

Verifies that the upload endpoint handles arbitrary/malformed files
and form fields without crashing (no 500 errors).
"""

import io

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

# Suppress function_scoped_fixture check — Flask test clients are
# safe to reuse across Hypothesis examples.
FUZZ_SETTINGS = settings(
    max_examples=200,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


@given(filename=st.text(min_size=1, max_size=200))
@FUZZ_SETTINGS
def test_upload_handles_random_filenames(client, filename):
    """POST /api/sessions/upload with random filename strings never returns 500."""
    data = {
        "file": (io.BytesIO(b'{"type":"user","message":{"content":"hi"}}\n'), filename),
        "title": "fuzz-upload-test",
    }
    response = client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code != 500


@given(content=st.binary(min_size=1, max_size=10000))
@FUZZ_SETTINGS
def test_upload_handles_random_file_content(client, content):
    """POST /api/sessions/upload with random bytes as file content.

    Should return 400 or 201, never 500.
    """
    data = {
        "file": (io.BytesIO(content), "random.jsonl"),
        "title": "fuzz-random-content",
    }
    response = client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code != 500


@given(
    title=st.text(max_size=200),
    description=st.text(max_size=500),
    tags=st.text(max_size=200),
)
@FUZZ_SETTINGS
def test_upload_handles_random_form_fields(client, title, description, tags):
    """POST /api/sessions/upload with random title/description/tags never returns 500."""
    data = {
        "file": (
            io.BytesIO(b'{"type":"user","message":{"content":"test"}}\n'),
            "test.jsonl",
        ),
        "title": title,
        "description": description,
        "tags": tags,
    }
    response = client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code != 500


@given(
    include_file=st.booleans(),
    include_title=st.booleans(),
)
@FUZZ_SETTINGS
def test_upload_handles_missing_fields(client, include_file, include_title):
    """POST /api/sessions/upload with random subset of required fields.

    Should return 400, never 500.
    """
    data = {}
    if include_file:
        data["file"] = (
            io.BytesIO(b'{"type":"user","message":{"content":"test"}}\n'),
            "test.jsonl",
        )
    if include_title:
        data["title"] = "fuzz-missing-fields"

    response = client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code != 500
