/**
 * Clawback — Unit tests for the playback engine.
 *
 * Run with: node tests/unit/js/test_playback.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");
const { PlaybackState, PlaybackEngine } = require("../../../app/static/js/playback.js");

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

function makeBeat(id, opts = {}) {
    return {
        id,
        type: opts.type || "assistant_message",
        category: opts.category || "direct",
        content: opts.content || "test content",
        metadata: {},
        duration: opts.duration !== undefined ? opts.duration : 2.0,
        group_id: opts.group_id || null,
    };
}

function makeInnerBeat(id, opts = {}) {
    return makeBeat(id, {
        type: opts.type || "thinking",
        category: "inner_working",
        ...opts,
    });
}

// ---------------------------------------------------------------------------
// PlaybackState
// ---------------------------------------------------------------------------
console.log("\nPlaybackState");

test("has all five states", () => {
    assert.equal(PlaybackState.READY, "READY");
    assert.equal(PlaybackState.PLAYING, "PLAYING");
    assert.equal(PlaybackState.PAUSED, "PAUSED");
    assert.equal(PlaybackState.SCROLL_PAUSED, "SCROLL_PAUSED");
    assert.equal(PlaybackState.COMPLETE, "COMPLETE");
});

test("is frozen (immutable)", () => {
    assert.ok(Object.isFrozen(PlaybackState));
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
console.log("\nConstructor");

test("initial state is READY", () => {
    const engine = new PlaybackEngine({ beats: [makeBeat(0)] });
    assert.equal(engine.state, PlaybackState.READY);
});

test("currentIndex starts at 0", () => {
    const engine = new PlaybackEngine({ beats: [makeBeat(0)] });
    assert.equal(engine.currentIndex, 0);
});

test("default speed is 1.0", () => {
    const engine = new PlaybackEngine();
    assert.equal(engine.speed, 1.0);
});

test("default innerWorkingsMode is expanded", () => {
    const engine = new PlaybackEngine();
    assert.equal(engine.innerWorkingsMode, "expanded");
});

test("handles construction with no arguments", () => {
    const engine = new PlaybackEngine();
    assert.equal(engine.state, PlaybackState.READY);
    assert.equal(engine.beats.length, 0);
});

// ---------------------------------------------------------------------------
// play()
// ---------------------------------------------------------------------------
console.log("\nplay()");

test("renders first beat synchronously", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.play();
    assert.equal(rendered.length, 1, "first beat should render immediately");
    assert.equal(rendered[0].id, 0);
    engine.pause();
});

test("transitions to PLAYING", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.play();
    assert.equal(engine.state, PlaybackState.PLAYING);
    engine.pause();
});

test("fires onStateChange with PLAYING", () => {
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onStateChange: (newState, oldState) => transitions.push({ newState, oldState }),
    });
    engine.play();
    assert.equal(transitions.length, 1);
    assert.equal(transitions[0].newState, PlaybackState.PLAYING);
    assert.equal(transitions[0].oldState, PlaybackState.READY);
    engine.pause();
});

test("no-op when COMPLETE", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.skipToEnd();
    const countAfterComplete = rendered.length;
    engine.play();
    assert.equal(rendered.length, countAfterComplete, "should not render more beats");
    assert.equal(engine.state, PlaybackState.COMPLETE);
});

test("no-op when already PLAYING", () => {
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onStateChange: (newState) => transitions.push(newState),
    });
    engine.play();
    const countAfterFirst = transitions.length;
    engine.play(); // should be no-op
    assert.equal(transitions.length, countAfterFirst);
    engine.pause();
});

test("no-op with empty beats", () => {
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [],
        onStateChange: () => transitions.push(true),
    });
    engine.play();
    assert.equal(transitions.length, 0);
    assert.equal(engine.state, PlaybackState.READY);
});

test("transitions to COMPLETE if only one beat", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.play();
    assert.equal(rendered.length, 1);
    assert.equal(engine.state, PlaybackState.COMPLETE);
});

// ---------------------------------------------------------------------------
// pause()
// ---------------------------------------------------------------------------
console.log("\npause()");

test("transitions from PLAYING to PAUSED", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.play();
    engine.pause();
    assert.equal(engine.state, PlaybackState.PAUSED);
});

test("no-op when not PLAYING", () => {
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
        onStateChange: () => transitions.push(true),
    });
    engine.pause();
    assert.equal(transitions.length, 0);
    assert.equal(engine.state, PlaybackState.READY);
});

// ---------------------------------------------------------------------------
// scrollPause()
// ---------------------------------------------------------------------------
console.log("\nscrollPause()");

test("transitions from PLAYING to SCROLL_PAUSED", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.play();
    engine.scrollPause();
    assert.equal(engine.state, PlaybackState.SCROLL_PAUSED);
});

test("no-op when not PLAYING", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
    });
    engine.scrollPause();
    assert.equal(engine.state, PlaybackState.READY);
});

// ---------------------------------------------------------------------------
// play() from paused states
// ---------------------------------------------------------------------------
console.log("\nplay() resume");

test("resumes from PAUSED to PLAYING", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
    });
    engine.play();
    engine.pause();
    assert.equal(engine.state, PlaybackState.PAUSED);
    engine.play();
    assert.equal(engine.state, PlaybackState.PLAYING);
    engine.pause();
});

test("resumes from SCROLL_PAUSED to PLAYING", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
    });
    engine.play();
    engine.scrollPause();
    assert.equal(engine.state, PlaybackState.SCROLL_PAUSED);
    engine.play();
    assert.equal(engine.state, PlaybackState.PLAYING);
    engine.pause();
});

// ---------------------------------------------------------------------------
// next()
// ---------------------------------------------------------------------------
console.log("\nnext()");

test("renders one beat and fires onBeat", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.next();
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].id, 0);
    assert.equal(engine.currentIndex, 1);
});

test("transitions to COMPLETE at last beat", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
    });
    engine.next();
    assert.equal(engine.state, PlaybackState.COMPLETE);
});

test("no-op when COMPLETE", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.skipToEnd();
    const count = rendered.length;
    engine.next();
    assert.equal(rendered.length, count);
});

test("works from READY state without changing state", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.next();
    assert.equal(engine.state, PlaybackState.READY);
    assert.equal(engine.currentIndex, 1);
});

test("works from PAUSED state without changing state", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
    });
    engine.play();
    engine.pause();
    engine.next();
    assert.equal(engine.state, PlaybackState.PAUSED);
});

test("during PLAYING reschedules after rendering", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.play(); // renders beat 0
    assert.equal(rendered.length, 1);
    engine.next(); // renders beat 1, reschedules
    assert.equal(rendered.length, 2);
    assert.equal(rendered[1].id, 1);
    assert.equal(engine.state, PlaybackState.PLAYING);
    engine.pause();
});

// ---------------------------------------------------------------------------
// previous()
// ---------------------------------------------------------------------------
console.log("\nprevious()");

test("fires onRemoveBeat callback", () => {
    const removed = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onRemoveBeat: (beat) => removed.push(beat),
    });
    engine.next();
    engine.next();
    engine.previous();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, 1);
});

test("decrements currentIndex", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.next();
    engine.next();
    assert.equal(engine.currentIndex, 2);
    engine.previous();
    assert.equal(engine.currentIndex, 1);
});

test("transitions COMPLETE to PAUSED", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
    });
    engine.skipToEnd();
    assert.equal(engine.state, PlaybackState.COMPLETE);
    engine.previous();
    assert.equal(engine.state, PlaybackState.PAUSED);
});

test("transitions PLAYING to PAUSED", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
    });
    engine.play();
    engine.previous();
    assert.equal(engine.state, PlaybackState.PAUSED);
});

test("no-op at start", () => {
    const removed = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
        onRemoveBeat: (beat) => removed.push(beat),
    });
    engine.previous();
    assert.equal(removed.length, 0);
    assert.equal(engine.currentIndex, 0);
});

test("transitions SCROLL_PAUSED to PAUSED", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
    });
    engine.play();
    engine.scrollPause();
    assert.equal(engine.state, PlaybackState.SCROLL_PAUSED);
    engine.previous();
    assert.equal(engine.state, PlaybackState.PAUSED);
    assert.equal(engine.currentIndex, 0);
});

// ---------------------------------------------------------------------------
// skipToStart()
// ---------------------------------------------------------------------------
console.log("\nskipToStart()");

test("removes all rendered beats in reverse order", () => {
    const removed = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onRemoveBeat: (beat) => removed.push(beat),
    });
    engine.skipToEnd();
    engine.skipToStart();
    assert.equal(removed.length, 3);
    assert.deepEqual(
        removed.map((b) => b.id),
        [2, 1, 0],
        "should remove in reverse order",
    );
});

test("transitions to READY", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
    });
    engine.skipToEnd();
    engine.skipToStart();
    assert.equal(engine.state, PlaybackState.READY);
});

test("resets currentIndex to 0", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.skipToEnd();
    engine.skipToStart();
    assert.equal(engine.currentIndex, 0);
});

// ---------------------------------------------------------------------------
// skipToEnd()
// ---------------------------------------------------------------------------
console.log("\nskipToEnd()");

test("renders all remaining beats", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.skipToEnd();
    assert.equal(rendered.length, 3);
});

test("transitions to COMPLETE", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
    });
    engine.skipToEnd();
    assert.equal(engine.state, PlaybackState.COMPLETE);
});

test("fires onBeat for each beat in order", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.skipToEnd();
    assert.deepEqual(
        rendered.map((b) => b.id),
        [0, 1, 2],
    );
});

test("only renders unrendered beats", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.next(); // render beat 0
    engine.skipToEnd(); // render beats 1, 2
    assert.equal(rendered.length, 3);
    assert.deepEqual(
        rendered.map((b) => b.id),
        [0, 1, 2],
    );
});

// ---------------------------------------------------------------------------
// setSpeed()
// ---------------------------------------------------------------------------
console.log("\nsetSpeed()");

test("updates speed multiplier", () => {
    const engine = new PlaybackEngine();
    engine.setSpeed(2.0);
    assert.equal(engine.speed, 2.0);
});

test("rejects zero", () => {
    const engine = new PlaybackEngine();
    engine.setSpeed(0);
    assert.equal(engine.speed, 1.0, "should remain at default");
});

test("rejects negative", () => {
    const engine = new PlaybackEngine();
    engine.setSpeed(-1);
    assert.equal(engine.speed, 1.0, "should remain at default");
});

test("rescheduling during playback preserves timer state", () => {
    const engine = new PlaybackEngine({
        beats: [makeBeat(0, { duration: 10.0 }), makeBeat(1)],
    });
    engine.play(); // renders beat 0, schedules 10s wait
    assert.ok(engine._timer !== null, "timer should be active");
    assert.ok(engine._beatStartTime !== null, "beat start time should be set");

    engine.setSpeed(2.0);
    // Timer should be rescheduled
    assert.ok(engine._timer !== null, "timer should still be active after speed change");
    assert.equal(engine.speed, 2.0);
    engine.pause();
});

test("affects beat duration calculation", () => {
    const beat = makeBeat(0, { duration: 4.0 });
    const engine = new PlaybackEngine({ beats: [beat] });

    // At 1x: 4.0 * 1000 / 1.0 = 4000ms
    assert.equal(engine._getBeatDurationMs(beat), 4000);

    engine.setSpeed(2.0);
    // At 2x: 4.0 * 1000 / 2.0 = 2000ms
    assert.equal(engine._getBeatDurationMs(beat), 2000);

    engine.setSpeed(0.5);
    // At 0.5x: 4.0 * 1000 / 0.5 = 8000ms
    assert.equal(engine._getBeatDurationMs(beat), 8000);
});

// ---------------------------------------------------------------------------
// setInnerWorkingsMode()
// ---------------------------------------------------------------------------
console.log("\nsetInnerWorkingsMode()");

test("stores mode", () => {
    const engine = new PlaybackEngine();
    engine.setInnerWorkingsMode("collapsed");
    assert.equal(engine.innerWorkingsMode, "collapsed");
    engine.setInnerWorkingsMode("expanded");
    assert.equal(engine.innerWorkingsMode, "expanded");
});

test("collapsed mode gives zero duration for inner_working beats", () => {
    const inner = makeInnerBeat(0, { duration: 5.0 });
    const direct = makeBeat(1, { duration: 5.0 });
    const engine = new PlaybackEngine({ beats: [inner, direct] });

    engine.setInnerWorkingsMode("collapsed");
    assert.equal(engine._getBeatDurationMs(inner), 0, "inner_working should be 0");
    assert.equal(engine._getBeatDurationMs(direct), 5000, "direct should be unaffected");
});

test("expanded mode preserves duration for inner_working beats", () => {
    const inner = makeInnerBeat(0, { duration: 5.0 });
    const engine = new PlaybackEngine({ beats: [inner] });

    engine.setInnerWorkingsMode("expanded");
    assert.equal(engine._getBeatDurationMs(inner), 5000);
});

// ---------------------------------------------------------------------------
// Inner workings collapsed playback
// ---------------------------------------------------------------------------
console.log("\nInner workings collapsed playback");

test("zero-duration inner_working beats advance synchronously during play", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [
            makeInnerBeat(0, { type: "thinking" }),
            makeInnerBeat(1, { type: "tool_call" }),
            makeBeat(2, { type: "assistant_message" }),
            makeBeat(3, { type: "user_message" }),
        ],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.setInnerWorkingsMode("collapsed");
    engine.play();

    // Beats 0,1 have zero duration (collapsed), beat 2 is direct with non-zero duration
    // All three render synchronously, then timer schedules for beat 2's reading time
    assert.equal(rendered.length, 3, "should render 3 beats synchronously");
    assert.equal(engine.state, PlaybackState.PLAYING);
    engine.pause();
});

test("all zero-duration beats transition to COMPLETE synchronously", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [
            makeInnerBeat(0, { type: "thinking" }),
            makeInnerBeat(1, { type: "tool_call" }),
        ],
        onBeat: (beat) => rendered.push(beat),
    });
    engine.setInnerWorkingsMode("collapsed");
    engine.play();

    assert.equal(rendered.length, 2);
    assert.equal(engine.state, PlaybackState.COMPLETE);
});

// ---------------------------------------------------------------------------
// onStateChange
// ---------------------------------------------------------------------------
console.log("\nonStateChange");

test("receives newState and oldState", () => {
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onStateChange: (newState, oldState) => transitions.push({ newState, oldState }),
    });
    engine.play();
    engine.pause();

    assert.equal(transitions[0].newState, PlaybackState.PLAYING);
    assert.equal(transitions[0].oldState, PlaybackState.READY);
    assert.equal(transitions[1].newState, PlaybackState.PAUSED);
    assert.equal(transitions[1].oldState, PlaybackState.PLAYING);
});

test("does not fire for redundant transitions", () => {
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0)],
        onStateChange: () => transitions.push(true),
    });
    // READY → READY should not fire
    engine.pause(); // no-op, stays READY
    assert.equal(transitions.length, 0);
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------
console.log("\nIntegration");

test("play → next → next → complete cycle", () => {
    const rendered = [];
    const transitions = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
        onStateChange: (newState) => transitions.push(newState),
    });

    engine.play();   // renders beat 0, READY→PLAYING
    engine.next();   // renders beat 1
    engine.next();   // renders beat 2, PLAYING→COMPLETE

    assert.equal(rendered.length, 3);
    assert.deepEqual(rendered.map((b) => b.id), [0, 1, 2]);
    assert.equal(engine.state, PlaybackState.COMPLETE);
});

test("skipToEnd → skipToStart → play replays from beginning", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1)],
        onBeat: (beat) => rendered.push(beat),
    });

    engine.skipToEnd();
    assert.equal(rendered.length, 2);
    assert.equal(engine.state, PlaybackState.COMPLETE);

    engine.skipToStart();
    assert.equal(engine.currentIndex, 0);
    assert.equal(engine.state, PlaybackState.READY);

    engine.play();
    // First beat renders synchronously again
    assert.equal(rendered.length, 3, "should render beat 0 again");
    assert.equal(rendered[2].id, 0);
    engine.pause();
});

test("next → previous → next cycle", () => {
    const rendered = [];
    const removed = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
        onRemoveBeat: (beat) => removed.push(beat),
    });

    engine.next();   // renders beat 0
    engine.next();   // renders beat 1
    engine.previous(); // removes beat 1
    engine.next();   // renders beat 1 again

    assert.equal(rendered.length, 3);
    assert.deepEqual(rendered.map((b) => b.id), [0, 1, 1]);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, 1);
});

test("onBeat callback calling pause stops playback cleanly", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => {
            rendered.push(beat);
            if (beat.id === 0) {
                engine.pause();
            }
        },
    });
    engine.play();
    // onBeat fires for beat 0, which calls pause()
    // Engine should stop — no phantom timer, no further beats rendered
    assert.equal(rendered.length, 1);
    assert.equal(engine.state, PlaybackState.PAUSED);
    assert.equal(engine._timer, null, "no timer should be scheduled after pause");
});

test("previous from PLAYING pauses and allows replay", () => {
    const rendered = [];
    const engine = new PlaybackEngine({
        beats: [makeBeat(0), makeBeat(1), makeBeat(2)],
        onBeat: (beat) => rendered.push(beat),
    });

    engine.play();     // renders beat 0
    engine.previous(); // removes beat 0, PLAYING→PAUSED
    assert.equal(engine.state, PlaybackState.PAUSED);
    assert.equal(engine.currentIndex, 0);

    engine.play(); // renders beat 0 again
    assert.equal(engine.state, PlaybackState.PLAYING);
    assert.equal(rendered.length, 2);
    engine.pause();
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
