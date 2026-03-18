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
