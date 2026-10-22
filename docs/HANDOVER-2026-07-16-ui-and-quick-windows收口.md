# 2026-07-16 UI 与 Quick 窗口收口交接

- 日期：2026-07-16
- 交出方：Codex
- 接手方：Codex / 后续开发者
- 当前状态：已完成，绿色包已生成
- 交接目标：记录本轮主窗口视觉调整、Quick Todo / Quick Pocket 交互收口及绿色包产物。

## 一句话状态

本轮已完成主窗口与 Quick 窗口的 UI 收口；Quick Todo 提醒改为独立原生设置窗口，Save 与主窗口共用同一个 `mk-save-button` 样式源，行级闹钟、子项目和关联便签操作仅在该 Todo 行悬浮、焦点进入或关联菜单打开时显示。

## 当前事实

- 已完成：Quick Todo / Quick Pocket 的输入、标签、窗口工具栏、状态栏与行级操作视觉统一；Quick Todo 支持外置提醒设置窗口、标签选择、子项目和关联笔记。
- 已完成：提醒窗口通过 `resolve_reminder_placement` 优先放在 Quick Todo 左侧，空间不足时转到右侧；主窗口 CSS 由 `QuickTodoReminderShell.tsx` 直接导入，未复制或改写原有保存按钮规则。
- 已完成：标题输入、密码输入、关闭/删除/锁定/置顶等高频控件已拆为可复用组件；主题扩展同步覆盖前端类型、token、选择器、Rust 白名单和设计文档。
- 已完成：绿色包脚本按 `package.json` 的版本号命名 ZIP，并纠正便携版 README 中已废弃的“首次创建待办模板”描述。
- 未验证：本轮所有视觉改动均未逐项进行发布 exe 的人工截图回归；应以本次绿色包进行一次人工打开检查。

## 关键决策与限制

- 提醒窗口必须继续直接使用 `src/App.css` 的 `button.mk-save-button`，不要复制一份相似 CSS，也不要修改已正确的主窗口保存按钮。
- Todo 行操作区保持固定宽度，仅调整透明度、可见性和指针事件，避免悬浮时文本或行高跳动。
- 行操作在 `.quick-todo-row:hover`、`.quick-todo-row:focus-within` 或关联菜单存在时显示，保证鼠标、键盘和已打开菜单三种路径都可用。
- Quick Todo 已通过 Stage C 验收；不要恢复 Stage D 停靠、悬停或点击穿透方案。

## 关键文件与路径

| 路径 | 状态 | 用途 |
|---|---|---|
| `src/components/QuickTodoReminderShell.tsx` | 已改 | 独立提醒窗口，导入主窗口保存按钮样式 |
| `src/components/QuickTodoReminderShell.css` | 已改 | 提醒窗口自身布局 |
| `src/components/QuickTodoPanel.tsx` | 已改 | Todo 行操作区和交互 |
| `src/components/QuickTodoPanel.css` | 已改 | Todo 行操作悬浮/焦点显示规则 |
| `src/App.css` | 已改 | 主窗口共用控件样式，含 `mk-save-button` |
| `src-tauri/src/quick_todo_window.rs` | 已改 | 提醒原生窗口创建与左右定位 |
| `scripts/pack-green.ps1` | 已改 | 绿色目录与版本化 ZIP 打包 |
| `docs/主题扩展与白名单同步记录.md` | 已有 | 新增主题的前后端同步清单 |

## 验证状态

| 验证项 | 结果 | 证据 |
|---|---|---|
| Todo 行操作显示规则 | 通过 | `node --test --test-isolation=none --test-name-pattern='Quick Todo 行操作只在悬浮、焦点或关联弹窗打开时显示' tests/quickTodo.test.ts` |
| 前端与发行构建 | 通过（含既有 Rust 警告） | `npm.cmd run tauri build` |
| 绿色便携 ZIP | 通过 | `MKnote-portable-v4.1.1-20260716-155716.zip`，仅含 `MarkdownStickyNote.exe` 与 `README.txt` |
| 差异格式 | 通过 | `git diff --check` |
| 全量 Quick Todo 旧断言 | 未全绿 | `npm.cmd run test:quick-todo` 有 6 个与当前组件重构不一致的既有文本断言，提醒窗口断言通过 |

## 接手后的第一步

1. 解压本轮绿色 ZIP，在 Windows 上打开 `MarkdownStickyNote.exe`，重点人工确认提醒窗口位置、Save 悬浮动画与 Todo 行图标显示时机。
2. 若继续改 Quick Todo，只更新当前行为对应的测试断言，不要为通过旧断言而恢复已淘汰的图标组件结构。

## 完成条件

- 绿色 ZIP 可解压并启动。
- Quick Todo 的提醒设置、保存和行操作可按上述约束工作。
- 后续变更保持 `npm.cmd run build` 与 `git diff --check` 通过。
