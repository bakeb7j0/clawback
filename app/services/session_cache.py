"""Pre-parsed session cache for curated sessions.

Parses all curated sessions at startup and stores the results in memory
so the API can serve them without re-parsing on every request.
"""

import json
import logging
import time
from pathlib import Path

from app.services.annotation_store import AnnotationStore
from app.services.session_parser import parse_session

logger = logging.getLogger(__name__)

_SESSIONS_DIR = Path(__file__).resolve().parent.parent.parent / "sessions" / "curated"


class SessionCache:
    """In-memory cache of pre-parsed curated sessions."""

    def __init__(self):
        self._manifest = []
        self._parsed = {}
        self._ephemeral = {}  # {session_id: {"data": {...}, "created_at": float}}

    def load(self, sessions_dir=None, debug=False):
        """Parse all curated sessions from disk into memory.

        When debug is False, sessions with "debug": true in the manifest
        are excluded from the listing and not parsed.
        """
        sessions_dir = Path(sessions_dir) if sessions_dir else _SESSIONS_DIR
        manifest_path = sessions_dir / "manifest.json"

        if not manifest_path.exists():
            logger.warning("No curated session manifest found at %s", manifest_path)
            return

        with open(manifest_path) as f:
            manifest = json.load(f)

        if not isinstance(manifest, list):
            logger.warning("Manifest is not a list, skipping")
            return

        if not debug:
            manifest = [e for e in manifest if not e.get("debug")]

        self._manifest = manifest
        annotation_store = AnnotationStore(sessions_dir)

        for entry in manifest:
            session_id = entry.get("id")
            file_name = entry.get("file")
            if not session_id or not file_name:
                continue

            file_path = (sessions_dir / file_name).resolve()
            sessions_resolved = sessions_dir.resolve()
            if file_path != sessions_resolved and sessions_resolved not in file_path.parents:
                logger.warning("Session %s path escapes sessions dir, skipping", session_id)
                continue

            if not file_path.exists():
                logger.warning("Session file %s not found, skipping", file_path)
                continue

            result = parse_session(file_path.read_text())
            annotations = annotation_store.load(session_id)
            self._parsed[session_id] = {
                "title": entry.get("title", session_id),
                "beats": result["beats"],
                "errors": result["errors"],
                "annotations": annotations,
            }

        logger.info("Pre-parsed %d curated sessions", len(self._parsed))

    def list_sessions(self):
        """Return the manifest entries."""
        return self._manifest

    def get_session(self, session_id):
        """Return pre-parsed session data, or None if not found."""
        data = self._parsed.get(session_id)
        if data is not None:
            return data
        ephemeral = self._ephemeral.get(session_id)
        if ephemeral is not None:
            return ephemeral["data"]
        return None

    def update_annotations(self, session_id, annotations):
        """Update cached annotations for a session without full reload."""
        if session_id not in self._parsed:
            return
        self._parsed[session_id]["annotations"] = annotations

    def add_session(self, session_id, entry, beats, annotations=None):
        """Add a newly uploaded session to the cache without restart."""
        self._manifest.append(entry)
        self._parsed[session_id] = {
            "title": entry.get("title", session_id),
            "beats": beats,
            "errors": 0,
            "annotations": annotations,
        }

    def add_ephemeral(self, session_id, entry, beats):
        """Add an ephemeral session (memory-only, not in manifest)."""
        self._ephemeral[session_id] = {
            "data": {
                "title": entry.get("title", session_id),
                "beats": beats,
                "errors": 0,
                "annotations": None,
            },
            "created_at": time.time(),
        }

    def sweep_ephemeral(self, ttl):
        """Remove ephemeral sessions older than ttl seconds."""
        now = time.time()
        expired = [
            sid for sid, rec in self._ephemeral.items()
            if now - rec["created_at"] > ttl
        ]
        for sid in expired:
            del self._ephemeral[sid]
