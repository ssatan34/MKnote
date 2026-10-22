# Quick Pocket v4.1.3 验收交接

日期：2026-07-21

## 结论

多 Quick Pocket 功能已通过验收，并合并到 `main` 主线。

## 功能边界

- 默认 Pocket 继续使用 `inbox/Quick Pocket.md`，ID 为 `default`，不迁移、不改名、不删除。
- 新 Pocket 在项目设置的 Quick Pocket 板块中创建、重命名和删除，名称最多 6 个字符。
- 每个新 Pocket 使用稳定 ID 对应独立 Markdown 文件，条目、标签、分组、排序和窗口状态彼此隔离。
- 左下角选择器仅用于打开已有 Pocket，不显示内部 ID，宽度为 130px，点击外部或失去窗口焦点后关闭。
- Pocket 独立窗口及程序内回退面板的左上角标题显示 Pocket 的显示名称。
- 创建 Pocket 支持 Enter 和设置面板中的 `Save` 按钮；重命名支持双击条目后使用 `Save` 保存，失焦取消。
- 设置面板中的非默认 Pocket 在删除按钮左侧提供复制 ID 按钮，复用 Quick Pocket 的复制反馈图标；点击后复制内部 ID，并短暂显示复制成功状态。
- Pocket 管理条目保持原有整行悬浮背景高亮；复制按钮本身不显示额外底色，仅在鼠标悬浮复制按钮时让复制图标线条变为主题强调色。

## YASB 按 ID 直达

创建 Pocket 后，在项目设置中查看该 Pocket 的内部 ID（例如 `p_123456789`）。YASB 图标可以直接执行：

```yaml
on_left: 'exec "C:\\MDnote\\MarkdownStickyNote.exe" --toggle-quick-pocket=p_123456789'
```

也支持空格分隔的写法：

```text
MarkdownStickyNote.exe --toggle-quick-pocket p_123456789
```

使用 `--quick-pocket=p_123456789` 可只打开或聚焦窗口，不执行显示/隐藏切换。Pocket ID 必须使用内部 ID，不能使用显示名称；不带 ID 时仍然操作默认 Pocket。

## 验证记录

- `npm.cmd run test:quick-pocket`：25/25 通过。
- `npm.cmd run build`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过；仅有项目既有 Rust 警告。
- `npm.cmd run build:green`：通过并生成绿色便携 ZIP。
- 未运行 MSI/NSIS 安装包构建。

## 发布产物

- 绿色目录：`portable-release/`
- 带时间戳 ZIP：`MKnote-portable-v4.1.3-*.zip`
- 绿色目录仅包含 `MarkdownStickyNote.exe` 与 `README.txt`。
