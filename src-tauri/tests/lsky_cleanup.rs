use md_sticky_note_lib::lsky_cleanup::{
    build_cleanup_plan, collect_markdown_references, extract_hosted_urls, LskyCleanupImage,
    CLEANUP_PROTECTION_MS,
};
use std::collections::HashSet;
use std::fs;

fn image(key: &str, url: &str, created_at_ms: i64) -> LskyCleanupImage {
    LskyCleanupImage {
        key: key.to_string(),
        name: format!("{key}.jpg"),
        url: url.to_string(),
        size: 128,
        created_at_ms,
    }
}

#[test]
fn extracts_normalized_image_urls_and_doodle_originals() {
    let markdown = r#"
![普通](https://s3.example.test/mdnote/used.jpg?cache=1)
![涂鸦](File/assets/local.png "mk-doodled|File/assets/local.png|https://s3.example.test/mdnote/original.jpg")
第三方链接：https://example.test/page。
"#;

    let urls = extract_hosted_urls(markdown);

    assert!(urls.contains("https://s3.example.test/mdnote/used.jpg"));
    assert!(urls.contains("https://s3.example.test/mdnote/original.jpg"));
    assert!(urls.contains("https://example.test/page"));
    assert_eq!(urls.len(), 3);
}

#[test]
fn scans_current_notes_and_recoverable_trash_but_excludes_history_and_templates() {
    let root = std::env::temp_dir().join(format!(
        "mknote-lsky-cleanup-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("inbox/Quick Pocket")).unwrap();
    fs::create_dir_all(root.join("File/default")).unwrap();
    fs::create_dir_all(root.join("File/.mknote-trash/entries/t1")).unwrap();
    fs::create_dir_all(root.join("File/.mknote-history/note.md")).unwrap();
    fs::create_dir_all(root.join("File/templates")).unwrap();
    fs::write(
        root.join("default-note.md"),
        "![a](https://img.test/default.jpg)",
    )
    .unwrap();
    fs::write(
        root.join("inbox/Quick Pocket/p1.md"),
        "![b](https://img.test/pocket.jpg)",
    )
    .unwrap();
    fs::write(
        root.join("File/default/note.md"),
        "![c](https://img.test/library.jpg)",
    )
    .unwrap();
    fs::write(
        root.join("File/.mknote-trash/entries/t1/deleted.md"),
        "![d](https://img.test/trash.jpg)",
    )
    .unwrap();
    fs::write(
        root.join("File/.mknote-history/note.md/version.md"),
        "![history](https://img.test/history.jpg)",
    )
    .unwrap();
    fs::write(
        root.join("File/templates/template.md"),
        "![template](https://img.test/template.jpg)",
    )
    .unwrap();
    fs::write(root.join("File/default/ignored.txt"), "https://img.test/no.jpg").unwrap();

    let scan = collect_markdown_references(&root).unwrap();

    assert_eq!(scan.scanned_notes, 4);
    assert_eq!(scan.urls.len(), 4);
    assert!(scan.urls.contains("https://img.test/trash.jpg"));
    assert!(!scan.urls.contains("https://img.test/history.jpg"));
    assert!(!scan.urls.contains("https://img.test/template.jpg"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn unreadable_markdown_aborts_the_scan_instead_of_allowing_deletion() {
    let root = std::env::temp_dir().join(format!(
        "mknote-lsky-cleanup-invalid-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("inbox")).unwrap();
    fs::write(root.join("inbox/broken.md"), [0xff, 0xfe, 0xfd]).unwrap();

    let error = collect_markdown_references(&root).unwrap_err();

    assert!(error.contains("broken.md"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn cleanup_plan_excludes_referenced_and_recent_images() {
    let day = 86_400_000;
    let now = day * 10;
    let images = vec![
        image("used", "https://img.test/used.jpg", now - day * 2),
        image("orphan", "https://img.test/orphan.jpg", now - day * 2),
        image("recent", "https://img.test/recent.jpg", now - 60_000),
    ];
    let referenced = HashSet::from(["https://img.test/used.jpg".to_string()]);

    let plan = build_cleanup_plan(&images, &referenced, now, day);

    assert_eq!(plan.candidates.len(), 1);
    assert_eq!(plan.candidates[0].key, "orphan");
    assert_eq!(plan.protected_images, 1);
    assert_eq!(plan.referenced_images, 1);
    assert_eq!(plan.reclaimable_bytes, 128);
}

#[test]
fn cleanup_protection_window_is_thirty_minutes() {
    assert_eq!(CLEANUP_PROTECTION_MS, 30 * 60 * 1000);
}
