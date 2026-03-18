def test_health_returns_200(client):
    """Health endpoint returns 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}


def test_health_content_type(client):
    """Health endpoint returns JSON content type."""
    response = client.get("/health")
    assert response.content_type == "application/json"
