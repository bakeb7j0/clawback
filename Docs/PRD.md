# Clawback — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-18
**Status:** Draft
**Authors:** bakerb, Claude (AI Partner)

---

## Table of Contents

1. [Problem Domain](#1-problem-domain)
2. [Constraints](#2-constraints)
3. [Requirements (EARS Format)](#3-requirements-ears-format)
4. [Concept of Operations](#4-concept-of-operations)
5. [Detailed Design](#5-detailed-design)
6. [Definition of Done](#6-definition-of-done)
7. [Phased Implementation Plan](#7-phased-implementation-plan)

---

## 1. Problem Domain

### 1.1 Background

Generative AI is rapidly transforming software development. Tools like Claude Code enable developers to work with AI partners throughout the entire software lifecycle — from requirements discovery through implementation, testing, and deployment. However, there is a significant gap in how developers learn to collaborate effectively with AI.

Traditional developer education relies on tutorials, documentation, and pair programming. None of these formats adequately capture the **cadence** of AI-assisted development — the back-and-forth dialogue, the iterative refinement, the way context is built and managed across a session. Developers new to this paradigm have no way to observe skilled practitioners in action.

### 1.2 Problem Statement

Software developers who are unfamiliar with AI-assisted context engineering have no way to observe real examples of how experienced practitioners collaborate with AI partners. Claude Code sessions are ephemeral — they exist as raw log files that are not designed for human consumption, and there is no tool to replay them in a way that communicates the rhythm and decision-making of effective AI collaboration.

### 1.3 Proposed Solution

**Clawback** is a web-based session replay tool that transforms Claude Code session logs (`.jsonl` files) into an interactive, readable playback experience. It presents conversations as a timed chat-bubble interface where students can watch the dialogue unfold at a comfortable reading pace, with controls to pause, adjust speed, and toggle visibility of the AI's inner workings (thinking, tool calls, and results).

### 1.4 Target Users

| Persona | Description | Primary Use Case |
|---------|-------------|------------------|
| **Student** | Developer learning AI-assisted workflows | Watch curated sessions to build mental models |
| **Instructor** | Technical lead, educator, or mentor | Deploy clawback with curated sessions for a team or class |
| **Practitioner** | Developer reviewing their own sessions | Upload personal session files for self-review and reflection |

### 1.5 Post-MVP Vision

Beyond the core replay experience, clawback is designed to evolve into an **annotated learning platform**:

- **Section Tags**: Portions of a session can be tagged with categories (e.g., "design", "implementation", "debugging") and presented as navigable chapters, allowing students to jump directly to the type of interaction they want to study.
- **Callout Annotations**: Instructors can inject editorial commentary at specific points in the playback — "teachable moment" messages that appear inline, visually distinct from the conversation. For example: _"Notice how the auto-compact just occurred. The assistant lost context of the auth decision from earlier, which leads to a contradictory suggestion next. This is why context management matters."_

These features transform raw sessions into structured lessons.

---

## 2. Constraints

### 2.1 Technical Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| C-01 | User-uploaded session files must be parsed entirely client-side; no session data shall be transmitted to the server | Privacy — JSONL files contain file paths, code, commands, and potentially sensitive content |
| C-02 | No user authentication or account management system | Simplicity — this is a learning tool, not a SaaS platform |
| C-03 | No build toolchain (webpack, npm, etc.) for the frontend | Simplicity — reduces contributor friction and container complexity |
| C-04 | Single-container deployment | Operational simplicity — one image, one process |
| C-05 | Mobile-responsive design is post-MVP, but architecture must not preclude it | Design for the future without building for it now |

### 2.2 Product Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| C-06 | The only input format required for MVP is Claude Code session `.jsonl` files | MVP scope — the architecture should not preclude addition of other formats (e.g., OpenCode) in the future |
| C-07 | No persistent storage of user-uploaded sessions | Privacy and simplicity — uploads exist only in browser memory during the session |
| C-08 | Access gating is limited to a single shared secret (optional) | Avoids the complexity of user management while providing basic access control |

---

## 3. Requirements (EARS Format)

Requirements follow the **EARS** (Easy Approach to Requirements Syntax) notation:

- **Ubiquitous**: The system shall [function].
- **Event-driven**: When [event], the system shall [function].
- **State-driven**: While [state], the system shall [function].
- **Optional**: Where [feature/condition], the system shall [function].
- **Unwanted**: If [unwanted condition], then the system shall [function].

### 3.1 Session Loading

| ID | Type | Requirement |
|----|------|-------------|
| R-01 | Ubiquitous | The system shall parse Claude Code session `.jsonl` files into an ordered sequence of playback beats. |
| R-02 | Event-driven | When the user selects a curated session from the session picker, the system shall fetch the session data from the server and initialize playback. |
| R-03 | Event-driven | When the user uploads a `.jsonl` file, the system shall parse it entirely client-side using the browser's FileReader API without transmitting any data to the server. |
| R-04 | Ubiquitous | The system shall ship with a set of curated default sessions that demonstrate various AI collaboration patterns (e.g., design, implementation, debugging). |
| R-05 | Event-driven | When the application loads, the system shall display a session picker showing available curated sessions and an option to upload a custom `.jsonl` file. |

### 3.2 Playback Engine

| ID | Type | Requirement |
|----|------|-------------|
| R-10 | Ubiquitous | The system shall render conversation messages as a sequence of beats, where each beat is the smallest meaningful unit of conversation progress. |
| R-11 | Ubiquitous | The system shall calculate beat duration based on content word count at a base rate of approximately 200 words per minute for technical content. |
| R-12 | Ubiquitous | The system shall enforce a minimum beat duration of 1 second and a maximum beat duration of 15 seconds to prevent flash-by or stalling. |
| R-13 | Ubiquitous | The system shall categorize each beat as either a "direct message" (user text, assistant text) or an "inner working" (thinking block, tool call, tool result). |
| R-14 | Event-driven | When the user clicks Play, the system shall begin rendering beats sequentially at the configured speed. |
| R-15 | Event-driven | When the user clicks Pause, the system shall stop rendering new beats and maintain the current scroll position. |
| R-16 | Event-driven | When the user clicks the Next Beat control, the system shall immediately render the next beat regardless of timing. |
| R-17 | Event-driven | When the user clicks the Previous Beat control, the system shall remove the most recently rendered beat from view. |
| R-18 | Event-driven | When the user clicks Skip to Start, the system shall clear all rendered beats and reset playback to the beginning. |
| R-19 | Event-driven | When the user clicks Skip to End, the system shall immediately render all remaining beats. |

### 3.3 Speed Control

| ID | Type | Requirement |
|----|------|-------------|
| R-20 | Ubiquitous | The system shall provide playback speed presets of 0.5x, 1x, 1.5x, and 2x. |
| R-21 | Ubiquitous | The system shall default to 1x playback speed. |
| R-22 | Event-driven | When the user selects a speed preset, the system shall apply the new speed multiplier to all subsequent beat durations. |
| R-23 | State-driven | While a speed preset is active, the system shall visually indicate the selected speed in the toolbar. |

### 3.4 Chat Display

| ID | Type | Requirement |
|----|------|-------------|
| R-30 | Ubiquitous | The system shall render user messages and assistant messages as visually distinct chat bubbles. |
| R-31 | Ubiquitous | The system shall render new messages at the bottom of the chat area, building the conversation downward. |
| R-32 | Event-driven | When a new beat is rendered, the system shall auto-scroll to keep the latest content visible at the bottom of the viewport. |
| R-33 | Ubiquitous | The system shall render assistant text content with Markdown formatting support (headings, code blocks, lists, bold, italic, tables). |

### 3.5 Inner Workings

| ID | Type | Requirement |
|----|------|-------------|
| R-40 | Ubiquitous | The system shall group consecutive inner working beats into a single summary card displaying counts by type (e.g., "2 thoughts, 4 tool calls, 4 results"). |
| R-41 | Ubiquitous | The system shall default inner working cards to the collapsed state. |
| R-42 | Event-driven | When the user clicks an inner working card, the system shall toggle between collapsed (summary only) and expanded (full content) states. |
| R-43 | Event-driven | When the user changes the global inner workings toggle, the system shall set the default display state (collapsed or expanded) for all current and future inner working cards. |
| R-44 | State-driven | While inner workings are globally set to "collapsed", the system shall render inner working beats by incrementing the summary card counter without pausing for their full beat duration. |
| R-45 | State-driven | While inner workings are globally set to "expanded", the system shall render each inner working beat with its full content and calculated beat duration. |
| R-46 | Ubiquitous | When expanded, the system shall display thinking blocks, tool call names and inputs, and tool result outputs with appropriate formatting. |

### 3.6 Scroll Behavior

| ID | Type | Requirement |
|----|------|-------------|
| R-50 | Event-driven | When the user scrolls upward during active playback, the system shall pause playback automatically. |
| R-51 | State-driven | While playback is paused due to user scroll-back, the system shall display a persistent "Playback paused — Press Play to resume" indicator anchored to the bottom of the viewport. |
| R-52 | Event-driven | When the user clicks Play after a scroll-back pause, the system shall scroll to the bottom of the conversation and resume rendering beats. |

### 3.7 Toolbar

| ID | Type | Requirement |
|----|------|-------------|
| R-60 | Ubiquitous | The system shall display a persistent toolbar anchored to the bottom of the viewport. |
| R-61 | Ubiquitous | The toolbar shall contain: transport controls (skip-to-start, previous beat, play/pause, next beat, skip-to-end), speed presets (0.5x, 1x, 1.5x, 2x), and the global inner workings toggle. |
| R-62 | Ubiquitous | The toolbar shall display a progress indicator showing the current beat position relative to the total beat count. |

### 3.8 Access Control

| ID | Type | Requirement |
|----|------|-------------|
| R-70 | Optional | Where the `CLAWBACK_SECRET` environment variable is set, the system shall require the matching secret value as a query parameter or request header to access any content. |
| R-71 | Optional | Where the `CLAWBACK_SECRET` environment variable is set and an unauthenticated request is received, the system shall return an HTTP 401 response with a minimal error page. |
| R-72 | Optional | Where the `CLAWBACK_SECRET` environment variable is not set, the system shall allow unrestricted access to all content. |

### 3.9 Deployment

| ID | Type | Requirement |
|----|------|-------------|
| R-80 | Ubiquitous | The system shall be deployable as a single Docker container. |
| R-81 | Ubiquitous | The system shall provide a `docker-compose.yml` for simplified deployment. |
| R-82 | Ubiquitous | The system shall expose a `/health` endpoint that returns HTTP 200 when the application is running. |
| R-83 | Ubiquitous | The curated session files shall be baked into the container image at build time. |

### 3.10 Error Handling

| ID | Type | Requirement |
|----|------|-------------|
| R-90 | Unwanted | If a `.jsonl` file contains malformed JSON lines, then the system shall skip those lines, continue parsing the remaining content, and display a notification indicating the number of lines that could not be parsed. |
| R-91 | Unwanted | If a `.jsonl` file contains no parseable conversation messages, then the system shall display a user-friendly error message explaining the file could not be processed. |
| R-92 | Unwanted | If a curated session file fails to load from the server, then the system shall display an error message and allow the user to select a different session or upload their own. |

### 3.11 Integration Testing

| ID | Type | Requirement |
|----|------|-------------|
| R-100 | Ubiquitous | The system shall include automated integration tests using Playwright that exercise the end-to-end playback experience in a real browser. |
| R-101 | Ubiquitous | Integration tests shall verify: session loading (curated and uploaded), playback transport controls, speed changes, inner workings toggle, scroll-back pause behavior, and Markdown rendering. |
| R-102 | Ubiquitous | Integration tests shall be runnable via `make test-integration` and shall execute headless for CI compatibility. |

---

## 4. Concept of Operations

### 4.1 System Context

```
                    ┌─────────────────────┐
                    │    User (Browser)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Clawback Web App   │
                    │  ┌───────────────┐  │
                    │  │   Client-Side  │  │ ◄── User uploads parsed here
                    │  │   (Alpine.js)  │  │
                    │  └───────┬───────┘  │
                    │          │ API       │
                    │  ┌───────▼───────┐  │
                    │  │  Flask Server  │  │ ◄── Serves curated sessions + static files
                    │  └───────────────┘  │
                    └─────────────────────┘
                         Docker Container
```

### 4.2 User Workflows

#### Workflow 1: Student Watches a Curated Session

1. Student navigates to the clawback URL
2. Session picker displays available curated sessions with titles and descriptions
3. Student selects a session (e.g., "AI-Assisted Feature Design")
4. Client fetches pre-parsed beat data from the server
5. Playback view loads with the conversation area and bottom toolbar
6. Student clicks Play — beats render one at a time at 1x speed
7. Student reads the conversation as it builds downward
8. When an inner working card appears, student can expand it to see thinking/tool details
9. Student adjusts speed to 1.5x to skim familiar content
10. Student scrolls back to re-read an earlier exchange — playback pauses automatically
11. Student clicks Play — view jumps to bottom and resumes

#### Workflow 2: Practitioner Uploads Their Own Session

1. Practitioner navigates to the clawback URL
2. Clicks "Upload your own session"
3. Selects a `.jsonl` file from their local machine
4. Client-side parser processes the file — no data leaves the browser
5. Playback view loads; practitioner watches their session replay
6. On page close or navigation, the session data is discarded from browser memory

#### Workflow 3: Instructor Deploys for a Team

1. Instructor builds the clawback container image (curated sessions baked in)
2. Deploys with `docker-compose`, setting `CLAWBACK_SECRET=team-secret-2026`
3. Shares the URL with secret: `https://clawback.internal/?secret=team-secret-2026`
4. Team members access the tool and study the curated sessions

### 4.3 Beat Model

The beat is the fundamental unit of playback. The JSONL-to-beats pipeline transforms raw session data into an ordered sequence of renderable beats.

#### Beat Types

| JSONL Source | Beat Type | Category | Visual Treatment |
|-------------|-----------|----------|-----------------|
| `user` message with text content | User Message | Direct | Chat bubble (user style) |
| `assistant` message with `text` block | Assistant Message | Direct | Chat bubble (assistant style) |
| `assistant` message with `thinking` block | Thinking | Inner Working | Collapsible card element |
| `assistant` message with `tool_use` block | Tool Call | Inner Working | Collapsible card element |
| `user` message with `tool_result` block | Tool Result | Inner Working | Collapsible card element |

#### Beat Duration Calculation

```
base_wpm = 200
speed_multiplier = user_selected_speed  (0.5, 1.0, 1.5, 2.0)

word_count = count_words(beat.content)
raw_duration = (word_count / base_wpm) * 60  (in seconds)
adjusted_duration = raw_duration / speed_multiplier

final_duration = clamp(adjusted_duration, min=1.0, max=15.0)
```

For inner working beats in collapsed mode, the beat advances immediately (no pause) and the summary card counter increments to indicate activity occurred.

### 4.4 Inner Working Cards

Inner working cards accumulate consecutive inner working beats into a grouped display:

**Collapsed State:**
```
┌─────────────────────────────────────────────────────┐
│  ⚙ Inner workings: 2 thoughts, 4 tool calls,       │
│    4 results                                 ▶ Show │
└─────────────────────────────────────────────────────┘
```

**Expanded State:**
```
┌─────────────────────────────────────────────────────┐
│  ⚙ Inner workings                        ▼ Hide    │
│                                                     │
│  💭 Thinking                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ "The user wants me to check the session..." │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  🔧 Tool Call: Bash                                 │
│  ┌─────────────────────────────────────────────┐    │
│  │ ls -la /home/bakerb/sandbox/...             │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  📋 Tool Result                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ total 40                                    │    │
│  │ drwxrwxr-x  3 bakerb bakerb 4096 ...       │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 4.5 Toolbar Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⏮  ◀◀  [ ▶ Play ]  ▶▶  ⏭  │  0.5x [1x] 1.5x  2x  │  ⚙ Inner workings: [Collapsed ▾]  │  Beat 24/156  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Detailed Design

### 5.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | Flask (Python) | Serves static files and curated session API; Python is natural for JSONL preprocessing |
| Frontend Framework | Alpine.js | Declarative reactivity via HTML attributes; no build step; lightweight (~15KB) |
| Frontend Language | Vanilla JavaScript (ES6+) | No transpilation needed; direct DOM control for playback timing |
| Styling | CSS3 (custom, no framework) | Full control over chat bubble design; CSS custom properties for theming |
| Markdown Rendering | marked.js (CDN) | Lightweight, well-maintained Markdown-to-HTML library |
| Syntax Highlighting | highlight.js (CDN) | Code block formatting within messages |
| Integration Testing | Playwright | Python-native browser automation; headless CI support; timing/scroll assertions |
| Containerization | Docker | Single-stage build; Python base image |
| Orchestration | docker-compose | Simple single-service deployment with env var configuration |

### 5.2 Architecture

```
clawback/
├── Docs/
│   └── PRD.md                      # This document
├── app/
│   ├── __init__.py                  # Flask app factory
│   ├── config.py                    # Configuration (env vars, defaults)
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── api.py                   # /api/sessions endpoints
│   │   └── health.py                # /health endpoint
│   ├── middleware/
│   │   ├── __init__.py
│   │   └── auth.py                  # CLAWBACK_SECRET gating
│   ├── services/
│   │   ├── __init__.py
│   │   └── session_parser.py        # Server-side JSONL → beats (for curated sessions)
│   └── static/
│       ├── css/
│       │   └── style.css            # All styles (chat bubbles, toolbar, cards)
│       ├── js/
│       │   ├── parser.js            # Client-side JSONL → beats parser
│       │   ├── playback.js          # Playback engine (timing, state machine)
│       │   ├── renderer.js          # DOM rendering (bubbles, cards, scroll)
│       │   └── app.js               # Alpine.js app initialization and state
│       └── index.html               # Single-page application shell
├── sessions/
│   └── curated/
│       ├── manifest.json            # Session metadata (titles, descriptions)
│       └── *.jsonl                   # Curated session files
├── tests/
│   ├── unit/
│   │   ├── conftest.py
│   │   ├── test_session_parser.py   # Parser unit tests
│   │   ├── test_api.py              # API endpoint tests
│   │   └── test_auth.py             # Auth middleware tests
│   └── integration/
│       ├── conftest.py              # Playwright fixtures, app server setup
│       ├── test_playback.py         # Playback transport, timing, scroll behavior
│       ├── test_session_loading.py  # Curated selection and file upload
│       └── test_inner_workings.py   # Toggle, collapse/expand, summary cards
├── Dockerfile
├── docker-compose.yml
├── Makefile                         # lint, format, test, build, run targets
├── pyproject.toml                   # Python project config (ruff, pytest, etc.)
├── requirements.txt                 # Python dependencies
└── README.md
```

### 5.3 Client-Side JSONL Parser (`parser.js`)

The parser transforms raw JSONL text into an ordered array of beat objects.

#### Pipeline

```
Raw JSONL text
    │
    ▼
Split into lines, parse each as JSON
    │
    ▼
Filter: keep type in {user, assistant}, discard progress/system/file-history-snapshot/etc.
    │
    ▼
Order by parentUuid chain (linked-list traversal) or timestamp fallback
    │
    ▼
Extract content blocks from each message:
  - user message with string content → UserMessage beat
  - user message with tool_result array → ToolResult beat(s)
  - assistant message text block → AssistantMessage beat
  - assistant message thinking block → Thinking beat
  - assistant message tool_use block → ToolCall beat
    │
    ▼
Assign beat IDs (stable, sequential)
    │
    ▼
Calculate beat durations (word count → WPM → seconds)
    │
    ▼
Group consecutive inner working beats for summary card rendering
    │
    ▼
Beat array ready for playback engine
```

#### Beat Object Schema

```javascript
{
  id: Number,              // Sequential beat ID (stable reference for future annotations)
  type: String,            // "user_message" | "assistant_message" | "thinking" | "tool_call" | "tool_result"
  category: String,        // "direct" | "inner_working"
  content: String,         // Raw text content
  metadata: {
    tool_name: String,     // For tool_call beats: "Bash", "Read", "Glob", etc.
    tool_input: Object,    // For tool_call beats: the input parameters
    tool_use_id: String,   // Links tool_call to its tool_result
    model: String,         // For assistant messages: model ID
    timestamp: String,     // ISO timestamp from JSONL
  },
  duration: Number,        // Calculated display duration in seconds (before speed multiplier)
  group_id: Number,        // Groups consecutive inner_working beats under one summary card
}
```

### 5.4 Playback Engine (`playback.js`)

The playback engine is a state machine:

```
                ┌──────────┐
                │  READY   │ ◄── Initial state after session loaded
                └────┬─────┘
                     │ play()
                     ▼
                ┌──────────┐  scroll_back()  ┌──────────────┐
                │ PLAYING  │ ──────────────► │ SCROLL_PAUSED │
                └────┬─────┘                 └───────┬───────┘
                     │ pause()                       │ play()
                     ▼                               │
                ┌──────────┐ ◄───────────────────────┘
                │  PAUSED  │
                └────┬─────┘
                     │ play()
                     ▼
                ┌──────────┐
                │ PLAYING  │
                └────┬─────┘
                     │ (last beat rendered)
                     ▼
                ┌──────────┐
                │ COMPLETE │
                └──────────┘
```

#### Core Loop (PLAYING state)

```
1. Get current beat from beat array
2. If beat.category == "inner_working" AND global_toggle == "collapsed":
     - Increment summary card counter (no delay)
     - Advance to next beat
     - Go to 1
3. Render beat via renderer
4. Calculate display time: beat.duration / speed_multiplier
5. Schedule next beat after display time
6. Advance beat index
```

### 5.5 Server-Side Session API

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | Returns manifest of curated sessions (id, title, description, beat_count) |
| `GET` | `/api/sessions/<id>` | Returns pre-parsed beat array for a curated session |
| `GET` | `/health` | Returns `{"status": "ok"}` |
| `GET` | `/` | Serves the single-page application |

#### Curated Session Manifest (`sessions/curated/manifest.json`)

```json
[
  {
    "id": "design-session-001",
    "title": "AI-Assisted Product Design",
    "description": "Watch a developer and AI partner scope and design a new application from scratch, including requirements discovery and architecture decisions.",
    "file": "design-session-001.jsonl",
    "beat_count": 156,
    "tags": ["design", "requirements", "architecture"]
  }
]
```

### 5.6 Authentication Middleware

When `CLAWBACK_SECRET` is set:

1. Check for `secret` query parameter or `X-Clawback-Secret` header
2. If present and matches → allow request
3. If missing or mismatched → return HTTP 401 with minimal error page
4. The `/health` endpoint is always exempt from auth

### 5.7 Post-MVP: Annotation Architecture

The beat model is designed with stable sequential IDs to support future annotation features. The planned annotation system uses **sidecar files** that reference beats by ID:

#### Section Tags (sidecar format)

```json
{
  "session_id": "design-session-001",
  "sections": [
    {"start_beat": 0, "end_beat": 45, "label": "Requirements Discovery", "color": "#4A90D9"},
    {"start_beat": 46, "end_beat": 120, "label": "Architecture Design", "color": "#7B61FF"},
    {"start_beat": 121, "end_beat": 156, "label": "Implementation Planning", "color": "#2ECC71"}
  ]
}
```

#### Callout Annotations (sidecar format)

```json
{
  "session_id": "design-session-001",
  "callouts": [
    {
      "after_beat": 87,
      "style": "instructor_note",
      "content": "Notice how the auto-compact just occurred. The assistant lost context of the auth middleware decision from beat #34, which leads to a contradictory suggestion next. This is why context management matters."
    }
  ]
}
```

#### Embedded Artifacts (sidecar format)

Conversations produce artifacts — PRDs, code files, architecture diagrams, configuration files. In a raw replay, the student only sees the text that *describes* these outputs. Embedded artifacts allow curators to attach the actual produced document at the point in the conversation where it's relevant, giving students the full picture.

```json
{
  "session_id": "design-session-001",
  "artifacts": [
    {
      "after_beat": 312,
      "style": "embedded_artifact",
      "title": "Product Requirements Document",
      "description": "The PRD produced during this design session",
      "content_type": "markdown",
      "source": "artifacts/design-session-001/prd.md"
    },
    {
      "after_beat": 480,
      "style": "embedded_artifact",
      "title": "Architecture Diagram",
      "description": "System context diagram referenced in the discussion",
      "content_type": "image",
      "source": "artifacts/design-session-001/architecture.png"
    }
  ]
}
```

Artifacts render as a distinct card in the stream — expandable inline, or openable in a slide-out side panel so the student can read the artifact side-by-side with the conversation. Supported content types: `markdown`, `image`, `code` (with syntax highlighting), `pdf`. Artifact files are stored alongside curated sessions under `sessions/curated/artifacts/`.

These sidecar files sit alongside the session JSONL in `sessions/curated/` and are loaded by the client when available. The UI renders section tags as a navigable sidebar blade, callout annotations as visually distinct inline cards, and embedded artifacts as expandable document viewers.

---

## 6. Definition of Done

### 6.1 MVP Acceptance Criteria

The MVP is complete when ALL of the following are true:

| ID | Criterion | Verification |
|----|-----------|-------------|
| DoD-01 | A user can open the app and see a session picker with curated sessions listed | Manual: navigate to app URL, verify session list renders |
| DoD-02 | A user can select a curated session and watch it play back as timed chat bubbles | Manual: select session, verify beats render sequentially |
| DoD-03 | A user can upload their own `.jsonl` file and watch it play back | Manual: upload file, verify playback works |
| DoD-04 | Uploaded files are parsed entirely client-side — no network requests contain session data | Verify: browser dev tools network tab shows no upload requests |
| DoD-05 | Messages appear as visually distinct chat bubbles building downward with auto-scroll | Manual: verify user/assistant bubbles are styled differently, new messages appear at bottom |
| DoD-06 | Playback timing is content-length-based at ~200 WPM base rate | Test: verify beat duration calculation against known word counts |
| DoD-07 | User can play, pause, skip forward/back, and jump to start/end | Manual: verify all transport controls function |
| DoD-08 | User can adjust playback speed (0.5x, 1x, 1.5x, 2x) | Manual: verify speed change affects beat duration |
| DoD-09 | Inner workings are shown in collapsible summary cards (default: collapsed) | Manual: verify cards render with counts; expand/collapse works |
| DoD-10 | Global toggle changes default inner workings display state | Manual: toggle to expanded, verify new cards render expanded |
| DoD-11 | Scrolling back pauses playback with a visible indicator | Manual: scroll up during playback, verify pause + indicator |
| DoD-12 | Pressing Play after scroll-back jumps to bottom and resumes | Manual: after scroll-pause, click Play, verify jump + resume |
| DoD-13 | Markdown content in assistant messages renders correctly (headings, code, lists, tables) | Manual: verify Markdown rendering in a session with rich content |
| DoD-14 | The app runs in a Docker container via `docker-compose up` | Test: build and run container, verify app is accessible |
| DoD-15 | `CLAWBACK_SECRET` env var gates access when set | Test: set secret, verify 401 without it, 200 with it |
| DoD-16 | `/health` endpoint returns 200 | Test: `curl /health` returns OK |
| DoD-17 | Malformed JSONL lines are skipped with a notification showing the count of unparseable lines | Test: upload file with intentionally broken lines, verify playback works and notification appears |
| DoD-18 | All Python unit tests pass (`make test`) | CI: `pytest tests/unit/` exits 0 |
| DoD-19 | All Playwright integration tests pass (`make test-integration`) | CI: `pytest tests/integration/` exits 0 headless |
| DoD-20 | Code passes linting (`make lint`) | CI: `ruff check` exits 0 |
| DoD-21 | At least one curated session is included in the container image | Verify: curated session appears in session picker |

### 6.2 Quality Gates

- All Python code formatted with `ruff format`
- All Python code passes `ruff check` with zero warnings
- All shell scripts pass `shellcheck`
- Test coverage for parser and API endpoints (unit tests)
- Playwright integration tests cover all major user workflows (session loading, playback, inner workings, scroll behavior)
- No known security vulnerabilities in dependencies

---

## 7. Phased Implementation Plan

### Phase 1: Foundation

**Goal:** Project scaffolding, JSONL parser, and basic playback engine.

#### Issue 1.1: Project Scaffolding

**Title:** Set up project structure, Flask app, and build tooling

**Description:** Initialize the clawback project with the Flask application skeleton, static file structure, development tooling (Makefile, pyproject.toml, ruff config), and Docker configuration.

**Acceptance Criteria:**
- [ ] Flask app factory created in `app/__init__.py`
- [ ] Configuration module reads `CLAWBACK_SECRET` from environment
- [ ] Static file directory structure created (`css/`, `js/`, `index.html`)
- [ ] `Makefile` with targets: `lint`, `format`, `test`, `run` (dev server), `build` (Docker)
- [ ] `pyproject.toml` with ruff and pytest configuration
- [ ] `requirements.txt` with Flask and test dependencies
- [ ] `Dockerfile` builds and runs the app
- [ ] `docker-compose.yml` with optional `CLAWBACK_SECRET` env var
- [ ] `/health` endpoint returns `{"status": "ok"}`
- [ ] `make lint` and `make test` pass (even if tests are just a placeholder)
- [ ] `index.html` loads Alpine.js and app scripts from CDN/static

**Implementation Steps:**
1. Create `app/__init__.py` with Flask app factory (`create_app()`)
2. Create `app/config.py` — reads `CLAWBACK_SECRET` from `os.environ`
3. Create `app/routes/health.py` — blueprint with `/health` endpoint
4. Create `app/routes/__init__.py` — register blueprints
5. Create `app/static/index.html` — minimal HTML shell with Alpine.js CDN link
6. Create `app/static/css/style.css` — empty placeholder
7. Create `app/static/js/app.js` — minimal Alpine.js initialization
8. Create `Makefile` with targets
9. Create `pyproject.toml` with ruff/pytest config
10. Create `requirements.txt` (flask, pytest, ruff)
11. Create `Dockerfile` (python:3.12-slim base, copy app, expose port)
12. Create `docker-compose.yml`
13. Create `tests/conftest.py` with Flask test client fixture
14. Create `tests/test_health.py` — verify `/health` returns 200
15. Run `make lint && make test` to verify everything works

---

#### Issue 1.2: Client-Side JSONL Parser

**Title:** Implement client-side JSONL-to-beats parser in JavaScript

**Description:** Build the JavaScript module that transforms raw JSONL text into an ordered array of beat objects. This parser runs entirely in the browser and is the foundation of the playback system.

**Acceptance Criteria:**
- [ ] `parser.js` exports a `parseSession(jsonlText)` function that returns a beat array
- [ ] Parser correctly handles all beat types: user_message, assistant_message, thinking, tool_call, tool_result
- [ ] Parser skips non-conversation message types (progress, system, file-history-snapshot, queue-operation, last-prompt)
- [ ] Parser orders messages by parentUuid chain with timestamp fallback
- [ ] Each beat has a stable sequential ID
- [ ] Beat durations are calculated based on word count at 200 WPM base rate
- [ ] Durations are clamped between 1 and 15 seconds
- [ ] Consecutive inner working beats are assigned the same `group_id`
- [ ] Malformed JSON lines are skipped without throwing
- [ ] Parser handles empty or missing content blocks gracefully

**Implementation Steps:**
1. Create `app/static/js/parser.js`
2. Implement `parseJsonlLines(text)` — split text, parse each line, skip malformed
3. Implement `filterConversationMessages(messages)` — keep only user/assistant types
4. Implement `orderMessages(messages)` — build parentUuid chain, fall back to timestamp sort
5. Implement `extractBeats(orderedMessages)` — walk each message's content blocks, emit beat objects
6. Implement `calculateDurations(beats)` — word count / 200 WPM, clamp to [1, 15]
7. Implement `assignGroupIds(beats)` — consecutive inner_working beats share a group_id
8. Implement main `parseSession(jsonlText)` — orchestrates the pipeline
9. Add inline JSDoc comments for each function
10. Test manually with a real `.jsonl` file in the browser console

---

#### Issue 1.3: Basic Playback Engine

**Title:** Implement the playback engine state machine

**Description:** Build the JavaScript module that consumes a beat array and manages timed playback with play/pause support.

**Acceptance Criteria:**
- [ ] `playback.js` exports a `PlaybackEngine` class
- [ ] Engine supports states: READY, PLAYING, PAUSED, SCROLL_PAUSED, COMPLETE
- [ ] `play()` starts or resumes timed beat rendering
- [ ] `pause()` stops beat rendering
- [ ] `next()` immediately advances to the next beat
- [ ] `previous()` removes the last rendered beat
- [ ] `skipToStart()` resets to the beginning
- [ ] `skipToEnd()` renders all remaining beats immediately
- [ ] Engine respects speed multiplier for beat duration calculation
- [ ] Engine calls a configurable `onBeat(beat)` callback for each rendered beat
- [ ] Engine calls `onStateChange(state)` when state transitions occur
- [ ] Engine skips inner working beat durations when global toggle is "collapsed"

**Implementation Steps:**
1. Create `app/static/js/playback.js`
2. Define state enum: `READY`, `PLAYING`, `PAUSED`, `SCROLL_PAUSED`, `COMPLETE`
3. Implement `PlaybackEngine` class with constructor accepting beats array and callbacks
4. Implement `play()` — transition to PLAYING, start beat timer loop
5. Implement `pause()` — transition to PAUSED, clear pending timer
6. Implement `scrollPause()` — transition to SCROLL_PAUSED (called by scroll detection)
7. Implement `next()` / `previous()` — manual beat navigation
8. Implement `skipToStart()` / `skipToEnd()` — boundary navigation
9. Implement `setSpeed(multiplier)` — update speed, recalculate current beat's remaining time
10. Implement `setInnerWorkingsMode(mode)` — "collapsed" or "expanded"
11. Implement internal `_scheduleNextBeat()` — setTimeout with calculated duration
12. Test state transitions manually via browser console

---

### Phase 2: Core UI

**Goal:** Chat bubble rendering, inner working cards, auto-scroll, and scroll-back detection.

#### Issue 2.1: Chat Bubble Components

**Title:** Implement chat bubble rendering for user and assistant messages

**Description:** Build the CSS and JavaScript rendering for chat bubbles. User messages and assistant messages must be visually distinct. Assistant messages must support Markdown rendering.

**Acceptance Criteria:**
- [ ] User messages render as right-aligned (or left-aligned with distinct color) chat bubbles
- [ ] Assistant messages render as left-aligned chat bubbles with different styling
- [ ] Assistant messages render Markdown content (headings, bold, italic, code blocks, lists, tables)
- [ ] Code blocks within messages have syntax highlighting
- [ ] Messages build downward (newest at bottom)
- [ ] Bubbles have smooth appear animation (subtle fade-in or slide-up)
- [ ] Long messages are fully visible (no truncation)
- [ ] Message timestamps or beat numbers are optionally visible

**Implementation Steps:**
1. Add marked.js and highlight.js CDN links to `index.html`
2. Create CSS classes in `style.css`: `.chat-area`, `.bubble`, `.bubble--user`, `.bubble--assistant`
3. Design bubble styles: border-radius, padding, max-width, color differentiation
4. Implement `renderer.js` with `renderBeat(beat, container)` function
5. For assistant messages: pipe content through `marked.parse()` then highlight code blocks
6. For user messages: render as plain text (or light Markdown)
7. Add CSS animation for bubble appearance (`@keyframes fadeSlideUp`)
8. Wire renderer to playback engine's `onBeat` callback
9. Test with a session containing code blocks, tables, and lists

---

#### Issue 2.2: Inner Working Cards

**Title:** Implement collapsible inner working summary cards

**Description:** Build the UI component that groups consecutive inner working beats (thinking, tool calls, tool results) into collapsible summary cards.

**Acceptance Criteria:**
- [ ] Consecutive inner working beats are grouped into a single summary card
- [ ] Collapsed card shows counts: "N thoughts, N tool calls, N results"
- [ ] Expanded card shows full content of each inner working beat
- [ ] Thinking blocks display in a styled container with 💭 icon
- [ ] Tool calls display tool name and input with 🔧 icon
- [ ] Tool results display output with 📋 icon
- [ ] Individual cards can be toggled independently of the global setting
- [ ] Cards animate smoothly between collapsed and expanded states
- [ ] Tool result content with long output is scrollable (max-height with overflow)
- [ ] Code content within tool calls/results has syntax highlighting

**Implementation Steps:**
1. Add CSS classes: `.inner-workings-card`, `.iw-collapsed`, `.iw-expanded`, `.iw-item`
2. Implement `renderInnerWorkingsGroup(beats, container)` in `renderer.js`
3. Build collapsed view: icon + summary text + expand button
4. Build expanded view: list of inner working items with type icons
5. Use Alpine.js `x-show` and `x-transition` for collapse/expand animation
6. Implement per-card toggle via Alpine.js `x-data="{ expanded: globalDefault }"`
7. Implement global toggle reactivity — cards observe a shared Alpine.js store value
8. Add max-height + overflow-y:auto for tool result content blocks
9. Test with a session containing multiple tool calls in sequence

---

#### Issue 2.3: Auto-Scroll and Scroll-Back Detection

**Title:** Implement auto-scroll on new messages and pause-on-scroll-back

**Description:** The chat area must auto-scroll to keep new content visible. When the user manually scrolls upward during playback, playback must pause and show an indicator.

**Acceptance Criteria:**
- [ ] When a new beat is rendered, the chat area scrolls smoothly to the bottom
- [ ] Auto-scroll uses smooth scrolling (not instant jump)
- [ ] When the user scrolls upward during PLAYING state, playback transitions to SCROLL_PAUSED
- [ ] A "Playback paused — Press ▶ to resume" indicator appears anchored to the bottom
- [ ] Clicking the play button from SCROLL_PAUSED scrolls to bottom and resumes playback
- [ ] Scroll detection correctly distinguishes user-initiated scroll from auto-scroll
- [ ] Small scroll adjustments (within a threshold) do not trigger pause

**Implementation Steps:**
1. Implement `scrollToBottom(container)` with `scrollIntoView({ behavior: 'smooth' })`
2. Call `scrollToBottom` after each beat render in the `onBeat` callback
3. Add scroll event listener on the chat container
4. Track `isAutoScrolling` flag to distinguish auto-scroll from user scroll
5. Detect upward scroll: compare `scrollTop + clientHeight` to `scrollHeight` with threshold
6. On user scroll-up: call `playbackEngine.scrollPause()`
7. Create "Playback paused" overlay component — fixed position, bottom of viewport
8. Show/hide overlay based on playback state via Alpine.js
9. Test: play session, scroll up, verify pause + indicator, click play, verify resume

---

### Phase 3: Controls and Polish

**Goal:** Bottom toolbar, speed controls, session picker, file upload, and visual polish.

#### Issue 3.1: Bottom Toolbar

**Title:** Implement the persistent bottom toolbar with transport and speed controls

**Description:** Build the bottom-anchored toolbar containing transport controls, speed presets, inner workings toggle, and progress indicator.

**Acceptance Criteria:**
- [ ] Toolbar is fixed to the bottom of the viewport
- [ ] Transport controls: skip-to-start, previous beat, play/pause, next beat, skip-to-end
- [ ] All transport buttons are wired to the playback engine
- [ ] Speed preset buttons: 0.5x, 1x, 1.5x, 2x — active preset is visually highlighted
- [ ] Changing speed updates the playback engine immediately
- [ ] Global inner workings toggle: dropdown or button group (Collapsed / Expanded)
- [ ] Progress indicator shows "Beat N / Total" or a progress bar
- [ ] Toolbar does not obscure chat content (chat area has bottom padding to compensate)
- [ ] Toolbar is visually clean and unobtrusive

**Implementation Steps:**
1. Add toolbar HTML structure to `index.html` with Alpine.js bindings
2. CSS: fixed position, bottom: 0, full width, appropriate z-index
3. CSS: add padding-bottom to chat area equal to toolbar height
4. Wire transport buttons to playback engine methods via Alpine.js `@click`
5. Implement speed preset buttons with Alpine.js `x-bind:class` for active state
6. Implement inner workings toggle (dropdown or segmented control)
7. Implement progress display — reactive to playback engine's current beat index
8. Style toolbar: subtle background, border-top, consistent iconography
9. Test all controls during active playback

---

#### Issue 3.2: Session Picker and File Upload

**Title:** Implement the landing page with curated session list and file upload

**Description:** Build the session picker that appears when the app loads, showing available curated sessions and providing a file upload option for custom sessions.

**Acceptance Criteria:**
- [ ] Landing page displays a list/grid of curated sessions from the manifest
- [ ] Each session card shows: title, description, and beat count
- [ ] Clicking a session card fetches it from the API and transitions to playback view
- [ ] "Upload your own" option opens a file picker for `.jsonl` files
- [ ] Uploaded files are read via FileReader API — no server request
- [ ] After upload, client-side parser processes the file and transitions to playback view
- [ ] A "Back to sessions" button in the playback view returns to the session picker
- [ ] Loading states are shown while fetching/parsing sessions
- [ ] Error states are shown for invalid or empty files

**Implementation Steps:**
1. Implement `GET /api/sessions` endpoint in Flask — reads `manifest.json`, returns JSON
2. Implement `GET /api/sessions/<id>` endpoint — returns pre-parsed beats for a curated session
3. Create server-side parser (`session_parser.py`) that mirrors client parser logic for pre-parsing curated sessions
4. Design session picker layout in `index.html` — grid of cards + upload area
5. Use Alpine.js to fetch `/api/sessions` on load and render the list
6. Implement file upload with drag-and-drop zone and click-to-browse
7. Wire file selection to FileReader → parser → playback engine initialization
8. Implement view transitions (session picker ↔ playback) via Alpine.js state
9. Add loading spinner for session fetch / file parse
10. Add error display for parse failures
11. Test: select curated session, upload valid file, upload invalid file

---

#### Issue 3.3: Visual Polish and UX Refinement

**Title:** Polish the visual design, animations, and overall user experience

**Description:** Refine the UI with consistent styling, smooth animations, proper typography, and responsive-ready layout patterns.

**Acceptance Criteria:**
- [ ] Consistent color palette applied across all components
- [ ] Typography: monospace or clean sans-serif, appropriate sizing hierarchy
- [ ] Chat bubbles have polished shadows, rounded corners, and spacing
- [ ] Inner working cards have clear visual hierarchy when expanded
- [ ] Toolbar buttons have hover/active states
- [ ] All transitions are smooth (no jarring state changes)
- [ ] Application has a header with the clawback logo/title and current session name
- [ ] Keyboard shortcuts: Space (play/pause), Left/Right arrows (prev/next beat)
- [ ] CSS custom properties used for colors/spacing to enable future theming
- [ ] Layout uses flexbox/grid patterns that will adapt to mobile (post-MVP)

**Implementation Steps:**
1. Define CSS custom properties: `--color-user-bubble`, `--color-assistant-bubble`, `--color-inner-workings`, etc.
2. Refine bubble styles: box-shadow, border-radius, max-width (70% of container)
3. Refine toolbar styles: cohesive button group styling, hover states
4. Add keyboard event listeners for shortcuts (Space, Arrow keys)
5. Design and add a simple header bar with app title + session name
6. Review all transitions and add CSS `transition` properties where missing
7. Test full playback flow end-to-end for visual coherence
8. Cross-browser check: Chrome, Firefox, Safari (desktop only for MVP)

#### Issue 3.4: Integration Testing with Playwright

**Title:** Implement automated integration tests using Playwright

**Description:** Build a Playwright test suite that exercises the end-to-end playback experience in a real browser. These tests verify that the parser, playback engine, renderer, and UI controls work together correctly — covering timing, scroll behavior, and user interactions that unit tests cannot reach.

**Acceptance Criteria:**
- [ ] Playwright installed as a test dependency with Python bindings
- [ ] `tests/integration/conftest.py` provides fixtures for app server startup and browser context
- [ ] `test_session_loading.py`: tests curated session selection and file upload parsing
- [ ] `test_playback.py`: tests play/pause, skip forward/back, skip-to-start/end, speed changes
- [ ] `test_inner_workings.py`: tests global toggle, individual card expand/collapse, summary counts
- [ ] Tests verify scroll-back triggers playback pause and shows indicator
- [ ] Tests verify auto-scroll keeps new beats visible
- [ ] Tests verify Markdown renders correctly in assistant bubbles
- [ ] All tests run headless via `make test-integration`
- [ ] Tests use a small, purpose-built test fixture `.jsonl` file (not a real session)

**Implementation Steps:**
1. Add `playwright` to test dependencies in `requirements.txt`
2. Create `tests/integration/conftest.py` — fixture to start Flask app in a background thread, provide Playwright page
3. Create `tests/integration/fixtures/` with a small synthetic `.jsonl` file covering all beat types
4. Create `test_session_loading.py` — test curated session picker, test file upload via file chooser
5. Create `test_playback.py` — test transport controls, verify beat timing within tolerance, test speed preset changes
6. Create `test_inner_workings.py` — test global toggle changes card defaults, test individual card toggle
7. Add scroll-back tests: programmatic scroll-up, verify SCROLL_PAUSED state, verify indicator visible
8. Add Markdown rendering test: verify code blocks, headings, and lists render in assistant bubbles
9. Add `test-integration` target to Makefile: `python -m pytest tests/integration/ --headed` (and headless variant)
10. Run full suite, verify all pass

---

### Phase 4: Deployment and Content

**Goal:** Production-ready container, authentication, curated content, and documentation.

#### Issue 4.1: Authentication Middleware

**Title:** Implement optional CLAWBACK_SECRET access gating

**Description:** Add middleware that checks for a shared secret when the `CLAWBACK_SECRET` environment variable is configured.

**Acceptance Criteria:**
- [ ] When `CLAWBACK_SECRET` is set, all routes except `/health` require authentication
- [ ] Secret can be provided via `?secret=` query parameter or `X-Clawback-Secret` header
- [ ] Matching secret returns normal response
- [ ] Missing or wrong secret returns HTTP 401 with a clean error page
- [ ] When `CLAWBACK_SECRET` is not set, all routes are accessible without authentication
- [ ] Auth middleware is registered via Flask's `before_request` hook

**Implementation Steps:**
1. Create `app/middleware/auth.py`
2. Implement `check_secret()` function — reads from env, compares to request
3. Register as `@app.before_request` in the app factory
4. Skip auth for `/health` endpoint
5. Create a minimal 401 HTML page
6. Create `tests/test_auth.py` — test with/without secret, correct/incorrect values
7. Update `docker-compose.yml` with commented-out `CLAWBACK_SECRET` example
8. Run tests

---

#### Issue 4.2: Curated Session Content

**Title:** Create and package the initial set of curated sessions

**Description:** Select, sanitize, and package exemplary Claude Code sessions that demonstrate different AI collaboration patterns.

**Acceptance Criteria:**
- [ ] At least 1 curated session is packaged (more are ideal but not blocking)
- [ ] Each session has a title and description in `manifest.json`
- [ ] Sessions are sanitized: no secrets, credentials, or overly sensitive file paths
- [ ] Sessions demonstrate clear, educational interactions
- [ ] Server pre-parses curated sessions at startup for fast delivery

**Implementation Steps:**
1. Identify candidate sessions from `~/.claude/projects/`
2. Review and sanitize: remove or redact sensitive paths, secrets, credentials
3. Copy sanitized `.jsonl` files to `sessions/curated/`
4. Create `sessions/curated/manifest.json` with metadata
5. Implement server-side pre-parsing in the Flask app factory (parse at startup, cache in memory)
6. Test: start app, verify curated sessions appear in picker and play back correctly

---

#### Issue 4.3: Docker and Deployment Finalization

**Title:** Finalize Dockerfile, docker-compose, and deployment documentation

**Description:** Ensure the container builds cleanly, runs reliably, and is documented for deployment.

**Acceptance Criteria:**
- [ ] `Dockerfile` uses multi-stage or optimized build (small image size)
- [ ] Container starts and serves the app on a configurable port (default 8080)
- [ ] `docker-compose.yml` works out of the box with `docker-compose up`
- [ ] Health check is configured in docker-compose
- [ ] `README.md` documents: what clawback is, how to run it, how to configure the secret, how to add curated sessions
- [ ] `make build` builds the Docker image
- [ ] `make up` runs docker-compose up

**Implementation Steps:**
1. Optimize `Dockerfile`: use slim base, minimize layers, set non-root user
2. Configure gunicorn or waitress as production WSGI server
3. Add health check to `docker-compose.yml`
4. Add port configuration via `PORT` environment variable
5. Update `Makefile` with `build` and `up` targets
6. Write `README.md` with usage, deployment, and configuration docs
7. Test full build-and-run cycle from scratch
8. Test with and without `CLAWBACK_SECRET`

---

### Post-MVP Roadmap

These items are documented for planning purposes and will be scoped into issues when the MVP is complete.

| Item | Description | Priority |
|------|-------------|----------|
| Annotated Playback: Section Tags | Tag beat ranges as "design", "implementation", "debugging", etc. with a navigable sidebar blade | High |
| Annotated Playback: Callout Annotations | Inline instructor notes at teachable moments, stored as sidecar JSON | High |
| Annotated Playback: Embedded Artifacts | Attach produced documents (PRDs, code files, diagrams) at relevant points in the conversation; viewable inline or in a side-by-side panel | High |
| Annotation Editor | UI mode for instructors to mark up sessions with tags, callouts, and artifact links | Medium |
| Mobile-Responsive Layout | Adapt all UI components for mobile viewports | Medium |
| Session Sanitizer | Client-side tool to redact sensitive paths, secrets, and personal info from JSONL before sharing | Medium |
| Shareable Replay Links | Generate self-contained HTML files or shareable URLs for a session replay | Low |
| Additional Input Formats | Support for other AI tool session formats (e.g., OpenCode) beyond Claude Code | Low |
| Theming | Light/dark mode toggle, customizable color schemes via CSS custom properties | Low |

---

_This PRD was collaboratively authored by a human developer and an AI partner — a fitting process for a tool designed to teach exactly this kind of collaboration._
