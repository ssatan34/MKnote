# MKnote 5.2.1 发布记录

日期：2026-10-10。用户已确认置顶栏布局、视觉强调与 Tab 切换手感验收通过，并授权更新文档、升级为 5.2.1、清理本轮工作区及本地 Git 提交；不推送远端。

## 改动与原因

- 原置顶栏使用固定定位，覆盖编辑区底部；标题同时被字符数和 CSS 宽度双重截短。现在通过现有 Tab 组件的 portal，在状态栏上方放置独立 34px 行。短标题按实际宽度显示，长标题最多 220px，溢出项通过完整标题菜单访问，当前置顶笔记保持可见。
- 置顶栏左侧与编辑工具栏右边界对齐，移除最左侧重复置顶图标。各 tab 使用独立边框与背景，仅激活置顶笔记时突出整栏；激活尺寸保持稳定，避免旧 `.note-tab.pinned.active` 规则引发宽度抖动。
- 切换不再等待完整笔记列表扫描，直接使用已打开 Tab 的元数据；迁移备份确认仅缓存成功结果，并合并同一笔记尚未完成的请求。失败可重试，新窗口/重新启动仍重新确认磁盘备份。
- 取消激活颜色渐变及正文切换淡入，保留 100ms hover 反馈。未保存内容仍须写入成功后才切换，失败/冲突时保留草稿和当前位置；首次迁移备份失败时回退源码编辑。
- Milkdown 延迟约 200ms 上报输入。离开编辑器和点击 tab 前同步收取最后输入，并立即标记脏状态；延迟回调读取当前文档，避免把前一笔记的旧事务带入下一笔记。连续点击（包括最后点击原 tab）以最后选择为准。

## 验证与用户验收

- 定向自动检查：置顶布局/拖拽/数量规则 19 项；迁移缓存、Visual Editor session、迁移保护与 Private 保存 11 项；adapter 行为 2 项，均通过。adapter 测试通过现有 esbuild 打包后执行，避免 Node 直接运行时的无扩展名模块解析限制。
- 真实 WebView2 隔离验证覆盖：宽/窄窗口标题与溢出菜单、激活尺寸稳定、左侧对齐、条件整栏底色、源码/可视化末行输入与保存、上下文菜单、拖拽、中键关闭、无置顶和资料库展开。
- 切换保护隔离验证覆盖：首次备份原文、成功备份复用、输入后立即切换并保存、备份原文不改变、CAS 冲突保留本地草稿及外部磁盘内容、连续快速点击、首次备份失败回退源码。正式配置哈希前后相同。
- 隔离短笔记 12 次预热后切换：激活状态 11.1–23.4ms（中位数 14.9ms），正文就绪 14.0–27.4ms（中位数 19.2ms）。这些数据来自隔离 Debug fixture，不代表所有大型笔记或 Release 的性能上限。
- 用户分别确认布局、切换手感及 5.2.0 时间戳绿色包验收通过。本次 5.2.1 是已验收源码的版本收口，自动验证、用户验收和包校验分别记录。

## 版本与绿色包

统一 package.json、package-lock 顶层与根包、Tauri 配置、Cargo.toml / Cargo.lock 本项目版本和当前文档为 5.2.1；保留历史发布记录及旧 ZIP。

- 使用项目 Tauri 构建入口 `npm.cmd run tauri -- build --no-bundle` 完成前端及优化 Release，再运行现有 `scripts/pack-green.ps1` 生成绿色 ZIP，本次不生成 MSI / NSIS。
- 绿色包：`MKnote-portable-v5.2.1-20261010-115638.zip`，13,640,167 字节；只含 `MarkdownStickyNote.exe`、`README.txt`，不含笔记、配置、密钥或开发文件。
- ZIP SHA-256：`ACF1944CBB6F0C7B34C5B48EEBA5C213F47BD6017279773D41B36D478A5EBC40`。
- 包内 EXE SHA-256：`6EC26E635119FB84653425AB7291EF9E456CEFD832B9EBC436C56D81809CC567`；release、portable、portable-release 与 ZIP 内 EXE 一致，ProductVersion / FileVersion 均为 5.2.1。
- Release EXE 构建时间晚于本次前端输出，正式配置哈希未改变。已有 Vite 大块提示与 Rust dead-code 提示为 warning，未导致构建失败。包校验记录为 `.codex-smoke/release-5.2.1/package-verification.json`。

## 清理与保留

仅整理本轮测试产物，保留用户试用目录、必要截图/报告、旧 ZIP、正式配置与构建缓存。原有未跟踪 `src/assets/brand/logo-monochrome.svg` 不属于本轮，保留且不提交。

自动审批拒绝递归删除（`blocked by policy`，未提供更具体原因）；已改为可恢复归档，将 7 个已结束的临时运行目录和 8 个一次性诊断文件移入 `.codex-smoke/release-5.2.1/archive/`，不声称释放磁盘空间。清理映射见 `.codex-smoke/release-5.2.1/cleanup-verification.json`。

保留 `.codex-smoke/pinned-tabs/runtime-gU7CB9/` 用户试用内容、`.codex-smoke/pinned-tabs/regression-activation/report.json` 布局验收证据与 `.codex-smoke/tab-switch/report.json` 切换/保护验收证据。本轮代码未再变化，不重复已经通过的行为检查。

## 验证边界

正式程序仍在运行，包内 EXE 不另起同标识实例，避免单实例转发到旧程序。运行行为已有隔离验证及用户验收；本次正式 ZIP 核验文件、版本、构建时间与哈希。使用新包前请从托盘退出旧实例，再替换/启动新 EXE。本轮不自动替换 `C:\MDnote` 中的程序，不提交用户配置或笔记。
