# Quick Todo 阶段 B 实施报告

日期：2026-07-11
分支：`codex/quick-entry-rebuild-3.3`
范围：仅阶段 B（程序内 Quick Todo 面板）；未将数据接入阶段 A 独立窗口壳。

## 1. 交付摘要

- Rust 成为 `{base}/inbox/Quick Todo.md` 的唯一读写真相源。
- 新增 `quick_todo_list`、`quick_todo_add`、`quick_todo_toggle`、`quick_todo_delete` 四个 Tauri 命令。
- 写操作在进程内互斥锁内执行“读取磁盘最新内容 → 纯函数变换 → 临时文件同步 → 原子替换”。
- 成功写入后广播 `mknote:quick-todo-changed`；变换或写入失败时不会广播。
- 新增 `quickTodoService`、无 Tauri/窗口 label 依赖的共享 `QuickTodoPanel`，以及主标题栏非模态 popover。
- 添加操作不再调用 `quick_capture_create`，不会创建时间戳 Inbox 笔记，也不会切换当前笔记或 Tab。
- 添加失败保留输入；切换/删除失败保留原列表，并显示后端错误。

## 2. TDD 证据

### RED：Rust 真相源

先创建以下行为测试，再运行：

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'mknote-stage-b-cargo-target'
cargo test --manifest-path src-tauri\Cargo.toml quick_todo::tests -- --nocapture
```

预期失败证据：编译报告 5 个缺失符号错误，包括未定义 `QuickTodoDocument` 和 `mutate_file`。失败原因正是阶段 B 后端尚未实现，而非测试语法错误。

### GREEN：Rust 真相源

最小实现后同一聚焦命令结果：`4 passed; 0 failed`。

覆盖：

1. 解析受管 checklist，未知 Markdown 完整往返。
2. 损坏元数据保留为普通 Markdown。
3. 重复 ID 全部降级为不可管理行。
4. toggle/delete 只改变目标行。
5. 连续操作每次重读最新磁盘内容，不覆盖用户手工追加内容。

### RED：前端服务与共享面板

先扩展 `tests/quickTodo.test.ts`，再运行：

```powershell
npm.cmd run test:quick-todo
```

预期失败证据：`ERR_MODULE_NOT_FOUND`，缺少 `src/services/quickTodoService.ts`，证明服务层与面板模型尚未实现。

### GREEN：前端

实现后聚焦测试结果：`7 passed; 0 failed`。

覆盖：

1. list/add/toggle/delete 命令和变化事件映射。
2. 未完成计数排除完成项。
3. “今天”基于本地日历日期派生。
4. `QuickTodoPanel` 不引用 Tauri、`appBridge`、current window 或 window label。
5. 阶段 A 独立窗口动作和 no-drag 回归测试继续通过。

## 3. 后端设计

主要文件：`src-tauri/src/quick_todo.rs`、`src-tauri/src/lib.rs`。

- 文档模型保存原始行数组，只为合法且唯一 ID 的元数据行建立受管索引。
- `createdAt` / `completedAt` 必须能按 RFC3339 解析；完成状态与 `completedAt` 不一致时，该行降级保留。
- Markdown 行顺序即返回列表顺序；完成项不重排。
- Windows 使用 `MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)` 完成原子替换。
- 文件不存在时创建 `# Quick Todo`。
- 目标不存在或不可管理时返回“待办不存在或元数据已损坏，请刷新后重试”。

## 4. 前端设计

主要文件：

- `src/services/quickTodoService.ts`
- `src/utils/quickTodoService.ts`
- `src/utils/quickTodoModel.ts`
- `src/components/QuickTodoPanel.tsx`
- `src/components/QuickTodoPanel.css`
- `src/components/QuickTodoEntry.tsx`
- `src/components/QuickTodoEntry.css`

行为：

- 标题栏图标打开绝对定位、无 backdrop 的非模态 popover。
- Enter 添加，Esc 关闭；空白禁用。
- 添加成功清空并重新聚焦输入框；失败保持输入。
- 完成项原位显示删除线；可取消完成；删除不做乐观更新。
- 底部显示未完成计数并可折叠列表，折叠后输入仍可用。
- 监听变化事件后重新读取 Rust 真相源，不在前端合并并发快照。

## 5. 最终验证

```text
cargo test --manifest-path src-tauri\Cargo.toml
26 passed; 0 failed

npm.cmd run test:quick-todo
7 passed; 0 failed

npm.cmd run build
TypeScript + Vite production build exit 0

git diff --check
exit 0（仅输出既有 LF/CRLF 提示）
```

构建首次在沙箱内因 esbuild `spawn EPERM` 失败；按沙箱规则在已授权的外部构建环境重跑，exit 0。

## 6. 自审与边界

- 未修改 `QuickTodoShell` 以接入数据；阶段 C 仍未开始。
- 未删除或改变通用 `quick_capture_create` 语义。
- 未做时间戳旧笔记迁移。
- 未提交 Git。
- `cargo fmt` 尝试格式化全仓时在既有只读 `src-tauri/src/lsky.rs` 遇到 `os error 5`；阶段 B 文件可编译，聚焦及全量测试均通过。

## 7. 人工验收

2026-07-11 用户确认阶段 B 验收通过，允许进入阶段 C。验收范围包含添加/勾选/取消/删除、标签、拖拽排序与持久化、手工编辑 Markdown、长文本与错误态，以及 Capsule/Popout/截图/置顶回归。

## 8. UI 与单选标签对齐（2026-07-11）

依据：

- `docs/superpowers/specs/2026-07-11-quick-todo-ui-tags-design.md`
- `docs/superpowers/plans/2026-07-11-quick-todo-ui-tags-implementation.md`

已完成：

- 移除自动“今天”内容与 UI。
- 新增四个可取消的单选标签：`important=重要`、`waiting=等待`、`next=下一步`、`idea=想法`。
- 标签只显示项目 SVG icon；中文文字只用于无障碍说明和持久化语义。
- 新建 Todo 可预选/取消标签；成功后清空文本和标签，失败保留两者。
- 已有 Todo 可直接设置、替换或取消标签；失败不做乐观更新。
- Markdown 元数据新增可选 `tag=`；旧无标签行兼容，未知标签原文保留，目标被管理操作修改时规范化清理未知值。
- 新增 `quick_todo_set_tag`，add/set/toggle/delete 继续使用锁内重读、原子写和提交后广播。
- 面板扩宽为 440px，行布局固定为“完成圆圈 / 弹性文字 / 标签槽 / 删除”。
- CSS 按根目录 `DESIGN.md` 重写：只使用标准 `--mk-*` token，无阴影、非契约 token、固定色或第三方图标。
- Esc 先关闭标签选择器，再关闭面板并恢复触发按钮焦点。

最终自动验证：

```text
Rust 全量：34 passed，0 failed
Quick Todo 前端：18 passed，0 failed
TypeScript + Vite production build：exit 0（2283 modules transformed）
git diff --check：exit 0，仅既有 LF/CRLF 提示
最终整体复审：Critical 0 / Important 0 / Minor 0
Spec compliance：通过
Code quality：通过
```

阶段 B 的 UI、标签与数据行为已随用户验收关闭；Stage C 可以开始，但不得回退为两套 Quick Todo 实现。

## 8. 复审返工（Changes requested）

### RED

- Rust 新增首次创建/空文件修复、提交后通知失败、写入失败不通知测试；首次运行因 `mutate_and_notify` 缺失而失败。
- 前端新增真实纯交互模型测试；首次运行因 `quickTodoPanelModel.ts` 缺失而 `ERR_MODULE_NOT_FOUND`。

### GREEN 与修正

- 明确文件替换成功即为提交点。事件广播失败仅写诊断日志，命令仍返回成功，避免调用方误重试导致重复添加。
- 写入/读取失败发生在通知之前，因此不会广播变化事件。
- 不存在文件和零字节文件均补为 `# Quick Todo\n`；非空未知内容不改写。
- 变化事件订阅改为只建立一次；若组件 cleanup 先于订阅 Promise resolve，resolve 后立即执行 `stop()`，消除泄漏竞态。
- Esc 在面板任意后代焦点冒泡时关闭；关闭后 `requestAnimationFrame` 恢复标题栏 trigger 焦点。
- 新增可测试交互模型覆盖 Enter、空白禁用、提交失败保留草稿、toggle/delete 失败保持原列表、Esc。
- 移除未使用的 `onOpen` prop、App handler 及 CompactView/CompactHeader 透传。

复审后聚焦验证：Rust Quick Todo `7 passed; 0 failed`；前端 Quick Todo `9 passed; 0 failed`；生产构建 exit 0。

## 9. 拖拽排序与交互精简（2026-07-11）

依据：

- `docs/superpowers/specs/2026-07-11-quick-todo-ui-tags-design.md` 第 10 节
- `docs/superpowers/plans/2026-07-11-quick-todo-reorder-and-controls.md`

已完成：

- Todo 行调整为“拖拽手柄 / 完成圆圈 / 弹性文字 / 标签 / 删除”，只有最左侧手柄可启动拖拽。
- Pointer Events 拖拽使用 pointer capture、行中点插入判定、不可变预览、`pointercancel` 与 `lostpointercapture` 幂等恢复。
- 外部列表更新会取消活动拖拽并恢复最新 props，避免陈旧快照长期停留。
- 重排提交期间锁定新增、标签、完成、删除和再次拖拽，避免异步响应覆盖较新的列表操作。
- 新增 `quick_todo_reorder(ids)`；后端校验完整、唯一且集合一致的 ID 序列，只在受管 Todo 行槽位间重排，未知 Markdown 内容与位置不变。
- 排序失败恢复最新外部列表并沿用现有错误提示；成功后广播变化事件。
- 删除输入提交按钮，新建 Todo 仅通过 Enter。
- 四个语义标签 icon 在选择器、草稿已选和已有 Todo 已选状态使用 `--mk-primary`；无标签及其他操作 icon 保持中性色。
- 修复标签高亮 selector specificity，确保草稿与行内标签不会被基础中性色规则覆盖。

TDD 与复审证据：

```text
Rust reorder RED：6 个 E0599（缺少 QuickTodoDocument::reorder）
Rust reorder GREEN：18 passed，0 failed
前端排序模型 GREEN：21 passed，0 failed
Pointer Events 初次 GREEN：22 passed，0 failed
竞态/回滚返工 GREEN：24 passed，0 failed
标签高亮与 specificity 返工 GREEN：25 passed，0 failed
Task 1~4 独立复审：Spec compliance PASS；Code quality APPROVED；Critical/Important/Minor 0
```

本轮最终自动验证：

```text
cargo test --manifest-path src-tauri\Cargo.toml：40 passed，0 failed
npm.cmd run test:quick-todo：26 passed，0 failed
npm.cmd run build：exit 0，2283 modules transformed
git diff --check：exit 0
```

最终整体复审发现并修复了非标签控件 hover/focus 被通用规则染成 primary、完成圆圈使用 primary、末尾插入线方向不准确三项问题；复审结果为 Spec compliance PASS、Code quality APPROVED、Critical/Important/Minor 0。

构建在沙箱内首次因 esbuild `spawn EPERM` 失败；使用已批准的 `npm.cmd run build` 沙箱外重跑后通过。当前停止在人工验收：实际拖拽视觉、重启后顺序保持、未知 Markdown 原位保留、标签高亮范围以及 Enter 创建。

### 拖拽中途失效修复

- 根因：pointer capture 原先绑定在被拖动行的手柄上；预览排序会移动该行 DOM，Tauri WebView 可能因此触发 `lostpointercapture`，旧逻辑随即取消拖拽。
- 修复：将 pointer capture 与 move/up/cancel/lost 监听迁移到不会随排序移动的 `.quick-todo-list` 容器；手柄只负责启动拖拽。
- 回归测试明确禁止在手柄 `event.currentTarget` 上捕获，并要求列表容器持有捕获与后续 Pointer Events。
- 验证：Quick Todo 前端 `26 passed; 0 failed`；生产构建 exit 0（2283 modules）；`git diff --check` exit 0。

## 10. Stage C 独立窗口集成（2026-07-11）

设计与计划：

- `docs/superpowers/specs/2026-07-11-quick-todo-stage-c-window-integration-design.md`
- `docs/superpowers/plans/2026-07-11-quick-todo-stage-c-window-integration.md`

实现：

- 新增 `useQuickTodoController`，统一管理加载、变化事件订阅、add/setTag/toggle/delete/reorder 和错误保留。
- `QuickTodoEntry` 与 `QuickTodoShell` 共用同一个 `QuickTodoPanel` 和 `quickTodoService`，没有第二套 Todo 数据状态。
- 主窗口显式点击优先打开/聚焦唯一独立窗口；创建或打开失败时回退到程序内 popover，并显示具体错误。
- 被动变化事件只触发重新读取，不调用打开、显示或聚焦窗口。
- Shell 注入置顶动作，关闭动作保存几何后隐藏；Panel 通过无 label 依赖的通用标题拖拽属性适配独立窗口。
- 独立窗口默认尺寸调整为 `440×520`，最小尺寸为 `360×320`；既有显示器、DPI、逻辑坐标、置顶和关闭隐藏逻辑保留。

TDD 与自动验证：

~~~text
前端 RED：3 个 Stage C 契约测试失败，分别证明缺少 controller、入口回退和完整 Shell
前端 GREEN：29 passed，0 failed
Rust RED：默认尺寸测试失败，旧值为 320×72
Rust GREEN：窗口聚焦测试 6 passed，0 failed
Rust 全量：41 passed，0 failed
npm.cmd run test:quick-todo：29 passed，0 failed
npm.cmd run build：exit 0，2284 modules transformed
git diff --check：exit 0
~~~

Stage C 自动验证已完成，当前停止在独立窗口人工验收；尚未进入 Stage D。
