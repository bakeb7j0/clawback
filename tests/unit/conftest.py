import pytest

from app import create_app


@pytest.fixture
def app():
    """Create a test Flask application."""
    app = create_app({"TESTING": True})
    yield app


@pytest.fixture
def client(app):
    """Create a test client for the Flask application."""
    return app.test_client()
