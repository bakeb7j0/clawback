# Clawback

A web-based session replay tool for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## What is Clawback?

Clawback transforms Claude Code session logs (`.jsonl` files) into an interactive chat-bubble playback experience. Think of it as a "game replay" for AI-assisted development — you can watch an entire coding session unfold beat by beat, at a comfortable reading pace, with full visibility into the AI's thinking, tool calls, and decisions.

### Why does this exist?

Working with AI coding agents effectively is a skill. The way you structure your instructions, manage context, and guide the conversation has a direct impact on the quality of the output. This is **context engineering** — and it's hard to teach from slides alone.

Clawback exists so that developers can **watch real sessions** where context engineering techniques are applied in practice. Instead of reading about prompt design in the abstract, you can observe an actual multi-hour development workflow: how the human breaks down a problem, how the AI responds, where things go well, and where they don't.

### How it works

1. **Record** — Claude Code already writes a `.jsonl` log of every session. That's your raw material.
2. **Load** — Drop the file into Clawback (drag-and-drop upload) or add it as a curated session with metadata.
3. **Replay** — Clawback parses the log into a sequence of "beats" (individual messages, tool calls, results) and plays them back as timed chat bubbles. You control the pace with play/pause, skip, and speed controls.
4. **Learn** — Expand the AI's inner workings (thinking blocks, tool calls, and their results) to understand *why* it made each decision. Use the section navigator to jump between phases of the conversation. Search across all beats to find specific topics.

Clawback ships with curated example sessions that demonstrate context engineering workflows from start to finish — but you can also upload any Claude Code session log to replay your own work or share it with your team.

## Features

- **Timed playback** — beats render at a reading-speed pace with play/pause, skip, and speed controls
- **Inner workings** — expand or collapse the AI's thinking, tool calls, and results
- **Keyboard shortcuts** — Space (play/pause), Left/Right (step through beats), Up/Down (speed)
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
| `CLAWBACK_READ_ONLY` | *(unset)* | When set to `true`, disables editing and curated uploads |
| `CLAWBACK_EPHEMERAL_TTL` | `14400` | Time-to-live for ephemeral sessions in seconds (default 4 hours) |

### Access gating

Set `CLAWBACK_SECRET` to require authentication:

```bash
# Docker
docker compose up  # then edit docker-compose.yml to uncomment CLAWBACK_SECRET

# Direct
CLAWBACK_SECRET=my-secret make run
```

When a secret is configured, unauthenticated browser requests redirect to a login page. Enter the secret once and a cookie keeps you logged in for the session.

For API consumers, pass the secret via header:

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
