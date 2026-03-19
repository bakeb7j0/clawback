"""Integration tests for annotation editing — create, edit, delete via UI."""

import re

from playwright.sync_api import expect


def _enter_edit_mode(page):
    """Enable edit mode via the toolbar toggle."""
    edit_btn = page.locator('button[title="Toggle annotation editing"]')
    edit_btn.click()


def _skip_to_end(page):
    """Skip to the end of the session so all beats are rendered."""
    page.locator('button[title="Skip to end"]').click()
    expect(page.locator(".toolbar__progress")).to_contain_text("Beat 10 / 10")


def _pause_if_playing(page):
    """Pause playback if currently playing."""
    play_btn = page.locator('button[title="Play/Pause"]')
    # If showing pause icon, click to pause
    if play_btn.text_content() == "\u23f8":
        play_btn.click()


def _click_beat(page, index):
    """Click a conversation beat bubble by index (triggers context menu in edit mode)."""
    beat = page.locator(".bubble").nth(index)
    beat.click()


# ---------------------------------------------------------------------------
# Editor toggle
# ---------------------------------------------------------------------------


def test_edit_toggle_enables_editing(annotated_page):
    """Edit button toggles the editing class on the chat area."""
    page = annotated_page
    _skip_to_end(page)

    chat_area = page.locator(".chat-area")
    expect(chat_area).not_to_have_class("chat-area--editing")

    _enter_edit_mode(page)
    # Playwright's to_have_class checks for substring match
    expect(chat_area).to_have_class(re.compile(r"chat-area--editing"))


def test_edit_toggle_disables_editing(annotated_page):
    """Clicking edit again disables edit mode."""
    page = annotated_page
    _skip_to_end(page)

    _enter_edit_mode(page)
    expect(page.locator(".chat-area")).to_have_class(re.compile(r"chat-area--editing"))

    _enter_edit_mode(page)
    expect(page.locator(".chat-area")).not_to_have_class(re.compile(r"chat-area--editing"))


# ---------------------------------------------------------------------------
# Context menu and creating annotations
# ---------------------------------------------------------------------------


def test_beat_click_in_edit_mode_shows_context_menu(annotated_page):
    """Clicking a beat in edit mode shows the context menu."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    _click_beat(page, 0)

    menu = page.locator(".context-menu")
    expect(menu).to_be_visible()


def test_context_menu_dismissed_by_escape(annotated_page):
    """Pressing Escape dismisses the context menu."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    _click_beat(page, 0)
    expect(page.locator(".context-menu")).to_be_visible()

    page.keyboard.press("Escape")
    expect(page.locator(".context-menu")).not_to_be_visible()


def test_create_callout_via_context_menu(annotated_page):
    """Creating a callout via context menu adds it to the chat area."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    # Count existing callouts
    initial_count = page.locator(".callout").count()

    # Click a beat to open context menu
    _click_beat(page, 0)
    expect(page.locator(".context-menu")).to_be_visible()

    # Click "Add Note"
    page.locator(".context-menu__item", has_text="Note").click()

    # Inline editor should appear
    editor = page.locator(".inline-editor")
    expect(editor).to_be_visible()

    # Type content and save
    editor.locator("textarea").fill("New integration test note")
    editor.locator("button", has_text="Save").click()

    # New callout should appear
    expect(page.locator(".callout")).to_have_count(initial_count + 1)


def test_create_artifact_via_context_menu(annotated_page):
    """Creating an artifact via context menu adds it to the chat area."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    # Count existing artifacts
    initial_count = page.locator(".artifact-card").count()

    # Click a beat to open context menu
    _click_beat(page, 0)
    expect(page.locator(".context-menu")).to_be_visible()

    # Click "Attach Artifact"
    page.locator(".context-menu__item", has_text="Artifact").click()

    # Inline editor should appear with artifact fields
    editor = page.locator(".inline-editor")
    expect(editor).to_be_visible()

    # Fill in artifact fields
    editor.locator('input[placeholder="Artifact title"]').fill("Test Artifact")
    editor.locator("textarea").fill("Test content for artifact")
    editor.locator("button", has_text="Save").click()

    # New artifact card should appear
    expect(page.locator(".artifact-card")).to_have_count(initial_count + 1)


def test_create_section_via_two_click_flow(annotated_page):
    """Creating a section via the two-click flow adds it to the sidebar."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    # Count existing sections
    initial_count = page.locator(".section-sidebar__item").count()

    # Click a beat to open context menu
    _click_beat(page, 0)

    # Click "Start Section"
    page.locator(".context-menu__item", has_text="Section").click()

    # Section form should appear
    form = page.locator(".section-form")
    expect(form).to_be_visible()

    # Fill label and submit
    form.locator('input[placeholder="Section name"]').fill("New Test Section")
    form.locator("button", has_text="Next").click()

    # Should be in pending section mode
    expect(page.locator(".pending-section-banner")).to_be_visible()

    # Click another beat to complete the section
    page.locator(".bubble").nth(1).click()

    # New section should appear in sidebar
    expect(page.locator(".section-sidebar__item")).to_have_count(initial_count + 1)


# ---------------------------------------------------------------------------
# Editing existing annotations
# ---------------------------------------------------------------------------


def test_edit_existing_callout(annotated_page):
    """Editing a callout via context menu updates its content."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    # Click the note callout to open its context menu
    page.locator(".callout--note").first.click()
    expect(page.locator(".context-menu")).to_be_visible()

    # Click Edit
    page.locator(".context-menu__item", has_text="Edit").click()

    # Edit form (inline-editor) should appear replacing the callout card
    form = page.locator(".inline-editor")
    expect(form).to_be_visible()

    textarea = form.locator("textarea")
    textarea.fill("Updated callout content from integration test")
    form.locator("button", has_text="Save").click()

    # Form should dismiss and callout should re-render with new content
    expect(form).not_to_be_visible()
    expect(page.locator(".callout--note .callout__content").first).to_contain_text(
        "Updated callout content"
    )


# ---------------------------------------------------------------------------
# Deleting annotations
# ---------------------------------------------------------------------------


def test_delete_callout_via_context_menu(annotated_page):
    """Deleting a callout via context menu removes it from the chat area."""
    page = annotated_page
    _skip_to_end(page)
    _enter_edit_mode(page)

    initial_count = page.locator(".callout").count()
    assert initial_count > 0, "Need at least one callout to delete"

    # Click the warning callout to open its context menu
    page.locator(".callout--warning").first.click()
    expect(page.locator(".context-menu")).to_be_visible()

    # Click Delete
    page.locator(".context-menu__item", has_text="Delete").click()

    # Callout count should decrease
    expect(page.locator(".callout")).to_have_count(initial_count - 1)

    # Toast should appear
    expect(page.locator(".edit-toast")).to_be_visible()
