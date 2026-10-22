use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Runtime};

use crate::{load_config, QuickPocketDefinition};

const DEFAULT_DOCUMENT: &str = "# Quick Pocket\n\n";
const CHANGED_EVENT: &str = "mknote:quick-pocket-changed";
pub const DEFAULT_QUICK_POCKET_ID: &str = "default";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuickPocketTag {
    Text,
    Command,
    Path,
    Private,
}

impl QuickPocketTag {
    fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Command => "command",
            Self::Path => "path",
            Self::Private => "private",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "text" => Some(Self::Text),
            "command" => Some(Self::Command),
            "path" => Some(Self::Path),
            "private" => Some(Self::Private),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPocketItem {
    pub id: String,
    pub title: String,
    pub body: String,
    pub tag: Option<QuickPocketTag>,
    pub group_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPocketGroup {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPocketSnapshot {
    pub items: Vec<QuickPocketItem>,
    pub groups: Vec<QuickPocketGroup>,
}

#[derive(Clone, Debug)]
struct ManagedBlock {
    item: QuickPocketItem,
    start: usize,
    end: usize,
}

#[derive(Clone, Debug)]
struct QuickPocketDocument {
    lines: Vec<String>,
    managed: Vec<ManagedBlock>,
    groups: Vec<QuickPocketGroup>,
}

fn block_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^<!-- quick-pocket:id=([^ ]+)(?: tag=([^ ]+))?(?: group=([^ ]+))? -->\r?\n?$")
            .unwrap()
    })
}

fn group_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^<!-- quick-pocket-group:id=([^ ]+) name=([^ ]+) -->\r?\n?$").unwrap()
    })
}

fn line_text(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

fn split_lines(input: &str) -> Vec<String> {
    let mut lines: Vec<String> = input
        .split_inclusive('\n')
        .map(ToString::to_string)
        .collect();
    if lines.is_empty() && !input.is_empty() {
        lines.push(input.to_string());
    }
    lines
}

impl QuickPocketDocument {
    fn parse(input: &str) -> Self {
        let lines = split_lines(input);
        let mut managed = Vec::new();
        let mut groups = Vec::new();
        let mut index = 0;
        while index < lines.len() {
            if let Some(caps) = group_regex().captures(&lines[index]) {
                if let Ok(name_bytes) = BASE64.decode(caps[2].as_bytes()) {
                    if let Ok(name) = String::from_utf8(name_bytes) {
                        groups.push(QuickPocketGroup {
                            id: caps[1].to_string(),
                            name,
                        });
                    }
                }
                index += 1;
                continue;
            }
            let Some(caps) = block_regex().captures(&lines[index]) else {
                index += 1;
                continue;
            };
            let Some(end) = lines[index + 1..]
                .iter()
                .position(|line| line_text(line) == "<!-- /quick-pocket -->")
            else {
                index += 1;
                continue;
            };
            let end = index + 1 + end;
            if end <= index + 1 {
                index = end + 1;
                continue;
            }
            let id = caps[1].to_string();
            let tag = caps
                .get(2)
                .and_then(|value| QuickPocketTag::parse(value.as_str()));
            let group_id = caps.get(3).map(|value| value.as_str().to_string());
            let title = line_text(&lines[index + 1]).to_string();
            let body = lines[index + 2..end]
                .iter()
                .map(|line| line_text(line))
                .collect::<Vec<_>>()
                .join("\n");
            managed.push(ManagedBlock {
                item: QuickPocketItem {
                    id,
                    title,
                    body,
                    tag,
                    group_id,
                },
                start: index,
                end,
            });
            index = end + 1;
        }
        Self {
            lines,
            managed,
            groups,
        }
    }

    fn snapshot(&self) -> QuickPocketSnapshot {
        let valid_group_ids: HashSet<&str> =
            self.groups.iter().map(|group| group.id.as_str()).collect();
        let items = self
            .managed
            .iter()
            .map(|block| {
                let mut item = block.item.clone();
                if item
                    .group_id
                    .as_deref()
                    .is_some_and(|id| !valid_group_ids.contains(id))
                {
                    item.group_id = None;
                }
                item
            })
            .collect();
        QuickPocketSnapshot {
            items,
            groups: self.groups.clone(),
        }
    }

    fn items(&self) -> Vec<QuickPocketItem> {
        self.managed
            .iter()
            .map(|block| block.item.clone())
            .collect()
    }

    fn render(&self) -> String {
        self.lines.concat()
    }

    fn add(
        &mut self,
        title: &str,
        body: &str,
        tag: Option<QuickPocketTag>,
        group_id: Option<&str>,
        id: &str,
    ) -> Result<(), String> {
        if title.trim().is_empty() && body.trim().is_empty() {
            return Err("Quick Pocket 标题和内文不能同时为空".into());
        }
        self.validate_group_id(group_id)?;
        let title = normalize_title(title);
        let block = format_block(&QuickPocketItem {
            id: id.to_string(),
            title: title.to_string(),
            body: body.to_string(),
            tag,
            group_id: group_id.map(ToString::to_string),
        });
        let position = self
            .managed
            .first()
            .map(|block| block.start)
            .unwrap_or(self.lines.len());
        self.lines.splice(position..position, block);
        *self = Self::parse(&self.render());
        Ok(())
    }

    fn update(
        &mut self,
        id: &str,
        title: &str,
        body: &str,
        tag: Option<QuickPocketTag>,
    ) -> Result<(), String> {
        if title.trim().is_empty() && body.trim().is_empty() {
            return Err("Quick Pocket 标题和内文不能同时为空".into());
        }
        let block = self
            .managed
            .iter()
            .find(|block| block.item.id == id)
            .cloned()
            .ok_or_else(|| "Quick Pocket 条目不存在，请刷新后重试".to_string())?;
        let title = normalize_title(title);
        let replacement = format_block(&QuickPocketItem {
            id: id.to_string(),
            title: title.to_string(),
            body: body.to_string(),
            tag,
            group_id: block.item.group_id,
        });
        self.lines.splice(block.start..=block.end, replacement);
        *self = Self::parse(&self.render());
        Ok(())
    }

    fn delete(&mut self, id: &str) -> Result<(), String> {
        let block = self
            .managed
            .iter()
            .find(|block| block.item.id == id)
            .cloned()
            .ok_or_else(|| "Quick Pocket 条目不存在，请刷新后重试".to_string())?;
        self.lines.drain(block.start..=block.end);
        *self = Self::parse(&self.render());
        self.normalize_groups();
        Ok(())
    }

    fn validate_group_id(&self, group_id: Option<&str>) -> Result<(), String> {
        if let Some(group_id) = group_id {
            if !self.groups.iter().any(|group| group.id == group_id) {
                return Err("Quick Pocket 分组不存在，请刷新后重试".into());
            }
        }
        Ok(())
    }

    fn create_group(&mut self, ids: &[String], name: &str, id: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Quick Pocket 分组名不能为空".into());
        }
        if ids.len() < 2 || ids.iter().collect::<HashSet<_>>().len() != ids.len() {
            return Err("Quick Pocket 分组至少需要两个不同条目".into());
        }
        if self.groups.iter().any(|group| group.id == id) {
            return Err("Quick Pocket 分组 ID 已存在".into());
        }
        let blocks: Vec<ManagedBlock> = ids
            .iter()
            .map(|item_id| {
                self.managed
                    .iter()
                    .find(|block| block.item.id == *item_id)
                    .cloned()
                    .ok_or_else(|| "Quick Pocket 条目不存在，请刷新后重试".to_string())
            })
            .collect::<Result<_, _>>()?;
        if blocks.iter().any(|block| block.item.group_id.is_some()) {
            return Err("已有分组的条目不能直接创建新分组".into());
        }
        self.groups.push(QuickPocketGroup {
            id: id.to_string(),
            name: name.to_string(),
        });
        for item_id in ids {
            if let Some(block) = self
                .managed
                .iter_mut()
                .find(|block| block.item.id == *item_id)
            {
                block.item.group_id = Some(id.to_string());
            }
        }
        self.rewrite_managed_blocks();
        Ok(())
    }

    fn rename_group(&mut self, id: &str, name: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Quick Pocket 分组名不能为空".into());
        }
        let group = self
            .groups
            .iter_mut()
            .find(|group| group.id == id)
            .ok_or_else(|| "Quick Pocket 分组不存在，请刷新后重试".to_string())?;
        group.name = name.to_string();
        self.rewrite_managed_blocks();
        Ok(())
    }

    fn dissolve_group(&mut self, id: &str) -> Result<(), String> {
        if !self.groups.iter().any(|group| group.id == id) {
            return Err("Quick Pocket 分组不存在，请刷新后重试".into());
        }
        self.groups.retain(|group| group.id != id);
        for block in &mut self.managed {
            if block.item.group_id.as_deref() == Some(id) {
                block.item.group_id = None;
            }
        }
        self.rewrite_managed_blocks();
        Ok(())
    }

    fn move_item(
        &mut self,
        id: &str,
        group_id: Option<&str>,
        ids: &[String],
    ) -> Result<(), String> {
        self.validate_group_id(group_id)?;
        let current: Vec<String> = self
            .managed
            .iter()
            .map(|block| block.item.id.clone())
            .collect();
        if current.len() != ids.len()
            || current.iter().collect::<HashSet<_>>() != ids.iter().collect::<HashSet<_>>()
        {
            return Err("移动请求与当前 Quick Pocket 条目不一致，请刷新后重试".into());
        }
        let item = self
            .managed
            .iter_mut()
            .find(|block| block.item.id == id)
            .ok_or_else(|| "Quick Pocket 条目不存在，请刷新后重试".to_string())?;
        item.item.group_id = group_id.map(ToString::to_string);
        self.reorder(ids)?;
        self.normalize_groups();
        Ok(())
    }

    fn normalize_groups(&mut self) {
        let counts: HashMap<String, usize> = self
            .managed
            .iter()
            .filter_map(|block| block.item.group_id.clone())
            .fold(HashMap::new(), |mut counts, group_id| {
                *counts.entry(group_id).or_default() += 1;
                counts
            });
        let valid: HashSet<String> = counts
            .into_iter()
            .filter_map(|(id, count)| (count >= 2).then_some(id))
            .collect();
        self.groups.retain(|group| valid.contains(&group.id));
        for block in &mut self.managed {
            if block
                .item
                .group_id
                .as_ref()
                .is_some_and(|id| !valid.contains(id))
            {
                block.item.group_id = None;
            }
        }
        self.rewrite_managed_blocks();
    }

    fn rewrite_managed_blocks(&mut self) {
        let blocks: HashMap<String, Vec<String>> = self
            .managed
            .iter()
            .map(|block| (block.item.id.clone(), format_block(&block.item)))
            .collect();
        for block in self.managed.iter().rev() {
            self.lines
                .splice(block.start..=block.end, blocks[&block.item.id].clone());
        }
        self.lines.retain(|line| !group_regex().is_match(line));
        let group_lines = self
            .groups
            .iter()
            .map(format_group)
            .flatten()
            .collect::<Vec<_>>();
        let position = self
            .lines
            .iter()
            .position(|line| group_regex().is_match(line) || block_regex().is_match(line))
            .unwrap_or(self.lines.len());
        self.lines.splice(position..position, group_lines);
        *self = Self::parse(&self.render());
    }

    fn reorder(&mut self, ids: &[String]) -> Result<(), String> {
        let current: Vec<String> = self
            .managed
            .iter()
            .map(|block| block.item.id.clone())
            .collect();
        if current.len() != ids.len()
            || current.iter().collect::<HashSet<_>>() != ids.iter().collect::<HashSet<_>>()
        {
            return Err("排序请求与当前 Quick Pocket 条目不一致，请刷新后重试".into());
        }
        let blocks: HashMap<&str, Vec<String>> = self
            .managed
            .iter()
            .map(|block| (&*block.item.id, format_block(&block.item)))
            .collect();
        let slots: Vec<(usize, usize)> = self
            .managed
            .iter()
            .map(|block| (block.start, block.end))
            .collect();
        for ((start, end), id) in slots.into_iter().zip(ids.iter()).rev() {
            self.lines.splice(start..=end, blocks[id.as_str()].clone());
        }
        *self = Self::parse(&self.render());
        Ok(())
    }
}

fn normalize_title(title: &str) -> String {
    let title = title.trim();
    if title.is_empty() {
        "无标题".to_string()
    } else {
        title.to_string()
    }
}

fn format_block(item: &QuickPocketItem) -> Vec<String> {
    let tag = item
        .tag
        .map(|tag| format!(" tag={}", tag.as_str()))
        .unwrap_or_default();
    let group = item
        .group_id
        .as_deref()
        .map(|group_id| format!(" group={group_id}"))
        .unwrap_or_default();
    let mut lines = vec![
        format!("<!-- quick-pocket:id={}{}{} -->\n", item.id, tag, group),
        format!("{}\n", item.title),
    ];
    if !item.body.is_empty() {
        lines.extend(item.body.split_inclusive('\n').map(|line| {
            if line.ends_with('\n') {
                line.to_string()
            } else {
                format!("{line}\n")
            }
        }));
    }
    lines.push("<!-- /quick-pocket -->\n".to_string());
    lines
}

fn format_group(group: &QuickPocketGroup) -> Vec<String> {
    vec![format!(
        "<!-- quick-pocket-group:id={} name={} -->\n",
        group.id,
        BASE64.encode(group.name.as_bytes())
    )]
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

fn delete_stage_path(path: &Path) -> PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    path.with_extension(format!(
        "md.delete-{}-{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn new_pocket_id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "p_{}-{}-{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
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
    .map_err(|error| format!("替换 Quick Pocket 文件失败：{error}"))
}

#[cfg(not(windows))]
fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    std::fs::rename(temp, target).map_err(|error| format!("替换 Quick Pocket 文件失败：{error}"))
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Quick Pocket 目录失败：{error}"))?;
    }
    let temp = temp_path(path);
    let result = (|| {
        let mut file = std::fs::File::create(&temp)
            .map_err(|error| format!("创建 Quick Pocket 临时文件失败：{error}"))?;
        file.write_all(content.as_bytes())
            .map_err(|error| format!("写入 Quick Pocket 临时文件失败：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步 Quick Pocket 临时文件失败：{error}"))
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    replace_file(&temp, path).map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        error
    })
}

fn read_document(path: &Path) -> Result<QuickPocketDocument, String> {
    if !path.exists()
        || std::fs::metadata(path)
            .map(|metadata| metadata.len() == 0)
            .unwrap_or(false)
    {
        atomic_write(path, DEFAULT_DOCUMENT)?;
    }
    std::fs::read_to_string(path)
        .map(|text| QuickPocketDocument::parse(&text))
        .map_err(|error| format!("读取 Quick Pocket 失败：{error}"))
}

fn mutate_file<T>(
    path: &Path,
    transform: impl FnOnce(&mut QuickPocketDocument) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = lock()
        .lock()
        .map_err(|_| "Quick Pocket 文件锁已损坏".to_string())?;
    let _process_lock = crate::process_file_lock(path)?;
    let mut document = read_document(path)?;
    let result = transform(&mut document)?;
    atomic_write(path, &document.render())?;
    Ok(result)
}

fn mutate_and_notify<T, R: Runtime>(
    app: &tauri::AppHandle<R>,
    path: &Path,
    transform: impl FnOnce(&mut QuickPocketDocument) -> Result<T, String>,
) -> Result<T, String> {
    let result = mutate_file(path, transform)?;
    if let Err(error) = app.emit(CHANGED_EVENT, ()) {
        eprintln!("Quick Pocket 已写入，但变化事件广播失败：{error}");
    }
    Ok(result)
}

fn pocket_definition<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    pocket_id: &str,
) -> Result<QuickPocketDefinition, String> {
    if pocket_id == DEFAULT_QUICK_POCKET_ID {
        return Ok(QuickPocketDefinition {
            id: DEFAULT_QUICK_POCKET_ID.to_string(),
            name: "Quick Pocket".to_string(),
        });
    }
    load_config()?
        .quick_pockets
        .into_iter()
        .find(|pocket| pocket.id == pocket_id)
        .ok_or_else(|| "Quick Pocket 不存在，请刷新后重试".to_string())
}

fn pocket_path<R: Runtime>(app: &tauri::AppHandle<R>, pocket_id: &str) -> Result<PathBuf, String> {
    let path = crate::quick_data::directories(app)?.pocket_path(pocket_id)?;
    if pocket_id != DEFAULT_QUICK_POCKET_ID {
        pocket_definition(app, pocket_id)?;
    }
    Ok(path)
}

fn stage_pocket_file_for_delete(path: &Path) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let staged = delete_stage_path(path);
    if staged.exists() {
        return Err("删除 Quick Pocket 失败：临时文件已存在".into());
    }
    std::fs::rename(path, &staged)
        .map_err(|error| format!("暂存 Quick Pocket 文件失败：{error}"))?;
    Ok(Some(staged))
}

fn restore_staged_pocket_file(staged: &Path, path: &Path) -> Result<(), String> {
    std::fs::rename(staged, path).map_err(|error| format!("恢复 Quick Pocket 文件失败：{error}"))
}

fn changed_event(pocket_id: &str) -> String {
    format!("{CHANGED_EVENT}:{pocket_id}")
}

fn mutate_and_notify_for_pocket<T, R: Runtime>(
    app: &tauri::AppHandle<R>,
    path: &Path,
    pocket_id: &str,
    transform: impl FnOnce(&mut QuickPocketDocument) -> Result<T, String>,
) -> Result<T, String> {
    let result = mutate_file(path, transform)?;
    if let Err(error) = app.emit(&changed_event(pocket_id), ()) {
        eprintln!("Quick Pocket 已写入，但变化事件广播失败：{error}");
    }
    Ok(result)
}

#[tauri::command]
pub fn quick_pocket_registry_list() -> Result<Vec<QuickPocketDefinition>, String> {
    let mut pockets = vec![QuickPocketDefinition {
        id: DEFAULT_QUICK_POCKET_ID.to_string(),
        name: "Quick Pocket".to_string(),
    }];
    let config = load_config()?;
    for pocket in config.quick_pockets {
        if pocket.id != DEFAULT_QUICK_POCKET_ID
            && !pockets.iter().any(|current| current.id == pocket.id)
        {
            pockets.push(pocket);
        }
    }
    Ok(pockets)
}

#[tauri::command]
pub fn quick_pocket_create<R: Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
) -> Result<QuickPocketDefinition, String> {
    let name = normalize_pocket_name(&name)?;
    let id = new_pocket_id();
    let pocket = QuickPocketDefinition {
        id: id.clone(),
        name,
    };
    let path = crate::quick_data::directories(&app)?.pocket_path(&id)?;
    let _process_lock = crate::process_file_lock(&path)?;
    if path.exists() {
        return Err("创建 Quick Pocket 失败：目标文件已存在".to_string());
    }
    atomic_write(&path, DEFAULT_DOCUMENT)?;
    if let Err(error) = crate::update_config(|config| {
        config.quick_pockets.push(pocket.clone());
        Ok(())
    }) {
        return match std::fs::remove_file(&path) {
            Ok(()) => Err(format!("保存 Quick Pocket 配置失败，已删除新建文件：{error}")),
            Err(rollback_error) => Err(format!(
                "保存 Quick Pocket 配置失败，删除新建文件也失败：{error}；{rollback_error}"
            )),
        };
    }
    Ok(pocket)
}

fn normalize_pocket_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Quick Pocket 名称不能为空".to_string());
    }
    if name.chars().count() > 6 {
        return Err("Quick Pocket 名称不能超过 6 个字符".to_string());
    }
    Ok(name.to_string())
}

#[tauri::command]
pub fn quick_pocket_rename(
    pocket_id: String,
    name: String,
) -> Result<QuickPocketDefinition, String> {
    if pocket_id == DEFAULT_QUICK_POCKET_ID {
        return Err("默认 Quick Pocket 不允许重命名".to_string());
    }
    let name = normalize_pocket_name(&name)?;
    let mut result = None;
    crate::update_config(|config| {
        let pocket = config
            .quick_pockets
            .iter_mut()
            .find(|pocket| pocket.id == pocket_id)
            .ok_or_else(|| "Quick Pocket 不存在，请刷新后重试".to_string())?;
        pocket.name = name;
        result = Some(pocket.clone());
        Ok(())
    })?;
    result.ok_or_else(|| "Quick Pocket 重命名失败".to_string())
}

#[tauri::command]
pub fn quick_pocket_delete_pocket<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
) -> Result<Vec<QuickPocketDefinition>, String> {
    if pocket_id == DEFAULT_QUICK_POCKET_ID {
        return Err("默认 Quick Pocket 不允许删除".to_string());
    }
    let _guard = lock()
        .lock()
        .map_err(|_| "Quick Pocket 文件锁已损坏".to_string())?;
    let path = pocket_path(&app, &pocket_id)?;
    let _process_lock = crate::process_file_lock(&path)?;
    let mut staged = None;
    let mut original_config = None;
    let updated_config = match crate::update_config(|config| {
        let index = config
            .quick_pockets
            .iter()
            .position(|pocket| pocket.id == pocket_id)
            .ok_or_else(|| "Quick Pocket 不存在，请刷新后重试".to_string())?;
        staged = stage_pocket_file_for_delete(&path)?;
        original_config = Some(config.clone());
        config.quick_pockets.remove(index);
        config
            .quick_pocket_window_states
            .retain(|state| state.pocket_id != pocket_id);
        Ok(())
    }) {
        Ok(config) => config,
        Err(error) => {
            if let Some(staged_path) = staged.as_deref() {
                let _ = restore_staged_pocket_file(staged_path, &path);
            }
            return Err(format!("删除 Quick Pocket 配置失败，已保留原文件：{error}"));
        }
    };
    if let Some(staged_path) = staged.as_deref() {
        if let Err(delete_error) = std::fs::remove_file(staged_path) {
            let config_error = original_config
                .map(|original| {
                    crate::update_config(|config| {
                        *config = original;
                        Ok(())
                    })
                    .err()
                })
                .flatten();
            let restore_error = restore_staged_pocket_file(staged_path, &path).err();
            return Err(format!(
                "删除 Quick Pocket 文件失败，已尝试回滚配置{}{}：{delete_error}",
                config_error
                    .map(|error| format!("（配置回滚失败：{error}）"))
                    .unwrap_or_default(),
                restore_error
                    .map(|error| format!("（文件恢复失败：{error}）"))
                    .unwrap_or_default(),
            ));
        }
    }
    Ok({
        let mut pockets = vec![QuickPocketDefinition {
            id: DEFAULT_QUICK_POCKET_ID.to_string(),
            name: "Quick Pocket".to_string(),
        }];
        pockets.extend(updated_config.quick_pockets);
        pockets
    })
}

#[tauri::command]
pub fn quick_pocket_list<R: Runtime>(
    app: tauri::AppHandle<R>,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let _guard = lock()
        .lock()
        .map_err(|_| "Quick Pocket 文件锁已损坏".to_string())?;
    let path = pocket_path(&app, &pocket_id)?;
    let _process_lock = crate::process_file_lock(&path)?;
    Ok(read_document(&path)?.snapshot())
}

#[tauri::command]
pub fn quick_pocket_add<R: Runtime>(
    app: tauri::AppHandle<R>,
    title: String,
    body: String,
    tag: Option<QuickPocketTag>,
    group_id: Option<String>,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    let id = format!(
        "qp_{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.add(&title, &body, tag, group_id.as_deref(), &id)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_update<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    title: String,
    body: String,
    tag: Option<QuickPocketTag>,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.update(&id, &title, &body, tag)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_delete<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.delete(&id)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_reorder<R: Runtime>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.reorder(&ids)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_create_group<R: Runtime>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
    name: String,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    let id = format!(
        "qpg_{}",
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.create_group(&ids, &name, &id)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_rename_group<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    name: String,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.rename_group(&id, &name)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_dissolve_group<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.dissolve_group(&id)?;
        Ok(document.snapshot())
    })
}

#[tauri::command]
pub fn quick_pocket_move_item<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    group_id: Option<String>,
    ids: Vec<String>,
    pocket_id: String,
) -> Result<QuickPocketSnapshot, String> {
    let path = pocket_path(&app, &pocket_id)?;
    mutate_and_notify_for_pocket(&app, &path, &pocket_id, |document| {
        document.move_item(&id, group_id.as_deref(), &ids)?;
        Ok(document.snapshot())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture() -> &'static str {
        "# Quick Pocket\n说明保留\n<!-- quick-pocket:id=qp_a tag=command -->\n命令\nnpm run tauri dev\n<!-- /quick-pocket -->\n尾注\n<!-- quick-pocket:id=qp_b tag=private -->\n密码\nsecret\n<!-- /quick-pocket -->\n"
    }

    #[test]
    fn pocket_file_delete_stages_and_can_restore_the_file() {
        let root = std::env::temp_dir().join(format!(
            "mknote-quick-pocket-delete-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("pocket.md");
        fs::write(&path, "保留数据\n").unwrap();
        let staged = stage_pocket_file_for_delete(&path).unwrap().unwrap();
        assert!(!path.exists());
        assert!(staged.exists());
        restore_staged_pocket_file(&staged, &path).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "保留数据\n");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn parses_and_preserves_unknown_markdown() {
        let document = QuickPocketDocument::parse(fixture());
        assert_eq!(document.items()[0].title, "命令");
        assert_eq!(document.items()[0].body, "npm run tauri dev");
        assert_eq!(document.items()[1].tag, Some(QuickPocketTag::Private));
        assert!(document.render().contains("说明保留"));
        assert!(document.render().contains("尾注"));
    }

    #[test]
    fn add_inserts_at_top_and_update_delete_only_target() {
        let mut document = QuickPocketDocument::parse(fixture());
        document
            .add("新条目", "body", Some(QuickPocketTag::Text), None, "qp_new")
            .unwrap();
        assert_eq!(document.items()[0].id, "qp_new");
        document
            .update("qp_b", "新密码", "plain", Some(QuickPocketTag::Private))
            .unwrap();
        assert!(document.render().contains("新密码"));
        document.delete("qp_a").unwrap();
        assert!(!document.render().contains("qp_a"));
        assert!(document.render().contains("尾注"));
    }

    #[test]
    fn empty_title_is_saved_as_no_title() {
        let mut document = QuickPocketDocument::parse("# Quick Pocket\n");
        document
            .add("", "只有内文", None, None, "qp_no_title")
            .unwrap();
        assert_eq!(document.items()[0].title, "无标题");
        document
            .update("qp_no_title", "  ", "更新后的内文", None)
            .unwrap();
        assert!(document.render().contains("无标题\n更新后的内文"));
    }

    #[test]
    fn empty_title_and_body_are_rejected() {
        let mut document = QuickPocketDocument::parse("# Quick Pocket\n");
        assert!(document.add("   ", "\n\t", None, None, "qp_empty").is_err());
        assert!(document.items().is_empty());
    }

    #[test]
    fn renaming_group_rewrites_its_persisted_marker() {
        let encoded_name = BASE64.encode("旧分组".as_bytes());
        let input = format!(
            "# Quick Pocket\n<!-- quick-pocket-group:id=g1 name={encoded_name} -->\n<!-- quick-pocket:id=qp_a group=g1 -->\n标题\n内容\n<!-- /quick-pocket -->\n"
        );
        let mut document = QuickPocketDocument::parse(&input);

        document.rename_group("g1", "新分组").unwrap();

        let reparsed = QuickPocketDocument::parse(&document.render());
        assert_eq!(reparsed.groups[0].name, "新分组");
    }

    #[test]
    fn reorder_rejects_wrong_ids_and_keeps_unknown_content() {
        let mut document = QuickPocketDocument::parse(fixture());
        document.reorder(&["qp_b".into(), "qp_a".into()]).unwrap();
        assert_eq!(
            document
                .items()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["qp_b", "qp_a"]
        );
        assert!(document.render().contains("说明保留"));
        assert!(document.reorder(&["qp_a".into()]).is_err());
    }

    #[test]
    fn groups_round_trip_names_and_members_and_dissolve_without_deleting_items() {
        let mut document = QuickPocketDocument::parse(fixture());
        document.add("第三条", "body", None, None, "qp_c").unwrap();
        document
            .create_group(&["qp_a".into(), "qp_c".into()], "工作资料", "qpg_1")
            .unwrap();
        let saved = document.render();
        let mut parsed = QuickPocketDocument::parse(&saved);
        assert_eq!(parsed.snapshot().groups[0].name, "工作资料");
        assert_eq!(
            parsed
                .snapshot()
                .items
                .iter()
                .find(|item| item.id == "qp_a")
                .unwrap()
                .group_id
                .as_deref(),
            Some("qpg_1")
        );
        parsed.dissolve_group("qpg_1").unwrap();
        assert!(parsed
            .snapshot()
            .items
            .iter()
            .all(|item| item.group_id.is_none()));
        assert!(parsed.snapshot().items.iter().any(|item| item.id == "qp_c"));
    }

    #[test]
    fn deleting_group_member_dissolves_singleton_group() {
        let mut document = QuickPocketDocument::parse(fixture());
        document
            .create_group(&["qp_a".into(), "qp_b".into()], "临时组", "qpg_1")
            .unwrap();
        document.delete("qp_a").unwrap();
        assert!(document.snapshot().groups.is_empty());
        assert!(document
            .snapshot()
            .items
            .iter()
            .all(|item| item.group_id.is_none()));
    }

    #[test]
    fn temp_and_delete_stage_paths_are_unique_within_one_process() {
        let path = PathBuf::from("Quick Pocket.md");
        assert_ne!(temp_path(&path), temp_path(&path));
        assert_ne!(delete_stage_path(&path), delete_stage_path(&path));
    }

    #[test]
    fn pocket_ids_are_unique_within_one_process() {
        let ids: HashSet<String> = (0..256).map(|_| new_pocket_id()).collect();
        assert_eq!(ids.len(), 256);
    }
}
