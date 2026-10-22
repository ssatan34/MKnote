---
type: Domain
title: Quick Pocket System
description: MKnote's independent quick capture system — dedicated window for saving text snippets, commands, paths, and private notes. Supports multi-pocket (multiple independent collections), four tag types (text/command/path/private), privacy blur, drag-sort, auto-save on blur. Backed by Rust model in quick_pocket.rs.
tags: [mknote, quick-pocket, capture]
resource: src-tauri/src/quick_pocket.rs
---

# Quick Pocket System

Quick Pocket is an **independent quick capture window** for saving text snippets, command templates, file paths, and private notes. It complements Quick Todo by focusing on reference storage rather than task management.

---

## Multi-Pocket Architecture (v4.1.2+)

Quick Pocket supports **multiple independent pocket collections**. Each pocket has its own data file and can be managed independently.

### Pocket Registry

Pockets are defined by `QuickPocketDefinition`:

```typescript
// src/utils/quickPocketRegistry.ts
interface QuickPocketDefinition {
  id: string;   // Stable identifier (default = "default")
  name: string; // Display name (max 6 characters)
}
```

- The **default pocket** (`id = "default"`, name = "Quick Pocket") always exists
- Additional pockets are stored in `config.json` → `quick_pockets: Vec<QuickPocketDefinition>`
- Each pocket's data is stored in a separate file: `quick-pocket-{id}.md`
- Pocket state (geometry, pin) is persisted per-pocket in `quick_pocket_window_states`

### Pocket Management UI

| Component | Role |
|-----------|------|
| [`QuickPocketSettingsPanel`](src/components/QuickPocketSettingsPanel.tsx) | Create, rename, delete pockets (in UnifiedSettingsPanel) |
| [`QuickPocketPicker`](src/components/QuickPocketPicker.tsx) | Select a pocket to open from the tray/CLI |
| [`quickPocketRegistry.ts`](src/utils/quickPocketRegistry.ts) | Registry model: `mergeQuickPocketDefinitions()`, `isValidQuickPocketName()` |

### Commands (Rust, quick_pocket.rs)

| Command | Purpose |
|---------|---------|
| `quick_pocket_registry_list` | List all pocket definitions |
| `quick_pocket_create` | Create new pocket with given name |
| `quick_pocket_rename` | Rename a pocket |
| `quick_pocket_delete_pocket` | Delete a pocket and its data file |

---

## Data Model

Quick Pocket data is stored in a per-pocket structured Markdown file: `quick-pocket-{id}.md`. The Rust backend ([`quick_pocket.rs`](src-tauri/src/quick_pocket.rs)) manages parsing and persistence.

### QuickPocketItem

```rust
pub struct QuickPocketItem {
    pub id: String,     // UUID, stable across sessions
    pub title: String,  // Brief title/name
    pub body: String,   // Full content (Markdown)
    pub tag: Option<QuickPocketTag>,
}
```

### QuickPocketTag

| Tag | Purpose | Behavior |
|-----|---------|----------|
| `text` | General text snippet | Normal display |
| `command` | CLI command / script | Monospace styling |
| `path` | File system path | Link-like styling |
| `private` | Sensitive content | Content blurred with toggle reveal |

---

## Tags & Filtering

The Quick Pocket panel provides a **tag filter bar** at the bottom:
- Four filter buttons matching the four tag types
- Click to filter; click same tag again to clear
- Filter state managed in [`quickPocketModel.ts`](src/utils/quickPocketModel.ts)

Tags are defined in the Rust enum `QuickPocketTag` with `as_str()`/`parse()` for serialization. Frontend constants mirror this in `QUICK_POCKET_TAGS`.

---

## Privacy Mask

Items tagged `private` display with a **blur overlay** on their body content:
- A "curtain" icon (`vault-curtain-closed.svg` / `vault-curtain-open.svg`) toggles the blur
- The title remains visible at all times
- Implemented in the frontend via CSS blur filter and `VaultCurtainButton`

---

## Save Behavior

- **Auto-save on blur**: When the Quick Pocket window loses focus (e.g., clicking elsewhere), the current draft is automatically saved
- **Empty guard**: Items with empty title AND empty body are not saved (prevents accidental blank entries)
- **Manual save**: Quick save action available in the panel

---

## Frontend Architecture

| File | Role |
|------|------|
| [`useQuickPocketController.ts`](src/hooks/useQuickPocketController.ts) | State management, IPC bridge, change listener |
| [`QuickPocketPanel.tsx`](src/components/QuickPocketPanel.tsx) | Main pocket list UI (add, edit, tag, filter) |
| [`QuickPocketEntry.tsx`](src/components/QuickPocketEntry.tsx) | Single pocket item component |
| [`QuickPocketShell.tsx`](src/components/QuickPocketShell.tsx) | Window shell (lifecycle, blur-close, pin) |
| [`QuickPocketPicker.tsx`](src/components/QuickPocketPicker.tsx) | Pocket selection menu (from tray/CLI) |
| [`QuickPocketSettingsPanel.tsx`](src/components/QuickPocketSettingsPanel.tsx) | Pocket CRUD in settings |
| [`QuickPocketTagPicker.tsx`](src/components/QuickPocketTagPicker.tsx) | Tag assignment UI |
| [`quickPocketRegistry.ts`](src/utils/quickPocketRegistry.ts) | Multi-pocket definition model |
| [`quickPocketModel.ts`](src/utils/quickPocketModel.ts) | Model logic (filter, drag) |
| [`quickPocketService.ts`](src/services/quickPocketService.ts) | Service layer for IPC (per-pocket operations) |

---

## Rust Backend Commands

Commands in [`quick_pocket.rs`](src-tauri/src/quick_pocket.rs):

### Item Commands

| Command | Purpose |
|---------|---------|
| `quick_pocket_list` | List all pocket items for a given pocket ID |
| `quick_pocket_add` | Add new item with title, body, tag, groupId, pocketId |
| `quick_pocket_update` | Update item title and/or body for a pocket |
| `quick_pocket_remove` | Remove item from a pocket |
| `quick_pocket_set_tag` | Set/clear tag for a pocket |
| `quick_pocket_reorder` | Update display order for a pocket |

### Group Commands

| Command | Purpose |
|---------|---------|
| `quick_pocket_create_group` | Create group from selected items |
| `quick_pocket_rename_group` | Rename a group |
| `quick_pocket_dissolve_group` | Dissolve group back to loose items |
| `quick_pocket_move_item` | Move item into/out of a group |

Each backing file uses structured Markdown similar to Quick Todo, parsed by `parse_pocket_document()`.

---

## State Change Events

The Rust backend emits `mknote:quick-pocket-changed:{pocketId}` on any data mutation (per-pocket event). The frontend listens via `useQuickPocketController` to refresh the list.

---

## S3 Sync Integration

Quick Pocket data files are synced via the [S3 automatic sync](s3-sync.md) system. Each pocket is a separate `SyncItemId::QuickPocket(id)` item, with its own revision tracking.

---

## Testing

Quick Pocket tests in [`tests/quickPocket.test.ts`](tests/quickPocket.test.ts) cover:
- Item creation with title/body/tag
- Tag assignment and filtering
- Empty item guard (empty title+body not saved)
- Drag-sort ordering
- **Multi-pocket registry operations** (create, rename, delete pockets)
- **Per-pocket data isolation**
- Integration with `QUICK_POCKET_TAGS` constants

---

## Related

- **[Quick Todo](quick-todo.md)** — Shares window lifecycle pattern (blur-close, pin, tag filter)
- **[Window System](../architecture/window-system.md)** — Quick Pocket window lifecycle details
- **[S3 Automatic Sync](s3-sync.md)** — Pocket data sync via S3
- **[Notes & Library](notes-library.md)** — Pocket items can be linked to or extracted from notes
