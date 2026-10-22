use crate::{load_config, lsky, paths};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Runtime};

const CLEANUP_LIST_PATH: &str = "/api/v1/mdnote/cleanup-images";
pub const CLEANUP_PROTECTION_MS: i64 = 30 * 60 * 1000;
const MAX_DELETE_BATCH: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LskyCleanupImage {
    pub key: String,
    pub name: String,
    pub url: String,
    pub size: u64,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LskyCleanupPlan {
    pub candidates: Vec<LskyCleanupImage>,
    pub protected_images: usize,
    pub referenced_images: usize,
    pub reclaimable_bytes: u64,
}

#[derive(Debug)]
pub struct MarkdownReferenceScan {
    pub scanned_notes: usize,
    pub urls: HashSet<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LskyCleanupReport {
    pub scanned_notes: usize,
    pub referenced_urls: usize,
    pub total_album_images: usize,
    pub referenced_images: usize,
    pub protected_images: usize,
    pub reclaimable_bytes: u64,
    pub candidates: Vec<LskyCleanupImage>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LskyCleanupFailure {
    pub key: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LskyCleanupDeleteResult {
    pub requested: usize,
    pub deleted: usize,
    pub skipped: Vec<String>,
    pub failed: Vec<LskyCleanupFailure>,
}

#[derive(Debug, Deserialize)]
struct CleanupListResponse {
    status: bool,
    message: String,
    data: Option<Vec<LskyCleanupImage>>,
}

#[derive(Debug, Deserialize)]
struct CleanupActionResponse {
    status: bool,
    message: String,
}

fn url_regex() -> &'static Regex {
    static URL_REGEX: OnceLock<Regex> = OnceLock::new();
    URL_REGEX.get_or_init(|| Regex::new(r#"https?://[^\s<>\"']+"#).expect("valid URL regex"))
}

fn is_non_note_markdown_dir(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some(".mknote-history") | Some(".mknote-templates") | Some("templates")
    )
}

fn normalize_url_identity(raw: &str) -> Option<String> {
    let trimmed = raw.trim_end_matches(|character: char| {
        matches!(
            character,
            ')' | ']' | '}' | ',' | ';' | ':' | '。' | '，' | '；' | '！' | '？'
        )
    });
    let mut url = reqwest::Url::parse(trimmed).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

pub fn extract_hosted_urls(markdown: &str) -> HashSet<String> {
    url_regex()
        .find_iter(markdown)
        .filter_map(|matched| normalize_url_identity(matched.as_str()))
        .collect()
}

fn scan_markdown_dir(path: &Path, scan: &mut MarkdownReferenceScan) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(path)
        .map_err(|error| format!("读取笔记目录失败（{}）：{error}", path.display()))?
    {
        let entry = entry.map_err(|error| format!("读取笔记目录项失败：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取笔记类型失败（{}）：{error}", entry.path().display()))?;
        if file_type.is_symlink() {
            continue;
        }
        let item = entry.path();
        if file_type.is_dir() {
            // 历史快照和内置模板不是当前笔记，不能让它们继续保护已删除图片。
            if is_non_note_markdown_dir(&item) {
                continue;
            }
            scan_markdown_dir(&item, scan)?;
            continue;
        }
        if !file_type.is_file()
            || !item
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            continue;
        }
        let content = std::fs::read_to_string(&item)
            .map_err(|error| format!("读取笔记失败（{}）：{error}", item.display()))?;
        scan.scanned_notes += 1;
        scan.urls.extend(extract_hosted_urls(&content));
    }
    Ok(())
}

pub fn collect_markdown_references(base: &Path) -> Result<MarkdownReferenceScan, String> {
    let mut scan = MarkdownReferenceScan {
        scanned_notes: 0,
        urls: HashSet::new(),
    };
    let default_note = base.join("default-note.md");
    if default_note.is_file() {
        let content = std::fs::read_to_string(&default_note)
            .map_err(|error| format!("读取笔记失败（{}）：{error}", default_note.display()))?;
        scan.scanned_notes += 1;
        scan.urls.extend(extract_hosted_urls(&content));
    }
    scan_markdown_dir(&base.join("inbox"), &mut scan)?;
    scan_markdown_dir(&base.join("File"), &mut scan)?;
    Ok(scan)
}

pub fn build_cleanup_plan(
    images: &[LskyCleanupImage],
    referenced_urls: &HashSet<String>,
    now_ms: i64,
    protection_ms: i64,
) -> LskyCleanupPlan {
    let mut candidates = Vec::new();
    let mut protected_images = 0;
    let mut referenced_images = 0;
    let mut reclaimable_bytes: u64 = 0;

    for image in images {
        let referenced =
            normalize_url_identity(&image.url).is_some_and(|url| referenced_urls.contains(&url));
        if referenced {
            referenced_images += 1;
            continue;
        }
        let protected =
            image.created_at_ms <= 0 || now_ms.saturating_sub(image.created_at_ms) < protection_ms;
        if protected {
            protected_images += 1;
            continue;
        }
        reclaimable_bytes = reclaimable_bytes.saturating_add(image.size);
        candidates.push(image.clone());
    }
    candidates.sort_by(|left, right| left.created_at_ms.cmp(&right.created_at_ms));

    LskyCleanupPlan {
        candidates,
        protected_images,
        referenced_images,
        reclaimable_bytes,
    }
}

fn cleanup_credentials() -> Result<(String, String, String), String> {
    let config = load_config()?;
    if config.image_host_enabled == Some(false) || !config.lsky_enabled {
        return Err("兰空图床上传未启用".into());
    }
    let base_url = config
        .lsky_url
        .as_deref()
        .unwrap_or(lsky::DEFAULT_LSKY_URL)
        .trim()
        .trim_end_matches('/')
        .to_string();
    if !base_url.starts_with("https://") {
        return Err("兰空图床地址必须使用 HTTPS".into());
    }
    let email = config
        .lsky_email
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "请先配置兰空图床账号".to_string())?;
    let password = config
        .lsky_password
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "请先配置兰空图床密码".to_string())?;
    Ok((base_url, email, password))
}

fn cleanup_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("构建图床清理客户端失败：{error}"))
}

fn list_cleanup_images(base_url: &str, token: &str) -> Result<Vec<LskyCleanupImage>, String> {
    let response = cleanup_client()?
        .get(format!("{base_url}{CLEANUP_LIST_PATH}"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .map_err(|error| format!("读取 MDnote 图床相册失败：{error}"))?;
    let status = response.status();
    let body: CleanupListResponse = response
        .json()
        .map_err(|error| format!("解析 MDnote 图床相册失败（HTTP {status}）：{error}"))?;
    if !body.status {
        return Err(format!("读取 MDnote 图床相册失败：{}", body.message));
    }
    let images = body.data.unwrap_or_default();
    for image in &images {
        if image.key.trim().is_empty() || normalize_url_identity(&image.url).is_none() {
            return Err("图床返回了无法安全识别的图片记录，已终止清理".into());
        }
    }
    Ok(images)
}

fn delete_cleanup_image(base_url: &str, token: &str, key: &str) -> Result<(), String> {
    let encoded_key = utf8_percent_encode(key, NON_ALPHANUMERIC);
    let response = cleanup_client()?
        .delete(format!("{base_url}{CLEANUP_LIST_PATH}/{encoded_key}"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .map_err(|error| format!("删除图床图片失败：{error}"))?;
    let status = response.status();
    let body: CleanupActionResponse = response
        .json()
        .map_err(|error| format!("解析图床删除响应失败（HTTP {status}）：{error}"))?;
    if !body.status {
        return Err(body.message);
    }
    Ok(())
}

fn scan_with_remote<R: Runtime>(app: &AppHandle<R>) -> Result<(LskyCleanupReport, String), String> {
    let base = paths::writable_base(app)?;
    let references = collect_markdown_references(&base)?;
    let (base_url, email, password) = cleanup_credentials()?;
    let token = lsky::get_lsky_token(&base_url, &email, &password)?;
    let images = list_cleanup_images(&base_url, &token)?;
    let plan = build_cleanup_plan(
        &images,
        &references.urls,
        chrono::Utc::now().timestamp_millis(),
        CLEANUP_PROTECTION_MS,
    );
    Ok((
        LskyCleanupReport {
            scanned_notes: references.scanned_notes,
            referenced_urls: references.urls.len(),
            total_album_images: images.len(),
            referenced_images: plan.referenced_images,
            protected_images: plan.protected_images,
            reclaimable_bytes: plan.reclaimable_bytes,
            candidates: plan.candidates,
        },
        token,
    ))
}

#[tauri::command]
pub fn scan_lsky_cleanup<R: Runtime>(app: AppHandle<R>) -> Result<LskyCleanupReport, String> {
    scan_with_remote(&app).map(|(report, _token)| report)
}

#[tauri::command]
pub fn delete_lsky_cleanup<R: Runtime>(
    app: AppHandle<R>,
    keys: Vec<String>,
) -> Result<LskyCleanupDeleteResult, String> {
    if keys.is_empty() {
        return Err("没有可删除的图床图片".into());
    }
    if keys.len() > MAX_DELETE_BATCH {
        return Err(format!("单次最多清理 {MAX_DELETE_BATCH} 张图片"));
    }
    let requested: HashSet<String> = keys
        .into_iter()
        .filter(|key| !key.trim().is_empty())
        .collect();
    if requested.is_empty() {
        return Err("图床图片标识无效".into());
    }

    // 删除前重新扫描磁盘和远端；任何读取错误都会在首次删除前返回。
    let (report, token) = scan_with_remote(&app)?;
    let candidate_map: HashMap<String, LskyCleanupImage> = report
        .candidates
        .into_iter()
        .map(|image| (image.key.clone(), image))
        .collect();
    let mut skipped = Vec::new();
    let mut failed = Vec::new();
    let mut deleted = 0;
    let (base_url, _email, _password) = cleanup_credentials()?;

    for key in &requested {
        if !candidate_map.contains_key(key) {
            skipped.push(key.clone());
            continue;
        }
        match delete_cleanup_image(&base_url, &token, key) {
            Ok(()) => deleted += 1,
            Err(error) => failed.push(LskyCleanupFailure {
                key: key.clone(),
                error,
            }),
        }
    }
    skipped.sort();
    failed.sort_by(|left, right| left.key.cmp(&right.key));

    Ok(LskyCleanupDeleteResult {
        requested: requested.len(),
        deleted,
        skipped,
        failed,
    })
}
