"""Unit tests for the curated session pre-parsing cache."""

import json
import os

import pytest

from app.services.session_cache import SessionCache

CURATED_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "sessions",
    "curated",
)


@pytest.fixture()
def cache():
    """A SessionCache loaded with debug=True (all sessions visible)."""
    c = SessionCache()
    c.load(CURATED_DIR, debug=True)
    return c


@pytest.fixture()
def prod_cache():
    """A SessionCache loaded with debug=False (debug sessions hidden)."""
    c = SessionCache()
    c.load(CURATED_DIR, debug=False)
    return c


def test_load_populates_manifest(cache):
    """Loading with debug=True shows all sessions."""
    sessions = cache.list_sessions()
    assert len(sessions) >= 3


def test_manifest_entries_have_required_fields(cache):
    """Each manifest entry has id, title, description, file."""
    for entry in cache.list_sessions():
        assert "id" in entry
        assert "title" in entry
        assert "description" in entry
        assert "file" in entry


def test_get_session_returns_parsed_data(cache):
    """get_session returns pre-parsed beats for a known session."""
    data = cache.get_session("demo-session")
    assert data is not None
    assert "beats" in data
    assert "title" in data
    assert len(data["beats"]) == 12


def test_get_session_debugging(cache):
    """get_session returns pre-parsed beats for the debugging session."""
    data = cache.get_session("debugging-session")
    assert data is not None
    assert len(data["beats"]) == 16
    assert data["title"] == "Debugging: API 500 Errors"


def test_get_session_unknown_returns_none(cache):
    """get_session returns None for an unknown session ID."""
    assert cache.get_session("nonexistent") is None


def test_debug_sessions_hidden_in_prod(prod_cache):
    """Debug sessions are excluded when debug=False."""
    sessions = prod_cache.list_sessions()
    ids = [s["id"] for s in sessions]
    assert "demo-session" not in ids
    assert "debugging-session" not in ids
    assert "creating-clawback" in ids


def test_debug_sessions_not_parsed_in_prod(prod_cache):
    """Debug sessions are not parsed when debug=False."""
    assert prod_cache.get_session("demo-session") is None
    assert prod_cache.get_session("debugging-session") is None


def test_empty_cache():
    """An unloaded cache returns empty results."""
    c = SessionCache()
    assert c.list_sessions() == []
    assert c.get_session("anything") is None


def test_load_missing_directory(tmp_path):
    """Loading from a directory without a manifest produces empty results."""
    c = SessionCache()
    c.load(str(tmp_path))
    assert c.list_sessions() == []


def test_load_invalid_manifest(tmp_path):
    """Loading a manifest that isn't a list produces empty results."""
    manifest = tmp_path / "manifest.json"
    manifest.write_text('{"not": "a list"}')
    c = SessionCache()
    c.load(str(tmp_path))
    assert c.list_sessions() == []


def test_load_missing_session_file(tmp_path):
    """Sessions with missing files are skipped gracefully."""
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps([
        {"id": "missing", "title": "Missing", "file": "nope.jsonl"}
    ]))
    c = SessionCache()
    c.load(str(tmp_path))
    assert c.list_sessions() == [{"id": "missing", "title": "Missing", "file": "nope.jsonl"}]
    assert c.get_session("missing") is None
