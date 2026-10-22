# MKnote 项目总结

> **版本**：5.2.4 · **状态**：整合 Quick 数据目录、外部刷新和 Allnote Work；验证及绿色包证据见 [RELEASE-5.2.4.md](RELEASE-5.2.4.md)。
> **用途**：① 记录实施路径，便于按文档复刻全功能；② 为后续迭代、升级、改功能提供操作指南。

---

## 一、项目概述

### 1.1 产品定位

**MKnote**（界面名 **MKNOTE**，包名 `md-sticky-note`）是 Windows 桌面 **轻量 Markdown 便签**：

- 每条便签 = 一个本地 `.md` 文件
- 无边框窗口、系统托盘、全局热键
- 内嵌资料库（文件夹 + 笔记列表 + 颜色标签）
- 可视化预览编辑、胶囊 / Popout 便签、归档工作流
- 多标签页编辑、思源笔记单向上传或 Obsidian 笔记与附件复制
- 绿色便携版：数据与 `config.json` 与 exe 同目录

**不是** Obsidian 替代品，**不是**知识库/云同步中心。

### 1.2 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite 5 |
| 样式 | `src/App.css` + `src/styles/tokens.css` + 组件级 CSS |
| 后端 | Rust（`src-tauri/src/`） |
| 可视化编辑 | Milkdown / ProseMirror（`src/visual-editor/` 适配器） |
| 思源 HTTP | `reqwest`（blocking） |
| 插件 | single-instance、global-shortcut、autostart、dialog、notification |

### 1.3 本阶段已交付能力（验收口径）

| 模块 | 能力 |
|------|------|
| 基础编辑 | 源码编辑、可视化预览、防抖保存、撤销历史 |
| 资料库 | inbox / default / 自定义文件夹；CRUD、拖拽移动、颜色标签与筛选 |
| 胶囊待办 | 旧 `待办事项.md` 专用 UI 已移除；胶囊可点击完成并进入现有 archive 归档体系 |
| 系统集成 | 托盘隐藏、全局热键、置顶、自启、窗口几何记忆 |
| 多标签 | 顶栏标签栏、持久化 `open_tabs`、中键关闭、关闭其他前先 flush |
| 便携数据 | exe 同目录 `inbox`、`File`、`config.json`；旧 AppData 自动迁移合并 |
| 思源上传 | 配置面板、测试连接、上传当前便签到 `/MKnote/{标题}` |
| Agent 索引 | `llms.txt`、`mknote-manifest.json` 自动生成 |
| 0.2 稳定性 | 退出/隐藏 flush、文件名预检、思源 zone 路径、HTML 清洗 |
| 0.2 捕获检索 | Quick Capture、剪贴板 Inbox、全文 Omnibox、最近访问 |
| 0.2 组织关联 | 收藏 Star、轻量 `[[双链]]`、反向引用 |
| 0.2 富内容 | `File/assets/` 拖拽导入、思源图片上传 |
| 0.2 进阶 | 分离窗口 Detach、AI 划词助手、浏览器剪藏 HTTP、项目模板 |
| 打包 | `npm run build:green` → `portable/`；同时生成 NSIS/MSI |

---

## 二、实施路径（复刻全功能）

按下列顺序实施，可从零复现当前版本。每步对应仓库中已有模块，可直接对照源码。

### 阶段 0：环境与脚手架（M0）

1. `npm create tauri-app`（React + TS），配置 `tauri.conf.json`：无边框 760×640、`decorations: false`、`alwaysOnTop`。
2. Rust 模块划分：`lib.rs`（配置 + command）、`notes.rs`、`paths.rs`、`system.rs`。
3. `AppConfig` 序列化到 JSON；前端 `get_app_state` 启动拉配置。

**验收**：`npm run tauri dev` 能打开空窗口。

### 阶段 1：便签 CRUD 与静默保存（M1）

1. **`paths.rs`**：定义 `NoteZone`（`inbox` | `default` | `folder:id`），`writable_base` 解析可写根目录。
2. **`notes.rs`**：`list_notes`、`read_note`、`write_note`、`create_note`（`YYYYMMDDHHmmssSSS.md`）、`rename_note`、`delete_note`、`move_note`。
3. **`App.tsx`**：`content` + `dirty`，`useDebouncedCallback` 600ms 写盘；切换便签前 `flushSave`。
4. 标题 = 文件名去 `.md`（非 Markdown H1）。

**验收**：选目录后能新建、编辑、重命名、删除 `.md`，重启后内容仍在。

### 阶段 2：预览与 Markdown（M2）

1. `EditablePreviewEditor.tsx`（WYSIWYG ↔ Markdown），由 `markdownRenderCore.ts` 统一生成预览 HTML。
2. `editorFormat.ts`：工具栏格式化；预览模式 `document.execCommand`。
3. `viewMode`: `edit` | `preview`。

**验收**：预览可编辑并回写源码；GFM 基本语法可用。

### 阶段 3：窗口与系统集成（M3–M4）

1. **`system.rs`**：托盘、关闭→隐藏、`toggle_window`、全局热键注册、`hide_window`/`show_window`。
2. 窗口几何写入 `config.window` / `compact_geometry`。
3. `tauri-plugin-autostart`、`single-instance`（二次启动唤起窗口）。
4. `utils/windowLayout.ts`：展开/收起（历史 `layout_mode`，主流程以 compact 为主）。

**验收**：热键显隐、托盘恢复、自启、关闭不退出进程。

### 阶段 4：UI v2 与资料库（M6–M7）

1. **`CompactView.tsx`**：主界面（顶栏、工具栏、编辑区、状态栏、`LibraryPanel`）。
2. 资料库：文件夹栏 + 笔记列表；`list_folders`、`create_folder`、`rename_folder`。
3. 颜色标签：`set_note_color`、`list_notes_by_color`、`.mknote-note-colors.json`。
4. **`tokens.css`** + `set_theme_mode` / `set_theme_styles`：明暗与 accent。
5. 规格文档：`docs/MKnote-UI-v2.md`。

**验收**：资料库开合、文件夹与笔记全套操作、颜色筛选。

### 阶段 5：待办事项模板（M8，历史）

旧版曾实现 `TodoTemplateView.tsx`（已移除，旧待办专用组件）、`ensure_todo_note` 和 `isTodoNote` 专用路径。当前版本已移除此功能；`待办事项.md` 若存在，按普通 Markdown 便签处理。
4. 规则：双列（工作/私人）、父子任务、拖拽、完成 7 天后清理。

**历史验收**：旧版曾验证专用 UI；当前版本已移除，旧文件按普通 Markdown 便签处理。

### 阶段 6：Agent 友好层（M9-B  subset）

1. **`agent_index.rs`**：`refresh_agent_index` 扫描磁盘写 `llms.txt`、`mknote-manifest.json`。
2. 启动与资料库变更后刷新。
3. 文档：`docs/AGENT-INTEGRATION.md`。

**验收**：`{base}` 下有两份索引，字段与 manifest 说明一致。

### 阶段 7：多标签页（会话迭代）

1. **`NoteTabsBar.tsx`** + `NoteTabsBar.css`：标签列表、横向滚动、左侧 `+`、关闭其他。
2. **`useTabSessions.ts`**：每标签独立 `content` / `dirty` / `history`。
3. **`noteTabs.ts`**：`tabKey(zone, name)` 唯一键。
4. **`AppConfig.open_tabs`** + `set_open_tabs`：持久化；启动 `restoreTabsFromConfig`。
5. 产品规则：
   - 不可关闭到 0 标签；中键关闭；无重复标签
   - 资料库/搜索打开 → 新标签
   - 删除便签 → 关标签；重命名 → 同步标题
   - 关闭其他：先 `flushTab` 全部脏标签

**验收**：重启恢复多标签；切换不丢未保存内容。

### 阶段 8：便携路径与打开文件夹

1. **`paths.rs`**：`writable_base` **仅** exe 目录；`sync_storage_paths` 强制 `{base}/inbox`、`{base}/File/default`。
2. `config.json` → `{base}/config.json`；`legacy_config_path` 读旧 AppData 并迁移。
3. **`get_note_dir`** + 工具栏「打开所在文件夹」：`open_folder`（Windows Explorer）。

**验收**：绿色版整夹拷贝后配置与便签跟随；能打开当前便签目录。

### 阶段 9：思源笔记上传（M10）

1. **`siyuan.rs`**：HTTP 客户端、`createDocWithMd`、`updateBlock`、`Authorization: Token …`、HTTPS 证书宽松、URL `/api` 规范化。
2. **`siyuan_map.rs`**：`File/.mknote-siyuan-map.json` 映射 `zone+文件名 → doc_id`。
3. **`SiyuanSettingsPanel.tsx`**：独立浮层（blur 不关闭）、测试连接传表单 token。
4. **`set_siyuan_config`**：扁平参数 `apiUrl` / `apiToken` / `notebookId`（勿用嵌套 `args`）。
5. 路径：`/MKnote/{便签标题}`，**不**按 inbox/default/文件夹分子目录。
6. 待办禁止上传；MKnote 为准覆盖思源正文。

**验收**：测试连接列出笔记本；上传后在思源 `MKnote/标题` 可见；再次上传为更新。

### 阶段 10：打包发布

```powershell
cd D:\MDnote
npm install
npm run build:green    # → portable\MarkdownStickyNote.exe + README.txt
```

安装包额外输出：

- `src-tauri\target\release\bundle\nsis\*.exe`
- `src-tauri\target\release\bundle\msi\*.msi`

**验收**：无 Node 环境双击绿色 exe 可运行；WebView2 可用。

---

## 三、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  React (App.tsx 状态中枢)                                    │
│  CompactView │ CapsuleView     │ 设置浮层                  │
│  NoteTabsBar │ SiyuanSettingsPanel │ EditablePreviewEditor   │
└───────────────────────────┬─────────────────────────────────┘
                            │ invoke (Tauri 2)
┌───────────────────────────▼─────────────────────────────────┐
│  lib.rs          AppConfig / commands 注册                   │
│  notes.rs        .md CRUD、颜色、文件夹                       │
│  paths.rs        zone、writable_base、路径迁移               │
│  system.rs       托盘、热键、窗口事件                         │
│  agent_index.rs  llms.txt + manifest                         │
│  siyuan.rs       思源 API                                    │
│  siyuan_map.rs   上传映射表                                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  {exe_dir}/                                                  │
│    config.json                                               │
│    inbox/*.md                                                │
│    File/default/待办事项.md                                   │
│    File/<folder>/*.md                                        │
│    File/.mknote-note-colors.json                             │
│    File/.mknote-siyuan-map.json                              │
│    llms.txt / mknote-manifest.json                           │
└─────────────────────────────────────────────────────────────┘
```

### 前端状态要点（`App.tsx`）

| 状态 | 说明 |
|------|------|
| `config` | 来自 Rust，含主题、热键、open_tabs、思源配置等 |
| `activeNote` + `activeZone` | 当前编辑便签 |
| `openTabs` | 标签列表 `{ zone, name, title }` |
| `tabSessions` | 各标签内存会话（`useTabSessions`） |
| `content` / `dirty` | 当前标签编辑缓冲 |
| `libraryOpen` | 资料库是否展开（本地 UI，不持久化） |
| `viewMode` | `edit` \| `preview` |

保存策略：**600ms 防抖** + 切换标签/预览/隐藏窗口前 **flush**。

---

## 四、迭代与维护指南

### 4.1 文档索引（改前先读）

| 文档 | 何时读 |
|------|--------|
| **本文** `PROJECT-SUMMARY.md` | 总览、复刻、迭代地图 |
| `AGENT-HANDOVER.md` | 日常开发交接（目录地图、约定） |
| `MKnote-UI-v2.md` | 改 UI/交互规格 |
| `AGENT-INTEGRATION.md` | 外部 AI 读写便签 |
| `SIYUAN-INTEGRATION.md` | 思源上传规则与 API |
| `README.md` | 用户向说明与命令 |

### 4.2 常见改动 → 入口文件

| 需求 | 前端 | 后端 |
|------|------|------|
| 新设置项 | `types.ts` `AppConfig` → 设置 UI → `invoke` | `lib.rs` 字段 + `set_*` command |
| 便签 CRUD 规则 | `App.tsx` | `notes.rs` |
| 路径 / zone | — | `paths.rs` |
| 标签栏行为 | `NoteTabsBar.tsx`、`App.tsx` | `set_open_tabs`、`OpenTabRef` |
| 资料库 UI | `CompactView.tsx` `LibraryPanel` | `list_folders` 等 |
| 待办逻辑（历史） | `TodoTemplateView.tsx`（已移除，旧待办专用组件） | `ensure_todo_note`（已移除） |
| 思源 | `SiyuanSettingsPanel.tsx`、`App.tsx` upload | `siyuan.rs`、`siyuan_map.rs` |
| 主题样式 | `tokens.css`、`App.tsx` `applyTheme` | `set_theme_mode` / `set_theme_styles` |
| 热键/托盘/窗口 | `HotkeyPanel.tsx` | `system.rs`、`tauri.conf.json` |
| Agent 索引字段 | — | `agent_index.rs` |
| 打包说明 | — | `scripts/pack-green.ps1` |

### 4.3 新增 Tauri 能力标准流程

1. 在 `src-tauri/src/*.rs` 实现函数，返回 `Result<_, String>`，错误信息用中文。
2. `lib.rs` 添加 `#[tauri::command]` 并加入 `generate_handler![...]`。
3. `src/types.ts` 补充类型；`App.tsx` 或组件内 `invoke`。
4. 若持久化：扩展 `AppConfig` + `save_config`。
5. `cargo check` + `npm run build` 通过后再交付。

**注意**：Tauri 2 前端 camelCase（`apiUrl`）自动对应 Rust `api_url`；避免单个嵌套 `args` 对象除非两端一致。

### 4.4 代码与产品约束

- **最小改动**：只动相关文件，不顺手大重构。
- **标题规则**：列表/标签/思源路径用 **文件名去 `.md`**，不是 Markdown H1。
- **待办隔离**：`default/待办事项.md` 不进标签栏、不上传思源。
- **Windows 优先**：`open_folder`、自启、热键按 Windows 实现。
- **dev vs release**：`tauri dev` 时 `writable_base` 在 `target/debug/` 旁；与绿色版 exe 目录不同，属正常。
- **单实例**：二次启动会 `show_main_window`，勿假设多进程写同一目录。

### 4.5 已知坑与排错

| 现象 | 原因 / 处理 |
|------|-------------|
| 思源测试 401 | 确认远程 URL 的 token；表单 token 需传入 `siyuan_test_connection`；检查反代是否转发 `Authorization` |
| `set_siyuan_config missing args` | 旧构建；需扁平参数的命令签名 |
| 配置找不到 | 绿色版看 exe 同级 `config.json`，不是 AppData |
| 标签切换丢内容 | 切换前未 `flushTab` / `tabSessions` 未更新 |
| 思源路径多一层 default | 已改为 `/MKnote/{标题}`；旧映射仍按 `doc_id` 更新原文档 |
| JSX 中文 `{标题}` | 花括号会被当变量；文案用全角或括号说明 |

### 4.6 后续迭代建议（未做或可做）

| 方向 | 说明 |
|------|------|
| M9-A 可隐藏 Markdown 工具栏 | 扩展 `editorFormat.ts` 与 `CompactView` 工具栏 |
| M9-C UI 打磨 | 统一弹窗、间距、暗色对比度 |
| 搜索索引 | 便签 >500 时可引入 tantivy 索引 |
| 浏览器剪藏扩展 | 本体已提供 `127.0.0.1:17345/clip` 接收端，需独立扩展仓库 |
| 真实云同步 | 需协议与冲突策略；与思源推送不同产品能力 |
| README 同步 | 将 `%AppData%` 描述改为 exe 同级（与 `paths.rs` 一致） |

---

## 五、配置与数据契约

### 5.1 `config.json`（与 exe 同目录）

| 字段 | 含义 |
|------|------|
| `last_note` / `last_note_zone` | 上次打开便签 |
| `open_tabs` | `[{ zone, name }]` 持久化标签 |
| `window` / `compact_geometry` | 窗口位置尺寸 |
| `editor_font_size` | 12–24 |
| `theme_mode` / `light_theme` / `dark_theme` / `accent_skin` | 主题；旧 `theme` 仅在读取配置时迁移 |
| `always_on_top` / `autostart` | 系统集成 |
| `note_color_labels` | 颜色标签显示名 |
| `siyuan_api_url` / `siyuan_api_token` / `siyuan_notebook_id` | 思源 |
| `lsky_url` / `lsky_email` / `lsky_password` / `lsky_strategy_id` | 兰空图床；已使用并验收 MDnote 专属存储策略 ID `4`，在同一上传账号下精确查找 `MDnote` 相册，不得复用思源策略 ID `3` |
| `global_hotkeys` | 切换窗口 / Quick Capture / 剪贴板 / 搜索 |
| `recent_notes` | 最近打开便签（最多 20） |
| `ai_config` | AI 助手 API |
| `clip_server_enabled` / `clip_server_port` | 浏览器剪藏 HTTP 服务 |

### 5.2 元数据文件

| 文件 | 用途 |
|------|------|
| `File/.mknote-note-colors.json` | 笔记颜色标签 |
| `File/.mknote-folders.json` | 文件夹遗留元数据 |
| `File/.mknote-siyuan-map.json` | 思源 doc_id 映射（zone+文件名键） |
| `File/.mknote-stars.json` | 收藏便签 |
| `File/assets/` | 本地图片资产 |
| `llms.txt` | Agent 说明（自动生成） |
| `mknote-manifest.json` | Agent 索引（自动生成） |

---

## 六、Tauri 命令全集

| Command | 用途 |
|---------|------|
| `get_app_state` | 配置 + exe_base |
| `get_config` | 读配置 |
| `set_autostart` / `set_always_on_top` | 系统集成 |
| `set_editor_font_size` | 字号 |
| `set_theme_mode` / `set_theme_styles` | 主题 |
| `enter_expanded_layout` / `leave_expanded_layout` | 历史布局 |
| `hide_window` / `show_window` / `toggle_window` | 窗口显隐 |
| `get_note_dir` | 当前 zone 目录路径 |
| `set_open_tabs` | 持久化打开的标签 |
| `open_folder` | 资源管理器打开路径 |
| `list_notes` / `read_note` / `write_note` | 便签读写 |
| `create_note` / `rename_note` / `delete_note` / `move_note` | CRUD |
| `list_folders` / `create_folder` / `rename_folder` / `set_folder_color` | 文件夹 |
| `list_note_colors` / `list_notes_by_color` / `set_note_color` / `set_note_color_labels` | 颜色 |
| `ensure_todo_note`（已移除） | 旧版用于确保待办模板存在 |
| `set_last_note_file` | 记住上次打开 |
| `refresh_agent_index` | 重建 llms.txt / manifest |
| `siyuan_test_connection` | 测试思源（可传 apiUrl/apiToken） |
| `siyuan_list_notebooks` | 列出笔记本 |
| `set_siyuan_config` | 保存思源配置 |
| `siyuan_upload_current_note` | 上传当前便签（含本地图片） |
| `search_notes` | 全文搜索 |
| `find_backlinks` | 反向引用 |
| `quick_capture_create` / `clipboard_inbox` | 快速捕获 |
| `record_recent_note` | 记录最近访问 |
| `set_note_starred` / `list_starred_notes` | 收藏 |
| `import_asset` | 导入图片到 File/assets |
| `open_detach_window` | 分离小窗 |
| `set_ai_config` / `set_global_hotkeys` / `set_clip_server` | 设置 |
| `create_project_note` | 项目模板 |
| `exit_app` | 确认 flush 后退出 |

---

## 七、全功能验收清单

复制下列项逐条验证，即等于「复刻验收」：

- [ ] 开发：`npm run tauri dev` 正常编译启动
- [ ] 新建/打开/重命名/删除便签，600ms 自动保存
- [ ] 编辑 ↔ 预览切换，预览可回写
- [ ] 资料库：文件夹与笔记 CRUD、拖拽移动、颜色标签与筛选
- [ ] 胶囊 / Popout：便签可独立窗口与胶囊化；胶囊完成后进入归档
- [ ] 热键显隐、托盘、关闭隐藏、自启、置顶
- [ ] 多标签：打开多篇、切换、中键关闭、关闭其他、重启恢复
- [ ] 打开所在文件夹（有便签时可用）
- [ ] 绿色版：`npm run build:green`，拷贝 `portable` 可运行
- [ ] 思源：配置、测试连接、选笔记本、上传与再次覆盖
- [ ] Agent：`llms.txt`、`mknote-manifest.json` 存在且随资料库更新
- [ ] 隐私便签不上传思源；上传路径为 `/MKnote/{标题}` 无 zone 子目录

---

## 八、命令速查

```powershell
# 开发
npm install
npm run tauri dev

# 检查
npm run build
cargo check --manifest-path src-tauri\Cargo.toml

# 绿色便携版
npm run build:green

# 开发机迁移 zip
npm run pack:dev
```

---

**新接手者阅读顺序**：本文 §二实施路径 → `AGENT-HANDOVER.md` → `MKnote-UI-v2.md` → 打开 `App.tsx` + `CompactView.tsx` → 按需深入 `notes.rs` / `paths.rs` / `siyuan.rs`。

*文档随仓库演进；改架构或里程碑时请同步更新本节与 `README.md` 里程碑勾选。*

