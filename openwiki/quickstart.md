---
type: Quickstart
title: MKnote OpenWiki
description: Entrypoint for MKnote v4.2.2 documentation — a lightweight Windows desktop Markdown sticky note app built with Tauri 2 + React 19 + Rust. Covers architecture, domains, integrations, operations, and testing.
tags: [mknote, tauri, react, rust, quickstart]
---

# MKnote (MD Sticky Note) — OpenWiki

**v4.2.2** · Windows 轻量 Markdown 桌面便签

每条便签一个 `.md` 文件，本地目录存储。支持无边框窗口、托盘、全局热键、内嵌资料库、多标签页、颜色标签、可视化预览编辑、Quick Todo / Quick Pocket 独立窗口、S3 自动同步、短消息中心（S3/MinIO/WebDAV）、思源单向上传与外部 AI Agent 索引。

> 私有仓库：[github.com/ssatan34/MDnote](https://github.com/ssatan34/MDnote)

**定位**：轻量便签本，随手记、本地优先。  
**不是**：Obsidian 替代品、知识库或双向云同步中心。

---

## Quick Start (Development)

```powershell
git clone git@github.com:ssatan34/MDnote.git
cd MDnote
npm install
npm run tauri dev
```

**Prerequisites**: Node.js 18.14+ or 20 LTS, Rust (via `rustup`), VS Build Tools (Windows "Desktop development with C++"), WebView2 (Evergreen on Win10/11).

First `tauri dev` compiles Rust dependencies — expect **5–15 minutes**.

> Dev note: note data lives in `src-tauri/target/debug/` (next to the debug exe), **not** the source root.

### Common Commands

| Command | Purpose |
|---------|---------|
| `npm run tauri dev` | Development with HMR |
| `npm run build` | Frontend-only build |
| `npm run tauri build` | Release build (NSIS/MSI) |
| `npm run build:green` | Green portable + timestamped zip |
| `npm run pack:dev` | Dev migration zip (excludes node_modules/target) |
| `cargo check --manifest-path src-tauri\Cargo.toml` | Rust check |

---

## Feature Overview

| Category | Capabilities |
|----------|-------------|
| **Editing** | Markdown source / visual preview, format toolbar, undo/redo, font sizing (12–24px), privacy mask |
| **Library** | Inbox / Default / Custom folders / Archive; CRUD, drag-move, color tags, filtering |
| **Tabs** | Multi-tab open, restart persistence, pinned tabs (max 2), drag sort |
| **Quick Todo** | Independent window, YASB `--toggle-quick-todo`, 4-tag filter, parent/child hierarchy, drag-sort within same parent, reminders with native OS window, note links |
| **Quick Pocket** | Multi-pocket support (per-pocket data + registry), QuickPocketPicker, QuickPocketSettingsPanel, 4-tag filter, title/body save, privacy summary, copy, drag-sort; empty title+body not saved |
| **Templates** | 8 built-in templates, variable substitution |
| **Trash** | Soft delete, restore, permanent delete, empty |
| **Extensions** | Full-text search, recent notes, favorites, [[wiki-links]], popout/capsule windows, image assets, AI assist, browser clip |
| **Sync** | S3 automatic sync (cloud-authoritative, polling, conflict detection); SiYuan note one-way upload; Message Hub via S3/MinIO/WebDAV |
| **Agent** | Auto-generated `llms.txt` + `mknote-manifest.json` for external AI read access |
| **Distribution** | Green portable zip, NSIS/MSI installer |

---

## Documentation Structure

### Architecture

- **[Architecture Overview](architecture/overview.md)** — Tauri 2 + React 19 + Rust architecture, process model, Rust backend modules, React frontend structure, data flow
- **[Window System](architecture/window-system.md)** — Multi-window architecture: main, Popout, Capsule, Quick Todo, Quick Pocket, Reminder, tab-drag-preview; CLI actions, tray, focus lifecycle

### Domain Concepts

- **[Notes & Library](domain/notes-library.md)** — Markdown file storage, zones (inbox/default/private/folder:), color tags, folders CRUD, library panel, trash
- **[Quick Todo](domain/quick-todo.md)** — Independent todo system: data model, Rust backend commands, panel UI, tag filtering, parent/child hierarchy, drag-sort, reminders, Markdown note links
- **[Quick Pocket](domain/quick-pocket.md)** — Quick capture pocket: multi-pocket, tag types (text/command/path/private), privacy mask, body copy, drag-sort
- **[S3 Automatic Sync](domain/s3-sync.md)** — Cloud-authoritative S3 sync for notes, Quick Todo, and Quick Pocket with polling, conflict detection, and SyncManifest
- **[Message Hub & Vault](domain/message-hub.md)** — Short message center with S3/MinIO/WebDAV sync, cloud vault with password protection

### Integrations

- **[External Integrations](integrations/index.md)** — SiYuan note upload, Lsky Pro image hosting, browser clip server, AI agent index, AI assist, config management

### Operations

- **[Build & Distribution](operations/index.md)** — Build commands, green portable pack, installer, dev migration pack, smoke tests, config migration

### Testing

- **[Testing Guide](testing/index.md)** — Test files, Node test runner patterns, component testing approach

---

## Important Source Files (Quick Reference)

| Area | Key Files |
|------|-----------|
| Rust backend | `src-tauri/src/lib.rs` (commands, config, app setup), `src-tauri/src/system.rs` (tray, hotkeys, CLI) |
| Notes storage | `src-tauri/src/notes.rs`, `src-tauri/src/paths.rs` |
| Quick Todo | `src-tauri/src/quick_todo.rs`, `src-tauri/src/quick_todo_window.rs` |
| Quick Pocket | `src-tauri/src/quick_pocket.rs`, `src-tauri/src/quick_pocket_window.rs`, `src/utils/quickPocketRegistry.ts` |
| Popout/Capsule | `src-tauri/src/detach.rs`, `src-tauri/src/win_present.rs` |
| React entry | `src/App.tsx`, `src/main.tsx` |
| Library panel | `src/components/compact/LibraryPanel.tsx` |
| UI tokens | `src/styles/tokens.css`, `DESIGN.md` |
| S3 Sync | `src-tauri/src/sync.rs`, `src/services/syncService.ts` |
| Agent docs | `docs/AGENT-HANDOVER.md` (read before changing code) |

---

## Backlog

- **Automated E2E tests**: Currently only unit/component tests exist; no Tauri-driver or Playwright e2e tests.
- **macOS/Linux support**: Windows-only via win_present.rs, Win32 API calls, and WebView2 assumptions.
- **i18n**: Chinese-centric UI strings hardcoded in components.

---

## Existing Chinese Documentation

This repo maintains extensive Chinese-language docs under `docs/`. Key files:

| Doc | Purpose |
|-----|---------|
| [docs/项目总结.md](docs/项目总结.md) | Project overview and doc index |
| [docs/功能概要.md](docs/功能概要.md) | Feature summary and use cases |
| [docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md) | Implementation path and maintenance |
| [docs/AGENT-HANDOVER.md](docs/AGENT-HANDOVER.md) | Daily dev handover (read before coding) |
| [docs/MKnote-UI-v2.md](docs/MKnote-UI-v2.md) | UI wireframes and behavior specs |
| [docs/ICON-GUIDE.md](docs/ICON-GUIDE.md) | Icon specification |
