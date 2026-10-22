use crate::notes::{self, NoteSummary};
use crate::paths::{self, NoteZone};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};

const BUILTIN_TEMPLATES: &[(&str, &str)] = &[
    (
        "会议记录",
        include_str!("../resources/templates/会议记录.md"),
    ),
    (
        "今日工作",
        include_str!("../resources/templates/今日工作.md"),
    ),
    (
        "沟通记录",
        include_str!("../resources/templates/沟通记录.md"),
    ),
    (
        "购物清单",
        include_str!("../resources/templates/购物清单.md"),
    ),
    (
        "旅行准备",
        include_str!("../resources/templates/旅行准备.md"),
    ),
    (
        "阅读摘录",
        include_str!("../resources/templates/阅读摘录.md"),
    ),
    (
        "资料暂存",
        include_str!("../resources/templates/资料暂存.md"),
    ),
    (
        "概念卡片",
        include_str!("../resources/templates/概念卡片.md"),
    ),
];

#[derive(Debug, Serialize, Clone)]
pub struct TemplateSummary {
    pub id: String,
    pub title: String,
    pub source: String,
}

fn templates_dir(base: &Path) -> PathBuf {
    paths::file_root_path(base).join("templates")
}

fn user_templates_dir(base: &Path) -> PathBuf {
    paths::file_root_path(base).join(".mknote-templates")
}

pub fn ensure_builtin_templates<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let base = paths::writable_base(app)?;
    let dir = templates_dir(&base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (name, content) in BUILTIN_TEMPLATES {
        let path = dir.join(format!("{name}.md"));
        if !path.exists() {
            notes::atomic_write_file_pub(&path, content)?;
        }
    }
    fs::create_dir_all(user_templates_dir(&base)).map_err(|e| e.to_string())?;
    Ok(())
}

fn collect_templates_from_dir(
    dir: &Path,
    source: &str,
    out: &mut Vec<TemplateSummary>,
) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|error| format!("读取模板目录失败：{error}"))? {
        let entry = entry.map_err(|error| format!("读取模板目录项失败：{error}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if file_name.eq_ignore_ascii_case("README.md") {
            continue;
        }
        let title = notes::title_from_name(&file_name);
        if out.iter().any(|t| t.id == title) {
            continue;
        }
        out.push(TemplateSummary {
            id: title.clone(),
            title,
            source: source.to_string(),
        });
    }
    Ok(())
}

pub fn list_templates<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<TemplateSummary>, String> {
    ensure_builtin_templates(app)?;
    let base = paths::writable_base(app)?;
    let mut templates = Vec::new();
    collect_templates_from_dir(&templates_dir(&base), "builtin", &mut templates)?;
    collect_templates_from_dir(&user_templates_dir(&base), "user", &mut templates)?;
    templates.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(templates)
}

fn resolve_template_path(base: &Path, template_id: &str) -> Result<PathBuf, String> {
    let name = format!("{template_id}.md");
    let builtin = templates_dir(base).join(&name);
    if builtin.is_file() {
        return canonical_template_path(&templates_dir(base), &builtin);
    }
    let user = user_templates_dir(base).join(&name);
    if user.is_file() {
        return canonical_template_path(&user_templates_dir(base), &user);
    }
    Err(format!("模板「{template_id}」不存在"))
}

fn canonical_template_path(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("解析模板目录失败：{error}"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|error| format!("解析模板文件失败：{error}"))?;
    if !canonical_candidate.starts_with(&canonical_root) {
        return Err("模板路径越界或指向模板目录之外".into());
    }
    Ok(canonical_candidate)
}

fn validate_template_id(template_id: &str) -> Result<(), String> {
    let value = template_id.trim();
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains("..")
        || value.contains('/')
        || value.contains('\\')
        || value.contains(':')
        || value.chars().any(|c| c.is_control())
    {
        return Err("无效模板标识".into());
    }
    Ok(())
}

fn substitute_variables(content: &str, title: &str) -> String {
    let now = chrono::Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();
    let datetime = now.format("%Y-%m-%d %H:%M").to_string();
    content
        .replace("{{title}}", title)
        .replace("{{date}}", &date)
        .replace("{{time}}", &time)
        .replace("{{datetime}}", &datetime)
}

pub fn create_note_from_template<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    template_id: &str,
) -> Result<NoteSummary, String> {
    validate_template_id(template_id)?;
    ensure_builtin_templates(app)?;
    let base = paths::writable_base(app)?;
    let config = crate::load_config()?;
    let template_path = resolve_template_path(&base, template_id)?;
    let raw = fs::read_to_string(&template_path).map_err(|e| e.to_string())?;

    let now = chrono::Local::now();
    let title = format!("{template_id}_{}", now.format("%Y%m%d%H%M%S"));
    let content = substitute_variables(&raw, &title);
    let file_name = format!("{title}.md");

    let dir = zone.dir(&config, &base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = notes::unique_path_pub(&dir, file_name);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "无法确定新建便签文件名".to_string())?;
    notes::atomic_write_file_pub(&path, &content)?;

    if let Err(error) = crate::update_config(|config| {
        config.last_note = Some(name.clone());
        config.last_note_zone = Some(zone.as_str());
        Ok(())
    }) {
        let _ = fs::remove_file(&path);
        return Err(format!("保存模板便签状态失败，已删除新建文件：{error}"));
    }

    Ok(NoteSummary {
        title: notes::title_from_name(&name),
        modified_ms: notes::file_modified_ms_pub(&path),
        name,
        zone: zone.as_str(),
        color: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn template_path_rejects_canonical_target_outside_template_root() {
        let root = std::env::temp_dir().join(format!(
            "mknote-template-root-{}",
            std::process::id()
        ));
        let outside = std::env::temp_dir().join(format!(
            "mknote-template-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let outside_file = outside.join("escape.md");
        fs::write(&outside_file, "outside").unwrap();

        assert!(canonical_template_path(&root, &outside_file).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
