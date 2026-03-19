"""Integration test fixtures — live Flask server and Playwright browser."""

import json
import os
import shutil
import socket
import tempfile
import threading

import pytest
from werkzeug.serving import make_server

from app import create_app

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
FIXTURE_JSONL = os.path.join(FIXTURE_DIR, "integration-session.jsonl")
FIXTURE_ANNOTATIONS = os.path.join(FIXTURE_DIR, "integration-annotations.json")


@pytest.fixture(scope="session")
def _sessions_dir():
    """Create a temporary sessions directory with test fixtures.

    Copies the integration session JSONL and its annotation sidecar into a
    temp directory with a manifest, so the Flask app loads them as curated
    sessions at startup.
    """
    tmp = tempfile.mkdtemp(prefix="clawback-test-sessions-")
    shutil.copy(FIXTURE_JSONL, os.path.join(tmp, "integration-test.jsonl"))
    shutil.copy(
        FIXTURE_ANNOTATIONS,
        os.path.join(tmp, "integration-test-annotations.json"),
    )

    manifest = [
        {
            "id": "integration-test",
            "title": "Integration Test Session",
            "description": "Test session with annotations",
            "file": "integration-test.jsonl",
            "beat_count": 10,
            "tags": ["test"],
        }
    ]
    with open(os.path.join(tmp, "manifest.json"), "w") as f:
        json.dump(manifest, f)

    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def _app(_sessions_dir):
    """Create a Flask application for testing."""
    return create_app({
        "TESTING": True,
        "DEBUG": True,
        "SESSIONS_DIR": _sessions_dir,
    })


@pytest.fixture(scope="session")
def live_server(_app):
    """Start Flask in a background thread and yield the base URL."""
    port = _find_free_port()
    server = make_server("127.0.0.1", port, _app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture()
def loaded_page(page, live_server):
    """Navigate to the app and wait for the session picker to appear."""
    page.goto(live_server)
    page.wait_for_selector(".picker", state="visible", timeout=5000)
    return page


@pytest.fixture()
def playback_page(page, live_server):
    """Upload the test fixture (client-side) and wait for the playback view.

    Uses the upload zone file input (not the Add Session card) so the session
    is parsed client-side without server persistence — identical to v1.0.
    """
    page.goto(live_server)
    page.wait_for_selector(".picker", state="visible", timeout=5000)
    # Target the upload zone file input specifically (not the Add Session card input)
    page.locator('.picker__upload-zone input[type="file"]').set_input_files(FIXTURE_JSONL)
    page.wait_for_selector(".toolbar", state="visible", timeout=5000)
    return page


@pytest.fixture()
def annotated_page(page, live_server):
    """Load the curated session with annotations and wait for playback."""
    page.goto(live_server)
    page.wait_for_selector(".picker", state="visible", timeout=5000)
    # Click the curated session card (first card — the annotated integration test)
    page.locator(".picker__card:not(.picker__card--add)").first.click()
    page.wait_for_selector(".toolbar", state="visible", timeout=5000)
    return page


def _find_free_port():
    """Find an available port by binding to port 0."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]
