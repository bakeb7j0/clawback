/**
 * Clawback — Unit tests for the chat bubble and inner workings renderer.
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
    const _listeners = {};
    return {
        tagName: tag.toUpperCase(),
        classList: new MockClassList(),
        dataset: {},
        textContent: "",
        innerHTML: "",
        children: [],
        parentElement: null,
        style: {},
        scrollHeight: 200,
        addEventListener(event, handler) {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(handler);
        },
        click() {
            const handlers = _listeners["click"] || [];
            handlers.forEach((fn) => fn({ stopPropagation() {} }));
        },
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
            const match = sel.match(/\[data-beat-id="([^"]+)"\]/);
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

const {
    renderBeat,
    removeBeat,
    toggleAllInnerWorkings,
    resetGroups,
} = require("../../../app/static/js/renderer.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
    // Reset spy state and inner workings groups before each test
    markedCalls = [];
    hljsCalls = [];
    resetGroups();
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
        metadata: opts.metadata || {},
        duration: 2.0,
        group_id: opts.group_id !== undefined ? opts.group_id : null,
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
// renderBeat — skipped beat types (inner_working with no group_id)
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — skipped types");

test("returns null for thinking beats without group_id", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "thinking", category: "inner_working" });
    const result = renderBeat(beat, container);
    assert.equal(result, null);
    assert.equal(container.children.length, 0);
});

test("returns null for tool_call beats without group_id", () => {
    const container = makeContainer();
    const beat = makeBeat(0, { type: "tool_call", category: "inner_working" });
    const result = renderBeat(beat, container);
    assert.equal(result, null);
    assert.equal(container.children.length, 0);
});

test("returns null for tool_result beats without group_id", () => {
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
// removeBeat — direct beats
// ---------------------------------------------------------------------------
console.log("\nremoveBeat — direct beats");

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
// renderBeat — inner workings (group creation)
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — inner workings (group creation)");

test("creates a group card for first inner_working beat", () => {
    const container = makeContainer();
    const beat = makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        content: "Let me think...",
        group_id: 1,
    });
    const card = renderBeat(beat, container);
    assert.ok(card, "should return the group card element");
    assert.equal(container.children.length, 1);
    assert.ok(card.classList.contains("iw-card"));
    assert.ok(card.classList.contains("iw-card--collapsed"));
});

test("adds second beat to same group when group_id matches", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        content: "thought 1",
        group_id: 1,
    }), container);
    const card2 = renderBeat(makeBeat(1, {
        type: "tool_call",
        category: "inner_working",
        content: "ls -la",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);

    // Still only one card in container
    assert.equal(container.children.length, 1);
    // Card body has two items
    const body = card2.children.find((c) => c.classList.contains("iw-card__body"));
    assert.equal(body.children.length, 2);
});

test("different group_id creates a new card", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    renderBeat(makeBeat(1, {
        type: "thinking",
        category: "inner_working",
        group_id: 2,
    }), container);

    assert.equal(container.children.length, 2);
    assert.equal(container.children[0].dataset.groupId, "1");
    assert.equal(container.children[1].dataset.groupId, "2");
});

test("card starts in collapsed state", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    assert.ok(card.classList.contains("iw-card--collapsed"));
    assert.ok(!card.classList.contains("iw-card--expanded"));
});

test("group card has header with icon, summary, and toggle button", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    assert.ok(header, "should have a header");

    const icon = header.children.find((c) =>
        c.classList.contains("iw-card__icon"),
    );
    assert.ok(icon, "header should have an icon");
    assert.equal(icon.textContent, "\u2699");

    const summary = header.children.find((c) =>
        c.classList.contains("iw-card__summary"),
    );
    assert.ok(summary, "header should have a summary");

    const toggle = header.children.find((c) =>
        c.classList.contains("iw-card__toggle"),
    );
    assert.ok(toggle, "header should have a toggle button");
});

// ---------------------------------------------------------------------------
// renderBeat — inner workings (summary counts)
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — inner workings (summary counts)");

test("summary shows singular count for one thinking beat", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const summary = header.children.find((c) =>
        c.classList.contains("iw-card__summary"),
    );
    assert.ok(summary.textContent.includes("1 thought"));
    assert.ok(!summary.textContent.includes("thoughts"));
});

test("summary shows plural count for multiple thinking beats", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    const card = renderBeat(makeBeat(1, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const summary = header.children.find((c) =>
        c.classList.contains("iw-card__summary"),
    );
    assert.ok(summary.textContent.includes("2 thoughts"));
});

test("summary shows combined counts for mixed types", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    renderBeat(makeBeat(1, {
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);
    renderBeat(makeBeat(2, {
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
        metadata: { tool_name: "Read" },
    }), container);
    const card = renderBeat(makeBeat(3, {
        type: "tool_result",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const summary = header.children.find((c) =>
        c.classList.contains("iw-card__summary"),
    );
    assert.ok(summary.textContent.includes("1 thought"));
    assert.ok(summary.textContent.includes("2 tool calls"));
    assert.ok(summary.textContent.includes("1 result"));
});

// ---------------------------------------------------------------------------
// renderBeat — inner workings (item content)
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — inner workings (item content)");

test("thinking item has correct icon and label", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        content: "I need to check...",
        group_id: 1,
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    const item = body.children[0];
    const itemHeader = item.children.find((c) =>
        c.classList.contains("iw-item__header"),
    );

    const icon = itemHeader.children.find((c) =>
        c.classList.contains("iw-item__icon"),
    );
    assert.equal(icon.textContent, "\uD83D\uDCAD");

    const label = itemHeader.children.find((c) =>
        c.classList.contains("iw-item__label"),
    );
    assert.equal(label.textContent, "Thinking");
});

test("thinking item sets content as textContent", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        content: "The user wants me to...",
        group_id: 1,
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    const item = body.children[0];
    const content = item.children.find((c) =>
        c.classList.contains("iw-item__content"),
    );
    assert.equal(content.textContent, "The user wants me to...");
});

test("tool_call item shows tool name in label", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "tool_call",
        category: "inner_working",
        content: "ls -la /home",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    const item = body.children[0];
    const itemHeader = item.children.find((c) =>
        c.classList.contains("iw-item__header"),
    );

    const icon = itemHeader.children.find((c) =>
        c.classList.contains("iw-item__icon"),
    );
    assert.equal(icon.textContent, "\uD83D\uDD27");

    const label = itemHeader.children.find((c) =>
        c.classList.contains("iw-item__label"),
    );
    assert.equal(label.textContent, "Tool Call: Bash");
});

test("tool_result item has correct icon", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "tool_result",
        category: "inner_working",
        content: "total 40\ndrwxr-xr-x...",
        group_id: 1,
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    const item = body.children[0];
    const itemHeader = item.children.find((c) =>
        c.classList.contains("iw-item__header"),
    );
    const icon = itemHeader.children.find((c) =>
        c.classList.contains("iw-item__icon"),
    );
    assert.equal(icon.textContent, "\uD83D\uDCCB");
});

test("tool_result error shows error indicator in label", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "tool_result",
        category: "inner_working",
        content: "command not found",
        group_id: 1,
        metadata: { is_error: true },
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    const item = body.children[0];

    assert.ok(item.classList.contains("iw-item--error"));

    const itemHeader = item.children.find((c) =>
        c.classList.contains("iw-item__header"),
    );
    const label = itemHeader.children.find((c) =>
        c.classList.contains("iw-item__label"),
    );
    assert.ok(label.textContent.includes("Error"));
});

test("tool_result content has scrollable class", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "tool_result",
        category: "inner_working",
        content: "output...",
        group_id: 1,
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    const item = body.children[0];
    const content = item.children.find((c) =>
        c.classList.contains("iw-item__content"),
    );
    assert.ok(content.classList.contains("iw-item__content--scrollable"));
});

test("tool_call content gets syntax highlighting", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "tool_call",
        category: "inner_working",
        content: "ls -la /home",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);

    assert.ok(hljsCalls.length > 0, "hljs.highlightElement should be called");
});

test("tool_result content gets syntax highlighting", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "tool_result",
        category: "inner_working",
        content: "file output here",
        group_id: 1,
    }), container);

    assert.ok(hljsCalls.length > 0, "hljs.highlightElement should be called");
});

test("each item has data-beat-id set", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(7, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    assert.equal(body.children[0].dataset.beatId, "7");
});

// ---------------------------------------------------------------------------
// inner workings — toggle
// ---------------------------------------------------------------------------
console.log("\ninner workings — toggle");

test("clicking toggle button expands card", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const toggleBtn = header.children.find((c) =>
        c.classList.contains("iw-card__toggle"),
    );

    // Click to expand
    toggleBtn.click();
    assert.ok(card.classList.contains("iw-card--expanded"));
    assert.ok(!card.classList.contains("iw-card--collapsed"));
    assert.ok(toggleBtn.textContent.includes("Hide"));
});

test("clicking toggle again collapses card", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const toggleBtn = header.children.find((c) =>
        c.classList.contains("iw-card__toggle"),
    );

    // Expand then collapse
    toggleBtn.click();
    toggleBtn.click();
    assert.ok(card.classList.contains("iw-card--collapsed"));
    assert.ok(!card.classList.contains("iw-card--expanded"));
    assert.ok(toggleBtn.textContent.includes("Show"));
});

test("clicking header also toggles card", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );

    // Click header to expand
    header.click();
    assert.ok(card.classList.contains("iw-card--expanded"));
});

test("expanded card sets max-height on body", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const body = card.children.find((c) =>
        c.classList.contains("iw-card__body"),
    );
    const toggleBtn = header.children.find((c) =>
        c.classList.contains("iw-card__toggle"),
    );

    toggleBtn.click();
    assert.equal(body.style.maxHeight, body.scrollHeight + "px");
});

test("collapsed card sets max-height to 0", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const body = card.children.find((c) =>
        c.classList.contains("iw-card__body"),
    );
    const toggleBtn = header.children.find((c) =>
        c.classList.contains("iw-card__toggle"),
    );

    // Expand then collapse
    toggleBtn.click();
    toggleBtn.click();
    assert.equal(body.style.maxHeight, "0");
});

// ---------------------------------------------------------------------------
// toggleAllInnerWorkings
// ---------------------------------------------------------------------------
console.log("\ntoggleAllInnerWorkings");

test("expands all collapsed cards", () => {
    const container = makeContainer();
    const card1 = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    const card2 = renderBeat(makeBeat(1, {
        type: "thinking",
        category: "inner_working",
        group_id: 2,
    }), container);

    toggleAllInnerWorkings(container, true);

    assert.ok(card1.classList.contains("iw-card--expanded"));
    assert.ok(card2.classList.contains("iw-card--expanded"));
});

test("collapses all expanded cards", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    renderBeat(makeBeat(1, {
        type: "thinking",
        category: "inner_working",
        group_id: 2,
    }), container);

    // Expand all then collapse all
    toggleAllInnerWorkings(container, true);
    toggleAllInnerWorkings(container, false);

    assert.equal(container.children.length, 2);
    assert.ok(container.children[0].classList.contains("iw-card--collapsed"));
    assert.ok(container.children[1].classList.contains("iw-card--collapsed"));
});

test("does not toggle cards already in desired state", () => {
    const container = makeContainer();
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    // Already collapsed — toggle to collapsed should be a no-op
    toggleAllInnerWorkings(container, false);
    assert.ok(card.classList.contains("iw-card--collapsed"));
});

test("new cards respect expanded default after toggleAllInnerWorkings", () => {
    const container = makeContainer();

    // Set default to expanded
    toggleAllInnerWorkings(container, true);

    // Create a new card — should start expanded
    const card = renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    assert.ok(card.classList.contains("iw-card--expanded"));
    assert.ok(!card.classList.contains("iw-card--collapsed"));

    // Clean up: reset for other tests
    resetGroups();
    toggleAllInnerWorkings(container, false);
});

// ---------------------------------------------------------------------------
// removeBeat — inner workings
// ---------------------------------------------------------------------------
console.log("\nremoveBeat — inner workings");

test("removes item from group", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    const card = renderBeat(makeBeat(1, {
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);

    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    assert.equal(body.children.length, 2);

    removeBeat({
        id: 1,
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
    }, container);

    assert.equal(body.children.length, 1);
    assert.equal(container.children.length, 1, "card should still exist");
});

test("removes entire card when last item removed", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    assert.equal(container.children.length, 1);

    removeBeat({
        id: 0,
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }, container);

    assert.equal(container.children.length, 0, "card should be removed");
});

test("updates summary after item removal", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    renderBeat(makeBeat(1, {
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);
    const card = renderBeat(makeBeat(2, {
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
        metadata: { tool_name: "Read" },
    }), container);

    // Remove one tool_call
    removeBeat({
        id: 2,
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
    }, container);

    const header = card.children.find((c) =>
        c.classList.contains("iw-card__header"),
    );
    const summary = header.children.find((c) =>
        c.classList.contains("iw-card__summary"),
    );
    assert.ok(summary.textContent.includes("1 thought"));
    assert.ok(summary.textContent.includes("1 tool call"));
    assert.ok(!summary.textContent.includes("2 tool calls"));
});

// ---------------------------------------------------------------------------
// resetGroups
// ---------------------------------------------------------------------------
console.log("\nresetGroups");

test("clears all tracked groups", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);

    resetGroups();

    // After reset, a new beat with same group_id creates a fresh card
    const container2 = makeContainer();
    const card = renderBeat(makeBeat(1, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container2);

    // Should be a new card, not added to the old one
    assert.equal(container2.children.length, 1);
    const body = card.children.find((c) => c.classList.contains("iw-card__body"));
    assert.equal(body.children.length, 1, "should have only the new item");
});

// ---------------------------------------------------------------------------
// Integration — mixed direct and inner working beats
// ---------------------------------------------------------------------------
console.log("\nintegration — mixed beat types");

test("interleaves bubbles and inner workings cards correctly", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, { type: "user_message", content: "Hello" }), container);
    renderBeat(makeBeat(1, {
        type: "thinking",
        category: "inner_working",
        group_id: 1,
    }), container);
    renderBeat(makeBeat(2, {
        type: "tool_call",
        category: "inner_working",
        group_id: 1,
        metadata: { tool_name: "Bash" },
    }), container);
    renderBeat(makeBeat(3, {
        type: "assistant_message",
        content: "Here you go",
    }), container);

    // user bubble + iw card + assistant bubble = 3 container children
    assert.equal(container.children.length, 3);
    assert.ok(container.children[0].classList.contains("bubble--user"));
    assert.ok(container.children[1].classList.contains("iw-card"));
    assert.ok(container.children[2].classList.contains("bubble--assistant"));
});

// ---------------------------------------------------------------------------
// renderBeat — callout annotations
// ---------------------------------------------------------------------------
console.log("\nrenderBeat — callout annotations");

function makeCalloutBeat(id, style, content) {
    return {
        id: "callout-cal-" + id,
        type: "callout",
        category: "callout",
        isCallout: true,
        calloutStyle: style,
        content: content || "Some callout content",
        calloutId: "cal-" + id,
        duration: 3,
        group_id: null,
    };
}

test("renders a note callout with correct CSS classes", () => {
    const container = makeContainer();
    const card = renderBeat(makeCalloutBeat(1, "note"), container);
    assert.ok(card, "should return the callout element");
    assert.ok(card.classList.contains("callout"));
    assert.ok(card.classList.contains("callout--note"));
    assert.ok(!card.classList.contains("callout--warning"));
    assert.equal(container.children.length, 1);
});

test("renders a warning callout with correct CSS classes", () => {
    const container = makeContainer();
    const card = renderBeat(makeCalloutBeat(1, "warning"), container);
    assert.ok(card.classList.contains("callout"));
    assert.ok(card.classList.contains("callout--warning"));
    assert.ok(!card.classList.contains("callout--note"));
});

test("note callout has correct icon and header", () => {
    const container = makeContainer();
    const card = renderBeat(makeCalloutBeat(1, "note"), container);
    const header = card.children.find((c) => c.classList.contains("callout__header"));
    assert.ok(header, "should have a header");
    const icon = header.children.find((c) => c.classList.contains("callout__icon"));
    assert.equal(icon.textContent, "\uD83D\uDCDD");
    const title = header.children.find((c) => c.classList.contains("callout__title"));
    assert.equal(title.textContent, "Instructor Note");
});

test("warning callout has correct icon and header", () => {
    const container = makeContainer();
    const card = renderBeat(makeCalloutBeat(1, "warning"), container);
    const header = card.children.find((c) => c.classList.contains("callout__header"));
    const icon = header.children.find((c) => c.classList.contains("callout__icon"));
    assert.equal(icon.textContent, "\u26A0\uFE0F");
    const title = header.children.find((c) => c.classList.contains("callout__title"));
    assert.equal(title.textContent, "Warning");
});

test("callout content is rendered via marked + DOMPurify", () => {
    markedCalls = [];
    const container = makeContainer();
    const card = renderBeat(makeCalloutBeat(1, "note", "**bold** text"), container);
    assert.ok(markedCalls.includes("**bold** text"), "marked.parse should be called");
    const content = card.children.find((c) => c.classList.contains("callout__content"));
    assert.ok(content.innerHTML.includes("**bold** text"), "content should have sanitized HTML");
});

test("callout sets data-beat-id from beat.id", () => {
    const container = makeContainer();
    const card = renderBeat(makeCalloutBeat(42, "note"), container);
    assert.equal(card.dataset.beatId, "callout-cal-42");
});

test("callout can be removed via removeBeat", () => {
    const container = makeContainer();
    renderBeat(makeCalloutBeat(1, "note"), container);
    assert.equal(container.children.length, 1);
    removeBeat({ id: "callout-cal-1", type: "callout", category: "callout" }, container);
    assert.equal(container.children.length, 0);
});

test("callouts interleave with conversation bubbles", () => {
    const container = makeContainer();
    renderBeat(makeBeat(0, { type: "user_message", content: "Hello" }), container);
    renderBeat(makeCalloutBeat(1, "note", "Pay attention"), container);
    renderBeat(makeBeat(1, { type: "assistant_message", content: "Hi" }), container);
    assert.equal(container.children.length, 3);
    assert.ok(container.children[0].classList.contains("bubble--user"));
    assert.ok(container.children[1].classList.contains("callout--note"));
    assert.ok(container.children[2].classList.contains("bubble--assistant"));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
