---
type: Domain
title: S3 Automatic Sync
description: Cloud-authoritative S3 sync system for MKnote v4.2+. Syncs notes, Quick Todo, and Quick Pocket data to S3 using the AWS Rust SDK. Features polling-based sync, conflict detection via SyncManifest, per-device device_id tracking, and live status reporting.
tags: [mknote, sync, s3, cloud]
resource: src-tauri/src/sync.rs
---

# S3 Automatic Sync (v4.2+)

The S3 automatic sync system provides **cloud-authoritative bidirectional sync** for MKnote data, using S3-compatible storage (MinIO, AWS S3, etc.). It is built on the `aws_sdk_s3` Rust crate (async), separate from the legacy `reqwest`-based message hub sync.

---

## Architecture

```
┌──────────────────────┐     Polling (20s)     ┌──────────────────────┐
│   MKnote Desktop     │ ◄──────────────────►  │   S3-Compatible      │
│                      │     Sync Manifest     │   Storage            │
│  ┌────────────────┐  │     + Data Objects    │                      │
│  │  sync.rs        │  │                      │  bucket/             │
│  │  (Rust module)  │  │                      │  └── prefix/sync/    │
│  │                 │  │                      │      ├── manifest    │
│  │  Polling loop   │  │                      │      ├── quick-todo  │
│  │  Conflict       │  │                      │      ├── quick-pocket│
│  │  detection      │  │                      │      ├── quick-pocket│
│  │  Manifest merge │  │                      │      │   -{id}       │
│  └────────────────┘  │                      │      └── default-note│
└──────────────────────┘                      └──────────────────────┘
```

### Key Concepts

| Concept | Detail |
|---------|--------|
| **Sync Manifest** | Remote JSON object tracking revision, content hash, and ETag per data item |
| **Device ID** | Generated on first bootstrap, persisted locally to detect cross-device sync |
| **Polling interval** | Default 20 seconds (`DEFAULT_POLL_INTERVAL_SECS`) |
| **Sync Decision** | `Noop`, `UploadLocal`, `DownloadRemote`, or `Conflict` per item |
| **Cloud-authoritative** | On conflict, remote version wins and local data is overwritten |

---

## Synced Data Items

| Item ID | Local File | Sync Object Key |
|---------|-----------|----------------|
| `default-note` | `File/default/` (all files) | `{prefix}/sync/default-note` |
| `quick-todo` | `quick-todo.md` | `{prefix}/sync/quick-todo` |
| `quick-pocket-default` | `quick-pocket-default.md` | `{prefix}/sync/quick-pocket-default` |
| `quick-pocket-{id}` | `quick-pocket-{id}.md` | `{prefix}/sync/quick-pocket-{id}` |

The set of sync items is determined by `SyncItemId::all()`, which reads the `quick_pockets` config at runtime.

---

## Sync Flow

### Bootstrap

1. User configures S3 endpoint, bucket, access key, secret key
2. User calls `sync_bootstrap` with mode `"local"` or `"remote"`
   - `"local"`: Upload local data as the initial remote state
   - `"remote"`: Download remote data as the initial local state
3. On success, `sync_initialized` is set to `true` in config

### Tick (Poll)

`sync_tick` runs the comparison cycle:

1. Read local SyncState from disk
2. Download remote SyncManifest from S3
3. For each SyncItemId:
   - Compare local revision vs remote revision
   - Compute `SyncDecision`
   - Execute Upload/Download/Noop
4. Write updated SyncManifest back to S3
5. Emit `mknote:sync-status-changed` event

### Conflict Handling

When local and remote both have non-zero revisions for the same item:
- **Cloud-authoritative**: Remote version is downloaded, overwriting local data
- Conflict counter (`conflicts` in SyncStatus) increments
- The conflict is recorded per-item in local SyncState

---

## Sync Status

The `SyncStatus` struct provides live status to the frontend:

```rust
pub struct SyncStatus {
    pub enabled: bool,
    pub initialized: bool,
    pub state: String,          // "disabled", "ready", "conflict", etc.
    pub pending_items: usize,
    pub conflicts: usize,
    pub last_success_at_ms: Option<i64>,
    pub last_error: Option<String>,
}
```

Status is available via the `sync_status` IPC command and `mknote:sync-status-changed` events.

---

## Configuration

Config fields in `config.json` (`AppConfig`):

| Field | Default | Description |
|-------|---------|-------------|
| `sync_enabled` | `false` | Master sync toggle |
| `sync_initialized` | `false` | Whether bootstrap completed |
| `sync_poll_interval_secs` | `20` | Polling frequency |
| `s3_endpoint` | `"http://127.0.0.1:9000"` | S3 endpoint URL |
| `s3_bucket` | `"mdnote"` | S3 bucket name |
| `s3_object_key` | `"MDnote/messages.json"` | Object key prefix for sync objects |
| `s3_access_key` | (empty) | S3 access key |
| `s3_secret_key` | (empty) | S3 secret key |

---

## Rust Backend

The sync system lives in [`src-tauri/src/sync.rs`](src-tauri/src/sync.rs):

| Function | Purpose |
|----------|---------|
| `SyncRemote::from_config()` | Build S3 client from AppConfig |
| `bootstrap()` | Initialize sync state from local or remote |
| `tick()` | Run one sync cycle (compare → upload/download) |
| `status()` | Return current SyncStatus |
| `set_enabled()` | Toggle sync on/off |

IPC commands registered in [`lib.rs`](src-tauri/src/lib.rs):

| Command | Purpose |
|---------|---------|
| `sync_status` | Get current sync status |
| `set_sync_enabled` | Enable/disable sync |
| `sync_bootstrap` | Bootstrap sync (local or remote) |
| `sync_tick` | Run one sync cycle |

---

## Frontend Integration

| File | Role |
|------|------|
| [`syncService.ts`](src/services/syncService.ts) | Invoke wrappers for sync commands |
| [`MessageHubSettingsPanel.tsx`](src/components/MessageHubSettingsPanel.tsx) | Sync bootstrap and enable/disable controls (co-located with S3 config) |

The UI is co-located with the Message Hub settings panel since they share the same S3 infrastructure configuration.

---

## Related

- **[Architecture Overview](../architecture/overview.md)** — sync.rs module in the Rust backend
- **[Quick Pocket](quick-pocket.md)** — Per-pocket sync items
- **[Quick Todo](quick-todo.md)** — Quick Todo data synced via this system
- **[Message Hub & Vault](message-hub.md)** — Legacy sync system (separate from S3 auto sync)
