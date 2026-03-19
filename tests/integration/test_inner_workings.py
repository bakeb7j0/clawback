"""Integration tests for inner workings card behavior."""

from playwright.sync_api import expect


def _step_to_iw_card(page):
    """Step through 4 beats to create an IW card with 3 items."""
    next_btn = page.locator('button[title="Next beat"]')
    for _ in range(4):
        next_btn.click()


def test_global_collapse_hides_content(playback_page):
    """Global collapse toggle collapses inner workings cards."""
    page = playback_page
    _step_to_iw_card(page)

    toggle = page.locator(".iw-card__toggle").first

    # Expand the card first (starts collapsed by default)
    page.locator(".iw-card__header").first.click()
    expect(toggle).to_contain_text("Hide")

    # Click global collapse
    page.locator(".toolbar__btn--iw", has_text="Collapsed").click()
    expect(toggle).to_contain_text("Show")


def test_global_expand_shows_content(playback_page):
    """Global expand toggle expands inner workings cards."""
    page = playback_page
    _step_to_iw_card(page)

    toggle = page.locator(".iw-card__toggle").first
    expect(toggle).to_contain_text("Show")

    # Click global expand
    page.locator(".toolbar__btn--iw", has_text="Expanded").click()
    expect(toggle).to_contain_text("Hide")


def test_individual_card_toggle(playback_page):
    """Clicking an IW card header toggles its expanded state."""
    page = playback_page
    _step_to_iw_card(page)

    header = page.locator(".iw-card__header").first
    toggle = page.locator(".iw-card__toggle").first

    # Starts collapsed
    expect(toggle).to_contain_text("Show")

    # Click to expand
    header.click()
    expect(toggle).to_contain_text("Hide")

    # Click to collapse
    header.click()
    expect(toggle).to_contain_text("Show")


def test_card_summary_shows_counts(playback_page):
    """IW card summary text shows item type counts."""
    page = playback_page
    _step_to_iw_card(page)

    summary = page.locator(".iw-card__summary").first
    expect(summary).to_contain_text("1 thought")
    expect(summary).to_contain_text("1 tool call")
    expect(summary).to_contain_text("1 result")
