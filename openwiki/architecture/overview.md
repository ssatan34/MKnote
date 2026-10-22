---
type: Architecture
title: MKnote Architecture Overview
description: Tauri 2 + React 19 + Rust architecture for MKnote v4.2.2. Describes process model, Rust backend modules, React frontend structure, data flow, and the Tauri command bridge.
tags: [mknote, architecture, tauri, react, rust]
resource: src-tauri/src/lib.rs
---

# Architecture Overview

MKnote is a **Tauri 2** desktop application with a **React 19 + TypeScript** frontend and a **Rust** backend. Each note is a plain `.md` file on the local filesystem.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (WebView2 on Windows) |
| Frontend framework | React 19, TypeScript, Vite 5 |
| Styling | Native CSS (`tokens.css` design tokens + `App.css` + Tailwind/shadcn base) |
| Backend | Rust (`src-tauri/src/`) with Tauri IPC commands |
| Markdown rendering | `marked` via `markdownRenderCore.ts` (custom renderer with XSS safety, highlight, table wrap); `turndown` for HTML→Markdown; `react-markdown` for read-only |
| Drag & drop | `@atlaskit/pragmatic-drag-and-drop` |
| UI primitives | Radix UI (dialog, popover, dropdown, tabs, tooltip) |
| Remote storage | `reqwest` (blocking) for legacy S3/MinIO, WebDAV, SiYuan, Lsky Pro; `aws_sdk_s3` (async) for S3 automatic sync |
| System integration | Tauri plugins: global-shortcut, autostart, single-instance, notification, dialog, opener |

---

## Process Model

The application is a **single OS process** with multiple WebView2 windows:

```
┌─────────────────────────────────────────────────────────┐
│                   Rust Core Process                      │
│                                                         │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Tauri IPC    │  │ File I/O  │  │ System: Tray,   │   │
│  │ Commands     │  │ (notes,  │  │ Hotkeys, CLI,   │   │
│  │ (lib.rs)     │  │ paths)   │  │ Win32 (win_     │   │
│  └─────────────┘  └──────────┘  │ present)         │   │
│                                  └──────────────────┘   │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Quick Todo   │  │ Quick    │  │ Detach: Popout   │   │
│  │ (Rust model) │  │ Pocket   │  │ + Capsule Mgmt  │   │
│  └─────────────┘  └──────────┘  └──────────────────┘   │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ S3/WebDAV    │  │ SiYuan   │  │ Clip Server     │   │
│  │ Sync         │  │ Upload   │  │ (HTTP, tiny_http)│   │
│  └─────────────┘  └──────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
         ▲                           ▲
         │ Tauri IPC (invoke)        │ Events (listen)
         ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                 WebView2 Windows                         │
│                                                         │
│  ┌────────┐  ┌──────────┐  ┌───────────┐  ┌─────────┐  │
│  │ Main   │  │ Quick    │  │ Quick     │  │ Popout/ │  │
│  │ Window │  │ Todo     │  │ Pocket    │  │ Capsule │  │
│  └────────┘  └──────────┘  └───────────┘  └─────────┘  │
│         ┌──────────┐  ┌──────────────────┐              │
│         │ Reminder │  │ Tab Drag Preview │              │
│         └──────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

Each window loads the same frontend bundle (`dist/`) and determines its role by reading `window.__TAURI__.window.label` (see [`src/main.tsx`](src/main.tsx)).

---

## Rust Backend Modules

| Module | Responsibility | Key File |
|--------|---------------|----------|
| `lib.rs` | App setup, all IPC `#[tauri::command]` functions, config load/save, app state | `src-tauri/src/lib.rs` |
| `system.rs` | Tray icon, global hotkeys, CLI argument parsing, window show/hide, autostart | `src-tauri/src/system.rs` |
| `notes.rs` | Note CRUD, folder CRUD, color tags, note summaries | `src-tauri/src/notes.rs` |
| `paths.rs` | Writable base resolution, NoteZone→Path mapping, config path, legacy migration | `src-tauri/src/paths.rs` |
| `detach.rs` | Popout and Capsule window create/destroy/sync, session persistence | `src-tauri/src/detach.rs` |
| `quick_todo.rs` | Quick Todo data model (items, tags, parent/child, reminders, links) | `src-tauri/src/quick_todo.rs` |
| `quick_todo_window.rs` | Quick Todo window lifecycle (create, blur-close, pin, toggle) | `src-tauri/src/quick_todo_window.rs` |
| `quick_pocket.rs` | Quick Pocket data model (items, tags, privacy) | `src-tauri/src/quick_pocket.rs` |
| `quick_pocket_window.rs` | Quick Pocket window lifecycle | `src-tauri/src/quick_pocket_window.rs` |
| `search.rs` | Full-text search across notes | `src-tauri/src/search.rs` |
| `trash.rs` | Trash operations (list, restore, permanent delete, empty) | `src-tauri/src/trash.rs` |
| `templates.rs` | Built-in note templates | `src-tauri/src/templates.rs` |
| `history.rs` | Recent notes history | `src-tauri/src/history.rs` |
| `stars.rs` | Favorite notes | `src-tauri/src/stars.rs` |
| `capture.rs` | Quick capture (inbox note creation) | `src-tauri/src/capture.rs` |
| `custom_tags.rs` | User-defined custom tags | `src-tauri/src/custom_tags.rs` |
| `scripts.rs` | User scripts management | `src-tauri/src/scripts.rs` |
| `agent_index.rs` | Generates `llms.txt` + `mknote-manifest.json` for AI agents | `src-tauri/src/agent_index.rs` |
| `message_hub.rs` | Short message center with S3/WebDAV sync | `src-tauri/src/message_hub.rs` |
| `sync.rs` | S3 automatic sync (cloud-authoritative, polling, conflict detection via SyncManifest) | `src-tauri/src/sync.rs` |
| `vault.rs` | Encrypted cloud vault (S3-backed, SHA-256 password) | `src-tauri/src/vault.rs` |
| `s3_store.rs` | MinIO/S3 client with AWS SigV4 signing | `src-tauri/src/s3_store.rs` |
| `webdav.rs` | WebDAV client for remote sync | `src-tauri/src/webdav.rs` |
| `siyuan.rs` | SiYuan note API client (upload current note) | `src-tauri/src/siyuan.rs` |
| `siyuan_map.rs` | SiYuan document ID ↔ note name mapping persistence | `src-tauri/src/siyuan_map.rs` |
| `lsky.rs` | Lsky Pro image hosting upload | `src-tauri/src/lsky.rs` |
| `clip_server.rs` | Local HTTP server for browser clip-in | `src-tauri/src/clip_server.rs` |
| `fullscreen_watcher.rs` | Detects fullscreen transitions to hide/show window | `src-tauri/src/fullscreen_watcher.rs` |
| `assets.rs` | Image asset management | `src-tauri/src/assets.rs` |
| `win_present.rs` | Windows-native Win32 window management (foreground, focus, position) | `src-tauri/src/win_present.rs` |

---

## React Frontend Structure

```
src/
├── App.tsx                     # Root component: routing, hook orchestration, global layout
├── main.tsx                    # Entry: window label detection, per-window component routing
├── types.ts                    # Shared TypeScript interfaces
├── components/
│   ├── compact/                # Main compact UI: header, library, editor, status bar, settings
│   ├── ui/                     # shadcn/ui primitives (button, input, etc.)
│   ├── CapsuleView.tsx         # Capsule (compact detached note) view
│   ├── CompactView.tsx         # Main compact note view
│   ├── ExpandedView.tsx        # Expanded note view
│   ├── PopoutView.tsx          # Popout note window view
│   ├── DetachView.tsx          # Common detach/popout entry in main window
│   ├── NoteTabsBar.tsx         # Tab bar for multi-note navigation
│   ├── QuickTodoPanel.tsx      # Quick Todo list panel
│   ├── QuickTodoShell.tsx      # Quick Todo window shell+lifecycle
│   ├── QuickPocketPanel.tsx    # Quick Pocket list panel
│   ├── QuickPocketShell.tsx    # Quick Pocket window shell+lifecycle
│   ├── QuickPocketPicker.tsx   # Pocket selection UI
│   ├── QuickPocketSettingsPanel.tsx # Pocket CRUD management panel
│   ├── AiAssistPanel.tsx       # AI text assist panel
│   ├── ImageDoodleModal.tsx    # Image doodle annotation modal
│   └── ...                     # Numerous smaller components
├── hooks/
│   ├── useLibraryData.ts       # Library panel data fetching
│   ├── useOpenTabsController.ts# Multi-tab state management
│   ├── useQuickTodoController.ts# Quick Todo state + IPC bridge
│   ├── useQuickPocketController.ts# Quick Pocket state + IPC bridge
│   ├── useTabSessions.ts       # Tab persistence/restore
│   └── ...
├── services/
│   ├── notesService.ts         # Tauri invoke wrappers for note operations
│   ├── windowService.ts        # Window management invoke wrappers
│   ├── configService.ts        # Config CRUD invoke wrappers
│   ├── quickTodoService.ts     # Quick Todo invoke wrappers
│   ├── quickPocketService.ts   # Quick Pocket invoke wrappers
│   ├── messageHubService.ts    # Message hub invoke wrappers
│   ├── syncService.ts          # S3 automatic sync invoke wrappers
│   ├── siyuanService.ts        # SiYuan invoke wrappers
│   └── ...
├── utils/
│   ├── quickTodoModel.ts       # Quick Todo model logic (filter, sort, popout args)
│   ├── quickTodoPanelModel.ts  # Quick Todo UI state (drag, edit, key handlers)
│   ├── quickPocketModel.ts     # Quick Pocket model logic
│   ├── markdownRenderCore.ts   # Custom Markdown renderer (XSS safety, highlight, table)
│   ├── quickPocketRegistry.ts  # Multi-pocket definitions and validation
│   ├── noteTabs.ts             # Tab key manipulation
│   ├── previewDom.ts           # WYSIWYG preview editor DOM manipulation
│   ├── editorFormat.ts         # Markdown format toolbar logic
│   └── ...
├── constants/
│   └── themeAccents.ts         # Theme style→color mapping
└── styles/
    ├── tokens.css              # Design token CSS custom properties
    ├── accent-selection-ui.css # Accent-themed selection UI
    └── tailwind.css            # Tailwind base
```

---

## Data Flow

### Note Edit Flow
```
User edits text in EditorPane/EditablePreviewEditor
    → useQueuedNoteWriter (debounce 600ms)
    → notesService.saveNote(zone, name, content)
    → Tauri invoke → lib.rs `cmd_save_note`
    → notes.rs write to File/<zone>/<name>.md
    → Emit "mknote:note-saved" event
    → Frontend listener updates library panel
```

### Quick Todo Flow
```
QuickTodoController (useQuickTodoController)
    → quickTodoService.listItems() / addItem() / updateItem() / deleteItem()
    → Tauri invoke → quick_todo.rs commands
    → Read/write File/quick-todo.md (structured Markdown)
    → Emit "mknote:quick-todo-changed" event
    → Frontend re-renders QuickTodoPanel
```

### Quick Pocket Flow
```
QuickPocketController (useQuickPocketController)
    → quickPocketService.listItems() / addItem() / updateItem() / deleteItem()
    → Tauri invoke → quick_pocket.rs commands
    → Read/write File/quick-pocket.md (structured Markdown)
    → Emit "mknote:quick-pocket-changed" event
    → Frontend re-renders QuickPocketPanel
```

### Window Lifecycle Flow
```
system.rs (CLI action or tray click)
    → quick_todo_window.rs::toggle_quick_todo(app)
    → Check if window exists: focus or create
    → Create WebviewWindow with label "quick-todo"
    → Frontend main.tsx detects "quick-todo" label → renders QuickTodoShell
    → On blur: quick_todo_window.rs auto-closes (with exceptions during drag)
```

---

## Configuration

Configuration is stored in `config.json` next to the executable (green portable) or in `%APPDATA%/md-sticky-note/config.json` (legacy, auto-migrated).

Key config sections (see `AppConfig` in `lib.rs`):
- `window_geometry` — Position and size of main window
- `global_hotkeys` — Customizable hotkey bindings
- `theme_mode` — `light` / `dark` / `system`
- `theme_style` — Accent style (mknote, catppuccin, hermes, poseidon, etc.)
- `s3_*` — S3/MinIO endpoint, bucket, keys
- `siyuan_*` — SiYuan API URL and token
- `ai_*` — AI API configuration
- `writable_base` — Override for note data directory
- `quick_pocket_*` — Quick Pocket window state and filter
- `quick_todo_*` — Quick Todo window state and filter
- `pinned_tabs` — Pinned tab configuration
- `capsule_sessions` / `popout_sessions` — Persisted detached window state
- `recent_notes` — Recently opened notes list
- `open_tabs` — Open tabs for restart restoration

---

## Key Design Patterns

1. **File-as-data**: Each note is a plain `.md` file. Quick Todo and Quick Pocket also use structured Markdown files (`quick-todo.md`, `quick-pocket.md`) as their backing store, parsed into in-memory models.

2. **IPC-first**: All data operations go through Tauri `invoke` commands. The Rust backend is the single source of truth for all persistent state.

3. **Event-driven updates**: Rust emits events (`mknote:note-saved`, `mknote:quick-todo-changed`, etc.) on data mutation. Frontend listens and re-renders.

4. **Window label routing**: All windows share the same frontend bundle. `main.tsx` reads `window.__TAURI__.window.label` to decide which component tree to render.

5. **Process cache with OnceLock**: Critical paths like `writable_base` are resolved once and cached in `OnceLock` for the process lifetime.
