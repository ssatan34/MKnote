use crate::paths;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Component;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};

#[cfg(windows)]
fn replace_asset_file(temp: &Path, target: &Path) -> Result<(), String> {
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
    .map_err(|error| format!("替换资源文件失败：{error}"))
}

#[cfg(not(windows))]
fn replace_asset_file(temp: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temp, target).map_err(|error| format!("替换资源文件失败：{error}"))
}

fn atomic_write_asset(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension(format!(
        "{}.{}.{}.tmp",
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("asset"),
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    ));
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp).map_err(|error| error.to_string())?;
        std::io::Write::write_all(&mut file, bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temp);
        return Err(format!("写入资源临时文件失败：{error}"));
    }
    replace_asset_file(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        error
    })
}

pub fn assets_dir(base: &Path) -> PathBuf {
    paths::file_root_path(base).join("assets")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_asset_resolution_rejects_escape_paths() {
        let base = std::env::temp_dir().join("mknote-assets-path-test");
        assert!(resolve_local_image(&base, "File/../config.json").is_none());
        assert!(resolve_local_image(&base, "../config.json").is_none());
        assert!(resolve_local_image(&base, "C:/Windows/win.ini").is_none());
    }

    #[test]
    fn local_asset_resolution_accepts_the_markdown_path_returned_by_import() {
        let base = std::env::temp_dir().join(format!(
            "mknote-assets-valid-path-test-{}",
            std::process::id()
        ));
        let dir = assets_dir(&base);
        fs::create_dir_all(&dir).unwrap();
        let expected = dir.join("image.png");
        fs::write(&expected, b"\x89PNG\r\n\x1a\n").unwrap();

        let resolved = resolve_local_image(&base, "File/assets/image.png");

        assert_eq!(resolved, Some(expected.canonicalize().unwrap()));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn remote_asset_download_requires_https() {
        assert!(validate_download_url("http://example.test/image.png").is_err());
        assert_eq!(
            validate_download_url(" https://example.test/image.png ").unwrap(),
            "https://example.test/image.png"
        );
    }

    #[test]
    fn downloaded_asset_signature_must_be_a_supported_image() {
        assert!(is_supported_image_bytes(b"\x89PNG\r\n\x1a\nrest"));
        assert!(is_supported_image_bytes(b"RIFF0000WEBPrest"));
        assert!(!is_supported_image_bytes(b"<html>not an image</html>"));
    }
}

fn hash_file(path: &Path) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn import_asset<R: Runtime>(app: &AppHandle<R>, source_path: String) -> Result<String, String> {
    let src = PathBuf::from(&source_path);
    if !src.is_file() {
        return Err("文件不存在".into());
    }
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("bin");
    let base = paths::writable_base(app)?;
    let dir = assets_dir(&base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let hash = hash_file(&src)?;
    let short = &hash[..12.min(hash.len())];
    let filename = format!("{short}.{ext}");
    let dest = dir.join(&filename);
    if !dest.exists() {
        fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(format!("File/assets/{filename}"))
}

/// 保存剪贴板图片字节到 assets 目录，返回相对路径（供前端插入 Markdown）
pub fn import_clipboard_image<R: Runtime>(
    app: &AppHandle<R>,
    ext: String,
    data: Vec<u8>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("图片数据为空".into());
    }
    let ext = sanitize_ext(&ext);
    let base = paths::writable_base(app)?;
    let dir = assets_dir(&base);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 用数据 hash 做去重文件名
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let hash = format!("{:x}", hasher.finalize());
    let short = &hash[..12.min(hash.len())];
    let filename = format!("{short}.{ext}");
    let dest = dir.join(&filename);
    if !dest.exists() {
        atomic_write_asset(&dest, &data)?;
    }
    Ok(format!("File/assets/{filename}"))
}

fn sanitize_ext(ext: &str) -> String {
    let e = ext.trim().trim_start_matches('.').to_lowercase();
    match e.as_str() {
        "jpg" | "jpeg" => "jpg".to_string(),
        "png" => "png".to_string(),
        "gif" => "gif".to_string(),
        "webp" => "webp".to_string(),
        "bmp" => "bmp".to_string(),
        _ => "png".to_string(),
    }
}

pub fn resolve_local_image(base: &Path, markdown_path: &str) -> Option<PathBuf> {
    let trimmed = normalize_markdown_image_path(markdown_path);
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return None;
    }
    let relative = if trimmed.starts_with("File/assets/") {
        PathBuf::from(trimmed.trim_start_matches("File/assets/"))
    } else if trimmed.starts_with("assets/") {
        PathBuf::from(trimmed.trim_start_matches("assets/"))
    } else if trimmed.starts_with("File/") {
        return None;
    } else {
        PathBuf::from(trimmed.trim_start_matches("./"))
    };
    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return None;
    }
    let asset_root = assets_dir(base).canonicalize().ok()?;
    let candidate = asset_root.join(relative);
    let canonical = candidate.canonicalize().ok()?;
    if !canonical.starts_with(&asset_root) || !canonical.is_file() {
        return None;
    }
    Some(canonical)
}

pub fn read_asset_bytes(path: &Path) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

fn mime_from_ext(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

pub fn asset_display_url(base: &Path, markdown_path: &str) -> Result<String, String> {
    let path = resolve_local_image(base, markdown_path)
        .ok_or_else(|| format!("无法解析资源路径：{markdown_path}"))?;
    let bytes = read_asset_bytes(&path)?;
    let mime = mime_from_ext(&path);
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn overwrite_asset<R: Runtime>(
    app: &AppHandle<R>,
    markdown_path: String,
    data_base64: String,
) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let bytes = STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("图片数据无效：{e}"))?;
    let base = paths::writable_base(app)?;
    let path = resolve_local_image(&base, &markdown_path)
        .ok_or_else(|| format!("无法解析资源路径：{markdown_path}"))?;
    atomic_write_asset(&path, &bytes)
}

/// 从 markdown 图片链接中提取纯路径（去掉可选 title 部分）
pub fn normalize_markdown_image_path(raw: &str) -> String {
    raw.trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string()
}

/// 从远程 URL 下载图片并覆盖本地 assets 文件（用于还原涂鸦前的原始图片）
pub fn download_and_overwrite<R: Runtime>(
    app: &AppHandle<R>,
    url: String,
    markdown_path: String,
) -> Result<(), String> {
    let url = validate_download_url(&url)?;
    let base = paths::writable_base(app)?;
    let dest = resolve_local_image(&base, &markdown_path)
        .ok_or_else(|| format!("无法解析本地路径：{markdown_path}"))?;

    const MAX_ASSET_BYTES: u64 = 20 * 1024 * 1024;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败：{e}"))?;

    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("下载图片失败：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("图床返回错误：{}", resp.status()));
    }

    if let Some(content_length) = resp.content_length() {
        if content_length > MAX_ASSET_BYTES {
            return Err("图片文件过大".into());
        }
    }
    use std::io::Read;
    let mut bytes = Vec::new();
    resp.take(MAX_ASSET_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("读取图片数据失败：{e}"))?;
    if bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err("图片文件过大".into());
    }
    if !is_supported_image_bytes(&bytes) {
        return Err("下载内容不是受支持的图片格式".into());
    }
    atomic_write_asset(&dest, &bytes).map_err(|error| format!("写入本地文件失败：{error}"))
}

fn is_supported_image_bytes(bytes: &[u8]) -> bool {
    bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.starts_with(&[0xff, 0xd8, 0xff])
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || (bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP")
        || bytes.starts_with(b"BM")
}

fn validate_download_url(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.len() <= "https://".len() || !value.starts_with("https://") {
        return Err("远程图片地址必须使用 HTTPS".into());
    }
    Ok(value.to_string())
}
