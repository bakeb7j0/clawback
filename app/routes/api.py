import json
import re
import tempfile

from flask import Blueprint, abort, current_app, jsonify, request

from app.services.session_parser import parse_session

api_bp = Blueprint("api", __name__, url_prefix="/api")

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@api_bp.route("/config")
def get_config():
    """Return client-visible configuration flags."""
    return jsonify({"readOnly": current_app.config["CLAWBACK_READ_ONLY"]})


@api_bp.route("/sessions")
def list_sessions():
    """List available curated sessions."""
    sessions = current_app.session_cache.list_sessions()
    return jsonify({"sessions": sessions})


# Static upload route MUST be registered before the dynamic <session_id> route,
# otherwise Flask matches "upload" as a session_id and returns 405.
@api_bp.route("/sessions/upload", methods=["POST"])
def upload_session():
    """Upload a new session JSONL with metadata."""
    ephemeral = request.form.get("ephemeral", "").lower() in ("1", "true", "yes")
    if current_app.config["CLAWBACK_READ_ONLY"] and not ephemeral:
        return jsonify({"status": "error", "message": "Read-only mode"}), 403
    file = request.files.get("file")
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    tags_raw = request.form.get("tags", "").strip()

    if not file:
        return jsonify({"status": "error", "message": "No file provided"}), 400
    if not title:
        return jsonify({"status": "error", "message": "Title is required"}), 400

    # Read with size limit to prevent DoS
    content_bytes = file.read(MAX_UPLOAD_BYTES + 1)
    if len(content_bytes) > MAX_UPLOAD_BYTES:
        return jsonify({"status": "error", "message": "File too large"}), 413

    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return jsonify({"status": "error", "message": "File must be UTF-8 text"}), 400

    if not content.strip():
        return jsonify({"status": "error", "message": "File is empty"}), 400

    # Parse to validate and get beat count
    result = parse_session(content)
    if not result["beats"]:
        return jsonify({"status": "error", "message": "No parseable beats in file"}), 400

    # Generate ID and filename from title
    session_id = _slugify(title)
    if not session_id:
        return jsonify({"status": "error", "message": "Title produces an invalid ID"}), 400
    filename = f"{session_id}.jsonl"

    # Check for duplicate ID in cache
    if current_app.session_cache.get_session(session_id) is not None:
        return (
            jsonify({"status": "error", "message": f"Session '{session_id}' already exists"}),
            400,
        )

    # Parse optional annotations
    annotations = None
    annotations_raw = request.form.get("annotations", "").strip()
    if annotations_raw:
        try:
            annotations = json.loads(annotations_raw)
        except (json.JSONDecodeError, ValueError):
            return jsonify({"status": "error", "message": "Invalid annotations JSON"}), 400
        validate_store = (
            current_app.ephemeral_annotation_store if ephemeral
            else current_app.annotation_store
        )
        errors = validate_store.validate(annotations)
        if errors:
            return jsonify({"status": "error", "errors": errors}), 400

    # Build manifest entry
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
    entry = {
        "id": session_id,
        "title": title,
        "description": description,
        "file": filename,
        "beat_count": len(result["beats"]),
        "tags": tags,
    }

    if ephemeral:
        # Write to ephemeral dir on disk, not curated
        eph_dir = current_app.ephemeral_dir
        eph_path = (eph_dir / filename).resolve()
        if not _is_path_within(eph_path, eph_dir):
            return jsonify({"status": "error", "message": "Invalid title"}), 400
        with open(eph_path, "w") as f:
            f.write(content)
        if annotations:
            current_app.ephemeral_annotation_store.save(session_id, annotations)
        cache = current_app.session_cache
        cache.sweep_ephemeral(current_app.config["CLAWBACK_EPHEMERAL_TTL"])
        cache.add_ephemeral(session_id, entry, result["beats"], annotations=annotations)
        return jsonify({"status": "ok", "session": entry}), 201

    # --- Curated path: write to disk and update manifest ---

    # Write JSONL file to sessions directory
    sessions_dir = current_app.sessions_dir
    file_path = (sessions_dir / filename).resolve()
    if not _is_path_within(file_path, sessions_dir):
        return jsonify({"status": "error", "message": "Invalid title"}), 400

    # Exclusive create to prevent TOCTOU race
    try:
        with open(file_path, "x") as f:
            f.write(content)
    except FileExistsError:
        return (
            jsonify({"status": "error", "message": f"Session '{session_id}' already exists"}),
            400,
        )

    # Update manifest on disk (atomic write via temp file + rename)
    manifest_path = sessions_dir / "manifest.json"
    manifest = []
    if manifest_path.exists():
        try:
            with open(manifest_path) as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, OSError):
            manifest = []

    manifest.append(entry)

    # Write to temp file then rename for atomicity
    fd, tmp_name = tempfile.mkstemp(
        dir=str(sessions_dir), suffix=".json"
    )
    try:
        with open(fd, "w") as f:
            json.dump(manifest, f, indent=4)
            f.write("\n")
        import os

        os.replace(tmp_name, str(manifest_path))
    except Exception:
        import os

        os.unlink(tmp_name)
        raise

    # Save annotations sidecar if provided
    if annotations:
        current_app.annotation_store.save(session_id, annotations)

    # Add to in-memory cache
    current_app.session_cache.add_session(
        session_id, entry, result["beats"], annotations=annotations,
    )

    return jsonify({"status": "ok", "session": entry}), 201


@api_bp.route("/sessions/<session_id>")
def get_session(session_id):
    """Return pre-parsed beats for a curated session."""
    data = current_app.session_cache.get_session(session_id)
    if data is None:
        abort(404)
    return jsonify(data)


@api_bp.route("/sessions/<session_id>", methods=["DELETE"])
def delete_session(session_id):
    """Delete a session — removes cache, manifest entry, and disk files.

    Handles both curated and ephemeral sessions.
    """
    if current_app.config["CLAWBACK_READ_ONLY"]:
        return jsonify({"status": "error", "message": "Read-only mode"}), 403

    cache = current_app.session_cache
    if cache.get_session(session_id) is None:
        return jsonify({"status": "error", "message": "Session not found"}), 404

    # Check if ephemeral before removing from cache (lookup disappears after delete)
    is_ephemeral = session_id in cache._ephemeral

    # Remove from in-memory cache and manifest
    cache.delete_session(session_id)

    if is_ephemeral:
        # Ephemeral: remove from ephemeral dir
        eph_dir = current_app.ephemeral_dir
        eph_path = (eph_dir / f"{session_id}.jsonl").resolve()
        if _is_path_within(eph_path, eph_dir) and eph_path.exists():
            eph_path.unlink()
        current_app.ephemeral_annotation_store.delete(session_id)
    else:
        # Curated: remove JSONL, annotations sidecar, and rewrite manifest
        sessions_dir = current_app.sessions_dir
        file_path = (sessions_dir / f"{session_id}.jsonl").resolve()
        if _is_path_within(file_path, sessions_dir) and file_path.exists():
            file_path.unlink()

        current_app.annotation_store.delete(session_id)

        # Rewrite manifest atomically
        manifest_path = sessions_dir / "manifest.json"
        if manifest_path.exists():
            try:
                with open(manifest_path) as f:
                    manifest = json.load(f)
            except (json.JSONDecodeError, OSError):
                manifest = []

            manifest = [e for e in manifest if e.get("id") != session_id]

            fd, tmp_name = tempfile.mkstemp(dir=str(sessions_dir), suffix=".json")
            try:
                import os

                with open(fd, "w") as f:
                    json.dump(manifest, f, indent=4)
                    f.write("\n")
                os.replace(tmp_name, str(manifest_path))
            except Exception:
                import os

                os.unlink(tmp_name)
                raise

    return jsonify({"status": "ok"})


@api_bp.route("/sessions/<session_id>/annotations", methods=["PUT"])
def save_annotations(session_id):
    """Validate and save annotations for a curated session."""
    if current_app.config["CLAWBACK_READ_ONLY"]:
        return jsonify({"status": "error", "message": "Read-only mode"}), 403
    cache = current_app.session_cache
    if cache.get_session(session_id) is None:
        return jsonify({"status": "error", "message": "Session not found"}), 404

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"status": "error", "message": "Invalid JSON body"}), 400

    store = current_app.annotation_store
    errors = store.validate(data)
    if errors:
        return jsonify({"status": "error", "errors": errors}), 400

    try:
        store.save(session_id, data)
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    cache.update_annotations(session_id, data)
    return jsonify({"status": "ok"})


def _slugify(text):
    """Convert text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def _is_path_within(path, directory):
    """Check that a resolved path is within the given directory."""
    resolved = path.resolve()
    parent = directory.resolve()
    return resolved == parent or parent in resolved.parents
