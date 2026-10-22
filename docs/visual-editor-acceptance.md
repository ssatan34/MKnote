# MKnote 可视化编辑器 Phase 0 验收记录

> 文档首建日期：2026-08-22；当前快照更新至 2026-08-26。
>
> 当前结论：Phase 0 / Gate A、Phase 1A 隔离证据、Phase 2 P0/Gate C 显式 visual Beta、Phase 3 P1 主场景和简化 Gate D 均已有通过证据；Owner 已确认 Visual Editor 完整人工测试、预览工具条与资料库交互、真实外部 AI Test 和 20 篇普通笔记通过。当前源码在未设置环境变量时默认解析为 `visual-prosemirror`；v5.0.0 绿色包静态构建和包体核验均已通过（[ZIP](<C:/Projects/MKnote/MKnote-portable-v5.0.0-20260826-174751.zip>)，SHA-256 `BC7C3E603CBB318DF59CCAA82453A0710E53E6D25CCD982648E26D41D1FAA480`）；Private/Capsule 继续保留保护旧链路。严格 T4 的 500 KiB `press` / `10 Tab + 1 Popout` 内存失败按 Owner 决策作为非阻塞已知限制。T5 的唯一手工记录入口为 [visual-editor-t5-owner-checklist.md](<C:/Projects/MKnote/docs/visual-editor-t5-owner-checklist.md>)。

## 当前快照（2026-08-26）

- Gate C 已在显式 visual Beta 范围通过；表格、代码块、块引用、图片、Wikilink、AI 选区、分割线、查找替换和 Popout visual P0 均已有主场景证据，Capsule/Private 仍保持保护边界。
- Gate D：真实外部 AI Test `pass`、普通笔记 `20/20 pass`、Owner 确认 `pass`；14 天观察为 `optional / not-run`。正式 T4 的 500 KiB `press` 与 `10 Tab + 1 Popout` 内存失败继续保留，但不阻塞当前简化 Gate D。
- 当前源码的默认模式为 `visual-prosemirror`；显式传入 `legacy-preview` 时不进入 Visual 预览，转入源码恢复入口，Private/Capsule 不因默认切换而扩大 visual 支持。
- Owner 于 2026-08-26 确认代码块收起、编辑模式按钮撤销、标题光标位置、标题折叠和默认便签新建按钮/退出状态修复均验收通过。
- 默认 Visual Editor 已接入 source-aware 内容路由：无法安全交给可写 ProseMirror 的原子语法会显示明确源码恢复提示，不再静默进入 serializer；Wikilink、下划线和高亮保留 Visual 路径。
- v5.0.0 对应的最终绿色包、默认 Release 输入保存冒烟已完成；本文件后续历史段落保留原始验收时间线，不覆盖以上当前快照。

## 备份与基线

| 项目 | 结果 | 证据 |
|---|---|---|
| 项目备份 | 通过 | `C:\Projects\MKnote-backups\MDnote-20260821-162232`；1142 个文件、252,507,289 bytes；排除 `node_modules` 和 `src-tauri/target` |
| CAS 接入前追加备份 | 通过 | `C:\Projects\MKnote-backups\MDnote-20260821-165100-pre-cas`；用于保存链改动前恢复 |
| CAS 故障注入前追加备份 | 通过 | `C:\Projects\MKnote-backups\MDnote-20260821-182500-pre-cas-fault-injection`；761 个文件、169,919,735 bytes；排除 `.git`、`node_modules`、`src-tauri/target` 和 `.codex-smoke` |
| 工作区基线 | 通过 | 初始 HEAD `d7b0f75476513f6abd6eccf9900e8e59918ee2e3`；分支 `codex/fix-trash-empty`；既有 dirty worktree 未清理、未覆盖 |
| Private flush 修复前追加备份 | 通过 | `C:\Projects\MKnote-backups\MDnote-20260822-004808-pre-private-flush`；781 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`）逐一存在且 SHA-256 一致 |
| Phase 0 当前状态增量备份 | 通过 | `C:\Projects\MKnote-backups\MDnote-20260822-025110-phase0-current`；790 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`）逐一 SHA-256 校验一致 |
| IME 证据后当前 checkpoint | 通过 | `C:\Projects\MKnote-backups\MDnote-20260822-041434-phase0-ime-evidence`；772 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验一致 |
| Gate A 清单后当前 checkpoint | 通过 | `C:\Projects\MKnote-backups\MDnote-20260822-041659-phase0-gate-a-checkpoint`；772 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验一致 |
| 规范化策略 manifest 后当前 checkpoint | 通过 | `C:\Projects\MKnote-backups\MDnote-20260822-042704-phase0-normalization-policy-checkpoint`；774 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验一致；缺失、额外和不一致均为 0 |
| 最新规范化策略 checkpoint | 通过 | `C:\Projects\MKnote-backups\MDnote-20260822-043210-phase0-normalization-policy-checkpoint`；774 个源文件（排除 `.git`、`node_modules`、`src-tauri/target`、`.codex-smoke`）逐一 SHA-256 校验一致；缺失、额外和不一致均为 0 |

## 已完成的 Phase 0 证据

| 项目 | 结果 | 证据 |
|---|---|---|
| 合成兼容语料 | 通过 | 128 份：28 份核心样例 + 100 份固定种子样例；不读取真实用户笔记 |
| 语法分类 | 通过 | `native` 93、`normalize` 26、`raw` 6、`safe-source` 3；详见 `visual-editor-support-matrix.md` |
| 规范化策略 manifest | Owner 已确认 | `tests/fixtures/visual-editor/normalization-policy.json` schemaVersion 2；3 个决策组覆盖全部 26 份 `normalize` 语料；`tests/visualEditorNormalizationPolicy.test.ts` 2/2 |
| 当前 Lute 渲染探针 | 通过 | 93 份 `native` 样例均产生非空 HTML，未出现 parser 异常 |
| 当前往返保真 | 按分类通过 | HTML → Markdown 逐字节相等 94/128（73.438%）；其余 34 份已按 `native` 的已知差异、Owner 批准的编辑范围规范化、`raw` 或 `safe-source` 分类登记；未编辑文档和未触碰块仍要求 byte-equal |
| 保存合同故障模型 | 通过（模型） | `tests/visualEditorSaveContract.test.ts` 覆盖 0/200/1000ms、调用时 revision 捕获、写入失败、Tab、Popout、Capsule、Private、隐藏、退出和外部冲突，共 12 项 |
| 前端 revision-aware 队列 | 通过（单测） | `tests/revisionAwareWriteQueue.test.ts` 验证连续写入沿用成功返回的 content hash，以及冲突传播 |
| Popout / Private / 窗口转换接入 | 通过（契约测试） | Popout、Private 均复用 revision-aware 写入；Capsule 与 Popout 转换会先等待目标笔记 flush |
| Rust CAS | 通过（单测） | SHA-256 snapshot、checked-write 成功和 stale hash 拒绝；默认便签与普通便签 Tauri command 已接入 |
| 同名默认便签路径修复 | 通过（测试与真实 smoke） | `src/utils/noteWriteTarget.ts` 与 `tests/noteWriteTarget.test.ts`；同名普通笔记写回所在 zone，显式根默认便签才写根文件 |
| Phase 0 定向测试 | 通过 | 当前相关 14 个测试文件共 61/61：包含 normalization policy、source-aware、Lute 兼容语料、编辑行为合同、基准、保存合同、revision-aware 队列、Popout、Private、窗口转换、退出路由、同名路径回归和安全合同 |
| Markdown / HTML 安全合同 | 通过（适配器合同） | `tests/visualEditorSecurityContract.test.ts` 共 3/3；渲染和 HTML 回写均拒绝 `javascript:`、`vbscript:`、危险 Data URL、SVG Data URL 与事件属性，同时保留 PNG Data URL |
| WebView2 编辑行为探针 | 部分通过（隔离实机合同） | `scripts/visual-editor-webview2-e2e.mjs` 验证编辑器挂载、DOM 选区替换、剪贴板复制粘贴、恶意 HTML 粘贴清理、自动保存和重载恢复；Undo/Redo 未通过：一次 Ctrl+Z 只删除最后一个字符；微软拼音真实 IME 未执行 |
| 构建与静态检查 | 通过 | `npm.cmd run build`、`npm.cmd run tauri build -- --no-bundle`、`git diff --check` |
| Release 构建 | 通过 | `src-tauri/target/release/md-sticky-note.exe`，35,437,056 bytes；SHA-256 `4BDE5372006BEED84BECC7265FAB7AB8DF72CF853AF5E3CD27E3B9E8253A931A` |
| Release 基础 smoke | 通过 | 2026-08-21 23:53；真实窗口、截图、窗口元数据和亮度检查通过；延迟 0ms 证据 `.codex-smoke/release-smoke-save-delay-0.json` / `.png` |
| Release 输入保存 smoke | 通过 | 同一 Release 在 0/200/1000ms 注入下均写入隔离目录 `App\File\default\default-note.md`；metadata 记录 observed `elapsedMs` 2358/2389/3317（含 UI 聚焦、防抖和 300ms 轮询，不等同于纯写入耗时）；证据 `.codex-smoke/release-smoke-save-delay-0.json`、`-200.json`、`-1000.json` 及对应截图 |
| Release 保存失败 smoke | 通过 | 失败注入时 `diskHasMarker=false`、`uiShowsSaveError=true`；证据 `.codex-smoke/release-smoke-save-failure.json` / `.png` |
| Release CAS 外部冲突 smoke | 通过 | 2026-08-21 23:46；Windows PowerShell 5.1 + WebView2 隔离运行；磁盘只保留 external marker，UI Automation 同时读到 local marker 与“便签已被外部修改，拒绝覆盖当前版本”；证据 `.codex-smoke/release-smoke-cas-conflict.json` / `.png` |

## 本轮真实 smoke 的根因与修复

输入保存 smoke 首次失败时，程序打开的是 `File/default/default-note.md`，但前端仅按文件名 `default-note.md` 选择了根目录 `default-note.md` 的写入命令。读取 hash 与写入路径不一致，后端正确拒绝覆盖并显示“便签已被外部修改”。

已将路由条件收紧为 `zone + name + 显式根默认便签状态`，并保留 CAS 拒绝行为；修复后重新构建 Release，基础 smoke 和输入保存 smoke 均通过。该成功 smoke 不等同于完整的真实 CAS 延迟、失败和外部冲突故障注入。

## 当前未验收项

- Popout、Capsule、Private 隐藏路径的真实保存故障注入已完成；退出路径已补充 request-quit 故障注入，完整 WebView2 编辑行为仍待验收。
- 普通连续键入的 Undo/Redo 事务分组、无边框窗口以及用户手工验收；微软拼音 IME、1000 次 composition、鼠标拖选、HTML/原生图片粘贴和 Popout 第二窗口已有隔离 Release 补充探针证据，但尚未达到计划中的完整门槛。
- 允许规范化的逐项清单已由 Owner 确认；默认仍禁止全局静默规范化，表格和节点级 canonicalization 受编辑范围约束。
- 图片正式节点属性、Wikilink、AI 选区和外部文件冲突恢复的真实窗口验收。

## Gate A 边界

- 当前只维护 Phase 0 语料、测试和文档；不安装 Milkdown，不修改生产 `EditorPane`，不删除旧链路。
- `tests/fixtures/visual-editor/normalization-policy.json` 已将 26 份 `normalize` 语料分成 3 个待确认决策组；manifest 的 `normalizationAllowed` 保持 `false`，没有声明任何允许的 canonical diff。
- 进入 Phase 1 前，需要 Owner 确认该 `normalize` manifest，并批准在隔离数据根目录中进行真实 Tauri CAS 故障注入和窗口验收。

## 本轮 source-aware 探针

- `tests/sourceAwareMarkdown.test.ts`：6/6 通过。
- `src/utils/sourceAwareMarkdown.ts` 已建立最小原文保护层：front matter、原始 HTML、HTML 注释、思源块引用 / IAL、Wikilink、脚注和危险 URL 会产生可恢复 source span。
- 9/9 个 `raw` / `safe-source` 核心样例均能识别并恢复为原始字节；经过 Lute HTML/Markdown 往返后仍 byte-equal；邻近普通 Markdown 编辑不会改变原子块。
- Lute 适配器已为普通段落区分软换行与显式硬换行，并保留引用块前缀；表格单元格中的 HTML `br` 不进入硬换行占位链路。
- Lute 适配器已保留硬换行的两个空格 / 反斜杠写法，以及任务列表 `[x]` / `[X]` 的原始大小写。
- Lute 适配器已恢复 NOTE / TIP Callout 的 subtype 与块引用语法；列表空行、表格对齐和 Setext 仍保留为待 Owner 确认的规范化边界。
- 占位符缺失、重复、未闭合 front matter 会拒绝写回；白名单栅格 Data URL 保持 `native`，危险 Data URL 进入 `safe-source`。
- source-aware Node 微基准（2 轮预热、5 轮采样，含保护与恢复）：100 KiB 中位数 1.80 ms / p95 2.24 ms，500 KiB 中位数 7.31 ms / p95 9.48 ms；仅代表适配器 CPU 开销，不代表 WebView2 key-to-paint、DOM、IME、保存或内存门槛。
- `scripts/smoke-release.ps1` 新增显式 `-SaveDelayMs` / `-VerifySaveFailure` 入口，Rust 钩子只有在 `MKN_TEST_SAVE_DELAY_MS` / `MKN_TEST_SAVE_FAILURE` 被 smoke 设置时才生效；正常环境变量已验证未残留。
- 该证据仍是 source-aware 适配器单测与固定语料探针，不等同于 Milkdown/ProseMirror 接入或真实 WebView2 验收；Gate A 继续保持未通过。
- Phase 1 即使批准，也必须先做不连接生产保存的隔离 ProseMirror PoC。

## 2026-08-22 保存故障注入增补

| 路径 | 结果 | 证据 |
|---|---|---|
| Private 隐藏 | 通过 | `flushAllDirty` 先等待 Private 脏内容；故障注入下 `diskHasMarker=false`、`uiShowsSaveError=true`、`windowRemainsVisible=true`；`.codex-smoke/release-smoke-private-save-failure.json` / `.png` |
| Capsule 保存 | 通过 | 故障注入下磁盘无 marker、UI 有保存错误；`.codex-smoke/release-smoke-capsule-save-failure.json` / `.png` |
| Popout 保存 | 通过 | 故障注入下磁盘无 marker、UI 有保存错误；`.codex-smoke/release-smoke-popout-save-failure.json` / `.png` |
| 普通 Release 窗口 | 通过 | `npm run smoke:release`；主窗口尺寸 `1162x973`，亮度检查通过 |
| 定向测试 | 通过 | 计划相关 13 个测试文件共 `59/59`；包含 Markdown / HTML 安全合同；PowerShell smoke 脚本解析通过 |

本轮修复了两处保存安全问题：`flushAllDirty` 现在覆盖 Private 脏内容；`flushPrivateNote` 写入失败会继续抛出，隐藏操作因此不会吞错并隐藏窗口。Private smoke 不再改写临时 config 或重启进程，而是在初始窗口中 Ctrl+点击状态栏字数区域进入 Private，再点击右上角隐藏按钮验证真实路径。

## 2026-08-22 当前适配器 Release 复核

- 当前 Release：`src-tauri/target/release/md-sticky-note.exe`，35,446,272 bytes；SHA-256 `BCED2F4852D1CBA69F9BB523198EDA3C38889584C33F1A2AEDF98D16381CCEAE`。
- 安全合同修复后重新构建：同一 Release 路径，35,446,272 bytes；SHA-256 `504D7A6207347ABEBDE4B814B6F82A56DE6E6EDAFA8CF33D90DD2F6EF8E68102`；`npm.cmd run build`、Tauri `--no-bundle` 和安全合同通过，未将本次新构建冒充为已重跑真实窗口 smoke。
- 真实窗口基础 smoke、输入自动保存和外部 CAS 冲突重跑通过；当前窗口 `1162x973`，亮度范围 234。
- `-VerifySaveFailure`、`-VerifyCapsuleSave`、`-VerifyPopoutSave`、`-VerifyPrivateSave` 分别重试通过；四路组合首次运行曾出现 Capsule/Popout 窗口发现超时，未将该次失败误记为保存断言通过。

以上证据分别证明保存一致性、窗口故障处理和一组隔离 WebView2 编辑合同；Lute 往返现为 `94/128` byte-equal，Owner 尚未确认 `normalize` 边界，微软拼音 IME 与完整 WebView2 门槛仍未完成，因此 Gate A 保持未通过。

## 2026-08-22 退出保存故障增补

| 路径 | 结果 | 证据 |
|---|---|---|
| 托盘退出路由 | 通过（结构合同） | Rust 托盘菜单不再直接 `app.exit(0)`，而是发出 `mknote:request-quit`；前端 flush 成功后才调用 `exit_app`。 |
| 退出保存失败 | 通过（Release smoke） | `-VerifyExitSaveFailure` 经 single-instance `--quit` 转发真实退出请求；`diskHasMarker=false`、`uiShowsSaveError=true`、`windowRemainsVisible=true`；`.codex-smoke/release-smoke-exit-save-failure.png`。 |

该 smoke 验证的是托盘和 `--quit` 共用的 `request-quit` 前端路径；托盘菜单物理点击未伪装成已自动化验收，已由 Rust 结构合同覆盖。

## 2026-08-22 编辑行为合同增补

- `tests/visualEditorInteractionContract.test.ts` 与 `tests/fixtures/visual-editor/editorInteractionContractModel.ts` 共 6 项通过，冻结了选区替换、光标位置、IME composition 合并为单次 undo、剪贴板复制 / 粘贴、Undo / Redo、序列化错误恢复和非法选区拒绝。
- 该模型不连接生产 `EditorPane`，不读取真实笔记，也不代表 Windows WebView2、微软拼音或真实 DOM 行为已验收。

### WebView2 Undo 失败路径审查

- 源码路径：`EditablePreviewEditor` 的 `onInput` 读取整棵 `innerHTML` 并调用 `luteHtmlToMarkdown`；`App.handleContentChange` 更新 `content` 后，编辑器 effect 再以 `markdownToHtml(content)` 重写 `innerHTML`。
- 实机结果：在隔离 Release、35ms 键盘事件间隔下，`undo baseline plus` 执行一次 `Ctrl+Z` 后变为 `undo baseline plu`，再次 `Ctrl+Y` 才恢复完整文本。
- 结论：当前 legacy preview 的整篇 DOM 回写链不能作为新编辑器的 Undo 事务实现；Phase 1A PoC 必须保持结构化编辑状态和事务边界，禁止每键重建整棵 DOM。该审查不授权在 Gate A 前修改生产 `EditorPane`。

## 2026-08-22 直接 Lute 往返差异清单

本清单只记录当前适配器的可复现实测结果，不预先批准任何格式规范化。对 128 份固定语料执行 `luteMarkdownToHtml → luteHtmlToMarkdown`，逐字节相等为 `94/128`，不相等为 34 份：

| 分类 | 数量 | 当前差异样例 | 观察到的变化 | 当前处理 |
|---|---:|---|---|---|
| `native` | 5 | `gfm-blocks`、`task-list`、`table-basic`、`table-hard-break`、`nested-ordered-list` | 嵌套列表附近出现额外空行；表格分隔行宽度、单元格填充和 `<br>` 形式可能被统一；表格中的显式换行可能改变行结构 | 待 Owner 确认 native 的稳定输出要求；不静默接受 |
| `normalize` | 21 | `setext-heading`、`synthetic-001` … `synthetic-096`（每 5 份一组） | Setext 下划线被转义为普通文本；合成样例继承同一差异 | Owner 已确认已有 Setext 保留；新建标题默认 ATX；显式标题操作才允许转换 |
| `raw` | 5 | `front-matter`、`raw-html-block`、`html-comment`、`siyuan-block-ref`、`siyuan-ial` | 直接进入 Lute 时原始语法被转义或改写 | 不把直接 Lute 往返作为 raw 保真路径；必须走 source-aware |
| `safe-source` | 3 | `footnotes`、`unsafe-html`、`unsafe-url` | 直接进入 Lute 时被转义、删除或降级 | 必须保持安全回退；不得进入可写新编辑器 |

## 2026-08-22 安全协议合同增补

- `tests/visualEditorSecurityContract.test.ts`：3/3 通过。
- Markdown → HTML 与 HTML → Markdown 两条适配器路径均清理 `javascript:`、`vbscript:`、`data:text/html`、`data:application/xhtml+xml` 和 SVG Data URL；同时移除事件属性与含危险 URL 的样式属性。
- PNG/JPEG/GIF/WebP/AVIF 的 base64 Data URL 保留；本地相对路径、HTTP(S) 图片和 `asset://localhost` 保留在白名单内。
- 这是 Lute 适配器的安全合同与 Node 测试证据，不代表生产 `EditorPane`、WebView2 DOM、粘贴路径或真实窗口安全验收已经完成；Gate A 仍未通过。

`raw` / `safe-source` 的 source-aware 核心语料仍为 `9/9` byte-equal；因此上述 8 份差异不能被解释为 source-aware 合同失败。Gate A 仍需 Owner 确认前两类的规范化边界，并补齐真实 WebView2 编辑行为验收。

## 2026-08-22 03:41 WebView2 探针重跑

| 项目 | 结果 | 证据 |
|---|---|---|
| 最新隔离 Release | 已复核 | `src-tauri/target/release/md-sticky-note.exe`；35,446,272 bytes；SHA-256 `504D7A6207347ABEBDE4B814B6F82A56DE6E6EDAFA8CF33D90DD2F6EF8E68102` |
| WebView2 编辑行为 | 部分通过 | 编辑器 ready、DOM 选区替换、剪贴板复制粘贴、恶意 HTML 粘贴清理、自动保存、重载恢复通过；`.codex-smoke/visual-editor-webview2-e2e.json` / `.png` |
| Undo / Redo 事务分组 | 未通过 | `afterType="undo baseline plus"`、`afterUndo="undo baseline plu"`、`afterRedo="undo baseline plus"`；一次 Ctrl+Z 只删除最后一个字符 |
| 微软拼音真实 IME | 初次未执行 | 初次 Playwright 探针不能证明真实 composition；补充探针已在 Windows `00000804` 输入法下完成真实 composition 验证 |

本次探针进程因上述预期失败项以退出码 1 结束；报告已完整写出，不能把它计为整体通过。为兼容当前 bundled Playwright 的 CommonJS 导出，探针增加了 named/default `chromium` 读取兜底；`node --check` 与当前 Phase 0 定向测试 `61/61` 均通过。

## 2026-08-22 03:53 WebView2 补充探针

| 项目 | 结果 | 证据 |
|---|---|---|
| 鼠标选区替换 | 通过 | 通过 WebView2 `page.mouse` 在 `contentEditable` 中拖选并替换文本；结果为 `mouse selection replacement` |
| HTML 栅格图片粘贴 | 通过 | PNG Data URL 保留为 `<img>`；仅使用隔离剪贴板和临时笔记 |
| 原生 PNG 剪贴板粘贴 | 通过 | `image/png` Blob 粘贴后生成带 `data-mk-rel="File/assets/...png"` 的图片节点和可调整宽度框架 |
| Popout 窗口 | 通过 | 真实 UI 打开资料库、新建隔离笔记、Tab 右键“在新窗口中打开”；CDP context 观察到第二窗口并成功关闭 |

证据：`scripts/visual-editor-webview2-extra-e2e.mjs`、`.codex-smoke/visual-editor-webview2-extra-e2e.json` / `.png`。该阶段记录的是 WebView2 事件和窗口页面；真实微软拼音与 1000 次 composition 已在随后增补中单独验证，用户手工验收仍未完成。

## 2026-08-22 04:12 WebView2 真实 IME 增补

| 项目 | 结果 | 证据 |
|---|---|---|
| 微软拼音单次 composition | 通过 | 真实 Windows `00000804` 输入：composition 期间为 `ni`，提交为 `你`；Ctrl+Z 后为空，Ctrl+Y 后恢复 `你` |
| 微软拼音 1000 次 composition | 通过 | `expectedCount=1000`、`actualCount=1000`、`textLength=1000` |
| 补充探针总结果 | 通过 | `real-microsoft-pinyin-composition`、`real-microsoft-pinyin-1000-composition`、鼠标选区、两种图片粘贴和 Popout 共 6/6；`.codex-smoke/visual-editor-webview2-extra-e2e.json` / `.png` |

该证据来自当前 Windows 交互桌面的真实微软拼音输入，不修改系统语言列表；输入仅写入临时数据根目录。普通连续键入的 Undo/Redo 失败仍保留为独立问题。

## Gate A 已确认清单

Owner 于 2026-08-22 采纳参考软件对比后的四项决策，机器可审计合同见 `tests/fixtures/visual-editor/normalization-policy.json`：

1. 嵌套列表和表格结构属于 `native`；表格列宽、空白、分隔线和 pipe escape 只在用户编辑的表格块内 canonicalize，未触碰表格保持 byte-equal。
2. 已有 Setext 标题默认保留；新建标题默认 ATX；用户明确改变标题级别或样式时才允许转换。
3. 图片通过正式节点属性保存 `src`、`alt`、`title`、`sourceKind`、`localRel`、`originalLocalRel`、`hostedUrl`、`width`、`doodledUrl`；HTML 属性不作为正式合同。

4. 行内数学列为 P2；未编辑时保留原始 source，明确编辑后才使用稳定的 `$...$` 形式，块数学使用 `$$`。

默认合同仍禁止全局静默规范化。Gate A 只批准进入隔离 PoC，不批准安装依赖到生产 manifest、修改生产 `EditorPane` 或接管现有保存链。

## 2026-08-22 规范化策略 manifest 与 Gate A 决策增补

- `tests/fixtures/visual-editor/normalization-policy.json` 是机器可审计的 Phase 0 策略清单，schemaVersion 2；包含 Setext/合成标题 21 份、图片元数据 4 份、行内数学 1 份，Owner 已确认所有变化必须受编辑范围约束。
- `tests/visualEditorNormalizationPolicy.test.ts` 从 `corpus.ts` 反向校验 manifest 的覆盖集合、重复项、分类和 Owner 状态；本轮 2/2 通过。
- 当前 manifest 只记录待确认问题和观测到的差异，不授予任何 canonical diff；Owner 确认前 Gate A 仍未通过。

## 2026-08-22 04:36 Node/Lute 性能基线重跑

- 当前工作区使用 `node --experimental-strip-types tests/visualEditorBenchmarkRunner.ts` 重跑，5 轮预热、30 次样本。
- 100 KiB：median `263.29 ms`，p95 `295.15 ms`；500 KiB：median `1286.33 ms`，p95 `1370.28 ms`。
- 该结果只测 `luteMarkdownToHtml` 的 Node CPU 时间，不代表 WebView2 DOM paint、IME、React mount、真实保存、窗口内存或未来 ProseMirror 性能，也不构成 Gate B 通过证据。

## 2026-08-22 Phase 1A 隔离 PoC 自动化验收

本轮完成 `poc/visual-editor-phase1a` 的核心手感闭环。该目录是私有实验包，只观察 Milkdown / ProseMirror 的运行时状态和临时 Markdown 序列化，不连接生产 `EditorPane`、`.md` 写入、`useQueuedNoteWriter` 或现有保存队列。

| 项目 | 结果 | 证据 |
|---|---|---|
| Phase 1A 合同单测 | 通过 | `poc/visual-editor-phase1a` 执行 `npm.cmd test`，4/4；包含真实 WebView2 探针端口与 Cargo target 隔离合同 |
| TypeScript 与 Vite 构建 | 通过 | 执行 `npm.cmd run build` |
| Playwright 浏览器交互 | 通过 | `npm.cmd run test:e2e`，6/6，Edge、单 worker；覆盖中文输入、Undo/Redo、列表 Enter/Backspace/Tab/Shift+Tab、任务勾选事务、DOM 选区替换和键盘剪贴板 |
| GREEN checkpoint | 通过 | Git commit `9b8db38`，只包含 PoC 依赖、配置、任务交互样式和 E2E 测试 |

本轮自动化证据只证明隔离 PoC 的结构化编辑事务和临时序列化路径。尚未证明微软拼音 IME、用户手工输入手感、图片、source-aware 原子块、生产保存链、性能门槛或数据迁移。

另记录一个必须在生产适配器前解决的观察：Milkdown 临时 serializer 在任务事务后可能将无序列表标记输出为 `*`。本轮 E2E 只断言任务语义 `[ ]` / `[x]`，不把 `-` 或 `*` 视为已批准的全局规范化；这不构成未触碰 Markdown byte-equal 证据。后续必须把列表标记保真或明确的编辑范围规范化纳入 source-aware / Markdown Adapter 合同。

## 2026-08-22 Phase 1A 真实 WebView2 隔离探针

为满足 Phase 1A 的真实桌面门槛，新增 `poc/visual-editor-phase1a/src-tauri` 隔离 Tauri harness。它只嵌入 PoC `dist`，identifier 为 `com.sin.mknote.visual-editor-phase1a`，不注册生产命令、不读取 `.md`、不连接保存队列；Vite 明确忽略 harness 的 `src-tauri/target`，避免 Windows DLL 锁定导致 dev server 误报失败。

| 项目 | 结果 | 证据 |
|---|---|---|
| Tauri harness 合同 | 通过 | `node --test tests/phase1aHarnessContract.test.mjs`；隔离 identifier、静态 dist、可见窗口、禁用 bundle 和无生产保存命令 |
| Rust harness 编译 | 通过 | `cargo check --manifest-path poc/visual-editor-phase1a/src-tauri/Cargo.toml`；并完成 `cargo build` |
| 真实 WebView2 CDP 探针 | 通过 | `MKN_PHASE1A_DEV_PORT=4183`、`MKN_PHASE1A_CDP_PORT=9251` 执行 `npm.cmd run test:webview2`；`webview2-ready`、中文输入/Undo/Redo、列表、任务事务、选区替换、剪贴板、表格工具均通过；`real-os-ime` 明确为 `not-run` |
| 实机截图 | 已生成 | `poc/visual-editor-phase1a/artifacts/phase1a-webview2-e2e.png`；报告为 `phase1a-webview2-e2e.json` |

这仍不是用户验收：探针使用 CDP 合成键盘事件，微软拼音 composition、候选翻页、中英切换、真实用户对“唤起即写/持续输入/撤销/粘贴”是否丝滑的判断均未完成。Phase 1B（表格、图片等）继续保持冻结，直到 Owner 完成该隔离窗口的手工验收。

## 2026-08-22 Phase 1A 真实 Microsoft Pinyin OS 输入探针

为补足上一节 CDP 探针不能证明真实输入法的边界，新增 `npm.cmd run test:webview2:ime`。它直接启动已编译的隔离 harness，使用临时 WebView2 用户数据目录和独立窗口，通过 Windows `LoadKeyboardLayout('00000804')` 与 `SendKeys.SendWait` 发送 Microsoft Pinyin 按键；不读取或写入生产 `.md`，并在退出后重试清理临时目录。

| 项目 | 结果 | 证据 |
|---|---|---|
| Microsoft Pinyin composition | 通过 | `layout=8040804`；输入中间态 `ni'hao`，提交后为 `你好` |
| 真实输入 Undo / Redo | 通过 | 物理 Ctrl+Z 移除“你好”，Ctrl+Y 恢复“你好” |
| 1000 次 composition | 通过 | 期望 1000，实际 1000 个“你”，无残留拼音 |
| 临时目录清理 | 通过 | 最新报告中无 `cleanup` 失败项 |

该证据关闭了 Phase 1A 的客观 OS IME 探针缺口，但仍不等于 Owner 的主观手感验收；唤起即写、候选翻页、光标稳定性和“丝滑”判断仍需人工完成。Phase 1B（表格、图片等）继续冻结。

## 2026-08-22 隔离表格交互增量（不代表生产 Phase 1B 已开放）

- 在 `poc/visual-editor-phase1a` 中增加了 GFM 表格样例、Tab 跨格、末格 Tab 自动增加新行，以及选中表格后的行列操作工具。
- 表格命令使用 Milkdown / ProseMirror 原生表格节点和事务；未连接生产 `EditorPane`、`.md` 保存队列或图片资产链。
- TDD 证据：先新增表格 E2E 并确认当前实现因不存在表格而失败，随后实现最小交互；隔离 Playwright 现在为 8/8，PoC TypeScript/Vite 构建通过。
- 表格规范化边界仍遵循 `tests/fixtures/visual-editor/normalization-policy.json`：只允许用户编辑的表格块发生列宽、空白、对齐分隔线和 pipe 转义规范化。
- Owner 尚未完成 Phase 1A 的唤起即写、候选操作、光标稳定和主观手感确认；因此生产 `EditorPane`、适配层和真实 Beta 入口继续冻结。
## 2026-08-22 Microsoft Pinyin 探针修复与当前门槛

- 失败根因已定位为探针边界：基础用例把 `nihao` 和提交空格拆成两次会重新初始化输入法的调用，第二次调用可能取消 composition；1000 次用例原本在同一批输入中发送 `"ni "`，因此不能单独证明该边界。
- 按 TDD 先增加了隔离 harness 合同测试并得到 RED，再增加 `sendMicrosoftPinyinContinuation`，让提交键沿用当前前台输入会话；没有修改生产 `EditorPane`、保存队列或磁盘格式。
- 最新报告：[phase1a-webview2-ime-e2e.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-e2e.json>)，使用独立 `devPort=4186`、`cdpPort=9254`：`webview2-ready`、基础 composition、物理 Undo/Redo、1000 次 composition 全部通过；基础用例中间态为 `ni'hao`，提交结果为 `你好`，1000 次实际计数为 1000。
- 本轮验证：PoC 合同测试 6/6、TypeScript/Vite 构建通过；Playwright E2E 使用 `MKN_PHASE1A_E2E_PORT=4187`，8/8 通过。新增端口覆盖避免与 Owner 手工验收使用的 4173 冲突。
- 本轮备份：[MDnote-20260822-125950-phase1a-final](<C:/Projects/MKnote-backups/MDnote-20260822-125950-phase1a-final>)；排除 `.git`、`node_modules`、`dist`、Rust `target` 和 `.codex-smoke` 后，源文件与备份均为 747 个、178,418,361 bytes；关键文件 SHA-256 一致。
- 当前门槛口径：Gate A 只代表允许隔离 PoC；Gate B 仍需 Owner 验收唤起即写、候选翻页、中英切换、光标稳定、持续输入、粘贴和整体手感，并补齐计划中的完整兼容、性能和窗口路径证据。Phase 1B（表格、图片等）和生产接入不得因本次客观 IME 通过而提前开放。

## 2026-08-23 Gate B 收口复核

- T5 Owner 手工验收：未执行。只读检查时 `127.0.0.1:4173` 无监听；本轮未启动、重启或占用 Owner 保留端口，因此不能把隔离 PoC 结果写成 Owner 主观验收。
- IME 回车边界：`real-microsoft-pinyin-commit-keys` 为失败；报告 trace 显示 composition 结束但没有 DOM Enter，`afterEnter` 为拼音文本。当前归类为 OS 输入注入 / composition 提交语义边界，需在 Owner 实例中用真实手工回车复核；暂不判定为编辑器缺陷或通过。
- English layout 边界：`real-microsoft-pinyin-language-switch` 为 `not-available`；`00000409` 路径未产生预期英文文本。归类为当前键盘布局 / 注入环境边界，目标环境复核前不标记为通过。
- T4 Node/Lute 基准本轮结果：100 KiB median/p95 `306.07/842.57 ms`，500 KiB median/p95 `1422.61/3230.76 ms`。该运行没有测 DOM paint、IME、React mount、真实保存、窗口内存或 ZIP 大小，仍不构成 Gate B 证据。
- 当前结论：Gate B-P0 仍未通过；生产 `EditorPane`、适配层、feature flag 和 Phase 1B 继续冻结。

## 2026-08-23 WebView2 基准诊断

- 新增隔离 benchmark 入口和契约测试；默认使用独立 `4181/9251`，不连接生产 `EditorPane` 或保存链。
- 缩小运行报告：[phase1a-webview2-benchmark.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark.json>)：100 KiB 1 次 key-to-paint 为 `65.3 ms`；500 KiB 1 次输入在 `120000 ms` 内未观察到 input。
- 该运行 cold/hot 为 0、key 为 1，仅验证采集链路和大文档阻塞边界，不构成协议 p95 或 Gate B 通过；生产编辑器迁移继续冻结。

### 结构诊断补充

- 诊断契约已按 TDD 增加：先验证缺少结构归一化模块的 RED，再实现最小采集与归一化；PoC `npm test` 当前 `20/20`，TypeScript/Vite build 通过。
- 最新 table 默认路径缩小运行 build hash 为 `727db9c50f210301a3d89f3d43f95ae8d5c3f968c5d545d49e13158af7a9a8de`，Runtime 为 `151.0.4129.101`；100 KiB key-to-paint `65.3 ms`，input-to-paint `49.1 ms`。
- 100 KiB 编辑器结构统计为 `1,024` 个 table / `2,048` 行 / `4,096` 单元格 / `16,384` 个后代元素；500 KiB 为 `5,120` / `10,240` / `20,480` / `81,920`，接近严格 5 倍增长。
- 500 KiB 仍在 `120000 ms` 内未观察到 input。由于 benchmark 路径已关闭每键全量 Markdown listener，本轮不能再把失败直接归因于序列化；当前只确认大规模表格化 DOM / ProseMirror 压力是强相关证据，不能宣称唯一根因。
- 结构统计不含正文或 HTML；T4 仍未形成完整 `30/100/1000`、窗口内存、保存阻塞和包体证据，Gate B-P0 与生产接入继续未通过。

### paragraph 差分诊断

- 使用独立端口 `4182/9252` 和独立报告运行 `MKN_PHASE1A_BENCHMARK_FIXTURE=paragraph`；官方默认 `table` fixture 未改变，结果不计入 T4 通过判定。
- paragraph 500 KiB 在同样 1 次样本、`120000 ms` 超时下通过：key-to-paint `97.4 ms`，input-to-paint `85.7 ms`；结构为 `4,130` 个段落、`4,130` 个后代元素、0 个 table。
- 该对照将当前调查方向收窄到官方 table fixture 的 ProseMirror / DOM 结构压力；仍不能把单次样本当作 p95，也不能据此修改 500 KiB 门槛、删除表格支持或开放生产接入。

### 初始化 / 首帧 timing 补充

- 最新 timing 报告使用同一 build hash `b3f4ba8229bf9d8ad035a4baa5cf14b0975e6613115d8c4b8920cefb0b3ffd1f`，新增 `createDurationMs`、`readyToFirstFrameMs` 和编辑事务 timing；不记录正文。
- table 500 KiB：创建阶段 `22,873.6 ms`、首帧 `438.7 ms`、key-to-paint `362.4 ms`、input-to-paint `301.9 ms`；paragraph 500 KiB：创建阶段 `538.3 ms`、首帧 `116.2 ms`、key-to-paint `94.5 ms`、input-to-paint `87.6 ms`。
- table 最新单样本已观察到 input，但超过正式 `100 ms` 门槛；此前 `120000 ms` 无 input 的结果作为波动风险保留。该 timing 仍不是完整 T4 p95，Gate B-P0 与生产接入继续未通过。

## 2026-08-23 单表差分诊断（非 T4 fixture）

- 为区分表格节点数量 / 碎片化与单一大表行规模的影响，新增默认关闭的 `single-table` 诊断 fixture；500 KiB 生成 `9,661` 行，接近官方 `table` fixture 的 `10,240` 行。官方 fixture、正式 T4 门槛和生产编辑器均未修改。
- 报告：[phase1a-webview2-benchmark-single-table-timing.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-single-table-timing.json>)；端口 `4183/9253`，WebView2 `151.0.4129.101`，报告 build hash `067cda89fd7af2136d11046b6c2c35f70bad2b11f5446fe501ea0cee2a828017`。

| 500 KiB fixture | table | 行 | 单元格 | 后代元素 | Editor.create | ready → 首帧 | key-to-paint | input-to-paint |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 官方 `table` | 5,120 | 10,240 | 20,480 | 81,920 | 22,873.6 ms | 438.7 ms | 362.4 ms | 301.9 ms |
| 诊断 `single-table` | 1 | 9,661 | 19,322 | 48,307 | 6,993.9 ms | 281.3 ms | 308.6 ms | 280.6 ms |

- 单表将初始化时间从约 22.9 秒降至约 7.0 秒，说明多表节点数量 / 碎片化是重要放大因素；但单一大表的编辑事务仍高于正式 500 KiB `100 ms` 目标，因此不能视为性能通过。
- 两份 timing 报告均为单次缩小样本，且官方 table 报告与本次单表报告 build hash 不同；该结果是方向性差分证据，不是唯一根因证明，也不替代完整 T4 `30/100/1000`、内存、保存阻塞和包体验证。Gate B-P0、生产接入和正式表格支持结论继续冻结。

## 2026-08-23 GFM 表格 schema 对照诊断

- 新增默认关闭的 `no-gfm` benchmark profile；只在显式 benchmark URL 下跳过 GFM preset，官方 `table` fixture、正式 100/500 KiB 输入、正式门槛和普通 PoC 默认路径均未改变。
- 报告：[phase1a-webview2-benchmark-table-no-gfm-diagnostic.json](../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-no-gfm-diagnostic.json)；隔离端口 `4186/9257`，WebView2 `151.0.4129.101`，build hash `5fa760c522d7fdace1a7a4347e650322a5f8bcb5924c4a7122fce09bb12233ee`。

| 500 KiB profile | table | paragraph | 后代元素 | Editor.create | ready → 首帧 | key-to-paint | input-to-paint |
|---|---:|---:|---:|---:|---:|---:|---:|
| normal | 5,120 | 25,600 | 81,920 | 22,873.6 ms | 438.7 ms | 362.4 ms | 301.9 ms |
| no-gfm | 0 | 10,240 | 35,840 | 906.2 ms | 450.4 ms | 82.9 ms | 47.3 ms |

- 差分说明主要阻塞来自 GFM 表格 Markdown 解析 / 表格 schema 与节点创建；`no-table-layout` 只解释次级布局成本。`no-gfm` 不代表可交付行为，不能用来关闭正式 T4；T4 完整采样、T5 Owner 手感、IME 边界和生产接入仍未通过。

## 2026-08-23 表格运行时插件差分（诊断，不改变支持矩阵）

本轮只在隔离 Phase 1A benchmark 中比较 GFM 表格运行时插件；普通 PoC 默认路径、生产 `EditorPane`、保存链和表格支持分类均未改变。报告均为官方 `table` fixture、100/500 KiB、cold `0`、hot `0`、key `1`，不是 T4。

| 500 KiB profile | Editor.create | key-to-paint | input-to-paint | 结论 |
|---|---:|---:|---:|---|
| normal | 22,873.6 ms | 362.4 ms | 301.9 ms | 基线超标 |
| no-table-runtime | 22,866.1 ms | 114.5 ms | 67.3 ms | 初始化基本不变，事务明显改善 |
| no-table-align-runtime | 34,019.6 ms | 115.6 ms | 63.7 ms | `keepTableAlignPlugin` 全树扫描是主要放大方向 |
| no-table-editing-runtime | 51,705.8 ms | 266.0 ms | 216.9 ms | `tableEditingPlugin` 有成本但不是主要方向 |
| incremental-table-align-runtime | 20,735.4 ms | 97.1 ms | 58.0 ms | 局部扫描 PoC 样本达到目标附近 |

- `incremental-table-align-runtime` 只对 transaction mapping 触及的 table 做 alignment 修复；实现与单测见 `poc/visual-editor-phase1a/src/tableAlignmentRuntime.ts`、`tests/phase1aTableAlignmentRuntime.test.mjs`，单测 `3/3`，PoC 合同 `24/24`，PoC 构建通过。
- 500 KiB `Editor.create` 仍为约 20.7 秒，因此该 PoC 没有解决 GFM 表格解析 / schema / 节点创建初始化瓶颈；单次 key/input 样本也不能证明 T4 p95、内存、保存阻塞或包体门槛。
- 默认 GFM E2E 使用独立 `MKN_PHASE1A_E2E_PORT=4193`，`8/8` 通过；该自动化证据不替代 T5 Owner 手工验收。Gate B-P0 继续未通过，生产接入继续冻结。

## 2026-08-23 增量表格真实 WebView2 交互验证

本轮只验证隔离 PoC 的 `incremental-table-align-runtime` profile，不改变普通 GFM 默认路径、支持矩阵或生产 `EditorPane`。

| 项目 | 结果 | 证据 |
|---|---|---|
| 表格 runtime 定向测试 | 通过，7/7 | `poc/visual-editor-phase1a/tests/phase1aTableAlignmentRuntime.test.mjs` |
| harness 合同测试 | 通过，13/13 | `poc/visual-editor-phase1a/tests/phase1aHarnessContract.test.mjs` |
| PoC 全量合同测试 | 通过，32/32 | `npm.cmd test` |
| TypeScript/Vite 构建 | 通过 | `npm.cmd run build` |
| 默认 GFM WebView2 回归 | 通过，`failed=0` | [phase1a-webview2-e2e-default-regression.json](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-e2e-default-regression.json>)；独立 `4196/9260` |
| 增量 profile WebView2 交互 | 通过，`failed=0` | [phase1a-webview2-table-incremental-interaction.json](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-table-incremental-interaction.json>)；独立 `4195/9259` |

增量交互覆盖：表头居中/右对齐、body alignment 同步、插入行后 alignment 保持、插入列、删除列和删除行。真实 Milkdown schema 的表头行节点名为 `table_header_row`；runtime 已增加兼容，TDD GREEN checkpoint 为 `9be2d7d`。该 profile 仍是隔离诊断，不代表表格已经进入生产支持范围。

本轮未运行正式 T4 `30/100/1000` 候选：当前 WebView2 benchmark 入口不采集 CAS 保存阻塞、进程树内存增量或 Release ZIP 包体，且官方 table 500 KiB 已有 `Editor.create≈22.9s`、`key-to-paint≈362.4ms` 的超标单样本。继续保留 T4、T5 Owner 手工验收、IME 回车/English layout 边界和生产接入为未完成项。

## 2026-08-23 T4 证据收口工具（仍未通过）

| 项目 | 结果 | 证据 |
|---|---|---|
| T4 manifest 合同 | 通过，7/7 | `tests/visualEditorT4Evidence.test.ts` |
| collector 语法 / 入口 | 通过 | `node --check scripts/collect-visual-editor-t4-evidence.mjs`；`npm.cmd run collect:visual-editor-t4` |
| 受影响 T0 契约 | 通过，34/34 | `node --test tests/visualEditorT4Evidence.test.ts tests/visualEditorCorpus.test.ts tests/sourceAwareMarkdown.test.ts tests/visualEditorInteractionContract.test.ts tests/visualEditorSaveContract.test.ts` |
| 前端构建 | 通过 | `npm.cmd run build` |
| 当前 Gate B manifest | 阻塞 | [phase1a-t4-evidence-manifest.json](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>) |

collector 的设计边界是：已有测试源文件不自动等于本次 T4 通过；必须提供可追溯的本次运行 evidence input。当前 manifest 仍明确缺少保存/CAS 阻塞、进程树内存增量和 Release ZIP 包体，且 WebView2 benchmark 不是 `30/100/1000` 正式采样，因此没有关闭 Gate B 或启动生产迁移。

## 2026-08-23 Release ZIP 包体采集

| 项目 | 结果 | 证据 |
|---|---|---|
| 当前工作区绿色构建 | 通过，exit code `0` | `npm.cmd run build:green`；生成 `MKnote-portable-v4.2.5-20260823-155512.zip` |
| ZIP 基线对比 | 通过 | 当前 `13,633,864` bytes；基线 `13,623,928` bytes；增幅约 `0.073%`，目标 ≤ `10%` |
| ZIP SHA-256 / entries | 通过 | [phase1a-t4-package-metrics.json](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-package-metrics.json>)；仅 `MarkdownStickyNote.exe`、`README.txt` |
| T4 manifest 的 release-package | 通过 | [phase1a-t4-evidence-manifest.json](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>) |

该结果只关闭 T4 的包体子项；保存/CAS 阻塞、10 Tab+1 Popout 进程树内存、正式 WebView2 `30/100/1000` 性能和 T5 Owner 验收仍未完成，Gate B-P0 继续阻塞。

## 2026-08-23 WebView2 key 输入通道失败上下文诊断

本轮只增强隔离 benchmark 的失败上下文，不改变官方 `table` fixture、正式门槛、普通 PoC 默认路径或生产编辑器。

| 诊断配置 | 100 KiB | 500 KiB | 关键观察 |
|---|---:|---:|---|
| `press`，`keyGapMs=16`，无额外等待 | 20/20，通过；p95 `11.9 ms` | 0/20，warmup 第 0 次失败 | 编辑器已聚焦且可编辑，但 `keydown/beforeinput/input/keyup` 均为 0 |
| `press`，首次输入前等待 `1000 ms` | 5/5，通过；p95 `11.5 ms` | 0/5，warmup 第 0 次失败 | 等待未改变失败上下文 |
| `insert-text`，首次输入前等待 `1000 ms` | 5/5，通过；p95 `16.2 ms` | 0/5，warmup 第 0 次失败 | 文本注入通道同样没有产生输入事件 |

- 报告：[key diagnostic](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-key-diagnostic-context.json>)、[initial-wait 对照](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-key-initial-wait-1000.json>)、[insert-text 对照](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-insert-text-diagnostic.json>)。
- 500 KiB 失败快照显示：文档可见且有焦点，`.ProseMirror` 已连接、`contentEditable=true`、选区折叠且锚点在编辑器内；但事件计数为零。该结果排除了单纯的失焦、选区丢失和首次输入过早，支持“大规模 GFM 表格 DOM / WebView2 输入响应边界”的调查方向，但不证明唯一根因。
- 新增的失败上下文与输入通道诊断合同按 TDD 通过，默认正式模式仍为 `press`；诊断 `insert-text` 不计入正式性能证据，也不代表真实 OS IME。
 - 当前 T4 manifest 已改用正式采样报告 `phase1a-webview2-benchmark-fast-gfm-formal.json`：兼容语料 `3/3`、source-aware `6/6`、Selection/History/Paste `6/6` 和 Release ZIP 子项通过；100/500 KiB 性能分别 `207/1000`、`144/1000` 且失败，保存/CAS 与进程内存仍缺证。Gate B-P0 继续阻塞，支持矩阵不因诊断 fixture 改变，生产接入继续冻结。

## 2026-08-24 T4 进程内存证据补充

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 隔离 Release 进程树采集 | 完成 | `C:\Projects\MKnote\scripts\collect-visual-editor-t4-process-memory-ui.mjs` 返回 0；同一 root PID 下完成 baseline / after |
| 场景完整性 | 通过 | 资料库新建路径后弹出前 11 个 Tab；弹出 1 个后主窗口 10 个 Tab，Popout 页面 1 个 |
| root PID / 快照完整性 | 通过 | root PID `40568`；baseline / after `snapshotComplete=true`；进程数 `7 → 8` |
| 内存门槛 | 失败 | working set `520,478,720 → 697,335,808` bytes；增量 `176,857,088` bytes（约 `168.664 MiB`、`33.98%`），超过 `50 MiB` 与 `25%` |
| T4 manifest | 已更新 | `C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-t4-evidence-manifest.json` 将 `process-memory` 标为 `failed`；Gate B-P0 仍 `blocked` |

保存/CAS 仍不能宣称 T4 通过：`C:\Projects\MKnote\scripts\collect-visual-editor-t4-save-cas.ps1` 要求真实 `30` 组 `blockingMs` 样本；现有 release smoke 的 `inputSave.elapsedMs` 是端到端磁盘观察耗时，不能作为主线程序列化阻塞替代。因此 `save-cas-fault-injection` 继续保持 `not-run`，而既有保存契约和故障注入报告仅作为行为边界证据。

进程差分中 after 新增的 `msedgewebview2.exe` 子进程 working set 为 `122,306,560` bytes，而根 `md-sticky-note.exe` 只增加约 `2.74 MiB`；这为后续评估 Popout 的窗口级 WebView2 保留成本提供方向，但不是唯一根因证明。

## 2026-08-24 OS IME 焦点修复与 fragment sweep

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| continuation 前台恢复 | 通过 | 100 KiB paragraph 真实 composition；`compositionstart/update/end`、6 次 `beforeinput/input`，`rendererCrashed=false` |
| 多表 fragment 真实 composition | 隔离诊断通过，`tableCount=1/16/64/256/512` | 各为 100 KiB 官方 table fixture；均未 crash，不替代 T4 性能或生产支持 |
| `tableCount=1024` ready | 未通过 | ready timeout `60s` 仍未 ready，`rendererCrashed=false`；属于初始化/ready 阻塞，不是已证实的 renderer crash |
| Gate B-P0 | 仍阻塞 | T5 Owner 手感、回车/English layout、正式 T4 保存/CAS/内存/性能证据仍未闭合 |

本轮验证只推进隔离 PoC；生产 `EditorPane`、保存链、CAS、feature flag 和 `4173` Owner 实例继续冻结。

## 2026-08-24 raw HTML comment 修复与正式 T4 重跑

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| raw comment TDD | 通过 | RED `cb6979a`；GREEN `405073e`；边界测试 `3/3` |
| 100 KiB 正式 WebView2 | 通过 | cold `30/30`、hot `100/100`、key `1000/1000`；key-to-paint p95 `9.1 ms` |
| 500 KiB 正式 WebView2 | 失败 | cold `30/30`、hot `100/100`；key warmup 第 `0` 次未观察到 input，`0/1000` |
| 500 KiB DOM 结构 | 有改善但未达标 | 后代元素由旧报告约 `81,920` 降至 `66,560`；`img.ProseMirror-separator` `5,120 → 0`；仍有 `5,120` 张表 |
| 正式报告 | 已更新 | [phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-formal-raw-comment-fixed-20260824.json>) |
| T4 manifest | 已重生成 | [phase1a-t4-evidence-manifest.json](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)；500 KiB 与 process-memory `failed`，save/CAS `not-run` |
| Gate B-P0 | 仍阻塞 | 正式 500 KiB 输入、进程内存、保存/CAS、T5 Owner 和 IME/English layout 边界仍未闭合 |

本轮只推进隔离 PoC 和证据文件；生产 `EditorPane`、保存链、CAS、feature flag 和 `4173` Owner 实例继续冻结。下一步转向大表 DOM / WebView2 `press` 输入边界及 Tab/Popout 内存保留成本的隔离诊断。

### 输入路径分类补充

| 诊断项 | 结果 | 证据与边界 |
|---|---|---|
| 100/500 KiB `insert-text` 对照 | 通过诊断 | 各 `5/5`；p95 分别 `12.8 ms` / `44.8 ms`；0 cold、0 hot，不属于正式 T4 |
| 正式 500 KiB `press` | 仍失败 | `0/1000`；warmup 第 0 次无 input 事件 |
| 输入边界结论 | 收窄但未解除 | 浏览器文本注入和真实 OS composition 可工作；WebView2/CDP `press` 路径仍不稳定，不能用对照样本替代正式门槛 |

对照报告：[phase1a-webview2-benchmark-table-insert-text-raw-comment-fixed-20260824.json](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-insert-text-raw-comment-fixed-20260824.json>)。该报告不改变 T4 manifest 的 `webview2-performance-500kb=failed` 状态。

## 2026-08-24 保存/CAS 证据收口

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 保存/CAS `blockingMs` | 通过 | 真实样本 `30/30`，p95 `1.4 ms`，目标 `≤50 ms`；[metrics](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-metrics-20260824.json>) |
| 保存失败注入 | 通过 | [save-failure](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-save-failure-20260824.json>) |
| CAS 冲突注入 | 通过 | [cas-conflict](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-save-cas-conflict-20260824.json>) |
| T4 manifest | 已重生成 | [phase1a-t4-evidence-manifest.json](<../poc/visual-editor-phase1a/artifacts/phase1a-t4-evidence-manifest.json>)；保存/CAS `pass`，500 KiB 性能与 process-memory `failed` |
| Gate B-P0 | 仍阻塞 | 正式 500 KiB `press` `0/1000`、内存门槛失败、T5 Owner 手工验收和 IME/English layout 边界仍未闭合 |

这里的 `1.4 ms` 只测同步 Tauri bridge dispatch 阻塞窗口，不是从输入到磁盘观察的完整保存耗时，也不替代用户手感验收。旧章节中采样前的 `save-cas-fault-injection=not-run` 以本节和最新 manifest 为准。

PoC 官方 `npm test` 已纳入 `tests/phase1aRawHtmlComment.test.mjs`；raw HTML comment 三项回归及全量 Phase 1A 合同通过。该入口修复不改变生产 `EditorPane`、保存链或 CAS。

## 2026-08-24 IME 回车与 English layout 边界分类

| 验收项 | 当前结果 | 证据与分类 |
|---|---|---|
| Microsoft Pinyin composition / 空格提交 | 通过 | [phase1a-webview2-ime-e2e.json](<../poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-e2e.json>)；`compositionstart/update/end`，空格后提交 `你好`，物理 Undo / Redo 与 1000 次 composition 已通过 |
| Microsoft Pinyin 回车提交 | 输入协议边界，待 T5 复核 | 同一报告的 `real-microsoft-pinyin-commit-keys` 中 `compositionEnded=true`，但 `enterKeySeen=false`；事件 trace 没有 DOM Enter，只看到 `Process` 和 composition 事件，`afterEnter` 为 `zhongguo`。这不足以证明编辑器 Enter 事务失败，暂归类为 OS 注入 / harness 边界 |
| English layout `00000409` | `not-available` | 报告记录该布局返回 `a'b'c`，不满足探针预期的英文文本；暂归类为当前输入环境边界，需目标环境或 Owner 真实窗口复核 |
| Gate 影响 | 未闭合 | 回车与 English layout 不得被自动化失败直接改写为生产编辑器缺陷，也不能在 T5 复核前标记通过 |

这组分类复用既有 IME artifact，不新增重复输入；生产 `EditorPane`、保存链、CAS 和 feature flag 继续冻结。

## 2026-08-24 T5 Owner 手工验收结果

- Owner 在隔离 `4205/9265` 窗口完成 T5-01–T5-12，全部记录为 `pass`；结果已写入 [T5 Owner 清单](<C:/Projects/MKnote/docs/visual-editor-t5-owner-checklist.md>)。
- T5 结论覆盖唤起即写、Microsoft Pinyin 候选与回车上屏、候选翻页、中文标点、English layout、选区替换、粘贴、连续输入及 Undo / Redo。
- 该结论只关闭 Owner 手感证据，不替换自动化、真实 WebView2、性能、内存或保存/CAS 证据。

## 2026-08-24 Gate B-P0 重审状态

| 项目 | 当前结果 | 说明 |
|---|---|---|
| T5 Owner 手感 | `pass` | Owner 手工验收 12/12 通过 |
| P0 契约 / 安全 / 保存-CAS | `pass` | 既有机器可读证据保持有效 |
| 500 KiB 正式 `press` | `failed` | `0/1000`，失败 artifact 保留 |
| `10 Tab + 1 Popout` 内存 | `failed` | 增量约 `168.664 MiB / 33.98%`，失败 artifact 保留 |
| Gate B-P0 范围 | `approved-for-phase-2` | Owner 已批准路径 B；P0 进入 Phase 2，正式 T4 manifest 仍独立保持 `blocked` |
| Gate C 真实回归 | `pending` | 普通笔记加载、保存、重开、保存失败和 CAS 已在隔离 visual Release 部分通过；仍需补齐交互、Tab / Private / Popout 和回退边界 |

路径 B 已应用：将两项 T4 失败转入 Phase 1B / Gate C backlog，先推进 P0；正式 manifest 未改写，生产 `EditorPane` 仅通过显式 flag 使用新编辑器，默认仍为旧链路。

## 2026-08-24 Phase 2 P0 实施 checkpoint

| 项目 | 结果 | 证据 |
|---|---|---|
| Milkdown 依赖 | 已接入 | `@milkdown/kit@7.19.2`；构建通过 |
| Adapter / session | 已实现 | `src/visual-editor/visualEditorAdapter.ts`、`src/visual-editor/visualEditorSession.ts`；定向测试通过 |
| feature flag | 已接入 | `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror`；默认 legacy，Private / 隐私遮罩回退 |
| 旧编辑器回退 | 已保留 | `EditablePreviewEditor` 仍为默认和初始化失败回退路径 |
| App 保存权威 | 未改变 | Adapter 只回传 Markdown；dirty、revision、saveStatus、writer、CAS 仍在 App 现有链路 |
| P0 真实窗口 | 部分通过 | 隔离 visual Release `8/8` 已覆盖加载、列表/任务、选区替换、Undo/Redo、保存、重开、保存失败保留内存和 CAS；仍需补齐 Tab / Private / Popout 和回退 |

本 checkpoint 不提升表格、图片、Popout 内存或 safe-source 的生产支持等级，也不替代正式 T4 失败证据。

## 2026-08-24 Phase 2 P0 真实窗口回归

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| visual flag 编译 Release | 通过 | `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror`；`npm.cmd run tauri build -- --no-bundle` exit code `0` |
| 普通笔记加载 / visual 挂载 | 通过 | `mknote-visual-editor` 与 `.ProseMirror` 可见，隔离 seed 正确加载 |
| 列表 / 任务 / 选区 / Undo-Redo | 通过 | 最新报告 `phase2-production-e2e-20260824-visual-p0-interactions-rerun.json`；`ul=1`、`li[data-item-type=task]`、选区替换和历史恢复通过 |
| 编辑 / 序列化 / 保存 | 通过 | `phase2-production-e2e-20260824-visual-p0-interactions-rerun.json`；marker 写入隔离 `File/default/default-note.md` |
| 进程重启 / 重开 | 通过 | 同一隔离数据根目录重启 Release 后 marker 保留并重新加载 |
| 保存失败恢复 | 通过 | `MKN_TEST_SAVE_FAILURE=1`；磁盘不含本地 marker，visual editor 仍保留本地内容 |
| CAS 外部冲突 | 通过 | 外部 marker 保留在磁盘；本地 visual 内容保留，UI 报告外部修改 / 拒绝覆盖 |
| 业务检查 | `8/8 pass` | 报告将 2 个故障注入 `pageerror` 归为 expected，unexpected runtime errors `0` |
| 默认 legacy smoke | 部分通过 | 默认构建挂载旧 `mknote-preview-editor`，选择/粘贴/保存/重开通过；旧 Undo 只撤销一个字符，属于既有链路问题 |
| Gate C | `pending`（当时） | 本节记录的是 Phase 2 首轮回归；后续生命周期收口见文末最新结果 |

本轮使用新的临时数据根目录和 CDP `9271–9274`，未触碰 Owner 的 `4173`、`4205/9265`、`4207` 实例，也未修改正式 T4 manifest。

## 2026-08-24 Phase 2 Gate C 生命周期收口

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 普通 Tab 生命周期 | 通过 | `phase2-lifecycle-e2e-20260824-gatec-window-save.json`；3 个 Tab，切换前后 visual editor 均挂载，编辑 marker 保留 |
| Private 隔离 | 通过 | 同一报告；Private 使用 `legacy-preview`，写回 `File/.private`，退出后普通笔记内容保持不变 |
| Popout 隔离与回传 | 通过 | 同一报告；Popout 使用旧 Markdown textarea，保存后关闭回到主窗口，marker 保留 |
| visual 初始化失败回退 | 通过 | 同一报告；隔离 DOM 故障注入后自动回到 `legacy-preview`，普通内容保留 |
| 隐藏路径保存 | 通过 | 同一报告；显式 visual flag 下请求隐藏后磁盘 marker 保留、进程仍存活 |
| 退出路径保存 | 通过 | 同一报告；`--quit` 后主进程 exit code `0`，磁盘 marker 保留 |
| 非预期运行时错误 | `0` | 报告 `runtimeErrors.unexpected=[]` |
| Gate C | `pass`（显式 flag Beta） | P0 真实窗口、Tab、Private、Popout、隐藏、退出和回退边界已闭合；不等于默认化或 P1 支持 |

本轮使用临时数据根目录和 CDP `9282–9284`，未触碰 Owner 的 `4173`、T5 的 `4205/9265` 或既有隔离 `4207`。正式 T4 manifest 仍保持 `blocked`：500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存失败继续作为 Phase 1B / Gate C backlog，不得改写为通过。

## 2026-08-24 最终验证与阶段结论

| 项目 | 结果 | 边界 |
|---|---|---|
| T5 Owner | `pass`，12/12 | 真实隔离窗口手工验收；不是自动化代填 |
| Phase 2 P0 | `pass` | 普通笔记核心交互与生命周期报告均通过 |
| Gate C | `pass`（显式 flag Beta） | 允许进入 Phase 3 受控 Beta，不等于默认化 |
| 最终窄验证 | `pass` | 根项目构建、Phase 1A 合同/构建、根项目 visual 定向测试、脚本语法和 JSON 回读均通过 |
| 正式 T4 | `blocked` | 500 KiB `press=0/1000` 与 Popout 内存失败继续保留 |

当前阶段是 Phase 3 受控 Beta 评审。默认仍为 `legacy-preview`；表格/大文档性能和 Popout renderer 内存进入 Phase 1B backlog，不被本次 T5 或 Gate C 结论覆盖。

## 2026-08-24 Phase 3 迁移快照与 note switch 验收

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 迁移快照 Rust 单测 | `2/2 pass` | `cargo test --manifest-path src-tauri/Cargo.toml migration_snapshot --lib`；验证首次写入稳定性、缺失源文件无副作用 |
| 初始挂载与 note switch 合同 | `2/2 pass` | `node --test --test-isolation=none tests/visualEditorMigrationSnapshotContract.test.ts` |
| 多普通 Tab 独立快照 | `pass` | [lifecycle report](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-20260824-migration-snapshot-direct-ready.json>)；7/7 业务检查、`failed=0`、`unexpectedRuntimeErrors=0`，两个 Tab 快照文件不同 |
| P0 主回归 | `pass` | [production report](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-migration-snapshot-p0-rerun.json>)；业务检查全通过，预期故障 2 个，非预期运行时错误 `0` |
| 默认与受保护边界 | `unchanged` | 默认仍 `legacy-preview`；Private、Popout 不启用 visual editor；不提升表格、P1 或 Popout 内存支持等级 |
| 正式 T4 两项失败 | `blocked` | 500 KiB `press=0/1000` 与 `10 Tab + 1 Popout` 内存约 `168.664 MiB / 33.98%` 的失败 artifact 保持不变 |

本轮确认的是 Phase 3 迁移安全子项，不是 Gate D 默认化，也不是正式 T4 性能/内存门槛通过。

## 2026-08-24 Phase 1B 块引用单项收口

| 验收层 | 结果 | 证据与边界 |
|---|---|---|
| T0 块引用命令契约 | `2/2 pass` | `tests/visualEditorBlockquoteContract.test.ts`；命令类型、CommonMark 映射和 parser/serializer 边界 |
| T1 块引用隔离主场景 | `1/1 pass` | 独立端口 `4206`；`Ctrl+Shift+B`、Markdown 序列化、Undo/Redo |
| T4 块引用保存/重开 | `pass` | [isolated visual Release report](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-blockquote-isolated.json>)；唯一 identifier 隔离，`failed=0`、`unexpectedRuntimeErrors=0` |
| P1 块引用单项 | `pass`（显式 visual Beta） | 未改变默认 `legacy-preview`、Private/Popout 隔离、正式 T4 大表性能和 Popout 内存失败边界 |

本项完成的是块引用这一项的增量出口，不代表 Phase 1B 全部完成，也不提前开放表格、图片或默认 visual editor。
## 2026-08-24 Phase 1B 代码块单项收口

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 代码块 visual Release 持久化 | `pass` | [phase2-production-e2e-code-block-csp-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-code-block-csp-fixed-20260824.json>)；`status=pass`、`failed=0`、非预期运行时错误 `0` |
| 代码块显示、输入、保存、重开 | `pass` | 同一隔离报告覆盖 `pre code` 挂载、代码内容写盘和 Release 重开恢复 |
| 保存失败 / CAS 边界 | `pass` | 同一报告中的故障注入保持编辑器内存与外部磁盘内容边界；不改变 App 保存权威 |
| CSP inline style 回归 | `pass` | `CopyFeedbackIcon` 使用 `data-copy-feedback-size`；[copyFeedbackIconContract.test.ts](<C:/Projects/MKnote/tests/copyFeedbackIconContract.test.ts>) 覆盖禁止 inline style 属性 |
| P1 单项出口 | `pass`（显式 visual Beta） | 只关闭代码块这一项的 T4 持久化边界；不改变正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败、默认 `legacy-preview` 或旧链路清理条件 |

本节不把代码块单项通过扩大为表格、大文档性能、Popout 内存或 Phase 1B 全部完成。
## 2026-08-24 Phase 1B 表格首个纵向切片

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 表格 visual Release 主场景 | `pass` | [phase2-production-e2e-phase3-table-p1-rerun-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-p1-rerun-20260824.json>)；总检查 `12/12`，`status=pass`，非预期运行时错误 `0` |
| 表格创建与单元格输入 | `pass` | GFM `|2x2| ` 输入规则创建 `2×2` 表格；首个表头写入 `Header` |
| 保存与重开 | `pass` | 同一隔离报告写入 Markdown，重启 visual Release 后恢复表格、`2` 行、`2` 列和 `Header` |
| P1 表格当前出口 | `partial` | 仅关闭创建/编辑/持久化首个纵向切片；行列增删、对齐、完整表格矩阵和 500 KiB 正式性能仍未完成 |

该结果不改变正式 T4 的 500 KiB `press=0/1000` 失败、Popout 内存失败、默认 `legacy-preview` 或 Private/Popout 隔离边界。

## 2026-08-24 表格 Tab 行事务收口

- 首次复跑发现表格创建成功但末格 Tab 未追加新行；失败报告保留为 [phase2-production-e2e-phase3-table-row-append-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-row-append-20260824.json>)。
- 生产 adapter 已补入 `tableKeyboard`：表内 Tab 前进，末格 Tab 通过 `addRowAfter` 追加行；合同测试和构建通过。
- 修复后报告 [phase2-production-e2e-phase3-table-row-append-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-row-append-fixed-20260824.json>) 为 `status=pass`、`failed=0`、非预期运行时错误 `0`，重开后为 `3` 行、`2` 列。

当前表格 P1 仍为部分完成；列事务、行列删除、对齐、完整矩阵和正式大文档性能继续保留为后续工作。

## 2026-08-24 表格命令层增量

- `VisualEditorCommand` 已提供 `insert-table`、`add-table-row`、`add-table-column`；[visualEditorTableContract.test.ts](<C:/Projects/MKnote/tests/visualEditorTableContract.test.ts>) 为 `2/2 pass`，根项目构建和最新 visual Release 构建通过。
- 最新显式 visual Release 回归 [phase2-production-e2e-phase3-table-commands-latest-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-commands-latest-20260824.json>) 为 `12/12 pass`、非预期运行时错误 `0`；表格行为仍验证为创建、单元格输入、Tab 追加行、保存和重开。
- 命令层增量不代表删除/对齐工具、完整表格矩阵或正式 500 KiB 性能已完成。

## 2026-08-24 Phase 3 表格工具栏纵向切片

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 表格空单元格可操作几何 | `pass` | `VisualEditor.css` 固定表格布局、满宽度和 `th/td min-width: 7rem`；布局合同 RED `a279176`、GREEN `7ca8507` |
| 表格创建、输入、Tab 追加行 | `pass` | 最新隔离 Release 报告；表格结构与保存/重开通过 |
| 添加列、删除行、删除列 | `pass` | 同一报告；操作后矩阵为 `2` 行、`2` 列，`Header` 内容保留 |
| 居中对齐保存与重开 | `pass` | 同一报告；GFM 输出包含合法的 `:----:` 居中分隔线，重开后 `text-align: center` 保留 |
| 表格工具栏纵向切片 | `pass`（显式 visual Beta） | [phase2-production-e2e-phase3-table-toolbar-fixed3-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-toolbar-fixed3-20260824.json>)；`failed=0`、`unexpectedRuntimeErrors=0` |
| Phase 1B 完整表格矩阵 | `pending` | 左/右对齐及更完整矩阵仍待补充；本次通过不提升大文档性能等级 |
| 正式 T4 500 KiB / Popout 内存 | `failed`（保留原证据） | 不因本轮表格工具栏通过而改写 `500 KiB press=0/1000` 或 `10 Tab + 1 Popout` 内存失败 |

## 2026-08-24 表格三档对齐主场景

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 左对齐命令 | `pass` | 隔离 Release 中点击 `visual-editor-table-align-left` 后 DOM `text-align: left` 可见 |
| 居中命令 | `pass` | 同一场景中间态和最终保存/重开均通过，GFM 分隔线为合法可变宽度形式 |
| 右对齐命令 | `pass` | 隔离 Release 中点击 `visual-editor-table-align-right` 后 DOM `text-align: right` 可见 |
| 三档对齐与表格结构组合 | `pass`（显式 visual Beta） | [phase2-production-e2e-phase3-table-toolbar-alignments-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-phase3-table-toolbar-alignments-20260824.json>)；`failed=0`、`unexpectedRuntimeErrors=0` |
| 完整表格矩阵 / 正式性能 | `pending` / `failed` | 不把三档对齐主场景通过扩大为完整矩阵或 500 KiB 性能通过 |

## 2026-08-24 Phase 3 完整表格兼容矩阵收口

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 30 例表格兼容语料 | `pass` | [phase2-production-table-matrix-20260824-full-001.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>)；`fixtureCount=30`、`passed=30`、`failed=0`、`status=pass` |
| 首次加载结构 | `pass` | 每个 fixture 均验证 1 个 table、行列数和表头语义对齐；显式 `visual-prosemirror` Release、临时数据根 |
| 保存源与重开稳定性 | `pass` | 每个 fixture 首次加载和重开后均与声明结构一致，临时 `.md` 源内容保持原样；`reopenStable=true` |
| 默认左呈现的语义归一 | `pass` | 原始 DOM `text-align: left` 保留为审计值，未声明对齐归一为语义 `none`；显式 left/center/right 仍按 fixture 语义校验 |
| 运行时与隔离边界 | `pass` | `runtimeErrors=0`、`unexpectedRuntimeErrors=0`；Owner 端口 `4173/4205/9265/4207` 未触碰，矩阵端口无监听残留 |
| Phase 1B 表格兼容矩阵子项 | `pass`（显式 visual Beta） | 关闭 30 例兼容/加载/重开矩阵缺口；不等于所有表格编辑操作均在 30 例中重复执行 |
| 正式 T4 500 KiB / Popout 内存 | `failed`（保持原证据） | 本矩阵明确不证明正式 `500 KiB press p95`、`10 Tab + 1 Popout` 内存门槛或默认 `legacy-preview` 切换 |

本轮 TDD 定向合同 `6/6 pass`，探针 `node --check` 通过；RED checkpoint 为 `681dece`，GREEN checkpoint 为 `5f65fbe`。本节只关闭表格兼容矩阵，不改变正式 T4 失败、默认模式或 Gate D 条件。

## 2026-08-24 Phase 3 图片元数据持久化收口

- 六类图片 fixture（本地、图床、涂鸦、宽度、PNG Data URL、危险源回退）已在显式 `visual-prosemirror` Release 中完成加载、DOM 元数据检查、编辑、保存、重开和回读；最新报告 [phase2-production-image-persistence-20260824-classified.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production-image-persistence-20260824-classified.json>) 为 `status=pass`、`passed=6`、`failed=0`、`runtimeErrors=0`。
- 危险图片继续回退旧预览，源 Markdown 保持不变；安全图片的正式节点元数据合同保留本地关系、图床 URL、涂鸦关系、宽度和安全 Data URL。
- 探针将仅限 `image-hosted`、固定 `https://cdn.example.com/hosted.png` 且错误为 `net::ERR_CONNECTION_CLOSED` 的离线网络错误单独记录为 `expectedRuntimeErrors`；其他 console/page error 仍会使报告失败。本次重跑未触发该错误，`expectedRuntimeErrors=0`。
- 图片合同测试通过，探针 `node --check` 通过；本项只表示显式 visual Beta 的图片持久化边界收口，不提升正式 500 KiB 性能、Popout renderer 内存、默认化或 Gate D 状态。

## 2026-08-24 Phase 3 Wikilink P1 收口

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| Wikilink 合同 | `3/3 pass` | `tests/visualEditorWikilinkContract.test.ts`；覆盖目标、别名、原始 Markdown、文本拆分和 Beta 持久化边界 |
| Wikilink visual Release 主场景 | `pass` | [phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json>)；14/14 结果检查通过，`failed=0`、`unexpectedRuntimeErrors=0` |
| 渲染与别名 | `pass` | 目标元数据 `项目计划` 和显示别名 `计划别名` 均在 visual editor 中保留 |
| 编辑、保存与重开 | `pass` | Wikilink 所在笔记完成编辑、写盘和 Release 重开回读 |
| 点击导航与 visual remount | `pass` | 点击 Wikilink 后目标标题和 `目标笔记正文` 同时出现在新的 `mknote-visual-editor` 中 |
| 模式保持修复 | `pass` | `src/App.tsx` 在目标笔记无缓存 session 时继承当前 `viewMode`；仅显式 `forceEditMode` 才强制回到旧 Markdown 编辑模式 |
| 构建 | `pass` | `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror npm.cmd run tauri build -- --no-bundle`；退出码 `0` |
| 默认与受保护边界 | `unchanged` | 默认仍为 `legacy-preview`；Private/Popout 不启用 visual editor；正式 T4 500 KiB 输入与 Popout 内存失败保留 |

本项关闭显式 visual Beta 的 Wikilink P1 主场景，不代表 Gate D 默认化、AI P1、Private/Popout visual 支持或正式 T4 两项失败已完成。

## 2026-08-24 Phase 3 AI 选区 P1 收口

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| AI 选区合同 | `2/2 pass` | [visualEditorAiSelectionContract.test.ts](<C:/Projects/MKnote/tests/visualEditorAiSelectionContract.test.ts>)；覆盖 visual 选区路径、请求接线、revision 保存链，以及替换/续写边界 |
| visual 选区进入 AI 请求 | `pass` | [Phase 2 Release 报告](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-20260824-wikilink-navigation-remount-fixed-1.json>) 的 `visual-ai-selection-and-apply`；请求体包含实际选中文本 |
| AI 结果应用 | `pass` | 结果写回当前 Markdown 选区，`selectionSent=true`、`resultApplied=true` |
| 保存与重开 | `pass` | 同一隔离报告 `saved=true`、`reopened=true`；使用隔离 mock AI API，不依赖真实外部服务 |
| 默认与受保护边界 | `unchanged` | 默认仍为 `legacy-preview`；Private/Popout 不启用 visual editor；正式 T4 失败 artifact 保留 |

本项关闭显式 visual Beta 的 AI 选区主场景；AI 外部服务配置、Gate D 真实笔记试用和 Phase 4 默认化仍不在本项范围内。

## 2026-08-24 Wikilink GREEN checkpoint 与受保护窗口审计

- Wikilink 合同当前为 `4/4 pass`：在原有解析、别名、文本拆分和 Beta 持久化合同之外，新增了无缓存目标笔记导航时保持当前 `viewMode` 的回归断言；前文 `3/3` 为修复前的历史快照。
- 测试 checkpoint 为 `372b7c1`，实现 checkpoint 为 `98233c6`；根项目 `npm.cmd run build` 与 Wikilink 合同均通过。
- `tests/visualEditorProtectedWindowContract.test.ts` 为 `1/1 pass`：Popout 保留 visual editor 接入与回退边界，Capsule 不引用 `VisualEditor`，Private/隐私遮罩仍阻断 visual 入口。
- 本轮没有扩大默认支持边界：默认仍为 `legacy-preview`；显式 visual Beta 的 Popout P0 已单独通过，Capsule/Private 仍使用保护旧链路；正式 T4 的 500 KiB `press=0/1000` 与 Popout 内存失败继续保留。

## 2026-08-24 Popout visual P0 生命周期清理收口

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 异步 Tauri 监听清理合同 | `5/5 pass` | `tests/asyncUnlisten.test.ts` 覆盖注册未完成时清理、重复清理、注册失败、同步抛错和 rejected Promise；实现位于 `src/utils/asyncUnlisten.ts` |
| 显式 visual Beta 生命周期与 Popout P0 | `pass` | [phase2-lifecycle-e2e-phase3-popout-visual-p0-20260824-named.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-phase3-popout-visual-p0-20260824-named.json>)：`status=pass`、7/7 结果通过、`runtimeErrors.unexpected=[]`；Popout 详情为 `visual-prosemirror`、`visualEnabled=true`、`reopenedVisual=true`，同时覆盖 Capsule/Private 保护、初始化回退、隐藏和退出保存 |
| 同一 Release 的 legacy 对照 | `pass` | [phase2-lifecycle-e2e-phase3-popout-legacy-20260824-async-catch.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-lifecycle-e2e-phase3-popout-legacy-20260824-async-catch.json>)：7/7 结果通过、`runtimeErrors.unexpected=[]` |
| Popout renderer visual 支持 | `pass`（显式 visual Beta） | Popout P0 已验证 visual 挂载、保存/关闭回传和重开后仍为 visual；这不等于 Popout renderer 内存门槛通过 |
| Owner 端口 | `unchanged` | `4173`、`4205`、`4207`、`9265` 均未触碰 |
| 正式 T4 / Gate D | `unchanged` | 500 KiB `press=0/1000`、Popout 内存约 `168.664 MiB / 33.98%` 和 Gate D `0/20`、`0/14` 仍保留原状态 |

## 2026-08-24 Phase 3 分割线 P1 收口

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 分割线合同 | `3/3 pass` | `tests/visualEditorDividerContract.test.ts`；覆盖命令映射、工具栏入口、`hr` 样式和 Release 探针 |
| 分割线 visual Release 主场景 | `pass`（显式 visual Beta） | [phase2-production-e2e-divider-20260824-rerun.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-divider-20260824-rerun.json>)；`visual-divider-persistence` 插入、写盘、重开和 `hr` 回读通过 |
| CommonMark 写盘 | `pass` | 实际 serializer 输出合法 `***` thematic break；探针不硬编码单一合法 marker |
| 默认与正式门槛 | `unchanged` | 默认仍 `legacy-preview`；Gate D `0/20`、`0/14`；500 KiB `press=0/1000` 和 Popout 内存失败继续保留 |

## 2026-08-24 查找替换 P1

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 查找替换合同 | `3/3 pass` | `tests/visualEditorFindReplaceContract.test.ts`；覆盖 Session、Adapter、ProseMirror 选区、用户入口和 Release 探针接线 |
| 查找下一个与当前替换 | `pass` | 显式 visual Beta 中可查找下一个并循环，随后替换当前匹配项 |
| 全部替换 | `pass` | 隔离 Release 主场景报告 `visual-find-replace-persistence` 回读 `replacedAll=2`，目标文本不再残留 |
| 保存与重开 | `pass` | [phase2-production-e2e-visual-find-replace-20260824-final.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-e2e-visual-find-replace-20260824-final.json>)：`status=pass`、`failed=0`、`unexpectedRuntimeErrors=0`、`saved=true`、`reopened=true` |
| 默认与正式门槛 | `unchanged` | 默认仍 `legacy-preview`；Private/Capsule 保护旧链路；Gate D 仍为 `0/20`、`0/14`；500 KiB `press=0/1000` 与 Popout 内存失败不被本项覆盖 |

## 2026-08-24 正式 T4 backlog 复核

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 500 KiB 正式 `press` | `failed`（保留） | 最新正式报告 cold `30/30`、hot `100/100`，但 `press=0/1000`；首个 warmup 样本没有键盘/输入事件，不能由 `insert-text` 或 OS/IME 对照替代 |
| 500 KiB 真实 OS/IME 对照 | `pass`（非 T4 门） | [phase1a-webview2-ime-large-editor-table-500k-raw-comment-fixed-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-webview2-ime-large-editor-table-500k-raw-comment-fixed-20260824.json>) 单次观察到中文文本、`rendererCrashed=false`、`1742 ms`；不构成正式 `press` 或 `<100 ms` p95 通过 |
| `10 Tab + 1 Popout` 内存 | `failed`（保留） | [phase1a-t4-process-memory-e2e-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260824.json>)：快照完整，working set 增量约 `168.664 MiB / 33.98%`，超过 `50 MiB / 25%` |
| T4 / Gate B-P0 处理 | `blocked`（准确分类） | Popout 为独立 WebView2 renderer 的窗口级成本；不改变输入协议、窗口语义或正式 manifest，不把局部对照改写为门通过 |
| 下一条主线 | `pending` | Gate D 真实普通笔记试用仍需 Owner 开始；当前试用记录保持 `0/20`、`0/14` |

## 2026-08-24 显式 Beta Release 隔离运行冒烟

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| visual Beta 编译模式 | `pass` | 使用 `VITE_MKNOTE_EDITOR_MODE=visual-prosemirror npm.cmd run tauri build`；编译产物模式函数为 `function y(e){return e}` |
| 默认 Release 保持旧模式 | `pass` | Beta EXE 提取后恢复原 Release SHA-256 `B86A4E5F…8FAC00`；`dist` 回读为 `legacy-preview` |
| 隔离启动与数据根 | `pass` | 临时 `App` 根、独立 `APPDATA/LOCALAPPDATA/TEMP`、CDP `9421`、PID `44564`；Owner 端口未触碰 |
| visual editor 挂载 | `pass` | 预览切换后 `data-testid=mknote-visual-editor` 存在，`data-editor-ready=true`，工具栏存在，`contentEditable=1` |
| 合成笔记写盘 | `pass` | 隔离 `.md` 回读包含 runtime marker，非预期页面/控制台错误 `0` |
| Gate D / 正式 T4 | `unchanged` | 本项仅为隔离运行冒烟；不计入真实普通笔记 `20/20`、`14/14`，不改变 500 KiB `press=0/1000` 或 Popout 内存失败 |

完整原始记录：[phase2-visual-beta-runtime-smoke-20260824.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-visual-beta-runtime-smoke-20260824.json>)。

## 2026-08-25 AI 真实服务主动验证入口

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| AI 配置 Test 入口 | `pass`（代码能力） | `AiConfigPanel` 现在同时调用模型列表和 completion 探测；探测语句固定为 `Reply with exactly OK.`，不携带用户正文 |
| AI 请求合同 | `15/15 pass` | `tests/aiApi.test.ts`、`tests/aiConnection.test.ts`、`tests/visualEditorAiSelectionContract.test.ts`；覆盖成功、自动选模型、HTTP 失败和 Token 不回显 |
| 真实外部服务 | `pending` | 本轮仍未调用真实 Token；只有 Owner 在配置面板点击 Test 并确认实际服务返回后，才能记录真实服务可用 |
| 默认 / Gate D / 正式 T4 | `unchanged` | 默认仍为 `legacy-preview`；Gate D 仍为 `0/20`、`0/14`；正式 T4 两项失败保持原证据 |

本项提升了 Owner 主动验证真实 completion 链路的能力，但不把 mock 合同或代码检查写成真实外部服务通过。

## 2026-08-25 Popout visual 按需加载边界优化

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| Popout legacy editor 加载合同 | `pass` | `tests/visualEditorPopoutLoadingContract.test.ts`；禁止 `EditablePreviewEditor` 静态导入，并要求 legacy 分支使用 `lazy` 加载 |
| Popout visual 产物边界 | `pass` | 构建后的 `PopoutView` chunk 不再静态引入 legacy editor；旧链路仍在用户切换到 legacy preview 时可用 |
| TDD checkpoint | `pass` | RED `fa190c4`；GREEN `22daa61`；根项目 `npm.cmd run build` 退出码 `0`，visual/AI 合同回归退出码 `0` |
| 按需加载后的 Popout 内存对照采样 | `failed`（有改善但未达门槛） | [phase1a-t4-process-memory-e2e-20260825-popout-lazy-unique2.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-process-memory-e2e-20260825-popout-lazy-unique2.json>)；`10 Tab + 1 Popout`：`497,827,840 → 631,840,768` bytes，增量 `127.805 MiB / 26.92%`；关闭 Popout 后释放约 `70.422 MiB`，进程数 `8 → 7` |
| 正式 T4 / Gate D | `unchanged` | 本项未重跑正式内存门槛；500 KiB `press=0/1000`、Popout 内存失败和 Gate D `0/20`、`0/14` 继续保持原证据 |

## 2026-08-25 主窗口 EditorPane 按需加载

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| `EditorPane` VisualEditor 加载合同 | `pass` | [visualEditorEditorPaneLoadingContract.test.ts](<C:/Projects/MKnote/tests/visualEditorEditorPaneLoadingContract.test.ts>)；禁止静态导入，要求 visual 分支使用 `lazy`，两个编辑器分支均位于 `Suspense` 内 |
| 构建与 chunk 边界 | `pass` | `npm.cmd run build` 退出码 `0`；`VisualEditor` 保持独立构建 chunk，默认 legacy 不静态携带 visual editor |
| 行为与发布边界 | `unchanged` | 默认仍为 `legacy-preview`；Private/Capsule、保存/CAS、正式 T4 和 Gate D 结论未因按需加载改变 |

本项是主窗口资源边界优化，不是 Gate D 或正式 T4 通过证据。

## 2026-08-25 VisualEditor lazy chunk 失败回退

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| lazy 导入/渲染失败捕获 | `pass` | `VisualEditorErrorBoundary` 使用 `getDerivedStateFromError` / `componentDidCatch`，只包住 visual 分支 |
| 失败后的旧编辑器回退 | `pass` | `componentDidCatch` 设置 `visualEditorFailed=true`，父层切换到 `EditablePreviewEditor`；[合同](<C:/Projects/MKnote/tests/visualEditorEditorPaneLoadingContract.test.ts>) `3/3 pass` |
| 构建与 visual 回归 | `pass` | `npm.cmd run build` 与完整 `visualEditor*.test.ts` 回归均退出码 `0` |
| 默认 / Private / Capsule / T4 / Gate D | `unchanged` | 默认仍为 `legacy-preview`；受保护链路、正式 T4 失败和 Gate D `0/20`、`0/14` 不受本项影响 |

本项补齐的是 lazy 导入失败边界，不等于真实 Beta 观察或正式 T4 通过。

## 2026-08-25 Popout visual lazy chunk 失败回退

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| Popout lazy 导入/渲染失败捕获 | `pass` | `VisualEditorErrorBoundary` 包住 Popout visual 分支，覆盖动态 chunk rejected 与渲染异常 |
| 失败后的旧编辑器回退 | `pass` | `visualEditorFailed=true` 后切换到 `EditablePreviewEditor`；`tests/visualEditorPopoutLoadingContract.test.ts` 合同通过 |
| 构建与 visual 回归 | `pass` | 完整 `visualEditor*.test.ts` `119/119 pass`；`npm.cmd run build` 退出码 `0`；`VisualEditor` 保持独立 chunk |
| 默认 / Private / Capsule / T4 / Gate D | `unchanged` | 默认仍为 `legacy-preview`；Private/Capsule、正式 T4 失败和 Gate D `0/20`、`0/14` 不受本项影响 |

本项只补齐 Popout 的 lazy 导入失败回退，不替代真实 Beta 观察或正式性能门槛。

## 2026-08-25 表格 P1 当前合同复核

- 当前表格合同集合重新执行为 `16/16 pass`、`failed=0`、退出码 `0`，覆盖表格命令、兼容矩阵、E2E 合同和矩阵 E2E 合同。
- 显式 visual Release 表格矩阵 [phase2-production-table-matrix-20260824-full-001.json](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase2-production/phase2-production-table-matrix-20260824-full-001.json>) 保持 `status=pass`、`fixtureCount=30`、`passed=30`、`failed=0`、`runtimeErrors=0`。
- 当前可确认的是表格兼容、结构加载、关闭、重开和源 Markdown 保真矩阵通过；不把它扩大为完整编辑组合穷举，也不关闭正式 T4 的 500 KiB `press=0/1000`、Popout 内存失败、Gate D 或默认化条件。
- 前文表格 `partial` / `pending` 内容保留为历史阶段快照；本节为最新状态。真实普通笔记试用仍为 `0/20`、`0/14`，真实外部 AI 仍 `pending`。

## 2026-08-25 Phase 4 绿色包当前工件预审

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 历史 ZIP 结构 | `pass`（历史工件） | `MKnote-portable-v4.2.5-20260823-155512.zip` 仅含 `MarkdownStickyNote.exe`、`README.txt`；包内 EXE hash 为 `A35C88F2…FDD272D` |
| 与当前 Release 一致性 | `failed`（旧包/旧 EXE） | 当前 Release EXE hash 为 `B86A4E5F…8FAC00`、修改时间为 `2026-08-24 22:13:32`；ZIP 修改时间为 `2026-08-23 15:55:15`，当前 `dist/index.html` 修改时间为 `2026-08-25 02:40:46`，前端与 EXE 未对齐 |
| Phase 4 当前发布包 | `pending` | 旧 ZIP 不代表当前代码；正式发布窗口需重新执行 `npm.cmd run build:green`，再完成版本、entries、SHA-256 和实机验收 |
| Gate D / 默认化 | `unchanged` | 真实普通笔记仍为 `0/20`、`0/14`；默认仍为 `legacy-preview`，不因历史包体 pass 提前进入 Phase 4 |

## 2026-08-25 Phase 4 新绿色包静态验收

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 当前绿色包构建 | `pass` | [MKnote-portable-v4.2.5-20260825-035047.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260825-035047.zip>)，版本 `4.2.5` |
| ZIP 体积与清单 | `pass` | `13,771,154` bytes，较基线增幅约 `1.0806%`；仅含 `MarkdownStickyNote.exe`、`README.txt`；路径穿越项 `0` |
| ZIP SHA-256 | `pass` | `B6F5797D68AC5A719FE4828D7E5AE2403F09AF54F2EDE0FE31E56A9FD4EED129` |
| 包内/Release/portable EXE 对齐 | `pass` | 三者 SHA-256 均为 `AE05E1A6215221B38BDA525C7E39CF93DCC6B27B90CE5C4B400B1271F730CCE9`；Release 时间晚于 `dist/index.html` |
| T4 候选包体记录 | `pass`（子项） | [metrics](<C:/Projects/MKnote/poc/visual-editor-phase1a/artifacts/phase1a-t4-package-metrics-20260825-green.json>)；候选 manifest 将 `release-package` 标为 `pass` |
| 正式 T4 / Gate B-P0 | `blocked` | 候选 manifest 中 500 KiB WebView2 输入和进程内存仍 `failed`；正式 manifest 未覆盖 |
| 实机启动冒烟 | `pending` | 旧隔离 Beta PID `44564` 仍运行且启用单实例；待释放后执行 `npm.cmd run smoke:release:input`，本轮不把旧窗口结果归因于新 Release |
| Gate D / 默认化 | `unchanged` | 真实外部 AI `pending`，普通笔记 `0/20`、`0/14`；默认仍为 `legacy-preview` |

本节闭合的是当前包的静态身份与可追溯性，不等于完整 T4、Gate B-P0、Gate D 或默认化通过。

## 2026-08-25 Release smoke 单实例前置保护

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 启动前已有进程检查 | `pass` | `smoke-release.ps1` 在 `Start-Process` 前检查 `md-sticky-note` / `MarkdownStickyNote`，发现进程即明确失败 |
| 合同回归 | `pass` | `tests/visualEditorSmokeContract.test.ts` `7/7 pass`；PowerShell AST `errorCount=0` |
| 当前环境前置验证 | `pass`（拒绝启动） | PID `44564` 被识别并以退出码 `1` 拒绝；未发送 single-instance 请求，未读取笔记 |
| 新 Release 实机冒烟 | `pending` | 待旧隔离 Beta 关闭后执行 `npm.cmd run smoke:release:input` |

该保护只证明冒烟工具不会在已有单实例时制造误归因，不等于新 Release 的运行时冒烟通过。

## 2026-08-25 新绿色包 Release 实机冒烟验收

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| Release 启动与真实窗口 | `pass` | `smoke:release:input` 退出码 `0`；窗口 `1162x973`，截图已确认真实渲染 |
| 临时输入与保存 | `pass` | marker 写入临时 sandbox 的 `File/default/default-note.md`，`elapsedMs=2722`，状态为“本地 · 已保存” |
| 当前包身份 | `pass` | Release EXE hash 与新 ZIP/portable EXE 均为 `AE05E1A6…730CCE9` |
| 用户数据隔离 | `pass` | 使用临时 AppData/AppRoot；未读取或写入真实笔记目录 |
| Visual Beta / 正式 T4 | `unchanged` | 该冒烟是默认 Release 基线路径，不替代显式 visual Beta、500 KiB `press` 或 Popout 内存门槛 |

本节闭合的是当前 Release 的启动、窗口渲染、临时输入保存和包体身份，不等于完整 T4 或 Gate D 通过。

## 2026-08-25 Owner 简化 Gate D 当前验收快照

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 真实外部 AI Test | `pass` | Owner 于 2026-08-25 明确确认真实配置测试通过；不记录 Token、完整请求或笔记正文 |
| 真实普通笔记 | `20/20 pass` | Owner 明确确认 20 篇普通笔记已完成且未发现问题；不补造逐篇 ID 或日期 |
| 连续 14 天观察 | `optional / not-run` | 按 Owner 决策改为可选，不是 Gate D 必需条件 |
| Gate D | `pass`（简化范围） | 条件为 AI Test + 20 篇普通笔记 + Owner 确认 |
| 500 KiB 正式 `press` | `failed`（非阻塞已知限制） | 严格 T4 `press=0/1000` 失败证据保留；实际遇到问题后再处理 |
| Popout renderer 内存 | `failed`（非阻塞已知限制） | 正式内存门槛失败证据保留；实际遇到问题后再处理 |
| 默认模式与旧链路 | `unchanged` | 默认仍为 `legacy-preview`；本次 Gate D 通过不自动切换或删除回退链路 |

本节是 2026-08-25 的最新当前快照；前文历史阶段的 `0/20`、`0/14` 和 `pending` 记录保留为当时状态，不改写历史证据。

## 2026-08-26 默认 Visual 与最新 Owner 修复收口状态

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 默认模式源码解析 | `pass` | `src/utils/visualEditorMode.ts` 在未设置环境变量时返回 `visual-prosemirror`；提交 `b5b8971` 已完成切换 |
| 最新 Owner 修复 | `pass` | Owner 确认代码块收起、编辑模式按钮撤销、标题光标、标题折叠和默认便签新建按钮均通过 |
| 最新源码绿色包 | `pass` | [MKnote-portable-v4.2.5-20260826-115321.zip](<C:/Projects/MKnote/MKnote-portable-v4.2.5-20260826-115321.zip>)；entries 仅为 EXE + README；ZIP SHA-256 `383C23474CF09112986BD69F397ACB27D3C26ADCE8BBE9D408C0457C44DD649D` |
| 默认发布冒烟 | `partial` | 最新源码隔离副本 PID `17624`、CDP `9515` 已启动；只读检查确认 `.ProseMirror` 挂载、旧预览和源码编辑器未挂载；仍需 Owner 人工确认编辑、保存/重开、Popout 和 Private/Capsule 边界 |
| 严格 T4 性能 / 内存 | `failed`（非阻塞已知限制） | 500 KiB `press=0/1000` 与 Popout 内存失败证据保持不变，不在本轮重复运行 |

## 2026-08-26 嵌套列表往返修复

| 验收项 | 当前结果 | 证据与边界 |
|---|---|---|
| 紧凑嵌套列表 Markdown 往返 | `pass` | RED checkpoint `2d20196`；GREEN checkpoint `d7a930e`；`tests/luteMarkdownCompatibility.test.ts` 当前 `14/14 pass` |
| 松散列表与普通段落空行保护 | `pass` | 新增保护用例通过；只移除 Lute 错误插入的列表项之间空行，不做全局空行压缩 |
| 最新 Release / ZIP 对齐 | `pass` | v5.0.0 Release、portable 与 ZIP 内 EXE SHA-256 均为 `C22C8D4AAFE67FA96560DA3D5AE3499A9EA48C997021971DDC8E83C9673DB5A9`；ZIP SHA-256 为 `BC7C3E603CBB318DF59CCAA82453A0710E53E6D25CCD982648E26D41D1FAA480` |
| Visual Editor 实机嵌套列表保存/重开 | `pass` | Owner 于 2026-08-26 确认任务/嵌套列表及完整 Visual Editor 人工测试通过；自动化序列化合同作为补充证据 |

## 2026-08-26 v5.0.0 Owner 验收与 Release 收口

| 项目 | 结果 | 证据与边界 |
|---|---|---|
| Visual Editor 完整人工测试清单 | `Owner 已确认全部通过` | Owner 已确认工具栏、任务/嵌套列表、标题光标与标题折叠、代码块折叠、编辑模式撤销、回车换行、Popout 保存/回传/重开以及 Private/Capsule 保护边界均通过；未把自动化检查当作人工验收替代品 |
| 预览工具条与资料库交互 | `Owner 已确认全部通过` | 工具条去除重复的分割线/表格按钮，表格行列操作与对齐使用图形化图标且添加行/列图标已纠正；资料库支持失焦关闭、笔记单击以主界面 Lab 打开并关闭资料库，右侧支持 Lab / 便签打开；`libraryAndPreviewInteractionContract` `4/4 pass` |
| 最新绿色包 | `pass` | [MKnote-portable-v5.0.0-20260826-174751.zip](<C:/Projects/MKnote/MKnote-portable-v5.0.0-20260826-174751.zip>)；版本 `5.0.0`；ZIP 仅含 `MarkdownStickyNote.exe`、`README.txt` |
| ZIP SHA-256 | `pass` | `BC7C3E603CBB318DF59CCAA82453A0710E53E6D25CCD982648E26D41D1FAA480` |
| Release / portable / ZIP 内 EXE 对齐 | `pass` | 三者 EXE SHA-256 均为 `C22C8D4AAFE67FA96560DA3D5AE3499A9EA48C997021971DDC8E83C9673DB5A9` |
| 最终 Release 输入保存冒烟 | `pass` | `npm.cmd run smoke:release:input` 退出码 `0`；真实窗口 `1162x973`；marker 写入隔离 sandbox 的 `App/File/default/default-note.md`；截图与 metadata 保存在 `.codex-smoke/release-smoke-main.png` / `.json` |
| 已知范围外边界 | `unchanged` | 严格 T4 的 500 KiB `press=0/1000`、Popout 内存门槛失败和 14 天观察 `optional / not-run` 保留原记录；Front Matter、脚注、原始 HTML、思源扩展和危险 URL 继续走安全源码回退；Private/Capsule 继续使用保护旧链路 |

## 2026-08-26 主窗口拖动后的中文输入法候选框修复

| 验收项 | 结果 | 证据与边界 |
|---|---|---|
| 主窗口拖动后回编辑区中文输入与候选框 | `Owner 通过` | Owner 实际测试确认拖动主窗口后返回编辑区输入中文，候选框恢复正常；只覆盖主窗口本次复现路径，不代替 Popout 或其他窗口验收 |
| 窗口移动 IME 定向回归合同 | `pass` | `tests/windowMoveImeContract.test.ts` 已通过；覆盖单一 JS 拖动入口、移动结束后的编辑器 `blur → requestAnimationFrame → focus` 顺序；修复提交 `7e47616`，回归覆盖提交 `1df9832` |
