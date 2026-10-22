# MKnote 可视化编辑器受控 Beta 试用记录

更新日期：2026-08-25
适用范围：显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror` 的普通笔记主窗口
当前状态：`pass`（按 Owner 确认的简化 Gate D 范围）

## 目的

本记录用于 Gate D 前的真实普通笔记试用，不把隔离 Release、自动化测试或 T5 Owner 手感验收直接当作 14 天稳定性证据。日志只记录匿名笔记标识、操作和结果，不记录真实正文、密钥或 Token。

## Gate D 目标

| 条件 | 当前结果 | 说明 |
|---|---|---|
| 真实外部 AI Test | `pass` | Owner 于 2026-08-25 明确确认真实 AI Test 已通过；不记录 Token 或完整请求 |
| 真实普通笔记数量 | `20/20`，`pass` | Owner 于 2026-08-25 明确确认 20 篇普通笔记已完成且未发现问题；不虚构笔记 ID 或日期 |
| 稳定观察周期 | `optional / not-run` | 14 天观察按 Owner 决策改为可选，不再阻塞 Gate D |
| P0 数据问题 | `pass`（Owner 确认） | 20 篇实际使用中未发现数据丢失、错误覆盖或无法恢复的问题 |
| Owner 日常手感 | `pass`（Owner 确认；T5 12/12） | Owner 已确认采用简化 Gate D；T5 与真实日常使用分别记录 |
| Gate D | `pass`（简化范围） | 条件为真实 AI Test + 20 篇普通笔记 + Owner 确认；不自动切换默认模式 |

## 运行准备（不计入 Gate D）

- 2026-08-24 的显式 visual Beta Release 隔离冒烟已通过：[phase2-visual-beta-runtime-smoke-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-visual-beta-runtime-smoke-20260824.json>) 为 `status=pass`。
- 该报告只使用临时数据根和合成笔记，验证 visual editor 挂载、ready、工具栏、写盘和运行时错误；`gateD.counted=false`，不触碰 Owner 端口或真实数据根。
- 试用记录只记录匿名笔记 ID、日期、操作类别和结果，不记录正文、Token 或其他敏感内容；本次 20/20 结果来自 Owner 明确确认，不补造逐篇日期或 ID。

## 使用边界

- 仅使用普通笔记；Private、Popout、Capsule 继续走既有旧链路，不计入 visual Beta 试用样本。
- 默认模式仍为 `legacy-preview`；只在明确的 visual Beta 实例中记录本表。
- 不关闭、重启或占用 Owner 保留端口 `4173`、`4205/9265`、`4207`；隔离探针使用独立端口。
- 每次记录前后确认 `.md` 文件仍是唯一持久化真相；不把 ProseMirror JSON、HTML 或 DOM 当作磁盘证据。
- 发生保存失败、CAS 冲突、初始化回退或数据内容异常时立即记录，不能用重试覆盖第一次结果。

## 单篇记录模板

| 日期 / Day | 匿名笔记 ID | 编辑能力 | 保存 / 重开 | Tab / 隐藏 / 退出 | CAS / 回退 | 运行时错误 | Owner 备注 | 证据路径 |
|---|---|---|---|---|---|---|---|---|
| — | — | `not-run` | `not-run` | `not-run` | `not-run` | — | — | — |

建议每篇至少覆盖一次普通文本、列表或任务、链接/Wikilink、表格或图片（若该篇实际包含），并在编辑后执行保存→关闭/重开→内容核对。没有实际操作时保持 `not-run`，不得填写推测结果。

## 每日汇总模板

| Day | 活跃普通笔记数 | P0 数据问题 | 保存/CAS 问题 | 回退次数 | 结论 | 证据 |
|---:|---:|---|---|---:|---|---|
| 1–14 | — | `not-run` | `not-run` | — | `pending` | — |

## 2026-08-25 状态复核（试用开始前）

- 试用开始前的只读复核曾记录 Owner 尚未开始真实普通笔记试用；该段是历史快照，不覆盖下方 Owner 的最终确认。
- 显式 visual Beta 的隔离运行准备已具备，但合成笔记、自动化回归、T5 `12/12` 和 Popout 内存对照采样均不计入 Gate D。
- 下一次有效记录原计划来自 Owner 的逐篇记录；本轮最终采用简化 Gate D，不要求回填不存在的逐篇日期或 ID。
- 真实 AI 服务当时仍为 `pending`；下方已按 Owner 2026-08-25 的明确确认更新为 `pass`。

## Gate D 评审前检查

1. 真实外部 AI Test 有明确结果，20 篇普通笔记完成且没有 P0 数据问题。
2. 14 天观察可继续记录，但按 Owner 决策不是 Gate D 必需条件。
3. 机器证据、Owner 主观判断和真实数据检查分开汇总；不能用构建成功或隔离 E2E 替代真实试用。
4. 正式 T4 的 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败继续单独保留，不因 Gate D 试用结果被改写。
5. Owner 明确确认后，Gate D 可按简化范围通过；默认 `visual-prosemirror` 仍需另行授权，不能因此删除旧编辑器回退链路。

## 2026-08-25 Gate D 运行前只读复核

- 当前隔离 Beta 进程仍在运行，CDP 使用独立端口 `9421`；只读取页面元信息和编辑器状态，没有读取笔记正文，也没有执行编辑、保存或 AI 请求。
- 只读 DOM 检查结果：`data-editor-ready=true`、`contentEditable=true`、初始化错误节点数量为 `0`。这只证明窗口具备开始试用的运行条件。
- 本次复核本身 `gateD.counted=false`；它不计入真实试用。最终 Gate D 状态以本文件下方 2026-08-25 Owner 确认快照为准。

## 2026-08-25 Owner 确认与简化 Gate D 结果

- Owner 明确确认：真实外部 AI Test `pass`；真实普通笔记 `20/20 pass`，未发现问题。
- 按 Owner 决策，Gate D 采用简化条件：真实 AI Test + 20 篇普通笔记 + Owner 确认即可；14 天连续观察改为可选，本次 `not-run` 不阻塞 Gate D。
- 严格 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存超正式门槛的证据仍保持 `failed`；它们在当前范围内记录为非阻塞已知限制，实际遇到影响后再处理，不把失败改写为 `pass`。
- 默认模式仍为 `legacy-preview`；本次 Gate D 通过不自动切换默认编辑器，也不删除旧编辑器回退链路。
- 以上结果来自 Owner 于 2026-08-25 的明确确认；没有补造逐篇笔记 ID、日期或 14 天记录。

## 2026-08-26 Owner Bug 修复记录

本节仅记录 Owner 明确提出的 Bug；未列出的项目按本次回归通过处理，不另列通过项。

- 代码块无法收起：已修复，保留复制按钮，并支持收起/展开。
- 源码模式工具栏代码格式化无法使用 Ctrl+Z 撤销：已修复，代码格式化纳入源码编辑器撤销/重做历史。
- 使用一级、二级、三级标题后光标落在倒数第二个字符前：已修复，光标落在标题行末。
- 标题折叠功能缺失：已修复，标题前提供可访问折叠按钮，折叠范围截止到下一个同级或更高级标题。

自动化验证已覆盖上述四项；Owner 实际使用确认仍按原验收边界执行。
