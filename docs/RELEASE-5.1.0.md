# MKnote 5.1.0 · 2026-10-02

本版本新增 Obsidian 上传，整合图片离线回退和图床开关修复，并完成上传 UI 与透明羽毛 Logo 的用户综合验收。

## 已交付行为

- 笔记上传设置提供思源 / Obsidian 选项卡，最多启用一个，也可全部关闭；主页面按钮跟随当前平台。
- Obsidian 手动复制当前 Markdown 和本地附件到分别配置的目录，调整资源引用；目录须在同一磁盘。保留原始文件，同名笔记选择编号副本或覆盖，同名附件内容相同复用、不同则编号；隐私笔记不可上传。
- 思源连接测试移入后台线程，切换平台保留表单；避免网络请求阻塞窗口。复制或上传成功以按钮高亮反馈，2 秒后恢复，无成功文字浮层。
- 粘贴图片先保存本地副本；图床失败与离线时仍可显示。兰空 / 云图选项卡支持自动上传开关，关闭保留配置。历史图片只有远程链接且没有本地备份时，无法凭空恢复。
- 应用内、托盘、任务栏及 EXE 使用透明羽毛图标；左上角移除常驻底色和边框。PNG 母版通过 Tauri 导出各尺寸，ICO 包含 14 档独立帧；构建跟踪图标变化，确保更新 EXE 内嵌资源。

## 版本审计与验证

- 本次从 5.0.3 升为 5.1.0：新增独立 Obsidian 上传能力，旧思源配置保持兼容。
- npm、npm 锁文件根包、Tauri、Cargo 与 Cargo 锁文件本项目版本统一为 5.1.0。历史发布记录保留原版本。
- 用户确认综合功能、上传 UI 与 Logo 验收通过。
- 直接相关前端检查 5/5 通过；隔离 WebView2 上传验收 7/7 通过，覆盖最新内容保存、编号/覆盖、附件复制、全部关闭及隐私模式。
- 1.5 秒思源模拟接口下，旧版窗口响应约 1525ms，修复后约 89ms；按钮高亮实测 2005ms，切换保留目录草稿。
- 14 档 PNG 与 ICO 透明通道/尺寸验证通过；150% DPI 实例的应用内 Logo 背景和边框透明，运行窗口小图标及 EXE 图标含透明像素。用户确认任务栏、托盘及文件图标外观通过。其他 DPI 未单独运行验收。

## 绿色包交付

使用项目现有 `npm.cmd run build:green` 构建成功；前端和 Rust 仅有构建告警，不影响产物生成。

- ZIP：[MKnote-portable-v5.1.0-20261002-100210.zip](../MKnote-portable-v5.1.0-20261002-100210.zip)，13,093,966 bytes。
- ZIP SHA-256：`05779552F4C5F76868249EDECF7AB4289698623AA612D87CF6CB6B52C72C1300`。
- ZIP 条目严格为 `MarkdownStickyNote.exe`、`README.txt`；release 输出、portable EXE 和解压 EXE 哈希一致。
- EXE SHA-256：`623BAF5AB7276BF14FDD93495D66D524218F4F4418FDAC17B5F75EAB55DA96AB`；文件 ProductVersion 为 5.1.0。
- 版本审计覆盖 package.json、package-lock 顶层与根包、Tauri、Cargo.toml、Cargo.lock 本项目共 6 处，均为 5.1.0。
- 打包流程同时生成 MSI / NSIS 中间发行产物；此次交付 ZIP 不包含安装包。
- 包内容证据：`.codex-smoke/release-5.1.0/package-verification.json`。
- 正式 ZIP 的运行时启动冒烟未完成：本机已运行 `C:\MDnote\MarkdownStickyNote.exe`，单实例机制接管新启动，测试进程以 0 退出，未开启新的测试 WebView2。未关闭此正式程序；正式自启注册项前后保持不变。上述功能和图标运行验收基于先前的隔离实例及用户确认，不等同于此次 ZIP 的启动验收。首次升级测试应先从托盘退出旧实例，再运行新包。

## 工作区与后续维护

保留旧 ZIP、验收证据和用户验收笔记/配置；本次测试实例已退出。自动审批拒绝批量删除（blocked by policy），改为把 11 项已结束的图标暂存目录、诊断脚本及旧测试 EXE 可回滚归档到 `C:\Users\developer\AppData\Local\Temp\MKnote-cleanup-5.1.0-20261002`。正式包仅包含 `MarkdownStickyNote.exe` 和 `README.txt`，不包含真实笔记、配置、密钥或测试数据。

图标更新使用 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-brand-icons.ps1`。隔离回归入口为 `scripts/note-upload-e2e.mjs` 与 `scripts/note-upload-ui-e2e.mjs`，需先构建具有独立 identifier 和 productName 的测试程序；Playwright 路径可通过 `MKN_PLAYWRIGHT_MODULE` 指定。
