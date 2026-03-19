/**
 * Clawback — Unit tests for the JSONL parser.
 *
 * Run with: node tests/unit/js/test_parser.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const parser = require("../../../app/static/js/parser.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  \u2713 ${name}`);
    } catch (err) {
        failed++;
        console.log(`  \u2717 ${name}`);
        console.log(`    ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.join(__dirname, "fixtures", "test-session.jsonl");
const fixture = fs.readFileSync(FIXTURE_PATH, "utf-8");

// ---------------------------------------------------------------------------
// parseJsonlLines
// ---------------------------------------------------------------------------
console.log("\nparseJsonlLines");

test("parses valid JSONL lines", () => {
    const { messages, errors } = parser.parseJsonlLines(fixture);
    assert.ok(messages.length > 0, "should parse at least one message");
    assert.equal(errors, 0, "should have no parse errors");
});

test("counts malformed lines as errors", () => {
    const { messages, errors } = parser.parseJsonlLines(
        'valid: false\n{"type":"user","message":{"content":"hi"},"uuid":"a","timestamp":"2026-01-01T00:00:00Z"}\n{broken',
    );
    assert.equal(messages.length, 1);
    assert.equal(errors, 2);
});

test("handles empty input", () => {
    const { messages, errors } = parser.parseJsonlLines("");
    assert.equal(messages.length, 0);
    assert.equal(errors, 0);
});

test("handles whitespace-only input", () => {
    const { messages, errors } = parser.parseJsonlLines("  \n\n  \n");
    assert.equal(messages.length, 0);
    assert.equal(errors, 0);
});

// ---------------------------------------------------------------------------
// filterConversationMessages
// ---------------------------------------------------------------------------
console.log("\nfilterConversationMessages");

test("keeps only user and assistant messages", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const types = new Set(filtered.map((m) => m.type));
    assert.deepEqual(types, new Set(["user", "assistant"]));
});

test("discards progress, system, and file-history-snapshot", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    for (const msg of filtered) {
        assert.ok(
            !["progress", "system", "file-history-snapshot"].includes(msg.type),
            `unexpected type: ${msg.type}`,
        );
    }
});

// ---------------------------------------------------------------------------
// orderMessages
// ---------------------------------------------------------------------------
console.log("\norderMessages");

test("orders messages by parentUuid chain", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);

    // First message should be the user's initial message
    assert.equal(ordered[0].uuid, "u1");
    // Second should be the thinking block
    assert.equal(ordered[1].uuid, "a1");
    // Last should be the final assistant text
    assert.equal(ordered[ordered.length - 1].uuid, "a7");
});

test("handles empty input", () => {
    const ordered = parser.orderMessages([]);
    assert.equal(ordered.length, 0);
});

test("falls back to timestamp when chain is broken", () => {
    const messages = [
        {
            type: "user",
            message: { content: "second" },
            uuid: "b",
            timestamp: "2026-01-01T00:00:02Z",
        },
        {
            type: "user",
            message: { content: "first" },
            uuid: "a",
            timestamp: "2026-01-01T00:00:01Z",
        },
    ];
    const ordered = parser.orderMessages(messages);
    assert.equal(ordered[0].uuid, "a", "earlier timestamp should come first");
    assert.equal(ordered[1].uuid, "b");
});

// ---------------------------------------------------------------------------
// extractBeats
// ---------------------------------------------------------------------------
console.log("\nextractBeats");

test("extracts all beat types from fixture", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    const types = new Set(beats.map((b) => b.type));
    assert.ok(types.has("user_message"), "should have user_message");
    assert.ok(types.has("assistant_message"), "should have assistant_message");
    assert.ok(types.has("thinking"), "should have thinking");
    assert.ok(types.has("tool_call"), "should have tool_call");
    assert.ok(types.has("tool_result"), "should have tool_result");
});

test("assigns sequential IDs", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    for (let i = 0; i < beats.length; i++) {
        assert.equal(beats[i].id, i, `beat ${i} should have id ${i}`);
    }
});

test("categorizes direct vs inner_working correctly", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    for (const beat of beats) {
        if (["user_message", "assistant_message"].includes(beat.type)) {
            assert.equal(
                beat.category,
                "direct",
                `${beat.type} should be direct`,
            );
        } else {
            assert.equal(
                beat.category,
                "inner_working",
                `${beat.type} should be inner_working`,
            );
        }
    }
});

test("extracts tool_call metadata", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    const toolCall = beats.find((b) => b.type === "tool_call");
    assert.ok(toolCall, "should have at least one tool_call");
    assert.equal(toolCall.metadata.tool_name, "Read");
    assert.equal(toolCall.metadata.tool_use_id, "tool1");
    assert.equal(toolCall.metadata.tool_input.file_path, "/tmp/example.py");
});

test("extracts tool_result metadata", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    const toolResult = beats.find((b) => b.type === "tool_result");
    assert.ok(toolResult, "should have at least one tool_result");
    assert.equal(toolResult.metadata.tool_use_id, "tool1");
    assert.ok(
        toolResult.content.includes("def hello()"),
        "should contain file content",
    );
});

test("skips empty thinking blocks", () => {
    const input = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: "" }] },
        uuid: "x",
        timestamp: "2026-01-01T00:00:00Z",
    });
    const { messages } = parser.parseJsonlLines(input);
    const beats = parser.extractBeats(messages);
    assert.equal(beats.length, 0, "empty thinking should produce no beat");
});

test("skips empty text blocks", () => {
    const input = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "   " }] },
        uuid: "x",
        timestamp: "2026-01-01T00:00:00Z",
    });
    const { messages } = parser.parseJsonlLines(input);
    const beats = parser.extractBeats(messages);
    assert.equal(beats.length, 0, "whitespace-only text should produce no beat");
});

test("skips empty user messages", () => {
    const input = JSON.stringify({
        type: "user",
        message: { content: "" },
        uuid: "x",
        timestamp: "2026-01-01T00:00:00Z",
    });
    const { messages } = parser.parseJsonlLines(input);
    const beats = parser.extractBeats(messages);
    assert.equal(beats.length, 0, "empty user message should produce no beat");
});

test("formats tool input — shows command for Bash", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    const bashCall = beats.find(
        (b) => b.type === "tool_call" && b.metadata.tool_name === "Bash",
    );
    assert.ok(bashCall, "should have a Bash tool_call");
    assert.equal(
        bashCall.content,
        "python /tmp/example.py",
        "should show the command directly",
    );
});

test("formats tool input — shows file_path for Read", () => {
    const { messages } = parser.parseJsonlLines(fixture);
    const filtered = parser.filterConversationMessages(messages);
    const ordered = parser.orderMessages(filtered);
    const beats = parser.extractBeats(ordered);

    const readCall = beats.find(
        (b) => b.type === "tool_call" && b.metadata.tool_name === "Read",
    );
    assert.ok(readCall, "should have a Read tool_call");
    assert.equal(readCall.content, "/tmp/example.py");
});

// ---------------------------------------------------------------------------
// calculateDurations
// ---------------------------------------------------------------------------
console.log("\ncalculateDurations");

test("calculates duration based on word count at 100 WPM", () => {
    // 100 words at 100 WPM = 60 seconds (no max cap)
    const beats = [
        { content: new Array(100).fill("word").join(" "), duration: 0 },
    ];
    parser.calculateDurations(beats);
    assert.equal(beats[0].duration, 60.0);
});

test("clamps minimum duration to 1 second", () => {
    const beats = [{ content: "hi", duration: 0 }];
    parser.calculateDurations(beats);
    assert.equal(beats[0].duration, 1.0);
});

test("calculates proportional duration for mid-length content", () => {
    // 50 words at 100 WPM = 30 seconds
    const beats = [
        { content: new Array(50).fill("word").join(" "), duration: 0 },
    ];
    parser.calculateDurations(beats);
    assert.equal(beats[0].duration, 30.0);

    // 20 words at 100 WPM = 12 seconds
    const beats2 = [
        { content: new Array(20).fill("word").join(" "), duration: 0 },
    ];
    parser.calculateDurations(beats2);
    assert.equal(beats2[0].duration, 12.0);
});

test("no max duration cap for long content", () => {
    // 500 words at 100 WPM = 300 seconds
    const beats = [
        { content: new Array(500).fill("word").join(" "), duration: 0 },
    ];
    parser.calculateDurations(beats);
    assert.equal(beats[0].duration, 300.0);
});

test("handles empty content", () => {
    const beats = [{ content: "", duration: 0 }];
    parser.calculateDurations(beats);
    assert.equal(beats[0].duration, 1.0, "empty content should get min duration");
});

// ---------------------------------------------------------------------------
// assignGroupIds
// ---------------------------------------------------------------------------
console.log("\nassignGroupIds");

test("groups consecutive inner_working beats", () => {
    const beats = [
        { category: "direct", group_id: null },
        { category: "inner_working", group_id: null },
        { category: "inner_working", group_id: null },
        { category: "direct", group_id: null },
        { category: "inner_working", group_id: null },
    ];
    parser.assignGroupIds(beats);

    assert.equal(beats[0].group_id, null);
    assert.equal(beats[1].group_id, 1);
    assert.equal(beats[2].group_id, 1, "should share group with previous");
    assert.equal(beats[3].group_id, null);
    assert.equal(beats[4].group_id, 2, "new group after direct beat");
});

test("handles all-direct beats", () => {
    const beats = [
        { category: "direct", group_id: null },
        { category: "direct", group_id: null },
    ];
    parser.assignGroupIds(beats);
    assert.equal(beats[0].group_id, null);
    assert.equal(beats[1].group_id, null);
});

test("handles single inner_working beat", () => {
    const beats = [{ category: "inner_working", group_id: null }];
    parser.assignGroupIds(beats);
    assert.equal(beats[0].group_id, 1);
});

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------
console.log("\ncountWords");

test("counts words in normal text", () => {
    assert.equal(parser.countWords("hello world"), 2);
});

test("handles multiple spaces and newlines", () => {
    assert.equal(parser.countWords("  hello   world\n  foo  "), 3);
});

test("returns 0 for empty string", () => {
    assert.equal(parser.countWords(""), 0);
});

test("returns 0 for null/undefined", () => {
    assert.equal(parser.countWords(null), 0);
    assert.equal(parser.countWords(undefined), 0);
});

// ---------------------------------------------------------------------------
// parseSession (integration)
// ---------------------------------------------------------------------------
console.log("\nparseSession (full pipeline)");

test("parses fixture into correct beat count", () => {
    const { beats, errors } = parser.parseSession(fixture);
    assert.equal(errors, 0);
    // Expected: 2 user_message + 1 thinking + 3 assistant_message + 3 tool_call + 3 tool_result = 12
    assert.equal(beats.length, 12);
});

test("maintains correct beat order from fixture", () => {
    const { beats } = parser.parseSession(fixture);
    const sequence = beats.map((b) => b.type);
    assert.deepEqual(sequence, [
        "user_message",      // "Hello, can you check this file?"
        "thinking",          // "The user wants me to check a file..."
        "assistant_message", // "Let me take a look at that file."
        "tool_call",         // Read /tmp/example.py
        "tool_result",       // def hello()...
        "tool_call",         // Bash: python /tmp/example.py
        "tool_result",       // world
        "assistant_message", // "The file defines a hello() function..."
        "user_message",      // "Thanks! Can you also check the config?"
        "tool_call",         // Read /tmp/config.json
        "tool_result",       // {"key": "value"}
        "assistant_message", // "The config looks good..."
    ]);
});

test("all beats have valid durations", () => {
    const { beats } = parser.parseSession(fixture);
    for (const beat of beats) {
        assert.ok(beat.duration >= 1.0, `beat ${beat.id} duration ${beat.duration} < 1.0`);
    }
});

test("group IDs are assigned correctly across the fixture", () => {
    const { beats } = parser.parseSession(fixture);
    // thinking + text break + tool_call + tool_result + tool_call + tool_result = groups
    // Beat 1 (thinking): group 1
    // Beat 2 (assistant_message): no group
    // Beats 3-6 (tool_call, result, call, result): group 2
    // Beat 7 (assistant_message): no group
    // Beat 8 (user_message): no group
    // Beats 9-10 (tool_call, result): group 3
    // Beat 11 (assistant_message): no group
    assert.equal(beats[1].group_id, 1, "thinking should be group 1");
    assert.equal(beats[2].group_id, null, "assistant text should have no group");
    assert.equal(beats[3].group_id, 2, "first tool_call should be group 2");
    assert.equal(beats[4].group_id, 2, "first tool_result should be group 2");
    assert.equal(beats[5].group_id, 2, "second tool_call should be group 2");
    assert.equal(beats[6].group_id, 2, "second tool_result should be group 2");
    assert.equal(beats[9].group_id, 3, "third tool_call should be group 3");
    assert.equal(beats[10].group_id, 3, "third tool_result should be group 3");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
