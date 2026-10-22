# Quick Todo Stage C 验收交接

- 日期：2026-07-12
- 交出方：Codex
- 接手方：下一窗口的 Codex
- 当前状态：Stage C 已由用户验收；不进入 Stage D
- 交接目标：保存当前 Quick Todo 独立窗口的实现事实、验证证据和产品收口决策。

## 一句话状态

Quick Todo 已成为唯一的独立窗口：YASB 可通过 `md-sticky-note.exe --toggle-quick-todo` 切换它的显示；窗口支持置顶、持久化锁定、未完成/已完成互斥视图、二次确认清空已完成项、标签与稳定拖拽排序。用户已验收 Stage C，并确认 YASB 直接入口已实现设计初衷；不再进入 Stage D。

## 已完成事实

- 入口：`--quick-todo` 保持“打开或聚焦”；`--toggle-quick-todo` 在唯一窗口显示时隐藏、隐藏时恢复并聚焦，且不退出主程序。
- 窗口：label 固定为 `quick-todo`，默认 `440×520`，保存/恢复位置、尺寸、显示器、DPI、置顶和锁定状态；关闭仅保存并隐藏。
- 数据：`inbox/Quick Todo.md` 是唯一真相源；新增、完成/取消、标签、删除、拖拽排序、清空已完成均通过 Rust Markdown 模型与一次变化事件同步。
- 视图：右上顺序为置顶、锁定、已完成、关闭；默认只显示未完成项；已完成视图底部右侧提供二次确认的清空按钮；单项删除仍保留。
- 锁定：与置顶独立；锁定时 Rust 设置不可 resize，Shell 移除标题拖拽区域；重启后保持。
- 程序内 popover 保留默认未完成视图与同一 controller，未形成第二套数据状态。

## 关键文件

| 路径 | 状态 | 用途 |
|---|---|---|
| `src-tauri/src/quick_todo.rs` | 已完成 | Markdown 解析、写入、清空已完成 command |
| `src-tauri/src/quick_todo_window.rs` | 已完成 | 唯一窗口、几何、置顶、锁定、隐藏/恢复 |
| `src-tauri/src/system.rs` | 已完成 | CLI action、单实例二次启动分发 |
| `src/components/QuickTodoShell.tsx` | 已完成 | 窗口专属按钮、视图和确认状态 |
| `src/components/QuickTodoPanel.tsx` | 已完成 | 共享 Panel、筛选、底部插槽和稳定拖拽 |
| `src/hooks/useQuickTodoController.ts` | 已完成 | 共享加载、事件订阅与列表动作 |
| `docs/superpowers/specs/2026-07-12-quick-todo-lock-and-completed-view-design.md` | 已确认 | 锁定与已完成视图规格 |

## 验证状态

| 验证项 | 结果 | 证据 |
|---|---|---|
| Rust 测试 | 通过 | `cargo test --manifest-path src-tauri\Cargo.toml`：47 passed |
| Quick Todo 测试 | 通过 | `npm.cmd run test:quick-todo`：33 passed |
| 前端生产构建 | 通过 | `npm.cmd run build` |
| 差异检查 | 通过 | `git diff --check` |
| Tauri release | 通过 | `src-tauri/target/release/md-sticky-note.exe`，v3.4.0，2026-07-12 01:20:44 |
| 人工验收 | 通过 | 用户确认“quick todo可以验收” |

## 产品收口决策

不实施 Stage D。以下能力不再进入 Quick Todo 范围：顶部停靠、悬停展开、点击穿透、YASB 避让和 Capsule/Popout 接入。YASB 的 `--toggle-quick-todo` 入口已实现直接打开、隐藏和重新聚焦唯一 Quick Todo 窗口的设计目标。

## 安全边界

- 不恢复“今天”功能或输入提交按钮。
- 不复制 `QuickTodoPanel`、controller 或 Markdown 状态。
- 不改变 `--quick-todo`、`--toggle-quick-todo`、单实例、窗口 label 或本阶段已验收的锁定/视图行为。
- 后续新增 Quick Todo 能力必须另有用户确认的规格与计划，不能以本次已取消的 Stage D 为依据。
