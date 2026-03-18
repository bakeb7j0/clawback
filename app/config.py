import os


class Config:
    """Application configuration loaded from environment variables."""

    CLAWBACK_SECRET = os.environ.get("CLAWBACK_SECRET")
    PORT = int(os.environ.get("PORT", 8080))
    DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
