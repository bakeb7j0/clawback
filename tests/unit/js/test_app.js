/**
 * Clawback — Unit tests for app.js toolbar wiring and state management.
 *
 * Run with: node tests/unit/js/test_app.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");
const { PlaybackEngine, PlaybackState } = require("../../../app/static/js/playback.js");

// ---------------------------------------------------------------------------
// Set up globals before requiring app.js
// ---------------------------------------------------------------------------

global.PlaybackEngine = PlaybackEngine;
global.PlaybackState = PlaybackState;

let rendererCalls;
function resetRendererCalls() {
    rendererCalls = {
        renderBeat: [],
        removeBeat: [],
        toggleAllIW: [],
        resetGroups: 0,
    };
}
resetRendererCalls();

global.ClawbackRenderer = {
    renderBeat: function (beat, container) { rendererCalls.renderBeat.push(beat); },
    removeBeat: function (beat, container) { rendererCalls.removeBeat.push(beat); },
    toggleAllInnerWorkings: function (container, expanded) { rendererCalls.toggleAllIW.push(expanded); },
    resetGroups: function () { rendererCalls.resetGroups++; },
};

global.ClawbackScroller = {
    createScroller: function () {
        return {
            scrollToBottom: function () {},
            enable: function () {},
            disable: function () {},
            destroy: function () {},
        };
    },
};

const { ClawbackAnnotations, ANNOTATION_COLORS } = require("../../../app/static/js/annotations.js");
global.ClawbackAnnotations = ClawbackAnnotations;

const { clawbackApp } = require("../../../app/static/js/app.js");

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

function makeBeats(n) {
    const beats = [];
    for (var i = 0; i < n; i++) {
        beats.push({
            id: i,
            type: "user_message",
            category: "direct",
            content: "Beat " + i,
            duration: 1,
            group_id: null,
        });
    }
    return beats;
}

function makeApp(numBeats) {
    resetRendererCalls();
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    if (numBeats !== undefined) {
        app.startPlayback(makeBeats(numBeats), "Test");
    }
    return app;
}

// ---------------------------------------------------------------------------
// startPlayback — state initialization
// ---------------------------------------------------------------------------
console.log("\nstartPlayback — state initialization");

test("sets totalBeats from beats array length", function () {
    const app = makeApp(5);
    assert.equal(app.totalBeats, 5);
});

test("sets currentBeat to 0", function () {
    const app = makeApp(5);
    assert.equal(app.currentBeat, 0);
});

test("resets speed to 1.0", function () {
    const app = makeApp(5);
    app.speed = 2.0;
    app.startPlayback(makeBeats(3), "Test2");
    assert.equal(app.speed, 1.0);
});

test("resets innerWorkingsMode to collapsed", function () {
    const app = makeApp(5);
    app.innerWorkingsMode = "expanded";
    app.startPlayback(makeBeats(3), "Test2");
    assert.equal(app.innerWorkingsMode, "collapsed");
});

test("sets view to playback", function () {
    const app = makeApp(5);
    assert.equal(app.view, "playback");
});

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------
console.log("\nprogress tracking");

test("currentBeat updates after next()", function () {
    const app = makeApp(5);
    app._engine.next();
    assert.equal(app.currentBeat, 1);
});

test("currentBeat updates after multiple next() calls", function () {
    const app = makeApp(5);
    app._engine.next();
    app._engine.next();
    app._engine.next();
    assert.equal(app.currentBeat, 3);
});

test("currentBeat updates after previous()", function () {
    const app = makeApp(5);
    app._engine.next();
    app._engine.next();
    assert.equal(app.currentBeat, 2);
    app._engine.previous();
    assert.equal(app.currentBeat, 1);
});

test("currentBeat equals totalBeats after skipToEnd()", function () {
    const app = makeApp(5);
    app._engine.skipToEnd();
    assert.equal(app.currentBeat, 5);
    assert.equal(app.currentBeat, app.totalBeats);
});

test("currentBeat is 0 after skipToStart()", function () {
    const app = makeApp(5);
    app._engine.next();
    app._engine.next();
    app._engine.skipToStart();
    assert.equal(app.currentBeat, 0);
});

// ---------------------------------------------------------------------------
// togglePlay
// ---------------------------------------------------------------------------
console.log("\ntogglePlay");

test("calls play() from READY — transitions to PLAYING", function () {
    const app = makeApp(5);
    assert.equal(app.playbackState, "READY");
    app.togglePlay();
    assert.equal(app.playbackState, "PLAYING");
});

test("calls pause() from PLAYING — transitions to PAUSED", function () {
    const app = makeApp(5);
    app.togglePlay(); // READY → PLAYING
    assert.equal(app.playbackState, "PLAYING");
    app.togglePlay(); // PLAYING → PAUSED
    assert.equal(app.playbackState, "PAUSED");
});

test("calls play() from PAUSED — transitions to PLAYING", function () {
    const app = makeApp(5);
    app.togglePlay(); // → PLAYING
    app.togglePlay(); // → PAUSED
    app.togglePlay(); // → PLAYING
    assert.equal(app.playbackState, "PLAYING");
});

test("calls play() from SCROLL_PAUSED — transitions to PLAYING", function () {
    const app = makeApp(5);
    app._engine.play(); // → PLAYING
    app._engine.scrollPause(); // → SCROLL_PAUSED
    assert.equal(app.playbackState, "SCROLL_PAUSED");
    app.togglePlay(); // → PLAYING
    assert.equal(app.playbackState, "PLAYING");
});

test("is a no-op when no engine", function () {
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    // Should not throw
    app.togglePlay();
    assert.equal(app.playbackState, "READY");
});

// ---------------------------------------------------------------------------
// Transport controls
// ---------------------------------------------------------------------------
console.log("\ntransport controls");

test("skipToStart() resets to READY", function () {
    const app = makeApp(5);
    app._engine.next();
    app._engine.next();
    app.skipToStart();
    assert.equal(app.playbackState, "READY");
    assert.equal(app.currentBeat, 0);
});

test("skipToEnd() transitions to COMPLETE", function () {
    const app = makeApp(5);
    app.skipToEnd();
    assert.equal(app.playbackState, "COMPLETE");
    assert.equal(app.currentBeat, 5);
});

test("nextBeat() advances one beat", function () {
    const app = makeApp(5);
    app.nextBeat();
    assert.equal(app.currentBeat, 1);
});

test("previousBeat() goes back one beat", function () {
    const app = makeApp(5);
    app.nextBeat();
    app.nextBeat();
    app.previousBeat();
    assert.equal(app.currentBeat, 1);
});

test("transport methods are no-ops when no engine", function () {
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    // None should throw
    app.skipToStart();
    app.skipToEnd();
    app.nextBeat();
    app.previousBeat();
    assert.equal(app.playbackState, "READY");
});

// ---------------------------------------------------------------------------
// setSpeed
// ---------------------------------------------------------------------------
console.log("\nsetSpeed");

test("updates speed property", function () {
    const app = makeApp(5);
    app.setSpeed(2);
    assert.equal(app.speed, 2);
});

test("updates engine speed", function () {
    const app = makeApp(5);
    app.setSpeed(0.5);
    assert.equal(app._engine.speed, 0.5);
});

test("works without engine (before startPlayback)", function () {
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    app.setSpeed(1.5);
    assert.equal(app.speed, 1.5);
});

// ---------------------------------------------------------------------------
// setInnerWorkingsMode
// ---------------------------------------------------------------------------
console.log("\nsetInnerWorkingsMode");

test("updates innerWorkingsMode property", function () {
    const app = makeApp(5);
    app.setInnerWorkingsMode("collapsed");
    assert.equal(app.innerWorkingsMode, "collapsed");
});

test("updates engine innerWorkingsMode", function () {
    const app = makeApp(5);
    app.setInnerWorkingsMode("collapsed");
    assert.equal(app._engine.innerWorkingsMode, "collapsed");
});

test("calls renderer toggleAllInnerWorkings with false for collapsed", function () {
    const app = makeApp(5);
    resetRendererCalls();
    app.setInnerWorkingsMode("collapsed");
    assert.equal(rendererCalls.toggleAllIW.length, 1);
    assert.equal(rendererCalls.toggleAllIW[0], false);
});

test("calls renderer toggleAllInnerWorkings with true for expanded", function () {
    const app = makeApp(5);
    app.setInnerWorkingsMode("collapsed");
    resetRendererCalls();
    app.setInnerWorkingsMode("expanded");
    assert.equal(rendererCalls.toggleAllIW.length, 1);
    assert.equal(rendererCalls.toggleAllIW[0], true);
});

test("works without engine (before startPlayback)", function () {
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    resetRendererCalls();
    app.setInnerWorkingsMode("collapsed");
    assert.equal(app.innerWorkingsMode, "collapsed");
    // Renderer should NOT be called when no engine exists
    assert.equal(rendererCalls.toggleAllIW.length, 0);
});

// ---------------------------------------------------------------------------
// backToSessions
// ---------------------------------------------------------------------------
console.log("\nbackToSessions");

test("resets to picker view and cleans up engine/scroller", function () {
    const app = makeApp(5);
    app._engine.next();
    assert.equal(app.currentBeat, 1);

    app.backToSessions();
    assert.equal(app.view, "picker");
    assert.equal(app.playbackState, "READY");
    assert.equal(app.currentBeat, 0);
    assert.equal(app.totalBeats, 0);
    assert.equal(app.sessionName, "");
    assert.equal(app._engine, null);
    assert.equal(app._scroller, null);
});

test("is safe when no engine exists", function () {
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    // Should not throw
    app.backToSessions();
    assert.equal(app.view, "picker");
});

// ---------------------------------------------------------------------------
// handleKeydown — keyboard shortcuts
// ---------------------------------------------------------------------------
console.log("\nhandleKeydown — keyboard shortcuts");

function makeKeyEvent(code, opts) {
    var prevented = false;
    return Object.assign({
        code: code,
        target: { tagName: "BODY" },
        preventDefault: function () { prevented = true; },
        get defaultPrevented() { return prevented; },
    }, opts || {});
}

test("Space toggles play in playback view", function () {
    const app = makeApp(5);
    assert.equal(app.playbackState, "READY");
    var evt = makeKeyEvent("Space");
    app.handleKeydown(evt);
    assert.equal(app.playbackState, "PLAYING");
    assert.equal(evt.defaultPrevented, true);
});

test("Space pauses when already playing", function () {
    const app = makeApp(5);
    app._engine.play();
    assert.equal(app.playbackState, "PLAYING");
    app.handleKeydown(makeKeyEvent("Space"));
    assert.equal(app.playbackState, "PAUSED");
});

test("ArrowRight advances one beat", function () {
    const app = makeApp(5);
    var evt = makeKeyEvent("ArrowRight");
    app.handleKeydown(evt);
    assert.equal(app.currentBeat, 1);
    assert.equal(evt.defaultPrevented, true);
});

test("ArrowLeft goes back one beat", function () {
    const app = makeApp(5);
    app._engine.next();
    app._engine.next();
    assert.equal(app.currentBeat, 2);
    var evt = makeKeyEvent("ArrowLeft");
    app.handleKeydown(evt);
    assert.equal(app.currentBeat, 1);
    assert.equal(evt.defaultPrevented, true);
});

test("keys are ignored in picker view", function () {
    const app = clawbackApp();
    app.$refs = { chatArea: { innerHTML: "", parentElement: {} } };
    assert.equal(app.view, "picker");
    var evt = makeKeyEvent("Space");
    app.handleKeydown(evt);
    assert.equal(app.playbackState, "READY");
    assert.equal(evt.defaultPrevented, false);
});

test("keys are ignored when target is INPUT", function () {
    const app = makeApp(5);
    var evt = makeKeyEvent("Space", { target: { tagName: "INPUT" } });
    app.handleKeydown(evt);
    assert.equal(app.playbackState, "READY");
    assert.equal(evt.defaultPrevented, false);
});

test("keys are ignored when target is TEXTAREA", function () {
    const app = makeApp(5);
    var evt = makeKeyEvent("Space", { target: { tagName: "TEXTAREA" } });
    app.handleKeydown(evt);
    assert.equal(app.playbackState, "READY");
    assert.equal(evt.defaultPrevented, false);
});

test("keys are ignored when target is SELECT", function () {
    const app = makeApp(5);
    var evt = makeKeyEvent("Space", { target: { tagName: "SELECT" } });
    app.handleKeydown(evt);
    assert.equal(app.playbackState, "READY");
    assert.equal(evt.defaultPrevented, false);
});

test("keys are ignored when target is contentEditable", function () {
    const app = makeApp(5);
    var evt = makeKeyEvent("Space", { target: { tagName: "DIV", isContentEditable: true } });
    app.handleKeydown(evt);
    assert.equal(app.playbackState, "READY");
    assert.equal(evt.defaultPrevented, false);
});

test("unhandled keys are ignored (no error)", function () {
    const app = makeApp(5);
    var evt = makeKeyEvent("KeyA");
    app.handleKeydown(evt);
    assert.equal(evt.defaultPrevented, false);
});

// ---------------------------------------------------------------------------
// Section sidebar state
// ---------------------------------------------------------------------------
console.log("\nsection sidebar state");

function makeSectionAnnotations() {
    return {
        sections: [
            { id: "sec-1", start_beat: 0, end_beat: 2, label: "Intro", color: "blue" },
            { id: "sec-2", start_beat: 4, end_beat: 6, label: "Main", color: "green" },
        ],
        callouts: [],
        artifacts: [],
    };
}

test("startPlayback with sections sets showSections true", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    assert.equal(app.showSections, true);
    assert.equal(app.sectionList.length, 2);
});

test("startPlayback without annotations sets showSections false", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test");
    assert.equal(app.showSections, false);
    assert.deepStrictEqual(app.sectionList, []);
});

test("startPlayback with null annotations sets showSections false", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", null);
    assert.equal(app.showSections, false);
});

test("toggleSections flips showSections", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    assert.equal(app.showSections, true);
    app.toggleSections();
    assert.equal(app.showSections, false);
    app.toggleSections();
    assert.equal(app.showSections, true);
});

test("backToSessions resets section state", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    assert.equal(app.showSections, true);
    app.backToSessions();
    assert.equal(app.showSections, false);
    assert.equal(app.activeSection, null);
    assert.deepStrictEqual(app.sectionList, []);
});

// ---------------------------------------------------------------------------
// Active section tracking
// ---------------------------------------------------------------------------
console.log("\nactive section tracking");

test("activeSection updates when advancing into a section", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    assert.equal(app.activeSection, null);
    app._engine.next(); // beat 0 rendered, currentBeat=1, active beat=0 → in sec-1
    assert.equal(app.activeSection.id, "sec-1");
});

test("activeSection is null between sections", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    // Advance past sec-1 (beats 0-2) into gap (beat 3)
    app._engine.next(); // beat 0
    app._engine.next(); // beat 1
    app._engine.next(); // beat 2
    app._engine.next(); // beat 3 — between sections
    assert.equal(app.activeSection, null);
});

test("activeSection updates on jumpToSection", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    var sections = app.sectionList;
    app.jumpToSection(sections[1]); // Jump to sec-2 (start_beat=4)
    assert.equal(app.activeSection.id, "sec-2");
    assert.equal(app.currentBeat, 5); // beats 0-4 rendered
});

// ---------------------------------------------------------------------------
// Progress segments
// ---------------------------------------------------------------------------
console.log("\nprogress segments");

test("progress segments computed from sections", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test", makeSectionAnnotations());
    // sec-1: beats 0-2 (3 beats), gap: beat 3 (1 beat), sec-2: beats 4-6 (3 beats), gap: beat 7 (1 beat)
    var segs = app.progressSegments;
    assert.equal(segs.length, 4);
    // sec-1: 3/8 = 37.5%
    assert.equal(segs[0].width, (3 / 8) * 100);
    assert.equal(segs[0].color, ANNOTATION_COLORS.blue);
    // gap: 1/8 = 12.5%
    assert.equal(segs[1].width, (1 / 8) * 100);
    assert.equal(segs[1].color, null);
    // sec-2: 3/8 = 37.5%
    assert.equal(segs[2].width, (3 / 8) * 100);
    assert.equal(segs[2].color, ANNOTATION_COLORS.green);
    // trailing gap: 1/8 = 12.5%
    assert.equal(segs[3].width, (1 / 8) * 100);
    assert.equal(segs[3].color, null);
});

test("overlapping sections clamp to non-overlapping segments", function () {
    const app = makeApp();
    var overlapping = {
        sections: [
            { id: "sec-1", start_beat: 0, end_beat: 5, label: "Wide", color: "blue" },
            { id: "sec-2", start_beat: 3, end_beat: 7, label: "Overlap", color: "green" },
        ],
        callouts: [],
        artifacts: [],
    };
    app.startPlayback(makeBeats(10), "Test", overlapping);
    var segs = app.progressSegments;
    // sec-1: beats 0-5 (6 beats), sec-2 clamped: beats 6-7 (2 beats), trailing gap: beats 8-9 (2 beats)
    assert.equal(segs.length, 3);
    assert.equal(segs[0].width, (6 / 10) * 100);
    assert.equal(segs[0].color, ANNOTATION_COLORS.blue);
    assert.equal(segs[1].width, (2 / 10) * 100);
    assert.equal(segs[1].color, ANNOTATION_COLORS.green);
    assert.equal(segs[2].width, (2 / 10) * 100);
    assert.equal(segs[2].color, null);
    // Total must be 100%
    var total = segs.reduce(function (sum, s) { return sum + s.width; }, 0);
    assert.equal(total, 100);
});

test("fully overlapped section is skipped in segments", function () {
    const app = makeApp();
    var contained = {
        sections: [
            { id: "sec-1", start_beat: 0, end_beat: 9, label: "Full", color: "blue" },
            { id: "sec-2", start_beat: 3, end_beat: 5, label: "Inside", color: "green" },
        ],
        callouts: [],
        artifacts: [],
    };
    app.startPlayback(makeBeats(10), "Test", contained);
    var segs = app.progressSegments;
    // sec-1 covers everything, sec-2 fully inside sec-1 → skipped
    assert.equal(segs.length, 1);
    assert.equal(segs[0].width, 100);
    assert.equal(segs[0].color, ANNOTATION_COLORS.blue);
});

test("no sections produces single default segment", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test");
    assert.equal(app.progressSegments.length, 1);
    assert.equal(app.progressSegments[0].width, 100);
    assert.equal(app.progressSegments[0].color, null);
});

// ---------------------------------------------------------------------------
// Callout interleaving
// ---------------------------------------------------------------------------
console.log("\ncallout interleaving");

function makeCalloutAnnotations() {
    return {
        sections: [],
        callouts: [
            { id: "cal-1", after_beat: 1, style: "note", content: "Pay attention here" },
            { id: "cal-2", after_beat: 3, style: "warning", content: "This is a complex topic with many words to read" },
        ],
        artifacts: [],
    };
}

test("merged beats include callout pseudo-beats", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    // 5 conversation beats + 2 callouts = 7 merged beats
    assert.equal(app._engine.beats.length, 7);
});

test("totalBeats tracks conversation beats only", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    assert.equal(app.totalBeats, 5);
});

test("currentBeat tracks conversation beats only during playback", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    // Advance through: beat0, beat1, callout(after_beat=1), beat2
    app._engine.next(); // beat 0 → conversationBeats=1
    assert.equal(app.currentBeat, 1);
    app._engine.next(); // beat 1 → conversationBeats=2
    assert.equal(app.currentBeat, 2);
    app._engine.next(); // callout → conversationBeats still 2
    assert.equal(app.currentBeat, 2);
    app._engine.next(); // beat 2 → conversationBeats=3
    assert.equal(app.currentBeat, 3);
});

test("previous decrements conversation beat count correctly", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    // Advance past beat 0, beat 1, callout
    app._engine.next(); // beat 0
    app._engine.next(); // beat 1
    app._engine.next(); // callout
    assert.equal(app.currentBeat, 2);
    // Go back through callout
    app._engine.previous(); // removes callout
    assert.equal(app.currentBeat, 2, "callout removal should not change conversation count");
    app._engine.previous(); // removes beat 1
    assert.equal(app.currentBeat, 1);
});

test("skipToEnd counts all conversation beats", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    app._engine.skipToEnd();
    assert.equal(app.currentBeat, 5);
    assert.equal(app.totalBeats, 5);
});

test("skipToStart resets conversation beat count to 0", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    app._engine.skipToEnd();
    app._engine.skipToStart();
    assert.equal(app.currentBeat, 0);
    assert.equal(app._conversationBeatsRendered, 0);
});

test("callout pseudo-beats have correct structure", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    var merged = app._engine.beats;
    // Callout should be at index 2 (after beat 0 and beat 1)
    var callout = merged[2];
    assert.equal(callout.type, "callout");
    assert.equal(callout.isCallout, true);
    assert.equal(callout.calloutStyle, "note");
    assert.equal(callout.content, "Pay attention here");
    assert.equal(callout.id, "callout-cal-1");
    assert.ok(callout.duration >= 1.0, "duration should be at least 1s");
    assert.equal(callout.group_id, null);
});

test("callout duration calculated from word count at 100 WPM", function () {
    const app = makeApp();
    // 10 words → (10/100)*60 = 6 seconds
    var tenWords = "one two three four five six seven eight nine ten";
    var annotations = {
        sections: [], artifacts: [],
        callouts: [{ id: "cal-1", after_beat: 0, style: "note", content: tenWords }],
    };
    app.startPlayback(makeBeats(3), "Test", annotations);
    var callout = app._engine.beats[1]; // after beat 0
    assert.equal(callout.duration, 6);
});

test("callout duration clamps to minimum 1 second", function () {
    const app = makeApp();
    var annotations = {
        sections: [], artifacts: [],
        callouts: [{ id: "cal-1", after_beat: 0, style: "note", content: "short" }],
    };
    app.startPlayback(makeBeats(3), "Test", annotations);
    var callout = app._engine.beats[1];
    assert.equal(callout.duration, 1.0);
});

test("sessions without callouts play identically to v1.0", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test");
    assert.equal(app._engine.beats.length, 5, "no extra beats injected");
    assert.equal(app._beatIdToMergedIndex, null, "no index map needed");
    app._engine.next();
    assert.equal(app.currentBeat, 1);
    app._engine.next();
    assert.equal(app.currentBeat, 2);
});

test("sessions with empty annotations play identically to v1.0", function () {
    const app = makeApp();
    var emptyAnnotations = { sections: [], callouts: [], artifacts: [] };
    app.startPlayback(makeBeats(5), "Test", emptyAnnotations);
    assert.equal(app._engine.beats.length, 5, "no extra beats injected");
});

test("beatIdToMergedIndex maps conversation beat IDs to merged indices", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    // beats: [b0, b1, cal1, b2, b3, cal2, b4]
    assert.equal(app._beatIdToMergedIndex[0], 0); // beat 0 at merged index 0
    assert.equal(app._beatIdToMergedIndex[1], 1); // beat 1 at merged index 1
    assert.equal(app._beatIdToMergedIndex[2], 3); // beat 2 at merged index 3 (after callout)
    assert.equal(app._beatIdToMergedIndex[3], 4); // beat 3 at merged index 4
    assert.equal(app._beatIdToMergedIndex[4], 6); // beat 4 at merged index 6 (after callout)
});

test("jumpToSection uses merged index for correct navigation", function () {
    const app = makeApp();
    var annotations = {
        sections: [
            { id: "sec-1", start_beat: 3, end_beat: 4, label: "Section", color: "blue" },
        ],
        callouts: [
            { id: "cal-1", after_beat: 1, style: "note", content: "A note" },
        ],
        artifacts: [],
    };
    app.startPlayback(makeBeats(6), "Test", annotations);
    // merged: [b0, b1, cal1, b2, b3, b4, b5]
    // beat 3 is at merged index 4
    app.jumpToSection(annotations.sections[0]);
    // After jump, conversation beats 0-3 should be rendered = 4
    assert.equal(app.currentBeat, 4);
});

test("backToSessions resets callout state", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeCalloutAnnotations());
    app._engine.skipToEnd();
    app.backToSessions();
    assert.equal(app._conversationBeatsRendered, 0);
    assert.equal(app._beatIdToMergedIndex, null);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
