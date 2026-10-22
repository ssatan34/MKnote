use crate::{
    cloudimgs, load_config,
    lsky_cleanup::{
        build_cleanup_plan, collect_markdown_references, LskyCleanupDeleteResult,
        LskyCleanupFailure, LskyCleanupImage, LskyCleanupReport, CLEANUP_PROTECTION_MS,
    },
    paths,
};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Runtime};

const MAX_DELETE_BATCH: usize = 500;

fn cleanup_credentials() -> Result<(String, String, String), String> {
    let config = load_config()?;
    if config.image_host_enabled == Some(false)
        || config.image_host_provider.as_deref().map(str::trim) != Some("cloudimgs")
    {
        return Err("云图图床上传未启用".into());
    }

    let base_url = config
        .cloudimgs_url
        .as_deref()
        .unwrap_or(cloudimgs::DEFAULT_CLOUDIMGS_URL);
    let base_url = cloudimgs::validate_base_url(base_url)?;
    let password = config
        .cloudimgs_password
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "请先配置云图访问密码".to_string())?;
    let directory = config
        .cloudimgs_directory
        .as_deref()
        .unwrap_or(cloudimgs::DEFAULT_CLOUDIMGS_DIRECTORY);
    let directory = cloudimgs::normalize_directory(directory)?;

    Ok((base_url, password, directory))
}

fn to_cleanup_image(image: cloudimgs::CloudImgsImage) -> LskyCleanupImage {
    LskyCleanupImage {
        key: image.key,
        name: image.name,
        url: image.url,
        size: image.size,
        created_at_ms: image.created_at_ms,
    }
}

fn scan_with_remote<R: Runtime>(app: &AppHandle<R>) -> Result<LskyCleanupReport, String> {
    let base = paths::writable_base(app)?;
    let references = collect_markdown_references(&base)?;
    let (base_url, password, directory) = cleanup_credentials()?;
    let images = cloudimgs::list_images(&base_url, &password, &directory)?;
    let images: Vec<LskyCleanupImage> = images.into_iter().map(to_cleanup_image).collect();
    let plan = build_cleanup_plan(
        &images,
        &references.urls,
        chrono::Utc::now().timestamp_millis(),
        CLEANUP_PROTECTION_MS,
    );

    Ok(LskyCleanupReport {
        scanned_notes: references.scanned_notes,
        referenced_urls: references.urls.len(),
        total_album_images: images.len(),
        referenced_images: plan.referenced_images,
        protected_images: plan.protected_images,
        reclaimable_bytes: plan.reclaimable_bytes,
        candidates: plan.candidates,
    })
}

#[tauri::command]
pub fn scan_cloudimgs_cleanup<R: Runtime>(app: AppHandle<R>) -> Result<LskyCleanupReport, String> {
    scan_with_remote(&app)
}

#[tauri::command]
pub fn delete_cloudimgs_cleanup<R: Runtime>(
    app: AppHandle<R>,
    keys: Vec<String>,
) -> Result<LskyCleanupDeleteResult, String> {
    if keys.is_empty() {
        return Err("没有可清理的云图图片".into());
    }
    if keys.len() > MAX_DELETE_BATCH {
        return Err(format!("单次最多清理 {MAX_DELETE_BATCH} 张图片"));
    }

    let requested: HashSet<String> = keys
        .into_iter()
        .map(|key| cloudimgs::normalize_image_key(&key))
        .collect::<Result<_, _>>()?;
    if requested.is_empty() {
        return Err("云图图片标识无效".into());
    }

    // 删除前重新扫描磁盘和远端；任何读取错误都会在首次删除前返回。
    let report = scan_with_remote(&app)?;
    let candidate_map: HashMap<String, LskyCleanupImage> = report
        .candidates
        .into_iter()
        .map(|image| (image.key.clone(), image))
        .collect();
    let (base_url, password, directory) = cleanup_credentials()?;
    let mut skipped = Vec::new();
    let mut failed = Vec::new();
    let mut deleted = 0;

    for key in &requested {
        if !candidate_map.contains_key(key) {
            skipped.push(key.clone());
            continue;
        }
        match cloudimgs::delete_image(&base_url, &password, &directory, key) {
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
