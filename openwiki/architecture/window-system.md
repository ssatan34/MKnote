---
type: Architecture
title: MKnote Window System
description: Multi-window architecture for MKnote v4.1.1 — main window, Popout, Capsule, Quick Todo, Quick Pocket, Reminder. Covers CLI actions, tray integration, focus lifecycle, and Windows-native management via win_present.rs.
tags: [mknote, architecture, windows, tauri]
resource: src-tauri/src/system.rs
---

# Window System

MKnote manages **7 window types** through a single Tauri WebView2 process. All windows share the same frontend dist bundle; their role is determined at runtime by reading the window label.

---

## Window Types

| Label | Component | Purpose |
|-------|-----------|---------|
| `main` | `CompactView` | Primary note editing window with library sidebar |
| `popout-{name}` | `PopoutView` | Detached note as independent resizable window |
| `capsule-{name}` | `CapsuleView` | Compact pinned note strip, always-on-top |
| `quick-todo` | `QuickTodoShell` → `QuickTodoPanel` | Independent todo list window |
| `quick-todo-reminder` | `QuickTodoReminderShell` | Native OS-level reminder popup |
| `quick-pocket` | `QuickPocketShell` → `QuickPocketPanel` | Quick capture window |
| `tab-drag-preview` | `TabDragPreviewView` | Transparent overlay during tab drag reorder |

Window routing logic: [`src/main.tsx`](src/main.tsx) (lines 31–48).

---

## CLI Actions

The application accepts CLI arguments for headless window management, parsed in [`system.rs`](src-tauri/src/system.rs):

| Action | CLI Flag | Behavior |
|--------|----------|----------|
| Toggle | `--toggle` | Show/hide main window |
| Hide | `--hide` | Hide main window |
| Quick Todo | `--quick-todo` | Show Quick Todo window |
| Toggle Quick Todo | `--toggle-quick-todo` | Toggle Quick Todo visibility |
| Quick Pocket | `--quick-pocket` | Show Quick Pocket window |
| Toggle Quick Pocket | `--toggle-quick-pocket` | Toggle Quick Pocket visibility |
| New Inbox Note | `--new-inbox` | Create a new note in inbox |
| New Note | `--new-note` | Create a new note in default zone |

These are primarily used by YASB (a companion launcher) for keyboard-driven window management.

---

## Tray Icon

The application runs in the system tray. Closing the main window hides it to tray rather than quitting. The tray context menu provides:
- Show/Hide main window
- Quick Todo toggle
- Quick Pocket toggle
- Quit

Tray events are handled in [`system.rs`](src-tauri/src/system.rs).

---

## Global Hotkeys

| Action | Default Binding |
|--------|----------------|
| Toggle main window | `Ctrl+Shift+Alt+N` |
| Focus main window | `Ctrl+Shift+Alt+E` |
| Quick capture | `Ctrl+Alt+N` |
| Clipboard inbox | `Ctrl+Shift+Alt+V` |
| Quick search | `Ctrl+Shift+Alt+F` |

All hotkeys are configurable via `config.json` → `global_hotkeys` and the settings panel.

---

## Popout & Capsule System

The Popout and Capsule subsystem ([`detach.rs`](src-tauri/src/detach.rs)) manages per-note detached windows:

### Popout
- Independent resizable window for a single note
- Continues to sync content with main window (real-time editing)
- Supports always-on-top toggle
- Session persisted in `config.json` → `popout_sessions`

### Capsule
- Compact always-on-top strip showing note title
- Click to expand for quick view/edit
- Drag to reposition
- Snap-to-edge behavior (left/right/top)
- Supports todo checkoff directly from capsule
- Session persisted in `config.json` → `capsule_sessions`
- Transparent background for rounded appearance

### State Sync
Popout and capsule windows receive initialization params via `take_popout_init` IPC (pull, not push, to avoid timing races). Content changes are synced through the shared Rust file I/O layer — both the main window and detached windows read/write the same `.md` file.

---

## Quick Windows (Todo & Pocket)

### Quick Todo Window
- Label: `quick-todo`
- Lifecycle managed by [`quick_todo_window.rs`](src-tauri/src/quick_todo_window.rs)
- Created on first use via CLI or tray
- Auto-closes on blur (with exceptions during drag operations)
- Pin toggle to keep window open
- Reminder window (`quick-todo-reminder`) placed to the left of the Todo window

### Quick Pocket Window
- Label: `quick-pocket`
- Lifecycle managed by [`quick_pocket_window.rs`](src-tauri/src/quick_pocket_window.rs)
- Same blur-close and pin behavior as Quick Todo
- Auto-saves on blur

### Window Lifecycle Rules
- Blur-close is suppressed during drag operations (native drag in progress)
- Quick windows use `data-no-drag` attribute on close buttons to prevent native window drag from eating click events
- Windows are always positioned relative to cursor or main window on creation
- Pin state persists across invocations within the session

---

## Windows Native Integration

The [`win_present.rs`](src-tauri/src/win_present.rs) module provides Windows-specific Win32 window management via the `windows` crate:
- `force_present_window` — Bring window to foreground using `SetForegroundWindow` + `ShowWindow`
- `show_window_no_activate` — Show without stealing focus
- `is_native_foreground` / `is_native_presented` — Query window state
- `ensure_window_on_screen` — Clamp window position to virtual screen bounds

This avoids Tauri's cross-platform API limitations for precise window focus control on Windows.

---

## Related

- **[Architecture Overview](overview.md)** — General architecture and module structure
- **[Quick Todo](../domain/quick-todo.md)** — Todo data model and commands
- **[Quick Pocket](../domain/quick-pocket.md)** — Pocket data model and commands
