def test_index_returns_html(client):
    """Root URL serves the index.html page."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"Clawback" in response.data
