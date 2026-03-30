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

    # Ephemeral sessions directory — sibling to curated, cleared on startup
    ephemeral_dir = config.get("EPHEMERAL_DIR") if config else None
    ephemeral_dir = Path(ephemeral_dir) if ephemeral_dir else sessions_dir.parent / "ephemeral"
    ephemeral_dir.mkdir(parents=True, exist_ok=True)
    for f in ephemeral_dir.glob("*.jsonl"):
        f.unlink()
    for f in ephemeral_dir.glob("*-annotations.json"):
        f.unlink()
    app.ephemeral_dir = ephemeral_dir

    # Annotation stores for curated and ephemeral sessions
    app.annotation_store = AnnotationStore(sessions_dir)
    app.ephemeral_annotation_store = AnnotationStore(ephemeral_dir)

    # Pre-parse curated sessions at startup
    cache = SessionCache()
    cache.load(
        sessions_dir=str(sessions_dir),
        debug=app.config.get("DEBUG", False),
    )
    cache.set_directories(sessions_dir, ephemeral_dir)
    app.session_cache = cache

    from app.routes import register_blueprints

    register_blueprints(app)

    return app
