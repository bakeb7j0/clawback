# Session State — Clawback

## Working Directory
`/home/bakerb/sandbox/github/clawback`

## Current Branch
`main` at `bakeb7j0/clawback` (GitHub)

## Commits (pushed)
1. `6266b78` Initial commit
2. `b740125` feat(scaffold): set up project structure, Flask app, and build tooling
3. `4777480` Merge PR #14 (issue #1 scaffolding)
4. `cb20aec` feat(parser): implement client-side JSONL-to-beats parser
5. `74a7bd0` chore(ci): add GitHub Actions CI pipeline
6. `c222100` Merge PR #15 (issue #2 parser + CI)

## PRs
- PR #14 — merged (Issue #1: scaffolding) — AC verified and checked off
- PR #15 — merged (Issue #2: parser + CI) — AC verified and checked off
- No open PRs

## Uncommitted Changes
- `CLAUDE.md` modified — added SOP for AC verification on merge, updated session onboarding to point to `Docs/PRD.md`. Needs to be committed with Issue #3 work.

## What Was Built

### Flask Backend (`app/`)
- `app/__init__.py` — App factory `create_app()`
- `app/config.py` — Reads `CLAWBACK_SECRET`, `PORT`, `FLASK_DEBUG` from env
- `app/routes/health.py` — `/health` → `{"status": "ok"}`
- `app/routes/api.py` — `/api/sessions` → placeholder `{"sessions": []}`
- `app/routes/views.py` — `/` → serves `index.html`
- `app/middleware/__init__.py` — empty, auth middleware is Issue #11
- `app/services/__init__.py` — empty, session parser service is Issue #8

### Frontend (`app/static/`)
- `index.html` — SPA shell, loads marked.js@15.0.7, highlight.js@11.11.1, parser.js, app.js, Alpine.js@3.14.9 (all `defer`, Alpine last)
- `css/style.css` — CSS custom properties for theming, dark color scheme, header + main layout
- `js/parser.js` — **Complete client-side JSONL-to-beats parser**. Pipeline: parseJsonlLines → filterConversationMessages → orderMessages → extractBeats → calculateDurations → assignGroupIds. Exports via `window.ClawbackParser` and `module.exports`.
- `js/app.js` — Minimal Alpine.js `clawbackApp()` state (sessionName, view)

### Tests
- `tests/unit/conftest.py` — Flask test client fixture
- `tests/unit/test_health.py` — 2 tests (status, content type)
- `tests/unit/test_api.py` — 1 test (sessions endpoint)
- `tests/unit/test_views.py` — 4 tests (HTML served, scripts present, load order, CDN pinned)
- `tests/unit/js/test_parser.js` — 34 tests covering all parser functions
- `tests/unit/js/fixtures/test-session.jsonl` — Synthetic fixture with all beat types
- **Total: 41 tests (34 JS + 7 Python), all passing**

### CI/CD
- `.github/workflows/ci.yml` — 4 parallel jobs: lint, test-js, test-python, docker-build+smoke

### Build/Deploy
- `Dockerfile` — python:3.12-slim, non-root user, gunicorn, healthcheck
- `docker-compose.yml` — optional `CLAWBACK_SECRET`, health check
- `Makefile` — lint, format, test, test-js, test-integration, run, build, up, clean
- `pyproject.toml` — ruff + pytest config
- `requirements.txt` — flask, gunicorn
- `requirements-dev.txt` — + pytest, ruff, playwright

### Documentation
- `Docs/PRD.md` — Full PRD with 7 sections, 30+ EARS requirements, 4-phase implementation plan
- `sessions/curated/.gitkeep` — placeholder for curated sessions

## Key Design Decisions
1. **Client-side parsing for uploads** — User JSONL never leaves the browser. Privacy win. Server only serves curated sessions.
2. **Beat model** — Each JSONL entry = one beat. No multi-block splitting needed (verified: Claude Code JSONL always has one content block per assistant message).
3. **"Inner workings"** — Term for thinking/tool_call/tool_result. Collapsible cards with global toggle (default: collapsed).
4. **Alpine.js must load last** — `defer` scripts execute in document order. Alpine needs `clawbackApp()` defined first. This was a bug caught by code review.
5. **CDN versions pinned** — No floating `@3.x.x`. Exact versions: Alpine 3.14.9, marked 15.0.7, highlight.js 11.11.1.
6. **1 issue = 1 PR** — Strict mapping, `Closes #N` in every PR.
7. **AC verification on merge** — SOP added to CLAUDE.md: verify each criterion against codebase, check boxes on the issue, before closing.
8. **No mocks in tests** — All tests hit real code. Flask test client for Python, real parser execution for JS.

## Validation Results
- `make lint` — passes (ruff check, zero warnings)
- `make test` — 41/41 pass (34 JS + 7 Python)
- Docker build — succeeds, container serves `/health` correctly
- CI pipeline — green on PR #15
- Parser tested against real sessions: 304 beats (this session), 3,146 beats (large session, 98ms)

## PENDING

### Immediate Next: Issue #3 — Playback Engine State Machine
- Branch: `feature/3-playback-engine` (not yet created)
- File: `app/static/js/playback.js`
- States: READY → PLAYING → PAUSED / SCROLL_PAUSED → COMPLETE
- Must implement: play(), pause(), scrollPause(), next(), previous(), skipToStart(), skipToEnd(), setSpeed(), setInnerWorkingsMode()
- Callbacks: onBeat(beat), onStateChange(state)
- Inner workings collapsed mode skips beat durations
- **Also commit the CLAUDE.md changes (AC verification SOP) as part of this work**

### Remaining Issues (11 open)
- **Phase 1:** #3 (playback engine) — NEXT
- **Phase 2:** #4 (chat bubbles), #5 (inner working cards), #6 (auto-scroll)
- **Phase 3:** #7 (toolbar), #8 (session picker + upload), #9 (visual polish), #10 (Playwright tests)
- **Phase 4:** #11 (auth middleware), #12 (curated sessions), #13 (Docker + docs)

### Dependency chain
- #3 is independent (only needs parser from #2, which is merged)
- #4 needs #3 (renderer wires to playback engine onBeat callback)
- #5 needs #4
- #6 needs #3 + #4
- #7 needs #3 + #4 + #5
- #8 needs #2 + #3 + #4
- #9 depends on #7 + #8
- #10 depends on all of Phase 2 + 3
- #11 is independent (just Flask middleware)
- #12 needs #8
- #13 needs #11 + #12

## Lessons Learned
- **Alpine.js `defer` race** — If Alpine loads before app.js, `clawbackApp()` is undefined. Always declare Alpine's script tag LAST among defer scripts.
- **Floating CDN versions** — `@3.x.x` resolves to latest at request time. Pin exact versions always.
- **JSONL structure** — Claude Code writes one content block per assistant JSONL entry (never multi-block). Simplifies parser significantly.
- **AC checkbox discipline** — Issue #1 was merged with all boxes unchecked. Now an explicit SOP in CLAUDE.md.
- **Code review catches wiring bugs** — Unit tests passed but the parser wasn't even loaded in the HTML. Always run the code review agent before merge.
