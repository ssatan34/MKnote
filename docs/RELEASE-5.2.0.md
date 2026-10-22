# MKnote 5.2.0 发布记录

日期：2026-10-02。本轮用户明确确认「本轮验收通过」，授权整理、打包与本地 Git 提交；不推送、不打标签、不对外发布。

## 版本与功能

新增独立的笔记自动归类能力，按功能版本从 5.1.0 递增至 **5.2.0**。统一 package.json、package-lock 顶层及根包、Tauri 配置、Cargo.toml、Cargo.lock 本项目版本与当前文档；保留历史发布记录和旧 ZIP。

- 设置 → AI 配置分为「AI 助手」和「Jev 自动归类」两个 Tab；切换保留未保存的表单。Jev 使用项目的主题色开关、输入控件、文件夹卡片及保存按钮。
- Jev 可选官方与 Command Code，两家分别保存 API Key 和模型；Windows 密钥沿用 DPAPI。官方默认 `jev-latest`，Command Code 默认 `typesafe/jev`。本地 Kev 本轮不实现。
- 候选文件夹只从已有自定义文件夹中勾选，可补充用途说明。状态栏手动按钮保存当前笔记后请求 Jev，验证返回选择并移动文件，同时迁移打开的 Tab。
- 关闭笔记 Tab（包括确认关闭置顶 Tab及关闭其他标签）：空白、空格或换行正文移入回收站，不调用 Jev；非空 Default 普通笔记保存、关闭后后台归类。其他文件夹、隐私和专用默认便签不参与自动归类；移回 Default 后可再次归类。
- 隐藏到托盘、Popout 或胶囊关闭不触发归类。最后一个 Tab 不允许关闭的现有规则保留。
- 模型错误或返回无效候选时不移动；目标不存在、候选设置已变化或正文版本变化时拒绝移动；后台响应返回时已重新打开的笔记跳过旧结果。

接口依据：[TypeSafe API](https://docs.typesafe.ai/api)、[Command Code Provider API](https://commandcode.ai/docs/provider)。两家使用 System One 的 `choice` 请求，返回值从 `answers.folder.choice` 读取并按本次候选校验；不走聊天接口。

## 空白笔记关闭修复

根因已由源码确认：中键在 `pointerdown` 和 `auxclick` 中各执行一次关闭。第一次将空白文件移入回收站，第二次找不到文件，返回未删除后误发起 Jev 归类。现仅在 `pointerdown` 关闭，`auxclick` 只阻止浏览器默认行为；主窗口同时拦截同一 Tab 正在进行或已完成的重复关闭请求。Default 中普通笔记纳入空白删除，专用根目录默认便签保留。

## 验收与构建

- 用户在隔离实例中完成本轮验收，并明确确认通过。实例使用独立 identifier / productName 和独立笔记、配置目录。
- 初次实现的针对性检查：前端规则测试 2/2、Rust 分类契约测试 3/3，通过；Rust 契约通过本地 HTTP 模拟验证两家模型与认证选择、响应候选和 HTTP 错误处理。用户后续要求由其执行具体测试，因此未追加全量回归。
- 本次收尾运行项目 `npm.cmd run build:green`，完成前端、正式 release 构建和绿色打包。验证版本字段、EXE 资源版本、构建时间、ZIP 精确条目及 SHA-256。
- 正式实例 `C:\MDnote\MarkdownStickyNote.exe` 保持运行。独立标识的同源码构建用于启动、版本与设置界面隔离核验；不以该结果冒充正式 ZIP 的独立启动验证。

## 包与隔离验证证据

- 绿色包：`MKnote-portable-v5.2.0-20261002-113315.zip`，13,181,346 字节。
- ZIP SHA-256：`C73C3CE23693511220DE7FED9107D7E707F52E08422CE7EF53038A01F21EC177`。
- ZIP 精确条目：`MarkdownStickyNote.exe`、`README.txt`；不含配置、便签、密钥或开发文件。
- EXE SHA-256：`90EC6E3D686B650580398ACDFCEBBA06F210DF16AAD7164931DF9F220D41A110`；release、portable、portable-release 和解压 EXE 一致，文件 ProductVersion / FileVersion 为 5.2.0，release EXE 时间晚于本次前端构建。
- 包内容、版本与哈希证据：`.codex-smoke/release-5.2.0/package-verification.json`、`version-verification.json`、`exe-version.json`。
- 构建完成，Vite 大块提示和既有 Rust dead-code 提示为 warning，未导致失败。
- 隔离启动通过：独立标识 `com.sin.mdnote-release520-smoke`，应用与运行时版本 5.2.0；「AI 助手」「Jev 自动归类」Tab 和候选文件夹可见，归类开关关闭，未调用模型。记录与截图为 `runtime-verification.json`、`runtime-settings.png`。核验后仅退出隔离实例；正式 PID 32852 仍运行，正式配置 SHA-256 与自启动项前后相同（`official-before.json` / `official-after.json`）。

## 清理与保留

本轮已结束的测试 EXE、启动日志和构建配置可回滚归档至 `.codex-smoke/release-5.2.0/archive/`；自动审批拒绝压缩后删除的命令（blocked by policy），改用移动归档完成整理。保留 `.codex-smoke/jev-manual-3a4710c2/` 下用户测试笔记、已填写配置、回收站、配置快照与说明，保留历史发布 ZIP 和原有验收资料。本次绿色打包同时生成的 MSI / NSIS 归档至同一 archive 目录，未对外交付。`dist` 与 Cargo target 为现有构建缓存，继续复用。原本未跟踪的 `src/assets/brand/logo-monochrome.svg` 不属于本轮，保留且不提交。

## 实际未验证项

- 官方 Jev 真实 API Key 调用未单独取得证据；已核对官方接口契约，本轮用户使用的隔离配置来源为 Command Code。
- 正式 ZIP 在本机单独启动尚未验证：其单实例标识与正在运行的正式应用相同，按用户要求保留正式实例。首次使用新包时请自行从托盘退出旧版，再启动新 EXE。

## 2026-10-08 任务栏图标修复与追加绿色包

用户确认「验收通过」，授权更新相关文档、清理本轮工作区产物、打包 ZIP 和本地 Git 提交。此修复继续使用 5.2.0；以上 2026-10-02 发布与验收记录保持为历史证据。

### 根因与实现

- 当前 Tauri codegen 在 Windows 上将 ICO 的第一帧解码为默认窗口图标；生成脚本的第一帧是 16px。现场核对时，EXE 已包含 16～256px 的 14 档资源，但主窗口和 Quick 窗口只有 16×16 小图标，未设置大图标；本机为 150% / 144 DPI。
- 新增 `src-tauri/src/window_icons.rs`，复用 Tauri 的窗口创建 hook、既有 EXE 图标资源与 Windows API，不引入新的图像库。窗口创建后按 DPI 系统度量加载大小图标，通过 `WM_SETICON` 设置；收到 `ScaleFactorChanged` 后替换自有图标，窗口销毁时释放句柄，不释放 Tao 持有的旧默认图标。
- 接入覆盖所有新建窗口；直接行为验证覆盖主窗口、Quick Todo 和 Quick Pocket。详细图标资源与回归入口见 [ICON-GUIDE.md](ICON-GUIDE.md)。

### 验证与用户验收

- Rust `cargo check --locked`、前端 `npm.cmd run build` 与正式 Release 构建通过。既有 Rust dead-code、Vite 大块提示为 warning，未导致失败。
- 同源码隔离 Release 使用独立 identifier `com.sin.md-sticky-note.icon-smoke`、ProductName `MDnote Icon Smoke`，独立配置与数据目录；正式配置 SHA-256 在隔离验证前后保持一致。
- 真实窗口图标：主窗口和 Quick 窗口在 144 DPI 下为小图标 24px / 大图标 48px。
- 模拟 `WM_DPICHANGED`：96 / 120 / 144 / 192 DPI 分别得到 16/32、20/40、24/48、32/64px。WebView2 预热后连续切换 40 次，USER 句柄保持 40 → 40。
- 旧正式实例通过 `--quit` 的保存/退出流程正常退出，未强制终止；已备份并替换 `C:\MDnote\MarkdownStickyNote.exe`。重启实例再次核对为 144 DPI、24/48px。已安装 EXE SHA-256 为 `6DE6994EE9286C00AEE378E935F35C1F12E7177C4265382884EE5F2DBC4CE359`；旧 EXE 位于 `C:\MDnote\.codex-backups\taskbar-icon-20261008-153502\MarkdownStickyNote.exe`。
- 用户于本轮确认验收通过。真实跨显示器 DPI 切换未单独实测；正式 ZIP 未另起第二个同标识实例，避免启动请求被现有实例接管。自动检查、现场运行和用户验收分别记录，不互相替代。

### 本次 ZIP

- 经项目 `npm.cmd run build:green` 完整构建：`MKnote-portable-v5.2.0-20261008-154209.zip`，13,121,523 字节。
- ZIP SHA-256：`0D42CD84FE50DAEF0FD04913927D355A26F5E180AE9BC2B8C3619FE8817829A1`。
- 精确条目为 `MarkdownStickyNote.exe`、`README.txt`，不含便签、配置、密钥或开发文件。
- 包内 EXE SHA-256：`21DC31A8187F730A1F7DCD91E72375E274ABB84ED4F1BF6D88B8DCC86B6BC94F`；与 release、portable、portable-release 一致，FileVersion 为 5.2.0，构建时间晚于本次前端输出。
- 此轮 `build:green` 的 Tauri bundle 流程会写入 bundle type 信息，EXE 字节哈希与此前已安装的直接 Cargo Release 不同；两者为相同修复源码，不能将两个哈希写成相同。
- 本地证据整理在 `.codex-smoke/taskbar-icon-20261008/runtime-verification.txt` 和 `package-verification.json`。

### 清理与保留

保留旧 ZIP、正式程序回滚备份、构建缓存及必要验收证据；只提交本轮源码、回归脚本与相关文档。原有未跟踪文件 `src/assets/brand/logo-monochrome.svg` 保留且不提交。

五个已结束的临时图标测试目录因自动审批拒绝递归删除（`blocked by policy`），已可回滚地整理至 `%TEMP%\mknote-icon-archive-20261008\`，不声称已释放其磁盘空间。本次附带生成的 MSI / NSIS 整理至 `.codex-smoke/taskbar-icon-20261008/archive/`，不作为 ZIP 交付内容。
