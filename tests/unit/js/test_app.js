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
        renderArtifactPanel: [],
    };
}
resetRendererCalls();

global.ClawbackRenderer = {
    renderBeat: function (beat, container) { rendererCalls.renderBeat.push(beat); return { addEventListener: function () {} }; },
    removeBeat: function (beat, container) { rendererCalls.removeBeat.push(beat); },
    toggleAllInnerWorkings: function (container, expanded) { rendererCalls.toggleAllIW.push(expanded); },
    resetGroups: function () { rendererCalls.resetGroups++; },
    renderArtifactPanel: function (artifact, contentEl) { rendererCalls.renderArtifactPanel.push(artifact); },
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
global.ANNOTATION_COLORS = ANNOTATION_COLORS;

const { ClawbackSearch } = require("../../../app/static/js/search.js");
global.ClawbackSearch = ClawbackSearch;

// Mock save to prevent actual HTTP calls
var saveCalls = 0;
ClawbackAnnotations.save = function () { saveCalls++; return Promise.resolve(); };

// Minimal document mock for inline editor DOM creation
global.document = {
    createElement: function (tag) {
        var el = {
            tagName: tag.toUpperCase(),
            className: "",
            textContent: "",
            type: "",
            placeholder: "",
            rows: 0,
            value: "",
            children: [],
            style: {},
            dataset: {},
            _listeners: {},
            appendChild: function (child) { el.children.push(child); },
            insertAdjacentElement: function () {},
            addEventListener: function (evt, fn) {
                if (!el._listeners[evt]) el._listeners[evt] = [];
                el._listeners[evt].push(fn);
            },
            focus: function () {},
            remove: function () {},
        };
        return el;
    },
    querySelector: function () { return null; },
};

// window mock for resize event handling
var _windowListeners = {};
global.window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: function (evt, fn) {
        if (!_windowListeners[evt]) _windowListeners[evt] = [];
        _windowListeners[evt].push(fn);
    },
    removeEventListener: function (evt, fn) {
        if (_windowListeners[evt]) {
            _windowListeners[evt] = _windowListeners[evt].filter(function (f) { return f !== fn; });
        }
    },
};

// localStorage mock
var _lsStore = {};
global.localStorage = {
    getItem: function (k) { return _lsStore[k] || null; },
    setItem: function (k, v) { _lsStore[k] = String(v); },
    removeItem: function (k) { delete _lsStore[k]; },
    clear: function () { _lsStore = {}; },
};

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
    app.$refs = {
        chatArea: {
            innerHTML: "",
            parentElement: {},
            querySelector: function () { return null; },
        },
    };
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
// increaseSpeed / decreaseSpeed
// ---------------------------------------------------------------------------
console.log("\nincreaseSpeed / decreaseSpeed");

test("increaseSpeed increases by 0.5", function () {
    const app = makeApp(5);
    app.setSpeed(1.0);
    app.increaseSpeed();
    assert.equal(app.speed, 1.5);
});

test("increaseSpeed caps at 4.0", function () {
    const app = makeApp(5);
    app.setSpeed(4.0);
    app.increaseSpeed();
    assert.equal(app.speed, 4.0);
});

test("decreaseSpeed decreases by 0.5", function () {
    const app = makeApp(5);
    app.setSpeed(2.0);
    app.decreaseSpeed();
    assert.equal(app.speed, 1.5);
});

test("decreaseSpeed floors at 0.5", function () {
    const app = makeApp(5);
    app.setSpeed(0.5);
    app.decreaseSpeed();
    assert.equal(app.speed, 0.5);
});

test("increaseSpeed avoids floating point drift", function () {
    const app = makeApp(5);
    app.setSpeed(0.5);
    app.increaseSpeed();
    app.increaseSpeed();
    app.increaseSpeed();
    assert.equal(app.speed, 2.0);
});

test("increaseSpeed updates engine speed", function () {
    const app = makeApp(5);
    app.setSpeed(1.0);
    app.increaseSpeed();
    assert.equal(app._engine.speed, 1.5);
});

test("decreaseSpeed updates engine speed", function () {
    const app = makeApp(5);
    app.setSpeed(2.0);
    app.decreaseSpeed();
    assert.equal(app._engine.speed, 1.5);
});

test("decreaseSpeed avoids floating point drift", function () {
    const app = makeApp(5);
    app.setSpeed(2.0);
    app.decreaseSpeed();
    app.decreaseSpeed();
    app.decreaseSpeed();
    assert.equal(app.speed, 0.5);
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

test("ArrowUp increases speed", function () {
    const app = makeApp(5);
    assert.equal(app.speed, 1.0);
    var evt = makeKeyEvent("ArrowUp");
    app.handleKeydown(evt);
    assert.equal(app.speed, 1.5);
    assert.equal(evt.defaultPrevented, true);
});

test("ArrowDown decreases speed", function () {
    const app = makeApp(5);
    assert.equal(app.speed, 1.0);
    var evt = makeKeyEvent("ArrowDown");
    app.handleKeydown(evt);
    assert.equal(app.speed, 0.5);
    assert.equal(evt.defaultPrevented, true);
});

test("ArrowUp does not exceed max speed", function () {
    const app = makeApp(5);
    app.speed = 4.0;
    var evt = makeKeyEvent("ArrowUp");
    app.handleKeydown(evt);
    assert.equal(app.speed, 4.0);
});

test("ArrowDown does not go below min speed", function () {
    const app = makeApp(5);
    app.speed = 0.5;
    var evt = makeKeyEvent("ArrowDown");
    app.handleKeydown(evt);
    assert.equal(app.speed, 0.5);
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
// Artifact interleaving
// ---------------------------------------------------------------------------
console.log("\nartifact interleaving");

function makeArtifactAnnotations() {
    return {
        sections: [],
        callouts: [],
        artifacts: [
            { id: "art-1", after_beat: 1, title: "Diagram", description: "Architecture overview", content_type: "markdown", content: "# Architecture\nDetails here." },
            { id: "art-2", after_beat: 3, title: "Code Sample", description: "Implementation example", content_type: "code", content: "function hello() { return 1; }" },
        ],
    };
}

test("merged beats include artifact pseudo-beats", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    // 5 conversation beats + 2 artifacts = 7 merged beats
    assert.equal(app._engine.beats.length, 7);
});

test("totalBeats tracks conversation beats only (artifacts excluded)", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    assert.equal(app.totalBeats, 5);
});

test("currentBeat tracks conversation beats only during artifact playback", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    // merged: [b0, b1, art1, b2, b3, art2, b4]
    app._engine.next(); // beat 0 → conversationBeats=1
    assert.equal(app.currentBeat, 1);
    app._engine.next(); // beat 1 → conversationBeats=2
    assert.equal(app.currentBeat, 2);
    app._engine.next(); // artifact → conversationBeats still 2
    assert.equal(app.currentBeat, 2);
    app._engine.next(); // beat 2 → conversationBeats=3
    assert.equal(app.currentBeat, 3);
});

test("previous decrements correctly past artifact pseudo-beats", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    // Advance past beat 0, beat 1, artifact
    app._engine.next(); // beat 0
    app._engine.next(); // beat 1
    app._engine.next(); // artifact
    assert.equal(app.currentBeat, 2);
    app._engine.previous(); // removes artifact
    assert.equal(app.currentBeat, 2, "artifact removal should not change conversation count");
    app._engine.previous(); // removes beat 1
    assert.equal(app.currentBeat, 1);
});

test("skipToEnd counts all conversation beats with artifacts", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    app._engine.skipToEnd();
    assert.equal(app.currentBeat, 5);
    assert.equal(app.totalBeats, 5);
});

test("artifact pseudo-beats have correct structure", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    var merged = app._engine.beats;
    // Artifact should be at index 2 (after beat 0 and beat 1)
    var artifact = merged[2];
    assert.equal(artifact.type, "artifact");
    assert.equal(artifact.category, "artifact");
    assert.equal(artifact.isArtifact, true);
    assert.equal(artifact.artifactTitle, "Diagram");
    assert.equal(artifact.artifactDescription, "Architecture overview");
    assert.equal(artifact.artifactContent, "# Architecture\nDetails here.");
    assert.equal(artifact.contentType, "markdown");
    assert.equal(artifact.content, "Diagram Architecture overview");
    assert.equal(artifact.artifactId, "art-1");
    assert.equal(artifact.id, "artifact-art-1");
    assert.ok(artifact.duration >= 1.0, "duration should be at least 1s");
    assert.equal(artifact.group_id, null);
});

test("artifact duration calculated from title+description word count", function () {
    const app = makeApp();
    // "Diagram Architecture overview" = 3 words → (3/100)*60 = 1.8s → max(1.0, 1.8) = 1.8
    var annotations = {
        sections: [], callouts: [],
        artifacts: [{ id: "art-1", after_beat: 0, title: "Diagram", description: "Architecture overview", content_type: "markdown", content: "Lots of content here" }],
    };
    app.startPlayback(makeBeats(3), "Test", annotations);
    var artifact = app._engine.beats[1]; // after beat 0
    assert.equal(artifact.duration, (3 / 100) * 60);
});

test("beatIdToMergedIndex maps correctly with artifacts", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(5), "Test", makeArtifactAnnotations());
    // merged: [b0, b1, art1, b2, b3, art2, b4]
    assert.equal(app._beatIdToMergedIndex[0], 0); // beat 0 at merged index 0
    assert.equal(app._beatIdToMergedIndex[1], 1); // beat 1 at merged index 1
    assert.equal(app._beatIdToMergedIndex[2], 3); // beat 2 at merged index 3 (after artifact)
    assert.equal(app._beatIdToMergedIndex[3], 4); // beat 3 at merged index 4
    assert.equal(app._beatIdToMergedIndex[4], 6); // beat 4 at merged index 6 (after artifact)
});

test("jumpToSection uses merged index with artifacts present", function () {
    const app = makeApp();
    var annotations = {
        sections: [
            { id: "sec-1", start_beat: 3, end_beat: 4, label: "Section", color: "blue" },
        ],
        callouts: [],
        artifacts: [
            { id: "art-1", after_beat: 1, title: "A", description: "B", content_type: "markdown", content: "C" },
        ],
    };
    app.startPlayback(makeBeats(6), "Test", annotations);
    // merged: [b0, b1, art1, b2, b3, b4, b5]
    // beat 3 is at merged index 4
    app.jumpToSection(annotations.sections[0]);
    // After jump, conversation beats 0-3 should be rendered = 4
    assert.equal(app.currentBeat, 4);
});

// ---------------------------------------------------------------------------
// Mixed callouts and artifacts
// ---------------------------------------------------------------------------
console.log("\nmixed callouts and artifacts");

function makeMixedAnnotations() {
    return {
        sections: [],
        callouts: [
            { id: "cal-1", after_beat: 1, style: "note", content: "A callout note" },
        ],
        artifacts: [
            { id: "art-1", after_beat: 1, title: "Artifact", description: "After same beat as callout", content_type: "markdown", content: "Content" },
        ],
    };
}

test("callouts and artifacts on same beat both appear in merged array", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(4), "Test", makeMixedAnnotations());
    // merged: [b0, b1, cal1, art1, b2, b3]
    assert.equal(app._engine.beats.length, 6);
    assert.equal(app._engine.beats[2].type, "callout");
    assert.equal(app._engine.beats[3].type, "artifact");
});

test("callouts appear before artifacts on same beat (annotation order)", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(4), "Test", makeMixedAnnotations());
    var merged = app._engine.beats;
    // After beat 1: callout first, then artifact
    assert.equal(merged[2].isCallout, true);
    assert.equal(merged[3].isArtifact, true);
});

test("neither callouts nor artifacts affect conversation beat count", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(4), "Test", makeMixedAnnotations());
    // Advance: b0, b1, cal1, art1, b2
    app._engine.next(); // b0 → 1
    app._engine.next(); // b1 → 2
    app._engine.next(); // cal1 → 2
    app._engine.next(); // art1 → 2
    app._engine.next(); // b2 → 3
    assert.equal(app.currentBeat, 3);
    assert.equal(app.totalBeats, 4);
});

// ---------------------------------------------------------------------------
// Artifact panel state
// ---------------------------------------------------------------------------
console.log("\nartifact panel state");

test("openArtifact sets artifactOpen and _currentArtifact", function () {
    const app = makeApp(5);
    var beat = { type: "artifact", artifactTitle: "Test", artifactContent: "Content" };
    app.$refs.artifactPanelContent = {};
    app.openArtifact(beat);
    assert.equal(app.artifactOpen, true);
    assert.equal(app._currentArtifact, beat);
});

test("openArtifact pauses playback if playing", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = {};
    app._engine.play();
    assert.equal(app.playbackState, "PLAYING");
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.playbackState, "PAUSED");
    assert.equal(app.artifactOpen, true);
});

test("openArtifact does not change state if already paused", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = {};
    assert.equal(app.playbackState, "READY");
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.playbackState, "READY");
    assert.equal(app.artifactOpen, true);
});

test("closeArtifact resets artifactOpen and _currentArtifact", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = { innerHTML: "" };
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.artifactOpen, true);
    app.closeArtifact();
    assert.equal(app.artifactOpen, false);
    assert.equal(app._currentArtifact, null);
});

test("closeArtifact does not resume playback", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = { innerHTML: "" };
    app._engine.play();
    assert.equal(app.playbackState, "PLAYING");
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.playbackState, "PAUSED");
    app.closeArtifact();
    assert.equal(app.playbackState, "PAUSED", "closing artifact should NOT resume playback");
});

test("Escape key closes artifact panel", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = { innerHTML: "" };
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.artifactOpen, true);
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app.artifactOpen, false);
});

test("Escape key is no-op when artifact panel is closed", function () {
    const app = makeApp(5);
    assert.equal(app.artifactOpen, false);
    // Should not throw
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app.artifactOpen, false);
});

test("backToSessions resets artifact state and clears panel content", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = { innerHTML: "stale content" };
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    app.backToSessions();
    assert.equal(app.artifactOpen, false);
    assert.equal(app._currentArtifact, null);
    assert.equal(app.$refs.artifactPanelContent.innerHTML, "");
});

test("openArtifact calls renderArtifactPanel on renderer", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = {};
    resetRendererCalls();
    var beat = { type: "artifact", artifactTitle: "T", artifactContent: "C" };
    app.openArtifact(beat);
    assert.equal(rendererCalls.renderArtifactPanel.length, 1);
    assert.equal(rendererCalls.renderArtifactPanel[0], beat);
});

// ---------------------------------------------------------------------------
// Edit mode toggle
// ---------------------------------------------------------------------------
console.log("\nedit mode toggle");

test("editMode defaults to false", function () {
    const app = makeApp(5);
    assert.equal(app.editMode, false);
});

test("toggleEditMode flips editMode", function () {
    const app = makeApp(5);
    app.readOnly = false;
    app.toggleEditMode();
    assert.equal(app.editMode, true);
    app.toggleEditMode();
    assert.equal(app.editMode, false);
});

test("toggleEditMode dismisses context menu", function () {
    const app = makeApp(5);
    app.readOnly = false;
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0" };
    app.toggleEditMode();
    assert.equal(app._contextMenu, null);
});

test("backToSessions resets edit state", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0" };
    app.editToast = "test";
    app.backToSessions();
    assert.equal(app.editMode, false);
    assert.equal(app._contextMenu, null);
    assert.equal(app.editToast, "");
});

// ---------------------------------------------------------------------------
// Context menu — handleChatAreaClick
// ---------------------------------------------------------------------------
console.log("\ncontext menu — handleChatAreaClick");

function makeMockElement(beatId, type) {
    return {
        dataset: { beatId: String(beatId) },
        classList: {
            contains: function (cls) { return cls === type; },
        },
    };
}

function makeClickEvent(x, y, targetElement) {
    var stopped = false;
    return {
        clientX: x || 100,
        clientY: y || 100,
        stopPropagation: function () { stopped = true; },
        get propagationStopped() { return stopped; },
        target: {
            closest: function (sel) {
                // .inline-editor should always return null for standard beat clicks
                if (sel === ".inline-editor") return null;
                return targetElement || null;
            },
        },
    };
}

test("does nothing when editMode is off", function () {
    const app = makeApp(5);
    app.editMode = false;
    var el = makeMockElement(0, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));
    assert.equal(app._contextMenu, null);
});

test("shows context menu on beat click when editMode + paused", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._engine.next();
    assert.notEqual(app.playbackState, "PLAYING");
    var el = makeMockElement(0, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 200, el));
    assert.notEqual(app._contextMenu, null);
    assert.equal(app._contextMenu.beatId, "0");
    assert.equal(app._contextMenu.isAnnotation, false);
    assert.equal(app._contextMenu.items.length, 4);
});

test("beat context menu has correct items", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._engine.next();
    var el = makeMockElement(0, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));
    var actions = app._contextMenu.items.map(function (i) { return i.action; });
    assert.deepStrictEqual(actions, [
        "start-section", "add-note", "add-warning", "attach-artifact"
    ]);
});

test("annotation context menu has Edit and Delete items", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._engine.next();
    var el = makeMockElement("callout-cal-1", "callout");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));
    assert.notEqual(app._contextMenu, null);
    assert.equal(app._contextMenu.isAnnotation, true);
    assert.equal(app._contextMenu.items.length, 2);
    var actions = app._contextMenu.items.map(function (i) { return i.action; });
    assert.deepStrictEqual(actions, ["edit-annotation", "delete-annotation"]);
});

test("artifact-card click in editMode shows annotation menu", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._engine.next();
    var el = makeMockElement("artifact-art-1", "artifact-card");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));
    assert.notEqual(app._contextMenu, null);
    assert.equal(app._contextMenu.isAnnotation, true);
});

test("shows toast when editMode + PLAYING", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._engine.play();
    assert.equal(app.playbackState, "PLAYING");
    var el = makeMockElement(0, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));
    assert.equal(app._contextMenu, null);
    assert.equal(app.editToast, "Pause playback to edit");
});

test("dismisses menu when clicking empty space", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0" };
    // Click event with no target element (empty space)
    app.handleChatAreaClick(makeClickEvent(100, 100, null));
    assert.equal(app._contextMenu, null);
});

test("context menu position is clamped to viewport", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._engine.next();
    var el = makeMockElement(0, "bubble");
    // Click at far right/bottom edge
    app.handleChatAreaClick(makeClickEvent(9999, 9999, el));
    assert.ok(app._contextMenu.x < 9999, "x should be clamped");
    assert.ok(app._contextMenu.y < 9999, "y should be clamped");
    assert.ok(app._contextMenu.x >= 8, "x should not be negative");
    assert.ok(app._contextMenu.y >= 8, "y should not be negative");
});

test("Escape dismisses context menu before artifact panel", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = { innerHTML: "" };
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0" };
    app.artifactOpen = true;
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._contextMenu, null, "context menu should be dismissed");
    assert.equal(app.artifactOpen, true, "artifact panel should remain open");
});

test("Escape closes artifact panel when no context menu", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = { innerHTML: "" };
    app.artifactOpen = true;
    app._currentArtifact = {};
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app.artifactOpen, false);
});

test("dismissContextMenu clears _contextMenu", function () {
    const app = makeApp(5);
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0" };
    app.dismissContextMenu();
    assert.equal(app._contextMenu, null);
});

test("handleContextMenuAction dismisses menu", function () {
    const app = makeApp(5);
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0", isAnnotation: false };
    app.handleContextMenuAction("add-note");
    assert.equal(app._contextMenu, null);
});

// ---------------------------------------------------------------------------
// Edit mode — openArtifact interaction
// ---------------------------------------------------------------------------
console.log("\nedit mode — openArtifact interaction");

test("openArtifact is blocked when editMode is on", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = {};
    app.editMode = true;
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.artifactOpen, false, "panel should not open in edit mode");
    assert.equal(app._currentArtifact, null);
});

test("openArtifact works when editMode is off", function () {
    const app = makeApp(5);
    app.$refs.artifactPanelContent = {};
    app.editMode = false;
    app.openArtifact({ type: "artifact", artifactTitle: "X", artifactContent: "Y" });
    assert.equal(app.artifactOpen, true);
});

// ---------------------------------------------------------------------------
// Edit toast
// ---------------------------------------------------------------------------
console.log("\nedit toast");

test("_showEditToast sets editToast message", function () {
    const app = makeApp(5);
    app._showEditToast("Test message");
    assert.equal(app.editToast, "Test message");
});

test("_showEditToast sets a timeout handle for auto-clear", function () {
    const app = makeApp(5);
    app._showEditToast("Test");
    assert.equal(app.editToast, "Test");
    assert.notEqual(app._editToastTimeout, null, "timeout should be set");
    // Clean up timeout to prevent interference
    clearTimeout(app._editToastTimeout);
});

// ---------------------------------------------------------------------------
// Section creation — form and pending section
// ---------------------------------------------------------------------------
console.log("\nsection creation — form and pending section");

test("_sectionForm and _pendingSection default to null", function () {
    const app = makeApp(5);
    assert.equal(app._sectionForm, null);
    assert.equal(app._pendingSection, null);
});

test("handleContextMenuAction start-section opens form", function () {
    const app = makeApp(5);
    app._contextMenu = { beatId: "3", isAnnotation: false, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("start-section");
    assert.notEqual(app._sectionForm, null);
    assert.equal(app._sectionForm.beatId, 3);
    assert.equal(app._sectionForm.label, "");
    assert.equal(app._sectionForm.color, "blue");
    assert.equal(app._contextMenu, null, "menu should be dismissed");
});

test("submitSectionForm enters pending section mode", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 2, label: "Intro", color: "green" };
    app.submitSectionForm();
    assert.equal(app._sectionForm, null, "form should be cleared");
    assert.notEqual(app._pendingSection, null);
    assert.equal(app._pendingSection.startBeat, 2);
    assert.equal(app._pendingSection.label, "Intro");
    assert.equal(app._pendingSection.color, "green");
});

test("submitSectionForm trims label whitespace", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 0, label: "  Trimmed  ", color: "blue" };
    app.submitSectionForm();
    assert.equal(app._pendingSection.label, "Trimmed");
});

test("submitSectionForm blocks empty label", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 0, label: "   ", color: "blue" };
    app.submitSectionForm();
    assert.notEqual(app._sectionForm, null, "form should remain open");
    assert.equal(app._pendingSection, null, "should not enter pending mode");
});

test("cancelSectionForm clears form", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 0, label: "Test", color: "blue" };
    app.cancelSectionForm();
    assert.equal(app._sectionForm, null);
});

test("cancelPendingSection clears pending section", function () {
    const app = makeApp(5);
    app._pendingSection = { startBeat: 0, label: "Test", color: "blue" };
    app.cancelPendingSection();
    assert.equal(app._pendingSection, null);
});

test("Escape cancels section form", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 0, label: "Test", color: "blue" };
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._sectionForm, null);
});

test("Escape cancels pending section", function () {
    const app = makeApp(5);
    app._pendingSection = { startBeat: 0, label: "Test", color: "blue" };
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._pendingSection, null);
});

// Inline annotation editors — callout and artifact creation
// ---------------------------------------------------------------------------
console.log("\ninline annotation editors — callout and artifact creation");

/**
 * Create a mock chat area with a querySelector that finds beat elements.
 * Uses a simple registry of elements keyed by their beat ID selector.

// Annotation editing and deletion
// ---------------------------------------------------------------------------
console.log("\nannotation editing and deletion");

/**
 * Create a mock chat area with querySelector support for annotation elements.
 */
function makeMockChatArea() {
    var children = [];
    var area = {
        innerHTML: "",
        parentElement: {},
        _elements: {},
        querySelector: function (sel) {
            // Match [data-beat-id="X"].class or [data-beat-id="X"]
            var m = sel.match(/\[data-beat-id="([^"]+)"\](?:\.(\w+))?/);
            if (m) {
                var key = m[2] ? m[1] + "." + m[2] : m[1];
                return area._elements[key] || null;
            }
            return null;
        },
        appendChild: function (el) { children.push(el); },
        get children() { return children; },
    };
    return area;
}

function addBeatToChatArea(chatArea, beatId, type) {
    var inserted = [];
    var el = {
        dataset: { beatId: String(beatId) },
        classList: { contains: function (cls) { return cls === type; } },
        insertAdjacentElement: function (pos, child) { inserted.push({ pos: pos, child: child }); },
        _inserted: inserted,
    };
    chatArea._elements[beatId + "." + type] = el;
    return el;
}

test("_inlineEditor defaults to null", function () {
    const app = makeApp(5);
    assert.equal(app._inlineEditor, null);
});

test("add-note action opens callout editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 2, "bubble");
    app.$refs.chatArea = chatArea;

    app._contextMenu = { beatId: "2", isAnnotation: false, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("add-note");

    assert.notEqual(app._inlineEditor, null);
    assert.equal(app._inlineEditor.type, "callout");
    assert.equal(app._inlineEditor.beatId, 2);
    assert.equal(app._inlineEditor.style, "note");
    assert.equal(app._contextMenu, null, "menu should be dismissed");
});

test("add-warning action opens warning editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 3, "bubble");
    app.$refs.chatArea = chatArea;

    app._contextMenu = { beatId: "3", isAnnotation: false, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("add-warning");

    assert.notEqual(app._inlineEditor, null);
    assert.equal(app._inlineEditor.type, "callout");
    assert.equal(app._inlineEditor.style, "warning");
});

test("attach-artifact action opens artifact editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 1, "bubble");
    app.$refs.chatArea = chatArea;

    app._contextMenu = { beatId: "1", isAnnotation: false, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("attach-artifact");

    assert.notEqual(app._inlineEditor, null);
    assert.equal(app._inlineEditor.type, "artifact");
    assert.equal(app._inlineEditor.beatId, 1);
});

test("callout editor has textarea and buttons", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    assert.notEqual(app._inlineEditor.textarea, null);
    assert.notEqual(app._inlineEditor.errorMsg, null);
    assert.notEqual(app._inlineEditor.element, null);
});

test("artifact editor has title, desc, type, and content fields", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openArtifactEditor(0);
    assert.notEqual(app._inlineEditor.titleInput, null);
    assert.notEqual(app._inlineEditor.descInput, null);
    assert.notEqual(app._inlineEditor.typeSelect, null);
    assert.notEqual(app._inlineEditor.textarea, null);
});

test("_dismissInlineEditor removes element and clears state", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    assert.notEqual(app._inlineEditor, null);
    app._dismissInlineEditor();
    assert.equal(app._inlineEditor, null);
});

test("_saveCallout rejects empty content", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    app._inlineEditor.textarea.value = "   ";
    app._saveCallout();
    assert.notEqual(app._inlineEditor, null, "editor should stay open");
    assert.equal(app._inlineEditor.errorMsg.textContent, "Content cannot be empty");
});

test("_saveCallout creates annotation and dismisses editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    var beatEl = addBeatToChatArea(chatArea, 2, "bubble");
    app.$refs.chatArea = chatArea;
    saveCalls = 0;

    // Reset annotations for clean test
    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });

    app._openCalloutEditor(2, "warning");
    app._inlineEditor.textarea.value = "Watch out!";
    app._saveCallout();

    assert.equal(app._inlineEditor, null, "editor should be dismissed");
    var callouts = ClawbackAnnotations.getCallouts();
    var found = callouts.find(function (c) { return c.content === "Watch out!"; });
    assert.ok(found, "callout should exist");
    assert.equal(found.style, "warning");
    assert.equal(found.after_beat, 2);
    assert.ok(saveCalls > 0, "save should be called");
    // Verify rendered element was inserted after the beat
    assert.equal(beatEl._inserted.length, 2, "form + annotation inserted");
    assert.equal(beatEl._inserted[1].pos, "afterend", "annotation at afterend");
});

test("_saveArtifact rejects empty title", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openArtifactEditor(0);
    app._inlineEditor.titleInput.value = "";
    app._inlineEditor.textarea.value = "some content";
    app._saveArtifact();
    assert.notEqual(app._inlineEditor, null, "editor should stay open");
    assert.equal(app._inlineEditor.errorMsg.textContent, "Title cannot be empty");
});

test("_saveArtifact rejects empty content", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openArtifactEditor(0);
    app._inlineEditor.titleInput.value = "My Artifact";
    app._inlineEditor.textarea.value = "   ";
    app._saveArtifact();
    assert.notEqual(app._inlineEditor, null, "editor should stay open");
    assert.equal(app._inlineEditor.errorMsg.textContent, "Content cannot be empty");
});

test("_saveArtifact creates annotation and dismisses editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    var beatEl = addBeatToChatArea(chatArea, 3, "bubble");
    app.$refs.chatArea = chatArea;
    saveCalls = 0;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });

    app._openArtifactEditor(3);
    app._inlineEditor.titleInput.value = "Code Sample";
    app._inlineEditor.descInput.value = "A description";
    app._inlineEditor.typeSelect.value = "code";
    app._inlineEditor.textarea.value = "console.log('hi');";
    app._saveArtifact();

    assert.equal(app._inlineEditor, null, "editor should be dismissed");
    var artifacts = ClawbackAnnotations.getArtifacts();
    var found = artifacts.find(function (a) { return a.title === "Code Sample"; });
    assert.ok(found, "artifact should exist");
    assert.equal(found.content_type, "code");
    assert.equal(found.content, "console.log('hi');");
    assert.equal(found.after_beat, 3);
    assert.ok(saveCalls > 0, "save should be called");
    assert.equal(beatEl._inserted.length, 2, "form + annotation inserted");
    assert.equal(beatEl._inserted[1].pos, "afterend", "annotation at afterend");
});

function addElementToChatArea(chatArea, beatId, cssClass) {
    var inserted = [];
    var removed = false;
    var el = {
        dataset: { beatId: String(beatId) },
        classList: { contains: function (cls) { return cls === cssClass; } },
        insertAdjacentElement: function (pos, child) { inserted.push({ pos: pos, child: child }); },
        remove: function () { removed = true; },
        get _inserted() { return inserted; },
        get _removed() { return removed; },
        style: {},
    };
    chatArea._elements[beatId + "." + cssClass] = el;
    chatArea._elements[beatId] = el;
    return el;
}

test("_activeEditForm defaults to null", function () {
    const app = makeApp(5);
    assert.equal(app._activeEditForm, null);
});

test("_parseAnnotationId extracts callout ID", function () {
    const app = makeApp(5);
    var parsed = app._parseAnnotationId("callout-cal-3");
    assert.deepEqual(parsed, { annotationId: "cal-3", type: "callout" });
});

test("_parseAnnotationId extracts artifact ID", function () {
    const app = makeApp(5);
    var parsed = app._parseAnnotationId("artifact-art-7");
    assert.deepEqual(parsed, { annotationId: "art-7", type: "artifact" });
});

test("_parseAnnotationId returns null for non-annotation IDs", function () {
    const app = makeApp(5);
    assert.equal(app._parseAnnotationId("3"), null);
    assert.equal(app._parseAnnotationId(null), null);
    assert.equal(app._parseAnnotationId(""), null);
});

test("delete-annotation removes callout from data and DOM", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;
    saveCalls = 0;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(2, "note", "Test note");
    var domId = "callout-" + callout.id;
    var el = addElementToChatArea(chatArea, domId, "callout");

    app._contextMenu = { beatId: domId, isAnnotation: true, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("delete-annotation");

    assert.equal(el._removed, true, "DOM element should be removed");
    assert.equal(ClawbackAnnotations.getCallouts().length, 0, "callout should be deleted from data");
    assert.ok(saveCalls > 0, "save should be called");
    assert.equal(app.editToast, "Annotation deleted");
});

test("opening a new editor dismisses existing one", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    addBeatToChatArea(chatArea, 1, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    assert.equal(app._inlineEditor.beatId, 0);
    app._openCalloutEditor(1, "warning");
    assert.equal(app._inlineEditor.beatId, 1, "should be new editor");
});

test("Escape dismisses inline editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    assert.notEqual(app._inlineEditor, null);
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._inlineEditor, null);
});

test("Escape priority: form > pending > inline editor > context menu > artifact", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;
    app.$refs.artifactPanelContent = { innerHTML: "" };

    app._sectionForm = { beatId: 0, label: "T", color: "blue" };
    app._pendingSection = { startBeat: 0, label: "T", color: "blue" };
    app._openCalloutEditor(0, "note");

    var callout = ClawbackAnnotations.createCallout(2, "note", "Test note");
    var domId = "callout-" + callout.id;
    var el = addElementToChatArea(chatArea, domId, "callout");

    app._contextMenu = { beatId: domId, isAnnotation: true, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("delete-annotation");

    assert.equal(el._removed, true, "DOM element should be removed");
    assert.equal(ClawbackAnnotations.getCallouts().length, 0, "callout should be deleted from data");
    assert.ok(saveCalls > 0, "save should be called");
    assert.equal(app.editToast, "Annotation deleted");
});

test("delete-annotation removes artifact from data and DOM", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;
    saveCalls = 0;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var artifact = ClawbackAnnotations.createArtifact(1, "Title", "Desc", "markdown", "Content");
    var domId = "artifact-" + artifact.id;
    addElementToChatArea(chatArea, domId, "artifact-card");

    app._contextMenu = { beatId: domId, isAnnotation: true, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("delete-annotation");

    assert.equal(ClawbackAnnotations.getArtifacts().length, 0, "artifact should be deleted");
    assert.ok(saveCalls > 0, "save should be called");
});

test("deleteSection removes section and updates sidebar", function () {
    const app = makeApp();
    var annotations = {
        sections: [{ id: "sec-1", start_beat: 0, end_beat: 3, label: "Intro", color: "blue" }],
        callouts: [],
        artifacts: [],
    };
    app.startPlayback(makeBeats(8), "Test", annotations);
    assert.equal(app.sectionList.length, 1);
    assert.equal(app.showSections, true);
    saveCalls = 0;

    app.deleteSection("sec-1");

    assert.equal(app.sectionList.length, 0, "section should be removed from list");
    assert.equal(app.showSections, false, "sidebar should be hidden");
    assert.ok(saveCalls > 0, "save should be called");
});

test("edit-annotation opens callout edit form pre-populated", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(2, "warning", "Original text");
    var domId = "callout-" + callout.id;
    addElementToChatArea(chatArea, domId, "callout");

    app._contextMenu = { beatId: domId, isAnnotation: true, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("edit-annotation");

    assert.notEqual(app._activeEditForm, null, "edit form should be open");
    assert.equal(app._activeEditForm.type, "callout");
    assert.equal(app._activeEditForm.annotationId, callout.id);
    assert.equal(app._activeEditForm.textarea.value, "Original text");
});

test("edit-annotation opens artifact edit form pre-populated", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var artifact = ClawbackAnnotations.createArtifact(1, "My Title", "My Desc", "code", "var x = 1;");
    var domId = "artifact-" + artifact.id;
    addElementToChatArea(chatArea, domId, "artifact-card");

    app._contextMenu = { beatId: domId, isAnnotation: true, items: [], x: 0, y: 0 };
    app.handleContextMenuAction("edit-annotation");

    assert.notEqual(app._activeEditForm, null, "edit form should be open");
    assert.equal(app._activeEditForm.type, "artifact");
    assert.equal(app._activeEditForm.titleInput.value, "My Title");
    assert.equal(app._activeEditForm.descInput.value, "My Desc");
    assert.equal(app._activeEditForm.typeSelect.value, "code");
    assert.equal(app._activeEditForm.textarea.value, "var x = 1;");
});

test("_saveCalloutEdit updates annotation data", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;
    saveCalls = 0;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(2, "note", "Old text");
    var domId = "callout-" + callout.id;
    addElementToChatArea(chatArea, domId, "callout");

    app._openCalloutEditForm(domId, callout);
    app._activeEditForm.textarea.value = "New text";
    app._saveCalloutEdit();

    assert.equal(app._activeEditForm, null, "form should be dismissed");
    var updated = ClawbackAnnotations.getCallouts()[0];
    assert.equal(updated.content, "New text");
    assert.ok(saveCalls > 0, "save should be called");
});

test("_saveCalloutEdit rejects empty content", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "Old");
    var domId = "callout-" + callout.id;
    addElementToChatArea(chatArea, domId, "callout");

    app._openCalloutEditForm(domId, callout);
    app._activeEditForm.textarea.value = "   ";
    app._saveCalloutEdit();

    assert.notEqual(app._activeEditForm, null, "form should stay open");
    assert.equal(app._activeEditForm.errorMsg.textContent, "Content cannot be empty");
});

test("_saveArtifactEdit updates annotation data", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;
    saveCalls = 0;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var artifact = ClawbackAnnotations.createArtifact(1, "Old Title", "Old Desc", "markdown", "Old content");
    var domId = "artifact-" + artifact.id;
    addElementToChatArea(chatArea, domId, "artifact-card");

    app._openArtifactEditForm(domId, artifact);
    app._activeEditForm.titleInput.value = "New Title";
    app._activeEditForm.descInput.value = "New Desc";
    app._activeEditForm.typeSelect.value = "code";
    app._activeEditForm.textarea.value = "New content";
    app._saveArtifactEdit();

    assert.equal(app._activeEditForm, null, "form should be dismissed");
    var updated = ClawbackAnnotations.getArtifacts()[0];
    assert.equal(updated.title, "New Title");
    assert.equal(updated.description, "New Desc");
    assert.equal(updated.content_type, "code");
    assert.equal(updated.content, "New content");
    assert.ok(saveCalls > 0, "save should be called");
});

test("_saveArtifactEdit rejects empty title", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var artifact = ClawbackAnnotations.createArtifact(0, "T", "", "markdown", "C");
    var domId = "artifact-" + artifact.id;
    addElementToChatArea(chatArea, domId, "artifact-card");

    app._openArtifactEditForm(domId, artifact);
    app._activeEditForm.titleInput.value = "";
    app._saveArtifactEdit();

    assert.notEqual(app._activeEditForm, null, "form should stay open");
    assert.equal(app._activeEditForm.errorMsg.textContent, "Title cannot be empty");
});

test("_dismissEditForm restores hidden card", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "Text");
    var domId = "callout-" + callout.id;
    var el = addElementToChatArea(chatArea, domId, "callout");

    app._openCalloutEditForm(domId, callout);
    assert.equal(el.style.display, "none", "card should be hidden");
    app._dismissEditForm();
    assert.equal(el.style.display, "", "card should be restored");
    assert.equal(app._activeEditForm, null);
});

test("Escape dismisses edit form", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "Text");
    var domId = "callout-" + callout.id;
    addElementToChatArea(chatArea, domId, "callout");

    app._openCalloutEditForm(domId, callout);
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._activeEditForm, null, "form should be dismissed");
});

test("Escape priority: edit form > context menu > artifact", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;
    app.$refs.artifactPanelContent = { innerHTML: "" };

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "Text");
    var domId = "callout-" + callout.id;
    addElementToChatArea(chatArea, domId, "callout");

    app._openCalloutEditForm(domId, callout);
    app._contextMenu = { x: 0, y: 0, items: [], beatId: "0" };
    app.artifactOpen = true;

    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._activeEditForm, null, "edit form dismissed first");
    assert.notEqual(app._contextMenu, null);

    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._contextMenu, null, "context menu dismissed second");

    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app.artifactOpen, false, "artifact dismissed third");
});

test("Escape works from INPUT elements for form dismissal", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 0, label: "T", color: "blue" };
    var evt = makeKeyEvent("Escape", { target: { tagName: "INPUT" } });
    app.handleKeydown(evt);
    assert.equal(app._sectionForm, null, "form should be dismissed even from input");
});

// ---------------------------------------------------------------------------
// Section creation — completing via second beat click
// ---------------------------------------------------------------------------
console.log("\nsection creation — completing via second beat click");

test("clicking a beat in pending mode creates a section", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test");
    app._engine.skipToEnd();
    app.editMode = true;
    app._pendingSection = { startBeat: 1, label: "My Section", color: "green" };
    saveCalls = 0;

    var el = makeMockElement(4, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));

    assert.equal(app._pendingSection, null, "pending should be cleared");
    // Section should exist in annotations
    var sections = ClawbackAnnotations.getSections();
    var found = sections.find(function (s) { return s.label === "My Section"; });
    assert.ok(found, "section should exist in annotations");
    assert.equal(found.start_beat, 1);
    assert.equal(found.end_beat, 4);
    assert.equal(found.color, "green");
    assert.ok(saveCalls > 0, "save should be called");
});

test("section auto-swaps when end < start", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test");
    app._engine.skipToEnd();
    app.editMode = true;
    app._pendingSection = { startBeat: 5, label: "Reversed", color: "blue" };

    var el = makeMockElement(2, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));

    var sections = ClawbackAnnotations.getSections();
    var found = sections.find(function (s) { return s.label === "Reversed"; });
    assert.ok(found, "section should exist");
    assert.equal(found.start_beat, 2, "start should be the smaller value");
    assert.equal(found.end_beat, 5, "end should be the larger value");
});

test("section creation updates sidebar and progress bar", function () {
    const app = makeApp();
    app.startPlayback(makeBeats(8), "Test");
    app._engine.skipToEnd();
    app.editMode = true;
    assert.equal(app.showSections, false);
    assert.equal(app.sectionList.length, 0);

    app._pendingSection = { startBeat: 0, label: "New", color: "blue" };
    var el = makeMockElement(3, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));

    assert.equal(app.showSections, true, "sidebar should be shown");
    assert.ok(app.sectionList.length > 0, "sectionList should have entries");
    assert.ok(app.progressSegments.length > 1, "progress should have segments");
});

test("pending mode ignores clicks on non-bubble elements", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._pendingSection = { startBeat: 0, label: "Test", color: "blue" };
    // Click with no target
    app.handleChatAreaClick(makeClickEvent(100, 100, null));
    assert.notEqual(app._pendingSection, null, "pending should remain");
});

test("pending mode shows toast when playback is PLAYING", function () {
    const app = makeApp(5);
    app.editMode = true;
    app._pendingSection = { startBeat: 0, label: "Test", color: "blue" };
    app.playbackState = "PLAYING";
    var el = makeMockElement(3, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));
    assert.notEqual(app._pendingSection, null, "pending should remain");
    assert.equal(app.editToast, "Pause playback to edit");
});

test("save failure calls catch handler (save is invoked)", function () {
    const app = makeApp(5);
    app.editMode = true;
    var saveCalled = false;
    var origSave = ClawbackAnnotations.save;
    ClawbackAnnotations.save = function () { saveCalled = true; return Promise.reject(new Error("fail")); };

    app._pendingSection = { startBeat: 0, label: "Fail Test", color: "blue" };
    var el = makeMockElement(3, "bubble");
    app.handleChatAreaClick(makeClickEvent(100, 100, el));

    assert.ok(saveCalled, "save should have been called");
    assert.equal(app._pendingSection, null, "pending should be cleared");
    ClawbackAnnotations.save = origSave;
});

test("backToSessions resets section form and pending state", function () {
    const app = makeApp(5);
    app._sectionForm = { beatId: 0, label: "T", color: "blue" };
    app._pendingSection = { startBeat: 0, label: "T", color: "blue" };
    app.backToSessions();
    assert.equal(app._sectionForm, null);
    assert.equal(app._pendingSection, null);
});

// ---------------------------------------------------------------------------
// getColorPalette
// ---------------------------------------------------------------------------
console.log("\ngetColorPalette");

test("returns array of color objects with key and hex", function () {
    const app = makeApp(5);
    var palette = app.getColorPalette();
    assert.ok(palette.length > 0, "palette should not be empty");
    assert.equal(palette[0].key, "blue");
    assert.equal(palette[0].hex, ANNOTATION_COLORS.blue);
});

test("palette includes all ANNOTATION_COLORS keys", function () {
    const app = makeApp(5);
    var palette = app.getColorPalette();
    var keys = palette.map(function (c) { return c.key; });
    Object.keys(ANNOTATION_COLORS).forEach(function (k) {
        assert.ok(keys.indexOf(k) !== -1, "should include " + k);
    });
});

test("Escape works from TEXTAREA elements for editor dismissal", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    var evt = makeKeyEvent("Escape", { target: { tagName: "TEXTAREA" } });
    app.handleKeydown(evt);
    assert.equal(app._inlineEditor, null, "editor should be dismissed from textarea");
});

test("backToSessions dismisses inline editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    app._openCalloutEditor(0, "note");
    app.backToSessions();
    assert.equal(app._inlineEditor, null);
});

test("clicking empty space in chat area dismisses inline editor", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;
    app.editMode = true;

    app._openCalloutEditor(0, "note");
    // Click on empty space (no element match)
    app.handleChatAreaClick(makeClickEvent(100, 100, null));
    assert.equal(app._inlineEditor, null);
});

test("clicks inside inline editor do not trigger context menu", function () {
    const app = makeApp(5);
    app.editMode = true;
    // Simulate click where closest(".inline-editor") returns truthy
    var evt = {
        clientX: 100,
        clientY: 100,
        stopPropagation: function () {},
        target: {
            closest: function (sel) {
                if (sel === ".inline-editor") return {};
                return null;
            },
        },
    };
    app.handleChatAreaClick(evt);
    assert.equal(app._contextMenu, null, "no context menu should open");
});

test("callout multi-line content is preserved", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });

    app._openCalloutEditor(0, "note");
    app._inlineEditor.textarea.value = "Line 1\nLine 2\nLine 3";
    app._saveCallout();

    var callouts = ClawbackAnnotations.getCallouts();
    assert.equal(callouts[0].content, "Line 1\nLine 2\nLine 3");
});

test("artifact description is optional", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });

    app._openArtifactEditor(0);
    app._inlineEditor.titleInput.value = "No Desc";
    app._inlineEditor.descInput.value = "";
    app._inlineEditor.textarea.value = "content here";
    app._saveArtifact();

    var artifacts = ClawbackAnnotations.getArtifacts();
    var found = artifacts.find(function (a) { return a.title === "No Desc"; });
    assert.ok(found, "artifact should be created");
    assert.equal(found.description, "");
});

test("unique IDs are generated for callouts", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });

    app._openCalloutEditor(0, "note");
    app._inlineEditor.textarea.value = "First";
    app._saveCallout();

    app._openCalloutEditor(0, "note");
    app._inlineEditor.textarea.value = "Second";
    app._saveCallout();

    var callouts = ClawbackAnnotations.getCallouts();
    assert.notEqual(callouts[0].id, callouts[1].id, "IDs should be unique");
    assert.ok(callouts[0].id.startsWith("cal-"), "should have cal- prefix");
    assert.ok(callouts[1].id.startsWith("cal-"), "should have cal- prefix");
});

test("unique IDs are generated for artifacts", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    addBeatToChatArea(chatArea, 0, "bubble");
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });

    app._openArtifactEditor(0);
    app._inlineEditor.titleInput.value = "First";
    app._inlineEditor.textarea.value = "content";
    app._saveArtifact();

    app._openArtifactEditor(0);
    app._inlineEditor.titleInput.value = "Second";
    app._inlineEditor.textarea.value = "content";
    app._saveArtifact();

    var artifacts = ClawbackAnnotations.getArtifacts();
    assert.notEqual(artifacts[0].id, artifacts[1].id, "IDs should be unique");
    assert.ok(artifacts[0].id.startsWith("art-"), "should have art- prefix");
    assert.ok(artifacts[1].id.startsWith("art-"), "should have art- prefix");
});

test("backToSessions dismisses edit form", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "T");
    addElementToChatArea(chatArea, "callout-" + callout.id, "callout");

    app._openCalloutEditForm("callout-" + callout.id, callout);
    app.backToSessions();
    assert.equal(app._activeEditForm, null);
});

test("clicking empty space dismisses edit form", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;
    app.editMode = true;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "T");
    addElementToChatArea(chatArea, "callout-" + callout.id, "callout");

    app._openCalloutEditForm("callout-" + callout.id, callout);
    app.handleChatAreaClick(makeClickEvent(100, 100, null));
    assert.equal(app._activeEditForm, null);
});

test("_findAnnotation finds callout by ID", function () {
    const app = makeApp(5);
    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "Find me");
    var found = app._findAnnotation(callout.id);
    assert.ok(found);
    assert.equal(found.content, "Find me");
});

test("_findAnnotation returns null for unknown ID", function () {
    const app = makeApp(5);
    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    assert.equal(app._findAnnotation("nonexistent"), null);
});

test("transport buttons dismiss edit form", function () {
    const app = makeApp(5);
    var chatArea = makeMockChatArea();
    app.$refs.chatArea = chatArea;

    ClawbackAnnotations.init({ sections: [], callouts: [], artifacts: [] });
    var callout = ClawbackAnnotations.createCallout(0, "note", "T");
    addElementToChatArea(chatArea, "callout-" + callout.id, "callout");

    // nextBeat dismisses
    app._openCalloutEditForm("callout-" + callout.id, callout);
    app.nextBeat();
    assert.equal(app._activeEditForm, null, "nextBeat should dismiss");

    // previousBeat dismisses
    app._openCalloutEditForm("callout-" + callout.id, callout);
    app.previousBeat();
    assert.equal(app._activeEditForm, null, "previousBeat should dismiss");

    // skipToStart dismisses
    app._openCalloutEditForm("callout-" + callout.id, callout);
    app.skipToStart();
    assert.equal(app._activeEditForm, null, "skipToStart should dismiss");

    // skipToEnd dismisses
    app._openCalloutEditForm("callout-" + callout.id, callout);
    app.skipToEnd();
    assert.equal(app._activeEditForm, null, "skipToEnd should dismiss");
});

// ---------------------------------------------------------------------------
// Upload form — openUploadForm, cancelUpload, submitUpload
// ---------------------------------------------------------------------------
console.log("\nUpload form");

function makeFakeFile(name) {
    return { name: name || "test-session.jsonl" };
}

function makeFileEvent(file) {
    var cleared = false;
    return {
        target: {
            files: [file],
            get value() { return cleared ? "" : "C:\\fakepath\\" + file.name; },
            set value(v) { cleared = (v === ""); },
        },
    };
}

test("openUploadForm sets _uploadForm state", function () {
    var app = makeApp();
    app.readOnly = false;
    var file = makeFakeFile("my-session.jsonl");
    app.openUploadForm(makeFileEvent(file));

    assert.notEqual(app._uploadForm, null);
    assert.equal(app._uploadForm.file, file);
    assert.equal(app._uploadForm.title, "my session");
    assert.equal(app._uploadForm.description, "");
    assert.equal(app._uploadForm.tags, "");
    assert.equal(app._uploadForm.error, "");
    assert.equal(app._uploadForm.uploading, false);
});

test("openUploadForm strips .jsonl and replaces hyphens/underscores", function () {
    var app = makeApp();
    app.readOnly = false;
    app.openUploadForm(makeFileEvent(makeFakeFile("cool_demo-session.jsonl")));
    assert.equal(app._uploadForm.title, "cool demo session");
});

test("openUploadForm clears file input value", function () {
    var app = makeApp();
    app.readOnly = false;
    var evt = makeFileEvent(makeFakeFile());
    app.openUploadForm(evt);
    assert.equal(evt.target.value, "");
});

test("openUploadForm no-ops when no file selected", function () {
    var app = makeApp();
    app.openUploadForm({ target: { files: [] } });
    assert.equal(app._uploadForm, null);
});

test("cancelUpload resets _uploadForm to null", function () {
    var app = makeApp();
    app.readOnly = false;
    app.openUploadForm(makeFileEvent(makeFakeFile()));
    assert.notEqual(app._uploadForm, null);
    app.cancelUpload();
    assert.equal(app._uploadForm, null);
});

test("submitUpload rejects empty title", function () {
    var app = makeApp();
    app.readOnly = false;
    app.openUploadForm(makeFileEvent(makeFakeFile()));
    app._uploadForm.title = "   ";
    app.submitUpload();
    assert.notEqual(app._uploadForm, null, "form should stay open");
    assert.equal(app._uploadForm.error, "Title is required");
    assert.equal(app._uploadForm.uploading, false);
});

test("submitUpload no-ops when _uploadForm is null", function () {
    var app = makeApp();
    // Should not throw
    app.submitUpload();
});

test("Escape dismisses upload form in picker view", function () {
    var app = makeApp();
    app.readOnly = false;
    app.view = "picker";
    app.openUploadForm(makeFileEvent(makeFakeFile()));
    assert.notEqual(app._uploadForm, null);
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app._uploadForm, null);
});

test("Escape in picker view is no-op when no upload form open", function () {
    var app = makeApp();
    app.view = "picker";
    // Should not throw
    app.handleKeydown(makeKeyEvent("Escape"));
});

test("_uploadForm defaults to null", function () {
    var app = makeApp();
    assert.equal(app._uploadForm, null);
});

// ---------------------------------------------------------------------------
// Tour (coachmarks)
// ---------------------------------------------------------------------------
console.log("\nTour");

test("startTour sets tourActive and tourStep", function () {
    var app = makeApp(5);
    app.startTour();
    assert.equal(app.tourActive, true);
    assert.equal(app.tourStep, 0);
});

test("tourNext advances step", function () {
    var app = makeApp(5);
    app.startTour();
    app.tourNext();
    assert.equal(app.tourStep, 1);
});

test("tourNext on last step ends tour", function () {
    var app = makeApp(5);
    app.startTour();
    app.tourStep = app._tourSteps.length - 1;
    app.tourNext();
    assert.equal(app.tourActive, false);
});

test("tourPrev goes back", function () {
    var app = makeApp(5);
    app.startTour();
    app.tourNext();
    app.tourNext();
    app.tourPrev();
    assert.equal(app.tourStep, 1);
});

test("tourPrev does not go below 0", function () {
    var app = makeApp(5);
    app.startTour();
    app.tourPrev();
    assert.equal(app.tourStep, 0);
});

test("endTour sets tourActive false", function () {
    var app = makeApp(5);
    app.startTour();
    app.endTour();
    assert.equal(app.tourActive, false);
});

test("startTour sets localStorage flag", function () {
    localStorage.clear();
    var app = makeApp(5);
    app.startTour();
    assert.equal(localStorage.getItem("clawback_toured"), "1");
});

test("startTour dismisses glow", function () {
    var app = makeApp(5);
    app._tourShowGlow = true;
    app.startTour();
    assert.equal(app._tourShowGlow, false);
});

test("_initTourGlow sets glow when no localStorage flag", function () {
    localStorage.clear();
    var app = makeApp(5);
    app._initTourGlow();
    assert.equal(app._tourShowGlow, true);
});

test("_initTourGlow does not set glow when flag exists", function () {
    localStorage.setItem("clawback_toured", "1");
    var app = makeApp(5);
    app._initTourGlow();
    assert.equal(app._tourShowGlow, false);
});

test("_dismissGlow clears glow", function () {
    var app = makeApp(5);
    app._tourShowGlow = true;
    app._dismissGlow();
    assert.equal(app._tourShowGlow, false);
});

test("getCurrentTourStep returns null when tour inactive", function () {
    var app = makeApp(5);
    assert.equal(app.getCurrentTourStep(), null);
});

test("getCurrentTourStep returns step when active", function () {
    var app = makeApp(5);
    app.startTour();
    var step = app.getCurrentTourStep();
    assert.equal(step.title, "Transport Controls");
});

test("tour has 5 steps", function () {
    var app = makeApp(5);
    assert.equal(app._tourSteps.length, 5);
});

test("Escape key closes tour", function () {
    var app = makeApp(5);
    app.view = "playback";
    app.startTour();
    assert.equal(app.tourActive, true);
    app.handleKeydown({ code: "Escape", target: { tagName: "DIV" } });
    assert.equal(app.tourActive, false);
});

test("startTour closes artifact panel", function () {
    var app = makeApp(5);
    app.artifactOpen = true;
    app.startTour();
    assert.equal(app.artifactOpen, false);
});

test("startTour dismisses context menu", function () {
    var app = makeApp(5);
    app._contextMenu = { x: 10, y: 10, items: [] };
    app.startTour();
    assert.equal(app._contextMenu, null);
});

test("getTourRect returns null for missing target element", function () {
    var app = makeApp(5);
    app.startTour();
    // querySelector mock returns null for unknown selectors
    var rect = app.getTourRect();
    assert.equal(rect, null);
});

test("endTour removes resize handler", function () {
    var app = makeApp(5);
    app.startTour();
    assert.notEqual(app._tourResizeHandler, null);
    app.endTour();
    assert.equal(app._tourResizeHandler, null);
});

test("startTour twice does not leak resize handlers", function () {
    _windowListeners = {};
    var app = makeApp(5);
    app.startTour();
    app.startTour();
    assert.equal((_windowListeners.resize || []).length, 1, "only one resize listener should be registered");
    app.endTour();
    assert.equal((_windowListeners.resize || []).length, 0, "listener should be removed after endTour");
});

// ---------------------------------------------------------------------------
// Search tests
// ---------------------------------------------------------------------------

test("searchOpen defaults to false", function () {
    const app = makeApp(5);
    assert.equal(app.searchOpen, false);
});

test("openSearch sets searchOpen and pauses playback", function () {
    const app = makeApp(5);
    app.$nextTick = function (fn) { fn.call(app); };
    app.$refs = { searchInput: { focus: function () {} } };
    app.playbackState = "PLAYING";
    app.openSearch();
    assert.equal(app.searchOpen, true);
});

test("closeSearch clears all search state", function () {
    const app = makeApp(5);
    app.searchOpen = true;
    app.searchQuery = "test";
    app.searchResults = [{ beatIndex: 0 }];
    app.searchSelectedIndex = 0;
    app.closeSearch();
    assert.equal(app.searchOpen, false);
    assert.equal(app.searchQuery, "");
    assert.equal(app.searchResults.length, 0);
    assert.equal(app.searchSelectedIndex, -1);
});

test("performSearch populates results from engine beats", function () {
    const app = makeApp(5);
    // Simulate engine with beats
    app._engine = {
        beats: [
            { id: 0, type: "user_message", content: "hello world", category: "direct", group_id: null },
            { id: 1, type: "assistant_message", content: "goodbye world", category: "direct", group_id: null },
        ],
        pause: function () {},
        jumpToBeat: function () {},
    };
    app.searchQuery = "hello";
    app.performSearch();
    assert.equal(app.searchResults.length, 1);
    assert.equal(app.searchResults[0].beatId, 0);
    assert.equal(app.searchSelectedIndex, 0);
});

test("performSearch clears results for empty query", function () {
    const app = makeApp(5);
    app._engine = { beats: [{ id: 0, type: "user_message", content: "hello", category: "direct", group_id: null }] };
    app.searchQuery = "";
    app.performSearch();
    assert.equal(app.searchResults.length, 0);
    assert.equal(app.searchSelectedIndex, -1);
});

test("/ key opens search in playback view", function () {
    const app = makeApp(5);
    app.$nextTick = function (fn) { fn.call(app); };
    app.$refs = { searchInput: { focus: function () {} } };
    app.view = "playback";
    var evt = makeKeyEvent("Slash");
    app.handleKeydown(evt);
    assert.equal(app.searchOpen, true);
    assert.equal(evt.defaultPrevented, true);
});

test("Escape closes search when open", function () {
    const app = makeApp(5);
    app.view = "playback";
    app.searchOpen = true;
    app.handleKeydown(makeKeyEvent("Escape"));
    assert.equal(app.searchOpen, false);
});

test("backToSessions clears search state", function () {
    const app = makeApp(5);
    app.searchOpen = true;
    app.searchQuery = "test";
    app.searchResults = [{ beatIndex: 0 }];
    app.searchSelectedIndex = 0;
    app.backToSessions();
    assert.equal(app.searchOpen, false);
    assert.equal(app.searchQuery, "");
    assert.equal(app.searchResults.length, 0);
    assert.equal(app.searchSelectedIndex, -1);
});

test("searchNext wraps around and jumps", function () {
    const app = makeApp(5);
    app.$nextTick = function (fn) { fn.call(app); };
    app._engine = { beats: [], jumpToBeat: function () {}, pause: function () {} };
    app.searchResults = [{ beatIndex: 0, beatId: 0 }, { beatIndex: 1, beatId: 1 }, { beatIndex: 2, beatId: 2 }];
    app.searchSelectedIndex = 2;
    app.searchNext();
    assert.equal(app.searchSelectedIndex, 0);
});

test("searchPrev wraps around and jumps", function () {
    const app = makeApp(5);
    app.$nextTick = function (fn) { fn.call(app); };
    app._engine = { beats: [], jumpToBeat: function () {}, pause: function () {} };
    app.searchResults = [{ beatIndex: 0, beatId: 0 }, { beatIndex: 1, beatId: 1 }, { beatIndex: 2, beatId: 2 }];
    app.searchSelectedIndex = 0;
    app.searchPrev();
    assert.equal(app.searchSelectedIndex, 2);
});

test("getSearchSnippet returns HTML with mark tag", function () {
    const app = makeApp(5);
    app.searchQuery = "hello";
    var result = { content: "say hello world", beatIndex: 0 };
    var html = app.getSearchSnippet(result);
    assert.ok(html.indexOf("<mark>") !== -1, "should contain <mark> tag");
    assert.ok(html.indexOf("hello") !== -1, "should contain match text");
});

test("getSearchSnippet escapes HTML in content", function () {
    const app = makeApp(5);
    app.searchQuery = "script";
    var result = { content: "<script>alert('xss')</script>", beatIndex: 0 };
    var html = app.getSearchSnippet(result);
    assert.ok(html.indexOf("<script>") === -1, "should not contain raw <script> tag");
    assert.ok(html.indexOf("&lt;") !== -1, "should escape angle brackets");
});

// ---------------------------------------------------------------------------
// Read-only mode tests
// ---------------------------------------------------------------------------

test("readOnly defaults to true (fail-closed)", function () {
    const app = makeApp(5);
    assert.equal(app.readOnly, true);
});

test("toggleEditMode is a no-op when readOnly is true", function () {
    const app = makeApp(5);
    app.readOnly = true;
    app.toggleEditMode();
    assert.equal(app.editMode, false, "editMode must stay false in read-only mode");
});

test("toggleEditMode works when readOnly is false", function () {
    const app = makeApp(5);
    app.readOnly = false;
    app.toggleEditMode();
    assert.equal(app.editMode, true, "editMode should toggle when not read-only");
});

test("openUploadForm is a no-op when readOnly is true", function () {
    var app = makeApp();
    app.readOnly = true;
    app.openUploadForm(makeFileEvent(makeFakeFile()));
    assert.equal(app._uploadForm, null, "upload form must not open in read-only mode");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
