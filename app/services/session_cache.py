"""Pre-parsed session cache for curated sessions.

Parses all curated sessions at startup and stores the results in memory
so the API can serve them without re-parsing on every request.
"""

import json
import logging
from pathlib import Path

from app.services.session_parser import parse_session

logger = logging.getLogger(__name__)

_SESSIONS_DIR = Path(__file__).resolve().parent.parent.parent / "sessions" / "curated"


class SessionCache:
    """In-memory cache of pre-parsed curated sessions."""

    def __init__(self):
        self._manifest = []
        self._parsed = {}

    def load(self, sessions_dir=None):
        """Parse all curated sessions from disk into memory."""
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

        self._manifest = manifest

        for entry in manifest:
            session_id = entry.get("id")
            file_name = entry.get("file")
            if not session_id or not file_name:
                continue

            file_path = (sessions_dir / file_name).resolve()
            if not str(file_path).startswith(str(sessions_dir.resolve())):
                logger.warning("Session %s path escapes sessions dir, skipping", session_id)
                continue

            if not file_path.exists():
                logger.warning("Session file %s not found, skipping", file_path)
                continue

            result = parse_session(file_path.read_text())
            self._parsed[session_id] = {
                "title": entry.get("title", session_id),
                "beats": result["beats"],
                "errors": result["errors"],
            }

        logger.info("Pre-parsed %d curated sessions", len(self._parsed))

    def list_sessions(self):
        """Return the manifest entries."""
        return self._manifest

    def get_session(self, session_id):
        """Return pre-parsed session data, or None if not found."""
        return self._parsed.get(session_id)
