import os


class Config:
    """Application configuration loaded from environment variables."""

    CLAWBACK_SECRET = os.environ.get("CLAWBACK_SECRET")
    CLAWBACK_READ_ONLY = os.environ.get("CLAWBACK_READ_ONLY", "").lower() in (
        "1",
        "true",
        "yes",
    )
    CLAWBACK_EPHEMERAL_TTL = int(os.environ.get("CLAWBACK_EPHEMERAL_TTL", 14400))
    PORT = int(os.environ.get("PORT", 8080))
    DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
