/**
 * Clawback — Client-side annotation data manager.
 *
 * Receives annotation data from the API, provides lookup functions for
 * the playback engine, and manages annotation state for the editor.
 */

/** Preset color palette for section tags. */
var ANNOTATION_COLORS = {
    blue: "#4A90D9",
    purple: "#7B61FF",
    green: "#2ECC71",
    orange: "#E67E22",
    red: "#E74C3C",
    teal: "#1ABC9C",
    pink: "#E84393",
    amber: "#F39C12",
    indigo: "#5C6BC0",
    slate: "#95A5A6",
};

var _annotationIdCounter = 0;

var ClawbackAnnotations = {
    _sessionId: null,
    _sections: [],
    _callouts: [],
    _artifacts: [],
    _afterBeatIndex: null, // Map<beatId, Array<annotation>>

    /**
     * Initialize with annotation data from the API response.
     *
     * @param {Object|null} annotations - Annotation data or null
     * @param {string} sessionId - The session ID
     */
    init: function (annotations, sessionId) {
        this._sessionId = sessionId;

        if (!annotations) {
            this._sections = [];
            this._callouts = [];
            this._artifacts = [];
            this._afterBeatIndex = new Map();
            return;
        }

        this._sections = annotations.sections || [];
        this._callouts = annotations.callouts || [];
        this._artifacts = annotations.artifacts || [];
        this._buildIndex();
    },

    /**
     * Build the after-beat lookup index for callouts and artifacts.
     * @private
     */
    _buildIndex: function () {
        this._afterBeatIndex = new Map();

        var self = this;

        this._callouts.forEach(function (callout) {
            var key = callout.after_beat;
            if (key === undefined || key === null) return;
            if (!self._afterBeatIndex.has(key)) {
                self._afterBeatIndex.set(key, []);
            }
            self._afterBeatIndex.get(key).push({
                type: "callout",
                data: callout,
            });
        });

        this._artifacts.forEach(function (artifact) {
            var key = artifact.after_beat;
            if (key === undefined || key === null) return;
            if (!self._afterBeatIndex.has(key)) {
                self._afterBeatIndex.set(key, []);
            }
            self._afterBeatIndex.get(key).push({
                type: "artifact",
                data: artifact,
            });
        });
    },

    /**
     * Returns array of annotations that should render after this beat.
     * Each item has { type: "callout"|"artifact", data: {...} }.
     * Callouts come before artifacts in the returned array.
     *
     * @param {number} beatId - The beat ID (0-indexed)
     * @returns {Array<Object>} Annotations to render after this beat
     */
    getAnnotationsAfterBeat: function (beatId) {
        if (!this._afterBeatIndex || !this._afterBeatIndex.has(beatId)) {
            return [];
        }
        return this._afterBeatIndex.get(beatId);
    },

    /**
     * Returns the section that contains this beat, or null.
     * If multiple sections overlap, returns the first match.
     *
     * @param {number} beatId - The beat ID (0-indexed)
     * @returns {Object|null} The section object or null
     */
    getSectionForBeat: function (beatId) {
        for (var i = 0; i < this._sections.length; i++) {
            var sec = this._sections[i];
            if (beatId >= sec.start_beat && beatId <= sec.end_beat) {
                return sec;
            }
        }
        return null;
    },

    /**
     * Returns all sections for sidebar rendering.
     *
     * @returns {Array<Object>} The sections array
     */
    getSections: function () {
        return this._sections.slice();
    },

    /**
     * Returns all callouts.
     *
     * @returns {Array<Object>} The callouts array (shallow copy)
     */
    getCallouts: function () {
        return this._callouts.slice();
    },

    /**
     * Returns all artifacts.
     *
     * @returns {Array<Object>} The artifacts array (shallow copy)
     */
    getArtifacts: function () {
        return this._artifacts.slice();
    },

    /**
     * Check if any annotations are loaded.
     *
     * @returns {boolean} True if at least one annotation exists
     */
    hasAnnotations: function () {
        return (
            this._sections.length > 0 ||
            this._callouts.length > 0 ||
            this._artifacts.length > 0
        );
    },

    /**
     * Check if section tags exist.
     *
     * @returns {boolean} True if at least one section exists
     */
    hasSections: function () {
        return this._sections.length > 0;
    },

    /**
     * Get the hex color for a palette key.
     *
     * @param {string} colorKey - Palette key (e.g., "blue")
     * @returns {string} Hex color string
     */
    getColorHex: function (colorKey) {
        return ANNOTATION_COLORS[colorKey] || ANNOTATION_COLORS.slate;
    },

    // --- Editor mutation methods (used by the annotation editor) ---

    /**
     * Add a section tag.
     *
     * @param {number} startBeat - First beat in range
     * @param {number} endBeat - Last beat in range
     * @param {string} label - Section label
     * @param {string} color - Color key from palette
     * @returns {Object} The created section
     */
    createSection: function (startBeat, endBeat, label, color) {
        // Auto-swap if reversed
        if (startBeat > endBeat) {
            var tmp = startBeat;
            startBeat = endBeat;
            endBeat = tmp;
        }
        var section = {
            id: "sec-" + (++_annotationIdCounter),
            start_beat: startBeat,
            end_beat: endBeat,
            label: label,
            color: color,
        };
        this._sections.push(section);
        return section;
    },

    /**
     * Add a callout annotation.
     *
     * @param {number} afterBeat - Beat after which callout appears
     * @param {string} style - "note" or "warning"
     * @param {string} content - Callout text content
     * @returns {Object} The created callout
     */
    createCallout: function (afterBeat, style, content) {
        var callout = {
            id: "cal-" + (++_annotationIdCounter),
            after_beat: afterBeat,
            style: style,
            content: content,
        };
        this._callouts.push(callout);
        this._buildIndex();
        return callout;
    },

    /**
     * Add an embedded artifact.
     *
     * @param {number} afterBeat - Beat after which artifact card appears
     * @param {string} title - Artifact title
     * @param {string} description - Brief description
     * @param {string} contentType - "markdown" or "code"
     * @param {string} content - The artifact content
     * @returns {Object} The created artifact
     */
    createArtifact: function (afterBeat, title, description, contentType, content) {
        var artifact = {
            id: "art-" + (++_annotationIdCounter),
            after_beat: afterBeat,
            title: title,
            description: description,
            content_type: contentType,
            content: content,
        };
        this._artifacts.push(artifact);
        this._buildIndex();
        return artifact;
    },

    /**
     * Update an existing annotation by ID.
     *
     * @param {string} id - Annotation ID (e.g., "sec-1", "cal-1", "art-1")
     * @param {Object} changes - Key-value pairs to merge
     * @returns {boolean} True if found and updated
     */
    updateAnnotation: function (id, changes) {
        var safeChanges = Object.assign({}, changes);
        delete safeChanges.id;
        var arrays = [this._sections, this._callouts, this._artifacts];
        for (var a = 0; a < arrays.length; a++) {
            for (var i = 0; i < arrays[a].length; i++) {
                if (arrays[a][i].id === id) {
                    Object.assign(arrays[a][i], safeChanges);
                    this._buildIndex();
                    return true;
                }
            }
        }
        return false;
    },

    /**
     * Delete an annotation by ID.
     *
     * @param {string} id - Annotation ID
     * @returns {boolean} True if found and deleted
     */
    deleteAnnotation: function (id) {
        var lists = [
            { arr: this._sections, name: "sections" },
            { arr: this._callouts, name: "callouts" },
            { arr: this._artifacts, name: "artifacts" },
        ];
        for (var l = 0; l < lists.length; l++) {
            var arr = lists[l].arr;
            for (var i = 0; i < arr.length; i++) {
                if (arr[i].id === id) {
                    arr.splice(i, 1);
                    this._buildIndex();
                    return true;
                }
            }
        }
        return false;
    },

    /**
     * Export annotation data for saving to the server.
     *
     * @returns {Object} The annotation data object
     */
    toJSON: function () {
        return {
            session_id: this._sessionId,
            sections: this._sections.slice(),
            callouts: this._callouts.slice(),
            artifacts: this._artifacts.slice(),
        };
    },

    /**
     * Save annotations to the server via PUT.
     *
     * @returns {Promise<Response>} The fetch response
     */
    save: function () {
        if (!this._sessionId) {
            return Promise.reject(new Error("No session ID"));
        }
        return fetch("/api/sessions/" + this._sessionId + "/annotations", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.toJSON()),
        });
    },
};

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { ClawbackAnnotations: ClawbackAnnotations, ANNOTATION_COLORS: ANNOTATION_COLORS };
}
