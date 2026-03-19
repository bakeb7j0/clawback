# Clawback — Annotation System PRD

**Version:** 1.1
**Date:** 2026-03-19
**Status:** Draft
**Authors:** bakerb, Claude (AI Partner)
**Depends On:** [PRD.md](PRD.md) (v1.0 MVP)

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

Clawback v1.0 delivers a functional session replay tool — students can watch AI-assisted development sessions unfold as timed chat-bubble playback. However, raw session replays are like watching a movie without chapter markers, director's commentary, or supplementary materials. The student sees *what* happened but receives no guidance on *what to pay attention to* or *why it matters*.

Instructors who curate sessions for their teams currently have no way to add editorial voice to the playback experience. They cannot tag phases of work, inject teaching commentary at critical moments, or attach the documents produced during the session. The session file is a fixed artifact — the instructor can only choose which sessions to include, not how to present them.

### 1.2 Problem Statement

Session replays lack structure, editorial commentary, and produced artifacts. Without these, students must independently identify which parts of a session are worth studying, recognize teachable moments as they fly past, and mentally reconstruct the documents that were being discussed. This places a high cognitive burden on the student and limits the effectiveness of Clawback as a teaching tool.

### 1.3 Proposed Solution

The **Annotation System** adds three layers of instructor-authored content on top of existing session replays:

1. **Section Tags** — Named, color-coded ranges of beats that give the session navigable structure (e.g., "Requirements Discovery", "Architecture Design", "Debugging").

2. **Callout Annotations** — Inline instructor notes that appear at specific points during playback, visually distinct from the conversation, providing teaching context at the moment it's most relevant.

3. **Embedded Artifacts** — The actual documents produced during the session (PRDs, code files, configuration) attached at the conversation point where they're discussed, viewable in an overlay panel.

These annotations are stored in a **sidecar JSON file** alongside the session JSONL, keeping the original session data untouched. A built-in **Annotation Editor** allows instructors to create and manage annotations directly within the playback interface.

### 1.4 Target Users

| Persona | v1.0 Role | v1.1 Addition |
|---------|-----------|---------------|
| **Student** | Watches curated sessions | Navigates via section tags, reads instructor callouts, views produced artifacts |
| **Instructor** | Deploys Clawback with curated sessions | Creates annotations via the built-in editor, uploads new sessions to the server |
| **Practitioner** | Uploads personal sessions for self-review | Unchanged — annotations are curated-session-only in v1.1 |

---

## 2. Constraints

### 2.1 Technical Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| AC-01 | Annotations are stored as sidecar JSON files, never modifying the original session JSONL | Separation of concerns — the same session can have different annotations for different audiences; session data integrity is preserved |
| AC-02 | Annotation data is bundled into the existing session API response, not served via separate endpoints | Simplicity — one fetch per session, no coordination of multiple async requests |
| AC-03 | No build toolchain additions — the frontend remains vanilla JS with CDN dependencies | Consistency with v1.0 constraint C-03 |
| AC-04 | Annotations are supported for curated (server-hosted) sessions only in v1.1 | Scope — user-uploaded sessions are ephemeral and client-side only; annotation persistence requires server storage |
| AC-05 | Artifact content (markdown, code) is inlined in the annotation JSON file, not stored as separate files | Simplicity for v1.1 — avoids file management complexity; sufficient for text-based content types |
| AC-06 | The Annotation Editor requires playback to be paused before annotation actions can be taken | UX safety — editing while beats are actively rendering would be chaotic |

### 2.2 Product Constraints

| ID | Constraint | Rationale |
|----|-----------|-----------|
| AC-07 | Only two callout styles are supported in v1.1: Note and Warning | Start simple, expand based on instructor feedback |
| AC-08 | Only two artifact content types are supported in v1.1: markdown and code | Text-based types can be inlined in the annotation JSON; binary types (image, PDF) require file storage infrastructure deferred to a future version |
| AC-09 | Session metadata (title, description, tags) cannot be edited after upload in v1.1 | Scope reduction — editing metadata introduces manifest rewriting complexity |
| AC-10 | Curated sessions cannot be deleted from the UI in v1.1 | Safety — deletion is destructive and irreversible; manual server-side deletion remains available |
| AC-11 | Section tag colors are chosen from a preset palette, not a free-form color picker | Ensures visual consistency and accessibility across all sessions |

---

## 3. Requirements (EARS Format)

### 3.1 Annotation Data

| ID | Type | Requirement |
|----|------|-------------|
| AR-01 | Ubiquitous | The system shall store annotations in a sidecar JSON file named `<session-id>-annotations.json` alongside the session JSONL file. |
| AR-02 | Ubiquitous | The annotation file shall contain three annotation arrays: `sections`, `callouts`, and `artifacts`, all within a single JSON document. |
| AR-03 | Event-driven | When a curated session is loaded, the system shall check for a corresponding annotation file by convention (`<session-id>-annotations.json`) and include its contents in the API response if found. |
| AR-04 | Ubiquitous | The annotation file shall reference beats by their stable sequential ID (0-indexed integer). |

### 3.2 Section Tags

| ID | Type | Requirement |
|----|------|-------------|
| AR-10 | Ubiquitous | The system shall support section tags that define named, color-coded ranges of beats with a `start_beat`, `end_beat`, `label`, and `color` field. |
| AR-11 | Ubiquitous | Section tag colors shall be selected from a preset palette of 8-10 accessible colors. |
| AR-12 | Optional | Where a session has section tags, the system shall display a navigable sidebar blade listing all sections with their labels and colors. |
| AR-13 | Optional | Where section tags exist, the sidebar blade shall default to visible, with a toolbar toggle to show/hide it. |
| AR-14 | Optional | Where section tags exist, the progress bar shall display color-coded segments corresponding to each section's beat range. |
| AR-15 | Event-driven | When the user clicks a section in the sidebar, the system shall fast-forward through all beats up to the first beat of that section, then pause playback. |
| AR-16 | Ubiquitous | Section tags shall allow gaps between sections (beats not belonging to any section) and overlapping ranges. |

### 3.3 Callout Annotations

| ID | Type | Requirement |
|----|------|-------------|
| AR-20 | Ubiquitous | The system shall support callout annotations that appear inline in the chat stream after a specified beat, with an `after_beat`, `style`, and `content` field. |
| AR-21 | Ubiquitous | The system shall support two callout styles: "note" and "warning", each with distinct visual treatment. |
| AR-22 | Ubiquitous | Callout cards shall render centered in the chat stream (not left or right aligned) with a visually distinct color to differentiate them from conversation beats. |
| AR-23 | Ubiquitous | Callouts shall be treated as beats for playback timing — each callout has a reading-time duration calculated from its content word count. |
| AR-24 | Event-driven | When playback reaches a beat that has one or more callouts attached after it, the system shall render each callout as the next beat(s) before advancing to the next conversation beat. |

### 3.4 Embedded Artifacts

| ID | Type | Requirement |
|----|------|-------------|
| AR-30 | Ubiquitous | The system shall support embedded artifacts with an `after_beat`, `title`, `description`, `content_type`, and `content` field. |
| AR-31 | Ubiquitous | The system shall support two artifact content types in v1.1: `markdown` and `code`. |
| AR-32 | Ubiquitous | Artifacts shall render as a clickable card in the chat stream indicating the artifact title and a prompt to view it (e.g., "Click to view: Product Requirements Document"). |
| AR-33 | Event-driven | When the user clicks an artifact card, the system shall open an overlay side panel displaying the artifact content with appropriate rendering (Markdown formatting or syntax-highlighted code). |
| AR-34 | Event-driven | When an artifact panel is opened, the system shall pause playback. |
| AR-35 | Event-driven | When the user closes the artifact panel, the system shall not auto-resume playback — the user must explicitly click Play. |
| AR-36 | Ubiquitous | Artifact content shall be stored inline in the annotation JSON file (not as separate files). |

### 3.5 Annotation Editor

| ID | Type | Requirement |
|----|------|-------------|
| AR-40 | Ubiquitous | The toolbar shall include an "Edit Annotations" toggle that enables annotation editing mode. The toggle shall default to off. |
| AR-41 | State-driven | While annotation editing mode is enabled, the system shall require playback to be paused before any annotation action can be taken. |
| AR-42 | State-driven | While annotation editing mode is enabled, rendered beats shall display a hover highlight and become clickable. |
| AR-43 | Event-driven | When the user clicks a beat in editing mode, the system shall display a context menu with options: "Start Section", "Add Note", "Add Warning", "Attach Artifact". |
| AR-44 | Event-driven | When the user selects "Start Section" from the context menu, the system shall prompt for a section label and color (from the preset palette), then enter a "select end beat" mode where clicking a second beat completes the section range. |
| AR-45 | Event-driven | When the user selects "Add Note" or "Add Warning", the system shall display an inline text editor below the beat for the user to type callout content. |
| AR-46 | Event-driven | When the user selects "Attach Artifact", the system shall display a form for title, description, content type (markdown or code), and a text area for content input. |
| AR-47 | Event-driven | When the user clicks an existing annotation (callout card, artifact card, or section in the sidebar), the system shall display Edit and Delete options. |
| AR-48 | Event-driven | When any annotation is created, modified, or deleted, the system shall auto-save by sending a PUT request to persist the annotation file on the server. |

### 3.6 Session Upload (Instructor)

| ID | Type | Requirement |
|----|------|-------------|
| AR-50 | Event-driven | When the user uploads a new session via the editor interface, the system shall persist the JSONL file to the curated sessions directory on the server. |
| AR-51 | Event-driven | When uploading a new session, the system shall prompt for title, description, and tags. |
| AR-52 | Event-driven | When a session is uploaded, the system shall auto-generate the session ID and filename from the title (slugified), compute the beat count from parsing, and add the entry to the manifest. |
| AR-53 | Event-driven | When a session is successfully uploaded, the system shall parse it server-side and add it to the in-memory session cache without requiring a restart. |

### 3.7 Annotation API

| ID | Type | Requirement |
|----|------|-------------|
| AR-60 | Ubiquitous | The `GET /api/sessions/<id>` response shall include an `annotations` field containing the parsed annotation data when a sidecar file exists, or `null` when no annotations are present. |
| AR-61 | Event-driven | When a PUT request is received at `/api/sessions/<id>/annotations`, the system shall validate the annotation data and write it to the sidecar file on disk. |
| AR-62 | Event-driven | When a POST request is received at `/api/sessions/upload`, the system shall accept a JSONL file and metadata, persist the session, update the manifest, and parse the session into the cache. |

---

## 4. Concept of Operations

### 4.1 System Context (v1.1)

```
                    ┌─────────────────────┐
                    │    User (Browser)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Clawback Web App   │
                    │  ┌───────────────┐  │
                    │  │   Client-Side  │  │ ◄── Playback + Annotation Editor
                    │  │   (Alpine.js)  │  │
                    │  └───────┬───────┘  │
                    │          │ API       │
                    │  ┌───────▼───────┐  │
                    │  │  Flask Server  │  │ ◄── Sessions + Annotations + Upload
                    │  └───────┬───────┘  │
                    │          │           │
                    │  ┌───────▼───────┐  │
                    │  │  sessions/     │  │ ◄── JSONL + sidecar annotation JSON
                    │  │  curated/      │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
                         Docker Container
```

### 4.2 User Workflows

#### Workflow 1: Student Watches an Annotated Session

1. Student navigates to Clawback and selects a curated session
2. Session loads with section tags visible in the sidebar blade
3. Progress bar displays color-coded segments for each section
4. Student clicks Play — beats render with reading-pace timing
5. At beat 45, a callout card appears centered in the stream: a Note from the instructor explaining a key design decision
6. Student reads the callout, playback continues after the callout's reading duration
7. At beat 87, a Warning callout appears highlighting a context management mistake
8. At beat 120, an artifact card appears: "Click to view: Product Requirements Document"
9. Student clicks the artifact card — playback pauses, overlay panel slides in showing the rendered Markdown PRD
10. Student reads the PRD side-by-side with the conversation, closes the panel
11. Student uses the section sidebar to jump to "Debugging" — playback fast-forwards through intervening beats and pauses at the section start
12. Student clicks Play to continue from the new position

#### Workflow 2: Instructor Annotates a Session

1. Instructor navigates to Clawback, selects a curated session
2. Instructor enables "Edit Annotations" toggle in the toolbar
3. Playback is paused — instructor uses Next/Previous or section jumps to navigate to the desired beat
4. Instructor clicks beat 0 — context menu appears
5. Selects "Start Section" — enters label "Requirements Discovery", picks blue from the color palette
6. UI shows "Click the end beat for this section" indicator
7. Instructor navigates to beat 45, clicks it — section is created, sidebar updates, progress bar shows blue segment
8. Instructor navigates to beat 46, clicks it, selects "Add Note"
9. An inline text editor appears below the beat — instructor types: "Notice how the developer starts by asking Claude to read the existing codebase before proposing changes. This context-first approach prevents hallucinated suggestions."
10. Instructor clicks save — callout card appears in the stream, annotation auto-saves to server
11. Instructor navigates to beat 120, clicks it, selects "Attach Artifact"
12. Form appears — instructor enters title "Product Requirements Document", selects content type "markdown", pastes the PRD content
13. Instructor clicks save — artifact card appears in the stream, annotation auto-saves
14. Instructor disables "Edit Annotations" toggle to preview the student experience
15. Instructor clicks Play to verify the callout timing and artifact placement feel right

#### Workflow 3: Instructor Uploads a New Session

1. Instructor navigates to the session picker
2. Clicks "Add Session" (visible because the editor interface is available)
3. File picker opens — instructor selects a `.jsonl` file
4. Upload form appears: title, description, tags fields
5. Instructor fills in metadata and clicks Upload
6. File is sent to the server, parsed, added to the manifest
7. New session card appears in the session picker
8. Instructor selects the new session and begins annotating (Workflow 2)

### 4.3 Annotation Data Model

#### Unified Annotation File Schema

A single JSON file per session containing all annotation types:

```json
{
  "session_id": "creating-clawback",
  "sections": [
    {
      "id": "sec-1",
      "start_beat": 0,
      "end_beat": 45,
      "label": "Requirements Discovery",
      "color": "blue"
    },
    {
      "id": "sec-2",
      "start_beat": 46,
      "end_beat": 120,
      "label": "Architecture Design",
      "color": "purple"
    }
  ],
  "callouts": [
    {
      "id": "cal-1",
      "after_beat": 45,
      "style": "note",
      "content": "Notice how the developer starts by asking Claude to read the existing codebase before proposing changes. This context-first approach prevents hallucinated suggestions."
    },
    {
      "id": "cal-2",
      "after_beat": 87,
      "style": "warning",
      "content": "Auto-compaction just occurred. The assistant has lost context of the auth middleware decision from beat #34. Watch for a contradictory suggestion next — this is why context management matters."
    }
  ],
  "artifacts": [
    {
      "id": "art-1",
      "after_beat": 120,
      "title": "Product Requirements Document",
      "description": "The PRD produced during this design session",
      "content_type": "markdown",
      "content": "# Clawback PRD\n\n## 1. Problem Domain\n\n..."
    },
    {
      "id": "art-2",
      "after_beat": 480,
      "title": "Session Parser Module",
      "description": "The Python parser that transforms JSONL into beats",
      "content_type": "code",
      "content": "\"\"\"Session parser module.\"\"\"\n\nimport json\n\ndef parse_session(jsonl_text):\n    ..."
    }
  ]
}
```

#### Field Definitions

**Section Tags:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique identifier (auto-generated, e.g., `sec-1`) |
| `start_beat` | Integer | First beat in the section range (inclusive, 0-indexed) |
| `end_beat` | Integer | Last beat in the section range (inclusive) |
| `label` | String | Display name for the section (e.g., "Requirements Discovery") |
| `color` | String | Color key from the preset palette (e.g., "blue", "purple", "green") |

**Callout Annotations:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique identifier (auto-generated, e.g., `cal-1`) |
| `after_beat` | Integer | The beat after which this callout appears (0-indexed) |
| `style` | String | Visual style: `"note"` or `"warning"` |
| `content` | String | The instructor's commentary text (supports Markdown) |

**Embedded Artifacts:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique identifier (auto-generated, e.g., `art-1`) |
| `after_beat` | Integer | The beat after which this artifact card appears (0-indexed) |
| `title` | String | Display title for the artifact |
| `description` | String | Brief description shown on the artifact card |
| `content_type` | String | Content type: `"markdown"` or `"code"` |
| `content` | String | The full artifact content, inlined |

### 4.4 Section Tag Color Palette

| Key | Hex | Name | Use Case |
|-----|-----|------|----------|
| `blue` | `#4A90D9` | Steel Blue | Requirements, planning |
| `purple` | `#7B61FF` | Vivid Purple | Architecture, design |
| `green` | `#2ECC71` | Emerald | Implementation, coding |
| `orange` | `#E67E22` | Carrot | Debugging, troubleshooting |
| `red` | `#E74C3C` | Alizarin | Errors, failures, incidents |
| `teal` | `#1ABC9C` | Turquoise | Testing, validation |
| `pink` | `#E84393` | Fuchsia | Refactoring, cleanup |
| `amber` | `#F39C12` | Sunflower | Configuration, deployment |
| `indigo` | `#5C6BC0` | Indigo | Documentation, review |
| `slate` | `#95A5A6` | Concrete | Miscellaneous, general |

All palette colors meet WCAG AA contrast requirements against both the dark background and white text used in the sidebar blade.

### 4.5 Annotation Rendering in the Playback Stream

Annotations are interleaved with conversation beats during playback. When the playback engine advances past a beat that has annotations attached (`after_beat`), the annotations render as pseudo-beats before the next conversation beat.

#### Rendering Order

```
Beat N (conversation)
  ↓
Callout(s) with after_beat == N (rendered as centered cards)
  ↓
Artifact(s) with after_beat == N (rendered as clickable cards)
  ↓
Beat N+1 (conversation)
```

If multiple callouts or artifacts share the same `after_beat`, they render in the order they appear in the annotation arrays.

#### Visual Treatment

**Callout — Note:**
```
                    ┌─────────────────────────────────────┐
                    │  📝 Instructor Note                 │
                    │                                     │
                    │  Notice how the developer starts    │
                    │  by asking Claude to read the       │
                    │  existing codebase before proposing │
                    │  changes. This context-first        │
                    │  approach prevents hallucinated     │
                    │  suggestions.                       │
                    └─────────────────────────────────────┘
```

**Callout — Warning:**
```
                    ┌─────────────────────────────────────┐
                    │  ⚠️  Warning                        │
                    │                                     │
                    │  Auto-compaction just occurred. The  │
                    │  assistant has lost context of the   │
                    │  auth middleware decision. Watch for │
                    │  a contradictory suggestion next.    │
                    └─────────────────────────────────────┘
```

**Artifact Card (in stream):**
```
                    ┌─────────────────────────────────────┐
                    │  📄 Product Requirements Document   │
                    │  The PRD produced during this       │
                    │  design session                     │
                    │                                     │
                    │  [ Click to view ]                  │
                    └─────────────────────────────────────┘
```

**Artifact Overlay Panel (when clicked):**
```
┌──────────────────────────────┬───────────────────────────────┐
│                              │  📄 Product Requirements Doc  │
│  Chat stream continues       │  ─────────────────────────── │
│  visible underneath          │                               │
│  (slightly dimmed)           │  # Clawback PRD               │
│                              │                               │
│                              │  ## 1. Problem Domain          │
│                              │                               │
│                              │  Generative AI is rapidly...  │
│                              │                               │
│                              │              [ ✕ Close ]      │
└──────────────────────────────┴───────────────────────────────┘
```

### 4.6 Section Tag Sidebar Blade

The sidebar blade is a vertical panel on the left side of the playback view. It lists all section tags as colored blocks, vertically stacked, with the currently active section highlighted.

```
┌─────────────────┬────────────────────────────────────────────┐
│  SECTIONS       │                                            │
│  ─────────────  │  Chat stream                               │
│                 │                                            │
│  ██ Require...  │  [bubble] [bubble] [bubble]                │
│  ██ Architect.. │                                            │
│  ██ Implement.. │                                            │
│  ██ Debugging   │                                            │
│  ██ Testing     │                                            │
│                 │                                            │
│                 │                                            │
│                 ├────────────────────────────────────────────┤
│                 │  ▶ Play  ⏭  │ 1x │ ██████░░░░ Beat 45/156 │
└─────────────────┴────────────────────────────────────────────┘
```

**Progress bar with section colors:**
```
┌──────────────────────────────────────────────────────────┐
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Beat 45/156  │
│  [blue  ][purple       ][green    ][orange ][teal  ]     │
└──────────────────────────────────────────────────────────┘
```

### 4.7 Annotation Editor Context Menu

When editing mode is active and the user clicks a beat:

```
                    ┌────────────────────────┐
                    │  ▶ Start Section       │
                    │  📝 Add Note           │
                    │  ⚠️  Add Warning       │
                    │  📄 Attach Artifact    │
                    └────────────────────────┘
```

When in "select end beat" mode (after starting a section):

```
         ┌─────────────────────────────────────────────┐
         │  Click a beat to end section "Debugging"    │
         │  [ Cancel ]                                 │
         └─────────────────────────────────────────────┘
```

When the user clicks an existing annotation:

```
                    ┌────────────────────────┐
                    │  ✏️  Edit              │
                    │  🗑️ Delete             │
                    └────────────────────────┘
```

### 4.8 Toolbar Layout (v1.1)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  ⏮ ◀◀ [▶ Play] ▶▶ ⏭  │  0.5x [1x] 1.5x 2x  │  ⚙ IW: [Collapsed ▾]  │  📑 Sections [👁]  │  ✏️ Edit [Off]  │  Beat 24/156  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

New toolbar elements (right side):
- **Sections toggle** (`📑`): Show/hide the section sidebar blade. Defaults to visible when sections exist.
- **Edit toggle** (`✏️`): Enable/disable annotation editing mode. Defaults to off.

---

## 5. Detailed Design

### 5.1 Architecture (v1.1 additions)

```
clawback/
├── app/
│   ├── routes/
│   │   ├── api.py                    # Extended: annotation bundling, PUT annotations, POST upload
│   │   └── ...
│   ├── services/
│   │   ├── session_cache.py          # Extended: annotation loading, cache invalidation
│   │   ├── annotation_store.py       # NEW: read/write/validate annotation sidecar files
│   │   └── ...
│   └── static/
│       ├── css/
│       │   └── style.css             # Extended: callout, artifact, sidebar, editor styles
│       └── js/
│           ├── app.js                # Extended: annotation state, editor toggle, sidebar
│           ├── playback.js           # Extended: annotation interleaving, section navigation
│           ├── renderer.js           # Extended: callout cards, artifact cards, editor overlays
│           ├── annotations.js        # NEW: annotation data management, editor logic
│           └── ...
├── sessions/
│   └── curated/
│       ├── manifest.json
│       ├── creating-clawback.jsonl
│       ├── creating-clawback-annotations.json    # NEW: sidecar file
│       └── ...
└── tests/
    ├── unit/
    │   ├── test_annotation_store.py  # NEW: annotation read/write/validation tests
    │   ├── test_api.py               # Extended: annotation API tests
    │   └── ...
    └── integration/
        ├── test_annotations.py       # NEW: annotation playback integration tests
        ├── test_editor.py            # NEW: annotation editor integration tests
        └── ...
```

### 5.2 Annotation Store (`annotation_store.py`)

The annotation store handles reading, writing, and validating annotation sidecar files.

#### Responsibilities

1. **Read** — Load an annotation file from disk given a session ID and sessions directory
2. **Write** — Persist annotation data to disk, validating before write
3. **Validate** — Ensure annotation data conforms to the schema (valid beat references, valid colors, required fields)

#### Schema Validation Rules

- `session_id` must match the session being annotated
- `sections[].start_beat` and `end_beat` must be non-negative integers
- `sections[].start_beat` must be <= `end_beat`
- `sections[].color` must be a key from the preset palette
- `sections[].label` must be a non-empty string
- `callouts[].after_beat` must be a non-negative integer
- `callouts[].style` must be `"note"` or `"warning"`
- `callouts[].content` must be a non-empty string
- `artifacts[].after_beat` must be a non-negative integer
- `artifacts[].content_type` must be `"markdown"` or `"code"`
- `artifacts[].title` must be a non-empty string
- `artifacts[].content` must be a non-empty string
- All annotation `id` fields must be unique within their type

#### API

```python
class AnnotationStore:
    """Reads and writes annotation sidecar files."""

    def __init__(self, sessions_dir: Path):
        self.sessions_dir = sessions_dir

    def load(self, session_id: str) -> dict | None:
        """Load annotations for a session, or None if no sidecar file exists."""

    def save(self, session_id: str, data: dict) -> None:
        """Validate and write annotation data to the sidecar file."""

    def validate(self, data: dict) -> list[str]:
        """Return a list of validation errors (empty if valid)."""
```

### 5.3 Session Cache Extensions

The `SessionCache` is extended to load annotations alongside session data at startup and support cache invalidation for runtime additions.

#### Changes to `load()`

After parsing each session's beats, check for a corresponding `<session-id>-annotations.json` file. If found, load and validate it, storing the result alongside the parsed beats.

```python
self._parsed[session_id] = {
    "title": entry.get("title", session_id),
    "beats": result["beats"],
    "errors": result["errors"],
    "annotations": annotations_or_none,   # NEW
}
```

#### New Methods

```python
def update_annotations(self, session_id: str, annotations: dict) -> None:
    """Update cached annotations for a session (called after save)."""

def add_session(self, session_id: str, entry: dict, beats: list, annotations: dict | None) -> None:
    """Add a newly uploaded session to the cache without restart."""
```

### 5.4 API Extensions

#### Modified Endpoint

**`GET /api/sessions/<id>`** — Response now includes annotations:

```json
{
  "title": "Creating Clawback",
  "beats": [...],
  "errors": 0,
  "annotations": {
    "session_id": "creating-clawback",
    "sections": [...],
    "callouts": [...],
    "artifacts": [...]
  }
}
```

When no annotation file exists, `annotations` is `null`.

#### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/api/sessions/<id>/annotations` | Validate and save annotations for a curated session |
| `POST` | `/api/sessions/upload` | Upload a new session JSONL with metadata |

**`PUT /api/sessions/<id>/annotations`**

Request body: the full annotation JSON object.

Response:
- `200 {"status": "ok"}` — Annotations saved successfully
- `400 {"status": "error", "errors": [...]}` — Validation failures
- `404 {"status": "error", "message": "Session not found"}` — Unknown session ID

**`POST /api/sessions/upload`**

Request: `multipart/form-data` with:
- `file` — The `.jsonl` file
- `title` — Session title (string)
- `description` — Session description (string)
- `tags` — Comma-separated tags (string)

Response:
- `201 {"status": "ok", "session": {manifest_entry}}` — Session created
- `400 {"status": "error", "message": "..."}` — Invalid file or missing fields

Server-side actions on success:
1. Generate `id` and `file` from slugified title
2. Write the JSONL file to `sessions/curated/`
3. Parse the session to compute `beat_count`
4. Append the new entry to `manifest.json`
5. Add the parsed session to the in-memory `SessionCache`

### 5.5 Client-Side Annotation Module (`annotations.js`)

The annotation module manages annotation data on the client and provides the editor UI logic.

#### Responsibilities

1. **Data Management** — Store annotation data received from the API, track unsaved state
2. **Playback Integration** — Provide a lookup function the playback engine uses to check for annotations after each beat
3. **Editor Logic** — Handle context menu display, section creation flow, callout/artifact forms
4. **Persistence** — Auto-save to server via PUT after every annotation change

#### Key Functions

```javascript
const ClawbackAnnotations = {

  // Initialize with annotation data from API response
  init(annotations, sessionId) {},

  // Returns array of callouts/artifacts that should render after this beat
  getAnnotationsAfterBeat(beatId) {},

  // Returns the section that contains this beat (or null)
  getSectionForBeat(beatId) {},

  // Returns all sections (for sidebar rendering)
  getSections() {},

  // Editor: create/update/delete operations
  createSection(startBeat, endBeat, label, color) {},
  createCallout(afterBeat, style, content) {},
  createArtifact(afterBeat, title, description, contentType, content) {},
  updateAnnotation(id, changes) {},
  deleteAnnotation(id) {},

  // Auto-save to server
  _save() {},
};
```

### 5.6 Playback Engine Extensions

The playback engine is extended to interleave annotations with conversation beats.

#### Annotation Interleaving

The engine maintains a virtual beat sequence that includes both conversation beats and annotation pseudo-beats. When advancing past beat N:

1. Render beat N (conversation beat)
2. Query `ClawbackAnnotations.getAnnotationsAfterBeat(N)`
3. If callouts exist: render each as a centered card with its own reading-time duration
4. If artifacts exist: render each as a clickable card (duration = reading time for the card text, not the artifact content)
5. Advance to beat N+1

#### Section Navigation

New method:

```javascript
jumpToSection(sectionId) {
  // 1. Find the section's start_beat
  // 2. Fast-forward: render all beats from currentIndex to start_beat
  //    (including any annotations in between)
  // 3. Pause playback
  // 4. Scroll to the first beat of the section
}
```

This renders all skipped beats so the student can scroll back through them. The fast-forward is instant (no timing delays).

#### Progress Tracking

The progress indicator and progress bar must account for annotation pseudo-beats in the total count. The beat counter shows "Beat N / Total" where Total includes conversation beats plus annotations.

Alternatively, the progress bar can track conversation beats only (showing session position) while annotations are rendered as interstitial content that doesn't advance the progress indicator. This is simpler and avoids the total changing when annotations are added.

**Decision: Progress bar tracks conversation beats only.** Annotations are interstitial — they don't change the session position. The counter shows "Beat 45 / 156" regardless of how many annotations exist.

### 5.7 Renderer Extensions

The renderer is extended with new card types:

#### Callout Card Rendering

```javascript
function renderCallout(callout, container) {
  // Create centered card with:
  // - Icon: 📝 (note) or ⚠️ (warning)
  // - Style class: callout--note or callout--warning
  // - Content: Markdown-rendered via marked.js + DOMPurify
  // - Centered alignment (not left/right like conversation bubbles)
}
```

#### Artifact Card Rendering

```javascript
function renderArtifactCard(artifact, container) {
  // Create centered card with:
  // - Icon: 📄
  // - Title and description
  // - "Click to view" button
  // - Click handler: opens artifact panel, pauses playback
}
```

#### Artifact Panel Rendering

```javascript
function openArtifactPanel(artifact) {
  // Create overlay panel (right side, ~50% width):
  // - Header: title + close button
  // - Body: rendered content
  //   - markdown: marked.js + DOMPurify
  //   - code: highlight.js with language detection
  // - Close button: removes panel, does NOT auto-resume playback
  // - Background: semi-transparent overlay dimming the chat stream
}
```

### 5.8 Section Sidebar Rendering

The sidebar blade is a fixed-position panel on the left side of the playback view.

```javascript
function renderSectionSidebar(sections, currentBeatId) {
  // Render vertical list of sections:
  // - Each section: colored block with label text
  // - Active section (containing currentBeatId): highlighted border/glow
  // - Click handler: calls playbackEngine.jumpToSection(sectionId)
  // - Responsive: collapses to icons on narrow viewports (future)
}
```

The sidebar width is fixed (e.g., 200px). The chat stream container adjusts its left margin when the sidebar is visible.

### 5.9 Progress Bar with Section Colors

The progress bar is segmented when section tags exist. Each segment corresponds to a section's beat range, colored with the section's palette color. Beats not covered by any section render as the default progress bar color (gray).

```
Total beats: 156
Section "Requirements" (blue): beats 0-45 → segment width = 45/156 = 29%
Section "Architecture" (purple): beats 46-120 → segment width = 75/156 = 48%
Section "Implementation" (green): beats 121-156 → segment width = 36/156 = 23%
```

The progress indicator (filled portion) overlays the segments to show current position.

---

## 6. Definition of Done

### 6.1 v1.1 Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| AD-01 | A curated session with a sidecar annotation file displays section tags in a sidebar blade | Manual: load annotated session, verify sidebar appears with labeled sections |
| AD-02 | Clicking a section in the sidebar fast-forwards to that section's start beat and pauses | Manual: click section, verify beats render up to start, playback pauses |
| AD-03 | The progress bar displays color-coded segments matching section tag ranges | Manual: verify colored segments correspond to section definitions |
| AD-04 | Callout annotations render as centered, visually distinct cards in the chat stream | Manual: verify callout cards appear after the specified beat with correct styling |
| AD-05 | Callouts are treated as beats with reading-time duration during playback | Manual: verify playback pauses on callout for appropriate duration |
| AD-06 | Note and Warning callout styles are visually distinct | Manual: compare Note and Warning cards side by side |
| AD-07 | Artifact cards render in the chat stream with title and "Click to view" prompt | Manual: verify artifact card appears after the specified beat |
| AD-08 | Clicking an artifact card opens an overlay panel with rendered content and pauses playback | Manual: click artifact, verify panel opens, content renders, playback pauses |
| AD-09 | Closing the artifact panel does not auto-resume playback | Manual: close panel, verify playback remains paused |
| AD-10 | Markdown artifacts render with formatting; code artifacts render with syntax highlighting | Manual: verify rendering for both content types |
| AD-11 | The "Edit Annotations" toggle appears in the toolbar and defaults to off | Manual: verify toggle exists and is off on load |
| AD-12 | With editing enabled and playback paused, clicking a beat shows the context menu | Manual: enable editing, pause, click beat, verify menu appears |
| AD-13 | Instructor can create a section tag via two-click flow (start beat → end beat) | Manual: create section, verify it appears in sidebar and progress bar |
| AD-14 | Instructor can create Note and Warning callouts via the context menu | Manual: create each type, verify they render correctly in the stream |
| AD-15 | Instructor can attach a markdown or code artifact via the context menu | Manual: attach artifact, verify card renders and panel shows content |
| AD-16 | Instructor can edit and delete existing annotations | Manual: click annotation, edit content, verify update; delete, verify removal |
| AD-17 | Annotation changes auto-save to the server | Verify: create annotation, check that sidecar file updates on disk |
| AD-18 | An instructor can upload a new session with title, description, and tags | Manual: upload JSONL, verify session appears in picker without restart |
| AD-19 | Sessions without annotation files load and play back normally (no regressions) | Manual: load unannotated session, verify v1.0 behavior is unchanged |
| AD-20 | The annotation API validates data and returns errors for invalid input | Test: send malformed annotation data, verify 400 response with error details |
| AD-21 | All Python unit tests pass (`make test`) | CI: `pytest tests/unit/` exits 0 |
| AD-22 | All Playwright integration tests pass (`make test-integration`) | CI: `pytest tests/integration/` exits 0 headless |
| AD-23 | Code passes linting (`make lint`) | CI: `ruff check` exits 0 |

### 6.2 Quality Gates

- All v1.0 quality gates continue to apply
- Annotation store has unit tests covering read, write, validate, and edge cases
- API tests cover all new endpoints (PUT annotations, POST upload) including error cases
- Integration tests cover annotation playback (section navigation, callout rendering, artifact panel)
- Integration tests cover the annotation editor (create, edit, delete for each annotation type)
- No annotation data is leaked to user-uploaded session flows

---

## 7. Phased Implementation Plan

### Phase 1: Data Layer and API

**Goal:** Annotation storage, validation, API endpoints, and session upload — the foundation everything else builds on.

#### Issue 1.1: Annotation Store Service

**Title:** Implement annotation sidecar file read/write/validate service

**Description:** Build the server-side service that manages annotation sidecar JSON files. This is the data layer for all annotation features — it reads annotation files from disk, validates their structure, and writes them back.

**Acceptance Criteria:**
- [ ] `annotation_store.py` implements `AnnotationStore` class with `load()`, `save()`, and `validate()` methods
- [ ] `load()` reads `<session-id>-annotations.json` from the sessions directory, returns parsed JSON or `None`
- [ ] `save()` validates data before writing, raises on validation failure
- [ ] `validate()` checks all schema rules: required fields, valid types, valid colors, valid beat references, unique IDs
- [ ] Path traversal protection: annotation file paths cannot escape the sessions directory
- [ ] Unit tests cover: load existing file, load missing file, save valid data, save invalid data (each validation rule), path traversal rejection

**Implementation Steps:**
1. Create `app/services/annotation_store.py`
2. Define `COLOR_PALETTE` constant with valid color keys
3. Define `CALLOUT_STYLES` constant (`["note", "warning"]`)
4. Define `CONTENT_TYPES` constant (`["markdown", "code"]`)
5. Implement `validate()` — iterate all sections, callouts, artifacts checking each field
6. Implement `load()` — build path from session_id, read and parse JSON
7. Implement `save()` — validate, then write JSON to disk with `json.dump(indent=2)`
8. Add path traversal check in both `load()` and `save()`
9. Create `tests/unit/test_annotation_store.py` with comprehensive tests
10. Run `make test` to verify

---

#### Issue 1.2: Session Cache Annotation Support

**Title:** Extend SessionCache to load and cache annotations alongside sessions

**Description:** Modify the session cache to check for annotation sidecar files during startup loading and include annotation data in cached session responses. Add methods for runtime cache updates when annotations are saved or sessions are uploaded.

**Acceptance Criteria:**
- [ ] `SessionCache.load()` checks for `<session-id>-annotations.json` for each session
- [ ] Cached session data includes `annotations` key (dict or None)
- [ ] `get_session()` return value includes `annotations` field
- [ ] `update_annotations()` method updates cached annotations for a session without full reload
- [ ] `add_session()` method adds a new session entry to both `_manifest` and `_parsed` at runtime
- [ ] Unit tests verify annotation loading, missing annotations, cache update, and session addition

**Implementation Steps:**
1. Import `AnnotationStore` in `session_cache.py`
2. Instantiate `AnnotationStore` in `load()` using the sessions directory
3. After parsing each session, call `annotation_store.load(session_id)`
4. Store result in `_parsed[session_id]["annotations"]`
5. Implement `update_annotations(session_id, data)` — update `_parsed[session_id]["annotations"]`
6. Implement `add_session(session_id, entry, beats, annotations)` — append to `_manifest`, add to `_parsed`
7. Update existing tests to verify `annotations` key in responses
8. Add new tests for `update_annotations` and `add_session`
9. Run `make test` to verify

---

#### Issue 1.3: Annotation API Endpoints

**Title:** Add PUT annotations and POST session upload API endpoints

**Description:** Extend the API with endpoints for saving annotations and uploading new sessions. The GET session endpoint is also modified to include annotation data in its response.

**Acceptance Criteria:**
- [ ] `GET /api/sessions/<id>` response includes `"annotations": {...}` or `"annotations": null`
- [ ] `PUT /api/sessions/<id>/annotations` validates and persists annotation data, returns 200 on success
- [ ] `PUT /api/sessions/<id>/annotations` returns 400 with error details on validation failure
- [ ] `PUT /api/sessions/<id>/annotations` returns 404 for unknown session IDs
- [ ] `POST /api/sessions/upload` accepts multipart form data with JSONL file and metadata
- [ ] `POST /api/sessions/upload` generates session ID from title, parses the file, updates manifest, and adds to cache
- [ ] `POST /api/sessions/upload` returns 201 with the new manifest entry on success
- [ ] `POST /api/sessions/upload` returns 400 for missing fields or invalid files
- [ ] Unit tests cover all success and error paths for both endpoints

**Implementation Steps:**
1. Modify `GET /api/sessions/<id>` to include `data.get("annotations")` in response
2. Add `PUT /api/sessions/<id>/annotations` route
3. Instantiate `AnnotationStore` using the app's sessions directory
4. Validate input, save to disk, update cache — return appropriate status codes
5. Add `POST /api/sessions/upload` route
6. Accept multipart form data: extract file, title, description, tags
7. Slugify title to generate ID and filename
8. Write JSONL file to sessions directory
9. Parse the session server-side to compute beat count
10. Append entry to `manifest.json`
11. Add to `SessionCache` via `add_session()`
12. Create/extend `tests/unit/test_api.py` with annotation and upload tests
13. Run `make test` to verify

---

### Phase 2: Playback Integration

**Goal:** Render annotations during playback — section sidebar, callout cards, artifact cards and panel.

#### Issue 2.1: Client-Side Annotation Module

**Title:** Implement the client-side annotation data manager

**Description:** Build the JavaScript module that receives annotation data from the API, provides lookup functions for the playback engine, and manages annotation state for the editor.

**Acceptance Criteria:**
- [ ] `annotations.js` exports `ClawbackAnnotations` object
- [ ] `init(annotations, sessionId)` initializes state from API response
- [ ] `getAnnotationsAfterBeat(beatId)` returns callouts and artifacts that should render after the given beat
- [ ] `getSectionForBeat(beatId)` returns the section containing the beat, or null
- [ ] `getSections()` returns all sections for sidebar rendering
- [ ] Handles null annotations gracefully (session has no annotation file)
- [ ] JavaScript unit tests verify lookup functions with various annotation configurations

**Implementation Steps:**
1. Create `app/static/js/annotations.js`
2. Implement `init()` — store sections, callouts, artifacts arrays; build lookup indices
3. Build `_afterBeatIndex` — a Map keyed by beat ID, value is array of callouts/artifacts sorted by array position
4. Implement `getAnnotationsAfterBeat()` — return from index or empty array
5. Implement `getSectionForBeat()` — linear scan or precomputed range lookup
6. Implement `getSections()` — return sections array
7. Add `<script>` tag to `index.html`
8. Create `tests/unit/js/test_annotations.js` with unit tests
9. Run JS tests to verify

---

#### Issue 2.2: Section Tag Sidebar and Progress Bar

**Title:** Implement the section tag sidebar blade and segmented progress bar

**Description:** Build the sidebar blade UI component that displays section tags as a navigable list, and extend the progress bar to show color-coded segments corresponding to section ranges.

**Acceptance Criteria:**
- [ ] Sidebar blade renders on the left side of the playback view when sections exist
- [ ] Each section displays as a colored block with the section label
- [ ] The currently active section (containing the current beat) is visually highlighted
- [ ] Clicking a section calls the playback engine's section navigation
- [ ] Toolbar includes a Sections toggle button that shows/hides the sidebar
- [ ] Sidebar defaults to visible when sections exist, hidden when they don't
- [ ] Chat stream container adjusts its left margin when sidebar is visible
- [ ] Progress bar displays colored segments proportional to each section's beat range
- [ ] Beats outside any section range show as the default gray progress bar color
- [ ] Sidebar and progress bar update as playback advances

**Implementation Steps:**
1. Add sidebar HTML structure to `index.html` with Alpine.js bindings
2. CSS: fixed position left panel, 200px width, full height minus toolbar
3. CSS: section items with colored left border or background, hover state, active state
4. CSS: chat container `margin-left` transition when sidebar toggles
5. Add Sections toggle button to toolbar
6. Wire Alpine.js state: `showSections` boolean, bind to sidebar visibility
7. Implement sidebar rendering: iterate `ClawbackAnnotations.getSections()`
8. Implement active section tracking: update on each beat render
9. Implement section click handler: call `playbackEngine.jumpToSection()`
10. Extend progress bar: render colored segments behind the progress fill
11. Calculate segment widths as percentages of total beats
12. Integration test: load annotated session, verify sidebar renders, click section, verify navigation

---

#### Issue 2.3: Callout Annotation Rendering

**Title:** Implement callout card rendering and playback interleaving

**Description:** Extend the renderer to display callout annotations as centered, styled cards in the chat stream. Extend the playback engine to interleave callouts between conversation beats, treating each callout as a pseudo-beat with reading-time duration.

**Acceptance Criteria:**
- [ ] Callout cards render centered in the chat stream (not left or right aligned)
- [ ] Note callouts display with 📝 icon, distinct background color, and "Instructor Note" header
- [ ] Warning callouts display with ⚠️ icon, distinct background color (different from Note), and "Warning" header
- [ ] Callout content supports Markdown rendering (via marked.js + DOMPurify)
- [ ] Callouts are interleaved during playback: after beat N renders, any callouts with `after_beat == N` render before beat N+1
- [ ] Each callout has a reading-time duration calculated from its word count at the session's base WPM rate
- [ ] Playback speed multiplier applies to callout durations
- [ ] Callouts are included when using Next/Previous beat controls
- [ ] Progress bar tracks conversation beats only — callouts do not advance the progress counter
- [ ] Sessions without callouts play back identically to v1.0

**Implementation Steps:**
1. Add CSS classes: `.callout`, `.callout--note`, `.callout--warning`
2. CSS: centered layout, distinct background colors, icon styling, content area
3. Implement `renderCallout(callout, container)` in `renderer.js`
4. Pipe callout content through `marked.parse()` + `DOMPurify.sanitize()`
5. Extend playback engine's beat advancement logic:
   - After rendering beat N, check `ClawbackAnnotations.getAnnotationsAfterBeat(N)`
   - Queue callouts as pseudo-beats with calculated duration
   - Render each before advancing to beat N+1
6. Handle Next/Previous: callout pseudo-beats are navigable
7. Ensure progress counter tracks conversation beats only (not pseudo-beats)
8. Integration test: load session with callouts, verify they appear at correct positions with correct styling

---

#### Issue 2.4: Embedded Artifact Cards and Panel

**Title:** Implement artifact card rendering and overlay panel viewer

**Description:** Extend the renderer to display embedded artifact cards in the chat stream and implement the overlay side panel for viewing artifact content. Artifact cards are clickable; clicking opens the panel and pauses playback.

**Acceptance Criteria:**
- [ ] Artifact cards render centered in the chat stream with 📄 icon, title, description, and "Click to view" prompt
- [ ] Artifact cards are interleaved during playback alongside callouts (after the same beat, callouts render first, then artifacts)
- [ ] Clicking an artifact card opens an overlay panel on the right side (~50% viewport width)
- [ ] The overlay panel dims the chat stream behind it
- [ ] Markdown artifacts render with full Markdown formatting in the panel
- [ ] Code artifacts render with syntax highlighting in the panel
- [ ] Opening the artifact panel pauses playback
- [ ] Closing the artifact panel does NOT auto-resume playback
- [ ] Only one artifact panel can be open at a time
- [ ] Pressing Escape closes the artifact panel
- [ ] Artifact cards have a brief reading-time duration (for the card text, not the artifact content)
- [ ] Sessions without artifacts play back identically to v1.0

**Implementation Steps:**
1. Add CSS classes: `.artifact-card`, `.artifact-panel`, `.artifact-panel__overlay`, `.artifact-panel__content`
2. CSS: overlay panel slides in from right, semi-transparent backdrop, scrollable content area, close button
3. Implement `renderArtifactCard(artifact, container)` in `renderer.js`
4. Implement `openArtifactPanel(artifact)` — create overlay, render content based on `content_type`
5. For markdown: `marked.parse()` + `DOMPurify.sanitize()`
6. For code: wrap in `<pre><code>` + `hljs.highlightAuto()`
7. Add close button and Escape key handler
8. Wire click handler on artifact card to open panel + pause playback
9. Ensure closing panel does not call `play()`
10. Extend playback engine interleaving to include artifacts after callouts
11. Integration test: load session with artifact, click card, verify panel opens, content renders, playback pauses

---

### Phase 3: Annotation Editor

**Goal:** In-place annotation creation, editing, and deletion with auto-save.

#### Issue 3.1: Editor Mode and Context Menu

**Title:** Implement the annotation editor toggle, beat click handling, and context menu

**Description:** Add the "Edit Annotations" toggle to the toolbar and implement the core editor interaction: clicking a beat while editing is enabled (and playback is paused) shows a context menu with annotation creation options.

**Acceptance Criteria:**
- [ ] "Edit Annotations" toggle appears in the toolbar, defaults to off
- [ ] When editing is enabled, a visual indicator shows editing mode is active
- [ ] When editing is enabled and playback is paused, rendered beats display a hover highlight (cursor change, border glow)
- [ ] Clicking a beat shows a context menu anchored to the beat with options: "Start Section", "Add Note", "Add Warning", "Attach Artifact"
- [ ] Clicking outside the context menu dismisses it
- [ ] If playback is not paused when a beat is clicked, the context menu does not appear (or a prompt to pause appears)
- [ ] Clicking an existing annotation (callout card, artifact card) shows an Edit/Delete context menu
- [ ] The context menu is positioned to avoid clipping at viewport edges

**Implementation Steps:**
1. Add "Edit Annotations" toggle to toolbar HTML with Alpine.js binding
2. Add Alpine.js state: `editMode: false`
3. CSS: `.beat--editable` hover state (border highlight, cursor pointer)
4. Conditionally add `.beat--editable` class to rendered beats when `editMode` is true
5. Implement context menu component: positioned absolutely, renders option list
6. Handle beat click: if `editMode && paused`, show context menu at click position
7. Handle annotation click: if `editMode && paused`, show Edit/Delete menu
8. Handle outside click: dismiss context menu
9. Handle playback state check: if not paused, show "Pause playback to edit" toast
10. Integration test: enable editing, click beat, verify menu appears with all options

---

#### Issue 3.2: Section Tag Creation

**Title:** Implement section tag creation via two-click flow

**Description:** Implement the "Start Section" editor action. When selected from the context menu, the instructor enters a label and picks a color, then clicks a second beat to set the section's end point. The section is created and auto-saved.

**Acceptance Criteria:**
- [ ] Selecting "Start Section" from the context menu opens a small form for label and color selection
- [ ] Color selection displays the preset palette as clickable swatches
- [ ] After entering label and color, the UI enters "select end beat" mode with a floating indicator
- [ ] A "Cancel" button exits the "select end beat" mode without creating a section
- [ ] Clicking a second beat completes the section (start_beat = first click's beat ID, end_beat = second click's beat ID)
- [ ] If the second beat is before the first beat, the start/end are swapped automatically
- [ ] The new section immediately appears in the sidebar and progress bar
- [ ] The annotation is auto-saved to the server via PUT
- [ ] A unique ID is generated for the new section

**Implementation Steps:**
1. Implement section creation form: label text input + color palette grid
2. CSS: color swatches (small circles/squares), selected state
3. Implement "select end beat" mode: state variable `pendingSection` with start_beat, label, color
4. Show floating indicator banner: "Click a beat to end section '{label}'"
5. On second beat click: create section object, add to `ClawbackAnnotations`, re-render sidebar and progress bar
6. Auto-swap start/end if end < start
7. Generate unique ID: `sec-{timestamp}`
8. Call `ClawbackAnnotations._save()` to PUT to server
9. Cancel button: clear `pendingSection` state
10. Integration test: create section via two clicks, verify sidebar updates, verify annotation file on server

---

#### Issue 3.3: Callout and Artifact Creation

**Title:** Implement callout and artifact creation via context menu

**Description:** Implement the "Add Note", "Add Warning", and "Attach Artifact" editor actions. Each opens an inline form below the beat; on save, the annotation is created and auto-saved.

**Acceptance Criteria:**
- [ ] "Add Note" opens an inline text editor below the beat with a save/cancel button
- [ ] "Add Warning" opens the same editor but tags the callout as "warning" style
- [ ] Callout text editor supports multi-line input
- [ ] Saving a callout creates the annotation, renders the card in the stream, and auto-saves
- [ ] "Attach Artifact" opens a form with: title, description, content type (dropdown: markdown/code), content text area
- [ ] Saving an artifact creates the annotation, renders the card in the stream, and auto-saves
- [ ] Unique IDs are generated for new callouts (`cal-{timestamp}`) and artifacts (`art-{timestamp}`)
- [ ] Empty content is rejected with a validation message

**Implementation Steps:**
1. Implement inline callout editor: text area + style indicator + save/cancel buttons
2. Position editor below the clicked beat
3. On save: create callout object, add to `ClawbackAnnotations`, render in stream
4. Implement artifact form: title input, description input, content type dropdown, content text area
5. Position form below the clicked beat
6. On save: create artifact object, add to `ClawbackAnnotations`, render card in stream
7. Generate unique IDs with type prefix
8. Validate: reject empty content, empty title (for artifacts)
9. Call `_save()` after each creation
10. Integration test: create callout, verify card appears; create artifact, verify card appears and panel works

---

#### Issue 3.4: Annotation Editing and Deletion

**Title:** Implement editing and deletion of existing annotations

**Description:** When an instructor clicks an existing annotation in editing mode, they can modify or delete it. Editing opens the same form used for creation, pre-populated with current values. Deletion removes the annotation from data and DOM.

**Acceptance Criteria:**
- [ ] Clicking an existing callout card in editing mode shows Edit/Delete options
- [ ] Clicking an existing artifact card in editing mode shows Edit/Delete options
- [ ] Clicking an existing section in the sidebar in editing mode shows Edit/Delete options
- [ ] "Edit" opens the creation form pre-populated with the annotation's current values
- [ ] Saving an edit updates the annotation data, re-renders the affected element, and auto-saves
- [ ] "Delete" removes the annotation from the data, removes the DOM element, and auto-saves
- [ ] Deleting a section removes it from the sidebar and progress bar
- [ ] Deleting a callout or artifact removes the card from the chat stream

**Implementation Steps:**
1. Add click handler for existing annotations when in edit mode
2. Show Edit/Delete context menu on click
3. "Edit" handler: extract current annotation data, open the appropriate form pre-filled
4. On save: update annotation in `ClawbackAnnotations`, re-render the element, call `_save()`
5. "Delete" handler: remove from `ClawbackAnnotations`, remove DOM element, call `_save()`
6. For sections: also update sidebar and progress bar on edit/delete
7. Handle edge case: deleting an annotation while it's the current "pseudo-beat" in playback
8. Integration test: create annotation, edit it, verify update; delete it, verify removal

---

#### Issue 3.5: Session Upload UI

**Title:** Implement the instructor session upload interface

**Description:** Add an "Add Session" option to the session picker that allows instructors to upload a new JSONL file with metadata. The session is persisted to the server and immediately available in the picker.

**Acceptance Criteria:**
- [ ] "Add Session" button/card appears in the session picker
- [ ] Clicking "Add Session" opens a file picker for `.jsonl` files
- [ ] After file selection, a metadata form appears with: title, description, tags (comma-separated) fields
- [ ] Clicking "Upload" sends the file and metadata to `POST /api/sessions/upload`
- [ ] On success, the new session card appears in the session picker without page reload
- [ ] On error, an error message is displayed (e.g., "Title is required", "Invalid JSONL file")
- [ ] Loading state is shown during upload and parsing
- [ ] The uploaded session is immediately selectable and playable

**Implementation Steps:**
1. Add "Add Session" card to the session picker grid
2. Implement file selection handler (reuse existing file picker pattern)
3. After file selection, show metadata form: title, description, tags inputs
4. Implement upload handler: create FormData with file + metadata fields
5. POST to `/api/sessions/upload`
6. On success: add new session to `sessions` array (Alpine.js reactivity updates the picker)
7. On error: display error message in the upload form
8. Add loading spinner during upload
9. Integration test: upload session, verify it appears in picker, select it, verify playback works

---

### Phase 4: Testing and Polish

**Goal:** Comprehensive integration tests, visual polish, and edge case handling.

#### Issue 4.1: Annotation Integration Tests

**Title:** Implement Playwright integration tests for annotation playback and editor

**Description:** Build a comprehensive integration test suite that exercises annotation features end-to-end in a real browser. Tests verify annotation rendering, section navigation, callout playback, artifact panel, and editor interactions.

**Acceptance Criteria:**
- [ ] Test fixture includes a session with a corresponding annotation sidecar file
- [ ] Tests verify section sidebar renders with correct labels and colors
- [ ] Tests verify clicking a section navigates to the correct beat and pauses
- [ ] Tests verify callout cards render at the correct position with correct style (note vs warning)
- [ ] Tests verify artifact cards render and clicking opens the overlay panel
- [ ] Tests verify artifact panel displays rendered content and pauses playback
- [ ] Tests verify closing the artifact panel does not resume playback
- [ ] Tests verify the editor toggle enables/disables beat click handling
- [ ] Tests verify creating a section via two-click flow
- [ ] Tests verify creating a callout via context menu
- [ ] Tests verify creating an artifact via context menu
- [ ] Tests verify editing an existing annotation
- [ ] Tests verify deleting an annotation
- [ ] Tests verify session upload via the UI
- [ ] Tests verify unannotated sessions play back without regressions
- [ ] All tests run headless via `make test-integration`

**Implementation Steps:**
1. Create `tests/integration/fixtures/integration-annotations.json` — annotation file for the existing test fixture session
2. Create `tests/integration/test_annotations.py` — section sidebar, callout rendering, artifact panel tests
3. Create `tests/integration/test_editor.py` — editor toggle, context menu, create/edit/delete tests
4. Create `tests/integration/test_upload.py` — session upload flow test
5. Add regression test: load unannotated session, verify identical v1.0 behavior
6. Run `make test-integration` to verify all pass
7. Fix any timing or selector issues

---

#### Issue 4.2: Visual Polish and Edge Cases

**Title:** Polish annotation UI and handle edge cases

**Description:** Refine the visual design of all annotation components, ensure consistent styling, and handle edge cases that arise during real-world use.

**Acceptance Criteria:**
- [ ] Callout cards have polished styling: shadows, borders, appropriate padding, readable typography
- [ ] Artifact cards match the callout card styling language while being visually distinct
- [ ] Artifact panel has smooth slide-in/slide-out animation
- [ ] Section sidebar has smooth show/hide animation
- [ ] Section sidebar scrolls independently if there are many sections
- [ ] Color palette swatches in the editor are clearly selectable with hover/active states
- [ ] Context menu has consistent styling with hover states
- [ ] Editor forms (callout text area, artifact form) have clear input styling and save/cancel buttons
- [ ] Keyboard shortcuts: Escape closes context menu, artifact panel, and editor forms
- [ ] Edge case: annotation references a beat ID beyond the session's beat count — handled gracefully (skipped)
- [ ] Edge case: empty annotation arrays — handled gracefully (no sidebar, no errors)
- [ ] Edge case: very long callout text — wraps properly, does not break layout
- [ ] Edge case: very large artifact content — panel scrolls, does not consume excessive memory
- [ ] CSS custom properties used for annotation colors to maintain theming compatibility

**Implementation Steps:**
1. Audit and refine all annotation CSS: shadows, transitions, spacing, typography
2. Add slide animations for sidebar and artifact panel
3. Add overflow scroll for sidebar content
4. Add Escape key handlers for all editor UI elements
5. Add beat ID bounds checking in annotation rendering
6. Test with empty annotation arrays (no sections, no callouts, no artifacts)
7. Test with long content and large artifact files
8. Define CSS custom properties for annotation colors
9. Cross-browser check: Chrome, Firefox, Safari (desktop)
10. Run full test suite to verify no regressions

---

_This PRD was collaboratively authored by a human developer and an AI partner — continuing the tradition from v1.0._
