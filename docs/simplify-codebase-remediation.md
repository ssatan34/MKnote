# MDnote 复杂度收敛审计与修复交接

> 版本：v5.0.2 · 日期：2026-09-17 · 范围：`$simplify-codebase change`

## 结论

本轮完成了已确认的低风险复杂度收敛和已决退役项，发布版本提升为 `v5.0.2`。收敛范围包括孤立依赖与注册、无生产入口的旧 UI、Stars no-op、持久化 History、重复配置真相、旧目录兼容 command、旧 Lsky command、WebDAV/NAS 分支和已取消的 Cloud Vault。

仍保留的生产能力包括进程内编辑器 undo/redo、本地 Private 隐私笔记、S3 同步、兰空图床、收藏、快速捕获、Quick Todo/Pocket、Popout、Capsule 和窗口生命周期能力。

本轮没有访问、迁移或删除 S3 对象、WebDAV/NAS 数据、用户笔记、`File/.private` 或旧 History 目录。顶栏 Logo 当前用于将笔记转为胶囊；本地 Private 的入口仍是状态栏字数区域 Ctrl+点击。

## 1. 覆盖范围

| 区域 | 主要检查材料 | 结果 |
|---|---|---|
| 入口与运行时 | `src/main.tsx`、`src/App.tsx`、`src-tauri/src/lib.rs`、`system.rs`、窗口 label 路由 | 主窗口、Popout、Capsule、Quick Todo/Pocket、托盘和热键入口已覆盖 |
| 配置 | `AppConfig`、`parse_config_json`、`configService.ts`、设置面板 | 主题和切窗热键收敛到正式字段；旧字段只读迁移 |
| 状态与生命周期 | `App.tsx`、`useTabSessions`、保存队列、窗口 service、Rust window/system 模块 | 删除退役功能的状态、注册和生命周期分支；Private、Popout、Capsule 保存边界保留 |
| 持久化与路径 | `notes.rs`、`paths.rs`、`stars.rs`、`trash.rs`、S3 store、`File/.private` | 停止新增持久化 History 快照；保留本地 Private 目录，不触碰既有数据 |
| 动态注册与依赖 | `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、Tauri capabilities | 移除未使用依赖、旧 command 和 Cloud Vault/WebDAV 注册 |
| 测试与文档 | `tests/`、README、当前 handover/summary/UI/integration 文档 | 相关合同、构建、绿色包和已知失败边界已记录 |
| 生成文件 | `dist/`、Rust release、portable ZIP | 已生成并核对 v5.0.2 绿色包；产物不纳入 Git |

## 2. Findings 与处理结果

### F-01：孤立依赖、注册和 manifest 残留 — 已处理

移除不再被生产代码使用的 npm/Tauri/Rust 依赖及其 lockfile 残留，保留当前运行时实际需要的依赖。未通过删除测试或关闭检查隐藏问题。

### F-02：未使用的拖拽依赖 — 已处理

移除 `@atlaskit/pragmatic-drag-and-drop`。当前拖拽逻辑继续使用项目已有的 Pointer Events 和排序模型。

### F-03：无生产入口的旧组件 — 已处理

移除 `AboutModal`、`DetachView`、`ExpandedView`、`FloaterView`、`QuickCapture`、`ThemeSelect`、`VaultCurtainButton` 及其专属 CSS。生产入口搜索没有剩余引用；历史文档中的旧名称仅作为演进记录保留。

### F-04：Stars no-op — 已处理

移除启动时不产生实际行为的 Stars no-op 路径；收藏的实际数据和 UI 能力未作为本项删除目标。

### F-05：持久化 History 及旧查询/恢复接口 — 已处理

移除已确认不再使用的持久化 History 实现、旧查询/恢复入口及其动态注册。编辑器进程内 undo/redo 保留；已有 `File/.mknote-history` 目录未检查、迁移或删除。

### F-06：配置重复真相 — 已处理

统一使用正式字段：

- 主题模式：`theme_mode`；旧 `theme` 仅在读取时迁移；
- 切窗热键：`global_hotkeys.toggle_window`；旧热键字段不再作为 UI、启动注册或更新逻辑的真相。

当旧字段和正式字段同时存在时，以正式字段为准；写回配置不重新生成已退役的旧字段。

### F-07：自定义目录兼容 command — 已退役

移除旧 `set_data_dir` / `set_inbox_dir` 兼容 command 及其前端包装。当前目录模型固定为 `{base}/inbox` 和 `{base}/File/default`；既有外部目录不会被删除或移动。

### F-08：Lsky 旧兼容 command — 已退役

移除旧 `set_lsky_config` IPC 及 TypeScript wrapper。统一图床配置、Lsky 上传/清理和现有 Lsky 配置字段仍保留，不等同于退役 Lsky 图床。

### F-09：WebDAV/NAS 路径 — 已退役

移除 WebDAV client、Message Hub 的 WebDAV 分支、WebDAV 配置字段和 `set_webdav_config` command。当前同步配置只走 S3。本轮没有连接、读取、修改或删除 NAS 数据。

### F-10：Cloud Vault — 已退役

Cloud Vault 是曾计划写入 S3 的密码保护文本保险库，使用独立的 `vault-config.json` 和 `vault-notes.json`。它不同于本地 `File/.private`、普通 S3 同步、隐私遮罩和 Quick Pocket 的 `private` 标签。

按用户确认删除 `vault.rs`、`vaultService.ts`、Vault 类型、Vault commands、专属 CSS 和仅由它引入的依赖。本轮没有检查、迁移或删除云端 Vault 对象。

## 3. 保留边界与重要反例

- 本地 Private 隐私笔记仍是生产能力：入口为状态栏字数区域 Ctrl+点击，数据目录为 `File/.private/`；不进入普通资料库、Agent 索引或思源上传。
- 顶栏 Logo 不再是 Private 入口；当前 Logo 点击行为是将当前笔记胶囊化。旧 `HANDOVER-2026-07-02.md` 中的 Logo 隐私入口属于历史实现记录。
- 隐私遮罩只用于遮挡疑似敏感内容，不改变磁盘内容；Quick Pocket 的 `private` 只表示条目隐私标签和摘要打码。
- “Cloud Vault 退役”不等于删除本地 Private；“WebDAV 退役”不等于删除 NAS 数据；“持久化 History 退役”不等于移除编辑器内存 undo/redo。
- 历史 handover、计划和 OpenWiki 页面可能保留旧功能名称；OpenWiki 页面应由既有生成流程维护，不手工改写生成页。

## 4. 验证记录

| 检查 | 结果 |
|---|---|
| 版本一致性 | 通过：`package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`Cargo.lock`、`tauri.conf.json` 均为 `5.0.2` |
| `npm.cmd run build` | 通过 |
| `npm.cmd run build:green` | 通过 |
| 绿色包 | `MKnote-portable-v5.0.2-20260917-164701.zip`；仅含 `MarkdownStickyNote.exe` 和 `README.txt`；ZIP 约 13.58 MB；SHA-256：`31197052F563F4157AFCB7E5F3EC0784642E6B2E57C9D37914838F3E5F8BEA9A` |
| 绿色包产物时间 | 通过：release EXE 新于 `dist/index.html` |
| `git diff --check` | 通过 |
| Lsky 清理合同 | 3/3 通过 |
| Quick Pocket | 28/28 通过 |
| Quick Input | 2/2 通过 |
| Visual Editor scenario registry | 1/1 通过 |
| Quick Todo | 58/64；6 项为既有静态 UI 合同漂移，与本轮退役项无直接重叠 |
| Tauri Windows UI smoke | 受环境阻塞：当前 CUA 无原生窗口表面，浏览器 fallback 不能替代真实 WebView2 验收 |

Quick Todo 的 6 项既有失败为：入口置顶图标颜色、语义标签图标颜色、完成控件中文 aria-label/tooltip、CSS token/layout 合同、原生前台状态监控、关闭按钮的 `data-no-drag` 合同。本轮未修改这些无关问题。

## 5. 交付边界与后续

本轮代码、配置、测试和本地文档变更已纳入当前 Git 提交。绿色包和 `portable/`、`portable-release/` 属于生成产物，按 `.gitignore` 保持在仓库外。

继续处理旧 History 目录、`.private` 数据或已取消 Cloud Vault 云端对象，必须另行明确具体的只读检查、导出、删除或迁移动作。本轮不执行这些数据操作。

后续新增复杂度候选必须先确认生产入口、动态 IPC、持久化格式、外部脚本、兼容边界和回滚方案，再单独实施。
