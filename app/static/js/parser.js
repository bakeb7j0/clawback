/**
 * Clawback — Client-side JSONL-to-beats parser.
 *
 * Transforms raw Claude Code session JSONL text into an ordered array
 * of beat objects for the playback engine. Runs entirely in the browser.
 *
 * Pipeline: Raw JSONL → parse lines → filter conversation messages →
 *           order by parentUuid chain → extract beats → calculate durations →
 *           assign group IDs → beat array
 */

/** Words per minute for dense technical content reading pace. */
const BASE_WPM = 100;

/** Minimum beat duration in seconds. */
const MIN_DURATION = 1.0;

/**
 * Message types to keep from the JSONL stream.
 * Everything else (progress, system, file-history-snapshot, etc.) is discarded.
 */
const CONVERSATION_TYPES = new Set(["user", "assistant"]);

/**
 * Main entry point. Parses raw JSONL text into an array of beats.
 *
 * @param {string} jsonlText - Raw JSONL file content
 * @returns {{ beats: Array<Object>, errors: number }} Parsed beats and count of skipped lines
 */
function parseSession(jsonlText) {
    const { messages, errors } = parseJsonlLines(jsonlText);
    const conversationMessages = filterConversationMessages(messages);
    const ordered = orderMessages(conversationMessages);
    const beats = extractBeats(ordered);
    calculateDurations(beats);
    assignGroupIds(beats);
    return { beats, errors };
}

/**
 * Splits JSONL text into lines and parses each as JSON.
 * Malformed lines are counted but not thrown.
 *
 * @param {string} text - Raw JSONL content
 * @returns {{ messages: Array<Object>, errors: number }}
 */
function parseJsonlLines(text) {
    const messages = [];
    let errors = 0;

    const lines = text.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            messages.push(JSON.parse(trimmed));
        } catch {
            errors++;
        }
    }

    return { messages, errors };
}

/**
 * Filters to only conversation-relevant message types (user, assistant).
 *
 * @param {Array<Object>} messages - All parsed JSONL objects
 * @returns {Array<Object>} Only user and assistant messages
 */
function filterConversationMessages(messages) {
    return messages.filter((msg) => CONVERSATION_TYPES.has(msg.type));
}

/**
 * Orders messages by walking the parentUuid linked list.
 * Falls back to timestamp sort if the chain is broken.
 *
 * @param {Array<Object>} messages - Filtered conversation messages
 * @returns {Array<Object>} Messages in conversation order
 */
function orderMessages(messages) {
    if (messages.length === 0) return [];

    // Build lookup: uuid → message
    const byUuid = new Map();
    for (const msg of messages) {
        if (msg.uuid) {
            byUuid.set(msg.uuid, msg);
        }
    }

    // Build lookup: parentUuid → children (in insertion order)
    const childrenOf = new Map();
    const allChildUuids = new Set();
    for (const msg of messages) {
        const parent = msg.parentUuid;
        if (parent) {
            if (!childrenOf.has(parent)) {
                childrenOf.set(parent, []);
            }
            childrenOf.get(parent).push(msg);
            if (msg.uuid) {
                allChildUuids.add(msg.uuid);
            }
        }
    }

    // Find root(s): messages whose parentUuid doesn't point to another
    // conversation message. There may be multiple roots if the chain starts
    // from a non-conversation message (progress/system).
    const roots = messages.filter((msg) => {
        if (!msg.parentUuid) return true;
        // Parent is a conversation message we have — not a root
        if (byUuid.has(msg.parentUuid)) return false;
        return true;
    });

    if (roots.length === 0) {
        // Fallback: sort by timestamp
        return [...messages].sort(
            (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
        );
    }

    // Sort roots by timestamp so we start from the earliest
    roots.sort(
        (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
    );

    // Walk the tree depth-first from each root
    const ordered = [];
    const visited = new Set();

    function walk(msg) {
        if (!msg || !msg.uuid || visited.has(msg.uuid)) return;
        visited.add(msg.uuid);
        ordered.push(msg);

        const children = childrenOf.get(msg.uuid) || [];
        // Sort children by timestamp to maintain order
        children.sort(
            (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
        );
        for (const child of children) {
            walk(child);
        }
    }

    for (const root of roots) {
        walk(root);
    }

    // If some messages weren't reached (broken chain), append by timestamp
    if (ordered.length < messages.length) {
        const remaining = messages.filter(
            (msg) => !msg.uuid || !visited.has(msg.uuid),
        );
        remaining.sort(
            (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
        );
        ordered.push(...remaining);
    }

    return ordered;
}

/**
 * Extracts beat objects from ordered messages.
 * Each JSONL entry produces at most one beat.
 *
 * @param {Array<Object>} orderedMessages - Messages in conversation order
 * @returns {Array<Object>} Beat objects
 */
function extractBeats(orderedMessages) {
    const beats = [];
    let id = 0;

    for (const msg of orderedMessages) {
        const timestamp = msg.timestamp || null;

        if (msg.type === "user") {
            const content = msg.message?.content;

            if (typeof content === "string" && content.trim()) {
                beats.push({
                    id: id++,
                    type: "user_message",
                    category: "direct",
                    content: content,
                    metadata: { timestamp },
                    duration: 0,
                    group_id: null,
                });
            } else if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === "tool_result") {
                        const resultContent = extractToolResultContent(block);
                        beats.push({
                            id: id++,
                            type: "tool_result",
                            category: "inner_working",
                            content: resultContent,
                            metadata: {
                                tool_use_id: block.tool_use_id || null,
                                is_error: block.is_error || false,
                                timestamp,
                            },
                            duration: 0,
                            group_id: null,
                        });
                    } else if (
                        block.type === "text" &&
                        typeof block.text === "string" &&
                        block.text.trim()
                    ) {
                        // User text that accompanies a tool result (rare but possible)
                        beats.push({
                            id: id++,
                            type: "user_message",
                            category: "direct",
                            content: block.text,
                            metadata: { timestamp },
                            duration: 0,
                            group_id: null,
                        });
                    }
                }
            }
        } else if (msg.type === "assistant") {
            const content = msg.message?.content;
            if (!Array.isArray(content)) continue;

            for (const block of content) {
                if (block.type === "text" && typeof block.text === "string") {
                    if (!block.text.trim()) continue;
                    beats.push({
                        id: id++,
                        type: "assistant_message",
                        category: "direct",
                        content: block.text,
                        metadata: {
                            model: msg.message?.model || null,
                            timestamp,
                        },
                        duration: 0,
                        group_id: null,
                    });
                } else if (block.type === "thinking") {
                    const thinking = block.thinking || "";
                    if (!thinking.trim()) continue;
                    beats.push({
                        id: id++,
                        type: "thinking",
                        category: "inner_working",
                        content: thinking,
                        metadata: { timestamp },
                        duration: 0,
                        group_id: null,
                    });
                } else if (block.type === "tool_use") {
                    beats.push({
                        id: id++,
                        type: "tool_call",
                        category: "inner_working",
                        content: formatToolInput(block.input),
                        metadata: {
                            tool_name: block.name || "Unknown",
                            tool_input: block.input || {},
                            tool_use_id: block.id || null,
                            timestamp,
                        },
                        duration: 0,
                        group_id: null,
                    });
                }
            }
        }
    }

    return beats;
}

/**
 * Extracts displayable text from a tool_result content field.
 * Content can be a string, an array of blocks, or absent.
 *
 * @param {Object} block - The tool_result block
 * @returns {string} Displayable text content
 */
function extractToolResultContent(block) {
    const content = block.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((b) => {
                if (typeof b === "string") return b;
                if (b.type === "text") return b.text || "";
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    return "";
}

/**
 * Formats tool input into a readable string.
 *
 * @param {Object|string|undefined} input - Tool use input
 * @returns {string} Formatted input string
 */
function formatToolInput(input) {
    if (!input) return "";
    if (typeof input === "string") return input;

    // For common tools, show the most relevant field
    if (input.command) return input.command;
    if (input.file_path) return input.file_path;
    if (input.pattern) return input.pattern;

    return JSON.stringify(input, null, 2);
}

/**
 * Calculates display duration for each beat based on word count.
 * Duration = (words / WPM) * 60, clamped to [MIN_DURATION, MAX_DURATION].
 *
 * @param {Array<Object>} beats - Beat array (mutated in place)
 */
function calculateDurations(beats) {
    for (const beat of beats) {
        const words = countWords(beat.content);
        const rawSeconds = (words / BASE_WPM) * 60;
        beat.duration = Math.max(MIN_DURATION, rawSeconds);
    }
}

/**
 * Counts words in a string.
 *
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Assigns group_id to consecutive inner_working beats so they can be
 * rendered together in a single collapsible summary card.
 *
 * @param {Array<Object>} beats - Beat array (mutated in place)
 */
function assignGroupIds(beats) {
    let groupId = 0;
    let inGroup = false;

    for (const beat of beats) {
        if (beat.category === "inner_working") {
            if (!inGroup) {
                groupId++;
                inGroup = true;
            }
            beat.group_id = groupId;
        } else {
            inGroup = false;
        }
    }
}

// Export for use in other modules and testing
if (typeof window !== "undefined") {
    window.ClawbackParser = {
        parseSession,
        parseJsonlLines,
        filterConversationMessages,
        orderMessages,
        extractBeats,
        calculateDurations,
        assignGroupIds,
        countWords,
    };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseSession,
        parseJsonlLines,
        filterConversationMessages,
        orderMessages,
        extractBeats,
        calculateDurations,
        assignGroupIds,
        countWords,
    };
}
