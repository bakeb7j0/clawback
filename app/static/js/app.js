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
        _engine: null,
        _scroller: null,

        /** Called by Alpine.js on component initialization. */
        init() {
            this.fetchSessions();
        },

        /** Handle keyboard shortcuts (bound via @keydown.window on body). */
        handleKeydown(event) {
            if (this.view !== "playback") return;

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
                    this.startPlayback(data.beats, data.title || session.title);
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
        },

        /**
         * Load a parsed beat array and start the playback view.
         *
         * @param {Array<Object>} beats - Beat array from parser
         * @param {string} [name] - Session display name
         */
        startPlayback(beats, name) {
            this._teardown("skipToStart");

            this.sessionName = name || "";
            this.view = "playback";
            this.currentBeat = 0;
            this.totalBeats = beats.length;
            this.speed = 1.0;
            this.innerWorkingsMode = "collapsed";

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
                beats: beats,
                onBeat: function (beat) {
                    ClawbackRenderer.renderBeat(beat, chatArea);
                    self.currentBeat = self._engine.currentIndex;
                    if (self._scroller) {
                        self._scroller.scrollToBottom();
                    }
                },
                onRemoveBeat: function (beat) {
                    ClawbackRenderer.removeBeat(beat, chatArea);
                    self.currentBeat = self._engine.currentIndex;
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
    };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { clawbackApp };
}
