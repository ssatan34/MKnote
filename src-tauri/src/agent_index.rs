use crate::notes::{self, NoteSummary};
use crate::paths::{self, parse_zone, NoteZone};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Serialize)]
pub struct AgentManifest {
    pub generated_at_ms: i64,
    pub base_path: String,
    pub folders: Vec<AgentFolderEntry>,
    pub notes: Vec<AgentNoteEntry>,
}

#[derive(Debug, Serialize)]
pub struct AgentFolderEntry {
    pub id: String,
    pub title: String,
    pub zone: String,
}

#[derive(Debug, Serialize)]
pub struct AgentNoteEntry {
    pub name: String,
    pub title: String,
    pub zone: String,
    pub path: String,
    pub color: Option<String>,
    pub modified_ms: i64,
    pub is_todo: bool,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn relative_note_path(zone: &str, name: &str) -> String {
    match zone {
        "inbox" => format!("inbox/{name}"),
        "default" => format!("File/default/{name}"),
        z if z.starts_with("folder:") => {
            let id = z.trim_start_matches("folder:");
            format!("File/{id}/{name}")
        }
        _ => format!("{zone}/{name}"),
    }
}

fn collect_zone_notes<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    out: &mut Vec<AgentNoteEntry>,
    base: &Path,
) -> Result<(), String> {
    // 隐私区不参与 Agent 索引
    if zone == NoteZone::Private {
        return Ok(());
    }
    let zone_str = zone.as_str();
    let list = notes::list_zone(app, zone.clone())?;
    for note in list {
        if notes::is_privacy_note(base, &zone, &note.name)? {
            continue;
        }
        out.push(to_agent_note(base, note, &zone_str));
    }
    Ok(())
}

fn to_agent_note(_base: &Path, note: NoteSummary, zone: &str) -> AgentNoteEntry {
    AgentNoteEntry {
        name: note.name.clone(),
        title: note.title,
        zone: zone.to_string(),
        path: relative_note_path(zone, &note.name),
        color: note.color,
        modified_ms: note.modified_ms,
        is_todo: false,
    }
}

pub fn refresh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let base = paths::writable_base(app)?;
    let manifest = build_manifest(app, &base)?;
    let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    notes::atomic_write_file_pub(&base.join("mknote-manifest.json"), &json)?;
    notes::atomic_write_file_pub(&base.join("llms.txt"), &build_llms_txt(&manifest))?;
    Ok(())
}

fn build_manifest<R: Runtime>(app: &AppHandle<R>, base: &Path) -> Result<AgentManifest, String> {
    let folders = notes::list_folders(app)?;
    let folder_entries: Vec<AgentFolderEntry> = folders
        .iter()
        .map(|f| AgentFolderEntry {
            id: f.id.clone(),
            title: f.title.clone(),
            zone: f.zone.clone(),
        })
        .collect();

    let mut note_entries = Vec::new();
    collect_zone_notes(app, NoteZone::Inbox, &mut note_entries, base)?;
    for folder in &folders {
        let zone = parse_zone(&folder.zone)?;
        collect_zone_notes(app, zone, &mut note_entries, base)?;
    }

    note_entries.sort_by(|a, b| {
        a.path
            .to_lowercase()
            .cmp(&b.path.to_lowercase())
            .then_with(|| b.modified_ms.cmp(&a.modified_ms))
    });

    Ok(AgentManifest {
        generated_at_ms: now_ms(),
        base_path: paths::path_to_string(base)?,
        folders: folder_entries,
        notes: note_entries,
    })
}

fn build_llms_txt(manifest: &AgentManifest) -> String {
    let folder_lines = manifest
        .folders
        .iter()
        .map(|f| {
            format!(
                "- {} (zone: {})",
                escape_llms_value(&f.title),
                escape_llms_value(&f.zone)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"# MKnote — Agent 接入说明

MKnote 是轻量 Markdown 桌面便签，不是知识库或图谱产品。每条笔记是一个独立的 `.md` 文件。

## 数据根目录

`{base}`

## 目录结构

- `inbox/` — 收件箱便签
- `File/default/` — 默认文件夹
- `File/<folder-name>/` — 用户新建的文件夹

当前文件夹：
{folders}

## 元数据文件（勿随意删除）

- `File/.mknote-note-colors.json` — 笔记颜色标签
- `File/.mknote-folders.json` — 文件夹遗留元数据
- `mknote-manifest.json` — 本程序生成的笔记索引（可覆盖）
- `llms.txt` — 本说明文件（可覆盖）

## 操作安全规则

1. 先读取再修改；大改动前备份或确认路径。
2. 保持 Markdown 为主；避免注入复杂 HTML（预览编辑会 turndown 回写）。
3. 重命名笔记请保持 `.md` 后缀；文件名避免 `\ / : * ? " < > |`。
4. 谨慎删除文件；删除后进入本地回收站，可从底部栏恢复。
5. 标记为「隐私」的便签不会出现在本索引与 `mknote-manifest.json` 中。

## 机器可读索引

同目录下的 `mknote-manifest.json` 包含文件夹列表、笔记路径、zone、颜色、修改时间与 `is_todo` 标记。
生成时间（Unix ms）：{generated_at_ms}
"#,
        base = manifest.base_path,
        folders = if folder_lines.is_empty() {
            "- （暂无）".to_string()
        } else {
            folder_lines
        },
        generated_at_ms = manifest.generated_at_ms,
    )
}

/// 将用户可控的目录元数据安全地嵌入 Agent 使用的 Markdown 文本。
///
/// 换行会改变指令结构，Markdown/HTML 标记则可能伪造标题、代码块或注释；
/// 因此控制字符统一折叠为空格，其余结构字符用 Markdown 反斜杠转义。
fn escape_llms_value(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_control() {
            escaped.push(' ');
        } else if matches!(
            ch,
            '\\' | '`' | '*' | '_' | '[' | ']' | '<' | '>' | '#' | '|'
        ) {
            escaped.push('\\');
            escaped.push(ch);
        } else {
            escaped.push(ch);
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llms_folder_labels_cannot_inject_markdown_structure_or_html() {
        let manifest = AgentManifest {
            generated_at_ms: 0,
            base_path: "D:/data".to_string(),
            folders: vec![AgentFolderEntry {
                id: "folder:test".to_string(),
                title: "中文\n## 伪造规则\n<!-- hidden --> `code` #tag".to_string(),
                zone: "folder:中文\n<!-- zone -->".to_string(),
            }],
            notes: Vec::new(),
        };

        let output = build_llms_txt(&manifest);

        assert!(!output.contains("\n## 伪造规则"));
        assert!(!output.contains("\n<!-- hidden -->"));
        assert!(!output.contains("\n<!-- zone -->"));
        assert!(output.contains("中文"));
    }
}
