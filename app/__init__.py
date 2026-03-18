from flask import Flask

from app.config import Config


def create_app(config=None):
    """Flask application factory."""
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config.from_object(Config)

    if config:
        app.config.update(config)

    from app.routes import register_blueprints

    register_blueprints(app)

    return app
