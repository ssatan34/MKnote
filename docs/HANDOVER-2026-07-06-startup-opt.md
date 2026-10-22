# 交接记录 2026-07-06（启动性能优化）

## 背景

用户反馈应用打开速度慢，存在明显白屏时间。本轮针对启动路径做了系统性分析与修复，涉及 4 个文件、5 个独立问题。

---

## 问题根因分析

### 问题 1：窗口在 WebView 加载前就显示（白屏直接原因）

`tauri.conf.json` 中 `"visible": true`，导致窗口在 WebView 进程启动时立即弹出，此时 HTML/CSS/JS 尚未加载完成，背景为系统默认白色。

### 问题 2：`get_app_state` 在主线程同步执行大量清理操作

每次启动顺序执行：目录扫描删 `.tmp` 文件、遍历笔记判断是否为空并移入回收站、写入待办模板、写入默认笔记、写入 8 个内置模板文件。这些操作全部完成后前端才能收到响应。

### 问题 3：`prune_stale_config_refs` 每个 tab 各读一次磁盘

验证每个已保存 tab 是否还存在时，调用 `note_exists()`，内部每次都执行 `writable_base()` + `load_config()`（读 config.json）。5 个 tab = 5 次重复磁盘 IO。

### 问题 4：`restoreTabsFromConfig` 串行等待每个 tab

```typescript
for (const ref of saved ?? []) {
  await invoke("read_note", ...)    // 等待
  await resolveNoteTitle(...)       // → 再 await invoke("list_notes", ...)
}
```
N 个 tab = N × 2 次串行 IPC，每次有固定进程间通信开销。

### 问题 5：`list_folders` 对每个文件夹调一次 `list_zone()` 统计数量

`list_zone()` 内部会加载颜色元数据文件（`.mknote-note-colors.json`），每个文件夹调一次。启动时 `refreshAll` 触发 `list_folders`，N 个文件夹 = N 次完整目录遍历 + N 次元数据读取。

---

## 修复内容

### 修复 1：消除白屏（`tauri.conf.json` + `src/App.tsx`）

**`tauri.conf.json`**：将 `"visible": true` 改为 `"visible": false`，窗口创建时保持隐藏。

**`src/App.tsx`**：新增独立 `useEffect`，在 `loading` 状态变为 `false` 之后的下一个渲染帧才调用 `invoke("show_window")`：

```typescript
const windowShownRef = useRef(false);
useEffect(() => {
  if (loading || windowShownRef.current) return;
  windowShownRef.current = true;
  void invoke("show_window");
}, [loading]);
```

用 `windowShownRef` 保证只触发一次（窗口二次唤起走的是 Rust 侧 `show_main_window`，不受影响）。

同时从初始化 async 流程中移除了原来的 `void invoke("show_window")` 直接调用（那个位置 React 重渲染还在队列里，DOM 尚未更新）。

**时序变化：**
```
之前：进程启动 → 窗口显示(白屏) → WebView加载 → React渲染 → 内容出现
之后：进程启动 → WebView加载 → React渲染完成 → 窗口显示(直接有内容)
```

---

### 修复 2：清理操作移到后台线程（`src-tauri/src/lib.rs`）

`get_app_state` 只保留必须在返回前完成的操作（`prune_stale_config_refs`、`sanitize_window_geometry`、`persist_compact_layout`），其余全部移到 `spawn_blocking` 后台线程：

```rust
// 后台线程，不阻塞响应
tauri::async_runtime::spawn_blocking(move || {
    notes::cleanup_stale_tmp(&app_bg);
    notes::prune_empty_default_notes(&app_bg);
    let _ = notes::ensure_todo_note(&app_bg);
    let _ = notes::ensure_default_note(&app_bg);
    let _ = templates::ensure_builtin_templates(&app_bg);
});
```

---

### 修复 3：`prune_stale_config_refs` 消除重复磁盘 IO（`src-tauri/src/notes.rs`）

新增 `note_exists_at(base, zone, name)` 内联函数，直接拼接路径做 `is_file()` 检查，不依赖 `AppConfig`（因为 `resolve_inbox_dir`/`resolve_data_dir` 实际上不使用 config 字段，路径完全由 `base` 决定）。

`prune_stale_config_refs` 只调一次 `writable_base()`，所有 tab 复用同一个 `base`。N 个 tab 从 N 次磁盘 IO 降为 1 次。

---

### 修复 4：`restoreTabsFromConfig` 改并行（`src/App.tsx`）

将串行 `for...await` 改为 `Promise.allSettled` 并行：

```typescript
const results = await Promise.allSettled(
  candidates.map(async (ref) => {
    const [, noteList] = await Promise.all([
      invoke<string>("read_note", { zone: ref.zone, name: ref.name }),
      invoke<NoteSummary[]>("list_notes", { zone: ref.zone }),
    ]);
    const title = noteList.find((n) => n.name === ref.name)?.title ?? titleFromName(ref.name);
    return { zone: ref.zone as NoteZone, name: ref.name, title };
  }),
);
```

每个 tab 的 `read_note` + `list_notes` 同时发出，所有 tab 并行等待。5 个 tab 从串行约数百 ms 降为 1 轮并行往返。同时删除了不再使用的 `resolveNoteTitle` 函数。

---

### 修复 5：`list_folders` 轻量计数（`src-tauri/src/notes.rs`）

新增 `count_md_files(dir)` 函数，仅做 `read_dir` + 后缀过滤，不加载颜色元数据：

```rust
fn count_md_files(dir: &std::path::Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| entries.flatten()
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"))
            .count())
        .unwrap_or(0)
}
```

`list_folders` 改用此函数替代 `list_zone(app, zone)?.len()`，N 个文件夹从 N 次重量遍历降为 N 次轻量计数。

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src-tauri/tauri.conf.json` | `visible: true` → `visible: false` |
| `src-tauri/src/lib.rs` | `get_app_state` 清理操作移入 `spawn_blocking` |
| `src-tauri/src/notes.rs` | 新增 `note_exists_at`、`count_md_files`；重写 `prune_stale_config_refs`、`list_folders` |
| `src/App.tsx` | `restoreTabsFromConfig` 改并行；移除 `resolveNoteTitle`；`show_window` 改为 `useEffect` 触发 |

## 当前状态

`cargo check` 零错误，`tsc --noEmit` 零错误，已用户验证白屏消除。
