---
type: Domain
title: Message Hub & Vault
description: MKnote's short message center with S3/MinIO/WebDAV remote sync and an encrypted cloud vault. Messages are stored locally with optional remote sync; vault entries are encrypted with SHA-256 password and stored on S3.
tags: [mknote, message-hub, vault, sync, s3, webdav]
resource: src-tauri/src/message_hub.rs
---

# Message Hub & Vault

MKnote provides a **short message center** (Message Hub) for sending and receiving brief text messages, optionally synchronized via S3/MinIO or WebDAV, and a **password-protected vault** for secure cloud storage.

---

## Message Hub

The Message Hub ([`message_hub.rs`](src-tauri/src/message_hub.rs)) maintains a list of short text messages:

### Data Structure

```rust
pub struct HubMessage {
    pub id: String,
    pub text: String,
    pub created_at_ms: i64,
}

pub struct MessageHubStore {
    pub version: u32,
    pub messages: Vec<HubMessage>,
}
```

Messages are stored locally in `{base}/messages.json`.

### Remote Sync

The Message Hub supports **two remote backends** for cross-device sync:

| Backend | Implementation | Configuration |
|---------|---------------|---------------|
| **S3/MinIO** | [`s3_store.rs`](src-tauri/src/s3_store.rs) | `s3_endpoint`, `s3_bucket`, `s3_access_key`, `s3_secret_key` |
| **WebDAV** | [`webdav.rs`](src-tauri/src/webdav.rs) | `webdav_url`, `webdav_username`, `webdav_password` |

Sync flow:
1. Fetch remote store (S3 GET or WebDAV GET)
2. Merge with local store (ID-based dedup)
3. Write merged result back to remote
4. Update local cache

The backend selection is determined by which config values are present (S3 takes priority if both configured).

### Frontend

The Message Hub frontend is embedded in the settings panel ([`MessageHubSettingsPanel.tsx`](src/components/MessageHubSettingsPanel.tsx)), integrated into the main `<UnifiedSettingsPanel>`:
- Message list display with timestamps
- Compose new message
- Manual sync trigger
- S3/WebDAV configuration form including v4.2 S3 automatic sync (toggle, bootstrap, SyncStatus)

---

## Cloud Vault

The vault system ([`vault.rs`](src-tauri/src/vault.rs)) provides **password-protected cloud storage** backed by S3:

### Data Structures

```rust
pub struct VaultEntry {
    pub id: String,
    pub text: String,
    pub created_at_ms: i64,
}

pub struct VaultStore {
    pub version: u32,
    pub entries: Vec<VaultEntry>,
}

pub struct VaultConfig {
    pub password_hash: Option<String>,  // SHA-256 hex
}
```

### Security Model

- Password is hashed with **SHA-256** before storage
- `VaultConfig` (containing the hash) is stored on S3 as a separate object
- Content is stored as plain JSON (no per-entry encryption — the password gates access)
- Status check requires S3 configuration + password both set

### Frontend

The vault UI provides:
- Lock/unlock toggle (`VaultCurtainButton`)
- Password input dialog (`PasswordInput`)
- Entry list with add/remove
- Lock toggle button

---

## Remote Sync Backends

### S3/MinIO Store ([`s3_store.rs`](src-tauri/src/s3_store.rs))

Implements **AWS SigV4** signing for S3-compatible storage:

| Detail | Default |
|--------|---------|
| Endpoint | `http://127.0.0.1:9000` |
| Bucket | `mdnote` |
| Object key | `MDnote/messages.json` |
| Region | `us-east-1` |

Uses `reqwest::blocking::Client` for HTTP operations. Configurable via `config.json` `s3_*` settings.

### WebDAV Client ([`webdav.rs`](src-tauri/src/webdav.rs))

Supports basic HTTP PUT/GET for WebDAV-compatible servers:

| Detail | Default |
|--------|---------|
| URL | Configurable |
| Path | `/{remote_path}/messages.json` |

---

## Related

- **[Architecture Overview](../architecture/overview.md)** — Backend module overview
- **[Integrations](../integrations/index.md)** — SiYuan, Lsky, AI integrations
