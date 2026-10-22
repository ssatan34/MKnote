# MKnote 3.2 胶囊 / Popout 模式验收总结

日期：2026-07-08

版本定义：v3.2.0

范围：胶囊模式、便签 Popout、主窗口 Tab 状态、主题同步、窗口置前行为、Tab 拖出生成便签窗口。

## 一、本阶段结论

胶囊模式已从“部分实现、核心交互不可用”推进到可验收状态。本次验收版本定义为 **MKnote v3.2.0**。用户逐项验证后，本轮相关问题全部通过。

已确认通过：

- 主窗口点击 Logo 可进入胶囊，主窗口 Tab 状态保持正确。
- Popout 便签窗口可折叠为胶囊，不再把 Tab 错误归还主窗口。
- 胶囊可拖拽，关闭按钮和颜色标签按钮不会触发拖拽。
- 单击颜色标签按钮可从胶囊还原为 Popout 便签窗口。
- 标题双击可编辑，重命名后窗口状态和主窗口 Tab 状态保持一致。
- 置顶按钮可见且可切换置顶状态。
- 未置顶的 Popout / Capsule 可跨重启恢复。
- Popout 位置和大小可持久化恢复。
- Popout 标题显示为高亮色，显示态可拖动窗口，双击进入编辑态。
- 胶囊左右吸附可重新拖拽换边吸附，左侧吸附后可正常收回。
- 透明窗口四角不再露黑底。
- 主窗口切换主题后，Popout 与 Capsule 可实时跟随主题。
- 主窗口 Tab 向上、下、左、右任意方向拖出窗口，都可生成 Popout 便签窗口。
- 截图工具结束后，主窗口不再因为焦点事件重复 `set_focus()` 而主动抢到前台。

## 二、关键修复点

### 1. 胶囊拖拽

`CapsuleView` 不再依赖 React `onMouseDown` 直接触发拖拽，而是使用原生 pointer 监听和 5px 位移阈值：

- `pointerdown` 记录起点。
- `pointermove` 超过阈值后调用 `startDragging()`。
- `[data-no-drag]`、按钮、输入框等控件区域排除拖拽。

这样避免了透明 Tauri 窗口、React 合成事件、按钮点击之间互相干扰。

### 2. 胶囊与 Popout 形态转换

形态转换不再直接 `destroy()` 后依赖关闭事件推断，而是走显式命令：

- `restore_popout_to_capsule`
- `restore_capsule_to_popout`

Rust 侧通过 suppression 集合区分“用户关闭窗口”和“形态转换销毁源窗口”，避免错误触发 `mknote:popout-closed` 或 `mknote:capsule-closed`，从而避免 Tab 被误归还。

### 3. 重命名状态同步

Popout / Capsule 中编辑标题并重命名后，会通过 `mknote:popped-out-renamed` 通知主窗口同步：

- popped-out 集合 key
- openTabs
- pinnedTabs
- tabVisitOrder
- 持久化的 open_tabs

这解决了重命名后无法关闭、无法还原、Tab 状态错位的问题。

### 4. 主题同步

主窗口切换主题时，通过 `appBridge.emit("mknote:theme-changed", cfg)` 广播配置。

Popout 与 Capsule 监听该事件并重新执行 `applyTheme(cfg)`，因此不再只在窗口初始化时读取一次主题。

### 5. 截图后偶发置前

`system.rs` 中主窗口 `Focused(true)` 事件不再无条件调用 `window.set_focus()`。

保留热键、托盘、显式显示窗口时的置前行为，但避免截图工具结束后的焦点变化把 MKnote 偶发拉到最前。

### 6. Tab 四向拖出

`NoteTabsBar` 的拖出判断从 `clientY < 0` 改为检测窗口四条边：

- `clientX < 0`
- `clientY < 0`
- `clientX > window.innerWidth`
- `clientY > window.innerHeight`

现在从左、右、下、上拖出 Tab 都可以生成 Popout 便签窗口。

## 三、主要变更文件

| 文件 | 说明 |
|------|------|
| `src/components/CapsuleView.tsx` | 胶囊拖拽、颜色标签还原、标题编辑、置顶按钮、主题监听 |
| `src/components/PopoutView.tsx` | Popout 到 Capsule 的显式转换、标题重命名广播、主题监听 |
| `src/components/NoteTabsBar.tsx` | Tab 四向拖出窗口 |
| `src/App.tsx` | 胶囊入口、popped-out 重命名同步、主题广播 |
| `src/services/windowService.ts` | 胶囊/便签转换服务方法 |
| `src/services/appBridge.ts` | 新增 Tauri event `emit` 封装 |
| `src/hooks/usePoppedOutNotes.ts` | popped-out key 重命名 |
| `src-tauri/src/detach.rs` | Popout/Capsule 生命周期转换命令与关闭事件抑制 |
| `src-tauri/src/lib.rs` | 注册新增 Tauri commands |
| `src-tauri/src/system.rs` | 收窄主窗口焦点事件置前逻辑 |
| `src/App.css` | 胶囊透明四角、按钮可见性和基础样式 |

## 四、验证记录

已通过：

```powershell
npm.cmd run build
```

已通过：

```powershell
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'mknote-codex-cargo-target'
cargo check --manifest-path src-tauri\Cargo.toml
```

说明：当前机器上项目默认 `target` 目录可能遇到 Windows 权限问题，Rust 检查建议继续使用临时 `CARGO_TARGET_DIR`。

## 五、新窗口继续开发注意事项

1. 胶囊、Popout、主窗口 Tab 是同一个状态机，不要把窗口关闭和形态转换混在一起处理。
2. 新增窗口形态时，优先走显式 Rust command，而不是前端直接 `destroy()` 后靠关闭事件补状态。
3. Popout / Capsule 内的标题重命名必须同步主窗口 key，否则会出现关闭、还原、置顶状态错位。
4. 主题类变更需要通过 `mknote:theme-changed` 广播给其他 WebView。
5. 透明窗口四角透明依赖 `body.capsule-window` 根层透明与 `.capsule-bar` 自身背景，不要给根层加背景。
