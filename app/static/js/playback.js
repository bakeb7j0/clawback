/**
 * Clawback — Playback engine state machine.
 *
 * Manages timed beat-by-beat playback with transport controls,
 * speed adjustment, and inner workings mode support.
 *
 * Timing model (show-then-wait):
 *   1. Beat is rendered immediately (onBeat fires)
 *   2. Engine waits for the beat's reading duration
 *   3. Next beat renders, repeat
 */

const PlaybackState = Object.freeze({
    READY: "READY",
    PLAYING: "PLAYING",
    PAUSED: "PAUSED",
    SCROLL_PAUSED: "SCROLL_PAUSED",
    COMPLETE: "COMPLETE",
});

class PlaybackEngine {
    /**
     * @param {Object} options
     * @param {Array<Object>} options.beats - Beat array from the parser
     * @param {Function} [options.onBeat] - Called when a beat is rendered: onBeat(beat)
     * @param {Function} [options.onRemoveBeat] - Called when a beat is removed: onRemoveBeat(beat)
     * @param {Function} [options.onStateChange] - Called on state transitions: onStateChange(newState, oldState)
     */
    constructor({ beats = [], onBeat = null, onRemoveBeat = null, onStateChange = null } = {}) {
        this.beats = beats;
        this.onBeat = onBeat;
        this.onRemoveBeat = onRemoveBeat;
        this.onStateChange = onStateChange;

        this.state = PlaybackState.READY;
        this.currentIndex = 0;
        this.speed = 1.0;
        this.innerWorkingsMode = "expanded";

        this._timer = null;
        this._beatStartTime = null;
        this._remainingFraction = null;
        this._lastRenderedIndex = null;
    }

    /** Start or resume timed beat rendering. */
    play() {
        if (this.state === PlaybackState.COMPLETE) return;
        if (this.state === PlaybackState.PLAYING) return;
        if (this.beats.length === 0) return;

        if (this.currentIndex >= this.beats.length) {
            this._setState(PlaybackState.COMPLETE);
            return;
        }

        const wasPaused =
            this.state === PlaybackState.PAUSED ||
            this.state === PlaybackState.SCROLL_PAUSED;

        this._setState(PlaybackState.PLAYING);

        if (wasPaused && this._remainingFraction !== null && this._lastRenderedIndex !== null) {
            this._scheduleWait(this._lastRenderedIndex, this._remainingFraction);
        } else {
            this._advanceAndSchedule();
        }
    }

    /** Pause beat rendering. */
    pause() {
        if (this.state !== PlaybackState.PLAYING) return;
        this._pauseInternal(PlaybackState.PAUSED);
    }

    /** Pause due to user scrolling back. Resumable with play(). */
    scrollPause() {
        if (this.state !== PlaybackState.PLAYING) return;
        this._pauseInternal(PlaybackState.SCROLL_PAUSED);
    }

    /** Immediately advance to the next beat. */
    next() {
        if (this.currentIndex >= this.beats.length) return;
        if (this.state === PlaybackState.COMPLETE) return;

        this._clearTimer();
        this._remainingFraction = null;

        const beatIndex = this.currentIndex;
        this._renderCurrentBeat();

        if (this.currentIndex >= this.beats.length) {
            this._setState(PlaybackState.COMPLETE);
        } else if (this.state === PlaybackState.PLAYING) {
            this._scheduleWait(beatIndex, 1.0);
        }
    }

    /** Remove the last rendered beat. */
    previous() {
        if (this.currentIndex <= 0) return;

        const wasPlaying = this.state === PlaybackState.PLAYING;

        this._clearTimer();
        this._remainingFraction = null;
        this.currentIndex--;

        const beat = this.beats[this.currentIndex];
        if (this.onRemoveBeat) {
            this.onRemoveBeat(beat);
        }

        if (
            this.state === PlaybackState.COMPLETE ||
            wasPlaying ||
            this.state === PlaybackState.SCROLL_PAUSED
        ) {
            this._setState(PlaybackState.PAUSED);
        }
    }

    /** Reset to the beginning, removing all rendered beats. */
    skipToStart() {
        this._clearTimer();
        this._remainingFraction = null;

        while (this.currentIndex > 0) {
            this.currentIndex--;
            if (this.onRemoveBeat) {
                this.onRemoveBeat(this.beats[this.currentIndex]);
            }
        }

        this._setState(PlaybackState.READY);
    }

    /** Render all remaining beats immediately. */
    skipToEnd() {
        this._clearTimer();
        this._remainingFraction = null;

        while (this.currentIndex < this.beats.length) {
            this._renderCurrentBeat();
        }

        this._setState(PlaybackState.COMPLETE);
    }

    /**
     * Set the speed multiplier. Recalculates remaining wait if playing.
     * @param {number} multiplier - e.g. 0.5, 1.0, 1.5, 2.0
     */
    setSpeed(multiplier) {
        if (multiplier <= 0) return;
        const oldSpeed = this.speed;
        this.speed = multiplier;

        if (
            this.state === PlaybackState.PLAYING &&
            this._beatStartTime !== null &&
            this._lastRenderedIndex !== null
        ) {
            const elapsed = Date.now() - this._beatStartTime;
            const oldTotalMs = this._getBeatDurationMs(this.beats[this._lastRenderedIndex], oldSpeed);
            const fraction = oldTotalMs > 0 ? Math.max(0, 1 - elapsed / oldTotalMs) : 0;

            this._clearTimer();
            this._scheduleWait(this._lastRenderedIndex, fraction);
        }
    }

    /**
     * Set inner workings display mode.
     * @param {string} mode - "expanded" or "collapsed"
     */
    setInnerWorkingsMode(mode) {
        this.innerWorkingsMode = mode;
    }

    // ---- Internal ----

    _setState(newState) {
        const oldState = this.state;
        if (oldState === newState) return;
        this.state = newState;
        if (this.onStateChange) {
            this.onStateChange(newState, oldState);
        }
    }

    _renderCurrentBeat() {
        const beat = this.beats[this.currentIndex];
        this.currentIndex++;
        if (this.onBeat) {
            this.onBeat(beat);
        }
    }

    /**
     * Renders beats and schedules waits. Uses a loop for zero-duration beats
     * to avoid stack overflow with many consecutive collapsed inner workings.
     */
    _advanceAndSchedule() {
        while (this.state === PlaybackState.PLAYING) {
            if (this.currentIndex >= this.beats.length) {
                this._setState(PlaybackState.COMPLETE);
                return;
            }

            const beatIndex = this.currentIndex;
            this._renderCurrentBeat();

            // Guard: onBeat callback may have changed state (e.g. called pause())
            if (this.state !== PlaybackState.PLAYING) return;

            if (this.currentIndex >= this.beats.length) {
                this._setState(PlaybackState.COMPLETE);
                return;
            }

            const durationMs = this._getBeatDurationMs(this.beats[beatIndex]);
            if (durationMs <= 0) {
                continue;
            }

            this._scheduleWait(beatIndex, 1.0);
            return;
        }
    }

    _scheduleWait(beatIndex, fraction) {
        const beat = this.beats[beatIndex];
        const totalMs = this._getBeatDurationMs(beat);
        const waitMs = totalMs * fraction;

        this._lastRenderedIndex = beatIndex;

        if (waitMs <= 0) {
            this._beatStartTime = null;
            this._remainingFraction = null;
            this._advanceAndSchedule();
            return;
        }

        this._beatStartTime = Date.now();
        this._remainingFraction = fraction;

        this._timer = setTimeout(() => {
            this._timer = null;
            this._beatStartTime = null;
            this._remainingFraction = null;

            if (this.state === PlaybackState.PLAYING) {
                this._advanceAndSchedule();
            }
        }, waitMs);
    }

    _getBeatDurationMs(beat, speed = this.speed) {
        if (this.innerWorkingsMode === "collapsed" && beat.category === "inner_working") {
            return 0;
        }
        return (beat.duration * 1000) / speed;
    }

    _pauseInternal(state) {
        if (this._beatStartTime !== null && this._lastRenderedIndex !== null) {
            const elapsed = Date.now() - this._beatStartTime;
            const totalMs = this._getBeatDurationMs(this.beats[this._lastRenderedIndex]);
            this._remainingFraction = totalMs > 0 ? Math.max(0, 1 - elapsed / totalMs) : 0;
        }

        this._clearTimer();
        this._setState(state);
    }

    _clearTimer() {
        if (this._timer !== null) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._beatStartTime = null;
    }
}

// Browser export
if (typeof window !== "undefined") {
    window.PlaybackState = PlaybackState;
    window.PlaybackEngine = PlaybackEngine;
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { PlaybackState, PlaybackEngine };
}
