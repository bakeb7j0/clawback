/**
 * Clawback — Unit tests for annotations.js data manager.
 *
 * Run with: node tests/unit/js/test_annotations.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");
const { ClawbackAnnotations, ANNOTATION_COLORS } = require("../../../app/static/js/annotations.js");

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

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

/**
 * Create a fresh copy of ClawbackAnnotations to avoid test pollution.
 * The original is a singleton object, so we clone its methods onto a fresh object.
 */
function freshAnnotations() {
    var copy = Object.create(ClawbackAnnotations);
    copy._sessionId = null;
    copy._sections = [];
    copy._callouts = [];
    copy._artifacts = [];
    copy._afterBeatIndex = null;
    return copy;
}

// ---------------------------------------------------------------------------
// Sample annotation data
// ---------------------------------------------------------------------------

function makeSampleAnnotations() {
    return {
        sections: [
            { id: "sec-1", start_beat: 0, end_beat: 3, label: "Setup", color: "blue" },
            { id: "sec-2", start_beat: 5, end_beat: 8, label: "Resolution", color: "green" },
        ],
        callouts: [
            { id: "cal-1", after_beat: 2, style: "note", content: "Important point" },
            { id: "cal-2", after_beat: 5, style: "warning", content: "Watch out" },
        ],
        artifacts: [
            { id: "art-1", after_beat: 2, title: "Code Sample", description: "Example", content_type: "code", content: "console.log('hi')" },
            { id: "art-2", after_beat: 7, title: "Notes", description: "Summary", content_type: "markdown", content: "# Notes" },
        ],
    };
}

// ---------------------------------------------------------------------------
// init — initialization
// ---------------------------------------------------------------------------
console.log("\ninit — initialization");

test("initializes with null annotations gracefully", function () {
    var ann = freshAnnotations();
    ann.init(null, "test-session");
    assert.deepStrictEqual(ann._sections, []);
    assert.deepStrictEqual(ann._callouts, []);
    assert.deepStrictEqual(ann._artifacts, []);
    assert.equal(ann._sessionId, "test-session");
});

test("initializes with annotation data", function () {
    var ann = freshAnnotations();
    var data = makeSampleAnnotations();
    ann.init(data, "my-session");
    assert.equal(ann._sections.length, 2);
    assert.equal(ann._callouts.length, 2);
    assert.equal(ann._artifacts.length, 2);
    assert.equal(ann._sessionId, "my-session");
});

test("initializes with partial data (missing keys default to empty arrays)", function () {
    var ann = freshAnnotations();
    ann.init({ sections: [{ id: "sec-1", start_beat: 0, end_beat: 1, label: "A", color: "blue" }] }, "s1");
    assert.equal(ann._sections.length, 1);
    assert.deepStrictEqual(ann._callouts, []);
    assert.deepStrictEqual(ann._artifacts, []);
});

test("builds afterBeatIndex on init", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.ok(ann._afterBeatIndex instanceof Map);
    assert.ok(ann._afterBeatIndex.size > 0);
});

// ---------------------------------------------------------------------------
// getAnnotationsAfterBeat — beat-level lookups
// ---------------------------------------------------------------------------
console.log("\ngetAnnotationsAfterBeat — beat-level lookups");

test("returns empty array for beat with no annotations", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var result = ann.getAnnotationsAfterBeat(0);
    assert.deepStrictEqual(result, []);
});

test("returns callout and artifact for beat 2", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var result = ann.getAnnotationsAfterBeat(2);
    assert.equal(result.length, 2);
    // Callout comes first (added to index first in _buildIndex)
    assert.equal(result[0].type, "callout");
    assert.equal(result[0].data.id, "cal-1");
    assert.equal(result[1].type, "artifact");
    assert.equal(result[1].data.id, "art-1");
});

test("returns only callout for beat 5", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var result = ann.getAnnotationsAfterBeat(5);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "callout");
    assert.equal(result[0].data.id, "cal-2");
});

test("returns only artifact for beat 7", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var result = ann.getAnnotationsAfterBeat(7);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "artifact");
    assert.equal(result[0].data.id, "art-2");
});

test("returns empty array when no annotations loaded", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    assert.deepStrictEqual(ann.getAnnotationsAfterBeat(0), []);
});

test("returns empty array for nonexistent beat id", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.deepStrictEqual(ann.getAnnotationsAfterBeat(999), []);
});

// ---------------------------------------------------------------------------
// getSectionForBeat — section lookups
// ---------------------------------------------------------------------------
console.log("\ngetSectionForBeat — section lookups");

test("returns section for beat within range", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var sec = ann.getSectionForBeat(1);
    assert.equal(sec.id, "sec-1");
    assert.equal(sec.label, "Setup");
});

test("returns section for beat at start of range", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var sec = ann.getSectionForBeat(0);
    assert.equal(sec.id, "sec-1");
});

test("returns section for beat at end of range", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var sec = ann.getSectionForBeat(3);
    assert.equal(sec.id, "sec-1");
});

test("returns second section for beat in second range", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var sec = ann.getSectionForBeat(6);
    assert.equal(sec.id, "sec-2");
    assert.equal(sec.label, "Resolution");
});

test("returns null for beat outside any section", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var sec = ann.getSectionForBeat(4);
    assert.equal(sec, null);
});

test("returns null when no sections exist", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    assert.equal(ann.getSectionForBeat(0), null);
});

// ---------------------------------------------------------------------------
// getSections, getCallouts, getArtifacts — array accessors
// ---------------------------------------------------------------------------
console.log("\narray accessors");

test("getSections returns all sections", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann.getSections().length, 2);
    assert.equal(ann.getSections()[0].label, "Setup");
});

test("getCallouts returns all callouts", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann.getCallouts().length, 2);
});

test("getArtifacts returns all artifacts", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann.getArtifacts().length, 2);
});

test("getSections returns a copy — mutating it does not affect internal state", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var sections = ann.getSections();
    sections.push({ id: "sec-rogue", start_beat: 0, end_beat: 0, label: "Rogue", color: "red" });
    assert.equal(ann.getSections().length, 2);
});

test("getCallouts returns a copy — mutating it does not affect internal state", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var callouts = ann.getCallouts();
    callouts.splice(0, 1);
    assert.equal(ann.getCallouts().length, 2);
});

test("getArtifacts returns a copy — mutating it does not affect internal state", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var artifacts = ann.getArtifacts();
    artifacts.length = 0;
    assert.equal(ann.getArtifacts().length, 2);
});

// ---------------------------------------------------------------------------
// hasAnnotations / hasSections
// ---------------------------------------------------------------------------
console.log("\nhasAnnotations / hasSections");

test("hasAnnotations returns true when sections exist", function () {
    var ann = freshAnnotations();
    ann.init({ sections: [{ id: "s1", start_beat: 0, end_beat: 1, label: "X", color: "blue" }] }, "s1");
    assert.equal(ann.hasAnnotations(), true);
});

test("hasAnnotations returns true when callouts exist", function () {
    var ann = freshAnnotations();
    ann.init({ callouts: [{ id: "c1", after_beat: 0, style: "note", content: "Hi" }] }, "s1");
    assert.equal(ann.hasAnnotations(), true);
});

test("hasAnnotations returns true when artifacts exist", function () {
    var ann = freshAnnotations();
    ann.init({ artifacts: [{ id: "a1", after_beat: 0, title: "T", description: "D", content_type: "code", content: "x" }] }, "s1");
    assert.equal(ann.hasAnnotations(), true);
});

test("hasAnnotations returns false when empty", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    assert.equal(ann.hasAnnotations(), false);
});

test("hasSections returns true with sections", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann.hasSections(), true);
});

test("hasSections returns false without sections", function () {
    var ann = freshAnnotations();
    ann.init({ callouts: [{ id: "c1", after_beat: 0, style: "note", content: "Hi" }] }, "s1");
    assert.equal(ann.hasSections(), false);
});

// ---------------------------------------------------------------------------
// getColorHex
// ---------------------------------------------------------------------------
console.log("\ngetColorHex");

test("returns hex for known color", function () {
    var ann = freshAnnotations();
    assert.equal(ann.getColorHex("blue"), "#4A90D9");
    assert.equal(ann.getColorHex("red"), "#E74C3C");
});

test("returns slate as fallback for unknown color", function () {
    var ann = freshAnnotations();
    assert.equal(ann.getColorHex("banana"), ANNOTATION_COLORS.slate);
});

// ---------------------------------------------------------------------------
// ANNOTATION_COLORS export
// ---------------------------------------------------------------------------
console.log("\nANNOTATION_COLORS export");

test("has all 10 preset colors", function () {
    var keys = Object.keys(ANNOTATION_COLORS);
    assert.equal(keys.length, 10);
    assert.ok(keys.includes("blue"));
    assert.ok(keys.includes("purple"));
    assert.ok(keys.includes("green"));
    assert.ok(keys.includes("orange"));
    assert.ok(keys.includes("red"));
    assert.ok(keys.includes("teal"));
    assert.ok(keys.includes("pink"));
    assert.ok(keys.includes("amber"));
    assert.ok(keys.includes("indigo"));
    assert.ok(keys.includes("slate"));
});

// ---------------------------------------------------------------------------
// Editor mutation methods
// ---------------------------------------------------------------------------
console.log("\ncreateSection");

test("creates a section and adds to array", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    var sec = ann.createSection(0, 3, "Intro", "blue");
    assert.equal(sec.label, "Intro");
    assert.equal(sec.start_beat, 0);
    assert.equal(sec.end_beat, 3);
    assert.equal(sec.color, "blue");
    assert.ok(sec.id.startsWith("sec-"));
    assert.equal(ann._sections.length, 1);
});

test("auto-swaps reversed start/end beats", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    var sec = ann.createSection(5, 2, "Reversed", "red");
    assert.equal(sec.start_beat, 2);
    assert.equal(sec.end_beat, 5);
});

console.log("\ncreateCallout");

test("creates a callout and rebuilds index", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    var cal = ann.createCallout(3, "note", "A note");
    assert.equal(cal.after_beat, 3);
    assert.equal(cal.style, "note");
    assert.equal(cal.content, "A note");
    assert.ok(cal.id.startsWith("cal-"));
    assert.equal(ann._callouts.length, 1);
    // Index should be rebuilt
    var result = ann.getAnnotationsAfterBeat(3);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "callout");
});

console.log("\ncreateArtifact");

test("creates an artifact and rebuilds index", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    var art = ann.createArtifact(5, "My Code", "Description", "code", "var x = 1;");
    assert.equal(art.after_beat, 5);
    assert.equal(art.title, "My Code");
    assert.equal(art.content_type, "code");
    assert.ok(art.id.startsWith("art-"));
    assert.equal(ann._artifacts.length, 1);
    var result = ann.getAnnotationsAfterBeat(5);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "artifact");
});

// ---------------------------------------------------------------------------
// updateAnnotation
// ---------------------------------------------------------------------------
console.log("\nupdateAnnotation");

test("updates section by ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var updated = ann.updateAnnotation("sec-1", { label: "New Label" });
    assert.equal(updated, true);
    assert.equal(ann._sections[0].label, "New Label");
});

test("updates callout by ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var updated = ann.updateAnnotation("cal-1", { content: "Updated content" });
    assert.equal(updated, true);
    assert.equal(ann._callouts[0].content, "Updated content");
});

test("updates artifact by ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var updated = ann.updateAnnotation("art-1", { title: "Renamed" });
    assert.equal(updated, true);
    assert.equal(ann._artifacts[0].title, "Renamed");
});

test("returns false for unknown ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann.updateAnnotation("xyz-999", { label: "X" }), false);
});

// ---------------------------------------------------------------------------
// deleteAnnotation
// ---------------------------------------------------------------------------
console.log("\ndeleteAnnotation");

test("deletes a section by ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann._sections.length, 2);
    var deleted = ann.deleteAnnotation("sec-1");
    assert.equal(deleted, true);
    assert.equal(ann._sections.length, 1);
    assert.equal(ann._sections[0].id, "sec-2");
});

test("deletes a callout by ID and rebuilds index", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann._callouts.length, 2);
    ann.deleteAnnotation("cal-1");
    assert.equal(ann._callouts.length, 1);
    // Beat 2 should now only have the artifact
    var result = ann.getAnnotationsAfterBeat(2);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "artifact");
});

test("deletes an artifact by ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    ann.deleteAnnotation("art-2");
    assert.equal(ann._artifacts.length, 1);
});

test("returns false for unknown ID", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann.deleteAnnotation("xyz-999"), false);
});

// ---------------------------------------------------------------------------
// toJSON
// ---------------------------------------------------------------------------
console.log("\ntoJSON");

test("exports annotation data with session_id", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "my-session");
    var json = ann.toJSON();
    assert.equal(json.session_id, "my-session");
    assert.equal(json.sections.length, 2);
    assert.equal(json.callouts.length, 2);
    assert.equal(json.artifacts.length, 2);
});

test("exports empty arrays when no annotations", function () {
    var ann = freshAnnotations();
    ann.init(null, "empty-session");
    var json = ann.toJSON();
    assert.equal(json.session_id, "empty-session");
    assert.deepStrictEqual(json.sections, []);
    assert.deepStrictEqual(json.callouts, []);
    assert.deepStrictEqual(json.artifacts, []);
});

// ---------------------------------------------------------------------------
// Multiple annotations on same beat
// ---------------------------------------------------------------------------
console.log("\nmultiple annotations on same beat");

test("handles multiple callouts on the same beat", function () {
    var ann = freshAnnotations();
    ann.init({
        callouts: [
            { id: "c1", after_beat: 3, style: "note", content: "First" },
            { id: "c2", after_beat: 3, style: "warning", content: "Second" },
        ],
    }, "s1");
    var result = ann.getAnnotationsAfterBeat(3);
    assert.equal(result.length, 2);
    assert.equal(result[0].data.id, "c1");
    assert.equal(result[1].data.id, "c2");
});

test("callouts come before artifacts on the same beat", function () {
    var ann = freshAnnotations();
    ann.init({
        callouts: [
            { id: "c1", after_beat: 0, style: "note", content: "Note" },
        ],
        artifacts: [
            { id: "a1", after_beat: 0, title: "T", description: "D", content_type: "code", content: "x" },
        ],
    }, "s1");
    var result = ann.getAnnotationsAfterBeat(0);
    assert.equal(result.length, 2);
    assert.equal(result[0].type, "callout");
    assert.equal(result[1].type, "artifact");
});

// ---------------------------------------------------------------------------
// Code review regression tests
// ---------------------------------------------------------------------------
console.log("\ncode review regression tests");

test("annotations with missing after_beat are skipped in index", function () {
    var ann = freshAnnotations();
    ann.init({
        callouts: [
            { id: "c1", style: "note", content: "No beat field" },
            { id: "c2", after_beat: 0, style: "note", content: "Has beat" },
        ],
        artifacts: [
            { id: "a1", title: "T", content_type: "code", content: "x" },
        ],
    }, "s1");
    // The callout without after_beat should not appear anywhere
    var result = ann.getAnnotationsAfterBeat(0);
    assert.equal(result.length, 1);
    assert.equal(result[0].data.id, "c2");
    // undefined key should not be indexed
    assert.equal(ann._afterBeatIndex.has(undefined), false);
});

test("synchronous creates produce unique IDs", function () {
    var ann = freshAnnotations();
    ann.init(null, "s1");
    var sec1 = ann.createSection(0, 1, "A", "blue");
    var sec2 = ann.createSection(2, 3, "B", "red");
    var cal1 = ann.createCallout(0, "note", "X");
    var art1 = ann.createArtifact(0, "T", "D", "code", "c");
    // All IDs must be unique
    var ids = [sec1.id, sec2.id, cal1.id, art1.id];
    var unique = new Set(ids);
    assert.equal(unique.size, ids.length);
});

test("updateAnnotation cannot overwrite the id field", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    ann.updateAnnotation("sec-1", { id: "sec-hacked", label: "Changed" });
    // ID should remain unchanged
    assert.equal(ann._sections[0].id, "sec-1");
    // But the label should have been updated
    assert.equal(ann._sections[0].label, "Changed");
});

test("toJSON returns copies — mutating result does not affect internal state", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    var json = ann.toJSON();
    json.sections.push({ id: "sec-rogue" });
    json.callouts.length = 0;
    assert.equal(ann._sections.length, 2);
    assert.equal(ann._callouts.length, 2);
});

// ---------------------------------------------------------------------------
// Re-init clears previous state
// ---------------------------------------------------------------------------
console.log("\nre-init clears previous state");

test("calling init again replaces all data", function () {
    var ann = freshAnnotations();
    ann.init(makeSampleAnnotations(), "s1");
    assert.equal(ann._sections.length, 2);

    ann.init(null, "s2");
    assert.equal(ann._sections.length, 0);
    assert.equal(ann._callouts.length, 0);
    assert.equal(ann._artifacts.length, 0);
    assert.equal(ann._sessionId, "s2");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
