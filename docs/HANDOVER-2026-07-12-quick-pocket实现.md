# Quick Pocket 实现交接（2026-07-12）

## 当前状态

Quick Pocket 已完成实现、图标细化和 release 构建，当前代码与打包产物可用于本机窗口及 YASB 人工验收。

## 已实现

- 独立 `quick-pocket` Tauri 窗口，默认 440×560，最小 360×320。
- 独立配置字段：`quick_pocket_geometry`、`quick_pocket_monitor_name`、`quick_pocket_always_on_top`、`quick_pocket_locked`。
- CLI：`--quick-pocket`、`--toggle-quick-pocket`。
- Quick Pocket Markdown 文件：`inbox/Quick Pocket.md`。
- 受管理 block 的增删改排，未知 Markdown 和相邻正文保留。
- 顶部展开输入区、双击编辑、单行摘要省略、隐私列表态打码、复制内文、删除二次确认。
- 标签 icon 占位：文本、命令/代码、路径、隐私；命令/代码使用绿色 token。
- YASB `mdnote_quick_pocket` widget 已添加到 center 组，紧邻现有 Quick Todo widget。
- 输入/编辑区：`Enter` 保存，`Shift+Enter` 换行，失焦自动保存并退出输入态；取消/保存/添加按钮已移除。
- Quick Todo 与 Quick Pocket 的失焦会先 flush 当前输入，再关闭窗口或 popover。
- Pocket 拖拽改为本地预览、pointerup 单次持久化；Todo/Pocket 行使用统一 motion token。
- 已存在窗口的再次显示路径不重复调用置顶/resize 原生 setter，减少点击到显示的延迟。
- Todo/Pocket 窗口标题图标使用当前主题高亮色；Todo 完成控件使用独立 `check2.svg` / `done3.svg`，按钮不再叠加额外圆形边框。
- Todo 标签颜色固定为重要红色、等待黄色、下一步蓝色、想法紫色；Pocket 内文摘要继承条目标签颜色。
- Quick Pocket 专用图标与其他功能隔离，专用锁定图标内部 ID 为 `quick_lock_closed2`。

## 验证证据

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run test:quick-todo
npm.cmd run test:quick-pocket
npm.cmd run build
npm.cmd run tauri -- build
```

已通过：Rust 55 项、Quick Pocket 4 项、Quick Todo 33 项、前端生产构建、Tauri release 构建。release exe：`src-tauri/target/release/md-sticky-note.exe`。

YASB 配置需人工点击确认：左键点击 `mdnote_quick_pocket` 后，窗口应首次显示，重复点击隐藏/显示；窗口关闭按钮只隐藏；置顶、锁定、重启恢复和复制内文需实际操作验证。

绿色便携版若放在 `C:\MDnote`，YASB 两个 widget 的左键命令应分别使用：

```yaml
on_left: 'exec "C:\MDnote\md-sticky-note.exe" --toggle-quick-todo'
on_left: 'exec "C:\MDnote\md-sticky-note.exe" --toggle-quick-pocket'
```

## 后续人工验收

- 检查四个主题的标签颜色对比度和截图中的实际视觉比例。
- 验证多显示器、不同 DPI、离屏夹紧和重启恢复。
- 验证被动文件变化不会弹出或抢前台。
- 对比优化前后的首次点击显示速度，以及窗口失焦保存/关闭行为。
