"""Integration tests for playback controls and behavior."""

import re

from playwright.sync_api import expect


def test_play_button_starts_playback(playback_page):
    """Play button transitions from READY to PLAYING."""
    page = playback_page
    play_btn = page.locator('button[title="Play/Pause"]')
    expect(play_btn).to_have_text("\u25b6")
    play_btn.click()
    expect(play_btn).to_have_text("\u23f8")
    # At least one beat should render
    expect(page.locator(".bubble, .iw-card").first).to_be_visible()


def test_pause_button_pauses_playback(playback_page):
    """Clicking play then pause toggles the engine state."""
    page = playback_page
    play_btn = page.locator('button[title="Play/Pause"]')
    play_btn.click()
    expect(play_btn).to_have_text("\u23f8")
    play_btn.click()
    expect(play_btn).to_have_text("\u25b6")


def test_next_previous_beat(playback_page):
    """Next and previous buttons step through beats."""
    page = playback_page
    next_btn = page.locator('button[title="Next beat"]')
    prev_btn = page.locator('button[title="Previous beat"]')
    progress = page.locator(".toolbar__progress")

    next_btn.click()
    expect(progress).to_have_text("Beat 1 / 10")
    next_btn.click()
    expect(progress).to_have_text("Beat 2 / 10")
    prev_btn.click()
    expect(progress).to_have_text("Beat 1 / 10")


def test_skip_to_start(playback_page):
    """Skip-to-start returns to beat 0."""
    page = playback_page
    play_btn = page.locator('button[title="Play/Pause"]')
    start_btn = page.locator('button[title="Skip to start"]')
    progress = page.locator(".toolbar__progress")

    # Play to leave READY state (skip-to-start is disabled in READY)
    play_btn.click()
    expect(page.locator(".bubble, .iw-card").first).to_be_visible()
    # Pause
    play_btn.click()
    expect(play_btn).to_have_text("\u25b6")

    # Now skip-to-start is enabled (PAUSED, not READY)
    start_btn.click()
    expect(progress).to_have_text("Beat 0 / 10")


def test_skip_to_end(playback_page):
    """Skip-to-end jumps to the last beat."""
    page = playback_page
    end_btn = page.locator('button[title="Skip to end"]')
    progress = page.locator(".toolbar__progress")

    end_btn.click()
    expect(progress).to_have_text("Beat 10 / 10")


def test_speed_change(playback_page):
    """Speed buttons update the active speed indicator."""
    page = playback_page
    btn_2x = page.locator(".toolbar__btn--speed", has_text="2x")
    btn_1x = page.locator(".toolbar__btn--speed", has_text="1x")

    btn_2x.click()
    expect(btn_2x).to_have_class(re.compile(r"toolbar__btn--active"))
    expect(btn_1x).not_to_have_class(re.compile(r"toolbar__btn--active"))


def test_keyboard_space_toggles_play(playback_page):
    """Space key toggles play/pause."""
    page = playback_page
    play_btn = page.locator('button[title="Play/Pause"]')

    page.keyboard.press("Space")
    expect(play_btn).to_have_text("\u23f8")
    page.keyboard.press("Space")
    expect(play_btn).to_have_text("\u25b6")


def test_keyboard_arrows_step_beats(playback_page):
    """Arrow keys step through beats."""
    page = playback_page
    progress = page.locator(".toolbar__progress")

    page.keyboard.press("ArrowRight")
    expect(progress).to_have_text("Beat 1 / 10")
    page.keyboard.press("ArrowRight")
    expect(progress).to_have_text("Beat 2 / 10")
    page.keyboard.press("ArrowLeft")
    expect(progress).to_have_text("Beat 1 / 10")


def test_scroll_back_pauses_playback(playback_page):
    """Scrolling back during playback shows the pause indicator."""
    page = playback_page

    # Use a smaller viewport to ensure content overflows
    page.set_viewport_size({"width": 1280, "height": 400})

    # Switch to expanded mode so IW beats have non-zero duration during play
    page.locator(".toolbar__btn--iw", has_text="Expanded").click()

    # Step through beats to create scrollable content (no timing involved)
    next_btn = page.locator('button[title="Next beat"]')
    for _ in range(8):
        next_btn.click()

    # Force scroll to bottom synchronously
    page.evaluate("""() => {
        const el = document.querySelector('.app-main');
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    }""")
    page.wait_for_timeout(100)

    # Start playing — enables scroll detection, scroller records scroll position
    page.locator('button[title="Play/Pause"]').click()
    play_btn = page.locator('button[title="Play/Pause"]')
    expect(play_btn).to_have_text("\u23f8")

    # Wait for play to settle (onBeat fires for beat 8, smooth scroll completes)
    page.wait_for_timeout(500)

    # Scroll to top to trigger scroll-pause detection
    page.evaluate("""() => {
        const el = document.querySelector('.app-main');
        el.scrollTo({ top: 0, behavior: 'instant' });
    }""")

    # Scroll-pause indicator should appear
    expect(page.locator(".scroll-pause-indicator")).to_be_visible(timeout=3000)


def test_auto_scroll_keeps_beats_visible(playback_page):
    """New beats stay within the viewport via auto-scroll."""
    page = playback_page
    next_btn = page.locator('button[title="Next beat"]')

    for _ in range(8):
        next_btn.click()

    last = page.locator(".bubble, .iw-card").last
    expect(last).to_be_in_viewport()


def test_markdown_renders_in_assistant_bubbles(playback_page):
    """Assistant messages render Markdown (headings, lists, code blocks)."""
    page = playback_page
    next_btn = page.locator('button[title="Next beat"]')

    # Step to beat 4 (first assistant message with markdown)
    for _ in range(5):
        next_btn.click()

    assistant = page.locator(".bubble--assistant").first
    expect(assistant.locator("h2")).to_be_visible()
    expect(assistant.locator("ul")).to_be_visible()
    expect(assistant.locator("pre code")).to_be_visible()
