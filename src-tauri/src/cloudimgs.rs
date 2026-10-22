use reqwest::blocking::{multipart, Client};
use reqwest::StatusCode;
use serde::Deserialize;
use std::collections::HashSet;
use std::time::Duration;

pub const DEFAULT_CLOUDIMGS_URL: &str = "";
pub const DEFAULT_CLOUDIMGS_DIRECTORY: &str = "MDnote";
pub const ACCESS_PASSWORD_HEADER: &str = "X-Access-Password";
pub const UPLOAD_FIELD: &str = "image";
pub const CLEANUP_PAGE_SIZE: usize = 100;

#[derive(Debug, Deserialize)]
struct DirectoryResponse {
    #[serde(default)]
    success: bool,
    data: Option<Vec<DirectoryItem>>,
    error: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DirectoryItem {
    name: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UploadResponse {
    #[serde(default)]
    success: bool,
    data: Option<UploadData>,
    error: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UploadData {
    #[serde(rename = "fullUrl")]
    full_url: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudImgsImage {
    pub key: String,
    pub name: String,
    pub url: String,
    pub size: u64,
    pub created_at_ms: i64,
}

#[derive(Debug, Deserialize)]
struct ImageListResponse {
    #[serde(default)]
    success: bool,
    data: Option<Vec<ImageListItem>>,
    pagination: Option<ImagePagination>,
    error: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ImagePagination {
    #[serde(rename = "totalPages", default)]
    total_pages: usize,
}

#[derive(Debug, Deserialize)]
struct ImageListItem {
    filename: Option<String>,
    #[serde(rename = "relPath")]
    rel_path: Option<String>,
    size: Option<u64>,
    mtime: Option<i64>,
    #[serde(rename = "uploadTime")]
    upload_time: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ImageActionResponse {
    #[serde(default)]
    success: bool,
    error: Option<String>,
    message: Option<String>,
}

pub fn validate_base_url(base_url: &str) -> Result<String, String> {
    let value = base_url.trim().trim_end_matches('/');
    if value.is_empty() {
        return Err("云图地址不能为空".into());
    }

    let parsed = reqwest::Url::parse(value).map_err(|_| "云图地址无效".to_string())?;
    if parsed.scheme() != "https" {
        return Err("云图地址必须使用 HTTPS".into());
    }
    if parsed.host_str().is_none() || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("云图地址无效".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("云图地址不能包含查询参数或片段".into());
    }
    if parsed
        .path()
        .trim_end_matches('/')
        .eq_ignore_ascii_case("/api")
    {
        return Err("云图地址请填写站点根地址，不要包含 /api".into());
    }
    Ok(value.to_string())
}

pub fn normalize_directory(directory: &str) -> Result<String, String> {
    let value = directory.trim().trim_matches('/');
    if value.is_empty() {
        return Err("云图相册/目录不能为空".into());
    }
    if value.contains('\\') {
        return Err("云图相册/目录不能包含反斜杠".into());
    }
    if value
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("云图相册/目录包含无效路径".into());
    }
    Ok(value.to_string())
}

pub fn build_upload_endpoint(base_url: &str, directory: &str) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let directory = normalize_directory(directory)?;
    let mut endpoint = reqwest::Url::parse(&format!("{base_url}/api/upload"))
        .map_err(|_| "云图上传地址无效".to_string())?;
    endpoint.query_pairs_mut().append_pair("dir", &directory);
    Ok(endpoint.to_string())
}

pub fn build_image_list_endpoint(
    base_url: &str,
    directory: &str,
    page: usize,
) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let directory = normalize_directory(directory)?;
    if page == 0 {
        return Err("云图图片列表页码无效".into());
    }
    let mut endpoint = reqwest::Url::parse(&format!("{base_url}/api/images"))
        .map_err(|_| "云图图片列表地址无效".to_string())?;
    endpoint
        .query_pairs_mut()
        .append_pair("dir", &directory)
        .append_pair("page", &page.to_string())
        .append_pair("pageSize", &CLEANUP_PAGE_SIZE.to_string());
    Ok(endpoint.to_string())
}

pub fn normalize_image_key(key: &str) -> Result<String, String> {
    let value = key.trim().replace('\\', "/");
    if value.is_empty() || value.starts_with('/') {
        return Err("云图图片标识无效".into());
    }
    if value
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("云图图片标识包含无效路径".into());
    }
    Ok(value)
}

fn is_key_in_directory(key: &str, directory: &str) -> bool {
    key == directory || key.starts_with(&format!("{directory}/"))
}

fn image_url(base_url: &str, key: &str) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let mut url = reqwest::Url::parse(&base_url).map_err(|_| "云图地址无效".to_string())?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "云图图片地址无效".to_string())?;
        segments.push("api").push("images");
        for segment in key.split('/') {
            segments.push(segment);
        }
    }
    Ok(url.to_string())
}

fn image_extension_is_supported(filename: &str) -> bool {
    matches!(
        filename
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "avif" | "ico"
    )
}

fn created_at_ms(mtime: Option<i64>, upload_time: Option<&str>) -> i64 {
    mtime.unwrap_or_else(|| {
        upload_time
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
            .map(|value| value.timestamp_millis())
            .unwrap_or(0)
    })
}

fn fetch_image_page(
    client: &Client,
    base_url: &str,
    password: &str,
    directory: &str,
    page: usize,
) -> Result<ImageListResponse, String> {
    let response = client
        .get(build_image_list_endpoint(base_url, directory, page)?)
        .header(ACCESS_PASSWORD_HEADER, password)
        .send()
        .map_err(|error| format!("读取云图图片列表失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("读取云图图片列表响应失败：{error}"))?;
    if status == StatusCode::UNAUTHORIZED {
        return Err("云图访问密码错误或未填写".into());
    }
    if !status.is_success() {
        return Err(format!("云图返回错误：{status}"));
    }
    let parsed: ImageListResponse = serde_json::from_str(&body)
        .map_err(|error| format!("解析云图图片列表失败（HTTP {status}）：{error}"))?;
    if !parsed.success {
        return Err(api_error(
            parsed.error.as_deref(),
            parsed.message.as_deref(),
            "读取云图图片列表失败",
        ));
    }
    Ok(parsed)
}

fn append_image_items(
    base_url: &str,
    directory: &str,
    items: Vec<ImageListItem>,
    seen_keys: &mut HashSet<String>,
    images: &mut Vec<CloudImgsImage>,
) -> Result<(), String> {
    for item in items {
        let key = normalize_image_key(
            item.rel_path
                .as_deref()
                .ok_or_else(|| "云图图片列表缺少图片标识".to_string())?,
        )?;
        if !is_key_in_directory(&key, directory) {
            return Err("云图图片列表返回了目录外图片，已终止清理".into());
        }
        if !seen_keys.insert(key.clone()) {
            return Err("云图图片列表包含重复图片标识，已终止清理".into());
        }
        let name = item
            .filename
            .filter(|value| !value.trim().is_empty())
            .or_else(|| key.rsplit('/').next().map(str::to_string))
            .ok_or_else(|| "云图图片列表缺少文件名".to_string())?;
        // 云图的 /api/images 也可能返回视频；孤儿图片清理只处理栅格/矢量图片。
        if !image_extension_is_supported(&name) {
            continue;
        }
        images.push(CloudImgsImage {
            url: image_url(base_url, &key)?,
            key,
            name,
            size: item.size.unwrap_or(0),
            created_at_ms: created_at_ms(item.mtime, item.upload_time.as_deref()),
        });
    }
    Ok(())
}

pub fn list_images(
    base_url: &str,
    password: &str,
    directory: &str,
) -> Result<Vec<CloudImgsImage>, String> {
    let base_url = validate_base_url(base_url)?;
    let password = password.trim();
    if password.is_empty() {
        return Err("请先配置云图访问密码".into());
    }
    let directory = normalize_directory(directory)?;
    let client = build_client(30)?;
    let first = fetch_image_page(&client, &base_url, password, &directory, 1)?;
    let total_pages = first
        .pagination
        .as_ref()
        .map(|pagination| pagination.total_pages)
        .unwrap_or(0);
    if total_pages == 0 {
        return Ok(Vec::new());
    }

    let mut seen_keys = HashSet::new();
    let mut images = Vec::new();
    append_image_items(
        &base_url,
        &directory,
        first.data.unwrap_or_default(),
        &mut seen_keys,
        &mut images,
    )?;
    for page in 2..=total_pages {
        let response = fetch_image_page(&client, &base_url, password, &directory, page)?;
        append_image_items(
            &base_url,
            &directory,
            response.data.unwrap_or_default(),
            &mut seen_keys,
            &mut images,
        )?;
    }
    Ok(images)
}

pub fn delete_image(
    base_url: &str,
    password: &str,
    directory: &str,
    key: &str,
) -> Result<(), String> {
    let base_url = validate_base_url(base_url)?;
    let password = password.trim();
    if password.is_empty() {
        return Err("请先配置云图访问密码".into());
    }
    let directory = normalize_directory(directory)?;
    let key = normalize_image_key(key)?;
    if !is_key_in_directory(&key, &directory) {
        return Err("云图图片不在当前清理目录内".into());
    }

    let mut endpoint = reqwest::Url::parse(&base_url).map_err(|_| "云图地址无效".to_string())?;
    {
        let mut segments = endpoint
            .path_segments_mut()
            .map_err(|_| "云图图片地址无效".to_string())?;
        segments.push("api").push("images");
        for segment in key.split('/') {
            segments.push(segment);
        }
    }
    let response = build_client(30)?
        .delete(endpoint)
        .header(ACCESS_PASSWORD_HEADER, password)
        .send()
        .map_err(|error| format!("删除云图图片失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("读取云图删除响应失败：{error}"))?;
    if status == StatusCode::UNAUTHORIZED {
        return Err("云图访问密码错误或未填写".into());
    }
    if !status.is_success() {
        return Err(format!("云图删除图片失败：HTTP {status}"));
    }
    let parsed: ImageActionResponse = serde_json::from_str(&body)
        .map_err(|error| format!("解析云图删除响应失败（HTTP {status}）：{error}"))?;
    if !parsed.success {
        return Err(api_error(
            parsed.error.as_deref(),
            parsed.message.as_deref(),
            "删除云图图片失败",
        ));
    }
    Ok(())
}

pub fn parse_directories_response(body: &str, directory: &str) -> Result<(), String> {
    let directory = normalize_directory(directory)?;
    let response: DirectoryResponse =
        serde_json::from_str(body).map_err(|error| format!("解析云图相册响应失败：{error}"))?;
    if !response.success {
        return Err(api_error(
            response.error.as_deref(),
            response.message.as_deref(),
            "读取云图相册失败",
        ));
    }

    let items = response.data.unwrap_or_default();
    let found = items.iter().any(|item| match item.path.as_deref() {
        Some(path) => path == directory,
        None => item.name.as_deref() == Some(directory.as_str()),
    });
    if found {
        Ok(())
    } else {
        Err(format!("云图中未找到名为“{directory}”的相册/目录"))
    }
}

pub fn parse_upload_response(base_url: &str, body: &str) -> Result<String, String> {
    let response: UploadResponse =
        serde_json::from_str(body).map_err(|error| format!("解析云图上传响应失败：{error}"))?;
    if !response.success {
        return Err(api_error(
            response.error.as_deref(),
            response.message.as_deref(),
            "云图上传失败",
        ));
    }

    let data = response
        .data
        .ok_or_else(|| "云图上传响应缺少图片数据".to_string())?;
    let raw_url = [data.full_url, data.url]
        .into_iter()
        .flatten()
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
        .ok_or_else(|| "云图上传响应缺少图片 URL".to_string())?;
    resolve_image_url(base_url, &raw_url)
}

pub fn test_connection(base_url: &str, password: &str, directory: &str) -> Result<(), String> {
    let base_url = validate_base_url(base_url)?;
    let directory = normalize_directory(directory)?;
    let password = password.trim();
    if password.is_empty() {
        return Err("请填写云图访问密码".into());
    }

    let client = build_client(15)?;
    let endpoint = format!("{base_url}/api/directories?recursive=true");
    let response = client
        .get(endpoint)
        .header(ACCESS_PASSWORD_HEADER, password)
        .send()
        .map_err(|error| format!("连接云图失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("读取云图响应失败：{error}"))?;
    if status == StatusCode::UNAUTHORIZED {
        return Err("云图访问密码错误或未填写".into());
    }
    if !status.is_success() {
        return Err(format!("云图返回错误：{status}"));
    }
    parse_directories_response(&body, &directory)
}

pub fn upload(
    base_url: &str,
    password: &str,
    directory: &str,
    filename: &str,
    data: Vec<u8>,
) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let password = password.trim();
    if password.is_empty() {
        return Err("请先配置云图访问密码".into());
    }
    let filename = filename.trim();
    if filename.is_empty() {
        return Err("图片文件名不能为空".into());
    }
    let endpoint = build_upload_endpoint(&base_url, directory)?;
    let content_type = content_type_for_filename(filename);
    let part = multipart::Part::bytes(data)
        .file_name(filename.to_string())
        .mime_str(content_type)
        .map_err(|error| format!("构建云图上传内容失败：{error}"))?;
    let form = multipart::Form::new().part(UPLOAD_FIELD, part);

    let client = build_client(60)?;
    let response = client
        .post(endpoint)
        .header(ACCESS_PASSWORD_HEADER, password)
        .multipart(form)
        .send()
        .map_err(|error| format!("上传到云图失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("读取云图上传响应失败：{error}"))?;
    if status == StatusCode::UNAUTHORIZED {
        return Err("云图访问密码错误或未填写".into());
    }
    if !status.is_success() {
        return Err(format!("云图返回错误：{status}"));
    }
    parse_upload_response(&base_url, &body)
}

fn build_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|error| format!("构建云图 HTTP 客户端失败：{error}"))
}

fn resolve_image_url(base_url: &str, raw_url: &str) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let base = reqwest::Url::parse(&base_url).map_err(|_| "云图地址无效".to_string())?;
    let candidate = reqwest::Url::parse(raw_url)
        .or_else(|_| base.join(raw_url))
        .map_err(|_| "云图返回的图片 URL 无效".to_string())?;
    if candidate.scheme() != "https" || candidate.host_str().is_none() {
        return Err("云图返回的图片 URL 不安全".into());
    }
    Ok(candidate.to_string())
}

fn content_type_for_filename(filename: &str) -> &str {
    match filename
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "image/png",
    }
}

fn api_error(error: Option<&str>, message: Option<&str>, fallback: &str) -> String {
    error
        .or(message)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_directory, validate_base_url};

    #[test]
    fn validates_https_root_url() {
        assert_eq!(
            validate_base_url(" https://cloudimgs.example.test/ ").unwrap(),
            "https://cloudimgs.example.test"
        );
        assert!(validate_base_url("http://cloudimgs.example.test").is_err());
        assert!(validate_base_url("https://cloudimgs.example.test/api").is_err());
    }

    #[test]
    fn normalizes_root_directory() {
        assert_eq!(normalize_directory("/MDnote/").unwrap(), "MDnote");
    }
}
