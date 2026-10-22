# Quick Todo UI 标签 Task 1 实施报告

## 范围

仅实现 Rust 标签数据与命令：`src-tauri/src/quick_todo.rs`、`src-tauri/src/lib.rs`。未修改前端 Task 2–4 文件。

## TDD 证据

### RED

先加入 4 组行为测试：

- 旧无标签行及四种合法标签解析；
- 未知标签降级为无标签且源 Markdown 逐字保留；
- toggle 保留标签，set_tag 设置、替换、取消且只改目标行；
- add 按需序列化标签，无标签不写 `tag=`。

首次聚焦测试按预期失败，共 16 个编译错误，原因均为功能尚不存在：缺少 `QuickTodoTag`、`QuickTodoItem.tag`、`QuickTodoDocument::set_tag` 和新版 `add` 参数。

### GREEN

实现：

- `QuickTodoTag::{Important, Waiting, Next, Idea}`，serde 小写值；
- `QuickTodoItem.tag: Option<QuickTodoTag>`；
- 可选标签解析，未知值按 `None` 读取；
- 固定字段顺序：`createdAt`、`completedAt`、`tag`；
- `add(..., tag)` 与 `set_tag`；
- Tauri 命令 `quick_todo_set_tag` 及 `lib.rs` 注册；
- 所有写操作继续复用锁内重读、原子写入与成功后通知路径。

## 验证

- 聚焦：`quick_todo::tests`，11 passed，0 failed。
- 全量 Rust：33 passed，0 failed。
- 仅存在仓库既有 Rust warning，无新增编译错误。

## 兼容性说明

- 旧无标签受管行继续可读。
- 未知 `tag` 值不让该行失去可管理性；未修改时原文不变，修改该目标行时规范化并移除未知值。
- 未知 Markdown 行和非目标受管行保持原文。

## 疑虑

无阻塞疑虑。
