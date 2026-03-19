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

test("resets innerWorkingsMode to expanded", function () {
    const app = makeApp(5);
    app.innerWorkingsMode = "collapsed";
    app.startPlayback(makeBeats(3), "Test2");
    assert.equal(app.innerWorkingsMode, "expanded");
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
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
