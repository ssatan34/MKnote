# 胶囊模式（Capsule Mode）交接文档

> 状态：已修复并通过用户验收（MKnote v3.2.0）  
> 日期：2026-07-08  
> 接手者：Codex

---

## 2026-07-08 更新

本文件最初记录的是胶囊模式未修复阶段的问题清单。当前核心问题已完成修复并通过用户验收，本版本定义为 **MKnote v3.2.0**，最新状态以 [HANDOVER-2026-07-08-capsule-mode验收总结.md](HANDOVER-2026-07-08-capsule-mode验收总结.md) 为准。

已完成：

- 胶囊窗口可拖拽，按钮区域不会误触发拖拽。
- Popout 与 Capsule 互转不会错误归还主窗口 Tab。
- 胶囊关闭可正确归还 Tab。
- 单击颜色标签按钮还原为 Popout，标题双击编辑。
- 置顶按钮可见且可切换。
- 胶囊透明四角不再露黑底。
- Popout / Capsule 跟随主窗口主题切换。
- Tab 可从上、下、左、右四个方向拖出为 Popout。
- 主窗口截图后偶发置前的问题已通过收窄焦点事件处理。
- Popout / Capsule 未置顶状态、窗口几何和吸附状态可跨重启恢复。
- Popout 标题显示态可拖动窗口，双击进入编辑态，标题使用主题高亮色。

历史 Bug 分析保留在下文，供排查类似透明窗口 / 多窗口生命周期问题时参考。

---

## 一、功能目标

将当前活跃便签以「胶囊」形式显示在屏幕上。

### 触发入口

1. **主窗口 → 胶囊**：点击主窗口左上角 Logo → 当前活跃便签变为胶囊；主窗口切到下一个 Tab
2. **便签窗口 → 胶囊**：便签窗口（`PopoutView`）顶栏工具按钮（collapse 图标，预览按钮左侧）单击

### 胶囊 UI 规格

```
┌──────────────────────────────────────────┐
│ ● [标题文字] ·················· 🔒  ✕   │  ← 高度 40px，宽度 240px
└──────────────────────────────────────────┘
```

- **宽度 240px，高度 40px**，固定，不可调整
- **外形**：圆头胶囊（`border-radius: 9999px`），透明窗口四角不露底色
- **从左到右**：颜色圆点（10px 只读）→ 标题（`--mk-primary` 色）→ 置顶 → 关闭

### 胶囊交互

| 操作 | 期望行为 |
|------|----------|
| 拖拽胶囊（非按钮区） | 移动窗口 |
| 单击标题 | 关闭胶囊，打开便签窗口（PopoutView） |
| 双击标题 | inline 编辑标题 |
| 置顶按钮 | 切换 `always_on_top` |
| 关闭按钮 | 关闭胶囊，Tab 归还主窗口 |

---

## 二、已完成的部分（不需要修改）

### Rust 命令（`src-tauri/src/detach.rs`）

| 行号 | 内容 |
|------|------|
| 63 | `const CAPSULE_WIDTH: f64 = 240.0` |
| 65 | `const CAPSULE_HEIGHT: f64 = 40.0` |
| 68 | `const CAPSULE_GAP: f64 = 5.0`（距触发窗口 5px） |
| 185 | `pub async fn open_capsule(...)` — 命令签名 |
| 205–211 | 位置计算（上方 5px，上方不足则改为下方） |
| 227–237 | 窗口创建：`transparent(true)`, `shadow(false)`, `decorations(false)`, `resizable(false)`, `skip_taskbar(true)` |
| 264 | `pub fn take_capsule_init(label)` |
| 270 | `pub async fn close_capsule(...)` |

### 权限（`src-tauri/capabilities/default.json`）

```json
"windows": ["main", "popout-*", "capsule-*"],
"permissions": [..., "core:window:allow-start-dragging", ...]
```
⚠️ `capsule-*` 已在 windows 列表中，`allow-start-dragging` 已包含。

### 窗口路由（`src/main.tsx`，第 40–50 行）

```typescript
// 第 40 行
const isCapsule = label.startsWith("capsule-");
// 第 47–50 行
} else if (isCapsule) {
  document.body.classList.add("capsule-window");
  root.render(<CapsuleView />);
}
```

### 主窗口触发（`src/App.tsx`）

- **第 1061 行**：`handleOpenCapsule` — 点击 Logo 的处理函数
- **第 1079 行**：`setPoppedOutNotes((prev) => new Set([...prev, key]))` — 将笔记从主窗口 Tab 移出
- **第 994 行**：`listen("mknote:capsule-closed", ...)` — 胶囊关闭时归还 Tab

### Tab 过滤（`src/components/CompactView.tsx`，第 1953 行）

```typescript
tabs={openTabs.filter((t) => !poppedOutNotes.has(tabKey(t.zone, t.name)))}
```
已正确过滤胶囊化的 Tab。

### 便签窗口入口（`src/components/PopoutView.tsx`）

- **第 316 行**：`handleEnterCapsule` — 进入胶囊的处理函数
- **第 323 行**：`invoke("open_capsule", { ..., source: "popout" })`
- **第 479 行**：顶栏工具按钮（`collapse` 图标），`onClick` 绑定

---

## 三、Bug 列表（需要修复）

---

### Bug 1：胶囊无法拖拽 🔴 最高优先级

**文件**：`src/components/CapsuleView.tsx`，**第 148–158 行**

**当前代码**：
```typescript
// 第 148–158 行
const handleBarMouseDown = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
  if (e.button !== 0) return;
  if (e.detail >= 2) return;
  if (isInteractive(e.target)) return;
  e.preventDefault();
  try {
    await getCurrentWindow().startDragging();  // ← 问题在这
  } catch { /* 忽略 */ }
}, []);
```

**绑定位置**（第 237 行）：
```tsx
<div className="capsule-bar" onMouseDown={(e) => void handleBarMouseDown(e)}>
```

**根因**：React 合成事件（`SyntheticEvent`）在 `async` 函数里，`await` 之前事件已被回收；另外透明窗口上的合成事件可能存在时序问题。

**推荐修复**：改用原生 DOM `addEventListener`，在 `useEffect` 里绑定到 `barRef`，同步调用 `startDragging()`（不 await）：

```typescript
// 替换 handleBarMouseDown + onMouseDown 绑定，改为：
const barRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = barRef.current;
  if (!el) return;
  const handler = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail >= 2) return;  // 双击不触发
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag], button, input, textarea, select, a')) return;
    void getCurrentWindow().startDragging();  // 不 await，同步触发
  };
  el.addEventListener('mousedown', handler);
  return () => el.removeEventListener('mousedown', handler);
}, []);

// JSX 改为：
<div className="capsule-bar" ref={barRef}>
  {/* 去掉 onMouseDown */}
```

---

### Bug 2：置顶按钮无响应 🔴

**文件**：`src/components/CapsuleView.tsx`，**第 261–267 行**（置顶按钮 JSX）

**当前代码**：
```tsx
<button
  type="button"
  className={`capsule-btn${alwaysOnTop ? " active" : ""}`}
  data-no-drag
  title={alwaysOnTop ? "取消置顶" : "置顶窗口"}
  onClick={() => void handleTogglePin()}   // ← click 未触发
>
```

`handleTogglePin` 在**第 220–226 行**，逻辑本身正确：
```typescript
const handleTogglePin = useCallback(async () => {
  const next = !alwaysOnTop;
  try {
    await getCurrentWindow().setAlwaysOnTop(next);
    setAlwaysOnTop(next);
  } catch (e) { setError(String(e)); }
}, [alwaysOnTop]);
```

**根因**：与 Bug 1 同源——拖动逻辑干扰了 click 事件。修复 Bug 1（改用原生 addEventListener）后，按钮 click 应恢复正常。无需单独修改本按钮代码。

---

### Bug 3：单击标题未还原便签窗口 🟡

**文件**：`src/components/CapsuleView.tsx`，**第 170–185 行**

**当前代码**：
```typescript
// 第 170–185 行
const handleExitToPopout = useCallback(async () => {
  if (closingRef.current || titleDraft !== null) return;
  closingRef.current = true;
  try {
    const win = getCurrentWindow();
    const scale = await win.scaleFactor();
    const pos = await win.outerPosition();
    const logicalX = pos.x / scale;
    const logicalY = pos.y / scale;
    await win.destroy();  // 关闭胶囊
    await invoke("open_note_popout", {
      zone, name: nameRef.current, title,
      width: 500, height: 400,
      x: logicalX, y: logicalY + 50,
    });
  } catch {
    try { await getCurrentWindow().destroy(); } catch { /* ignore */ }
  }
}, [zone, title, titleDraft]);
```

**标题的 onClick 绑定**（第 247 行）：
```tsx
<span
  className="capsule-title"
  data-no-drag
  onClick={() => void handleExitToPopout()}
  onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(title); }}
>
```

**问题**：`data-no-drag` 已加，但拖动 Bug（Bug 1）存在时，click 事件也会被吞掉。修复 Bug 1 后同时验证本功能。

**逻辑说明**：
- 胶囊 `destroy()` 不触发 `capsule-closed` 事件（因为没有走 `close_capsule` 命令）
- 主窗口 `poppedOutNotes` 里已有该笔记（进入胶囊时加入）
- 便签窗口（`PopoutView`）关闭时会触发 `mknote:popout-closed`，归还 Tab 到主窗口 ✅

---

### Bug 4：胶囊加载缓慢（约 1 秒白屏） 🟡

**文件**：`src/components/CapsuleView.tsx`，**第 121–145 行**

**当前代码**（初始化 useEffect）：
```typescript
// 第 121–145 行
const [cfg, tags] = await Promise.all([
  invoke<AppConfig>("get_config"),
  invoke<CustomTagDef[]>("list_custom_tags"),
]);
// ... 然后串行：
const notes = await invoke<Array<...>>("list_notes", { zone });  // ← 串行，慢
```

**修复**：三个调用全部并行：
```typescript
const [cfg, tags, notes] = await Promise.all([
  invoke<AppConfig>("get_config"),
  invoke<CustomTagDef[]>("list_custom_tags"),
  invoke<Array<{ name: string; color?: string | null }>>("list_notes", { zone }),
]);
// 直接用 notes，去掉后面的 await invoke("list_notes", ...)
```

---

## 四、CSS 位置

**文件**：`src/App.css`，**第 4712–4841 行**（胶囊相关所有样式）

关键规则（第 4722–4742 行）：
```css
body.capsule-window,
body.capsule-window #root {
  background: transparent !important;  /* 根层透明 */
}

.capsule-root {
  width: 100vw;
  height: 100vh;
  background: transparent;
}

.capsule-bar {
  width: calc(100vw - 2px);
  height: calc(100vh - 2px);
  border-radius: 9999px;          /* 圆头胶囊形 */
  background: var(--mk-canvas);   /* 跟随主题 */
  overflow: hidden;
}
```

`.capsule-bar` 的 `overflow: hidden` 是圆头效果的关键，不要删除。

---

## 五、完整文件清单

| 文件路径 | 胶囊相关行范围 | 说明 |
|----------|---------------|------|
| `src-tauri/src/detach.rs` | 63–68（常量），185–290（命令） | Rust 命令 |
| `src-tauri/capabilities/default.json` | 全文 | 权限，`capsule-*` 已在 windows 列表 |
| `src/components/CapsuleView.tsx` | 全文（约 280 行） | 胶囊 UI，**主要修改文件** |
| `src/components/PopoutView.tsx` | 316–340（handleEnterCapsule），479–483（按钮） | 便签窗口的胶囊入口 |
| `src/App.tsx` | 994–1025（capsule-closed 监听），1061–1140（handleOpenCapsule） | 主窗口触发和状态管理 |
| `src/main.tsx` | 40–50 | 窗口路由 |
| `src/App.css` | 4712–4841 | 胶囊全部样式 |

---

## 六、修复顺序建议

1. **先修 Bug 1**（`CapsuleView.tsx` 第 148–158 行，改用原生 addEventListener）
2. **验证 Bug 2**（置顶按钮，预计 Bug 1 修复后自动恢复）
3. **验证 Bug 3**（单击标题，预计 Bug 1 修复后自动恢复）
4. **修复 Bug 4**（`CapsuleView.tsx` 第 121–145 行，三个调用并行）
