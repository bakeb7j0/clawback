"""Integration tests for session upload via the Add Session UI."""

import os
import time

from playwright.sync_api import expect

FIXTURE_JSONL = os.path.join(
    os.path.dirname(__file__), "fixtures", "integration-session.jsonl"
)


def test_add_session_card_visible(loaded_page):
    """The Add Session card appears in the picker grid."""
    page = loaded_page
    add_card = page.locator(".picker__card--add")
    expect(add_card).to_be_visible()
    expect(add_card).to_contain_text("Add Session")


def test_upload_form_opens_on_file_select(loaded_page):
    """Selecting a file via the Add Session card opens the upload form."""
    page = loaded_page

    # Set file on the hidden input inside the Add Session card
    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)

    # Upload form modal should appear
    form = page.locator(".upload-form")
    expect(form).to_be_visible()
    expect(form.locator(".upload-form__title")).to_have_text("Add Session")


def test_upload_form_has_prefilled_title(loaded_page):
    """The upload form pre-fills the title from the filename."""
    page = loaded_page

    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)

    title_input = page.locator('input[placeholder="Session title"]')
    expect(title_input).to_have_value("integration session")


def test_upload_form_cancel_dismisses(loaded_page):
    """Clicking Cancel closes the upload form."""
    page = loaded_page

    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)
    expect(page.locator(".upload-form")).to_be_visible()

    page.locator(".upload-form__cancel").click()
    expect(page.locator(".upload-form")).not_to_be_visible()


def test_upload_form_escape_dismisses(loaded_page):
    """Pressing Escape closes the upload form."""
    page = loaded_page

    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)
    expect(page.locator(".upload-form")).to_be_visible()

    page.keyboard.press("Escape")
    expect(page.locator(".upload-form")).not_to_be_visible()


def test_upload_rejects_empty_title(loaded_page):
    """Submitting with an empty title shows an error."""
    page = loaded_page

    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)

    # Clear the title
    title_input = page.locator('input[placeholder="Session title"]')
    title_input.fill("")

    page.locator(".upload-form__submit").click()

    error = page.locator(".upload-form__error")
    expect(error).to_be_visible()
    expect(error).to_have_text("Title is required")


def test_successful_upload_adds_session_card(loaded_page):
    """Uploading a session adds a new card to the picker grid."""
    page = loaded_page

    # Count initial cards
    initial_count = page.locator(".picker__card").count()

    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)

    # Set a unique title to avoid duplicate ID conflicts across test runs
    title_input = page.locator('input[placeholder="Session title"]')
    title_input.fill(f"Upload Test {int(time.time())}")

    page.locator(".upload-form__submit").click()

    # Form should close and new card should appear
    expect(page.locator(".upload-form")).not_to_be_visible(timeout=10000)
    expect(page.locator(".picker__card")).to_have_count(initial_count + 1)


def test_uploaded_session_is_playable(loaded_page):
    """An uploaded session can be selected and played back."""
    page = loaded_page

    # Upload a session first
    add_input = page.locator(".picker__card--add input[type='file']")
    add_input.set_input_files(FIXTURE_JSONL)

    unique_title = f"Playable Test {int(time.time())}"
    title_input = page.locator('input[placeholder="Session title"]')
    title_input.fill(unique_title)

    page.locator(".upload-form__submit").click()
    expect(page.locator(".upload-form")).not_to_be_visible(timeout=10000)

    # Click the newly uploaded session
    page.locator(".picker__card-title", has_text=unique_title).click()

    # Should transition to playback view
    expect(page.locator(".toolbar")).to_be_visible(timeout=5000)
    expect(page.locator(".toolbar__progress")).to_contain_text("/ 10")
