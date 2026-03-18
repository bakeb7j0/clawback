/**
 * Clawback — Chat bubble and inner workings renderer.
 *
 * Renders beat objects as chat bubbles or collapsible inner workings cards.
 * User messages are right-aligned, assistant messages are left-aligned with
 * Markdown rendering and syntax highlighting.
 *
 * Inner workings (thinking, tool_call, tool_result) are grouped by the
 * parser's group_id into collapsible summary cards.
 */

/** @type {Map<number, Object>} Active inner workings groups by group_id */
const _activeGroups = new Map();

/**
 * Renders a beat and appends it to the container.
 *
 * Direct-category beats become chat bubbles. Inner working beats are
 * grouped into collapsible summary cards based on group_id.
 *
 * @param {Object} beat - Beat object from the parser
 * @param {HTMLElement} container - Chat area container
 * @returns {HTMLElement|null} The created/updated element, or null if skipped
 */
function renderBeat(beat, container) {
    if (beat.category === "inner_working" && beat.group_id !== null) {
        return _renderInnerWorkingBeat(beat, container);
    }

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
 * Removes a beat from the container.
 * Handles both direct bubbles and inner workings group items.
 *
 * @param {Object} beat - Beat object to remove
 * @param {HTMLElement} container - Chat area container
 */
function removeBeat(beat, container) {
    if (beat.category === "inner_working" && beat.group_id !== null) {
        const group = _activeGroups.get(beat.group_id);
        if (group && group.items.has(beat.id)) {
            _removeItemFromGroup(beat, group);
            return;
        }
    }

    const el = container.querySelector('[data-beat-id="' + beat.id + '"]');
    if (el) {
        el.remove();
    }
}

/**
 * Toggles all inner workings cards expanded or collapsed.
 *
 * @param {HTMLElement} _container - Chat area container (unused, API symmetry)
 * @param {boolean} expanded - true to expand, false to collapse
 */
function toggleAllInnerWorkings(_container, expanded) {
    for (const group of _activeGroups.values()) {
        if (group.expanded !== expanded) {
            _toggleCard(group);
        }
    }
}

/**
 * Clears all tracked inner workings groups.
 * Call when starting a new playback session.
 *
 * Important: the caller must clear the container DOM (e.g. innerHTML = "")
 * before calling this, otherwise orphaned group cards remain visible.
 */
function resetGroups() {
    _activeGroups.clear();
}

// ---------------------------------------------------------------------------
// Internal — inner workings rendering
// ---------------------------------------------------------------------------

function _renderInnerWorkingBeat(beat, container) {
    let group = _activeGroups.get(beat.group_id);
    if (!group) {
        group = _createGroupCard(beat.group_id, container);
        _activeGroups.set(beat.group_id, group);
    }
    _addItemToGroup(beat, group);
    return group.card;
}

function _createGroupCard(groupId, container) {
    const card = document.createElement("div");
    card.classList.add("iw-card", "iw-card--collapsed");
    card.dataset.groupId = String(groupId);

    const header = document.createElement("div");
    header.classList.add("iw-card__header");

    const icon = document.createElement("span");
    icon.classList.add("iw-card__icon");
    icon.textContent = "\u2699";

    const summary = document.createElement("span");
    summary.classList.add("iw-card__summary");
    summary.textContent = "Inner workings";

    const toggleBtn = document.createElement("button");
    toggleBtn.classList.add("iw-card__toggle");
    toggleBtn.textContent = "\u25B6 Show";

    header.appendChild(icon);
    header.appendChild(summary);
    header.appendChild(toggleBtn);

    const body = document.createElement("div");
    body.classList.add("iw-card__body");

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);

    const group = {
        card,
        header,
        body,
        summary,
        toggleBtn,
        items: new Map(),
        counts: { thinking: 0, tool_call: 0, tool_result: 0 },
        expanded: false,
    };

    toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        _toggleCard(group);
    });

    header.addEventListener("click", function () {
        _toggleCard(group);
    });

    return group;
}

function _addItemToGroup(beat, group) {
    const item = document.createElement("div");
    item.classList.add("iw-item");
    item.dataset.beatId = String(beat.id);

    const itemHeader = document.createElement("div");
    itemHeader.classList.add("iw-item__header");

    const icon = document.createElement("span");
    icon.classList.add("iw-item__icon");

    const label = document.createElement("span");
    label.classList.add("iw-item__label");

    const content = document.createElement("div");
    content.classList.add("iw-item__content");

    if (beat.type === "thinking") {
        icon.textContent = "\uD83D\uDCAD";
        label.textContent = "Thinking";
        content.textContent = beat.content;
    } else if (beat.type === "tool_call") {
        icon.textContent = "\uD83D\uDD27";
        const toolName = (beat.metadata && beat.metadata.tool_name) || "Unknown";
        label.textContent = "Tool Call: " + toolName;
        const tcPre = document.createElement("pre");
        const tcCode = document.createElement("code");
        tcCode.textContent = beat.content;
        tcPre.appendChild(tcCode);
        content.appendChild(tcPre);
        hljs.highlightElement(tcCode);
    } else if (beat.type === "tool_result") {
        icon.textContent = "\uD83D\uDCCB";
        label.textContent = "Tool Result";
        if (beat.metadata && beat.metadata.is_error) {
            label.textContent += " (Error)";
            item.classList.add("iw-item--error");
        }
        content.classList.add("iw-item__content--scrollable");
        const trPre = document.createElement("pre");
        const trCode = document.createElement("code");
        trCode.textContent = beat.content;
        trPre.appendChild(trCode);
        content.appendChild(trPre);
        hljs.highlightElement(trCode);
    }

    itemHeader.appendChild(icon);
    itemHeader.appendChild(label);

    item.appendChild(itemHeader);
    item.appendChild(content);

    group.body.appendChild(item);
    group.items.set(beat.id, item);

    if (beat.type in group.counts) {
        group.counts[beat.type]++;
    }
    _updateSummary(group);

    // Update max-height if card is currently expanded
    if (group.expanded) {
        group.body.style.maxHeight = group.body.scrollHeight + "px";
    }
}

function _updateSummary(group) {
    const parts = [];
    if (group.counts.thinking > 0) {
        const n = group.counts.thinking;
        parts.push(n + " thought" + (n !== 1 ? "s" : ""));
    }
    if (group.counts.tool_call > 0) {
        const n = group.counts.tool_call;
        parts.push(n + " tool call" + (n !== 1 ? "s" : ""));
    }
    if (group.counts.tool_result > 0) {
        const n = group.counts.tool_result;
        parts.push(n + " result" + (n !== 1 ? "s" : ""));
    }
    group.summary.textContent = "Inner workings: " + parts.join(", ");
}

function _toggleCard(group) {
    group.expanded = !group.expanded;
    if (group.expanded) {
        group.card.classList.remove("iw-card--collapsed");
        group.card.classList.add("iw-card--expanded");
        group.body.style.maxHeight = group.body.scrollHeight + "px";
        group.toggleBtn.textContent = "\u25BC Hide";
    } else {
        group.card.classList.remove("iw-card--expanded");
        group.card.classList.add("iw-card--collapsed");
        group.body.style.maxHeight = "0";
        group.toggleBtn.textContent = "\u25B6 Show";
    }
}

function _removeItemFromGroup(beat, group) {
    const item = group.items.get(beat.id);
    if (!item) return;

    item.remove();
    group.items.delete(beat.id);

    if (beat.type in group.counts) {
        group.counts[beat.type]--;
    }

    if (group.items.size === 0) {
        group.card.remove();
        _activeGroups.delete(beat.group_id);
    } else {
        _updateSummary(group);
        if (group.expanded) {
            group.body.style.maxHeight = group.body.scrollHeight + "px";
        }
    }
}

// Browser export
if (typeof window !== "undefined") {
    window.ClawbackRenderer = {
        renderBeat,
        removeBeat,
        toggleAllInnerWorkings,
        resetGroups,
    };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        renderBeat,
        removeBeat,
        toggleAllInnerWorkings,
        resetGroups,
    };
}
