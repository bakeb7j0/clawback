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
        editMode: false,
        _contextMenu: null,
        editToast: "",
        _editToastTimeout: null,
        _sectionForm: null,
        _pendingSection: null,
        _inlineEditor: null,
        _engine: null,
        _scroller: null,
        _conversationBeatsRendered: 0,
        _beatIdToMergedIndex: null,

        /** Called by Alpine.js on component initialization. */
        init() {
            this.fetchSessions();
        },

        /** Handle keyboard shortcuts (bound via @keydown.window on body). */
        handleKeydown(event) {
            if (this.view !== "playback") return;

            // Escape is always handled, even inside form inputs
            if (event.code === "Escape") {
                if (this._sectionForm) {
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
            if (!this._engine) return;
            if (this.playbackState === "PLAYING") {
                this._engine.pause();
            } else {
                this._engine.play();
            }
        },

        /** Reset to the beginning. */
        skipToStart() {
            if (this._engine) {
                this._engine.skipToStart();
            }
        },

        /** Jump to the end. */
        skipToEnd() {
            if (this._engine) {
                this._engine.skipToEnd();
            }
        },

        /** Step forward one beat. */
        nextBeat() {
            if (this._engine) {
                this._engine.next();
            }
        },

        /** Step backward one beat. */
        previousBeat() {
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

            // Clicks inside the inline editor are handled by the editor itself
            if (event.target.closest(".inline-editor")) return;

            var target = event.target.closest(".bubble, .callout, .artifact-card");
            if (!target) {
                this.dismissContextMenu();
                this._dismissInlineEditor();
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
            return "#95A5A6";
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
