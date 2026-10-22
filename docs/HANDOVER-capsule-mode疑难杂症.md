# 胶囊模式（Capsule Mode）交接文档

> 状态：历史疑难分析，核心问题已于 2026-07-08 修复并通过验收（MKnote v3.2.0）  
> 日期：2026-07-08  
> 接手者：Codex

---

## 2026-07-08 更新

本文件保留作为“透明 Tauri 窗口 + 多窗口状态机”的疑难分析材料。当前胶囊模式已修复，验收版本定义为 **MKnote v3.2.0**，最新可执行状态与验收结论见 [HANDOVER-2026-07-08-capsule-mode验收总结.md](HANDOVER-2026-07-08-capsule-mode验收总结.md)。

核心落地方案：

- 胶囊拖拽改为原生 pointer 事件 + 位移阈值，排除按钮/输入框区域。
- Popout / Capsule 互转改为显式 Rust command，并在源窗口销毁时抑制关闭事件。
- 重命名通过 `mknote:popped-out-renamed` 同步主窗口状态。
- 主题通过 `mknote:theme-changed` 广播到 Popout / Capsule。
- Tab 拖出检测改为四边界触发。
- 主窗口焦点事件去掉重复 `set_focus()`，缓解截图后偶发置前。

下文为历史问题分析，保留供后续排查参考。

---

## 一、功能目标

将当前活跃便签以「胶囊」形式显示在屏幕上，作为便签的一种精简展示态。

### 触发入口

1. **从主窗口进入**：点击主窗口左上角 Logo → 当前活跃便签变为胶囊；主窗口切到下一个 Tab
2. **从便签窗口进入**：便签窗口（PopoutView）顶栏工具按钮（collapse 图标）单击 → 便签窗口关闭，变为胶囊

### 胶囊 UI 规格

```
┌──────────────────────────────────────────┐
│ ● [标题文字] ·················· 🔒  ✕   │  ← 高度 40px
└──────────────────────────────────────────┘
```

- **宽度**：240px（固定，不可调整）
- **高度**：40px（与便签窗口顶栏一致）
- **外形**：圆头胶囊（`border-radius: 9999px`），透明窗口，四角不露底色
- **从左到右**：
  1. 颜色圆点（10px，只读，显示便签颜色标签）
  2. 标题（主题高亮色 `--mk-primary`，超出省略）
  3. 置顶按钮（🔒/🔓，切换当前置顶状态）
  4. 关闭按钮（✕，关闭胶囊）

### 胶囊交互

| 操作 | 行为 |
|------|------|
| 拖拽胶囊条（非按钮区域） | 移动胶囊窗口位置 |
| 单击标题 | 还原为便签窗口（PopoutView）|
| 双击标题 | 进入标题编辑（inline edit）|
| 置顶按钮 | 切换 `always_on_top` |
| 关闭按钮 | 关闭胶囊，Tab 归还主窗口 |

### 胶囊位置

- 默认出现在触发窗口（主窗口或便签窗口）左上角上方 5px，左边对齐
- 若上方空间不足（`y < 0`），则出现在触发窗口下方 5px

---

## 二、已实现的部分

### 2.1 Rust 侧（`src-tauri/src/detach.rs`）

以下命令已实现并注册：

```rust
// 打开胶囊窗口
pub async fn open_capsule(app, zone, name, title, note_color, always_on_top, anchor_x, anchor_y, source) -> Result<(), String>

// 前端拉取初始化参数
pub fn take_capsule_init(label: String) -> Option<CapsuleInit>

// 关闭胶囊窗口
pub async fn close_capsule(app, zone, name) -> Result<(), String>
```

**窗口配置**（已确认正确）：
```rust
WebviewWindowBuilder::new(&app, &label, url)
    .inner_size(240.0, 40.0)
    .min_inner_size(240.0, 40.0)
    .max_inner_size(240.0, 40.0)
    .position(capsule_x, capsule_y)
    .decorations(false)
    .transparent(true)    // 透明窗口，四角透明
    .shadow(false)        // 关闭系统阴影
    .always_on_top(always_on_top)
    .resizable(false)
    .skip_taskbar(true)
```

### 2.2 权限配置（`src-tauri/capabilities/default.json`）

已包含所需权限：
```json
{
  "windows": ["main", "popout-*", "capsule-*"],
  "permissions": [
    "core:window:allow-start-dragging",
    "core:window:allow-set-always-on-top",
    "core:window:allow-outer-position",
    ...
  ]
}
```

### 2.3 前端路由（`src/main.tsx`）

```typescript
const isCapsule = label.startsWith("capsule-");
if (isCapsule) {
  document.body.classList.add("capsule-window");
  root.render(<CapsuleView />);
}
```

### 2.4 主窗口 Tab 状态管理（`src/App.tsx`）

- `handleOpenCapsule`：点击 Logo 时，将便签从主窗口 Tab 移出（`setPoppedOutNotes`），切到下一个 Tab，再调 `open_capsule`
- `mknote:capsule-closed` 事件监听：胶囊关闭时归还 Tab 到主窗口

### 2.5 便签窗口入口（`src/components/PopoutView.tsx`）

- 顶栏新增胶囊按钮（`collapse` 图标），单击调 `handleEnterCapsule`
- `handleEnterCapsule` 调 `open_capsule`（source: "popout"），然后 `destroy()` 自身

---

## 三、当前 Bug 和未完成项

### Bug 1：胶囊无法拖拽 🔴 最高优先级

**现象**：胶囊窗口无法移动

**根因分析**：
- `data-tauri-drag-region` HTML attribute 在透明窗口上失效（Windows 的 `WM_NCHITTEST` 在透明像素上返回 `HTTRANSPARENT`，穿透到桌面）
- 必须使用 JS 方案：`onMouseDown` → `appWindow.startDragging()`

**当前代码状态**（`src/components/CapsuleView.tsx`）：
```typescript
// 已实现此方案，但运行时仍无法拖动
const handleBarMouseDown = async (e: React.MouseEvent) => {
  if (e.button !== 0) return;
  if (e.detail >= 2) return;
  if (isInteractive(e.target)) return;
  e.preventDefault();
  await getCurrentWindow().startDragging();
};
```

**怀疑原因**：可能是权限未在运行时正确应用到 `capsule-*` 窗口，或者 `startDragging()` 调用时机有问题（async 导致延迟）。

**推荐验证步骤**：
1. 检查 `src-tauri/capabilities/default.json` 中 `capsule-*` 是否真正匹配运行时窗口 label
2. 尝试将 `startDragging()` 改为同步触发（不 await）
3. 在 `mousedown` 事件（非 React 合成事件）的原生 DOM 监听器里调用

**参考官方方案**（Tauri 官方文档推荐）：
```typescript
// 不用 React 合成事件，用原生 addEventListener
useEffect(() => {
  const el = barRef.current;
  if (!el) return;
  const handler = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    void getCurrentWindow().startDragging();
  };
  el.addEventListener('mousedown', handler);
  return () => el.removeEventListener('mousedown', handler);
}, []);
```

---

### Bug 2：置顶按钮不可用 🔴

**现象**：点击置顶按钮（🔒/🔓）无响应

**根因**：和 Bug 1 相关。当拖动实现有问题时，按钮 click 事件可能被拖动逻辑吞掉。解决 Bug 1 后应一并验证。

**当前实现**：
```typescript
<button
  type="button"
  data-no-drag
  onClick={() => void handleTogglePin()}
>
```
`handleTogglePin` 调用 `getCurrentWindow().setAlwaysOnTop(next)` 逻辑本身正确。

---

### Bug 3：单击标题未还原为便签窗口 🟡

**现象**：单击标题后，关闭了胶囊但没有打开便签窗口（PopoutView）

**当前实现**（`handleExitToPopout`）：
```typescript
await win.destroy();  // 关闭胶囊
await invoke("open_note_popout", { zone, name, title, width: 500, height: 400, x, y });
```

**问题**：`open_note_popout` 创建的便签窗口需要从 `poppedOutNotes` 中取到笔记数据，但从胶囊进入便签时，主窗口的 `poppedOutNotes` 状态是否正确？

**验证点**：
- 从主窗口 Logo 进入胶囊时，`poppedOutNotes` 已含该笔记 → 便签窗口关闭时通过 `mknote:popout-closed` 正常归还 ✅
- 从便签窗口进入胶囊时，`poppedOutNotes` 已含该笔记（便签进入胶囊时不触发 `popout-closed`，用 `destroy()` 跳过归还）→ 便签窗口关闭后通过 `mknote:popout-closed` 正常归还 ✅

---

### Bug 4：从主窗口进入胶囊时主窗口 Tab 仍可见 🟡

**现象**：点击 Logo 生成胶囊后，主窗口的 Tab 栏中该便签 Tab 还在

**当前实现**（`src/App.tsx` `handleOpenCapsule`）：
```typescript
setPoppedOutNotes((prev) => new Set([...prev, key]));  // 移出主窗口 Tab 显示
```

**问题**：`poppedOutNotes` 更新了，但 Tab 显示逻辑是否正确过滤掉了胶囊化的便签？需检查 `CompactView` 中 Tab 渲染是否用了 `poppedOutNotes` 过滤。

---

### Bug 5：胶囊加载时白屏/慢（约 1 秒） 🟡

**原因**：初始化链路串行：`get_config` + `list_custom_tags` → `list_notes`（已改为 Promise.all 但仍有网络延迟）

**当前代码**：
```typescript
const [cfg, tags] = await Promise.all([
  invoke("get_config"),
  invoke("list_custom_tags"),
]);
// 然后再 list_notes（串行）
const notes = await invoke("list_notes", { zone });
```

**优化方案**：三个调用全部并行：
```typescript
const [cfg, tags, notes] = await Promise.all([
  invoke("get_config"),
  invoke("list_custom_tags"),
  invoke("list_notes", { zone }),
]);
```

---

## 四、相关文件清单

| 文件 | 作用 |
|------|------|
| `src-tauri/src/detach.rs` | 胶囊窗口的 Rust 命令：`open_capsule`、`take_capsule_init`、`close_capsule` |
| `src-tauri/capabilities/default.json` | 权限配置，`capsule-*` 窗口权限 |
| `src/components/CapsuleView.tsx` | 胶囊 UI 组件（当前有拖动 bug） |
| `src/components/PopoutView.tsx` | 便签窗口，含胶囊入口按钮 `handleEnterCapsule` |
| `src/App.tsx` | `handleOpenCapsule`、`mknote:capsule-closed` 事件处理 |
| `src/main.tsx` | 窗口路由（`capsule-*` label → `CapsuleView`）|
| `src/App.css` | 胶囊相关 CSS（`.capsule-root`、`.capsule-bar` 等）|

---

## 五、CSS 规范

```css
/* 正确姿势：根层透明，背景只在 .capsule-bar */
body.capsule-window,
body.capsule-window #root {
  background: transparent !important;
}

.capsule-root {
  width: 100vw;
  height: 100vh;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.capsule-bar {
  width: calc(100vw - 2px);
  height: calc(100vh - 2px);
  border-radius: 9999px;         /* 圆头胶囊 */
  background: var(--mk-canvas);  /* 跟随主题 */
  border: 1px solid var(--mk-hairline);
  overflow: hidden;
}
```

---

## 六、设计规范（标题颜色、主题）

- 标题文字颜色：`var(--mk-primary)`（主题高亮色，随主题皮肤变化）
- 背景色：`var(--mk-canvas)`
- 按钮图标颜色：`var(--mk-icon)`
- 颜色圆点：从便签的颜色标签（`noteColor`）取 hex，用 `noteColorHex()` 工具函数转换
- 主题在 `applyTheme(config)` 函数里通过设置 `data-theme`、`data-light-theme`、`data-dark-theme`、`data-accent-skin` attribute 应用

---

## 七、优先级排序

1. **Bug 1**（拖动）+ **Bug 2**（置顶按钮）—— 核心交互，最高优先级
2. **Bug 3**（单击标题还原便签窗口）—— 功能完整性
3. **Bug 4**（主窗口 Tab 可见性）—— 状态一致性
4. **Bug 5**（加载速度）—— 体验优化

---

## 八、不需要修改的功能（已完成）

- ✅ 关闭按钮可用，`close_capsule` 命令正确
- ✅ 胶囊窗口位置计算（上方 5px，超出屏幕时改为下方）
- ✅ 主窗口 Logo 点击触发逻辑
- ✅ 便签窗口（PopoutView）的胶囊入口按钮
- ✅ `mknote:capsule-closed` 事件归还 Tab 到主窗口
- ✅ 透明窗口 + `shadow(false)` 配置
- ✅ 权限文件包含 `core:window:allow-start-dragging`
- ✅ `main.tsx` 的窗口路由分支
