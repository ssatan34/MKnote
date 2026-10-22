# MKnote 5.2.4 发布记录

- 日期：2026-10-20。
- 范围：整合此前未打包的外部刷新、Allnote Work 分组、多层父子任务、只读保护与来源入口，继承 Quick 数据目录和全部 5.2.3 功能。
- 当前阶段：集成、定向验证与绿色包构建完成。尚未替换在用程序，未执行真实数据迁移。

## 功能与边界

- Quick Todo 可见且空闲时每 2 秒重读共享文件。慢读取未完成或本地写入排队时不追加轮询；列表内容相同不替换状态。隔离浏览器已复现原实现在慢读取期间重复请求的问题，并验证修复后的读取、写入互斥行为。
- Allnote 自动任务按稳定项目 ID 分组，同名项目不合并；按真实 parentId 展示多层父子任务，已完成父任务可作为上下文，日期独立显示，不计入未完成数量。
- 自动任务的编辑、完成、删除、标签、提醒、链接和子项创建由界面及 Rust 同时限制；手工任务继续编辑和排序，清理已完成保留自动任务与原始行。
- 来源和项目主页通过受限的 Allnote Obsidian URI 打开；只允许 `20 工作/` 下的 Markdown。外部汇总写入程序不在本版本部署范围内；本版不反向写回 Allnote。
- Todo / Pocket 分别配置数据目录，可共用目录；重启后生效，读写、创建、删除和 S3 同步共用路径。不会自动搬移现有文件，普通便签路径不变。
- 单色 SVG 备用母版随源码收录，尚未接入界面；系统及应用图标继续沿用现有透明彩色母版。

## 版本与资料

package.json、package-lock 的顶层与根包、Tauri 配置、Cargo.toml 和 Cargo.lock 项目版本统一为 5.2.4。README、项目总结、功能概要、实施路径、交接、UI 及外部 Agent 接入说明同步描述本次功能；历史 5.2.3 包体证据保留。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| Quick Todo / Pocket 前端回归 | 92 项通过 |
| Work 分组、多 Todo 与 5.2.3 多行转待办 | 15 项通过 |
| Rust Quick 相关测试 | 68 项通过 |
| Rust 同步测试 | 35 项通过，包含自定义目录读写与旧文件保护 |
| Hook 隔离浏览器回归 | 2 项通过：慢读取不重叠、本地写入排队时不轮询 |
| 隔离 Windows / WebView2 行为验证 | 11 项通过：目录保存、重启、CRUD、旧文件保护、共用目录、恢复默认；Work 只读、手工操作、多层分组、拖动、外部刷新与来源路由 |
| 前端生产构建、Windows debug / release 构建 | 通过 |
| 正式配置、程序及已有笔记文件 | 689 个文件 SHA-256 与开始时一致 |

前端仍有 chunk 大小提示，Rust 构建有既有未使用项警告，均未导致失败。Quick 旧测试中的拖动源码断言已改为验证手工任务切片，同时在原生窗口实际执行鼠标拖动，确认拖动过程中行顺序稳定。原生文件夹选择器沿用已验收实现，本轮覆盖路径输入和保存，未再次人工操作系统选择框。

行为证据：`.codex-smoke/quick-data-directory-e2e.json`、`.codex-smoke/quick-todo-refresh.json`、`.codex-smoke/quick-work-524.png`。本轮完整源码快照和逐文件哈希保存在 `.codex-smoke/release-5.2.4/source-manifest.json`、`source.zip` 与 `release-5.2.4.patch`；包含所有待集成功能，不再使用 5.2.3 的功能排除快照。使用独立 Git index 生成证据，原 index 保持不变，未创建提交。

## 绿色包

- 文件：`MKnote-portable-v5.2.4-20261020-205519.zip`，13,213,170 字节。
- ZIP SHA-256：`17F4818E035560D3EAC5EEAE5A29CF346080851C2770940DB9CD10AEA523092E`。
- EXE SHA-256：`8721B31353CB4D42526ADDD5248C8BDEFD304D96DFFCF0850E5556267786A625`。
- ZIP 严格只含 `MarkdownStickyNote.exe` 与 `README.txt`；不含配置、真实笔记、示例数据或安装包。
- EXE 的 FileVersion / ProductVersion 均为 `5.2.4`，ProductName 为正式 `MD Sticky Note`；release、portable 与 ZIP 内 EXE 的哈希一致。EXE 不早于本次前端产物，ZIP 不早于 EXE。
- 后端目录命令和 Work 来源命令已存在于 EXE；Work 的 JS / CSS 经 Brotli 解压后与当前 `dist` 文件逐字节一致，对应压缩资源也已在 release EXE 中找到。构建前后 428 个应用源码及清单文件哈希一致。
- 构建复用已通过的前端产物，再执行 `tauri build --no-bundle`（仅覆盖空 `beforeBuildCommand`），最后调用现有 `scripts/pack-green.ps1`，避免重复前端构建及生成安装包。

包体、嵌入前端及数据保护证据见 `.codex-smoke/release-5.2.4/package-verification.json`、`embedded-ui-verification.json` 和 `live-data-verification.json`。运行前先退出旧实例，避免单实例机制将新 EXE 请求转交旧程序。

## 数据与发布边界

仅操作源码、项目文档和构建产物。验证使用临时配置、临时笔记、独立应用标识与本地测试目录；不替换 `C:\MDnote` 在用程序，不改普通便签或已有 Quick 文件，不合并两侧 Todo 差异，不连接真实 S3 验证，不提交或推送 Git。

真实 Obsidian 来源跳转不在隔离测试中执行，避免打开或改变用户现有库；验证覆盖按钮命令与 ID 路由、Rust URI 校验，原生 Shell 调用通过 Windows 构建确认。

## GitHub 绿色便携版分发（2026-10-22）

本次从净化后的公开 MKnote 源码重新构建 Windows x64 绿色包，保留 5.2.4 功能和应用标识，不替换在用目录或迁移真实笔记。公开下载入口为 [v5.2.4 Release](https://github.com/ssatan34/MKnote/releases/tag/v5.2.4)。

- 分发文件：`MKnote-portable-v5.2.4-windows-x64.zip`，14,123,289 字节。
- ZIP SHA-256：`e24f6f842b84958f5441e13613d2ce03b804088f3cebf187047026c2c6ebdd89`。
- EXE SHA-256：`278ee688cfa5a8ab291ec2f3439b7d9680c0a85b6d12df2ac383c11efa59b1e5`；FileVersion / ProductVersion 为 5.2.4，架构为 x86_64，未做代码签名。
- ZIP 除 EXE 和 README.txt 外，新增 MIT LICENSE、THIRD_PARTY_NOTICES.md、LICENSES/；包含 npm/Rust 完整许可及版权声明、Rust 标准库声明、5 项 MPL 2.0 依赖的未修改源码归档。不含用户配置、笔记、开发依赖、旧历史或本机备份。
- Rust 路径由编译选项映射，PDB 仅记录文件名；AWS-LC 使用中性路径下的真实源码目录构建，2,010 个文件与 Cargo.lock 校验通过的原始 crate 逐字节一致。EXE 未检出当前用户目录、源码绝对路径或已清除的 Figma 链接/密钥前缀。
- 前端生产构建、Windows release 构建、ZIP 文件白名单、随包许可逐文件比对、MPL 源码校验及隔离启动/自动保存测试通过；release、portable 与 ZIP 内 EXE 哈希一致。测试使用临时目录，结束后恢复并核对原有自启注册表设置。
- README 与随包说明包含下载、WebView2、首次运行、托盘退出、升级保留数据及 SHA-256 校验步骤。外部云服务仍由使用者自行配置，本轮未连接真实账号验收。

本节记录当前公开分发包；上方 2026-10-20 的双文件绿色包及其哈希为历史构建记录。
