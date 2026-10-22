# MKnote 项目交接（给新 Agent / 新开发者）

> **请先读本文**，再改功能或 UI。产品名在界面为 **MKNOTE**；仓库/包名多为 `md-sticky-note`。

> **v5.2.4 整合（2026-10-20）**：整合 Quick 数据目录、外部文件自动刷新、Allnote Work 项目分组与多层任务、自动任务只读保护，以及来源笔记和项目主页入口；保留 5.2.3 多行转待办与 Tab 路径复制。外部刷新须等待在途读取和本地写入，自动任务的修改、清理和排序保护同时覆盖前后端。单色 SVG 作为备用母版随源码保留，当前品牌图标不切换。本轮使用临时配置、笔记和独立应用标识验证，不替换在用程序或迁移真实数据；后续版本应继承本次完整源码清单，见 [RELEASE-5.2.4.md](RELEASE-5.2.4.md)。

> **v5.2.3 Quick 数据目录增补（2026-10-20）**：本次将 10 月 13 日已验收的 Todo/Pocket 目录设置与统一读写、S3 同步路径补入 5.2.3，后续版本须保留。新包和限定范围源码快照见 [RELEASE-5.2.3.md](RELEASE-5.2.3.md) 的增补记录；下文 10 月 17 日排除 Quick 改动的说明仅对应旧包。另有的 Allnote Work 分组改动继续独立保留，不随本次补包发布。

> **v5.2.3 收口（2026-10-17）**：文本与可视化编辑均支持选中多行后逐行生成待办；保留空行、已有任务及完成状态，自动折行不拆分，无选区保留原单行操作。顶层纯任务列表取消额外缩进，并保留与后续段落的间距。用户已确认验收通过。文本复用行范围与撤销逻辑，可视化复用 ProseMirror 节点和单次事务，保留文字格式。绿色包从隔离的本次发布源码构建，原有 Quick 等未提交改动不纳入本次提交或包体。发布证据见 [RELEASE-5.2.3.md](RELEASE-5.2.3.md)。

> **v5.2.2 收口（2026-10-16）**：用户已确认 Tab 右键复制笔记路径验收通过。常规 Tab、置顶 Tab 与置顶「更多」列表共用菜单；复用 `notesService.getDir`、Tauri `join` 和剪贴板 API，复制右键目标的完整目录、原始文件名与扩展名，无需切换当前笔记。目录读取或复制失败显示提示。发布与验证边界见 [RELEASE-5.2.2.md](RELEASE-5.2.2.md)；本轮提交保留工作区原有 Quick Todo / Quick Pocket 等未提交修改。

> **v5.2.1 收口（2026-10-10）**：用户已确认置顶栏与 Tab 切换优化验收通过。置顶栏在编辑区之外占据独立行，左侧对齐工具栏右边界；标题按实际宽度显示（最多 220px），溢出菜单保留完整标题，激活尺寸不抖动，仅当前笔记属于置顶笔记时突出整栏。切换复用已有 Tab 元数据与本窗口成功确认的迁移备份；未保存内容仍先写入，失败/冲突停止切换，首次备份失败回退源码。离开可视化编辑器前同步收取最后输入，延迟输入回调读取当前文档，连续点击以最后选择为准。实施、验证与绿色包证据见 [RELEASE-5.2.1.md](RELEASE-5.2.1.md)。

> **v5.2.0 收口（2026-10-02）**：用户已确认本轮验收通过。新增 Jev 官方 / Command Code 自动文件夹归类，独立保存两家密钥与模型；设置 → AI 配置分为「AI 助手」和「Jev 自动归类」两个 Tab。候选只来自勾选的已有自定义文件夹。关闭 Tab 时空白正文移入回收站，非空 Default 普通笔记后台归类；隐藏到托盘、Popout 和胶囊关闭不触发。中键原先在 pointerdown 与 auxclick 重复关闭，现只保留 pointerdown，并拦截同一 Tab 的重复异步关闭。调用失败、无效候选、正文变化或后台结果返回时笔记已重新打开，保留原位置。详情见 [RELEASE-5.2.0.md](RELEASE-5.2.0.md)。

> **v5.1.0 收口（2026-10-02）**：用户已验收 Obsidian 上传与附件路径调整、图片离线回退、上传设置样式与 2 秒按钮成功反馈，以及各处透明羽毛 Logo。思源连接测试通过 `spawn_blocking` 在后台执行；选项卡切换保留思源表单。图标母版为 `src/assets/brand/logo-transparent.png`，运行 `scripts/generate-brand-icons.ps1` 统一导出；`src-tauri/build.rs` 跟踪 `icons`，避免 EXE 沿用旧资源。发布包与验证详情见 [RELEASE-5.1.0.md](RELEASE-5.1.0.md)。

> **v5.0.2 收口（2026-09-17）**：当前顶栏 Logo 点击将当前笔记转为胶囊模式；状态栏字数区域 Ctrl+点击仍可进入本地 Private 模式，数据写入 `File/.private/`。`HANDOVER-2026-07-02.md` 中“Ctrl+点击 Logo 进入隐私笔记”属于历史入口记录，不代表当前路由。
> 全项目总结与复刻路径见 **[PROJECT-SUMMARY.md](PROJECT-SUMMARY.md)**。

> **最新 UI 收口（2026-07-16）**：Quick Todo 提醒采用独立原生窗口，优先放置在 Todo 窗口左侧；其 Save 必须直接复用 `src/App.css` 的 `mk-save-button`，不得另写或改动主窗口正确样式。Todo 的闹钟、子项目和关联便签行操作默认隐藏，仅在行悬浮、焦点进入或关联菜单打开时显示。完整记录见 [HANDOVER-2026-07-16-ui-and-quick-windows收口.md](HANDOVER-2026-07-16-ui-and-quick-windows收口.md)。

> **最新功能收口（2026-07-16）**：Quick Pocket 底部与 Quick Todo 右下角新增四类标签筛选；再次点击当前标签恢复默认列表。Quick Todo 筛选状态下禁用拖拽手柄，保持父子 Todo 的同父级排序契约。完整记录见 [HANDOVER-2026-07-16-quick-filters-release.md](HANDOVER-2026-07-16-quick-filters-release.md)。

> **Quick Todo 标签更新（2026-08-21）**：Quick Todo 现有六类标签筛选为重要、等待、下一步、想法、紧急、重要紧急；再次点击当前标签恢复默认列表。新增“紧急”使用绿色闪电图标，“重要紧急”使用橙色辐射圆图标。Quick Todo 筛选状态下继续禁用拖拽手柄，保持父子 Todo 的同父级排序契约。

> **v4.1.3 Quick Pocket 已验收（2026-07-21）**：多 Pocket 已并入主线。默认 `inbox/Quick Pocket.md` 保持不变；Pocket 在项目设置中创建、重命名和删除，名称最多 6 个字符；左下角选择器仅负责打开 Pocket、宽度 130px、失焦自动关闭；独立窗口标题显示 Pocket 名称。绿色包使用 `npm.cmd run build:green` 生成，禁止在用户验收前打包。

> **最新验收（2026-07-12）**：Quick Todo Stage C 已验收，当前权威交接见 [HANDOVER-2026-07-12-quick-todo-stage-c验收.md](HANDOVER-2026-07-12-quick-todo-stage-c验收.md)。不进入 Stage D：YASB 通过 `--toggle-quick-todo` 已满足直接唤起与切换窗口的设计目标，禁止实施停靠、悬停、点击穿透、YASB 避让或 Capsule/Popout 接入；未来新增需求须另行立项。

> **v4.1.0（2026-07-13）**：Quick Todo 支持双击编辑内容和两层父子项目；子 Todo 使用缩进、灰色文本与更紧凑行高区分父级，只允许在同父级子项内拖拽。拖拽结束后的显示恢复必须使用全量列表，不能用当前子项切片；右上角关闭按钮必须带 `data-no-drag`，避免被原生窗口拖动吃掉点击事件。Quick Pocket 空标题且空内文不保存。窗口生命周期与拖动 capability 的复杂根因与修复约束见 [2026-07-12-Quick窗口生命周期问题复盘.md](2026-07-12-Quick窗口生命周期问题复盘.md)。

## 1. 项目是什么

Windows 桌面 **Markdown 便签**：每条便签一个 `.md` 文件，本地目录存储；无边框窗口、托盘、全局热键、默认编辑界面 + 可展开资料库。

- **用户场景**：快速记笔记、轻量预览/可视化编辑，非 Obsidian 替代品。
- **平台**：以 **Windows** 为主（`open_folder`、自启、热键等均按 Windows 实现）。
- **思源上传**：底部状态栏「同步」上传当前便签到思源（见 [SIYUAN-INTEGRATION.md](SIYUAN-INTEGRATION.md)）。双向云同步未实现。

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite 5 |
| 样式 | 原生 CSS + `src/styles/tokens.css`（设计 token） |
| 后端 | Rust（`src-tauri/src/`） |
| 预览 | `marked` + `contentEditable` + `turndown`（`EditablePreviewEditor`） |
| Markdown 渲染核心 | `src/utils/markdownRenderCore.ts` 统一处理 GFM、链接安全、图片属性和高亮 |

## 3. 本地开发

```bash
npm install
npm run tauri dev
```

- Node **18.14+** 或 **20 LTS**；需 **Rust**、**VS C++ 桌面开发**、**WebView2**。
- 首次 `tauri dev` 编译 Rust 可能 **5～15 分钟**。
- **dev 时便签目录**：多在 `src-tauri/target/debug/inbox` 与 `.../default`（与 debug exe 同级），**不是**源码根目录。
- 打开发迁移包：`npm run pack:dev` → `MKnote-dev.zip`。
- 打绿色运行版（非开发）：`npm run build:green` → `portable/`。

配置与窗口状态：优先 **exe 同级** `config.json`（绿色便携）；旧 `%AppData%\md-sticky-note\config.json` 可自动迁移。

当前组织系统元数据：

- 文件夹颜色遗留元数据：`File/.mknote-folders.json`（UI 已不再提供文件夹颜色设置）。
- 笔记颜色标签：`File/.mknote-note-colors.json`。
- 旧 `File/default/待办事项.md` 若存在，按普通 Markdown 便签处理；应用不再自动创建专用待办模板。

## 4. 目录地图（改哪里）

```
MKnote/
├── docs/
│   ├── AGENT-HANDOVER.md    ← 本文
│   ├── MKnote-UI-v2.md      ← UI 线框与行为规格（改 UI 必读）
│   ├── ICON-GUIDE.md        ← 图标规范与存放位置
│   └── samples/             ← 预览测试用 .md
├── src/
│   ├── App.tsx              ← 全局状态、invoke、资料库展开、主题、颜色标签
│   ├── App.css              ← 布局与组件样式（体量大，改 UI 常改这里）
│   ├── types.ts             ← AppConfig / NoteSummary / NoteZone
│   ├── components/
│   │   ├── CompactView.tsx      默认编辑界面（编辑/预览、工具栏、资料库、颜色标签）
│   │   ├── EditablePreviewEditor.tsx  可视化预览编辑
│   │   ├── HotkeyPanel.tsx / ErrorBanner.tsx
│   │   └── CompactIcons.tsx
│   ├── hooks/               useDebouncedCallback, useEditorHistory
│   ├── utils/               editorFormat, windowLayout, formatError, previewDom, markdownRenderCore
│   └── styles/tokens.css    ← 颜色/圆角/字体 token（改主题优先改这里）
├── src-tauri/
│   ├── src/lib.rs           ← Tauri command 注册与 AppConfig
│   ├── src/notes.rs         ← .md CRUD、重命名、移动、文件名规则
│   ├── src/paths.rs         ← inbox/default 路径解析、zone
│   ├── src/system.rs        ← 托盘、热键、窗口几何、展开/收起布局
│   └── tauri.conf.json      ← 窗口默认 760×640、无边框、identifier
└── scripts/pack-dev.ps1 / pack-green.ps1
```

## 5. 架构要点

### 5.0 图片上传与图床相册

- 兰空图床实现位于 `src-tauri/src/lsky.rs`，前端通过 `assetService.uploadToLsky` 调用。
- 上传使用已验收的 MDnote 专属存储策略 ID `4`，不得复用思源策略 ID `3`；同一登录令牌再精确查找名为 `MDnote` 的相册，并将 `strategy_id` 与 `album_id` 一起加入上传表单。
- 若相册不存在或名称大小写不匹配，本次图床上传失败并保留本地图片，不得回退到默认相册。
- 兰空后台已创建并授权专属策略 ID `4`。上传账号 `user_id=2` 仍按自身可见相册提交 `album_id=6`，兰空容器的 `ImageService.php` 会在保存时把“账号 2 + 策略 4”改归超级管理员 `user_id=1` 的 `MDnote` 相册 `album_id=5`。
- 2026-08-06 已用真实上传验证最终记录为 `user_id=1`、`album_id=5`、`strategy_id=4`；验证图片随后通过管理员身份精确删除。容器内备份为 `ImageService.php.codex-backup-20260806-admin-album`，容器重建或升级后必须复核这条服务器映射。
- 后续“扫描笔记并清理孤立图片”必须走服务器管理员权限路径；上传账号无权删除已经改归超级管理员的图片，不能复用普通上传账号的删除接口。

- 云图实现位于 `src-tauri/src/cloudimgs.rs`，通过统一的 `upload_image` 命令按提供商分发；地址固定要求 HTTPS，访问密码沿用 Windows DPAPI 保护。
- 当前云图反代根地址为 `https://cloudimgs.example.com`，上传调用 `POST /api/upload?dir=MDnote`，鉴权头为 `X-Access-Password`，multipart 字段为 `image`；连接测试只读取目录列表并确认 `MDnote` 存在。
- 云图不复用兰空专属清理接口，也不自动迁移或重传已有兰空图片；本地图片优先保存和 `mk-hosted|本地路径` 标记保持不变。
- 云图孤儿图片清理位于 `src-tauri/src/cloudimgs_cleanup.rs`：扫描当前本地 Markdown 引用与 `MDnote` 目录图片，最近 30 分钟上传及创建时间未知的图片受保护；删除前重新读取远端列表复核，单批最多 500 张。

### 5.1 前端状态（`App.tsx`）

- **单一数据源**：`config`（来自 `get_app_state`）、`content` + `dirty`、当前 `activeNote` + `activeZone`（`inbox` | `default` | `folder:<id>`）。
- **保存**：输入防抖 **600ms**（`SAVE_DEBOUNCE_MS`）；`flushSave` → `write_note`；切换便签/进预览/展开前先保存。
- **资料库**：`libraryOpen` 为本地 UI 态；从隐藏/托盘/快捷键再次显示窗口时会收起资料库。若隐藏前是待办事项，恢复待办事项界面；否则恢复普通 Markdown 编辑界面。
- **布局** `config.layout_mode`：历史字段仍存在；当前主流程以默认编辑界面为主，独立便签窗口与胶囊窗口分别由 `PopoutView` / `CapsuleView` 承担。
- **视图** `viewMode`：`edit` | `preview`（紧凑模式顶栏「眼」切换）。

### 5.2 便签与分区

- zone：**inbox**、**default**、**folder:<id>**。
- `Inbox` 对应 `{base}/inbox`。
- `Default` 对应 `{base}/File/default`。
- 新建文件夹对应 `{base}/File/<folder-name>`。
- 新建文件名：`YYYYMMDDHHmmssSSS.md`（`notes.rs` → `timestamp_filename`）。
- 列表展示标题 = **文件名去 `.md`**（不是解析 Markdown 一级标题）。
- 重命名 = 改 `.md` 文件名；非法字符过滤；冲突加随机后缀（见 `notes.rs`）。

### 5.3 Rust 命令（前端 `invoke` 名称）

| Command | 用途 |
|---------|------|
| `get_app_state` | 启动：配置 + exe_base |
| `get_config` | 读配置 |
| `list_notes` | `{ zone }` → `NoteSummary[]`，包含 `color` |
| `read_note` / `write_note` | 读写内容 |
| `create_note` / `rename_note` / `delete_note` / `move_note` | CRUD；move 参数 `fromZone`, `toZone`, `name` |
| `list_folders` / `create_folder` / `rename_folder` | 文件夹列表、新建、重命名 |
| `list_note_colors` / `list_notes_by_color` / `set_note_color` | 全库颜色统计、按色筛选笔记、设置/清除笔记颜色标签 |
| `set_last_note_file` | 记住上次打开 |
| `set_editor_font_size` | 12–24 |
| `set_always_on_top` / `set_autostart` | 系统集成 |
| `enter_expanded_layout` / `leave_expanded_layout` | 历史布局命令，当前主流程较少使用 |
| `hide_window` / `toggle_window` | 托盘隐藏；热键切换 |
| `open_folder` | 资源管理器打开路径 |

新增能力时：**Rust 加 command 并在 `generate_handler!` 注册** → 前端 `invoke` → 必要时同步 `types.ts` 与 `AppConfig`。

## 6. 改 UI 的操作指南

### 6.1 必读文档

- **`docs/MKnote-UI-v2.md`**：紧凑/展开线框、按钮含义、`config.json` 字段、目录规则、M5 占位说明。
- **`src/styles/tokens.css`**：`--mk-*` 变量；主题通过 `document.documentElement.setAttribute("data-theme", …)`。

### 6.2 三种界面形态

| 形态 | 组件 | 何时显示 |
|------|------|----------|
| 默认编辑界面 | `CompactView` | 已选便签时显示 |
| 内嵌资料库 | `LibraryPanel`（在 `CompactView.tsx` 内） | `libraryOpen === true` |
| 胶囊 / Popout | `CapsuleView` / `PopoutView` | 独立便签窗口与胶囊形态 |

从隐藏状态再次显示窗口时：资料库收起、清除颜色筛选，并恢复相应的编辑界面。旧待办文件不再有专用界面。

### 6.3 改 UI 时的约定

1. **优先用 CSS 变量**，避免硬编码色值；新组件沿用 `--mk-radius-sm` / `--mk-primary` 等。
2. **交互反馈**：按钮按下 `transform: scale(0.95)`（见 UI v2）。
3. **默认顶栏**：logo、笔记颜色标签、标题可编辑（提交 → `rename_note`）、搜索、字号、预览、置顶、主题、外观、关闭（隐藏到托盘）。
4. **底部状态栏**：资料库、同步占位、自启、快捷键、本地状态、字数、行数。
5. 改布局时同时检查 **`App.css`** 与对应 `*.tsx`；预览相关见 `EditablePreviewEditor.css`。
6. 中文错误文案：`formatError.ts` + `ErrorBanner`；Rust 返回 `Err("…".into())` 尽量中文。

### 6.4 预览/编辑

- **编辑**：`textarea` 源码。
- **预览**：`EditablePreviewEditor`（WYSIWYG 回写 Markdown）；工具栏在预览下用 `document.execCommand`（`editorFormat.ts`）。
- 样例：`docs/samples/preview-demo.md`、`markdown-full-test.md`。

## 7. 配置字段速查（`AppConfig`）

与 `src/types.ts`、`src-tauri/src/lib.rs` 保持一致：

- `last_note`, `last_note_zone`
- `window`, `compact_geometry`, `layout_mode`
- `editor_font_size`, `theme_mode`, `light_theme`, `dark_theme`, `accent_skin`, `always_on_top`, `autostart`

## 8. 常见任务怎么做

| 任务 | 建议入口 |
|------|----------|
| 新便签操作/批量导入 | `notes.rs` + `App.tsx` invoke |
| 新设置项 | `AppConfig` + `load_config`/`save_config` + 当前设置入口 + `invoke` |
| 紧凑工具栏加按钮 | `CompactView.tsx` + `editorFormat.ts` |
| 资料库列表/拖拽/颜色标签 | `CompactView.tsx` 内 `LibraryPanel` + `notes.rs` |
| 窗口大小/行为 | `tauri.conf.json` + `system.rs` + `utils/windowLayout.ts` |
| 全局热键 | `system.rs` + `HotkeyPanel.tsx` |
| 主题/深色模式 | `tokens.css` + `set_theme_mode` + `applyTheme` in `App.tsx` |

## 9. 代码风格与约束

- **最小改动**：只动与需求相关的文件；不要顺手大重构。
- **不复刻 Obsidian**：GFM 子集即可；复杂 HTML 不支持。
- **Windows 路径**：Rust 侧用 `PathBuf`；注意 `dev` 与 `release` exe 目录不同。
- **单实例**：`tauri-plugin-single-instance`；二次启动会唤起窗口。
- 根目录若有个别 `202605*.md` 等为误放便签，**不要当初始化文档依赖**。

## 10. 里程碑与后续

- UI v2 后续调整已完成：内嵌资料库、文件夹管理、笔记颜色标签、主题样式、搜索、状态栏。
- 旧待办事项模板已移除：`待办事项.md` 不再自动创建、不再走专用 UI；胶囊提供“完成并归档”按钮，完成后进入现有 archive 归档体系。
- 云同步仍为占位，实现前需产品确认协议与目录冲突策略。
- Agent 索引：数据根目录的 `llms.txt`、`mknote-manifest.json`（`refresh_agent_index` / 启动时刷新）。外部 Agent 操作说明见 [AGENT-INTEGRATION.md](AGENT-INTEGRATION.md)。

## 11. 相关文件索引

| 文件 | 内容 |
|------|------|
| `README.md` | 用户向说明、环境、打包 |
| `docs/MKnote-UI-v2.md` | UI 规格 |
| `docs/AGENT-HANDOVER.md` | 本文（Agent 交接） |
| `docs/AGENT-INTEGRATION.md` | 外部 AI Agent 便签接入指南 |
| `package.json` | `tauri dev` / `pack:dev` / `build:green` |

---

## 2026-07-08 MKnote v3.2 胶囊 / Popout 窗口交接补充

胶囊模式本轮已通过用户验收，本版本定义为 **v3.2.0**，阶段总结见 [HANDOVER-2026-07-08-capsule-mode验收总结.md](HANDOVER-2026-07-08-capsule-mode验收总结.md)。

关键结论：

- 胶囊、Popout、主窗口 Tab 是同一个窗口形态状态机，不要把“用户关闭”和“形态转换销毁源窗口”混用。
- Popout / Capsule 互转走 `restore_popout_to_capsule`、`restore_capsule_to_popout`，Rust 侧会抑制源窗口 Destroyed 事件，避免误触发 Tab 归还。
- Popout / Capsule 外置会话分别持久化在 `popout_sessions` / `capsule_sessions`；未置顶窗口也必须恢复，主窗口 Tab 隐藏状态要同时参考两者。
- Popout / Capsule 内重命名后必须通过 `mknote:popped-out-renamed` 同步主窗口的 popped-out key、Tab、置顶和访问顺序。
- Popout 标题显示态可拖拽窗口，双击才进入编辑态；标题色使用主题高亮色。
- 主窗口切换主题后通过 `mknote:theme-changed` 广播，Popout / Capsule 监听后重新执行 `applyTheme`。
- 胶囊拖拽使用原生 pointer 事件和位移阈值；按钮、输入框、`[data-no-drag]` 区域不能参与拖拽。
- 透明胶囊窗口四角透明依赖根层透明，背景只放在 `.capsule-bar`。
- Tab 拖出 Popout 的判断应覆盖窗口四边，不只检测上边界。
- 主窗口 `Focused(true)` 事件不要无条件 `set_focus()`，否则截图工具结束后可能偶发把应用拉到前台。

涉及文件：

- `src/components/CapsuleView.tsx`
- `src/components/PopoutView.tsx`
- `src/components/NoteTabsBar.tsx`
- `src/App.tsx`
- `src/services/windowService.ts`
- `src/services/appBridge.ts`
- `src/hooks/usePoppedOutNotes.ts`
- `src-tauri/src/detach.rs`
- `src-tauri/src/system.rs`

验证建议：

```powershell
npm.cmd run build
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'mknote-codex-cargo-target'
cargo check --manifest-path src-tauri\Cargo.toml
```

---

**新 Agent 上手顺序**：本文 → `docs/MKnote-UI-v2.md` → 打开 `App.tsx` 与 `CompactView` → 需要后端时读 `notes.rs`、`system.rs`。

## 2026-07-14 Quick Todo 定时提醒与笔记链接交接

## 2026-07-28 Quick Todo / Quick Pocket 并发修复与绿色打包 Skill

本轮已通过用户验收，详细记录见 [HANDOVER-2026-07-28-quick-race-and-green-skill.md](HANDOVER-2026-07-28-quick-race-and-green-skill.md)。

关键约束：

- Quick Todo 写操作必须经过 `createQuickTodoMutationQueue()` 串行化；列表异步结果必须通过 `isLatestQuickTodoRequest()` 校验后才能更新界面。
- Quick Pocket 列表和管理操作必须通过请求序号保护；删除非默认 Pocket 使用文件暂存、配置保存、文件删除的回滚流程。
- Quick Todo/Pocket 的同步冲突不能用旧远端基线立即覆盖本地 CRUD；应保留冲突副本并等待下一轮同步处理。
- 绿色版打包统一使用 `npm.cmd run build:green`。可复用流程见 `.agents/skills/mknote-green-package/SKILL.md`；ZIP 必须只含 `MarkdownStickyNote.exe` 和 `README.txt`。

验证边界：`test:quick-pocket` 28/28 通过；前端构建通过；`test:quick-todo` 为 57 通过、6 个历史 UI 静态断言失败，详见交接文档。

---

## 2026-07-14 Quick Todo 定时提醒与笔记链接交接

Quick Todo 版本更新至 **v4.1.1**，本轮功能已完成验收并提交：

- Todo 支持一次性定时提醒；应用常驻托盘时由 Windows Toast 通知提醒。
- 倒计时按约定显示：小于 24 小时显示 `XX:XX`，超过 24 小时显示天，超过 31 天显示月，超过 12 个月显示年并使用 `1个月+` 等形式。
- 未设置提醒时显示闹钟按钮；已设置提醒时显示倒计时，到期后清除倒计时并恢复闹钟按钮。
- Todo 工具栏顺序固定为：拖动、完成、内容、闹钟/倒计时、创建子 Todo、链接、标签、删除。
- 链接通过笔记标题搜索，保存时持久化 `zone + name`，因此同名标题可以跨区域共存并能准确回到对应文件。
- 点击已保存链接调用 `open_note_popout` 打开真正的便签窗口；不要调用 `open_capsule`，后者会进入胶囊模式。
- 笔记目标列表覆盖默认、收件箱、私密、存档及资料库文件夹，并在打开选择器时刷新。

相关实现与测试：

- `src/components/QuickTodoPanel.tsx`
- `src/hooks/useQuickTodoNoteTargets.ts`
- `src/hooks/useQuickTodoReminderScheduler.ts`
- `src/utils/quickTodoModel.ts`
- `src/utils/quickTodoNoteLink.ts`
- `src-tauri/src/quick_todo.rs`
- `tests/quickTodo.test.ts`

验证命令：

```powershell
npm.cmd run test:quick-todo
npm.cmd run build
git diff --check
```

---

## 2026-07-09 统一笔记窗口模式验收补充

统一笔记窗口路径已通过用户验收，阶段总结见 [HANDOVER-2026-07-09-unified-note-window.md](HANDOVER-2026-07-09-unified-note-window.md)。

关键结论：

- 同一条笔记的便签态与胶囊态现在默认走同一个原生窗口的 profile 切换，不再用“销毁 Popout、创建 Capsule”的接力路径作为默认行为。
- Rust 侧持有统一窗口状态机与几何真相源：`Expanded`、`TransitioningToCapsule`、`Capsule`、`TransitioningToExpanded`。
- 进入胶囊前冻结 expanded 几何；非 expanded 状态下阻止延迟 settle 回写便签几何，修复首次来回切换位移。
- Popout 创建时静态 `shadow(false)`，配合透明根层，修复 Windows DWM 阴影露出的倒角矩形。
- 切换过程不再 `hide/show`，避免用户看到“消失再出现”；状态切换通过前端 ready ack 收口。
- 左侧吸附镜像由 Rust 返回的 `snapEdge` 驱动，事件只做补充。
- 胶囊模式默认置顶；主窗口进入胶囊、便签进入胶囊均默认置顶。
- 旧独立 Capsule 路径暂时保留为 fallback，不在本轮删除。

涉及文件：

- `src-tauri/src/detach.rs`
- `src-tauri/src/lib.rs`
- `src/components/PopoutView.tsx`
- `src/services/windowService.ts`
- `src/App.tsx`
- `src/App.css`

---

## 2026-08-06 兰空图床图片清理

设置页提供统一的“图床设置”，上半部分可编辑、测试和保存兰空地址、上传账号、密码、策略 ID 与启用状态，下半部分允许用户手动扫描、预览候选并二次确认永久删除；不做启动时或定时自动清理。

安全边界：

- 本地扫描 `default-note.md`、`inbox/**/*.md`、`File/**/*.md`，但排除 `.mknote-history`、`.mknote-templates` 和 `templates`；因此当前私密笔记、归档和 `.mknote-trash` 中仍可恢复的笔记都计入有效引用，历史快照和模板不计入。
- 扫描前保存当前普通笔记和私密笔记；任一保存、本地文件读取或远端列表失败都会终止，不进入删除。
- 最近 30 分钟上传或创建时间未知的图片受保护；删除前重新扫描，单批最多 500 张。
- 只比较和删除兰空中的 `user_id=1 + album_id=5 + strategy_id=4`；客户端继续使用上传账号 `user_id=2`，不保存超级管理员密码。
- 兰空容器新增鉴权接口：`GET /api/v1/mdnote/cleanup-images` 与 `DELETE /api/v1/mdnote/cleanup-images/{key}`。只有账号 2 可调用，删除时还会再次精确校验所有者、相册和策略。

兰空容器修改位于挂载目录 `/var/www/html`：

- `app/Http/Controllers/Api/V1/ImageController.php`
- `routes/api.php`
- 部署前备份后缀：`.codex-backup-20260806-cleanup-api`

注意：容器镜像升级或重新部署可能覆盖上述专用接口；升级兰空后必须复核两个路由、PHP 语法和权限边界，再允许 MDnote 使用清理功能。

## 2026-08-28 云图孤儿图片清理

设置 → 图床设置 → 云图中提供手动扫描和清理入口。扫描不会自动删除；界面列出目录图片、有效引用、保护期内图片和待清理数量，用户二次确认后调用云图 `DELETE /api/images/{relPath}`，由云图服务端移入 `.trash`，约 30 天后自动清理。

安全边界：

- 本地扫描沿用 Markdown 引用规则，包含可恢复的回收站笔记，不扫描历史快照和模板。
- 当前笔记或隐私笔记保存失败、远端列表失败、目录外或重复图片标识，均终止清理。
- 删除前重新扫描并只接受当前扫描产生的候选 key，防止界面陈旧或客户端伪造 key 造成误删。
- 云图新上传图片在 30 分钟保护期内不会出现在待清理列表；创建时间未知的图片同样不会清理。

验证：云图清理合同测试 4/4、Rust 云图集成测试通过、`npm.cmd run build` 通过；真实测试实例扫描得到 16 篇笔记、4 张目录图片、3 张有效引用，既有候选保持未处理，唯一新建测试图正确进入保护期；“移入云图回收站”二次确认框可打开并取消。用户验收通过。

绿色包验收（2026-08-28）：`MKnote-portable-v5.0.0-20260828-181043.zip` 已由 `npm.cmd run build:green` 生成并复核。ZIP 仅包含 `MarkdownStickyNote.exe` 与 `README.txt`，SHA-256 为 `969545DD1100173D1D0CFFE13C2012803BDF607F066DFF483489FAE0FE308D1A`；未包含 `config.json`、便签目录、`node_modules`、`dist` 或 Rust target。

本轮验证：Rust 全量测试 157/157、新增清理集成测试 4/4、前端清理测试 2/2、生产构建通过。远端真实创建并删除一张专用测试图后，图片记录归零、管理员相册计数恢复、临时 Token 清零，图片 URL 返回 404。
