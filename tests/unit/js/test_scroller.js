/**
 * Clawback — Unit tests for auto-scroll and scroll-pause detection.
 *
 * Run with: node tests/unit/js/test_scroller.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");

// Polyfill requestAnimationFrame for Node.js — execute callback synchronously
global.requestAnimationFrame = function (cb) { cb(); };

const { createScroller, SCROLL_THRESHOLD } = require("../../../app/static/js/scroller.js");

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

function makeScrollContainer(opts) {
    opts = opts || {};
    const _listeners = {};
    const _scrollToCalls = [];
    return {
        scrollTop: opts.scrollTop !== undefined ? opts.scrollTop : 0,
        scrollHeight: opts.scrollHeight !== undefined ? opts.scrollHeight : 1000,
        clientHeight: opts.clientHeight !== undefined ? opts.clientHeight : 500,
        scrollTo: function (options) {
            _scrollToCalls.push(options);
        },
        addEventListener: function (event, handler) {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(handler);
        },
        removeEventListener: function (event, handler) {
            const arr = _listeners[event];
            if (arr) {
                const idx = arr.indexOf(handler);
                if (idx > -1) arr.splice(idx, 1);
            }
        },
        _fireScroll: function () {
            (_listeners["scroll"] || []).forEach(function (fn) { fn(); });
        },
        _listenerCount: function (event) {
            return (_listeners[event] || []).length;
        },
        _scrollToCalls: _scrollToCalls,
    };
}

function makeChatArea(hasChildren) {
    return {
        lastElementChild: hasChildren !== false ? {} : null,
    };
}

// ---------------------------------------------------------------------------
// createScroller
// ---------------------------------------------------------------------------
console.log("\ncreateScroller");

test("returns object with scrollToBottom, enable, disable, destroy", function () {
    const sc = makeScrollContainer();
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
    });

    assert.equal(typeof scroller.scrollToBottom, "function");
    assert.equal(typeof scroller.enable, "function");
    assert.equal(typeof scroller.disable, "function");
    assert.equal(typeof scroller.destroy, "function");
});

test("registers scroll event listener on container", function () {
    const sc = makeScrollContainer();
    const ca = makeChatArea();
    createScroller({ scrollContainer: sc, chatArea: ca });

    assert.equal(sc._listenerCount("scroll"), 1);
});

// ---------------------------------------------------------------------------
// scrollToBottom
// ---------------------------------------------------------------------------
console.log("\nscrollToBottom");

test("scrolls container to bottom with smooth behavior", function () {
    const sc = makeScrollContainer({ scrollHeight: 2000 });
    const ca = makeChatArea(true);
    const scroller = createScroller({ scrollContainer: sc, chatArea: ca });

    scroller.scrollToBottom();

    assert.equal(sc._scrollToCalls.length, 1);
    assert.equal(sc._scrollToCalls[0].top, 2000);
    assert.equal(sc._scrollToCalls[0].behavior, "smooth");
});

test("is a no-op when chatArea has no children", function () {
    const sc = makeScrollContainer();
    const ca = makeChatArea(false);
    const scroller = createScroller({ scrollContainer: sc, chatArea: ca });

    // Should not throw
    scroller.scrollToBottom();
    assert.equal(sc._scrollToCalls.length, 0);
});

// ---------------------------------------------------------------------------
// scroll detection — disabled
// ---------------------------------------------------------------------------
console.log("\nscroll detection — disabled state");

test("does not trigger onScrollPause when disabled", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 500, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    // Simulate scroll up (scrollTop decreases) while disabled
    sc.scrollTop = 200;
    sc._fireScroll();

    assert.equal(pauseCount, 0);
});

// ---------------------------------------------------------------------------
// scroll detection — enabled
// ---------------------------------------------------------------------------
console.log("\nscroll detection — enabled state");

test("triggers onScrollPause when scrolling up above threshold", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 800, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();

    // Scroll up — scrollTop decreases, distance from bottom > threshold
    sc.scrollTop = 400;
    sc._fireScroll();

    assert.equal(pauseCount, 1);
});

test("does not trigger when scrolling down (scrollTop increases)", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 200, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();

    // Scroll down — scrollTop increases
    sc.scrollTop = 600;
    sc._fireScroll();

    assert.equal(pauseCount, 0);
});

test("does not trigger when scrolling up but within threshold of bottom", function () {
    let pauseCount = 0;
    // Start near bottom: distance = 1000 - 480 - 500 = 20 (below threshold)
    const sc = makeScrollContainer({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();

    // Scroll up slightly, but still within threshold of bottom
    // distance = 1000 - 480 - 500 = 20 (below threshold of 50)
    sc.scrollTop = 480;
    sc._fireScroll();

    assert.equal(pauseCount, 0);
});

test("does not trigger when already at bottom (distance = 0)", function () {
    let pauseCount = 0;
    // Exactly at bottom: distance = 1000 - 500 - 500 = 0
    const sc = makeScrollContainer({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();

    // No scroll change
    sc._fireScroll();

    assert.equal(pauseCount, 0);
});

test("detects auto-scroll (downward) correctly — no false pause", function () {
    let pauseCount = 0;
    // Simulate: at bottom, new content added (scrollHeight increases), then auto-scroll
    const sc = makeScrollContainer({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();

    // New content added — scrollHeight increases
    sc.scrollHeight = 1200;
    // Auto-scroll progresses downward (scrollTop increases toward 700)
    sc.scrollTop = 600;
    sc._fireScroll();
    sc.scrollTop = 700;
    sc._fireScroll();

    assert.equal(pauseCount, 0, "auto-scroll should not trigger pause");
});

test("SCROLL_THRESHOLD is 50px", function () {
    assert.equal(SCROLL_THRESHOLD, 50);
});

// ---------------------------------------------------------------------------
// enable / disable
// ---------------------------------------------------------------------------
console.log("\nenable / disable");

test("enable records initial scrollTop", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 300, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();

    // Scroll down from 300 to 400 — should NOT trigger (going down)
    sc.scrollTop = 400;
    sc._fireScroll();
    assert.equal(pauseCount, 0);

    // Now scroll up from 400 to 200 — distance from bottom = 1500 - 200 - 500 = 800 > 50
    sc.scrollTop = 200;
    sc._fireScroll();
    assert.equal(pauseCount, 1);
});

test("disable prevents pause detection", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 800, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();
    scroller.disable();

    // Scroll up while disabled
    sc.scrollTop = 200;
    sc._fireScroll();

    assert.equal(pauseCount, 0);
});

test("re-enable after disable works", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 800, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();
    scroller.disable();

    // Re-enable at current position
    sc.scrollTop = 800;
    scroller.enable();

    // Scroll up
    sc.scrollTop = 200;
    sc._fireScroll();

    assert.equal(pauseCount, 1);
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------
console.log("\ndestroy");

test("removes scroll event listener", function () {
    const sc = makeScrollContainer();
    const ca = makeChatArea();
    const scroller = createScroller({ scrollContainer: sc, chatArea: ca });

    assert.equal(sc._listenerCount("scroll"), 1);
    scroller.destroy();
    assert.equal(sc._listenerCount("scroll"), 0);
});

test("prevents further scroll detection after destroy", function () {
    let pauseCount = 0;
    const sc = makeScrollContainer({ scrollTop: 800, scrollHeight: 1500, clientHeight: 500 });
    const ca = makeChatArea();
    const scroller = createScroller({
        scrollContainer: sc,
        chatArea: ca,
        onScrollPause: function () { pauseCount++; },
    });

    scroller.enable();
    scroller.destroy();

    sc.scrollTop = 200;
    sc._fireScroll();

    assert.equal(pauseCount, 0);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
