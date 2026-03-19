"""Server-side JSONL-to-beats parser, mirroring the client-side parser.js.

Transforms raw Claude Code session JSONL text into an ordered array
of beat dicts for the playback engine.

Pipeline: Raw JSONL -> parse lines -> filter conversation messages ->
          order by parentUuid chain -> extract beats -> calculate durations ->
          assign group IDs -> beat array
"""

import json
from datetime import datetime, timezone

BASE_WPM = 100
MIN_DURATION = 1.0
CONVERSATION_TYPES = {"user", "assistant"}


def parse_session(jsonl_text):
    """Parse raw JSONL text into an array of beats.

    Returns dict with 'beats' (list of beat dicts) and 'errors' (count of
    malformed lines).
    """
    messages, errors = _parse_jsonl_lines(jsonl_text)
    conversation = _filter_conversation_messages(messages)
    ordered = _order_messages(conversation)
    beats = _extract_beats(ordered)
    _calculate_durations(beats)
    _assign_group_ids(beats)
    return {"beats": beats, "errors": errors}


def _parse_jsonl_lines(text):
    messages = []
    errors = 0
    for line in text.split("\n"):
        trimmed = line.strip()
        if not trimmed:
            continue
        try:
            messages.append(json.loads(trimmed))
        except json.JSONDecodeError:
            errors += 1
    return messages, errors


def _filter_conversation_messages(messages):
    return [m for m in messages if m.get("type") in CONVERSATION_TYPES]


def _ts_key(msg):
    """Parse timestamp for sorting, mirroring JS new Date() behavior."""
    ts = msg.get("timestamp")
    if not ts:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)


def _order_messages(messages):
    if not messages:
        return []

    by_uuid = {}
    for msg in messages:
        uuid = msg.get("uuid")
        if uuid:
            by_uuid[uuid] = msg

    children_of = {}
    for msg in messages:
        parent = msg.get("parentUuid")
        if parent:
            children_of.setdefault(parent, []).append(msg)

    roots = [
        m
        for m in messages
        if not m.get("parentUuid") or m.get("parentUuid") not in by_uuid
    ]

    if not roots:
        return sorted(messages, key=_ts_key)

    roots.sort(key=_ts_key)

    ordered = []
    visited = set()

    def walk(msg):
        uuid = msg.get("uuid")
        if not uuid or uuid in visited:
            return
        visited.add(uuid)
        ordered.append(msg)
        children = children_of.get(uuid, [])
        children.sort(key=_ts_key)
        for child in children:
            walk(child)

    for root in roots:
        walk(root)

    if len(ordered) < len(messages):
        remaining = [
            m for m in messages if not m.get("uuid") or m.get("uuid") not in visited
        ]
        remaining.sort(key=_ts_key)
        ordered.extend(remaining)

    return ordered


def _extract_beats(ordered_messages):
    beats = []
    beat_id = 0

    for msg in ordered_messages:
        timestamp = msg.get("timestamp")

        if msg["type"] == "user":
            content = (msg.get("message") or {}).get("content")

            if isinstance(content, str) and content.strip():
                beats.append(
                    {
                        "id": beat_id,
                        "type": "user_message",
                        "category": "direct",
                        "content": content,
                        "metadata": {"timestamp": timestamp},
                        "duration": 0,
                        "group_id": None,
                    }
                )
                beat_id += 1
            elif isinstance(content, list):
                for block in content:
                    if block.get("type") == "tool_result":
                        result_content = _extract_tool_result_content(block)
                        beats.append(
                            {
                                "id": beat_id,
                                "type": "tool_result",
                                "category": "inner_working",
                                "content": result_content,
                                "metadata": {
                                    "tool_use_id": block.get("tool_use_id"),
                                    "is_error": block.get("is_error", False),
                                    "timestamp": timestamp,
                                },
                                "duration": 0,
                                "group_id": None,
                            }
                        )
                        beat_id += 1
                    elif (
                        block.get("type") == "text"
                        and isinstance(block.get("text"), str)
                        and block["text"].strip()
                    ):
                        beats.append(
                            {
                                "id": beat_id,
                                "type": "user_message",
                                "category": "direct",
                                "content": block["text"],
                                "metadata": {"timestamp": timestamp},
                                "duration": 0,
                                "group_id": None,
                            }
                        )
                        beat_id += 1

        elif msg["type"] == "assistant":
            content = (msg.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue

            for block in content:
                block_type = block.get("type")

                if block_type == "text" and isinstance(block.get("text"), str):
                    if not block["text"].strip():
                        continue
                    beats.append(
                        {
                            "id": beat_id,
                            "type": "assistant_message",
                            "category": "direct",
                            "content": block["text"],
                            "metadata": {
                                "model": (msg.get("message") or {}).get("model"),
                                "timestamp": timestamp,
                            },
                            "duration": 0,
                            "group_id": None,
                        }
                    )
                    beat_id += 1

                elif block_type == "thinking":
                    thinking = block.get("thinking", "")
                    if not thinking.strip():
                        continue
                    beats.append(
                        {
                            "id": beat_id,
                            "type": "thinking",
                            "category": "inner_working",
                            "content": thinking,
                            "metadata": {"timestamp": timestamp},
                            "duration": 0,
                            "group_id": None,
                        }
                    )
                    beat_id += 1

                elif block_type == "tool_use":
                    beats.append(
                        {
                            "id": beat_id,
                            "type": "tool_call",
                            "category": "inner_working",
                            "content": _format_tool_input(block.get("input")),
                            "metadata": {
                                "tool_name": block.get("name", "Unknown"),
                                "tool_input": block.get("input", {}),
                                "tool_use_id": block.get("id"),
                                "timestamp": timestamp,
                            },
                            "duration": 0,
                            "group_id": None,
                        }
                    )
                    beat_id += 1

    return beats


def _extract_tool_result_content(block):
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, str):
                parts.append(b)
            elif isinstance(b, dict) and b.get("type") == "text":
                parts.append(b.get("text", ""))
        return "\n".join(p for p in parts if p)
    return ""


def _format_tool_input(input_val):
    if not input_val:
        return ""
    if isinstance(input_val, str):
        return input_val
    if isinstance(input_val, dict):
        if "command" in input_val:
            return input_val["command"]
        if "file_path" in input_val:
            return input_val["file_path"]
        if "pattern" in input_val:
            return input_val["pattern"]
        return json.dumps(input_val, indent=2)
    return ""


def _count_words(text):
    if not text:
        return 0
    return len(text.split())


def _calculate_durations(beats):
    for beat in beats:
        words = _count_words(beat["content"])
        raw_seconds = (words / BASE_WPM) * 60
        beat["duration"] = max(MIN_DURATION, raw_seconds)


def _assign_group_ids(beats):
    group_id = 0
    in_group = False
    for beat in beats:
        if beat["category"] == "inner_working":
            if not in_group:
                group_id += 1
                in_group = True
            beat["group_id"] = group_id
        else:
            in_group = False
