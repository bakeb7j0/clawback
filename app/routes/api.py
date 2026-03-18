import json
import os

from flask import Blueprint, abort, jsonify

from app.services.session_parser import parse_session

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _sessions_dir():
    """Return the path to the curated sessions directory."""
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "sessions",
        "curated",
    )


@api_bp.route("/sessions")
def list_sessions():
    """List available curated sessions."""
    manifest_path = os.path.join(_sessions_dir(), "manifest.json")
    if not os.path.exists(manifest_path):
        return jsonify({"sessions": []})
    with open(manifest_path) as f:
        sessions = json.load(f)
    if not isinstance(sessions, list):
        return jsonify({"sessions": []})
    return jsonify({"sessions": sessions})


@api_bp.route("/sessions/<session_id>")
def get_session(session_id):
    """Return pre-parsed beats for a curated session."""
    sessions_dir = _sessions_dir()
    manifest_path = os.path.join(sessions_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        abort(404)

    with open(manifest_path) as f:
        sessions = json.load(f)
    if not isinstance(sessions, list):
        abort(404)

    session = next((s for s in sessions if s["id"] == session_id), None)
    if not session:
        abort(404)

    # Path safety: ensure resolved path stays within sessions directory
    file_path = os.path.realpath(os.path.join(sessions_dir, session["file"]))
    safe_prefix = os.path.realpath(sessions_dir) + os.sep
    if not file_path.startswith(safe_prefix):
        abort(404)

    if not os.path.exists(file_path):
        abort(404)

    with open(file_path) as f:
        jsonl_text = f.read()

    result = parse_session(jsonl_text)
    return jsonify(
        {
            "title": session["title"],
            "beats": result["beats"],
            "errors": result["errors"],
        }
    )
