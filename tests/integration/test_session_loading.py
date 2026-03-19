"""Integration tests for session loading — curated sessions and file upload."""

import os

from playwright.sync_api import expect

FIXTURE_JSONL = os.path.join(
    os.path.dirname(__file__), "fixtures", "integration-session.jsonl"
)


def test_picker_shows_curated_sessions(loaded_page):
    """Session picker displays curated session cards from the manifest."""
    page = loaded_page
    cards = page.locator(".picker__card")
    expect(cards).to_have_count(2)
    expect(cards.first.locator(".picker__card-title")).to_have_text("Demo: File Review")
    expect(cards.nth(1).locator(".picker__card-title")).to_have_text(
        "Debugging: API 500 Errors"
    )
    expect(cards.first.locator(".picker__card-meta")).to_contain_text("beats")


def test_curated_session_loads_playback(loaded_page):
    """Clicking a curated session card transitions to the playback view."""
    page = loaded_page
    page.locator(".picker__card").first.click()
    expect(page.locator(".toolbar")).to_be_visible()
    expect(page.locator(".app-subtitle")).to_be_visible()
    expect(page.locator(".toolbar__progress")).to_contain_text("/ 12")


def test_file_upload_loads_playback(loaded_page):
    """Uploading a JSONL file via file input transitions to playback view."""
    page = loaded_page
    page.set_input_files('input[type="file"]', FIXTURE_JSONL)
    expect(page.locator(".toolbar")).to_be_visible()
    expect(page.locator(".toolbar__progress")).to_contain_text("/ 10")


def test_back_button_returns_to_picker(playback_page):
    """Back button returns from playback to the session picker."""
    page = playback_page
    expect(page.locator(".toolbar")).to_be_visible()
    page.locator(".app-header__back").click()
    expect(page.locator(".picker")).to_be_visible()
    expect(page.locator(".toolbar")).not_to_be_visible()
