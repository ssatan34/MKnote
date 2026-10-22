---
type: Domain
title: Quick Todo System
description: MKnote's independent todo list system — a dedicated window with parent/child hierarchy, four tag categories (important/waiting/next/idea), drag-sort, native OS reminders with Markdown note links. Backed by Rust model in quick_todo.rs.
tags: [mknote, quick-todo, todos, reminders]
resource: src-tauri/src/quick_todo.rs
---

# Quick Todo System

Quick Todo is an **independent todo list** that runs in its own dedicated WebView2 window. It is separate from the main MKnote note-taking system but can link to specific notes.

---

## Data Model

Quick Todo data is stored in a single structured Markdown file: `File/quick-todo.md`. The Rust backend ([`quick_todo.rs`](src-tauri/src/quick_todo.rs)) parses this file into an in-memory model and writes changes back.

### QuickTodoItem

```rust
pub struct QuickTodoItem {
    pub id: String,               // UUID, stable across sessions
    pub text: String,             // Todo text content
    pub completed: bool,
    pub created_at: String,       // ISO 8601
    pub completed_at: Option<String>,
    pub tag: Option<QuickTodoTag>, // Three-value enum
    pub parent_id: Option<String>, // Self-referential hierarchy
    pub remind_at: Option<String>, // ISO 8601 reminder time
    pub link: Option<QuickTodoLink>, // Link to a MKnote note
}
```

### QuickTodoTag

| Tag | Filter Color | Meaning |
|-----|-------------|---------|
| `important` | Red | Priority items |
| `waiting` | Amber | Blocked / waiting on something |
| `next` | Blue | Upcoming action |
| `idea` | Green | Brainstorm / draft |

### QuickTodoLink

```rust
pub struct QuickTodoLink {
    pub zone: String,  // Note zone (inbox, default, etc.)
    pub name: String,  // Note filename
}
```

---

## Parent/Child Hierarchy

Quick Todo supports **two-level hierarchy**:
- **Parent items**: Top-level todos with `parent_id = null`
- **Child items**: Sub-todos with `parent_id` pointing to a parent item's `id`

Rules:
- Children use indented styling, smaller font, and muted text color
- Drag-sort only within same-parent siblings (children cannot be moved to a different parent)
- Completing a parent does not auto-complete children
- `parent_id` must reference an existing parent (validated on the Rust side)

---

## Tags & Filtering

The Quick Todo panel provides a **tag filter bar** at the bottom:
- Click a tag to filter the list to only that tag's items
- Click the same tag again to clear the filter (show all)
- During active filtering, drag handles are disabled
- The four tags are defined in [`quickTodoTags.ts`](src/utils/quickTodoTags.ts) and backed by the `QUICK_TODO_TAGS` constant

Filter state is managed in [`quickTodoPanelModel.ts`](src/utils/quickTodoPanelModel.ts) via `filterQuickTodoItems()`.

---

## Reminders

Quick Todo items can have **one-time reminders**:

1. **Setting**: Click the alarm icon on a todo item row → native time picker panel (`QuickTodoReminderShell`)
2. **Display**: When setting, the reminder panel is positioned to the left of the Todo window
3. **Trigger**: At the specified `remind_at` time, the Rust backend fires a native OS notification (via `tauri-plugin-notification`) and opens the reminder window
4. **Lifecycle**: Completed or passed reminders are auto-cleaned. Remaining reminders persist across app restarts

Reminder logic:

| File | Purpose |
|------|---------|
| [`quick_todo.rs`](src-tauri/src/quick_todo.rs) | Rust reminder check command |
| [`useQuickTodoReminderScheduler.ts`](src/hooks/useQuickTodoReminderScheduler.ts) | Frontend reminder polling/scheduling |
| [`quickTodoReminder.ts`](src/utils/quickTodoReminder.ts) | Countdown formatting, datetime input helpers |
| [`QuickTodoReminderShell.tsx`](src/components/QuickTodoReminderShell.tsx) | Reminder setting UI |

---

## Note Links

A Quick Todo item can be **linked to a MKnote note**:
- Link stores `zone` + `name` (filename) of the target note
- Clicking the link icon opens (or focuses) the linked note in a popout window
- The popout window is sized at 400×500px and positioned relative to the Todo window
- Link UI: visible on row hover, shows a note icon

---

## Drag & Drop Sorting

Quick Todo items support **drag-and-drop reordering** within the same parent level:

| File | Purpose |
|------|---------|
| [`quickTodoPanelModel.ts`](src/utils/quickTodoPanelModel.ts) | Drag state management: `beginQuickTodoDrag`, `moveQuickTodoDrag`, `finishQuickTodoDrag` |
| [`QuickTodoPanel.tsx`](src/components/QuickTodoPanel.tsx) | DnD event handlers using `@atlaskit/pragmatic-drag-and-drop` |

Key behaviors:
- Drag only within same-parent siblings (enforced by `mergeQuickTodoViewOrder`)
- Insertion marker shown during drag (`getQuickTodoInsertionMarker`)
- Disabled during active tag filtering
- Focus-scoped escape during drag

---

## Rust Backend Commands

All Quick Todo operations go through Tauri IPC commands defined in [`quick_todo.rs`](src-tauri/src/quick_todo.rs):

| Command | Purpose |
|---------|---------|
| `quick_todo_list` | List all items |
| `quick_todo_add` | Add new item with text, tag, parent_id |
| `quick_todo_update` | Update item text |
| `quick_todo_remove` | Remove item |
| `quick_todo_toggle` | Toggle completed state |
| `quick_todo_set_tag` | Set/clear tag |
| `quick_todo_set_parent` | Set parent_id |
| `quick_todo_set_remind` | Set reminder time |
| `quick_todo_clear_remind` | Clear reminder |
| `quick_todo_set_link` | Set note link |
| `quick_todo_remove_link` | Clear note link |
| `quick_todo_reorder` | Set display order |

The backing file (`quick-todo.md`) uses a custom Markdown format with `id`, `tag`, `parent`, `remind_at`, and `link` encoded as HTML comments or structured headers. The Rust parser (`parse_document`) reads and writes this format atomically.

---

## Frontend Architecture

| File | Role |
|------|------|
| [`useQuickTodoController.ts`](src/hooks/useQuickTodoController.ts) | State management, IPC bridge, change listener |
| [`QuickTodoPanel.tsx`](src/components/QuickTodoPanel.tsx) | Main todo list UI (add, edit, tag, drag, filter) |
| [`QuickTodoEntry.tsx`](src/components/QuickTodoEntry.tsx) | Single todo row component |
| [`QuickTodoShell.tsx`](src/components/QuickTodoShell.tsx) | Window shell (lifecycle, blur, pin) |
| [`QuickTodoTagPicker.tsx`](src/components/QuickTodoTagPicker.tsx) | Tag assignment UI |
| [`QuickTodoAddTagButton.tsx`](src/components/QuickTodoAddTagButton.tsx) | Quick tag toggle button |
| [`QuickTodoReminderShell.tsx`](src/components/QuickTodoReminderShell.tsx) | Reminder setting window |
| [`quickTodoModel.ts`](src/utils/quickTodoModel.ts) | Model logic (filter, popout args, search targets) |
| [`quickTodoPanelModel.ts`](src/utils/quickTodoPanelModel.ts) | Panel state (drag, edit, key handling, list actions) |
| [`quickTodoTags.ts`](src/utils/quickTodoTags.ts) | Tag constants and toggle logic |
| [`quickTodoReminder.ts`](src/utils/quickTodoReminder.ts) | Reminder formatting helpers |
| [`quickTodoWindow.ts`](src/utils/quickTodoWindow.ts) | Window creation utilities |
| [`quickTodoNoteLink.ts`](src/utils/quickTodoNoteLink.ts) | Note link resolution |
| [`quickTodoService.ts`](src/services/quickTodoService.ts) | Tauri invoke wrapper service |

---

## State Change Events

The Rust backend emits `mknote:quick-todo-changed` on any data mutation. The frontend listens for this event to refresh its list, ensuring consistency across multiple Quick Todo windows (though only one is expected at a time).

---

## Testing

Quick Todo has extensive unit tests in [`tests/quickTodo.test.ts`](tests/quickTodo.test.ts) covering:
- Item creation, editing, completion
- Parent/child hierarchy validation
- Tag filtering
- Drag-sort ordering and insertion marker calculation
- Reminder datetime parsing and countdown formatting
- Note link popout argument building
- Keyboard shortcuts and escape handlers
- Integration with `QuickTodoTagPickerBase`

---

## Related

- **[Quick Pocket](quick-pocket.md)** — Shares window lifecycle pattern (blur-close, pin, tag filtering)
- **[Window System](../architecture/window-system.md)** — Quick Todo window lifecycle details
- **[Testing Guide](../testing/index.md)** — Test patterns
