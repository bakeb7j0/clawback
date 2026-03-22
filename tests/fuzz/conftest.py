"""Shared fixtures for Hypothesis fuzz tests.

Creates a Flask test app with sample session data so fuzz tests can
exercise all API endpoints without needing external files.
"""

import json

import pytest

from app import create_app

SAMPLE_JSONL = "\n".join(
    [
        json.dumps(
            {
                "type": "user",
                "message": {"content": "Hello, what can you do?"},
                "uuid": "u1",
                "timestamp": "2026-01-01T00:00:01Z",
            }
        ),
        json.dumps(
            {
                "type": "assistant",
                "message": {
                    "content": [{"type": "text", "text": "I can help with many things."}],
                    "model": "claude-opus-4-6",
                },
                "uuid": "a1",
                "parentUuid": "u1",
                "timestamp": "2026-01-01T00:00:02Z",
            }
        ),
    ]
)

SAMPLE_MANIFEST = [
    {
        "id": "fuzz-session",
        "title": "Fuzz Test Session",
        "description": "A minimal session for fuzz testing.",
        "file": "fuzz-session.jsonl",
        "beat_count": 2,
        "tags": ["fuzz"],
    }
]


@pytest.fixture
def app(tmp_path):
    """Create a test Flask application with a sample session loaded."""
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir()

    # Write sample JSONL file
    (sessions_dir / "fuzz-session.jsonl").write_text(SAMPLE_JSONL)

    # Write manifest
    (sessions_dir / "manifest.json").write_text(json.dumps(SAMPLE_MANIFEST))

    app = create_app(
        {
            "TESTING": True,
            "SESSIONS_DIR": str(sessions_dir),
        }
    )
    yield app


@pytest.fixture
def client(app):
    """Create a test client for the Flask application."""
    return app.test_client()


@pytest.fixture
def auth_app(tmp_path):
    """Create a test Flask application with CLAWBACK_SECRET set."""
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir()

    # Write sample JSONL file
    (sessions_dir / "fuzz-session.jsonl").write_text(SAMPLE_JSONL)

    # Write manifest
    (sessions_dir / "manifest.json").write_text(json.dumps(SAMPLE_MANIFEST))

    app = create_app(
        {
            "TESTING": True,
            "SESSIONS_DIR": str(sessions_dir),
            "CLAWBACK_SECRET": "test-secret",
        }
    )
    yield app


@pytest.fixture
def auth_client(auth_app):
    """Create a test client for the auth-enabled Flask application."""
    return auth_app.test_client()
