import json
import os
from pathlib import Path

from flask import Blueprint, abort, jsonify

from app.services.session_parser import parse_session

api_bp = Blueprint("api", __name__, url_prefix="/api")

_SESSIONS_DIR = Path(__file__).resolve().parent.parent.parent / "sessions" / "curated"


def _load_manifest():
    """Load and validate the curated sessions manifest.

    Returns the session list, or None if the manifest is missing or invalid.
    """
    manifest_path = _SESSIONS_DIR / "manifest.json"
    if not manifest_path.exists():
        return None
    with open(manifest_path) as f:
        sessions = json.load(f)
    if not isinstance(sessions, list):
        return None
    return sessions


@api_bp.route("/sessions")
def list_sessions():
    """List available curated sessions."""
    sessions = _load_manifest()
    return jsonify({"sessions": sessions or []})


@api_bp.route("/sessions/<session_id>")
def get_session(session_id):
    """Return pre-parsed beats for a curated session."""
    sessions = _load_manifest()
    if sessions is None:
        abort(404)

    session = next((s for s in sessions if s["id"] == session_id), None)
    if not session:
        abort(404)

    # Path safety: ensure resolved path stays within sessions directory
    file_path = (_SESSIONS_DIR / session["file"]).resolve()
    if not str(file_path).startswith(str(_SESSIONS_DIR.resolve()) + os.sep):
        abort(404)

    if not file_path.exists():
        abort(404)

    jsonl_text = file_path.read_text()

    result = parse_session(jsonl_text)
    return jsonify(
        {
            "title": session["title"],
            "beats": result["beats"],
            "errors": result["errors"],
        }
    )
