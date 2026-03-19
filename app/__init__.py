from pathlib import Path

from flask import Flask

from app.config import Config
from app.middleware.auth import check_secret
from app.services.annotation_store import AnnotationStore
from app.services.session_cache import SessionCache

_DEFAULT_SESSIONS_DIR = Path(__file__).resolve().parent.parent / "sessions" / "curated"


def create_app(config=None):
    """Flask application factory."""
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config.from_object(Config)

    if config:
        app.config.update(config)

    app.before_request(check_secret)

    # Resolve sessions directory
    sessions_dir = config.get("SESSIONS_DIR") if config else None
    sessions_dir = Path(sessions_dir) if sessions_dir else _DEFAULT_SESSIONS_DIR
    app.sessions_dir = sessions_dir

    # Annotation store for reading/writing sidecar files
    app.annotation_store = AnnotationStore(sessions_dir)

    # Pre-parse curated sessions at startup
    cache = SessionCache()
    cache.load(
        sessions_dir=str(sessions_dir),
        debug=app.config.get("DEBUG", False),
    )
    app.session_cache = cache

    from app.routes import register_blueprints

    register_blueprints(app)

    return app
