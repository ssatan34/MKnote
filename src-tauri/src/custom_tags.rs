use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

pub const CUSTOM_TAG_PREFIX: &str = "custom:";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomTagDef {
    pub id: String,
    pub name: String,
    pub hex: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct CustomTagsFile {
    #[serde(default)]
    tags: Vec<CustomTagDef>,
}

fn tags_path(base: &Path) -> PathBuf {
    crate::paths::file_root_path(base).join(".mknote-custom-tags.json")
}

static CUSTOM_TAGS_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn custom_tags_io_guard() -> std::sync::MutexGuard<'static, ()> {
    CUSTOM_TAGS_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn load_custom_tags(base: &Path) -> Result<Vec<CustomTagDef>, String> {
    let path = tags_path(base);
    let data = match std::fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("读取自定义标签失败：{error}")),
    };
    serde_json::from_str::<CustomTagsFile>(&data)
        .map(|file| file.tags)
        .map_err(|error| format!("自定义标签格式错误：{error}"))
}

fn save_custom_tags(base: &Path, tags: &[CustomTagDef]) -> Result<(), String> {
    let root = crate::paths::file_root_path(base);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let file = CustomTagsFile {
        tags: tags.to_vec(),
    };
    let data = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = tags_path(base);
    let temp = path.with_extension("json.tmp");
    let write_result = (|| -> Result<(), String> {
        use std::io::Write;
        let mut file = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    std::fs::rename(&temp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&temp);
        e.to_string()
    })?;
    crate::sync_parent_directory(&path)
}

pub fn is_custom_tag_id(color: &str) -> bool {
    color.starts_with(CUSTOM_TAG_PREFIX)
}

pub fn is_allowed_note_color(base: &Path, color: &str) -> bool {
    if crate::notes::NOTE_COLOR_IDS.contains(&color) {
        return true;
    }
    if !is_custom_tag_id(color) {
        return false;
    }
    load_custom_tags(base)
        .map(|tags| tags.iter().any(|tag| tag.id == color))
        .unwrap_or(false)
}

pub fn validate_hex_color(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if !value.starts_with('#') {
        return Err("颜色代码需以 # 开头".into());
    }
    let hex = &value[1..];
    if hex.len() != 3 && hex.len() != 6 {
        return Err("颜色代码格式应为 #RGB 或 #RRGGBB".into());
    }
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("颜色代码包含非法字符".into());
    }
    let normalized = if hex.len() == 3 {
        hex.chars().flat_map(|c| [c, c]).collect::<String>()
    } else {
        hex.to_ascii_uppercase()
    };
    Ok(format!("#{normalized}"))
}

fn sanitize_tag_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("标签名称不能为空".into());
    }
    if trimmed.chars().count() > 12 {
        return Err("标签名称最多 12 个字符".into());
    }
    Ok(trimmed.to_string())
}

fn new_custom_tag_id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let now = chrono::Local::now();
    format!(
        "{CUSTOM_TAG_PREFIX}{}{:03}-{}-{}",
        now.format("%Y%m%d%H%M%S"),
        now.timestamp_subsec_millis(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

pub fn add_custom_tag(base: &Path, name: &str, hex: &str) -> Result<CustomTagDef, String> {
    let name = sanitize_tag_name(name)?;
    let hex = validate_hex_color(hex)?;
    let _guard = custom_tags_io_guard();
    let _process_lock = crate::process_file_lock(&tags_path(base))?;
    let mut tags = load_custom_tags(base)?;
    if tags.len() >= 24 {
        return Err("自定义标签最多 24 个".into());
    }
    if tags.iter().any(|tag| tag.name == name) {
        return Err("已存在同名标签".into());
    }
    let tag = CustomTagDef {
        id: new_custom_tag_id(),
        name,
        hex,
    };
    tags.push(tag.clone());
    save_custom_tags(base, &tags)?;
    Ok(tag)
}

pub fn list_custom_tags_for_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Vec<CustomTagDef>, String> {
    let base = crate::paths::writable_base(app)?;
    Ok(load_custom_tags(&base)?)
}

pub fn add_custom_tag_for_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    name: String,
    hex: String,
) -> Result<CustomTagDef, String> {
    let base = crate::paths::writable_base(app)?;
    add_custom_tag(&base, &name, &hex)
}

pub fn remove_custom_tag(base: &Path, id: &str) -> Result<(), String> {
    if !is_custom_tag_id(id) {
        return Err("只能删除自定义标签".into());
    }
    let _guard = custom_tags_io_guard();
    let _process_lock = crate::process_file_lock(&tags_path(base))?;
    let mut tags = load_custom_tags(base)?;
    let before = tags.len();
    tags.retain(|tag| tag.id != id);
    if tags.len() == before {
        return Err("标签不存在".into());
    }
    save_custom_tags(base, &tags)?;
    Ok(())
}

pub fn remove_custom_tag_for_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: String,
) -> Result<(), String> {
    let base = crate::paths::writable_base(app)?;
    remove_custom_tag(&base, &id)
}

pub fn update_custom_tag(
    base: &Path,
    id: &str,
    name: Option<&str>,
    hex: Option<&str>,
) -> Result<CustomTagDef, String> {
    if !is_custom_tag_id(id) {
        return Err("只能编辑自定义标签".into());
    }
    if name.is_none() && hex.is_none() {
        return Err("没有可更新的字段".into());
    }
    let _guard = custom_tags_io_guard();
    let _process_lock = crate::process_file_lock(&tags_path(base))?;
    let mut tags = load_custom_tags(base)?;
    let Some(index) = tags.iter().position(|tag| tag.id == id) else {
        return Err("标签不存在".into());
    };
    if let Some(raw_name) = name {
        let next_name = sanitize_tag_name(raw_name)?;
        if tags.iter().any(|tag| tag.id != id && tag.name == next_name) {
            return Err("已存在同名标签".into());
        }
        tags[index].name = next_name;
    }
    if let Some(raw_hex) = hex {
        tags[index].hex = validate_hex_color(raw_hex)?;
    }
    let updated = tags[index].clone();
    save_custom_tags(base, &tags)?;
    Ok(updated)
}

pub fn update_custom_tag_for_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: String,
    name: Option<String>,
    hex: Option<String>,
) -> Result<CustomTagDef, String> {
    let base = crate::paths::writable_base(app)?;
    update_custom_tag(&base, &id, name.as_deref(), hex.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_tag_ids_are_unique_within_one_process() {
        assert_ne!(new_custom_tag_id(), new_custom_tag_id());
    }

    #[test]
    fn corrupt_custom_tags_are_not_overwritten_by_mutation() {
        let base = std::env::temp_dir().join(format!(
            "mknote-custom-tags-corrupt-{}",
            std::process::id()
        ));
        let root = crate::paths::file_root_path(&base);
        std::fs::create_dir_all(&root).unwrap();
        let path = tags_path(&base);
        std::fs::write(&path, b"{broken").unwrap();

        assert!(load_custom_tags(&base).is_err());
        assert!(add_custom_tag(&base, "测试", "#123456").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"{broken");

        let _ = std::fs::remove_dir_all(base);
    }
}
