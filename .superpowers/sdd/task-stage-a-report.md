# Stage A - Quick Todo window probe 实施报告

日期：2026-07-11

状态：`DONE_WITH_CONCERNS`

## 实现内容

### 1. 截图 / 全屏避让被动恢复

- 已核实原调用链：`fullscreen_watcher` 在全屏结束后调用 `system::show_main_window`；该主动路径继续调用 `force_present_window`，Windows 下包含 `BringWindowToTop`、`SetForegroundWindow`，随后还调用 `set_focus`。
- 新增纯决策 `fullscreen_restore_action`，全屏避让恢复只选择 `PassiveShow`。
- 新增 `system::show_main_window_passive` 与 Windows `show_window_no_activate`：恢复几何并使用 `SW_SHOWNOACTIVATE` 显示，不调用 `force_present_window`、`SetForegroundWindow`、`set_focus` 或 topmost z-order 刷新。
- 托盘、热键等用户显式显示仍保留原主动路径。

### 2. Quick Todo 最小独立窗口壳

- 新增固定 label `quick-todo` 的单实例 Tauri 窗口；重复打开复用现有窗口并显式聚焦。
- 窗口只渲染标题、显式置顶按钮、关闭按钮；未接入 Todo 数据、列表、输入框或完整面板。
- 主标题栏既有 Quick Todo 入口改为显式打开该窗口；保留通用后端 `quick_capture_create` 命令及用户已有相关文件，未删除其语义。
- 关闭按钮和原生关闭请求均只隐藏窗口：隐藏前保存逻辑 `x/y/width/height`。
- 重开隐藏窗口时恢复保存几何，并夹紧到最近可用显示器；无保存几何时在主窗口所在显示器居中。
- 新增独立配置字段：`quick_todo_geometry`、`quick_todo_always_on_top`；置顶默认 `false`，只在用户显式切换后持久化。
- 全局主窗口事件过滤逻辑未扩大；Quick Todo 只安装自己的 CloseRequested 监听，不接入 Capsule、Popout、Tab drag preview 状态机。
- 窗口 UI 使用 `DESIGN.md` 的 `--mk-*` token 与现有 `Icon` / `pin_on` / `pin_off` / `close` / `task` 图标。

## TDD RED / GREEN 证据

### RED

1. Rust 聚焦测试（临时可写 target）：

   ```powershell
   $env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'mknote-stage-a-cargo-target'
   rtk cargo test --manifest-path src-tauri\Cargo.toml fullscreen_dodge_restore_uses_passive_non_activating_show -- --exact
   ```

   预期失败原因：缺少 `fullscreen_restore_action`、`FullscreenRestoreAction`、`resolve_quick_todo_geometry` 与 `AppConfig.quick_todo_always_on_top`。编译输出为 3 个对应错误；首次依赖编译命令在 177 秒工具时限结束，但已返回上述明确的功能缺失错误。

2. 前端聚焦测试：

   ```powershell
   rtk npm run test:quick-todo
   ```

   预期失败原因：`ERR_MODULE_NOT_FOUND`，缺少 `src/utils/quickTodoWindow.ts`。

### GREEN

1. 被动恢复聚焦测试：1 passed。
2. Quick Todo 几何 / 默认置顶测试：3 passed。
3. `npm.cmd run test:quick-todo`：3 passed，0 failed。

## 最终验证

| 命令 | 结果 |
|---|---|
| `$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'mknote-stage-a-cargo-target'; rtk cargo test --manifest-path src-tauri\Cargo.toml` | 通过：16 passed，0 failed |
| `rtk npm.cmd run test:quick-todo` | 通过：3 passed，0 failed |
| `rtk npm run build` | TypeScript 编译通过；Vite 加载 `vite.config.ts` 时失败：`Error: spawn EPERM`（esbuild 子进程） |
| `rtk git diff --check` | 通过，无 whitespace error |

按任务约束，`spawn EPERM` 后未绕过沙箱、未重复构建、未启动 GUI。

## 变更文件

阶段 A 直接变更：

- `src-tauri/src/fullscreen_watcher.rs`
- `src-tauri/src/system.rs`
- `src-tauri/src/win_present.rs`
- `src-tauri/src/quick_todo_window.rs`（新增）
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/App.tsx`
- `src/components/CompactView.tsx`
- `src/components/compact/CompactHeader.tsx`
- `src/components/QuickTodoEntry.tsx`
- `src/components/QuickTodoEntry.css`
- `src/components/QuickTodoShell.tsx`（新增）
- `src/components/QuickTodoShell.css`（新增）
- `src/services/windowService.ts`
- `src/types.ts`
- `src/utils/quickTodoWindow.ts`（新增）
- `tests/quickTodo.test.ts`

本报告：

- `.superpowers/sdd/task-stage-a-report.md`

明确保留、未清理的阶段前 dirty 内容包括版本文件、Cargo/package lock、`notesService.quickCapture`、`src/utils/quickTodo.ts`、规格/计划文件等；未 reset、checkout、clean 或 commit。

## 自审

- 范围：未实现 Todo 数据模型、Markdown 文件、完整面板、Stage B/C。
- 焦点：被动恢复调用链中不再出现主动显示函数；显式打开 Quick Todo 仍按需求聚焦。
- 单实例：窗口 label 固定，存在时复用，不创建第二个窗口。
- 关闭语义：关闭仅隐藏，保存逻辑几何；应用退出路径未改动。
- 几何：纯函数覆盖无历史居中、越界保存值夹紧；运行时使用各显示器 scale factor 转为逻辑坐标。
- 置顶：默认 false，窗口创建/重开读取配置，按钮显式切换并保存。
- 隔离：主窗口全局事件回调继续只处理 `main`；Quick Todo 不进入其他窗口状态机。
- 兼容：`quick_capture_create` 仍注册且实现未删除。
- 工作区：`git diff --check` 无错误；未提交，未触碰用户要求之外的清理动作。

## 疑虑 / 人工验收门

1. `npm run build` 未得到 Vite 产物级通过证据，原因是沙箱内 esbuild `spawn EPERM`；TypeScript 阶段已通过。
2. 按阶段 A stop boundary 未启动 GUI，因此 Windows 行为仍需人工验收：截图完成/取消后的前台焦点、空壳点击、多次打开单实例、关闭隐藏、重开几何、多屏/DPI、默认不置顶与显式置顶持久化。
3. 仓库整体 `cargo fmt --check` 会报告大量阶段前既有格式差异；为避免改写用户 dirty 文件，只对新增 `quick_todo_window.rs` 执行了 `rustfmt`，未做全仓格式化。

在上述人工验收通过前，不应进入 Stage B。

## 复审返工（2026-07-11）

首次只读复审发现关闭失败路径、混合 DPI 坐标系和置顶事务一致性问题，已在人工验收前修复：

- 关闭现在先尝试保存几何、随后无条件执行隐藏；保存失败不会再阻止关闭，原生关闭路径会记录明确错误。
- Quick Todo 保存“显示器名 + 显示器内逻辑偏移 + 逻辑尺寸”；恢复时使用显示器物理原点加逻辑偏移乘目标缩放，并以 `PhysicalPosition` 定位，避免不同 DPI 显示器的全局坐标重叠。
- 置顶先持久化，再修改原生窗口；原生修改失败时回滚持久化配置，防止 UI、Z-order 与配置部分成功。
- 主窗口打开 Quick Todo 失败后保留 ErrorBanner 错误，不再重新抛出未处理 Promise rejection。

### 返工 TDD 证据

- RED：新增混合 DPI 测试后，`cargo test ... mixed_dpi_monitor_uses_physical_origin_plus_logical_offset -- --exact` 因缺少 `resolve_placement` 按预期编译失败。
- GREEN：`cargo test ... quick_todo_window::tests:: -- --nocapture` 实际执行 4 项并全部通过，覆盖默认不置顶、无历史居中、越界夹紧、100% + 150% 混合 DPI 物理定位。

### 返工后最终验证

- `cargo test --manifest-path src-tauri\Cargo.toml`：17 passed，0 failed（存在仓库既有 warnings）。
- `npm.cmd run test:quick-todo`：3 passed，0 failed。
- `npm.cmd run build`：成功，Vite 2269 modules transformed；仅有既有大 chunk 警告。
- `git diff --check`：成功，无 whitespace error。

## 运行态死锁修复（2026-07-11）

用户复验发现 Quick Todo 无法打开，且点击后多个依赖 Tauri `invoke` 的按钮失效。运行态 DevTools 取证确认：

- Quick Todo 点击事件已触发，但 `open_quick_todo_window` Promise 永久 pending。
- 原实现是同步 Tauri command，却在其中执行显示器查询和 `WebviewWindowBuilder::build`；窗口线程等待导致 IPC 队列被堵塞。
- 将 `open_quick_todo_window` 改为异步 command，与现有 Popout/Capsule 窗口创建模式一致。
- 同时保留 Quick Todo 空壳按钮的 `-webkit-app-region: no-drag` 修复。

### 死锁修复 TDD 与运行态证据

- RED：编译期测试要求打开命令返回 `Future`，同步实现按预期失败：`Result<(), String> is not a future`。
- GREEN：聚焦测试通过；Rust 全量 18/18 通过。
- 前端 Quick Todo 测试 4/4 通过；生产构建成功；`git diff --check` 成功。
- 真实运行态：鼠标点击主窗口 Quick Todo 入口创建第二窗口；置顶切换为“取消置顶”；关闭后只保留主窗口。
- Quick Todo 打开后再次调用普通 `get_config`，在 1.5 秒超时门内返回 `IPC_OK`，确认后续按钮 IPC 不再被堵塞。

## config.json 并发损坏根因修复（2026-07-11）

用户截图中的 `trailing characters at line 226 column 2` 已由实际文件确认：首个完整 JSON 后出现 `}"mdnote",` 和一段旧尾部。根因是多个窗口/线程并发调用 `save_config`，原实现直接 `std::fs::write` 同一路径，不同长度写入发生重叠。

最终修复：

- 全局 `CONFIG_IO_LOCK` 串行化所有 `load_config` / `save_config` 文件 I/O。
- 配置先写同目录临时文件，同一文件句柄执行 `write_all + sync_all`，再用 Windows `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)` 替换目标。
- 临时文件创建、写入、同步或替换任一步失败都会清理临时文件并返回明确错误。
- `load_config` 检测首个完整 `AppConfig` 后存在非空尾部时，保留首个完整配置并原子重写；legacy 迁移写失败不再静默吞掉。

验证证据：

- RED：恢复/并发测试先因缺少 `parse_config_json` 与 `write_config_file` 编译失败。
- GREEN：损坏恢复测试通过；8 线程共 320 次不同长度并发写后仍只有一个可解析 JSON 文档。
- 真实损坏文件从 236 行自动恢复为 226 行单一 JSON，原配置主体保留，日志记录自动修复。
- Rust 20/20、Quick Todo 4/4、生产构建、`git diff --check` 全部通过。
- 真实 MKnote 主窗口中不再出现 `trailing characters` 错误横幅。
- 最终只读复审：Approved，Critical/Important/Minor 均为 0。
