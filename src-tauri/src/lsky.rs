/// 兰空图床（Lsky Pro）上传模块
/// API: POST /api/v1/upload  Authorization: Bearer <token>
/// 登录: POST /api/v1/tokens  -> 返回 token
use serde::Deserialize;

pub const DEFAULT_LSKY_URL: &str = "";
pub const DEFAULT_LSKY_STRATEGY_ID: Option<u32> = Some(4);
pub const DEFAULT_LSKY_ALBUM_NAME: &str = "MDnote";

#[derive(Debug, Deserialize)]
struct TokenResponse {
    status: bool,
    message: String,
    data: Option<TokenData>,
}

#[derive(Debug, Deserialize)]
struct TokenData {
    token: String,
}

#[derive(Debug, Deserialize)]
struct UploadResponse {
    status: bool,
    message: String,
    data: Option<UploadData>,
}

#[derive(Debug, Deserialize)]
struct UploadData {
    links: LinkData,
}

#[derive(Debug, Deserialize)]
struct LinkData {
    url: String,
}

#[derive(Debug, Deserialize)]
struct AlbumListResponse {
    status: bool,
    message: String,
    data: Option<AlbumPage>,
}

#[derive(Debug, Deserialize)]
struct AlbumPage {
    data: Vec<AlbumData>,
}

#[derive(Debug, Deserialize)]
struct AlbumData {
    id: u32,
    name: String,
}

/// 向兰空图床申请一个 Bearer token（一次性，不缓存）
pub fn get_lsky_token(base_url: &str, email: &str, password: &str) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let url = format!("{base_url}/api/v1/tokens");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {e}"))?;

    let resp = client
        .post(&url)
        .form(&[("email", email), ("password", password)])
        .send()
        .map_err(|e| format!("登录图床失败: {e}"))?;

    let body: TokenResponse = resp.json().map_err(|e| format!("解析登录响应失败: {e}"))?;

    if !body.status {
        return Err(format!("图床登录失败: {}", body.message));
    }

    body.data
        .map(|d| d.token)
        .ok_or_else(|| "图床未返回 token".to_string())
}

/// 上传图片字节到兰空图床，返回公开访问 URL
pub fn upload_image(
    base_url: &str,
    token: &str,
    filename: &str,
    data: Vec<u8>,
    strategy_id: Option<u32>,
    album_id: Option<u32>,
) -> Result<String, String> {
    let base_url = validate_base_url(base_url)?;
    let url = format!("{base_url}/api/v1/upload");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {e}"))?;

    let mime = mime_from_filename(filename);
    let part = reqwest::blocking::multipart::Part::bytes(data)
        .file_name(filename.to_string())
        .mime_str(mime)
        .map_err(|e| format!("设置 MIME 类型失败: {e}"))?;

    let mut form = reqwest::blocking::multipart::Form::new().part("file", part);
    for (name, value) in upload_form_fields(strategy_id, album_id) {
        form = form.text(name, value);
    }

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .multipart(form)
        .send()
        .map_err(|e| format!("上传图片失败: {e}"))?;

    let body: UploadResponse = resp.json().map_err(|e| format!("解析上传响应失败: {e}"))?;

    if !body.status {
        return Err(format!("图床上传失败: {}", body.message));
    }

    body.data
        .map(|d| d.links.url)
        .ok_or_else(|| "图床未返回图片 URL".to_string())
}

fn upload_form_fields(
    strategy_id: Option<u32>,
    album_id: Option<u32>,
) -> Vec<(&'static str, String)> {
    let mut fields = Vec::with_capacity(2);
    if let Some(id) = strategy_id {
        fields.push(("strategy_id", id.to_string()));
    }
    if let Some(id) = album_id {
        fields.push(("album_id", id.to_string()));
    }
    fields
}

fn find_album_id(albums: &[AlbumData], album_name: &str) -> Option<u32> {
    albums
        .iter()
        .find(|album| album.name == album_name)
        .map(|album| album.id)
}

/// 查询指定名称的相册 ID。上传必须明确命中相册，避免图片落入默认相册。
fn get_album_id(base_url: &str, token: &str, album_name: &str) -> Result<u32, String> {
    let base_url = validate_base_url(base_url)?;
    let url = format!("{base_url}/api/v1/albums");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {e}"))?;

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .query(&[("q", album_name), ("order", "earliest")])
        .send()
        .map_err(|e| format!("读取图床相册失败: {e}"))?;

    let body: AlbumListResponse = resp
        .json()
        .map_err(|e| format!("解析图床相册响应失败: {e}"))?;
    if !body.status {
        return Err(format!("读取图床相册失败: {}", body.message));
    }

    let albums = body.data.map(|page| page.data).unwrap_or_default();
    find_album_id(&albums, album_name)
        .ok_or_else(|| format!("图床中未找到名为“{album_name}”的相册"))
}

pub(crate) fn validate_base_url(base_url: &str) -> Result<String, String> {
    let value = base_url.trim().trim_end_matches('/');
    if !value.starts_with("https://") {
        return Err("兰空图床地址必须使用 HTTPS".into());
    }
    if value.len() <= "https://".len() {
        return Err("兰空图床地址无效".into());
    }
    Ok(value.to_string())
}

/// 一步完成：登录 + 上传，返回公开 URL
pub fn login_and_upload(
    base_url: &str,
    email: &str,
    password: &str,
    strategy_id: Option<u32>,
    filename: &str,
    data: Vec<u8>,
) -> Result<String, String> {
    let token = get_lsky_token(base_url, email, password)?;
    let album_id = get_album_id(base_url, &token, DEFAULT_LSKY_ALBUM_NAME)?;
    upload_image(
        base_url,
        &token,
        filename,
        data,
        strategy_id,
        Some(album_id),
    )
}

fn mime_from_filename(filename: &str) -> &'static str {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lsky_rejects_plain_http_endpoint() {
        assert!(validate_base_url("http://example.test").is_err());
        assert!(validate_base_url("https://example.test").is_ok());
    }

    #[test]
    fn upload_fields_include_strategy_and_album() {
        assert_eq!(
            upload_form_fields(Some(4), Some(17)),
            vec![
                ("strategy_id", "4".to_string()),
                ("album_id", "17".to_string()),
            ]
        );
    }

    #[test]
    fn mdnote_album_requires_an_exact_name_match() {
        let albums = vec![
            AlbumData {
                id: 7,
                name: "MDnote ".to_string(),
            },
            AlbumData {
                id: 8,
                name: "MDnote".to_string(),
            },
        ];

        assert_eq!(find_album_id(&albums, "MDnote"), Some(8));
        assert_eq!(find_album_id(&albums, "mdnote"), None);
    }
}
