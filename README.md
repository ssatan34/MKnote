<p align="center">
  <img src="src/assets/brand/logo-transparent.png" width="88" alt="MKnote Logo">
</p>

# MKnote

**把随手记下的内容，留在自己的 Markdown 文件里。**

Windows 桌面 Markdown 便签，集成快速记录、独立待办、多标签笔记和可选的笔记工具接入。每条便签对应本地一个 `.md` 文件，基本编辑不需要云端账号。

**Windows 10/11 x64 · 版本 5.2.4 · 本地优先 · 绿色便携**

[功能概览](#功能概览) · [获取与使用](#获取与使用) · [开发](#开发) · [数据与配置](#数据与配置) · [许可证](#许可证)

> [下载最新 Windows x64 绿色便携版](https://github.com/ssatan34/MKnote/releases/latest) · 无需安装 Node.js 或 Rust · 主项目采用 MIT 许可证。

- **随手记**：用热键唤起便签，支持 Markdown 源码与可视化编辑，关闭窗口后留在托盘。
- **桌面待办**：Quick Todo 处理任务与提醒，Quick Pocket 暂存文本、命令和路径。
- **连接已有工具**：按需配置 Obsidian、思源笔记、S3/MinIO、图床或 AI 服务。

## 24 秒认识 MKnote

随手记录、直接编辑 Markdown，再把独立便签收成胶囊。

https://github.com/user-attachments/assets/463de8d9-8b38-4ea5-adb6-7bb333cd90ac

演示使用虚构笔记；配乐由 [YuE2](https://github.com/multimodal-art-projection/YuE) 生成。

## 功能概览

| 类别 | 能力 |
|------|------|
| 编辑 | Markdown 源码 / 可视化编辑、格式工具栏、选中多行转待办、撤销重做、字号与主题调整 |
| 资料库 | Inbox / Default / 自定义文件夹 / 归档区；新建、重命名、删除、拖拽移动、颜色标签与筛选 |
| 标签页 | 多标签同时打开、跨重启恢复、置顶标签（默认 2 个，可设置 1–10 个）、拖拽排序、右键复制笔记完整路径 |
| Quick Todo | 独立待办窗口、父子任务、标签筛选、拖拽排序、一次性提醒、便签关联与外部数据刷新 |
| Quick Pocket | 独立 Quick Pocket 窗口、YASB `--toggle-quick-pocket` 入口、四类标签筛选、标题/内文保存、隐私摘要、复制、拖拽排序、单层分组与整组拖拽；空标题且空内文不保存 |
| 模板 | 8 个内置便签模板（会议、购物、旅行等），支持变量替换 |
| 回收站 | 软删除、恢复、永久删除、清空 |
| 扩展 | 全文搜索、最近访问、收藏、双链、分离窗口、图片资源、AI 划词助手、浏览器剪藏 |
| 笔记接入 | 当前便签单向上传至思源，或复制到 Obsidian 的笔记与附件目录 |
| 同步 | 默认笔记、Quick Todo 与 Quick Pocket 的可选 S3/MinIO 同步；支持冲突副本 |
| Agent | 自动生成 `llms.txt`、`mknote-manifest.json`，供 Cursor 等外部 AI 读写便签 |
| 分发 | 支持从源码构建绿色便携版与 NSIS/MSI 安装包 |

更完整的产品说明见 [docs/功能概要.md](docs/功能概要.md)。

---

## 获取与使用

前往 [GitHub Releases](https://github.com/ssatan34/MKnote/releases/latest)，在 **Assets** 中下载 `MKnote-portable-v5.2.4-windows-x64.zip`。GitHub 自动生成的 `Source code` 是源码，不能直接运行。

使用绿色便携包时：

1. 完整解压到有写入权限的文件夹，运行 `MarkdownStickyNote.exe`，不要直接在压缩包内启动，也不要放在 `Program Files` 等受保护目录。
2. 首次运行会在程序同级目录创建配置和数据，点击「新建便签」开始记录。
3. 关闭主窗口会隐藏到系统托盘；退出程序请使用托盘菜单。
4. 按需在设置中配置快捷键、Quick Todo / Quick Pocket，以及外部服务。

运行环境为 **Windows 10/11 x64** 与 **Microsoft Edge WebView2 Runtime**，本次不提供 ARM64 原生包。若无法启动且提示缺少 WebView2，请从 [微软官网](https://developer.microsoft.com/microsoft-edge/webview2/) 安装 Evergreen Runtime 后重试。

**升级**：先从托盘退出旧版，备份整个程序目录及自行设置的 Quick Todo / Quick Pocket 数据目录。将新包解压到单独文件夹检查，再更新旧目录中的 EXE、说明和许可证文件，保留 `config.json`、`File/`、`inbox/` 及自定义数据目录。不要用空目录覆盖现有笔记。WebView2 缓存和部分系统集成可能写入当前 Windows 用户目录，便携包不代表所有系统痕迹均保存在 EXE 旁。

**下载校验**：同一 Release 提供 `SHA256SUMS.txt`，可在 PowerShell 中执行：

```powershell
Get-FileHash .\MKnote-portable-v5.2.4-windows-x64.zip -Algorithm SHA256
```

将结果与校验文件中的 ZIP 哈希比较。当前 EXE 未做代码签名；遇到 Windows 提示时，请先确认下载来自本仓库并核对哈希，再自行决定是否运行。问题反馈见 [Issues](https://github.com/ssatan34/MKnote/issues)，请使用示例笔记并隐藏配置中的凭据。

## 环境要求

以下是**从源码开发或构建**需要的环境：

| 依赖 | 说明 |
|------|------|
| Node.js | 推荐 **24 LTS**，通过 `node --version` 检查；版本支持状态见 [Node.js 官方列表](https://nodejs.org/en/about/previous-releases) |
| Rust | 当前 stable 工具链（MSVC），通过 `rustc --version` 检查；依赖以 `Cargo.lock` 为准 |
| VS Build Tools | 安装「使用 C++ 的桌面开发」及 Windows SDK |
| WebView2 | Win10/11 通常已自带 Evergreen |

---

Windows 开发环境的完整说明见 [Tauri 官方环境要求](https://v2.tauri.app/start/prerequisites/)。

## 开发

```powershell
git clone https://github.com/ssatan34/MKnote.git
cd MKnote
npm ci
npm run tauri dev
```

首次启动会编译 Rust 依赖，耗时取决于网络和编译环境。

开发时便签数据多在 `src-tauri/target/debug/`（与 debug exe 同级），**不是**源码根目录。

### 给新 Agent / 接手开发

| 文档 | 用途 |
|------|------|
| [docs/项目总结.md](docs/项目总结.md) | 项目概况与文档索引 |
| [docs/功能概要.md](docs/功能概要.md) | 产品功能与使用场景 |
| [docs/PROJECT-SUMMARY.md](docs/PROJECT-SUMMARY.md) | 实施路径与迭代维护 |
| [docs/AGENT-HANDOVER.md](docs/AGENT-HANDOVER.md) | 日常开发交接（**改代码先读**） |
| [docs/AGENT-INTEGRATION.md](docs/AGENT-INTEGRATION.md) | 外部 AI 读写便签规则 |
| [docs/MKnote-UI-v2.md](docs/MKnote-UI-v2.md) | UI 行为规格 |
| [docs/ICON-GUIDE.md](docs/ICON-GUIDE.md) | 图标规范 |
| [AGENTS.md](AGENTS.md) | Agent 入口索引 |

---

## 常用命令

```powershell
npm run tauri dev          # 开发（热重载）
npm run build              # 前端构建
npm run tauri build        # 发行构建（含安装包）
npm run build:green        # 绿色便携版 + 时间戳 zip
npm run pack:dev           # 开发迁移 zip（不含 node_modules）
cargo check --manifest-path src-tauri\Cargo.toml
```

---

## 开发环境迁移包

拷到另一台电脑继续开发，不含 `node_modules`、`target`、`dist`、`portable`：

```powershell
npm run pack:dev
```

生成项目根目录的 `MKnote-dev-<时间戳>-<随机标识>.zip`，解压后安装依赖并执行 `npm run tauri dev`。包内见 `DEV-README.txt`。

---

## 绿色版

```powershell
npm run build:green
```

输出 `portable/`，并在项目根目录生成 `MKnote-portable-v<版本>-<时间戳>.zip`。分发 ZIP 包含 `MarkdownStickyNote.exe`、`README.txt`、`LICENSE`、`THIRD_PARTY_NOTICES.md` 和 `LICENSES/`（第三方完整声明及 MPL 依赖源码归档），不含真实笔记和配置。首次运行后数据写入 EXE 同级目录。构建绿色版使用 `--no-bundle`，不会额外生成安装包。

首次打包或依赖变动后，先按 [许可证生成说明](scripts/licenses/README.md) 更新分发声明；缺少必要声明时打包会停止。

安装包在：

- `src-tauri\target\release\bundle\nsis\`
- `src-tauri\target\release\bundle\msi\`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2 |
| 前端 | React 19、TypeScript、Vite 5 |
| UI | Tailwind CSS 4、Radix UI / shadcn 基础组件、项目 SVG 图标 |
| 样式 | `tokens.css` 设计令牌 + 组件 CSS |
| 后端 | Rust（`src-tauri/src/`） |
| 预览编辑 | Milkdown / ProseMirror；Lute 用于 Markdown 转换 |
| 系统集成 | 托盘、全局热键、自启、单实例 |

---

## 数据与配置

### 目录结构（绿色版 `{base}` 一般为 exe 同级）

```
{base}/
├── config.json                    # 应用配置
├── inbox/                         # 收件箱
├── File/
│   ├── default/                   # 默认笔记区
│   ├── archive/                   # 归档区
│   ├── <folder-name>/             # 用户文件夹
│   ├── templates/                 # 内置模板副本（首次启动释放）
│   ├── .mknote-note-colors.json   # 笔记颜色标签
│   ├── .mknote-custom-tags.json   # 自定义颜色标签
│   ├── .mknote-folders.json       # 文件夹遗留元数据
│   ├── .mknote-siyuan-map.json    # 思源上传映射
│   ├── .mknote-trash/             # 回收站
│   └── .mknote-templates/         # 用户自定义模板
├── llms.txt                       # Agent 说明（自动生成）
└── mknote-manifest.json           # 便签索引（自动生成）
```

### 规则摘要

- **新建文件名**：`YYYYMMDDHHmmssSSS.md`
- **列表标题**：文件名去掉 `.md`（不是 Markdown 一级标题）
- **重命名标题** = 重命名对应 `.md` 文件
- **配置位置**：绿色版为 exe 同级 `config.json`；旧版可能在 `%AppData%\md-sticky-note\`（首次启动会迁移）
- **Quick 数据**：Quick Todo 与 Quick Pocket 可单独选择数据目录，备份时也应包含这些目录。

`{base}` 解析与迁移说明见 [docs/AGENT-HANDOVER.md](docs/AGENT-HANDOVER.md)。

### 本地数据与外部服务

- 日常便签保存在本地；启用 AI、图床、思源上传或 S3 同步后，相应内容会发送到你配置的服务。Obsidian 接入是本地文件复制。
- 图床地址、账号和服务凭据由使用者自行填写，不提供内置公共图床账号。
- 隐私遮罩用于减少屏幕展示中的信息暴露，本地 Private 区用于区分笔记；它们不等同于对 Markdown 文件加密。
- 备份时应保留整个便携目录及自定义 Quick 数据目录。Windows 保护的服务凭据跨电脑迁移后可能需要重新填写。
- 反馈问题或分享分发包时，不附带真实 `config.json`、便签、密钥或本机 MCP 配置。

---

## 当前能力

<details>
<summary>展开查看各模块的功能细节</summary>

### 编辑与显示

- Markdown 源码编辑与可视化预览编辑（顶栏一键切换）
- 左侧格式工具栏：加粗、标题、列表、链接、图片、表格等
- 字号调整、明暗主题（浅色 / 深色 / 跟随系统）、多套 accent 皮肤
- 顶栏标题重命名、搜索、置顶、隐私遮罩（遮罩疑似 API Key 行，不改磁盘）
- 底部状态栏：资料库、同步、自启、快捷键、本地状态、字数、光标行数

### 内嵌资料库

- 文件夹栏 + 笔记列表两列布局
- 文件夹新建、双击重命名；笔记新建（空白或从模板）、打开、重命名、拖拽移动
- 删除进入回收站（可恢复或永久删除）
- 笔记颜色标签：内置色 + 自定义标签；按文件夹筛选
- 归档：移至 `File/archive/` 并标记「存档」
- 打开所在文件夹、全文搜索、最近访问、收藏、双链反向引用

### 多标签页

- 顶栏标签栏，跨重启恢复打开列表
- 中键关闭、关闭其他、拖拽排序
- 置顶标签（默认 2 个，可设置 1–10 个），关闭置顶标签需二次确认
- Quick Todo / Quick Pocket 不进主窗口标签栏，走独立 Quick 窗口与 YASB 入口

### Quick Todo / Quick Pocket

- Quick Todo 支持外部共享文件刷新：窗口可见且无本地写操作排队时，每 2 秒读取一次；内容相同时不重绘。Allnote 的工作汇总单向进入 Work：按项目折叠分组，真实父子任务多层缩进，日期独立显示，可打开来源笔记和项目主页。自动条目在界面和后端只读；手工任务放独立区域，保留编辑、完成与排序。默认个人 Quick Todo 保持原行为，无反向回写。

- Quick Todo 使用独立窗口，支持 `--quick-todo` / `--toggle-quick-todo`；Enter 创建、标签、按重要/等待/下一步/想法/紧急/重要紧急六类标签筛选、完成/取消、删除、双击编辑、未完成/已完成视图和二次确认清空已完成。
- Quick Todo 支持两层父子项目；子项在视觉上缩进、灰色、小一号且行高更紧凑，只能在同一父项的子项内拖拽排序。
- Quick Todo 右上角关闭按钮退出原生拖动区域，点击可直接隐藏窗口；失焦后仍由原生前台监控保存并隐藏。
- Quick Pocket 使用独立窗口，支持 `--quick-pocket` / `--toggle-quick-pocket`；按文本/命令/路径/隐私筛选，标题/内文保存、双击编辑、失焦保存、隐私摘要、内文复制、单层分组、组内新增和整组拖拽排序。标签筛选时忽略分组并以扁平列表显示。
- Quick Pocket 空标题且空内文不保存，只有标题或只有内文时允许保存。

### 便签模板

- 8 个内置模板：会议记录、今日工作、沟通记录、购物清单、旅行准备、阅读摘录、资料暂存、概念卡片
- 支持 `{{date}}`、`{{time}}`、`{{datetime}}`、`{{title}}` 变量
- 用户可在 `File/.mknote-templates/` 添加自定义 `.md` 模板

### S3 多设备同步

- 默认笔记、Quick Todo、默认 Quick Pocket 和多个 Quick Pocket 自动同步
- 使用 **S3/MinIO** 后台轮询、焦点触发和本地变更触发，不依赖手动同步
- 按云端权威规则初始化与协调状态，冲突时保留本地副本
- 远端对象缺失时不反向补传；首次配置应确认云端数据和同步对象键
- 设置面板可配置 S3 endpoint、bucket、object key 与凭据并测试连接

### 窗口与系统

- 无边框窗口；关闭按钮隐藏到托盘（不退出进程）
- 全局热键：显示/隐藏、聚焦窗口、快速捕获、剪贴板入 Inbox、快速搜索（均可自定义）
- 开机自启、便签分离窗口
- 主窗口、独立便签与 Quick 窗口各自处理打开、隐藏与恢复

### 扩展能力

- **思源笔记**：当前便签单向上传至 `/MKnote/{标题}`（待办不上传）
- **Quick Capture**：快速捕获内容到 Inbox
- **AI 辅助**：可选的划词助手与 Jev 自动归类，需自行配置服务和凭据
- **浏览器剪藏**：本地 HTTP 服务接收剪藏内容
- **Agent 索引**：`llms.txt` + `mknote-manifest.json`，见 [docs/AGENT-INTEGRATION.md](docs/AGENT-INTEGRATION.md)
- **编辑器历史**：提供进程内 undo/redo；不再生成持久化历史快照

---

</details>

## 当前范围

- 当前开发与交付以 Windows 为主，未声明 macOS / Linux 的兼容性。
- 可视化编辑对无法安全处理的 Markdown 提供源码恢复入口，复杂文档应保留原文件备份。
- S3 同步覆盖指定笔记与 Quick 数据，不是整个资料库或任意目录的全量双向镜像。
- Allnote Work 的自动汇总任务为只读条目，手工任务与其分开处理，不反向修改来源汇总。

当前版本的详细功能与历史记录见 [功能概要](docs/功能概要.md) 和 [5.2.4 发布记录](docs/RELEASE-5.2.4.md)。

---

## 反馈与协作

可以通过 [Issues](https://github.com/ssatan34/MKnote/issues) 反馈问题或提出建议。请提供应用版本、Windows 版本、复现步骤和可公开的最小 Markdown 示例；截图请使用示例笔记。

涉及代码修改时，先阅读 [AGENTS.md](AGENTS.md) 和相关开发文档。提交修改时请保留第三方代码的来源与许可证声明，勿在示例、日志或截图中加入真实笔记及凭据。

## 许可证

MKnote 原创代码采用 [MIT License](LICENSE)，允许使用、修改和商业分发，分发时需保留版权与许可声明。

第三方代码、依赖与参考素材适用各自的许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。内置 Lute 自报版本为 1.7.6，采用木兰宽松许可证第 2 版；上游精确提交、换行差异与固定文件哈希见 [Lute 来源记录](src/vendor/README.md)。
