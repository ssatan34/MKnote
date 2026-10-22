---
type: Domain
title: Notes & Library System
description: MKnote's note storage system — each note is a local .md file organized into zones (inbox, default, private, custom folders) with color tags, a library panel, trash, and archive. Covers Rust backend in notes.rs/paths.rs and the frontend LibraryPanel.
tags: [mknote, notes, library, storage]
resource: src-tauri/src/notes.rs
---

# Notes & Library System

MKnote stores every note as a **plain `.md` file** on the local filesystem. There is no database; the filesystem is the source of truth.

---

## File Layout

```
{base}/
├── config.json                      # Application configuration
├── inbox/                           # Inbox zone (quick capture, new notes)
├── File/
│   ├── default/                     # Default zone (main note storage)
│   ├── archive/                     # Archive zone (moved out of active folders)
│   ├── <folder-name>/               # User-created custom folders
│   ├── .mknote-note-colors.json     # Note color tag metadata
│   ├── .mknote-siyuan-map.json      # SiYuan sync mapping
│   ├── .mknote-folders.json         # Legacy folder color metadata
│   └── assets/                      # Dragged/pasted image assets
├── quick-todo.md                    # Quick Todo backing store
├── quick-pocket.md                  # Quick Pocket backing store
├── messages.json                    # Message Hub local cache
├── llms.txt                         # Agent index (auto-generated)
└── mknote-manifest.json             # Note manifest (auto-generated)
```

> **{base}** = exe directory for green portable; `%APPDATA%/md-sticky-note/` for legacy installs.

---

## Zones

Notes are organized into **zones**, defined in [`paths.rs`](src-tauri/src/paths.rs) and typed in [`types.ts`](src/types.ts):

| Zone | Directory | Purpose |
|------|-----------|---------|
| `inbox` | `{base}/inbox/` | Quick capture area, drag-in clipboard content |
| `default` | `{base}/File/default/` | Main default storage zone |
| `private` | `{base}/File/private/` | Private notes (visual distinction, not encryption) |
| `folder:<name>` | `{base}/File/<name>/` | Custom user-created folders (max 8) |
| `archive` | `{base}/File/archive/` | Archival zone for inactive notes |

Zone determination is done client-side in the frontend but validated and used by Rust for all file operations.

---

## Note Creation

- **Filename format**: `YYYYMMDDHHmmssSSS.md` (timestamp with milliseconds)
- **Title**: Filename minus `.md` extension (displayed as-is in the library)
- **First-line heading**: If the first line is `# Title`, it's shown as the note heading when opened; the file list still shows the filename-based title
- **Saving**: Debounced at 600ms via `useQueuedNoteWriter`; forced flush on tab switch, window hide, or app quit

---

## Color Tags

Notes can have color tags for visual organization. Valid tags (see `NOTE_COLOR_IDS` in [`notes.rs`](src-tauri/src/notes.rs)):

| Tag ID | Meaning |
|--------|---------|
| `重要` (Important) | Red/amber |
| `紧急` (Urgent) | Red |
| `存档` (Archive) | Slate |
| `待办` (Todo) | Blue |
| `隐私` (Private) | Purple |

Tags are stored in `File/.mknote-note-colors.json` as a `BTreeMap<filename, color_string>`. The library panel provides a filter dropdown to show/hide notes by color tag.

---

## Folders

Users can create up to **8 custom folders**. Folders have:
- A directory under `File/`
- A color assignment (blue, red, orange, green, purple, pink, slate, teal) — stored in `.mknote-folders.json`
- Notes can be reorganized by drag-moving them between folders and zones

---

## Library Panel

The library panel ([`LibraryPanel.tsx`](src/components/compact/LibraryPanel.tsx)) is a two-column UI showing:
- **Left column**: Zone/folder tree (Inbox, Default, Private, each custom folder, Archive)
- **Right column**: Note list for selected zone, with color tag indicators

Operations from the library:
- Create new note
- Rename note (validates Windows-legal filenames)
- Delete note (moves to trash)
- Drag note to move between zones/folders
- Color tag picker per note
- Full-text search (by title)

---

## Trash System

The trash module ([`trash.rs`](src-tauri/src/trash.rs)) provides:
- **Soft delete**: Notes are moved to `File/.trash/` with metadata
- **Restore**: Move back to original zone
- **Permanent delete**: Remove from filesystem
- **Empty trash**: Bulk permanent delete
- Trash accessed via `TrashPopover` in the compact UI

---

## Archive

Notes can be moved to the `archive` zone (`File/archive/`). This is distinct from trash — archived notes remain accessible in the library panel under the Archive section but are removed from active folder views.

---

## Note Tab System

The multi-tab system ([`NoteTabsBar.tsx`](src/components/NoteTabsBar.tsx), [`useOpenTabsController.ts`](src/hooks/useOpenTabsController.ts)):
- Open notes appear as tabs in the top bar
- Tabs persist across app restarts (stored in `config.json` → `open_tabs`)
- Up to 2 tabs can be pinned (pinned tabs survive "close all tabs")
- Tabs can be reordered by drag-and-drop (with a transparent preview window)
- Tab state, scroll position, and edit history are maintained per tab

---

## Recent Notes & Favorites

- **Recent notes** ([`history.rs`](src-tauri/src/history.rs)): Tracked in `config.json` → `recent_notes`, with timestamps
- **Favorites** ([`stars.rs`](src-tauri/src/stars.rs)): Starred notes persist across sessions

---

## Privacy Mask

The privacy mask system ([`privacyMask.ts`](src/utils/privacyMask.ts)) provides a visual overlay for private notes during screenshots or screen sharing. Toggled per-note, it applies a CSS block overlay on the editor content.

---

## Related

- **[Architecture Overview](../architecture/overview.md)** — Data flow and module structure
- **[Quick Todo](quick-todo.md)** — Note links from Quick Todo items reference notes by zone+name
- **[Quick Pocket](quick-pocket.md)** — Quick Pocket items can be saved to notes
