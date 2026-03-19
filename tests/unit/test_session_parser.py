"""Unit tests for server-side session parser."""

import os

from app.services.session_parser import parse_session

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "js", "fixtures", "test-session.jsonl"
)


def _load_fixture():
    with open(FIXTURE_PATH) as f:
        return f.read()


def test_parse_session_returns_beats_and_errors():
    result = parse_session(_load_fixture())
    assert "beats" in result
    assert "errors" in result
    assert isinstance(result["beats"], list)
    assert isinstance(result["errors"], int)


def test_parse_session_correct_beat_count():
    """Fixture produces 12 beats: 2 user, 3 assistant, 1 thinking, 3 tool_call, 3 tool_result."""
    result = parse_session(_load_fixture())
    assert len(result["beats"]) == 12


def test_parse_session_no_errors_on_valid_input():
    result = parse_session(_load_fixture())
    assert result["errors"] == 0


def test_beat_structure():
    """Each beat has all required fields."""
    result = parse_session(_load_fixture())
    beat = result["beats"][0]
    assert "id" in beat
    assert "type" in beat
    assert "category" in beat
    assert "content" in beat
    assert "metadata" in beat
    assert "duration" in beat
    assert "group_id" in beat


def test_beat_types():
    """All expected beat types are present."""
    result = parse_session(_load_fixture())
    types = {b["type"] for b in result["beats"]}
    assert "user_message" in types
    assert "assistant_message" in types
    assert "thinking" in types
    assert "tool_call" in types
    assert "tool_result" in types


def test_beat_categories():
    """Direct and inner_working categories are correctly assigned."""
    result = parse_session(_load_fixture())
    for beat in result["beats"]:
        if beat["type"] in ("user_message", "assistant_message"):
            assert beat["category"] == "direct"
        else:
            assert beat["category"] == "inner_working"


def test_durations_have_minimum():
    """All durations are at least MIN_DURATION."""
    result = parse_session(_load_fixture())
    for beat in result["beats"]:
        assert beat["duration"] >= 1.0


def test_group_ids_assigned_to_inner_workings():
    """Inner working beats get group_id; direct beats get None."""
    result = parse_session(_load_fixture())
    for beat in result["beats"]:
        if beat["category"] == "inner_working":
            assert beat["group_id"] is not None
        else:
            assert beat["group_id"] is None


def test_consecutive_inner_workings_share_group_id():
    """Consecutive inner working beats share the same group_id."""
    result = parse_session(_load_fixture())
    beats = result["beats"]
    # Find first group of consecutive inner_working beats
    groups = {}
    for beat in beats:
        if beat["group_id"] is not None:
            groups.setdefault(beat["group_id"], []).append(beat)
    # At least one group should exist with multiple items
    multi = [g for g in groups.values() if len(g) > 1]
    assert len(multi) > 0, "Expected at least one multi-item inner workings group"


def test_empty_input():
    result = parse_session("")
    assert result["beats"] == []
    assert result["errors"] == 0


def test_malformed_jsonl():
    result = parse_session("not json\nalso not json\n")
    assert result["beats"] == []
    assert result["errors"] == 2


def test_filters_non_conversation_messages():
    """System and progress messages are filtered out."""
    result = parse_session(_load_fixture())
    for beat in result["beats"]:
        assert beat["type"] not in ("system", "progress", "file-history-snapshot")


def test_tool_call_content_shows_relevant_field():
    """Tool call content shows command/file_path, not full JSON."""
    result = parse_session(_load_fixture())
    tool_calls = [b for b in result["beats"] if b["type"] == "tool_call"]
    assert len(tool_calls) >= 2
    # First tool_call is Read with file_path
    assert "/tmp/example.py" in tool_calls[0]["content"]
    # Second is Bash with command
    assert "python" in tool_calls[1]["content"]


def test_tool_call_metadata_includes_tool_name():
    """Tool call metadata includes the tool name."""
    result = parse_session(_load_fixture())
    tool_calls = [b for b in result["beats"] if b["type"] == "tool_call"]
    assert tool_calls[0]["metadata"]["tool_name"] == "Read"
    assert tool_calls[1]["metadata"]["tool_name"] == "Bash"
