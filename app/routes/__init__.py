from app.routes.api import api_bp
from app.routes.health import health_bp
from app.routes.views import views_bp


def register_blueprints(app):
    """Register all Flask blueprints."""
    app.register_blueprint(health_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(views_bp)
