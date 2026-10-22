use crate::AppConfig;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, Runtime};

pub(crate) static BASE_CACHE: OnceLock<PathBuf> = OnceLock::new();

const INBOX_NAME: &str = "inbox";
const DEFAULT_NAME: &str = "default";
const FILE_ROOT_NAME: &str = "File";

/// 可写根目录（进程内缓存，避免每次 IPC 重复探测路径）
pub fn writable_base<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(base) = BASE_CACHE.get() {
        return Ok(base.clone());
    }
    let base = resolve_writable_base(app)?;
    let _ = BASE_CACHE.set(base.clone());
    Ok(base)
}

/// 应用根目录：与可执行文件同目录（绿色便携版随文件夹一起移动）。
fn resolve_writable_base<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(dir) = app.path().executable_dir() {
        candidates.push(dir);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    for dir in candidates {
        if is_dir_writable(&dir) {
            return Ok(dir);
        }
    }

    Err("无法在应用程序所在目录写入数据。请将绿色版放在可写文件夹中运行，勿从只读位置启动。".into())
}

pub fn config_path_for_base(base: &std::path::Path) -> PathBuf {
    base.join("config.json")
}

pub fn legacy_config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("md-sticky-note").join("config.json"))
}

fn is_dir_writable(dir: &std::path::Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".mknote_write_probe");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub fn default_inbox_path(base: &std::path::Path) -> PathBuf {
    base.join(INBOX_NAME)
}

pub fn default_data_path(base: &std::path::Path) -> PathBuf {
    base.join(FILE_ROOT_NAME).join(DEFAULT_NAME)
}

pub fn file_root_path(base: &std::path::Path) -> PathBuf {
    base.join(FILE_ROOT_NAME)
}

fn path_is_within_root(candidate: &std::path::Path, root: &std::path::Path) -> bool {
    let Ok(root_canonical) = root.canonicalize() else {
        return false;
    };
    let canonical = match candidate.canonicalize() {
        Ok(path) => path,
        Err(_) => {
            let Some(parent) = candidate.parent() else {
                return false;
            };
            let Ok(parent) = parent.canonicalize() else {
                return false;
            };
            let Some(name) = candidate.file_name() else {
                return false;
            };
            parent.join(name)
        }
    };
    canonical.starts_with(root_canonical)
}

pub(crate) fn safe_folder_dir(base: &std::path::Path, id: &str) -> PathBuf {
    let root = file_root_path(base);
    let candidate = root.join(id);
    if is_safe_folder_id(id) && path_is_within_root(&candidate, &root) {
        candidate
    } else {
        root.join(".invalid-zone")
    }
}

pub fn resolve_inbox_dir(_config: &AppConfig, base: &std::path::Path) -> PathBuf {
    default_inbox_path(base)
}

pub fn resolve_data_dir(_config: &AppConfig, base: &std::path::Path) -> PathBuf {
    default_data_path(base)
}

/// 创建固定的 inbox/default 目录。
pub fn ensure_app_dirs<R: Runtime>(app: &AppHandle<R>) -> Result<(AppConfig, PathBuf), String> {
    let base = writable_base(app)?;
    let inbox = default_inbox_path(&base);
    let data = default_data_path(&base);
    std::fs::create_dir_all(&inbox).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;

    let config = crate::load_config()?;
    crate::quick_data::initialize(&config, &base);
    std::fs::create_dir_all(file_root_path(&base)).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(file_root_path(&base).join("archive")).map_err(|e| e.to_string())?;
    ensure_private_dir(&base)?;
    if let Ok(base_s) = path_to_string(&base) {
        println!("MKnote 数据目录: {base_s}");
    }
    if let Ok(cfg_s) = path_to_string(&config_path_for_base(&base)) {
        println!("MKnote 配置文件: {cfg_s}");
    }
    Ok((config, base))
}

pub fn path_to_string(path: &std::path::Path) -> Result<String, String> {
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "路径包含无效 Unicode".into())
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteZone {
    Inbox,
    Default,
    Private,
    Folder(String),
}

impl NoteZone {
    pub fn dir(&self, config: &AppConfig, base: &std::path::Path) -> PathBuf {
        match self {
            NoteZone::Inbox => resolve_inbox_dir(config, base),
            NoteZone::Default => resolve_data_dir(config, base),
            NoteZone::Private => file_root_path(base).join(".private"),
            NoteZone::Folder(id) => safe_folder_dir(base, id),
        }
    }

    pub fn as_str(&self) -> String {
        match self {
            NoteZone::Inbox => "inbox".to_string(),
            NoteZone::Default => "default".to_string(),
            NoteZone::Private => "private".to_string(),
            NoteZone::Folder(id) => format!("folder:{id}"),
        }
    }
}

pub(crate) fn is_safe_folder_id(id: &str) -> bool {
    !id.is_empty()
        && id != "."
        && id != ".."
        && !id.contains("..")
        && !id.contains('/')
        && !id.contains('\\')
        && !id.contains(':')
        && !id.chars().any(|character| character.is_control())
}

pub fn parse_zone(zone: &str) -> Result<NoteZone, String> {
    match zone {
        "inbox" => Ok(NoteZone::Inbox),
        "default" => Ok(NoteZone::Default),
        "private" => Ok(NoteZone::Private),
        _ if zone.starts_with("folder:") => {
            let id = zone.trim_start_matches("folder:");
            if !is_safe_folder_id(id) {
                return Err("无效文件夹".into());
            }
            Ok(NoteZone::Folder(id.to_string()))
        }
        _ => Err(format!("未知区域: {zone}")),
    }
}

/// 创建隐私笔记目录并设置 Windows 隐藏属性
pub fn ensure_private_dir(base: &std::path::Path) -> Result<(), String> {
    let dir = file_root_path(base).join(".private");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        set_hidden_attribute(&dir)?;
    }
    Ok(())
}

/// 通过 attrib 命令设置 Windows 隐藏属性（无需额外 crate）
#[cfg(windows)]
fn set_hidden_attribute(path: &std::path::Path) -> Result<(), String> {
    let output = crate::process_utils::hidden_command("attrib")
        .arg("+H")
        .arg(path)
        .output()
        .map_err(|e| format!("设置隐藏属性失败：{e}"))?;
    if !output.status.success() {
        // attrib 失败不影响功能，只记录警告
        eprintln!(
            "attrib +H 警告：{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_folder_dir_rejects_path_traversal_and_accepts_child_folder() {
        let base = std::env::temp_dir().join(format!(
            "mknote-paths-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let root = file_root_path(&base);
        std::fs::create_dir_all(root.join("notes")).unwrap();

        assert_eq!(safe_folder_dir(&base, "notes"), root.join("notes"));
        assert_eq!(safe_folder_dir(&base, ".."), root.join(".invalid-zone"));
        assert_eq!(safe_folder_dir(&base, "a/b"), root.join(".invalid-zone"));

        let _ = std::fs::remove_dir_all(base);
    }
}
