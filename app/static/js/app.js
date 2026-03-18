/**
 * Clawback — Main application state and Alpine.js initialization.
 *
 * Wires the parser, playback engine, renderer, and scroller together.
 * Session loading UI comes in Issue #8.
 */
function clawbackApp() {
    return {
        sessionName: "",
        view: "picker", // "picker" or "playback"
        playbackState: "READY",
        showBeatNumbers: false,
        _engine: null,
        _scroller: null,

        /**
         * Load a parsed beat array and start the playback view.
         * Called by the session picker (Issue #8) or via browser console:
         *
         *   const { beats } = ClawbackParser.parseSession(jsonlText);
         *   document.querySelector('[x-data]').__x.$data.startPlayback(beats, 'My Session');
         *
         * @param {Array<Object>} beats - Beat array from ClawbackParser.parseSession()
         * @param {string} [name] - Session display name
         */
        startPlayback(beats, name) {
            // Tear down previous engine and scroller if re-entering
            if (this._engine) {
                this._engine.skipToStart();
                this._engine = null;
            }
            if (this._scroller) {
                this._scroller.destroy();
                this._scroller = null;
            }

            this.sessionName = name || "";
            this.view = "playback";

            const chatArea = this.$refs.chatArea;
            chatArea.innerHTML = "";
            ClawbackRenderer.resetGroups();

            const scrollContainer = chatArea.parentElement;
            this._scroller = ClawbackScroller.createScroller({
                scrollContainer: scrollContainer,
                chatArea: chatArea,
                onScrollPause: () => {
                    if (this._engine) {
                        this._engine.scrollPause();
                    }
                },
            });

            this._engine = new PlaybackEngine({
                beats: beats,
                onBeat: (beat) => {
                    ClawbackRenderer.renderBeat(beat, chatArea);
                    if (this._scroller) {
                        this._scroller.scrollToBottom();
                    }
                },
                onRemoveBeat: (beat) => {
                    ClawbackRenderer.removeBeat(beat, chatArea);
                },
                onStateChange: (newState, oldState) => {
                    this.playbackState = newState;
                    if (this._scroller) {
                        if (newState === "PLAYING") {
                            this._scroller.enable();
                            if (oldState === "SCROLL_PAUSED") {
                                this._scroller.scrollToBottom();
                            }
                        } else {
                            this._scroller.disable();
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
    };
}
