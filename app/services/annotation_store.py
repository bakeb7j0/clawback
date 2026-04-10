"""Annotation sidecar file read/write/validate service.

Manages <session-id>-annotations.json files alongside session JSONL files.
Each annotation file contains sections, callouts, and artifacts that reference
beats by their stable sequential ID.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

COLOR_PALETTE = {
    "blue": "#4A90D9",
    "purple": "#7B61FF",
    "green": "#2ECC71",
    "orange": "#E67E22",
    "red": "#E74C3C",
    "teal": "#1ABC9C",
    "pink": "#E84393",
    "amber": "#F39C12",
    "indigo": "#5C6BC0",
    "slate": "#95A5A6",
}

CALLOUT_STYLES = {"note", "warning"}
CONTENT_TYPES = {"markdown", "code"}


class AnnotationStore:
    """Reads and writes annotation sidecar files."""

    def __init__(self, sessions_dir):
        self.sessions_dir = Path(sessions_dir).resolve()

    def _annotation_path(self, session_id):
        """Build the annotation file path and verify it doesn't escape the sessions dir."""
        path = (self.sessions_dir / f"{session_id}-annotations.json").resolve()
        if path.resolve() != self.sessions_dir and self.sessions_dir not in path.resolve().parents:
            raise ValueError(f"Session ID {session_id!r} resolves outside sessions directory")
        return path

    def load(self, session_id):
        """Load annotations for a session, or None if no sidecar file exists."""
        try:
            path = self._annotation_path(session_id)
        except ValueError:
            logger.warning("Invalid session ID %r for annotation loading", session_id)
            return None

        if not path.exists():
            return None

        try:
            with open(path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load annotations for %s: %s", session_id, e)
            return None

    def save(self, session_id, data):
        """Validate and write annotation data to the sidecar file.

        Raises ValueError if validation fails.
        """
        errors = self.validate(data)
        if errors:
            raise ValueError(f"Annotation validation failed: {errors}")

        path = self._annotation_path(session_id)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")

        logger.info("Saved annotations for session %s", session_id)

    def delete(self, session_id):
        """Remove the annotation sidecar file if it exists."""
        try:
            path = self._annotation_path(session_id)
        except ValueError:
            return
        path.unlink(missing_ok=True)

    def validate(self, data):
        """Return a list of validation errors (empty if valid)."""
        errors = []

        if not isinstance(data, dict):
            return ["Annotation data must be a JSON object"]

        if "session_id" not in data:
            errors.append("Missing required field: session_id")

        errors.extend(self._validate_sections(data.get("sections", [])))
        errors.extend(self._validate_callouts(data.get("callouts", [])))
        errors.extend(self._validate_artifacts(data.get("artifacts", [])))
        errors.extend(self._validate_unique_ids(data))

        return errors

    def _validate_sections(self, sections):
        """Validate the sections array."""
        errors = []
        if not isinstance(sections, list):
            return ["'sections' must be an array"]

        for i, sec in enumerate(sections):
            prefix = f"sections[{i}]"
            if not isinstance(sec, dict):
                errors.append(f"{prefix}: must be an object")
                continue

            if "id" not in sec:
                errors.append(f"{prefix}: missing required field 'id'")
            if "label" not in sec or not sec.get("label"):
                errors.append(f"{prefix}: missing or empty 'label'")

            color = sec.get("color")
            if color not in COLOR_PALETTE:
                valid = sorted(COLOR_PALETTE)
                errors.append(f"{prefix}: invalid color {color!r}, must be one of {valid}")

            start = sec.get("start_beat")
            end = sec.get("end_beat")
            if not isinstance(start, int) or start < 0:
                errors.append(f"{prefix}: 'start_beat' must be a non-negative integer")
            if not isinstance(end, int) or end < 0:
                errors.append(f"{prefix}: 'end_beat' must be a non-negative integer")
            if isinstance(start, int) and isinstance(end, int) and start > end:
                errors.append(f"{prefix}: 'start_beat' ({start}) must be <= 'end_beat' ({end})")

        return errors

    def _validate_callouts(self, callouts):
        """Validate the callouts array."""
        errors = []
        if not isinstance(callouts, list):
            return ["'callouts' must be an array"]

        for i, cal in enumerate(callouts):
            prefix = f"callouts[{i}]"
            if not isinstance(cal, dict):
                errors.append(f"{prefix}: must be an object")
                continue

            if "id" not in cal:
                errors.append(f"{prefix}: missing required field 'id'")

            after_beat = cal.get("after_beat")
            if not isinstance(after_beat, int) or after_beat < 0:
                errors.append(f"{prefix}: 'after_beat' must be a non-negative integer")

            style = cal.get("style")
            if style not in CALLOUT_STYLES:
                valid = sorted(CALLOUT_STYLES)
                errors.append(f"{prefix}: invalid style {style!r}, must be one of {valid}")

            if not cal.get("content"):
                errors.append(f"{prefix}: missing or empty 'content'")

        return errors

    def _validate_artifacts(self, artifacts):
        """Validate the artifacts array."""
        errors = []
        if not isinstance(artifacts, list):
            return ["'artifacts' must be an array"]

        for i, art in enumerate(artifacts):
            prefix = f"artifacts[{i}]"
            if not isinstance(art, dict):
                errors.append(f"{prefix}: must be an object")
                continue

            if "id" not in art:
                errors.append(f"{prefix}: missing required field 'id'")

            after_beat = art.get("after_beat")
            if not isinstance(after_beat, int) or after_beat < 0:
                errors.append(f"{prefix}: 'after_beat' must be a non-negative integer")

            if not art.get("title"):
                errors.append(f"{prefix}: missing or empty 'title'")

            content_type = art.get("content_type")
            if content_type not in CONTENT_TYPES:
                valid = sorted(CONTENT_TYPES)
                errors.append(
                    f"{prefix}: invalid content_type {content_type!r}, must be one of {valid}"
                )

            if not art.get("content"):
                errors.append(f"{prefix}: missing or empty 'content'")

        return errors

    def _validate_unique_ids(self, data):
        """Validate that all annotation IDs are unique within their type."""
        errors = []
        for key in ("sections", "callouts", "artifacts"):
            items = data.get(key, [])
            if not isinstance(items, list):
                continue
            seen = set()
            for i, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                aid = item.get("id")
                if aid is not None and aid in seen:
                    errors.append(f"{key}[{i}]: duplicate id {aid!r}")
                if aid is not None:
                    seen.add(aid)
        return errors
