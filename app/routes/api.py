from flask import Blueprint, abort, current_app, jsonify

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.route("/sessions")
def list_sessions():
    """List available curated sessions."""
    sessions = current_app.session_cache.list_sessions()
    return jsonify({"sessions": sessions})


@api_bp.route("/sessions/<session_id>")
def get_session(session_id):
    """Return pre-parsed beats for a curated session."""
    data = current_app.session_cache.get_session(session_id)
    if data is None:
        abort(404)
    return jsonify(data)
