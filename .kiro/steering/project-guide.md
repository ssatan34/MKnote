# MKnote 项目指引

## 项目简介

**MKnote**（MD Sticky Note）是一款基于 Tauri + React 的桌面便签应用，支持 Markdown 编辑、Tab 管理、时间线视图、资料库、隐私笔记、云端保险库等功能。

- 技术栈：Tauri（Rust 后端）+ React + TypeScript + Vite + shadcn/ui
- 本地运行：`npm install` → `npm run tauri dev`
- 构建打包：`npm run tauri build`

---

## 核心文档索引

开发前请按需阅读以下文档：

| 文档 | 说明 |
|------|------|
| [docs/HANDOVER-2026-07-02.md](../docs/HANDOVER-2026-07-02.md) | **最新交接记录**（隐私笔记 + 云端保险库） |
| [docs/AGENT-HANDOVER.md](../docs/AGENT-HANDOVER.md) | 架构、命令、约定（长期有效，每次必读） |
| [docs/项目总结.md](../docs/项目总结.md) | 项目概况、目的、状态与文档索引 |
| [docs/功能概要.md](../docs/功能概要.md) | 产品功能与使用场景（简明） |
| [docs/PROJECT-SUMMARY.md](../docs/PROJECT-SUMMARY.md) | 实施路径、功能复刻步骤、迭代维护指南 |
| [docs/MKnote-UI-v2.md](../docs/MKnote-UI-v2.md) | UI 规范（改界面时必读） |
| [docs/ICON-GUIDE.md](../docs/ICON-GUIDE.md) | 图标使用规范（改界面时必读） |
| [docs/AGENT-INTEGRATION.md](../docs/AGENT-INTEGRATION.md) | 外部 AI 读写便签的接口与安全规则 |

## 交接记录时间线

| 文件 | 日期 | 主要内容 |
|------|------|---------|
| [HANDOVER-2026-06-28.md](../docs/HANDOVER-2026-06-28.md) | 2026-06-28 | 核心功能完成、资料库、Tab、待办、思源 |
| [HANDOVER-2026-06-30.md](../docs/HANDOVER-2026-06-30.md) | 2026-06-30 | Figma UI 优化、状态栏清理、剪贴板图片粘贴 |
| [HANDOVER-2026-07-01.md](../docs/HANDOVER-2026-07-01.md) | 2026-07-01 | 状态栏重排、Tab Grid 布局、置顶数量设置、滚动条设计 |
| [HANDOVER-2026-07-02.md](../docs/HANDOVER-2026-07-02.md) | 2026-07-02 | 隐私笔记、云端保险库 |
| [HANDOVER-2026-07-06.md](../docs/HANDOVER-2026-07-06.md) | 2026-07-06 | 脚本胶囊、全屏避让 |
| [HANDOVER-2026-07-06-startup-opt.md](../docs/HANDOVER-2026-07-06-startup-opt.md) | 2026-07-06 | 启动性能优化（白屏消除、后台线程、并行 tab 恢复） |

---

## 项目开发约定

- Rust 代码在 `src-tauri/src/`，前端代码在 `src/`
- 新增 Tauri 命令需在 `src-tauri/src/lib.rs` 注册
- UI 组件使用 shadcn/ui，样式改动写在 `src/App.css`
- 改 UI 前务必阅读 `docs/MKnote-UI-v2.md` 和 `docs/ICON-GUIDE.md`
- 数据文件目录通过 `src-tauri/src/paths.rs` 中的 `NoteZone` 管理
- 隐私笔记存放于 `File/.private/`，不得出现在资料库和 Agent 索引中

---

## 优先级

- 用户显式指令 > 项目既有规范（文档 / 代码风格）
- 冲突时选择**改动最小、风险最低、可验证**方案，并说明原因
- 未明确规则时以本文件为默认行为

---

## 命名与代码风格

- TS：camelCase；Rust：snake_case；类/组件：PascalCase；常量：UPPER_SNAKE_CASE
- React 组件文件名与组件名一致（PascalCase）
- 文件夹/普通前端文件：kebab-case；Rust 模块：snake_case
- 命名必须语义清晰，避免缩写

---

## 注释与日志

- 注释只解释"为什么"，不重复代码逻辑
- 复杂业务逻辑、边界条件、关键决策必须说明原因
- 禁止在日志中输出敏感信息（Token、密码、密钥等）

---

## 安全原则（强约束）

- 永远不信任客户端输入，所有外部输入必须校验
- 密钥必须使用环境变量，不得写入代码
- 密码/敏感数据必须加密或哈希存储
- 对外输出必须脱敏敏感字段
- IO / 网络 / 并发 / 权限场景必须保留错误处理

---

## AI 执行原则

- 实现前必须明确关键假设；不清晰时先说明或询问
- 只做"必要修改"，禁止无关重构或顺手优化
- 不引入未要求的抽象、配置或扩展能力
- 修改必须保持最小 diff，避免影响无关代码
- 优先复用已有实现，不重复造轮子
- 多文件改动（≥3个）先给出简要设计再实现
- 修复 Bug 必须先定位原因，避免猜测性修改

---

## 完成标准

- 需求已直接完成并可验证
- 未引入不必要复杂度
- 无遗留无用代码或引用
- 关键路径风险已说明或验证完成
