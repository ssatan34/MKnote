# Agent 指引

开发或修改 MKnote 时，按任务读取直接相关的资料；不要为文案、单文件局部修复预读整套文档。

- 主线交接按任务选择 **[docs/HANDOVER-2026-07-01.md](docs/HANDOVER-2026-07-01.md)**；预览或 Visual Editor 任务另读 **[docs/HANDOVER-2026-08-23-visual-editor.md](docs/HANDOVER-2026-08-23-visual-editor.md)**，并以当前源码、测试和文档末尾状态为准。
- 涉及产品行为或架构时读 **[docs/项目总结.md](docs/项目总结.md)**、**[docs/功能概要.md](docs/功能概要.md)**；涉及实施路径、命令或发布时再读 **[docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md)**、**[docs/AGENT-HANDOVER.md](docs/AGENT-HANDOVER.md)**。
- 改 UI 时另读 **[docs/MKnote-UI-v2.md](docs/MKnote-UI-v2.md)**、**[docs/ICON-GUIDE.md](docs/ICON-GUIDE.md)**；外部 AI 读写便签时另读 **[docs/AGENT-INTEGRATION.md](docs/AGENT-INTEGRATION.md)**。
- 本地运行：`npm install` → `npm run tauri dev`。本地测试默认使用隔离或临时 fixture，可直接运行并修复本次改动导致的失败；真实笔记、外部服务、发布、删除和 Git 提交仍需按用户明确授权执行。完成标准是直接相关检查通过并记录未验证项；构建成功不能替代行为验收。

### 交接记录时间线

| 文件 | 日期 | 主要内容 |
|------|------|---------|
| [HANDOVER-2026-06-28.md](docs/HANDOVER-2026-06-28.md) | 2026-06-28 | 核心功能完成、资料库、Tab、待办、思源 |
| [HANDOVER-2026-06-30.md](docs/HANDOVER-2026-06-30.md) | 2026-06-30 | Figma UI 优化、状态栏清理、剪贴板图片粘贴 |
| [HANDOVER-2026-07-01.md](docs/HANDOVER-2026-07-01.md) | 2026-07-01 | 状态栏重排、Tab Grid 布局、置顶数量设置、滚动条设计 |
| [HANDOVER-2026-07-02.md](docs/HANDOVER-2026-07-02.md) | 2026-07-02 | 隐私笔记、云端保险库 |
| [HANDOVER-2026-08-23-visual-editor.md](docs/HANDOVER-2026-08-23-visual-editor.md) | 2026-08-23 | Visual Editor、预览回退与验收边界 |

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
