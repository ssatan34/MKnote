use crate::{assets, notes, paths, AppConfig};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UploadTarget {
    None,
    Siyuan,
    Obsidian,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictPolicy {
    #[default]
    Rename,
    Overwrite,
}

pub fn effective_target(config: &AppConfig) -> UploadTarget {
    config.note_upload_target.unwrap_or_else(|| {
        if [
            &config.siyuan_api_url,
            &config.siyuan_api_token,
            &config.siyuan_notebook_id,
        ]
        .iter()
        .all(|value| value.as_deref().is_some_and(|s| !s.trim().is_empty()))
        {
            UploadTarget::Siyuan
        } else {
            UploadTarget::None
        }
    })
}

fn configured_dir(value: Option<&str>, label: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value.unwrap_or("").trim());
    if !path.is_absolute() || !path.is_dir() {
        return Err(format!("请选择有效的{label}文件夹"));
    }
    path.canonicalize()
        .map_err(|e| format!("无法访问{label}文件夹：{e}"))
}

#[tauri::command]
pub fn set_note_upload_config(
    target: UploadTarget,
    note_dir: Option<String>,
    attachment_dir: Option<String>,
    conflict: Option<ConflictPolicy>,
) -> Result<AppConfig, String> {
    crate::update_config(|config| apply_config(config, target, note_dir, attachment_dir, conflict))
}

fn apply_config(
    config: &mut AppConfig,
    target: UploadTarget,
    note_dir: Option<String>,
    attachment_dir: Option<String>,
    conflict: Option<ConflictPolicy>,
) -> Result<(), String> {
    if let Some(value) = note_dir {
        config.obsidian_note_dir = Some(value.trim().into());
    }
    if let Some(value) = attachment_dir {
        config.obsidian_attachment_dir = Some(value.trim().into());
    }
    if let Some(value) = conflict {
        config.obsidian_conflict = value;
    }
    if target == UploadTarget::Obsidian {
        let note = configured_dir(config.obsidian_note_dir.as_deref(), "笔记目标")?;
        let attachment = configured_dir(config.obsidian_attachment_dir.as_deref(), "附件存放")?;
        relative_url(&note, &attachment)?;
    }
    if target == UploadTarget::Siyuan
        && [
            &config.siyuan_api_url,
            &config.siyuan_api_token,
            &config.siyuan_notebook_id,
        ]
        .iter()
        .any(|v| v.as_deref().is_none_or(|s| s.trim().is_empty()))
    {
        return Err("请先保存思源 API 地址、Token 和目标笔记本".into());
    }
    config.note_upload_target = Some(target);
    Ok(())
}

#[derive(Serialize)]
pub struct ObsidianUploadResult {
    pub path: String,
    pub overwritten: bool,
}

#[tauri::command]
pub async fn obsidian_upload_current_note(
    app: tauri::AppHandle,
    zone: String,
    name: String,
    root_default: bool,
) -> Result<ObsidianUploadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = crate::load_config()?;
        let base = paths::writable_base(&app)?;
        let zone = paths::parse_zone(&zone)?;
        ensure_allowed(&config, &base, &zone, &name)?;
        // read_note validates the source filename before any destination write.
        let (markdown, source) = if root_default {
            if zone != paths::NoteZone::Default || name != notes::DEFAULT_NOTE_NAME {
                return Err("默认便签标识无效".into());
            }
            (
                notes::read_default_note_snapshot(&app)?.content,
                base.join(notes::DEFAULT_NOTE_NAME),
            )
        } else {
            (
                notes::read_note_at(&base, &config, zone.clone(), &name)?,
                zone.dir(&config, &base).join(&name),
            )
        };
        let source = source.canonicalize().map_err(|e| e.to_string())?;
        let note_dir = configured_dir(config.obsidian_note_dir.as_deref(), "笔记目标")?;
        let attachment_dir = configured_dir(config.obsidian_attachment_dir.as_deref(), "附件存放")?;
        export_note(
            &base,
            &source,
            &markdown,
            &note_dir,
            &attachment_dir,
            config.obsidian_conflict,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn ensure_allowed(
    config: &AppConfig,
    base: &Path,
    zone: &paths::NoteZone,
    name: &str,
) -> Result<(), String> {
    if effective_target(config) != UploadTarget::Obsidian {
        return Err("Obsidian 上传未启用".into());
    }
    if *zone == paths::NoteZone::Private || notes::is_privacy_note(base, zone, name)? {
        return Err("隐私便签不能上传".into());
    }
    Ok(())
}

// Serializes uploads from this process; exclusive file creation also protects against other writers.
static EXPORT_LOCK: Mutex<()> = Mutex::new(());

fn numbered_path(original: &Path, number: usize) -> PathBuf {
    if number == 0 {
        return original.to_path_buf();
    }
    let stem = original.file_stem().unwrap_or_default().to_string_lossy();
    let extension = original
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    original.with_file_name(format!("{stem} ({number}){extension}"))
}

fn relative_url(from: &Path, to: &Path) -> Result<String, String> {
    let from: Vec<_> = from.components().collect();
    let to: Vec<_> = to.components().collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    if common == 0 {
        return Err("笔记与附件文件夹必须位于同一磁盘，以便生成相对路径".into());
    }
    let mut segments = vec!["..".into(); from.len() - common];
    segments.extend(to[common..].iter().map(|part| {
        // Encode each component, keeping directory separators intact.
        utf8_percent_encode(&part.as_os_str().to_string_lossy(), NON_ALPHANUMERIC).to_string()
    }));
    Ok(if segments.is_empty() {
        ".".into()
    } else {
        segments.join("/")
    })
}

fn local_resource(
    base: &Path,
    source: &Path,
    url: &str,
    image: bool,
) -> Result<Option<PathBuf>, String> {
    if url.starts_with('#') || url.starts_with("//") {
        return Ok(None);
    }
    let path_part = url.split(['#', '?']).next().unwrap_or(url);
    if let Some(colon) = path_part.find(':') {
        if colon != 1 || !path_part.as_bytes()[0].is_ascii_alphabetic() {
            return Ok(None);
        }
    }
    let decoded = percent_encoding::percent_decode_str(path_part)
        .decode_utf8()
        .map_err(|e| format!("附件路径编码无效：{e}"))?;
    if !image
        && Path::new(decoded.as_ref())
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
    {
        return Ok(None);
    }
    // The existing display resolver strips at whitespace to allow Markdown titles;
    // this parser already separates titles, so keep spaces in actual filenames.
    let normalized = decoded.replace('\\', "/");
    let asset_relative = normalized
        .strip_prefix("File/assets/")
        .or_else(|| normalized.strip_prefix("assets/"));
    let asset = if let Some(relative) = asset_relative {
        let root = assets::assets_dir(base)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let path = root
            .join(relative)
            .canonicalize()
            .map_err(|_| format!("本地附件不存在：{url}"))?;
        if !path.starts_with(root) {
            return Err(format!("附件路径超出本地资源目录：{url}"));
        }
        Some(path)
    } else {
        assets::resolve_local_image(base, &decoded)
    };
    let candidate =
        asset.unwrap_or_else(|| source.parent().unwrap().join(decoded.replace('\\', "/")));
    if !candidate.is_file() {
        return Err(format!("本地附件不存在：{url}"));
    }
    candidate
        .canonicalize()
        .map(Some)
        .map_err(|e| e.to_string())
}

// The parser supplies only actual links/images, excluding code and escaped examples.
// Replace each resource use with an inline link, including reference-style uses.
struct ResourceLink {
    span: std::ops::Range<usize>,
    url: String,
    image: bool,
    title: String,
    raw: bool,
}

fn resource_links(markdown: &str) -> Result<Vec<ResourceLink>, String> {
    let html_attributes = regex::Regex::new(r#"(?i)\b(src|href)\s*=\s*["']([^"']*)["']"#)
        .map_err(|e| e.to_string())?;
    let mut links = Vec::new();
    for (event, span) in Parser::new_ext(
        markdown,
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_WIKILINKS,
    )
    .into_offset_iter()
    {
        let (url, title, image) = match event {
            Event::Start(Tag::Image {
                dest_url, title, ..
            }) => (dest_url, title, true),
            Event::Start(Tag::Link {
                dest_url,
                title,
                link_type,
                ..
            }) => {
                // Wiki links to other notes stay independent of this single-note export.
                if matches!(link_type, LinkType::WikiLink { .. })
                    && Path::new(dest_url.as_ref()).extension().is_none()
                {
                    continue;
                }
                (dest_url, title, false)
            }
            Event::Html(_) | Event::InlineHtml(_) => {
                for captures in html_attributes.captures_iter(&markdown[span.clone()]) {
                    let url = captures.get(2).unwrap();
                    links.push(ResourceLink {
                        span: span.start + url.start()..span.start + url.end(),
                        url: url.as_str().into(),
                        image: captures[1].eq_ignore_ascii_case("src"),
                        title: String::new(),
                        raw: true,
                    });
                }
                continue;
            }
            _ => continue,
        };
        links.push(ResourceLink {
            span,
            url: url.into_string(),
            image,
            title: title.into_string(),
            raw: false,
        });
    }
    Ok(links)
}

fn link_label(text: &str) -> Result<&str, String> {
    let start = text.find('[').ok_or("不支持的本地附件链接格式")?;
    let mut depth = 0;
    let mut escaped = false;
    for (i, c) in text[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if c == '\\' {
            escaped = true;
            continue;
        }
        if c == '[' {
            depth += 1;
        }
        if c == ']' {
            depth -= 1;
            if depth == 0 {
                return Ok(&text[start..=start + i]);
            }
        }
    }
    Err("不支持的本地附件链接格式".into())
}

fn export_note(
    base: &Path,
    source: &Path,
    markdown: &str,
    note_dir: &Path,
    attachment_dir: &Path,
    policy: ConflictPolicy,
) -> Result<ObsidianUploadResult, String> {
    let _guard = EXPORT_LOCK.lock().map_err(|e| e.to_string())?;
    relative_url(note_dir, attachment_dir)?;
    let original = note_dir.join(source.file_name().ok_or("笔记文件名无效")?);
    if original.canonicalize().is_ok_and(|p| p == source) {
        return Err("目标文件与源笔记相同，请选择其他文件夹".into());
    }
    let links = resource_links(markdown)?;
    // Resolve and read all resources before producing any files.
    let mut resources = HashMap::new();
    for link in &links {
        if let Some(path) = local_resource(base, source, &link.url, link.image)? {
            resources.insert(
                link.url.clone(),
                (path.clone(), fs::read(&path).map_err(|e| e.to_string())?),
            );
        }
    }
    let mut created = Vec::new();
    let result = (|| {
        let mut replacements = HashMap::new();
        for (url, (path, bytes)) in resources {
            let original = attachment_dir.join(path.file_name().ok_or("附件文件名无效")?);
            let mut number = 0;
            let target = loop {
                let target = numbered_path(&original, number);
                if target.is_file() && fs::read(&target).map_err(|e| e.to_string())? == bytes {
                    break target;
                }
                match fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&target)
                {
                    Ok(mut file) => {
                        created.push(target.clone());
                        file.write_all(&bytes)
                            .and_then(|_| file.sync_all())
                            .map_err(|e| e.to_string())?;
                        break target;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => number += 1,
                    Err(e) => return Err(format!("复制附件失败：{e}")),
                }
            };
            let suffix = url.find(['#', '?']).map(|i| &url[i..]).unwrap_or("");
            replacements.insert(
                url.clone(),
                format!("{}{suffix}", relative_url(note_dir, &target)?),
            );
        }
        let mut output = markdown.to_string();
        let mut edits = Vec::new();
        for link in links {
            if let Some(new_url) = replacements.get(&link.url) {
                edits.push((link, new_url.clone()));
            }
        }
        edits.sort_by_key(|(link, _)| link.span.start);
        let mut applied: Vec<(std::ops::Range<usize>, isize)> = Vec::new();
        for (link, new_url) in edits.into_iter().rev() {
            // An image may be nested inside an attachment link. Include its edited label.
            let shift: isize = applied
                .iter()
                .filter(|(span, _)| span.start >= link.span.start && span.end <= link.span.end)
                .map(|(_, delta)| delta)
                .sum();
            let end = (link.span.end as isize + shift) as usize;
            let text = &output[link.span.start..end];
            let replacement = if link.raw {
                new_url
            } else {
                let trimmed = text.trim_start_matches('!');
                let label = if trimmed.starts_with("[[") {
                    let inside = trimmed.trim_start_matches("[[").trim_end_matches("]]");
                    format!(
                        "[{}]",
                        inside
                            .split_once('|')
                            .map(|(_, alias)| alias)
                            .unwrap_or(&link.url)
                    )
                } else {
                    link_label(text)?.to_string()
                };
                let title = if link.title.is_empty() {
                    String::new()
                } else {
                    format!(
                        " \"{}\"",
                        link.title.replace('\\', "\\\\").replace('"', "\\\"")
                    )
                };
                format!(
                    "{}{label}(<{new_url}>{title})",
                    if link.image { "!" } else { "" }
                )
            };
            let delta = replacement.len() as isize - (end - link.span.start) as isize;
            output.replace_range(link.span.start..end, &replacement);
            applied.push((link.span, delta));
        }
        let mut number = 0;
        let target = loop {
            let target = numbered_path(&original, number);
            if policy == ConflictPolicy::Overwrite {
                break target;
            }
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
            {
                Ok(_) => {
                    created.push(target.clone());
                    break target;
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => number += 1,
                Err(e) => return Err(format!("创建目标笔记失败：{e}")),
            }
        };
        let overwritten = policy == ConflictPolicy::Overwrite && target.exists();
        notes::atomic_write_file_pub(&target, &output)?;
        Ok(ObsidianUploadResult {
            path: target.to_string_lossy().into(),
            overwritten,
        })
    })();
    if result.is_err() {
        for path in created {
            let _ = fs::remove_file(path);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        base: PathBuf,
        source: PathBuf,
        notes: PathBuf,
        attachments: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let base =
                std::env::temp_dir().join(format!("mknote-obsidian-{}", uuid::Uuid::new_v4()));
            let source = base.join("source").join("笔记.md");
            let notes = base.join("vault").join("Notes");
            let attachments = base.join("vault").join("Attachments");
            for dir in [
                source.parent().unwrap(),
                &notes,
                &attachments,
                &assets::assets_dir(&base),
            ] {
                fs::create_dir_all(dir).unwrap();
            }
            fs::write(&source, "原笔记").unwrap();
            Self {
                base,
                source: source.canonicalize().unwrap(),
                notes: notes.canonicalize().unwrap(),
                attachments: attachments.canonicalize().unwrap(),
            }
        }
        fn export(
            &self,
            content: &str,
            policy: ConflictPolicy,
        ) -> Result<ObsidianUploadResult, String> {
            export_note(
                &self.base,
                &self.source,
                content,
                &self.notes,
                &self.attachments,
                policy,
            )
        }
        fn asset(&self, name: &str, bytes: &[u8]) {
            fs::write(assets::assets_dir(&self.base).join(name), bytes).unwrap();
        }
        fn exported_links_exist(&self, output: &str, count: usize) {
            let links = resource_links(output).unwrap();
            let local: Vec<_> = links
                .iter()
                .filter(|link| link.url.starts_with("../Attachments/"))
                .collect();
            assert_eq!(local.len(), count, "{output}");
            for link in local {
                let path =
                    percent_encoding::percent_decode_str(link.url.split('#').next().unwrap())
                        .decode_utf8()
                        .unwrap();
                assert!(self.notes.join(path.as_ref()).is_file(), "{}", link.url);
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.base).unwrap();
        }
    }

    #[test]
    fn copies_latest_content_and_numbers_repeated_exports_without_changing_source() {
        let f = Fixture::new();
        let a = f.export("当前内容", ConflictPolicy::Rename).unwrap();
        let b = f.export("更新内容", ConflictPolicy::Rename).unwrap();
        let c = f.export("再次更新", ConflictPolicy::Rename).unwrap();
        assert!(a.path.ends_with("笔记.md"));
        assert!(b.path.ends_with("笔记 (1).md"));
        assert!(c.path.ends_with("笔记 (2).md"));
        assert!(!a.overwritten && !b.overwritten);
        assert_eq!(fs::read_to_string(a.path).unwrap(), "当前内容");
        assert_eq!(fs::read_to_string(&f.source).unwrap(), "原笔记");
    }

    #[test]
    fn overwrite_replaces_target_and_reports_whether_it_existed() {
        let f = Fixture::new();
        assert!(
            !f.export("first", ConflictPolicy::Overwrite)
                .unwrap()
                .overwritten
        );
        let result = f.export("latest", ConflictPolicy::Overwrite).unwrap();
        assert!(result.overwritten);
        assert_eq!(fs::read_to_string(result.path).unwrap(), "latest");
        assert_eq!(fs::read_dir(&f.notes).unwrap().count(), 1);
    }

    #[test]
    fn images_attachments_references_and_html_are_rewritten_but_code_and_network_links_stay() {
        let f = Fixture::new();
        f.asset("图片 (一).png", b"image");
        f.asset("document.pdf", b"pdf");
        let content = "正文\n![图片](<File/assets/图片 (一).png> \"说明\")\n[文件](File/assets/document.pdf#page=2)\n![ref][img]\n\n[img]: <File/assets/图片 (一).png>\n\n<img src='File/assets/图片 (一).png'>\n\n![[File/assets/document.pdf|预览]]\n\n`![example](File/assets/missing.png)`\n\n```md\n![example](File/assets/missing.png)\n```\n![web](https://example.test/a.png)\n[[其他笔记]]\n[笔记](other.md)\n";
        let result = f.export(content, ConflictPolicy::Rename).unwrap();
        let output = fs::read_to_string(result.path).unwrap();
        f.exported_links_exist(&output, 5);
        assert!(output.contains("\"说明\""));
        assert!(output.contains("#page=2"));
        assert!(output.contains("`![example](File/assets/missing.png)`"));
        assert!(output.contains("```md\n![example](File/assets/missing.png)\n```"));
        assert!(output.contains("https://example.test/a.png"));
        assert!(output.contains("[[其他笔记]]"));
        assert!(output.contains("[笔记](other.md)"));
        assert_eq!(fs::read_dir(&f.attachments).unwrap().count(), 2);
    }

    #[test]
    fn same_content_is_reused_and_different_content_is_renamed() {
        let f = Fixture::new();
        f.asset("a.png", b"new");
        fs::write(f.attachments.join("a.png"), b"existing").unwrap();
        let first = f
            .export("![](File/assets/a.png)", ConflictPolicy::Rename)
            .unwrap();
        let second = f
            .export("![](File/assets/a.png)", ConflictPolicy::Rename)
            .unwrap();
        assert_eq!(
            fs::read_to_string(first.path).unwrap(),
            fs::read_to_string(second.path).unwrap()
        );
        assert_eq!(fs::read(f.attachments.join("a.png")).unwrap(), b"existing");
        assert_eq!(fs::read(f.attachments.join("a (1).png")).unwrap(), b"new");
        assert_eq!(fs::read_dir(&f.attachments).unwrap().count(), 2);
    }

    #[test]
    fn missing_resource_leaves_existing_target_and_attachment_directory_unchanged() {
        let f = Fixture::new();
        f.asset("good.png", b"good");
        fs::write(f.notes.join("笔记.md"), "existing").unwrap();
        assert!(f
            .export(
                "![](File/assets/good.png) ![](File/assets/missing.png)",
                ConflictPolicy::Overwrite
            )
            .is_err());
        assert_eq!(
            fs::read_to_string(f.notes.join("笔记.md")).unwrap(),
            "existing"
        );
        assert_eq!(fs::read_dir(&f.attachments).unwrap().count(), 0);
    }

    #[test]
    fn note_write_failure_removes_only_new_attachments() {
        let f = Fixture::new();
        f.asset("good.png", b"good");
        fs::create_dir(f.notes.join("笔记.md")).unwrap();
        fs::write(f.attachments.join("keep.txt"), "keep").unwrap();
        assert!(f
            .export("![](File/assets/good.png)", ConflictPolicy::Overwrite)
            .is_err());
        assert_eq!(fs::read_dir(&f.attachments).unwrap().count(), 1);
        assert_eq!(
            fs::read_to_string(f.attachments.join("keep.txt")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn nested_image_and_attachment_links_both_point_to_exported_resources() {
        let f = Fixture::new();
        f.asset("a.png", b"image");
        f.asset("b.pdf", b"pdf");
        let result = f
            .export(
                "[![alt](File/assets/a.png)](File/assets/b.pdf)",
                ConflictPolicy::Rename,
            )
            .unwrap();
        f.exported_links_exist(&fs::read_to_string(result.path).unwrap(), 2);
    }

    #[test]
    fn percent_encoded_and_note_relative_attachments_are_copied() {
        let f = Fixture::new();
        fs::write(f.source.parent().unwrap().join("a b.pdf"), b"pdf").unwrap();
        let result = f
            .export("[附件](a%20b.pdf)", ConflictPolicy::Rename)
            .unwrap();
        f.exported_links_exist(&fs::read_to_string(result.path).unwrap(), 1);
    }

    #[test]
    fn identical_source_target_is_rejected_for_both_policies() {
        let f = Fixture::new();
        for policy in [ConflictPolicy::Rename, ConflictPolicy::Overwrite] {
            assert!(export_note(
                &f.base,
                &f.source,
                "changed",
                f.source.parent().unwrap(),
                &f.attachments,
                policy
            )
            .is_err());
        }
        assert_eq!(fs::read_to_string(&f.source).unwrap(), "原笔记");
    }

    #[test]
    fn old_configuration_preserves_siyuan_but_explicit_disable_takes_precedence() {
        let mut config = AppConfig::default();
        config.siyuan_api_url = Some("http://127.0.0.1:6806".into());
        config.siyuan_api_token = Some("fixture-token".into());
        config.siyuan_notebook_id = Some("fixture-notebook".into());
        let mut old = serde_json::to_value(&config).unwrap();
        old.as_object_mut().unwrap().remove("note_upload_target");
        let mut config: AppConfig = serde_json::from_value(old).unwrap();
        assert_eq!(effective_target(&config), UploadTarget::Siyuan);
        config.siyuan_notebook_id = None;
        assert_eq!(effective_target(&config), UploadTarget::None);
        config.siyuan_notebook_id = Some("fixture-notebook".into());
        config.note_upload_target = Some(UploadTarget::None);
        assert_eq!(effective_target(&config), UploadTarget::None);
    }

    #[test]
    fn settings_switch_exclusively_and_preserve_both_platform_configurations() {
        let f = Fixture::new();
        let mut config = AppConfig::default();
        config.siyuan_api_url = Some("http://127.0.0.1:6806".into());
        config.siyuan_api_token = Some("fixture-token".into());
        config.siyuan_notebook_id = Some("fixture-notebook".into());
        apply_config(
            &mut config,
            UploadTarget::Obsidian,
            Some(f.notes.to_string_lossy().into()),
            Some(f.attachments.to_string_lossy().into()),
            Some(ConflictPolicy::Overwrite),
        )
        .unwrap();
        assert_eq!(effective_target(&config), UploadTarget::Obsidian);
        apply_config(&mut config, UploadTarget::Siyuan, None, None, None).unwrap();
        assert_eq!(effective_target(&config), UploadTarget::Siyuan);
        assert_eq!(config.obsidian_conflict, ConflictPolicy::Overwrite);
        assert!(config.obsidian_note_dir.is_some());
        apply_config(&mut config, UploadTarget::None, None, None, None).unwrap();
        assert_eq!(effective_target(&config), UploadTarget::None);
        assert_eq!(config.siyuan_api_token.as_deref(), Some("fixture-token"));
    }

    #[test]
    fn disabled_or_private_notes_are_refused_and_invalid_directories_cannot_enable() {
        let f = Fixture::new();
        let mut config = AppConfig::default();
        assert!(ensure_allowed(&config, &f.base, &paths::NoteZone::Default, "笔记.md").is_err());
        assert!(apply_config(
            &mut config,
            UploadTarget::Obsidian,
            Some("missing".into()),
            None,
            None
        )
        .is_err());
        assert_eq!(effective_target(&config), UploadTarget::None);
        config.note_upload_target = Some(UploadTarget::Obsidian);
        assert!(ensure_allowed(&config, &f.base, &paths::NoteZone::Private, "笔记.md").is_err());
        fs::write(
            paths::file_root_path(&f.base).join(".mknote-note-colors.json"),
            r#"{"notes":{"default::笔记.md":"隐私"}}"#,
        )
        .unwrap();
        assert!(ensure_allowed(&config, &f.base, &paths::NoteZone::Default, "笔记.md").is_err());
    }
}
