import re


def test_index_returns_html(client):
    """Root URL serves the index.html page."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"Clawback" in response.data


def test_index_loads_all_required_scripts(client):
    """Index page includes all required script tags."""
    html = client.get("/").data.decode()
    assert "parser.js" in html, "parser.js must be loaded"
    assert "playback.js" in html, "playback.js must be loaded"
    assert "renderer.js" in html, "renderer.js must be loaded"
    assert "scroller.js" in html, "scroller.js must be loaded"
    assert "app.js" in html, "app.js must be loaded"
    assert "alpinejs" in html, "Alpine.js must be loaded"
    assert "marked" in html, "marked.js must be loaded"
    assert "highlight" in html, "highlight.js must be loaded"
    assert "dompurify" in html.lower(), "DOMPurify must be loaded"


def test_index_script_load_order(client):
    """Alpine.js must load after app.js (defer scripts execute in document order)."""
    html = client.get("/").data.decode()

    # Find positions of each script in the HTML
    script_tags = re.findall(r'<script[^>]+src="([^"]+)"', html)

    # Extract just the library names for readability
    def lib_name(src):
        if "parser.js" in src:
            return "parser"
        if "playback.js" in src:
            return "playback"
        if "renderer.js" in src:
            return "renderer"
        if "scroller.js" in src:
            return "scroller"
        if "app.js" in src:
            return "app"
        if "alpinejs" in src:
            return "alpine"
        if "marked" in src:
            return "marked"
        if "highlight" in src:
            return "highlight"
        if "dompurify" in src.lower() or "purify" in src.lower():
            return "dompurify"
        return src

    order = [lib_name(s) for s in script_tags]

    # CDN libs must load before modules that depend on them
    assert order.index("marked") < order.index("renderer"), (
        "marked must load before renderer.js"
    )
    assert order.index("highlight") < order.index("renderer"), (
        "highlight.js must load before renderer.js"
    )
    assert order.index("dompurify") < order.index("renderer"), (
        "DOMPurify must load before renderer.js"
    )
    # Clawback modules in dependency order
    assert order.index("parser") < order.index("playback"), (
        "parser.js must load before playback.js"
    )
    assert order.index("playback") < order.index("renderer"), (
        "playback.js must load before renderer.js"
    )
    assert order.index("scroller") < order.index("app"), (
        "scroller.js must load before app.js"
    )
    assert order.index("app") < order.index("alpine"), (
        "app.js must load before Alpine.js"
    )


def test_index_has_session_picker(client):
    """Index page includes the session picker UI with upload."""
    html = client.get("/").data.decode()
    assert "picker" in html, "session picker must be present"
    assert "loadSession" in html, "session loading must be present"
    assert 'type="file"' in html, "file upload input must be present"
    assert ".jsonl" in html, "file upload must accept .jsonl files"
    assert "backToSessions" in html, "back button must be present"
    assert "handleFileUpload" in html, "file upload handler must be present"
    assert "handleFileDrop" in html, "drag-and-drop handler must be present"
    # Hero card
    assert 'class="hero"' in html, "hero card must be present"
    assert "curated session" in html.lower(), "hero must mention curated sessions"


def test_index_has_keyboard_shortcut_binding(client):
    """Body element binds keyboard shortcuts via Alpine.js."""
    html = client.get("/").data.decode()
    assert "handleKeydown" in html, "keyboard shortcut handler must be bound"
    assert "@keydown.window" in html, "keyboard events must use @keydown.window"


def test_index_has_toolbar(client):
    """Index page includes the playback toolbar with all required controls."""
    html = client.get("/").data.decode()
    assert 'class="toolbar"' in html, "toolbar must be present"
    # Transport controls
    assert "skipToStart" in html, "skip-to-start button must be present"
    assert "togglePlay" in html, "play/pause button must be present"
    assert "skipToEnd" in html, "skip-to-end button must be present"
    assert "nextBeat" in html, "next-beat button must be present"
    assert "previousBeat" in html, "previous-beat button must be present"
    # Speed stepper
    assert "increaseSpeed()" in html, "speed increase button must be present"
    assert "decreaseSpeed()" in html, "speed decrease button must be present"
    assert "speed-stepper" in html, "speed stepper container must be present"
    # Inner workings toggle
    assert "setInnerWorkingsMode" in html, "inner workings toggle must be present"
    # Progress indicator
    assert "totalBeats" in html, "progress indicator must be present"


def test_index_cdn_versions_are_pinned(client):
    """CDN script URLs must use pinned versions, not floating ranges."""
    html = client.get("/").data.decode()
    cdn_urls = re.findall(r'(?:src|href)="(https://cdn\.jsdelivr[^"]+)"', html)

    for url in cdn_urls:
        assert ".x" not in url, f"Floating version in CDN URL: {url}"
        # Verify there's an @version specifier with numbers
        assert re.search(r"@\d+\.\d+", url), f"Missing pinned version in CDN URL: {url}"
