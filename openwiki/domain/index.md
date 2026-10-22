---
type: Documentation Index
title: "Domain"
description: "Files and subdirectories in Domain."
---

# Files

- [Message Hub & Vault](message-hub.md) - MKnote's short message center with S3/MinIO/WebDAV remote sync and an encrypted cloud vault. Messages are stored locally with optional remote sync; vault entries are encrypted with SHA-256 password and stored on S3.
- [Notes & Library System](notes-library.md) - MKnote's note storage system — each note is a local .md file organized into zones (inbox, default, private, custom folders) with color tags, a library panel, trash, and archive. Covers Rust backend in notes.rs/paths.rs and the frontend LibraryPanel.
- [Quick Pocket System](quick-pocket.md) - MKnote's independent quick capture system — dedicated window for saving text snippets, commands, paths, and private notes. Supports multi-pocket (multiple independent collections), four tag types (text/command/path/private), privacy blur, drag-sort, auto-save on blur. Backed by Rust model in quick_pocket.rs.
- [Quick Todo System](quick-todo.md) - MKnote's independent todo list system — a dedicated window with parent/child hierarchy, four tag categories (important/waiting/next/idea), drag-sort, native OS reminders with Markdown note links. Backed by Rust model in quick_todo.rs.
- [S3 Automatic Sync](s3-sync.md) - Cloud-authoritative S3 sync system for MKnote v4.2+. Syncs notes, Quick Todo, and Quick Pocket data to S3 using the AWS Rust SDK. Features polling-based sync, conflict detection via SyncManifest, per-device device_id tracking, and live status reporting.
