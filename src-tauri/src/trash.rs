use crate::notes::{self, NoteSummary};
use crate::paths::{self, NoteZone};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Runtime};

const TRASH_DIR_NAME: &str = ".mknote-trash";
const INDEX_FILE: &str = "index.json";
const TRASH_LOCK_FILE: &str = ".mknote-trash-lock.json";
const PENDING_DELETE_FILE: &str = ".pending-delete.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrashEntry {
    pub id: String,
    pub zone: String,
    pub name: String,
    pub title: String,
    pub deleted_at_ms: i64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct TrashIndex {
    entries: Vec<TrashEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PendingTrashDelete {
    entry: TrashEntry,
    position: usize,
}

fn trash_root(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(TRASH_DIR_NAME)
}

fn trash_index_path(base: &Path) -> PathBuf {
    trash_root(base).join(INDEX_FILE)
}

fn trash_lock_path(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(TRASH_LOCK_FILE)
}

fn load_index(base: &Path) -> Result<TrashIndex, String> {
    recover_staged_trash_root(base)?;
    let path = trash_index_path(base);
    let mut index: TrashIndex = match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data)
            .map_err(|error| format!("回收站索引格式错误：{error}"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => TrashIndex::default(),
        Err(error) => return Err(format!("读取回收站索引失败：{error}")),
    };
    recover_pending_trash_deletes(base, &mut index)?;
    Ok(index)
}

fn save_index(base: &Path, index: &TrashIndex) -> Result<(), String> {
    let root = trash_root(base);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    let path = trash_index_path(base);
    let temp = path.with_extension("json.tmp");
    let write_result = (|| -> Result<(), String> {
        use std::io::Write;
        let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    fs::rename(&temp, &path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })?;
    crate::sync_parent_directory(&path)
}

fn trash_entry_dir(base: &Path, id: &str) -> PathBuf {
    trash_root(base).join("entries").join(id)
}

fn recover_staged_trash_root(base: &Path) -> Result<(), String> {
    let root = trash_root(base);
    let parent = root
        .parent()
        .ok_or_else(|| format!("无法确定回收站父目录：{}", root.display()))?;
    if !parent.is_dir() {
        return Ok(());
    }

    let mut staged_roots = Vec::new();
    for item in fs::read_dir(parent).map_err(|error| format!("读取回收站父目录失败：{error}"))? {
        let path = item
            .map_err(|error| format!("读取回收站父目录项失败：{error}"))?
            .path();
        if path.is_dir()
            && path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with(".emptying-trash-"))
        {
            staged_roots.push(path);
        }
    }
    if staged_roots.is_empty() {
        return Ok(());
    }
    if root.exists() {
        return Err(format!(
            "回收站根目录和清空暂存目录同时存在：{}",
            root.display()
        ));
    }
    if staged_roots.len() > 1 {
        return Err("发现多个回收站清空暂存目录，无法安全恢复".into());
    }
    restore_staged_path(&staged_roots[0], &root)
}

fn pending_delete_path(entry_dir: &Path) -> PathBuf {
    entry_dir.join(PENDING_DELETE_FILE)
}

fn write_pending_delete(entry_dir: &Path, pending: &PendingTrashDelete) -> Result<(), String> {
    use std::io::Write;

    let data = serde_json::to_vec_pretty(pending)
        .map_err(|error| format!("序列化回收站删除事务失败：{error}"))?;
    let path = pending_delete_path(entry_dir);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("创建回收站删除事务文件失败：{error}"))?;
    if let Err(error) = file.write_all(&data).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&path);
        return Err(format!("写入回收站删除事务文件失败：{error}"));
    }
    crate::sync_parent_directory(&path)
}

fn read_pending_delete(path: &Path) -> Result<PendingTrashDelete, String> {
    let data = fs::read_to_string(path)
        .map_err(|error| format!("读取回收站删除事务文件失败：{error}"))?;
    serde_json::from_str(&data)
        .map_err(|error| format!("回收站删除事务文件格式错误：{error}"))
}

fn recover_pending_trash_deletes(base: &Path, index: &mut TrashIndex) -> Result<(), String> {
    let root = trash_root(base);
    if !root.is_dir() {
        return Ok(());
    }

    let mut staged_dirs = Vec::new();
    for item in fs::read_dir(&root).map_err(|error| format!("读取回收站目录失败：{error}"))? {
        let path = item
            .map_err(|error| format!("读取回收站目录项失败：{error}"))?
            .path();
        if path.is_dir()
            && path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with(".deleting-"))
        {
            staged_dirs.push(path);
        }
    }

    for staged_dir in staged_dirs {
        let pending_path = pending_delete_path(&staged_dir);
        if !pending_path.is_file() {
            return Err(format!(
                "发现没有删除事务记录的回收站暂存目录：{}",
                staged_dir.display()
            ));
        }
        let pending = read_pending_delete(&pending_path)?;
        let entry_dir = trash_entry_dir(base, &pending.entry.id);
        if entry_dir.exists() {
            return Err(format!(
                "回收站删除事务恢复目标已存在：{}",
                entry_dir.display()
            ));
        }
        restore_staged_path(&staged_dir, &entry_dir)?;
    }

    let entries_root = root.join("entries");
    if !entries_root.is_dir() {
        return Ok(());
    }

    let mut pending_files = Vec::new();
    for item in fs::read_dir(&entries_root)
        .map_err(|error| format!("读取回收站条目目录失败：{error}"))?
    {
        let entry_dir = item
            .map_err(|error| format!("读取回收站条目目录项失败：{error}"))?
            .path();
        if entry_dir.is_dir() {
            let pending_path = pending_delete_path(&entry_dir);
            if pending_path.is_file() {
                pending_files.push(pending_path);
            }
        }
    }

    let mut index_changed = false;
    for pending_path in &pending_files {
        let pending = read_pending_delete(pending_path)?;
        if !index.entries.iter().any(|entry| entry.id == pending.entry.id) {
            let position = pending.position.min(index.entries.len());
            index.entries.insert(position, pending.entry);
            index_changed = true;
        }
    }

    if index_changed {
        save_index(base, index)?;
    }
    for pending_path in pending_files {
        let _ = fs::remove_file(pending_path);
    }
    Ok(())
}

fn remove_empty_trash_entry_dir(path: &Path) -> Result<(), String> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("清理回收站空条目目录失败：{error}")),
    }
}

fn restore_staged_path(staged: &Path, original: &Path) -> Result<(), String> {
    if original.exists() {
        return Err(format!("恢复目标已存在：{}", original.display()));
    }
    if let Some(parent) = original.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建回收站恢复目录失败：{error}"))?;
    }
    fs::rename(staged, original)
        .map_err(|error| format!("恢复回收站暂存路径失败：{error}"))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_trash_id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let now = chrono::Local::now();
    format!(
        "{}{:03}-{}-{}",
        now.format("%Y%m%d%H%M%S"),
        now.timestamp_subsec_millis(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

fn create_trash_entry_dir(base: &Path) -> Result<(String, PathBuf), String> {
    let entries_root = trash_root(base).join("entries");
    fs::create_dir_all(&entries_root).map_err(|e| e.to_string())?;
    for _ in 0..16 {
        let id = new_trash_id();
        let entry_dir = entries_root.join(&id);
        match fs::create_dir(&entry_dir) {
            Ok(()) => return Ok((id, entry_dir)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建回收站条目目录失败：{error}")),
        }
    }
    Err("创建回收站条目目录失败：ID 连续冲突".into())
}

pub fn move_to_trash<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
) -> Result<TrashEntry, String> {
    let base = paths::writable_base(app)?;
    let config = crate::load_config()?;
    let name = notes::sanitize_existing_name_pub(name)?;
    let src = zone.dir(&config, &base).join(&name);
    if !src.is_file() {
        return Err("便签不存在".into());
    }

    let _process_lock = crate::process_file_lock(&trash_lock_path(&base))?;
    // 先读取并校验索引；若索引损坏，不能先移动文件再以错误返回，
    // 否则会留下未登记的回收站孤儿文件。
    let mut index = load_index(&base)?;
    let (id, entry_dir) = create_trash_entry_dir(&base)?;
    let dest = entry_dir.join(&name);
    if let Err(error) = fs::rename(&src, &dest) {
        if let Err(cleanup_error) = remove_empty_trash_entry_dir(&entry_dir) {
            return Err(format!("移入回收站失败：{error}；清理失败：{cleanup_error}"));
        }
        return Err(format!("移入回收站失败：{error}"));
    }

    let title = notes::title_from_name(&name);
    let entry = TrashEntry {
        id: id.clone(),
        zone: zone.as_str(),
        name: name.clone(),
        title,
        deleted_at_ms: now_ms(),
    };

    index.entries.insert(0, entry.clone());
    if let Err(error) = save_index(&base, &index) {
        return match fs::rename(&dest, &src) {
            Ok(()) => match remove_empty_trash_entry_dir(&entry_dir) {
                Ok(()) => Err(error),
                Err(cleanup_error) => Err(format!(
                    "保存回收站索引失败：{error}；清理失败：{cleanup_error}"
                )),
            },
            Err(rollback_error) => Err(format!(
                "保存回收站索引失败：{error}；文件回滚失败：{rollback_error}"
            )),
        };
    }


    let _ = notes::clear_note_color(&base, &zone, &name);

    crate::siyuan::on_note_deleted(&base, &zone.as_str(), &name);
    let _ = crate::stars::on_note_deleted(&base, &zone.as_str(), &name);
    crate::on_recent_note_deleted(&zone.as_str(), &name);

    Ok(entry)
}

pub fn list_trash<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<TrashEntry>, String> {
    let base = paths::writable_base(app)?;
    let _process_lock = crate::process_file_lock(&trash_lock_path(&base))?;
    let index = load_index(&base)?;
    Ok(index.entries)
}

pub fn restore_from_trash<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<NoteSummary, String> {
    let base = paths::writable_base(app)?;
    let config = crate::load_config()?;
    let _process_lock = crate::process_file_lock(&trash_lock_path(&base))?;
    let mut index = load_index(&base)?;
    let pos = index
        .entries
        .iter()
        .position(|e| e.id == id)
        .ok_or_else(|| "回收站条目不存在".to_string())?;
    let entry = index.entries[pos].clone();

    let entry_dir = trash_entry_dir(&base, &id);
    let src = entry_dir.join(&entry.name);
    if !src.is_file() {
        return Err("回收站文件已损坏".into());
    }

    let zone = paths::parse_zone(&entry.zone)?;
    let dest_dir = zone.dir(&config, &base);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = notes::unique_path_pub(&dest_dir, entry.name.clone());
    fs::rename(&src, &dest).map_err(|e| format!("恢复便签失败：{e}"))?;

    let name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "无法确定文件名".to_string())?;

    index.entries.remove(pos);
    if let Err(error) = save_index(&base, &index) {
        let rollback = fs::rename(&dest, &src);
        return match rollback {
            Ok(()) => match remove_empty_trash_entry_dir(&entry_dir) {
                Ok(()) => Err(error),
                Err(cleanup_error) => Err(format!(
                    "保存回收站索引失败：{error}；清理失败：{cleanup_error}"
                )),
            },
            Err(rollback_error) => Err(format!(
                "保存回收站索引失败：{error}；恢复回滚也失败：{rollback_error}"
            )),
        };
    }
    if let Err(error) = remove_empty_trash_entry_dir(&entry_dir) {
        return Err(format!("回收站索引已更新，但清理条目目录失败：{error}"));
    }

    Ok(NoteSummary {
        title: notes::title_from_name(&name),
        modified_ms: notes::file_modified_ms_pub(&dest),
        name,
        zone: zone.as_str(),
        color: None,
    })
}

pub fn permanently_delete_trash<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), String> {
    let base = paths::writable_base(app)?;
    let _process_lock = crate::process_file_lock(&trash_lock_path(&base))?;
    let mut index = load_index(&base)?;
    let pos = index
        .entries
        .iter()
        .position(|e| e.id == id)
        .ok_or_else(|| "回收站条目不存在".to_string())?;
    let removed_entry = index.entries.remove(pos);
    let entry_dir = trash_entry_dir(&base, id);
    let staged_dir = trash_root(&base)
        .join(format!(".deleting-{id}-{}", std::process::id()));
    if entry_dir.exists() {
        write_pending_delete(
            &entry_dir,
            &PendingTrashDelete {
                entry: removed_entry.clone(),
                position: pos,
            },
        )?;
        fs::rename(&entry_dir, &staged_dir).map_err(|e| e.to_string())?;
    }
    if let Err(error) = save_index(&base, &index) {
        if staged_dir.exists() {
            return match restore_staged_path(&staged_dir, &entry_dir) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "保存回收站索引失败：{error}；恢复暂存目录失败：{rollback_error}"
                )),
            };
        }
        return Err(error);
    }
    if staged_dir.exists() {
        if let Err(delete_error) = fs::remove_dir_all(&staged_dir) {
            let directory_rollback = restore_staged_path(&staged_dir, &entry_dir);
            index.entries.insert(pos, removed_entry);
            let index_rollback = save_index(&base, &index);
            return match (directory_rollback, index_rollback) {
                (Ok(()), Ok(())) => Err(format!(
                    "删除回收站暂存数据失败，已恢复条目：{delete_error}"
                )),
                (Err(directory_error), Ok(())) => Err(format!(
                    "删除回收站暂存数据失败，索引已恢复但目录恢复失败：{delete_error}；{directory_error}"
                )),
                (Ok(()), Err(index_error)) => Err(format!(
                    "删除回收站暂存数据失败，目录已恢复但索引恢复失败：{delete_error}；{index_error}"
                )),
                (Err(directory_error), Err(index_error)) => Err(format!(
                    "删除回收站暂存数据失败，目录和索引恢复均失败：{delete_error}；目录：{directory_error}；索引：{index_error}"
                )),
            };
        }
    }
    Ok(())
}

pub fn empty_trash<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let base = paths::writable_base(app)?;
    let _process_lock = crate::process_file_lock(&trash_lock_path(&base))?;
    let root = trash_root(&base);
    if !root.exists() {
        return Ok(());
    }

    let staged_root = root
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(format!(".emptying-trash-{}", std::process::id()));
    fs::rename(&root, &staged_root).map_err(|error| {
        format!("暂存回收站失败：{error}")
    })?;
    if let Err(delete_error) = fs::remove_dir_all(&staged_root) {
        return match restore_staged_path(&staged_root, &root) {
            Ok(()) => Err(format!("清空回收站失败，已恢复回收站：{delete_error}")),
            Err(rollback_error) => Err(format!(
                "清空回收站失败，恢复回收站也失败：{delete_error}；{rollback_error}"
            )),
        };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_entry_directories_are_unique_under_repeated_creation() {
        let base = std::env::temp_dir().join(format!(
            "mknote-trash-id-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let (first_id, first_path) = create_trash_entry_dir(&base).unwrap();
        let (second_id, second_path) = create_trash_entry_dir(&base).unwrap();
        assert_ne!(first_id, second_id);
        assert_ne!(first_path, second_path);
        assert!(first_path.is_dir());
        assert!(second_path.is_dir());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn empty_trash_entry_directory_can_be_removed_after_rollback() {
        let root = std::env::temp_dir().join(format!(
            "mknote-trash-cleanup-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();

        remove_empty_trash_entry_dir(&root).unwrap();

        assert!(!root.exists());
    }

    #[test]
    fn staged_trash_path_can_be_restored_after_delete_failure() {
        let root = std::env::temp_dir().join(format!(
            "mknote-trash-stage-rollback-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let staged = root.join("staged");
        let original = root.join("entries").join("id");
        fs::create_dir_all(&staged).unwrap();

        restore_staged_path(&staged, &original).unwrap();

        assert!(original.is_dir());
        assert!(!staged.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pending_delete_is_recovered_even_when_index_was_already_committed() {
        let base = std::env::temp_dir().join(format!(
            "mknote-trash-pending-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let root = trash_root(&base);
        let staged = root.join(".deleting-entry-123");
        fs::create_dir_all(&staged).unwrap();
        fs::write(staged.join(PENDING_DELETE_FILE), r#"{
            "entry": {
                "id": "entry-123",
                "zone": "default",
                "name": "note.md",
                "title": "note",
                "deleted_at_ms": 1
            },
            "position": 0
        }"#)
        .unwrap();
        fs::write(staged.join("note.md"), "content").unwrap();

        let mut index = TrashIndex::default();
        recover_pending_trash_deletes(&base, &mut index).unwrap();

        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].id, "entry-123");
        assert!(trash_entry_dir(&base, "entry-123").is_dir());
        assert!(!staged.exists());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn interrupted_empty_trash_root_can_be_restored() {
        let base = std::env::temp_dir().join(format!(
            "mknote-trash-empty-recovery-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let parent = paths::file_root_path(&base);
        let staged = parent.join(".emptying-trash-test");
        fs::create_dir_all(&staged).unwrap();
        fs::write(staged.join("index.json"), "{}").unwrap();

        recover_staged_trash_root(&base).unwrap();

        assert!(trash_root(&base).is_dir());
        assert!(!staged.exists());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn trash_root_can_be_staged_while_operation_lock_is_held() {
        let base = std::env::temp_dir().join(format!(
            "mknote-trash-lock-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let root = trash_root(&base);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(INDEX_FILE), b"{}").unwrap();

        let lock = crate::process_file_lock(&trash_lock_path(&base)).unwrap();
        let staged = root
            .parent()
            .unwrap()
            .join(format!(".emptying-trash-test-{}", std::process::id()));
        fs::rename(&root, &staged).unwrap();
        fs::rename(&staged, &root).unwrap();

        drop(lock);
        let _ = fs::remove_dir_all(base);
    }
}
