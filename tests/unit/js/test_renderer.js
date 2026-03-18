/**
 * Clawback — Unit tests for the chat bubble renderer.
 *
 * Run with: node tests/unit/js/test_renderer.js
 * Or via:   make test-js
 */

const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// DOM mocks — lightweight stand-ins for browser APIs
// ---------------------------------------------------------------------------

class MockClassList {
    constructor() {
        this._set = new Set();
    }
    add(...args) {
        args.forEach((c) => this._set.add(c));
    }
    contains(c) {
        return this._set.has(c);
    }
    remove(c) {
        this._set.delete(c);
    }
}

function createElement(tag) {
    return {
        tagName: tag.toUpperCase(),
        classList: new MockClassList(),
        dataset: {},
        textContent: "",
        innerHTML: "",
        children: [],
        parentElement: null,
        appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            return child;
        },
        remove() {
            if (this.parentElement) {
                const idx = this.parentElement.children.indexOf(this);
                if (idx > -1) this.parentElement.children.splice(idx, 1);
            }
        },
        querySelector(sel) {
            const match = sel.match(/\[data-beat-id="(\d+)"\]/);
            if (match) {
                return (
                    this.children.find(
                        (c) => String(c.dataset.beatId) === match[1],
                    ) || null
                );
            }
            return null;
        },
        querySelectorAll() {
            return [];
        },
    };
}

// Set up globals before requiring renderer
global.document = { createElement };

let markedCalls = [];
global.marked = {
    parse: (text) => {
        markedCalls.push(text);
        return `<p>${text}</p>`;
    },
};

let hljsCalls = [];
global.hljs = {
    highlightElement: (el) => {
        hljsCalls.push(el);
    },
};

global.DOMPurify = {
    sanitize: (html) => html, // pass-through for unit tests
};

const { renderBeat, removeBeat } = require("../../../app/static/js/renderer.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
    // Reset spy state before each test
    markedCalls = [];
    hljsCalls = [];
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
        content: opts.content || "Hello world",
        metadata: {},
        duration: 2.0,
        group_id: null,
    };
}

function makeContainer() {
    return createElement("div");
}

// ---------------------------------------------------------------------------
// renderBeat — user messages
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — user messages");

test("creates a bubble for user_message", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "user_message", content: "Hi there" });
    const bubble = renderBeat(beat, container);
    assert.ok(bubble, "should return the created element");
    assert.equal(container.children.length, 1);
});

test("user bubble has correct CSS classes", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "user_message" });
    const bubble = renderBeat(beat, container);
    assert.ok(bubble.classList.contains("bubble"));
    assert.ok(bubble.classList.contains("bubble--user"));
    assert.ok(!bubble.classList.contains("bubble--assistant"));
});

test("user message sets textContent (not innerHTML)", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "user_message", content: "Hello <b>world</b>" });
    const bubble = renderBeat(beat, container);
    assert.equal(bubble.textContent, "Hello <b>world</b>");
    // innerHTML should not be set for user messages (XSS safety)
    assert.equal(bubble.innerHTML, "");
});

test("user message does not call marked.parse", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "user_message", content: "test" });
    renderBeat(beat, container);
    assert.equal(markedCalls.length, 0);
});

// ---------------------------------------------------------------------------
// renderBeat — assistant messages
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — assistant messages");

test("creates a bubble for assistant_message", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "assistant_message", content: "I can help" });
    const bubble = renderBeat(beat, container);
    assert.ok(bubble, "should return the created element");
    assert.equal(container.children.length, 1);
});

test("assistant bubble has correct CSS classes", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "assistant_message" });
    const bubble = renderBeat(beat, container);
    assert.ok(bubble.classList.contains("bubble"));
    assert.ok(bubble.classList.contains("bubble--assistant"));
    assert.ok(!bubble.classList.contains("bubble--user"));
});

test("assistant message renders Markdown via marked.parse", () => {
    const container = makeContainer();
    const beat = makeBeat(0, {
        type: "assistant_message",
        content: "**bold** text",
    });
    const bubble = renderBeat(beat, container);
    assert.equal(markedCalls.length, 1);
    assert.equal(markedCalls[0], "**bold** text");
    assert.equal(bubble.innerHTML, "<p>**bold** text</p>");
});

test("assistant message sanitizes HTML via DOMPurify", () => {
    const sanitizeCalls = [];
    global.DOMPurify = {
        sanitize: (html) => {
            sanitizeCalls.push(html);
            return html;
        },
    };
    const container = makeContainer();
    const beat = makeBeat(0, { type: "assistant_message", content: "test" });
    renderBeat(beat, container);
    assert.equal(sanitizeCalls.length, 1, "DOMPurify.sanitize should be called");
    // Restore default mock
    global.DOMPurify = { sanitize: (html) => html };
});

test("assistant message calls hljs.highlightElement for code blocks", () => {
    // Override querySelectorAll to return mock code elements
    const container = makeContainer();
    const beat = makeBeat(0, { type: "assistant_message", content: "```js\ncode\n```" });

    const mockCodeBlock = createElement("code");
    const origCreate = global.document.createElement;
    let bubbleRef = null;

    // Intercept createElement to capture the bubble and override querySelectorAll
    global.document.createElement = (tag) => {
        const el = origCreate(tag);
        if (tag === "div" && !bubbleRef) {
            bubbleRef = el;
            el.querySelectorAll = (sel) => {
                if (sel === "pre code") return [mockCodeBlock];
                return [];
            };
        }
        return el;
    };

    renderBeat(beat, container);

    global.document.createElement = origCreate;

    assert.equal(hljsCalls.length, 1, "should call hljs.highlightElement once");
    assert.equal(hljsCalls[0], mockCodeBlock);
});

// ---------------------------------------------------------------------------
// renderBeat — skipped beat types
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — skipped types");

test("returns null for thinking beats", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "thinking", category: "inner_working" });
    const result = renderBeat(beat, container);
    assert.equal(result, null);
    assert.equal(container.children.length, 0);
});

test("returns null for tool_call beats", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "tool_call", category: "inner_working" });
    const result = renderBeat(beat, container);
    assert.equal(result, null);
    assert.equal(container.children.length, 0);
});

test("returns null for tool_result beats", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "tool_result", category: "inner_working" });
    const result = renderBeat(beat, container);
    assert.equal(result, null);
    assert.equal(container.children.length, 0);
});

// ---------------------------------------------------------------------------
// renderBeat — beat ID and metadata
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — metadata");

test("sets beat ID in dataset", () => {
    const container = makeContainer();
    const beat = makeBeat(42, { type: "user_message" });
    const bubble = renderBeat(beat, container);
    assert.equal(bubble.dataset.beatId, "42");
});

test("appends meta element with beat number", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "user_message" });
    const bubble = renderBeat(beat, container);
    const meta = bubble.children.find((c) =>
        c.classList.contains("bubble__meta"),
    );
    assert.ok(meta, "should have a meta child element");
    assert.equal(meta.textContent, "#1");
});

test("meta element shows 1-based beat number", () => {
    const container = makeContainer();
    const beat = makeBeat(9, { type: "assistant_message" });
    const bubble = renderBeat(beat, container);
    const meta = bubble.children.find((c) =>
        c.classList.contains("bubble__meta"),
    );
    assert.equal(meta.textContent, "#10");
});

// ---------------------------------------------------------------------------
// renderBeat — ordering
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — ordering");

test("messages build downward (newest at bottom)", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, { type: "user_message", content: "first" }), container);
    renderBeat(makeBeat(1, { type: "assistant_message", content: "second" }), container);
    renderBeat(makeBeat(2, { type: "user_message", content: "third" }), container);

    assert.equal(container.children.length, 3);
    assert.equal(container.children[0].dataset.beatId, "0");
    assert.equal(container.children[1].dataset.beatId, "1");
    assert.equal(container.children[2].dataset.beatId, "2");
});

// ---------------------------------------------------------------------------
// removeBeat
// ---------------------------------------------------------------------------
console.log("\nremoveBeat");

test("removes the correct element from container", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, { type: "user_message" }), container);
    renderBeat(makeBeat(1, { type: "assistant_message" }), container);
    assert.equal(container.children.length, 2);

    removeBeat({ id: 0 }, container);
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].dataset.beatId, "1");
});

test("is a no-op when element does not exist", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, { type: "user_message" }), container);
    removeBeat({ id: 99 }, container);
    assert.equal(container.children.length, 1, "should not remove anything");
});

test("removes the last of multiple elements", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, { type: "user_message" }), container);
    renderBeat(makeBeat(1, { type: "assistant_message" }), container);
    renderBeat(makeBeat(2, { type: "user_message" }), container);

    removeBeat({ id: 2 }, container);
    assert.equal(container.children.length, 2);
    assert.equal(container.children[0].dataset.beatId, "0");
    assert.equal(container.children[1].dataset.beatId, "1");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
