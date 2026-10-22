mod agent_index;
mod assets;
mod capture;
mod clip_server;
pub mod cloudimgs;
pub mod cloudimgs_cleanup;
mod custom_tags;
mod detach;
mod fullscreen_watcher;
mod lsky;
pub mod lsky_cleanup;
mod message_hub;
mod notes;
mod paths;
mod quick_data;
mod process_utils;
mod quick_pocket;
mod quick_pocket_window;
mod quick_todo;
mod quick_todo_window;
mod s3_store;
mod scripts;
mod search;
mod siyuan;
mod note_upload;
mod note_classification;
mod siyuan_map;
mod stars;
mod sync;
mod system;
mod templates;
mod trash;
#[cfg(windows)]
mod win_present;
#[cfg(windows)]
mod window_icons;

use crate::notes::{NoteColorSummary, NoteFolderSummary, NoteSummary};
use paths::parse_zone;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::{DragDropEvent, Emitter, Manager, WebviewEvent};

const APP_NAME: &str = "md-sticky-note";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenTabRef {
    pub zone: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentNoteRef {
    pub zone: String,
    pub name: String,
    pub opened_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalHotkeys {
    #[serde(default = "default_hotkey")]
    pub toggle_window: String,
    #[serde(default = "default_focus_hotkey")]
    pub focus_window: String,
    #[serde(default = "default_quick_capture_hotkey")]
    pub quick_capture: String,
    #[serde(default = "default_clipboard_inbox_hotkey")]
    pub clipboard_inbox: String,
    #[serde(default = "default_quick_search_hotkey")]
    pub quick_search: String,
}

impl Default for GlobalHotkeys {
    fn default() -> Self {
        Self {
            toggle_window: default_hotkey(),
            focus_window: default_focus_hotkey(),
            quick_capture: default_quick_capture_hotkey(),
            clipboard_inbox: default_clipboard_inbox_hotkey(),
            quick_search: default_quick_search_hotkey(),
        }
    }
}

fn default_quick_capture_hotkey() -> String {
    "Ctrl+Alt+N".to_string()
}

fn default_focus_hotkey() -> String {
    "Ctrl+Shift+Alt+M".to_string()
}

fn default_clipboard_inbox_hotkey() -> String {
    "Alt+Shift+C".to_string()
}

fn default_quick_search_hotkey() -> String {
    "Ctrl+P".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AiConfig {
    pub api_url: Option<String>,
    pub api_token: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct QuickPocketDefinition {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct QuickTodoDefinition {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuickTodoWindowState {
    pub todo_id: String,
    #[serde(default)]
    pub geometry: Option<WindowGeometry>,
    #[serde(default)]
    pub monitor_name: Option<String>,
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuickPocketWindowState {
    pub pocket_id: String,
    #[serde(default)]
    pub geometry: Option<WindowGeometry>,
    #[serde(default)]
    pub monitor_name: Option<String>,
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PopoutSessionRef {
    pub zone: String,
    pub name: String,
    pub title: String,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    pub geometry: WindowGeometry,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CapsuleSessionRef {
    pub zone: String,
    pub name: String,
    pub title: String,
    #[serde(default)]
    pub note_color: Option<String>,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    pub geometry: WindowGeometry,
    #[serde(default)]
    pub snap_edge: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub last_note: Option<String>,
    #[serde(default)]
    pub last_note_zone: Option<String>,
    #[serde(default)]
    pub window: Option<WindowGeometry>,
    #[serde(default)]
    pub compact_geometry: Option<WindowGeometry>,
    #[serde(default)]
    pub quick_todo_geometry: Option<WindowGeometry>,
    #[serde(default)]
    pub quick_todo_monitor_name: Option<String>,
    #[serde(default)]
    pub quick_todo_always_on_top: bool,
    #[serde(default)]
    pub quick_todo_locked: bool,
    #[serde(default)]
    pub quick_todos: Vec<QuickTodoDefinition>,
    #[serde(default)]
    pub quick_todo_data_dir: Option<String>,
    #[serde(default)]
    pub quick_todo_window_states: Vec<QuickTodoWindowState>,
    #[serde(default)]
    pub quick_pocket_geometry: Option<WindowGeometry>,
    #[serde(default)]
    pub quick_pocket_monitor_name: Option<String>,
    #[serde(default)]
    pub quick_pocket_always_on_top: bool,
    #[serde(default)]
    pub quick_pocket_locked: bool,
    #[serde(default)]
    pub quick_pockets: Vec<QuickPocketDefinition>,
    #[serde(default)]
    pub quick_pocket_data_dir: Option<String>,
    #[serde(default)]
    pub quick_pocket_window_states: Vec<QuickPocketWindowState>,
    #[serde(default = "default_layout_mode")]
    pub layout_mode: String,
    #[serde(default = "default_font_size")]
    pub editor_font_size: u32,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_light_theme")]
    pub light_theme: String,
    #[serde(default = "default_dark_theme")]
    pub dark_theme: String,
    #[serde(default = "default_accent_skin")]
    pub accent_skin: String,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    #[serde(default)]
    pub autostart: bool,
    /// 自定义颜色标签显示名，键为标签 ID（重要/紧急/…）
    #[serde(default)]
    pub note_color_labels: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub open_tabs: Option<Vec<OpenTabRef>>,
    #[serde(default)]
    pub pinned_tabs: Option<Vec<OpenTabRef>>,
    /// 置顶标签上限，默认 2，范围 1-10
    #[serde(default = "default_pinned_tab_limit")]
    pub pinned_tab_limit: u8,
    #[serde(default)]
    pub capsule_sessions: Option<Vec<CapsuleSessionRef>>,
    #[serde(default)]
    pub popout_sessions: Option<Vec<PopoutSessionRef>>,
    #[serde(default = "default_capsule_snap_enabled")]
    pub capsule_snap_enabled: bool,
    #[serde(default)]
    pub siyuan_api_url: Option<String>,
    #[serde(default)]
    pub siyuan_api_token: Option<String>,
    #[serde(default)]
    pub siyuan_notebook_id: Option<String>,
    #[serde(default)]
    pub note_upload_target: Option<note_upload::UploadTarget>,
    #[serde(default)]
    pub obsidian_note_dir: Option<String>,
    #[serde(default)]
    pub obsidian_attachment_dir: Option<String>,
    #[serde(default)]
    pub obsidian_conflict: note_upload::ConflictPolicy,
    #[serde(default)]
    pub global_hotkeys: GlobalHotkeys,
    #[serde(default)]
    pub recent_notes: Option<Vec<RecentNoteRef>>,
    #[serde(default)]
    pub ai_config: Option<AiConfig>,
    #[serde(default)]
    pub note_classification: note_classification::ClassificationConfig,
    #[serde(default)]
    pub clip_server_enabled: bool,
    #[serde(default = "default_clip_server_port")]
    pub clip_server_port: u16,
    #[serde(default = "default_s3_endpoint")]
    pub s3_endpoint: Option<String>,
    #[serde(default = "default_s3_bucket")]
    pub s3_bucket: Option<String>,
    #[serde(default = "default_s3_object_key")]
    pub s3_object_key: Option<String>,
    #[serde(default)]
    pub s3_access_key: Option<String>,
    #[serde(default)]
    pub s3_secret_key: Option<String>,
    #[serde(default)]
    pub sync_enabled: bool,
    #[serde(default)]
    pub sync_initialized: bool,
    #[serde(default = "default_sync_poll_interval_secs")]
    pub sync_poll_interval_secs: u64,
    // 兰空图床配置
    #[serde(default = "default_lsky_url")]
    pub lsky_url: Option<String>,
    #[serde(default = "default_lsky_email")]
    pub lsky_email: Option<String>,
    #[serde(default = "default_lsky_password")]
    pub lsky_password: Option<String>,
    #[serde(default = "default_lsky_strategy_id")]
    pub lsky_strategy_id: Option<u32>,
    #[serde(default = "default_lsky_enabled")]
    pub lsky_enabled: bool,
    #[serde(default)]
    pub image_host_provider: Option<String>,
    #[serde(default)]
    pub image_host_enabled: Option<bool>,
    #[serde(default = "default_cloudimgs_url")]
    pub cloudimgs_url: Option<String>,
    #[serde(default)]
    pub cloudimgs_password: Option<String>,
    #[serde(default = "default_cloudimgs_directory")]
    pub cloudimgs_directory: Option<String>,
    /// 全屏避让：检测到全屏应用时自动隐藏窗口到托盘
    #[serde(default)]
    pub fullscreen_dodge: bool,
}

fn default_pinned_tab_limit() -> u8 {
    2
}

fn default_capsule_snap_enabled() -> bool {
    true
}

fn default_clip_server_port() -> u16 {
    17345
}
fn default_s3_endpoint() -> Option<String> {
    Some(s3_store::DEFAULT_S3_ENDPOINT.to_string())
}

fn default_s3_bucket() -> Option<String> {
    Some(s3_store::DEFAULT_S3_BUCKET.to_string())
}

fn default_s3_object_key() -> Option<String> {
    Some(s3_store::DEFAULT_S3_OBJECT_KEY.to_string())
}

fn default_sync_poll_interval_secs() -> u64 {
    sync::DEFAULT_SYNC_POLL_INTERVAL_SECS
}

fn default_lsky_url() -> Option<String> {
    Some(lsky::DEFAULT_LSKY_URL.to_string())
}

fn default_lsky_email() -> Option<String> {
    None
}

fn default_lsky_password() -> Option<String> {
    None
}

fn default_lsky_strategy_id() -> Option<u32> {
    lsky::DEFAULT_LSKY_STRATEGY_ID
}

fn default_lsky_enabled() -> bool {
    false
}

fn default_cloudimgs_url() -> Option<String> {
    Some(cloudimgs::DEFAULT_CLOUDIMGS_URL.to_string())
}

fn default_cloudimgs_directory() -> Option<String> {
    Some(cloudimgs::DEFAULT_CLOUDIMGS_DIRECTORY.to_string())
}

fn default_layout_mode() -> String {
    "compact".to_string()
}

fn default_font_size() -> u32 {
    16
}

fn default_theme_mode() -> String {
    "system".to_string()
}

fn default_light_theme() -> String {
    "mknote".to_string()
}

fn default_dark_theme() -> String {
    "mknote".to_string()
}

fn default_accent_skin() -> String {
    "mknote".to_string()
}

fn default_always_on_top() -> bool {
    true
}

fn default_hotkey() -> String {
    "Ctrl+Shift+Alt+N".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_note: None,
            last_note_zone: None,
            window: None,
            compact_geometry: None,
            quick_todo_geometry: None,
            quick_todo_monitor_name: None,
            quick_todo_always_on_top: false,
            quick_todo_locked: false,
            quick_todos: Vec::new(),
            quick_todo_data_dir: None,
            quick_todo_window_states: Vec::new(),
            quick_pocket_geometry: None,
            quick_pocket_monitor_name: None,
            quick_pocket_always_on_top: false,
            quick_pocket_locked: false,
            quick_pockets: Vec::new(),
            quick_pocket_data_dir: None,
            quick_pocket_window_states: Vec::new(),
            layout_mode: default_layout_mode(),
            editor_font_size: default_font_size(),
            theme_mode: default_theme_mode(),
            light_theme: default_light_theme(),
            dark_theme: default_dark_theme(),
            accent_skin: default_accent_skin(),
            always_on_top: default_always_on_top(),
            autostart: false,
            note_color_labels: None,
            open_tabs: None,
            pinned_tabs: None,
            pinned_tab_limit: default_pinned_tab_limit(),
            capsule_sessions: None,
            popout_sessions: None,
            capsule_snap_enabled: default_capsule_snap_enabled(),
            siyuan_api_url: None,
            siyuan_api_token: None,
            siyuan_notebook_id: None,
            note_upload_target: Some(note_upload::UploadTarget::None),
            obsidian_note_dir: None,
            obsidian_attachment_dir: None,
            obsidian_conflict: note_upload::ConflictPolicy::Rename,
            global_hotkeys: GlobalHotkeys::default(),
            recent_notes: None,
            ai_config: None,
            note_classification: note_classification::ClassificationConfig::default(),
            clip_server_enabled: false,
            clip_server_port: default_clip_server_port(),
            s3_endpoint: default_s3_endpoint(),
            s3_bucket: default_s3_bucket(),
            s3_object_key: default_s3_object_key(),
            s3_access_key: None,
            s3_secret_key: None,
            sync_enabled: false,
            sync_initialized: false,
            sync_poll_interval_secs: default_sync_poll_interval_secs(),
            lsky_url: default_lsky_url(),
            lsky_email: default_lsky_email(),
            lsky_password: default_lsky_password(),
            lsky_strategy_id: default_lsky_strategy_id(),
            lsky_enabled: default_lsky_enabled(),
            image_host_provider: None,
            image_host_enabled: None,
            cloudimgs_url: default_cloudimgs_url(),
            cloudimgs_password: None,
            cloudimgs_directory: default_cloudimgs_directory(),
            fullscreen_dodge: false,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AppState {
    pub config: AppConfig,
    pub exe_base: String,
}

fn config_path() -> Result<PathBuf, String> {
    if let Some(base) = paths::BASE_CACHE.get() {
        return Ok(paths::config_path_for_base(base));
    }
    if let Some(legacy) = paths::legacy_config_path() {
        return Ok(legacy);
    }
    Err("应用根目录尚未初始化".into())
}

static CONFIG_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn config_io_guard() -> MutexGuard<'static, ()> {
    CONFIG_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) fn process_file_lock(path: &std::path::Path) -> Result<std::fs::File, String> {
    acquire_process_file_lock(path, true)
}

// Async sync commands must fail fast rather than park a runtime worker waiting
// for a transaction whose network future needs that same runtime to progress.
pub(crate) fn try_process_file_lock(path: &std::path::Path) -> Result<std::fs::File, String> {
    acquire_process_file_lock(path, false)
}

fn acquire_process_file_lock(path: &std::path::Path, wait: bool) -> Result<std::fs::File, String> {
    use fs2::FileExt;
    let lock_path = path.with_extension("json.lock");
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let file = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&lock_path)
        .map_err(|error| format!("打开配置锁文件失败：{error}"))?;
    (if wait { file.lock_exclusive() } else { file.try_lock_exclusive() })
        .map_err(|error| format!("获取配置跨进程锁失败：{error}"))?;
    Ok(file)
}

fn parse_config_json(data: &str) -> Result<(AppConfig, bool), String> {
    let mut stream = serde_json::Deserializer::from_str(data).into_iter::<serde_json::Value>();
    let mut value = stream
        .next()
        .ok_or_else(|| "配置文件为空".to_string())?
        .map_err(|error| error.to_string())?;
    let trailing = !data[stream.byte_offset()..].trim().is_empty();
    normalize_legacy_config(&mut value);
    let config = serde_json::from_value(value).map_err(|error| error.to_string())?;
    Ok((config, trailing))
}

/// 读取旧配置字段，但统一写回当前唯一正式字段。
fn normalize_legacy_config(value: &mut serde_json::Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };

    let legacy_theme = object.get("theme").cloned();
    if !object.contains_key("theme_mode") {
        if let Some(theme) = legacy_theme {
            object.insert("theme_mode".to_string(), theme);
        }
    }

    let legacy_hotkey = object.get("hotkey").cloned();
    if let Some(hotkey) = legacy_hotkey {
        match object.get_mut("global_hotkeys").and_then(|value| value.as_object_mut()) {
            Some(hotkeys) => {
                hotkeys.entry("toggle_window".to_string()).or_insert(hotkey);
            }
            None => {
                object.insert(
                    "global_hotkeys".to_string(),
                    serde_json::json!({ "toggle_window": hotkey }),
                );
            }
        }
    }
}

const PROTECTED_SECRET_PREFIX: &str = "dpapi:v1:";

#[cfg(windows)]
fn protect_secret_value(value: &str) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    if value.is_empty() || value.starts_with(PROTECTED_SECRET_PREFIX) {
        return Ok(value.to_string());
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: value.len() as u32,
        pbData: value.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|error| format!("Windows DPAPI 加密凭据失败：{error}"))?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let encoded = STANDARD.encode(bytes);
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(format!("{PROTECTED_SECRET_PREFIX}{encoded}"))
    }
}

#[cfg(not(windows))]
fn protect_secret_value(value: &str) -> Result<String, String> {
    Ok(value.to_string())
}

#[cfg(windows)]
fn unprotect_secret_value(value: &str) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let encoded = value
        .strip_prefix(PROTECTED_SECRET_PREFIX)
        .ok_or_else(|| "配置中的 DPAPI 凭据格式无效".to_string())?;
    let encrypted = STANDARD
        .decode(encoded)
        .map_err(|error| format!("配置中的 DPAPI 凭据无效：{error}"))?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: encrypted.len() as u32,
        pbData: encrypted.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|error| format!("Windows DPAPI 解密凭据失败：{error}"))?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let value = String::from_utf8(bytes.to_vec())
            .map_err(|error| format!("Windows DPAPI 凭据不是 UTF-8：{error}"))?;
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(value)
    }
}

#[cfg(not(windows))]
fn unprotect_secret_value(value: &str) -> Result<String, String> {
    Ok(value.to_string())
}

fn hydrate_config_secrets(config: &mut AppConfig) -> Result<bool, String> {
    let mut migrated = false;
    macro_rules! hydrate {
        ($field:expr) => {
            if let Some(value) = $field.as_mut() {
                if value.starts_with(PROTECTED_SECRET_PREFIX) {
                    *value = unprotect_secret_value(value)?;
                } else if !value.is_empty() {
                    migrated = cfg!(windows);
                }
            }
        };
    }
    hydrate!(config.s3_access_key);
    hydrate!(config.s3_secret_key);
    hydrate!(config.lsky_password);
    hydrate!(config.cloudimgs_password);
    hydrate!(config.siyuan_api_token);
    hydrate!(config.note_classification.official.api_token);
    hydrate!(config.note_classification.commandcode.api_token);
    if let Some(ai) = config.ai_config.as_mut() {
        hydrate!(ai.api_token);
    }
    Ok(migrated)
}

fn protected_config(config: &AppConfig) -> Result<AppConfig, String> {
    let mut stored = config.clone();
    macro_rules! protect {
        ($field:expr) => {
            if let Some(value) = $field.as_mut() {
                *value = protect_secret_value(value)?;
            }
        };
    }
    protect!(stored.s3_access_key);
    protect!(stored.s3_secret_key);
    protect!(stored.lsky_password);
    protect!(stored.cloudimgs_password);
    protect!(stored.siyuan_api_token);
    protect!(stored.note_classification.official.api_token);
    protect!(stored.note_classification.commandcode.api_token);
    if let Some(ai) = stored.ai_config.as_mut() {
        protect!(ai.api_token);
    }
    Ok(stored)
}

#[cfg(windows)]
fn replace_config_file(temp: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
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
        .map_err(|error| error.to_string())
    }
}

#[cfg(not(windows))]
fn replace_config_file(temp: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    std::fs::rename(temp, target).map_err(|error| error.to_string())?;
    sync_parent_directory(target)
}

#[cfg(unix)]
pub(crate) fn sync_parent_directory(path: &std::path::Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("无法确定文件父目录：{}", path.display()))?;
    std::fs::File::open(parent)
        .map_err(|error| format!("打开文件父目录失败：{error}"))?
        .sync_all()
        .map_err(|error| format!("同步文件父目录失败：{error}"))
}

#[cfg(not(unix))]
pub(crate) fn sync_parent_directory(_path: &std::path::Path) -> Result<(), String> {
    // Windows 的 MoveFileExW 使用 MOVEFILE_WRITE_THROUGH；目录句柄同步不是
    // Windows 绿色版路径上可移植且必要的补充操作。
    Ok(())
}

#[cfg(windows)]
fn tighten_config_permissions(path: &std::path::Path) -> Result<(), String> {
    // 绿色版没有固定的 AppData ACL；去掉目录继承，至少避免同机其他普通用户
    // 通过默认目录权限读取 S3/图床凭据。配置仍不是密钥环，不能将 ACL
    // 当作唯一密钥保护。
    let whoami = process_utils::hidden_command(r"C:\Windows\System32\whoami.exe")
        .output()
        .map_err(|error| format!("获取当前 Windows 用户失败：{error}"))?;
    if !whoami.status.success() {
        return Err("获取当前 Windows 用户失败".into());
    }
    let user = String::from_utf8(whoami.stdout)
        .map_err(|error| format!("解析当前 Windows 用户失败：{error}"))?;
    let user = user.trim();
    if user.is_empty() || user.chars().any(|character| character.is_control()) {
        return Err("当前 Windows 用户标识无效".into());
    }
    let status = process_utils::hidden_command(r"C:\Windows\System32\icacls.exe")
        .arg(path)
        .args(["/inheritance:r", "/grant:r"])
        .arg(format!("{user}:F"))
        .output()
        .map_err(|error| format!("收紧配置文件权限失败：{error}"))?;
    if status.status.success() {
        Ok(())
    } else {
        Err("收紧配置文件权限失败".into())
    }
}

#[cfg(not(windows))]
fn tighten_config_permissions(_path: &std::path::Path) -> Result<(), String> {
    Ok(())
}

fn write_config_file_unlocked(path: &std::path::Path, data: &str) -> Result<(), String> {
    use std::io::Write;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp = path.with_extension("json.tmp");
    let write_result = (|| -> Result<(), String> {
        #[cfg(unix)]
        use std::os::unix::fs::OpenOptionsExt;
        let mut options = std::fs::OpenOptions::new();
        options.create(true).truncate(true).write(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut file = options
            .open(&temp)
            .map_err(|error| format!("创建配置临时文件失败：{error}"))?;
        file.write_all(data.as_bytes())
            .map_err(|error| format!("写入配置临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步配置临时文件失败：{error}"))
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    replace_config_file(&temp, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        format!("替换配置文件失败：{error}")
    })?;
    tighten_config_permissions(path)
}

#[cfg(test)]
fn write_config_file(path: &std::path::Path, data: &str) -> Result<(), String> {
    let _guard = config_io_guard();
    let _process_lock = process_file_lock(path)?;
    write_config_file_unlocked(path, data)
}

pub(crate) fn load_config() -> Result<AppConfig, String> {
    let _guard = config_io_guard();
    let path = config_path()?;
    let _process_lock = process_file_lock(&path)?;
    if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let (mut config, needs_repair) = parse_config_json(&data)?;
        let secrets_migrated = hydrate_config_secrets(&mut config)?;
        if needs_repair || secrets_migrated {
            let stored = protected_config(&config)?;
            let repaired = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
            write_config_file_unlocked(&path, &repaired)?;
            if needs_repair {
                eprintln!("检测到 config.json 尾部残留，已保留首个完整配置并原子修复");
            }
        }
        return Ok(config);
    }
    if let Some(legacy) = paths::legacy_config_path() {
        if legacy.exists() && legacy != path {
            let data = std::fs::read_to_string(&legacy).map_err(|e| e.to_string())?;
            let (mut config, _) = parse_config_json(&data)?;
            hydrate_config_secrets(&mut config)?;
            let stored = protected_config(&config)?;
            let serialized = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
            write_config_file_unlocked(&path, &serialized)?;
            return Ok(config);
        }
    }
    Ok(AppConfig::default())
}

/// 在同一把进程内锁上完成配置的读、改、写，避免多个窗口的更新互相覆盖。
pub(crate) fn update_config_with<T, F>(mutator: F) -> Result<(AppConfig, T), String>
where
    F: FnOnce(&mut AppConfig) -> Result<T, String>,
{
    let _guard = config_io_guard();
    let path = config_path()?;
    let _process_lock = process_file_lock(&path)?;
    let mut config = if path.exists() {
        let data = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let (mut config, _) = parse_config_json(&data)?;
        hydrate_config_secrets(&mut config)?;
        config
    } else if let Some(legacy) =
        paths::legacy_config_path().filter(|legacy| legacy.exists() && legacy != &path)
    {
        let data = std::fs::read_to_string(&legacy).map_err(|error| error.to_string())?;
        let (mut config, _) = parse_config_json(&data)?;
        hydrate_config_secrets(&mut config)?;
        config
    } else {
        AppConfig::default()
    };
    let result = mutator(&mut config)?;
    let stored = protected_config(&config)?;
    let data = serde_json::to_string_pretty(&stored).map_err(|error| error.to_string())?;
    write_config_file_unlocked(&path, &data)?;
    Ok((config, result))
}

pub(crate) fn update_config<F>(mutator: F) -> Result<AppConfig, String>
where
    F: FnOnce(&mut AppConfig) -> Result<(), String>,
{
    update_config_with(|config| {
        mutator(config)?;
        Ok(())
    })
    .map(|(config, _)| config)
}

#[cfg(test)]
mod config_io_tests {
    use super::{parse_config_json, sync_parent_directory, write_config_file, AppConfig};

    #[test]
    fn image_host_defaults_preserve_explicit_saved_endpoints() {
        let fresh = AppConfig::default();
        assert_eq!(fresh.lsky_url.as_deref(), Some(""));
        assert_eq!(fresh.cloudimgs_url.as_deref(), Some(""));
        let (saved, _) = parse_config_json(
            r#"{"lsky_url":"https://images.example.test","cloudimgs_url":"https://cloudimgs.example.test"}"#,
        )
        .unwrap();
        assert_eq!(saved.lsky_url.as_deref(), Some("https://images.example.test"));
        assert_eq!(saved.cloudimgs_url.as_deref(), Some("https://cloudimgs.example.test"));
    }

    #[test]
    fn image_host_enable_requires_an_endpoint_before_config_io() {
        for (provider, message) in [
            ("lsky", "启用兰空图床前请填写地址"),
            ("cloudimgs", "启用云图前请填写地址"),
        ] {
            let error = super::set_image_host_config(
                provider.to_string(),
                Some(true),
                String::new(),
                "fixture@example.test".to_string(),
                "fixture".to_string(),
                Some(4),
                String::new(),
                "fixture".to_string(),
                "MDnote".to_string(),
            )
            .err()
            .expect("an enabled host without an endpoint must be rejected");
            assert_eq!(error, message);
        }
    }

    fn temp_config_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "mknote-{name}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn atomic_replacement_can_sync_parent_directory() {
        let root = std::env::temp_dir().join(format!(
            "mknote-parent-sync-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let target = root.join("config.json");

        sync_parent_directory(&target).unwrap();

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn parser_recovers_first_complete_config_from_trailing_write_garbage() {
        let expected = AppConfig::default();
        let damaged = format!(
            "{}{}",
            serde_json::to_string_pretty(&expected).unwrap(),
            "\"mdnote\",\n  \"fullscreen_dodge\": true\n}"
        );

        let (parsed, needs_repair) = parse_config_json(&damaged).unwrap();

        assert!(needs_repair);
        assert_eq!(parsed.layout_mode, expected.layout_mode);
        assert_eq!(
            parsed.quick_todo_always_on_top,
            expected.quick_todo_always_on_top
        );
    }

    #[test]
    fn parser_migrates_legacy_theme_and_hotkey_fields_without_serializing_them() {
        let (parsed, needs_repair) =
            parse_config_json(r#"{"theme":"dark","hotkey":"Ctrl+Alt+Q"}"#).unwrap();

        assert!(!needs_repair);
        assert_eq!(parsed.theme_mode, "dark");
        assert_eq!(parsed.global_hotkeys.toggle_window, "Ctrl+Alt+Q");

        let serialized = serde_json::to_string(&parsed).unwrap();
        assert!(!serialized.contains("\"theme\""));
        assert!(!serialized.contains("\"hotkey\""));
    }

    #[cfg(windows)]
    #[test]
    fn windows_dpapi_round_trips_config_secret() {
        let protected = super::protect_secret_value("s3-secret-测试").unwrap();
        assert!(protected.starts_with(super::PROTECTED_SECRET_PREFIX));
        assert_eq!(
            super::unprotect_secret_value(&protected).unwrap(),
            "s3-secret-测试"
        );
    }

    #[test]
    fn concurrent_config_writes_always_leave_one_complete_json_document() {
        let path = temp_config_path("concurrent-config");
        let handles: Vec<_> = (0..8)
            .map(|writer| {
                let path = path.clone();
                std::thread::spawn(move || {
                    for revision in 0..40 {
                        let padding = "x".repeat((writer * 31 + revision) as usize);
                        let data = serde_json::json!({
                            "writer": writer,
                            "revision": revision,
                            "padding": padding,
                        })
                        .to_string();
                        write_config_file(&path, &data).unwrap();
                    }
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }

        let data = std::fs::read_to_string(&path).unwrap();
        serde_json::from_str::<serde_json::Value>(&data).unwrap();
        assert_eq!(data.matches('{').count(), 1);

        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
fn get_app_state(app: tauri::AppHandle) -> Result<AppState, String> {
    let (mut config, base) = paths::ensure_app_dirs(&app)?;

    // 先做对 config 有影响的同步检查（轻量）
    let refs_changed = notes::prune_stale_config_refs(&app, &mut config);
    let geometry_changed = system::sanitize_window_geometry(&mut config);
    if refs_changed || geometry_changed {
        let desired = config.clone();
        config = update_config(|current| {
            current.open_tabs = desired.open_tabs.clone();
            current.last_note = desired.last_note.clone();
            current.last_note_zone = desired.last_note_zone.clone();
            current.window = desired.window.clone();
            current.compact_geometry = desired.compact_geometry.clone();
            Ok(())
        })?;
    }
    if let Ok(updated) = system::persist_compact_layout() {
        config = updated;
    }

    // 把耗时的清理/初始化工作放到后台线程，不阻塞窗口显示
    let app_bg = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        notes::cleanup_stale_tmp(&app_bg);
        notes::prune_empty_default_notes(&app_bg);
        let _ = notes::ensure_default_note(&app_bg);
        let _ = templates::ensure_builtin_templates(&app_bg);
    });

    Ok(AppState {
        config,
        exe_base: paths::path_to_string(&base)?,
    })
}

#[tauri::command]
fn get_config() -> Result<AppConfig, String> {
    load_config()
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<AppConfig, String> {
    system::set_autostart_enabled(&app, enabled)
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<AppConfig, String> {
    system::set_always_on_top(&app, enabled)
}

#[tauri::command]
fn set_editor_font_size(size: u32) -> Result<AppConfig, String> {
    let size = size.clamp(12, 24);
    update_config(|config| {
        config.editor_font_size = size;
        Ok(())
    })
}

#[tauri::command]
fn set_theme_mode(theme_mode: String) -> Result<AppConfig, String> {
    if !matches!(theme_mode.as_str(), "system" | "light" | "dark") {
        return Err("主题模式必须是 system、light 或 dark".into());
    }
    update_config(|config| {
        config.theme_mode = theme_mode.clone();
        Ok(())
    })
}

fn validate_theme_style(style: &str) -> Result<(), String> {
    if matches!(
        style,
        "catppuccin"
            | "mknote"
            | "hermes"
            | "poseidon"
            | "ares"
            | "nous"
            | "midnight"
            | "ember"
            | "mono"
            | "slate"
            | "captain-log"
    ) {
        Ok(())
    } else {
        Err("主题样式必须是 catppuccin、mknote、hermes、poseidon、ares、nous、midnight、ember、mono、slate 或 captain-log".into())
    }
}

#[tauri::command]
fn set_theme_styles(
    light_theme: String,
    dark_theme: String,
    accent_skin: String,
) -> Result<AppConfig, String> {
    validate_theme_style(&light_theme)?;
    validate_theme_style(&dark_theme)?;
    validate_theme_style(&accent_skin)?;
    update_config(|config| {
        config.light_theme = light_theme;
        config.dark_theme = dark_theme;
        config.accent_skin = accent_skin;
        Ok(())
    })
}

#[tauri::command]
fn enter_expanded_layout(app: tauri::AppHandle) -> Result<AppConfig, String> {
    system::enter_expanded_layout(&app)
}

#[tauri::command]
fn leave_expanded_layout(app: tauri::AppHandle) -> Result<AppConfig, String> {
    system::leave_expanded_layout(&app)
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    system::hide_main_window(&app);
}

#[tauri::command]
fn show_window(app: tauri::AppHandle) {
    system::show_main_window(&app);
}

#[tauri::command]
fn toggle_window(app: tauri::AppHandle) {
    system::toggle_main_window(&app);
}

#[tauri::command]
fn snapshot_window_geometry(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(system::WINDOW_LABEL)
        .ok_or_else(|| "主窗口不存在".to_string())?;
    system::save_window_geometry(&window)
}

#[tauri::command]
fn get_note_dir(app: tauri::AppHandle, zone: String) -> Result<String, String> {
    let zone = parse_zone(&zone)?;
    let (config, base) = paths::ensure_app_dirs(&app)?;
    let dir = zone.dir(&config, &base);
    paths::path_to_string(&dir)
}

#[tauri::command]
fn set_open_tabs(
    tabs: Vec<OpenTabRef>,
    active_zone: String,
    active_name: String,
    pinned_tabs: Option<Vec<OpenTabRef>>,
) -> Result<AppConfig, String> {
    update_config(|config| {
        if let Some(pinned) = pinned_tabs {
            let limit = config.pinned_tab_limit as usize;
            if pinned.len() > limit {
                return Err(format!("最多只能置顶 {} 个标签", limit));
            }
            config.pinned_tabs = if pinned.is_empty() {
                None
            } else {
                Some(pinned)
            };
        }
        if tabs.is_empty() {
            config.open_tabs = None;
            config.last_note = None;
            config.last_note_zone = None;
        } else {
            parse_zone(&active_zone)?;
            if active_name.is_empty() {
                return Err("当前笔记名为空".into());
            }
            config.open_tabs = Some(tabs);
            config.last_note = Some(active_name);
            config.last_note_zone = Some(active_zone);
        }
        Ok(())
    })
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("当前平台暂不支持打开文件夹".into())
    }
}

#[tauri::command]
fn list_notes(app: tauri::AppHandle, zone: String) -> Result<Vec<NoteSummary>, String> {
    let zone = parse_zone(&zone)?;
    notes::list_zone(&app, zone)
}

#[tauri::command]
fn list_folders(app: tauri::AppHandle) -> Result<Vec<NoteFolderSummary>, String> {
    notes::list_folders(&app)
}

#[tauri::command]
fn create_folder(app: tauri::AppHandle, title: String) -> Result<NoteFolderSummary, String> {
    notes::create_folder(&app, &title)
}

#[tauri::command]
fn rename_folder(
    app: tauri::AppHandle,
    old_id: String,
    new_title: String,
) -> Result<NoteFolderSummary, String> {
    notes::rename_folder(&app, &old_id, &new_title)
}

#[tauri::command]
fn set_folder_color(
    app: tauri::AppHandle,
    id: String,
    color: String,
) -> Result<NoteFolderSummary, String> {
    notes::set_folder_color(&app, &id, &color)
}

#[tauri::command]
fn list_note_colors(app: tauri::AppHandle) -> Result<Vec<NoteColorSummary>, String> {
    notes::list_note_colors(&app)
}

#[tauri::command]
fn list_notes_by_color(app: tauri::AppHandle, color: String) -> Result<Vec<NoteSummary>, String> {
    notes::list_notes_by_color(&app, &color)
}

#[tauri::command]
fn set_note_color_labels(
    labels: std::collections::HashMap<String, String>,
) -> Result<AppConfig, String> {
    update_config(|config| {
        config.note_color_labels = Some(labels);
        Ok(())
    })
}

#[tauri::command]
fn set_note_color(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    color: Option<String>,
) -> Result<NoteSummary, String> {
    let zone = parse_zone(&zone)?;
    notes::set_note_color(&app, zone, &name, color)
}

#[tauri::command]
fn read_note(app: tauri::AppHandle, zone: String, name: String) -> Result<String, String> {
    let zone = parse_zone(&zone)?;
    notes::read_note(&app, zone, &name)
}

#[tauri::command]
fn read_note_snapshot(
    app: tauri::AppHandle,
    zone: String,
    name: String,
) -> Result<notes::NoteSnapshot, String> {
    let zone = parse_zone(&zone)?;
    notes::read_note_snapshot(&app, zone, &name)
}

#[tauri::command]
fn ensure_visual_editor_migration_snapshot(
    app: tauri::AppHandle,
    zone: String,
    name: String,
) -> Result<(), String> {
    let zone = parse_zone(&zone)?;
    if zone == paths::NoteZone::Private {
        return Ok(());
    }
    let base = paths::writable_base(&app)?;
    let config = load_config()?;
    notes::ensure_migration_snapshot_at(&base, &config, &zone, &name)
}

#[tauri::command]
fn write_note(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    content: String,
) -> Result<(), String> {
    let zone = parse_zone(&zone)?;
    let is_default_note = zone == paths::NoteZone::Default && name == notes::DEFAULT_NOTE_NAME;
    notes::write_note(&app, zone, &name, &content)?;
    if is_default_note {
        let _ = app.emit("mknote:sync-local-changed", "default-note");
    }
    Ok(())
}

#[tauri::command]
fn write_note_checked(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    content: String,
    expected_content_hash: Option<String>,
) -> Result<notes::NoteRevision, String> {
    let zone = parse_zone(&zone)?;
    let revision = notes::write_note_checked(
        &app,
        zone.clone(),
        &name,
        &content,
        expected_content_hash.as_deref(),
    )?;
    if zone == paths::NoteZone::Default && name == notes::DEFAULT_NOTE_NAME {
        let _ = app.emit("mknote:sync-local-changed", "default-note");
    }
    Ok(revision)
}

#[tauri::command]
fn create_note(app: tauri::AppHandle, zone: String) -> Result<NoteSummary, String> {
    let zone = parse_zone(&zone)?;
    notes::create_note(&app, zone)
}

#[tauri::command]
fn ensure_default_note(app: tauri::AppHandle) -> Result<NoteSummary, String> {
    notes::ensure_default_note(&app)
}

#[tauri::command]
fn read_default_note(app: tauri::AppHandle) -> Result<String, String> {
    let base = paths::writable_base(&app)?;
    let path = base.join(notes::DEFAULT_NOTE_NAME);
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_default_note_snapshot(app: tauri::AppHandle) -> Result<notes::NoteSnapshot, String> {
    notes::read_default_note_snapshot(&app)
}

#[tauri::command]
fn write_default_note(app: tauri::AppHandle, content: String) -> Result<(), String> {
    notes::write_default_note_checked(&app, &content, None)?;
    let _ = app.emit("mknote:sync-local-changed", "default-note");
    Ok(())
}

#[tauri::command]
fn write_default_note_checked(
    app: tauri::AppHandle,
    content: String,
    expected_content_hash: Option<String>,
) -> Result<notes::NoteRevision, String> {
    let revision = notes::write_default_note_checked(
        &app,
        &content,
        expected_content_hash.as_deref(),
    )?;
    let _ = app.emit("mknote:sync-local-changed", "default-note");
    Ok(revision)
}

#[tauri::command]
fn rename_note(
    app: tauri::AppHandle,
    zone: String,
    old_name: String,
    new_title: String,
) -> Result<NoteSummary, String> {
    let zone = parse_zone(&zone)?;
    notes::rename_note(&app, zone, &old_name, &new_title)
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, zone: String, name: String) -> Result<(), String> {
    let zone = parse_zone(&zone)?;
    notes::delete_note(&app, zone, &name)
}

#[tauri::command]
fn delete_empty_note_if_needed(
    app: tauri::AppHandle,
    zone: String,
    name: String,
) -> Result<bool, String> {
    let zone = parse_zone(&zone)?;
    notes::delete_if_empty(&app, zone, &name)
}

#[tauri::command]
fn move_note(
    app: tauri::AppHandle,
    from_zone: String,
    to_zone: String,
    name: String,
) -> Result<NoteSummary, String> {
    let from = parse_zone(&from_zone)?;
    let to = parse_zone(&to_zone)?;
    notes::move_note(&app, from, to, &name)
}

#[tauri::command]
fn set_last_note_file(name: String, zone: String) -> Result<(), String> {
    parse_zone(&zone)?;
    update_config(|config| {
        config.last_note = Some(name);
        config.last_note_zone = Some(zone);
        Ok(())
    })
    .map(|_| ())
}

#[tauri::command]
fn refresh_agent_index(app: tauri::AppHandle) -> Result<(), String> {
    agent_index::refresh(&app)
}

#[tauri::command]
async fn siyuan_test_connection(
    api_url: Option<String>,
    api_token: Option<String>,
) -> Result<Vec<siyuan::SiyuanNotebookSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = load_config()?;
        let resolved = siyuan::resolve_siyuan_config(&config, api_url.as_deref(), api_token.as_deref());
        siyuan::siyuan_test_connection(&resolved)
    })
    .await
    .map_err(|error| format!("测试失败：{error}"))?
}

#[tauri::command]
fn siyuan_list_notebooks() -> Result<Vec<siyuan::SiyuanNotebookSummary>, String> {
    let config = load_config()?;
    siyuan::siyuan_list_notebooks(&config)
}

#[tauri::command]
fn set_siyuan_config(
    api_url: Option<String>,
    api_token: Option<String>,
    notebook_id: Option<String>,
) -> Result<AppConfig, String> {
    update_config(|config| {
        config.note_upload_target = Some(note_upload::effective_target(config));
        if let Some(url) = api_url {
            let trimmed = url.trim().to_string();
            config.siyuan_api_url = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            };
        }
        if let Some(token) = api_token {
            let trimmed = siyuan::normalize_api_token(&token);
            config.siyuan_api_token = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            };
        }
        if let Some(id) = notebook_id {
            let trimmed = id.trim().to_string();
            config.siyuan_notebook_id = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            };
        }
        Ok(())
    })
}

#[tauri::command]
fn siyuan_upload_current_note(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    content: String,
    title: String,
) -> Result<siyuan::SiyuanUploadResult, String> {
    let zone = parse_zone(&zone)?;
    siyuan::upload_note_to_siyuan(&app, zone, &name, &content, &title)
}

#[tauri::command]
async fn message_hub_test_connection(
    endpoint: Option<String>,
    bucket: Option<String>,
    object_key: Option<String>,
    access_key: Option<String>,
    secret_key: Option<String>,
) -> Result<(), String> {
    let base = load_config()?;
    let trial = message_hub::trial_config_for_s3_test(
        &base,
        endpoint.as_deref(),
        bucket.as_deref(),
        object_key.as_deref(),
        access_key.as_deref(),
        secret_key.as_deref(),
    )?;
    tauri::async_runtime::spawn_blocking(move || message_hub::test_connection(&trial))
        .await
        .map_err(|e| format!("测试失败：{e}"))?
}

#[tauri::command]
fn sync_status(app: tauri::AppHandle) -> Result<sync::SyncStatus, String> {
    sync::status(&app)
}

#[tauri::command]
fn set_sync_enabled(enabled: bool) -> Result<AppConfig, String> {
    sync::set_enabled(enabled)
}

#[tauri::command]
async fn sync_bootstrap(app: tauri::AppHandle, mode: String) -> Result<sync::SyncStatus, String> {
    if mode != "local" && mode != "remote" {
        return Err("同步基线模式必须是 local 或 remote".into());
    }
    sync::bootstrap(&app, &mode).await
}

#[tauri::command]
fn sync_protect_default_note() {
    sync::protect_default_note();
}

#[tauri::command]
async fn sync_tick(
    app: tauri::AppHandle,
    editor_dirty: Option<bool>,
) -> Result<sync::SyncStatus, String> {
    sync::tick(&app, editor_dirty.unwrap_or(false)).await
}

#[tauri::command]
async fn sync_resolve_conflicts(
    app: tauri::AppHandle,
    resolution: String,
) -> Result<sync::SyncStatus, String> {
    sync::resolve_conflicts(&app, &resolution).await
}

#[tauri::command]
fn set_message_hub_s3_config(
    endpoint: Option<String>,
    bucket: Option<String>,
    object_key: Option<String>,
    access_key: Option<String>,
    secret_key: Option<String>,
) -> Result<AppConfig, String> {
    message_hub::set_s3_config(
        endpoint.as_deref(),
        bucket.as_deref(),
        object_key.as_deref(),
        access_key.as_deref(),
        secret_key.as_deref(),
    )
}

pub fn on_recent_note_renamed(zone: &str, old_name: &str, new_name: &str) {
    let _ = update_config(|config| {
        if let Some(recent) = config.recent_notes.as_mut() {
            for entry in recent.iter_mut() {
                if entry.zone == zone && entry.name == old_name {
                    entry.name = new_name.to_string();
                }
            }
        }
        Ok(())
    });
}

pub fn on_recent_note_deleted(zone: &str, name: &str) {
    let _ = update_config(|config| {
        if let Some(recent) = config.recent_notes.as_mut() {
            recent.retain(|r| !(r.zone == zone && r.name == name));
        }
        Ok(())
    });
}

fn record_recent_note_internal(zone: &str, name: &str) -> Result<AppConfig, String> {
    update_config(|config| {
        let now = chrono::Utc::now().to_rfc3339();
        let mut recent: Vec<RecentNoteRef> = config
            .recent_notes
            .take()
            .unwrap_or_default()
            .into_iter()
            .filter(|r| !(r.zone == zone && r.name == name))
            .collect();
        recent.insert(
            0,
            RecentNoteRef {
                zone: zone.to_string(),
                name: name.to_string(),
                opened_at: now,
            },
        );
        recent.truncate(20);
        config.recent_notes = Some(recent);
        Ok(())
    })
}

#[tauri::command]
fn record_recent_note(zone: String, name: String) -> Result<AppConfig, String> {
    parse_zone(&zone)?;
    // 隐私笔记不加入最近打开记录
    if zone == "private" {
        return load_config();
    }
    record_recent_note_internal(&zone, &name)
}

#[tauri::command]
fn clear_recent_notes() -> Result<AppConfig, String> {
    update_config(|config| {
        config.recent_notes = Some(vec![]);
        Ok(())
    })
}

#[tauri::command]
fn lsky_test_connection(url: String, email: String, password: String) -> Result<(), String> {
    let url = lsky::validate_base_url(&url)?;
    if email.trim().is_empty() {
        return Err("请填写兰空图床账号".into());
    }
    if password.trim().is_empty() {
        return Err("请填写兰空图床密码".into());
    }
    lsky::get_lsky_token(&url, email.trim(), password.trim()).map(|_token| ())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ImageHostProvider {
    None,
    Lsky,
    CloudImgs,
}

fn resolve_image_host_provider(config: &AppConfig) -> Result<ImageHostProvider, String> {
    if config.image_host_enabled == Some(false) {
        return Ok(ImageHostProvider::None);
    }
    match config.image_host_provider.as_deref().map(str::trim) {
        None | Some("") if config.lsky_enabled => Ok(ImageHostProvider::Lsky),
        None | Some("") => Ok(ImageHostProvider::None),
        Some("none") => Ok(ImageHostProvider::None),
        Some("lsky") => Ok(ImageHostProvider::Lsky),
        Some("cloudimgs") => Ok(ImageHostProvider::CloudImgs),
        Some(_) => Err("图床提供商配置无效".into()),
    }
}

#[tauri::command]
fn cloudimgs_test_connection(
    url: String,
    password: String,
    directory: String,
) -> Result<(), String> {
    cloudimgs::test_connection(&url, &password, &directory)
}

#[tauri::command]
fn set_image_host_config(
    provider: String,
    enabled: Option<bool>,
    lsky_url: String,
    lsky_email: String,
    lsky_password: String,
    lsky_strategy_id: Option<u32>,
    cloudimgs_url: String,
    cloudimgs_password: String,
    cloudimgs_directory: String,
) -> Result<AppConfig, String> {
    let provider = provider.trim().to_ascii_lowercase();
    if !matches!(provider.as_str(), "none" | "lsky" | "cloudimgs") {
        return Err("图床提供商配置无效".into());
    }
    if lsky_strategy_id == Some(0) {
        return Err("图床策略 ID 必须大于 0".into());
    }

    let lsky_url = if lsky_url.trim().is_empty() {
        lsky::DEFAULT_LSKY_URL.to_string()
    } else {
        lsky::validate_base_url(&lsky_url)?
    };
    let lsky_email = lsky_email.trim().to_string();
    let lsky_password = lsky_password.trim().to_string();
    let cloudimgs_url = if cloudimgs_url.trim().is_empty() {
        cloudimgs::DEFAULT_CLOUDIMGS_URL.to_string()
    } else {
        cloudimgs::validate_base_url(&cloudimgs_url)?
    };
    let cloudimgs_password = cloudimgs_password.trim().to_string();
    let cloudimgs_directory = if cloudimgs_directory.trim().is_empty() {
        cloudimgs::DEFAULT_CLOUDIMGS_DIRECTORY.to_string()
    } else {
        cloudimgs::normalize_directory(&cloudimgs_directory)?
    };

    let enabled = enabled.unwrap_or(true);
    match provider.as_str() {
        "lsky" if enabled => {
            if lsky_url.is_empty() {
                return Err("启用兰空图床前请填写地址".into());
            }
            if lsky_email.is_empty() {
                return Err("启用兰空图床前请填写账号".into());
            }
            if lsky_password.is_empty() {
                return Err("启用兰空图床前请填写密码".into());
            }
        }
        "cloudimgs" if enabled && cloudimgs_url.is_empty() => {
            return Err("启用云图前请填写地址".into());
        }
        "cloudimgs" if enabled && cloudimgs_password.is_empty() => {
            return Err("启用云图前请填写访问密码".into());
        }
        _ => {}
    }

    update_config(|config| {
        config.image_host_provider = Some(provider.clone());
        config.image_host_enabled = Some(enabled);
        config.lsky_url = Some(lsky_url.clone());
        config.lsky_email = if lsky_email.is_empty() {
            None
        } else {
            Some(lsky_email.clone())
        };
        config.lsky_password = if lsky_password.is_empty() {
            None
        } else {
            Some(lsky_password.clone())
        };
        config.lsky_strategy_id = lsky_strategy_id;
        config.lsky_enabled = enabled && provider == "lsky";
        config.cloudimgs_url = Some(cloudimgs_url.clone());
        config.cloudimgs_password = if cloudimgs_password.is_empty() {
            None
        } else {
            Some(cloudimgs_password.clone())
        };
        config.cloudimgs_directory = Some(cloudimgs_directory.clone());
        Ok(())
    })
}

#[tauri::command]
fn search_notes(
    app: tauri::AppHandle,
    query: String,
    options: Option<search::SearchOptions>,
) -> Result<Vec<search::SearchHit>, String> {
    search::search_notes(&app, query, options)
}

#[tauri::command]
fn find_backlinks(app: tauri::AppHandle, title: String) -> Result<Vec<NoteSummary>, String> {
    search::find_backlinks(&app, &title)
}

#[tauri::command]
fn quick_capture_create(app: tauri::AppHandle, content: String) -> Result<NoteSummary, String> {
    capture::quick_capture_create(&app, &content)
}

/// 按当前图床提供商上传图片字节（在 Rust 侧同步执行，前端 invoke 后在线程池运行）。
#[tauri::command]
fn upload_image(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let config = load_config()?;
    let _ = app;
    match resolve_image_host_provider(&config)? {
        ImageHostProvider::None => Err("图床上传未启用".into()),
        ImageHostProvider::Lsky => {
            let base_url = config.lsky_url.as_deref().unwrap_or(lsky::DEFAULT_LSKY_URL);
            let email = config
                .lsky_email
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or("请先配置兰空图床账号")?;
            let password = config
                .lsky_password
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or("请先配置兰空图床密码")?;
            let strategy_id = config.lsky_strategy_id.or(lsky::DEFAULT_LSKY_STRATEGY_ID);
            lsky::login_and_upload(base_url, email, password, strategy_id, &filename, data)
        }
        ImageHostProvider::CloudImgs => {
            let base_url = config
                .cloudimgs_url
                .as_deref()
                .unwrap_or(cloudimgs::DEFAULT_CLOUDIMGS_URL);
            let password = config
                .cloudimgs_password
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or("请先配置云图访问密码")?;
            let directory = config
                .cloudimgs_directory
                .as_deref()
                .unwrap_or(cloudimgs::DEFAULT_CLOUDIMGS_DIRECTORY);
            cloudimgs::upload(base_url, password, directory, &filename, data)
        }
    }
}

/// 兼容旧调用方：仅直接上传到兰空图床。
#[tauri::command]
fn upload_to_lsky(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let config = load_config()?;
    if config.image_host_enabled == Some(false) || !config.lsky_enabled {
        return Err("兰空图床上传未启用".into());
    }
    let base_url = config.lsky_url.as_deref().unwrap_or(lsky::DEFAULT_LSKY_URL);
    let email = config
        .lsky_email
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or("请先配置兰空图床账号")?;
    let password = config
        .lsky_password
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or("请先配置兰空图床密码")?;
    let strategy_id = config.lsky_strategy_id.or(lsky::DEFAULT_LSKY_STRATEGY_ID);
    let _ = app; // 目前不需要 app handle，保留以便后续扩展
    lsky::login_and_upload(base_url, email, password, strategy_id, &filename, data)
}

/// 从图床 URL 下载图片并覆盖本地文件（还原涂鸦前原始图片）
#[tauri::command]
fn download_and_overwrite_asset(
    app: tauri::AppHandle,
    url: String,
    markdown_path: String,
) -> Result<(), String> {
    assets::download_and_overwrite(&app, url, markdown_path)
}

#[tauri::command]
fn clipboard_inbox(app: tauri::AppHandle) -> Result<NoteSummary, String> {
    capture::clipboard_inbox(&app)
}

#[tauri::command]
fn set_note_starred(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    starred: bool,
) -> Result<bool, String> {
    stars::set_note_starred(&app, &zone, &name, starred)
}

#[tauri::command]
fn is_note_starred(app: tauri::AppHandle, zone: String, name: String) -> Result<bool, String> {
    stars::is_note_starred(&app, &zone, &name)
}

#[tauri::command]
fn list_starred_notes(app: tauri::AppHandle) -> Result<Vec<NoteSummary>, String> {
    stars::list_starred_notes(&app)
}

#[tauri::command]
fn import_asset(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    assets::import_asset(&app, source_path)
}

#[tauri::command]
fn import_clipboard_image(
    app: tauri::AppHandle,
    ext: String,
    data: Vec<u8>,
) -> Result<String, String> {
    assets::import_clipboard_image(&app, ext, data)
}

#[tauri::command]
fn set_pinned_tab_limit(limit: u8) -> Result<AppConfig, String> {
    if limit < 1 || limit > 10 {
        return Err("置顶标签数量需在 1 到 10 之间".into());
    }
    update_config(|config| {
        config.pinned_tab_limit = limit;
        // 如果当前置顶数超出新上限，截断
        if let Some(ref mut pinned) = config.pinned_tabs {
            if pinned.len() > limit as usize {
                pinned.truncate(limit as usize);
            }
        }
        Ok(())
    })
}

#[tauri::command]
fn resolve_asset_path(app: tauri::AppHandle, markdown_path: String) -> Result<String, String> {
    let base = paths::writable_base(&app)?;
    assets::resolve_local_image(&base, &markdown_path)
        .ok_or_else(|| format!("无法解析资源路径：{markdown_path}"))
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn resolve_asset_display_url(
    app: tauri::AppHandle,
    markdown_path: String,
) -> Result<String, String> {
    let base = paths::writable_base(&app)?;
    assets::asset_display_url(&base, &markdown_path)
}

#[tauri::command]
fn overwrite_asset(
    app: tauri::AppHandle,
    markdown_path: String,
    data_base64: String,
) -> Result<(), String> {
    assets::overwrite_asset(&app, markdown_path, data_base64)
}

#[tauri::command]
fn set_ai_config(
    api_url: Option<String>,
    api_token: Option<String>,
    model: Option<String>,
) -> Result<AppConfig, String> {
    update_config(|config| {
        config.ai_config = Some(AiConfig {
            api_url: api_url.filter(|s| !s.trim().is_empty()),
            api_token: api_token.filter(|s| !s.trim().is_empty()),
            model: model.filter(|s| !s.trim().is_empty()),
        });
        Ok(())
    })
}

#[tauri::command]
fn set_clip_server(
    app: tauri::AppHandle,
    enabled: bool,
    port: Option<u16>,
) -> Result<AppConfig, String> {
    clip_server::set_clip_server_enabled(&app, enabled, port)
}

#[tauri::command]
fn get_clip_server_token() -> Option<String> {
    clip_server::current_clip_server_token()
}

#[tauri::command]
fn set_fullscreen_dodge(enabled: bool) -> Result<AppConfig, String> {
    update_config(|config| {
        config.fullscreen_dodge = enabled;
        Ok(())
    })
}

#[tauri::command]
fn create_project_note(
    app: tauri::AppHandle,
    folder_title: String,
    project_name: String,
) -> Result<NoteSummary, String> {
    notes::create_project_note(&app, &folder_title, &project_name)
}

#[tauri::command]
fn archive_note(app: tauri::AppHandle, zone: String, name: String) -> Result<NoteSummary, String> {
    let zone = parse_zone(&zone)?;
    notes::archive_note(&app, zone, &name)
}

#[tauri::command]
fn list_trash(app: tauri::AppHandle) -> Result<Vec<trash::TrashEntry>, String> {
    trash::list_trash(&app)
}

#[tauri::command]
fn restore_from_trash(app: tauri::AppHandle, id: String) -> Result<NoteSummary, String> {
    trash::restore_from_trash(&app, &id)
}

#[tauri::command]
fn permanently_delete_trash(app: tauri::AppHandle, id: String) -> Result<(), String> {
    trash::permanently_delete_trash(&app, &id)
}

#[tauri::command]
fn list_custom_tags(app: tauri::AppHandle) -> Result<Vec<custom_tags::CustomTagDef>, String> {
    custom_tags::list_custom_tags_for_app(&app)
}

#[tauri::command]
fn add_custom_tag(
    app: tauri::AppHandle,
    name: String,
    hex: String,
) -> Result<custom_tags::CustomTagDef, String> {
    custom_tags::add_custom_tag_for_app(&app, name, hex)
}

#[tauri::command]
fn delete_custom_tag(app: tauri::AppHandle, id: String) -> Result<(), String> {
    custom_tags::remove_custom_tag_for_app(&app, id)
}

#[tauri::command]
fn update_custom_tag(
    app: tauri::AppHandle,
    id: String,
    name: Option<String>,
    hex: Option<String>,
) -> Result<custom_tags::CustomTagDef, String> {
    custom_tags::update_custom_tag_for_app(&app, id, name, hex)
}

#[derive(Debug, Serialize)]
pub struct SiyuanSyncStatus {
    pub synced: bool,
    pub h_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SiyuanSyncedNoteRef {
    pub zone: String,
    pub name: String,
}

#[tauri::command]
fn get_siyuan_sync_status(
    app: tauri::AppHandle,
    zone: String,
    name: String,
) -> Result<SiyuanSyncStatus, String> {
    let base = paths::writable_base(&app)?;
    parse_zone(&zone)?;
    if let Some(entry) = siyuan_map::get_entry(&base, &zone, &name)? {
        Ok(SiyuanSyncStatus {
            synced: true,
            h_path: Some(entry.h_path),
        })
    } else {
        Ok(SiyuanSyncStatus {
            synced: false,
            h_path: None,
        })
    }
}

#[tauri::command]
fn list_siyuan_synced_notes(app: tauri::AppHandle) -> Result<Vec<SiyuanSyncedNoteRef>, String> {
    let base = paths::writable_base(&app)?;
    let map = siyuan_map::load_map(&base)?;
    Ok(map
        .keys()
        .filter_map(|key| {
            let (zone, name) = key.split_once('\u{0000}')?;
            Some(SiyuanSyncedNoteRef {
                zone: zone.to_string(),
                name: name.to_string(),
            })
        })
        .collect())
}

#[tauri::command]
fn empty_trash(app: tauri::AppHandle) -> Result<(), String> {
    trash::empty_trash(&app)
}

#[tauri::command]
fn list_templates(app: tauri::AppHandle) -> Result<Vec<templates::TemplateSummary>, String> {
    templates::list_templates(&app)
}

#[tauri::command]
fn create_note_from_template(
    app: tauri::AppHandle,
    zone: String,
    template_id: String,
) -> Result<NoteSummary, String> {
    let zone = parse_zone(&zone)?;
    templates::create_note_from_template(&app, zone, &template_id)
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_global_hotkeys(app: tauri::AppHandle, hotkeys: GlobalHotkeys) -> Result<AppConfig, String> {
    #[cfg(desktop)]
    {
        if let Err(e) = system::apply_user_global_hotkeys(&app, &hotkeys) {
            system::register_global_hotkeys(&app);
            return Err(e);
        }
    }
    update_config(|config| {
        config.global_hotkeys = hotkeys.clone();
        Ok(())
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder.plugin(window_icons::init());
    builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            system::handle_cli_args(app, &args);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            system::setup(app.handle())?;
            let initial_args: Vec<String> = std::env::args().skip(1).collect();
            // 启动时的窗口显示必须由 CLI 动作统一决定。无参数默认显示主窗口；
            // Quick 窗口参数只打开对应窗口，避免主 WebView 自行 show 后产生闪窗。
            system::handle_cli_args(app.handle(), &initial_args);
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = detach::restore_popouts_from_config(app_handle.clone()).await;
                let _ = detach::restore_capsules_from_config(app_handle).await;
            });
            Ok(())
        })
        .on_webview_event(|webview, event| {
            if let WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let list: Vec<String> = paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                let _ = webview.emit("mknote:file-drop", list);
            }
        })
        .on_window_event(|window, event| {
            // 仅处理主窗口自身的事件；popout 等其它窗口的事件由各自的
            // on_window_event 处理，否则会把 popout 的关闭/聚焦事件错误地
            // 作用到主窗口上，导致主窗口反复隐藏/置前、焦点抖动直至卡死。
            if window.label() != system::WINDOW_LABEL {
                return;
            }
            if let Some(w) = window.app_handle().get_webview_window(system::WINDOW_LABEL) {
                system::on_window_event(&w, event);
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            get_config,
            quick_data::get_quick_data_directories,
            quick_data::set_quick_data_directory,
            set_autostart,
            set_always_on_top,
            set_editor_font_size,
            set_theme_mode,
            set_theme_styles,
            enter_expanded_layout,
            leave_expanded_layout,
            hide_window,
            show_window,
            toggle_window,
            quick_todo_window::toggle_quick_todo_window,
            snapshot_window_geometry,
            get_note_dir,
            set_open_tabs,
            open_folder,
            list_notes,
            list_folders,
            create_folder,
            rename_folder,
            set_folder_color,
            list_note_colors,
            list_notes_by_color,
            set_note_color,
            set_note_color_labels,
            read_note,
            read_note_snapshot,
            ensure_visual_editor_migration_snapshot,
            write_note,
            write_note_checked,
            create_note,
            ensure_default_note,
            read_default_note,
            read_default_note_snapshot,
            write_default_note,
            write_default_note_checked,
            rename_note,
            delete_note,
            delete_empty_note_if_needed,
            move_note,
            set_last_note_file,
            set_global_hotkeys,
            record_recent_note,
            clear_recent_notes,
            lsky_test_connection,
            cloudimgs_test_connection,
            set_image_host_config,
            cloudimgs_cleanup::scan_cloudimgs_cleanup,
            cloudimgs_cleanup::delete_cloudimgs_cleanup,
            search_notes,
            find_backlinks,
            quick_capture_create,
            quick_todo::quick_todo_list,
            quick_todo::quick_todo_registry_list,
            quick_todo::quick_todo_create,
            quick_todo::quick_todo_rename,
            quick_todo::quick_todo_delete_todo,
            quick_todo::quick_todo_add,
            quick_todo::quick_todo_edit,
            quick_todo::quick_todo_set_tag,
            quick_todo::quick_todo_set_reminder,
            quick_todo::quick_todo_set_link,
            quick_todo::quick_todo_toggle,
            quick_todo::quick_todo_delete,
            quick_todo::quick_todo_reorder,
            quick_todo::quick_todo_clear_completed,
            quick_todo_window::open_quick_todo_window,
            quick_todo::quick_todo_open_work_source,
            quick_todo_window::get_quick_todo_window_state,
            quick_todo_window::hide_quick_todo_window,
            quick_todo_window::open_quick_todo_reminder_window,
            quick_todo_window::hide_quick_todo_reminder_window,
            quick_todo_window::set_quick_todo_always_on_top,
            quick_todo_window::set_quick_todo_locked,
            quick_pocket::quick_pocket_registry_list,
            quick_pocket::quick_pocket_create,
            quick_pocket::quick_pocket_rename,
            quick_pocket::quick_pocket_delete_pocket,
            quick_pocket::quick_pocket_list,
            quick_pocket::quick_pocket_add,
            quick_pocket::quick_pocket_update,
            quick_pocket::quick_pocket_delete,
            quick_pocket::quick_pocket_reorder,
            quick_pocket::quick_pocket_create_group,
            quick_pocket::quick_pocket_rename_group,
            quick_pocket::quick_pocket_dissolve_group,
            quick_pocket::quick_pocket_move_item,
            quick_pocket_window::open_quick_pocket_window,
            quick_pocket_window::get_quick_pocket_window_state,
            quick_pocket_window::toggle_quick_pocket_window,
            quick_pocket_window::hide_quick_pocket_window,
            quick_pocket_window::set_quick_pocket_always_on_top,
            quick_pocket_window::set_quick_pocket_locked,
            clipboard_inbox,
            set_note_starred,
            is_note_starred,
            list_starred_notes,
            import_asset,
            import_clipboard_image,
            set_pinned_tab_limit,
            resolve_asset_path,
            resolve_asset_display_url,
            overwrite_asset,
            detach::open_note_popout,
            detach::close_note_popout,
            detach::delete_note_popout,
            detach::take_popout_init,
            detach::open_capsule,
            detach::take_capsule_init,
            detach::close_capsule,
            detach::restore_capsule_to_popout,
            detach::restore_popout_to_capsule,
            detach::collapse_note_window_to_capsule,
            detach::expand_note_window_from_capsule,
            detach::ack_unified_note_window_mode_ready,
            detach::settle_unified_note_capsule_position,
            detach::begin_capsule_drag,
            detach::settle_capsule_position,
            detach::settle_popout_geometry,
            detach::set_capsule_always_on_top,
            detach::set_popout_always_on_top,
            detach::hide_capsule_snap,
            detach::show_capsule_snap,
            detach::notify_popped_out_renamed,
            detach::show_tab_drag_preview,
            detach::hide_tab_drag_preview,
            detach::take_tab_drag_preview_state,
            detach::complete_capsule_note,
            set_ai_config,
            set_clip_server,
            get_clip_server_token,
            create_project_note,
            archive_note,
            list_trash,
            restore_from_trash,
            permanently_delete_trash,
            empty_trash,
            list_custom_tags,
            add_custom_tag,
            delete_custom_tag,
            update_custom_tag,
            get_siyuan_sync_status,
            list_siyuan_synced_notes,
            list_templates,
            create_note_from_template,
            exit_app,
            refresh_agent_index,
            siyuan_test_connection,
            siyuan_list_notebooks,
            set_siyuan_config,
            siyuan_upload_current_note,
            note_classification::set_note_classification_config,
            note_classification::test_note_classification_connection,
            note_classification::suggest_note_folder,
            note_classification::apply_note_classification,
            note_upload::set_note_upload_config,
            note_upload::obsidian_upload_current_note,
            message_hub_test_connection,
            sync_status,
            set_sync_enabled,
            sync_bootstrap,
            sync_tick,
            sync_protect_default_note,
            sync_resolve_conflicts,
            set_message_hub_s3_config,
            upload_image,
            upload_to_lsky,
            lsky_cleanup::scan_lsky_cleanup,
            lsky_cleanup::delete_lsky_cleanup,
            download_and_overwrite_asset,
            scripts::run_script,
            scripts::issue_script_confirmation,
            set_fullscreen_dodge,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                #[cfg(desktop)]
                system::unregister_global_hotkey(app);
            }
        });
}
