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

// Configure marked to open all links in a new tab
marked.use({
    renderer: {
        link: function (args) {
            var href = /^javascript:/i.test(args.href) ? "#" : args.href;
            var label = (args.tokens && args.tokens.length)
                ? this.parser.parseInline(args.tokens)
                : (args.text || href);
            return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">'
                + label + '</a>';
        },
    },
});

/** @type {Map<number, Object>} Active inner workings groups by group_id */
const _activeGroups = new Map();

/** @type {boolean} Default expanded state for newly created IW cards */
var _defaultExpanded = false;

/**
 * Transforms Claude Code serialization tags in user message content into
 * clean plain text. Handles slash commands, local command output, and
 * system reminders. Returns the original text unchanged if no tags found.
 */
function _formatUserContent(text) {
    if (!text) return "";

    // Strip <system-reminder>...</system-reminder> blocks (may span lines)
    var result = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");

    // Strip <local-command-caveat>...</local-command-caveat> boilerplate
    result = result.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "");

    // Transform <local-command-stdout>...</local-command-stdout> — extract and clean
    result = result.replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g, function (_, inner) {
        // Strip ANSI escape codes
        var cleaned = inner.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
        return cleaned.trim();
    });

    // Transform slash command tags into clean text
    if (result.indexOf("<command-name>") !== -1) {
        var cmdName = "";
        var cmdArgs = "";
        var match;

        match = result.match(/<command-name>([\s\S]*?)<\/command-name>/);
        if (match) cmdName = match[1].trim();

        match = result.match(/<command-args>([\s\S]*?)<\/command-args>/);
        if (match) cmdArgs = match[1].trim();

        // Strip all three command tags
        result = result.replace(/<command-name>[\s\S]*?<\/command-name>/g, "");
        result = result.replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
        result = result.replace(/<command-args>[\s\S]*?<\/command-args>/g, "");

        // Build clean command text
        var cmd = cmdName;
        if (cmdArgs) cmd += " " + cmdArgs;
        result = cmd + result;
    }

    // Collapse runs of whitespace left by stripped tags
    result = result.replace(/[ \t]+/g, " ");
    return result.trim();
}

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
    if (beat.type === "callout") {
        return _renderCalloutBeat(beat, container);
    }

    if (beat.type === "artifact") {
        return _renderArtifactBeat(beat, container);
    }

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
        var formatted = _formatUserContent(beat.content);
        if (!formatted) return null;
        bubble.textContent = formatted;
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
    _defaultExpanded = expanded;
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
    _defaultExpanded = false;
}

/**
 * Renders artifact content into a panel content element.
 *
 * @param {Object} artifact - Artifact data with content_type and content
 * @param {HTMLElement} contentEl - Panel content container
 */
function renderArtifactPanel(artifact, contentEl) {
    contentEl.innerHTML = "";
    if (artifact.contentType === "code") {
        var pre = document.createElement("pre");
        var code = document.createElement("code");
        code.textContent = artifact.artifactContent || "";
        pre.appendChild(code);
        contentEl.appendChild(pre);
        hljs.highlightElement(code);
    } else {
        contentEl.innerHTML = DOMPurify.sanitize(
            marked.parse(artifact.artifactContent || "")
        );
        contentEl.querySelectorAll("pre code").forEach(function (block) {
            hljs.highlightElement(block);
        });
    }
}

// ---------------------------------------------------------------------------
// Internal — artifact card rendering
// ---------------------------------------------------------------------------

function _renderArtifactBeat(beat, container) {
    var card = document.createElement("div");
    card.classList.add("artifact-card");
    card.dataset.beatId = String(beat.id);

    var icon = document.createElement("span");
    icon.classList.add("artifact-card__icon");
    icon.textContent = "\uD83D\uDCC4";

    var body = document.createElement("div");
    body.classList.add("artifact-card__body");

    var title = document.createElement("span");
    title.classList.add("artifact-card__title");
    title.textContent = beat.artifactTitle || "Artifact";

    var desc = document.createElement("span");
    desc.classList.add("artifact-card__desc");
    desc.textContent = beat.artifactDescription || "";

    body.appendChild(title);
    if (beat.artifactDescription) {
        body.appendChild(desc);
    }

    var prompt = document.createElement("span");
    prompt.classList.add("artifact-card__prompt");
    prompt.textContent = "Click to view \u25B6";

    card.appendChild(icon);
    card.appendChild(body);
    card.appendChild(prompt);
    container.appendChild(card);
    return card;
}

// ---------------------------------------------------------------------------
// Internal — callout rendering
// ---------------------------------------------------------------------------

function _renderCalloutBeat(beat, container) {
    var card = document.createElement("div");
    card.classList.add("callout");
    card.dataset.beatId = String(beat.id);

    var isWarning = beat.calloutStyle === "warning";
    card.classList.add(isWarning ? "callout--warning" : "callout--note");

    var header = document.createElement("div");
    header.classList.add("callout__header");

    var icon = document.createElement("span");
    icon.classList.add("callout__icon");
    icon.textContent = isWarning ? "\u26A0\uFE0F" : "\uD83D\uDCDD";

    var title = document.createElement("span");
    title.classList.add("callout__title");
    title.textContent = isWarning ? "Warning" : "Instructor Note";

    header.appendChild(icon);
    header.appendChild(title);

    var content = document.createElement("div");
    content.classList.add("callout__content");
    content.innerHTML = DOMPurify.sanitize(marked.parse(beat.content));
    content.querySelectorAll("pre code").forEach(function (block) {
        hljs.highlightElement(block);
    });

    card.appendChild(header);
    card.appendChild(content);
    container.appendChild(card);
    return card;
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
    card.classList.add("iw-card", _defaultExpanded ? "iw-card--expanded" : "iw-card--collapsed");
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
    toggleBtn.textContent = _defaultExpanded ? "\u25BC Hide" : "\u25B6 Show";

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
        expanded: _defaultExpanded,
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

function _appendHighlightedCode(container, text) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = text;
    pre.appendChild(code);
    container.appendChild(pre);
    hljs.highlightElement(code);
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
        _appendHighlightedCode(content, beat.content);
    } else if (beat.type === "tool_result") {
        icon.textContent = "\uD83D\uDCCB";
        label.textContent = "Tool Result";
        if (beat.metadata && beat.metadata.is_error) {
            label.textContent += " (Error)";
            item.classList.add("iw-item--error");
        }
        content.classList.add("iw-item__content--scrollable");
        _appendHighlightedCode(content, beat.content);
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

    // Update max-height instantly if card is currently expanded
    // (skip CSS transition so scrollHeight reflects full height immediately)
    if (group.expanded) {
        group.body.style.transition = "none";
        group.body.style.maxHeight = group.body.scrollHeight + "px";
        group.body.offsetHeight; // force reflow
        group.body.style.transition = "";
    }
}

function _pluralize(count, singular, plural) {
    return count + " " + (count !== 1 ? plural : singular);
}

function _updateSummary(group) {
    const parts = [];
    if (group.counts.thinking > 0) {
        parts.push(_pluralize(group.counts.thinking, "thought", "thoughts"));
    }
    if (group.counts.tool_call > 0) {
        parts.push(_pluralize(group.counts.tool_call, "tool call", "tool calls"));
    }
    if (group.counts.tool_result > 0) {
        parts.push(_pluralize(group.counts.tool_result, "result", "results"));
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
        renderArtifactPanel,
    };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        renderBeat,
        removeBeat,
        toggleAllInnerWorkings,
        resetGroups,
        renderArtifactPanel,
        _formatUserContent,
    };
}
