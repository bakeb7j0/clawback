/**
 * Clawback — Main application state and Alpine.js initialization.
 *
 * Wires the parser, playback engine, renderer, and scroller together.
 * Provides session picker, file upload, and playback view management.
 */
function clawbackApp() {
    return {
        sessionName: "",
        view: "picker", // "picker" or "playback"
        playbackState: "READY",
        showBeatNumbers: false,
        currentBeat: 0,
        totalBeats: 0,
        speed: 1.0,
        innerWorkingsMode: "collapsed",
        sessions: [],
        loadingSessions: true,
        loadingSession: false,
        uploadError: "",
        showSections: false,
        activeSection: null,
        sectionList: [],
        progressSegments: [{ width: 100, color: null }],
        artifactOpen: false,
        _currentArtifact: null,
        readOnly: true,
        editMode: false,
        _contextMenu: null,
        editToast: "",
        _editToastTimeout: null,
        _sectionForm: null,
        _pendingSection: null,
        _inlineEditor: null,
        _activeEditForm: null,
        _uploadForm: null,
        _engine: null,
        _scroller: null,
        _conversationBeatsRendered: 0,
        _beatIdToMergedIndex: null,
        tourActive: false,
        tourStep: 0,
        _tourSteps: [
            { target: ".toolbar__group:first-child", title: "Transport Controls", text: "Play, pause, skip forward/back, and jump to start or end. Keyboard: Space to play/pause, Left/Right arrows to step through beats.", position: "top" },
            { target: ".speed-stepper", title: "Speed Control", text: "Adjust playback speed from 0.5x to 4.0x. Keyboard: Up/Down arrows. Slower speeds give you time to read dense content; faster speeds let you skim.", position: "top" },
            { target: ".toolbar__label", title: "Inner Workings", text: "Toggle between Collapsed and Expanded to show or hide the AI's thinking, tool calls, and tool results. Collapsed gives a clean chat view.", position: "top" },
            { target: ".chat-area", title: "Chat Area", text: "Messages appear here as the session plays back. User messages are on the right, assistant messages on the left. Click any beat in edit mode to add annotations.", position: "bottom" },
            { target: ".toolbar__group--progress", title: "Progress Bar", text: "Shows your position in the session. The colored segments represent sections defined by the instructor. The beat counter shows your exact position.", position: "top" },
        ],
        _tourShowGlow: false,
        _tourRect: null,
        _tourResizeHandler: null,

        /** Called by Alpine.js on component initialization. */
        init() {
            this.fetchConfig();
            this.fetchSessions();
        },

        /** Fetch server configuration (e.g. read-only mode). */
        fetchConfig() {
            fetch("/api/config")
                .then(function (r) { return r.json(); })
                .then(function (data) { this.readOnly = !!data.readOnly; }.bind(this))
                .catch(function () { this.readOnly = false; }.bind(this));
        },

        /** Handle keyboard shortcuts (bound via @keydown.window on body). */
        handleKeydown(event) {
            // Upload form Escape works in any view
            if (event.code === "Escape" && this._uploadForm) {
                this.cancelUpload();
                return;
            }

            if (this.view !== "playback") return;

            // Escape is always handled, even inside form inputs
            if (event.code === "Escape") {
                if (this.tourActive) {
                    this.endTour();
                } else if (this._activeEditForm) {
                    this._dismissEditForm();
                } else if (this._sectionForm) {
                    this.cancelSectionForm();
                } else if (this._pendingSection) {
                    this.cancelPendingSection();
                } else if (this._inlineEditor) {
                    this._dismissInlineEditor();
                } else if (this._contextMenu) {
                    this.dismissContextMenu();
                } else if (this.artifactOpen) {
                    this.closeArtifact();
                }
                return;
            }

            var tag = event.target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (event.target.isContentEditable) return;

            switch (event.code) {
                case "Space":
                    event.preventDefault();
                    this.togglePlay();
                    break;
                case "ArrowLeft":
                    event.preventDefault();
                    this.previousBeat();
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    this.nextBeat();
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    this.increaseSpeed();
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    this.decreaseSpeed();
                    break;
            }
        },

        /** Fetch the list of curated sessions from the API. */
        fetchSessions() {
            this.loadingSessions = true;
            fetch("/api/sessions")
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    this.sessions = data.sessions || [];
                    this.loadingSessions = false;
                }.bind(this))
                .catch(function () {
                    this.sessions = [];
                    this.loadingSessions = false;
                }.bind(this));
        },

        /** Load a curated session by fetching its beats from the API. */
        loadSession(session) {
            this.loadingSession = true;
            this.uploadError = "";
            fetch("/api/sessions/" + session.id)
                .then(function (r) {
                    if (!r.ok) throw new Error("Failed to load session");
                    return r.json();
                })
                .then(function (data) {
                    this.loadingSession = false;
                    this.startPlayback(data.beats, data.title || session.title, data.annotations);
                }.bind(this))
                .catch(function (err) {
                    this.loadingSession = false;
                    this.uploadError = "Failed to load session: " + err.message;
                }.bind(this));
        },

        /** Handle file selection from the file input. */
        handleFileUpload(event) {
            var file = event.target.files[0];
            if (!file) return;
            this._readAndParseFile(file);
        },

        /** Handle file drop on the upload zone. */
        handleFileDrop(event) {
            var file = event.dataTransfer.files[0];
            if (!file) return;
            this._readAndParseFile(file);
        },

        /** Read a file via FileReader and parse it client-side. */
        _readAndParseFile(file) {
            this.uploadError = "";
            var self = this;
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var result = ClawbackParser.parseSession(e.target.result);
                    if (result.beats.length === 0) {
                        self.uploadError = "No conversation beats found in file.";
                        return;
                    }
                    var name = file.name.replace(/\.jsonl$/, "");
                    self.startPlayback(result.beats, name);
                } catch (err) {
                    self.uploadError = "Failed to parse file: " + err.message;
                }
            };
            reader.onerror = function () {
                self.uploadError = "Failed to read file.";
            };
            reader.readAsText(file);
        },

        // ---------------------------------------------------------------
        // Server upload — "Add Session" flow
        // ---------------------------------------------------------------

        /**
         * Open the upload form after the user selects a .jsonl file.
         * Called by the hidden file input inside the "Add Session" card.
         *
         * @param {Event} event - File input change event
         */
        openUploadForm(event) {
            if (this.readOnly) return;
            var file = event.target.files[0];
            if (!file) return;
            // Pre-fill title from filename
            var defaultTitle = file.name.replace(/\.jsonl$/, "").replace(/[-_]/g, " ");
            this._uploadForm = {
                file: file,
                title: defaultTitle,
                description: "",
                tags: "",
                error: "",
                uploading: false,
            };
            // Reset input so the same file can be re-selected
            event.target.value = "";
        },

        /** Cancel the upload form and discard the selected file. */
        cancelUpload() {
            this._uploadForm = null;
        },

        /** Submit the upload form to POST /api/sessions/upload. */
        submitUpload() {
            if (!this._uploadForm) return;
            var title = this._uploadForm.title.trim();
            if (!title) {
                this._uploadForm.error = "Title is required";
                return;
            }
            this._uploadForm.error = "";
            this._uploadForm.uploading = true;

            var formData = new FormData();
            formData.append("file", this._uploadForm.file);
            formData.append("title", title);
            formData.append("description", this._uploadForm.description.trim());
            formData.append("tags", this._uploadForm.tags.trim());

            var self = this;
            fetch("/api/sessions/upload", { method: "POST", body: formData })
                .then(function (r) {
                    return r.json().then(function (data) {
                        return { ok: r.ok, data: data };
                    });
                })
                .then(function (result) {
                    if (!self._uploadForm) return;
                    if (!result.ok) {
                        self._uploadForm.uploading = false;
                        self._uploadForm.error = result.data.message || "Upload failed";
                        return;
                    }
                    // Add the new session to the picker grid
                    self.sessions.push(result.data.session);
                    self._uploadForm = null;
                })
                .catch(function () {
                    if (!self._uploadForm) return;
                    self._uploadForm.uploading = false;
                    self._uploadForm.error = "Upload failed — check your connection";
                });
        },

        /** Tear down the current engine and scroller. */
        _teardown(stopMethod) {
            if (this._engine) {
                this._engine[stopMethod]();
                this._engine = null;
            }
            if (this._scroller) {
                this._scroller.destroy();
                this._scroller = null;
            }
        },

        /** Return to the session picker view. */
        backToSessions() {
            this._teardown("pause");
            this.view = "picker";
            this.playbackState = "READY";
            this.currentBeat = 0;
            this.totalBeats = 0;
            this.sessionName = "";
            this.showSections = false;
            this.activeSection = null;
            this.sectionList = [];
            this.progressSegments = [{ width: 100, color: null }];
            this._conversationBeatsRendered = 0;
            this._beatIdToMergedIndex = null;
            this.artifactOpen = false;
            this._currentArtifact = null;
            this.editMode = false;
            this._contextMenu = null;
            this.editToast = "";
            this._sectionForm = null;
            this._pendingSection = null;
            this._dismissInlineEditor();
            this._dismissEditForm();
            var panelContent = this.$refs.artifactPanelContent;
            if (panelContent) {
                panelContent.innerHTML = "";
            }
        },

        /**
         * Load a parsed beat array and start the playback view.
         *
         * @param {Array<Object>} beats - Beat array from parser
         * @param {string} [name] - Session display name
         * @param {Object|null} [annotations] - Annotation data from API
         */
        startPlayback(beats, name, annotations) {
            this._teardown("skipToStart");

            this.sessionName = name || "";
            this.view = "playback";
            this.currentBeat = 0;
            this.totalBeats = beats.length;
            this.speed = 1.0;
            this.innerWorkingsMode = "collapsed";
            this._conversationBeatsRendered = 0;

            // Initialize annotations if available
            if (typeof ClawbackAnnotations !== "undefined") {
                ClawbackAnnotations.init(annotations || null, name || "local");
                this.sectionList = ClawbackAnnotations.getSections();
                this.showSections = ClawbackAnnotations.hasSections();
                this.activeSection = null;
                this.progressSegments = this._computeProgressSegments();
            } else {
                this.sectionList = [];
                this.showSections = false;
                this.activeSection = null;
                this.progressSegments = [{ width: 100, color: null }];
            }

            this._initTourGlow();

            // Build merged beat array with callout pseudo-beats interleaved
            var merged = this._buildMergedBeats(beats);

            var chatArea = this.$refs.chatArea;
            chatArea.innerHTML = "";
            ClawbackRenderer.resetGroups();

            var scrollContainer = chatArea.parentElement;
            var self = this;
            this._scroller = ClawbackScroller.createScroller({
                scrollContainer: scrollContainer,
                chatArea: chatArea,
                onScrollPause: function () {
                    if (self._engine) {
                        self._engine.scrollPause();
                    }
                },
            });

            this._engine = new PlaybackEngine({
                beats: merged,
                onBeat: function (beat) {
                    var el = ClawbackRenderer.renderBeat(beat, chatArea);
                    if (beat.type === "artifact" && el) {
                        el.addEventListener("click", function () {
                            self.openArtifact(beat);
                        });
                    }
                    if (!beat.isCallout && !beat.isArtifact) {
                        self._conversationBeatsRendered++;
                    }
                    self.currentBeat = self._conversationBeatsRendered;
                    self._updateActiveSection();
                    if (self._scroller) {
                        self._scroller.scrollToBottom();
                    }
                },
                onRemoveBeat: function (beat) {
                    ClawbackRenderer.removeBeat(beat, chatArea);
                    if (!beat.isCallout && !beat.isArtifact) {
                        self._conversationBeatsRendered--;
                    }
                    self.currentBeat = self._conversationBeatsRendered;
                    self._updateActiveSection();
                },
                onStateChange: function (newState, oldState) {
                    self.playbackState = newState;
                    if (self._scroller) {
                        if (newState === "PLAYING") {
                            self._scroller.enable();
                            if (oldState === "SCROLL_PAUSED") {
                                self._scroller.scrollToBottom();
                            }
                        } else {
                            self._scroller.disable();
                        }
                    }
                },
            });
        },

        /** Resume playback from SCROLL_PAUSED (used by scroll-pause indicator). */
        resumePlayback() {
            if (this._engine) {
                this._engine.play();
            }
        },

        /** Toggle between play and pause. */
        togglePlay() {
            this._dismissGlow();
            if (!this._engine) return;
            if (this.playbackState === "PLAYING") {
                this._engine.pause();
            } else {
                this._engine.play();
            }
        },

        /** Reset to the beginning. */
        skipToStart() {
            this._dismissEditForm();
            if (this._engine) {
                this._engine.skipToStart();
            }
        },

        /** Jump to the end. */
        skipToEnd() {
            this._dismissEditForm();
            if (this._engine) {
                this._engine.skipToEnd();
            }
        },

        /** Step forward one beat. */
        nextBeat() {
            this._dismissEditForm();
            if (this._engine) {
                this._engine.next();
            }
        },

        /** Step backward one beat. */
        previousBeat() {
            this._dismissEditForm();
            if (this._engine) {
                this._engine.previous();
            }
        },

        /** Set playback speed multiplier. */
        setSpeed(s) {
            this.speed = s;
            if (this._engine) {
                this._engine.setSpeed(s);
            }
        },

        /** Increase speed by 0.5, capped at 4.0. */
        increaseSpeed() {
            if (this.speed < 4.0) {
                this.setSpeed(Math.round((this.speed + 0.5) * 10) / 10);
            }
        },

        /** Decrease speed by 0.5, floored at 0.5. */
        decreaseSpeed() {
            if (this.speed > 0.5) {
                this.setSpeed(Math.round((this.speed - 0.5) * 10) / 10);
            }
        },

        /** Set inner workings display mode ("expanded" or "collapsed"). */
        setInnerWorkingsMode(mode) {
            this.innerWorkingsMode = mode;
            if (this._engine) {
                this._engine.setInnerWorkingsMode(mode);
                ClawbackRenderer.toggleAllInnerWorkings(
                    this.$refs.chatArea,
                    mode === "expanded"
                );
            }
        },

        /** Toggle section sidebar visibility. */
        toggleSections() {
            this.showSections = !this.showSections;
        },

        /** Start the coachmark tour. */
        startTour() {
            this._tourShowGlow = false;
            // Close competing overlays before opening tour
            if (this.artifactOpen) this.closeArtifact();
            if (this._contextMenu) this.dismissContextMenu();
            // Remove stale resize listener before re-registering
            if (this._tourResizeHandler) {
                window.removeEventListener("resize", this._tourResizeHandler);
            }
            this.tourStep = 0;
            this.tourActive = true;
            try { localStorage.setItem("clawback_toured", "1"); } catch (e) { /* noop */ }
            // Reposition spotlight on window resize
            this._tourResizeHandler = function () { this.getTourRect(); }.bind(this);
            window.addEventListener("resize", this._tourResizeHandler);
        },

        /** Advance to the next tour step, or end the tour. */
        tourNext() {
            if (this.tourStep < this._tourSteps.length - 1) {
                this.tourStep++;
            } else {
                this.endTour();
            }
        },

        /** Go back to the previous tour step. */
        tourPrev() {
            if (this.tourStep > 0) {
                this.tourStep--;
            }
        },

        /** End the tour. */
        endTour() {
            this.tourActive = false;
            if (this._tourResizeHandler) {
                window.removeEventListener("resize", this._tourResizeHandler);
                this._tourResizeHandler = null;
            }
        },

        /** Get the bounding rect for the current tour step's target element. */
        getTourRect() {
            if (!this.tourActive) { this._tourRect = null; return null; }
            var step = this._tourSteps[this.tourStep];
            var el = document.querySelector(step.target);
            if (!el) { this._tourRect = null; return null; }
            var r = el.getBoundingClientRect();
            this._tourRect = r;
            return r;
        },

        /** Get the current tour step definition. */
        getCurrentTourStep() {
            if (!this.tourActive) return null;
            return this._tourSteps[this.tourStep];
        },

        /** Check localStorage to show glow for first-time visitors. */
        _initTourGlow() {
            try {
                if (!localStorage.getItem("clawback_toured")) {
                    this._tourShowGlow = true;
                }
            } catch (e) {
                this._tourShowGlow = false;
            }
        },

        /** Dismiss the glow when user interacts with controls. */
        _dismissGlow() {
            this._tourShowGlow = false;
        },

        /** Open the artifact panel and pause playback. Disabled in edit mode. */
        openArtifact(beat) {
            if (this.editMode) return;
            if (this._engine && this.playbackState === "PLAYING") {
                this._engine.pause();
            }
            this._currentArtifact = beat;
            this.artifactOpen = true;
            var panelContent = this.$refs.artifactPanelContent;
            if (panelContent && typeof ClawbackRenderer !== "undefined") {
                ClawbackRenderer.renderArtifactPanel(beat, panelContent);
            }
        },

        /** Close the artifact panel (does NOT resume playback). */
        closeArtifact() {
            this.artifactOpen = false;
            this._currentArtifact = null;
            var panelContent = this.$refs.artifactPanelContent;
            if (panelContent) {
                panelContent.innerHTML = "";
            }
        },

        /** Toggle annotation editing mode. */
        toggleEditMode() {
            if (this.readOnly) return;
            this.editMode = !this.editMode;
            this.dismissContextMenu();
        },

        /**
         * Handle clicks in the chat area during edit mode.
         * Shows a context menu anchored to the clicked beat or annotation.
         *
         * @param {Event} event - Click event from the chat area
         */
        handleChatAreaClick(event) {
            if (!this.editMode) return;

            // Handle pending section: second beat click completes section.
            // Only .bubble elements are valid targets — callout/artifact pseudo-beats
            // have non-numeric IDs (e.g. "callout-3") that cannot be used as section boundaries.
            if (this._pendingSection) {
                if (this.playbackState === "PLAYING") {
                    this._showEditToast("Pause playback to edit");
                    return;
                }
                var endTarget = event.target.closest(".bubble");
                if (endTarget) {
                    this._completeSectionCreation(parseInt(endTarget.dataset.beatId, 10));
                }
                return;
            }

            // Clicks inside the inline editor or edit form are handled by the form itself
            if (event.target.closest(".inline-editor")) return;

            var target = event.target.closest(".bubble, .callout, .artifact-card");
            if (!target) {
                this.dismissContextMenu();
                this._dismissInlineEditor();
                this._dismissEditForm();
                return;
            }

            if (this.playbackState === "PLAYING") {
                this._showEditToast("Pause playback to edit");
                return;
            }

            var beatId = target.dataset.beatId;
            var isAnnotation = target.classList.contains("callout") ||
                target.classList.contains("artifact-card");

            var items;
            if (isAnnotation) {
                items = [
                    { label: "Edit", action: "edit-annotation", icon: "\u270F\uFE0F" },
                    { label: "Delete", action: "delete-annotation", icon: "\uD83D\uDDD1\uFE0F" },
                ];
            } else {
                items = [
                    { label: "Start Section", action: "start-section", icon: "\uD83D\uDCCC" },
                    { label: "Add Note", action: "add-note", icon: "\uD83D\uDCDD" },
                    { label: "Add Warning", action: "add-warning", icon: "\u26A0\uFE0F" },
                    { label: "Attach Artifact", action: "attach-artifact", icon: "\uD83D\uDCC4" },
                ];
            }

            // Position menu, clamped to viewport edges
            var menuWidth = 200;
            var menuHeight = items.length * 44 + 16;
            var viewW = typeof window !== "undefined" ? window.innerWidth : 1024;
            var viewH = typeof window !== "undefined" ? window.innerHeight : 768;
            var x = Math.min(event.clientX, viewW - menuWidth - 8);
            var y = Math.min(event.clientY, viewH - menuHeight - 8);
            x = Math.max(8, x);
            y = Math.max(8, y);

            this._contextMenu = {
                x: x,
                y: y,
                items: items,
                beatId: beatId,
                isAnnotation: isAnnotation,
            };
        },

        /** Dismiss the context menu. */
        dismissContextMenu() {
            this._contextMenu = null;
        },

        /**
         * Handle a context menu action selection.
         * Stores the selected action details for downstream handlers.
         *
         * @param {string} action - The action key (e.g., "add-note", "delete-annotation")
         */
        handleContextMenuAction(action) {
            var beatId = this._contextMenu ? this._contextMenu.beatId : null;
            var isAnnotation = this._contextMenu ? this._contextMenu.isAnnotation : false;
            this.dismissContextMenu();

            if (beatId === null) return;

            if (action === "start-section") {
                this._startSectionCreation(parseInt(beatId, 10));
            } else if (action === "add-note") {
                this._openCalloutEditor(parseInt(beatId, 10), "note");
            } else if (action === "add-warning") {
                this._openCalloutEditor(parseInt(beatId, 10), "warning");
            } else if (action === "attach-artifact") {
                this._openArtifactEditor(parseInt(beatId, 10));
            } else if (action === "delete-annotation" && isAnnotation) {
                this._deleteAnnotation(String(beatId));
            } else if (action === "edit-annotation" && isAnnotation) {
                this._editAnnotation(String(beatId));
            }
        },

        /** Show a temporary edit-mode toast message. */
        _showEditToast(msg) {
            this.editToast = msg;
            if (this._editToastTimeout) {
                clearTimeout(this._editToastTimeout);
            }
            var self = this;
            this._editToastTimeout = setTimeout(function () {
                self.editToast = "";
                self._editToastTimeout = null;
            }, 2000);
        },

        /** Returns the annotation color palette for template rendering. */
        getColorPalette() {
            if (typeof ANNOTATION_COLORS !== "undefined") {
                return Object.keys(ANNOTATION_COLORS).map(function (key) {
                    return { key: key, hex: ANNOTATION_COLORS[key] };
                });
            }
            return [];
        },

        /** Open the section creation form for a given beat. */
        _startSectionCreation(beatId) {
            this._sectionForm = {
                beatId: beatId,
                label: "",
                color: "blue",
            };
        },

        /** Submit the section form and enter "select end beat" mode. */
        submitSectionForm() {
            if (!this._sectionForm || !this._sectionForm.label.trim()) return;
            this._pendingSection = {
                startBeat: this._sectionForm.beatId,
                label: this._sectionForm.label.trim(),
                color: this._sectionForm.color,
            };
            this._sectionForm = null;
        },

        /** Cancel the section creation form. */
        cancelSectionForm() {
            this._sectionForm = null;
        },

        /** Cancel the pending section (select end beat mode). */
        cancelPendingSection() {
            this._pendingSection = null;
        },

        /**
         * Complete section creation with the second beat click.
         * ClawbackAnnotations.createSection handles auto-swap if end < start.
         *
         * @param {number} endBeatId - The beat ID for the section end
         */
        _completeSectionCreation(endBeatId) {
            if (!this._pendingSection) return;
            var startBeat = this._pendingSection.startBeat;
            var label = this._pendingSection.label;
            var color = this._pendingSection.color;

            if (typeof ClawbackAnnotations !== "undefined") {
                ClawbackAnnotations.createSection(startBeat, endBeatId, label, color);
                this._refreshAnnotationUI();

                // Auto-save — toast on failure so user knows the edit may not persist
                var self = this;
                ClawbackAnnotations.save().catch(function () {
                    self._showEditToast("Save failed — section may not persist");
                });
            }
            this._pendingSection = null;
        },

        // ---------------------------------------------------------------
        // Annotation editing and deletion
        // ---------------------------------------------------------------

        /**
         * Extract the annotation ID from a DOM beat ID.
         * DOM beat IDs follow the pattern "callout-cal-N" or "artifact-art-N".
         *
         * @param {string} domBeatId - The data-beat-id from the DOM element
         * @returns {{ annotationId: string, type: string }|null}
         */
        _parseAnnotationId(domBeatId) {
            if (!domBeatId) return null;
            var str = String(domBeatId);
            if (str.indexOf("callout-") === 0) {
                return { annotationId: str.slice(8), type: "callout" };
            }
            if (str.indexOf("artifact-") === 0) {
                return { annotationId: str.slice(9), type: "artifact" };
            }
            return null;
        },

        /**
         * Find an annotation by ID across all annotation types.
         *
         * @param {string} annotationId - The annotation ID (e.g., "cal-1", "art-2")
         * @returns {Object|null} The annotation object, or null
         */
        _findAnnotation(annotationId) {
            if (typeof ClawbackAnnotations === "undefined") return null;
            var lists = [
                ClawbackAnnotations.getCallouts(),
                ClawbackAnnotations.getArtifacts(),
                ClawbackAnnotations.getSections(),
            ];
            for (var i = 0; i < lists.length; i++) {
                for (var j = 0; j < lists[i].length; j++) {
                    if (lists[i][j].id === annotationId) {
                        return lists[i][j];
                    }
                }
            }
            return null;
        },

        /**
         * Delete an annotation by its DOM beat ID.
         * Removes from data, removes the DOM element, and auto-saves.
         *
         * @param {string} domBeatId - The data-beat-id from the DOM element
         */
        _deleteAnnotation(domBeatId) {
            var parsed = this._parseAnnotationId(domBeatId);
            if (!parsed || typeof ClawbackAnnotations === "undefined") return;

            var deleted = ClawbackAnnotations.deleteAnnotation(parsed.annotationId);
            if (!deleted) return;

            // Remove the DOM element
            var chatArea = this.$refs.chatArea;
            if (chatArea) {
                var el = chatArea.querySelector('[data-beat-id="' + domBeatId + '"]');
                if (el) el.remove();
            }

            this._refreshAnnotationUI();
            this._showEditToast("Annotation deleted");

            var self = this;
            ClawbackAnnotations.save().catch(function () {
                self._showEditToast("Save failed — deletion may not persist");
            });
        },

        /**
         * Edit an annotation by its DOM beat ID.
         * Opens a pre-populated editor for the annotation type.
         *
         * @param {string} domBeatId - The data-beat-id from the DOM element
         */
        _editAnnotation(domBeatId) {
            var parsed = this._parseAnnotationId(domBeatId);
            if (!parsed) return;

            var annotation = this._findAnnotation(parsed.annotationId);
            if (!annotation) return;

            if (parsed.type === "callout") {
                this._openCalloutEditForm(domBeatId, annotation);
            } else if (parsed.type === "artifact") {
                this._openArtifactEditForm(domBeatId, annotation);
            }
        },

        /**
         * Open a pre-populated callout edit form replacing the callout card.
         *
         * @param {string} domBeatId - The DOM beat ID
         * @param {Object} annotation - The callout annotation data
         */
        _openCalloutEditForm(domBeatId, annotation) {
            this._dismissEditForm();
            var chatArea = this.$refs.chatArea;
            if (!chatArea) return;
            var cardEl = chatArea.querySelector('[data-beat-id="' + domBeatId + '"]');
            if (!cardEl) return;

            var form = document.createElement("div");
            form.className = "inline-editor inline-editor--" + (annotation.style || "note");

            var header = document.createElement("div");
            header.className = "inline-editor__header";
            header.textContent = "\u270F\uFE0F Edit " + (annotation.style === "warning" ? "Warning" : "Note");
            form.appendChild(header);

            var textarea = document.createElement("textarea");
            textarea.className = "inline-editor__textarea";
            textarea.rows = 3;
            textarea.value = annotation.content || "";
            form.appendChild(textarea);

            var errorMsg = document.createElement("div");
            errorMsg.className = "inline-editor__error";
            form.appendChild(errorMsg);

            var footer = document.createElement("div");
            footer.className = "inline-editor__footer";

            var cancelBtn = document.createElement("button");
            cancelBtn.className = "inline-editor__cancel";
            cancelBtn.textContent = "Cancel";
            footer.appendChild(cancelBtn);

            var saveBtn = document.createElement("button");
            saveBtn.className = "inline-editor__save";
            saveBtn.textContent = "Save";
            footer.appendChild(saveBtn);

            form.appendChild(footer);

            // Hide the original card and insert editor after it
            cardEl.style.display = "none";
            cardEl.insertAdjacentElement("afterend", form);
            textarea.focus();

            var self = this;
            this._activeEditForm = {
                type: "callout",
                annotationId: annotation.id,
                domBeatId: domBeatId,
                element: form,
                cardEl: cardEl,
                textarea: textarea,
                errorMsg: errorMsg,
            };

            cancelBtn.addEventListener("click", function () {
                self._dismissEditForm();
            });
            saveBtn.addEventListener("click", function () {
                self._saveCalloutEdit();
            });
            textarea.addEventListener("keydown", function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissEditForm();
                }
            });
        },

        /** Save edits to a callout annotation. */
        _saveCalloutEdit() {
            if (!this._activeEditForm || this._activeEditForm.type !== "callout") return;
            var content = this._activeEditForm.textarea.value.trim();
            if (!content) {
                this._activeEditForm.errorMsg.textContent = "Content cannot be empty";
                return;
            }

            if (typeof ClawbackAnnotations === "undefined") return;

            ClawbackAnnotations.updateAnnotation(this._activeEditForm.annotationId, { content: content });

            // Re-render the callout card
            this._reRenderAnnotation(this._activeEditForm.domBeatId, this._activeEditForm.annotationId);

            var self = this;
            ClawbackAnnotations.save().catch(function () {
                self._showEditToast("Save failed — edit may not persist");
            });
            this._dismissEditForm();
        },

        /**
         * Open a pre-populated artifact edit form replacing the artifact card.
         *
         * @param {string} domBeatId - The DOM beat ID
         * @param {Object} annotation - The artifact annotation data
         */
        _openArtifactEditForm(domBeatId, annotation) {
            this._dismissEditForm();
            var chatArea = this.$refs.chatArea;
            if (!chatArea) return;
            var cardEl = chatArea.querySelector('[data-beat-id="' + domBeatId + '"]');
            if (!cardEl) return;

            var form = document.createElement("div");
            form.className = "inline-editor inline-editor--artifact";

            var header = document.createElement("div");
            header.className = "inline-editor__header";
            header.textContent = "\u270F\uFE0F Edit Artifact";
            form.appendChild(header);

            var titleInput = document.createElement("input");
            titleInput.className = "inline-editor__input";
            titleInput.type = "text";
            titleInput.placeholder = "Artifact title";
            titleInput.value = annotation.title || "";
            form.appendChild(titleInput);

            var descInput = document.createElement("input");
            descInput.className = "inline-editor__input";
            descInput.type = "text";
            descInput.placeholder = "Brief description (optional)";
            descInput.value = annotation.description || "";
            form.appendChild(descInput);

            var typeSelect = document.createElement("select");
            typeSelect.className = "inline-editor__select";
            var mdOpt = document.createElement("option");
            mdOpt.value = "markdown";
            mdOpt.textContent = "Markdown";
            typeSelect.appendChild(mdOpt);
            var codeOpt = document.createElement("option");
            codeOpt.value = "code";
            codeOpt.textContent = "Code";
            typeSelect.appendChild(codeOpt);
            typeSelect.value = annotation.content_type || "markdown";
            form.appendChild(typeSelect);

            var textarea = document.createElement("textarea");
            textarea.className = "inline-editor__textarea";
            textarea.rows = 6;
            textarea.value = annotation.content || "";
            form.appendChild(textarea);

            var errorMsg = document.createElement("div");
            errorMsg.className = "inline-editor__error";
            form.appendChild(errorMsg);

            var footer = document.createElement("div");
            footer.className = "inline-editor__footer";

            var cancelBtn = document.createElement("button");
            cancelBtn.className = "inline-editor__cancel";
            cancelBtn.textContent = "Cancel";
            footer.appendChild(cancelBtn);

            var saveBtn = document.createElement("button");
            saveBtn.className = "inline-editor__save";
            saveBtn.textContent = "Save";
            footer.appendChild(saveBtn);

            form.appendChild(footer);

            cardEl.style.display = "none";
            cardEl.insertAdjacentElement("afterend", form);
            titleInput.focus();

            var self = this;
            this._activeEditForm = {
                type: "artifact",
                annotationId: annotation.id,
                domBeatId: domBeatId,
                element: form,
                cardEl: cardEl,
                titleInput: titleInput,
                descInput: descInput,
                typeSelect: typeSelect,
                textarea: textarea,
                errorMsg: errorMsg,
            };

            cancelBtn.addEventListener("click", function () {
                self._dismissEditForm();
            });
            saveBtn.addEventListener("click", function () {
                self._saveArtifactEdit();
            });
            var dismissEsc = function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissEditForm();
                }
            };
            textarea.addEventListener("keydown", dismissEsc);
            titleInput.addEventListener("keydown", dismissEsc);
            descInput.addEventListener("keydown", dismissEsc);
            typeSelect.addEventListener("keydown", dismissEsc);
        },

        /** Save edits to an artifact annotation. */
        _saveArtifactEdit() {
            if (!this._activeEditForm || this._activeEditForm.type !== "artifact") return;
            var title = this._activeEditForm.titleInput.value.trim();
            var content = this._activeEditForm.textarea.value.trim();

            if (!title) {
                this._activeEditForm.errorMsg.textContent = "Title cannot be empty";
                return;
            }
            if (!content) {
                this._activeEditForm.errorMsg.textContent = "Content cannot be empty";
                return;
            }

            if (typeof ClawbackAnnotations === "undefined") return;

            var description = this._activeEditForm.descInput.value.trim();
            var contentType = this._activeEditForm.typeSelect.value;

            ClawbackAnnotations.updateAnnotation(this._activeEditForm.annotationId, {
                title: title,
                description: description,
                content_type: contentType,
                content: content,
            });

            this._reRenderAnnotation(this._activeEditForm.domBeatId, this._activeEditForm.annotationId);

            var self = this;
            ClawbackAnnotations.save().catch(function () {
                self._showEditToast("Save failed — edit may not persist");
            });
            this._dismissEditForm();
        },

        /**
         * Re-render an annotation element in the DOM after editing.
         * Removes old element, builds a new pseudo-beat, renders and inserts it.
         *
         * @param {string} domBeatId - The DOM beat ID
         * @param {string} annotationId - The annotation ID
         */
        _reRenderAnnotation(domBeatId, annotationId) {
            var chatArea = this.$refs.chatArea;
            if (!chatArea || typeof ClawbackRenderer === "undefined" ||
                typeof ClawbackAnnotations === "undefined") return;

            var annotation = this._findAnnotation(annotationId);
            if (!annotation) return;

            var parsed = this._parseAnnotationId(domBeatId);
            if (!parsed) return;

            var pseudoBeat;
            if (parsed.type === "callout") {
                pseudoBeat = {
                    type: "callout",
                    category: "callout",
                    isCallout: true,
                    calloutStyle: annotation.style || "note",
                    content: annotation.content || "",
                    calloutId: annotation.id,
                    id: domBeatId,
                    group_id: null,
                };
            } else if (parsed.type === "artifact") {
                pseudoBeat = {
                    type: "artifact",
                    category: "artifact",
                    isArtifact: true,
                    artifactTitle: annotation.title || "Artifact",
                    artifactDescription: annotation.description || "",
                    artifactContent: annotation.content || "",
                    contentType: annotation.content_type || "markdown",
                    content: (annotation.title || "") + " " + (annotation.description || ""),
                    artifactId: annotation.id,
                    id: domBeatId,
                    group_id: null,
                };
            }

            if (!pseudoBeat) return;

            // Find old element, render new one, swap
            var oldEl = chatArea.querySelector('[data-beat-id="' + domBeatId + '"]');
            var newEl = ClawbackRenderer.renderBeat(pseudoBeat, chatArea);
            if (newEl) {
                if (newEl.parentNode) newEl.parentNode.removeChild(newEl);
                if (oldEl) {
                    oldEl.insertAdjacentElement("afterend", newEl);
                    oldEl.remove();
                }
            }
        },

        /** Dismiss and remove the active edit form, restoring the original card. */
        _dismissEditForm() {
            if (this._activeEditForm) {
                if (this._activeEditForm.element) {
                    this._activeEditForm.element.remove();
                }
                if (this._activeEditForm.cardEl) {
                    this._activeEditForm.cardEl.style.display = "";
                }
            }
            this._activeEditForm = null;
        },

        /**
         * Delete a section by ID (called from sidebar).
         *
         * @param {string} sectionId - The section annotation ID
         */
        deleteSection(sectionId) {
            if (typeof ClawbackAnnotations === "undefined") return;
            ClawbackAnnotations.deleteAnnotation(sectionId);
            this._refreshAnnotationUI();
            this._showEditToast("Section deleted");

            var self = this;
            ClawbackAnnotations.save().catch(function () {
                self._showEditToast("Save failed — deletion may not persist");
            });
        },

        /** Refresh sidebar, progress bar, and active section from annotation data. */
        _refreshAnnotationUI() {
            if (typeof ClawbackAnnotations !== "undefined") {
                this.sectionList = ClawbackAnnotations.getSections();
                this.showSections = ClawbackAnnotations.hasSections();
                this.progressSegments = this._computeProgressSegments();
                this._updateActiveSection();
            }
        },


        // ---------------------------------------------------------------
        // Inline annotation editors
        // ---------------------------------------------------------------

        /**
         * Open an inline callout editor below the target beat.
         *
         * @param {number} beatId - The beat ID to attach the callout to
         * @param {string} style - "note" or "warning"
         */
        _openCalloutEditor(beatId, style) {
            this._dismissInlineEditor();
            var chatArea = this.$refs.chatArea;
            if (!chatArea) return;
            var beatEl = chatArea.querySelector('[data-beat-id="' + beatId + '"].bubble');
            if (!beatEl) return;

            var form = document.createElement("div");
            form.className = "inline-editor inline-editor--" + style;

            var header = document.createElement("div");
            header.className = "inline-editor__header";
            header.textContent = style === "warning" ? "\u26A0\uFE0F Add Warning" : "\uD83D\uDCDD Add Note";
            form.appendChild(header);

            var textarea = document.createElement("textarea");
            textarea.className = "inline-editor__textarea";
            textarea.placeholder = style === "warning" ? "Warning text\u2026" : "Note text\u2026";
            textarea.rows = 3;
            form.appendChild(textarea);

            var errorMsg = document.createElement("div");
            errorMsg.className = "inline-editor__error";
            form.appendChild(errorMsg);

            var footer = document.createElement("div");
            footer.className = "inline-editor__footer";

            var cancelBtn = document.createElement("button");
            cancelBtn.className = "inline-editor__cancel";
            cancelBtn.textContent = "Cancel";
            footer.appendChild(cancelBtn);

            var saveBtn = document.createElement("button");
            saveBtn.className = "inline-editor__save";
            saveBtn.textContent = "Save";
            footer.appendChild(saveBtn);

            form.appendChild(footer);

            beatEl.insertAdjacentElement("afterend", form);
            textarea.focus();

            var self = this;
            this._inlineEditor = {
                type: "callout",
                beatId: beatId,
                style: style,
                element: form,
                textarea: textarea,
                errorMsg: errorMsg,
            };

            cancelBtn.addEventListener("click", function () {
                self._dismissInlineEditor();
            });

            saveBtn.addEventListener("click", function () {
                self._saveCallout();
            });

            textarea.addEventListener("keydown", function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissInlineEditor();
                }
            });
        },

        /** Save the current callout from the inline editor. */
        _saveCallout() {
            if (!this._inlineEditor || this._inlineEditor.type !== "callout") return;
            var content = this._inlineEditor.textarea.value.trim();
            if (!content) {
                this._inlineEditor.errorMsg.textContent = "Content cannot be empty";
                return;
            }

            var beatId = this._inlineEditor.beatId;
            var style = this._inlineEditor.style;

            if (typeof ClawbackAnnotations === "undefined") {
                this._showEditToast("Annotations not available");
                return;
            }

            var callout = ClawbackAnnotations.createCallout(beatId, style, content);
            this._renderInlineAnnotation(beatId, {
                type: "callout",
                category: "callout",
                isCallout: true,
                calloutStyle: style,
                content: content,
                calloutId: callout.id,
                id: "callout-" + callout.id,
                group_id: null,
            });

            var self = this;
            ClawbackAnnotations.save().catch(function () {
                self._showEditToast("Save failed — callout may not persist");
            });
            this._dismissInlineEditor();
        },

        /**
         * Open an inline artifact editor below the target beat.
         *
         * @param {number} beatId - The beat ID to attach the artifact to
         */
        _openArtifactEditor(beatId) {
            this._dismissInlineEditor();
            var chatArea = this.$refs.chatArea;
            if (!chatArea) return;
            var beatEl = chatArea.querySelector('[data-beat-id="' + beatId + '"].bubble');
            if (!beatEl) return;

            var form = document.createElement("div");
            form.className = "inline-editor inline-editor--artifact";

            var header = document.createElement("div");
            header.className = "inline-editor__header";
            header.textContent = "\uD83D\uDCC4 Attach Artifact";
            form.appendChild(header);

            // Title
            var titleInput = document.createElement("input");
            titleInput.className = "inline-editor__input";
            titleInput.type = "text";
            titleInput.placeholder = "Artifact title";
            form.appendChild(titleInput);

            // Description
            var descInput = document.createElement("input");
            descInput.className = "inline-editor__input";
            descInput.type = "text";
            descInput.placeholder = "Brief description (optional)";
            form.appendChild(descInput);

            // Content type dropdown
            var typeSelect = document.createElement("select");
            typeSelect.className = "inline-editor__select";
            var mdOpt = document.createElement("option");
            mdOpt.value = "markdown";
            mdOpt.textContent = "Markdown";
            typeSelect.appendChild(mdOpt);
            var codeOpt = document.createElement("option");
            codeOpt.value = "code";
            codeOpt.textContent = "Code";
            typeSelect.appendChild(codeOpt);
            form.appendChild(typeSelect);

            // Content textarea
            var textarea = document.createElement("textarea");
            textarea.className = "inline-editor__textarea";
            textarea.placeholder = "Artifact content\u2026";
            textarea.rows = 6;
            form.appendChild(textarea);

            var errorMsg = document.createElement("div");
            errorMsg.className = "inline-editor__error";
            form.appendChild(errorMsg);

            var footer = document.createElement("div");
            footer.className = "inline-editor__footer";

            var cancelBtn = document.createElement("button");
            cancelBtn.className = "inline-editor__cancel";
            cancelBtn.textContent = "Cancel";
            footer.appendChild(cancelBtn);

            var saveBtn = document.createElement("button");
            saveBtn.className = "inline-editor__save";
            saveBtn.textContent = "Save";
            footer.appendChild(saveBtn);

            form.appendChild(footer);

            beatEl.insertAdjacentElement("afterend", form);
            titleInput.focus();

            var self = this;
            this._inlineEditor = {
                type: "artifact",
                beatId: beatId,
                element: form,
                titleInput: titleInput,
                descInput: descInput,
                typeSelect: typeSelect,
                textarea: textarea,
                errorMsg: errorMsg,
            };

            cancelBtn.addEventListener("click", function () {
                self._dismissInlineEditor();
            });

            saveBtn.addEventListener("click", function () {
                self._saveArtifact();
            });

            textarea.addEventListener("keydown", function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissInlineEditor();
                }
            });
            titleInput.addEventListener("keydown", function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissInlineEditor();
                }
            });
            descInput.addEventListener("keydown", function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissInlineEditor();
                }
            });
            typeSelect.addEventListener("keydown", function (e) {
                if (e.code === "Escape") {
                    e.stopPropagation();
                    self._dismissInlineEditor();
                }
            });
        },

        /** Save the current artifact from the inline editor. */
        _saveArtifact() {
            if (!this._inlineEditor || this._inlineEditor.type !== "artifact") return;
            var title = this._inlineEditor.titleInput.value.trim();
            var description = this._inlineEditor.descInput.value.trim();
            var contentType = this._inlineEditor.typeSelect.value;
            var content = this._inlineEditor.textarea.value.trim();

            if (!title) {
                this._inlineEditor.errorMsg.textContent = "Title cannot be empty";
                return;
            }
            if (!content) {
                this._inlineEditor.errorMsg.textContent = "Content cannot be empty";
                return;
            }

            var beatId = this._inlineEditor.beatId;

            if (typeof ClawbackAnnotations === "undefined") {
                this._showEditToast("Annotations not available");
                return;
            }

            var artifact = ClawbackAnnotations.createArtifact(beatId, title, description, contentType, content);
            this._renderInlineAnnotation(beatId, {
                type: "artifact",
                category: "artifact",
                isArtifact: true,
                artifactTitle: title,
                artifactDescription: description,
                artifactContent: content,
                contentType: contentType,
                content: title + " " + description,
                artifactId: artifact.id,
                id: "artifact-" + artifact.id,
                group_id: null,
            });

            var self = this;
            ClawbackAnnotations.save().catch(function () {
                self._showEditToast("Save failed — artifact may not persist");
            });
            this._dismissInlineEditor();
        },

        /**
         * Render a newly created annotation into the chat area after a beat.
         *
         * @param {number} beatId - The beat ID this annotation follows
         * @param {Object} pseudoBeat - The pseudo-beat object for the renderer
         */
        _renderInlineAnnotation(beatId, pseudoBeat) {
            var chatArea = this.$refs.chatArea;
            if (!chatArea || typeof ClawbackRenderer === "undefined") return;

            // Find the beat element and insert the rendered annotation after it
            var beatEl = chatArea.querySelector('[data-beat-id="' + beatId + '"].bubble');
            if (!beatEl) return;

            var el = ClawbackRenderer.renderBeat(pseudoBeat, chatArea);
            if (el) {
                // renderBeat appends to container end; detach then reinsert after the beat
                if (el.parentNode) el.parentNode.removeChild(el);
                beatEl.insertAdjacentElement("afterend", el);
            }
        },

        /** Dismiss and remove the inline editor from the DOM. */
        _dismissInlineEditor() {
            if (this._inlineEditor && this._inlineEditor.element) {
                this._inlineEditor.element.remove();
            }
            this._inlineEditor = null;
        },

        /** Jump playback to the start of a section. */
        jumpToSection(section) {
            if (!this._engine) return;
            var mergedIndex = this._beatIdToMergedIndex
                ? this._beatIdToMergedIndex[section.start_beat]
                : section.start_beat;
            if (mergedIndex === undefined) mergedIndex = section.start_beat;
            this._engine.jumpToBeat(mergedIndex + 1);
            this.currentBeat = this._conversationBeatsRendered;
            this._updateActiveSection();
            if (this._scroller) {
                this._scroller.scrollToBottom();
            }
        },

        /** Get the hex color for a section color key. */
        getSectionColor(colorKey) {
            if (typeof ClawbackAnnotations !== "undefined") {
                return ClawbackAnnotations.getColorHex(colorKey);
            }
            return typeof ANNOTATION_COLORS !== "undefined" ? ANNOTATION_COLORS.slate : "#95A5A6";
        },

        /** Update the active section based on the current beat. */
        _updateActiveSection() {
            if (typeof ClawbackAnnotations !== "undefined" && ClawbackAnnotations.hasSections()) {
                var beatId = this.currentBeat > 0 ? this.currentBeat - 1 : null;
                this.activeSection = beatId !== null
                    ? ClawbackAnnotations.getSectionForBeat(beatId)
                    : null;
            } else {
                this.activeSection = null;
            }
        },

        /**
         * Build merged beat array with callout pseudo-beats interleaved.
         * Also builds _beatIdToMergedIndex for section navigation.
         *
         * @param {Array<Object>} beats - Original conversation beats
         * @returns {Array<Object>} Merged array with callouts inserted
         */
        _buildMergedBeats(beats) {
            var hasAnnotations = typeof ClawbackAnnotations !== "undefined" &&
                ClawbackAnnotations.hasAnnotations();

            if (!hasAnnotations) {
                this._beatIdToMergedIndex = null;
                return beats;
            }

            var merged = [];
            var indexMap = {};

            for (var i = 0; i < beats.length; i++) {
                indexMap[beats[i].id] = merged.length;
                merged.push(beats[i]);

                var annotations = ClawbackAnnotations.getAnnotationsAfterBeat(beats[i].id);
                for (var j = 0; j < annotations.length; j++) {
                    if (annotations[j].type === "callout") {
                        var callout = annotations[j].data;
                        merged.push({
                            type: "callout",
                            category: "callout",
                            isCallout: true,
                            calloutStyle: callout.style || "note",
                            content: callout.content || "",
                            calloutId: callout.id,
                            id: "callout-" + callout.id,
                            duration: this._calculateCalloutDuration(callout.content),
                            group_id: null,
                        });
                    } else if (annotations[j].type === "artifact") {
                        var artifact = annotations[j].data;
                        merged.push({
                            type: "artifact",
                            category: "artifact",
                            isArtifact: true,
                            artifactTitle: artifact.title || "Artifact",
                            artifactDescription: artifact.description || "",
                            artifactContent: artifact.content || "",
                            contentType: artifact.content_type || "markdown",
                            content: (artifact.title || "") + " " + (artifact.description || ""),
                            artifactId: artifact.id,
                            id: "artifact-" + artifact.id,
                            duration: this._calculateCalloutDuration(
                                (artifact.title || "") + " " + (artifact.description || "")
                            ),
                            group_id: null,
                        });
                    }
                }
            }

            this._beatIdToMergedIndex = indexMap;
            return merged;
        },

        /** Count words in a text string. */
        _countWords(text) {
            if (!text) return 0;
            return text.split(/\s+/).filter(Boolean).length;
        },

        /** Calculate reading duration for a callout based on word count. */
        _calculateCalloutDuration(content) {
            var words = this._countWords(content);
            var rawSeconds = (words / 100) * 60;
            return Math.max(1.0, rawSeconds);
        },

        /** Compute progress bar segments from section data. */
        _computeProgressSegments() {
            if (
                !this.totalBeats ||
                typeof ClawbackAnnotations === "undefined" ||
                !ClawbackAnnotations.hasSections()
            ) {
                return [{ width: 100, color: null }];
            }

            var sections = ClawbackAnnotations.getSections();
            sections.sort(function (a, b) { return a.start_beat - b.start_beat; });

            var segments = [];
            var lastEnd = 0;

            for (var i = 0; i < sections.length; i++) {
                var sec = sections[i];
                var effectiveStart = Math.max(sec.start_beat, lastEnd);
                if (effectiveStart >= sec.end_beat + 1) continue; // fully overlapped
                if (effectiveStart > lastEnd) {
                    segments.push({
                        width: ((effectiveStart - lastEnd) / this.totalBeats) * 100,
                        color: null,
                    });
                }
                var beats = sec.end_beat - effectiveStart + 1;
                segments.push({
                    width: (beats / this.totalBeats) * 100,
                    color: ClawbackAnnotations.getColorHex(sec.color),
                });
                lastEnd = sec.end_beat + 1;
            }

            if (lastEnd < this.totalBeats) {
                segments.push({
                    width: ((this.totalBeats - lastEnd) / this.totalBeats) * 100,
                    color: null,
                });
            }

            return segments;
        },
    };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { clawbackApp };
}
