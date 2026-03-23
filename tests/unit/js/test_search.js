/**
 * Clawback — Unit tests for the search engine module.
 *
 * Run with: node tests/unit/js/test_search.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");
const { ClawbackSearch } = require("../../../app/static/js/search.js");

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

function makeBeat(id, type, content, opts) {
    return Object.assign({
        id: id,
        type: type,
        content: content,
        category: type === "user_message" || type === "assistant_message" ? "direct" : "inner_working",
        group_id: null,
    }, opts || {});
}

function makeBeats() {
    return [
        makeBeat(0, "user_message", "How do I configure Docker networking?"),
        makeBeat(1, "assistant_message", "Docker networking uses bridge networks by default."),
        makeBeat(2, "thinking", "The user wants to know about Docker network configuration."),
        makeBeat(3, "tool_call", "docker network ls\n--format json"),
        makeBeat(4, "tool_result", "bridge   host   none"),
        makeBeat(5, "user_message", "What about custom bridge networks?"),
        makeBeat(6, "assistant_message", "You can create custom networks with docker network create."),
    ];
}

// ---------------------------------------------------------------------------
// search() tests
// ---------------------------------------------------------------------------

console.log("\nsearch()");

test("returns matching beats for a query", function () {
    var beats = makeBeats();
    var results = ClawbackSearch.search(beats, "Docker");
    assert.ok(results.length >= 2, "should match multiple beats mentioning Docker");
});

test("is case-insensitive", function () {
    var beats = makeBeats();
    var lower = ClawbackSearch.search(beats, "docker");
    var upper = ClawbackSearch.search(beats, "DOCKER");
    assert.equal(lower.length, upper.length, "case should not matter");
    assert.ok(lower.length > 0);
});

test("returns empty array when no matches", function () {
    var beats = makeBeats();
    var results = ClawbackSearch.search(beats, "kubernetes");
    assert.equal(results.length, 0);
});

test("returns empty array for empty query", function () {
    var beats = makeBeats();
    assert.equal(ClawbackSearch.search(beats, "").length, 0);
    assert.equal(ClawbackSearch.search(beats, "   ").length, 0);
});

test("returns empty array for null/undefined inputs", function () {
    assert.equal(ClawbackSearch.search(null, "test").length, 0);
    assert.equal(ClawbackSearch.search([], null).length, 0);
    assert.equal(ClawbackSearch.search(undefined, "test").length, 0);
});

test("searches all beat types", function () {
    var beats = makeBeats();
    // "bridge" appears in assistant (beat 1), tool_result (beat 4), assistant (beat 5 mentions "custom bridge")
    var results = ClawbackSearch.search(beats, "bridge");
    var types = results.map(function (r) { return r.type; });
    assert.ok(types.indexOf("assistant_message") !== -1, "should find in assistant_message");
    assert.ok(types.indexOf("tool_result") !== -1, "should find in tool_result");
});

test("searches thinking beats", function () {
    var beats = makeBeats();
    var results = ClawbackSearch.search(beats, "wants to know");
    assert.equal(results.length, 1);
    assert.equal(results[0].type, "thinking");
});

test("searches tool_call beats", function () {
    var beats = makeBeats();
    var results = ClawbackSearch.search(beats, "network ls");
    assert.equal(results.length, 1);
    assert.equal(results[0].type, "tool_call");
});

test("results are in beat order", function () {
    var beats = makeBeats();
    var results = ClawbackSearch.search(beats, "network");
    for (var i = 1; i < results.length; i++) {
        assert.ok(results[i].beatIndex > results[i - 1].beatIndex,
            "results must be in ascending beat order");
    }
});

test("result objects have correct shape", function () {
    var beats = makeBeats();
    var results = ClawbackSearch.search(beats, "Docker");
    var r = results[0];
    assert.equal(typeof r.beatIndex, "number");
    assert.ok(r.beatId !== undefined);
    assert.equal(typeof r.type, "string");
    assert.equal(typeof r.category, "string");
    assert.equal(typeof r.content, "string");
});

test("includes callout pseudo-beats", function () {
    var beats = [
        makeBeat(0, "user_message", "hello"),
        { id: "callout-1", isCallout: true, content: "Important note about testing", category: "callout", group_id: null },
    ];
    var results = ClawbackSearch.search(beats, "testing");
    assert.equal(results.length, 1);
    assert.equal(results[0].type, "callout");
    assert.equal(results[0].beatId, "callout-1");
});

test("includes artifact pseudo-beats and searches title/description/content", function () {
    var beats = [
        makeBeat(0, "user_message", "show me code"),
        {
            id: "artifact-1", isArtifact: true, content: "",
            artifactTitle: "Dockerfile Example",
            artifactDescription: "A multi-stage build",
            artifactContent: "FROM node:18\nRUN npm install",
            category: "artifact", group_id: null,
        },
    ];
    // Search by title
    var r1 = ClawbackSearch.search(beats, "Dockerfile");
    assert.equal(r1.length, 1);
    assert.equal(r1[0].type, "artifact");

    // Search by description
    var r2 = ClawbackSearch.search(beats, "multi-stage");
    assert.equal(r2.length, 1);

    // Search by content
    var r3 = ClawbackSearch.search(beats, "npm install");
    assert.equal(r3.length, 1);
});

test("preserves groupId for inner working beats", function () {
    var beats = [
        makeBeat(0, "thinking", "analyzing the problem", { group_id: 3 }),
    ];
    var results = ClawbackSearch.search(beats, "analyzing");
    assert.equal(results[0].groupId, 3);
});

test("groupId is null for direct beats", function () {
    var beats = [makeBeat(0, "user_message", "hello world")];
    var results = ClawbackSearch.search(beats, "hello");
    assert.equal(results[0].groupId, null);
});

// ---------------------------------------------------------------------------
// snippet() tests
// ---------------------------------------------------------------------------

console.log("\nsnippet()");

test("extracts snippet centered on match", function () {
    var content = "The quick brown fox jumps over the lazy dog and runs away fast";
    var s = ClawbackSearch.snippet(content, "jumps");
    assert.ok(s !== null);
    assert.equal(s.match, "jumps");
    assert.ok(s.before.length > 0);
    assert.ok(s.after.length > 0);
});

test("handles match at start of content", function () {
    var s = ClawbackSearch.snippet("Docker is great for containers", "Docker");
    assert.equal(s.match, "Docker");
    assert.equal(s.before, "");
    assert.ok(s.after.length > 0);
});

test("handles match at end of content", function () {
    var s = ClawbackSearch.snippet("I love using Docker", "Docker");
    assert.equal(s.match, "Docker");
    assert.ok(s.before.length > 0);
    assert.equal(s.after, "");
});

test("handles short content (no truncation needed)", function () {
    var s = ClawbackSearch.snippet("hello world", "hello");
    assert.equal(s.before, "");
    assert.equal(s.match, "hello");
    assert.equal(s.after, " world");
});

test("adds ellipsis when truncated", function () {
    var content = "A".repeat(50) + "MATCH" + "B".repeat(50);
    var s = ClawbackSearch.snippet(content, "MATCH");
    assert.ok(s.before.startsWith("\u2026"), "should start with ellipsis when truncated");
    assert.ok(s.after.endsWith("\u2026"), "should end with ellipsis when truncated");
});

test("returns null for no match", function () {
    assert.equal(ClawbackSearch.snippet("hello", "xyz"), null);
});

test("returns null for null inputs", function () {
    assert.equal(ClawbackSearch.snippet(null, "test"), null);
    assert.equal(ClawbackSearch.snippet("test", null), null);
});

test("is case-insensitive but preserves original case in match", function () {
    var s = ClawbackSearch.snippet("Hello World", "hello");
    assert.equal(s.match, "Hello");
});

// ---------------------------------------------------------------------------
// beatTypeIcon() tests
// ---------------------------------------------------------------------------

console.log("\nbeatTypeIcon()");

test("returns icon for each beat type", function () {
    var types = ["user_message", "assistant_message", "thinking", "tool_call", "tool_result", "callout", "artifact"];
    types.forEach(function (t) {
        var icon = ClawbackSearch.beatTypeIcon(t);
        assert.ok(icon.length > 0, t + " should have an icon");
        assert.notEqual(icon, "\u2022", t + " should not use default bullet");
    });
});

test("returns bullet for unknown type", function () {
    assert.equal(ClawbackSearch.beatTypeIcon("unknown"), "\u2022");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
