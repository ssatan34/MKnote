# MKnote 可视化编辑器 Phase 0 基线清单

生成日期：2026-08-21。本文描述 Phase 0 开始前的基线和本轮新增证据；工作区已有修改归用户所有。

## 版本与备份

| 项目 | 值 |
|---|---|
| 分支 | `codex/fix-trash-empty` |
| HEAD | `d7b0f75476513f6abd6eccf9900e8e59918ee2e3` |
| 初始备份 | `C:\Projects\MKnote-backups\MDnote-20260821-162232` |
| 初始备份规模 | 1142 个文件，252,507,289 bytes；排除 `node_modules` 与 `src-tauri/target` |
| CAS 接入前备份 | `C:\Projects\MKnote-backups\MDnote-20260821-165100-pre-cas` |
| CAS 故障注入前备份 | `C:\Projects\MKnote-backups\MDnote-20260821-182500-pre-cas-fault-injection`；761 个文件，169,919,735 bytes |
| 初始状态 | 既有 `src/`、`src-tauri/`、`tests/` 和文档修改；本轮未 reset、clean 或覆盖这些内容 |

初始备份目录同时保存 `working-tree.patch`、`working-tree-status.txt`、`baseline-head.txt` 和 `key-file-hashes.txt`。

## 关键文件 SHA-256（初始备份）

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| `src/components/EditablePreviewEditor.tsx` | 5400 | `32EDF6104832729080554A91C37D5D51E1EBC8887339F8F02CA40D62C0BF3153` |
| `src/components/compact/EditorPane.tsx` | 7108 | `014F69986C2E460C11B54A0F74863120C44962347B052F9535A7AD7402B22529` |
| `src/utils/luteMarkdown.ts` | 7486 | `E34484F0F46F95ECDD6183FA8DCBC62DE887E68FB56DA8F540D7CE61CB82CCE0` |
| `src/utils/editorFormat.ts` | 17940 | `88E118DDCCE3081FD8B53088E4CD917644ECA42FA4C1FFF117026E5CFB4B335` |
| `src/utils/previewDom.ts` | 9728 | `A59B20413B35E1ADC85700ED5D5A9C9A7AAD354C9A712EFB7900B20C4B53AE0D` |
| `src/App.tsx` | 97563 | `06DAAE9B7EEBCAE8E5D4A4B3EB9C4C30040EDFFFB551CB378A0F4C9DC96E4F0F` |
| `src/components/PopoutView.tsx` | 35831 | `85403395013B27991C5C2C1AFB32F02AE64E011B8BD8CA2F0DC517246A680E8E` |
| `src/hooks/useEditorHistory.ts` | 1833 | `39826D94785763DDAE70D835EED1FD11FE6CBABD6F80872EBBF73BA9A7E93BA5` |
| `src/hooks/useTabSessions.ts` | 1854 | `7ABE28C7809EA17C565D9D0C6C7345083ECFEE6D308322490DDD7EE01D4549FB` |
| `tests/luteMarkdownCompatibility.test.ts` | 2549 | `5D7F2537D4778C00D0804F40840E91C43BC7F2D6A44CDFBF8D2D1D2E45877AB2` |
| `tests/markdownRendering.test.ts` | 1770 | `E1E2568188B39D06A2BDCE1C08F78B929D7BB8F9EF104ABD414CCE65FBA23F3F` |
| `tests/previewCheckbox.test.ts` | 1258 | `805AA411512776B255EA54F09098EABDC6E8EA0ABFD699B3064B1DC564C313B5` |
| `docs/samples/preview-demo.md` | 456 | `59E395F4024A4B73856F353FC6E46FB3DFACAC3FC43F15F6C49C19535B611226` |
| `docs/samples/markdown-full-test.md` | 1582 | `5839261A435C514F46F4BF84854DD2DEF6E1154676D32B4B37F747AB24BEBB6C` |

## 本轮新增证据

- 规范化策略：`tests/fixtures/visual-editor/normalization-policy.json`，覆盖 26 份 `normalize` 语料，状态为 `pending-owner`；对应测试为 `tests/visualEditorNormalizationPolicy.test.ts`。
- 规范化策略测试结果：`normalization policy manifest` 2/2；全量 Phase 0 定向测试（新增该测试后）61/61。
- Node/Lute 性能基线（2026-08-22 04:36）：100 KiB median/p95 `263.29/295.15 ms`，500 KiB median/p95 `1286.33/1370.28 ms`；只代表 Node CPU 适配器开销，不代表 WebView2 或 Gate B。
- 语料：`tests/fixtures/visual-editor/corpus.ts`，128 份；基准输入：`benchmark.ts`，固定 100 KiB 与 500 KiB。
- 故障模型：`tests/fixtures/visual-editor/saveContractModel.ts`；编辑行为合同模型：`tests/fixtures/visual-editor/editorInteractionContractModel.ts`。
- 定向测试：`visualEditorSecurityContract.test.ts`、`visualEditorCorpus.test.ts`、`visualEditorNormalizationPolicy.test.ts`、`visualEditorSaveContract.test.ts`、`visualEditorBenchmark.test.ts`、`visualEditorSmokeContract.test.ts`、`visualEditorInteractionContract.test.ts`、`revisionAwareWriteQueue.test.ts`、`popoutSaveContract.test.ts`、`privateSaveContract.test.ts`、`windowTransitionSaveContract.test.ts`、`noteWriteTarget.test.ts`、`sourceAwareMarkdown.test.ts`、`luteMarkdownCompatibility.test.ts`；当前共 14 个文件、61/61 通过。
- 保存链：`NoteSnapshot`、`NoteRevision`、SHA-256 checked-write，以及前端 revision-aware 队列。
- 同名路径修复：`src/utils/noteWriteTarget.ts`；真实输入保存 smoke 已验证普通 `default-note.md` 写回其所在 zone。
- Release：`src-tauri/target/release/md-sticky-note.exe`，35,437,056 bytes；SHA-256 `4BDE5372006BEED84BECC7265FAB7AB8DF72CF853AF5E3CD27E3B9E8253A931A`。
- 真实窗口证据：`.codex-smoke/release-smoke-save-delay-0.json`、`-200.json`、`-1000.json`、`release-smoke-save-failure.json` 和 `release-smoke-cas-conflict.json`，对应截图同名 `.png`；主窗口 0/200/1000ms 输入保存、失败保留磁盘 seed、外部 CAS 冲突均通过。

## Gate A 状态

- 状态：未通过。
- 主要原因：当前 Markdown 往返 byte-equal 为 94/128；`normalize` 边界仍待 Owner 逐项确认。
- 其他缺口：普通连续键入的 Undo/Redo 事务分组、无边框窗口和用户手工验收仍未完成；微软拼音 IME、1000 次 composition、鼠标拖选、HTML/原生图片粘贴和 Popout 第二窗口已有隔离 Release 补充探针证据；Capsule、Private 隐藏和 request-quit 退出故障注入已补齐。
- 安全边界：Lute 适配器 Markdown / HTML URL 合同与隔离 Release 恶意 HTML 粘贴合同均已通过，但完整 WebView2 安全门仍未完成。
- 明确边界：不安装 Milkdown，不修改生产 `EditorPane`，不删除旧编辑器链路；Gate A 通过后才请求隔离 ProseMirror PoC。

## 2026-08-22 增量证据

- 规范化策略 manifest 后 checkpoint：`C:\Projects\MKnote-backups\MDnote-20260822-042704-phase0-normalization-policy-checkpoint`；774 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验一致；缺失、额外和不一致均为 0。
- 最新规范化策略 checkpoint：`C:\Projects\MKnote-backups\MDnote-20260822-043210-phase0-normalization-policy-checkpoint`；774 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验一致；缺失、额外和不一致均为 0。
| 项目 | 当前值 |
|---|---|
| Private flush 修复前备份 | `C:\Projects\MKnote-backups\MDnote-20260822-004808-pre-private-flush`；781 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`）逐一 SHA-256 校验通过 |
| Phase 0 当前状态增量备份 | `C:\Projects\MKnote-backups\MDnote-20260822-025110-phase0-current`；790 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`）逐一 SHA-256 校验通过 |
| IME 证据后当前 checkpoint | `C:\Projects\MKnote-backups\MDnote-20260822-041434-phase0-ime-evidence`；772 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验通过 |
| Gate A 清单后当前 checkpoint | `C:\Projects\MKnote-backups\MDnote-20260822-041659-phase0-gate-a-checkpoint`；772 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验通过 |
| 本次 Release | `src-tauri/target/release/md-sticky-note.exe`；35,437,056 bytes；SHA-256 `9439A7192E9E1A4C03C22BB7BECF1C47C10C4DFE98C21CE98EB2D52E1FEFBBE2` |
| 当前适配器 Release 复核 | `src-tauri/target/release/md-sticky-note.exe`；35,446,272 bytes；SHA-256 `BCED2F4852D1CBA69F9BB523198EDA3C38889584C33F1A2AEDF98D16381CCEAE`；真实窗口基础、输入保存、外部 CAS、普通保存失败、Capsule、Popout、Private 和退出故障路径通过 |
| 安全合同修复后构建 | `src-tauri/target/release/md-sticky-note.exe`；35,446,272 bytes；SHA-256 `504D7A6207347ABEBDE4B814B6F82A56DE6E6EDAFA8CF33D90DD2F6EF8E68102`；`npm.cmd run build`、Tauri `--no-bundle`、安全合同 3/3 通过；未重跑真实窗口 smoke |
| Private 故障注入 | `diskHasMarker=false`、`uiShowsSaveError=true`、`windowRemainsVisible=true`；`.codex-smoke/release-smoke-private-save-failure.json` / `.png` |
| Capsule / Popout 故障注入 | 两条路径均为磁盘无 marker、UI 有保存错误；`.codex-smoke/release-smoke-capsule-save-failure.json` / `.png`、`release-smoke-popout-save-failure.json` / `.png` |
| 定向验证 | 14 个计划相关测试文件 `61/61`；包含 normalization policy、Markdown / HTML 安全合同；PowerShell smoke 脚本解析通过；普通 Release smoke 通过 |
| Markdown / HTML 安全合同 | `tests/visualEditorSecurityContract.test.ts` 3/3 通过；危险协议、危险 Data URL、SVG Data URL、事件属性被拒绝，白名单 raster Data URL 保留；真实 WebView2 安全验收仍未完成 |
| WebView2 编辑行为探针 | `scripts/visual-editor-webview2-e2e.mjs`；隔离 Release 中编辑器 ready、DOM Selection、Clipboard、恶意 HTML 粘贴、自动保存和重载恢复通过；Undo/Redo 事务分组失败（Ctrl+Z 仅删最后一个字符），微软拼音 IME 未执行；证据 `.codex-smoke/visual-editor-webview2-e2e.json` / `.png` |
| Undo 失败路径审查 | `EditablePreviewEditor` 每次输入经 Lute 回写 Markdown，再由 `content` effect 重建 `innerHTML`；真实 WebView2 慢速输入仍只撤销最后一个字符；该链路列为 Phase 1A PoC 的禁止复用项 |

本增量同时补充硬换行、任务标记和 Callout 保真合同；Gate A 仍因 `94/128` 往返保真、`normalize` Owner 决策和真实 WebView2 编辑行为未完成而保持未通过。

## 2026-08-22 直接往返差异索引

| 分类 | 数量 | 固定样例索引 | source-aware 结果 |
|---|---:|---|---|
| `native` | 5 | `gfm-blocks`、`task-list`、`table-basic`、`table-hard-break`、`nested-ordered-list` | 尚未解决；需冻结稳定输出合同 |
| `normalize` | 21 | `setext-heading`、`synthetic-001` … `synthetic-096`（每 5 份一组） | 待 Owner 批准规范化边界 |
| `raw` | 5 | `front-matter`、`raw-html-block`、`html-comment`、`siyuan-block-ref`、`siyuan-ial` | 与 `safe-source` 合计 9/9 byte-equal |
| `safe-source` | 3 | `footnotes`、`unsafe-html`、`unsafe-url` | 与 `raw` 合计 9/9 byte-equal |

该索引描述的是直接 Lute 往返，不代表生产 `EditorPane` 已接入新编辑器，也不改变 Gate A 未通过状态。

## 2026-08-22 退出路径证据

| 项目 | 当前值 |
|---|---|
| 退出保存失败 smoke | `-VerifyExitSaveFailure`；`diskHasMarker=false`、`uiShowsSaveError=true`、`windowRemainsVisible=true` |
| 退出截图 | `.codex-smoke/release-smoke-exit-save-failure.png` |
| 退出路由合同 | `tests/visualEditorSmokeContract.test.ts`；托盘菜单与 `--quit` 均必须发出 `mknote:request-quit`，禁止无 flush 直退 |

## 2026-08-22 03:41 WebView2 探针重跑

- 使用当前 Release（35,446,272 bytes；SHA-256 `504D7A6207347ABEBDE4B814B6F82A56DE6E6EDAFA8CF33D90DD2F6EF8E68102`）和临时数据根目录重跑 `scripts/visual-editor-webview2-e2e.mjs`。
- 通过：编辑器 ready、DOM 选区替换、剪贴板复制粘贴、恶意 HTML 粘贴清理、自动保存和重载恢复。
- 未通过：普通连续键入的 Undo/Redo 事务分组（一次 Ctrl+Z 只删除最后一个字符）。微软拼音真实 IME、1000 次 composition、鼠标拖选、HTML/原生图片粘贴和 Popout 第二窗口已由补充探针覆盖。
- 证据：`.codex-smoke/visual-editor-webview2-e2e.json`、`.codex-smoke/visual-editor-webview2-e2e.png`。探针以退出码 1 结束是因为保留了上述失败结果，不代表报告生成失败。

## 2026-08-22 03:53 WebView2 补充探针

- `scripts/visual-editor-webview2-extra-e2e.mjs` 使用当前 Release 和临时数据根目录运行，4/4 通过：鼠标拖选替换、HTML 栅格图片粘贴、原生 `image/png` 剪贴板粘贴、真实 UI Popout 第二窗口。
- 原生图片粘贴生成了 `File/assets/*.png` 关系属性及图片调整框架；Popout 页面已观察并关闭，隔离数据不会写入正式资料库。
- 证据：`.codex-smoke/visual-editor-webview2-extra-e2e.json`、`.codex-smoke/visual-editor-webview2-extra-e2e.png`。这不改变普通连续键入的 Undo/Redo 事务失败和 `94/128` 往返状态。

## 2026-08-22 04:12 WebView2 真实 IME 增补

- 真实 Windows `00000804` 微软拼音单次 composition 通过：`ni` 期间可观察 composition，提交为 `你`，Ctrl+Z 清除，Ctrl+Y 恢复。
- 1000 次真实 composition 通过：`expectedCount=1000`、`actualCount=1000`、`textLength=1000`。
- 证据：`.codex-smoke/visual-editor-webview2-extra-e2e.json` / `.png`；补充探针 6/6 通过。普通连续键入 Undo/Redo 失败仍需新编辑器结构化事务解决。
