"""Integration tests for annotation playback — sections, callouts, artifacts."""

import re

from playwright.sync_api import expect


def _skip_to_end(page):
    """Skip to the end of the session so all beats and annotations are rendered."""
    page.locator('button[title="Skip to end"]').click()
    expect(page.locator(".toolbar__progress")).to_contain_text("Beat 10 / 10")


# ---------------------------------------------------------------------------
# Section sidebar
# ---------------------------------------------------------------------------


def test_section_sidebar_visible_with_annotations(annotated_page):
    """Section sidebar renders when the session has sections."""
    page = annotated_page
    sidebar = page.locator(".section-sidebar")
    expect(sidebar).to_be_visible()


def test_section_sidebar_shows_correct_labels(annotated_page):
    """Section sidebar items display correct labels from annotation data."""
    page = annotated_page
    items = page.locator(".section-sidebar__item")
    expect(items).to_have_count(2)
    expect(items.first.locator(".section-sidebar__label")).to_have_text("Code Review")
    expect(items.nth(1).locator(".section-sidebar__label")).to_have_text("Config Check")


def test_section_sidebar_shows_beat_ranges(annotated_page):
    """Section sidebar items show their beat ranges."""
    page = annotated_page
    ranges = page.locator(".section-sidebar__range")
    expect(ranges.first).to_contain_text("Beats 1")
    expect(ranges.nth(1)).to_contain_text("Beats 6")


def test_section_sidebar_has_colored_borders(annotated_page):
    """Section sidebar items have colored left borders matching their color."""
    page = annotated_page
    first_item = page.locator(".section-sidebar__item").first
    # Blue section should have a blue-ish border
    border_color = first_item.evaluate(
        "el => getComputedStyle(el).borderLeftColor"
    )
    # The color should be non-default (not transparent or black)
    assert border_color != "rgba(0, 0, 0, 0)", "Expected colored border"


def test_section_click_navigates_to_beat(annotated_page):
    """Clicking a section jumps to the correct beat and activates it in the sidebar."""
    page = annotated_page

    # Click second section ("Config Check" — starts at beat 5)
    page.locator(".section-sidebar__item").nth(1).click()

    # The clicked section should be marked active in the sidebar
    active_item = page.locator(".section-sidebar__item--active")
    expect(active_item).to_be_visible()
    expect(active_item.locator(".section-sidebar__label")).to_have_text("Config Check")

    # Should be paused (play button shows play icon, not pause)
    play_btn = page.locator('button[title="Play/Pause"]')
    expect(play_btn).to_have_text("\u25b6")

    # Progress should have advanced past beat 0
    progress = page.locator(".toolbar__progress")
    expect(progress).not_to_contain_text("Beat 0")


# ---------------------------------------------------------------------------
# Callout cards
# ---------------------------------------------------------------------------


def test_callout_cards_render_after_skip_to_end(annotated_page):
    """Callout annotation cards appear in the chat area after playback."""
    page = annotated_page
    _skip_to_end(page)

    callouts = page.locator(".callout")
    expect(callouts).to_have_count(2)


def test_callout_note_has_correct_style(annotated_page):
    """Note-style callout has the note CSS class."""
    page = annotated_page
    _skip_to_end(page)

    note = page.locator(".callout--note")
    expect(note).to_be_visible()
    expect(note.locator(".callout__title")).to_have_text("Instructor Note")


def test_callout_warning_has_correct_style(annotated_page):
    """Warning-style callout has the warning CSS class."""
    page = annotated_page
    _skip_to_end(page)

    warning = page.locator(".callout--warning")
    expect(warning).to_be_visible()
    expect(warning.locator(".callout__title")).to_have_text("Warning")


def test_callout_content_is_rendered(annotated_page):
    """Callout content is rendered as Markdown."""
    page = annotated_page
    _skip_to_end(page)

    note = page.locator(".callout--note")
    content = note.locator(".callout__content")
    expect(content).to_contain_text("instructor note about the code review")


# ---------------------------------------------------------------------------
# Artifact cards and panel
# ---------------------------------------------------------------------------


def test_artifact_card_renders(annotated_page):
    """Artifact card appears in the chat area after playback."""
    page = annotated_page
    _skip_to_end(page)

    card = page.locator(".artifact-card")
    expect(card).to_be_visible()
    expect(card.locator(".artifact-card__title")).to_have_text("Greeting Function")


def test_artifact_card_click_opens_panel(annotated_page):
    """Clicking an artifact card opens the artifact panel overlay."""
    page = annotated_page
    _skip_to_end(page)

    page.locator(".artifact-card").first.click()

    panel = page.locator(".artifact-panel")
    expect(panel).to_be_visible()
    expect(panel.locator(".artifact-panel__title")).to_have_text("Greeting Function")


def test_artifact_panel_shows_content(annotated_page):
    """Artifact panel renders the artifact content."""
    page = annotated_page
    _skip_to_end(page)

    page.locator(".artifact-card").first.click()

    content = page.locator(".artifact-panel__content")
    expect(content).to_contain_text("def greet")


def test_artifact_panel_pauses_playback(annotated_page):
    """Opening artifact panel while playing pauses playback."""
    page = annotated_page
    play_btn = page.locator('button[title="Play/Pause"]')
    next_btn = page.locator('button[title="Next beat"]')

    # Step through beats until the artifact card is rendered (after beat 4)
    for _ in range(7):
        next_btn.click()

    # Verify the artifact card exists
    expect(page.locator(".artifact-card")).to_be_visible()

    # Start playing (from PAUSED state, not COMPLETE)
    play_btn.click()
    expect(play_btn).to_have_text("\u23f8")

    # Opening artifact should pause
    page.locator(".artifact-card").first.click()
    expect(play_btn).to_have_text("\u25b6")


def test_close_artifact_does_not_resume(annotated_page):
    """Closing the artifact panel does not auto-resume playback."""
    page = annotated_page
    _skip_to_end(page)
    play_btn = page.locator('button[title="Play/Pause"]')

    page.locator(".artifact-card").first.click()
    expect(page.locator(".artifact-panel")).to_be_visible()

    # Close via close button
    page.locator(".artifact-panel__close").click()
    expect(page.locator(".artifact-panel")).not_to_be_visible()

    # Should remain paused
    expect(play_btn).to_have_text("\u25b6")


# ---------------------------------------------------------------------------
# Unannotated session regression
# ---------------------------------------------------------------------------


def test_unannotated_session_plays_without_regressions(playback_page):
    """Client-side uploaded session (no annotations) plays back normally."""
    page = playback_page
    progress = page.locator(".toolbar__progress")

    # Sidebar should not appear (no sections)
    expect(page.locator(".section-sidebar")).not_to_be_visible()

    # Skip to end should work
    page.locator('button[title="Skip to end"]').click()
    expect(progress).to_contain_text("Beat 10 / 10")

    # No callouts or artifacts should be present
    expect(page.locator(".callout")).to_have_count(0)
    expect(page.locator(".artifact-card")).to_have_count(0)
