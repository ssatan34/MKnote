# MKnote 可视化编辑器 T5 Owner 手工验收清单

> 状态：`pass`（Owner 已完成手工验收）
> 记录日期：2026-08-24
> 唯一主记录：本文件
> 适用范围：隔离的 Phase 1A PoC 窗口，不代表生产 `EditorPane` 已接入

## 1. 目的与证据边界

T5 只回答一个问题：在隔离窗口中，项目 Owner 是否愿意接受可视化编辑器的日常输入手感。

以下内容不能代替 Owner 的手工结论：

- T1/T2/T3 自动化结果；
- T4 的性能、内存、保存/CAS 和包体指标；
- Agent 观察到的页面状态或 CDP 事件；
- “窗口能启动”这一事实本身。

Owner 必须实际操作窗口，并在本文件的结果区填写每项状态。`not-available`、`not-run` 和空白都不能解释为通过。

## 2. 启动隔离窗口

从仓库根目录执行：

```powershell
node .\poc\visual-editor-phase1a\scripts\phase1a-t5-owner-launch.mjs `
  --dev-port 4205 `
  --cdp-port 9265 `
  --run-id t5-owner-20260824
```

启动器会：

- 只启动 `poc/visual-editor-phase1a` 的 Tauri harness；
- 使用独立前端端口、CDP 端口、WebView2 用户数据目录、Cargo target 目录和临时用户目录；
- 在 `poc/visual-editor-phase1a/artifacts/t5-owner/<run-id>/launch.json` 写入机器可读的启动状态；
- 等待隔离窗口的 CDP 就绪，但不会自动输入、自动点击或生成 Owner 通过结论。

`127.0.0.1:4173` 是 Owner 现有实例的保留端口，启动器会拒绝使用它。若默认端口已被其他隔离任务占用，请同时更换两个端口，例如 `4206` 和 `9266`；不要关闭、重启或复用 `4173`。

启动记录中的 `status: "ready"` 只证明隔离窗口已启动。关闭 Tauri 窗口后，启动器随之退出；保留该运行目录以便把人工结果与启动环境对应起来。

## 3. 操作约束

1. 只使用固定测试文本：`可视化编辑 T5；中文输入、候选、空格、回车、标点。`
2. 不打开真实 Private 笔记，不粘贴真实笔记正文，不记录个人信息。
3. 使用实际鼠标、键盘和当前 Windows 输入法；不要用 CDP `press`、`insert-text`、脚本注入或 `execCommand` 代替手工操作。
4. 如果 English layout 未安装，只记录 `not-available` 和系统实际状态，不把它写成通过。
5. 若出现窗口崩溃、文本丢失、重复输入、候选无法提交或光标跳动，立即停止该项并记录观察，不通过重复操作掩盖问题。

## 4. 单一验收清单

每项只需一次有代表性的手工操作；复杂输入的重复压力由 T3/T4 负责，不在这里复制自动化套件。

| ID | 手工场景 | 通过标准 | 状态 | Owner 记录 |
|---|---|---|---|---|
| T5-01 | 点击编辑区后立即输入固定文本 | 无需额外唤醒或重复点击，首字符进入预期位置 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-02 | Microsoft Pinyin composition，按空格提交候选 | 候选提交一次完成，无拼音残留、重复文本或漏字 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-03 | 候选翻页后选择候选 | 翻页响应可理解，选择结果稳定落在光标处 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-04 | composition 中按回车上屏 | 当前候选一次提交，composition 正确结束，光标位置合理 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-05 | 已提交中文后按普通回车 | 新段落/下一行行为符合预期，不吞字、不重复、不跳选区 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-06 | 中文标点输入 | 中文逗号、句号等标点直接进入编辑器，位置和 composition 不异常 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-07 | 切换到 English layout 后输入 ASCII 文本 | 英文布局可用时字符正确；布局不可用时记为 `not-available` 并说明原因 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-08 | 鼠标拖选已输入文本并替换 | 选区可见且替换范围准确，不影响邻近内容 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-09 | 粘贴固定测试文本 | 粘贴一次完成，光标落点合理，无非预期格式或重复内容 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-10 | 连续输入两至三句并移动光标 | 连续输入过程中无明显卡顿、丢焦点、光标漂移或滚动异常 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-11 | 对刚才的编辑执行 Undo / Redo | 撤销和恢复结果可预测，composition 不被拆成异常碎片 | `pass` | 2026-08-24：Owner 确认通过 |
| T5-12 | 完成一轮日常编辑后给出整体判断 | Owner 愿意用它完成普通便签编辑，不需要回到源码路径 | `pass` | 2026-08-24：Owner 确认通过 |

状态只能填写：`pass`、`fail`、`not-available`、`not-run`。每个 `fail` 或 `not-available` 必须附带可复现的简短现象；截图或日志路径可写入 Owner 记录，但不得包含真实笔记正文。

## 5. Owner 结果记录

以下字段在实际手工验收完成后填写；在此之前保持 `pending`，不能由自动化报告代填。

| 字段 | 当前记录 |
|---|---|
| 启动记录 | [t5-owner-20260824-rerun/launch.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/t5-owner/t5-owner-20260824-rerun/launch.json>) |
| Owner | 项目 Owner（本轮人工确认） |
| 开始时间 | 2026-08-24；具体时刻未记录 |
| 结束时间 | 2026-08-24；具体时刻未记录 |
| T5 总体结果 | `pass` |
| Gate B-P0 对 T5 的决定 | `pass`；进入 Gate B-P0 重审，未替换 T4 失败证据 |
| 失败或环境限制摘要 | 无；Owner 明确确认 T5-01–T5-12 全部通过。500 KiB `press` 与 `10 Tab + 1 Popout` 内存失败仍是独立 T4 证据。 |

### 结果填写规则

- 只有 Owner 明确写出总体 `pass`，且所有 P0 场景均为 `pass` 或已由目标环境决策明确处理，T5 才可进入 Gate B-P0 重审。
- 任一 P0 场景为 `fail`，总体结果必须保持 `fail`，并保留复现描述。
- 任一场景为 `not-available` 或 `not-run`，总体结果必须保持 `pending` 或 `blocked`，不能写成 `pass`。
- T5 通过也不会自动解除正式 500 KiB `press` 和 `10 Tab + 1 Popout` 内存门槛；Gate B 必须继续按完整证据账本重审。

## 6. 关联资料

- [可视化编辑器升级计划](<C:/Projects/MKnote/docs/plans/MKnote可视化编辑器升级计划.md>)
- [最新交接记录](<C:/Projects/MKnote/docs/HANDOVER-2026-08-23-visual-editor.md>)
- [测试场景注册表](<C:/Projects/MKnote/docs/visual-editor-test-registry.json>)
- 启动器：[phase1a-t5-owner-launch.mjs](<C:/Projects/MKnote/poc/visual-editor-phase1a/scripts/phase1a-t5-owner-launch.mjs>)
