/**
 * Clawback — Main application state and Alpine.js initialization.
 *
 * Wires the parser, playback engine, and renderer together.
 * Session loading UI comes in Issue #8.
 */
function clawbackApp() {
    return {
        sessionName: "",
        view: "picker", // "picker" or "playback"
        playbackState: "READY",
        showBeatNumbers: false,
        _engine: null,

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
            // Tear down previous engine if re-entering
            if (this._engine) {
                this._engine.skipToStart();
                this._engine = null;
            }

            this.sessionName = name || "";
            this.view = "playback";

            const chatArea = this.$refs.chatArea;
            chatArea.innerHTML = "";
            ClawbackRenderer.resetGroups();

            this._engine = new PlaybackEngine({
                beats: beats,
                onBeat: (beat) => {
                    ClawbackRenderer.renderBeat(beat, chatArea);
                },
                onRemoveBeat: (beat) => {
                    ClawbackRenderer.removeBeat(beat, chatArea);
                },
                onStateChange: (newState) => {
                    this.playbackState = newState;
                },
            });
        },
    };
}
