# MKnote 可视化编辑器升级交接

日期：2026-08-23
交出方：Codex
接手方：Codex / 新会话
当前状态：v5.0.0 发布收口完成；Gate C 已在显式 flag Beta 范围通过，Phase 3 的表格、代码块、块引用、图片、Wikilink、AI 选区、分割线、查找替换和 Popout visual P0 主场景已有证据；Owner 已确认 Visual Editor 完整人工测试、真实外部 AI Test 与 20 篇普通笔记通过，Gate D 按简化范围通过。严格 T4 的 500 KiB 输入与 Popout 内存失败按 Owner 决策保留为非阻塞已知限制。
当前快照（2026-08-26）：Gate D = AI Test `pass` + 普通笔记 `20/20 pass` + Owner 确认；14 天观察为 `optional / not-run`。当前源码默认模式为 `visual-prosemirror`；绿色包 [MKnote-portable-v5.0.0-20260826-174751.zip](<C:/Projects/MKnote/MKnote-portable-v5.0.0-20260826-174751.zip>) 已完成静态核验，ZIP SHA-256 为 `BC7C3E603CBB318DF59CCAA82453A0710E53E6D25CCD982648E26D41D1FAA480`，预览工具条与资料库交互已由 Owner 验收通过；Private/Capsule 继续保护旧链路。严格 T4 的 500 KiB `press` 与 Popout 内存失败按 Owner 决策作为非阻塞已知限制。
交接目标：让新会话可以直接继续推进可视化编辑升级，不重复已经完成的测试和探针。

> 以下“接手目标”至“完成条件”保留 2026-08-23 的初始交接快照；其中的默认模式、Gate 状态和未完成项不覆盖本文件末尾的 v5.0.0 当前收口。

## 一句话状态

阶段状态：Phase 1A 已完成；Gate B-P0 已按路径 B 处理，Phase 2 P0 与 Gate C 已在显式 Beta 范围闭合，Phase 3 P1 主场景和简化 Gate D 已通过。T5 Owner 12/12 通过，Owner 已确认 v5.0.0 Visual Editor 完整人工测试；当前默认主路径为 `visual-prosemirror`，显式 `legacy-preview` 时转入源码恢复入口，Private/Capsule 继续保护旧链路。严格 T4 的 500 KiB 输入与 Popout 内存仍为 failed，按 Owner 决策作为非阻塞已知限制。

## 接手目标

1. 按已批准的路径 B 推进 Phase 2 P0，不重复已通过的输入场景。
2. 建立测试场景注册表和分层运行规则，先减少反馈循环耗时。
3. 完成 P0 真实窗口的加载、编辑、保存、重开、外部冲突和回退验证，再评估 Gate C。

## 当前事实

### 已完成

- Gate A：兼容语料、Markdown 分类、source-aware、保存 / CAS 契约和基线文档已建立。
- Phase 1A 隔离 PoC：Milkdown / ProseMirror、列表、任务、Selection、Clipboard、Undo / Redo 和临时序列化已有自动化证据。
- 真实 WebView2 隔离 harness 已通过；不读取生产 `.md`，不连接生产保存队列。
- Microsoft Pinyin 客观探针已通过：composition、空格提交、物理 Undo / Redo、候选翻页、中文标点、鼠标选区替换、1000 次 composition。
- 原计划已经改写为快速推进版，测试层级统一为 T0–T5，P1 表格 / 图片不再阻塞 P0 引擎选择。

### 未完成

- P0 生产纵向切片已接入：`VisualEditorAdapter`、session、显式 feature flag，并沿用现有保存队列和 CAS；当前源码默认走 `visual-prosemirror`，可显式回退 `legacy-preview`。
- IME 回车提交已完成初步分类：当前探针结束 composition，但没有产生 DOM Enter；暂归类为 OS 输入注入 / harness 边界，不能直接判定编辑器失败，仍需真实窗口复核。
- 当前环境的 English layout 结果为 `not-available`，已归类为键盘布局 / 输入环境边界，仍需在目标环境复核。
- 固定 Windows 机器上的完整 T4 收口仍未完成；保存/CAS、兼容性、100 KiB 性能和包体已有通过证据，正式 500 KiB `press` 与进程内存仍失败。
- P0 生产窗口验证尚未完成：需要确认加载、重开、保存失败、CAS 外部冲突和回退路径；当前代码接入不等于 Gate C 已通过。

### 未验证或不要误判

- 隔离 PoC 通过不等于生产 `EditorPane` 已迁移。
- 隔离表格增量不等于 Phase 1B 或生产表格已开放。
- 旧生产 WebView2 / IME 报告是基线，不应在每轮 PoC 改动后重跑。
- 计划文件、验收文档和支持矩阵的内容不能替代真实运行证据。

## 关键决策与限制

- Milkdown + ProseMirror 是首选；只有触发停止条件才评估 Muya。
- `.md` 是唯一持久化真相源；源码模式只是高级恢复入口。
- 未触碰内容和 raw 节点必须 byte-equal；规范化只允许发生在用户明确编辑的块。
- `EditorState` / Selection / History 由 VisualEditor session 管理；`contentRevision`、`dirty`、`saveStatus` 由 App note session 唯一管理。
- 保存继续使用 flush、revision / contentHash CAS；旧版本不得覆盖磁盘，失败不得静默清 dirty。
- Private 不进入普通缓存、日志、同步、Agent 索引或普通备份；迁移快照使用专用隐藏目录。
- 生产 P0 只允许通过显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror` 启用；默认切换、P1 表格 / 图片、Popout 内存优化和 safe-source 接管继续冻结。
- Owner 手工验收实例使用 `127.0.0.1:4173`，不要关闭、重启或占用该端口；隔离探针使用独立端口。
- 工作区有大量既有 dirty 修改，不得 reset、clean 或批量格式化；只处理明确属于本任务的文件。

## 测试运行规则

新版计划的唯一测试注册表在计划第五节。简化记忆如下：

| 层级 | 用途 | 什么时候运行 |
|---|---|---|
| T0 | 快速事务、source-aware、保存 / CAS 契约 | 每次相关改动，只跑受影响集合 |
| T1 | PoC DOM / ProseMirror 命令 | UI、schema、command 变化时 |
| T2 | Tauri / WebView2 运行时冒烟 | WebView2、窗口、剪贴板或 harness 变化时 |
| T3 | 真实 OS IME，包括 1000 次 composition | Gate B、IME / Selection / History 改动、发布前 |
| T4 | 全量兼容、性能、保存故障和发布矩阵 | 阶段门或发布前 |
| T5 | Owner 主观手感 | Gate B、Beta、默认切换前 |

不要把同一输入同时放进 T0、T1、T2、T3。通过且代码、fixture、运行时未变化的层直接复用 artifact。

## 关键文件与路径

| 路径 | 状态 | 用途 |
|---|---|---|
| `C:\Projects\MKnote\docs\plans\MKnote可视化编辑器升级计划.md` | 已更新 | 当前唯一执行计划，快速推进版 |
| `C:\Projects\MKnote\docs\visual-editor-acceptance.md` | 已有 | 自动测试、实机探针和 Owner 验收证据边界 |
| `C:\Projects\MKnote\docs\visual-editor-support-matrix.md` | 已有 | Markdown 语法分类和 source-aware 支持矩阵 |
| `C:\Projects\MKnote\docs\visual-editor-benchmark-protocol.md` | 已有 | 性能基线、语料和 p95 口径 |
| `C:\Projects\MKnote\poc\visual-editor-phase1a\tests\e2e\phase1a.spec.ts` | 已有 | T1 PoC DOM 主测试 |
| `C:\Projects\MKnote\poc\visual-editor-phase1a\scripts\phase1a-webview2-e2e.mjs` | 已有 | T2 隔离 WebView2 冒烟 |
| `C:\Projects\MKnote\poc\visual-editor-phase1a\scripts\phase1a-webview2-ime-e2e.mjs` | 已有 | T3 Microsoft Pinyin 主探针 |
| `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-webview2-ime-e2e.json` | 最新报告 | 2026-08-22 真实 IME 结果 |
| `C:\Projects\MKnote-backups\MDnote-20260823-plan-before-dedup\docs\plans\MKnote可视化编辑器升级计划.md` | 备份 | 修改计划前的原版本，SHA-256 已核对 |

## 验证状态

| 验证项 | 结果 | 证据 |
|---|---|---|
| Phase 1A 合同测试 | 通过，12/12 | 已有会话记录 / `poc/visual-editor-phase1a/tests` |
| IME 探针脚本语法 | 通过 | `node --check scripts/phase1a-webview2-ime-e2e.mjs` |
| WebView2 中文 composition | 通过 | `phase1a-webview2-ime-e2e.json` |
| 候选翻页 / 标点 / 选区替换 | 通过 | 同上报告 |
| 1000 次 composition | 通过，实际 1000 | 同上报告 |
| 回车提交探针 | 输入注入 / harness 边界，待真实窗口复核 | composition 结束但没有 DOM Enter；不能据此判定编辑器缺陷 |
| English layout | `not-available`，待目标环境复核 | 当前目标输入法布局未产生预期英文文本 |
| Owner 主观手感 | 未验收 | 需要隔离窗口人工操作 |
| 生产编辑器迁移 | 未开始 | `EditorPane` 仍冻结 |

## 接手后的第一步

1. 阅读本文件和新版计划，确认不要重跑已经通过的 T0–T2 / 旧生产基线。
2. 检查 Owner 的 `4173` 隔离窗口是否仍在；只使用独立端口完成剩余探针。
3. 做一次 T5 手工验收，记录通过 / 失败，不要把人工输入再复制成新的自动化套件。
4. 复用 acceptance 中已有的 IME 回车 / English layout 初步分类；只在真实窗口或目标环境复核后更新结论，不重复同类自动输入。
5. 只运行一次受影响的 T4 性能 / 兼容收口；Gate B-P0 通过后再开始 Phase 2 P0 纵向切片。

## 建议验证命令

在执行前确认端口和工作区状态；不要重启 Owner 实例：

```powershell
git status --short
npm.cmd run build
npm.cmd --prefix poc/visual-editor-phase1a run test
npm.cmd --prefix poc/visual-editor-phase1a run build
npm.cmd --prefix poc/visual-editor-phase1a run test:e2e
cargo check --manifest-path poc/visual-editor-phase1a/src-tauri/Cargo.toml
```

仅在 Gate B 或 IME / Selection / History 代码改变时运行：

```powershell
npm.cmd --prefix poc/visual-editor-phase1a run test:webview2:ime
```

## 风险与解除条件

| 风险 | 影响 | 解除条件 |
|---|---|---|
| 重复运行输入探针 | 进度变慢、结果噪声增加 | 按 T0–T5 注册表运行，并冻结旧基线 |
| 回车 / 英文探针边界误判 | 错误修改编辑器或错误放行 Gate B | 先分类为编辑器、注入路径或环境问题 |
| Owner 手感未验收 | 无法确认“丝滑”目标 | 完成一次真实隔离窗口手工验收 |
| 生产接入过早 | 可能破坏保存和数据契约 | Gate B-P0 前保持 `EditorPane` 冻结 |
| dirty 工作区混入 | 覆盖用户已有修改 | 只改明确路径，禁止 reset / clean |

## 完成条件

本次交接在新会话完成以下结果后结束：

- Gate B-P0 有明确通过 / 未通过结论；
- 重复测试已登记并按层级运行，未删除必要历史证据；
- 当前 acceptance、support matrix、计划和 IME 报告状态一致；
- 若 Gate B-P0 通过，已开始 Phase 2 的 P0 `VisualEditorAdapter` 纵向切片；
- 生产编辑器仍可通过 feature flag 安全回退，未发生未经授权的 `.md` 格式迁移。

## 2026-08-23 收口复核

- T5 Owner 手工验收未执行：只读检查时 `127.0.0.1:4173` 无监听；本轮没有启动、重启或占用该保留端口。
- IME `real-microsoft-pinyin-commit-keys` 仍为失败：composition 已结束但没有 DOM Enter，当前先归类为 OS 输入路径边界，需在 Owner 实例中用真实手工 Enter 复核；不能直接判为编辑器缺陷。
- English layout 仍为 `not-available`：`00000409` 路径产生的文本不符合预期，先归类为当前键盘布局 / 注入环境边界，不能标记为通过。
- Node/Lute 基准已重跑，但仍只代表 Node CPU 适配器开销，不替代 WebView2 的 DOM paint、窗口内存、真实保存和包体证据；Gate B-P0 继续保持未通过。

## 2026-08-23 WebView2 基准探针收口

- 新增隔离入口：`poc/visual-editor-phase1a/scripts/phase1a-webview2-benchmark.mjs`；默认使用 `4181/9251`，每次运行隔离 WebView2、AppData、Temp 和 Cargo 目录，绝不占用 Owner 的 `4173`。
- 当前诊断报告：[phase1a-webview2-benchmark.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark.json>)；环境为 Windows build `26200`、WebView2 `151.0.4129.101`，最新 table 默认路径 build hash `727db9c50f210301a3d89f3d43f95ae8d5c3f968c5d545d49e13158af7a9a8de`。
- 本次是缩小运行（cold `0`、hot `0`、key `1`），不是协议要求的 `30/100/1000` 全量 T4：100 KiB key-to-paint 单样本 `65.3 ms`，500 KiB 在 `120000 ms` 内未观察到 input，p95 无法计算。
- 该结果首次给出真实 WebView2 大文档响应阻塞的可复核边界；T4 仍未通过，不能进入生产 `VisualEditorAdapter` 纵向切片。后续若要复测，先处理 500 KiB 输入路径，再按完整采样协议运行一次。

## 2026-08-23 WebView2 结构诊断补充

- 在保持 benchmark 输入路径不做全量 Markdown 序列化的前提下，重新执行同一缩小运行；最新 table 报告 build hash 为 `727db9c50f210301a3d89f3d43f95ae8d5c3f968c5d545d49e13158af7a9a8de`，Git HEAD 为 `bbabcbd`，Runtime 为 `151.0.4129.101`。
- 最新 table 默认路径复测（build hash `727db9c50f210301a3d89f3d43f95ae8d5c3f968c5d545d49e13158af7a9a8de`）：100 KiB 1 次 key-to-paint `65.3 ms`，input-to-paint `49.1 ms`；编辑器结构为 `1,024` 个 table、`2,048` 行、`4,096` 个单元格、`16,384` 个后代元素。
- 500 KiB：1 次输入在 `120000 ms` 内仍未观察到 input；编辑器结构为 `5,120` 个 table、`10,240` 行、`20,480` 个单元格、`81,920` 个后代元素。两档结构数量近似严格 5 倍增长，说明官方压力语料会把 ProseMirror / DOM 表格结构压力同步放大。
- 结构诊断只记录元素数量、节点类型数量和文本长度，不记录 Markdown 正文或 HTML；它证明了规模压力，但尚不能证明唯一根因是表格渲染。差分 fixture 已完成；下一步应做表格节点数量、初始化 / 布局和编辑事务的细粒度诊断，并同步记录 Node/Lute 基线；T4、Gate B-P0 和生产接入继续冻结。

## 2026-08-23 WebView2 差分 fixture 诊断

- 为区分表格节点压力与通用大文档压力，新增默认关闭的 `paragraph` 诊断 fixture；官方 `table` fixture、100/500 KiB 尺寸和 T4 协议均未改变。对照报告：[phase1a-webview2-benchmark-paragraph-diagnostic.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-paragraph-diagnostic.json>)。
- paragraph 500 KiB：1 次 key-to-paint `97.4 ms`、input-to-paint `85.7 ms`，在相同 `120000 ms` 超时配置下通过；结构为 `4,130` 个段落、`4,130` 个后代元素、`0` 个 table。
- 因此当前主要阻塞方向可从“通用大文档”收窄为“官方压力语料产生的表格化 ProseMirror / DOM 结构开销”；这仍是强相关证据，不是唯一根因证明，也不构成 1000 次 p95 通过。
- 下一步应保持官方 fixture 不变，针对表格节点数量、初始化 / 布局和编辑事务做更细粒度差分；在 T4 完整采样、T5 Owner 手感和 IME 边界结论前，生产接入继续冻结。

## 2026-08-23 WebView2 初始化与首帧 timing

- 新增 timing 报告：[table](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-timing.json>)、[paragraph](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-paragraph-timing.json>)；同一 build hash `b3f4ba8229bf9d8ad035a4baa5cf14b0975e6613115d8c4b8920cefb0b3ffd1f`、WebView2 `151.0.4129.101`。
- 官方 table 500 KiB：`createDurationMs=22873.6 ms`、`readyToFirstFrameMs=438.7 ms`、key-to-paint `362.4 ms`、input-to-paint `301.9 ms`；单样本观察到 input，但明显超过 `100 ms` 目标，不能视为通过。
- paragraph 500 KiB：`createDurationMs=538.3 ms`、`readyToFirstFrameMs=116.2 ms`、key-to-paint `94.5 ms`、input-to-paint `87.6 ms`；同样单样本，不替代 p95。
- 因此当前阻塞可进一步定位到官方 table 结构导致的编辑器初始化 / 首帧成本，并伴随编辑事务超标；此前 120 秒无 input 是更严重但非每次复现的波动观察。T4、Gate B-P0 和生产接入仍未通过。

## 2026-08-23 WebView2 单表差分诊断补充

- 已将 `single-table` fixture 的行内容补齐固定 padding，使 500 KiB 行数从约 `17,400` 调整到 `9,661`，与官方 table 的 `10,240` 行处于同一量级；官方 `table` fixture 和正式 T4 门槛未改。代码 / 测试 GREEN checkpoint：`790c4aeb96c9aae37a64df6dfca3c615d5f339e3`。
- 最新报告：[phase1a-webview2-benchmark-single-table-timing.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-single-table-timing.json>)；使用隔离 `4183/9253`，WebView2 `151.0.4129.101`，报告 build hash `067cda89fd7af2136d11046b6c2c35f70bad2b11f5446fe501ea0cee2a828017`。
- 500 KiB 单表：1 张表、`9,661` 行、`19,322` 单元格、`48,307` 个后代元素；`Editor.create=6,993.9 ms`、ready → 首帧 `281.3 ms`、key-to-paint `308.6 ms`、input-to-paint `280.6 ms`。相较官方多表的 `22,873.6 / 438.7 / 362.4 / 301.9 ms`，多表节点碎片化是重要放大因素，但单一大表仍未达到 `100 ms` 编辑目标。
- 该报告为 cold/hot `0`、key `1` 的单次诊断，不是完整 T4；报告内嵌 gitHead 为运行时的 `cf08bf3` 且 worktree dirty，随后仅将同一 fixture 修正提交为上述 checkpoint。当前结论仍是：表格化结构是强相关阻塞方向，但不是唯一根因证明；T5 Owner 手工验收、IME 回车 / English layout 边界和完整 T4 仍未完成，Gate B-P0 与生产 `EditorPane` 继续冻结。

## 2026-08-23 WebView2 GFM 表格 schema 对照诊断

- 新增默认关闭的 `no-gfm` benchmark profile；它只在显式 benchmark URL 下跳过 GFM preset，官方 `table` fixture、100/500 KiB 字节量、正式门槛和普通 PoC 默认路径均未改变。
- 报告：[phase1a-webview2-benchmark-table-no-gfm-diagnostic.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-no-gfm-diagnostic.json>)；隔离端口 `4186/9257`，WebView2 `151.0.4129.101`，build hash `5fa760c522d7fdace1a7a4347e650322a5f8bcb5924c4a7122fce09bb12233ee`。
- 500 KiB 对照结果：`Editor.create=906.2 ms`、ready → 首帧 `450.4 ms`、key-to-paint `82.9 ms`、input-to-paint `47.3 ms`；编辑器结构为 `0` 个 table、`10,240` 个 paragraph、`35,840` 个后代元素。相同官方 table fixture 的 normal 结果为 `22,873.6 ms`、`438.7 ms`、`362.4 ms`、`301.9 ms`；另有隐藏布局的下界诊断 `22,102.6 ms`、`346.7 ms`、`222.6 ms`、`201.6 ms`。
- 该差分把主要阻塞进一步定位到 GFM 表格 Markdown 解析 / 表格 schema 与节点创建；隐藏表格布局只改善次级首帧 / 编辑事务成本。`no-gfm` 不代表可交付行为，不能用来关闭正式 T4；T4 完整采样、T5、IME 边界和生产接入仍未通过。

## 2026-08-23 WebView2 表格运行时插件差分与增量修复 PoC

- 新增默认关闭的独立 benchmark profiles：`no-table-align-runtime`、`no-table-editing-runtime` 和 `incremental-table-align-runtime`。它们只在显式 benchmark URL 下生效；普通 PoC 默认仍使用完整 GFM preset，生产 `EditorPane`、保存链、feature flag 均未接入。
- 运行配置统一为官方 `table` fixture、100/500 KiB、cold `0`、hot `0`、key `1`，WebView2 `151.0.4129.101`；报告分别为：[no-table-align-runtime](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-no-table-align-runtime-diagnostic.json>)、[no-table-editing-runtime](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-no-table-editing-runtime-diagnostic.json>)、[incremental-table-align-runtime](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-incremental-table-align-runtime-diagnostic.json>)。

| 500 KiB profile | Editor.create | ready → 首帧 | key-to-paint | input-to-paint | 诊断判断 |
|---|---:|---:|---:|---:|---|
| normal（既有 timing） | 22,873.6 ms | 438.7 ms | 362.4 ms | 301.9 ms | GFM 表格初始化与事务均超标 |
| no-table-runtime | 22,866.1 ms | 613.3 ms | 114.5 ms | 67.3 ms | 运行时插件成本被移除，初始化未改善 |
| no-table-align-runtime | 34,019.6 ms | 527.1 ms | 115.6 ms | 63.7 ms | 全树 alignment 扫描是主要事务放大方向 |
| no-table-editing-runtime | 51,705.8 ms | 650.7 ms | 266.0 ms | 216.9 ms | `tableEditing` / `fixTables` 仍有显著成本，但不是主因 |
| incremental-table-align-runtime | 20,735.4 ms | 481.9 ms | 97.1 ms | 58.0 ms | 局部扫描样本低于 100 ms，仍需完整验证 |

- `incremental-table-align-runtime` 的实现见 `poc/visual-editor-phase1a/src/tableAlignmentRuntime.ts`：按 transaction mapping 收集受影响 table，只在这些 table 内复制 header alignment 到 body cells；单元测试 `3/3` 通过，增量 profile 已真实挂载并完成 benchmark。T1 默认路径在独立 `4193` 端口运行 `8/8` 通过。
- 该结果只说明“全树 alignment 扫描值得做增量化 PoC”；GFM 表格解析、schema 和 DOM 创建仍造成约 20 秒级 `Editor.create`，没有解决初始化瓶颈。所有数据都是各 1 次样本，不能代替 T4 的 `30/100/1000` p95、内存、保存阻塞和包体证据。
- 当前处理：保留增量实现为隔离诊断，不替换普通 GFM 默认插件；下一步先补充行列结构变更与 alignment command 的事务测试，再决定是否按计划只运行一次完整 T4 候选。T5 Owner 手工验收、IME 回车 / English layout 边界和 Gate B-P0 仍未完成，生产接入继续冻结。

## 2026-08-23 增量表格 WebView2 交互验证

- 按上一节建议新增可选的真实 WebView2 交互模式：设置 `MKN_PHASE1A_E2E_BENCHMARK_BYTES=102400`、`MKN_PHASE1A_E2E_EDITOR_PROFILE=incremental-table-align-runtime` 时进入 100 KiB 官方 `table` fixture；未设置时默认路径保持原有 PoC 行为。
- 首次真实运行发现并修复了 harness 导航时序问题，以及 benchmark 首张表只有 1 个 body row 的断言错误；随后真实 DOM 诊断确认 Milkdown GFM 表头行节点名为 `table_header_row`。runtime 已兼容 `table_header_row`，没有改变生产代码或默认 GFM 插件。
- TDD checkpoint：`7812d5f` 为 WebView2 增量 profile 合同 RED；`9be2d7d` 为 GFM `table_header_row` 修复 GREEN。表格 runtime 定向测试 `7/7`，harness 合同测试 `13/13`，PoC 全量合同测试 `32/32`，TypeScript/Vite build 通过。
- 真实报告：[phase1a-webview2-table-incremental-interaction.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-table-incremental-interaction.json>)；独立端口 `4195/9259`、WebView2 UA `151.0.0.0`（安装 Runtime `151.0.4129.101`），`failed=0`。交互覆盖表头居中/右对齐、body alignment 同步、插入行后 alignment 保持、插入列、删除列和删除行；报告中的 `real-os-ime` 仍明确为 `not-run`。
- 默认 GFM 回归报告：[phase1a-webview2-e2e-default-regression.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-e2e-default-regression.json>)；独立端口 `4196/9260`，`failed=0`。该结果不替代 T5 Owner 手工验收。

## 2026-08-23 T4 候选决策

- 本轮没有消耗正式 T4 的唯一运行名额。当前 benchmark 只能采集隔离 PoC 的冷启动/热挂载/key-to-paint 和结构统计，脚本明确不采集 CAS 保存阻塞、进程树内存增量或 Release ZIP 包体；计划要求的 `30/100/1000`、内存、保存阻塞和包体证据因此无法在当前入口一次性闭合。
- 已有官方 table 500 KiB 单样本仍为约 `Editor.create=22,873.6 ms`、`key-to-paint=362.4 ms`、`input-to-paint=301.9 ms`；增量 alignment 只解决事务扫描方向，不解决 GFM 表格解析/schema/节点创建的初始化瓶颈。直接运行完整采样会得到不完整且已知超标的 timing，不能关闭 T4。
- Gate B-P0 继续未通过：T5 Owner 手感、IME 回车/English layout 边界和完整 T4 仍未完成；生产 `EditorPane`、`VisualEditorAdapter`、feature flag、保存链和 CAS 继续冻结。下一次 T4 前需先补齐协议采集边界并处理 500 KiB table 初始化/编辑响应问题。

## 2026-08-23 T4 证据 manifest / collector

- 新增隔离的证据模型：[t4Evidence.ts](<C:/Projects/MKnote/tests/fixtures/visual-editor/t4Evidence.ts>)、[collect-visual-editor-t4-evidence.mjs](<C:/Projects/MKnote/scripts/collect-visual-editor-t4-evidence.mjs>) 和合同测试 [visualEditorT4Evidence.test.ts](<C:/Projects/MKnote/tests/visualEditorT4Evidence.test.ts>)。collector 只读取已有 JSON 和显式 evidence input，不启动 harness、不调用 WebView2 CDP、不占用 `4173`，也不接生产编辑器或保存链。
- 当前 manifest：[phase1a-t4-evidence-manifest.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)。最新正式采样报告为 `phase1a-webview2-benchmark-fast-gfm-formal.json`：100/500 KiB key-to-paint 分别 `207/1000`、`144/1000` 且均失败；兼容、source-aware、Selection/History/Paste 和 Release ZIP 子项已有可追溯 pass，保存/CAS 与进程内存仍缺证。因此 `gate.status=blocked`，未产生 T4 通过结论。
- 运行入口：`npm.cmd run collect:visual-editor-t4 -- --report poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-fast-gfm-formal.json --evidence poc/visual-editor-phase1a/artifacts/phase1a-t4-local-contract-evidence.json --output poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json`。collector 自身成功只表示 manifest 已生成；`--require-pass` 会在 Gate B 仍 blocked 时返回非零，供正式收口使用。
- TDD checkpoint：`2c9285c` 为 collector 合同 RED；`d0adc8a` 为最小 collector GREEN，`fd8f7f6` 补上 evidence override 校验；当前合同测试 `7/7`、collector 模块严格 TypeScript 检查、受影响 T0 契约 `34/34` 和 `npm.cmd run build` 均通过。该实现不改变生产 `EditorPane`、`VisualEditorAdapter`、feature flag、保存队列、CAS 或默认 GFM 路径。
- 下一步必须先准备同一 T4 运行的 machine-readable 输入：保存/CAS 阻塞延迟、WebView2 进程树内存增量、当前工作区 Release ZIP 与基线包体；补齐后才消耗正式 `30/100/1000` T4 唯一运行名额。T5 Owner、IME 回车/English layout 边界仍等待 Owner/目标环境，继续保持 Gate B-P0 未通过。

## 2026-08-23 Release ZIP 包体证据

- 按绿色包技能执行 `npm.cmd run build:green`，退出码为 `0`；当前工作区生成了 [MKnote-portable-v4.2.5-20260823-155512.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260823-155512.zip>)，未删除旧 ZIP。
- 明确基线为 [MKnote-portable-v4.2.5-20260822-005545.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260822-005545.zip>)；当前包 `13,633,864` bytes，基线 `13,623,928` bytes，增幅约 `0.073%`，低于 `10%`。
- [collect-visual-editor-t4-package-metrics.ps1](<C:/Projects/MKnote/scripts/collect-visual-editor-t4-package-metrics.ps1>) 当时只读取显式当前/基线 ZIP，校验当前 SHA-256 `013EB54D255319CDDCA0D44C21E674303C1EA5A5AE9F42B0D09DDE0D6A2B680C` 和 entries `MarkdownStickyNote.exe, README.txt`；这是历史采集器/metrics 快照，原始指标见 [phase1a-t4-package-metrics.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-package-metrics.json>)。
- 当时生成的 [phase1a-t4-evidence-manifest.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>) 曾将 `release-package` 标为 `pass`；新合同已证明该旧 metrics 缺少当前 Release 对齐字段，现只读重算为 `incomplete`，不能把历史结果扩大为当前 T4 或 Gate B 通过。

## 2026-08-23 key-to-paint 失败上下文收口

- 按上一轮建议，benchmark 增加了有限的失败快照：运行阶段、key index、文档可见性/焦点、active element、`contentEditable`、编辑器结构摘要、DOM 选区和 `keydown/beforeinput/input/keyup/composition` 事件计数；不记录 Markdown 正文或 HTML。
- TDD 合同：`poc/visual-editor-phase1a/tests/phase1aBenchmarkDiagnosticContract.test.mjs` 先 RED 后 GREEN，当前 `1/1`；PoC 全量合同 `40/40`，脚本 `node --check` 和 PoC build 通过。GREEN checkpoint 为 `ecaab33`。正式默认仍是 `keyInputMode=press`、`keyGapMs=16`、`keyInitialWaitMs=0`。
- [press 诊断报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-key-diagnostic-context.json>)：100 KiB `20/20` 通过（p95 `11.9 ms`）；500 KiB warmup 第 0 次失败。失败快照中页面 visible/hasFocus、编辑器 connected/`contentEditable=true`、选区均正常，但六类输入事件均为 `0`。
- [首次输入等待对照](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-key-initial-wait-1000.json>) 在首次 key 前增加 `1000 ms` 后，500 KiB 仍 `0/5`；[insert-text 对照](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-insert-text-diagnostic.json>) 仍 `0/5`。因此当前可排除单纯的首次 ready 时序、失焦/选区丢失和 `press` 键型差异；更准确的阻塞描述是大规模 GFM 表格 DOM 下的 WebView2/CDP 编辑输入响应边界，尚不能宣称唯一根因。
- 新增 [本地合同证据](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-local-contract-evidence.json>) 并重生成 [T4 manifest](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)：兼容语料 `3/3`、source-aware `6/6`、Selection/History/Paste `6/6` 和 Release ZIP 通过；正式性能 `207/1000`、`144/1000` 失败，保存/CAS 与进程内存仍 `not-run`，Gate B-P0 仍 `blocked`。
- 结论：不要把诊断档当作正式 T4，也不要修改性能门槛或开放表格生产支持；生产 `EditorPane`、`VisualEditorAdapter`、feature flag、保存链和 CAS 继续冻结。下一步是处理 500 KiB table 初始化/输入响应问题，或在获得明确替代方案前记录为 Gate B 的真实阻塞点。
## 2026-08-23 大表渲染优化候选复核

- 本轮只推进隔离 `poc/visual-editor-phase1a`，没有接入生产 `EditorPane`、保存链、feature flag 或 CAS；没有启动、重启或占用 `127.0.0.1:4173`。
- 新增的渲染候选对 `.ProseMirror` 根级表格和段落使用 `content-visibility: auto`、containment 与 intrinsic size；完整 ProseMirror DOM 仍保留，未删除 HTML marker、未缩小压力语料。
- TDD / 回归证据：渲染合同 RED checkpoint `87b8cb8`、`422f957`、`fe03c76`；实现 checkpoint `d7391aa`、`7036360`、`824e573`。PoC 合同 `41/41`，TypeScript/Vite build 通过，独立端口 `4204` 的 PoC E2E `8/8` 通过。
- 真实 WebView2 小样本 [content-visibility 诊断](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-content-visibility-diagnostic.json>) 曾在 100/500 KiB 各 `20/20` 通过，500 KiB key-to-paint p95 `60.6 ms`；但后续 100 次复测的 500 KiB warmup 为 `0/100`，失败快照仍是页面可见、焦点正常、选区在编辑器内、六类输入事件为 `0`。
- 进一步加入 containment、`preventScroll` 聚焦和 ready 后 `10,000 ms` 等待后，500 KiB warmup 仍为 `0`；因此不能把小样本通过解释为问题已解除。当前阻塞仍归类为大规模 GFM 表格 DOM 下的 WebView2/CDP 编辑输入响应边界。
- Gate B-P0 继续 `blocked`；不重跑正式 T4，不开放表格生产支持。下一步应优先研究真实 DOM 虚拟化 / 编辑器节点分段，或继续把 CDP harness 输入路径与真实 OS 输入路径分离验证；在 500 KiB 首次输入稳定前，生产纵向切片继续冻结。
## 2026-08-23 single-table 反例复核

- 同一 containment 版本的 `single-table` 诊断中，500 KiB `5/5` 通过（key-to-paint p95 `55 ms`），但 100 KiB 同次运行却 `0/5`；失败快照仍显示页面 / 焦点 / 选区正常而输入事件为 `0`。
- 因此不能把阻塞唯一归因于多表碎片化，也不能把任何一次小样本通过扩大为稳定性结论；当前更保守的描述仍是 WebView2/CDP 大 DOM 输入响应边界存在运行间波动。

## 2026-08-23 exec-command 输入边界诊断

- 按上一轮建议，仅在隔离 PoC 使用 `benchmarkEditorProfile=virtualized-blocks`、`keyInputMode=exec-command`、500 KiB/100 KiB 各 5 次 key 样本；冷启动和热挂载样本设为 0，本轮不是正式 T4。报告：[phase1a-webview2-benchmark-table-virtualized-blocks-exec-command.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-virtualized-blocks-exec-command.json>)，WebView2 `151.0.4129.101`，build hash `db75b842231fb1be2376060a253f3a68e1cfda5a1d81dd6ad34a1740ce839529`。
- 真实 WebView2 结果：100 KiB `5/5`，key-to-paint p95 `50.2 ms`、input-to-paint p95 `48.7 ms`；500 KiB `5/5`，key-to-paint p95 `508.9 ms`、input-to-paint p95 `508.0 ms`。500 KiB 仍有 `10,240` 个根级 block、`81,920` 个后代元素，但 stylesheet windowing 只让 `24` 个根级 block 可见，隐藏 `10,216` 个。
- 同一 `virtualized-blocks` profile 的 `press` 与 `insert-text` 对照仍是 500 KiB `0/5`，因此本轮把问题进一步收窄为 CDP 键盘事件路径与浏览器文本命令路径的边界；这不是生产键盘、真实 OS IME 或编辑器响应已经通过的证据。
- `execCommand("insertText")` 仅保留为诊断手段，不能作为用户输入 workaround，也不能用于关闭 T4。500 KiB p95 仍超过当前性能目标；Gate B-P0、生产 `EditorPane`、保存链、CAS 和 feature flag 继续冻结。
- 回归通过：PoC 合同 `44/44`、TypeScript/Vite build、默认编辑器路径独立端口 `4204` E2E `8/8`。本轮没有启动、重启或占用 `127.0.0.1:4173`。

### 本轮接手后的第一步

1. 不再重复 `press` / `insert-text` 的同类 CDP 小样本；将 `exec-command` 结果作为输入边界分类证据保留。
2. 若继续推进输入问题，使用真实 OS 键盘/IME 或明确的非-CDP 输入探针复核 500 KiB；在该结果稳定且延迟达标前，不进入生产 P0 纵向切片。
3. 之后才按计划补齐保存/CAS 阻塞、进程内存和完整 `30/100/1000` T4 证据，并重新评估 Gate B-P0。

## 2026-08-23 真实 OS 输入与多表 renderer 边界

- 复用了既有 Win32/Microsoft Pinyin 探针，新增 `large-editor-input` 场景：通过 `SendKeys`/`SendInput` 发送真实 OS 按键，CDP 只观察 DOM 和事件，不用 CDP 清空大文档。合同新增后，PoC 合同为 `45/45`，脚本 `node --check`、TypeScript/Vite build 通过。
- 小文档 full 复测中，composition、候选翻页、语言切换、标点、鼠标选区替换和 1000 次 composition 通过；`real-microsoft-pinyin-commit-keys` 仍失败，属于既有边界，不作为本轮大文档结论。报告：[phase1a-webview2-ime-full-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-full-rerun.json>)。
- 100 KiB `paragraph` 真实 OS 输入通过：`osInputToObservedTextMs=1312 ms`，`826` 个根 block，收到 `6` 个 input 事件；100 KiB `single-table` 也通过：`1472 ms`，仅 `1` 个根 block、`9,667` 个后代元素，收到 `6` 个 input 事件。报告分别为 [paragraph](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-paragraph-100k.json>) 和 [single-table](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-single-table-100k.json>)。
- 多表官方 `table` fixture 在 100 KiB normal、100 KiB `virtualized-blocks`、500 KiB `virtualized-blocks` 的 OS 输入后均出现 `page.evaluate: Target crashed`；最新 100 KiB 报告记录 `runtime.rendererCrashed=true`，截图仅标为 `not-available`：[table-normal-100k-clean](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-table-normal-100k-clean.json>)、[table-virtualized-500k-clean](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-table-virtualized-500k-clean.json>)。
- 100 KiB `table` + `no-table-runtime` 仍 crash，说明不能把问题单独归因于 `tableEditing/fixTables`；`no-gfm` 对照在 15 秒内没有观察到文本提交，记为未完成而不是通过。当前最强结论是：多表 GFM/表格化结构与真实 OS IME 输入存在 renderer 响应或崩溃风险；这仍不是唯一根因证明，也不是生产支持结论。
- 该结果比此前 `exec-command` 500 KiB `5/5` 更严格地暴露了真实输入边界；Gate B-P0 继续 `blocked`，生产 `EditorPane`、保存链、CAS、feature flag 和 `4173` Owner 实例继续冻结。默认路径独立端口 E2E 本轮 `8/8` 通过。

### 下一步

1. 保留当前 OS 输入失败报告，不再重复同一 profile 的无差别采样。
2. 在隔离 PoC 中做多表 fragment 数量 / 每表行数的受控 sweep，确认 renderer 风险阈值，并继续保持真实 OS 输入与 CDP 观察分离。
3. 只有 renderer 不再 crash、输入延迟稳定且保存/CAS、内存和正式 `30/100/1000` 证据补齐后，才重新评估 Gate B-P0。

## 2026-08-23 多表 fragment sweep 结构修正与失败快照

- 修正隔离 sweep 生成器：`table` fragment 与 `single-table` 使用同一固定行文本；最后一个 fragment 直接截断在最后一行，不再用空白补齐；计数 marker 放入表头单元格，避免额外生成根级空白块。100 KiB、`tableCount=1` 现在为 1 个根 block、1 张表、1,932 行、3,864 个单元格、9,665 个后代元素，输入结构与 `single-table` 可比较。
- 真实 OS 输入失败路径现在保留 pre/post DOM 快照、焦点/选区、表格规模、事件计数和 trace，并记录 `rendererCrashed` / `pageClosed`；renderer crash 与“没有 composition/input”不再混成同一种报告。
- 修正后的 `tableCount=1` normal 报告：[fixed-marker](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-table-sweep-100k-count-1-fixed-marker.json>)；同一 harness 的 `single-table` 控制报告：[control](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-single-table-100k-fixed-marker-control.json>)。
- 两个同轮报告均未 renderer crash；Microsoft Pinyin 注入只产生最后空格的普通 `keydown/beforeinput/input/keyup`，没有 `composition` 或中文提交。因此当前结果归类为 OS/IME 注入路径边界，不能再归因于 fragment DOM，也不能把它记为输入通过；此前历史 `single-table` 偶发通过仍保留为运行间波动证据。
 - PoC 合同失败数为 `0`，TypeScript/Vite build 通过；默认 E2E 已有 `8/8` 证据。Gate B-P0、生产 `EditorPane`、保存链、CAS、feature flag 和 `4173` Owner 实例继续冻结；尚未将 fragment sweep 扩大为 renderer 阈值结论。

## 2026-08-24 OS IME 焦点修复与 fragment ready 边界

- 隔离 harness 的 `sendMicrosoftPinyinContinuation` 现在会重新确认并前置目标窗口，不重新加载输入法布局，避免第二个 PowerShell 调用让 composition 只剩普通空格。TDD checkpoint：`35c1b2d` 为 RED，`69f9f3c` 为 GREEN。
- large-editor ready 等待新增 `MKN_PHASE1A_IME_READY_TIMEOUT_MS`，并写入报告 protocol；TDD checkpoint：`c98b5c9` 为 RED，`0131a9c` 为 GREEN。该配置只影响隔离探针，不改变生产编辑器。
- 100 KiB `paragraph` 真实 OS 输入通过：`osInputToObservedTextMs≈1.8s`，`compositionstart/update/end`、6 次 `beforeinput/input` 均出现，`rendererCrashed=false`。报告：[paragraph foreground](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-paragraph-100k-foreground-20260823.json>)。
- 100 KiB 官方 `table` fixture 的受控 fragment sweep 中，`tableCount=1/16/64/256/512` 均完成真实 composition，且未 renderer crash；对应报告前缀为 `phase1a-webview2-ime-table-count-{1,16,64,256,512}-100k-foreground-20260823.json`。这证明焦点修复后输入链路可跨越至少 512 个 table fragment，但不是性能门槛或 T4 证据。
- `tableCount=1024` 在显式 ready timeout `60s` 内仍未进入 `ready`，报告记录 `rendererCrashed=false`、无 OS 输入结果：[1024 ready60](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-table-count-1024-100k-ready60-foreground-20260823.json>)。当前新阻塞是大规模表格初始化/ready 响应，不应误写成 renderer crash。
- 回归：harness 合同 `18/18`、`node --check`、PoC 全量合同和 TypeScript/Vite build 通过；本轮没有占用 `127.0.0.1:4173`。Gate B-P0、T5 Owner 手感、回车/English layout、正式 T4、生产 `EditorPane`/保存链/CAS/feature flag 继续冻结。

### 接手后的第一步

1. 先对 `tableCount=1024` 做初始化阶段 timing/DOM 结构诊断；未解释 ready 阻塞前，不继续 `2048/5120` 或 500 KiB OS sweep。
2. 初始化边界明确后，再决定是否补 fragment sweep 的更高档位；随后才准备 T4 保存/CAS、内存和正式采样证据。

## 2026-08-24 T4 进程内存证据收口

### 一句话状态

隔离 Release 进程的 `10 Tab + 1 Popout` 进程树内存证据已完成且快照完整，但内存门槛失败；正式 500 KiB WebView2 输入仍失败，保存/CAS `blockingMs` 证据仍未运行，因此 Gate B-P0 继续阻塞，生产编辑器继续冻结。

### 已完成

- 新增隔离采集入口：`C:\Projects\MKnote\scripts\collect-visual-editor-t4-process-memory-ui.mjs`。它使用 `poc/visual-editor-phase1a/node_modules/playwright` 通过 CDP 连接隔离 Release 副本，不接管 `127.0.0.1:4173`。
- 采集流程先经资料库新建路径建立 Tab，再补足到弹出前 11 个 Tab，右键弹出 1 个后确认主窗口剩余 10 个 Tab；报告记录 `tabCountBeforePopout=11`、`tabCountAfterPopout=10`、`popoutPageCount=1`。baseline 与 after 各保留 `10,000 ms` 稳定窗口，避免把冷启动后台分配直接算入场景增量。
- baseline / after 均为完整进程树快照，root PID 均为 `40568`；进程数量 `7 → 8`，working set `520,478,720 → 697,335,808` bytes，增量 `176,857,088` bytes（约 `168.664 MiB`，增量比例 `33.98%`）。该结果超过 T4 的 `50 MiB` 和 `25%` 两个门槛，属于明确 `failed`，不是缺证或通过。
- 只读进程差分显示：after 新增的 `msedgewebview2.exe` 子进程 working set 为 `122,306,560` bytes；根 `md-sticky-note.exe` 仅增加约 `2.74 MiB`。它与 Popout 创建同时出现，说明主要增量来自窗口级 WebView2 进程/渲染资源；该关联是差分线索，不把单个子进程角色写成已证实的唯一根因。
- 机器可读证据：
  - `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-t4-process-memory-e2e-20260824.json`
  - `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-t4-process-memory-baseline-20260824.json`
  - `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-t4-process-memory-after-20260824.json`
  - `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-t4-process-memory-metrics-20260824.json`
- `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-t4-evidence-manifest.json` 已重生成：`process-memory=failed`、`webview2-performance-500kb=failed`、`save-cas-fault-injection=not-run`，Gate B-P0 仍为 `blocked`。

### 保存/CAS 证据边界

- `C:\Projects\MKnote\scripts\collect-visual-editor-t4-save-cas.ps1` 要求同一份报告提供 `30` 个真实 `blockingMs` 样本及 `saveFailure` / `casConflict` 证据。
- 现有 `.codex-smoke/release-smoke-save-delay-*.json` 的 `inputSave.elapsedMs` 是从输入动作到磁盘观察的端到端耗时，不能转换为 T4 的主线程序列化阻塞；因此没有伪造保存/CAS p95，manifest 继续保持 `not-run`。
- 已有保存契约和故障注入合同仍可复用，但它们只能证明保存/CAS 行为边界，不能替代 T4 的 `blockingMs` 采样。

### 当前阻塞与禁止事项

- 500 KiB 正式 WebView2 benchmark 的 key-to-paint 样本为 `0/1000`；失败快照显示页面可见、焦点和选区正常，但输入事件为 0。不要用 `no-gfm`、`execCommand` 或小样本诊断报告关闭正式门槛。
- `process-memory` 的失败结果应作为真实 Gate B 阻塞记录；不得提高内存门槛、删除失败样本或把工作集增量改写成 private bytes 结论。
- 继续冻结生产 `EditorPane`、`VisualEditorAdapter`、feature flag、生产保存链和 CAS；不关闭、重启或占用 Owner 的 `127.0.0.1:4173` 实例。

### 接手后的第一步

1. 先评估 10 Tab + 1 Popout 的内存失败是否需要降低 Tab session / WebView2 页面保留量；任何优化必须在隔离 Release 副本中重新采同一场景并保留完整快照。
2. 若没有可审计的真实 `blockingMs` 采集入口，继续把保存/CAS 标为 `not-run`，不要从旧 smoke 耗时推断 T4 通过。
3. Owner 在独立实例完成 T5 手工手感验收，并复核回车提交与 English layout 环境边界后，才重新评估 Gate B-P0。

### 2026-08-24 raw HTML comment 修复与正式 T4 重跑

- raw HTML comment 的 TDD checkpoint 已完成：`cb6979a` 为 RED，`405073e` 为 GREEN。隔离 benchmark 模式将顶层 comment 转为隐藏、可序列化的原子 block，保留原始 comment 值；生产 `EditorPane` 和默认 PoC 路径未接入该转换。
- 受影响回归：raw comment 边界测试 `3/3`、Phase 1A 合同测试通过、PoC TypeScript/Vite build 通过。该修复已提交，未混入其他 dirty worktree 修改。
- 正式报告：[phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json>)；官方 `table` fixture、normal profile、100/500 KiB、cold `30`、hot `100`、key `1000`，正式 `press` 路径，WebView2 `151.0.4129.101`。
- 100 KiB：cold p95 `16,340.9 ms`、hot p95 `343.6 ms`、key-to-paint `9.1 ms`，`1000/1000` 通过；500 KiB：cold p95 `16,460.8 ms`、hot p95 `1,342.8 ms`，但 key warmup 第 `0` 次即因未观察到 input 超时，结果为 `0/1000`，正式性能项仍失败。
- 500 KiB 结构由旧报告约 `81,920` 个后代元素降为 `66,560`，`img.ProseMirror-separator` 从 `5,120` 降为 `0`；但仍有 `5,120` 张表、`10,240` 个根级 block。该结果证明修复有效但不足以关闭正式输入门槛。
- manifest 已改用本次正式报告并重生成：[phase1a-t4-evidence-manifest.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)；`webview2-performance-500kb=failed`、`process-memory=failed`、`save-cas-fault-injection=not-run`，Gate B-P0 仍 `blocked`。

当前继续路线：停止重复同类正式采样；先针对 500 KiB 大表 DOM / WebView2 `press` 输入边界和 `10 Tab + 1 Popout` 内存失败做可审计的隔离诊断。未取得新的完整证据前，生产编辑器、保存链、CAS 和 feature flag 继续冻结。

### 2026-08-24 CDP `insert-text` 对照

- 当前 raw-comment 修复下的隔离对照报告：[phase1a-webview2-benchmark-table-insert-text-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-insert-text-raw-comment-fixed-20260824.json>)。它是 0 cold、0 hot、100/500 KiB 各 5 次 key 的诊断运行，不属于正式 T4。
- 100 KiB `insert-text` 为 `5/5`，p95 `12.8 ms`；500 KiB 为 `5/5`，p95 `44.8 ms`，input-to-paint p95 `0.2 ms`。因此 raw-comment 修复后的浏览器文本注入路径可以完成小样本编辑。
- 与正式 `press` 的 500 KiB `0/1000`、以及真实 OS composition 已通过的报告合并看，当前阻塞应描述为 WebView2/CDP `press` 物理键注入边界；这不能改写正式 T4 结果，也不能直接证明长期用户手感已经通过。

## 2026-08-24 保存/CAS T4 证据收口与官方回归入口

- 隔离 Release 保存/CAS 采集已完成：真实 `blockingMs` 样本 `30/30`，p95 为 `1.4 ms`，样本范围 `0.6–1.5 ms`，目标为 `≤50 ms`；保存失败与 CAS 冲突证据均为 `pass`。原始证据为 [samples](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-samples-20260824.json>)、[save failure](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-save-failure-20260824.json>)、[CAS conflict](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-conflict-20260824.json>) 和 [metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-metrics-20260824.json>)。
- `1.4 ms` 的语义仅是同步 Tauri bridge dispatch 阻塞窗口；它不包含 Promise、磁盘轮询或 Playwright 端到端耗时，不能写成完整保存耗时或用户感知延迟。
- T4 collector 现在支持重复传入 `--evidence`，已用本地契约、保存/CAS、进程内存和包体四份真实 artifact 重生成 [manifest](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)。当前记录为：兼容、source-aware、Selection/History/Paste、100 KiB 性能、保存/CAS 和包体 `pass`；500 KiB 性能与进程内存 `failed`；Gate B-P0 `blocked`。
- 保存/CAS 已不再是当前 manifest 的阻塞项；旧章节中生成时记录的 `save-cas-fault-injection=not-run` 只反映采样前状态，当前以本节和最新 manifest 为准。
- PoC 官方 `npm test` 已加入 `tests/phase1aRawHtmlComment.test.mjs`，raw HTML comment 三项回归与全量 Phase 1A 合同均通过。该测试入口修复不接入生产 `EditorPane`。

### 当前继续路线

1. 保留正式 500 KiB `press` `0/1000` 和 `10 Tab + 1 Popout` 内存失败，不用 `insert-text`、`execCommand` 或 `no-gfm` 对照关闭正式门槛。
2. 针对大表 DOM / WebView2 `press` 边界和窗口级 WebView2 内存保留成本做有边界的隔离诊断；任何优化都要用同一 T4 场景重新采集。
3. Owner 在独立实例完成 T5 手工验收，并复核回车提交与 English layout 边界；Gate B-P0 通过前继续冻结生产编辑器、保存链、CAS 和 feature flag。

## 2026-08-24 Gate B 阻塞静态审计

- 进程树差分显示，Popout 场景新增的 `msedgewebview2.exe` 子进程 working set 约 `116.64 MiB`；同一进程树中已有 WebView2 子进程也有增量，根进程 `md-sticky-note.exe` 仅增加约 `2.61 MiB`。这把内存问题收窄到窗口级 WebView2 资源成本，但只是差分关联，不宣称单个子进程是唯一根因。
- 主窗口的 `useTabSessions` 只是保存 Tab 的 JS 内容/历史快照；Popout 通过 Tauri `WebviewWindowBuilder` 创建独立 WebView。当前证据不足以支持“清理 Tab session 即可达标”，不直接修改生产窗口生命周期。
- `virtualized-blocks` profile 仍保留完整 ProseMirror 状态和 DOM，只用 CSS 隐藏窗口外 block；它是诊断方向，不是真正的 DOM 分段/虚拟化，也不能关闭 500 KiB 正式 `press` 失败。
- 下一轮若继续，需要在隔离 Release 中验证 WebView2 窗口保留/释放策略，或设计真正可维护的分段 node-view；两者都必须复用 `10 Tab + 1 Popout` 门槛和完整进程快照，生产 `EditorPane` 继续冻结。

## 2026-08-24 Popout 生命周期诊断完成

### 一句话状态

Popout 生命周期诊断已形成可复现的 `baseline → after → closed` 证据链：关闭 Popout 后新增的 WebView2 子进程确实退出并释放约 `101.7 MiB` working set；但 T4 门槛测量的是 Popout 打开期间的 `10 Tab + 1 Popout` 成本，因此 Gate B-P0 仍为 `blocked`，正式 T4 结果不变。

### 本轮实现与证据

- 新增显式 `--lifecycle` 模式，默认使用独立 run ID `20260824-lifecycle` 和 CDP 端口 `9246`，不会覆盖正式 `20260824` 证据，也不连接 Owner 的 `127.0.0.1:4173`。
- 生命周期模式在 after 快照后通过 `.popout-close-btn` 关闭 Popout，等待主窗口恢复 `11` 个 Tab 和稳定窗口，再采集 `closed` 快照；PowerShell collector 新增 `closed` phase 和 after→closed 进程差分。
- 本次真实 Release 运行：root PID `44736`；baseline / after / closed 快照均 `snapshotComplete=true`，进程数 `7 → 8 → 7`，主窗口 Tab `10 → 11` 已恢复。
- after→closed working set：`684,449,792 → 577,761,280` bytes，释放 `106,688,512` bytes（约 `101.7 MiB`）。释放清单包含 `1` 个 `msedgewebview2.exe`，working set `116,494,336` bytes。

机器可读证据：

- [lifecycle e2e report](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824-lifecycle.json>)
- [baseline snapshot](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-baseline-20260824-lifecycle.json>)
- [after snapshot](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-after-20260824-lifecycle.json>)
- [closed snapshot](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-closed-20260824-lifecycle.json>)
- [lifecycle metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-metrics-20260824-lifecycle.json>)

### 结论与限制

- 证据支持“Popout 打开时会增加独立窗口级 WebView2 成本，关闭后该新增子进程可以释放”；不支持把问题归因于 `TabSession`，也不证明单个 WebView2 子进程是唯一根因。
- 该诊断不进入 [phase1a-t4-evidence-manifest.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)，不改变正式 `process-memory=failed`、`webview2-performance-500kb=failed` 和 Gate B-P0 `blocked`。
- 代码 checkpoint：RED `6b12e79`，GREEN `3150d8b`。定向 T4 证据测试 `17/17`，PoC 官方合同 `56/56`，Node/PowerShell 语法检查均通过。

### 接手后的第一步

1. 以本轮生命周期证据为基线，在隔离 Release 中评估“打开期间减少/复用窗口级 WebView2 成本”的候选方案；每个候选方案必须复用 `10 Tab + 1 Popout` 和完整进程树快照。
2. 并行保留 500 KiB 正式 `press 0/1000` 失败，不用 `insert-text`、`execCommand` 或 `no-gfm` 对照关闭门槛。
3. 只有正式性能、内存、保存/CAS、T5 Owner 手感与 `30/100/1000` 证据均满足计划要求，才重新评估 Gate B-P0；生产 `EditorPane`、`VisualEditorAdapter`、feature flag、保存链和 CAS 继续冻结。

## 2026-08-24 高规模真实 OS 输入证据校正

### 事实校正

此前“`tableCount=1024` 未 ready”只适用于较早的 ready-only 运行。后续固定初始化路径的隔离报告已经证明：

- `1024` tables：真实 Microsoft Pinyin composition 通过，`osInputToObservedTextMs=1,732 ms`，`rendererCrashed=false`。
- `2048` tables：真实 composition 通过，`1,884 ms`，`rendererCrashed=false`。
- `5120` tables / `500 KiB`：真实 composition 通过，`1,822 ms`，`rendererCrashed=false`；DOM 为 `5,120` 个根级 block、`76,807` 个后代元素。
- 三个报告均观察到 `compositionstart/update/end`、`6` 次 `beforeinput/input` 和最终中文文本；编辑器保持 focus 且 `contentEditable=true`。

报告：

- [1024 fixed](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-table-count-1024-fixed-20260824.json>)
- [2048 init fixed](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-table-count-2048-init-fixed-20260824.json>)
- [5120 / 500 KiB fixed](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-table-count-5120-500k-fixed-20260824.json>)

### 证据边界

- 这些是 Win32 `SendInput`/Microsoft Pinyin 的真实 OS 输入探针，CDP 只观察 DOM 和事件；它们不是正式 T4 的 Playwright/CDP `press` `30/100/1000` 样本。
- 因此它们不能把正式 500 KiB `press=0/1000` 改写为通过，也不能修改 Gate B-P0 manifest；但它们排除了“500 KiB 大表在编辑器/DOM 层完全无法输入”的简单结论。
- 当前更精确的阻塞分类是：真实 OS 输入链路在该 fixture 上可行，而正式 CDP `press` 注入链路仍未产生 input；下一步应审计两种输入协议的差异，不再重复无差别的 1024/2048/5120 OS sweep。

### 接手后的第一步

1. 对照 `poc/visual-editor-phase1a/scripts/phase1a-webview2-benchmark.mjs` 的正式 `press` 路径与 `phase1a-webview2-ime-e2e.mjs` 的 Win32 输入路径，建立输入协议差异清单。
2. 只有证明存在 harness 层缺陷时才补 TDD 合同和局部修复；不以替换正式协议的方式关闭 T4 失败证据。
3. 继续保留 Popout open 内存失败和生命周期释放证据；生产编辑器与 Gate B-P0 继续冻结。

## 2026-08-24 CDP / OS 输入协议对照收口

### 审计结果

- 正式 benchmark 的输入协议是 Playwright/CDP `page.keyboard.press`；此前 500 KiB 正式报告为 `0/1000`，失败快照中页面可见、DOM `hasFocus=true`、编辑器 `contentEditable=true`，但 `keydown/beforeinput/input/keyup` 均为 `0`。
- 按 OS IME 探针已经使用的前台恢复方式，对隔离 benchmark 增加了 `page.bringToFront()`，并运行一次非正式单样本对照：[foreground-fix-single](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-foreground-fix-single.json>)。结果：100 KiB `1/1`，500 KiB `0/1`，事件仍为 `0`。
- 另一次临时 native `SetForegroundWindow()` 对照：[native-foreground-fix-single](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-native-foreground-fix-single.json>)，结果仍为 100 KiB `1/1`、500 KiB `0/1`；该临时 native helper 已移除，不保留无效复杂度。
- TDD 合同已覆盖正式路径在 DOM focus 前调用 `page.bringToFront()`；该动作保留为 harness 前置条件，但不被解释为 500 KiB 阻塞的修复。隔离合同定向运行 `2/2` 通过，脚本 `node --check` 通过。

### 结论边界

- 当前不能再把 500 KiB 失败归因于“只缺前台窗口 / 只缺 DOM focus”；更准确的分类是：真实 Win32/Microsoft Pinyin 输入可行，而 WebView2/CDP `press` 注入在该大规模 fixture 上仍未产生输入事件。
- 保留正式 `press=0/1000` 与真实 OS 输入通过的双重证据；不使用 `insert-text`、`execCommand`、OS 输入或 `no-gfm` 对照关闭正式 T4，也不修改性能阈值。
- 本轮没有触碰生产 `EditorPane`、保存链、CAS、feature flag 或 Owner 的 `127.0.0.1:4173`。

### 下一步

1. 停止重复同类 CDP/OS 输入样本，复用上述对照和既有高规模 OS artifact。
2. 转向独立的 `10 Tab + 1 Popout` 打开期间 WebView2 内存成本诊断；候选仍只在隔离 Release 验证。
3. Gate B-P0 继续 `blocked`，正式 500 KiB 性能和 process-memory 证据不改写。

## 2026-08-24 Tab 中间快照与 Popout 内存归因

### 运行结果

在独立 Release、CDP `9247`、run ID `20260824-tabs-diagnostic` 下完成一次中间快照诊断。三次快照使用同一 root PID `59972`，且均为完整快照：

| 阶段 | 场景 | working set | 进程数 |
|---|---|---:|---:|
| baseline | 初始窗口 | `521,617,408` bytes | `7` |
| tabs | `11 Tab`，尚未 Popout | `561,045,504` bytes | `7` |
| after | `10 Tab + 1 Popout` | `689,524,736` bytes | `8` |

- baseline → tabs：增加 `39,428,096` bytes（`37.60 MiB`、`7.56%`）。
- tabs → after：增加 `128,479,232` bytes（`122.53 MiB`）。
- baseline → after：增加 `167,907,328` bytes（`160.13 MiB`、`32.19%`），超过计划的 `50 MiB / 25%` 联合门槛。
- after 新出现一个 `msedgewebview2.exe` 子进程（PID `53796`），working set `116,887,552` bytes（`111.47 MiB`）；root `md-sticky-note.exe` 只增加约 `2.65 MiB`。

报告与指标：

- [tabs diagnostic e2e](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824-tabs-diagnostic.json>)
- [tabs metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-tabs-metrics-20260824-tabs-diagnostic.json>)
- [formal after metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-metrics-20260824-tabs-diagnostic.json>)

### 归因边界

- 11 个 Tab 的中间增量低于绝对 `50 MiB`，但不能替代正式联合场景；正式 `10 Tab + 1 Popout` 仍然失败。
- 静态代码显示 Popout 通过 Tauri `WebviewWindowBuilder` 创建独立窗口，并由 `main.tsx` 挂载独立 `PopoutView`。运行时新增 WebView2 子进程与该窗口级成本相吻合，但当前证据不宣称单个子进程是唯一根因。
- 关闭期间的释放证据仍有效：打开期间成本就是 T4 测量对象，不能因为关闭后可释放而改写 Gate B。
- 本次 tabs 诊断不写入正式 T4 manifest，不把诊断快照转为通过，不改变 `process-memory=failed`、500 KiB `press=0/1000` 或 Gate B-P0 `blocked`。

### 接续路线

1. 以本次同一场景和进程树作为隔离候选优化基线，评估能否减少 Popout 打开期间的窗口级 WebView2 成本；不直接改生产窗口生命周期。
2. 保留正式 500 KiB `press` 失败与真实 OS 输入通过的双重证据，不重复无边界输入 sweep。
3. T5 Owner 手工验收、回车提交和 English layout 分类仍需补齐；所有 Gate B-P0 条件满足前，生产 `EditorPane`、Adapter、feature flag、保存链和 CAS 继续冻结。

## 2026-08-24 Popout renderer 复用能力审计

- 当前生产 Popout 由 Rust `WebviewWindowBuilder` 创建独立 native window，前端入口按窗口 label 动态挂载 `PopoutView`；`10 Tab + 1 Popout` 进程树中新增的 `msedgewebview2.exe` 与这一结构一致。
- 本地锁定的 Wry `0.55.1` Windows 扩展提供 `with_environment` 和 `with_additional_browser_args`，前者只能共享 WebView2 environment，不能把新窗口绑定到已有 renderer；后者要求不同 browser args 使用不同 data directory，不能作为低风险内存复用开关。
- 因此当前没有可直接试验的低风险 builder 参数来消除约 `111 MiB` 的 Popout renderer；要满足 `50 MiB / 25%` 需要单 WebView / 窗口复用架构或重新审议门槛语义，均超出本轮“只修 Gate B 缺口、不改生产生命周期”的授权边界。
- 决策：保留内存失败证据，暂不修改生产 Popout；继续处理 T5 和输入环境边界，Gate B-P0 维持 `blocked`。

## 2026-08-24 T5 Owner 隔离验收入口已就绪

- 新增唯一 T5 手工记录入口：[visual-editor-t5-owner-checklist.md](<C:/Projects/MKnote/docs/visual-editor-t5-owner-checklist.md>)；测试注册表的 T5 主证据已指向该文件。Owner 结果仍为 `pending`，不能由自动化或 Agent 观察代填。
- 新增隔离启动器：[phase1a-t5-owner-launch.mjs](<C:/Projects/MKnote/poc/visual-editor-phase1a/scripts/phase1a-t5-owner-launch.mjs>)。它只启动 Phase 1A PoC，默认使用前端 `4205`、CDP `9265`、独立 WebView2/Cargo/用户数据目录，并拒绝 `4173`。
- T5 启动器合同已纳入 PoC 官方回归；当前 PoC 合同 `61/61`、TypeScript/Vite build 和 `node --check` 通过。相关 checkpoint：`557ce7d`（RED）、`69f17a4`（GREEN）、`2ef7149`（冷启动超时 RED）、`2b773e1`（冷启动预算修复 GREEN）。
- 首次运行 `t5-owner-20260824` 因隔离 Rust 冷编译超过原 `120s` 超时而失败，未进入窗口验收；启动器已将预算修正为 `300s`。第二次运行 `t5-owner-20260824-rerun` 已达到 `status=ready`，记录为 [launch.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/t5-owner/t5-owner-20260824-rerun/launch.json>)。
- 当前仍未有 Owner 手工结论；正式 500 KiB `press=0/1000` 和 `10 Tab + 1 Popout` 内存超标仍未通过。回车已初步归类为 OS 输入注入 / harness 边界，English layout 为 `not-available` 的当前环境边界，二者仍需真实窗口 / 目标环境复核。生产 `EditorPane`、Adapter、feature flag、保存链和 CAS 继续冻结。

### 接续动作

1. Owner 在当前 `ready` 隔离窗口中按 T5 清单完成一次手工验收，并填写每项 `pass` / `fail` / `not-available` / `not-run`。
2. 保留 `ownerEvidence=pending` 直到 Owner 明确写出总体结论；关闭窗口后不要删除本次运行目录。
3. 收到人工结果后，重新审计 Gate B-P0；在正式性能、内存和 T5 条件同时满足前不进入 Phase 2 生产纵向切片。

## 2026-08-24 click 聚焦稳定性复核

- 为审计正式 `press` 失败的焦点前置条件，隔离 benchmark 保留默认 `programmatic`，并新增显式 `MKN_PHASE1A_BENCHMARK_FOCUS_MODE=click` 诊断模式；该模式不属于正式 T4 协议。
- 同一 build `72de27b2…`、同一官方 `table` fixture、`press` 输入、`keyGapMs=16` 下完成 100 样本诊断：[click-focus-100](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-click-focus-100-20260824.json>)。
- 100 KiB 与 500 KiB 均只完成 `2/100`；第 `keyIndex=2` 次收到 `keydown/keyup`，但没有 `beforeinput/input`。失败时文档可见、`hasFocus=true`、编辑器 `contentEditable=true`、选区仍在编辑器内。
- 结论：真实点击聚焦不能稳定解除 WebView2/CDP `press` 输入边界；不把 click 诊断改写为正式协议，不重跑正式 `30/100/1000`，保留原正式 500 KiB `press=0/1000` 失败证据。
- 本轮回归：PoC 官方合同、TypeScript/Vite build、benchmark `node --check` 和焦点诊断合同均通过；没有触碰生产 `EditorPane`、保存链、CAS、feature flag 或 Owner 的 `4173` 窗口。

### 接续动作

1. 停止同类焦点前置的无边界重复采样；后续只在有明确协议假设和最小验证目标时继续诊断。
2. 保留正式 500 KiB 性能与 `10 Tab + 1 Popout` 内存失败，等待 Owner 完成 T5 手工记录。
3. Gate B-P0 通过前继续冻结生产 P0 纵向切片；重新评估前必须同时具备正式性能、内存和 T5 的可审计证据。

## 2026-08-24 Popout 浏览器参数隔离实验

- 进程内存采集器新增仅限隔离诊断的 `MKN_T4_PROCESS_MEMORY_BROWSER_ARGS`，默认正式运行不改变浏览器参数；TDD checkpoint 为 RED `1b36d12`、GREEN `b4a2818`。
- 同一 Release、同一 `10 Tab + 1 Popout` 场景配对结果：无额外参数增量 `147.85 MiB / 29.02%`；`--disable-gpu` 增量 `166.16 MiB / 39.41%`。两次均为完整快照、进程数 `7 → 8`，均超过 `50 MiB / 25%`。
- 两次 baseline 工作集不同，因此只排除“该开关能使场景达标”，不把 GPU 认定为唯一根因。
- 结论：`--disable-gpu` 未改善 Popout 内存成本，且两次均保留独立 WebView2 renderer；不把该参数写入生产，也不改正式 manifest。证据：[disable-gpu](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824-disable-gpu.json>)、[control-recheck](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824-control-recheck.json>)。

### 接续动作

1. 排除浏览器 GPU 参数这一隔离候选；不再重复同类参数 sweep。
2. 继续等待 Owner 在 [T5 清单](<C:/Projects/MKnote/docs/visual-editor-t5-owner-checklist.md>)完成手工验收；`4205/9265` 窗口保持不动。
3. 若要解决 process-memory，下一步需要单 WebView/窗口复用架构或重新审议门槛语义，这属于新的决策边界；正式 500 KiB `press` 和 T5 未闭合前不进入生产切片。

## 2026-08-24 Gate B-P0 范围审计

- 计划将表格、Popout、Capsule、Private 适配列为 P1，并规定 Gate B-P0 只允许进入生产 P0 纵向切片；但当前 manifest 的两个阻塞项分别是大表 500 KiB `press` 和 `10 Tab + 1 Popout` 内存。
- 这两个 artifact 的失败事实保持不变；当前只确认它们是否应继续作为 Gate B-P0 放行条件，不把范围审计写成性能通过。
- 决策路径：A 继续保守阻塞并先解决两项；B 经 Owner 确认后按 P0/P1 分层，把两项转为 Phase 1B / Gate C backlog，只接入 P0；C 先授权单 WebView/窗口复用等架构改造再重跑 T4。
- T5 Owner 结果现已明确为 `pass`；Owner 已采纳路径 B，范围决策记录为 [phase1a-gate-b-p0-scope-decision-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-gate-b-p0-scope-decision-20260824.json>)。
- 路径 B 已应用：P0 进入 Phase 2；500 KiB 大表性能与 Popout 内存保留为 Phase 1B / Gate C backlog。正式 T4 manifest 仍为 `blocked`，失败 artifact 未改写；不宣称表格或 Popout 已支持。

## 2026-08-24 Phase 2 P0 生产纵向切片启动

- 已加入根项目依赖 `@milkdown/kit@7.19.2`；已有预览路径所需的 `highlight.js@11.12.0` 也补为显式依赖，避免 npm 清理隐式模块后构建失效。
- 已实现 [visualEditorAdapter.ts](<C:/Projects/MKnote/src/visual-editor/visualEditorAdapter.ts>)：`loadMarkdown`、`getMarkdown`、`focus`、Selection、选区替换、P0 命令、Undo/Redo、订阅和销毁。
- 已实现 [VisualEditor.tsx](<C:/Projects/MKnote/src/components/VisualEditor.tsx>) 与 session 生命周期；`content`、`contentRevision`、dirty、saveStatus、CAS 仍由 App / 现有 writer 唯一管理。
- `EditorPane` 仅在 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror`、preview、非 Private、非隐私遮罩时启用；默认值和初始化失败均回退 `EditablePreviewEditor`。
- TDD checkpoint：`8fdd57b`（Adapter RED）、`48a70b4`（Adapter GREEN）、`a9cf360`（feature flag RED）、`4ecf38e`（feature flag / P0 implementation GREEN）。定向 Adapter、feature flag、session、registry 测试通过；`npm.cmd run build` 通过。

### 当前接续动作

1. 在独立窗口用显式 visual flag 验证普通笔记的加载、中文输入、列表/任务、选区替换、Undo/Redo、保存和重开。
2. 复核保存失败与 CAS 外部冲突仍由现有 App 链路处理；任何失败都保留内存内容并能切回旧编辑器。
3. P0 真实窗口证据闭合后再评估 Gate C；T4 的 500 KiB `press` 与 Popout 内存失败继续作为独立 backlog。

## 2026-08-24 T5 Owner 手工验收完成

- Owner 在隔离 `4205/9265` 窗口完成 T5 手工验收，并确认 T5-01–T5-12 全部 `pass`，包括中文 composition、空格 / 回车上屏、候选翻页、中文标点、English layout、选区替换、粘贴、连续输入和 Undo / Redo。
- 结果已记录在 [visual-editor-t5-owner-checklist.md](<C:/Projects/MKnote/docs/visual-editor-t5-owner-checklist.md>)；该结论来自 Owner 的实际鼠标、键盘和输入法操作，不是 CDP 或自动化代填。
- T5 通过只关闭 Owner 手感这一证据缺口；正式 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 进程内存超标仍保留为独立 T4 失败，正式 Gate manifest 继续为 `blocked`。
- Owner 已采纳路径 B：P0 进入 Phase 2，大表性能和 Popout 内存转入 Phase 1B / Gate C backlog；正式 T4 manifest 和失败 artifact 保持不变。

## 2026-08-24 Phase 2 P0 真实窗口回归

- 使用显式 `visual-prosemirror` 编译的 Release 副本，在新的临时数据根目录和 CDP `9271–9274` 运行；未触碰 Owner 的 `4173`、`4205/9265` 或既有 `4207` 实例。
- 新增隔离探针 [visual-editor-phase2-production-e2e.mjs](<C:/Projects/MKnote/scripts/visual-editor-phase2-production-e2e.mjs>)；最新报告：[phase2-production-e2e-20260824-visual-p0-interactions-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-visual-p0-interactions-rerun.json>)。
- 业务检查 `8/8 pass`：普通笔记加载并挂载 Milkdown visual editor、列表/任务渲染、选区替换、Undo/Redo、编辑与保存、进程重启后重开、保存失败时磁盘不写入且编辑器保留内存、CAS 外部版本保留且拒绝覆盖本地版本。
- 保存失败和 CAS 场景各产生一个预期的 WebView `pageerror`；报告已将其归类为 expected runtime errors，非预期 runtime errors 为 `0`。这不替代真实生产 IME、Tab / Private / Popout 和旧编辑器默认/初始化回退验收。
- 默认构建的 legacy smoke 已确认旧 `mknote-preview-editor` 挂载，选择替换、剪贴板、安全粘贴、保存和重开通过；旧链路 Undo 仍是已知“只撤销一个字符”问题，不归因给本次 visual 接入。
- 当前结论：Phase 2 普通笔记核心切片已部分闭合；Gate C 仍为 `pending`，正式 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败继续作为独立 backlog。

### 当前接续动作

1. 在同一隔离 Release 补齐 visual flag 下的 Tab 生命周期，以及 Private / Popout 不误启用 visual editor 的回归。
2. 保留默认 legacy 路径；补充 visual 初始化失败后的旧编辑器回退证据，不改变默认体验。
3. 复核 Private / Popout 不误启用 visual editor 且不发生数据损失，再评估 Gate C；不把本次部分切片写成 Gate C 通过。

## 2026-08-24 Phase 2 P0 生命周期与 Gate C 收口

- 新增隔离探针 [visual-editor-phase2-lifecycle-e2e.mjs](<C:/Projects/MKnote/scripts/visual-editor-phase2-lifecycle-e2e.mjs>)；最新报告：[phase2-lifecycle-e2e-20260824-gatec-window-save.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-20260824-gatec-window-save.json>)。
- 报告 `7/7 pass`、非预期运行时错误 `0`：普通 Tab 切换、Private 旧编辑器隔离与写回、Popout 旧编辑器保存/关闭回传、visual 初始化失败回退、隐藏保存和 `--quit` 退出保存均通过。
- Tab 样本为 3 个；普通 visual Tab 切换前后 marker 保留。Private 写入临时 `File/.private`，Popout 使用旧 Markdown textarea，二者都没有挂载 `mknote-visual-editor`。
- 初始化故障通过隔离 DOM 故障注入触发，父层自动替换为 `legacy-preview`，普通内容保持；该注入只作用于本次 CDP 页面，不是生产故障开关。
- 隐藏路径保持进程存活且磁盘 marker 保留；`--quit` 路径主进程 exit code 为 `0` 且 marker 保留。所有运行使用临时数据根目录和 CDP `9282–9284`，Owner 的 `4173`、`4205/9265`、`4207` 未触碰。
- 当前 Gate C 可记为 `pass`（显式 `visual-prosemirror` Beta 范围）；默认仍为 legacy，未宣称 Gate D 默认化，也未提升表格、图片或 Popout 内存支持等级。
- 正式 T4 manifest 继续为 `blocked`；500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存超标失败 artifact 保持不变，并转为 Phase 1B 性能 backlog，不影响已通过的 P0 Gate C 范围。

### 下一步

1. 进入 Phase 3 受控 Beta 评审：继续保持显式 visual flag，选择真实普通笔记样本做受控试用。
2. 单独规划表格 / 大文档性能和 Popout renderer 内存的 Phase 1B，不把它们混入已通过的 P0 Gate C 结论。
3. 在默认化前再运行一次正式 T4/T5 证据账本；当前不改正式 T4 manifest，不清理旧编辑器。

## 2026-08-24 最终窄验证与 Phase 3 入口

- T5 Owner 结论正式闭合：T5-01–T5-12 全部 `pass`，总体结果为 `pass`；这项证据来自 Owner 在隔离窗口中的实际鼠标、键盘和 Microsoft Pinyin 操作。
- 收口验证全部通过：根项目 `npm.cmd run build`、Phase 1A 合同测试、Phase 1A 构建、根项目可视化编辑器定向测试、Phase 2 探针 `node --check` 和关键 JSON 回读均为退出码 `0`。
- 当前总阶段位置：Phase 0、Phase 1A、Gate B-P0 路径 B、Phase 2 P0 和 Gate C（显式 `visual-prosemirror` Beta）已完成；现在进入 Phase 3 受控 Beta 评审。
- 仍未完成的不是 T5：正式 T4 的 500 KiB `press=0/1000` 和 `10 Tab + 1 Popout` 内存约 `168.664 MiB / 33.98%` 仍为 `failed`，继续作为 Phase 1B 性能 backlog；不得据此宣称大表性能、Popout 内存或默认化达标。
- Phase 3 继续使用显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror`，默认模式保持 `legacy-preview`；Private、Popout、表格/P1 能力和旧编辑器回退边界不扩大授权范围。

## 2026-08-24 Phase 3 迁移快照与 note switch 收口

- Phase 3 首项安全交付已完成：普通笔记首次进入 visual editor 前创建迁移快照；切换到第二篇普通 Tab 时也必须先等待该笔记快照，再串行加载内容。
- `VisualEditor` 现在使用串行加载队列和请求代次，过期 note 请求不会继续覆盖当前 note；快照或加载失败仍进入既有 visual 初始化错误回退路径。默认 `legacy-preview`、Private、Popout 和源码恢复边界未改变。
- 为隔离生命周期探针增加 `data-editor-ready` 只读就绪标记；它只表示当前 note 的 `session.loadNote` 已完成，不参与编辑或保存逻辑。
- Rust 迁移快照单测 `2/2`、迁移快照合同 `2/2`、根项目构建退出码 `0`、当前源码 visual Release `npm.cmd run tauri build -- --no-bundle` 退出码 `0`。
- 最新生命周期证据：[phase2-lifecycle-e2e-20260824-migration-snapshot-direct-ready.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-20260824-migration-snapshot-direct-ready.json>)：`status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`；7/7 业务检查通过，两个普通 Tab 生成不同迁移快照。
- 最新 P0 主回归证据：[phase2-production-e2e-20260824-migration-snapshot-p0-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-migration-snapshot-p0-rerun.json>)：全部业务检查通过，预期故障 2 个，非预期运行时错误 `0`。

### 接续动作

1. 以显式 `visual-prosemirror` 选择少量真实普通笔记进行受控 Beta 试用，并记录不含正文的结果证据。
2. 单独推进 Phase 1B：表格/大文档性能与 Popout renderer 内存；正式 T4 的 `500 KiB press=0/1000` 和 `10 Tab + 1 Popout` 内存失败不改写。
3. Gate D 默认化前继续保持 `legacy-preview`，不提前开放 P1、Private 或 Popout visual editor。

## 2026-08-24 Phase 1B 块引用首项进展

- 本轮新增 `blockquote` 命令：`VisualEditorCommand`、CommonMark command mapping 和隔离 PoC T1 场景均已落地；T0 `2/2`，T1 独立端口 `4206` `1/1`，根项目 build 和脚本语法通过。
- visual Release 探针已加入块引用保存→重开检查；使用临时唯一 identifier 与 Owner 实例隔离后，报告 `phase2-production-e2e-20260824-blockquote-isolated.json` 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`，真实 Markdown 写盘并在重启后恢复。
- 块引用 P1 单项的 T0/T1/T4 边界已通过，可记为显式 visual Beta 范围内的 `pass`；临时 identifier 配置已删除，正式 identifier Release 已恢复。默认仍为 `legacy-preview`，Private/Popout 不启用 visual editor，表格性能和 Popout 内存失败边界不变。
## 2026-08-24 Phase 1B 代码块单项收口

- 代码块最新隔离 visual Release 报告 [phase2-production-e2e-code-block-csp-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-code-block-csp-fixed-20260824.json>) 为 `status=pass`、`failed=0`，非预期运行时错误为 `0`。
- 本项覆盖代码块显示、输入、保存→重开、保存失败保留编辑器内存和 CAS 冲突边界；`CopyFeedbackIcon` 的 CSP inline style 修复由 [copyFeedbackIconContract.test.ts](<C:/Projects/MKnote/tests/copyFeedbackIconContract.test.ts>) 固定。
- 代码块只作为显式 `visual-prosemirror` Beta 的单项 P1 通过；正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败、默认 `legacy-preview` 和 Private/Popout 隔离边界不变。
- 下一个工作项：按计划审计并推进表格 / 大文档性能，不重复无边界 CDP 输入诊断，也不把局部 P1 通过写成 Phase 1B 全部完成。
## 2026-08-24 Phase 1B 表格首个纵向切片

- 生产 `VisualEditorAdapter` 新增 `insert-table` 命令，合同测试 [visualEditorTableContract.test.ts](<C:/Projects/MKnote/tests/visualEditorTableContract.test.ts>) 为 `2/2 pass`；正式 identifier 仍为 `com.sin.md-sticky-note`。
- Phase 2 隔离 Release 探针加入 `visual-table-persistence`：GFM `|2x2| ` 创建表格、当前选区输入 `Header`、保存→重开均通过。报告 [phase2-production-e2e-phase3-table-p1-rerun-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-p1-rerun-20260824.json>) 总体 `12/12 pass`，非预期运行时错误为 `0`。
- 这是表格 P1 的首个真实纵向切片，不是完整表格支持结论；行列增删、对齐、完整矩阵和 500 KiB 正式性能仍待推进，正式 T4 / 默认 `legacy-preview` 边界不变。

## 2026-08-24 表格 Tab 行事务收口

- 首次表格行追加运行已保留失败报告：表格创建和首个单元格输入通过，但生产 adapter 没有 `tableKeyboard`，末格 Tab 未追加行。
- 已补入 `goToNextCell` / `addRowAfter` 的生产插件；修复后报告 [phase2-production-e2e-phase3-table-row-append-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-row-append-fixed-20260824.json>) 为 `status=pass`、`failed=0`，重开后 `3` 行、`2` 列，非预期运行时错误为 `0`。
- 下一步是列事务、删除/对齐和正式性能边界；不把当前行事务通过写成完整表格或大文档性能通过。

## 2026-08-24 表格命令层增量

- `VisualEditorCommand` 现有 `insert-table`、`add-table-row`、`add-table-column` 三个表格命令，合同测试 `2/2 pass`；根项目和最新显式 visual Release 构建均通过。
- 最新回归报告 [phase2-production-e2e-phase3-table-commands-latest-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-commands-latest-20260824.json>) 为 `12/12 pass`，非预期运行时错误为 `0`；实测表格创建、单元格输入、末格 Tab 追加行、保存和重开。
- 仍需推进删除/对齐工具和完整表格矩阵；500 KiB 正式性能、Popout 内存、默认 `legacy-preview` 边界不变。

## 2026-08-24 表格工具栏隔离 Release 收口

- 生产表格布局已修复：`src/components/VisualEditor.css` 为 `.ProseMirror table` 设置固定布局和满宽度，为 `th/td` 保留 `7rem` 最小操作宽度。该修复只影响显式 `visual-prosemirror` visual editor，不改变默认 `legacy-preview`、Private 或 Popout 路径。
- 最新隔离端口为 `9341–9349`，Owner 的 `4173`、`4205/9265`、`4207` 未触碰。报告 [phase2-production-e2e-phase3-table-toolbar-fixed3-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-toolbar-fixed3-20260824.json>)：`status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`，预期保存失败/CAS 故障各 1 个。
- 表格场景现已真实验证创建、单元格输入、末格 Tab 追加行、添加列、删除行、删除列、居中对齐、保存、重开和对齐恢复；写盘示例保留 GFM `:----:` 居中分隔线。该结果是表格工具栏纵向切片通过，不代表完整表格矩阵或 500 KiB 性能通过。
- 相关合同集合 `48/48 pass`，根项目构建、显式 visual Release 构建和探针语法检查通过。TDD checkpoint：布局 `a279176` / `7ca8507`，探针场景 `b235b06` / `7234393`，对齐断言 `35d3c01` / `c836222`。

### 接手后的下一步

1. 继续补齐表格完整矩阵和下一项 P1 能力；保留本次表格工具栏报告作为主证据，不重复已通过的同层输入。
2. 正式 T4 的 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败继续作为独立 Phase 1B backlog，不改写 manifest。
3. 继续使用显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror` 做受控 Beta；默认化和 Gate D 条件仍未满足。

## 2026-08-24 表格三档对齐主场景通过

- 最新报告 [phase2-production-e2e-phase3-table-toolbar-alignments-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-toolbar-alignments-20260824.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`，Owner 端口仍未触碰。
- 探针在同一临时表格中依次验证左对齐、居中、右对齐，再恢复居中，随后完成添加列、删除行、删除列、保存和重开；最终 GFM 居中分隔线与 DOM 对齐状态均保留。
- 当前表格证据等级可记为：显式 visual Beta 的工具栏主场景通过；完整表格矩阵、大文档正式性能和默认化仍未完成。

## 2026-08-24 表格完整兼容矩阵通过

- 最新完整报告为 [phase2-production-table-matrix-20260824-full-001.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>)：`status=pass`、`fixtureCount=30`、`passed=30`、`failed=0`、`runtimeErrors=0`。
- 每个 fixture 均在临时数据根中完成显式 visual Release 首次加载、表格结构检查、关闭、重开和源 Markdown 保真检查；首次/重开快照一致，Owner 端口 `4173/4205/9265/4207` 未触碰，矩阵端口无残留监听。
- 探针修复保留 `domAlignments` 审计值：浏览器默认呈现的样式 `left` 在 fixture 语义为无显式对齐时归一为 `none`；显式 left/center/right 未被吞掉。TDD checkpoint：RED `681dece`，GREEN `5f65fbe`。
- 该结果将“完整表格兼容/加载/重开矩阵”提升为显式 visual Beta `pass`，但不提升正式 500 KiB 性能、Popout 内存、默认化或 Gate D 状态。

### 当前接续动作

1. 继续显式 `visual-prosemirror` 受控 Beta，推进下一项 P1 能力并保留独立主证据。
2. 将 500 KiB `press=0/1000` 和 `10 Tab + 1 Popout` 内存失败作为独立 Phase 1B backlog 处理，不改写正式 T4 manifest。
3. 默认仍为 `legacy-preview`；Gate D 的真实笔记试用、稳定周期和默认化条件尚未开始。

## 2026-08-24 Phase 3 图片 P1 单项收口

- 图片隔离 Release 已覆盖本地、图床、涂鸦、宽度、PNG Data URL 和危险源回退六类 fixture；最新报告 [phase2-production-image-persistence-20260824-classified.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-image-persistence-20260824-classified.json>) 为 `status=pass`、`passed=6`、`failed=0`、`runtimeErrors=0`。
- 危险源仍回退旧预览且源 Markdown 未改变；安全图片的正式元数据合同已在显式 `visual-prosemirror` Beta 中完成保存→重开回读。
- 探针对固定 `image-hosted` 离线 URL 的 `ERR_CONNECTION_CLOSED` 提供精确 `expectedRuntimeErrors` 分类，其他运行时错误仍保留为失败；本次重跑未触发该分类。
- 图片单项通过不改变正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败、默认 `legacy-preview`、Private/Popout 隔离或 Gate D 条件。

### 接续动作

1. 继续显式 `visual-prosemirror` 受控 Beta，推进 Wikilink / AI 选区 P1，并为每项保留独立主证据。
2. 保留正式 T4 性能与 Popout 内存失败 artifact，不用诊断输入协议替代正式门槛。
3. Gate D 前继续保持默认 `legacy-preview`，不提前开放 Private/Popout visual editor。

## 2026-08-24 Phase 3 Wikilink P1 收口

### 已完成

- Wikilink 合同测试 `tests/visualEditorWikilinkContract.test.ts`：`3/3 pass`。
- 显式 visual Release 完整报告 [phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json>)：`status=pass`、14/14 结果检查通过、`failed=0`、`unexpectedRuntimeErrors=0`。
- Wikilink 已完成渲染、别名显示、编辑、保存、重开和点击导航；目标笔记切换后仍挂载 visual editor，并显示 `目标笔记正文`。
- 根因是无缓存目标笔记进入 `applyNoteToEditor` 时默认重置为 `edit`；现已改为继承当前 `viewMode`，仅 `forceEditMode` 显式要求旧 Markdown 编辑模式。
- 显式 visual Release 构建退出码 `0`；隔离 CDP 使用 `9411–9420`，Owner `4173/4205/9265/4207` 未触碰，运行结束无监听残留。

### 当前边界与下一步

- 默认仍为 `legacy-preview`；Private、Popout 不扩大 visual 支持；正式 T4 的 500 KiB `press=0/1000` 和 Popout 内存失败继续保留。
- 下一项按计划为 AI 选区 P1；需要独立合同、显式 visual Release 主场景和持久化证据。
- AI 通过后才继续评估受控 Beta 的真实笔记试用与 Gate D；不提前默认化或清理旧链路。

## 2026-08-24 Phase 3 AI 选区 P1 收口

- AI 合同 [visualEditorAiSelectionContract.test.ts](<C:/Projects/MKnote/tests/visualEditorAiSelectionContract.test.ts>)：`2/2 pass`。
- 最新隔离 Release 的 `visual-ai-selection-and-apply` 通过：visual 页面选区进入 mock AI 请求，结果写回正确 Markdown 区间，并完成保存→重开；结果为 `selectionSent=true`、`resultApplied=true`、`saved=true`、`reopened=true`。
- 本项关闭显式 visual Beta 的 AI 选区主场景，不代表真实外部 AI 服务、Gate D 试用或默认化完成；Private/Popout 仍保持旧链路。

### 接续动作

1. 使用 [受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>) 开始真实普通笔记试用，保持默认 `legacy-preview`。
2. 继续审计 Popout/Capsule/Private 的隔离边界，不提前开放 visual 支持。
3. 保留正式 T4 的 500 KiB `press=0/1000` 与 Popout 内存失败 artifact，独立评估后续方案。

## 2026-08-24 Wikilink GREEN checkpoint 与受保护窗口审计

- Wikilink 回归合同当前为 `4/4 pass`；新增断言覆盖无缓存目标笔记导航时保持当前 `viewMode`。测试 checkpoint：`372b7c1`；实现 checkpoint：`98233c6`。
- 根项目 `npm.cmd run build` 通过；本轮未触碰 Owner 端口，未改变默认 `legacy-preview` 或 Private/Popout 隔离。
- 新增 `tests/visualEditorProtectedWindowContract.test.ts`，`1/1 pass`：Popout 保留 visual editor 接入与回退边界，Capsule 不引用 `VisualEditor`，Private/隐私遮罩继续阻断 visual 入口。
- 下一步仍是使用 [受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>) 开始真实普通笔记试用；正式 T4 性能/内存失败继续作为独立 backlog，不用新合同改写为通过。

## 2026-08-24 Popout visual P0 生命周期清理收口

- 新增 `src/utils/asyncUnlisten.ts`，统一处理 Tauri 监听注册 Promise 尚未完成时的提前 cleanup、重复 cleanup、注册失败、同步抛错和 rejected cleanup；主窗口、Popout、Capsule 和窗口 shell 监听均接入该生命周期工具。
- `tests/asyncUnlisten.test.ts` 为 `5/5 pass`；定向合同测试为 `8/8 pass`，根项目 `npm.cmd run build` 和显式 visual Release 构建通过。
- 最新显式 visual Beta 生命周期报告 [phase2-lifecycle-e2e-phase3-popout-visual-p0-20260824-named.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-phase3-popout-visual-p0-20260824-named.json>) 为 `status=pass`、7/7 通过、`runtimeErrors.unexpected=[]`；同一 Release 的 [legacy 对照报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-phase3-popout-legacy-20260824-async-catch.json>) 也为 7/7 通过。
- 本项的准确结论是：显式 visual Beta 下普通 Tab 与 Popout visual P0 生命周期、隐藏/退出保存均已通过；Popout 详情为 `visual-prosemirror`、`visualEnabled=true`、`reopenedVisual=true`，Capsule/Private 继续保持保护旧链路或回退。
- 运行使用隔离数据根目录；Owner 的 `4173`、`4205`、`4207`、`9265` 均未触碰。正式 T4 的 500 KiB `press=0/1000`、`10 Tab + 1 Popout` 内存约 `168.664 MiB / 33.98%`、默认 `legacy-preview` 和 Gate D `0/20`、`0/14` 均保持原边界。

### 当前接续动作

1. 用 [受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>) 开始真实普通笔记试用；不把自动化或 T5 代替 20 篇 / 14 天观察。
2. 保持默认 `legacy-preview`；继续维持 Private/Capsule 的保护旧链路，同时只在显式 visual Beta 中使用 Popout visual P0。
3. 独立评估正式 500 KiB `press` 性能和 Popout renderer 内存 backlog，不用本次生命周期通过覆盖 T4 失败证据。

## 2026-08-24 AI 外部请求边界收口

- `src/utils/aiApi.ts` 现在统一处理 AI completion 与模型列表请求，包含配置校验、30 秒 `AbortController` 超时、非 2xx、网络失败、非法 JSON、空/不完整响应；错误消息不记录或回显 Token。
- `tests/aiApi.test.ts`：`9/9 pass`；`tests/visualEditorAiSelectionContract.test.ts`：`2/2 pass`；根项目 `npm.cmd run build` 退出码 `0`；本轮目标文件 `git diff --check` 通过。
- 本轮只使用注入的 mock `fetch`，没有调用真实外部 AI 服务；准确结论是 AI 请求边界的本地合同已收口，不是外部服务可用性或 Gate D 通过。
- GREEN checkpoint：`32cc134`（`fix: harden AI API request boundaries`）。默认仍为 `legacy-preview`；Private/Capsule 继续保护旧链路；Gate D 仍为 `0/20` 篇、`0/14` 天。

### 当前接续动作

1. 使用[受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>)开始真实普通笔记试用，不用自动化、mock API 或 T5 代替 20 篇 / 14 天观察。
2. 继续审计 Popout/Capsule/Private 隔离边界；只在显式 visual Beta 使用 Popout visual P0。
3. 独立处理正式 500 KiB `press=0/1000` 与 Popout renderer 内存失败，不用 AI 请求合同覆盖正式 T4 失败。

## 2026-08-24 Phase 3 分割线 P1 收口

- 新增 `VisualEditorCommand` 的 `insert-divider`，映射到 Milkdown CommonMark `insertHrCommand`；visual 工具栏提供“插入分割线”入口，并为 `hr` 增加可辨识的主题样式。
- `tests/visualEditorDividerContract.test.ts` 为 `3/3 pass`；先后保留 RED checkpoint `adb7e90`、`b19a1ff`，GREEN checkpoint 为 `e7a8111`。
- 隔离 Release 主报告 [phase2-production-e2e-divider-20260824-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-divider-20260824-rerun.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`；`visual-divider-persistence` 已完成工具栏插入、Markdown 写盘、关闭、重开和 `hr` 回读。
- 本次 serializer 实际写出 `***` thematic break（同时保留既有 `<br />`），探针按 CommonMark 合法的 `---` / `***` / `___` 语义检查；Owner 端口 `4173/4205/4207/9265` 未触碰，隔离端口无残留监听。根项目 build、显式 visual Release build 和探针 `node --check` 均通过。
- 本项只关闭显式 `visual-prosemirror` Beta 的分割线 P1；默认仍为 `legacy-preview`，Gate D 仍为 `0/20` 篇、`0/14` 天，正式 T4 的 500 KiB `press=0/1000` 与 Popout 内存失败不变。

### 当前接续动作

1. 使用[受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>)开始真实普通笔记试用。
2. 继续按计划审计/推进查找替换等尚未收口的 P1 能力，并为每项保留独立合同和 Release 证据。
3. 独立处理正式 T4 性能 backlog；不以本轮分割线通过替代 Gate D 或默认化条件。

## 2026-08-24 Phase 3 查找替换 P1 收口

- `tests/visualEditorFindReplaceContract.test.ts` 定向合同为 `3/3 pass`；覆盖 Session、Adapter、ProseMirror 选区、visual 用户入口和隔离 Release 探针接线。
- 显式 `visual-prosemirror` Beta 的查找替换主场景已通过：查找下一个（含循环）、当前替换、全部替换、Markdown 写盘、关闭、重开和内容回读均完成。
- 最新隔离 Release 报告 [phase2-production-e2e-visual-find-replace-20260824-final.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-visual-find-replace-20260824-final.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`；其中 `found=true`、`replacedCurrent=true`、`replacedAll=2`、`saved=true`、`reopened=true`。
- 定向查找替换合同为 `3/3 pass`，Visual Editor 回归为 `117/117 pass`；根项目 build、显式 visual Release build 和探针语法检查均通过。RED checkpoint 为 `f7fc78b`，GREEN checkpoint 为 `02b0345`；本轮隔离端口为 `9431–9443`，Owner 端口 `4173/4205/4207/9265` 未触碰且无残留监听。
- 本项只关闭显式 `visual-prosemirror` Beta 的查找替换 P1；默认仍为 `legacy-preview`，Private/Capsule 继续保持保护旧链路，Gate D 仍为 `0/20` 篇、`0/14` 天，正式 T4 的 500 KiB `press=0/1000` 与 Popout 内存失败不变。

### 当前接续动作

1. 使用[受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>)开始真实普通笔记试用，不用自动化或 T5 替代 20 篇 / 14 天观察。
2. 继续审计受保护窗口边界，并保持仅在显式 visual Beta 中使用 Popout visual P0。
3. 独立处理正式 T4 的 500 KiB 输入性能和 Popout renderer 内存 backlog，不改写正式 manifest。

## 2026-08-24 正式 T4 backlog 复核

- 最新正式 benchmark [phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json>) 的 100 KiB `press` 为 `1000/1000`、p95 `9.1 ms`；500 KiB 的 cold `30/30`、hot `100/100` 已完成，但正式 `press` 仍为 `0/1000`，首个样本没有收到 `keydown` / `beforeinput` / `input` / `keyup`。
- 同一修正版隔离构建的真实 OS/IME 500 KiB 报告 [phase1a-webview2-ime-large-editor-table-500k-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-table-500k-raw-comment-fixed-20260824.json>) 观察到中文输入、文本增长和 `rendererCrashed=false`，耗时 `1742 ms`；这是单次真实 OS 输入证据，不替代正式 `press` 协议，也不足以关闭 `<100 ms` 的正式性能门槛。
- Popout 进程树报告 [phase1a-t4-process-memory-e2e-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824.json>) 快照完整且 root PID 未变：`520,478,720 → 697,335,808` bytes，`10 Tab + 1 Popout` 增量约 `168.664 MiB / 33.98%`，进程数 `7 → 8`。当前实现由独立 `WebviewWindowBuilder` 创建 Popout，并观察到新增 WebView2 renderer；本轮没有安全的局部修复可以在不改变窗口语义下满足 `50 MiB / 25%` 门槛。
- 准确结论：正式 T4 仍为 `blocked`，以上两项 artifact 和 manifest 原结论保留；不把 OS/IME 单次通过改写为正式性能通过，也不通过改变输入协议或复用窗口语义来“凑绿”。下一条可执行主线转为 Gate D 真实普通笔记试用准备。

### 当前接续动作

1. 保持 `docs/visual-editor-beta-trial-log.md` 的 `0/20`、`0/14` 和 `pending`，等待真实普通笔记操作后再记录。
2. 正式 T4 性能与 Popout 内存继续作为独立 backlog，除非有新的架构/门槛决策，不重复同类 CDP 诊断。

## 2026-08-24 显式 Beta Release 隔离启动与运行冒烟

- 复核发现当前默认 `src-tauri/target/release/md-sticky-note.exe` 的嵌入前端实际为 `legacy-preview`；不能把它直接当作 visual Beta。为保持默认工件不变，先备份原 Release 与 `dist`，使用 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror npm.cmd run tauri build` 构建 Beta，复制 Beta EXE 后恢复原 Release SHA-256 `B86A4E5F…8FAC00` 和 `dist` 的 `legacy-preview`。
- [隔离运行冒烟证据](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-visual-beta-runtime-smoke-20260824.json>) 为 `status=pass`：Beta EXE SHA-256 为 `570DDA439AC4AA85CCB75E9C0748D22BF5F3117341E19F60CCB56C541B463EB3`，运行根目录为临时 `App`，CDP `9421`，Owner 端口未触碰。
- 隔离窗口从编辑模式切换到预览后，`mknote-visual-editor` 挂载且 `data-editor-ready=true`，工具栏和一个 `contentEditable` 存在，页面/控制台非预期错误为 `0`；合成笔记写入后磁盘回读包含 runtime marker。

## 2026-08-25 AI 真实 completion 主动验证入口

- 新增 `testAiConnection`：先验证 `/models`，再使用固定 `Reply with exactly OK.` 请求 `/chat/completions`；不把用户选区、笔记正文或 completion 响应写入日志或配置。
- AI 配置面板的 Test 按钮已切换到该入口；若未填写模型，使用排序后的第一个发现模型，并在面板中显示实际测试模型。
- TDD checkpoint：RED `c409c4c`（测试缺失能力），GREEN `2ddfe9b`（最小实现）；AI API、连接测试和 AI 选区合同合计 `15/15 pass`，根项目 build 退出码 `0`。
- 本轮没有调用真实 Token；准确结论是 Owner 现在具备验证真实 completion 服务的安全入口，真实外部 AI 仍为 `pending`。默认仍为 `legacy-preview`，Gate D 仍为 `0/20`、`0/14`，正式 T4 两项失败保持原边界。

### 当前接续动作

1. Owner 在显式 visual Beta 的 AI 配置中输入真实服务配置并点击 Test；只记录连接结果和匿名模型信息，不记录 Token、正文或响应内容。
2. 继续使用受控 Beta 试用记录完成真实普通笔记 `20/20`、`14/14` 观察；不以本次连接合同替代 Gate D。
- 本轮只证明“显式 visual Beta Release 可安全启动、挂载和写盘”；合成笔记不计入 Gate D，也不改变 Gate D `0/20`、`0/14`、正式 T4 两项失败或默认 `legacy-preview`。

### 当前接续动作

1. 保持隔离 Beta 窗口可供 Owner 查看；真实普通笔记试用仍需 Owner 实际操作并按记录表填写，不能用本轮合成笔记代填。
2. 继续保持默认 Release、Private/Capsule 旧链路和正式 T4 失败边界不变。

## 2026-08-25 Popout renderer 加载边界优化

- Popout visual 模式原先静态导入 `EditablePreviewEditor`，会把 legacy preview/Lute 链路带入 Popout renderer；现已改为按 legacy 分支 `lazy` 加载，visual 分支不再静态加载该链路。
- 新增合同 `tests/visualEditorPopoutLoadingContract.test.ts`，RED checkpoint 为 `fa190c4`，GREEN checkpoint 为 `22daa61`；visual/AI 合同回归和根项目构建均通过。
- 这只证明加载边界优化，不等于正式 T4 内存门槛通过；未改变 Popout 独立窗口、visual 语义、保存链、默认 `legacy-preview`、Private/Capsule 保护或 Gate D `0/20`、`0/14`。

### 当前接续动作

1. 已完成一次按需加载后的受控 Beta 内存对照采样；结果有改善但仍未达到正式 T4 门槛，详见下一节。
2. Owner 继续完成真实 AI Test 与 Gate D 普通笔记 `20/20`、`14/14` 试用；自动化合同不能替代这两项验收。

## 2026-08-25 Popout 按需加载后的受控内存复测

- 采样报告：[phase1a-t4-process-memory-e2e-20260825-popout-lazy-unique2.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260825-popout-lazy-unique2.json>)；场景为 `10 Tab + 1 Popout`，根 PID 未变，快照完整。
- 总 working set 从 `497,827,840` bytes 增至 `631,840,768` bytes，增量为 `134,012,928` bytes，即 `127.805 MiB / 26.92%`。关闭 Popout 后降至 `557,998,080` bytes，释放约 `70.422 MiB`；进程数从 `7 → 8 → 7`，新增 renderer 确实退出。
- 这证明 Popout visual 按需加载优化带来可测改善，但仍超过计划门槛 `50 MiB / 25%`；因此该结果记为“改善但 failed”，不写入正式 T4 manifest 的通过结论，也不改变 `process-memory=failed`、500 KiB `press=0/1000` 或 Gate B-P0 的历史失败证据。
- 该采样使用独立 Beta target、临时数据根和 CDP `9456`，没有触碰 Owner 的 `4173`、`4205/4207`、`9265`；报告保留用于前后对照。

### 当前接续动作

1. 保持正式 T4 manifest、门槛和窗口语义不变；不重复同类 CDP 诊断。
2. Owner 在隔离 visual Beta 中开始真实普通笔记试用，并按 [visual-editor-beta-trial-log.md](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>) 记录 `20/20` 篇、`14/14` 天；同时用真实配置点击 AI Test。
3. Popout renderer 内存与 500 KiB 正式输入继续作为独立性能 backlog；若要达到门槛，需要新的架构或门槛决策，不能由本次加载边界优化直接关闭。

## 2026-08-25 主窗口 EditorPane 按需加载收口

- `src/components/compact/EditorPane.tsx` 不再静态导入 `VisualEditor`；visual 分支改为 `lazy(() => import("../VisualEditor"))`，visual/legacy 两个分支统一位于 `Suspense` 边界内。
- 合同测试 [visualEditorEditorPaneLoadingContract.test.ts](<C:/Projects/MKnote/tests/visualEditorEditorPaneLoadingContract.test.ts>) 先 RED（`67da53d`），再由 `dedb870` 完成 GREEN；当前主窗口 loading/flag/受保护窗口/迁移快照定向合同回归退出码为 `0`。
- `npm.cmd run build` 当前退出码为 `0`，构建产物保留独立 `VisualEditor` chunk；默认 `legacy-preview`、Private/Capsule 保护链路、保存/CAS 语义和 Gate D/T4 边界均未改变。

### 当前接续动作

1. 保持显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror` 受控 Beta，等待 Owner 真实 AI Test 和 Gate D `20/20`、`14/14` 记录。
2. 正式 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存失败继续作为独立 backlog；没有新的架构或门槛决策前不重复同类诊断。

## 2026-08-25 VisualEditor lazy chunk 失败回退收口

- 发现按需加载新增的错误路径：`VisualEditor` 动态 chunk 在导入或渲染阶段失败时，不会触发组件已经挂载后的 `onError`。
- 按 TDD 增加回归合同：RED `f703cf3`；实现 GREEN `5c69034`。`VisualEditorErrorBoundary` 只包住 visual 分支，捕获 lazy 导入/渲染异常后设置 `visualEditorFailed`，父层切换到既有 `EditablePreviewEditor`。
- 合同为 `3/3 pass`；根项目 build 和完整 `visualEditor*.test.ts` 回归均退出码 `0`。默认 `legacy-preview`、Private/Capsule、保存/CAS、正式 T4 和 Gate D 边界未改变。

### 当前接续动作

1. Owner 在隔离 Beta 中完成真实 AI Test，并开始 Gate D `20/20`、`14/14` 记录。
2. 正式 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存失败仍等待架构或门槛决策，不用本次回退能力改写失败证据。

## 2026-08-25 Popout lazy chunk 失败回退收口

- 发现 Popout 的 `VisualEditor` 按需加载也存在同一导入失败边界：动态 chunk 在 `Suspense` 期间 rejected 时，原有组件 `onError` 不会运行，可能无法回到旧编辑器。
- 新增 `src/components/VisualEditorErrorBoundary.tsx`，在 Popout visual 分支外层捕获 lazy 导入/渲染异常，并通过既有 `visualEditorFailed` 状态切换到 `EditablePreviewEditor`；不改变 Popout 保存链、独立窗口语义、默认 `legacy-preview` 或 Private/Capsule 保护。
- TDD checkpoint：RED `b7a838b`，GREEN `421181c`。`tests/visualEditorPopoutLoadingContract.test.ts` 回退合同通过；完整 `visualEditor*.test.ts` 为 `119/119 pass`，根项目 `npm.cmd run build` 退出码为 `0`，构建仍保留独立 `VisualEditor` chunk。

### 当前接续动作

1. 继续等待 Owner 完成真实外部 AI Test 与 Gate D 普通笔记 `20/20`、`14/14` 观察；本轮自动化不计入 Gate D。
2. 正式 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存失败继续作为独立 backlog；不因 lazy 回退通过而改写失败结论。

## 2026-08-25 初始加载去重与版本边界收口

- 为修复 `800ba7e` 中意外依赖用户 dirty Wikilink wiring 的问题，先以 TDD 增加版本边界合同：RED checkpoint `63437b6`；GREEN checkpoint `bc4744b`。版本化 `VisualEditor` 现在调用 `createMilkdownVisualEditorAdapter(root, latestInputsRef.current.content)`，不再在 HEAD 中引用未定义的 `onWikilinkNavigateRef`。
- 主工作区原有 Wikilink/migration dirty 内容没有被 reset、clean、覆盖或提交；因此当前 dirty 工作区仍可保留该 wiring，HEAD 与用户未提交内容的边界已明确分开。
- 最新验证：初始加载合同 `3/3 pass`；完整 `visualEditor*.test.ts` 回归 `122/122 pass`；根项目 `npm.cmd run build` 退出码为 `0`；构建仍保留独立 `VisualEditor` chunk。
- 500 KiB 受控对照报告 [phase1a-webview2-benchmark-table-initial-load-dedup-20260825.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-initial-load-dedup-20260825.json>) 已结束：`512000B` 的 `coldStart`/`hotReload` 按配置未运行，`keyToPaint` 为 `0/1`，首个样本没有收到键盘或输入事件；进程退出码为 `1`。这只是诊断结果，不替代正式 T4，也不改写 `press=0/1000` 失败。
- 在不带用户 dirty 改动的隔离 HEAD 上执行全量 build，仍会暴露此前未进入 HEAD 的跨文件业务变更（如 `CompactHeader`、`PopoutView`、`VisualEditor` 等）的基线差异；因此本轮只关闭“本轮提交引入的 Wikilink ref 隐式依赖”，没有宣称整个 clean checkout 已经可构建。
- 本轮不改变默认 `legacy-preview`、Private/Capsule 保护、Gate D `0/20`、`0/14`、真实外部 AI `pending` 或正式 T4 的两项失败；验收和支持矩阵没有新的能力升级。

### 当前接续动作

1. Owner 在隔离 visual Beta 中完成真实外部 AI Test，并按记录表推进 Gate D 普通笔记 `20/20` 篇、`14/14` 天。
2. 正式 T4 的 500 KiB 输入和 Popout renderer 内存继续等待新的架构或门槛决策，不重复同类 CDP 诊断。
3. 若后续需要 clean checkout 全量构建证据，先由用户明确归属并受控收口当前跨文件 dirty 改动；本轮不替代这些用户改动。

## 2026-08-25 大文档性能候选审计（不进入正式 T4）

- 已复核现有隔离 POC 候选，不把任何诊断 profile 直接提升为生产实现：fast-GFM 报告的 500 KiB `Editor.create` 约 `1344.5 ms`，但 `keyToPaint` 仅 `144/1000`；失败样本仍存在。
- `virtualized-blocks` 只通过 CSS 隐藏部分直接块，不能减少 ProseMirror 文档状态、解析或初始节点成本；stylesheet 诊断虽观察到可见块数约 `24`，正式 `press` 仍未形成通过证据。`exec-command` 的少量通过样本属于诊断输入协议，不能替代正式 `press`。
- `no-gfm` 诊断可以改善结构与单次输入，但同时移除 GFM 表格语义，不能作为普通编辑器路径；该结果不具备产品兼容性证据。
- 准确结论：当前没有一个候选同时满足“保留表格 Markdown 兼容、保持真实可编辑语义、通过正式 `press` 采样、满足 `<100 ms` 门槛”。因此本轮不把虚拟化 CSS、fast-GFM 或 no-GFM 写入生产，不修改正式 T4 manifest、门槛或支持矩阵。

### 当前接续动作

1. 若继续追求严格 T4，需要新的生产级文档渲染/节点虚拟化架构方案，并重新设计可审计的 Selection、IME、Undo/Redo 和 Markdown round-trip 证据。
2. 若保留当前独立 Popout 窗口语义，内存门槛仍需架构级方案；若调整门槛，必须由 Owner/项目决策明确批准，不能由 Agent 单方面改写。
3. Gate D 真实普通笔记和真实外部 AI Test 仍由 Owner 在隔离 Beta 中完成；自动化和这些诊断 profile 均不计入 Gate D。

## 2026-08-25 Gate D 运行前只读复核

- 现有隔离 Beta 进程仍在运行，CDP `9421` 页面可访问；只读检查得到 `data-editor-ready=true`、可编辑区域存在、初始化错误节点数量为 `0`。
- 本次检查没有读取笔记正文，没有执行编辑、保存或 AI 请求，且明确不计入 Gate D；试用记录继续保持 `0/20`、`0/14`、`pending`。
- 这确认的是“Owner 可以开始真实试用”的运行准备，不是普通笔记稳定性、真实外部 AI 或默认化证据。

## 2026-08-25 表格 P1 当前合同复核

- 本轮重新执行表格相关合同集合：`node --test --test-isolation=none tests/visualEditorTableContract.test.ts tests/visualEditorTableMatrix.test.ts tests/visualEditorTableE2EContract.test.ts tests/visualEditorTableMatrixE2EContract.test.ts`，结果为 `16/16 pass`、`failed=0`、退出码 `0`。
- 既有显式 visual Release 表格矩阵 [phase2-production-table-matrix-20260824-full-001.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>) 保持 `status=pass`、`fixtureCount=30`、`passed=30`、`failed=0`、`runtimeErrors=0`；覆盖表格命令、结构加载、关闭、重开和源 Markdown 保真检查。
- 准确结论：表格 P1 的当前合同和 30 例兼容/加载/重开矩阵证据保持通过；这不等于完整编辑组合穷举，也不关闭正式 T4 的 500 KiB `press=0/1000`、Popout 内存门槛失败、Gate D 或默认化条件。

### 当前接续动作

1. Owner 在隔离 visual Beta 中使用真实普通笔记完成真实外部 AI Test，并按记录表推进 Gate D `20/20` 篇、`14/14` 天；本次自动化合同不计入试用记录。
2. 保持默认 `legacy-preview`、Private/Capsule 保护旧链路和 Popout visual 仅显式 Beta 可用的边界。
3. 正式 T4 的 500 KiB 输入与 Popout renderer 内存继续作为独立性能 backlog；没有新的架构或门槛决策前不重复同类诊断。

## 2026-08-25 Phase 4 绿色包当前工件预审

- 只读核验了 T4 包体指标引用的 [MKnote-portable-v4.2.5-20260823-155512.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260823-155512.zip>)：ZIP 结构正确，仅包含 `MarkdownStickyNote.exe` 和 `README.txt`；历史包内 EXE SHA-256 为 `A35C88F2…FDD272D`。
- 当前 Release `src-tauri/target/release/md-sticky-note.exe` SHA-256 为 `B86A4E5F…8FAC00`，修改时间为 `2026-08-24 22:13:32`；当前 `dist/index.html` 的修改时间为 `2026-08-25 02:40:46`，旧 ZIP 修改时间为 `2026-08-23 15:55:15`。当前 Release EXE 也早于前端构建，不能作为本次源码的完整发布物。
- 准确结论：旧 ZIP 的包体子项历史证据仍可保留，但不能作为当前代码的 Phase 4 发布包；本轮没有重新打包、覆盖或删除任何包体。待正式发布窗口授权后，需重新执行 `npm.cmd run build:green`，再按绿色包规范核验版本、时间、entries、hash 和实机验收。

### 当前接续动作

1. 保持默认 `legacy-preview`、Gate D `0/20` / `0/14` 和真实外部 AI `pending`。
2. 在 Gate D 和正式发布授权前，不把旧 ZIP 交付为当前版本，也不启动 Phase 4 旧链路清理。

## 2026-08-25 新绿色包静态证据与实机冒烟边界

- 已按项目绿色包流程执行 `npm.cmd run build:green`，生成 [MKnote-portable-v4.2.5-20260825-035047.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260825-035047.zip>)。
- 静态核验通过：版本 `4.2.5`；ZIP 大小 `13,771,154` bytes，相对基线增幅约 `1.0806%`；entries 严格为 `MarkdownStickyNote.exe`、`README.txt`；路径穿越项 `0`；ZIP SHA-256 为 `B6F5797D68AC5A719FE4828D7E5AE2403F09AF54F2EDE0FE31E56A9FD4EED129`。
- 包内 EXE、`src-tauri/target/release/md-sticky-note.exe` 和 `portable/MarkdownStickyNote.exe` 的 SHA-256 均为 `AE05E1A6215221B38BDA525C7E39CF93DCC6B27B90CE5C4B400B1271F730CCE9`；Release EXE 修改时间 `2026-08-25 03:50:45`，晚于 `dist/index.html` 的 `2026-08-25 03:47:35`。
- 新包指标已记录在 [phase1a-t4-package-metrics-20260825-green.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-package-metrics-20260825-green.json>)；候选 manifest [phase1a-t4-evidence-manifest-candidate-20260825-package.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest-candidate-20260825-package.json>) 将 `release-package` 标为 `pass`，但 `webview2-performance-500kb` 和 `process-memory` 仍为 `failed`，所以 Gate B-P0 仍为 `blocked`。候选 manifest 尚未覆盖正式 manifest。
- 实机启动冒烟尚未宣称通过：当前仍有旧的隔离 Beta `md-sticky-note.exe`（PID `44564`）运行，应用启用了 `tauri_plugin_single_instance`；本轮未结束它、未读取其笔记正文、未执行输入/保存/AI 操作。当前 Owner 端口 `4173/4205/4207/9265` 均无监听。
- Gate D 仍为真实外部 AI `pending`、普通笔记 `0/20`、连续观察 `0/14`；默认仍为 `legacy-preview`，Private/Capsule 保护旧链路，正式 T4 两项性能失败边界不变。

### 当前接续动作

1. 待现有隔离 Beta 窗口由 Owner/用户关闭后，使用与新 ZIP hash 对齐的当前 Release 执行 `npm.cmd run smoke:release:input`，把运行时结果单独记录为实机证据。
2. 若冒烟通过，再补充正式交接/验收文档的运行时证据；不把静态包体 `pass` 扩大为完整 T4 或 Gate B-P0 通过。
3. Owner 继续完成真实外部 AI Test 与 Gate D 普通笔记 `20/20` 篇、`14/14` 天观察。

## 2026-08-25 Release smoke 单实例前置保护

- 为避免已有应用通过 `tauri_plugin_single_instance` 接管测试请求，`scripts/smoke-release.ps1` 现在在创建 sandbox、复制 EXE 和启动应用前检查 `md-sticky-note` / `MarkdownStickyNote` 进程；发现已有进程时立即抛出明确错误，不发送 `--show`、输入或退出请求。
- TDD：先新增合同并得到 RED（`6/7 pass`、新增断言失败），再加入最小 guard；GREEN 为 `tests/visualEditorSmokeContract.test.ts` `7/7 pass`，PowerShell AST `errorCount=0`。
- 使用当前 PID `44564` 做真实前置验证，脚本以退出码 `1` 返回 `Existing MKnote process detected`，未启动新 Release、未读取笔记正文；因此当前实机冒烟仍为 `pending`，待 Owner/用户关闭旧隔离 Beta 后再执行。

## 2026-08-25 新绿色包 Release 实机冒烟通过

- 旧隔离 Beta 关闭后执行 `npm.cmd run smoke:release:input`，退出码为 `0`；脚本使用临时 AppData、临时 AppRoot 和临时默认笔记，不读取或写入用户真实笔记目录。
- machine-readable 结果为 [.codex-smoke/release-smoke-main.json](<C:/Projects/MKnote/.codex-smoke/release-smoke-main.json>)：窗口 `1162x973`，输入 marker 成功写入临时 `File/default/default-note.md`，`elapsedMs=2722`，冒烟后 MKnote 进程已退出。
- 截图 [release-smoke-main.png](<C:/Projects/MKnote/.codex-smoke/release-smoke-main.png>) 已人工确认窗口真实渲染，编辑区显示 smoke marker，底部状态为“本地 · 已保存”；亮度范围 `238`。
- 当前 Release EXE hash `AE05E1A6215221B38BDA525C7E39CF93DCC6B27B90CE5C4B400B1271F730CCE9` 与新 ZIP/portable EXE 保持一致。因此 Phase 4 的“当前包静态身份 + Release 基线启动/输入/保存冒烟”证据已闭合。
- 该冒烟使用默认 Release 路径，不等于显式 `visual-prosemirror` Beta 或正式 T4 500 KiB / Popout 性能通过；这些严格性能失败边界保持不变。当前 Gate D 结论以本文件下方的 Owner 简化决策快照为准。

## 2026-08-25 Owner 简化 Gate D 决策快照

- Owner 明确确认真实外部 AI Test `pass`，20 篇真实普通笔记 `20/20 pass`，未发现问题。
- Gate D 采用简化范围：AI Test + 20 篇普通笔记 + Owner 确认即可；14 天连续观察改为可选，本次 `optional / not-run` 不阻塞 Gate D。
- 严格 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存超正式门槛仍记为 `failed`，不改写历史 artifact；在当前范围内作为非阻塞已知限制，实际遇到问题后再处理。
- 默认模式仍为 `legacy-preview`，旧编辑器回退链路继续保留；本次 Gate D 通过不自动执行默认切换或旧链路清理。
- 后续如需默认化，只需另行确认默认切换、绿色包版本和发布验收范围；不要求 Owner 补做 14 天观察。

## 2026-08-26 v5.0.0 Release 收口

- 当前版本统一为 `5.0.0`，同步更新 `package.json`、`package-lock.json`、Tauri 配置和 Rust crate 元数据。
- Owner 已确认 Visual Editor 完整人工测试清单全部通过，包括工具栏、任务/嵌套列表、标题、代码块、撤销、回车换行、Popout 保存/重开以及 Private/Capsule 保护边界。
- Owner 已确认本轮预览工具条与资料库交互全部通过：工具条移除重复的分割线/表格按钮，表格行列操作与对齐使用图形化图标且添加行/列图标已纠正；资料库支持失焦关闭、笔记单击以主界面 Lab 打开并关闭资料库，右侧支持 Lab / 便签打开。合同测试 `tests/libraryAndPreviewInteractionContract.test.ts` 为 `4/4 pass`。
- 已执行 `npm.cmd run build:green` 并生成 [MKnote-portable-v5.0.0-20260826-174751.zip](<C:/Projects/MKnote/MKnote-portable-v5.0.0-20260826-174751.zip>)；ZIP 仅含 `MarkdownStickyNote.exe` 与 `README.txt`。
- ZIP SHA-256：`BC7C3E603CBB318DF59CCAA82453A0710E53E6D25CCD982648E26D41D1FAA480`；Release、portable 与 ZIP 内 EXE SHA-256 均为 `C22C8D4AAFE67FA96560DA3D5AE3499A9EA48C997021971DDC8E83C9673DB5A9`。
- `npm.cmd run smoke:release:input` 退出码为 `0`；输入 marker 写入临时隔离 sandbox，未触碰用户真实笔记目录。
- 500 KiB 性能、Popout 内存和 14 天观察仍按 Owner 决策保留为非阻塞边界；安全源码回退及 Private/Capsule 保护链路不扩大。

## 2026-08-26 主窗口拖动后的中文输入法候选框修复

- 问题范围：主窗口编辑中用鼠标拖动窗口，返回编辑区输入中文时，中文输入法候选框定位/显示异常。
- 修复内容：移除主窗口重复的 Tauri 原生拖动声明，保留 React `startDragging()`；窗口停止移动约 160ms 后，对拖动前聚焦的编辑器执行 `blur → requestAnimationFrame → focus({ preventScroll: true })`，刷新 WebView2 的 IME 锚点。
- 定向回归合同 `tests/windowMoveImeContract.test.ts` 已通过；修复提交为 `7e47616`，回归覆盖提交为 `1df9832`。
- Owner 已在真实实例中确认：拖动主窗口后回编辑区输入中文，候选框恢复正常；该结论只覆盖主窗口本次场景，不扩展为 Popout 或其他窗口的重新验收。
