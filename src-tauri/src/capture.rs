use crate::notes::{self, NoteSummary};
use crate::paths::NoteZone;
use arboard::Clipboard;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Runtime};

static LAST_CLIPBOARD_INBOX_MS: AtomicU64 = AtomicU64::new(0);

fn clipboard_inbox_debounce_ok() -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_CLIPBOARD_INBOX_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < 2000 {
        return false;
    }
    LAST_CLIPBOARD_INBOX_MS.store(now, Ordering::Relaxed);
    true
}

pub fn quick_capture_create<R: Runtime>(
    app: &AppHandle<R>,
    content: &str,
) -> Result<NoteSummary, String> {
    let text = content.trim();
    if text.is_empty() {
        return Err("内容不能为空".into());
    }
    let note = notes::create_note_with_content(app, NoteZone::Inbox, text)?;
    let _ = crate::agent_index::refresh(app);
    let _ = app.emit("mknote:capture-created", &note);
    Ok(note)
}

pub fn clipboard_inbox<R: Runtime>(app: &AppHandle<R>) -> Result<NoteSummary, String> {
    if !clipboard_inbox_debounce_ok() {
        return Err("剪贴板收集操作过于频繁，请稍后再试".into());
    }
    let mut clipboard = Clipboard::new().map_err(|e| format!("无法读取剪贴板：{e}"))?;
    let text = clipboard
        .get_text()
        .map_err(|e| format!("剪贴板无文本内容：{e}"))?;
    quick_capture_create(app, &text)
}
