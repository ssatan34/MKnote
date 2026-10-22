use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiyuanMapEntry {
    pub doc_id: String,
    pub notebook: String,
    pub h_path: String,
    #[serde(default)]
    pub content_hash: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SiyuanMapFile {
    #[serde(default)]
    entries: BTreeMap<String, SiyuanMapEntry>,
}

pub fn note_map_key(zone: &str, name: &str) -> String {
    format!("{zone}\u{0000}{name}")
}

fn map_path(base: &Path) -> PathBuf {
    crate::paths::file_root_path(base).join(".mknote-siyuan-map.json")
}

static SIYUAN_MAP_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn map_io_guard() -> std::sync::MutexGuard<'static, ()> {
    SIYUAN_MAP_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn load_map_strict(base: &Path) -> Result<BTreeMap<String, SiyuanMapEntry>, String> {
    let path = map_path(base);
    let data = match std::fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
        Err(error) => return Err(format!("读取思源映射失败：{error}")),
    };
    serde_json::from_str::<SiyuanMapFile>(&data)
        .map(|f| f.entries)
        .map_err(|error| format!("思源映射格式错误：{error}"))
}

pub fn load_map(base: &Path) -> Result<BTreeMap<String, SiyuanMapEntry>, String> {
    load_map_strict(base)
}

fn save_map(base: &Path, meta: &BTreeMap<String, SiyuanMapEntry>) -> Result<(), String> {
    let root = crate::paths::file_root_path(base);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let file = SiyuanMapFile {
        entries: meta.clone(),
    };
    let data = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = map_path(base);
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

pub fn get_entry(base: &Path, zone: &str, name: &str) -> Result<Option<SiyuanMapEntry>, String> {
    let key = note_map_key(zone, name);
    Ok(load_map(base)?.get(&key).cloned())
}

pub fn set_entry(base: &Path, zone: &str, name: &str, entry: SiyuanMapEntry) -> Result<(), String> {
    let _guard = map_io_guard();
    let _process_lock = crate::process_file_lock(&map_path(base))?;
    let mut meta = load_map_strict(base)?;
    meta.insert(note_map_key(zone, name), entry);
    save_map(base, &meta)
}

pub fn remove_entry(base: &Path, zone: &str, name: &str) -> Result<(), String> {
    let _guard = map_io_guard();
    let _process_lock = crate::process_file_lock(&map_path(base))?;
    let mut meta = load_map_strict(base)?;
    meta.remove(&note_map_key(zone, name));
    save_map(base, &meta)
}

pub fn rename_entry(
    base: &Path,
    zone: &str,
    old_name: &str,
    new_name: &str,
    new_h_path: Option<String>,
) -> Result<(), String> {
    let old_key = note_map_key(zone, old_name);
    let _guard = map_io_guard();
    let _process_lock = crate::process_file_lock(&map_path(base))?;
    let mut meta = load_map_strict(base)?;
    if let Some(mut entry) = meta.remove(&old_key) {
        if let Some(path) = new_h_path {
            entry.h_path = path;
        }
        meta.insert(note_map_key(zone, new_name), entry);
        save_map(base, &meta)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corrupt_mapping_is_reported_instead_of_becoming_an_empty_map() {
        let base = std::env::temp_dir().join(format!(
            "mknote-siyuan-map-{}",
            std::process::id()
        ));
        let root = crate::paths::file_root_path(&base);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join(".mknote-siyuan-map.json"), b"{broken").unwrap();

        let result = load_map(&base);

        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(base);
    }
}
