use crate::notes;
use crate::paths::{self, NoteZone};
use crate::siyuan_map::{self, SiyuanMapEntry};
use crate::{load_config, AppConfig};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Runtime};

pub const DEFAULT_API_URL: &str = "http://127.0.0.1:6806";
pub const PATH_ROOT: &str = "/MKnote";

#[derive(Debug, Clone, serde::Serialize)]
pub struct SiyuanNotebookSummary {
    pub id: String,
    pub name: String,
    pub closed: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SiyuanUploadResult {
    pub doc_id: String,
    pub h_path: String,
    pub created: bool,
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    code: i32,
    msg: String,
    data: Value,
}

struct SiyuanClient {
    base_url: String,
    token: String,
    http: Client,
}

/// 去掉用户误粘贴的 `Token ` / `Bearer ` 前缀与首尾空白（用于保存配置）。
pub fn normalize_api_token(raw: &str) -> String {
    let mut t = raw.trim().to_string();
    for prefix in ["Token ", "token ", "Bearer ", "bearer "] {
        if let Some(rest) = t.strip_prefix(prefix) {
            t = rest.trim().to_string();
            break;
        }
    }
    t
}

/// 构造 Authorization 标头：支持只填 token，或粘贴完整 `Token xxx`。
fn authorization_header(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with("Token ")
        || t.starts_with("token ")
        || t.starts_with("Bearer ")
        || t.starts_with("bearer ")
    {
        t.to_string()
    } else {
        format!("Token {}", normalize_api_token(t))
    }
}

impl SiyuanClient {
    fn from_config(config: &AppConfig) -> Result<Self, String> {
        let token = config
            .siyuan_api_token
            .as_ref()
            .map(|s| normalize_api_token(s))
            .filter(|s| !s.is_empty())
            .ok_or("请填写思源 API Token（思源：设置 → 关于 → API token）")?;
        let base_url = config
            .siyuan_api_url
            .as_ref()
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_API_URL.to_string());
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            base_url,
            token,
            http,
        })
    }

    fn api_root(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        if base.ends_with("/api") {
            base.to_string()
        } else {
            format!("{base}/api")
        }
    }

    fn post_json(&self, endpoint: &str, body: Value) -> Result<Value, String> {
        let path = endpoint.trim_start_matches('/');
        let url = format!("{}/{}", self.api_root(), path);
        let resp = self
            .http
            .post(&url)
            .header("Authorization", authorization_header(&self.token))
            .header("Content-Type", "application/json; charset=utf-8")
            .json(&body)
            .send()
            .map_err(|e| format!("无法连接思源（{url}）：{e}"))?;
        let status = resp.status();
        let text = resp.text().map_err(|e| e.to_string())?;
        if !status.is_success() {
            let snippet = truncate_for_error(&text, 240);
            return Err(format!("思源 HTTP {status}（{url}）：{snippet}"));
        }
        let parsed: ApiResponse = serde_json::from_str(&text).map_err(|e| {
            let snippet = truncate_for_error(&text, 240);
            format!("思源响应不是有效 JSON（{url}）：{e}；内容：{snippet}")
        })?;
        if parsed.code != 0 {
            return Err(if parsed.msg.is_empty() {
                format!("思源 API 错误 code={}（{url}）", parsed.code)
            } else {
                format!("{msg}（{url}）", msg = parsed.msg)
            });
        }
        Ok(parsed.data)
    }

    fn ensure_notebook_open(&self, notebook_id: &str) -> Result<(), String> {
        let _ = self.post_json("notebook/openNotebook", json!({ "notebook": notebook_id }))?;
        Ok(())
    }

    fn list_notebooks(&self) -> Result<Vec<SiyuanNotebookSummary>, String> {
        let data = self.post_json("notebook/lsNotebooks", json!({}))?;
        let notebooks = data
            .get("notebooks")
            .and_then(|v| v.as_array())
            .ok_or("思源返回的笔记本列表格式异常")?;
        let mut out = Vec::new();
        for nb in notebooks {
            let id = nb
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if id.is_empty() {
                continue;
            }
            out.push(SiyuanNotebookSummary {
                id,
                name: nb
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("未命名")
                    .to_string(),
                closed: nb.get("closed").and_then(|v| v.as_bool()).unwrap_or(false),
            });
        }
        Ok(out)
    }

    fn create_doc_with_md(
        &self,
        notebook: &str,
        path: &str,
        title: &str,
        markdown: &str,
    ) -> Result<String, String> {
        self.ensure_notebook_open(notebook)?;
        let data = self.post_json(
            "filetree/createDocWithMd",
            json!({
                "notebook": notebook,
                "path": path,
                "markdown": markdown,
                "title": title,
            }),
        )?;
        parse_doc_id(&data)
    }

    fn update_doc_markdown(&self, doc_id: &str, markdown: &str) -> Result<(), String> {
        self.post_json(
            "block/updateBlock",
            json!({
                "id": doc_id,
                "dataType": "markdown",
                "data": markdown,
            }),
        )?;
        Ok(())
    }

    fn upload_asset(&self, path: &str, data: &[u8], filename: &str) -> Result<String, String> {
        let url = format!("{}/asset/upload", self.api_root());
        let file = reqwest::blocking::multipart::Part::bytes(data.to_vec())
            .file_name(filename.to_string());
        let form = reqwest::blocking::multipart::Form::new()
            .text("assetsDirPath", path.to_string())
            .part("file[]", file);
        // reqwest 会根据 Form 自动生成带 boundary 的 multipart Content-Type。
        // 这里不能复用 post_json，否则思源会收到 application/json 并拒绝请求。
        let resp = self
            .http
            .post(&url)
            .header("Authorization", authorization_header(&self.token))
            .multipart(form)
            .send()
            .map_err(|e| format!("无法连接思源（{url}）：{e}"))?;
        let status = resp.status();
        let text = resp.text().map_err(|e| e.to_string())?;
        if !status.is_success() {
            let snippet = truncate_for_error(&text, 240);
            return Err(format!("思源 HTTP {status}（{url}）：{snippet}"));
        }
        let parsed: ApiResponse = serde_json::from_str(&text).map_err(|e| {
            let snippet = truncate_for_error(&text, 240);
            format!("思源响应不是有效 JSON（{url}）：{e}；内容：{snippet}")
        })?;
        if parsed.code != 0 {
            return Err(if parsed.msg.is_empty() {
                format!("思源 API 错误 code={}（{url}）", parsed.code)
            } else {
                format!("{msg}（{url}）", msg = parsed.msg)
            });
        }
        let result = parsed.data;
        if let Some(s) = result.as_str() {
            return Ok(s.to_string());
        }
        if let Some(s) = result.get("succMap").and_then(|v| v.as_object()) {
            if let Some((_, url)) = s.iter().next() {
                if let Some(u) = url.as_str() {
                    return Ok(u.to_string());
                }
            }
        }
        Err("思源未返回资源路径".into())
    }
}

fn parse_doc_id(data: &Value) -> Result<String, String> {
    if let Some(s) = data.as_str() {
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }
    if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
        if !id.is_empty() {
            return Ok(id.to_string());
        }
    }
    Err("思源未返回文档 ID".into())
}

pub fn content_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn sanitize_path_segment(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "未命名".to_string();
    }
    const BAD: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if BAD.contains(&ch) || ch.is_control() {
            out.push('_');
        } else {
            out.push(ch);
        }
    }
    let collapsed: String = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        "未命名".to_string()
    } else {
        collapsed
    }
}

/// 思源文档路径：`/MKnote/{标题}`；非 default zone 追加后缀避免冲突。
pub fn build_doc_path(title: &str, zone: &NoteZone) -> String {
    let leaf = sanitize_path_segment(title);
    match zone {
        NoteZone::Default => format!("{PATH_ROOT}/{leaf}"),
        NoteZone::Inbox => format!("{PATH_ROOT}/{leaf}_(inbox)"),
        NoteZone::Folder(id) => format!("{PATH_ROOT}/{leaf}_({id})"),
        NoteZone::Private => format!("{PATH_ROOT}/{leaf}_(private)"),
    }
}

fn truncate_for_error(text: &str, max: usize) -> String {
    let compact: String = text.chars().filter(|c| !c.is_control()).collect();
    if compact.chars().count() <= max {
        compact
    } else {
        format!("{}…", compact.chars().take(max).collect::<String>())
    }
}

pub fn resolve_siyuan_config(
    base: &AppConfig,
    api_url: Option<&str>,
    api_token: Option<&str>,
) -> AppConfig {
    let mut cfg = base.clone();
    if let Some(url) = api_url {
        let t = url.trim();
        cfg.siyuan_api_url = if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        };
    }
    if let Some(token) = api_token {
        let t = normalize_api_token(token);
        cfg.siyuan_api_token = if t.is_empty() { None } else { Some(t) };
    }
    cfg
}

pub fn siyuan_test_connection(config: &AppConfig) -> Result<Vec<SiyuanNotebookSummary>, String> {
    let client = SiyuanClient::from_config(config)?;
    client.list_notebooks()
}

pub fn siyuan_list_notebooks(config: &AppConfig) -> Result<Vec<SiyuanNotebookSummary>, String> {
    siyuan_test_connection(config)
}

pub fn upload_note_to_siyuan<R: Runtime>(
    app: &AppHandle<R>,
    zone: NoteZone,
    name: &str,
    markdown: &str,
    title: &str,
) -> Result<SiyuanUploadResult, String> {
    let base = paths::writable_base(app)?;
    if zone == NoteZone::Private || notes::is_privacy_note(&base, &zone, name)? {
        return Err("隐私便签不能上传到思源".into());
    }
    let config = load_config()?;
    if crate::note_upload::effective_target(&config) != crate::note_upload::UploadTarget::Siyuan {
        return Err("思源上传未启用".into());
    }
    let notebook = config
        .siyuan_notebook_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("请先在设置中选择思源目标笔记本")?;
    let client = SiyuanClient::from_config(&config)?;
    let zone_str = zone.as_str();
    let processed = resolve_markdown_images(&client, &base, markdown)?;
    let doc_path = build_doc_path(title, &zone);
    let hash = content_hash(&processed);

    if let Some(entry) = siyuan_map::get_entry(&base, &zone_str, name)? {
        if entry.notebook == notebook {
            match client.update_doc_markdown(&entry.doc_id, &processed) {
                Ok(()) => {
                    let updated = SiyuanMapEntry {
                        doc_id: entry.doc_id.clone(),
                        notebook: notebook.clone(),
                        h_path: doc_path.clone(),
                        content_hash: Some(hash),
                    };
                    siyuan_map::set_entry(&base, &zone_str, name, updated)?;
                    return Ok(SiyuanUploadResult {
                        doc_id: entry.doc_id,
                        h_path: doc_path,
                        created: false,
                    });
                }
                Err(error) => return Err(format!("更新思源文档失败：{error}")),
            }
        } else {
            let _ = siyuan_map::remove_entry(&base, &zone_str, name);
        }
    }

    let doc_id = client.create_doc_with_md(&notebook, &doc_path, title, &processed)?;
    let entry = SiyuanMapEntry {
        doc_id: doc_id.clone(),
        notebook,
        h_path: doc_path.clone(),
        content_hash: Some(hash),
    };
    siyuan_map::set_entry(&base, &zone_str, name, entry)?;

    Ok(SiyuanUploadResult {
        doc_id,
        h_path: doc_path,
        created: true,
    })
}

pub fn on_note_renamed(base: &Path, zone: &str, old_name: &str, new_name: &str, title: &str) {
    let zone_parsed = paths::parse_zone(zone).ok();
    let new_path = zone_parsed.as_ref().map(|z| build_doc_path(title, z));
    let _ = siyuan_map::rename_entry(base, zone, old_name, new_name, new_path);
}

fn resolve_markdown_images(
    client: &SiyuanClient,
    base: &Path,
    markdown: &str,
) -> Result<String, String> {
    use regex::Regex;
    let re = Regex::new(r"!\[[^\]]*\]\(([^)]+)\)").map_err(|e| e.to_string())?;
    let mut out = markdown.to_string();
    for cap in re.captures_iter(markdown) {
        let full = cap.get(0).map(|m| m.as_str()).unwrap_or("");
        let path = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
        let path = crate::assets::normalize_markdown_image_path(path);
        if path.starts_with("http://") || path.starts_with("https://") {
            continue;
        }
        let Some(local) = crate::assets::resolve_local_image(base, &path) else {
            continue;
        };
        let bytes = crate::assets::read_asset_bytes(&local)?;
        let filename = local
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("image.png");
        let uploaded = client.upload_asset("/assets/", &bytes, filename)?;
        out = out.replace(full, &format!("![]({uploaded})"));
    }
    Ok(out)
}

pub fn on_note_deleted(base: &Path, zone: &str, name: &str) {
    let _ = siyuan_map::remove_entry(base, zone, name);
}
