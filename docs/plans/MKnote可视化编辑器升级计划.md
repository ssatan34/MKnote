# MKnote 可视化编辑器升级计划（快速推进版）

- 更新日期：2026-08-25
- Owner：MKnote 项目维护者；实施由后续开发 Agent 执行
- 当前状态：Gate A 已通过；Gate B-P0 已按路径 B 批准进入 Phase 2；T5 Owner 手工验收 12/12 通过；Phase 2 P0 普通笔记核心与生命周期、Gate C 显式 Beta、Phase 3 P1 主场景和简化 Gate D 已有通过证据；Owner 已确认真实外部 AI Test 和 20 篇普通笔记通过。当前源码默认模式已切换为 `visual-prosemirror`，最新源码绿色包静态构建与包体核验已通过，默认发布冒烟仍待收口；正式 T4 严格性能证据仍 failed，按 Owner 批准作为非阻塞已知限制。
- 当前快照（2026-08-26）：Gate D = 真实 AI Test `pass` + 普通笔记 `20/20 pass` + Owner 确认 `pass`；14 天观察为 `optional / not-run`。Private/Capsule 继续保护旧链路；最新 Owner 修复已验收，下一步为同步发布证据、构建最新绿色包和完成一次默认路径人工冒烟。
- 用户决策：可视化编辑是唯一主路径；日常使用不要求编写 Markdown 源码；源码只作为高级恢复入口
- 目标：让用户像使用成熟文字编辑器一样完成便签、清单、会议记录、网页摘录、表格和图片编辑，同时继续以普通 `.md` 文件作为唯一持久化真相源

> 本版是原计划的执行收敛版。它保留数据安全、Markdown 保真、保存一致性和回滚约束，但删除跨阶段重复的测试清单，改为“一个能力一个主测试、跨层只证明边界、通过后不重复运行”。

## 一、先给结论

### 1. 路线

1. 保留 Milkdown + ProseMirror 作为首选隔离 PoC 和后续生产内核。
2. 不再同时维护重复的 Muya PoC；只有 Milkdown 触发停止条件时，才用同一测试注册表评估 Muya。
3. 先完成核心输入手感和保存安全的 Gate B，再做生产纵向切片；表格、图片等 P1 能力不再阻塞引擎选择。
4. 生产接入通过 `VisualEditorAdapter` 和 feature flag 渐进完成，适配层不得复制 App 的保存逻辑。
5. 旧编辑器至少保留到新编辑器完成受控 Beta 和稳定期后，再单独清理。

### 2. 本版加速原则

- **单一测试责任人**：每个问题只在一个测试层承担完整覆盖。
- **跨层最小证明**：浏览器测试只证明 DOM / 事务接线；WebView2 只证明桌面运行时；真实 IME 只证明 OS 输入法路径。
- **通过不重跑**：未改动的层不因“完整验证”再次执行；阶段报告直接复用已确认的不可变 artifact。
- **先纵向闭环，再横向扩展**：先打通 P0 的加载、编辑、序列化、保存、重开和冲突恢复，再逐个增加 P1 能力。
- **失败即停**：某层首个失败出现后停止后续重复层，先处理根因。
- **基线冻结**：旧生产编辑器的 WebView2 / IME 报告作为 Phase 0 基线保存，不在隔离 PoC 每轮开发中重复执行。

## 二、目标、范围与非目标

### 2.1 用户目标

普通用户在不理解 Markdown 语法的情况下，应能完成：

- 连续中文、英文、emoji 和全角标点输入；
- 标题、粗体、斜体、删除线、链接和行内代码；
- 无序列表、有序列表、任务列表，以及 Enter、Backspace、Tab、Shift+Tab；
- 选区替换、复制粘贴、撤销重做和查找替换；
- 表格、图片和常见网页 / Word / 纯文本粘贴；
- 多 Tab、Popout、Capsule、Private 和外部文件变化下的安全保存。

### 2.2 P0 / P1 / P2 优先级

| 优先级 | 能力 | 进入条件 |
|---|---|---|
| P0 | 中文 IME、Selection、Undo / Redo、段落、标题、行内格式、链接、列表、任务、纯文本 / HTML 粘贴、加载 / 保存 / 重开、冲突恢复 | Gate B / Gate C 必须完成 |
| P1 | 表格、代码、引用、分割线、图片、查找替换、Wikilink、AI 选区、Popout / Capsule / Private 适配 | 在 P0 纵向切片稳定后逐项开放 |
| P2 | 块移动、标题折叠、单篇大纲、Callout、数学增强、专注写作增强 | 不阻塞默认可视化编辑 |

### 2.3 明确不做

- 不把源码模式发展成主编辑器。
- 不支持在线协作、多人光标和复杂云端冲突合并。
- 不承诺所有 Markdown 方言或任意 HTML 执行。
- 不改变现有 `.md`、`File/assets`、S3、思源和 Agent 索引的数据目录契约。
- 不在计划批准范围外改动当前未提交文件。

## 三、当前事实与边界

| 项目 | 当前结论 | 处理方式 |
|---|---|---|
| 生产编辑器 | `EditorPane` 已通过显式 `visual-prosemirror` flag 接入并完成 P0 Gate C 生命周期回归；当前源码默认解析为 `visual-prosemirror`，可显式回退旧链路 | 最新源码对应 Release、默认主窗口/Popout 冒烟和包体仍需本轮收口 |
| Phase 0 | Gate A 已通过；兼容语料、保存合同、source-aware 适配器和基线文档已建立 | 不重复跑已通过的基线，只补缺口 |
| Phase 1A / T5 | Playwright、隔离 Tauri / WebView2、中文 composition、空格 / 回车提交、Undo / Redo、候选翻页、标点、选区替换、1000 次 composition 和 Owner 手工手感均有证据；T5-01–T5-12 全部 `pass` | 不重复运行已通过的输入压力；保留机器证据与 Owner 证据的边界 |
| IME 边界 | 自动化回车 / English layout 曾受注入环境影响；Owner 在隔离窗口实测通过 | T5 关闭 Owner 手感缺口，但不改写正式 T4 性能失败，也不把不同输入协议混为同一证据 |
| 旧生产探针 | 已有旧 `EditorPane` 的 IME、图片粘贴、Popout 等基线报告 | 冻结为历史基线，只有生产代码变化才重跑 |
| 运行实例 | Owner 手工验收实例使用 `127.0.0.1:4173` | 隔离探针必须使用独立端口，不关闭或重启 Owner 实例 |
| 工作区 | 存在大量既有 dirty 修改；计划文件原版本已备份 | 只修改本计划、交接/验收记录及明确批准的测试收敛文件；不得 reset、clean 或批量提交 |

相关证据与维护文档：

- `docs/visual-editor-acceptance.md`
- `docs/visual-editor-support-matrix.md`
- `docs/visual-editor-benchmark-protocol.md`
- `docs/visual-editor-baseline-manifest.md`
- `poc/visual-editor-phase1a/artifacts/phase1a-webview2-e2e.json`
- `poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-e2e.json`

## 四、锁定的架构决策

### 4.1 编辑器与 Markdown

- Milkdown / ProseMirror 负责运行时 `EditorState`、Selection、Transaction、History、Input Rules、Clipboard 和正常 Markdown parser / serializer。
- `.md` 是唯一持久化真相源；ProseMirror JSON、HTML 和编辑器 DOM 都不是磁盘真相。
- Lute 只保留为现有语义 oracle、思源相关验证器和回归基线；禁止继续每键执行 `DOM → Lute → 全篇 Markdown`。
- IME composition 期间不得触发整篇序列化或保存。
- 未触碰文档和未触碰块必须 byte-equal；规范化只能发生在用户明确编辑的结构块，并且必须登记在 normalization policy 中。

### 4.2 原文保护与安全回退

| 分类 | 处理方式 |
|---|---|
| `native` | 正常可视化编辑，由正式节点和 serializer 处理 |
| `normalize` | 只对用户明确编辑的块做已批准的语义等价规范化 |
| `raw` | Front Matter、未知 HTML、注释、思源扩展、IAL、Wikilink 等以原始 source span 原子保留 |
| `safe-source` | 无法可靠解析或存在安全风险时，只读展示或逐字节恢复，不进入可写新编辑器 |

HTML 粘贴必须清洗；链接、图片和 Data URL 使用协议与 MIME 白名单；原始 HTML 不执行；恶意语料不得触发脚本或非预期网络请求。

### 4.3 保存与状态唯一 Owner

| 状态 | 唯一 Owner | 约束 |
|---|---|---|
| `EditorState`、Selection、编辑历史 | 每篇笔记的 VisualEditor session | 只负责运行时事务，不直接写磁盘 |
| serialized Markdown candidate、`editorRevision` | App note session | 序列化后更新当前 session |
| `contentRevision`、`dirty`、`saveStatus` | App note session | 唯一脏状态 Owner，适配层不得复制 |
| pending write | `useQueuedNoteWriter` | 只负责串行写入，不自行清除 dirty |
| `diskRevision`、`contentHash` | notes storage service | 由读写和 compare-and-swap 返回 |
| Private EditorState 与 dirty | 独立 Private session | 不进入普通 Tab、缓存、日志或调试快照 |

保存状态固定为：

1. 编辑事务产生 `editorRevision N`。
2. serializer 输出候选 Markdown，并更新 App session。
3. 600ms 防抖写入；Blur、Tab 切换、隐藏、关闭、Popout / Capsule 转换和 Private 退出必须 `await flush`。
4. 写入使用 `expected contentHash / revision` compare-and-swap；旧版本拒绝写入且磁盘不变。
5. 只有“写入完成 revision 等于当前 revision”才能清除 dirty。
6. 失败或冲突时保留内存内容、dirty 和可恢复错误，不静默覆盖、不静默清除。

### 4.4 Private 与迁移快照

- Private 不进入普通 Tab 缓存、localStorage、日志、调试快照、S3 / 思源同步或 Agent 索引。
- 迁移快照存放在 `File/.private/.mknote-migration-snapshots/`，每篇最多一个，不进入普通历史和备份清单。
- 删除 Private 笔记时同步删除快照，禁止孤儿副本；默认编辑器稳定 14 天后由用户选择清除或继续保留。
- 性能和错误日志只记录耗时、长度、类型和错误码，不记录正文。

## 五、唯一测试注册表

这是整份计划唯一的测试分层定义；各阶段只引用 `T0`–`T5`，不得再次复制测试清单。

- 本计划只定义执行顺序、责任和门槛；`visual-editor-acceptance.md` 只记录结果与失败边界；`visual-editor-support-matrix.md` 只记录语法支持分类；测试 artifact 保存具体输入和原始输出，三者不得互相复制完整测试内容。
- 新增测试必须先登记所属层级和唯一责任；没有新增边界证明的重复输入不得加入回归套件。

| 层级 | 唯一责任 | 主证据 | 运行频率 |
|---|---|---|---|
| T0 快速契约 | 编辑事务、source-aware、保存状态和 CAS 语义 | Node / TypeScript contract tests | 每次相关改动；只跑受影响集合 |
| T1 PoC DOM | React / ProseMirror DOM 接线和用户命令 | `poc/visual-editor-phase1a/tests/e2e/phase1a.spec.ts` | UI、schema、command 变化时；不重复 T0 全量语义 |
| T2 WebView2 冒烟 | Tauri / WebView2 挂载、焦点、一个代表性编辑路径、剪贴板 / 重载边界 | `phase1a-webview2-e2e.mjs` | Tauri、WebView2、窗口或剪贴板变化时；每个检查点一次 |
| T3 OS IME 门 | 微软拼音、候选、标点、中英模式、真实选区和 1000 次 composition | `phase1a-webview2-ime-e2e.mjs` | Gate B、IME / Selection / History 代码变化、发布前；不在每轮开发运行 |
| T4 完整兼容与性能 | 128 份兼容语料、raw / normalize、50 组 Selection、100 条 Undo、列表 / 表格 / 粘贴矩阵、100KB / 500KB 性能、保存故障注入 | acceptance、support matrix、benchmark 和 release artifact | Gate A / B / C / D 或发布前；通过后复用报告 |
| T5 Owner 手工 | 唤起即写、候选操作、光标稳定、持续输入和整体丝滑感 | 隔离窗口手工记录 | Gate B、Beta 和默认切换前；自动化不代替主观验收 |

### 5.1 重复输入处理规则

- 测试文本和操作序列只定义一次，统一放在 `tests/fixtures/visual-editor/`；测试文件引用场景 ID，不复制字符串。
- 一个断言只指定一个主测试层。其他层只证明边界，例如 T1 证明 DOM，T2 证明 WebView2，T3 证明 OS IME。
- `1000` 次 composition 只属于 T3 压力门；不能同时作为旧生产基线、新 PoC、Playwright 和每轮回归输入。
- 旧生产 IME / WebView2 报告只作为冻结基线；新 PoC 通过后不重新跑旧报告。
- 128 份语料必须保留，但开发内循环只跑受影响分类；全量只在 T4 运行。
- 结构测试发现首个失败后立即停止后续重复层；不得为了“凑完整报告”继续启动窗口。
- 已通过且代码、fixture、运行时未变化的层不重跑，直接引用上次带 commit / hash 的 artifact。

### 5.2 运行矩阵

| 改动类型 | 必跑 | 明确跳过 |
|---|---|---|
| serializer / source-aware / Markdown 规则 | T0 受影响集合；相关 T4 分类 | T2、T3、旧生产基线 |
| ProseMirror command / schema / UI | T0 受影响集合 + T1 | 完整 T2、T3，除非触及对应边界 |
| Tauri / WebView2 / 窗口 / 剪贴板 | T0 + T1 受影响集合 + T2 | T3、全量 T4，除非触及 IME 或发布门 |
| IME / Selection / History | T0 + T1 相关场景 + T3 | 旧生产 IME 基线、无关 T4 |
| 保存、flush、CAS、Tab / Popout / Private | T0 保存契约 + 受影响 T2 | T3、无关兼容语料 |
| Gate / 发布 | T0–T5 一次性运行 | 不重复运行同一层的旧报告 |

## 六、执行阶段与单一出口

### Phase 0：基线与契约（已完成，禁止重复建设）

**目标**：冻结 Markdown 保真、保存一致性、source-aware 分类和性能测量方法。

**已交付**：

- 128 份兼容语料和 `native / normalize / raw / safe-source` 分类；
- normalization policy、source-aware 适配器和保存 / CAS 合同；
- 主窗口、Popout、Capsule、Private、隐藏和退出保存故障证据；
- 现有生产 WebView2 / IME 基线报告。

**出口**：Gate A 已通过。后续不得再次把 Phase 0 全量报告当作每轮开发测试。

### Phase 1A：核心手感 Gate B 收口（已完成）

**目标**：只确认 Milkdown / ProseMirror 是否足以承担 P0 核心编辑，不扩展表格、图片或生产保存。

**只做以下事项**：

1. 完成 T5：唤起即写、中文输入、候选翻页、空格 / 回车上屏、中英切换、中文标点、鼠标选区替换、持续输入、粘贴、撤销和整体手感。
2. 复核 T3 当前报告中的回车注入语义边界和英文布局 `not-available`，分类为编辑器问题、输入注入限制或环境不可用；不通过重复输入掩盖分类。
3. 补齐固定机器上的性能与完整兼容门槛；只运行 T4 一次。
4. 更新 acceptance、support matrix 和报告，记录自动测试、实机探针、Owner 手工验收三种证据的边界。

**不做**：

- 不重跑已经通过的 T0 / T1 / T2 场景；
- 不重跑旧生产 IME / 1000 composition；
- 不接管生产 `EditorPane`；
- 不因为表格或图片 PoC 增量而宣布 Phase 1B 通过。

**出口：Gate B-P0**：

- T0、T1、T2 的已覆盖核心场景无回归；
- T3 的真实 OS IME 达标，1000 次 composition 无重复、漏字和候选中断，一次完整上屏一个 undo step；
- T5 的核心手感由 Owner 明确接受；
- P0 的 raw / safe-source、安全和性能证据达标；
- 没有未解释的 P0 数据风险。

Gate B-P0 只允许进入生产 P0 纵向切片，不代表表格、图片和全部业务扩展已经完成。

### Phase 1B：P1 能力隔离增量（Gate B-P0 后）

**目标**：在不复制测试套件的前提下，逐项验证表格、代码、引用、图片和粘贴扩展。

**规则**：

- 每项能力一个 schema / command、一个 T1 主场景、一个相关 T0 契约和一个 T4 持久化边界；
- 只在该能力被编辑时允许其 serializer 规范化；未触碰内容继续 byte-equal；
- 图片正式节点必须保留 `src`、`alt`、`title`、`sourceKind`、`localRel`、`originalLocalRel`、`hostedUrl`、`width`、`doodledUrl`；Private 禁止图床上传；
- 未知语法仍走 raw / safe-source，不为了扩大通过率而静默删除。

**出口**：每项 P1 能力单独通过，不把未完成 P1 拖回 Gate B-P0，也不提前接入生产。

### Phase 2：生产 P0 纵向切片与 Gate C

**目标**：让一个普通 `.md` 笔记在真实 MKnote 中完成 P0 的加载、编辑、序列化、保存、重开和回滚。

**实现顺序**：

1. 定义 `VisualEditorAdapter`：`loadMarkdown`、`getMarkdown`、`focus`、`getSelection`、`replaceSelection`、`executeCommand`、`undo`、`redo`、`destroy`。
2. 建立 `useVisualEditorSession`，只管理 `noteKey`、EditorState、Selection、History 和外部刷新协调；`contentRevision`、`dirty`、`saveStatus` 仍由 App note session 唯一管理。
3. 接回现有保存队列、flush、CAS、外部冲突和错误恢复，不在适配器内写第二套文件逻辑。
4. 用 feature flag 在主 `EditorPane` 保留 `legacy-preview`、`visual-prosemirror`、`safe-source` 三种模式；默认仍为旧编辑器。
5. 只接入 P0：段落、标题、行内格式、链接、列表、任务、Selection、Undo / Redo、纯文本 / HTML 粘贴和保存恢复。
6. 通过 T0 + 受影响 T1 + 一次 T2 验证主窗口、Tab、Popout、Private 和外部冲突；不重复 T3。

**出口：Gate C**：

- P0 纵向切片可在隔离真实窗口中使用；
- App 仍只有一个 dirty / saveStatus / CAS 权威；
- 失败保留内存内容，旧编辑器可回退，磁盘格式没有迁移；
- 主窗口、Tab、Popout、Private、隐藏和退出路径没有 P0 数据损失。

### Phase 3：受控 Beta 与 P1 扩展

**目标**：在保留旧编辑器的前提下进入真实 MKnote 工作流。

**执行**：

- 初期由用户显式启用新编辑器，按 P1 能力逐项开放：表格 / 代码 / 引用 → 图片 → Wikilink / AI → Popout / Capsule / Private；
- 首次用新编辑器写入某篇笔记前创建受保护迁移前快照；Private 遵守专用生命周期；
- 错误时保留内存内容，显示恢复提示，并允许切回旧编辑器；
- 至少 20 篇真实普通笔记完成一次编辑→保存→关闭/重开→核对；连续 14 天观察改为可选，真实正文不进入自动日志；
- 每项新增能力只运行其主 T0 / T1 / T2 / T4 证据，旧能力不因新增能力而重新全量执行。

**出口：Gate D**：

- P0 / P1 日常编辑无需进入源码；
- 真实外部 AI Test 通过；20 篇普通笔记无不可恢复数据损失、旧内容覆盖或非预期 Markdown diff；14 天观察可选，不作为 Gate D 必需条件；
- 保存、重启、Tab、Popout、Capsule、Private、外部修改和同步路径通过验收；
- Owner 明确接受日常编辑手感。

### Phase 4：默认化、产品化与旧链路清理

**目标**：把可视化编辑设为普通笔记默认体验，并在稳定版本后删除脆弱旧路径。

**先默认化，再清理**：

1. 默认启用 `visual-prosemirror`，源码入口移到“更多 / 恢复”。
2. 工具栏使用用户任务语言：标题、列表、待办、引用、表格、图片、链接、清除格式。
3. 补齐初始化失败、导入失败、导出失败和外部冲突恢复 UI；更新用户文档、交接文档和支持矩阵。
4. 完成一个正式绿色包的自动、实机和用户验收。
5. 至少一个稳定版本和 14 天真实使用后，再独立提交删除 `document.execCommand`、旧 `innerHTML` 回写和 `EditablePreviewEditor`。
6. 保留 Lute、Markdown Adapter、兼容语料、迁移快照读取和源码恢复入口。

**出口：Gate E**：默认体验稳定、恢复入口完整、生产路径不再依赖旧 DOM 编辑；旧链路清理可以单独回滚。

## 七、集中验收标准

所有阶段只引用本节，不在其他章节重复定义数字。

### 7.1 数据与语义

- 未编辑文档和未知原文块 byte-equal 通过率 100%。
- 已支持语法语义等价通过率 100%，无未批准 diff。
- raw block / raw inline 相邻编辑后原文仍 byte-equal 100%。
- 恶意 HTML、危险 URL、危险 Data URL 和事件属性安全通过率 100%。
- 图片、Wikilink、AI、任务、表格和 Private 的持久化语义有对应主测试，不允许静默丢失。

### 7.2 编辑事务与输入

- 真实 OS IME：候选翻页、空格 / 回车上屏、中英切换、中文标点、鼠标选区替换和 Undo；1000 次 composition 无重复、漏字、候选中断，一次完整上屏一个 undo step。
- Selection 跨段落、链接、格式、列表和表格的固定 50 组操作漂移为 0。
- Undo / Redo 固定 100 条组合序列恢复率 100%。
- 列表 40 例、表格 30 例、粘贴 25 例通过率 100%。这些矩阵只在 T4 / Gate 运行，不在 T1、T2、T3 重复复制。

### 7.3 性能与发布

- 固定同一 Windows 机器、release 构建和 100KB / 500KB 语料。
- editor ready：30 次冷启动、100 次热挂载；key-to-paint 预热 5 轮后采样 1000 次，统一计算 p95。
- 100KB key-to-paint p95 < 50ms；500KB < 100ms。
- editor ready 相对现有基线回退不超过 150ms；单次自动保存序列化主线程阻塞不超过 50ms。
- 10 Tab + 1 Popout 内存增量不超过基线 25%，且不超过 50MB。
- 便携 ZIP 增幅不超过 10%；超出必须单独请求 Owner 批准。
- 自动测试、构建、真实窗口证据和用户验收分别归档，不互相冒充。

## 八、决策门

| Gate | 允许的动作 | 必须满足 | 未通过处理 |
|---|---|---|---|
| Gate A | 建立隔离 PoC | Phase 0 契约、保存故障、语料分类完成 | 停留在基线阶段 |
| Gate B-P0 | 按 P0/P1 范围选择 Milkdown 并开始生产 P0 纵向切片 | 路径 B 已由 Owner 批准；T0–T3、T5 和 P0 核心证据满足，T4 大表性能 / Popout 内存失败转为 backlog | 保留失败 artifact，不扩展 P1 |
| Gate C | 接入生产 feature flag Beta 并完成真实 P0 回归 | Adapter 复用保存语义；普通笔记、Tab、Private、Popout、隐藏、退出和初始化回退均有隔离 Release 通过证据 | 显式 flag 进入受控 Beta；默认仍为 legacy |
| Gate D | 完成简化 Beta 评审 | 真实外部 AI Test、20 篇普通笔记、无 P0 数据问题、Owner 确认；14 天可选 | 维持显式 Beta，或另行授权默认化 |
| Gate E | 清理旧链路 | 稳定版本、恢复路径完整、无旧 DOM 依赖 | 保留旧链路，单独再评估 |

## 九、回滚与安全边界

- 新旧编辑器在 Beta 期间由 feature flag 切换。
- 磁盘始终使用同一 `.md` 格式，不做不可逆迁移。
- 编辑器初始化、导入、导出或保存失败时保留内存内容，不自动清 dirty。
- 外部版本冲突不得静默覆盖；必须返回可恢复冲突状态。
- 未知语法进入只读可视化或 safe-source；不能静默清除或猜测重建。
- Popout、Capsule、Private、隐藏和退出未通过前，可以回退旧编辑器。
- 默认切换和旧链路清理使用不同提交、不同版本，清理提交可单独回滚。
- 不删除现有用户文件、不批量读取 Private 内容、不上传笔记正文、不引入网络遥测。

## 十、执行顺序与完成定义

### 当前下一步（2026-08-24，Gate C 已通过，路径 B 已应用）

1. 已在隔离 visual Release 完成普通笔记加载、列表/任务、选区/Undo/Redo、序列化、保存、重开、失败恢复、外部冲突、Tab、Private、Popout、隐藏、退出和初始化回退；Gate C P0 生命周期闭合。
2. 进入 Phase 3 受控 Beta，继续使用显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror`；未设置时保持 `legacy-preview`。
3. 500 KiB `press` 与 `10 Tab + 1 Popout` 内存失败转为 Phase 1B 性能 backlog；不改正式 T4 manifest，不宣称表格或 Popout 内存达标。

### 2026-08-24 保存/CAS证据收口与当前执行边界

- 保存/CAS T4 证据已补齐：真实 `blockingMs` 样本 `30/30`，p95 `1.4 ms`，保存失败和 CAS 冲突均通过；该数值只代表同步 Tauri bridge dispatch 阻塞窗口，不是完整保存耗时。
- T4 collector 已支持重复 `--evidence`，当前 manifest 已合并本地契约、保存/CAS、进程内存和包体四类真实 artifact。保存/CAS从 `not-run` 更新为 `pass`；500 KiB 正式 `press` 与进程内存仍 `failed`，正式 T4 manifest 保持 `blocked`，但按 Owner 批准的路径 B 不再阻塞 P0 Phase 2。
- PoC 官方 `npm test` 已纳入 raw HTML comment 回归测试；该改动只完善隔离回归入口，不改变生产编辑器冻结边界。
- 当前并行处理两条线：Phase 2 P0 真实窗口纵向切片，以及 500 KiB `press` / Tab-Popout 内存的 Phase 1B / Gate C backlog；不使用诊断输入路径替代正式门槛，不把 T4 失败改写为通过。

### 计划完成定义

计划只有同时满足以下条件才算完成：

- 用户无需查看 Markdown 源码即可完成 P0 / P1 日常编辑；
- 可视化编辑是默认主路径，源码是高级恢复入口；
- `.md`、图片、Wikilink、AI、同步、思源、多窗口和 Private 不退化；
- 数据、IME、Selection、Undo / Redo、保存、冲突、性能、内存、包体和安全门槛全部有独立证据；
- 旧编辑器在稳定期后才清理，且复杂历史笔记仍有安全恢复路径；
- 当前计划、验收报告、支持矩阵和交接文档与实际状态一致。

### 未经再次授权不得

- 删除旧编辑器或直接替换生产 `EditorPane`；
- 把隔离 PoC 的测试报告写成生产支持结论；
- 为了通过测试静默规范化或改写用户 `.md`；
- 批量读取真实 Private 笔记建立语料；
- 发布真实用户包或修改与本计划无关的 dirty 文件。
### 2026-08-23 大表输入阻塞复核

- 只在隔离 PoC 中增加表格 / 根段落的 `content-visibility` 与 containment 候选，并将 benchmark 聚焦改为 `preventScroll`；生产 `EditorPane`、保存链、CAS、feature flag 保持冻结。
- 合同 `41/41`、TypeScript/Vite build、独立端口 PoC E2E `8/8` 通过；100/500 KiB 各 `20/20` 的一次小样本曾达到 500 KiB key-to-paint p95 `60.6 ms`。
- 该结果不可作为 T4 通过：100 次复测 500 KiB warmup `0/100`，containment、无滚动聚焦及 `10 s` 初始等待仍未观察到输入事件；Gate B-P0 继续 `blocked`。
- 当前下一步从 CSS 微调转为大规模 DOM 分段 / 虚拟化和 WebView2/CDP 输入边界诊断；只有连续输入稳定并补齐保存/CAS、进程内存与正式 `30/100/1000` 证据后，才允许进入生产 P0 纵向切片。
### 2026-08-23 single-table 反例

- 同一 containment 版本的 `single-table` 诊断出现 500 KiB `5/5`、100 KiB `0/5` 的相反结果；不能把阻塞唯一归因于多表碎片化，也不能据此修改 T4 门槛。

### 2026-08-23 exec-command 输入边界诊断

- 隔离 PoC 新增 `keyInputMode=exec-command` 诊断，配置为 `benchmarkEditorProfile=virtualized-blocks`，100/500 KiB 各 5 次 key 样本；冷启动与热挂载样本为 0，因此该运行不属于正式 T4。报告为 [phase1a-webview2-benchmark-table-virtualized-blocks-exec-command.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-virtualized-blocks-exec-command.json>)。
- 500 KiB 在 `exec-command` 下为 `5/5`，但 key-to-paint p95 `508.9 ms`、input-to-paint p95 `508.0 ms`；同一虚拟化 profile 的 `press` 和 `insert-text` 对照仍为 `0/5`。该差异把当前阻塞进一步分类为 CDP 键盘事件注入与浏览器文本命令路径的边界，不能证明真实 OS 键盘/IME 或生产编辑器已经通过。
- stylesheet windowing 只减少可见根级 block：500 KiB 仍保留 `10,240` 个根级 block 和 `81,920` 个后代元素，仅 `24` 个根级 block 可见。因此虚拟化诊断也没有消除大文档响应延迟，不能修改 T4 性能门槛。
- 回归证据：PoC 合同 `44/44`、TypeScript/Vite build 和默认路径独立端口 `4204` E2E `8/8` 通过。`exec-command` 仅作为诊断手段，不得作为生产输入 workaround；Gate B-P0、生产 `EditorPane`、保存链、CAS 与 feature flag 继续保持冻结。
- 下一步：停止重复同类 CDP 小样本，转向真实 OS 键盘/IME 或非-CDP 输入探针；只有 500 KiB 输入稳定且性能达标后，才补齐保存/CAS、进程内存和正式 `30/100/1000` 证据，再重新评估 Gate B-P0。

### 2026-08-23 真实 OS 输入与多表 renderer 边界

- 将既有 Microsoft Pinyin Win32 探针扩展为 `large-editor-input` 场景：通过 `SendKeys`/`SendInput` 发送真实 OS 按键，CDP 只观察事件和结构；新增 benchmark bytes、fixture、editor profile、报告路径和 renderer crash 状态合同。PoC 合同 `45/45`、build 通过、默认 E2E `8/8`。
- 100 KiB `paragraph` 和 `single-table` 均能完成真实 composition/input；前者 `826` 个根 block、后者 `1` 个根 block/`9,667` 个后代元素。多表 `table` fixture 在 100 KiB normal、100 KiB `virtualized-blocks`、500 KiB `virtualized-blocks` 的 OS 输入后均出现 `Target crashed`；`no-table-runtime` 仍 crash。
- 这排除了“所有大文档都会 crash”和“tableEditing/fixTables 单独导致 crash”的简单解释；`single-table` 通过而官方多表 fixture crash，当前更强的方向是多表 GFM fragment / 节点结构与真实 IME 输入的 renderer 风险。`no-gfm` 对照未在 15 秒内提交文本，不能记为通过。
- 本轮结果只证明隔离 PoC 的真实输入边界，不代表生产支持或性能门槛通过；Gate B-P0、生产 `EditorPane`、保存链、CAS 和 feature flag 继续冻结。下一步做多表 fragment 数量 / 每表行数受控 sweep，再决定是否需要调整 PoC 节点分段方案。

### 2026-08-23 多表 fragment sweep 修正

- sweep 生成器已统一 `single-table` 行密度、避免尾部空白块，并把 fragment marker 放入表头单元格；`tableCount=1` 100 KiB 的 DOM 已恢复为单根表结构，不能再用旧生成器的 crash 结果推导 fragment 阈值。
- 真实 OS 输入失败报告已增加 pre/post DOM、事件计数和 trace。修正后的 `tableCount=1` 与同轮 `single-table` 控制均未 crash，但都只收到最后空格的普通输入，没有中文 composition；当前阻塞归类为 OS/IME 注入环境边界，不能记为 Gate B 输入通过。
 - 回归：PoC 合同失败数 `0`、TypeScript/Vite build 通过、默认 E2E 既有 `8/8`；Gate B-P0 和生产 P0 纵向切片继续冻结。后续只在真实 OS/IME 路径恢复稳定后，再运行受控 fragment sweep 和正式性能收口。

### 2026-08-24 T4 进程内存采集与 Gate B 状态更新

- 按 T4 协议完成隔离 Release 的 `10 Tab + 1 Popout` 进程树采集：采集入口为 `C:\Projects\MKnote\scripts\collect-visual-editor-t4-process-memory-ui.mjs`，baseline / after 使用同一 root PID `40568`，场景计数为 `10 Tab + 1 Popout`。
- working set 从 `520,478,720` bytes 增至 `697,335,808` bytes，增量 `176,857,088` bytes（约 `168.664 MiB`，`33.98%`），超过计划定义的 `50 MiB` 和 `25%` 门槛；该项在 manifest 中标记为 `failed`，不能用“采集完成”解释为“性能通过”。
- 只读进程差分中，after 新增的 `msedgewebview2.exe` 子进程 working set 为 `122,306,560` bytes，根进程仅增加约 `2.74 MiB`；下一轮优先验证 Popout 的窗口级 WebView2 保留成本，但不把该差分线索当作唯一根因。
- T4 manifest 已更新为：兼容语料、source-aware、Selection/History/Paste、100 KiB 性能和 release package 为 `pass`；500 KiB 性能与 process-memory 为 `failed`；save/CAS 为 `not-run`。Gate B-P0 继续 `blocked`。
- 保存/CAS 仍按计划保留证据边界：`collect-visual-editor-t4-save-cas.ps1` 只接受真实 `blockingMs` 样本；既有 release smoke 的 `inputSave.elapsedMs` 不得转换为 T4 阻塞 p95。没有真实样本前不伪造通过结论。
- 下一步只处理真实缺口：分析 Tab session / WebView2 页面保留造成的内存增量；若补齐保存/CAS 采样，必须提供同一运行的真实 `blockingMs` 与保存失败/CAS 冲突证据；T5 Owner 手工验收仍由 Owner 在独立实例完成。

### 2026-08-24 raw HTML comment 修复与正式 T4 重跑

- raw HTML comment 修复已按 TDD 完成 RED/GREEN checkpoint（`cb6979a` / `405073e`），仅在隔离 benchmark 模式启用原子 raw block；原始 comment 值可序列化保留，生产编辑器仍冻结。
- 正式 T4 候选使用官方 `table` fixture、normal profile、100/500 KiB、cold `30`、hot `100`、key `1000`、`press` 输入。100 KiB key-to-paint `1000/1000`，p95 `9.1 ms`，通过；500 KiB cold `30/30`、hot `100/100` 完成，但 key warmup 第 `0` 次未观察到 input，`0/1000`，因此 `webview2-performance-500kb=failed`。
- 修复使 500 KiB 诊断 DOM 后代由旧报告约 `81,920` 降至 `66,560`，并移除 `5,120` 个 `img.ProseMirror-separator`；这不是大表输入门槛通过证据，也不能用来调整 `100 ms` 门槛。
- manifest 已切换到本次正式报告；当前 Gate B-P0 阻塞项仍为 500 KiB 性能、process-memory，保存/CAS 仍 `not-run`。下一轮优先做大表 DOM / WebView2 `press` 输入边界和内存保留成本的隔离诊断，停止重复同类正式 T4。

### 2026-08-24 CDP `insert-text` 对照

- 当前 raw-comment 修复后的隔离 `insert-text` 对照（0 cold、0 hot、100/500 KiB 各 5 次）结果为 100 KiB `5/5`、p95 `12.8 ms`，500 KiB `5/5`、p95 `44.8 ms`；该运行只用于输入路径分类，不替代正式 `press` T4。
- 结合正式 `press` 500 KiB `0/1000` 和真实 OS composition 通过，当前缺口从“大表所有输入均失败”收窄为 WebView2/CDP `press` 注入边界。不得用 `insert-text` 对照关闭正式性能门槛；若要改变 T4 输入协议，需另行审议并保留现有失败证据。

### 2026-08-24 OS IME 焦点修复与 fragment ready 边界

- `sendMicrosoftPinyinContinuation` 增加目标 harness 窗口前台恢复，不重新初始化键盘布局；TDD checkpoint 为 `35c1b2d`（RED）和 `69f9f3c`（GREEN）。100 KiB paragraph 真实 OS composition 已通过，说明此前“只收到空格”主要是 continuation 焦点边界，不能继续归因于编辑器 DOM。
- large-editor ready 等待新增 `MKN_PHASE1A_IME_READY_TIMEOUT_MS`；TDD checkpoint 为 `c98b5c9`（RED）和 `0131a9c`（GREEN）。该参数只用于隔离 harness，报告会记录 `readyTimeoutMs`。
- 100 KiB 官方 table fixture 的受控 sweep：`tableCount=1/16/64/256/512` 均完成真实 composition，未观察到 renderer crash；这些是 T3 结构诊断，不是 T4 性能样本。
- `tableCount=1024` 即使 ready timeout 提高到 `60s` 仍未进入 ready，且 `rendererCrashed=false`。因此当前阻塞从 OS 输入注入进一步收窄为大规模表格初始化/ready 响应边界；报告为 [1024 ready60](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-table-count-1024-100k-ready60-foreground-20260823.json>)。
- 验证：harness 合同 `18/18`、脚本 `node --check`、PoC 全量合同和 TypeScript/Vite build 通过。Gate B-P0、T5 Owner、回车/English layout、正式 T4、生产 `EditorPane`/保存链/CAS/feature flag 仍未通过或未完成。

### 当前下一步

1. 对 `tableCount=1024` 做初始化阶段 timing、ready 状态和 DOM 结构诊断；不把 60 秒 ready 超时写成 renderer crash。
2. 在 ready 阻塞有解释前，不继续 `2048/5120` 或 500 KiB OS sweep；确认初始化边界后再决定是否补高档 fragment 样本。
3. 随后补齐 T4 所需保存/CAS 阻塞、进程内存和正式 `30/100/1000` 性能证据；Gate B-P0 通过前不进入 Phase 2 生产纵向切片。

## 2026-08-24 生命周期诊断进展与下一阶段门槛

### 当前阶段

仍处于 **Phase 1A / Gate B-P0 收口**，当前总进度按阶段门槛约 `25%`。本轮完成的是 T4 进程内存失败的生命周期归因诊断，不是 Gate B 通过，也不是生产编辑器迁移。

### 已完成的可审计工作

| 项目 | 结果 | 证据 |
|---|---|---|
| Popout lifecycle 合同 | 通过 | `tests/visualEditorT4Evidence.test.ts`；定向 `17/17` |
| Release lifecycle 采集 | 通过 | `scripts/collect-visual-editor-t4-process-memory-ui.mjs --lifecycle` |
| baseline/after/closed 完整性 | 通过 | 同一 root PID `44736`，进程数 `7 → 8 → 7` |
| after→closed working set | 释放 `106,688,512` bytes | lifecycle metrics；约 `101.7 MiB` |
| WebView2 子进程释放 | 释放 `1` 个，`116,494,336` bytes | lifecycle metrics 的 `releasedWebView2Processes` |
| 正式 Gate B | 仍阻塞 | 500 KiB `press=0/1000`、process-memory 超过 `50 MiB/25%` |

生命周期运行使用独立 `20260824-lifecycle` artifact，不并入正式 T4 manifest。关闭 Popout 后可以释放新增 WebView2 进程，说明当前内存失败主要发生在 Popout 打开期间；这不是清理 `TabSession` 即可达标的证据。

### 下一阶段执行顺序

1. 在隔离 Release 中评估窗口级 WebView2 的打开期间资源成本：候选方案必须不改生产 `EditorPane`，并复用同一 `10 Tab + 1 Popout`、同一 root PID 和完整进程树快照。
2. 对 500 KiB 大表 `press` 输入继续做有边界的 renderer/DOM 诊断；`insert-text`、`execCommand`、`no-gfm` 仅作为对照，不能替代正式输入门槛。
3. 保持保存/CAS、包体和已经通过的兼容性证据；补齐或复核 T5 Owner 手工手感、回车提交和 English layout 边界。
4. 重新生成 Gate manifest，仅在所有阻塞项和正式 `30/100/1000` 证据满足时重新评估 Gate B-P0；在此之前不进入 Phase 2 生产纵向切片。

### 本轮交付与验证

- RED checkpoint：`6b12e79`。
- GREEN checkpoint：`3150d8b`。
- PoC 官方合同：`56/56`；T4 证据定向合同：`17/17`；Node `--check`、PowerShell parser 均通过。
- 生产 `EditorPane`、`VisualEditorAdapter`、feature flag、生产保存链、CAS 和 Owner `127.0.0.1:4173` 均未接入或占用。

## 2026-08-24 高规模真实 OS 输入证据校正

### 当前事实账本

后续固定初始化路径的隔离 artifact 已补充了旧 ready-only 结论之外的证据：

| fixture | 真实 OS 输入 | 观察结果 | 证据边界 |
|---|---:|---|---|
| `1024` tables / `100 KiB` | `1,732 ms` | composition、`6` 次 `beforeinput/input`、无 renderer crash | T3/诊断，不是 T4 |
| `2048` tables / `100 KiB` | `1,884 ms` | composition、最终中文文本、无 renderer crash | T3/诊断，不是 T4 |
| `5120` tables / `500 KiB` | `1,822 ms` | composition、`76,807` 个后代元素、无 renderer crash | T3/诊断，不是 T4 |

这把阻塞从“大表 DOM 在 500 KiB 下一定不能输入”收窄为“正式 Playwright/CDP `press` 注入失败，而真实 Win32/IME 输入可行”。真实 OS 报告不替代正式 T4，也不改变 `webview2-performance-500kb=failed`。

### 下一步执行顺序调整

1. 停止重复 `1024/2048/5120` 的同类 OS sweep；复用现有报告。
2. 对照正式 benchmark 的 `page.keyboard.press` 与 OS IME harness 的 `SendInput`、前台窗口、焦点确认和事件观察路径，建立可审计的协议差异清单。
3. 若确认是 harness 层缺陷，先写合同测试并只修隔离 PoC；正式 T4 仍需完整 `30/100/1000` 重新采样。
4. 若不是 harness 缺陷，则保留正式 `press` 失败和真实 OS 通过的双重证据，提交 Gate 输入协议决策，不擅自改门槛。
5. Popout 内存 open/closed 诊断继续作为独立阻塞线；生产 `EditorPane`、Adapter、feature flag、保存链和 CAS 继续冻结。

## 2026-08-24 CDP / OS 输入协议对照收口

- 正式 T4 使用 Playwright/CDP `page.keyboard.press`。在 500 KiB 失败样本中，页面、DOM focus、选区和 `contentEditable` 均正常，但没有收到任何键盘或输入事件。
- 隔离 benchmark 增加 `page.bringToFront()` 后，非正式单样本报告仍为 500 KiB `0/1`；临时 native `SetForegroundWindow()` 对照也仍为 `0/1`。100 KiB 两次对照均为 `1/1`。报告分别为 `phase1a-webview2-benchmark-foreground-fix-single.json` 和 `phase1a-webview2-benchmark-native-foreground-fix-single.json`。
- 结论：焦点 / 前台恢复不是足以解释或解除 500 KiB 正式失败的单一 harness 缺陷。保留真实 OS/IME 通过与正式 CDP `press` 失败的双重证据，不改变 `30/100/1000`、`<100 ms` 或 Gate B-P0 门槛；`page.bringToFront()` 仅作为输入前置条件保留。
- TDD 定向合同 `2/2`、benchmark 脚本 `node --check` 通过；生产 `EditorPane`、保存链、CAS 和 feature flag 继续冻结。

### 下一步执行顺序调整

1. 停止重复同类 CDP/OS 输入 sweep，复用现有报告。
2. 继续隔离 Release 的 `10 Tab + 1 Popout` 打开期间 WebView2 资源成本诊断。
3. 仅在正式性能、内存、保存/CAS、T5 Owner 手感和剩余环境边界均有证据后，重新评估 Gate B-P0。

## 2026-08-24 Tab 中间快照与 Popout 内存归因

- 独立 Release run ID `20260824-tabs-diagnostic`、CDP `9247` 已完成 `baseline → 11 Tab → 10 Tab + 1 Popout`，三次快照同一 root PID `59972`，均 `snapshotComplete=true`。
- working set：`521,617,408 → 561,045,504 → 689,524,736` bytes；11 Tab 增量为 `37.60 MiB / 7.56%`，Popout 额外增量为 `122.53 MiB`，正式总增量为 `160.13 MiB / 32.19%`。
- after 新增一个 `msedgewebview2.exe` 子进程，working set `111.47 MiB`；这与 Tauri 独立 `WebviewWindowBuilder` 的窗口级成本相吻合，但仍只作为归因线索，不把单进程差分当成唯一根因。
- 该运行只用于 T4 process-memory 归因，不写入正式 manifest，也不改变 `process-memory=failed`、500 KiB `press=0/1000` 和 Gate B-P0 `blocked`。

### 下一步执行顺序调整

1. 以本次完整进程树为隔离优化基线，评估 Popout 打开期间的窗口级 WebView2 成本；候选必须复用同一 `10 Tab + 1 Popout` 门槛并重新采集完整快照。
2. 不直接修改生产 `EditorPane`、Popout 生命周期、保存链或 CAS；Gate B-P0 通过前继续冻结生产纵向切片。
3. 并行补齐 T5 Owner 手感、回车提交和 English layout 环境边界；保留正式 CDP 失败与真实 OS 输入通过的证据边界。

## 2026-08-24 Popout renderer 复用能力审计结论

- 生产 Popout 使用独立 `WebviewWindowBuilder` / `PopoutView`；本次完整进程树已观察到新增 `msedgewebview2.exe` renderer。
- Wry `0.55.1` 的 `with_environment` 只共享 WebView2 environment，不复用 renderer；`with_additional_browser_args` 还要求不同 data directory，因此没有可直接降低这次窗口级成本的低风险 builder 参数。
- 若继续要求 `10 Tab + 1 Popout` 增量不超过 `50 MiB / 25%`，需要单 WebView/窗口复用等架构级方案，或单独审议门槛定义；本轮不把它伪装成局部修复，不改生产 Popout 生命周期。
- 当前执行边界：保留正式 process-memory `failed`，继续完成 T5、IME 回车和 English layout 分类；Gate B-P0 通过前不进入 Phase 2 生产纵向切片。

## 2026-08-24 Popout 浏览器参数隔离实验

- 为验证 GPU/渲染器开关是否可能解释 Popout 内存增量，进程内存采集器增加了仅限隔离诊断的 `MKN_T4_PROCESS_MEMORY_BROWSER_ARGS`；默认正式采集仍只附加 CDP 端口。TDD checkpoint：RED `1b36d12`，GREEN `b4a2818`。
- 同一 Release、同一 `10 Tab + 1 Popout` 场景的配对运行均为完整快照、进程数 `7 → 8`：无额外参数为 `534,130,688 → 689,160,192` bytes，增量 `147.85 MiB / 29.02%`；`--disable-gpu` 为 `442,048,512 → 616,280,064` bytes，增量 `166.16 MiB / 39.41%`。
- `--disable-gpu` 没有降低内存，且两次运行都新增独立 `msedgewebview2.exe` renderer；该实验不能关闭 process-memory 门槛，也不授权把浏览器参数写入生产配置。
- 两次 baseline 工作集不同，因此该结果只足以排除“该开关能把场景带回门槛内”，不宣称 GPU 是唯一根因。
- 报告：[disable-gpu](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824-disable-gpu.json>)、[control-recheck](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824-control-recheck.json>)。两份均不进入正式 T4 manifest。

### 接续动作

1. 排除 `--disable-gpu` 这一低风险候选，不再围绕浏览器参数做无边界 sweep。
2. 保留 Popout renderer 复用/单 WebView 架构或门槛语义审议这一决策边界，并等待 Owner T5 手工结果。
3. 正式 500 KiB `press`、process-memory 和 T5 均闭合前，继续冻结 Phase 2 生产纵向切片。

## 2026-08-24 Gate B-P0 范围审计与决策包（待 Owner 决定）

### 已确认的规格与事实

- 计划的 P0 包括 IME、Selection、Undo/Redo、段落、标题、行内格式、链接、列表、任务、纯文本/HTML 粘贴、加载/保存/重开和冲突恢复；表格、Popout、Capsule、Private 适配列为 P1。
- Gate B-P0 出口写的是 T0–T3 核心证据、T5 手感、P0 性能/安全；同时 7.3 又定义了通用的 500 KiB 性能和 `10 Tab + 1 Popout` 内存指标。
- 当前失败证据分别来自官方大表 500 KiB fixture 和包含 Popout 的联合内存场景；它们是真实 T4 失败，不能被删除或改写为通过，但是否属于 Gate B-P0 的放行条件存在范围解释问题。

### 不改变证据的三种处理路径

| 路径 | Gate 处理 | 代价与约束 |
|---|---|---|
| A 保守收口 | 继续让两个 T4 失败项阻塞 Gate B-P0 | 需要先解决大表输入和 Popout renderer 内存；生产切片继续冻结 |
| B 按 P0/P1 分层（推荐待 Owner 确认） | T5 与 P0 证据满足后，Gate B-P0 只评估 P0；500 KiB 大表与 Popout 内存转入 Phase 1B / Gate C | 保留失败 artifact，明确不宣称表格/Popout 已支持；Phase 2 只接入 P0 |
| C 先做架构改造 | 先设计单 WebView/窗口复用或等价 Popout 方案，再重跑联合内存门槛 | 需要新的生产生命周期授权，范围明显超出当前 Gate B 收口 |

T5 Owner 结果现已明确为 `pass`；B 仍会改变 Gate manifest 的范围解释，下一决策点是 Owner 明确选择 A、B 或 C。在此之前保留 `blocked` 和全部失败证据。

- 已更新非权威机器可读预览：[phase1a-gate-b-p0-scope-preview.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-gate-b-p0-scope-preview.json>)。当前 `previewStatus=ready-for-owner-decision`、`canApplyRecommendedScope=false`；它只方便复核，不替代正式 manifest。

## 2026-08-24 T5 与 Phase 2 P0 当前状态

### 已确认

| 项目 | 当前结果 | 证据边界 |
|---|---|---|
| T5 Owner 手工验收 | `pass`，12/12 | [visual-editor-t5-owner-checklist.md](<C:/Projects/MKnote/docs/visual-editor-t5-owner-checklist.md>)；真实鼠标、键盘和输入法操作 |
| Gate B-P0 范围 | `approved-for-phase-2` | [scope decision](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-gate-b-p0-scope-decision-20260824.json>)；路径 B 只放行 P0 |
| Phase 2 P0 普通笔记切片 | `pass`，8/8 | [phase2 production report](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-visual-p0-interactions-rerun.json>)；visual 加载、列表/任务、选区、Undo/Redo、保存、重开、保存失败保留内存、CAS 冲突 |
| 正式 T4 manifest | `blocked` | 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败证据继续保留 |
| Gate C | `pending` | 仍需验证 Tab 生命周期、Private / Popout 隔离、visual 初始化失败回退及默认 legacy 边界 |

### 执行边界

1. 只在隔离 Release 和临时数据根目录继续 Gate C 前置验证；保留 Owner 的 `4173`、T5 的 `4205/9265` 和既有隔离端口。
2. Private、Popout、Capsule 和隐私遮罩不因根项目 visual flag 而自动获得新编辑器支持；验证目标是“不误启用、不丢数据”。
3. 初始化失败必须回到 `EditablePreviewEditor`；默认未设置 `VITE_MKNOTE_EDITOR_MODE` 时仍保持 legacy。
4. 不使用 `insert-text`、`execCommand` 或 OS 输入对照改写正式 500 KiB T4 失败；不因 T5 通过而宣称表格、Popout 内存或 Gate C 已完成。

## 2026-08-24 Gate C P0 生命周期收口

| 项目 | 结果 | 证据 |
|---|---|---|
| 普通 Tab 切换 | `pass` | `phase2-lifecycle-e2e-20260824-gatec-window-save.json`；3 个 Tab、visual 内容和 marker 均保留 |
| Private / Popout 隔离 | `pass` | Private 使用 `legacy-preview` 并写回 `.private`；Popout 使用旧 textarea 并在关闭后回传 |
| 初始化失败回退 | `pass` | 隔离 DOM 故障注入后自动回到 `legacy-preview`，内容保留 |
| 隐藏 / 退出保存 | `pass` | 隐藏后进程仍存活且 marker 保留；`--quit` 后 exit code `0` 且 marker 保留 |
| Gate C | `pass`（显式 flag Beta） | 主窗口、Tab、Private、Popout、隐藏、退出和回退边界均有真实隔离 Release 证据 |

主报告：[phase2-lifecycle-e2e-20260824-gatec-window-save.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-20260824-gatec-window-save.json>)；探针运行使用临时数据根目录和 CDP `9282–9284`，非预期运行时错误为 `0`。该结论只允许进入 Phase 3 受控 Beta，不改变默认 legacy、Gate D 默认化条件或正式 T4 manifest 的两项失败。

## 2026-08-24 最终窄验证与 Phase 3 入口

- T5 Owner 手工验收已正式通过：T5-01–T5-12 全部 `pass`，总体 `pass`。
- 根项目构建、Phase 1A 合同测试、Phase 1A 构建、根项目 visual 定向测试、Phase 2 脚本语法和关键 JSON 回读均通过。
- 总阶段推进到 **Phase 3：受控 Beta**；显式 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror` 继续作为入口，默认仍为 `legacy-preview`。
- 正式 T4 manifest 仍为 `blocked`：500 KiB `press=0/1000` 和 `10 Tab + 1 Popout` 内存失败继续留在 Phase 1B backlog；它们不因 T5 / Gate C 通过而改写。

### 2026-08-24 Phase 3 首项安全交付（已完成）

- 普通笔记迁移快照合同已落地：快照位于 `File/.private/.mknote-migration-snapshots/`，每篇最多一个，首次原始内容不覆盖；Private 不触发该路径。
- `VisualEditor` 的初始挂载和 note switch 均在 `session.loadNote` 前等待快照；加载请求按顺序执行，并用请求代次丢弃过期请求，避免旧 note 异步加载覆盖新 note。
- 真实隔离 Release 已验证 3 个普通 Tab 生命周期，其中两个新建普通 Tab 各生成独立迁移快照；P0 保存、重开、保存失败、CAS、Private、Popout、隐藏、退出和初始化回退保持通过。
- 本项出口证据：生命周期报告 `phase2-lifecycle-e2e-20260824-migration-snapshot-direct-ready.json` 与 P0 报告 `phase2-production-e2e-20260824-migration-snapshot-p0-rerun.json`；两者均为 `unexpectedRuntimeErrors=0`。

**下一项**：进入受控 Beta 的真实普通笔记试用；继续逐项推进 Phase 1B/P1。默认模式仍为 `legacy-preview`，Gate D 默认化与 Gate E 旧链路清理不提前开始。

### 2026-08-24 Phase 1B 块引用首项进展

- 已在 `VisualEditorCommand` 与 Milkdown CommonMark adapter 中加入独立 `blockquote` 命令；默认 `legacy-preview`、Private/Popout 隔离和保存权威未改变。
- T0 契约 `tests/visualEditorBlockquoteContract.test.ts`：`2/2`；T1 隔离 PoC 主场景：独立端口 `4206`、`1/1`，覆盖 `Ctrl+Shift+B`、Markdown 序列化和 Undo/Redo。
- 已把块引用保存→重开纳入 visual Release 探针的 T4 持久化边界；使用临时唯一 identifier 与 Owner 实例隔离后，报告 [phase2-production-e2e-20260824-blockquote-isolated.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-blockquote-isolated.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`，块引用 Markdown 写盘并在重启后恢复。
- 块引用这一 P1 项的 T0/T1/T4 边界已单独通过，可记为 `pass`（显式 visual Beta 范围）；临时唯一 identifier 配置已删除，正式 identifier Release 已恢复。该结果不改变默认 `legacy-preview`、表格性能 backlog、正式 T4 两项失败或旧链路清理条件。
### 2026-08-24 Phase 1B 代码块单项收口

- 代码块已在显式 `visual-prosemirror` Beta 范围完成隔离 Release 持久化回归：[phase2-production-e2e-code-block-csp-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-code-block-csp-fixed-20260824.json>) 为 `status=pass`、`failed=0`，非预期运行时错误为 `0`。
- 该报告覆盖代码块挂载、输入、保存、重开、保存失败保留内存和 CAS 冲突边界；CSP inline style 回归由 `tests/copyFeedbackIconContract.test.ts` 约束。
- 代码块单项通过不改变正式 T4 的 500 KiB `press=0/1000`、`10 Tab + 1 Popout` 内存失败、默认 `legacy-preview`、Private/Popout 隔离或 Gate D/E 条件。

下一项继续处理表格 / 大文档性能的真实缺口；不使用 `insert-text`、`execCommand` 或诊断 fixture 替代正式 T4 输入协议。
### 2026-08-24 Phase 1B 表格首个纵向切片

- 生产 visual Release 已增加 `insert-table` 命令，并继续使用 GFM schema；合同测试 `tests/visualEditorTableContract.test.ts` 为 `2/2 pass`。
- 隔离 Phase 2 探针已加入表格主场景：GFM `|2x2| ` 输入规则创建表格，输入 `Header`，保存后重开；最新报告 [phase2-production-e2e-phase3-table-p1-rerun-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-p1-rerun-20260824.json>) 为 `12/12 pass`，非预期运行时错误为 `0`。
- 该项是表格 P1 的首个纵向切片，不代表行列增删、对齐、完整表格矩阵或正式 500 KiB 性能已完成；正式 T4 两项失败和默认 `legacy-preview` 边界保持不变。

下一步继续推进表格结构交互与大文档性能，优先补一条受控的表格行/列事务证据，再评估是否触及正式性能缺口。

### 2026-08-24 表格 Tab 行事务收口

- 首次表格行追加复跑确认了真实缺口：创建和单元格输入通过，但生产 adapter 缺少 PoC 已有的 `tableKeyboard`，末格 Tab 未追加新行；失败报告保留，不覆盖。
- 已在生产 adapter 中加入 `goToNextCell` / `addRowAfter` 的受控插件：表内 Tab 前进，末格 Tab 追加一行；合同测试 `tests/visualEditorTableContract.test.ts` 与根项目构建通过。
- 修复后隔离 Release 报告 [phase2-production-e2e-phase3-table-row-append-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-row-append-fixed-20260824.json>) 为 `status=pass`、`failed=0`，重开后 `3` 行 `2` 列，非预期运行时错误为 `0`。

下一项继续补表格列事务/删除/对齐的最小合同与主场景；大文档 500 KiB 正式性能仍不使用替代输入协议关闭。

### 2026-08-24 表格命令层增量

- `VisualEditorCommand` 已补齐 `insert-table`、`add-table-row`、`add-table-column`，均由 Milkdown GFM command 映射；`tests/visualEditorTableContract.test.ts` 为 `2/2 pass`。
- 最新显式 visual Release [phase2-production-e2e-phase3-table-commands-latest-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-commands-latest-20260824.json>) 仍为 `12/12 pass`、非预期运行时错误 `0`。
- 当前仍只宣称表格创建、单元格输入、Tab 行追加、保存/重开；删除、对齐、完整矩阵、默认化和正式 500 KiB 性能继续未完成。

## 2026-08-24 Phase 3 表格工具栏纵向切片收口

- 生产 `VisualEditor.css` 已补齐表格 `width: 100%`、`table-layout: fixed` 和单元格 `min-width: 7rem`；新增布局合同先 RED、后 GREEN，解决追加行后空白列几何宽度为 `0`、无法点击的问题。TDD checkpoint：RED `a279176`，GREEN `7ca8507`。
- 表格 Release 探针的两个断言缺口也已按 TDD 修正：删除列时保留 `Header` 内容；居中对齐持久化接受合法的可变宽度 GFM 分隔线。checkpoint：探针合同 RED `b235b06` / GREEN `7234393`，对齐断言 RED `35d3c01` / GREEN `c836222`。
- 最新隔离报告 [phase2-production-e2e-phase3-table-toolbar-fixed3-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-toolbar-fixed3-20260824.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`；覆盖表格创建、单元格输入、末格 Tab 追加行、添加列、删除行、删除列、居中对齐、保存、重开和对齐恢复。
- 本轮相关 visual editor 合同 `48/48 pass`，根项目 `npm.cmd run build`、显式 visual Release 构建和探针 `node --check` 均通过。表格当前可记为“显式 visual Beta 的已验证工具栏切片”，不等于完整表格矩阵或大文档性能通过。
- 正式 T4 的 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 进程内存失败保持原样；默认模式仍为 `legacy-preview`，Gate D 默认化尚未开始。

## 2026-08-24 表格三档对齐主场景补充

- 表格 Release 探针现已按顺序真实执行左对齐、居中、右对齐，再恢复居中并保存/重开；相关合同 `5/5 pass`，脚本 `node --check` 通过。
- 最新主证据为 [phase2-production-e2e-phase3-table-toolbar-alignments-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-toolbar-alignments-20260824.json>)：`status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`；表格创建、输入、Tab 追加行、添加列、删除行、删除列及三档对齐均执行通过，最终居中状态保存并恢复。
- 该结果关闭的是显式 visual Beta 中表格工具栏的三档对齐主场景，不宣称完整表格矩阵、正式 500 KiB 性能、Popout 内存或 Gate D 默认化完成。

## 2026-08-24 Phase 3 完整表格兼容矩阵收口

- 30 例独立表格兼容 fixture 已在显式 `visual-prosemirror` Release 中逐例完成首次加载、结构检查、关闭、重开和源 Markdown 保真检查；报告 [phase2-production-table-matrix-20260824-full-001.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>) 为 `status=pass`、`30/30`、`failed=0`、`runtimeErrors=0`。
- 探针保留原始 DOM 对齐值，并将浏览器对未声明对齐呈现的默认 `left` 归一为语义 `none`；显式 left/center/right 仍按 fixture 语义验证。定向合同 `6/6 pass`，`node --check` 通过。
- 该结果关闭 Phase 1B 的表格兼容/加载/重开矩阵子项；不等于完整编辑组合穷举，不改变正式 T4 `500 KiB press=0/1000`、`10 Tab + 1 Popout` 内存失败、默认 `legacy-preview` 或 Gate D 条件。

### 当前接续动作

1. 继续 Phase 3 受控 Beta，按计划推进下一项 P1 能力并记录显式 visual Release 证据。
2. 独立处理 500 KiB 正式输入性能与 Popout renderer 内存 backlog；不得用表格矩阵或诊断输入协议替代正式门槛。
3. 继续保持默认 `legacy-preview`，在 20 篇真实笔记 / 14 天稳定观察及全部 Gate D 条件满足前不默认化。

## 2026-08-24 Phase 3 图片 P1 单项收口

- 六类图片 fixture（本地、图床、涂鸦、宽度、PNG Data URL、危险源回退）已在显式 `visual-prosemirror` Release 中完成加载、元数据检查、编辑、保存、重开和回读；报告为 `status=pass`、`passed=6`、`failed=0`、`runtimeErrors=0`。
- 图片正式节点保留计划要求的本地关系、图床 URL、涂鸦关系、宽度和安全 Data URL 元数据；危险图片仍回退旧预览且源文件不变。
- 探针仅对白名单中的离线图床请求错误记录 `expectedRuntimeErrors`，其他 console/page error 仍使报告失败；本次重跑未触发该错误。
- 本项关闭的是显式 visual Beta 的图片持久化边界，不改变正式 T4 的 500 KiB 性能 / Popout 内存失败、默认 `legacy-preview`、Private/Popout 隔离或 Gate D 条件。

**下一项**：按计划继续推进 AI 选区 P1，并为该项保留独立 T0/T1/T2/T4 证据。

## 2026-08-24 Phase 3 Wikilink P1 收口

- Wikilink 合同 `tests/visualEditorWikilinkContract.test.ts` 为 `3/3 pass`；解析、别名、原始 source、文本拆分和 Beta 持久化边界均有独立合同。
- 最新完整隔离 Release 报告 [phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json>) 为 `status=pass`、14/14 结果检查通过、`failed=0`、`unexpectedRuntimeErrors=0`；覆盖渲染、别名、编辑、保存、重开和点击导航。
- 根因修复位于 `src/App.tsx`：目标笔记没有缓存 session 时，`applyNoteToEditor` 继承当前 `viewMode`；显式 `forceEditMode` 仍可要求旧 Markdown 编辑模式。该修复使 Wikilink 目标在 visual Beta 下完成 visual remount，不改变默认 `legacy-preview`。
- 显式 visual Release 构建 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror npm.cmd run tauri build -- --no-bundle` 退出码为 `0`；Owner 端口和 Private/Popout 边界未改变。
- 本项只关闭显式 visual Beta 的 Wikilink P1；正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败、AI P1、Gate D 默认化和 Phase 4 仍未完成。

### 当前下一步

1. 按计划推进 AI 选区 P1，保留独立合同和 Release 主证据。
2. 继续保留默认 `legacy-preview`、Private/Popout 隔离和正式 T4 失败 artifact。
3. AI 单项通过后，再评估 Phase 3 受控 Beta 的真实笔记试用与 Gate D 条件；不提前默认化。

## 2026-08-24 Phase 3 AI 选区 P1 收口

- `tests/visualEditorAiSelectionContract.test.ts` 为 `2/2 pass`；合同覆盖 visual 页面选区、Markdown 源区间定位、AI 请求接线、替换和续写边界。
- 最新隔离 Release 报告中的 `visual-ai-selection-and-apply` 为 `pass`：页面选区进入 mock AI 请求，结果写回正确区间，保存和重开均通过；报告为 [phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json>)。
- 该项仅关闭显式 visual Beta 的 AI 选区主场景；mock API 不能替代真实外部服务可用性，Private/Popout visual 支持、Gate D 20 篇真实笔记/14 天稳定观察、正式 T4 两项失败和 Phase 4 默认化仍未完成。

### 当前接续动作

1. 保持默认 `legacy-preview`，使用 [受控 Beta 试用记录](<C:/Projects/MKnote/docs/visual-editor-beta-trial-log.md>) 记录真实普通笔记的 20 篇 / 14 天验收条件。
2. 继续审计 Popout/Capsule/Private 的旧链路隔离，不在 Gate D 前开放 visual 支持。

## 2026-08-24 Phase 3 Wikilink GREEN checkpoint 与受保护窗口审计

- Wikilink 回归合同已补齐“无缓存目标笔记仍继承当前 `viewMode`”断言；最新合同为 `4/4 pass`。测试 checkpoint 为 `372b7c1`，实现 checkpoint 为 `98233c6`，两次提交均未带入其他 dirty 文件。
- `src/App.tsx` 仅在显式 `forceEditMode` 时切回旧 Markdown 编辑模式；visual Beta 的 Wikilink 目标 remount 继续保持 `preview`。
- 新增 `tests/visualEditorProtectedWindowContract.test.ts`，结果 `1/1 pass`：Popout 保留 visual editor 接入与回退边界，Capsule 不引用 `VisualEditor`，Private/隐私遮罩继续由 `shouldUseVisualEditor` 阻断。
- 本轮只加强回归合同和证据记录，不扩大默认支持范围；显式 visual Beta 的 Popout P0 已通过，默认仍为 `legacy-preview`，Capsule/Private 仍走保护旧链路，正式 T4 两项失败和 Gate D 条件不变。
3. 正式 T4 500 KiB 输入与 Popout 内存 backlog 继续独立处理，不用 P1 通过覆盖失败证据。

## 2026-08-24 Popout visual P0 生命周期清理收口

- `src/utils/asyncUnlisten.ts` 已统一处理异步监听注册与注销竞态；`tests/asyncUnlisten.test.ts` 为 `5/5 pass`，并已接入主窗口、Popout、Capsule 和窗口 shell 监听。
- 显式 visual Beta 生命周期报告 `phase2-lifecycle-e2e-phase3-popout-visual-p0-20260824-named.json` 为 `status=pass`、7/7 通过；同一 Release 的 legacy 对照也为 7/7 通过，Owner 端口 `4173/4205/4207/9265` 未触碰。
- 本项关闭普通 Tab 与 Popout visual P0 生命周期的异步清理风险；Popout visual 已在显式 Beta 中通过，Capsule/Private 仍受保护，不改变正式 T4、默认 `legacy-preview` 或 Gate D 状态。

### 当前下一步

1. 使用受控 Beta 试用记录开始真实普通笔记试用，目标为 20 篇 / 14 天。
2. 继续保持默认 `legacy-preview`；Private/Capsule 维持旧链路隔离，Popout visual 仅在显式 Beta 开启。
3. 独立处理正式 500 KiB `press=0/1000` 与 Popout renderer 内存失败，不用生命周期或 P1 证据改写正式门槛。

## 2026-08-24 AI 外部请求边界收口

- `src/utils/aiApi.ts` 统一了 completion 与模型列表请求：配置校验、30 秒超时、非 2xx、网络失败、非法 JSON、空/不完整响应均转换为结构化错误；错误消息不包含 Token。
- `tests/aiApi.test.ts` 为 `9/9 pass`；`tests/visualEditorAiSelectionContract.test.ts` 为 `2/2 pass`；根项目 `npm.cmd run build` 退出码为 `0`，目标文件 `git diff --check` 通过。
- 本轮只使用注入的 mock `fetch`，没有调用真实外部 AI 服务；因此只关闭请求边界的本地合同，不提升“真实外部 AI 服务可用性”或 Gate D 状态。
- GREEN checkpoint：`32cc134`（`fix: harden AI API request boundaries`）。默认仍为 `legacy-preview`，Private/Capsule 继续保持保护旧链路，真实 Beta 试用仍为 `0/20`、`0/14`。

## 2026-08-24 Phase 3 分割线 P1 收口

- `VisualEditorCommand` 新增 `insert-divider`，通过 CommonMark `insertHrCommand` 插入 thematic break；visual 工具栏提供用户可达入口，`hr` 有主题样式。
- `tests/visualEditorDividerContract.test.ts` 为 `3/3 pass`；TDD RED checkpoint 为 `adb7e90`、`b19a1ff`，GREEN checkpoint 为 `e7a8111`。
- 隔离 Release 报告 [phase2-production-e2e-divider-20260824-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-divider-20260824-rerun.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`；覆盖插入、写盘、重开和 DOM `hr` 回读。
- 本项关闭的是显式 visual Beta 的分割线 P1 子项，不改变默认 `legacy-preview`、Private/Popout 保护、Gate D `0/20` / `0/14` 或正式 T4 两项失败。

### 当前接续动作

1. 开始真实普通笔记 Beta 试用并按 20 篇 / 14 天记录，不用自动化或 T5 替代。
2. 继续推进查找替换等尚未收口的 P1 能力，逐项建立 TDD 与 Release 主证据。
3. 独立处理 500 KiB 正式输入和 Popout renderer 内存 backlog，不改写正式 manifest。

## 2026-08-24 查找替换 P1 收口

- `tests/visualEditorFindReplaceContract.test.ts` 定向合同 `3/3 pass`，覆盖 Session / Adapter / ProseMirror 选区、用户入口和 Release 探针接线。
- 显式 `visual-prosemirror` Beta 的 Release 主场景覆盖查找下一个（含循环）、当前替换、全部替换、保存、关闭、重开和 Markdown 回读；报告 [phase2-production-e2e-visual-find-replace-20260824-final.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-visual-find-replace-20260824-final.json>) 为 `status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`，`replacedAll=2`。
- Visual Editor 回归 `117/117 pass`；根项目 build、显式 visual Release build 和探针语法检查通过。TDD RED checkpoint 为 `f7fc78b`，GREEN checkpoint 为 `02b0345`。
- 本项关闭显式 visual Beta 的查找替换 P1，不改变默认 `legacy-preview`、Private/Capsule 保护、Gate D `0/20` / `0/14` 或正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败边界。

### 当前接续动作

1. 开始真实普通笔记 Beta 试用，并按计划记录 20 篇 / 14 天；自动化、mock API 和 T5 不能替代 Gate D 观察。
2. 继续审计受保护窗口边界，保持 Popout visual P0 只在显式 visual Beta 中可用。
3. 独立处理正式 T4 的 500 KiB 输入性能与 Popout renderer 内存 backlog，不修改正式 manifest 的失败结论。

## 2026-08-24 正式 T4 backlog 复核

- 最新正式 benchmark [phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json>) 的 100 KiB `press` 为 `1000/1000`、p95 `9.1 ms`；500 KiB cold `30/30`、hot `100/100` 完成，但正式 `press` 仍为 `0/1000`，首个 warmup 样本没有输入事件。
- 真实 OS/IME 500 KiB 报告 [phase1a-webview2-ime-large-editor-table-500k-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-table-500k-raw-comment-fixed-20260824.json>) 为单次 `pass`，观察到中文文本和 `rendererCrashed=false`，耗时 `1742 ms`；它不替代正式 `press` 协议，也不构成 `<100 ms` p95 证据。
- Popout 内存报告 [phase1a-t4-process-memory-e2e-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824.json>) 快照完整、root PID 未变，working set `520,478,720 → 697,335,808` bytes，增量约 `168.664 MiB / 33.98%`，进程数 `7 → 8`。独立 `WebviewWindowBuilder` / WebView2 renderer 的窗口级成本不能通过局部 UI 或清理代码安全消除。
- 因此正式 T4 manifest 和 `Gate B-P0` 的两项阻塞保持原样；不改变输入协议、窗口语义或门槛来制造通过。当前执行出口切换为 Gate D 真实普通笔记试用准备。

### 当前接续动作

1. 保持 Beta 试用记录 `0/20`、`0/14`、`pending`，只在 Owner 完成真实普通笔记操作后填写。
2. 正式 T4 两项失败作为独立 backlog 保留；除非获得新的架构或门槛决策，不重复同类 CDP 诊断。

## 2026-08-24 显式 visual Beta Release 隔离启动

- 当前默认 Release 经 bundle 复核仍为 `legacy-preview`。为执行下一步受控 Beta，使用编译时 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror` 构建临时 Beta 副本；提取 Beta EXE 后恢复默认 Release 和 `dist`，不改变默认模式。
- [隔离运行冒烟](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-visual-beta-runtime-smoke-20260824.json>) 已通过：独立数据根、独立 CDP `9421`、visual editor 挂载/ready、工具栏、合成笔记写盘和运行时错误检查均通过。
- 本项是 Gate D 前的启动准备和运行边界证据，不是 Gate D 真实试用，不计入 `20` 篇 / `14` 天；正式 T4 的 500 KiB `press` 与 Popout 内存失败继续保持原 manifest 结论。

### 当前下一步

1. 由 Owner 在隔离 Beta 中开始真实普通笔记试用，并按 `docs/visual-editor-beta-trial-log.md` 记录；合成笔记和自动化结果不得计数。
2. 保持默认 `legacy-preview`、Private/Capsule 旧链路和正式 T4 失败边界。

## 2026-08-25 Popout 按需加载后的内存对照

- Popout visual 已完成 legacy editor 按需加载优化；随后在独立 Beta target、临时数据根和 CDP `9456` 下完成 `10 Tab + 1 Popout` 受控采样。
- working set 从 `497,827,840` bytes 增至 `631,840,768` bytes，增量 `127.805 MiB / 26.92%`；关闭 Popout 后释放约 `70.422 MiB`，进程数回到 `7`。相较旧报告约 `168.664 MiB / 33.98%`，结果有改善。
- 该结果仍超过 `50 MiB / 25%` 正式门槛，记为“改善但 failed”，不修改正式 T4 manifest，也不改变默认 `legacy-preview`、Gate D 或 Private/Capsule 边界。

### 当前下一步

1. Owner 在隔离 Beta 中开始真实普通笔记 `20/20`、`14/14` 试用，并使用真实配置完成 AI Test。
2. 正式 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存失败继续作为独立 backlog；不重复同类 CDP 诊断，除非有新的架构或门槛决策。

## 2026-08-25 主窗口 EditorPane 按需加载收口

- `EditorPane` 不再静态携带 `VisualEditor`：visual 分支使用 `lazy(() => import("../VisualEditor"))`，visual 与 legacy 分支统一处于 `Suspense` 边界内。
- TDD checkpoint：合同 RED `67da53d`，实现 GREEN `dedb870`；[visualEditorEditorPaneLoadingContract.test.ts](<C:/Projects/MKnote/tests/visualEditorEditorPaneLoadingContract.test.ts>) 与相关 loading/flag/保护边界定向回归退出码为 `0`。
- `npm.cmd run build` 退出码为 `0`，构建后 `VisualEditor` 保持独立 chunk；该优化只收窄默认 legacy renderer 的静态依赖，不改变显式 Beta、默认 `legacy-preview`、Private/Capsule、保存/CAS 或 Gate D 语义。

### 当前下一步

1. Owner 开始真实普通笔记受控 Beta，按记录表完成 `20/20` 篇与 `14/14` 天，并完成真实 AI Test。
2. 正式 T4 的 500 KiB `press=0/1000` 与 Popout renderer 内存失败继续作为独立 backlog；不重复同类 CDP 诊断，除非出现新的架构或门槛决策。

## 2026-08-25 VisualEditor lazy chunk 失败回退收口

- 按需加载引入了新的导入失败边界：动态 `VisualEditor` chunk 在 `Suspense` 期间 rejected 时，组件自身的初始化 `onError` 不会运行。
- 已用 `VisualEditorErrorBoundary` 捕获 lazy 导入/渲染异常，并通过 `visualEditorFailed` 回到既有旧编辑器；不改变默认模式、保存/CAS 或受保护窗口语义。
- TDD checkpoint：RED `f703cf3`，GREEN `5c69034`；回退合同 `3/3 pass`，根项目 build 和完整 visual editor 合同回归退出码均为 `0`。

### 当前下一步

1. Owner 开始真实普通笔记 `20/20`、`14/14` 受控 Beta，并完成真实 AI Test。
2. 正式 T4 两项失败继续保留；没有新的架构或门槛决策前不重复同类诊断。

## 2026-08-25 Popout lazy chunk 失败回退

- Popout visual 分支原先只有 `Suspense` 和组件级 `onError`，无法覆盖动态 `VisualEditor` chunk 在挂载前 rejected 的错误路径。
- 已新增 `VisualEditorErrorBoundary` 并包住 Popout visual 分支；异常时设置 `visualEditorFailed`，回退现有 `EditablePreviewEditor`。该项只修复加载可靠性，不扩大默认、Private/Capsule、保存/CAS 或 Gate D 支持范围。
- TDD：RED `b7a838b`，GREEN `421181c`；Popout 回退合同通过，完整 visual editor 合同 `119/119 pass`，构建通过且 `VisualEditor` 保持独立 chunk。

### 当前下一步

1. Owner 完成真实外部 AI Test，并按记录表推进普通笔记 `20/20`、`14/14` Gate D 观察。
2. 保留正式 T4 两项失败：500 KiB `press=0/1000` 与 Popout renderer 内存超 `50 MiB / 25%`；等待新的架构或门槛决策。

## 2026-08-25 接续修复：初始加载去重与 HEAD 边界

- TDD RED checkpoint 为 `63437b6`，GREEN checkpoint 为 `bc4744b`。`VisualEditor` 的版本化 HEAD 现在只用当前 Markdown 创建 adapter，不再隐式引用用户 dirty 工作区中的 Wikilink callback wiring。
- 初始加载合同为 `3/3 pass`；完整 `visualEditor*.test.ts` 回归为 `122/122 pass`；根项目 `npm.cmd run build` 退出码为 `0`，独立 `VisualEditor` chunk 保留。
- 同期完成的 500 KiB 受控对照报告 [phase1a-webview2-benchmark-table-initial-load-dedup-20260825.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-initial-load-dedup-20260825.json>) 仍观察到 `512000B` 的 `keyToPaint=0/1`，没有收到输入事件；该报告是诊断证据，不改写正式 T4 `press=0/1000` 失败。
- 本轮不提升任何语法支持等级，不改变默认 `legacy-preview`、Private/Capsule 保护、Gate D `0/20`、`0/14` 或正式 T4 两项失败。支持矩阵与验收结论保持不变。

### 当前接续动作

1. Owner 在隔离 visual Beta 中完成真实外部 AI Test，并按记录表推进 Gate D 普通笔记 `20/20` 篇、`14/14` 天。
2. 正式 T4 的 500 KiB 输入与 Popout renderer 内存继续作为独立性能 backlog；达到门槛需要新的架构或门槛决策。
3. 未来若要证明“完整 clean checkout 可构建”，必须先对当前用户 dirty 的跨文件业务改动做明确归属与受控提交；本轮不代替用户提交这些改动。

## 2026-08-25 表格 P1 当前合同复核

- 表格合同集合重新执行结果为 `16/16 pass`、`failed=0`、退出码 `0`；覆盖 `visualEditorTableContract`、表格矩阵、E2E 合同和矩阵 E2E 合同。
- 显式 visual Release 表格矩阵 [phase2-production-table-matrix-20260824-full-001.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>) 保持 `status=pass`、`fixtureCount=30`、`passed=30`、`failed=0`、`runtimeErrors=0`。
- 该复核确认表格 P1 当前合同及 30 例兼容/加载/重开矩阵证据保持通过；不等于完整编辑组合穷举，也不改变正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败、Gate D `0/20` / `0/14` 或默认 `legacy-preview` 边界。

### 当前下一步

1. Owner 在隔离 visual Beta 中使用真实普通笔记完成真实外部 AI Test，并开始 Gate D `20/20` 篇、`14/14` 天记录；自动化合同、合成笔记和 T5 不计入该观察。
2. 正式 T4 的 500 KiB 输入与 Popout renderer 内存继续作为独立 backlog；没有新的架构或门槛决策前不重复同类诊断。

## 2026-08-25 Phase 4 绿色包当前工件预审

- T4 包体指标引用的 ZIP [MKnote-portable-v4.2.5-20260823-155512.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260823-155512.zip>) 结构正确，仅包含 `MarkdownStickyNote.exe` 和 `README.txt`；包内 EXE SHA-256 为 `A35C88F2…FDD272D`。
- 当前 Release EXE SHA-256 为 `B86A4E5F…8FAC00`、修改时间为 `2026-08-24 22:13:32`，而当前 `dist/index.html` 修改时间为 `2026-08-25 02:40:46`；旧包不能代表当前源码，历史 `release-package=pass` 不应解释为当前 Phase 4 发布包已通过。
- 本轮只读预审没有重新打包、覆盖或删除工件。正式发布前需重新执行 `npm.cmd run build:green`，并按版本、时间、ZIP entries、SHA-256 和实机验收重新留证。

## 2026-08-25 Phase 4 新绿色包静态证据闭合

- `npm.cmd run build:green` 已生成 [MKnote-portable-v4.2.5-20260825-035047.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260825-035047.zip>)；版本为 `4.2.5`，ZIP `13,771,154` bytes，相对基线增幅约 `1.0806%`，entries 仅为 `MarkdownStickyNote.exe` 和 `README.txt`，路径穿越项为 `0`。
- 静态 hash/时间核验通过：ZIP SHA-256 为 `B6F5797D68AC5A719FE4828D7E5AE2403F09AF54F2EDE0FE31E56A9FD4EED129`；包内 EXE、Release EXE、portable EXE 均为 `AE05E1A6215221B38BDA525C7E39CF93DCC6B27B90CE5C4B400B1271F730CCE9`；Release EXE `2026-08-25 03:50:45` 晚于 `dist/index.html` `2026-08-25 03:47:35`。
- [包体指标](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-package-metrics-20260825-green.json>) 与 [候选 manifest](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest-candidate-20260825-package.json>) 已生成。候选 manifest 中 `release-package=pass`，但 500 KiB WebView2 输入和进程内存仍 `failed`，Gate B-P0 仍 `blocked`；正式 T4 manifest 未覆盖。
- 实机冒烟尚未闭合：当前旧隔离 Beta 进程 PID `44564` 仍运行，应用启用单实例插件；本轮不结束它、不读取笔记正文、不把旧窗口运行结果归因于新 Release。待该进程由 Owner/用户关闭后，再运行 `npm.cmd run smoke:release:input`。
- 本项只闭合 Phase 4 包体静态身份与可追溯性，不改变正式 T4 门槛、Gate D `0/20` / `0/14`、真实外部 AI `pending` 或默认 `legacy-preview`。

## 2026-08-25 Release smoke 单实例前置保护

- `scripts/smoke-release.ps1` 已增加启动前单实例检查：发现 `md-sticky-note` / `MarkdownStickyNote` 进程时立即失败，不创建新的 smoke 窗口，避免把 single-instance 转发结果误判为当前 Release 运行证据。
- TDD 合同 `tests/visualEditorSmokeContract.test.ts` 为 `7/7 pass`；PowerShell AST `errorCount=0`。当前 PID `44564` 的真实调用按预期退出码 `1`，返回 `Existing MKnote process detected`。
- 该项只提高实机证据安全性，不改变正式 T4 性能门槛、Gate D 或默认模式；旧隔离 Beta 关闭后仍需重新执行 `npm.cmd run smoke:release:input`。

## 2026-08-25 新绿色包 Release 实机冒烟通过

- 旧隔离 Beta 关闭后，`npm.cmd run smoke:release:input` 退出码 `0`；测试使用临时 AppData/AppRoot 和临时默认笔记，输入 marker 成功保存，耗时 `2722 ms`，冒烟结束后进程退出。
- [冒烟 metadata](<C:/Projects/MKnote/.codex-smoke/release-smoke-main.json>) 与 [截图](<C:/Projects/MKnote/.codex-smoke/release-smoke-main.png>) 证明窗口真实渲染、状态显示“本地 · 已保存”，不是仅凭进程退出码判定。
- Release EXE hash `AE05E1A6215221B38BDA525C7E39CF93DCC6B27B90CE5C4B400B1271F730CCE9` 与新 ZIP/portable EXE 一致；Phase 4 当前包的静态身份和基线运行时冒烟已闭合。
- 该结果不自动切换默认编辑器；Owner 已按简化范围确认真实外部 AI / `20/20` 普通笔记并通过 Gate D，`14/14` 观察为可选且本次未运行。严格 T4 的 500 KiB `press=0/1000` 与 Popout 内存失败保持原证据，但按 Owner 决策作为非阻塞已知限制，实际遇到问题后再处理。

## 2026-08-25 Owner 简化 Gate D 决策与当前出口

- Owner 明确确认真实外部 AI Test `pass`，20 篇真实普通笔记 `20/20 pass`，未发现问题。
- Gate D 正式采用简化条件：AI Test + 20 篇普通笔记 + Owner 确认即可；14 天连续观察改为可选，本次 `optional / not-run` 不阻塞 Gate D。
- 严格 T4 证据不被改写：500 KiB 正式 `press=0/1000` 和 Popout renderer 内存超 `50 MiB / 25%` 仍为 `failed`。在当前计划范围内，它们登记为非阻塞已知限制；若实际使用遇到问题，届时再做架构或门槛处理。
- 默认模式继续保持 `legacy-preview`。本次 Gate D 通过不等于自动默认化，不删除旧编辑器回退链路；默认化仍需单独的明确授权和发布评审。

### 当前接续动作

1. 保留 Gate D 简化通过记录，14 天观察作为可选补充，不要求 Owner 补做。
2. 保留严格 T4 的失败 artifact 与失败分类，不重复同类性能诊断；实际遇到 500 KiB 或 Popout 内存问题时再立项处理。
3. 如需进入默认化，另行确认默认切换、绿色包版本和发布验收范围。
