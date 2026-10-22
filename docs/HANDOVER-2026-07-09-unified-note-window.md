# MKnote 统一笔记窗口模式验收交接

日期：2026-07-09

范围：Popout 便签窗口与胶囊模式的同窗口切换、透明圆头、几何冻结、左侧吸附镜像、默认置顶。

## 一、本轮结论

统一笔记窗口路径已通过用户验收。当前实现把同一条笔记的便签态与胶囊态收敛为同一个原生窗口的两种 profile，而不是继续依赖“关闭 Popout、创建 Capsule”的接力路径。

已由用户确认通过：

- 胶囊透明圆头恢复，不再露出灰色倒角 native 矩形。
- 便签 / 胶囊来回切换，首次恢复不再发生位移。
- 切换时不再看到“消失再出现”的裸重绘帧。
- 左侧吸附时镜像效果恢复。
- 胶囊模式默认置顶；从主窗口进入胶囊、从便签进入胶囊均默认置顶。

## 二、核心实现

Rust 侧新增统一窗口状态机，权威持有窗口形态、冻结几何和吸附边缘：

- `Expanded`
- `TransitioningToCapsule`
- `Capsule`
- `TransitioningToExpanded`

前端 `PopoutView` 只订阅 Rust 下发的 `mknote:unified-window-mode`，并在 UI 挂载后回传 ready ack。这样避免 React 与 Rust 各自猜窗口状态。

## 三、关键修复点

### 透明圆头

Popout 创建时静态关闭 native shadow，并保持根层透明。不要再尝试在 Windows 上动态切换 DWM shadow；动态切换在 undecorated + transparent 窗口上不稳定，容易再次出现倒角矩形。

相关文件：

- `src-tauri/src/detach.rs`
- `src/App.css`

### 首次位移

进入胶囊前冻结 expanded 几何。若当前窗口仍处于 `Expanded`，优先读取实时 window geometry；只有在 transition / capsule 中才复用已经冻结的 expanded geometry。

同时，expanded 的 resize / move settle 在非 expanded 状态下被 Rust guard 阻止，避免延迟回调污染便签几何。

相关文件：

- `src-tauri/src/detach.rs`
- `src/components/PopoutView.tsx`

### 裸重绘帧

上一版 `hide -> profile switch -> ack -> show` 会被用户感知为“消失再出现”。当前版本撤掉切换过程中的 hide / show，改为可见状态下进行同窗口 profile 切换，并用 ready ack 收口状态。

相关文件：

- `src-tauri/src/detach.rs`
- `src/components/PopoutView.tsx`

### 左侧吸附镜像

吸附边缘由 Rust settle 命令返回并写入统一窗口状态，同时通过事件补充广播。React 根据 `snapEdge === "left"` 直接渲染镜像 class，不再依赖事件先后顺序。

相关文件：

- `src-tauri/src/detach.rs`
- `src/components/PopoutView.tsx`
- `src/services/windowService.ts`

## 四、保留的回滚口

旧的独立 Capsule 路径暂未删除。当前 `USE_UNIFIED_NOTE_WINDOW = true` 作为默认路径，旧路径继续作为 fallback 保留。

原因：

- 本轮重点是让新路径通过视觉和几何验收。
- Phase 6 的旧路径下线会扩大改动面，建议在新路径再经过一轮真实使用后单独做。
- 若新路径出现回归，优先切回 fallback，而不是回滚整批代码。

## 五、验证记录

已运行：

```powershell
git diff --check
```

结果：通过，仅有 Git 的 LF/CRLF 提示。

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'mknote-codex-cargo-target'
cargo check --manifest-path src-tauri\Cargo.toml
```

结果：通过，仅有项目既有 warning。

```powershell
npm.cmd run build
```

结果：通过。

用户手工验收：通过。

## 六、后续建议

下一轮如继续推进 `docs/PLAN-2026-07-08-unified-note-window.md` 的 Phase 6，建议先做一轮小范围 code review，再分步下线：

1. 确认旧 `restorePopoutToCapsule` / `restoreCapsuleToPopout` 没有仍被默认入口依赖。
2. 移除或归档独立 `CapsuleView` 前，先确认主窗口进入胶囊路径是否也完全迁到统一模型。
3. 清理 Rust capsule session registry 时，保留已迁移数据的兼容读取策略。
4. 下线后重新跑构建，并再次做手工验收：来回 5 次不漂移、左吸附镜像、默认置顶、关闭回收 Tab。
