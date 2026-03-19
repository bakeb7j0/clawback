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
    assert "annotations" in data
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


def test_annotations_null_when_no_sidecar(cache):
    """Sessions without annotation files have annotations=None."""
    data = cache.get_session("demo-session")
    assert data["annotations"] is None


def test_annotations_loaded_when_sidecar_exists(tmp_path):
    """Sessions with annotation sidecar files have annotations populated."""
    # Create a minimal session
    jsonl = (
        '{"type":"user","message":{"content":"hello"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    (tmp_path / "test.jsonl").write_text(jsonl)

    # Create manifest
    manifest = [{"id": "test", "title": "Test", "file": "test.jsonl"}]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))

    # Create annotation sidecar
    annotations = {
        "session_id": "test",
        "sections": [],
        "callouts": [
            {"id": "cal-1", "after_beat": 0, "style": "note", "content": "Hi"}
        ],
        "artifacts": [],
    }
    (tmp_path / "test-annotations.json").write_text(json.dumps(annotations))

    c = SessionCache()
    c.load(str(tmp_path))
    data = c.get_session("test")
    assert data is not None
    assert data["annotations"] is not None
    assert len(data["annotations"]["callouts"]) == 1


def test_update_annotations(cache):
    """update_annotations replaces cached annotations for a session."""
    new_annotations = {
        "session_id": "demo-session",
        "sections": [],
        "callouts": [],
        "artifacts": [],
    }
    cache.update_annotations("demo-session", new_annotations)
    data = cache.get_session("demo-session")
    assert data["annotations"] == new_annotations


def test_update_annotations_unknown_session(cache):
    """update_annotations is a no-op for unknown sessions."""
    cache.update_annotations("nonexistent", {"test": True})
    assert cache.get_session("nonexistent") is None


def test_add_session(cache):
    """add_session adds a new session to both manifest and parsed data."""
    entry = {"id": "new-session", "title": "New", "description": "Test", "file": "new.jsonl"}
    beats = [{"id": 0, "type": "user_message", "content": "hello"}]
    cache.add_session("new-session", entry, beats)

    # Verify manifest updated
    ids = [s["id"] for s in cache.list_sessions()]
    assert "new-session" in ids

    # Verify parsed data available
    data = cache.get_session("new-session")
    assert data is not None
    assert data["title"] == "New"
    assert len(data["beats"]) == 1
    assert data["annotations"] is None


def test_add_session_with_annotations(cache):
    """add_session can include annotations."""
    entry = {"id": "annotated", "title": "Annotated", "file": "a.jsonl"}
    beats = [{"id": 0, "type": "user_message", "content": "hello"}]
    annotations = {"session_id": "annotated", "sections": [], "callouts": [], "artifacts": []}
    cache.add_session("annotated", entry, beats, annotations=annotations)

    data = cache.get_session("annotated")
    assert data["annotations"] is not None
    assert data["annotations"]["session_id"] == "annotated"
