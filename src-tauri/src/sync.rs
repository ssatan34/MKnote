use aws_config::BehaviorVersion;
use aws_sdk_s3::{primitives::ByteStream, Client};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

const SYNC_SCHEMA_VERSION: u32 = 2;
const DEFAULT_POLL_INTERVAL_SECS: u64 = 20;
const SYNC_STATUS_EVENT: &str = "mknote:sync-status-changed";
const TODO_ITEM: &str = "quick-todo";
const POCKET_ITEM: &str = "quick-pocket-default";
const DEFAULT_NOTE_ITEM: &str = "default-note";
const POCKET_REGISTRY_OBJECT: &str = "quick-pocket-registry.json";
const TODO_REGISTRY_OBJECT: &str = "quick-todo-registry.json";

static DEFAULT_NOTE_EDIT_EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn protect_default_note() {
    DEFAULT_NOTE_EDIT_EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}

fn default_note_edit_epoch() -> u64 {
    DEFAULT_NOTE_EDIT_EPOCH.load(std::sync::atomic::Ordering::SeqCst)
}

fn defer_default_download(editor_dirty: bool, started_epoch: u64) -> bool {
    editor_dirty || default_note_edit_epoch() != started_epoch
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncItemId {
    DefaultNote,
    QuickTodoDefault,
    QuickTodo(String),
    QuickPocketDefault,
    QuickPocket(String),
}

impl SyncItemId {
    fn as_str(&self) -> String {
        match self {
            Self::DefaultNote => DEFAULT_NOTE_ITEM.to_string(),
            Self::QuickTodoDefault => TODO_ITEM.to_string(),
            Self::QuickTodo(id) => format!("quick-todo-{id}"),
            Self::QuickPocketDefault => POCKET_ITEM.to_string(),
            Self::QuickPocket(id) => format!("quick-pocket-{id}"),
        }
    }

    fn all(config: &crate::AppConfig) -> Vec<Self> {
        let mut items = vec![
            Self::DefaultNote,
            Self::QuickTodoDefault,
            Self::QuickPocketDefault,
        ];
        items.extend(
            config
                .quick_todos
                .iter()
                .filter(|todo| todo.id != "default")
                .map(|todo| Self::QuickTodo(todo.id.clone())),
        );
        items.extend(
            config
                .quick_pockets
                .iter()
                .filter(|pocket| pocket.id != "default")
                .map(|pocket| Self::QuickPocket(pocket.id.clone())),
        );
        items
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum SyncResource {
    Note(SyncItemId),
    QuickTodoRegistry,
    QuickPocketRegistry,
}

impl SyncResource {
    fn state_key(&self) -> String {
        match self {
            Self::Note(item) => item.as_str(),
            Self::QuickTodoRegistry => TODO_REGISTRY_OBJECT.to_string(),
            Self::QuickPocketRegistry => POCKET_REGISTRY_OBJECT.to_string(),
        }
    }

    fn remote_suffix(&self) -> String {
        match self {
            Self::Note(_) => format!("{}.md", self.state_key()),
            Self::QuickTodoRegistry | Self::QuickPocketRegistry => self.state_key(),
        }
    }

    fn conflict_stem(&self) -> String {
        match self {
            Self::Note(item) => item.as_str(),
            Self::QuickTodoRegistry => "quick-todo-registry".to_string(),
            Self::QuickPocketRegistry => "quick-pocket-registry".to_string(),
        }
    }

    fn is_note(&self) -> bool {
        matches!(self, Self::Note(_))
    }
}

fn valid_sync_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-')
}

fn resource_from_state_key(key: &str) -> Option<SyncResource> {
    match key {
        DEFAULT_NOTE_ITEM => Some(SyncResource::Note(SyncItemId::DefaultNote)),
        TODO_ITEM => Some(SyncResource::Note(SyncItemId::QuickTodoDefault)),
        POCKET_ITEM => Some(SyncResource::Note(SyncItemId::QuickPocketDefault)),
        TODO_REGISTRY_OBJECT => Some(SyncResource::QuickTodoRegistry),
        POCKET_REGISTRY_OBJECT => Some(SyncResource::QuickPocketRegistry),
        _ => {
            if let Some(id) = key.strip_prefix("quick-todo-") {
                return valid_sync_id(id)
                    .then(|| SyncResource::Note(SyncItemId::QuickTodo(id.to_string())));
            }
            if let Some(id) = key.strip_prefix("quick-pocket-") {
                return valid_sync_id(id)
                    .then(|| SyncResource::Note(SyncItemId::QuickPocket(id.to_string())));
            }
            None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncDecision {
    Noop,
    DownloadRemote,
    UploadLocal,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConflictResolution {
    Local,
    Remote,
}

fn parse_conflict_resolution(value: &str) -> Option<ConflictResolution> {
    match value {
        "local" => Some(ConflictResolution::Local),
        "remote" => Some(ConflictResolution::Remote),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncManifestItem {
    pub revision: u64,
    pub content_hash: String,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncManifest {
    pub schema_version: u32,
    pub generation: u64,
    pub items: BTreeMap<String, SyncManifestItem>,
}

impl Default for SyncManifest {
    fn default() -> Self {
        Self {
            schema_version: SYNC_SCHEMA_VERSION,
            generation: 0,
            items: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct SyncStateItem {
    content_hash: String,
    revision: u64,
    etag: Option<String>,
    #[serde(default)]
    remote_hash: Option<String>,
    conflict: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncState {
    schema_version: u32,
    device_id: String,
    items: BTreeMap<String, SyncStateItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub enabled: bool,
    pub initialized: bool,
    pub state: String,
    pub pending_items: usize,
    pub conflicts: usize,
    pub last_success_at_ms: Option<i64>,
    pub last_error: Option<String>,
}

struct RemoteObject {
    bytes: Vec<u8>,
    etag: Option<String>,
}

struct SyncRemote {
    client: Client,
    bucket: String,
    prefix: String,
}

fn is_missing_object_error(details: &str) -> bool {
    let normalized = details.to_ascii_lowercase();
    normalized.contains("nosuchkey")
        || normalized.contains("notfound")
        || normalized.contains("status: 404")
        || normalized.contains("statuscode: 404")
        || normalized.contains("http 404")
}

fn s3_put_error_message(details: &str) -> String {
    if details.contains("PreconditionFailed") || details.contains("412") {
        format!("S3 同步对象版本已变化：{details}")
    } else {
        format!("S3 写入同步对象失败：{details}")
    }
}

impl SyncRemote {
    async fn from_config(config: &crate::AppConfig) -> Result<Self, String> {
        let endpoint = config
            .s3_endpoint
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "请先配置 S3 Endpoint".to_string())?;
        let bucket = config
            .s3_bucket
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "请先配置 S3 Bucket".to_string())?
            .to_string();
        let access_key = config.s3_access_key.as_deref().unwrap_or("").trim();
        let secret_key = config.s3_secret_key.as_deref().unwrap_or("").trim();
        if access_key.is_empty() || secret_key.is_empty() {
            return Err("请先配置 S3 Access Key 和 Secret Key".to_string());
        }
        let object_key = config
            .s3_object_key
            .as_deref()
            .unwrap_or("MDnote/messages.json");
        let prefix = object_key
            .rsplit_once('/')
            .map(|(value, _)| value.trim_matches('/').to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "MDnote".to_string());
        let credentials =
            aws_sdk_s3::config::Credentials::new(access_key, secret_key, None, None, "mknote");
        // 同步属于后台任务，不能让网络异常无限期占住同步状态机。
        let timeout_config = aws_config::timeout::TimeoutConfig::builder()
            .connect_timeout(Duration::from_secs(5))
            .operation_timeout(Duration::from_secs(30))
            .build();
        let sdk_config = aws_config::defaults(BehaviorVersion::latest())
            .region(aws_sdk_s3::config::Region::new("us-east-1"))
            .endpoint_url(crate::s3_store::normalize_endpoint(endpoint)?)
            .credentials_provider(credentials)
            .timeout_config(timeout_config)
            .load()
            .await;
        let s3_config = aws_sdk_s3::config::Builder::from(&sdk_config)
            .force_path_style(true)
            .build();
        Ok(Self {
            client: Client::from_conf(s3_config),
            bucket,
            prefix,
        })
    }

    fn key(&self, suffix: &str) -> String {
        format!("{}/sync/{}", self.prefix, suffix)
    }

    async fn get(&self, key: &str) -> Result<Option<RemoteObject>, String> {
        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await;
        let output = match response {
            Ok(output) => output,
            Err(error) => {
                let details = format!("{}; {:?}", error, error);
                if is_missing_object_error(&details) {
                    return Ok(None);
                }
                return Err(format!("S3 读取同步对象失败：{details}"));
            }
        };
        let etag = output.e_tag().map(ToOwned::to_owned);
        let bytes = output
            .body
            .collect()
            .await
            .map_err(|error| format!("S3 读取同步对象正文失败：{error}"))?
            .into_bytes()
            .to_vec();
        Ok(Some(RemoteObject { bytes, etag }))
    }

    async fn put(
        &self,
        key: &str,
        bytes: Vec<u8>,
        if_match: Option<&str>,
        if_none_match: bool,
        content_type: &str,
    ) -> Result<Option<String>, String> {
        let mut request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(content_type)
            .body(ByteStream::from(bytes));
        if let Some(etag) = if_match {
            request = request.if_match(etag);
        }
        if if_none_match {
            request = request.if_none_match("*");
        }
        let output = request
            .send()
            .await
            .map_err(|error| s3_put_error_message(&error.to_string()))?;
        Ok(output.e_tag().map(ToOwned::to_owned))
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn decide_sync_with_state(
    base_hash: Option<&str>,
    local_hash: &str,
    remote_hash: Option<&str>,
    was_conflict: bool,
    previous_remote_hash: Option<&str>,
) -> SyncDecision {
    let Some(remote_hash) = remote_hash else {
        return if base_hash.is_some() {
            SyncDecision::UploadLocal
        } else {
            SyncDecision::Conflict
        };
    };
    if local_hash == remote_hash {
        return SyncDecision::Noop;
    }
    if was_conflict {
        // 冲突状态下，只有远端仍保持冲突时的版本，才允许用户后续编辑后的本地版本上传。
        // 远端一旦再次变化，继续保留本地并生成新的远端冲突副本，绝不静默覆盖。
        return if previous_remote_hash == Some(remote_hash) {
            if previous_remote_hash == Some(local_hash) {
                SyncDecision::Noop
            } else if base_hash != Some(local_hash) {
                SyncDecision::UploadLocal
            } else {
                SyncDecision::Conflict
            }
        } else {
            SyncDecision::Conflict
        };
    }
    match base_hash {
        Some(base) if local_hash == base => SyncDecision::DownloadRemote,
        Some(base) if remote_hash == base => SyncDecision::UploadLocal,
        _ => SyncDecision::Conflict,
    }
}

fn decide_sync(base_hash: Option<&str>, local_hash: &str, remote_hash: &str) -> SyncDecision {
    decide_sync_with_state(base_hash, local_hash, Some(remote_hash), false, None)
}

fn state_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(crate::paths::writable_base(app)?.join(".mknote-sync-state.json"))
}

fn acquire_sync_transaction_lock<R: Runtime>(app: &AppHandle<R>) -> Result<std::fs::File, String> {
    let path = state_path(app)?;
    crate::try_process_file_lock(&path)
}

fn conflict_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(crate::paths::writable_base(app)?.join(".mknote-sync-conflicts"))
}

fn load_state<R: Runtime>(app: &AppHandle<R>) -> Result<SyncState, String> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(SyncState {
            schema_version: SYNC_SCHEMA_VERSION,
            device_id: format!(
                "device-{}-{}",
                Utc::now().timestamp_millis(),
                std::process::id()
            ),
            items: BTreeMap::new(),
        });
    }
    let text =
        std::fs::read_to_string(path).map_err(|error| format!("读取同步状态失败：{error}"))?;
    let mut state: SyncState =
        serde_json::from_str(&text).map_err(|error| format!("同步状态格式错误：{error}"))?;
    if state.schema_version < SYNC_SCHEMA_VERSION {
        state.schema_version = SYNC_SCHEMA_VERSION;
    }
    Ok(state)
}

fn save_state<R: Runtime>(app: &AppHandle<R>, state: &SyncState) -> Result<(), String> {
    let path = state_path(app)?;
    let temp = path.with_extension(format!(
        "json.{}.{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    ));
    let data =
        serde_json::to_vec_pretty(state).map_err(|error| format!("序列化同步状态失败：{error}"))?;
    let write_result = (|| -> Result<(), String> {
        use std::io::Write;
        let mut file = std::fs::File::create(&temp)
            .map_err(|error| format!("创建同步状态临时文件失败：{error}"))?;
        file.write_all(&data)
            .map_err(|error| format!("写入同步状态临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步同步状态临时文件失败：{error}"))
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    std::fs::rename(&temp, &path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        format!("提交同步状态失败：{error}")
    })?;
    crate::sync_parent_directory(&path).map_err(|error| format!("同步同步状态父目录失败：{error}"))
}

fn item_path<R: Runtime>(app: &AppHandle<R>, item: &SyncItemId) -> Result<PathBuf, String> {
    let base = crate::paths::writable_base(app)?;
    item_path_in(&base, crate::quick_data::directories(app)?, item)
}

fn item_path_in(base: &Path, directories: &crate::quick_data::QuickDataDirectories, item: &SyncItemId) -> Result<PathBuf, String> {
    match item {
        SyncItemId::DefaultNote => Ok(base.join(crate::notes::DEFAULT_NOTE_NAME)),
        SyncItemId::QuickTodoDefault => directories.todo_path("default"),
        SyncItemId::QuickTodo(todo_id) => directories.todo_path(todo_id),
        SyncItemId::QuickPocketDefault => directories.pocket_path("default"),
        SyncItemId::QuickPocket(pocket_id) => directories.pocket_path(pocket_id),
    }
}

fn write_conflict<R: Runtime>(
    app: &AppHandle<R>,
    resource: &SyncResource,
    bytes: &[u8],
    device_id: &str,
    source: &str,
) -> Result<Option<AppliedFileChange>, String> {
    let directory = conflict_dir(app)?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("创建同步冲突目录失败：{error}"))?;
    let filename = conflict_filename(resource, device_id, bytes, source);
    let path = directory.join(filename);
    let _guard = crate::try_process_file_lock(&path)?;
    if path.exists() {
        return Ok(None);
    }
    atomic_replace(&path, bytes).map_err(|error| format!("写入同步冲突副本失败：{error}"))?;
    Ok(Some(AppliedFileChange { path, original: None, written: bytes.to_vec() }))
}

fn conflict_filename(
    resource: &SyncResource,
    device_id: &str,
    bytes: &[u8],
    source: &str,
) -> String {
    let content_hash = hash_bytes(bytes);
    let hash_suffix = content_hash
        .strip_prefix("sha256:")
        .unwrap_or(&content_hash);
    let extension = if resource.is_note() { "md" } else { "json" };
    format!(
        "{}-{}-{}-{}.{}",
        resource.conflict_stem(),
        device_id,
        source,
        &hash_suffix[..12.min(hash_suffix.len())],
        extension
    )
}

#[cfg(windows)]
fn replace_sync_file(temp: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temp_wide: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        MoveFileExW(
            PCWSTR(temp_wide.as_ptr()),
            PCWSTR(target_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| format!("替换同步本地文件失败：{error}"))
}

#[cfg(not(windows))]
fn replace_sync_file(temp: &Path, target: &Path) -> Result<(), String> {
    std::fs::rename(temp, target).map_err(|error| format!("替换同步本地文件失败：{error}"))
}

fn atomic_replace(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建同步本地目录失败：{error}"))?;
    }
    let temp = path.with_extension(format!(
        "md.sync.{}.{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    ));
    let result = (|| -> Result<(), String> {
        use std::io::Write;
        let mut file = std::fs::File::create(&temp)
            .map_err(|error| format!("创建同步临时文件失败：{error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("写入同步临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步同步临时文件失败：{error}"))?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    replace_sync_file(&temp, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        error
    })?;
    crate::sync_parent_directory(path).map_err(|error| format!("同步同步文件父目录失败：{error}"))
}

fn should_preserve_bootstrap_local(local: Option<&[u8]>, remote: &[u8]) -> bool {
    local.is_some_and(|bytes| bytes != remote)
}

fn read_optional_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "读取同步本地文件失败（{}）：{error}",
            path.display()
        )),
    }
}

struct AppliedFileChange {
    path: PathBuf,
    original: Option<Vec<u8>>,
    written: Vec<u8>,
}

fn apply_note_download(
    originals: &mut Vec<AppliedFileChange>,
    path: &Path,
    expected: Option<&[u8]>,
    bytes: &[u8],
) -> Result<(), String> {
    let _guard = crate::try_process_file_lock(path)?;
    if read_optional_file(path)?.as_deref() != expected {
        return Err(format!("同步期间本地文件已变化，保留本地内容：{}", path.display()));
    }
    originals.push(AppliedFileChange {
        path: path.to_path_buf(), original: expected.map(ToOwned::to_owned), written: bytes.to_vec(),
    });
    atomic_replace(path, bytes)
}

fn rollback_file_changes(originals: &[AppliedFileChange]) -> Result<(), String> {
    let mut errors = Vec::new();
    for change in originals.iter().rev() {
        let result = (|| {
            let _guard = crate::try_process_file_lock(&change.path)?;
            let current = read_optional_file(&change.path)?;
            if current == change.original { return Ok(()); }
            if current.as_deref() != Some(change.written.as_slice()) {
                return Err(format!("回滚时本地文件已变化，保留新内容：{}", change.path.display()));
            }
            restore_optional_file(&change.path, change.original.as_deref())
        })();
        if let Err(error) = result { errors.push(error); }
    }
    if errors.is_empty() { Ok(()) } else { Err(errors.join("；")) }
}

fn rollback_created_conflicts(changes: &[AppliedFileChange]) -> Result<(), String> {
    rollback_file_changes(changes)
}

#[derive(Clone)]
struct SyncConfigSnapshot {
    quick_todos: Vec<crate::QuickTodoDefinition>,
    quick_pockets: Vec<crate::QuickPocketDefinition>,
    sync_enabled: bool,
    sync_initialized: bool,
}

impl From<&crate::AppConfig> for SyncConfigSnapshot {
    fn from(config: &crate::AppConfig) -> Self {
        Self {
            quick_todos: config.quick_todos.clone(),
            quick_pockets: config.quick_pockets.clone(),
            sync_enabled: config.sync_enabled,
            sync_initialized: config.sync_initialized,
        }
    }
}

struct SyncConfigChange { before: SyncConfigSnapshot, after: SyncConfigSnapshot }

impl SyncConfigChange {
    fn apply(&self, current: &mut crate::AppConfig) -> Result<(), String> {
        // Validate every changed field before mutating any field.
        macro_rules! validate { ($field:ident) => {
            if self.before.$field != self.after.$field && current.$field != self.before.$field {
                return Err(format!("同步配置已被并发修改：{}", stringify!($field)));
            }
        }; }
        validate!(quick_todos); validate!(quick_pockets);
        validate!(sync_enabled); validate!(sync_initialized);
        macro_rules! apply { ($field:ident) => {
            if self.before.$field != self.after.$field { current.$field = self.after.$field.clone(); }
        }; }
        apply!(quick_todos); apply!(quick_pockets); apply!(sync_enabled); apply!(sync_initialized);
        Ok(())
    }

    fn rollback(&self, current: &mut crate::AppConfig) -> Vec<String> {
        let mut errors = Vec::new();
        macro_rules! restore { ($field:ident) => {
            if self.before.$field != self.after.$field && current.$field != self.before.$field {
                if current.$field == self.after.$field { current.$field = self.before.$field.clone(); }
                else { errors.push(format!("回滚保留并发配置修改：{}", stringify!($field))); }
            }
        }; }
        restore!(quick_todos); restore!(quick_pockets); restore!(sync_enabled); restore!(sync_initialized);
        errors
    }
}

fn apply_sync_config(before: &crate::AppConfig, after: &crate::AppConfig, journal: &mut Vec<SyncConfigChange>) -> Result<(), String> {
    let change = SyncConfigChange { before: before.into(), after: after.into() };
    crate::update_config(|current| {
        change.apply(current)?;
        // Record before persistence, including failures after the atomic replacement.
        journal.push(change);
        Ok(())
    })?;
    Ok(())
}

fn rollback_sync_config(journal: &[SyncConfigChange]) -> Result<(), String> {
    if journal.is_empty() { return Ok(()); }
    let mut errors = Vec::new();
    crate::update_config(|current| {
        for change in journal.iter().rev() { errors.extend(change.rollback(current)); }
        Ok(())
    })?;
    if errors.is_empty() { Ok(()) } else { Err(errors.join("；")) }
}

fn restore_optional_file(path: &Path, original: Option<&[u8]>) -> Result<(), String> {
    match original {
        Some(bytes) => atomic_replace(path, bytes),
        None => match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("删除回滚文件失败（{}）：{error}", path.display())),
        },
    }
}

fn rollback_bootstrap_transaction(
    originals: &[AppliedFileChange],
    state_path: &Path,
    original_state: Option<&[u8]>,
    created_conflicts: &[AppliedFileChange],
) -> Result<(), String> {
    let mut errors = Vec::new();
    if let Err(error) = rollback_file_changes(originals) {
        errors.push(error);
    }
    if let Err(error) = restore_optional_file(state_path, original_state) {
        errors.push(format!("恢复同步状态失败：{error}"));
    }
    if let Err(error) = rollback_created_conflicts(created_conflicts) {
        errors.push(error);
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

fn bootstrap_failure_with_rollback(
    error: String,
    originals: &[AppliedFileChange],
    state_path: &Path,
    original_state: Option<&[u8]>,
    config_changes: &[SyncConfigChange],
    created_conflicts: &[AppliedFileChange],
) -> String {
    let mut rollback_errors = Vec::new();
    if let Err(rollback_error) =
        rollback_bootstrap_transaction(originals, state_path, original_state, created_conflicts)
    {
        rollback_errors.push(rollback_error);
    }
    if let Err(config_error) = rollback_sync_config(config_changes) {
        rollback_errors.push(format!("恢复配置失败：{config_error}"));
    }
    if rollback_errors.is_empty() {
        error
    } else {
        format!(
            "{error}；bootstrap 回滚失败：{}",
            rollback_errors.join("；")
        )
    }
}

fn apply_bootstrap_files(files: &[(PathBuf, Vec<u8>)]) -> Result<Vec<AppliedFileChange>, String> {
    let mut originals = Vec::new();
    for (path, bytes) in files {
        // Bootstrap only fills missing files. Recheck under the same lock used
        // by normal note, Todo and Pocket writers after all network awaits.
        if let Err(error) = apply_note_download(&mut originals, path, None, bytes) {
            return match rollback_file_changes(&originals) {
                Ok(()) => Err(error),
                Err(rollback) => Err(format!("{error}；同步回滚失败：{rollback}")),
            };
        }
    }
    Ok(originals)
}

fn parse_manifest(object: Option<RemoteObject>) -> Result<(SyncManifest, Option<String>), String> {
    let Some(object) = object else {
        return Ok((SyncManifest::default(), None));
    };
    let manifest = serde_json::from_slice(&object.bytes)
        .map_err(|error| format!("同步 manifest 格式错误：{error}"))?;
    Ok((manifest, object.etag))
}

async fn load_remote(remote: &SyncRemote) -> Result<(SyncManifest, Option<String>), String> {
    parse_manifest(remote.get(&remote.key("manifest.json")).await?)
}

fn parse_pocket_registry(bytes: &[u8]) -> Result<Vec<crate::QuickPocketDefinition>, String> {
    let pockets: Vec<crate::QuickPocketDefinition> = serde_json::from_slice(bytes)
        .map_err(|error| format!("云端 Quick Pocket 注册表格式错误：{error}"))?;
    let mut seen = std::collections::HashSet::new();
    for pocket in &pockets {
        if pocket.id.is_empty()
            || pocket.id == "default"
            || !pocket.id.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '_' || character == '-'
            })
        {
            return Err("云端 Quick Pocket 注册表包含无效 ID".to_string());
        }
        if pocket.name.trim().is_empty()
            || pocket.name.chars().count() > 6
            || !seen.insert(pocket.id.clone())
        {
            return Err("云端 Quick Pocket 注册表包含重复或无效名称".to_string());
        }
    }
    Ok(pockets)
}

fn parse_todo_registry(bytes: &[u8]) -> Result<Vec<crate::QuickTodoDefinition>, String> {
    let todos: Vec<crate::QuickTodoDefinition> = serde_json::from_slice(bytes)
        .map_err(|error| format!("云端 Quick Todo 注册表格式错误：{error}"))?;
    let mut seen = std::collections::HashSet::new();
    for todo in &todos {
        if todo.id == crate::quick_todo::DEFAULT_QUICK_TODO_ID
            || !todo.id.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '_' || character == '-'
            })
            || todo.name.trim().is_empty()
            || todo.name.chars().count() > 6
            || !seen.insert(todo.id.clone())
        {
            return Err("云端 Quick Todo 注册表包含重复或无效项目".to_string());
        }
    }
    Ok(todos)
}

fn registry_bytes<R: Runtime>(
    _app: &AppHandle<R>,
    config: &crate::AppConfig,
    resource: &SyncResource,
) -> Result<Vec<u8>, String> {
    let bytes = match resource {
        SyncResource::QuickTodoRegistry => serde_json::to_vec_pretty(&config.quick_todos),
        SyncResource::QuickPocketRegistry => serde_json::to_vec_pretty(&config.quick_pockets),
        SyncResource::Note(_) => return Err("便签资源不能按注册表读取".to_string()),
    };
    bytes.map_err(|error| format!("序列化同步注册表失败：{error}"))
}

fn apply_registry_bytes(
    config: &mut crate::AppConfig,
    resource: &SyncResource,
    bytes: &[u8],
) -> Result<bool, String> {
    match resource {
        SyncResource::QuickTodoRegistry => {
            let todos = parse_todo_registry(bytes)?;
            if config.quick_todos == todos {
                return Ok(false);
            }
            config.quick_todos = todos;
        }
        SyncResource::QuickPocketRegistry => {
            let pockets = parse_pocket_registry(bytes)?;
            if config.quick_pockets == pockets {
                return Ok(false);
            }
            config.quick_pockets = pockets;
        }
        SyncResource::Note(_) => return Err("便签资源不能按注册表应用".to_string()),
    }
    Ok(true)
}

fn read_resource_local<R: Runtime>(
    app: &AppHandle<R>,
    config: &crate::AppConfig,
    resource: &SyncResource,
) -> Result<Option<Vec<u8>>, String> {
    match resource {
        SyncResource::Note(item) => read_optional_file(&item_path(app, item)?),
        SyncResource::QuickTodoRegistry | SyncResource::QuickPocketRegistry => {
            Ok(Some(registry_bytes(app, config, resource)?))
        }
    }
}

async fn save_manifest_with_retry(
    remote: &SyncRemote,
    mut manifest: SyncManifest,
    mut manifest_etag: Option<String>,
    changed_items: &BTreeMap<String, SyncManifestItem>,
    replace_changed: bool,
) -> Result<SyncManifest, String> {
    for _ in 0..3 {
        manifest.generation += 1;
        match remote
            .put(
                &remote.key("manifest.json"),
                manifest_bytes(&manifest)?,
                manifest_etag.as_deref(),
                manifest_create_precondition(manifest_etag.as_deref()),
                "application/json",
            )
            .await
        {
            Ok(_) => return Ok(manifest),
            Err(error) if error.contains("版本已变化") => {
                let (mut latest, latest_etag) = load_remote(remote).await?;
                if replace_changed {
                    merge_manifest_entries_for_upload(&mut latest, changed_items);
                } else {
                    merge_manifest_entries_without_overwriting_latest(&mut latest, changed_items);
                }
                manifest = latest;
                manifest_etag = latest_etag;
            }
            Err(error) => return Err(error),
        }
    }
    Err("S3 同步 manifest 连续发生版本冲突，请稍后重试".to_string())
}

fn merge_manifest_entries_without_overwriting_latest(
    latest: &mut SyncManifest,
    candidate: &BTreeMap<String, SyncManifestItem>,
) {
    // 412 之后 latest 是并发设备刚写入的权威快照。候选快照可能已过时，
    // 尤其是 bootstrap 会把整个旧 manifest 作为 candidate；只补充远端尚不存在
    // 的键，绝不覆盖已有的内容 hash、revision 或 etag。
    for (item, entry) in candidate {
        latest
            .items
            .entry(item.clone())
            .or_insert_with(|| entry.clone());
    }
}

fn merge_manifest_entries_for_upload(
    latest: &mut SyncManifest,
    candidate: &BTreeMap<String, SyncManifestItem>,
) {
    // 对象已经通过 ETag 条件写入成功，候选项代表该对象当前可验证的内容；
    // 只覆盖本次上传的键，保留其它设备对其它资源的最新 manifest 条目。
    for (item, entry) in candidate {
        latest.items.insert(item.clone(), entry.clone());
    }
}

fn manifest_create_precondition(etag: Option<&str>) -> bool {
    etag.is_none()
}

fn manifest_bytes(manifest: &SyncManifest) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("序列化同步 manifest 失败：{error}"))
}

fn publish_status<R: Runtime>(app: &AppHandle<R>, status: &SyncStatus) {
    let _ = app.emit(SYNC_STATUS_EVENT, status);
}

pub fn status<R: Runtime>(app: &AppHandle<R>) -> Result<SyncStatus, String> {
    let config = crate::load_config()?;
    let state = load_state(app)?;
    let conflicts = state.items.values().filter(|item| item.conflict).count();
    Ok(SyncStatus {
        enabled: config.sync_enabled,
        initialized: config.sync_initialized,
        state: if conflicts > 0 {
            "conflict"
        } else if config.sync_enabled {
            "ready"
        } else {
            "disabled"
        }
        .to_string(),
        pending_items: 0,
        conflicts,
        last_success_at_ms: None,
        last_error: None,
    })
}

pub fn set_enabled(enabled: bool) -> Result<crate::AppConfig, String> {
    crate::update_config(|config| {
        config.sync_enabled = enabled;
        Ok(())
    })
}

pub async fn bootstrap<R: Runtime>(app: &AppHandle<R>, mode: &str) -> Result<SyncStatus, String> {
    if mode != "remote" {
        return Err("当前版本仅支持从云端建立同步基线，已禁止本地上传覆盖云端".to_string());
    }
    let _sync_transaction_lock = acquire_sync_transaction_lock(app)?;
    let original_config = crate::load_config()?;
    let config = original_config.clone();
    let mut config_changes = Vec::new();
    let remote = SyncRemote::from_config(&config).await?;
    let (mut manifest, manifest_etag) = load_remote(&remote).await?;
    let mut state = load_state(app)?;
    let registry_resources = [
        SyncResource::QuickTodoRegistry,
        SyncResource::QuickPocketRegistry,
    ];
    let mut remote_registry_objects = Vec::new();
    let mut remote_items = SyncItemId::all(&config);
    for resource in registry_resources.iter().cloned() {
        let Some(object) = remote.get(&remote.key(&resource.remote_suffix())).await? else {
            continue;
        };
        match resource {
            SyncResource::QuickTodoRegistry => {
                remote_items.extend(
                    parse_todo_registry(&object.bytes)?
                        .into_iter()
                        .map(|todo| SyncItemId::QuickTodo(todo.id)),
                );
            }
            SyncResource::QuickPocketRegistry => {
                remote_items.extend(
                    parse_pocket_registry(&object.bytes)?
                        .into_iter()
                        .map(|pocket| SyncItemId::QuickPocket(pocket.id)),
                );
            }
            SyncResource::Note(_) => unreachable!(),
        }
        remote_registry_objects.push((resource, object));
    }
    remote_items.sort_by_key(SyncItemId::as_str);
    remote_items.dedup();

    let mut resources = registry_resources.iter().cloned().collect::<Vec<_>>();
    resources.extend(remote_items.into_iter().map(SyncResource::Note));
    let mut bootstrap_files = Vec::new();
    let mut created_conflicts = Vec::new();
    let remote_objects = remote_registry_objects;
    for resource in resources {
        let object = if let Some((_, object)) =
            remote_objects.iter().find(|(known, _)| known == &resource)
        {
            Some(RemoteObject {
                bytes: object.bytes.clone(),
                etag: object.etag.clone(),
            })
        } else {
            remote.get(&remote.key(&resource.remote_suffix())).await?
        };
        let local = read_resource_local(app, &config, &resource)?;
        let local_hash = local.as_deref().map(hash_bytes);
        let remote_hash = object.as_ref().map(|value| hash_bytes(&value.bytes));
        let revision = manifest
            .items
            .get(&resource.state_key())
            .map(|entry| entry.revision)
            .unwrap_or(0);

        if let Some(object) = object {
            let local_matches = local
                .as_deref()
                .map(|bytes| bytes == object.bytes.as_slice())
                .unwrap_or(false);
            let conflict = local.is_some() && !local_matches;
            if conflict {
                if let Some(path) =
                    write_conflict(app, &resource, &object.bytes, &state.device_id, "remote")?
                {
                    created_conflicts.push(path);
                }
            } else if local.is_none() {
                if let SyncResource::Note(item) = &resource {
                    let path = item_path(app, item)?;
                    bootstrap_files.push((path, object.bytes.clone()));
                }
            }
            let content_hash = local_hash
                .clone()
                .unwrap_or_else(|| remote_hash.clone().unwrap_or_else(|| hash_bytes(&[])));
            state.items.insert(
                resource.state_key(),
                SyncStateItem {
                    content_hash,
                    revision,
                    etag: object.etag.clone(),
                    remote_hash: remote_hash.clone(),
                    conflict,
                },
            );
            manifest
                .items
                .entry(resource.state_key())
                .or_insert(SyncManifestItem {
                    revision,
                    content_hash: remote_hash.unwrap_or_else(|| hash_bytes(&[])),
                    etag: object.etag,
                });
        } else if let Some(local_hash) = local_hash {
            // 首次建基线不主动创建云端对象，但记录本地版本；下一次普通同步会用
            // If-None-Match 创建对象，避免 bootstrap 的“远端模式”偷偷覆盖云端。
            state.items.insert(
                resource.state_key(),
                SyncStateItem {
                    content_hash: local_hash,
                    revision,
                    etag: None,
                    remote_hash: None,
                    conflict: false,
                },
            );
        }
    }
    let state_file_path = state_path(app)?;
    let original_state = read_optional_file(&state_file_path)?;
    let bootstrap_originals = apply_bootstrap_files(&bootstrap_files)?;
    if let Err(error) = save_state(app, &state) {
        return Err(bootstrap_failure_with_rollback(
            error,
            &bootstrap_originals,
            &state_file_path,
            original_state.as_deref(),
            &config_changes,
            &created_conflicts,
        ));
    }
    let mut initialized = original_config.clone();
    initialized.sync_initialized = true;
    initialized.sync_enabled = true;
    if let Err(error) = apply_sync_config(&original_config, &initialized, &mut config_changes) {
        return Err(bootstrap_failure_with_rollback(
            error,
            &bootstrap_originals,
            &state_file_path,
            original_state.as_deref(),
            &config_changes,
            &created_conflicts,
        ));
    }
    let changed_items = manifest.items.clone();
    if let Err(error) =
        save_manifest_with_retry(&remote, manifest, manifest_etag, &changed_items, false).await
    {
        return Err(bootstrap_failure_with_rollback(
            error,
            &bootstrap_originals,
            &state_file_path,
            original_state.as_deref(),
            &config_changes,
            &created_conflicts,
        ));
    }
    let result = status(app)?;
    publish_status(app, &result);
    Ok(result)
}

pub async fn tick<R: Runtime>(
    app: &AppHandle<R>,
    editor_dirty: bool,
) -> Result<SyncStatus, String> {
    let _sync_transaction_lock = acquire_sync_transaction_lock(app)?;
    let mut config_changes = Vec::new();
    let sync_state_path = state_path(app)?;
    let original_state = read_optional_file(&sync_state_path)?;
    let mut originals = Vec::new();
    let mut created_conflicts = Vec::new();
    match tick_inner(app, editor_dirty, &mut originals, &mut created_conflicts, &mut config_changes).await {
        Ok(status) => Ok(status),
        Err(error) => {
            let rollback_result = rollback_tick_transaction(
                &originals,
                &sync_state_path,
                original_state.as_deref(),
                &config_changes,
                &created_conflicts,
            );
            match rollback_result {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!("{error}；同步事务回滚失败：{rollback_error}")),
            }
        }
    }
}

pub async fn resolve_conflicts<R: Runtime>(
    app: &AppHandle<R>,
    resolution: &str,
) -> Result<SyncStatus, String> {
    let resolution = parse_conflict_resolution(resolution)
        .ok_or_else(|| "冲突解决方式必须是 local 或 remote".to_string())?;
    let _sync_transaction_lock = acquire_sync_transaction_lock(app)?;
    let mut config_changes = Vec::new();
    let sync_state_path = state_path(app)?;
    let original_state = read_optional_file(&sync_state_path)?;
    let mut originals = Vec::new();
    let mut created_conflicts = Vec::new();

    match resolve_conflicts_inner(
        app,
        resolution,
        &mut originals,
        &mut created_conflicts,
        &mut config_changes,
    )
    .await
    {
        Ok(status) => Ok(status),
        Err(error) => {
            let rollback_result = rollback_tick_transaction(
                &originals,
                &sync_state_path,
                original_state.as_deref(),
                &config_changes,
                &created_conflicts,
            );
            match rollback_result {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}；同步冲突解决事务回滚失败：{rollback_error}"
                )),
            }
        }
    }
}

async fn resolve_conflicts_inner<R: Runtime>(
    app: &AppHandle<R>,
    resolution: ConflictResolution,
    originals: &mut Vec<AppliedFileChange>,
    created_conflicts: &mut Vec<AppliedFileChange>,
    config_changes: &mut Vec<SyncConfigChange>,
) -> Result<SyncStatus, String> {
    let mut config = crate::load_config()?;
    let original_config = config.clone();
    if !config.sync_initialized {
        return Err("同步尚未初始化，无法解决冲突".to_string());
    }
    let remote = SyncRemote::from_config(&config).await?;
    let (mut manifest, manifest_etag) = load_remote(&remote).await?;
    let mut state = load_state(app)?;
    let conflict_keys = state
        .items
        .iter()
        .filter(|(_, item)| item.conflict)
        .map(|(key, _)| key.clone())
        .collect::<Vec<_>>();
    if conflict_keys.is_empty() {
        return status(app);
    }

    let mut changed_items = Vec::new();
    let mut changed_manifest = BTreeMap::new();
    let mut registry_changed = false;

    for state_key in conflict_keys {
        let resource = resource_from_state_key(&state_key)
            .ok_or_else(|| format!("同步状态包含无法识别的冲突项目：{state_key}"))?;
        let previous = state
            .items
            .get(&state_key)
            .cloned()
            .ok_or_else(|| format!("同步状态缺少冲突项目：{state_key}"))?;
        let local = read_resource_local(app, &config, &resource)?;
        let remote_object = remote.get(&remote.key(&resource.remote_suffix())).await?;

        match resolution {
            ConflictResolution::Local => {
                let local = local.ok_or_else(|| {
                    format!("冲突项目的本地版本不存在，已停止处理：{state_key}")
                })?;
                let uploaded =
                    upload_local_resource(&remote, &resource, &local, remote_object.as_ref())
                        .await?;
                let uploaded_hash = hash_bytes(&uploaded.bytes);
                let next_revision = manifest
                    .items
                    .get(&state_key)
                    .map(|entry| entry.revision)
                    .or(Some(previous.revision))
                    .unwrap_or(0)
                    .saturating_add(1);
                let entry = SyncManifestItem {
                    revision: next_revision,
                    content_hash: uploaded_hash.clone(),
                    etag: uploaded.etag.clone(),
                };
                changed_manifest.insert(state_key.clone(), entry.clone());
                manifest.items.insert(state_key.clone(), entry);
                state.items.insert(
                    state_key,
                    SyncStateItem {
                        content_hash: uploaded_hash.clone(),
                        revision: next_revision,
                        etag: uploaded.etag,
                        remote_hash: Some(uploaded_hash),
                        conflict: false,
                    },
                );
            }
            ConflictResolution::Remote => {
                let remote_object = remote_object
                    .ok_or_else(|| format!("冲突项目的云端版本不存在，已停止处理：{state_key}"))?;
                if let Some(local) = local.as_deref() {
                    if let Some(path) =
                        write_conflict(app, &resource, local, &state.device_id, "local-resolution")?
                    {
                        created_conflicts.push(path);
                    }
                }
                if resource.is_note() {
                    let SyncResource::Note(item) = &resource else {
                        unreachable!();
                    };
                    let path = item_path(app, item)?;
                    apply_note_download(originals, &path, local.as_deref(), &remote_object.bytes)?;
                    changed_items.push(item.clone());
                } else {
                    registry_changed |= apply_registry_bytes(
                        &mut config,
                        &resource,
                        &remote_object.bytes,
                    )?;
                }
                let remote_hash = hash_bytes(&remote_object.bytes);
                let revision = manifest
                    .items
                    .get(&state_key)
                    .map(|entry| entry.revision)
                    .unwrap_or(previous.revision);
                state.items.insert(
                    state_key,
                    SyncStateItem {
                        content_hash: remote_hash.clone(),
                        revision,
                        etag: remote_object.etag,
                        remote_hash: Some(remote_hash),
                        conflict: false,
                    },
                );
            }
        }
    }

    if registry_changed {
        apply_sync_config(&original_config, &config, config_changes)?;
        let _ = app.emit("mknote:quick-todo-registry-changed", ());
        let _ = app.emit("mknote:quick-pocket-registry-changed", ());
    }
    if !changed_manifest.is_empty() {
        save_manifest_with_retry(&remote, manifest, manifest_etag, &changed_manifest, true).await?;
    }
    save_state(app, &state)?;
    for item in changed_items {
        if item == SyncItemId::DefaultNote {
            let _ = app.emit("mknote:default-note-changed", ());
        }
        if item == SyncItemId::QuickTodoDefault {
            let _ = app.emit("mknote:quick-todo-changed:default", ());
        }
        if let SyncItemId::QuickTodo(todo_id) = &item {
            let _ = app.emit(&format!("mknote:quick-todo-changed:{todo_id}"), ());
        }
        if item == SyncItemId::QuickPocketDefault {
            let _ = app.emit("mknote:quick-pocket-changed:default", ());
        }
        if let SyncItemId::QuickPocket(pocket_id) = &item {
            let _ = app.emit(&format!("mknote:quick-pocket-changed:{pocket_id}"), ());
        }
    }
    let result = status(app)?;
    publish_status(app, &result);
    Ok(result)
}

fn rollback_tick_transaction(
    originals: &[AppliedFileChange],
    state_path: &Path,
    original_state: Option<&[u8]>,
    config_changes: &[SyncConfigChange],
    created_conflicts: &[AppliedFileChange],
) -> Result<(), String> {
    let mut errors = Vec::new();
    if let Err(error) = rollback_file_changes(originals) {
        errors.push(error);
    }
    if let Err(error) = restore_optional_file(state_path, original_state) {
        errors.push(format!("恢复同步状态失败：{error}"));
    }
    if let Err(error) = rollback_sync_config(config_changes) {
        errors.push(format!("恢复同步配置失败：{error}"));
    }
    if let Err(error) = rollback_created_conflicts(created_conflicts) {
        errors.push(error);
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

async fn upload_local_resource(
    remote: &SyncRemote,
    resource: &SyncResource,
    local: &[u8],
    remote_object: Option<&RemoteObject>,
) -> Result<RemoteObject, String> {
    let key = remote.key(&resource.remote_suffix());
    let if_match = remote_object.and_then(|object| object.etag.as_deref());
    let if_none_match = remote_object.is_none();
    if remote_object.is_some() && if_match.is_none() {
        return Err(format!(
            "同步对象缺少 ETag，已停止上传 {}",
            resource.state_key()
        ));
    }
    remote
        .put(
            &key,
            local.to_vec(),
            if_match,
            if_none_match,
            if resource.is_note() {
                "text/markdown; charset=utf-8"
            } else {
                "application/json"
            },
        )
        .await?;
    let uploaded = remote
        .get(&key)
        .await?
        .ok_or_else(|| format!("上传后无法读取同步对象 {}", resource.state_key()))?;
    if uploaded.bytes != local {
        return Err(format!("上传后同步对象校验失败 {}", resource.state_key()));
    }
    Ok(uploaded)
}

async fn sync_one_resource<R: Runtime>(
    app: &AppHandle<R>,
    remote: &SyncRemote,
    config: &mut crate::AppConfig,
    state: &mut SyncState,
    manifest: &SyncManifest,
    resource: &SyncResource,
    editor_guard: (bool, u64),
    originals: &mut Vec<AppliedFileChange>,
    created_conflicts: &mut Vec<AppliedFileChange>,
    changed_items: &mut Vec<SyncItemId>,
    changed_manifest: &mut BTreeMap<String, SyncManifestItem>,
) -> Result<bool, String> {
    let local = read_resource_local(app, config, resource)?;
    let local_hash = local.as_deref().map(hash_bytes);
    let state_key = resource.state_key();
    let previous = state.items.get(&state_key);
    let base_hash = previous.map(|entry| entry.content_hash.as_str());
    let remote_object = remote.get(&remote.key(&resource.remote_suffix())).await?;
    let remote_hash = remote_object
        .as_ref()
        .map(|object| hash_bytes(&object.bytes));
    let decision = if let Some(local_hash) = local_hash.as_deref() {
        decide_sync_with_state(
            base_hash,
            local_hash,
            remote_hash.as_deref(),
            previous.map(|entry| entry.conflict).unwrap_or(false),
            previous.and_then(|entry| entry.remote_hash.as_deref()),
        )
    } else if previous.is_none() && remote_object.is_some() {
        // 新设备上的自定义便签可能还没有本地文件；只有确认本地没有任何版本时才下载。
        SyncDecision::DownloadRemote
    } else if previous.is_some() && remote_object.is_some() {
        // 已纳入同步的文件被本地删除时也视为本地变化，绝不用云端静默复原。
        SyncDecision::Conflict
    } else {
        SyncDecision::Noop
    };
    let revision = manifest
        .items
        .get(&state_key)
        .map(|entry| entry.revision)
        .or_else(|| previous.map(|entry| entry.revision))
        .unwrap_or(0);

    match decision {
        SyncDecision::Noop => {
            if let (Some(local_hash), Some(remote_object)) =
                (local_hash.clone(), remote_object.as_ref())
            {
                state.items.insert(
                    state_key.clone(),
                    SyncStateItem {
                        content_hash: local_hash.clone(),
                        revision,
                        etag: remote_object.etag.clone(),
                        remote_hash: Some(local_hash.clone()),
                        conflict: false,
                    },
                );
                if manifest
                    .items
                    .get(&state_key)
                    .map(|entry| {
                        entry.content_hash != local_hash || entry.etag != remote_object.etag
                    })
                    .unwrap_or(true)
                {
                    changed_manifest.insert(
                        state_key.clone(),
                        SyncManifestItem {
                            revision,
                            content_hash: local_hash,
                            etag: remote_object.etag.clone(),
                        },
                    );
                }
            }
        }
        SyncDecision::DownloadRemote => {
            let Some(remote_object) = remote_object.as_ref() else {
                return Ok(false);
            };
            if matches!(resource, SyncResource::Note(SyncItemId::DefaultNote))
                && defer_default_download(editor_guard.0, editor_guard.1) {
                // 编辑器尚未落盘时只延后下载，下一次检查重新比较，绝不写入当前便签。
                return Ok(false);
            }
            if resource.is_note() {
                let SyncResource::Note(item) = resource else {
                    unreachable!();
                };
                let path = item_path(app, item)?;
                apply_note_download(originals, &path, local.as_deref(), &remote_object.bytes)?;
                changed_items.push(item.clone());
            } else if apply_registry_bytes(config, resource, &remote_object.bytes)? {
                // 配置在调用方统一落盘，确保注册表和其文件资源使用同一份内存快照。
            }
            state.items.insert(
                state_key.clone(),
                SyncStateItem {
                    content_hash: remote_hash.clone().unwrap_or_default(),
                    revision,
                    etag: remote_object.etag.clone(),
                    remote_hash,
                    conflict: false,
                },
            );
        }
        SyncDecision::UploadLocal => {
            let Some(local) = local.as_ref() else {
                return Ok(false);
            };
            let uploaded =
                upload_local_resource(remote, resource, local, remote_object.as_ref()).await?;
            let uploaded_hash = hash_bytes(&uploaded.bytes);
            let next_revision = revision.saturating_add(1);
            let entry = SyncManifestItem {
                revision: next_revision,
                content_hash: uploaded_hash.clone(),
                etag: uploaded.etag.clone(),
            };
            changed_manifest.insert(state_key.clone(), entry);
            state.items.insert(
                state_key,
                SyncStateItem {
                    content_hash: uploaded_hash.clone(),
                    revision: next_revision,
                    etag: uploaded.etag,
                    remote_hash: Some(uploaded_hash),
                    conflict: false,
                },
            );
        }
        SyncDecision::Conflict => {
            let Some(remote_object) = remote_object.as_ref() else {
                // 远端缺失且没有可安全比较的基线时保持本地，不创建虚假的冲突副本。
                return Ok(false);
            };
            if let Some(path) = write_conflict(
                app,
                resource,
                &remote_object.bytes,
                &state.device_id,
                "remote",
            )? {
                created_conflicts.push(path);
            }
            state.items.insert(
                state_key,
                SyncStateItem {
                    content_hash: local_hash
                        .or_else(|| previous.map(|entry| entry.content_hash.clone()))
                        .unwrap_or_default(),
                    revision,
                    etag: remote_object.etag.clone(),
                    remote_hash,
                    conflict: true,
                },
            );
        }
    }
    Ok(matches!(
        resource,
        SyncResource::QuickTodoRegistry | SyncResource::QuickPocketRegistry
    ) && matches!(decision, SyncDecision::DownloadRemote))
}

async fn tick_inner<R: Runtime>(
    app: &AppHandle<R>,
    editor_dirty: bool,
    originals: &mut Vec<AppliedFileChange>,
    created_conflicts: &mut Vec<AppliedFileChange>,
    config_changes: &mut Vec<SyncConfigChange>,
) -> Result<SyncStatus, String> {
    let editor_epoch = default_note_edit_epoch();
    let mut config = crate::load_config()?;
    let original_config = config.clone();
    if !config.sync_enabled || !config.sync_initialized {
        return status(app);
    }
    let remote = SyncRemote::from_config(&config).await?;
    let (mut manifest, manifest_etag) = load_remote(&remote).await?;
    let mut state = load_state(app)?;
    let mut changed_items = Vec::new();
    let mut changed_manifest = BTreeMap::new();
    let mut registry_changed = false;

    for resource in [
        SyncResource::QuickTodoRegistry,
        SyncResource::QuickPocketRegistry,
    ] {
        registry_changed |= sync_one_resource(
            app,
            &remote,
            &mut config,
            &mut state,
            &manifest,
            &resource,
            (false, editor_epoch),
            originals,
            created_conflicts,
            &mut changed_items,
            &mut changed_manifest,
        )
        .await?;
    }
    if registry_changed {
        apply_sync_config(&original_config, &config, config_changes)?;
        let _ = app.emit("mknote:quick-todo-registry-changed", ());
        let _ = app.emit("mknote:quick-pocket-registry-changed", ());
    }

    let mut resources = SyncItemId::all(&config)
        .into_iter()
        .map(SyncResource::Note)
        .collect::<Vec<_>>();
    for resource in resources.drain(..) {
        let _ = sync_one_resource(
            app,
            &remote,
            &mut config,
            &mut state,
            &manifest,
            &resource,
            (editor_dirty, editor_epoch),
            originals,
            created_conflicts,
            &mut changed_items,
            &mut changed_manifest,
        )
        .await?;
    }

    for (key, entry) in &changed_manifest {
        manifest.items.insert(key.clone(), entry.clone());
    }
    if !changed_manifest.is_empty() {
        save_manifest_with_retry(&remote, manifest, manifest_etag, &changed_manifest, true).await?;
    }
    save_state(app, &state)?;
    for item in changed_items {
        if item == SyncItemId::DefaultNote {
            let _ = app.emit("mknote:default-note-changed", ());
        }
        if item == SyncItemId::QuickTodoDefault {
            let _ = app.emit("mknote:quick-todo-changed:default", ());
        }
        if let SyncItemId::QuickTodo(todo_id) = &item {
            let _ = app.emit(&format!("mknote:quick-todo-changed:{todo_id}"), ());
        }
        if item == SyncItemId::QuickPocketDefault {
            let _ = app.emit("mknote:quick-pocket-changed:default", ());
        }
        if let SyncItemId::QuickPocket(pocket_id) = &item {
            let _ = app.emit(&format!("mknote:quick-pocket-changed:{pocket_id}"), ());
        }
    }
    let result = status(app)?;
    publish_status(app, &result);
    Ok(result)
}

pub fn poll_interval_secs(config: &crate::AppConfig) -> u64 {
    config.sync_poll_interval_secs.clamp(10, 300)
}

pub const DEFAULT_SYNC_POLL_INTERVAL_SECS: u64 = DEFAULT_POLL_INTERVAL_SECS;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn quick_sync_reads_and_downloads_use_configured_paths_without_touching_old_files() {
        let base = std::env::temp_dir().join(format!("mknote-quick-sync-{}", uuid::Uuid::new_v4()));
        let vault = base.join("Allnote");
        std::fs::create_dir_all(base.join("inbox")).unwrap();
        let old = base.join("inbox/Quick Todo.md");
        std::fs::write(&old, b"original todo").unwrap();
        let ordinary = base.join(crate::notes::DEFAULT_NOTE_NAME);
        std::fs::write(&ordinary, b"ordinary note").unwrap();
        let mut config = crate::AppConfig::default();
        config.quick_todo_data_dir = Some(vault.to_string_lossy().into_owned());
        config.quick_pocket_data_dir = config.quick_todo_data_dir.clone();
        let directories = crate::quick_data::QuickDataDirectories::from_config(&config, &base);
        let cases = [
            (SyncItemId::QuickTodoDefault, "Quick Todo.md"),
            (SyncItemId::QuickTodo("todo_work".into()), "Quick Todo/todo_work.md"),
            (SyncItemId::QuickPocketDefault, "Quick Pocket.md"),
            (SyncItemId::QuickPocket("pocket_prompt".into()), "Quick Pocket/pocket_prompt.md"),
        ];
        let mut journal = Vec::new();
        for (item, relative) in cases {
            let path = item_path_in(&base, &directories, &item).unwrap();
            assert_eq!(path, vault.join(relative));
            apply_note_download(&mut journal, &path, None, b"remote fixture").unwrap();
            assert_eq!(read_optional_file(&path).unwrap(), Some(b"remote fixture".to_vec()));
        }
        assert_eq!(item_path_in(&base, &directories, &SyncItemId::DefaultNote).unwrap(), ordinary);
        assert_eq!(std::fs::read(old).unwrap(), b"original todo");
        assert_eq!(std::fs::read(ordinary).unwrap(), b"ordinary note");
        assert!(item_path_in(&base, &directories, &SyncItemId::QuickTodo("../escape".into())).is_err());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn sdk_not_found_details_are_treated_as_missing_objects() {
        assert!(is_missing_object_error("service error; status: 404"));
        assert!(is_missing_object_error("NoSuchKey"));
        assert!(!is_missing_object_error("service error; status: 403"));
    }

    #[test]
    fn registered_pocket_uses_an_isolated_remote_object_key() {
        assert_eq!(
            SyncItemId::QuickPocket("p_work".to_string()).as_str(),
            "quick-pocket-p_work"
        );
    }

    #[test]
    fn registered_todo_uses_an_isolated_remote_object_key() {
        assert_eq!(
            SyncItemId::QuickTodo("todo_work".to_string()).as_str(),
            "quick-todo-todo_work"
        );
    }

    #[test]
    fn notes_and_registries_use_separate_remote_object_suffixes() {
        assert_eq!(
            SyncResource::Note(SyncItemId::DefaultNote).remote_suffix(),
            "default-note.md"
        );
        assert_eq!(
            SyncResource::QuickTodoRegistry.remote_suffix(),
            "quick-todo-registry.json"
        );
        assert_eq!(
            SyncResource::QuickPocketRegistry.remote_suffix(),
            "quick-pocket-registry.json"
        );
    }

    #[test]
    fn conflict_resolution_accepts_only_local_or_remote() {
        assert_eq!(
            parse_conflict_resolution("local"),
            Some(ConflictResolution::Local)
        );
        assert_eq!(
            parse_conflict_resolution("remote"),
            Some(ConflictResolution::Remote)
        );
        assert_eq!(parse_conflict_resolution("other"), None);
    }

    #[test]
    fn conflict_state_keys_map_back_to_sync_resources() {
        assert_eq!(
            resource_from_state_key("default-note"),
            Some(SyncResource::Note(SyncItemId::DefaultNote))
        );
        assert_eq!(
            resource_from_state_key("quick-todo-todo_work"),
            Some(SyncResource::Note(SyncItemId::QuickTodo("todo_work".into())))
        );
        assert_eq!(resource_from_state_key("unknown"), None);
    }

    #[test]
    fn unchanged_local_and_remote_is_noop() {
        assert_eq!(
            decide_sync(Some("same"), "same", "same"),
            SyncDecision::Noop
        );
    }

    #[test]
    fn clean_local_accepts_new_remote_content() {
        assert_eq!(
            decide_sync(Some("old"), "old", "new"),
            SyncDecision::DownloadRemote
        );
    }

    #[test]
    fn both_sides_changed_create_conflict() {
        assert_eq!(
            decide_sync(Some("old"), "local", "remote"),
            SyncDecision::Conflict
        );
    }

    #[test]
    fn missing_base_is_conflict_when_both_sides_have_content() {
        assert_eq!(decide_sync(None, "local", "remote"), SyncDecision::Conflict);
    }

    #[test]
    fn local_only_change_is_uploaded_when_remote_keeps_the_base() {
        assert_eq!(
            decide_sync_with_state(Some("base"), "local", Some("base"), false, None),
            SyncDecision::UploadLocal
        );
    }

    #[test]
    fn a_missing_remote_object_is_recreated_only_with_a_known_local_base() {
        assert_eq!(
            decide_sync_with_state(Some("base"), "base", None, false, None),
            SyncDecision::UploadLocal
        );
        assert_eq!(
            decide_sync_with_state(None, "local", None, false, None),
            SyncDecision::Conflict
        );
    }

    #[test]
    fn both_changed_preserves_local_and_records_remote_conflict() {
        assert_eq!(
            decide_sync_with_state(Some("base"), "local", Some("remote"), false, None),
            SyncDecision::Conflict
        );
    }

    #[test]
    fn unresolved_conflict_does_not_overwrite_unchanged_local_content() {
        assert_eq!(
            decide_sync_with_state(
                Some("local-version"),
                "local-version",
                Some("remote-version"),
                true,
                Some("remote-version")
            ),
            SyncDecision::Conflict
        );
    }

    #[test]
    fn editing_after_a_stable_conflict_can_upload_local_resolution() {
        assert_eq!(
            decide_sync_with_state(
                Some("local-version"),
                "resolved-local",
                Some("remote-version"),
                true,
                Some("remote-version")
            ),
            SyncDecision::UploadLocal
        );
    }

    #[test]
    fn identical_conflict_content_maps_to_one_stable_filename() {
        let item = SyncItemId::QuickTodoDefault;
        let resource = SyncResource::Note(item);
        let first = conflict_filename(&resource, "device-a", b"local content", "local");
        let second = conflict_filename(&resource, "device-a", b"local content", "local");
        let changed = conflict_filename(&resource, "device-a", b"different content", "local");
        assert_eq!(first, second);
        assert_ne!(first, changed);
        assert!(!first.contains(':'));
        assert!(first.ends_with(".md"));
    }

    #[test]
    fn atomic_replace_replaces_existing_file_without_temp_residue() {
        let root = std::env::temp_dir().join(format!(
            "mknote-sync-atomic-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("note.md");
        std::fs::write(&path, b"old").unwrap();
        atomic_replace(&path, b"new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert_eq!(
            std::fs::read_dir(&root).unwrap().count(),
            1,
            "原子替换后不应留下临时文件"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn tick_file_rollback_restores_all_replaced_files() {
        let root = std::env::temp_dir().join(format!(
            "mknote-sync-tick-rollback-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let first = root.join("first.md");
        let second = root.join("second.md");
        std::fs::write(&first, b"old-first").unwrap();
        std::fs::write(&second, b"old-second").unwrap();
        let originals = vec![
            AppliedFileChange { path: first.clone(), original: Some(b"old-first".to_vec()), written: b"new-first".to_vec() },
            AppliedFileChange { path: second.clone(), original: Some(b"old-second".to_vec()), written: b"new-second".to_vec() },
        ];
        atomic_replace(&first, b"new-first").unwrap();
        atomic_replace(&second, b"new-second").unwrap();

        rollback_file_changes(&originals).unwrap();

        assert_eq!(std::fs::read(&first).unwrap(), b"old-first");
        assert_eq!(std::fs::read(&second).unwrap(), b"old-second");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn manifest_retry_merge_preserves_latest_entry() {
        let mut latest = SyncManifest {
            schema_version: 1,
            generation: 4,
            items: BTreeMap::from([(
                "default-note".into(),
                SyncManifestItem {
                    revision: 9,
                    content_hash: "sha256:latest".into(),
                    etag: Some("latest-etag".into()),
                },
            )]),
        };
        let candidate = BTreeMap::from([
            (
                "default-note".into(),
                SyncManifestItem {
                    revision: 8,
                    content_hash: "sha256:stale".into(),
                    etag: Some("stale-etag".into()),
                },
            ),
            (
                "quick-todo".into(),
                SyncManifestItem {
                    revision: 1,
                    content_hash: "sha256:new-key".into(),
                    etag: None,
                },
            ),
        ]);
        merge_manifest_entries_without_overwriting_latest(&mut latest, &candidate);
        assert_eq!(latest.items["default-note"].content_hash, "sha256:latest");
        assert_eq!(latest.items["quick-todo"].content_hash, "sha256:new-key");
    }

    #[test]
    fn first_manifest_write_uses_create_only_precondition() {
        assert!(manifest_create_precondition(None));
        assert!(!manifest_create_precondition(Some("etag-v1")));
    }

    #[test]
    fn first_manifest_write_sends_if_none_match_header() {
        tauri::async_runtime::block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut buffer = [0u8; 2048];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    let count = stream.read(&mut buffer).unwrap();
                    assert!(count > 0, "client closed before request headers arrived");
                    request.extend_from_slice(&buffer[..count]);
                }
                let request = String::from_utf8_lossy(&request).to_ascii_lowercase();
                assert!(request.contains("if-none-match: *"), "request={request}");
                stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nETag: \"manifest-v1\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
            });

            let sdk_config = aws_config::defaults(BehaviorVersion::latest())
                .region(aws_sdk_s3::config::Region::new("us-east-1"))
                .endpoint_url(format!("http://{address}"))
                .credentials_provider(aws_sdk_s3::config::Credentials::new(
                    "access",
                    "secret",
                    None,
                    None,
                    "mknote-test",
                ))
                .load()
                .await;
            let s3_config = aws_sdk_s3::config::Builder::from(&sdk_config)
                .force_path_style(true)
                .build();
            let remote = SyncRemote {
                client: Client::from_conf(s3_config),
                bucket: "bucket".into(),
                prefix: "MDnote".into(),
            };

            save_manifest_with_retry(
                &remote,
                SyncManifest::default(),
                None,
                &BTreeMap::new(),
                false,
            )
            .await
            .unwrap();
            server.join().unwrap();
        });
    }

    #[test]
    fn remote_error_mapping_keeps_precondition_and_server_failures_distinct() {
        assert!(
            s3_put_error_message("service error status 412 PreconditionFailed")
                .contains("版本已变化")
        );
        assert!(s3_put_error_message("service error status 503").contains("写入同步对象失败"));
    }

    #[test]
    fn bootstrap_preserves_local_content_when_remote_differs() {
        assert!(should_preserve_bootstrap_local(Some(b"local"), b"remote"));
        assert!(!should_preserve_bootstrap_local(Some(b"same"), b"same"));
        assert!(!should_preserve_bootstrap_local(None, b"remote"));
    }

    #[test]
    fn bootstrap_file_update_rolls_back_previous_replacements_on_failure() {
        let root = std::env::temp_dir().join(format!(
            "mknote-sync-bootstrap-rollback-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let first = root.join("first.md");
        let blocked_parent = root.join("blocked");
        let second = blocked_parent.join("second.md");
        std::fs::write(&blocked_parent, b"not-a-directory").unwrap();

        let result = apply_bootstrap_files(&[
            (first.clone(), b"new-first".to_vec()),
            (second, b"new-second".to_vec()),
        ]);

        assert!(result.is_err());
        assert!(!first.exists());
        assert!(!root.join("first.md.sync").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bootstrap_transaction_rolls_back_files_and_state_together() {
        let root = std::env::temp_dir().join(format!(
            "mknote-sync-bootstrap-transaction-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let note = root.join("default.md");
        let state = root.join(".mknote-sync-state.json");
        std::fs::write(&note, b"old-note").unwrap();
        std::fs::write(&state, b"old-state").unwrap();
        let originals = vec![AppliedFileChange { path: note.clone(), original: Some(b"old-note".to_vec()), written: b"new-note".to_vec() }];
        std::fs::write(&note, b"new-note").unwrap();
        std::fs::write(&state, b"new-state").unwrap();

        rollback_bootstrap_transaction(&originals, &state, Some(b"old-state"), &[]).unwrap();

        assert_eq!(std::fs::read(&note).unwrap(), b"old-note");
        assert_eq!(std::fs::read(&state).unwrap(), b"old-state");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn download_rechecks_local_snapshot_and_does_not_record_a_rejected_write() {
        let root = std::env::temp_dir().join(format!("mknote-download-cas-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("note.md");
        std::fs::write(&path, b"newer edit").unwrap();
        let mut changes = Vec::new();
        assert!(apply_note_download(&mut changes, &path, Some(b"old"), b"remote").is_err());
        assert!(changes.is_empty());
        assert_eq!(std::fs::read(&path).unwrap(), b"newer edit");
        assert!(apply_note_download(&mut changes, &path, None, b"bootstrap").is_err());
        assert!(changes.is_empty());
    }

    #[test]
    fn busy_sync_lock_returns_without_waiting_and_can_be_retried() {
        let path = std::env::temp_dir().join(format!("mknote-busy-{}.json", uuid::Uuid::new_v4()));
        let guard = crate::process_file_lock(&path).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let copy = path.clone();
        let worker = std::thread::spawn(move || tx.send(crate::try_process_file_lock(&copy).is_err()).unwrap());
        let result = rx.recv_timeout(Duration::from_secs(2));
        drop(guard);
        worker.join().unwrap();
        assert_eq!(result.unwrap(), true, "busy lock must fail without parking the async runtime");
        assert!(crate::try_process_file_lock(&path).is_ok());
    }

    #[test]
    fn rollback_preserves_a_newer_local_edit() {
        let root = std::env::temp_dir().join(format!("mknote-rollback-newer-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("note.md");
        std::fs::write(&path, b"old").unwrap();
        let originals = vec![AppliedFileChange { path: path.clone(), original: Some(b"old".to_vec()), written: b"download".to_vec() }];
        atomic_replace(&path, b"download").unwrap();
        std::fs::write(&path, b"newer edit").unwrap();
        assert!(rollback_file_changes(&originals).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"newer edit");
    }

    #[test]
    fn rollback_created_conflicts_removes_only_files_created_by_transaction() {
        let root = std::env::temp_dir().join(format!(
            "mknote-sync-conflict-rollback-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let created = root.join("created.md");
        let preexisting = root.join("preexisting.md");
        std::fs::write(&created, b"created").unwrap();
        std::fs::write(&preexisting, b"keep").unwrap();

        rollback_created_conflicts(&[AppliedFileChange { path: created.clone(), original: None, written: b"created".to_vec() }]).unwrap();

        assert!(!created.exists());
        assert_eq!(std::fs::read(&preexisting).unwrap(), b"keep");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn conflict_rollback_preserves_edited_copy() {
        let root = std::env::temp_dir().join(format!("mknote-conflict-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("conflict.md");
        std::fs::write(&path, b"user edit").unwrap();
        let journal = [AppliedFileChange { path: path.clone(), original: None, written: b"remote".to_vec() }];
        assert!(rollback_created_conflicts(&journal).unwrap_err().contains("保留新内容"));
        assert_eq!(std::fs::read(path).unwrap(), b"user edit");
    }

    #[test]
    fn editing_notification_protects_a_clean_tick_already_waiting_on_network() {
        let started = default_note_edit_epoch();
        assert!(!defer_default_download(false, started));
        protect_default_note();
        assert!(defer_default_download(false, started));
        assert!(defer_default_download(true, default_note_edit_epoch()));
        assert!(!defer_default_download(false, default_note_edit_epoch()));
    }

    #[test]
    fn config_rollback_preserves_concurrent_registry_and_unrelated_settings() {
        let original = crate::AppConfig::default();
        let mut desired = original.clone();
        desired.quick_todos.push(crate::QuickTodoDefinition { id: "remote".into(), name: "Remote".into() });
        desired.quick_pockets.push(crate::QuickPocketDefinition { id: "remote".into(), name: "Remote".into() });
        let change = SyncConfigChange { before: (&original).into(), after: (&desired).into() };
        let mut current = original.clone();
        change.apply(&mut current).unwrap();
        current.quick_todos.push(crate::QuickTodoDefinition { id: "user".into(), name: "User".into() });
        current.sync_enabled = !original.sync_enabled;
        assert_eq!(change.rollback(&mut current).len(), 1);
        assert!(current.quick_todos.iter().any(|item| item.id == "user"));
        assert_eq!(current.quick_pockets, original.quick_pockets);
        assert_ne!(current.sync_enabled, original.sync_enabled);
    }

    #[test]
    fn config_commit_rejects_stale_registry_without_partial_changes() {
        let original = crate::AppConfig::default();
        let mut desired = original.clone();
        desired.quick_todos.push(crate::QuickTodoDefinition { id: "remote".into(), name: "Remote".into() });
        desired.sync_enabled = !original.sync_enabled;
        let change = SyncConfigChange { before: (&original).into(), after: (&desired).into() };
        let mut current = original.clone();
        current.quick_todos.push(crate::QuickTodoDefinition { id: "local".into(), name: "Local".into() });
        assert!(change.apply(&mut current).is_err());
        assert_eq!(current.sync_enabled, original.sync_enabled);
        assert_eq!(current.quick_todos.last().unwrap().id, "local");
    }

    #[test]
    fn bootstrap_flag_rollback_never_restores_entire_config_snapshot() {
        let mut original = crate::AppConfig::default();
        original.sync_initialized = false;
        original.sync_enabled = false;
        let mut desired = original.clone();
        desired.sync_initialized = true;
        desired.sync_enabled = true;
        let change = SyncConfigChange { before: (&original).into(), after: (&desired).into() };
        let mut current = original.clone();
        change.apply(&mut current).unwrap();
        current.quick_pockets.push(crate::QuickPocketDefinition { id: "new".into(), name: "New".into() });
        current.sync_enabled = false; // user turned sync back off during the request
        assert!(change.rollback(&mut current).is_empty());
        assert!(!current.sync_initialized);
        assert!(!current.sync_enabled);
        assert_eq!(current.quick_pockets.last().unwrap().id, "new");
    }
}
