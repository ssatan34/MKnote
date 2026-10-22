use crate::{load_config, QuickTodoDefinition};
use chrono::{DateTime, Utc};
use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use regex::Regex;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager, Runtime};

const DEFAULT_DOCUMENT: &str = "# Quick Todo\n";
const CHANGED_EVENT: &str = "mknote:quick-todo-changed";
const REGISTRY_CHANGED_EVENT: &str = "mknote:quick-todo-registry-changed";
pub const DEFAULT_QUICK_TODO_ID: &str = "default";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuickTodoTag {
    Important,
    Waiting,
    Next,
    Idea,
    #[serde(rename = "urgent")]
    Urgent,
    #[serde(rename = "important_urgent")]
    ImportantUrgent,
}

impl QuickTodoTag {
    fn as_str(self) -> &'static str {
        match self {
            Self::Important => "important",
            Self::Waiting => "waiting",
            Self::Next => "next",
            Self::Idea => "idea",
            Self::Urgent => "urgent",
            Self::ImportantUrgent => "important_urgent",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "important" => Some(Self::Important),
            "waiting" => Some(Self::Waiting),
            "next" => Some(Self::Next),
            "idea" => Some(Self::Idea),
            "urgent" => Some(Self::Urgent),
            "important_urgent" => Some(Self::ImportantUrgent),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickTodoItem {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub tag: Option<QuickTodoTag>,
    pub parent_id: Option<String>,
    pub remind_at: Option<String>,
    pub link: Option<QuickTodoLink>,
    pub allnote_work: Option<AllnoteWorkMetadata>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllnoteWorkMetadata {
    pub v: u8,
    pub project_id: String,
    pub project_name: String,
    pub project_uri: String,
    pub source_uri: String,
    pub dates: Vec<String>,
    pub context: bool,
}

fn is_work_id(id: &str) -> bool { id.starts_with("allnote_work_") }

fn validate_work_uri(uri: &str) -> Result<(), String> {
    let encoded = uri.strip_prefix("obsidian://open?vault=Allnote&file=").ok_or("来源链接不是 Allnote 笔记")?;
    if encoded.contains(['&', '#']) { return Err("来源链接参数无效".into()); }
    let decoded = percent_decode_str(encoded).decode_utf8().map_err(|_| "来源路径编码无效")?;
    if !decoded.starts_with("20 工作/") || !decoded.ends_with(".md") || decoded.contains('\\') || decoded.split('/').any(|part| part == "..") || decoded.chars().any(char::is_control) {
        return Err("来源路径必须是 Allnote 的工作笔记".into());
    }
    Ok(())
}

#[tauri::command]
pub fn quick_todo_open_work_source<R: Runtime>(app: tauri::AppHandle<R>, todo_id: String, id: String, project: bool) -> Result<(), String> {
    let path = todo_path(&app, &todo_id)?;
    let text = std::fs::read_to_string(path).map_err(|error| format!("读取来源失败：{error}"))?;
    let document = QuickTodoDocument::parse(&text);
    let item = document.managed.iter().find(|entry| entry.item.id == id && is_work_id(&id)).ok_or("同步任务已不存在，请刷新")?;
    let work = item.item.allnote_work.as_ref().ok_or("来源信息尚未更新")?;
    let uri = if project { &work.project_uri } else { &work.source_uri };
    validate_work_uri(uri)?;
    #[cfg(windows)]
    {
        use windows::{core::{PCWSTR, w}, Win32::{UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}}};
        let target: Vec<u16> = uri.encode_utf16().chain(std::iter::once(0)).collect();
        // Invoke the registered URI handler; Explorer can silently ignore encoded URLs.
        let result = unsafe { ShellExecuteW(None, w!("open"), PCWSTR(target.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        if result.0 as isize <= 32 { return Err(format!("打开来源失败，Windows 错误码：{}", result.0 as isize)); }
        Ok(())
    }
    #[cfg(not(windows))]
    { Err("当前平台暂不支持打开 Allnote 来源".into()) }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickTodoLink {
    pub zone: String,
    pub name: String,
}

#[derive(Clone, Debug)]
struct ManagedLine {
    item: QuickTodoItem,
    line_index: usize,
}

#[derive(Clone, Debug)]
struct QuickTodoDocument {
    lines: Vec<String>,
    managed: Vec<ManagedLine>,
}

fn line_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^- \[([ xX])\] (.*?) <!-- quick-todo:id=([^ ]+) createdAt=([^ ]+)(?: completedAt=([^ ]+))?(?: tag=([^ ]+))?(?: parentId=([^ ]+))?(?: remindAt=([^ ]+))?(?: link=([^ ]+))?(?: allnoteWork=([^ ]+))? -->\r?\n?$").unwrap())
}

impl QuickTodoDocument {
    fn parse(input: &str) -> Self {
        let lines: Vec<String> = input.split_inclusive('\n').map(str::to_owned).collect();
        let mut candidates = Vec::new();
        let mut counts: HashMap<String, usize> = HashMap::new();
        for (line_index, line) in lines.iter().enumerate() {
            let Some(caps) = line_regex().captures(line) else {
                continue;
            };
            let id = caps[3].to_string();
            if DateTime::parse_from_rfc3339(&caps[4]).is_err() {
                continue;
            }
            let completed = !caps[1].eq(" ");
            let completed_at = caps.get(5).map(|value| value.as_str().to_string());
            let tag = caps
                .get(6)
                .and_then(|value| QuickTodoTag::parse(value.as_str()));
            let parent_id = caps.get(7).map(|value| value.as_str().to_string());
            let remind_at = caps.get(8).map(|value| value.as_str().to_string());
            let link = caps.get(9).and_then(|value| parse_link(value.as_str()));
            let allnote_work = caps.get(10).and_then(|value| URL_SAFE_NO_PAD.decode(value.as_str()).ok())
                .and_then(|bytes| serde_json::from_slice::<AllnoteWorkMetadata>(&bytes).ok())
                .filter(|value| is_work_id(&id) && value.v == 1 && !value.project_id.is_empty() && !value.project_name.is_empty());
            if completed_at
                .as_deref()
                .is_some_and(|value| DateTime::parse_from_rfc3339(value).is_err())
            {
                continue;
            }
            if completed != completed_at.is_some() {
                continue;
            }
            *counts.entry(id.clone()).or_default() += 1;
            if remind_at
                .as_deref()
                .is_some_and(|value| DateTime::parse_from_rfc3339(value).is_err())
            {
                continue;
            }
            candidates.push(ManagedLine {
                item: QuickTodoItem {
                    id,
                    text: caps[2].to_string(),
                    completed,
                    created_at: caps[4].to_string(),
                    completed_at,
                    tag,
                    parent_id,
                    remind_at,
                    link,
                    allnote_work,
                },
                line_index,
            });
        }
        let duplicate_ids: HashSet<String> = counts
            .into_iter()
            .filter_map(|(id, count)| (count > 1).then_some(id))
            .collect();
        let managed = candidates
            .into_iter()
            .filter(|line| !duplicate_ids.contains(&line.item.id))
            .collect();
        Self { lines, managed }
    }

    fn items(&self) -> Vec<QuickTodoItem> {
        self.managed.iter().map(|line| line.item.clone()).collect()
    }
    fn render(&self) -> String {
        self.lines.concat()
    }

    fn ensure_writable(&self, id: &str) -> Result<(), String> {
        if is_work_id(id) { return Err("Allnote 同步任务只读，请在 Allnote 中修改".into()); }
        Ok(())
    }

    fn add(
        &mut self,
        text: &str,
        id: &str,
        created_at: &str,
        tag: Option<QuickTodoTag>,
        parent_id: Option<&str>,
    ) -> Result<(), String> {
        let text = validate_todo_text(text)?;
        let parent_id = parent_id.map(str::to_string);
        if let Some(parent_id) = parent_id.as_deref() {
            self.ensure_writable(parent_id)?;
            let parent = self
                .managed
                .iter()
                .find(|entry| entry.item.id == parent_id)
                .ok_or_else(|| "父 Todo 不存在，请刷新后重试".to_string())?;
            if parent.item.parent_id.is_some() {
                return Err("只支持两层 Todo，子 Todo 不能再创建子 Todo".into());
            }
        }
        let item = QuickTodoItem {
            id: id.into(),
            text: text.into(),
            completed: false,
            created_at: created_at.into(),
            completed_at: None,
            tag,
            parent_id,
            remind_at: None,
            link: None,
            allnote_work: None,
        };
        let position = if let Some(parent_id) = item.parent_id.as_deref() {
            self.managed
                .iter()
                .filter(|entry| {
                    entry.item.id == parent_id || entry.item.parent_id.as_deref() == Some(parent_id)
                })
                .map(|entry| entry.line_index)
                .max()
                .expect("validated parent must be managed")
                + 1
        } else if let Some(line) = self.managed.first() {
            line.line_index
        } else {
            if self.lines.last().is_some_and(|line| !line.ends_with('\n')) {
                self.lines.push("\n".into());
            }
            self.lines.len()
        };
        self.lines.insert(position, format_line(&item));
        *self = Self::parse(&self.render());
        Ok(())
    }

    fn toggle(&mut self, id: &str, now: &str) -> Result<(), String> {
        self.ensure_writable(id)?;
        let entry_index = self
            .managed
            .iter()
            .position(|entry| entry.item.id == id)
            .ok_or_else(|| "待办不存在或元数据已损坏，请刷新后重试".to_string())?;
        let completed = !self.managed[entry_index].item.completed;
        self.managed[entry_index].item.completed = completed;
        self.managed[entry_index].item.completed_at = completed.then(|| now.to_string());
        let line_index = self.managed[entry_index].line_index;
        self.lines[line_index] = format_line(&self.managed[entry_index].item);
        let child_ids: Vec<String> = self
            .managed
            .iter()
            .filter(|entry| entry.item.parent_id.as_deref() == Some(id) && !is_work_id(&entry.item.id))
            .map(|entry| entry.item.id.clone())
            .collect();
        for child_id in child_ids {
            if let Some(child) = self
                .managed
                .iter_mut()
                .find(|entry| entry.item.id == child_id)
            {
                child.item.completed = completed;
                child.item.completed_at = completed.then(|| now.to_string());
                self.lines[child.line_index] = format_line(&child.item);
            }
        }
        Ok(())
    }

    fn delete(&mut self, id: &str) -> Result<(), String> {
        self.ensure_writable(id)?;
        if !self.managed.iter().any(|entry| entry.item.id == id) {
            return Err("待办不存在或元数据已损坏，请刷新后重试".into());
        }
        let remove_ids: HashSet<String> = self
            .managed
            .iter()
            .filter(|entry| !is_work_id(&entry.item.id) && (entry.item.id == id || entry.item.parent_id.as_deref() == Some(id)))
            .map(|entry| entry.item.id.clone())
            .collect();
        let mut remove_indices: Vec<usize> = self
            .managed
            .iter()
            .filter(|entry| remove_ids.contains(&entry.item.id))
            .map(|entry| entry.line_index)
            .collect();
        remove_indices.sort_unstable_by(|left, right| right.cmp(left));
        for index in remove_indices {
            self.lines.remove(index);
        }
        *self = Self::parse(&self.render());
        Ok(())
    }

    fn clear_completed(&mut self) {
        let removed_indices: Vec<usize> = self
            .managed
            .iter()
            .filter(|entry| entry.item.completed && !is_work_id(&entry.item.id))
            .map(|entry| entry.line_index)
            .collect();
        if removed_indices.is_empty() {
            return;
        }

        self.lines = self
            .lines
            .iter()
            .enumerate()
            .filter(|(index, _)| !removed_indices.contains(index))
            .map(|(_, line)| line.clone())
            .collect();
        self.managed.retain(|entry| !entry.item.completed || is_work_id(&entry.item.id));
        for entry in &mut self.managed {
            entry.line_index -= removed_indices
                .iter()
                .take_while(|index| **index < entry.line_index)
                .count();
        }
    }

    fn set_tag(&mut self, id: &str, tag: Option<QuickTodoTag>) -> Result<(), String> {
        self.ensure_writable(id)?;
        let entry = self
            .managed
            .iter_mut()
            .find(|entry| entry.item.id == id)
            .ok_or_else(|| "待办不存在或元数据已损坏，请刷新后重试".to_string())?;
        entry.item.tag = tag;
        self.lines[entry.line_index] = format_line(&entry.item);
        Ok(())
    }

    fn edit(&mut self, id: &str, text: &str) -> Result<(), String> {
        self.ensure_writable(id)?;
        let text = validate_todo_text(text)?;
        let entry = self
            .managed
            .iter_mut()
            .find(|entry| entry.item.id == id)
            .ok_or_else(|| "待办不存在或元数据已损坏，请刷新后重试".to_string())?;
        entry.item.text = text.to_string();
        self.lines[entry.line_index] = format_line(&entry.item);
        Ok(())
    }

    fn set_reminder(&mut self, id: &str, remind_at: Option<String>) -> Result<(), String> {
        self.ensure_writable(id)?;
        if let Some(value) = remind_at.as_deref() {
            let parsed =
                DateTime::parse_from_rfc3339(value).map_err(|_| "提醒时间格式无效".to_string())?;
            if parsed
                <= DateTime::parse_from_rfc3339(&Utc::now().to_rfc3339())
                    .expect("UTC now must parse")
            {
                return Err("提醒时间必须晚于当前时间".into());
            }
        }
        let entry = self
            .managed
            .iter_mut()
            .find(|entry| entry.item.id == id)
            .ok_or_else(|| "待办不存在或元数据已损坏，请刷新后重试".to_string())?;
        entry.item.remind_at = remind_at;
        self.lines[entry.line_index] = format_line(&entry.item);
        Ok(())
    }

    fn set_link(&mut self, id: &str, link: Option<QuickTodoLink>) -> Result<(), String> {
        self.ensure_writable(id)?;
        if let Some(value) = link.as_ref() {
            if value.zone.trim().is_empty() || value.name.trim().is_empty() {
                return Err("笔记链接不能为空".into());
            }
        }
        let entry = self
            .managed
            .iter_mut()
            .find(|entry| entry.item.id == id)
            .ok_or_else(|| "待办不存在或元数据已损坏，请刷新后重试".to_string())?;
        entry.item.link = link;
        self.lines[entry.line_index] = format_line(&entry.item);
        Ok(())
    }

    fn reorder(&mut self, ids: &[String]) -> Result<(), String> {
        let writable: Vec<&ManagedLine> = self.managed.iter().filter(|line| !is_work_id(&line.item.id)).collect();
        if ids.len() != writable.len() {
            return Err("排序请求必须包含当前全部待办".into());
        }

        let requested: HashSet<&str> = ids.iter().map(String::as_str).collect();
        if requested.len() != ids.len() {
            return Err("排序请求包含重复待办".into());
        }

        let current: HashSet<&str> = writable
            .iter()
            .map(|line| line.item.id.as_str())
            .collect();
        if requested != current {
            return Err("排序请求与当前待办不一致，请刷新后重试".into());
        }

        let slots: Vec<usize> = writable.iter().map(|line| line.line_index).collect();
        let by_id: HashMap<&str, (&ManagedLine, String)> = writable
            .iter()
            .map(|line| {
                (
                    line.item.id.as_str(),
                    (*line, self.lines[line.line_index].clone()),
                )
            })
            .collect();
        let reordered: Vec<(ManagedLine, String)> = ids
            .iter()
            .zip(slots)
            .map(|(id, line_index)| {
                let (line, source) = by_id[id.as_str()].clone();
                (
                    ManagedLine {
                        item: line.item.clone(),
                        line_index,
                    },
                    source,
                )
            })
            .collect();

        for (line, source) in &reordered {
            self.lines[line.line_index] = source.clone();
        }
        *self = Self::parse(&self.render());
        Ok(())
    }
}

fn validate_todo_text(text: &str) -> Result<&str, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("待办内容不能为空".into());
    }
    if text.chars().any(char::is_control) {
        return Err("待办内容不能包含控制字符".into());
    }
    if text.contains("<!--") || text.contains("-->") {
        return Err("待办内容不能包含内部元数据标记".into());
    }
    Ok(text)
}

fn format_line(item: &QuickTodoItem) -> String {
    let checked = if item.completed { "x" } else { " " };
    let completed = item
        .completed_at
        .as_ref()
        .map(|value| format!(" completedAt={value}"))
        .unwrap_or_default();
    let tag = item
        .tag
        .map(|value| format!(" tag={}", value.as_str()))
        .unwrap_or_default();
    let parent_id = item
        .parent_id
        .as_ref()
        .map(|value| format!(" parentId={value}"))
        .unwrap_or_default();
    let remind_at = item
        .remind_at
        .as_ref()
        .map(|value| format!(" remindAt={value}"))
        .unwrap_or_default();
    let link = item
        .link
        .as_ref()
        .map(|value| {
            let raw = format!("{}/{}", value.zone, value.name);
            let encoded = utf8_percent_encode(&raw, NON_ALPHANUMERIC);
            format!(" link={encoded}")
        })
        .unwrap_or_default();
    let work = item.allnote_work.as_ref().map(|value| format!(" allnoteWork={}", URL_SAFE_NO_PAD.encode(serde_json::to_vec(value).expect("work metadata serializes")))).unwrap_or_default();
    format!(
        "- [{checked}] {} <!-- quick-todo:id={} createdAt={}{}{}{}{}{}{} -->\n",
        item.text, item.id, item.created_at, completed, tag, parent_id, remind_at, link, work
    )
}

fn parse_link(value: &str) -> Option<QuickTodoLink> {
    let decoded = percent_decode_str(value).decode_utf8().ok()?;
    let (zone, name) = decoded.split_once('/')?;
    (!zone.is_empty() && !name.is_empty()).then(|| QuickTodoLink {
        zone: zone.to_string(),
        name: name.to_string(),
    })
}

fn lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn temp_path(path: &Path) -> PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    path.with_extension(format!(
        "md.{}.{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

#[cfg(windows)]
fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
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
    }
    .map_err(|error| format!("替换 Quick Todo 文件失败：{error}"))
}

#[cfg(not(windows))]
fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    std::fs::rename(temp, target).map_err(|error| format!("替换 Quick Todo 文件失败：{error}"))
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Quick Todo 目录失败：{error}"))?;
    }
    let temp = temp_path(path);
    let write_result = (|| {
        let mut file = std::fs::File::create(&temp)
            .map_err(|error| format!("创建 Quick Todo 临时文件失败：{error}"))?;
        file.write_all(content.as_bytes())
            .map_err(|error| format!("写入 Quick Todo 临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步 Quick Todo 临时文件失败：{error}"))
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    replace_file(&temp, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        error
    })
}

fn read_document(path: &Path) -> Result<QuickTodoDocument, String> {
    if !path.exists()
        || std::fs::metadata(path)
            .map(|metadata| metadata.len() == 0)
            .unwrap_or(false)
    {
        atomic_write(path, DEFAULT_DOCUMENT)?;
    }
    std::fs::read_to_string(path)
        .map(|text| QuickTodoDocument::parse(&text))
        .map_err(|error| format!("读取 Quick Todo 失败：{error}"))
}

fn mutate_and_notify<T>(
    path: &Path,
    transform: impl FnOnce(&mut QuickTodoDocument) -> Result<T, String>,
    notify: impl FnOnce() -> Result<(), String>,
) -> Result<T, String> {
    let result = mutate_file(path, transform)?;
    if let Err(error) = notify() {
        eprintln!("Quick Todo 已写入，但变化事件广播失败：{error}");
    }
    Ok(result)
}

fn mutate_file<T>(
    path: &Path,
    transform: impl FnOnce(&mut QuickTodoDocument) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = lock()
        .lock()
        .map_err(|_| "Quick Todo 文件锁已损坏".to_string())?;
    let _process_lock = crate::process_file_lock(path)?;
    let mut document = read_document(path)?;
    let result = transform(&mut document)?;
    atomic_write(path, &document.render())?;
    Ok(result)
}

fn todo_definition(todo_id: &str) -> Result<QuickTodoDefinition, String> {
    if todo_id == DEFAULT_QUICK_TODO_ID {
        return Ok(QuickTodoDefinition {
            id: DEFAULT_QUICK_TODO_ID.to_string(),
            name: "Quick Todo".to_string(),
        });
    }
    load_config()?
        .quick_todos
        .into_iter()
        .find(|todo| todo.id == todo_id)
        .ok_or_else(|| "Quick Todo 不存在，请刷新后重试".to_string())
}

fn todo_path<R: Runtime>(app: &tauri::AppHandle<R>, todo_id: &str) -> Result<PathBuf, String> {
    let path = crate::quick_data::directories(app)?.todo_path(todo_id)?;
    if todo_id != DEFAULT_QUICK_TODO_ID {
        todo_definition(todo_id)?;
    }
    Ok(path)
}

fn changed_event(todo_id: &str) -> String {
    format!("{CHANGED_EVENT}:{todo_id}")
}

fn normalize_todo_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Quick Todo 名称不能为空".to_string());
    }
    if name.chars().count() > 6 {
        return Err("Quick Todo 名称不能超过 6 个字符".to_string());
    }
    Ok(name.to_string())
}

fn registry() -> Result<Vec<QuickTodoDefinition>, String> {
    let mut todos = vec![QuickTodoDefinition {
        id: DEFAULT_QUICK_TODO_ID.to_string(),
        name: "Quick Todo".to_string(),
    }];
    for todo in load_config()?.quick_todos {
        if todo.id != DEFAULT_QUICK_TODO_ID && !todos.iter().any(|current| current.id == todo.id) {
            todos.push(todo);
        }
    }
    Ok(todos)
}

#[tauri::command]
pub fn quick_todo_registry_list() -> Result<Vec<QuickTodoDefinition>, String> {
    registry()
}

#[tauri::command]
pub fn quick_todo_create<R: Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
) -> Result<QuickTodoDefinition, String> {
    let name = normalize_todo_name(&name)?;
    let id = format!(
        "todo_{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let todo = QuickTodoDefinition {
        id: id.clone(),
        name,
    };
    let path = crate::quick_data::directories(&app)?.todo_path(&id)?;
    let _process_lock = crate::process_file_lock(&path)?;
    if path.exists() {
        return Err("创建 Quick Todo 失败：目标文件已存在".to_string());
    }
    atomic_write(&path, DEFAULT_DOCUMENT)?;
    if let Err(error) = crate::update_config(|config| {
        config.quick_todos.push(todo.clone());
        Ok(())
    }) {
        let _ = std::fs::remove_file(&path);
        return Err(format!("保存 Quick Todo 配置失败，已回滚新建文件：{error}"));
    }
    let _ = app.emit(REGISTRY_CHANGED_EVENT, ());
    Ok(todo)
}

#[tauri::command]
pub fn quick_todo_rename<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
    name: String,
) -> Result<QuickTodoDefinition, String> {
    if todo_id == DEFAULT_QUICK_TODO_ID {
        return Err("默认 Quick Todo 不允许重命名".to_string());
    }
    let name = normalize_todo_name(&name)?;
    let mut result = None;
    crate::update_config(|config| {
        let todo = config
            .quick_todos
            .iter_mut()
            .find(|todo| todo.id == todo_id)
            .ok_or_else(|| "Quick Todo 不存在，请刷新后重试".to_string())?;
        todo.name = name;
        result = Some(todo.clone());
        Ok(())
    })?;
    let _ = app.emit(REGISTRY_CHANGED_EVENT, ());
    result.ok_or_else(|| "Quick Todo 重命名失败".to_string())
}

#[tauri::command]
pub fn quick_todo_delete_todo<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
) -> Result<Vec<QuickTodoDefinition>, String> {
    if todo_id == DEFAULT_QUICK_TODO_ID {
        return Err("默认 Quick Todo 不允许删除".to_string());
    }
    let _guard = lock()
        .lock()
        .map_err(|_| "Quick Todo 文件锁已损坏".to_string())?;
    let path = todo_path(&app, &todo_id)?;
    let _process_lock = crate::process_file_lock(&path)?;
    let staged = path.with_extension(format!("md.delete.{}.tmp", std::process::id()));
    if staged.exists() {
        return Err("删除 Quick Todo 失败：暂存文件已存在".to_string());
    }
    if path.exists() {
        std::fs::rename(&path, &staged)
            .map_err(|error| format!("暂存 Quick Todo 文件失败：{error}"))?;
    }
    let original = load_config()?;
    if let Err(error) = crate::update_config(|config| {
        let index = config
            .quick_todos
            .iter()
            .position(|todo| todo.id == todo_id)
            .ok_or_else(|| "Quick Todo 不存在，请刷新后重试".to_string())?;
        config.quick_todos.remove(index);
        config
            .quick_todo_window_states
            .retain(|state| state.todo_id != todo_id);
        Ok(())
    }) {
        if staged.exists() {
            let _ = std::fs::rename(&staged, &path);
        }
        return Err(format!("删除 Quick Todo 配置失败，已保留原文件：{error}"));
    }
    if staged.exists() {
        if let Err(error) = std::fs::remove_file(&staged) {
            let _ = crate::update_config(|config| {
                *config = original;
                Ok(())
            });
            let _ = std::fs::rename(&staged, &path);
            return Err(format!("删除 Quick Todo 文件失败，已尝试回滚：{error}"));
        }
    }
    if let Some(window) = app.get_webview_window(&format!("quick-todo-{todo_id}")) {
        let _ = window.close();
    }
    if let Some(window) = app.get_webview_window(&format!("quick-todo-reminder-{todo_id}")) {
        let _ = window.close();
    }
    let _ = app.emit(REGISTRY_CHANGED_EVENT, ());
    registry()
}

#[tauri::command]
pub fn quick_todo_list<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let _guard = lock()
        .lock()
        .map_err(|_| "Quick Todo 文件锁已损坏".to_string())?;
    let path = todo_path(&app, &todo_id)?;
    let _process_lock = crate::process_file_lock(&path)?;
    Ok(read_document(&path)?.items())
}

#[tauri::command]
pub fn quick_todo_add<R: Runtime>(
    app: tauri::AppHandle<R>,
    text: String,
    tag: Option<QuickTodoTag>,
    parent_id: Option<String>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    let now = Utc::now().to_rfc3339();
    let id = format!(
        "qt_{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let items = mutate_and_notify(
        &path,
        |document| {
            document.add(&text, &id, &now, tag, parent_id.as_deref())?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )?;
    Ok(items)
}

#[tauri::command]
pub fn quick_todo_edit<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    text: String,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    mutate_and_notify(
        &path,
        |document| {
            document.edit(&id, &text)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )
}

#[tauri::command]
pub fn quick_todo_set_tag<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    tag: Option<QuickTodoTag>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    mutate_and_notify(
        &path,
        |document| {
            document.set_tag(&id, tag)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )
}

#[tauri::command]
pub fn quick_todo_set_reminder<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    remind_at: Option<String>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    mutate_and_notify(
        &path,
        |document| {
            document.set_reminder(&id, remind_at)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )
}

#[tauri::command]
pub fn quick_todo_set_link<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    link: Option<QuickTodoLink>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    mutate_and_notify(
        &path,
        |document| {
            document.set_link(&id, link)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )
}

#[tauri::command]
pub fn quick_todo_toggle<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    let now = Utc::now().to_rfc3339();
    let items = mutate_and_notify(
        &path,
        |document| {
            document.toggle(&id, &now)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )?;
    Ok(items)
}

#[tauri::command]
pub fn quick_todo_delete<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    let items = mutate_and_notify(
        &path,
        |document| {
            document.delete(&id)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )?;
    Ok(items)
}

#[tauri::command]
pub fn quick_todo_reorder<R: Runtime>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    mutate_and_notify(
        &path,
        |document| {
            document.reorder(&ids)?;
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )
}

#[tauri::command]
pub fn quick_todo_clear_completed<R: Runtime>(
    app: tauri::AppHandle<R>,
    todo_id: String,
) -> Result<Vec<QuickTodoItem>, String> {
    let path = todo_path(&app, &todo_id)?;
    mutate_and_notify(
        &path,
        |document| {
            document.clear_completed();
            Ok(document.items())
        },
        || {
            app.emit(&changed_event(&todo_id), ())
                .map_err(|error| error.to_string())
        },
    )
}

#[cfg(test)]
mod tests {
    fn imported_work_line(id: &str, completed: bool) -> String {
        super::format_line(&super::QuickTodoItem {
            id: id.into(), text: "同步样例".into(), completed,
            created_at: "2026-10-13T12:00:00Z".into(),
            completed_at: completed.then(|| "2026-10-13T12:00:00Z".into()),
            tag: None, parent_id: None, remind_at: None, link: None,
            allnote_work: Some(super::AllnoteWorkMetadata { v: 1, project_id: "20 工作/样例".into(), project_name: "样例".into(),
                project_uri: "obsidian://open?vault=Allnote&file=20%20%E5%B7%A5%E4%BD%9C/样例/项目主页.md".into(),
                source_uri: "obsidian://open?vault=Allnote&file=20%20%E5%B7%A5%E4%BD%9C/样例/任务.md".into(), dates: vec!["截止 2026-10-20".into()], context: completed }),
        })
    }

    #[test]
    fn imported_metadata_round_trips_and_mutations_are_read_only() {
        let original = format!("# Quick Todo\n{}", imported_work_line("allnote_work_parent", true));
        let mut document = super::QuickTodoDocument::parse(&original);
        assert_eq!(document.items()[0].allnote_work.as_ref().unwrap().project_name, "样例");
        assert!(document.toggle("allnote_work_parent", "2026-10-13T13:00:00Z").is_err());
        assert!(document.edit("allnote_work_parent", "新内容").is_err());
        assert!(document.delete("allnote_work_parent").is_err());
        assert!(document.set_tag("allnote_work_parent", None).is_err());
        assert!(document.set_reminder("allnote_work_parent", None).is_err());
        assert!(document.set_link("allnote_work_parent", None).is_err());
        assert!(document.add("手工子项", "manual", "2026-10-13T12:00:00Z", None, Some("allnote_work_parent")).is_err());
        document.clear_completed();
        assert_eq!(document.render(), original);
    }

    #[test]
    fn manual_reorder_leaves_imported_context_and_source_bytes_unchanged() {
        let work = imported_work_line("allnote_work_parent", true);
        let mut document = super::QuickTodoDocument::parse(&format!("# Quick Todo\n- [ ] A <!-- quick-todo:id=a createdAt=2026-10-13T12:00:00Z -->\n{}- [ ] B <!-- quick-todo:id=b createdAt=2026-10-13T12:00:00Z -->\n", work));
        document.reorder(&["b".into(), "a".into()]).unwrap();
        assert_eq!(document.lines[2], work);
        assert!(document.lines[1].contains("id=b"));
        assert!(document.reorder(&["allnote_work_parent".into(), "b".into(), "a".into()]).is_err());
    }

    #[test]
    fn work_source_links_only_open_relative_allnote_work_notes() {
        assert!(super::validate_work_uri("obsidian://open?vault=Allnote&file=20%20%E5%B7%A5%E4%BD%9C/样例/任务.md").is_ok());
        for uri in ["https://example.com", "obsidian://open?vault=Other&file=20%20工作/任务.md", "obsidian://open?vault=Allnote&file=20%20工作/../任务.md", "obsidian://open?vault=Allnote&file=20%20工作/任务.md&action=delete"] {
            assert!(super::validate_work_uri(uri).is_err());
        }
    }
    use super::*;
    use std::fs;

    #[test]
    fn todo_names_are_trimmed_and_limited_to_six_characters() {
        assert_eq!(normalize_todo_name("  工作  ").unwrap(), "工作");
        assert!(normalize_todo_name("   ").is_err());
        assert!(normalize_todo_name("一二三四五六七").is_err());
    }

    fn fixture() -> &'static str {
        "# Quick Todo\n\n保留这段说明。\n\n- [ ] 第一项 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z -->\n- [x] 第二项 <!-- quick-todo:id=qt_2 createdAt=2026-07-10T00:00:00Z completedAt=2026-07-11T01:00:00Z -->\n- [ ] 损坏项 <!-- quick-todo:id= createdAt=bad -->\n\n尾注\n"
    }

    #[test]
    fn parses_only_managed_lines_and_preserves_unknown_markdown() {
        let document = QuickTodoDocument::parse(fixture());
        assert_eq!(document.items().len(), 2);
        assert_eq!(document.items()[0].id, "qt_1");
        assert!(!document.items()[0].completed);
        assert!(document.items()[1].completed);
        assert_eq!(document.render(), fixture());
    }

    #[test]
    fn toggle_and_delete_modify_only_the_target_line() {
        let mut document = QuickTodoDocument::parse(fixture());
        document.toggle("qt_1", "2026-07-11T02:00:00Z").unwrap();
        let toggled = document.render();
        assert!(toggled.contains("- [x] 第一项 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z completedAt=2026-07-11T02:00:00Z -->"));
        assert!(toggled.contains("- [ ] 损坏项 <!-- quick-todo:id= createdAt=bad -->"));
        document.delete("qt_2").unwrap();
        assert!(!document.render().contains("id=qt_2"));
        assert!(document.render().contains("尾注"));
    }

    #[test]
    fn parses_parent_id_and_keeps_legacy_items_as_top_level() {
        let input = concat!(
            "# Quick Todo\n",
            "- [ ] 父项目 <!-- quick-todo:id=qt_parent createdAt=2026-07-13T00:00:00Z -->\n",
            "- [ ] 子项目 <!-- quick-todo:id=qt_child createdAt=2026-07-13T00:01:00Z parentId=qt_parent -->\n",
        );
        let document = QuickTodoDocument::parse(input);
        assert_eq!(document.items()[0].parent_id, None);
        assert_eq!(document.items()[1].parent_id.as_deref(), Some("qt_parent"));
    }

    #[test]
    fn add_child_accepts_top_level_parent_and_rejects_grandchild() {
        let mut document = QuickTodoDocument::parse(fixture());
        document
            .add(
                "子项目",
                "qt_child",
                "2026-07-13T00:01:00Z",
                None,
                Some("qt_1"),
            )
            .unwrap();
        assert_eq!(document.items()[1].parent_id.as_deref(), Some("qt_1"));
        assert!(document
            .add(
                "孙项目",
                "qt_grandchild",
                "2026-07-13T00:02:00Z",
                None,
                Some("qt_child")
            )
            .is_err());
    }

    #[test]
    fn add_rejects_internal_html_marker() {
        let mut document = QuickTodoDocument::parse(DEFAULT_DOCUMENT);

        let result = document.add(
            "任务 <!-- quick-todo:id=evil createdAt=now -->",
            "qt_evil",
            "2026-07-11T00:00:00Z",
            None,
            None,
        );

        assert!(result.is_err());
    }

    #[test]
    fn toggling_parent_synchronizes_direct_children() {
        let input = concat!(
            "# Quick Todo\n",
            "- [ ] 父项目 <!-- quick-todo:id=qt_parent createdAt=2026-07-13T00:00:00Z -->\n",
            "- [ ] 子项目 <!-- quick-todo:id=qt_child createdAt=2026-07-13T00:01:00Z parentId=qt_parent -->\n",
        );
        let mut document = QuickTodoDocument::parse(input);
        document
            .toggle("qt_parent", "2026-07-13T00:03:00Z")
            .unwrap();
        assert!(document.items().iter().all(|item| item.completed));
        document
            .toggle("qt_parent", "2026-07-13T00:04:00Z")
            .unwrap();
        assert!(document.items().iter().all(|item| !item.completed));
    }

    #[test]
    fn deleting_parent_removes_direct_children_but_keeps_other_items() {
        let input = concat!(
            "# Quick Todo\n",
            "- [ ] 父项目 <!-- quick-todo:id=qt_parent createdAt=2026-07-13T00:00:00Z -->\n",
            "- [ ] 子项目 <!-- quick-todo:id=qt_child createdAt=2026-07-13T00:01:00Z parentId=qt_parent -->\n",
            "- [ ] 其他项目 <!-- quick-todo:id=qt_other createdAt=2026-07-13T00:02:00Z -->\n",
        );
        let mut document = QuickTodoDocument::parse(input);
        document.delete("qt_parent").unwrap();
        assert_eq!(
            document
                .items()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["qt_other"]
        );
    }

    #[test]
    fn edit_changes_only_the_target_text_and_preserves_metadata() {
        let mut document = QuickTodoDocument::parse(fixture());
        document.edit("qt_1", "  更新后的内容  ").unwrap();
        assert!(document.render().contains(
            "- [ ] 更新后的内容 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z -->"
        ));
        assert!(document.render().contains("- [x] 第二项 <!-- quick-todo:id=qt_2 createdAt=2026-07-10T00:00:00Z completedAt=2026-07-11T01:00:00Z -->"));
        assert!(document.edit("qt_1", "   ").is_err());
        assert!(document.edit("qt_1", "多行\n内容").is_err());
    }

    #[test]
    fn edit_rejects_internal_html_marker_but_preserves_markdown_and_unicode() {
        let mut document = QuickTodoDocument::parse(fixture());

        assert!(document
            .edit("qt_1", "更新 <!-- quick-todo:id=evil createdAt=now -->")
            .is_err());
        document.edit("qt_1", "**重点**：中文内容").unwrap();

        let reparsed = QuickTodoDocument::parse(&document.render());
        assert_eq!(reparsed.items()[0].text, "**重点**：中文内容");
    }

    #[test]
    fn clear_completed_removes_only_completed_managed_lines() {
        let input = concat!(
            "# Quick Todo\n",
            "说明保留\n",
            "- [ ] 未完成 <!-- quick-todo:id=qt_active createdAt=2026-07-11T00:00:00Z -->\n",
            "- [x] 已完成 <!-- quick-todo:id=qt_done createdAt=2026-07-11T01:00:00Z completedAt=2026-07-11T02:00:00Z -->\n",
            "- [x] 损坏项 <!-- quick-todo:id= createdAt=bad -->\n",
            "尾注\n",
        );
        let mut document = QuickTodoDocument::parse(input);

        document.clear_completed();

        assert_eq!(
            document
                .items()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["qt_active"]
        );
        assert!(document.render().contains("说明保留"));
        assert!(document.render().contains("id=qt_active"));
        assert!(!document.render().contains("id=qt_done"));
        assert!(document.render().contains("损坏项"));
        assert!(document.render().contains("尾注"));
    }

    #[test]
    fn clear_completed_leaves_document_unchanged_without_completed_items() {
        let input = "# Quick Todo\n- [ ] 未完成 <!-- quick-todo:id=qt_active createdAt=2026-07-11T00:00:00Z -->\n";
        let mut document = QuickTodoDocument::parse(input);

        document.clear_completed();

        assert_eq!(document.render(), input);
    }

    #[test]
    fn duplicate_ids_are_left_unmanaged() {
        let input = "# Quick Todo\n\n- [ ] A <!-- quick-todo:id=same createdAt=2026-07-11T00:00:00Z -->\n- [ ] B <!-- quick-todo:id=same createdAt=2026-07-11T01:00:00Z -->\n";
        let document = QuickTodoDocument::parse(input);
        assert!(document.items().is_empty());
        assert_eq!(document.render(), input);
    }

    #[test]
    fn parses_optional_known_tags_and_keeps_legacy_lines_compatible() {
        let input = concat!(
            "# Quick Todo\n",
            "- [ ] 无标签 <!-- quick-todo:id=qt_0 createdAt=2026-07-11T00:00:00Z -->\n",
            "- [ ] 重要 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z tag=important -->\n",
            "- [ ] 等待 <!-- quick-todo:id=qt_2 createdAt=2026-07-11T00:00:00Z tag=waiting -->\n",
            "- [ ] 下一步 <!-- quick-todo:id=qt_3 createdAt=2026-07-11T00:00:00Z tag=next -->\n",
            "- [ ] 想法 <!-- quick-todo:id=qt_4 createdAt=2026-07-11T00:00:00Z tag=idea -->\n",
            "- [ ] 紧急 <!-- quick-todo:id=qt_5 createdAt=2026-07-11T00:00:00Z tag=urgent -->\n",
            "- [ ] 重要紧急 <!-- quick-todo:id=qt_6 createdAt=2026-07-11T00:00:00Z tag=important_urgent -->\n",
        );
        let items = QuickTodoDocument::parse(input).items();
        assert_eq!(items[0].tag, None);
        assert_eq!(items[1].tag, Some(QuickTodoTag::Important));
        assert_eq!(items[2].tag, Some(QuickTodoTag::Waiting));
        assert_eq!(items[3].tag, Some(QuickTodoTag::Next));
        assert_eq!(items[4].tag, Some(QuickTodoTag::Idea));
        assert_eq!(items[5].tag, Some(QuickTodoTag::Urgent));
        assert_eq!(items[6].tag, Some(QuickTodoTag::ImportantUrgent));
    }

    #[test]
    fn important_urgent_tag_uses_stable_wire_value() {
        assert_eq!(serde_json::to_string(&QuickTodoTag::ImportantUrgent).unwrap(), "\"important_urgent\"");
        assert_eq!(serde_json::to_string(&QuickTodoTag::Urgent).unwrap(), "\"urgent\"");
    }

    #[test]
    fn reminder_metadata_round_trips_and_can_be_cleared() {
        let input = "# Quick Todo\n- [ ] 提醒我 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z remindAt=2099-07-14T14:30:00Z -->\n";
        let mut document = QuickTodoDocument::parse(input);
        assert_eq!(
            document.items()[0].remind_at.as_deref(),
            Some("2099-07-14T14:30:00Z")
        );
        document
            .set_reminder("qt_1", Some("2100-07-15T14:30:00Z".into()))
            .unwrap();
        assert!(document.render().contains("remindAt=2100-07-15T14:30:00Z"));
        document.set_reminder("qt_1", None).unwrap();
        assert!(!document.render().contains("remindAt="));
    }

    #[test]
    fn link_metadata_round_trips_and_can_be_cleared() {
        let input = "# Quick Todo\n- [ ] 打开项目说明 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z link=default%2F%E9%A1%B9%E7%9B%AE%E8%AF%B4%E6%98%8E.md -->\n";
        let mut document = QuickTodoDocument::parse(input);
        assert_eq!(
            document.items()[0].link,
            Some(QuickTodoLink {
                zone: "default".into(),
                name: "项目说明.md".into()
            })
        );
        document
            .set_link(
                "qt_1",
                Some(QuickTodoLink {
                    zone: "folder:work".into(),
                    name: "开发 计划.md".into(),
                }),
            )
            .unwrap();
        assert!(document.render().contains("link="));
        assert_eq!(
            QuickTodoDocument::parse(&document.render()).items()[0].link,
            Some(QuickTodoLink {
                zone: "folder:work".into(),
                name: "开发 计划.md".into()
            })
        );
        document.set_link("qt_1", None).unwrap();
        assert!(!document.render().contains("link="));
    }

    #[test]
    fn unknown_tag_degrades_to_none_without_rewriting_source() {
        let input = "# Quick Todo\n- [ ] 保留 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z tag=future -->\n\n未知内容\n";
        let document = QuickTodoDocument::parse(input);
        assert_eq!(document.items()[0].tag, None);
        assert_eq!(document.render(), input);
    }

    #[test]
    fn unknown_tag_is_removed_when_the_target_is_managed() {
        let input = "# Quick Todo\n- [ ] 保留 <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z tag=future -->\n";

        let mut retagged = QuickTodoDocument::parse(input);
        assert_eq!(retagged.render(), input);
        retagged
            .set_tag("qt_1", Some(QuickTodoTag::Important))
            .unwrap();
        assert!(retagged.render().contains("tag=important"));
        assert!(!retagged.render().contains("tag=future"));

        let mut toggled = QuickTodoDocument::parse(input);
        assert_eq!(toggled.render(), input);
        toggled.toggle("qt_1", "2026-07-11T01:00:00Z").unwrap();
        assert!(toggled
            .render()
            .contains("completedAt=2026-07-11T01:00:00Z"));
        assert!(!toggled.render().contains("tag="));
    }

    #[test]
    fn toggle_preserves_tag_and_set_tag_only_rewrites_target() {
        let input = concat!(
            "# Quick Todo\n",
            "- [ ] A <!-- quick-todo:id=qt_1 createdAt=2026-07-11T00:00:00Z tag=important -->\n",
            "- [ ] B <!-- quick-todo:id=qt_2 createdAt=2026-07-11T00:00:00Z tag=idea -->\n",
            "原样保留\n",
        );
        let mut document = QuickTodoDocument::parse(input);
        document.toggle("qt_1", "2026-07-11T02:00:00Z").unwrap();
        assert!(document
            .render()
            .contains("completedAt=2026-07-11T02:00:00Z tag=important"));
        document
            .set_tag("qt_1", Some(QuickTodoTag::Waiting))
            .unwrap();
        assert!(document.render().contains(
            "id=qt_1 createdAt=2026-07-11T00:00:00Z completedAt=2026-07-11T02:00:00Z tag=waiting"
        ));
        assert!(document
            .render()
            .contains("id=qt_2 createdAt=2026-07-11T00:00:00Z tag=idea"));
        document.set_tag("qt_1", None).unwrap();
        assert!(!document.lines[1].contains("tag="));
        assert_eq!(
            document.lines[2],
            "- [ ] B <!-- quick-todo:id=qt_2 createdAt=2026-07-11T00:00:00Z tag=idea -->\n"
        );
        assert!(document.render().contains("原样保留"));
    }

    #[test]
    fn add_serializes_an_optional_tag() {
        let mut tagged = QuickTodoDocument::parse(DEFAULT_DOCUMENT);
        tagged
            .add(
                "A",
                "qt_a",
                "2026-07-11T00:00:00Z",
                Some(QuickTodoTag::Next),
                None,
            )
            .unwrap();
        assert!(tagged
            .render()
            .contains("createdAt=2026-07-11T00:00:00Z tag=next"));
        let mut plain = QuickTodoDocument::parse(DEFAULT_DOCUMENT);
        plain
            .add("B", "qt_b", "2026-07-11T00:00:00Z", None, None)
            .unwrap();
        assert!(!plain.render().contains("tag="));
    }

    #[test]
    fn add_inserts_new_todo_before_existing_managed_lines() {
        let input = concat!(
            "# Quick Todo\n",
            "说明保留在受管列表之前\n",
            "- [ ] 旧事项 <!-- quick-todo:id=qt_old createdAt=2026-07-11T00:00:00Z -->\n",
        );
        let mut document = QuickTodoDocument::parse(input);

        document
            .add("新事项", "qt_new", "2026-07-11T01:00:00Z", None, None)
            .unwrap();

        let items = document.items();
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["qt_new", "qt_old"]
        );
        assert!(document.lines[2].contains("id=qt_new"));
        assert!(document.lines[3].contains("id=qt_old"));
        assert!(document.render().contains("说明保留在受管列表之前"));
    }

    #[test]
    fn reorder_moves_managed_items_between_existing_slots() {
        let mut document = QuickTodoDocument::parse(fixture());
        document.reorder(&["qt_2".into(), "qt_1".into()]).unwrap();
        let items = document.items();
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["qt_2", "qt_1"]
        );
        assert!(document.lines[4].contains("id=qt_2"));
        assert!(document.lines[5].contains("id=qt_1"));
    }

    #[test]
    fn reorder_preserves_raw_markdown_content_and_slots() {
        let input = concat!(
            "# Quick Todo\n",
            "- [ ] A <!-- quick-todo:id=qt_a createdAt=2026-07-11T00:00:00Z -->\n",
            "原样保留在中间\n",
            "- [ ] B <!-- quick-todo:id=qt_b createdAt=2026-07-11T01:00:00Z -->\n",
            "尾注\n",
        );
        let mut document = QuickTodoDocument::parse(input);
        document.reorder(&["qt_b".into(), "qt_a".into()]).unwrap();
        assert_eq!(document.lines[0], "# Quick Todo\n");
        assert_eq!(document.lines[2], "原样保留在中间\n");
        assert_eq!(document.lines[4], "尾注\n");
        assert!(document.lines[1].contains("id=qt_b"));
        assert!(document.lines[3].contains("id=qt_a"));
    }

    #[test]
    fn reorder_rejects_duplicate_ids() {
        let mut document = QuickTodoDocument::parse(fixture());
        assert!(document.reorder(&["qt_1".into(), "qt_1".into()]).is_err());
        assert_eq!(document.render(), fixture());
    }

    #[test]
    fn reorder_rejects_missing_ids() {
        let mut document = QuickTodoDocument::parse(fixture());
        assert!(document.reorder(&["qt_1".into()]).is_err());
        assert_eq!(document.render(), fixture());
    }

    #[test]
    fn reorder_rejects_unknown_ids() {
        let mut document = QuickTodoDocument::parse(fixture());
        assert!(document
            .reorder(&["qt_1".into(), "qt_unknown".into()])
            .is_err());
        assert_eq!(document.render(), fixture());
    }

    #[test]
    fn reorder_accepts_empty_ids_for_document_without_managed_todos() {
        let input = "# Quick Todo\n\n只有说明\n";
        let mut document = QuickTodoDocument::parse(input);
        document.reorder(&[]).unwrap();
        assert_eq!(document.render(), input);
        assert!(document.items().is_empty());
    }

    #[test]
    fn locked_file_operations_reread_latest_content() {
        let root = std::env::temp_dir().join(format!("mknote-quick-todo-{}", std::process::id()));
        let path = root.join("Quick Todo.md");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        mutate_file(&path, |document| {
            document.add("A", "qt_a", "2026-07-11T00:00:00Z", None, None)
        })
        .unwrap();
        fs::write(
            &path,
            format!("{}\n手工追加\n", fs::read_to_string(&path).unwrap()),
        )
        .unwrap();
        mutate_file(&path, |document| {
            document.add("B", "qt_b", "2026-07-11T01:00:00Z", None, None)
        })
        .unwrap();
        let saved = fs::read_to_string(&path).unwrap();
        assert!(saved.contains("手工追加"));
        assert!(saved.contains("id=qt_a"));
        assert!(saved.contains("id=qt_b"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn first_read_creates_document_with_heading_and_empty_file_is_repaired() {
        let root =
            std::env::temp_dir().join(format!("mknote-quick-todo-create-{}", std::process::id()));
        let path = root.join("Quick Todo.md");
        let _ = fs::remove_dir_all(&root);
        let document = read_document(&path).unwrap();
        assert!(document.items().is_empty());
        assert_eq!(fs::read_to_string(&path).unwrap(), DEFAULT_DOCUMENT);
        fs::write(&path, "").unwrap();
        let _ = read_document(&path).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), DEFAULT_DOCUMENT);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn committed_write_succeeds_even_when_notification_fails() {
        let root =
            std::env::temp_dir().join(format!("mknote-quick-todo-notify-{}", std::process::id()));
        let path = root.join("Quick Todo.md");
        let _ = fs::remove_dir_all(&root);
        let result = mutate_and_notify(
            &path,
            |document| document.add("A", "qt_a", "2026-07-11T00:00:00Z", None, None),
            || Err("event bus down".into()),
        );
        assert!(result.is_ok());
        assert!(fs::read_to_string(&path).unwrap().contains("id=qt_a"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_write_does_not_notify() {
        let root =
            std::env::temp_dir().join(format!("mknote-quick-todo-fail-{}", std::process::id()));
        let path = root.join("Quick Todo.md");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&path).unwrap();
        let notified = std::cell::Cell::new(false);
        let result = mutate_and_notify(
            &path,
            |_| Ok(()),
            || {
                notified.set(true);
                Ok(())
            },
        );
        assert!(result.is_err());
        assert!(!notified.get());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn temp_paths_are_unique_within_one_process() {
        let path = PathBuf::from("Quick Todo.md");
        assert_ne!(temp_path(&path), temp_path(&path));
    }
}
