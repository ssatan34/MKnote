use crate::notes;
use crate::notes::NoteSummary;
use crate::paths;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Serialize, Deserialize, Default)]
struct StarsFile {
    #[serde(default)]
    entries: BTreeMap<String, StarEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StarEntry {
    starred_at: String,
}

fn star_key(zone: &str, name: &str) -> String {
    format!("{zone}::{name}")
}

fn stars_path(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(".mknote-stars.json")
}

static STARS_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn stars_io_guard() -> std::sync::MutexGuard<'static, ()> {
    STARS_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn load_stars(base: &Path) -> Result<StarsFile, String> {
    let path = stars_path(base);
    let data = match std::fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StarsFile::default())
        }
        Err(error) => return Err(format!("读取收藏数据失败：{error}")),
    };
    serde_json::from_str(&data).map_err(|error| format!("收藏数据格式错误：{error}"))
}

fn save_stars(base: &Path, file: &StarsFile) -> Result<(), String> {
    let root = paths::file_root_path(base);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    let path = stars_path(base);
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

pub fn set_note_starred<R: Runtime>(
    app: &AppHandle<R>,
    zone: &str,
    name: &str,
    starred: bool,
) -> Result<bool, String> {
    let base = paths::writable_base(app)?;
    let _guard = stars_io_guard();
    let _process_lock = crate::process_file_lock(&stars_path(&base))?;
    let mut file = load_stars(&base)?;
    let key = star_key(zone, name);
    if starred {
        file.entries.insert(
            key,
            StarEntry {
                starred_at: chrono::Utc::now().to_rfc3339(),
            },
        );
    } else {
        file.entries.remove(&key);
    }
    save_stars(&base, &file)?;
    Ok(starred)
}

pub fn is_note_starred<R: Runtime>(
    app: &AppHandle<R>,
    zone: &str,
    name: &str,
) -> Result<bool, String> {
    let base = paths::writable_base(app)?;
    Ok(load_stars(&base)?
        .entries
        .contains_key(&star_key(zone, name)))
}

pub fn list_starred_notes<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<NoteSummary>, String> {
    let base = paths::writable_base(app)?;
    let file = load_stars(&base)?;
    let mut notes: Vec<(NoteSummary, String)> = Vec::new();
    for (key, entry) in &file.entries {
        let Some((zone_str, name)) = key.split_once("::") else {
            continue;
        };
        let Ok(zone) = paths::parse_zone(zone_str) else {
            continue;
        };
        let list = notes::list_zone(app, zone.clone())?;
        if let Some(note) = list.into_iter().find(|n| n.name == name) {
            notes.push((note, entry.starred_at.clone()));
        }
    }
    notes.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(notes.into_iter().map(|(n, _)| n).collect())
}

pub fn on_note_renamed(
    base: &Path,
    zone: &str,
    old_name: &str,
    new_name: &str,
) -> Result<(), String> {
    let _guard = stars_io_guard();
    let _process_lock = crate::process_file_lock(&stars_path(base))?;
    let mut file = load_stars(base)?;
    let old_key = star_key(zone, old_name);
    if let Some(entry) = file.entries.remove(&old_key) {
        file.entries.insert(star_key(zone, new_name), entry);
        save_stars(base, &file)?;
    }
    Ok(())
}

pub fn on_note_deleted(base: &Path, zone: &str, name: &str) -> Result<(), String> {
    let _guard = stars_io_guard();
    let _process_lock = crate::process_file_lock(&stars_path(base))?;
    let mut file = load_stars(base)?;
    if file.entries.remove(&star_key(zone, name)).is_some() {
        save_stars(base, &file)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupt_stars_are_not_overwritten_by_mutation() {
        let base = std::env::temp_dir().join(format!(
            "mknote-stars-corrupt-{}",
            std::process::id()
        ));
        let root = paths::file_root_path(&base);
        std::fs::create_dir_all(&root).unwrap();
        let path = stars_path(&base);
        std::fs::write(&path, b"{broken").unwrap();

        assert!(load_stars(&base).is_err());
        assert!(on_note_deleted(&base, "default", "note.md").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"{broken");

        let _ = std::fs::remove_dir_all(base);
    }
}
