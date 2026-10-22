# MKnote 整体体验与架构优化总结

> 日期：2026-07-07
> 范围：性能可观测性、Tauri 调用边界、保存与索引策略、组件结构、动效系统、首次启动体验、首屏包体积优化。
> 原则：不推倒重写、不改变用户数据格式、不修改 Markdown 文件结构、不进入 WPF 壳验证。

## 一、总体结论

本轮优化已经把 MKnote 从“功能集中、首包偏重、Tauri 调用散落、启动反馈不足”的状态，推进到更健康的结构：

- UI 层不再直接散落调用 Rust command，核心调用收敛到 `appBridge` 和 service 层。
- 保存队列、索引刷新、资料库数据、Tab 状态、弹出窗口状态等高频逻辑已拆出独立 hooks。
- `App.tsx` 和 `CompactView.tsx` 的职责明显收敛，虽然仍偏大，但已经更接近“总控层 + 组合层”。
- 首次启动白屏问题已从“无反馈等待”变成“轻量启动界面 + 主应用按需加载”。
- 主要首屏大包问题已处理，普通编辑启动路径显著减轻。
- Motion tokens 和基础动效已接入，Tab、弹窗、资料库、状态栏、视图切换等交互具备继续打磨基础。

综合判断：臃肿问题已解决到可接受水平，代码优雅程度已经足够支撑后续产品迭代。剩余工作更适合围绕真实体验反馈继续精修，而不是继续做大规模结构重构。

## 二、主要优化内容

### 1. 性能标记与可观测性

新增轻量性能工具：

- `src/utils/perf.ts`
- `measureAsync`
- `measureSync`
- `markPerf`

默认只在开发环境或 `localStorage.mkPerf = "1"` 时输出，避免影响普通用户。核心后端调用、保存、加载、刷新等路径已接入轻量计时。

### 2. Tauri 调用收敛

新增并扩展：

- `src/services/appBridge.ts`
- `configService`
- `notesService`
- `libraryService`
- `windowService`
- `assetService`
- `siyuanService`
- `messageHubService`
- `aiService`
- `vaultService`
- `scriptService`

优化后，UI / hooks / utils 基本不直接调用 `@tauri-apps/api/core`。Tauri command 名称、参数和返回值保持不变，降低了行为风险。

### 3. 保存队列与索引刷新

抽出并优化：

- `useQueuedNoteWriter`
- `useAgentIndexRefresh`
- `refreshAfterStructureChange`

保存仍保持 600ms 自动保存策略，但写入队列边界更清晰；索引刷新从“容易伴随频繁操作触发”改为更受控的结构变化后刷新。

### 4. 高频状态拆分

从 `App.tsx` 中拆出：

- `useNoteSessionState`
- `useLibraryData`
- `useOpenTabsController`
- `usePoppedOutNotes`
- `useGlobalInteractionGuards`
- `useAppShellEffects`

这让 `App.tsx` 从“所有状态和行为混在一起”变成更偏协调层，后续继续维护会更稳。

### 5. CompactView 拆分

从 `CompactView.tsx` 拆出多块独立组件：

- `CompactHeader`
- `CompactStatusBar`
- `EditorPane`
- `LibraryPanel`
- `EditorToolbars`
- `UnifiedSettingsPanel`
- `SearchPopovers`
- `TrashPopover`
- `StatusBarNoteActions`
- `StatusBarMeta`
- `TemplatePicker`
- `ScriptRunButton`
- `ScriptToast`

当前 `CompactView.tsx` 仍有继续拆分空间，但主要 UI 区块已经具备清晰边界。

### 6. 动效系统

建立并接入 motion tokens：

- `src/styles/tokens.css`
- `App.css`
- `NoteTabsBar.css`

已覆盖资料库、Tab、弹窗、状态栏、视图切换等基础动效，并保留 `prefers-reduced-motion` 兼容。

## 三、启动体验专项优化

### 1. 首次打开无反馈

发现：

- Tauri 主窗口配置为 `visible=false`。
- 之前前端等 `loading=false` 后才调用显示窗口。
- 用户看到的是“没有窗口”，体感像应用卡住。

处理：

- 主窗口在入口阶段更早显示。
- `index.html` 加入极轻量内联启动界面。
- 应用加载前不再出现长时间纯白或无窗口反馈。

### 2. 首包过大

发现：

- 早期构建只有一个约 `2.99MB` 的主 JS 文件。
- `main.tsx` 静态导入主应用、Popout、Capsule、UI Playground 等视图。
- WebView 必须先解析完整应用包，才能渲染任何 UI。

处理：

- `main.tsx` 改为按窗口类型动态导入。
- 主窗口先显示，再加载 `App`。
- Popout、Capsule、UI Playground 独立拆包。

结果：

- 入口 JS 降到约 `212KB`。
- 启动反馈不再等待完整应用包解析完成。

### 3. 非首屏模块懒加载

按需加载的模块包括：

- `EditablePreviewEditor`
- `MessageHubView`
- `TodoTemplateView`
- `ImageDoodleModal`
- `UnifiedSettingsPanel`
- `LibraryPanel`
- `TimelineView`
- `TrashPopover`
- `AiAssistPanel`

普通编辑首屏只保留必要编辑器路径，其他功能打开时再加载。

### 4. Markdown 预览链路延后

发现：

- `CompactView` 顶层导入 `caretMapping`。
- `caretMapping` 间接导入 `previewMarkdown` / `marked`。
- 即使默认编辑模式不预览，也会把 Markdown 渲染链路拉入启动路径。

处理：

- `caretMapping` 改为切换预览时动态导入。
- `previewMarkdown` / `marked` 拆到预览时加载。

结果：

- `useEditorHistory` 相关 chunk 从约 `988KB` 降到约 `3KB`。
- `previewMarkdown` 约 `982KB`，但已不属于普通编辑首屏。

### 5. 巨大 Logo SVG 移出首屏

发现：

- `Icon.tsx` 使用 eager raw glob 加载所有 SVG。
- `logo.svg` 单独约 `1.3MB`。
- 24px 的顶栏 logo 导致一个约 `1.4MB` 的启动 chunk。

处理：

- `Icon.tsx` 从 eager 图标表排除 `logo.svg`。
- `IconLogoPlaceholder` 改为轻量内联 SVG 标记。

结果：

- 原约 `1.4MB` 的启动 chunk 消失。
- 基础图标 / 应用 chunk 降到约 `80KB`。

## 四、当前构建产物状态

最近一次构建中，主要产物如下：

- `index-*.js`：约 `212KB`
- 主 App 小 chunk：约 `100KB`
- 基础图标 / 应用 chunk：约 `80KB`
- `previewMarkdown-*.js`：约 `982KB`，按预览功能加载
- `UnifiedSettingsPanel-*.js`：约 `28KB`，按设置面板加载
- `EditablePreviewEditor-*.js`：约 `17KB`，按预览编辑器加载
- `LibraryPanel-*.js`：约 `7KB`，按资料库加载
- `MessageHubView-*.js`：约 `11KB`，按短消息中心加载
- `TodoTemplateView-*.js`：约 `12KB`，按待办页加载

和最初单个约 `2.99MB` 主 JS 相比，普通启动路径已经显著变轻。

## 五、验证情况

已通过：

- `npm.cmd run build`
- `npm.cmd run smoke:release`
- `npm.cmd run smoke:release:input`

`smoke:release:input` 使用隔离临时目录启动 release，预置默认笔记，模拟输入 marker，并确认自动保存落盘。说明启动拆包和懒加载没有破坏默认编辑和自动保存主链路。

## 六、当前仍需人工确认的体验路径

自动化验证已覆盖主窗口渲染和基础输入保存，但以下仍建议人工体验：

- 连续输入是否仍然顺滑。
- 600ms 自动保存是否符合预期。
- 切换笔记前保存是否稳定。
- 资料库打开、关闭、筛选、拖动是否顺畅。
- Tab 打开、关闭、置顶、恢复是否正常。
- 预览首次打开是否可接受，因为 `previewMarkdown` 已延后加载。
- Popout / Capsule 打开、保存、关闭。
- 托盘隐藏/显示、热键唤起。
- 思源上传、短消息中心、AI 面板、设置面板等按需模块首次打开体验。

## 七、关于 WPF 的判断

本轮暂不建议进入 WPF 壳验证。

理由：

- 当前卡顿和白屏主要证据集中在前端首包、启动显示时机和重依赖加载方式。
- Tauri release 冒烟可正常启动、显示、输入和保存。
- 通过拆包和懒加载已经获得明显收益，暂无证据表明主要瓶颈来自 WebView 壳层本身。

只有在后续真实体验中仍出现明确窗口级问题，例如置顶、拖动、焦点、托盘、显示隐藏明显不顺滑，才建议做 WPF PoC。

## 八、2026-07-08 v3.2 胶囊模式稳定化补充

在整体架构优化之后，胶囊模式完成了一轮集中稳定化，并通过用户逐项验收。本轮定义为 **MKnote v3.2.0**。

本轮重点不是新增大功能，而是把主窗口、Popout、Capsule 三种窗口形态整理成可维护的生命周期：

- `windowService` 继续作为前端调用 Tauri command 的边界，新增 Popout / Capsule 互转与重命名通知方法。
- `detach.rs` 负责窗口创建、关闭和形态转换，使用 suppression 集合区分真实关闭与形态转换销毁。
- `usePoppedOutNotes` 支持重命名 popped-out key，避免标题编辑后状态错位。
- `appBridge` 增加 event `emit` 封装，主窗口通过 `mknote:theme-changed` 同步主题给其他 WebView。
- `CapsuleView` 使用原生 pointer 事件 + 位移阈值处理透明窗口拖拽，避免 React 合成事件和按钮点击互相干扰。
- `PopoutView` 与 `CapsuleView` 均支持外置会话恢复；Popout 位置和大小、Capsule 吸附状态可持久化。
- `NoteTabsBar` 的拖出逻辑从仅上边界扩展为四边界。
- `system.rs` 收窄主窗口焦点事件，降低截图后偶发置前的概率。

验证：

- `npm.cmd run build`
- `cargo check --manifest-path src-tauri\Cargo.toml`（建议配合临时 `CARGO_TARGET_DIR`）

详细交接见 [HANDOVER-2026-07-08-capsule-mode验收总结.md](HANDOVER-2026-07-08-capsule-mode验收总结.md)。

## 九、剩余优化空间

仍有优化空间，但已进入边际收益递减阶段：

1. 启动逻辑继续分层
   让编辑器主体更早可交互，资料库、最近笔记、颜色标签、思源状态等后台补齐。

2. 真实耗时定位
   用 `localStorage.mkPerf = "1"` 观察 `get_app_state`、`read_note`、Tab 恢复、资料库刷新等耗时。

3. 预览链路再优化
   `previewMarkdown` 仍接近 1MB，但已经按需；只有预览首次打开仍慢时才值得继续替换或拆分。

4. 继续轻拆总控层
   `App.tsx` 和 `CompactView.tsx` 仍偏大，但当前已经不构成主要风险，可等待后续功能迭代时顺手拆。

## 九、最终评价

本轮优化已经基本解决“代码过于臃肿”和“启动首屏过重”的主要问题。

当前状态可以概括为：

- 架构边界更清楚。
- 启动路径更轻。
- 非首屏能力按需加载。
- 保存、索引、Tab、资料库等核心流程更可维护。
- 动效系统具备基础规范。
- 暂无必要因为顺滑度问题转向 WPF。

后续更适合进入真实使用反馈和细节体验打磨，而不是继续做大规模重构。
