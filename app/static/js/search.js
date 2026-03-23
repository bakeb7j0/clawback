/**
 * Clawback — Within-session search engine.
 *
 * Pure-logic module: takes beats and a query, returns results.
 * No DOM manipulation — keeps it testable via Node.js.
 */

var ClawbackSearch = {
    /**
     * Search a beat array for case-insensitive substring matches.
     *
     * @param {Array<Object>} beats - The merged beat array
     * @param {string} query - Search query
     * @returns {Array<Object>} Array of result objects in beat order
     */
    search: function (beats, query) {
        if (!beats || !query || !query.trim()) return [];
        var q = query.trim().toLowerCase();
        var results = [];

        for (var i = 0; i < beats.length; i++) {
            var beat = beats[i];
            var searchable = beat.content || "";

            // For artifacts, also search title, description, and full content
            if (beat.isArtifact) {
                searchable = [
                    beat.artifactTitle || "",
                    beat.artifactDescription || "",
                    beat.artifactContent || "",
                    searchable,
                ].join(" ");
            }

            if (!searchable || searchable.toLowerCase().indexOf(q) === -1) continue;

            results.push({
                beatIndex: i,
                beatId: beat.id,
                type: beat.type || (beat.isCallout ? "callout" : beat.isArtifact ? "artifact" : "unknown"),
                category: beat.category || "",
                content: searchable,
                groupId: beat.group_id != null ? beat.group_id : null,
            });
        }

        return results;
    },

    /**
     * Extract a snippet from content centered on the first match.
     * Returns { before, match, after } for rendering with <mark> tags.
     *
     * @param {string} content - Full text content
     * @param {string} query - The search query
     * @returns {{ before: string, match: string, after: string }|null}
     */
    snippet: function (content, query) {
        if (!content || !query) return null;
        var lower = content.toLowerCase();
        var q = query.trim().toLowerCase();
        var idx = lower.indexOf(q);
        if (idx === -1) return null;

        var windowSize = 30; // chars on each side of match
        var start = Math.max(0, idx - windowSize);
        var end = Math.min(content.length, idx + q.length + windowSize);

        var before = content.slice(start, idx);
        var match = content.slice(idx, idx + q.length);
        var after = content.slice(idx + q.length, end);

        if (start > 0) before = "\u2026" + before;
        if (end < content.length) after = after + "\u2026";

        return { before: before, match: match, after: after };
    },

    /**
     * Get a display icon for a beat type.
     *
     * @param {string} type - Beat type
     * @returns {string} Unicode icon
     */
    beatTypeIcon: function (type) {
        switch (type) {
            case "user_message": return "\uD83D\uDCAC";
            case "assistant_message": return "\uD83E\uDD16";
            case "thinking": return "\uD83D\uDCAD";
            case "tool_call": return "\uD83D\uDD27";
            case "tool_result": return "\uD83D\uDCCB";
            case "callout": return "\uD83D\uDCDD";
            case "artifact": return "\uD83D\uDCC4";
            default: return "\u2022";
        }
    },
};

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { ClawbackSearch: ClawbackSearch };
}
