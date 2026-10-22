# MKnote 可视化编辑器 Markdown 支持矩阵

> 基线版本：2026-08-21；2026-08-26 更新当前状态。本文区分历史隔离 PoC、显式 feature flag 证据、当前默认源码路径和受保护旧链路；历史段落保留当时状态，不覆盖当前快照。

## 当前快照（2026-08-26）

- 显式 visual Beta：普通 Tab、Popout visual P0，以及表格、代码块、块引用、图片、Wikilink、AI 选区、分割线和查找替换均已有主场景证据；Capsule/Private 继续禁用或回退 visual。
- Gate D：真实外部 AI Test `pass`、普通笔记 `20/20 pass`、Owner 确认 `pass`；14 天观察为 `optional / not-run`；当前源码默认模式为 `visual-prosemirror`，显式 `legacy-preview` 时转入源码恢复入口。
- 正式 T4：500 KiB `press=0/1000` 与 Popout 内存门槛失败继续保留；按 Owner 决策，它们是当前范围内的非阻塞已知限制。
- Owner 于 2026-08-26 确认 Visual Editor 完整人工测试通过；v5.0.0 绿色包静态构建、包体核验和默认 Release 输入保存冒烟均已通过。
- source-aware 路由已接入默认 Visual Editor：Front Matter、脚注、原始 HTML、思源扩展、危险 URL 及未闭合原子语法会明确回退源码编辑并保留原文；Wikilink、下划线和高亮不被误判为回退条件。扩展语法仍不是可写 Visual 节点。

## 分类合同

| 分类 | 含义 | 允许的用户体验 | 序列化要求 |
|---|---|---|---|
| 原生可视化 `native` | 编辑器能显示并编辑的结构 | 正常输入、选区、撤销和粘贴 | 输出稳定，未触碰区域不得被改写 |
| 允许规范化 `normalize` | Owner 明确批准的语义等价格式统一 | 可视化编辑 | 必须有逐项批准清单和 diff 证据 |
| 原文原子块 `raw` | 编辑器不解释的原始 source span | 安全占位、不可执行 | 写回原始字节，邻近编辑不得改变它 |
| 安全回退 `safe-source` | 无法可靠保留或不安全的内容 | 只读可视化或逐字节恢复入口 | 禁止进入可写新编辑器，失败不得静默改写 |

Owner 已确认：`normalize` 不是打开或保存时的全局重排权限。未触碰文档和未触碰块必须 byte-equal；规范化只能绑定到用户明确编辑的表格块、标题操作、图片节点或数学节点。

## 语法矩阵

| 语法 / 数据 | Phase 0 分类 | 当前处理 / 进入条件 |
|---|---|---|
| 段落、标题、粗体、斜体、删除线、链接、行内代码 | `native` | 由现有 Lute 基线覆盖；需在新编辑器中验证输入、选区和 Undo |
| 块引用、无序列表、有序列表、分割线 | `native` | 需验证 Enter、Backspace、Tab 和嵌套列表事务 |
| Front Matter | `raw` | 建立 source-aware 原子块，禁止 serializer 猜测重建 |
| 脚注 | `safe-source` | 当前配置不作为日常可视化编辑能力，先保留安全恢复入口 |
| Setext 标题 | `normalize` | 已有 Setext 默认保留；新建标题默认 ATX；用户明确改变标题级别或样式时才允许转换 |
| 原始 HTML 块 | `raw` | 不执行、不静默清除；邻近编辑不得改变原始 source span |
| HTML 注释 | `raw` | 按 source span 原样保留 |
| 思源块引用、IAL、扩展属性 | `raw` | 先作为原文原子 inline/block 保护 |
| Wikilink | `raw` | 后续由专用节点接管；当前先保护原文 |
| Callout | `native` | 当前 Lute 可渲染；需验证结构编辑和回写语义 |
| 硬换行 | `native` | 需区分两个空格与反斜杠换行，禁止隐式折叠 |
| 任务列表 | `native` | 复选框状态必须写回 Markdown；已有 checkbox 回归测试 |
| GFM 表格 | `native` | 表格结构、跨格、末格加行、增删行列和对齐属于原生交互；只有用户编辑该表格块后才允许列宽、空白、分隔线和 pipe escape canonicalize |
| 本地图片 | `native` | 保留本地相对路径，缺失文件不能丢正文 |
| 图床 / 远程图片 | `normalize` | 通过正式图片节点属性保留协议、alt、title、hostedUrl；只在图片节点被编辑时稳定序列化 |
| 涂鸦图片 | `normalize` | 正式节点保留 originalLocalRel、hostedUrl、doodledUrl 关系；不依赖偶然 HTML 属性 |
| 宽度图片 | `normalize` | `w:NNNpx` 进入正式图片属性；图片节点未被编辑时保持原文 |
| Data URL 图片 | `native`（安全门另测） | 适配器合同仅保留 PNG/JPEG/GIF/WebP/AVIF 的 base64 Data URL；SVG 和非图片 Data URL 进入安全回退 |
| 恶意 HTML / URL | `safe-source` | 适配器合同与隔离 Release 的恶意 HTML 粘贴合同均已阻断脚本协议、危险 Data URL、SVG Data URL 和事件属性；中文 Microsoft Pinyin composition/1000 已有实机证据，回车语义、中英切换和 Owner 手感仍待完成 |
| 代码块 | `native` | 先保证显示和原文保留，编辑增强属于后续范围 |
| 行内数学 | `normalize` | P2；未编辑时保留原始 source，用户明确编辑后才使用单美元分隔符稳定序列化；块数学使用 `$$` |
| 中英文、emoji 和全角标点 | `native`（语料） | 中文 Microsoft Pinyin composition/1000 与中文标点已有 Windows 实机证据；English layout 当前 `not-available`，需目标环境复核 |

## 当前合成基线

- 语料共 128 份：28 份核心样例 + 100 份固定种子样例。
- 分类数量：`native` 93、`normalize` 26、`raw` 6、`safe-source` 3。
- 当前 Lute 对 93 份 `native` 样例均能产生非空 HTML，未出现 parser 异常。
- 当前全量 HTML → Markdown 往返逐字节相等 94/128（73.438%）；去除首尾空白后仍为 94/128。该比例本身不能单独证明 Gate A；当前 Gate A 口径以 Owner 已确认的规范化边界、source-aware 和保存合同验收为准。
- 34 份直接往返差异已按分类登记：`native` 5（嵌套列表空行、表格格式 / 换行）、`normalize` 21（Setext 及其合成样例）、`raw` 5、`safe-source` 3。详见 `docs/visual-editor-acceptance.md` 的“直接 Lute 往返差异清单”。
- 现有实现链路仍为 `contentEditable → innerHTML → sanitize → Lute HTML2BlockDOM / BlockDOM2StdMd`；新编辑器不得沿用“每键整篇 DOM 回写”。

## Gate A 前置清单（历史基线）

> 本节保留 Phase 0 的历史检查项；当前 Gate A 已按验收记录通过。未完成的真实编辑器能力仍不能被解释为生产接入许可。

1. Owner 逐项批准列表标记、表格空白、Callout、硬换行、Front Matter 等允许规范化边界。
2. 为 raw block / raw inline 建立 source-aware span 保护和重叠边界拒绝策略。
3. 主窗口真实 Tauri smoke 已覆盖 0/200/1000ms 延迟、写入失败和外部 CAS 冲突；Popout、Capsule、Private 隐藏路径和 request-quit 退出路径的保存故障注入已通过。
4. 完成 WebView2 微软拼音 IME、1000 次 composition、鼠标拖选、图片粘贴和 Popout 第二窗口的隔离 Release 补充探针证据；仍不能替代用户手工验收和完整门槛。
5. 编辑行为合同模型已覆盖 Selection、单次 IME composition、History、Clipboard 和序列化错误恢复；这些是 PoC 的自动化基线，不替代 WebView2 实机证据。

### Source-aware 探针状态

- 已有 `src/utils/sourceAwareMarkdown.ts` 和 `tests/sourceAwareMarkdown.test.ts`，在 parser 前将可识别的原文区段替换为带原始字节的原子占位符。
- 固定 raw / safe-source 核心语料 9/9 可识别、可逐字节恢复，并已通过 Lute HTML/Markdown 往返合同；相邻编辑、占位符缺失 / 重复和未闭合 front matter 均有拒绝写回测试。
- source-aware 保护层仍是独立适配器合同；当前 Phase 2 P0 visual flag 尚未接管 raw / safe-source 写回，未知语法继续沿用旧链路或安全恢复入口。

### Normalize 策略 manifest

- `tests/fixtures/visual-editor/normalization-policy.json` 已建立 3 个待确认决策组，覆盖全部 26 份 `normalize` 语料。
- `tests/visualEditorNormalizationPolicy.test.ts` 强制校验 manifest 与 `corpus.ts` 一一对应、无重复，并要求 `normalizationAllowed=false`、所有 `allowedCanonicalChanges` 为空。
- 这一步只冻结审计边界，不批准 Setext、图片元数据或行内数学的 canonical 输出；Owner 确认前不得进入 Phase 1。

## 2026-08-22 WebView2 编辑行为增补

- `scripts/visual-editor-webview2-e2e.mjs` 通过 CDP 连接真实 Windows WebView2，使用隔离 Release 和临时数据根目录运行。
- 已通过：编辑器 ready、DOM 选区替换、剪贴板复制粘贴、恶意 HTML 粘贴清理、自动保存和重载恢复。
- 未通过：普通连续键入的 Undo/Redo 事务分组；一次 Ctrl+Z 只删除最后一个字符。真实微软拼音单次 composition、1000 次 composition、鼠标拖选、HTML/原生图片粘贴和 Popout 第二窗口已由补充探针覆盖。
- 证据：`.codex-smoke/visual-editor-webview2-e2e.json` 与 `.codex-smoke/visual-editor-webview2-e2e.png`；这不代表生产 `EditorPane` 已迁移。

## 2026-08-22 保存链增补

保存路径的支持状态现在细分为：

| 路径 | Phase 0 状态 | 已验证行为 |
|---|---|---|
| 普通主窗口 | 已验证 | Release 基础窗口 smoke、输入保存、延迟、失败和外部 CAS 冲突 |
| Popout | 已验证 | 故障注入时拒绝落盘 marker，并在 UI 显示保存错误 |
| Capsule | 已验证 | 故障注入时拒绝落盘 marker，并在 UI 显示保存错误 |
| Private + 隐藏 | 已验证 | 隐藏前等待 Private flush；故障注入时磁盘无 marker、UI 有错误、窗口保持可见 |
| 退出 | 已验证（request-quit 路径） | `-VerifyExitSaveFailure` 真实 Release smoke：退出请求失败时磁盘无 marker、UI 有保存错误、窗口保持可见；托盘物理点击由 Rust 结构合同覆盖 |

这些是保存一致性证据，不代表可视化编辑器语法支持已完成。当前 `native` / `normalize` / `raw` / `safe-source` 分类、Lute `94/128` 往返结果和 9/9 source-aware 恢复结果保持不变；生产 `EditorPane` 仍未接入新编辑器。

2026-08-22 03:41（本地时间）使用当前 Release 重跑隔离 WebView2 探针：上述通过项结果保持不变；Undo/Redo 事务分组仍失败，微软拼音真实 IME 仍未执行。当前 Release SHA-256 为 `504D7A6207347ABEBDE4B814B6F82A56DE6E6EDAFA8CF33D90DD2F6EF8E68102`。

2026-08-22 03:53（本地时间）补充探针通过：WebView2 鼠标拖选替换、HTML 栅格图片粘贴、原生 `image/png` 剪贴板粘贴和真实 UI Popout 第二窗口。随后同一探针完成微软拼音 IME 与 1000 次 composition；当前证据为 `.codex-smoke/visual-editor-webview2-extra-e2e.json` / `.png`。

## Phase 1A 隔离 PoC 当前覆盖（2026-08-22）

以下是 `poc/visual-editor-phase1a` 的自动化覆盖，不等于生产支持矩阵已升级，也不改变 raw / safe-source / 保存链边界：

| 能力 | PoC 状态 | 证据与边界 |
|---|---|---|
| 段落、中文输入、Undo / Redo | 已验证（隔离浏览器） | Playwright 6/6；只写临时 Markdown，不接生产保存 |
| 无序列表、嵌套列表 | 已验证（隔离浏览器） | CommonMark 预设提供 Enter、Backspace、Tab、Shift+Tab；覆盖同级创建、升降层级和行首回退 |
| 任务列表 | 已验证（隔离浏览器） | 自定义 ProseMirror transaction 切换 `checked`；DOM、临时 Markdown、Undo / Redo 均通过 |
| DOM 选区替换 | 已验证（隔离浏览器） | 选区替换同步到编辑器和临时 Markdown |
| 键盘剪贴板 | 已验证（隔离浏览器） | 复制 / 粘贴保留文本并更新临时 Markdown；配置显式授予剪贴板权限 |
| 表格、图片、raw / safe-source、生产保存 | 未进入 Phase 1A | 仍需后续 schema / source-aware / adapter 合同与真实窗口验收 |

PoC serializer 在事务后可能使用 `*` 作为无序列表标记；该现象仅作为观察记录，不批准全局静默规范化，也不证明未触碰区域 byte-equal。生产接入前须单独冻结列表标记保真或明确的用户编辑范围规则。

## 2026-08-22 真实 Tauri / WebView2 Phase 1A 隔离探针

本节只记录隔离 harness 的证据，不改变生产 `EditorPane`、Markdown 保存链或支持矩阵的语法分类。

| 能力 | 状态 | 证据与边界 |
|---|---|---|
| Tauri harness 挂载 | 已验证 | `poc/visual-editor-phase1a/src-tauri`；identifier `com.sin.mknote.visual-editor-phase1a`，只加载 PoC `dist`，不注册生产命令、不读取 `.md`、不连接保存队列；`bundle.active=false` |
| WebView2 ready | 已验证 | `npm.cmd run test:webview2`；Edge/WebView2 UA `151.0.0.0`，临时 WebView2 用户数据目录 |
| 中文输入与 Undo / Redo | 已验证（CDP 合成输入） | `phase1a-webview2-e2e.json`；证明编辑器事务链，不证明微软拼音 composition |
| 列表层级与任务事务 | 已验证 | Enter、Tab、Shift+Tab、任务勾选及 Undo / Redo 均通过；serializer 可能输出 `*`，不授予全局列表标记规范化 |
| DOM 选区替换与键盘剪贴板 | 已验证 | 通过稳定的 DOM 文本选区和文档末尾粘贴路径，未接生产保存 |
| 微软拼音真实 IME / 手工手感 | 客观 IME 探针已验证；手工手感待 Owner 验收 | `phase1a-webview2-ime-e2e.json`：Microsoft Pinyin composition、物理 Ctrl+Z/Y 和 1000 次 composition 均通过；候选交互、唤起即写和用户主观“丝滑”仍需隔离窗口手工验收 |
| 表格、图片、raw / safe-source、生产保存 | 未进入 Phase 1A | 在手工验收通过前不得进入 Phase 1B 或生产接入 |

## 2026-08-22 Phase 1A 真实 Microsoft Pinyin 探针

`npm.cmd run test:webview2:ime` 在独立 WebView2 用户数据目录中直接启动已编译的 Phase 1A harness，并复用/启动隔离 PoC Vite 服务；不读取或写入 `.md`。

| 项目 | 结果 | 证据 |
|---|---|---|
| Microsoft Pinyin composition | 通过 | `layout=8040804`；composition 中间态为 `ni'hao`，空格提交为 `你好` |
| 真实输入 Undo / Redo | 通过 | 物理 Ctrl+Z 后“你好”消失，Ctrl+Y 后恢复 |
| 1000 次 composition | 通过 | 期望 1000，实际 1000 个“你”，无残留 `ni` |
| 隔离清理 | 通过 | harness、WebView2 和临时缓存退出后清理重试成功 |

这组结果证明了客观 OS IME 路径，但不替代 Owner 对窗口唤起、候选操作、光标稳定性和主观输入手感的验收。
## 2026-08-22 当前 Gate 口径

- Gate A（Phase 0 契约完成、允许建立隔离 Milkdown / ProseMirror PoC）已通过。
- Gate B（选择 Milkdown 并进入后续扩展）仍未通过：客观 Microsoft Pinyin 探针已通过，但 Owner 的主观手感验收、完整性能门槛和 Phase 1B/生产路径证据仍待完成。
- 最新 IME 报告见 `poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-e2e.json`；本次修复只调整隔离探针的输入会话，不改变生产编辑器或 Markdown 保存链。

## 2026-08-23 Gate B 边界分类

| 项目 | 当前状态 | 处理方式 |
|---|---|---|
| Owner 手工手感 | 未执行 | `127.0.0.1:4173` 当前无监听；不得用隔离 PoC 自动化替代 Owner 对唤起、候选、光标、持续输入和“丝滑”感的验收 |
| Microsoft Pinyin 回车提交 | 输入路径边界，待手工复核 | composition 结束但未产生 DOM Enter；Owner 实例中用真实回车复核后再决定是否需要编辑器修复 |
| English layout | `not-available` | `00000409` 路径未产生预期英文文本；目标输入法环境复核前不标记为通过 |
| T4 性能 | 未形成 Gate 证据 | 隔离 WebView2 诊断中 100 KiB 单样本 key-to-paint 为 65.3 ms；500 KiB 在 120000 ms 内未观察到 input；仍未完成协议 p95、窗口内存、保存和包体测量 |

## 2026-08-23 WebView2 基准诊断

本节只记录缩小样本的真实 WebView2 采集链路，不改变 Gate B 或生产支持状态：

| 项目 | 结果 | 证据与边界 |
|---|---|---|
| 隔离采集链路 | 通过 | `poc/visual-editor-phase1a/scripts/phase1a-webview2-benchmark.mjs`；默认端口 `4181/9251`，临时 WebView2/AppData/Temp/Cargo 目录 |
| 100 KiB key-to-paint | 诊断样本通过 | 1 次样本 `65.3 ms`；不是协议要求的 1000 次 p95 |
| 500 KiB key-to-paint | 未通过（存在波动） | 早期样本在 `120000 ms` 内未观察到 input；最新 timing 样本为 `362.4 ms`，仍高于 `100 ms` 门槛 |
| T4 / Gate B-P0 | 未通过 | 运行配置为 cold `0`、hot `0`、key `1`，不能替代完整 `30/100/1000` 协议，也不授权生产接入 |

报告：`poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark.json`。

### 结构诊断补充

| 语料 | DOM 结构统计 | 当前判断 |
|---|---|---|
| 100 KiB | `1,024` table、`2,048` 行、`4,096` 单元格、`16,384` 后代元素 | 1 次 key-to-paint `65.3 ms`；仅为诊断样本 |
| 500 KiB | `5,120` table、`10,240` 行、`20,480` 单元格、`81,920` 后代元素 | 1 次输入 `120000 ms` 内无 input；大规模表格 DOM / ProseMirror 压力与失败强相关 |

该统计只记录数量和文本长度，不记录正文或 HTML。它支持“官方 fixture 的结构规模可能是主要压力源”的调查方向，但不足以单独证明唯一根因；在差分诊断完成前，不得修改官方门槛或开放 `native` 表格生产支持。

### paragraph 差分 fixture（仅诊断）

| 语料 | DOM 结构统计 | key-to-paint | 支持结论 |
|---|---|---:|---|
| paragraph 500 KiB | `4,130` 段落、`4,130` 后代元素、0 table | `97.4 ms`（1 次） | 同样超时配置下可响应；支持优先调查 table 结构压力 |

报告：`poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-paragraph-diagnostic.json`。该 fixture 默认关闭，不改变官方 table 语料、支持矩阵或 T4 门槛。

### 初始化 / 首帧 timing 差分

| 语料 | Editor.create | ready → 首帧 | key-to-paint | 当前判断 |
|---|---:|---:|---:|---|
| table 500 KiB | 22,873.6 ms | 438.7 ms | 362.4 ms | 初始化和编辑事务均超标 |
| paragraph 500 KiB | 538.3 ms | 116.2 ms | 94.5 ms | 单样本可响应，但不替代 p95 |

证据：[table timing](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-timing.json>)、[paragraph timing](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-paragraph-timing.json>)。该结果只收窄调查方向，不改变 `native` 表格生产支持或 Gate B 状态。

## 2026-08-23 表格结构差分（仅性能诊断）

| 500 KiB fixture | 表格数 | 行数 | 单元格数 | key-to-paint | input-to-paint | 当前结论 |
|---|---:|---:|---:|---:|---:|---|
| 官方 `table` | 5,120 | 10,240 | 20,480 | 362.4 ms | 301.9 ms | 多表结构初始化 / 编辑事务超标 |
| 诊断 `single-table` | 1 | 9,661 | 19,322 | 308.6 ms | 280.6 ms | 碎片化降低后仍超 100 ms |

该差分只用于定位性能阻塞，不改变表格语法的 `native` / `normalize` / `raw` 支持分类，不修改正式 T4 门槛，也不授权生产编辑器接入。证据：[single-table timing](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-single-table-timing.json>)。

## 2026-08-24 真实 OS IME fragment sweep（隔离诊断）

| 能力 / 结构 | 隔离 PoC 结果 | 支持矩阵结论 |
|---|---|---|
| 100 KiB paragraph + Microsoft Pinyin | composition 通过 | 仅证明真实 OS 输入链路可工作，不改变生产支持状态 |
| 100 KiB 官方 table，`tableCount=1/16/64/256/512` | composition 通过，未观察 renderer crash | 可作为 fragment 诊断证据；不能标记为生产表格支持或 T4 通过 |
| 100 KiB 官方 table，`tableCount=1024` | ready timeout `60s`，未进入输入阶段；`rendererCrashed=false` | 归类为初始化/ready 阻塞，支持状态保持原分类 |

焦点修复提交为 `69f9f3c`，ready timeout 提交为 `0131a9c`。本节不改变 `native` / `normalize` / `raw` 分类，也不授权生产 `EditorPane` 接入。

## 2026-08-24 T4 保存/CAS与当前 Gate 状态

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| 保存/CAS bridge blocking | `pass` | 真实 `30/30`，p95 `1.4 ms`；只代表同步 Tauri bridge dispatch，不代表完整磁盘保存耗时 |
| 保存失败 / CAS 冲突 | `pass` | 两份故障注入证据均通过；[metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-metrics-20260824.json>) |
| 500 KiB 正式 `press` | `failed` | `0/1000`；`insert-text` 对照不替代正式 T4，不能据此标记大文档支持 |
| 10 Tab + 1 Popout 内存 | `failed` | working set 增量约 `168.664 MiB`、`33.98%`，超过 `50 MiB / 25%` 门槛 |
| Gate B-P0 | `blocked` | 保存/CAS已补齐；500 KiB 性能、进程内存、T5 Owner和输入环境边界仍未闭合 |

最新机器可读总证据为 [phase1a-t4-evidence-manifest.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)。本节不改变 `native` / `normalize` / `raw` 语法分类，也不授权生产 `EditorPane` 接入。

## 2026-08-24 输入边界分类补充

- 中文 Microsoft Pinyin composition、空格提交、候选翻页、中文标点、鼠标选区替换、物理 Undo / Redo 和 1000 次 composition 保持已验证状态。
- 回车提交探针不产生 DOM Enter：`compositionEnded=true`、`enterKeySeen=false`，trace 只含 `Process`/composition 事件，当前归类为输入注入/harness 边界，待 T5 真实窗口复核；不把它标记为编辑器语义失败。
- English layout `00000409` 当前为 `not-available`，artifact 记录 `a'b'c`，不满足探针预期；需目标输入环境或 Owner 复核后再改变状态。
- 以上分类只影响验收证据解释，不改变 `native` / `normalize` / `raw` / `safe-source` 语法分类，也不授权生产 `EditorPane` 接入。

## 2026-08-24 T5 Owner 完成后的当前状态

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| T5 Owner 手工手感 | `pass` | 隔离窗口 T5-01–T5-12 全部通过；不等同于生产 `EditorPane` 已接入 |
| Microsoft Pinyin 回车提交 | Owner 手工通过 | 真实窗口复核已覆盖自动探针的输入协议边界；保留早期 CDP/harness 分类，不把它改写成编辑器缺陷 |
| English layout | Owner 手工通过 | 目标窗口环境可用；早期 `00000409` `not-available` artifact 仍作为历史环境证据保留 |
| 500 KiB 正式 `press` | `failed` | `0/1000`；不因 T5 通过而宣称大文档支持 |
| `10 Tab + 1 Popout` 内存 | `failed` | 增量约 `168.664 MiB / 33.98%`；不因 T5 通过而宣称 Popout 内存达标 |
| Gate B-P0 | `blocked` | T5 已闭合；正式 manifest 仍等待 A/B/C 范围决策 |

路径 B 已应用：只对 P0 进入 Phase 2，表格性能与 Popout 内存保留为 Phase 1B / Gate C backlog。生产 `EditorPane` 仅在显式 flag 下启用 P0，保存链和 CAS 继续复用现有实现。

## 2026-08-24 Phase 2 P0 试运行状态

| 能力 / 路径 | 显式 `visual-prosemirror` flag | 默认链路 / 当前边界 |
|---|---|---|
| 普通主窗口 preview | 已接入 Adapter + session，待真实窗口回归 | 默认仍为 `EditablePreviewEditor` |
| 段落、标题、粗体、斜体、列表、任务 | P0 代码路径已接入 Milkdown；待真实窗口回归 | 旧编辑器继续可用 |
| Selection、纯文本替换、Undo / Redo | Adapter API 已接入；待真实窗口回归 | 旧编辑器继续可用 |
| Markdown 加载 / 序列化 | 通过现有 App `content` 回传；待真实保存/重开回归 | 不改变 `.md` 格式 |
| dirty、revision、saveStatus、CAS | 不由 Adapter 管理，复用 App 现有权威 | 旧链路行为保持不变 |
| Private / 隐私遮罩 | 不启用 visual flag，自动走旧路径 | 不扩大 Private 数据边界 |
| raw / safe-source | 不声明 Phase 2 P0 visual flag 已支持写回 | 继续使用既有保护/恢复边界 |
| GFM 表格、正式图片节点 | 不声明生产支持 | Phase 1B / Gate C backlog |
| Popout / Capsule / 10 Tab 内存 | 不声明新编辑器达标 | 正式 T4 内存失败保留，待 Gate C 单独处理 |

当前启用条件：`VITE_MKNOTE_EDITOR_MODE=visual-prosemirror`、`viewMode=preview`、非 Private、非隐私遮罩。初始化异常会回退旧编辑器。最新生命周期证据已关闭 Gate C 的 P0 Beta 边界，但不等于 Gate D 默认化。

## 2026-08-24 Phase 2 P0 生命周期收口

| 路径 / 能力 | 显式 visual flag 结果 | 支持矩阵边界 |
|---|---|---|
| 普通 Tab 切换 | 通过 | 3 个 Tab 的切换前后均挂载 visual editor，编辑 marker 保留 |
| Private | 通过隔离 | 强制使用 `legacy-preview`，写回 `File/.private`；不把 Private 标为 visual 支持 |
| Popout | 通过隔离 | 强制使用旧 Markdown textarea，保存/关闭回传通过；不把 Popout renderer 内存标为达标 |
| visual 初始化失败 | 通过 | 父层自动回退 `legacy-preview`，普通内容保留 |
| 隐藏 / 退出 | 通过 | visual 内容分别在隐藏和 `--quit` 后保留；退出主进程 exit code `0` |
| Gate C | `pass`（显式 flag Beta） | P0 生命周期边界已闭合；默认仍为 legacy，Gate D、P1 表格/图片和正式 T4 两项失败不受影响 |

主证据：[phase2-lifecycle-e2e-20260824-gatec-window-save.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-20260824-gatec-window-save.json>)。探针使用临时数据根目录和 CDP `9282–9284`，不读取真实 Private 内容、不触碰 Owner 实例。正式 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败仍保留，不因本节通过而提升表格或 Popout 支持等级。

## 2026-08-24 Phase 3 迁移快照边界

- 显式 `visual-prosemirror` 下，普通笔记初始挂载和普通 Tab 切换均先创建迁移快照，再完成 `session.loadNote`；同一笔记最多保留一个首次原始快照。
- 真实隔离 Release 已验证两个新建普通 Tab 各有独立快照，报告为 `pass`；快照路径只记录哈希文件名，不记录正文。
- Private 不触发迁移快照，Popout 继续使用旧编辑器；默认链路仍为 `legacy-preview`。
- 这项安全子项不改变正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败，也不提升表格、大文档或 P1 支持等级。

## 2026-08-24 Phase 1B 块引用首项

| 证据层 | 当前结果 | 边界 |
|---|---|---|
| T0 命令契约 | `pass`，`2/2` | `VisualEditorCommand` 与 CommonMark `wrapInBlockquoteCommand` 已映射 |
| T1 隔离主场景 | `pass`，`1/1` | 独立端口 `4206`；快捷键、Markdown 输出、Undo/Redo 通过 |
| T4 visual Release 持久化 | `pass` | [报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-blockquote-isolated.json>)；唯一 identifier 隔离，保存→重开通过，`failed=0`、`unexpectedRuntimeErrors=0` |
| P1 单项出口 | `pass`（显式 visual Beta） | 块引用单项边界已闭合；不代表默认迁移、表格/图片或 Private/Popout visual 支持完成 |

本节只记录块引用的增量证据，不提升表格、图片、Popout/Private visual 或正式 T4 性能支持等级。
## 2026-08-24 Phase 1B 代码块单项

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| 代码块 visual Release 显示与保存/重开 | `pass`（显式 visual Beta） | [报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-code-block-csp-fixed-20260824.json>)；`status=pass`、`failed=0`、非预期运行时错误 `0` |
| 默认路径与受保护窗口 | `unchanged` | 默认仍为 `legacy-preview`；Private、Popout 不启用 visual editor；代码块通过不提升表格、大文档或 Popout 内存支持等级 |

代码块本项的通过仅表示显式 visual Beta 中的显示、编辑、序列化和保存/重开边界已具备证据；未知语法、图片、表格和其他 P1 仍按原有 `native` / `raw` / `safe-source` 分类处理。
## 2026-08-24 Phase 1B 表格首个纵向切片

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| GFM 表格创建、单元格输入、保存/重开 | `pass`（显式 visual Beta 首个切片） | [报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-p1-rerun-20260824.json>)；`2×2` 表格和 `Header` 重开后保留 |
| 表格完整交互与性能 | `pending` | 行列增删、对齐、完整表格矩阵和正式 500 KiB `press` 仍未达标；不把首个切片升级为完整表格支持 |

默认仍为 `legacy-preview`；本节只提高显式 visual Beta 中表格创建/编辑/持久化这一窄范围的证据等级。

## 2026-08-24 表格 Tab 行事务收口

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| 表内 Tab 导航与末格追加行 | `pass`（显式 visual Beta） | 生产 adapter 使用 `tableKeyboard`；[修复后报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-row-append-fixed-20260824.json>) 重开后为 `3` 行、`2` 列 |
| 列事务、删除与对齐 | `pending` | 尚未提升为完整表格支持；正式 500 KiB 性能失败仍独立保留 |

## 2026-08-24 表格命令层增量

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| `insert-table` / `add-table-row` / `add-table-column` 命令 | `pass`（合同层） | [合同测试](<C:/Projects/MKnote/tests/visualEditorTableContract.test.ts>) `2/2`；命令通过统一 adapter 进入 GFM schema |
| 最新 visual Release 回归 | `pass` | [报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-commands-latest-20260824.json>) `12/12`；不提升删除/对齐、完整矩阵或大文档性能等级 |

## 2026-08-24 表格工具栏纵向切片

| 能力 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| 表格创建、单元格输入、Tab 末格追加行 | `pass`（显式 visual Beta） | 生产 adapter 使用 GFM schema 和 `tableKeyboard`；最新隔离 Release 已保存并重开验证 |
| 添加列、删除行、删除列 | `pass`（显式 visual Beta） | 表格矩阵操作已在隔离 Release 验证；不等于所有表格矩阵均完成 |
| 居中对齐 | `pass`（显式 visual Beta） | DOM `text-align: center` 与 GFM `:----:` 分隔线均在保存/重开后保留 |
| 左/右对齐及完整表格矩阵 | `pending` | 命令合同已存在，但仍需补主场景和完整矩阵证据 |
| 大文档 500 KiB 正式性能 | `failed` | 正式 `press=0/1000` 失败保持独立 T4 证据，不被表格工具栏切片覆盖 |
| Popout renderer 内存 | `failed` | `10 Tab + 1 Popout` 超过正式门槛；不因显式 visual Beta 表格通过而提升支持等级 |

## 2026-08-24 表格三档对齐主场景

| 能力 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| 左对齐 / 居中 / 右对齐 | `pass`（显式 visual Beta 主场景） | 三个 toolbar command 均在隔离 Release 中真实点击并观察到对应 DOM 对齐；最终居中保存/重开通过 |
| 表格工具栏结构组合 | `pass`（显式 visual Beta） | 创建、输入、Tab 追加行、添加列、删除行、删除列与三档对齐在同一主场景通过 |
| 完整表格矩阵 | `pending` | 仍需补充更完整的表格语料/结构矩阵；不因工具栏主场景通过而提升为完整支持 |
| 500 KiB 正式性能 / Popout 内存 | `failed` | 原正式 T4 失败保持不变，继续作为独立 backlog |

## 2026-08-24 Phase 3 完整表格兼容矩阵

前文“三档对齐主场景”中的 `pending` 是该时点快照；本节是当前状态更新。

| 能力 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| 30 例 GFM 表格兼容/结构矩阵 | `pass`（显式 visual Beta） | [报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>)；`30/30`、重开稳定、源 Markdown 未改写、运行时错误 `0` |
| 默认左呈现与语义 `none` | `pass` | 保留 DOM 原始 `left` 证据；仅对 fixture 语义为 `none` 的未声明对齐做探针归一，显式三档对齐继续独立校验 |
| 表格工具栏主场景 + 兼容矩阵 | `pass`（显式 visual Beta 范围） | 工具栏三档对齐及增删操作已有主场景证据；30 例矩阵关闭的是兼容加载/结构/重开边界，不宣称所有编辑组合均已穷举 |
| 默认生产路径 | `unchanged` | 默认仍为 `legacy-preview`；Private、Popout visual 隔离边界不变 |
| 500 KiB 正式性能 / Popout renderer 内存 | `failed` | 继续保留正式 T4 的 `press=0/1000` 和内存超标证据，不被表格矩阵通过覆盖 |

## 2026-08-24 Phase 3 图片元数据持久化

| 能力 | 显式 visual Beta | 当前证据与边界 |
|---|---|---|
| 本地 / 图床 / 涂鸦 / 宽度 / PNG Data URL 图片 | `pass` | 六类图片 fixture 的加载、元数据、编辑、保存、重开和回读；[image persistence report](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-image-persistence-20260824-classified.json>) 为 `6/6`、`runtimeErrors=0` |
| 危险图片源回退 | `pass` | 危险源回退旧预览，源 Markdown 未改变；安全协议与 Data URL MIME 白名单仍由图片合同约束 |
| 图床离线错误分类 | `pass` | 仅固定 `image-hosted` fixture 的 `ERR_CONNECTION_CLOSED` 进入 `expectedRuntimeErrors`；其他运行时错误仍失败 |
| 默认 / Private / Popout | `unchanged` | 默认仍为 `legacy-preview`；不扩大 Private/Popout visual 支持，不覆盖正式 T4 性能和内存失败 |

## 2026-08-24 Phase 3 Wikilink P1

| 能力 | 显式 visual Beta | 当前证据与支持边界 |
|---|---|---|
| Wikilink 解析、目标和别名显示 | `pass` | [Wikilink 合同](<C:/Projects/MKnote/tests/visualEditorWikilinkContract.test.ts>) `3/3`；目标元数据与 `计划别名` 在 visual DOM 中保留 |
| Wikilink 编辑、保存、重开 | `pass` | [Phase 2 Release 报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json>)；`visual-wikilink-persistence` 通过 |
| Wikilink 点击导航 | `pass` | 目标笔记完成 note switch 后仍挂载 `mknote-visual-editor`，目标正文可见；修复无 session 导航默认回落 `edit` 的问题 |
| 默认链路、Private、Popout | `unchanged` | 默认仍 `legacy-preview`；Private/Popout 不扩大 visual 支持 |
| 正式 T4 性能与内存 | `failed`（保留） | 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败不因 Wikilink 通过而改写 |

Wikilink 单项已达到显式 visual Beta 的主场景出口；AI P1、Gate D 和 Phase 4 仍未完成。

## 2026-08-24 Phase 3 AI 选区 P1

| 能力 | 显式 visual Beta | 当前证据与支持边界 |
|---|---|---|
| 页面选区读取与源区间定位 | `pass` | `visualEditorAiSelectionContract.test.ts` `2/2`；visual DOM 选区通过 `findSelectionInContent` 映射到 Markdown 区间 |
| AI 请求、结果替换与续写边界 | `pass` | 合同覆盖替换/续写；Release 主场景验证请求包含 visual 选中文本并应用结果 |
| AI 外部请求边界 | `pass`（本地合同） | `tests/aiApi.test.ts` `9/9`；覆盖成功、非 2xx、超时、网络失败、非法/空响应和重试；仅使用 mock `fetch`，不代表真实外部服务可用 |
| 保存与重开 | `pass` | `visual-ai-selection-and-apply` 报告 `saved=true`、`reopened=true`；使用隔离 mock API |
| 默认链路、Private、Popout | `unchanged` | 默认仍 `legacy-preview`；Private/Popout 不扩大 visual 支持 |
| Gate D / 真实外部 AI 服务 | `pending` | 需要按[受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>)完成 20 篇 / 14 天真实验收和实际配置验收；本次不把 mock API 通过扩大为外部服务可用性 |

AI 选区主场景已达到显式 visual Beta 出口；下一阶段转为受控 Beta 试用条件和剩余边界审计。

## 2026-08-24 Wikilink GREEN checkpoint 与受保护窗口审计

| 项目 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| Wikilink 当前合同 | `4/4 pass` | 新增无缓存目标笔记导航保持当前 `viewMode` 的回归；前文 `3/3` 仅为修复前快照 |
| 受保护窗口合同 | `1/1 pass` | Popout 保留 visual editor 接入与回退边界；Capsule 不引用 `VisualEditor`；Private/隐私遮罩继续阻断 visual 入口 |
| 默认与正式门槛 | `unchanged` | 默认仍 `legacy-preview`；500 KiB `press=0/1000` 与 Popout 内存失败不改写，Gate D 仍待真实试用 |

## 2026-08-24 Popout visual P0 生命周期与异步清理

| 能力 / 边界 | 显式 Beta 状态 | 支持矩阵说明 |
|---|---|---|
| visual 主窗口 Tab 生命周期 | `pass` | 隔离 Release 报告 `phase2-lifecycle-e2e-phase3-popout-visual-p0-20260824-named.json` 的 7 个结果全部通过，运行时 unexpected error 为空 |
| Popout visual P0 / Capsule / Private 边界 | `pass`（显式 visual Beta） | 同一报告验证 Popout 为 `visual-prosemirror` 且重开后仍为 visual；Capsule 与 Private 继续保持保护旧链路/禁用 visual |
| 监听注销生命周期 | `pass` | `tests/asyncUnlisten.test.ts` `5/5 pass`；异步注册尚未完成、重复 cleanup、注册失败和 rejected cleanup 均有合同覆盖 |
| legacy 对照 | `pass` | 同一 Release 的 `phase2-lifecycle-e2e-phase3-popout-legacy-20260824-async-catch.json` 7/7 通过 |
| 默认 / T4 / Gate D | `unchanged` | 默认仍 `legacy-preview`；500 KiB `press=0/1000`、Popout renderer 内存失败和 Gate D `0/20`、`0/14` 不受本项影响 |

## 2026-08-24 分割线 P1

| 能力 / 边界 | 显式 Beta 状态 | 支持矩阵说明 |
|---|---|---|
| CommonMark 分割线插入 | `pass`（显式 visual Beta） | `insert-divider` 映射到 Milkdown `insertHrCommand`；visual 工具栏可达 |
| 分割线保存与重开 | `pass`（显式 visual Beta） | [phase2-production-e2e-divider-20260824-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-divider-20260824-rerun.json>)；`status=pass`、`failed=0`、非预期运行时错误 `0` |
| 默认 / Private / Popout / T4 / Gate D | `unchanged` | 默认仍 `legacy-preview`；Private/受保护链路不扩大；500 KiB、Popout 内存和 Gate D `0/20`、`0/14` 保持原状态 |

## 2026-08-24 查找替换 P1

| 能力 / 边界 | 显式 Beta 状态 | 支持矩阵说明 |
|---|---|---|
| 查找下一个 | `pass` | visual 查找面板提供用户入口；匹配选区支持继续查找和循环 |
| 当前替换 | `pass` | 当前 ProseMirror 选区替换后沿用现有 Markdown 更新与保存路径 |
| 全部替换 | `pass` | Release 主场景 `visual-find-replace-persistence` 验证 2 个匹配项全部替换，并完成保存 / 重开 |
| 查找替换合同与 Release | `pass` | `tests/visualEditorFindReplaceContract.test.ts` `3/3 pass`；最终报告 `status=pass`、`failed=0`、非预期运行时错误 `0` |
| 默认 / Private / Capsule / T4 / Gate D | `unchanged` | 默认仍 `legacy-preview`；Private/Capsule 不扩大 visual 支持；正式 T4 与 Gate D `0/20`、`0/14` 保持原状态 |

## 2026-08-24 正式 T4 backlog 复核

| 能力 / 边界 | 当前状态 | 支持矩阵说明 |
|---|---|---|
| 500 KiB 正式 `press` | `failed` | 正式 benchmark 的 cold `30/30`、hot `100/100` 完成，但 `press=0/1000`；这是正式输入协议失败，不能由 `insert-text` 或单次 OS/IME 对照替代 |
| 500 KiB 真实 OS/IME 对照 | `pass`（仅诊断） | 单次报告观察到中文输入和 `rendererCrashed=false`，耗时 `1742 ms`；不提升正式性能或 p95 支持等级 |
| `10 Tab + 1 Popout` renderer 内存 | `failed` | 完整进程树 working set 增量约 `168.664 MiB / 33.98%`，超过 `50 MiB / 25%`；新增 WebView2 renderer 是窗口级成本线索 |
| T4 / Gate B-P0 | `blocked` | 保留正式 manifest 与失败 artifact；不通过改变输入协议、复用窗口语义或修改门槛来制造通过 |
| Gate D 真实试用 | `pending` | 真实普通笔记仍为 `0/20`、`0/14`；下一条主线是 Owner 开始受控 Beta 记录 |

## 2026-08-24 显式 Beta Release 隔离运行冒烟

| 能力 / 边界 | 显式 Beta 状态 | 支持矩阵说明 |
|---|---|---|
| visual Beta 编译模式 | `pass` | 使用 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror npm.cmd run tauri build`；artifact 记录编译模式为 `visual-prosemirror` |
| 默认 Release 保持旧模式 | `pass` | Beta EXE 提取后恢复默认 Release SHA-256；`dist` 回读为 `legacy-preview` |
| 隔离启动与 visual 挂载 | `pass` | 临时数据根、CDP `9421`；visual editor ready、工具栏和 `contentEditable` 均通过，非预期运行时错误 `0` |
| 合成笔记写盘 | `pass` | 隔离 `.md` 回读成功；`ownerPortsTouched=false`、`realDataRootTouched=false`、`sourceFilesChanged=false` |
| Gate D / 正式 T4 | `unchanged` | 本项只证明显式 Beta Release 可安全启动、挂载和写盘；不计入真实普通笔记 `20/20`、`14/14`，不改变 500 KiB `press=0/1000` 或 Popout 内存失败 |

原始证据：[phase2-visual-beta-runtime-smoke-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-visual-beta-runtime-smoke-20260824.json>)。

## 2026-08-25 AI 真实服务主动验证入口

| 能力 | 当前结果 | 支持矩阵边界 |
|---|---|---|
| Test 模型列表 | `pass` | 继续通过 `/models` 获取并排序模型 ID |
| Test completion 探测 | `pass`（代码能力） | 通过固定 `Reply with exactly OK.` 调用 `/chat/completions`；不发送选中文本或笔记正文 |
| 真实外部 AI 服务 | `pending` | 仍需 Owner 使用真实配置点击 Test；mock 不提升为外部服务可用性 |
| Gate D / 默认化 | `unchanged` | Gate D 仍为 `0/20`、`0/14`；默认仍为 `legacy-preview` |

代码合同：[tests/aiConnection.test.ts](<C:/Projects/MKnote/tests/aiConnection.test.ts>)；本项不改变 Private/Capsule、正式 T4 或 Gate D 边界。

## 2026-08-25 Popout 按需加载后的内存对照

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| Popout legacy editor 加载 | `pass` | `EditablePreviewEditor` 不再由 `PopoutView` 静态导入；legacy 分支按需加载，visual 分支不携带该静态链路 |
| `10 Tab + 1 Popout` 内存对照 | `failed`（改善） | [受控采样](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260825-popout-lazy-unique2.json>) 增量 `127.805 MiB / 26.92%`，仍超过 `50 MiB / 25%`；关闭 Popout 后释放约 `70.422 MiB` |
| 正式 T4 / Gate D | `unchanged` | 不修改正式 manifest 或门槛；500 KiB `press=0/1000`、Gate D `0/20`、`0/14` 和默认 `legacy-preview` 保持原边界 |

## 2026-08-25 主窗口 EditorPane 按需加载

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| `EditorPane` visual editor 静态依赖 | `pass` | [visualEditorEditorPaneLoadingContract.test.ts](<C:/Projects/MKnote/tests/visualEditorEditorPaneLoadingContract.test.ts>) 约束 `VisualEditor` 使用 `lazy` 动态导入；visual/legacy 分支统一由 `Suspense` 承载 |
| 构建产物边界 | `pass` | `npm.cmd run build` 退出码 `0`；`VisualEditor` 保持独立 chunk，默认 legacy 路径不静态携带 visual editor |
| 默认 / Private / Capsule / T4 / Gate D | `unchanged` | 默认仍为 `legacy-preview`；受保护链路、正式 T4 失败和 Gate D `0/20`、`0/14` 不受本项影响 |

该项降低了默认路径的静态资源耦合，但不提升 visual Beta 以外的支持等级。

## 2026-08-25 VisualEditor lazy chunk 失败回退

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| lazy 导入/渲染失败 | `pass` | `VisualEditorErrorBoundary` 捕获动态 chunk 错误，并通过 `visualEditorFailed` 触发旧编辑器回退；合同 `3/3 pass` |
| 默认 / Private / Capsule | `unchanged` | 默认仍为 `legacy-preview`；Private/Capsule 保护边界不扩大 |
| 正式 T4 / Gate D | `unchanged` | 500 KiB `press=0/1000`、Popout 内存失败和 Gate D `0/20`、`0/14` 保持原结论 |

该项关闭 visual 按需加载新增的导入失败风险，不提升 visual Beta 以外的支持等级。

## 2026-08-25 Popout visual lazy chunk 失败回退

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| Popout visual lazy 导入/渲染失败 | `pass` | `VisualEditorErrorBoundary` 捕获动态 chunk 错误，并通过 `visualEditorFailed` 回到 `EditablePreviewEditor`；合同已覆盖边界接入 |
| Popout visual 加载回归 | `pass` | `tests/visualEditorPopoutLoadingContract.test.ts`；完整 `visualEditor*.test.ts` `119/119 pass`；`npm.cmd run build` 退出码 `0` |
| 默认 / Private / Capsule | `unchanged` | 默认仍为 `legacy-preview`；受保护窗口不扩大 visual 支持 |
| 正式 T4 / Gate D | `unchanged` | 500 KiB `press=0/1000`、Popout 内存失败和 Gate D `0/20`、`0/14` 保持原结论 |

该项关闭 Popout 按需加载新增的导入失败风险，不等于正式 T4、Gate D 或默认化通过。

## 2026-08-25 表格 P1 当前合同复核

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| 表格合同集合 | `16/16 pass` | `visualEditorTableContract`、表格矩阵、E2E 合同和矩阵 E2E 合同均以当前工作区重新验证，退出码 `0` |
| 30 例 GFM 表格兼容/加载/重开矩阵 | `pass`（显式 visual Beta） | [报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>)：`status=pass`、`fixtureCount=30`、`passed=30`、`failed=0`、`runtimeErrors=0` |
| 表格 P1 当前出口 | `pass`（当前合同范围） | 兼容、结构加载、关闭、重开和源 Markdown 保真证据保持通过；不等于完整编辑组合穷举 |
| 默认 / Private / Capsule | `unchanged` | 默认仍为 `legacy-preview`；Private/Capsule 继续保护旧链路，Popout visual 仅显式 Beta 可用 |
| 正式 T4 / Gate D | `unchanged` | 500 KiB `press=0/1000`、Popout 内存失败、Gate D `0/20` / `0/14` 和真实外部 AI `pending` 保持原结论 |

本节是当前状态更新；前文表格 `pending` 行保留为历史快照，不再代表最新 30 例兼容矩阵结论。

## 2026-08-25 Phase 4 新绿色包支持边界

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| 当前绿色包静态身份 | `pass` | [ZIP](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260825-035047.zip>) 版本 `4.2.5`，entries 仅为 EXE 与 README，ZIP/EXE hash 已核对 |
| 包内 EXE 与当前 Release 对齐 | `pass` | `packageExeSha256` 与 `currentReleaseExeSha256` 相同，Release 时间晚于前端构建 |
| T4 包体子项 | `pass` | [metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-package-metrics-20260825-green.json>) 与候选 manifest 均记录 `release-package=pass` |
| 完整 T4 / Gate B-P0 | `blocked` | 500 KiB `press=0/1000`、Popout 进程内存仍失败；静态包体通过不能覆盖这些失败 |
| 实机运行证据 | `pending` | 旧隔离 Beta PID `44564` 仍运行，单实例边界未释放；待关闭后执行发布冒烟 |
| Gate D / 默认模式 | `unchanged` | 真实外部 AI `pending`、普通试用 `0/20` / `0/14`；默认仍为 `legacy-preview` |

本节只说明当前包体的身份和支持边界，不提升正式 T4、Gate D 或默认化状态。

## 2026-08-25 Release smoke 单实例边界

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| 冒烟启动前单实例检查 | `pass` | 已有 `md-sticky-note` / `MarkdownStickyNote` 进程时立即拒绝，避免 single-instance 转发误归因 |
| 合同与 AST | `pass` | smoke 合同 `7/7 pass`，PowerShell AST `errorCount=0` |
| 新 Release 运行时冒烟 | `pending` | 当前旧隔离 Beta PID `44564` 仍在运行；关闭后再执行输入/保存冒烟 |

该项是证据安全边界，不提升包体、正式 T4、Gate D 或默认化状态。

## 2026-08-25 新绿色包 Release 实机冒烟

| 能力 / 边界 | 当前结果 | 支持矩阵说明 |
|---|---|---|
| Release 启动与窗口渲染 | `pass` | `smoke:release:input` 退出码 `0`；截图确认 `1162x973` 窗口真实渲染 |
| 临时输入/保存 | `pass` | marker 写入临时 sandbox，保存耗时 `2722 ms`，进程正常退出 |
| 包体身份对齐 | `pass` | Release、ZIP 内 EXE、portable EXE hash 一致 |
| Visual Beta / 正式 T4 | `unchanged` | 该证据属于默认 Release 基线冒烟，不覆盖 visual-prosemirror、500 KiB 输入或 Popout 内存门槛 |

该结果提升的是 Phase 4 发布包的运行时可信度，不改变 Gate D、正式 T4 或默认化状态。

## 2026-08-25 Owner 简化 Gate D 当前支持结论

| 能力 / 边界 | 当前状态 | 支持矩阵说明 |
|---|---|---|
| 真实外部 AI Test | `pass` | Owner 于 2026-08-25 明确确认真实配置测试通过；不记录 Token 或完整请求 |
| 真实普通笔记 | `20/20 pass` | Owner 明确确认 20 篇普通笔记完成且未发现问题；不虚构逐篇 ID 或日期 |
| 连续 14 天观察 | `optional / not-run` | 按 Owner 决策改为可选，不是 Gate D 必需条件 |
| Gate D | `pass`（简化范围） | AI Test + 20 篇普通笔记 + Owner 确认；可继续推进，不自动切换默认 |
| 500 KiB 正式性能 | `failed`（非阻塞已知限制） | 正式 `press=0/1000` 失败证据保留；实际遇到问题后再处理 |
| Popout renderer 内存 | `failed`（非阻塞已知限制） | 正式门槛失败证据保留；实际遇到问题后再处理 |
| 默认 / Private / Capsule / 回退链路 | `unchanged` | 默认仍为 `legacy-preview`；Private/Capsule 和旧编辑器回退边界不因简化 Gate D 改变 |

本节是 2026-08-25 的最新当前状态；前文历史阶段的 `pending`、`0/20` 和 `0/14` 保留为历史证据，不改写为当前结果。

## 2026-08-26 当前默认路径与发布收口

| 能力 / 边界 | 当前状态 | 支持矩阵说明 |
|---|---|---|
| 默认源码路径 | `visual-prosemirror` | `resolveVisualEditorMode(undefined)` 返回 Visual Editor；显式指定 `legacy-preview` 时转入源码恢复入口 |
| 普通主窗口 / Popout | `pass`（Owner 验收） | v5.0.0 默认 Release 冒烟与 Owner 完整人工测试均通过，覆盖编辑、保存、关闭/重开及 Popout 回传 |
| Private / Capsule | `unchanged` | 继续使用保护旧链路，不因默认 Visual 切换而扩大支持范围 |
| 最新绿色包 | `pass` | [MKnote-portable-v5.0.0-20260826-161149.zip](<C:/Projects/MKnote/MKnote-portable-v5.0.0-20260826-161149.zip>)；版本 `5.0.0`；ZIP SHA-256 `D451581DB408FDDEF0ED8FC51C7E0E375C84D07F7A481DB47F3B530327CADA41`，entries 仅为 EXE + README |
| 500 KiB / Popout 内存 | `failed`（非阻塞已知限制） | 保留正式失败证据，不在本轮重复测试 |

## 2026-08-26 嵌套列表往返修复

| 能力 / 边界 | 当前状态 | 支持矩阵说明 |
|---|---|---|
| 紧凑嵌套列表序列化 | `pass` | `luteMarkdownCompatibility` 当前 `14/14 pass`；RED `2d20196` → GREEN `d7a930e` |
| 松散列表空行与普通段落保护 | `pass` | 仅按 HTML 列表项是否为松散项决定是否移除转换器生成的空行，不全局规范化 |
| 最新源码 Release | `pass` | v5.0.0 Release、portable 与 ZIP 内 EXE SHA-256 均为 `D092E6285DD19CDBE6B3AA2B5233EAAD5BB6B80AFFCE64220C3892F6B1246995`；ZIP 已按当前 Release 更新 |
| 最新包 Visual 实机保存/重开 | `pass` | Owner 于 2026-08-26 确认任务/嵌套列表及完整 Visual Editor 人工测试通过，包含保存、关闭和重开路径 |

## 2026-08-26 v5.0.0 Owner 验收与 Release 收口

| 能力 / 边界 | 当前状态 | 支持矩阵说明 |
|---|---|---|
| Visual Editor 完整人工测试清单 | `Owner 已确认全部通过` | 工具栏、任务/嵌套列表、标题光标与标题折叠、代码块折叠、编辑模式撤销、回车换行、Popout 保存/回传/重开以及 Private/Capsule 保护边界均由 Owner 确认通过 |
| 预览工具条与资料库交互 | `Owner 已确认全部通过` | 工具条去除重复的分割线/表格按钮，表格行列操作与对齐使用图形化图标且添加行/列图标已纠正；资料库支持失焦关闭、笔记单击以主界面 Lab 打开并关闭资料库，右侧支持 Lab / 便签打开；合同测试 `4/4 pass` |
| 最新绿色包 | `pass` | [MKnote-portable-v5.0.0-20260826-161149.zip](<C:/Projects/MKnote/MKnote-portable-v5.0.0-20260826-161149.zip>)；版本 `5.0.0`；entries 严格为 `MarkdownStickyNote.exe`、`README.txt` |
| ZIP SHA-256 | `pass` | `D451581DB408FDDEF0ED8FC51C7E0E375C84D07F7A481DB47F3B530327CADA41` |
| Release / portable / ZIP 内 EXE 对齐 | `pass` | 三者 EXE SHA-256 均为 `D092E6285DD19CDBE6B3AA2B5233EAAD5BB6B80AFFCE64220C3892F6B1246995` |
| 最终 Release 输入保存冒烟 | `pass` | `npm.cmd run smoke:release:input` 退出码 `0`；窗口 `1162x973`；marker 写入临时隔离 sandbox；脚本已修正为点击 Visual Editor 首个可见段落后再注入输入，避免把空白区未聚焦误报为产品失败 |
| 已知范围外边界 | `unchanged` | 500 KiB `press=0/1000`、Popout 内存门槛失败和 14 天观察 `optional / not-run` 保留原证据；Front Matter、脚注、原始 HTML、思源扩展和危险 URL 继续走安全源码回退；Private/Capsule 继续使用保护旧链路 |
