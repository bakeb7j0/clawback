"""Unit tests for the annotation sidecar file service."""

import json

import pytest

from app.services.annotation_store import (
    CALLOUT_STYLES,
    COLOR_PALETTE,
    CONTENT_TYPES,
    AnnotationStore,
)


def _valid_annotation_data(session_id="test-session"):
    """Return a minimal valid annotation data dict."""
    return {
        "session_id": session_id,
        "sections": [
            {
                "id": "sec-1",
                "start_beat": 0,
                "end_beat": 10,
                "label": "Introduction",
                "color": "blue",
            }
        ],
        "callouts": [
            {
                "id": "cal-1",
                "after_beat": 5,
                "style": "note",
                "content": "This is an instructor note.",
            }
        ],
        "artifacts": [
            {
                "id": "art-1",
                "after_beat": 8,
                "title": "Example Document",
                "description": "A test artifact",
                "content_type": "markdown",
                "content": "# Hello\n\nWorld",
            }
        ],
    }


@pytest.fixture()
def store(tmp_path):
    """An AnnotationStore pointed at a temp directory."""
    return AnnotationStore(tmp_path)


@pytest.fixture()
def populated_store(tmp_path):
    """A store with a valid annotation file already on disk."""
    data = _valid_annotation_data()
    path = tmp_path / "test-session-annotations.json"
    path.write_text(json.dumps(data, indent=2))
    return AnnotationStore(tmp_path)


# --- load() tests ---


class TestLoad:
    def test_load_existing_file(self, populated_store):
        result = populated_store.load("test-session")
        assert result is not None
        assert result["session_id"] == "test-session"
        assert len(result["sections"]) == 1
        assert len(result["callouts"]) == 1
        assert len(result["artifacts"]) == 1

    def test_load_missing_file(self, store):
        result = store.load("nonexistent")
        assert result is None

    def test_load_malformed_json(self, tmp_path):
        path = tmp_path / "bad-session-annotations.json"
        path.write_text("not valid json {{{")
        store = AnnotationStore(tmp_path)
        result = store.load("bad-session")
        assert result is None

    def test_load_path_traversal(self, store):
        result = store.load("../../etc/passwd")
        assert result is None


# --- save() tests ---


class TestSave:
    def test_save_valid_data(self, store, tmp_path):
        data = _valid_annotation_data()
        store.save("test-session", data)
        path = tmp_path / "test-session-annotations.json"
        assert path.exists()
        saved = json.loads(path.read_text())
        assert saved["session_id"] == "test-session"

    def test_save_invalid_data_raises(self, store):
        with pytest.raises(ValueError, match="validation failed"):
            store.save("test-session", {"not": "valid"})

    def test_save_path_traversal_raises(self, store):
        data = _valid_annotation_data()
        with pytest.raises(ValueError, match="outside sessions directory"):
            store.save("../../etc/evil", data)

    def test_save_overwrites_existing(self, populated_store, tmp_path):
        data = _valid_annotation_data()
        data["callouts"].append(
            {"id": "cal-2", "after_beat": 10, "style": "warning", "content": "Watch out!"}
        )
        populated_store.save("test-session", data)
        reloaded = populated_store.load("test-session")
        assert len(reloaded["callouts"]) == 2

    def test_save_empty_arrays(self, store, tmp_path):
        data = {"session_id": "empty", "sections": [], "callouts": [], "artifacts": []}
        store.save("empty", data)
        reloaded = store.load("empty")
        assert reloaded["sections"] == []
        assert reloaded["callouts"] == []
        assert reloaded["artifacts"] == []


# --- validate() tests ---


class TestValidate:
    def test_valid_data_returns_no_errors(self, store):
        assert store.validate(_valid_annotation_data()) == []

    def test_not_a_dict(self, store):
        errors = store.validate([1, 2, 3])
        assert "must be a JSON object" in errors[0]

    def test_missing_session_id(self, store):
        data = _valid_annotation_data()
        del data["session_id"]
        errors = store.validate(data)
        assert any("session_id" in e for e in errors)

    def test_sections_not_a_list(self, store):
        data = _valid_annotation_data()
        data["sections"] = "not a list"
        errors = store.validate(data)
        assert any("'sections' must be an array" in e for e in errors)

    def test_section_missing_id(self, store):
        data = _valid_annotation_data()
        del data["sections"][0]["id"]
        errors = store.validate(data)
        assert any("missing required field 'id'" in e for e in errors)

    def test_section_empty_label(self, store):
        data = _valid_annotation_data()
        data["sections"][0]["label"] = ""
        errors = store.validate(data)
        assert any("empty 'label'" in e for e in errors)

    def test_section_invalid_color(self, store):
        data = _valid_annotation_data()
        data["sections"][0]["color"] = "neon-rainbow"
        errors = store.validate(data)
        assert any("invalid color" in e for e in errors)

    def test_section_negative_start_beat(self, store):
        data = _valid_annotation_data()
        data["sections"][0]["start_beat"] = -1
        errors = store.validate(data)
        assert any("non-negative integer" in e for e in errors)

    def test_section_start_greater_than_end(self, store):
        data = _valid_annotation_data()
        data["sections"][0]["start_beat"] = 20
        data["sections"][0]["end_beat"] = 5
        errors = store.validate(data)
        assert any("must be <=" in e for e in errors)

    def test_section_non_integer_beat(self, store):
        data = _valid_annotation_data()
        data["sections"][0]["start_beat"] = "five"
        errors = store.validate(data)
        assert any("non-negative integer" in e for e in errors)

    def test_callout_invalid_style(self, store):
        data = _valid_annotation_data()
        data["callouts"][0]["style"] = "danger"
        errors = store.validate(data)
        assert any("invalid style" in e for e in errors)

    def test_callout_empty_content(self, store):
        data = _valid_annotation_data()
        data["callouts"][0]["content"] = ""
        errors = store.validate(data)
        assert any("empty 'content'" in e for e in errors)

    def test_callout_missing_after_beat(self, store):
        data = _valid_annotation_data()
        del data["callouts"][0]["after_beat"]
        errors = store.validate(data)
        assert any("non-negative integer" in e for e in errors)

    def test_artifact_invalid_content_type(self, store):
        data = _valid_annotation_data()
        data["artifacts"][0]["content_type"] = "pdf"
        errors = store.validate(data)
        assert any("invalid content_type" in e for e in errors)

    def test_artifact_missing_title(self, store):
        data = _valid_annotation_data()
        data["artifacts"][0]["title"] = ""
        errors = store.validate(data)
        assert any("empty 'title'" in e for e in errors)

    def test_artifact_empty_content(self, store):
        data = _valid_annotation_data()
        data["artifacts"][0]["content"] = ""
        errors = store.validate(data)
        assert any("empty 'content'" in e for e in errors)

    def test_duplicate_ids_within_type(self, store):
        data = _valid_annotation_data()
        data["sections"].append(
            {
                "id": "sec-1",
                "start_beat": 20,
                "end_beat": 30,
                "label": "Duplicate",
                "color": "green",
            }
        )
        errors = store.validate(data)
        assert any("duplicate id" in e for e in errors)

    def test_same_id_across_types_is_ok(self, store):
        """IDs only need to be unique within their type, not globally."""
        data = _valid_annotation_data()
        data["sections"][0]["id"] = "shared-id"
        data["callouts"][0]["id"] = "shared-id"
        errors = store.validate(data)
        assert errors == []

    def test_all_valid_colors(self, store):
        """Every color in the palette is accepted."""
        for color in COLOR_PALETTE:
            data = _valid_annotation_data()
            data["sections"][0]["color"] = color
            assert store.validate(data) == [], f"Color {color!r} should be valid"

    def test_all_valid_callout_styles(self, store):
        """Every callout style is accepted."""
        for style in CALLOUT_STYLES:
            data = _valid_annotation_data()
            data["callouts"][0]["style"] = style
            assert store.validate(data) == [], f"Style {style!r} should be valid"

    def test_all_valid_content_types(self, store):
        """Every content type is accepted."""
        for ct in CONTENT_TYPES:
            data = _valid_annotation_data()
            data["artifacts"][0]["content_type"] = ct
            assert store.validate(data) == [], f"Content type {ct!r} should be valid"

    def test_missing_sections_key_defaults_to_empty(self, store):
        """Omitting 'sections' entirely is valid (defaults to empty)."""
        data = {"session_id": "test", "callouts": [], "artifacts": []}
        assert store.validate(data) == []

    def test_multiple_errors_reported(self, store):
        """Multiple validation errors are all reported, not just the first."""
        data = {
            "sections": [
                {"id": "sec-1", "start_beat": -1, "end_beat": "bad", "label": "", "color": "nope"}
            ],
            "callouts": [],
            "artifacts": [],
        }
        errors = store.validate(data)
        assert len(errors) >= 4  # session_id + label + color + beats
