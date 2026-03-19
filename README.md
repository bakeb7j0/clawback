# Clawback

A web-based session replay tool for Claude Code. Clawback transforms Claude Code session logs (`.jsonl` files) into an interactive chat-bubble playback experience, letting developers observe AI-assisted development workflows at a comfortable reading pace.

## Features

- **Timed playback** — beats render at a reading-speed pace with play/pause, skip, and speed controls
- **Inner workings** — expand or collapse the AI's thinking, tool calls, and results
- **Keyboard shortcuts** — Space (play/pause), arrow keys (step through beats)
- **Markdown rendering** — assistant messages render with syntax-highlighted code blocks
- **Auto-scroll with scroll-pause** — scrolling back pauses playback; click to resume
- **File upload** — drag-and-drop or browse to load any `.jsonl` session file
- **Curated sessions** — ships with educational example sessions
- **Optional access gating** — protect the instance with a shared secret

## Quick Start

### Run from GitHub Container Registry

Create a `docker-compose.yml`:

```yaml
services:
  clawback:
    image: ghcr.io/bakeb7j0/clawback:latest
    ports:
      - "8080:8080"
    # environment:
    #   CLAWBACK_SECRET: change-me
```

```bash
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

### Build from source

```bash
git clone https://github.com/bakeb7j0/clawback.git
cd clawback
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

### Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
make run
```

Open [http://localhost:8080](http://localhost:8080).

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the server listens on |
| `CLAWBACK_SECRET` | *(unset)* | When set, all routes except `/health` require this secret |

### Access gating

Set `CLAWBACK_SECRET` to require authentication:

```bash
# Docker
docker compose up  # then edit docker-compose.yml to uncomment CLAWBACK_SECRET

# Direct
CLAWBACK_SECRET=my-secret make run
```

Provide the secret via query parameter or header:

```
http://localhost:8080/?secret=my-secret
```

```bash
curl -H "X-Clawback-Secret: my-secret" http://localhost:8080/api/sessions
```

The `/health` endpoint is always accessible without authentication.

## Adding Curated Sessions

Curated sessions are `.jsonl` files in `sessions/curated/` with metadata in `manifest.json`.

1. Copy a Claude Code session log to `sessions/curated/`:
   ```bash
   cp ~/.claude/projects/my-project/session.jsonl sessions/curated/my-session.jsonl
   ```

2. **Sanitize** the file — remove any secrets, credentials, or sensitive file paths.

3. Add an entry to `sessions/curated/manifest.json`:
   ```json
   {
       "id": "my-session",
       "title": "My Session Title",
       "description": "Brief description of what this session demonstrates.",
       "file": "my-session.jsonl",
       "beat_count": 42,
       "tags": ["debugging", "python"]
   }
   ```

4. Restart the server — curated sessions are pre-parsed at startup.

To find the beat count, start the app and upload the file, or run:
```bash
python -c "
from app.services.session_parser import parse_session
from pathlib import Path
result = parse_session(Path('sessions/curated/my-session.jsonl').read_text())
print(len(result['beats']), 'beats')
"
```

## Development

```bash
make test              # Run unit tests (Python + JS)
make test-integration  # Run Playwright integration tests
make lint              # Run ruff linter
make format            # Auto-format with ruff
make build             # Build Docker image
make up                # Run with docker compose
make clean             # Stop containers and clean caches
```

## Architecture

```
app/
├── __init__.py              # Flask app factory
├── config.py                # Environment-based configuration
├── middleware/auth.py        # Optional shared-secret auth
├── routes/
│   ├── api.py               # REST API (sessions list, session data)
│   ├── health.py            # Health check endpoint
│   └── views.py             # Serves the SPA
├── services/
│   ├── session_cache.py     # Pre-parsed session cache
│   └── session_parser.py    # JSONL → beat array parser
└── static/
    ├── index.html           # SPA entry point (Alpine.js)
    ├── css/style.css         # All styles
    └── js/
        ├── app.js           # Alpine.js app component
        ├── parser.js        # Client-side JSONL parser
        ├── playback.js      # Playback engine state machine
        ├── renderer.js      # DOM rendering (bubbles, IW cards)
        └── scroller.js      # Auto-scroll + scroll-pause
```
