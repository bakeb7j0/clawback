/**
 * Clawback — Auto-scroll and scroll-pause detection.
 *
 * Scrolls the chat area to keep new content visible. Detects when
 * the user scrolls upward during playback and triggers a pause.
 *
 * Scroll direction is used to distinguish auto-scroll (downward)
 * from user-initiated scroll (upward). This avoids the timing
 * complexity of flag-based approaches with smooth scrolling.
 */

/** Distance from bottom (px) below which scroll-up is ignored. */
var SCROLL_THRESHOLD = 50;

/**
 * Creates a scroller instance bound to a scrollable container.
 *
 * @param {Object} options
 * @param {HTMLElement} options.scrollContainer - The scrollable ancestor (e.g. .app-main)
 * @param {HTMLElement} options.chatArea - The chat content container
 * @param {Function} [options.onScrollPause] - Called when user scrolls up during playback
 * @returns {Object} Scroller with scrollToBottom, enable, disable, destroy
 */
function createScroller(options) {
    var scrollContainer = options.scrollContainer;
    var chatArea = options.chatArea;
    var onScrollPause = options.onScrollPause || null;

    var _enabled = false;
    var _lastScrollTop = 0;

    function scrollToBottom() {
        var lastChild = chatArea.lastElementChild;
        if (!lastChild) return;
        lastChild.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    function _onScroll() {
        if (!_enabled) return;

        var scrollTop = scrollContainer.scrollTop;
        var distanceFromBottom =
            scrollContainer.scrollHeight - scrollTop - scrollContainer.clientHeight;

        // Trigger pause only when scrolling UP and above threshold
        if (scrollTop < _lastScrollTop && distanceFromBottom > SCROLL_THRESHOLD) {
            if (onScrollPause) {
                onScrollPause();
            }
        }

        _lastScrollTop = scrollTop;
    }

    function enable() {
        _enabled = true;
        _lastScrollTop = scrollContainer.scrollTop;
    }

    function disable() {
        _enabled = false;
    }

    function destroy() {
        _enabled = false;
        scrollContainer.removeEventListener("scroll", _onScroll);
    }

    scrollContainer.addEventListener("scroll", _onScroll);

    return {
        scrollToBottom: scrollToBottom,
        enable: enable,
        disable: disable,
        destroy: destroy,
    };
}

// Browser export
if (typeof window !== "undefined") {
    window.ClawbackScroller = { createScroller: createScroller };
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
    module.exports = { createScroller: createScroller, SCROLL_THRESHOLD: SCROLL_THRESHOLD };
}
