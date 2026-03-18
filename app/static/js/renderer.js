/**
 * Clawback — Chat bubble renderer.
 *
 * Renders beat objects as chat bubbles in the DOM. User messages
 * are right-aligned, assistant messages are left-aligned with
 * Markdown rendering and syntax highlighting.
 *
 * Inner workings (thinking, tool_call, tool_result) are handled
 * by Issue #5 — this module skips them gracefully.
 */

/**
 * Renders a beat as a chat bubble and appends it to the container.
 * Only handles direct-category beats (user_message, assistant_message).
 *
 * @param {Object} beat - Beat object from the parser
 * @param {HTMLElement} container - Chat area container
 * @returns {HTMLElement|null} The created bubble element, or null if skipped
 */
function renderBeat(beat, container) {
    if (beat.type !== "user_message" && beat.type !== "assistant_message") {
        return null;
    }

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.dataset.beatId = String(beat.id);

    if (beat.type === "user_message") {
        bubble.classList.add("bubble--user");
        bubble.textContent = beat.content;
    } else {
        bubble.classList.add("bubble--assistant");
        bubble.innerHTML = DOMPurify.sanitize(marked.parse(beat.content));
        bubble.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    // Beat number metadata (visibility controlled by CSS on container)
    const meta = document.createElement("span");
    meta.classList.add("bubble__meta");
    meta.textContent = "#" + (beat.id + 1);
    bubble.appendChild(meta);

    container.appendChild(bubble);
    return bubble;
}

/**
 * Removes a beat's bubble from the container.
 *
 * @param {Object} beat - Beat object to remove
 * @param {HTMLElement} container - Chat area container
 */
function removeBeat(beat, container) {
    const el = container.querySelector('[data-beat-id="' + beat.id + '"]');
    if (el) {
        el.remove();
    }
}

// Browser export
if (typeof window !== "undefined") {
    window.ClawbackRenderer = { renderBeat, removeBeat };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderBeat, removeBeat };
}
