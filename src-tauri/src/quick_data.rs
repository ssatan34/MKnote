use crate::AppConfig;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Runtime};

// Keep active paths fixed until restart: open editors and in-flight sync operations
// must never read one directory and commit their snapshot to another.
static ACTIVE_DIRECTORIES: OnceLock<QuickDataDirectories> = OnceLock::new();

#[derive(Debug, Clone)]
pub(crate) struct QuickDataDirectories {
    pub todo: PathBuf,
    pub pocket: PathBuf,
}

impl QuickDataDirectories {
    pub fn from_config(config: &AppConfig, base: &Path) -> Self {
        let resolve = |value: Option<&str>| {
            value
                .filter(|value| !value.trim().is_empty())
                .map(|value| PathBuf::from(value.trim()))
                .unwrap_or_else(|| base.join("inbox"))
        };
        Self {
            todo: resolve(config.quick_todo_data_dir.as_deref()),
            pocket: resolve(config.quick_pocket_data_dir.as_deref()),
        }
    }

    pub fn todo_path(&self, id: &str) -> Result<PathBuf, String> {
        quick_path(&self.todo, "Quick Todo", id)
    }

    pub fn pocket_path(&self, id: &str) -> Result<PathBuf, String> {
        quick_path(&self.pocket, "Quick Pocket", id)
    }
}

fn quick_path(directory: &Path, name: &str, id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(format!("{name} ID 无效"));
    }
    if id == "default" {
        Ok(directory.join(format!("{name}.md")))
    } else {
        Ok(directory.join(name).join(format!("{id}.md")))
    }
}

pub(crate) fn initialize(config: &AppConfig, base: &Path) -> &'static QuickDataDirectories {
    ACTIVE_DIRECTORIES.get_or_init(|| QuickDataDirectories::from_config(config, base))
}

pub(crate) fn directories<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<&'static QuickDataDirectories, String> {
    if let Some(active) = ACTIVE_DIRECTORIES.get() {
        return Ok(active);
    }
    let base = crate::paths::writable_base(app)?;
    Ok(initialize(&crate::load_config()?, &base))
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuickDataKind {
    Todo,
    Pocket,
}

#[derive(Serialize)]
pub struct QuickDataDirectorySettings {
    todo_dir: Option<String>,
    pocket_dir: Option<String>,
    active_todo_dir: PathBuf,
    active_pocket_dir: PathBuf,
    todo_restart_required: bool,
    pocket_restart_required: bool,
}

fn settings(
    config: &AppConfig,
    base: &Path,
    active: &QuickDataDirectories,
) -> QuickDataDirectorySettings {
    let desired = QuickDataDirectories::from_config(config, base);
    QuickDataDirectorySettings {
        todo_dir: config.quick_todo_data_dir.clone(),
        pocket_dir: config.quick_pocket_data_dir.clone(),
        active_todo_dir: active.todo.clone(),
        active_pocket_dir: active.pocket.clone(),
        todo_restart_required: desired.todo != active.todo,
        pocket_restart_required: desired.pocket != active.pocket,
    }
}

fn validate_directory(directory: Option<String>) -> Result<Option<String>, String> {
    let value = directory.unwrap_or_default().trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    let path = Path::new(&value);
    if !path.is_absolute() || !path.is_dir() {
        return Err("请选择已存在的数据目录，或留空恢复默认目录".into());
    }
    std::fs::read_dir(path).map_err(|error| format!("无法访问数据目录：{error}"))?;
    Ok(Some(value))
}

#[tauri::command]
pub fn get_quick_data_directories<R: Runtime>(
    app: AppHandle<R>,
) -> Result<QuickDataDirectorySettings, String> {
    let active = directories(&app)?;
    Ok(settings(
        &crate::load_config()?,
        &crate::paths::writable_base(&app)?,
        active,
    ))
}

#[tauri::command]
pub fn set_quick_data_directory<R: Runtime>(
    app: AppHandle<R>,
    kind: QuickDataKind,
    directory: Option<String>,
) -> Result<QuickDataDirectorySettings, String> {
    let directory = validate_directory(directory)?;
    let active = directories(&app)?;
    let config = crate::update_config(|config| {
        match kind {
            QuickDataKind::Todo => config.quick_todo_data_dir = directory,
            QuickDataKind::Pocket => config.quick_pocket_data_dir = directory,
        }
        Ok(())
    })?;
    Ok(settings(
        &config,
        &crate::paths::writable_base(&app)?,
        active,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_config_uses_existing_quick_paths_and_preserves_note_paths() {
        let config = AppConfig::default();
        let base = std::env::temp_dir().join("mknote-default-path-test");
        let directories = QuickDataDirectories::from_config(&config, &base);
        assert_eq!(
            directories.todo_path("default").unwrap(),
            base.join("inbox/Quick Todo.md")
        );
        assert_eq!(
            directories.todo_path("todo_work").unwrap(),
            base.join("inbox/Quick Todo/todo_work.md")
        );
        assert_eq!(
            directories.pocket_path("default").unwrap(),
            base.join("inbox/Quick Pocket.md")
        );
        assert_eq!(
            directories.pocket_path("pocket_prompt").unwrap(),
            base.join("inbox/Quick Pocket/pocket_prompt.md")
        );
        assert_eq!(
            crate::paths::resolve_inbox_dir(&config, &base),
            base.join("inbox")
        );
        assert_eq!(
            crate::paths::resolve_data_dir(&config, &base),
            base.join("File/default")
        );
    }

    #[test]
    fn shared_or_separate_directories_keep_ids_and_require_restart() {
        let base = std::env::temp_dir().join("mknote-quick-path-test");
        let mut config = AppConfig::default();
        let active = QuickDataDirectories::from_config(&config, &base);
        config.quick_todo_data_dir = Some(base.join("Allnote").to_string_lossy().into_owned());
        config.quick_pocket_data_dir = config.quick_todo_data_dir.clone();
        let shared = QuickDataDirectories::from_config(&config, &base);
        assert_eq!(shared.todo, shared.pocket);
        assert_ne!(
            shared.todo_path("default").unwrap(),
            shared.pocket_path("default").unwrap()
        );
        assert!(settings(&config, &base, &active).todo_restart_required);
        assert!(settings(&config, &base, &active).pocket_restart_required);
        assert!(!settings(&config, &base, &shared).todo_restart_required);
        config.quick_pocket_data_dir = Some(base.join("Pocket").to_string_lossy().into_owned());
        let separate = QuickDataDirectories::from_config(&config, &base);
        assert_eq!(
            separate.todo_path("todo_work").unwrap(),
            base.join("Allnote/Quick Todo/todo_work.md")
        );
        assert_eq!(
            separate.pocket_path("pocket_prompt").unwrap(),
            base.join("Pocket/Quick Pocket/pocket_prompt.md")
        );
        assert_eq!(
            crate::paths::resolve_inbox_dir(&config, &base),
            base.join("inbox")
        );
        for id in ["", "../escape", "a/b", "a\\b", "C:escape"] {
            assert!(separate.todo_path(id).is_err());
            assert!(separate.pocket_path(id).is_err());
        }
        config.quick_todo_data_dir = None;
        assert!(!settings(&config, &base, &active).todo_restart_required);
    }

    #[test]
    fn directory_validation_does_not_create_or_move_files() {
        let root =
            std::env::temp_dir().join(format!("mknote-quick-validation-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("note.md");
        std::fs::write(&file, "unchanged").unwrap();
        assert_eq!(validate_directory(None).unwrap(), None);
        assert_eq!(validate_directory(Some("  ".into())).unwrap(), None);
        let value = root.to_string_lossy().into_owned();
        assert_eq!(
            validate_directory(Some(format!(" {value} "))).unwrap(),
            Some(value)
        );
        assert!(validate_directory(Some("relative".into())).is_err());
        assert!(validate_directory(Some(file.to_string_lossy().into_owned())).is_err());
        let missing = root.join("missing");
        assert!(validate_directory(Some(missing.to_string_lossy().into_owned())).is_err());
        assert!(!missing.exists());
        assert_eq!(std::fs::read_to_string(file).unwrap(), "unchanged");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }
}
