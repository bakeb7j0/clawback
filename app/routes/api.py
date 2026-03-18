from flask import Blueprint

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.route("/sessions")
def list_sessions():
    """List available curated sessions."""
    # Placeholder — will be implemented in issue #8
    return {"sessions": []}
