def test_sessions_endpoint_returns_200(client):
    """Sessions endpoint returns 200 with empty list."""
    response = client.get("/api/sessions")
    assert response.status_code == 200
    assert response.json == {"sessions": []}
