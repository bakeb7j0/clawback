from flask import Flask

from app.config import Config
from app.middleware.auth import check_secret
from app.services.session_cache import SessionCache


def create_app(config=None):
    """Flask application factory."""
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config.from_object(Config)

    if config:
        app.config.update(config)

    app.before_request(check_secret)

    # Pre-parse curated sessions at startup
    cache = SessionCache()
    cache.load(
        sessions_dir=config.get("SESSIONS_DIR") if config else None,
        debug=app.config.get("DEBUG", False),
    )
    app.session_cache = cache

    from app.routes import register_blueprints

    register_blueprints(app)

    return app
