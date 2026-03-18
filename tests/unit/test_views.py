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
    assert order.index("renderer") < order.index("app"), (
        "renderer.js must load before app.js"
    )
    assert order.index("app") < order.index("alpine"), (
        "app.js must load before Alpine.js"
    )


def test_index_cdn_versions_are_pinned(client):
    """CDN script URLs must use pinned versions, not floating ranges."""
    html = client.get("/").data.decode()
    cdn_urls = re.findall(r'(?:src|href)="(https://cdn\.jsdelivr[^"]+)"', html)

    for url in cdn_urls:
        assert ".x" not in url, f"Floating version in CDN URL: {url}"
        # Verify there's an @version specifier with numbers
        assert re.search(r"@\d+\.\d+", url), f"Missing pinned version in CDN URL: {url}"
