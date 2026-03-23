import io
import json

import pytest

from app import create_app


@pytest.fixture()
def tmp_client(tmp_path):
    """Client with a temp sessions dir for upload/annotation tests."""
    # Create a minimal session
    jsonl = (
        '{"type":"user","message":{"content":"hello"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]},'
        '"uuid":"a1","parentUuid":"u1","timestamp":"2026-01-01T00:00:01Z"}\n'
    )
    (tmp_path / "test-session.jsonl").write_text(jsonl)
    manifest = [
        {
            "id": "test-session", "title": "Test", "file": "test-session.jsonl",
            "beat_count": 2, "description": "A test", "tags": [],
        }
    ]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))

    app = create_app({"TESTING": True, "DEBUG": True, "SESSIONS_DIR": str(tmp_path)})
    return app.test_client()


def test_sessions_list_returns_200(client):
    """Sessions endpoint returns 200 with session list."""
    response = client.get("/api/sessions")
    assert response.status_code == 200
    sessions = response.json["sessions"]
    assert isinstance(sessions, list)


def test_sessions_list_includes_required_fields(client):
    """Each session in list has id, title, description, beat_count."""
    response = client.get("/api/sessions")
    for session in response.json["sessions"]:
        assert "id" in session
        assert "title" in session
        assert "description" in session
        assert "beat_count" in session


def test_get_session_returns_beats(client):
    """Getting a specific session returns beats array."""
    response = client.get("/api/sessions")
    sessions = response.json["sessions"]
    assert len(sessions) > 0

    session_id = sessions[0]["id"]
    response = client.get(f"/api/sessions/{session_id}")
    assert response.status_code == 200
    data = response.json
    assert "beats" in data
    assert "title" in data
    assert isinstance(data["beats"], list)
    assert len(data["beats"]) > 0


def test_get_session_includes_annotations_key(client):
    """Session response includes annotations field."""
    response = client.get("/api/sessions")
    session_id = response.json["sessions"][0]["id"]
    response = client.get(f"/api/sessions/{session_id}")
    assert "annotations" in response.json


def test_get_session_beats_have_correct_structure(client):
    """Beats returned by the API have the expected structure."""
    response = client.get("/api/sessions")
    session_id = response.json["sessions"][0]["id"]

    response = client.get(f"/api/sessions/{session_id}")
    beat = response.json["beats"][0]
    assert "id" in beat
    assert "type" in beat
    assert "category" in beat
    assert "content" in beat
    assert "duration" in beat


def test_get_session_404_for_unknown_id(client):
    """Getting a nonexistent session returns 404."""
    response = client.get("/api/sessions/nonexistent-id-xyz")
    assert response.status_code == 404


# --- PUT annotations tests ---


def test_put_annotations_success(tmp_client):
    """Valid annotation data saves successfully."""
    data = {
        "session_id": "test-session",
        "sections": [],
        "callouts": [
            {"id": "cal-1", "after_beat": 0, "style": "note", "content": "Hello"}
        ],
        "artifacts": [],
    }
    response = tmp_client.put(
        "/api/sessions/test-session/annotations",
        json=data,
    )
    assert response.status_code == 200
    assert response.json["status"] == "ok"

    # Verify it's cached — re-fetch session
    response = tmp_client.get("/api/sessions/test-session")
    assert response.json["annotations"] is not None
    assert len(response.json["annotations"]["callouts"]) == 1


def test_put_annotations_404_unknown_session(tmp_client):
    """PUT to unknown session returns 404."""
    data = {"session_id": "nope", "sections": [], "callouts": [], "artifacts": []}
    response = tmp_client.put("/api/sessions/nope/annotations", json=data)
    assert response.status_code == 404


def test_put_annotations_400_invalid_data(tmp_client):
    """PUT with invalid annotation data returns 400 with errors."""
    data = {"not": "valid"}
    response = tmp_client.put(
        "/api/sessions/test-session/annotations",
        json=data,
    )
    assert response.status_code == 400
    assert "errors" in response.json


def test_put_annotations_400_no_body(tmp_client):
    """PUT with no JSON body returns 400."""
    response = tmp_client.put(
        "/api/sessions/test-session/annotations",
        data="not json",
        content_type="text/plain",
    )
    assert response.status_code == 400
    assert "Invalid JSON" in response.json["message"]


# --- POST upload tests ---


def test_upload_session_success(tmp_client):
    """Uploading a valid session creates it and returns 201."""
    jsonl = (
        '{"type":"user","message":{"content":"new session"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "new.jsonl"),
        "title": "My New Session",
        "description": "A fresh session",
        "tags": "test, upload",
    }
    response = tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    assert response.json["status"] == "ok"
    session = response.json["session"]
    assert session["id"] == "my-new-session"
    assert session["title"] == "My New Session"
    assert session["beat_count"] == 1
    assert session["tags"] == ["test", "upload"]

    # Verify it's immediately accessible
    response = tmp_client.get("/api/sessions/my-new-session")
    assert response.status_code == 200
    assert len(response.json["beats"]) == 1


def test_upload_session_missing_file(tmp_client):
    """Upload without file returns 400."""
    response = tmp_client.post(
        "/api/sessions/upload",
        data={"title": "No File"},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "No file" in response.json["message"]


def test_upload_session_missing_title(tmp_client):
    """Upload without title returns 400."""
    jsonl = (
        '{"type":"user","message":{"content":"hi"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "test.jsonl"),
    }
    response = tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "Title is required" in response.json["message"]


def test_upload_session_empty_file(tmp_client):
    """Upload with empty file returns 400."""
    data = {
        "file": (io.BytesIO(b""), "empty.jsonl"),
        "title": "Empty",
    }
    response = tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "empty" in response.json["message"].lower()


def test_upload_session_duplicate_title(tmp_client):
    """Upload with title that slugifies to existing ID returns 400."""
    jsonl = (
        '{"type":"user","message":{"content":"hi"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "test.jsonl"),
        "title": "Test Session",  # slugifies to "test-session" which exists
    }
    response = tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "already exists" in response.json["message"]


def test_upload_session_no_parseable_beats(tmp_client):
    """Upload with JSONL that has no conversation messages returns 400."""
    jsonl = '{"type":"progress","message":{}}\n'
    data = {
        "file": (io.BytesIO(jsonl.encode()), "bad.jsonl"),
        "title": "Bad Session",
    }
    response = tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "No parseable beats" in response.json["message"]


def test_upload_session_appears_in_list(tmp_client):
    """Uploaded session appears in the sessions list endpoint."""
    jsonl = (
        '{"type":"user","message":{"content":"hi"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "test.jsonl"),
        "title": "Listed Session",
    }
    tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    response = tmp_client.get("/api/sessions")
    ids = [s["id"] for s in response.json["sessions"]]
    assert "listed-session" in ids


def test_upload_session_invalid_title_produces_empty_slug(tmp_client):
    """Title that slugifies to empty string returns 400."""
    jsonl = (
        '{"type":"user","message":{"content":"hi"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "test.jsonl"),
        "title": "---",
    }
    response = tmp_client.post(
        "/api/sessions/upload",
        data=data,
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "invalid ID" in response.json["message"]


# --- Read-only mode tests ---


def test_config_endpoint_returns_read_only_false(client):
    """GET /api/config returns readOnly=false by default."""
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json["readOnly"] is False


def test_config_endpoint_returns_read_only_true():
    """GET /api/config returns readOnly=true when configured."""
    app = create_app({"TESTING": True, "CLAWBACK_READ_ONLY": True})
    response = app.test_client().get("/api/config")
    assert response.status_code == 200
    assert response.json["readOnly"] is True


def test_annotations_put_blocked_when_read_only(tmp_path):
    """PUT annotations returns 403 in read-only mode."""
    jsonl = (
        '{"type":"user","message":{"content":"hello"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]},'
        '"uuid":"a1","parentUuid":"u1","timestamp":"2026-01-01T00:00:01Z"}\n'
    )
    (tmp_path / "test-session.jsonl").write_text(jsonl)
    manifest = [
        {"id": "test-session", "title": "Test", "file": "test-session.jsonl",
         "beat_count": 2, "description": "A test", "tags": []},
    ]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))

    app = create_app({
        "TESTING": True, "CLAWBACK_READ_ONLY": True,
        "SESSIONS_DIR": str(tmp_path),
    })
    client = app.test_client()
    response = client.put(
        "/api/sessions/test-session/annotations",
        json={"sections": [], "callouts": [], "artifacts": []},
    )
    assert response.status_code == 403
    assert "Read-only" in response.json["message"]


def test_upload_blocked_when_read_only(tmp_path):
    """POST upload returns 403 in read-only mode."""
    (tmp_path / "manifest.json").write_text("[]")
    app = create_app({
        "TESTING": True, "CLAWBACK_READ_ONLY": True,
        "SESSIONS_DIR": str(tmp_path),
    })
    client = app.test_client()
    jsonl = (
        '{"type":"user","message":{"content":"hi"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "test.jsonl"),
        "title": "My Session",
    }
    response = client.post(
        "/api/sessions/upload", data=data, content_type="multipart/form-data",
    )
    assert response.status_code == 403
    assert "Read-only" in response.json["message"]


def test_annotations_put_allowed_when_not_read_only(tmp_client):
    """PUT annotations works normally when read-only is not set."""
    response = tmp_client.put(
        "/api/sessions/test-session/annotations",
        json={
            "session_id": "test-session",
            "sections": [], "callouts": [], "artifacts": [],
        },
    )
    assert response.status_code == 200


def test_upload_allowed_when_not_read_only(tmp_client):
    """POST upload works normally when read-only is not set."""
    jsonl = (
        '{"type":"user","message":{"content":"hello"},'
        '"uuid":"u1","parentUuid":null,"timestamp":"2026-01-01T00:00:00Z"}\n'
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]},'
        '"uuid":"a1","parentUuid":"u1","timestamp":"2026-01-01T00:00:01Z"}\n'
    )
    data = {
        "file": (io.BytesIO(jsonl.encode()), "test.jsonl"),
        "title": "Upload Test",
    }
    response = tmp_client.post(
        "/api/sessions/upload", data=data, content_type="multipart/form-data",
    )
    assert response.status_code == 201
