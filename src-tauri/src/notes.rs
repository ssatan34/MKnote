use crate::paths::{self, NoteZone};
use crate::{custom_tags, load_config, AppConfig};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;
use tauri::{AppHandle, Runtime};

const MAX_FOLDERS: usize = 8;
const FOLDER_COLORS: &[&str] = &[
    "blue", "red", "orange", "green", "purple", "pink", "slate", "teal",
];
/// 笔记颜色标签合法 ID（与前端 `src/constants/noteColors.ts` 保持一致）
pub const NOTE_COLOR_IDS: &[&str] = &["重要", "紧急", "存档", "待办", "隐私"];
pub const DEFAULT_NOTE_NAME: &str = "default-note.md";
const MIGRATION_SNAPSHOT_DIR_NAME: &str = ".mknote-migration-snapshots";
const TEST_SAVE_DELAY_MS_ENV: &str = "MKN_TEST_SAVE_DELAY_MS";
const TEST_SAVE_FAILURE_ENV: &str = "MKN_TEST_SAVE_FAILURE";

static NOTE_METADATA_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn note_metadata_io_guard() -> std::sync::MutexGuard<'static, ()> {
    NOTE_METADATA_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct NoteSummary {
    pub name: String,
    pub title: String,
    pub modified_ms: i64,
    pub zone: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct NoteFolderSummary {
    pub id: String,
    pub title: String,
    pub zone: String,
    pub color: String,
    pub note_count: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct NoteColorSummary {
    pub color: String,
    pub note_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct FolderMeta {
    folders: std::collections::BTreeMap<String, FolderMetaItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FolderMetaItem {
    color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Default)]
pub(crate) struct NoteColorMeta {
    notes: std::collections::BTreeMap<String, String>,
}

pub fn timestamp_filename() -> String {
    let now = chrono::Local::now();
    format!(
        "{}{:03}.md",
        now.format("%Y%m%d%H%M%S"),
        now.timestamp_subsec_millis()
    )
}

pub fn title_from_name(name: &str) -> String {
    name.strip_suffix(".md").unwrap_or(name).to_string()
}

fn sanitize_md_filename(stem: &str) -> Result<String, String> {
    let stem = stem.trim();
    if stem.is_empty() {
        return Err("标题不能为空".into());
    }
    const BAD: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if stem.chars().any(|c| BAD.contains(&c)) {
        return Err("标题包含非法文件名字符".into());
    }
    if stem.contains("..") {
        return Err("无效文件名".into());
    }
    validate_windows_name_component(stem)?;
    Ok(format!("{stem}.md"))
}

fn sanitize_folder_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("文件夹名称不能为空".into());
    }
    const BAD: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if name.chars().any(|c| BAD.contains(&c)) || name.contains("..") {
        return Err("文件夹名称包含非法字符".into());
    }
    validate_windows_name_component(name)?;
    Ok(name.to_string())
}

/// Windows 保留设备名、尾随空格/点（便签标题与文件夹名共用）。
fn validate_windows_name_component(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("名称不能为空".into());
    }
    if name != trimmed || name.ends_with(' ') || name.ends_with('.') {
        return Err("名称不能以空格或点结尾".into());
    }
    let upper = name.to_ascii_uppercase();
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.contains(&upper.as_str()) {
        return Err("名称不能使用 Windows 保留名称（如 CON、NUL）".into());
    }
    Ok(())
}

fn validate_folder_color(color: &str) -> Result<(), String> {
    if FOLDER_COLORS.contains(&color) {
        Ok(())
    } else {
        Err("不支持的文件夹颜色".into())
    }
}

fn folder_meta_path(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(".mknote-folders.json")
}

fn load_folder_meta(base: &Path) -> Result<FolderMeta, String> {
    let path = folder_meta_path(base);
    let data = match fs::read_to_string(path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(FolderMeta::default())
        }
        Err(error) => return Err(format!("读取文件夹元数据失败：{error}")),
    };
    serde_json::from_str(&data).map_err(|error| format!("文件夹元数据格式错误：{error}"))
}

fn save_folder_meta(base: &Path, meta: &FolderMeta) -> Result<(), String> {
    let root = paths::file_root_path(base);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    atomic_write_file(&folder_meta_path(base), &data)
}

fn note_color_meta_path(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(".mknote-note-colors.json")
}

pub fn note_key(zone: &NoteZone, name: &str) -> String {
    format!("{}::{}", zone.as_str(), name)
}

fn migrate_note_color_id(old: &str) -> Option<String> {
    if NOTE_COLOR_IDS.contains(&old) {
        return Some(old.to_string());
    }
    let mapped = match old {
        "purple" | "pink" | "catppuccin" => "隐私",
        "red" | "ares" => "紧急",
        "blue" | "teal" | "poseidon" => "待办",
        "green" | "slate" | "mknote" => "存档",
        "orange" | "hermes" => "重要",
        _ => return None,
    };
    Some(mapped.to_string())
}

fn normalize_note_color_meta(base: &Path, meta: &mut NoteColorMeta) -> bool {
    let entries: Vec<(String, String)> = meta
        .notes
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    meta.notes.clear();
    let mut changed = false;
    for (key, color) in entries {
        if custom_tags::is_custom_tag_id(&color) {
            if custom_tags::is_allowed_note_color(base, &color) {
                meta.notes.insert(key, color);
            } else {
                changed = true;
            }
            continue;
        }
        let Some(new_color) = migrate_note_color_id(&color) else {
            changed = true;
            continue;
        };
        if new_color != color {
            changed = true;
        }
        meta.notes.insert(key, new_color);
    }
    changed
}

fn load_note_color_meta(base: &Path) -> Result<NoteColorMeta, String> {
    let path = note_color_meta_path(base);
    let data = match fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(NoteColorMeta::default())
        }
        Err(error) => return Err(format!("读取便签颜色元数据失败：{error}")),
    };
    let mut meta: NoteColorMeta = serde_json::from_str(&data)
        .map_err(|error| format!("便签颜色元数据格式错误：{error}"))?;
    // 读取路径只在内存中完成旧颜色迁移，避免一次普通读取隐式覆盖并发写入。
    normalize_note_color_meta(base, &mut meta);
    Ok(meta)
}

fn save_note_color_meta(base: &Path, meta: &NoteColorMeta) -> Result<(), String> {
    let root = paths::file_root_path(base);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    atomic_write_file(&note_color_meta_path(base), &data)
}

fn validate_note_color(base: &Path, color: &str) -> Result<(), String> {
    if custom_tags::is_allowed_note_color(base, color) {
        Ok(())
    } else {
        Err("不支持的颜色标签".into())
    }
}

fn sanitize_existing_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("文件名不能为空".into());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("文件名不能包含路径分隔符".into());
    }
    let file_name = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?;
    if file_name != name {
        return Err("文件名不能包含路径".into());
    }
    if !file_name.ends_with(".md") {
        return Err("便签文件必须以 .md 结尾".into());
    }
    if file_name == ".md" || file_name.starts_with('.') {
        return Err("无效文件名".into());
    }
    if file_name.contains("..") {
        return Err("无效文件名".into());
    }
    let stem = file_name.strip_suffix(".md").unwrap_or(file_name);
    validate_windows_name_component(stem)?;
    Ok(file_name.to_string())
}

fn unique_path(dir: &Path, mut name: String) -> PathBuf {
    let mut path = dir.join(&name);
    if !path.exists() {
        return path;
    }
    let stem = name.strip_suffix(".md").unwrap_or(&name).to_string();
    loop {
        let suffix = random_suffix();
        name = format!("{stem}{suffix}.md");
        path = dir.join(&name);
        if !path.exists() {
            return path;
        }
    }
}

fn random_suffix() -> u16 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    SystemTime::now().hash(&mut h);
    (h.finish() % 9000 + 1000) as u16
}

fn file_modified_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 先写临时文件再替换，避免写入中断导致原 `.md` 损坏。
fn atomic_temp_path(path: &Path) -> PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    path.with_extension(format!(
        "md.{}.{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn atomic_write_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = atomic_temp_path(path);
    let write_result = (|| -> Result<(), String> {
        use std::io::Write;
        let mut file = fs::File::create(&tmp)
            .map_err(|e| format!("创建临时文件失败：{e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("写入临时文件失败：{e}"))?;
        file.sync_all()
            .map_err(|e| format!("同步临时文件失败：{e}"))
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(error);
    }
    crate::replace_config_file(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("保存便签失败：{e}")
    })
}

pub(crate) fn content_hash(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

/// 仅在隔离 smoke 显式设置环境变量时注入保存延迟，普通运行路径不受影响。
fn parse_test_save_delay(value: Option<&str>) -> Result<Option<u64>, String> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    value
        .parse::<u64>()
        .map(Some)
        .map_err(|_| "测试保存延迟必须是非负整数毫秒".to_string())
}

fn is_test_save_failure_enabled(value: Option<&str>) -> bool {
    matches!(
        value.map(str::trim).map(str::to_ascii_lowercase).as_deref(),
        Some("1") | Some("true") | Some("yes") | Some("on")
    )
}

fn apply_test_save_delay() -> Result<(), String> {
    let configured = std::env::var(TEST_SAVE_DELAY_MS_ENV).ok();
    if let Some(milliseconds) = parse_test_save_delay(configured.as_deref())? {
        if milliseconds > 0 {
            std::thread::sleep(std::time::Duration::from_millis(milliseconds));
        }
    }
    Ok(())
}

fn should_inject_test_save_failure() -> bool {
    let configured = std::env::var(TEST_SAVE_FAILURE_ENV).ok();
    is_test_save_failure_enabled(configured.as_deref())
}

fn migration_snapshot_root(base: &Path) -> PathBuf {
    paths::file_root_path(base)
        .join(".private")
        .join(MIGRATION_SNAPSHOT_DIR_NAME)
}

pub(crate) fn migration_snapshot_path(
    base: &Path,
    zone: &NoteZone,
    name: &str,
) -> PathBuf {
    let key = format!("{}\0{}", zone.as_str(), name);
    let filename = format!("{}.md", hex::encode(Sha256::digest(key.as_bytes())));
    migration_snapshot_root(base).join(filename)
}

pub(crate) fn ensure_migration_snapshot_at(
    base: &Path,
    config: &AppConfig,
    zone: &NoteZone,
    name: &str,
) -> Result<(), String> {
    let name = sanitize_existing_name(name)?;
    let snapshot_path = migration_snapshot_path(base, zone, &name);

    // Snapshot creation is idempotent. Avoid reading or creating anything when
    // the first snapshot already exists.
    if snapshot_path.exists() {
        if snapshot_path.is_file() {
            return Ok(());
        }
        return Err("迁移快照路径不是文件".to_string());
    }

    let source_path = zone.dir(config, base).join(&name);
    let content = match fs::read_to_string(&source_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("读取迁移前便签失败：{error}")),
    };

    // Keep this store inside the hidden private root, but outside the private
    // note zone itself so it cannot enter normal note history or sync scans.
    paths::ensure_private_dir(base)?;
    let root = migration_snapshot_root(base);
    fs::create_dir_all(&root).map_err(|error| format!("创建迁移快照目录失败：{error}"))?;

    let mut file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&snapshot_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if snapshot_path.is_file() {
                return Ok(());
            }
            return Err("迁移快照路径不是文件".to_string());
        }
        Err(error) => return Err(format!("创建迁移快照失败：{error}")),
    };

    use std::io::Write;
    if let Err(error) = file
        .write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
    {
        let _ = fs::remove_file(&snapshot_path);
        return Err(format!("写入迁移快照失败：{error}"));
    }

    Ok(())
}

fn revision_for_path(path: &Path, content: &str) -> NoteRevision {
    NoteRevision {
        content_hash: content_hash(content),
        modified_ms: file_modified_ms(path),
    }
}

fn atomic_write_file_checked(
    path: &Path,
    content: &str,
    expected_content_hash: Option<&str>,
) -> Result<NoteRevision, String> {
    apply_test_save_delay()?;
    let _write_lock = crate::process_file_lock(path)?;
    if let Some(expected) = expected_content_hash {
        let current = match fs::read_to_string(path) {
            Ok(current) => current,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(format!("读取便签当前版本失败：{error}")),
        };
        let actual = content_hash(&current);
        if actual != expected {
            return Err("便签已被外部修改，拒绝覆盖当前版本".to_string());
        }
    }

    if should_inject_test_save_failure() {
        return Err("测试故障注入：模拟便签写入失败".to_string());
    }

    atomic_write_file(path, content)?;
    Ok(revision_for_path(path, content))
}

fn rollback_renamed_path(new_path: &Path, old_path: &Path) -> Result<(), String> {
    if old_path.exists() {
        return Err(format!(
            "原文件夹恢复目标已存在：{}",
            old_path.display()
        ));
    }
    fs::rename(new_path, old_path)
        .map_err(|error| format!("恢复原文件夹名称失败：{error}"))?;
    crate::sync_parent_directory(old_path)
}

pub fn list_zone<R: Runtime>(
    app: &AppHandle<R>, zone: NoteZone,
) -> Result<Vec<NoteSummary>, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let color_meta = load_note_color_meta(&base)?;
    list_zone_at(&base, &config, zone, &color_meta)
}

pub(crate) fn list_zone_at(
    base: &Path, config: &AppConfig, zone: NoteZone, color_meta: &NoteColorMeta,
) -> Result<Vec<NoteSummary>, String> {
    let root = zone.dir(config, base);
    let mut notes = Vec::new();
    if !root.is_dir() {
        return Ok(notes);
    }
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        notes.push(NoteSummary {
            title: title_from_name(&name),
            modified_ms: file_modified_ms(&path),
            name: name.clone(),
            zone: zone.as_str(),
            color: color_meta.notes.get(&note_key(&zone, &name)).cloned(),
        });
    }
    notes.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(notes)
}

pub fn note_exists<R: Runtime>(app: &AppHandle<R>, zone: NoteZone, name: &str) -> bool {
    let Ok(base) = paths::writable_base(app) else {
        return false;
    };
    let Ok(config) = load_config() else {
        return false;
    };
    let Ok(name) = sanitize_existing_name(name) else {
        return false;
    };
    zone.dir(&config, &base).join(&name).is_file()
}

/// 文件存在检查——使用已解析好的 base，不重复调 load_config()/writable_base()。
/// 路径完全由 base 决定，并保持与其它 zone 路径解析一致。
fn note_exists_at(base: &std::path::Path, zone: NoteZone, name: &str) -> bool {
    let Ok(name) = sanitize_existing_name(name) else {
        return false;
    };
    let dir = match &zone {
        NoteZone::Inbox => base.join("inbox"),
        NoteZone::Default => base.join("File").join("default"),
        NoteZone::Folder(id) => paths::safe_folder_dir(base, id),
        NoteZone::Private => base.join("File").join(".private"),
    };
    dir.join(&name).is_file()
}

pub fn prune_stale_config_refs<R: Runtime>(app: &AppHandle<R>, config: &mut AppConfig) -> bool {
    // 解析 base 一次，消除 N 个 tab 各自调 load_config()/writable_base() 的重复 IO
    let Ok(base) = paths::writable_base(app) else {
        return false;
    };

    let mut changed = false;
    if let Some(tabs) = config.open_tabs.as_mut() {
        let before = tabs.len();
        tabs.retain(|t| {
            paths::parse_zone(&t.zone)
                .ok()
                .map(|z| note_exists_at(&base, z, &t.name))
                .unwrap_or(false)
        });
        if tabs.len() != before {
            changed = true;
        }
        if tabs.is_empty() {
            config.open_tabs = None;
            changed = true;
        }
    }
    if let (Some(ref name), Some(ref zone_str)) = (&config.last_note, &config.last_note_zone) {
        let missing = paths::parse_zone(zone_str)
            .ok()
            .map(|z| !note_exists_at(&base, z, name))
            .unwrap_or(true);
        if missing {
            config.last_note = None;
            config.last_note_zone = None;
            changed = true;
        }
    }
    changed
}

pub fn read_note<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
) -> Result<String, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    read_note_at(&base, &config, zone, name)
}

pub(crate) fn read_note_at(base: &Path, config: &AppConfig, zone: NoteZone, name: &str) -> Result<String, String> {
    let name = sanitize_existing_name(name)?;
    let path = zone.dir(&config, &base).join(&name);
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn read_note_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
) -> Result<NoteSnapshot, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let name = sanitize_existing_name(name)?;
    let path = zone.dir(&config, &base).join(&name);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let revision = revision_for_path(&path, &content);
    Ok(NoteSnapshot {
        content,
        content_hash: revision.content_hash,
        modified_ms: revision.modified_ms,
    })
}

pub fn write_note<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
    content: &str,
) -> Result<(), String> {
    write_note_checked(app, zone, name, content, None).map(|_| ())
}

pub fn write_note_checked<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
    content: &str,
    expected_content_hash: Option<&str>,
) -> Result<NoteRevision, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let name = sanitize_existing_name(name)?;
    let path = zone.dir(&config, &base).join(&name);
    atomic_write_file_checked(&path, content, expected_content_hash)
}

pub fn create_note<R: Runtime>(app: &AppHandle<R>, zone: NoteZone) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let dir = zone.dir(&config, &base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 确保隐私目录保持隐藏属性（目录可能被手动删除后重新创建）
    if zone == NoteZone::Private {
        paths::ensure_private_dir(&base)?;
    }
    let path = unique_path(&dir, timestamp_filename());
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "无法确定新建便签文件名".to_string())?;
    atomic_write_file(&path, "\n")?;
    // 隐私笔记不写入 last_note（避免启动时尝试恢复私密笔记）
    if should_persist_last_note(&zone) {
        if let Err(error) = crate::update_config(|config| {
            config.last_note = Some(name.clone());
            config.last_note_zone = Some(zone.as_str());
            Ok(())
        }) {
            let _ = fs::remove_file(&path);
            return Err(format!("保存新建便签状态失败，已删除文件：{error}"));
        }
    }
    Ok(NoteSummary {
        title: title_from_name(&name),
        modified_ms: file_modified_ms(&path),
        name,
        zone: zone.as_str(),
        color: None,
    })
}

pub fn ensure_default_note<R: Runtime>(app: &AppHandle<R>) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let path = base.join(DEFAULT_NOTE_NAME);
    if !path.exists() {
        atomic_write_file(&path, "默认便签\n")?;
    }
    Ok(NoteSummary {
        title: "默认便签".to_string(),
        modified_ms: file_modified_ms(&path),
        name: DEFAULT_NOTE_NAME.to_string(),
        zone: "default".to_string(),
        color: None,
    })
}

pub fn read_default_note_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<NoteSnapshot, String> {
    let base = paths::writable_base(app)?;
    let path = base.join(DEFAULT_NOTE_NAME);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let revision = revision_for_path(&path, &content);
    Ok(NoteSnapshot {
        content,
        content_hash: revision.content_hash,
        modified_ms: revision.modified_ms,
    })
}

pub fn write_default_note_checked<R: Runtime>(
    app: &AppHandle<R>,
    content: &str,
    expected_content_hash: Option<&str>,
) -> Result<NoteRevision, String> {
    let base = paths::writable_base(app)?;
    let path = base.join(DEFAULT_NOTE_NAME);
    atomic_write_file_checked(&path, content, expected_content_hash)
}

pub fn is_default_note(name: &str) -> bool {
    name == DEFAULT_NOTE_NAME
}

pub fn rename_note<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    old_name: &str,
    new_title: &str,
) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let original_config = config.clone();
    let old_name = sanitize_existing_name(old_name)?;
    let dir = zone.dir(&config, &base);
    let old_path = dir.join(&old_name);
    if !old_path.exists() {
        return Err("便签不存在".into());
    }
    let new_name = sanitize_md_filename(new_title)?;
    let new_path = unique_path(&dir, new_name.clone());
    let _metadata_guard = note_metadata_io_guard();
    let _color_process_lock = crate::process_file_lock(&note_color_meta_path(&base))?;
    let mut color_meta = load_note_color_meta(&base)?;
    let original_color_meta = color_meta.clone();
    let old_key = note_key(&zone, &old_name);
    let color = color_meta.notes.remove(&old_key);
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    let name = new_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if let Some(color) = color {
        color_meta.notes.insert(note_key(&zone, &name), color);
    }
    if config.last_note.as_deref() == Some(old_name.as_str()) {
        if let Err(error) = crate::update_config(|config| {
            config.last_note = Some(name.clone());
            config.last_note_zone = Some(zone.as_str());
            Ok(())
        }) {
            return match rollback_renamed_path(&new_path, &old_path) {
                Ok(()) => Err(format!("保存重命名状态失败，已恢复原文件名：{error}")),
                Err(rollback_error) => Err(format!(
                    "保存重命名状态失败，恢复原文件名也失败：{error}；{rollback_error}"
                )),
            };
        }
    }
    if color_meta != original_color_meta {
        if let Err(error) = save_note_color_meta(&base, &color_meta) {
            let config_rollback = if config.last_note.as_deref() == Some(old_name.as_str()) {
                crate::update_config(|config| {
                    if config.last_note.as_deref() == Some(name.as_str())
                        && config.last_note_zone.as_deref() == Some(zone.as_str().as_str())
                    {
                        config.last_note = original_config.last_note.clone();
                        config.last_note_zone = original_config.last_note_zone.clone();
                    }
                    Ok(())
                })
                .err()
            } else {
                None
            };
            let file_rollback = rollback_renamed_path(&new_path, &old_path).err();
            let mut details = format!("保存重命名颜色元数据失败：{error}");
            if let Some(rollback_error) = config_rollback {
                details.push_str(&format!("；配置回滚失败：{rollback_error}"));
            }
            if let Some(rollback_error) = file_rollback {
                details.push_str(&format!("；文件名回滚失败：{rollback_error}"));
            }
            return Err(details);
        }
    }
    let title = title_from_name(&name);
    crate::siyuan::on_note_renamed(&base, &zone.as_str(), &old_name, &name, &title);
    let _ = crate::stars::on_note_renamed(&base, &zone.as_str(), &old_name, &name);
    crate::on_recent_note_renamed(&zone.as_str(), &old_name, &name);
    Ok(NoteSummary {
        title,
        modified_ms: file_modified_ms(&new_path),
        name: name.clone(),
        zone: zone.as_str(),
        color: color_meta.notes.get(&note_key(&zone, &name)).cloned(),
    })
}

pub fn delete_note<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
) -> Result<(), String> {
    crate::trash::move_to_trash(app, zone, name)?;
    let name = sanitize_existing_name(name)?;
    crate::update_config(|config| {
        if config.last_note.as_deref() == Some(name.as_str()) {
            config.last_note = None;
            config.last_note_zone = None;
        }
        Ok(())
    })?;
    Ok(())
}

/// 关闭笔记时清理没有正文的临时笔记；移入回收站以保留误删恢复能力。
pub fn delete_if_empty<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
) -> Result<bool, String> {
    if zone == NoteZone::Default && name == DEFAULT_NOTE_NAME {
        return Ok(false);
    }
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let name = sanitize_existing_name(name)?;
    let path = zone.dir(&config, &base).join(&name);
    if !path.is_file() {
        return Ok(false);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if !content.trim().is_empty() {
        return Ok(false);
    }
    crate::trash::move_to_trash(app, zone, &name)?;
    crate::update_config(|config| {
        if config.last_note.as_deref() == Some(name.as_str()) {
            config.last_note = None;
            config.last_note_zone = None;
        }
        Ok(())
    })?;
    Ok(true)
}

/// 归档：移动到 `File/archive/` 并设置「存档」颜色标签。
pub fn archive_note<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    ensure_archive_folder(&base)?;
    let archive = archive_zone();
    let name = sanitize_existing_name(name)?;
    if zone.as_str() == archive.as_str() {
        return set_note_color(app, zone, &name, Some("存档".to_string()));
    }
    let moved = move_note(app, zone, archive.clone(), &name)?;
    set_note_color(app, archive, &moved.name, Some("存档".to_string()))
}

pub const ARCHIVE_FOLDER_NAME: &str = "archive";

pub fn archive_folder_path(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(ARCHIVE_FOLDER_NAME)
}

pub fn ensure_archive_folder(base: &Path) -> Result<(), String> {
    fs::create_dir_all(archive_folder_path(base)).map_err(|e| e.to_string())
}

pub fn archive_zone() -> NoteZone {
    NoteZone::Folder(ARCHIVE_FOLDER_NAME.to_string())
}

pub fn is_privacy_note(base: &Path, zone: &NoteZone, name: &str) -> Result<bool, String> {
    let meta = load_note_color_meta(base)?;
    Ok(meta
        .notes
        .get(&note_key(zone, name))
        .map(|c| c == "隐私")
        .unwrap_or(false))
}

pub fn sanitize_existing_name_pub(name: &str) -> Result<String, String> {
    sanitize_existing_name(name)
}

pub fn unique_path_pub(dir: &Path, name: String) -> PathBuf {
    unique_path(dir, name)
}

pub fn atomic_write_file_pub(path: &Path, content: &str) -> Result<(), String> {
    atomic_write_file(path, content)
}

pub fn file_modified_ms_pub(path: &Path) -> i64 {
    file_modified_ms(path)
}

pub fn load_note_color_meta_pub(base: &Path) -> Result<NoteColorMeta, String> {
    load_note_color_meta(base)
}

pub fn clear_note_color(base: &Path, zone: &NoteZone, name: &str) -> Result<(), String> {
    let _metadata_guard = note_metadata_io_guard();
    let _process_lock = crate::process_file_lock(&note_color_meta_path(base))?;
    let mut meta = load_note_color_meta(base)?;
    if meta.notes.remove(&note_key(zone, name)).is_some() {
        save_note_color_meta(base, &meta)?;
    }
    Ok(())
}

pub fn move_note<R: Runtime>(
    app: &AppHandle<R>,
    from: NoteZone,
    to: NoteZone,
    name: &str,
) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let original_config = config.clone();
    let name = sanitize_existing_name(name)?;
    let from_dir = from.dir(&config, &base);
    let to_dir = to.dir(&config, &base);
    fs::create_dir_all(&to_dir).map_err(|e| e.to_string())?;
    let src = from_dir.join(&name);
    if !src.exists() {
        return Err("便签不存在".into());
    }
    let old_name_for_config = name.clone();
    let dest = unique_path(&to_dir, name);
    let new_name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let _metadata_guard = note_metadata_io_guard();
    let _color_process_lock = crate::process_file_lock(&note_color_meta_path(&base))?;
    let mut color_meta = load_note_color_meta(&base)?;
    let original_color_meta = color_meta.clone();
    let old_key = note_key(&from, &old_name_for_config);
    let color = color_meta.notes.remove(&old_key);
    if let Some(color) = color.clone() {
        color_meta.notes.insert(note_key(&to, &new_name), color);
    }
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    if config.last_note.as_deref() == Some(old_name_for_config.as_str()) {
        if let Err(error) = crate::update_config(|config| {
            config.last_note = Some(new_name.clone());
            config.last_note_zone = Some(to.as_str());
            Ok(())
        }) {
            return match rollback_renamed_path(&dest, &src) {
                Ok(()) => Err(format!("保存移动状态失败，已恢复原文件位置：{error}")),
                Err(rollback_error) => Err(format!(
                    "保存移动状态失败，恢复原文件位置也失败：{error}；{rollback_error}"
                )),
            };
        }
    }
    if color.is_some() {
        if let Err(error) = save_note_color_meta(&base, &color_meta) {
            let config_rollback = if config.last_note.as_deref() == Some(old_name_for_config.as_str()) {
                crate::update_config(|config| {
                    if config.last_note.as_deref() == Some(new_name.as_str())
                        && config.last_note_zone.as_deref() == Some(to.as_str().as_str())
                    {
                        config.last_note = original_config.last_note.clone();
                        config.last_note_zone = original_config.last_note_zone.clone();
                    }
                    Ok(())
                })
                .err()
            } else {
                None
            };
            let metadata_rollback = save_note_color_meta(&base, &original_color_meta).err();
            let file_rollback = rollback_renamed_path(&dest, &src).err();
            let mut details = format!("保存移动颜色元数据失败：{error}");
            if let Some(rollback_error) = config_rollback {
                details.push_str(&format!("；配置回滚失败：{rollback_error}"));
            }
            if let Some(rollback_error) = metadata_rollback {
                details.push_str(&format!("；颜色元数据回滚失败：{rollback_error}"));
            }
            if let Some(rollback_error) = file_rollback {
                details.push_str(&format!("；文件位置回滚失败：{rollback_error}"));
            }
            return Err(details);
        }
    }
    Ok(NoteSummary {
        title: title_from_name(&new_name),
        modified_ms: file_modified_ms(&dest),
        name: new_name.clone(),
        zone: to.as_str(),
        color: color_meta.notes.get(&note_key(&to, &new_name)).cloned(),
    })
}

/// 全库颜色标签计数（固定返回 5 种标签，含 0 计数）
pub fn list_note_colors<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<NoteColorSummary>, String> {
    let base = paths::writable_base(app)?;
    let meta = load_note_color_meta(&base)?;
    let mut counts = std::collections::BTreeMap::<String, usize>::new();
    for (_, color) in meta.notes {
        *counts.entry(color).or_insert(0) += 1;
    }
    Ok(NOTE_COLOR_IDS
        .iter()
        .map(|id| NoteColorSummary {
            color: (*id).to_string(),
            note_count: *counts.get(*id).unwrap_or(&0),
        })
        .chain(
            custom_tags::load_custom_tags(&base)?
                .into_iter()
                .map(|tag| NoteColorSummary {
                    color: tag.id.clone(),
                    note_count: *counts.get(&tag.id).unwrap_or(&0),
                }),
        )
        .collect())
}

pub fn list_notes_by_color<R: Runtime>(
    app: &AppHandle<R>,
    color: &str,
) -> Result<Vec<NoteSummary>, String> {
    let base = paths::writable_base(app)?;
    validate_note_color(&base, color)?;
    let config = load_config()?;
    let meta = load_note_color_meta(&base)?;
    let mut notes = Vec::new();
    for (key, note_color) in &meta.notes {
        if note_color != color {
            continue;
        }
        let Some((zone_str, name)) = key.split_once("::") else {
            continue;
        };
        let zone = paths::parse_zone(zone_str)?;
        let name = match sanitize_existing_name(name) {
            Ok(n) => n,
            Err(_) => continue,
        };
        let path = zone.dir(&config, &base).join(&name);
        if !path.exists() {
            continue;
        }
        notes.push(NoteSummary {
            title: title_from_name(&name),
            modified_ms: file_modified_ms(&path),
            name,
            zone: zone.as_str(),
            color: Some(color.to_string()),
        });
    }
    notes.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(notes)
}

pub fn set_note_color<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
    color: Option<String>,
) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let _metadata_guard = note_metadata_io_guard();
    let _process_lock = crate::process_file_lock(&note_color_meta_path(&base))?;
    let config = load_config()?;
    let name = sanitize_existing_name(name)?;
    let path = zone.dir(&config, &base).join(&name);
    if !path.exists() {
        return Err("便签不存在".into());
    }
    let color = color
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(value) = color.as_deref() {
        validate_note_color(&base, value)?;
    }
    let mut meta = load_note_color_meta(&base)?;
    let key = note_key(&zone, &name);
    match color.clone() {
        Some(value) => {
            meta.notes.insert(key, value);
        }
        None => {
            meta.notes.remove(&key);
        }
    }
    save_note_color_meta(&base, &meta)?;
    Ok(NoteSummary {
        title: title_from_name(&name),
        modified_ms: file_modified_ms(&path),
        name,
        zone: zone.as_str(),
        color,
    })
}

fn is_system_folder(id: &str) -> bool {
    id.starts_with('.') || id.eq_ignore_ascii_case("templates")
}

/// 快速统计目录下 .md 文件数量，不加载颜色元数据，仅用于 list_folders 的 note_count。
fn count_md_files(dir: &std::path::Path) -> Result<usize, String> {
    let mut count = 0;
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(format!("读取便签目录失败：{error}")),
    };
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取便签目录项失败：{error}"))?;
        if entry.path().extension().and_then(|x| x.to_str()) == Some("md") {
            count += 1;
        }
    }
    Ok(count)
}

pub fn list_folders<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<NoteFolderSummary>, String> {
    let _metadata_guard = note_metadata_io_guard();
    let base = paths::writable_base(app)?;
    let _process_lock = crate::process_file_lock(&folder_meta_path(&base))?;
    let config = load_config()?;
    let root = paths::file_root_path(&base);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let mut meta = load_folder_meta(&base)?;
    let mut folders = Vec::new();

    // 用轻量计数，避免 list_zone（会加载颜色元数据）
    let default_dir = NoteZone::Default.dir(&config, &base);
    let default_count = count_md_files(&default_dir)?;
    folders.push(NoteFolderSummary {
        id: "default".to_string(),
        title: "Default".to_string(),
        zone: "default".to_string(),
        color: "blue".to_string(),
        note_count: default_count,
    });

    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(id) = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
        else {
            continue;
        };
        if id.eq_ignore_ascii_case("default") || is_system_folder(&id) {
            continue;
        }
        let zone = NoteZone::Folder(id.clone());
        let color = meta
            .folders
            .entry(id.clone())
            .or_insert_with(|| FolderMetaItem {
                color: FOLDER_COLORS[folders.len().min(FOLDER_COLORS.len() - 1)].to_string(),
            })
            .color
            .clone();
        let note_count = count_md_files(&zone.dir(&config, &base))?;
        folders.push(NoteFolderSummary {
            id: id.clone(),
            title: id,
            zone: zone.as_str(),
            color,
            note_count,
        });
    }

    folders.sort_by(|a, b| {
        if a.zone == "default" {
            std::cmp::Ordering::Less
        } else if b.zone == "default" {
            std::cmp::Ordering::Greater
        } else {
            a.title.to_lowercase().cmp(&b.title.to_lowercase())
        }
    });
    save_folder_meta(&base, &meta)?;
    let _ = config;
    Ok(folders)
}

pub fn create_folder<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
) -> Result<NoteFolderSummary, String> {
    let base = paths::writable_base(app)?;
    let title = sanitize_folder_name(title)?;
    let existing = list_folders(app)?;
    if existing.len() >= MAX_FOLDERS {
        return Err(format!("最多创建 {MAX_FOLDERS} 个文件夹"));
    }
    if existing
        .iter()
        .any(|folder| folder.title.eq_ignore_ascii_case(&title))
    {
        return Err("文件夹已存在".into());
    }
    let _metadata_guard = note_metadata_io_guard();
    let _process_lock = crate::process_file_lock(&folder_meta_path(&base))?;
    let root = paths::file_root_path(&base);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let dir = root.join(&title);
    if dir.exists() {
        return Err("文件夹已存在".into());
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut meta = load_folder_meta(&base)?;
    let color = FOLDER_COLORS[(existing.len() - 1).min(FOLDER_COLORS.len() - 1)].to_string();
    meta.folders.insert(
        title.clone(),
        FolderMetaItem {
            color: color.clone(),
        },
    );
    save_folder_meta(&base, &meta)?;
    Ok(NoteFolderSummary {
        id: title.clone(),
        title: title.clone(),
        zone: NoteZone::Folder(title).as_str(),
        color,
        note_count: 0,
    })
}

pub fn rename_folder<R: Runtime>(
    app: &AppHandle<R>,
    old_id: &str,
    new_title: &str,
) -> Result<NoteFolderSummary, String> {
    let base = paths::writable_base(app)?;
    let _metadata_guard = note_metadata_io_guard();
    let _folder_process_lock = crate::process_file_lock(&folder_meta_path(&base))?;
    if old_id == "default" {
        return Err("Default 文件夹不能重命名".into());
    }
    let old_id = sanitize_folder_name(old_id)?;
    let new_title = sanitize_folder_name(new_title)?;
    let root = paths::file_root_path(&base);
    let old_path = root.join(&old_id);
    let new_path = root.join(&new_title);
    if !old_path.is_dir() {
        return Err("文件夹不存在".into());
    }
    if new_path.exists() {
        return Err("目标文件夹已存在".into());
    }
    let mut meta = load_folder_meta(&base)?;
    let original_meta = meta.clone();
    let item = meta.folders.remove(&old_id).unwrap_or(FolderMetaItem {
        color: "blue".to_string(),
    });
    let color = item.color.clone();
    meta.folders.insert(new_title.clone(), item);
    let _color_process_lock = crate::process_file_lock(&note_color_meta_path(&base))?;
    let mut color_meta = load_note_color_meta(&base)?;
    let original_color_meta = color_meta.clone();
    let old_zone = NoteZone::Folder(old_id.clone());
    let new_zone = NoteZone::Folder(new_title.clone());
    let old_prefix = format!("{}::", old_zone.as_str());
    let updates: Vec<(String, String)> = color_meta
        .notes
        .iter()
        .filter_map(|(key, color)| {
            key.strip_prefix(&old_prefix)
                .map(|name| (note_key(&new_zone, name), color.clone()))
        })
        .collect();
    if !updates.is_empty() {
        color_meta
            .notes
            .retain(|key, _| !key.starts_with(&old_prefix));
        for (key, color) in updates {
            color_meta.notes.insert(key, color);
        }
    }
    fs::rename(&old_path, &new_path).map_err(|error| error.to_string())?;
    if let Err(error) = save_folder_meta(&base, &meta) {
            return match rollback_renamed_path(&new_path, &old_path) {
            Ok(()) => Err(format!("保存文件夹元数据失败，已恢复原文件夹：{error}")),
            Err(rollback_error) => Err(format!(
                "保存文件夹元数据失败，恢复原文件夹也失败：{error}；{rollback_error}"
            )),
        };
    }
    if color_meta != original_color_meta {
        if let Err(error) = save_note_color_meta(&base, &color_meta) {
            let metadata_rollback = save_folder_meta(&base, &original_meta).err();
            let directory_rollback = rollback_renamed_path(&new_path, &old_path).err();
            let mut details = format!("保存文件夹颜色元数据失败：{error}");
            if let Some(rollback_error) = metadata_rollback {
                details.push_str(&format!("；文件夹元数据回滚失败：{rollback_error}"));
            }
            if let Some(rollback_error) = directory_rollback {
                details.push_str(&format!("；目录回滚失败：{rollback_error}"));
            }
            return Err(details);
        }
    }
    Ok(NoteFolderSummary {
        id: new_title.clone(),
        title: new_title.clone(),
        zone: NoteZone::Folder(new_title.clone()).as_str(),
        color,
        note_count: list_zone(app, NoteZone::Folder(new_title))?.len(),
    })
}

pub fn set_folder_color<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    color: &str,
) -> Result<NoteFolderSummary, String> {
    validate_folder_color(color)?;
    let base = paths::writable_base(app)?;
    let _metadata_guard = note_metadata_io_guard();
    let _process_lock = crate::process_file_lock(&folder_meta_path(&base))?;
    if id == "default" {
        return Ok(NoteFolderSummary {
            id: "default".to_string(),
            title: "Default".to_string(),
            zone: "default".to_string(),
            color: color.to_string(),
            note_count: list_zone(app, NoteZone::Default)?.len(),
        });
    }
    let id = sanitize_folder_name(id)?;
    let root = paths::file_root_path(&base);
    if !root.join(&id).is_dir() {
        return Err("文件夹不存在".into());
    }
    let mut meta = load_folder_meta(&base)?;
    meta.folders.insert(
        id.clone(),
        FolderMetaItem {
            color: color.to_string(),
        },
    );
    save_folder_meta(&base, &meta)?;
    Ok(NoteFolderSummary {
        id: id.clone(),
        title: id.clone(),
        zone: NoteZone::Folder(id.clone()).as_str(),
        color: color.to_string(),
        note_count: list_zone(app, NoteZone::Folder(id))?.len(),
    })
}

pub fn all_note_zones<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<NoteZone>, String> {
    let mut zones = vec![NoteZone::Inbox, NoteZone::Default];
    for folder in list_folders(app)? {
        if let Ok(z) = paths::parse_zone(&folder.zone) {
            if !zones.iter().any(|x| x.as_str() == z.as_str()) {
                zones.push(z);
            }
        }
    }
    Ok(zones)
}

pub fn create_note_with_content<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    content: &str,
) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let dir = zone.dir(&config, &base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if zone == NoteZone::Private {
        paths::ensure_private_dir(&base)?;
    }
    let path = unique_path(&dir, timestamp_filename());
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "无法确定新建便签文件名".to_string())?;
    atomic_write_file(&path, content)?;
    if should_persist_last_note(&zone) {
        if let Err(error) = crate::update_config(|config| {
            config.last_note = Some(name.clone());
            config.last_note_zone = Some(zone.as_str());
            Ok(())
        }) {
            let _ = fs::remove_file(&path);
            return Err(format!("保存新建便签状态失败，已删除文件：{error}"));
        }
    }
    Ok(NoteSummary {
        title: title_from_name(&name),
        modified_ms: file_modified_ms(&path),
        name,
        zone: zone.as_str(),
        color: None,
    })
}

const PROJECT_TEMPLATE: &str = r#"# 项目说明

## 目标

## 待办

## 里程碑

## 风险

## 资料
"#;

/// 启动时清理使用默认时间戳文件名、且内容为空（≤1字节）的便签。
///
/// 判定条件同时满足：
///   1. 文件名格式为 `YYYYMMDDHHmmssSSS.md`（17位数字，新建时自动生成）
///   2. 文件大小 ≤ 1 字节（0字节 或 仅含一个换行符，从未实际写入内容）
///
/// 满足条件的便签移入回收站（保留可恢复性），而非直接删除。
/// 不处理 inbox、文件夹区，只清理 default 区（新建便签的默认落点）。
pub fn prune_empty_default_notes<R: Runtime>(app: &AppHandle<R>) {
    let Ok(base) = crate::paths::writable_base(app) else {
        return;
    };
    let Ok(config) = crate::load_config() else {
        return;
    };

    let dir = NoteZone::Default.dir(&config, &base);
    let Ok(entries) = fs::read_dir(&dir) else {
        return;
    };

    // 时间戳文件名：17位数字 + .md，例如 20260620010058143.md
    let mut pruned = 0u32;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !is_timestamp_note_name(&name) {
            continue;
        }
        let size = match fs::metadata(&path) {
            Ok(m) => m.len(),
            Err(_) => continue,
        };
        if size > 1 {
            continue;
        }
        // 移入回收站（会同步清理历史、颜色标签、recent 等关联数据）
        match crate::trash::move_to_trash(app, NoteZone::Default, &name) {
            Ok(_) => pruned += 1,
            Err(e) => eprintln!("清理空便签失败 {name}: {e}"),
        }
    }

    if pruned > 0 {
        println!("启动清理：移除 {pruned} 个空便签到回收站");
    }
}

fn is_timestamp_note_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 20
        && name.ends_with(".md")
        && bytes[..17].iter().all(|byte| byte.is_ascii_digit())
}

fn should_persist_last_note(zone: &NoteZone) -> bool {
    *zone != NoteZone::Private
}

/// 启动时清理 atomic_write_file 可能遗留的 .md.*.tmp 孤文件。
///
/// 场景：write_note 在 rename 之前崩溃，留下写完但未接管的临时文件。
/// 直接删除即可——临时文件的内容若比主文件新，属于用户不知道的内容，
/// 不做自动恢复（无法判断是新内容还是写坏的内容）。
pub fn cleanup_stale_tmp<R: Runtime>(app: &AppHandle<R>) {
    let Ok(base) = paths::writable_base(app) else {
        return;
    };
    let Ok(config) = crate::load_config() else {
        eprintln!("读取配置失败，跳过临时文件清理");
        return;
    };

    // 收集所有需要扫描的笔记目录
    let mut dirs: Vec<std::path::PathBuf> = vec![
        NoteZone::Inbox.dir(&config, &base),
        NoteZone::Default.dir(&config, &base),
    ];
    // 加入所有用户文件夹
    let file_root = paths::file_root_path(&base);
    if let Ok(entries) = fs::read_dir(&file_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let id = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                // 跳过系统目录（.private、.mknote-history、archive、templates 等）
                if !id.starts_with('.')
                    && !id.eq_ignore_ascii_case("default")
                    && !id.eq_ignore_ascii_case("archive")
                    && !id.eq_ignore_ascii_case("templates")
                {
                    dirs.push(path);
                }
            }
        }
    }

    let mut cleaned = 0u32;
    for dir in dirs {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            // 匹配 atomic_write_file 生成的 *.md.*.tmp 临时文件。
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.ends_with(".tmp") && name.contains(".md.") {
                if let Err(e) = fs::remove_file(&path) {
                    eprintln!("清理临时文件失败 {}: {e}", path.display());
                } else {
                    cleaned += 1;
                }
            }
        }
    }

    if cleaned > 0 {
        println!("启动清理：删除 {cleaned} 个遗留 .md.*.tmp 文件");
    }
}

pub fn create_project_note<R: Runtime>(
    app: &AppHandle<R>,
    folder_title: &str,
    project_name: &str,
) -> Result<NoteSummary, String> {
    let title = sanitize_md_filename(project_name)?;
    let folders = list_folders(app)?;
    let zone = if folder_title.eq_ignore_ascii_case("default") || folder_title.is_empty() {
        NoteZone::Default
    } else {
        let folder = folders
            .iter()
            .find(|f| {
                f.title.eq_ignore_ascii_case(folder_title)
                    || f.id.eq_ignore_ascii_case(folder_title)
            })
            .ok_or("文件夹不存在")?;
        paths::parse_zone(&folder.zone)?
    };
    let base = paths::writable_base(app)?;
    let config = load_config()?;
    let dir = zone.dir(&config, &base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = unique_path(&dir, title);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let body = format!("# {project_name}\n\n{PROJECT_TEMPLATE}");
    atomic_write_file(&path, &body)?;
    Ok(NoteSummary {
        title: title_from_name(&name),
        modified_ms: file_modified_ms(&path),
        name,
        zone: zone.as_str(),
        color: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_metadata_base(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "mknote-notes-{name}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }

    #[test]
    fn corrupt_folder_metadata_is_reported() {
        let base = temp_metadata_base("folder-corrupt");
        let root = paths::file_root_path(&base);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(".mknote-folders.json"), b"{broken").unwrap();

        assert!(load_folder_meta(&base).is_err());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn corrupt_note_color_metadata_is_reported() {
        let base = temp_metadata_base("color-corrupt");
        let root = paths::file_root_path(&base);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(".mknote-note-colors.json"), b"{broken").unwrap();

        assert!(load_note_color_meta(&base).is_err());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn atomic_metadata_write_replaces_existing_file() {
        let base = temp_metadata_base("atomic");
        let root = paths::file_root_path(&base);
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        fs::write(&path, "old").unwrap();

        atomic_write_file(&path, "new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn atomic_write_temp_paths_are_unique_within_one_process() {
        let path = PathBuf::from("note.md");
        assert_ne!(atomic_temp_path(&path), atomic_temp_path(&path));
    }

    #[test]
    fn existing_note_names_reject_windows_device_names_and_trailing_markers() {
        assert!(sanitize_existing_name("CON.md").is_err());
        assert!(sanitize_existing_name("note .md").is_err());
        assert!(sanitize_existing_name("note..md").is_err());
        assert_eq!(sanitize_existing_name("normal.md").unwrap(), "normal.md");
    }

    #[test]
    fn timestamp_name_check_does_not_slice_inside_utf8_character() {
        assert!(!is_timestamp_note_name("123456789012345é.md"));
    }

    #[test]
    fn private_content_notes_are_not_startup_restore_targets() {
        assert!(!should_persist_last_note(&NoteZone::Private));
        assert!(should_persist_last_note(&NoteZone::Default));
    }

    #[test]
    fn renamed_directory_can_be_rolled_back_without_overwriting_existing_data() {
        let base = temp_metadata_base("rename-rollback");
        let root = paths::file_root_path(&base);
        let old_path = root.join("old");
        let new_path = root.join("new");
        fs::create_dir_all(&old_path).unwrap();
        fs::write(old_path.join("note.md"), "content").unwrap();
        fs::rename(&old_path, &new_path).unwrap();

        rollback_renamed_path(&new_path, &old_path).unwrap();

        assert!(old_path.join("note.md").is_file());
        assert!(!new_path.exists());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn content_hash_uses_sha256_for_empty_content() {
        assert_eq!(
            content_hash(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn checked_write_respects_shared_file_lock_and_rechecks_revision() {
        let base = temp_metadata_base("checked-lock");
        fs::create_dir_all(&base).unwrap();
        let path = base.join("note.md");
        fs::write(&path, "old").unwrap();
        let guard = crate::process_file_lock(&path).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let worker_path = path.clone();
        let worker = std::thread::spawn(move || {
            tx.send(atomic_write_file_checked(&worker_path, "editor", Some(&content_hash("old")))).unwrap();
        });
        let early = rx.recv_timeout(std::time::Duration::from_millis(150));
        fs::write(&path, "sync").unwrap();
        drop(guard);
        worker.join().unwrap();
        assert!(early.is_err(), "save bypassed the shared data-file lock");
        assert!(rx.recv().unwrap().is_err(), "revision must be checked after acquiring the lock");
        assert_eq!(fs::read_to_string(&path).unwrap(), "sync");
    }

    #[test]
    fn checked_write_rejects_stale_content_without_changing_disk() {
        let base = temp_metadata_base("checked-write-conflict");
        fs::create_dir_all(&base).unwrap();
        let path = base.join("note.md");
        fs::write(&path, "外部版本").unwrap();

        let error = atomic_write_file_checked(&path, "本地版本", Some(&content_hash("旧版本")))
            .expect_err("旧 hash 必须拒绝覆盖");

        assert!(error.contains("外部修改"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "外部版本");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn checked_write_returns_new_revision_after_success() {
        let base = temp_metadata_base("checked-write-success");
        fs::create_dir_all(&base).unwrap();
        let path = base.join("note.md");
        fs::write(&path, "旧版本").unwrap();

        let revision = atomic_write_file_checked(&path, "新版本", Some(&content_hash("旧版本")))
            .expect("匹配 hash 应允许写入");

        assert_eq!(revision.content_hash, content_hash("新版本"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "新版本");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn test_save_delay_parser_accepts_empty_and_non_negative_milliseconds() {
        assert_eq!(parse_test_save_delay(None).unwrap(), None);
        assert_eq!(parse_test_save_delay(Some("  ")).unwrap(), None);
        assert_eq!(parse_test_save_delay(Some("0")).unwrap(), Some(0));
        assert_eq!(parse_test_save_delay(Some("1000")).unwrap(), Some(1000));
    }

    #[test]
    fn test_save_delay_parser_rejects_invalid_values() {
        assert!(parse_test_save_delay(Some("-1")).is_err());
        assert!(parse_test_save_delay(Some("not-a-number")).is_err());
    }

    #[test]
    fn test_save_failure_flag_only_accepts_explicit_truthy_values() {
        assert!(!is_test_save_failure_enabled(None));
        assert!(!is_test_save_failure_enabled(Some("")));
        assert!(!is_test_save_failure_enabled(Some("0")));
        assert!(!is_test_save_failure_enabled(Some("false")));
        assert!(is_test_save_failure_enabled(Some("1")));
        assert!(is_test_save_failure_enabled(Some("true")));
    }

    #[test]
    fn migration_snapshot_is_stable_and_stored_outside_note_zone() {
        let base = temp_metadata_base("migration-snapshot");
        let config = AppConfig::default();
        let zone = NoteZone::Default;
        let note_name = "beta-note.md";
        let note_path = zone.dir(&config, &base).join(note_name);
        fs::create_dir_all(note_path.parent().unwrap()).unwrap();
        fs::write(&note_path, "原始内容").unwrap();

        ensure_migration_snapshot_at(&base, &config, &zone, note_name).unwrap();
        let snapshot_path = migration_snapshot_path(&base, &zone, note_name);
        assert_eq!(fs::read_to_string(&snapshot_path).unwrap(), "原始内容");
        assert!(snapshot_path.starts_with(
            paths::file_root_path(&base)
                .join(".private")
                .join(".mknote-migration-snapshots")
        ));

        fs::write(&note_path, "后续内容").unwrap();
        ensure_migration_snapshot_at(&base, &config, &zone, note_name).unwrap();
        assert_eq!(fs::read_to_string(&snapshot_path).unwrap(), "原始内容");
        assert_eq!(
            fs::read_dir(snapshot_path.parent().unwrap())
                .unwrap()
                .count(),
            1
        );

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn migration_snapshot_ignores_missing_source() {
        let base = temp_metadata_base("migration-snapshot-missing");
        let config = AppConfig::default();
        let zone = NoteZone::Default;
        let note_name = "missing.md";

        ensure_migration_snapshot_at(&base, &config, &zone, note_name).unwrap();
        assert!(!migration_snapshot_path(&base, &zone, note_name).exists());
        assert!(!paths::file_root_path(&base)
            .join(".private")
            .join(".mknote-migration-snapshots")
            .exists());

        let _ = fs::remove_dir_all(base);
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteRevision {
    pub content_hash: String,
    pub modified_ms: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteSnapshot {
    pub content: String,
    pub content_hash: String,
    pub modified_ms: i64,
}
