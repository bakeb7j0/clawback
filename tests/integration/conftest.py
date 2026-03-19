"""Integration test fixtures — live Flask server and Playwright browser."""

import os
import socket
import threading

import pytest
from werkzeug.serving import make_server

from app import create_app

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
FIXTURE_JSONL = os.path.join(FIXTURE_DIR, "integration-session.jsonl")


@pytest.fixture(scope="session")
def _app():
    """Create a Flask application for testing."""
    return create_app({"TESTING": True, "DEBUG": True})


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
    """Upload the test fixture and wait for the playback view."""
    page.goto(live_server)
    page.wait_for_selector(".picker", state="visible", timeout=5000)
    page.set_input_files('input[type="file"]', FIXTURE_JSONL)
    page.wait_for_selector(".toolbar", state="visible", timeout=5000)
    return page


def _find_free_port():
    """Find an available port by binding to port 0."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]
