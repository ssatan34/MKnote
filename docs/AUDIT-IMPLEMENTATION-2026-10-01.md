# 2026-10-01 审计修复、验证与待确认删除计划

> 后续状态：已按用户“清理 A，然后提交 git”的授权执行 A 组回收站清理；版本已升级并交付 5.0.3 验收 ZIP。下方原审计、未执行计划和旧计数保留为历史快照，当前执行结果见文末。用户尚未确认应用验收通过。

基于本地 HEAD `2540736`、版本 5.0.2。按用户授权完成打包、保存/同步、异步刷新和性能修复，并追加修复复核发现的五项 P1/P2。没有安装依赖、升级版本、提交、推送或发布；没有删除既有项目文件、发布包、依赖目录或用户数据。测试使用临时 fixture 和本机回环服务，不访问生产 S3。敏感配置只检查路径，不读取或展示凭据。

最终工作区有 18 个已跟踪文件修改、10 个新增未跟踪文件，无删除项。用户退出应用后，已构建当前修复源码的测试 EXE，完成真实 WebView2 验收并退出全部测试实例；用户可恢复正常使用。前端全量 390/390、Rust 182/182 通过。七项原始 HEAD 合同失败已逐项核对并闭环。

## 项目与检查范围

项目是 Windows 本地优先 Markdown 便签，技术栈为 React 19、TypeScript 5.8、Vite 5、Tauri 2、Rust。src 为前端和编辑器，src-tauri/src 为存储、同步与系统集成，tests/scripts 为测试和验收入口，Refs/poc 为参考与实验，portable 与根目录 ZIP 为发布物。

检查了本地文件夹、Git 状态/对象统计、AGENTS、相关交接与项目说明、OpenWiki 入口、仓库打包技能、源码和依赖、目录大小及重复文件哈希。未假设远端等同本地，未手改生成的 OpenWiki。

## 已实施修改

1. **开发迁移打包**：scripts/pack-dev.ps1:45 从 Git 跟踪文件读取当前工作区内容，并收录 src、src-tauri/src、tests、scripts 中未忽略且扩展名明确的未跟踪源码，修复新增工具模块被漏包的问题。仍排除本地配置、敏感文件命名、依赖、构建/验收产物和 ZIP，拒绝链接路径。唯一包名与 CreateNew 防止覆盖，原 README 保持不变，缺失时只在 ZIP 内生成。未跟踪文档、JSON、资源和任意本地文件不自动收录，应单独审查；本次新增 TS 源码和测试已由规则覆盖。tests/packDev.test.mjs 在临时 Git 仓库验证新源码收录、数据排除、工作区版本、README 和不覆盖旧包。

2. **正常保存与同步下载**：src-tauri/src/notes.rs:460 在共享路径锁内完成预期哈希比较、原子替换及版本读取。sync.rs 使用非阻塞事务锁，下载前在路径锁下重新比较本地快照；普通文件回滚只恢复仍等于本事务写入值的文件，保留之后的新编辑。覆盖共享锁、过期快照、忙锁、bootstrap 文件恢复和新编辑保护。

3. **配置/注册表并发安全**：src-tauri/src/sync.rs:700 的 apply_sync_config 仅记录本事务改变的注册表或同步标志，持配置锁校验原值后才提交；第 711 行回滚仅撤销仍等于本事务写入值的字段，不再用整个旧配置覆盖当前配置，也不在事务未写配置时无条件恢复注册表。并发修改字段保留并报告，未冲突字段可恢复。隔离内存 fixture 验证提交时过期、禁止部分提交、回滚保留新注册表、无关配置和用户关闭同步。

4. **冲突副本回滚**：src-tauri/src/sync.rs:645 复用文件内容比较回滚。创建记录含路径和本次内容，创建过程使用路径锁；之后被编辑的冲突副本保留并报错。测试同时覆盖删除未变副本、保留其他文件和保留新编辑。

5. **同步 tick 与 dirty 变化**：src/utils/syncTick.ts 保持同一 WebView 的同步串行，clean 请求在途时收到 dirty 会安排一个受保护补跑，失败后也可重试。createProtectedSyncTick 在发出保护通知后同步占据 dirty 队列位置，再等待通知和结果，避免后来的 clean 调用抢先。src/services/syncService.ts 配合 lib.rs 的 sync_protect_default_note 命令；sync.rs:22/30 用原子编辑代次，在网络返回、默认便签下载前重查，保护已收到编辑通知的在途请求。新增回归覆盖重叠合并、dirty 升级、不并发、失败补跑、保护 IPC 延迟时的调用顺序，以及后端等待网络期间收到通知。

6. **搜索和资料库异步顺序**：src/utils/latestRequest.ts、CompactView.tsx 在查询变化、关闭、卸载时失效旧搜索；useLibraryData.ts 保护目录/筛选结果。新增 noteColorRefresh.ts，为独立颜色刷新和整库刷新共用请求顺序与卸载失效，避免旧颜色回写。tests/latestRequest.test.ts、tests/noteColorRefresh.test.ts 用可控 Promise 覆盖反序完成及卸载。

7. **搜索性能**：src-tauri/src/search.rs:86/104、notes.rs 复用请求级配置和颜色快照，避免逐条重复读取；纯筛选不读取正文。隐私排除、摘要、排序和 50 条上限保留。纯筛选零正文读取、过滤和 Unicode 等检查通过。

8. **按需高亮**：previewDom.ts/previewHighlight.ts 仅有代码块时动态加载完整 highlight.js，保留全部语言，失败保留可读代码。测试验证无代码不加载、多代码块共享加载。最终按需高亮模块为 978,511 B；caretMapping 为 3,264,896 B。审计时旧 dist 对应 chunk 为 4,250,717 B，但它不是本轮重建的 HEAD 基准，不能据此宣称精确净包体或启动耗时收益。

9. **Logo 无损优化**：src/assets/icons/logo.svg 从 1,326,868 B 降至 1,246,408 B，减少 80,460 B（约 6.06%）。只重压缩嵌入 PNG 的 IDAT；与 HEAD 比较证明 SVG 几何、PNG 非 IDAT 数据块及解压扫描行完全相同。扫描行 SHA-256：4677c3215255a10820596a8005ffe5513407a839ed2b065f717f24c7f087b472。未改变裁剪、圆角、阴影或像素，未改为有损图片。

10. **直接依赖声明**：package.json 与 package-lock.json 增补现有类型导入所需的 @milkdown/transformer 7.19.2、@types/mdast 4.0.4。根清单、锁文件与现有 node_modules 版本一致；没有安装、下载或升级依赖。类型检查通过；未执行全新干净安装。

11. **测试可靠性与旧合同**：s3_store.rs 仅测试 fixture 禁用代理并限制 accept/read 等待，生产客户端不变。visualEditorInitialLoadContract.test.ts 更新落后于 HEAD 的字面量断言，使其验证已有任务标记规范化；未修改编辑器实现来迎合旧测试。

## 独立复核与验证结果

独立只读复核检查事务、请求门控、打包和 dirty 保护。曾发现保护 IPC 等待期间的调用顺序问题，已修复并新增延迟通知回归，最终复核未发现该修复引入新的明确错误。

- Rust 全量：182/182 通过，仍有 7 类既有 dead-code warning。
- 前端全量：390/390 通过；七项原始 HEAD 合同失败已结合真实 UI 分析并闭环。
- TypeScript：tsc --noEmit --incremental false 通过。
- 最终 Vite 生产构建通过，输出至新增 .codex-smoke/audit-20261001-43af12a7/frontend-final 目录，没有覆盖 dist 或生成绿色发布包；仍有大于 500 kB 的 chunk warning。
- 打包定向 2/2；最终 dirty/颜色定向 6/6；其他本轮请求顺序与高亮检查包含在前端全量结果中。
- git diff --check 通过。现有发布物与清理候选全部保留。

日志与产物：

- Rust：C:\Users\developer\AppData\Local\Temp\mknote-final-rust-735fc46746054dcf9131342e9896e42e.log
- 前端：C:\Users\developer\AppData\Local\Temp\mknote-ui-all-tests-c6c67cbc1ee04478ac42ea3a547e32ef.log
- 构建：C:\Users\developer\AppData\Local\Temp\mknote-final-build-870f8bc7106e4003a93ce9b3b29479d7
- 原始 HEAD 基线：C:\Users\developer\AppData\Local\Temp\mknote-baseline-94e840597e47408697543852a817da5d\baseline-tests.log

最初 Rust 沙箱检查受证书/ACL 权限影响，取得执行权限后通过；回环 HTTP fixture 曾受代理影响，修复测试超时和 no_proxy 后通过，没有连接生产 S3。

### 七项原始 HEAD 失败名称

tests/quickTodo.test.ts：

1. Quick Todo pin icons exist and the main entry icon uses the primary token
2. Quick Todo semantic tag icons use primary while non-tag controls stay neutral
3. completion control keeps its Chinese aria-label and tooltip in sync
4. Quick Todo CSS follows the DESIGN.md token and layout contract
5. Quick Todo continuously monitors native foreground state before requesting close
6. Quick Todo 面板右上角关闭按钮不触发原生窗口拖动

tests/visualEditorCaretClickContract.test.ts：

7. Visual Editor 必须在一次普通点击后显式同步 ProseMirror 光标

隔离 HEAD 的 Quick Todo、caret-click、initial-load 三文件原为 61/69：上述七项，加 Milkdown adapter skips the duplicate initial Markdown load。后者已通过修正过时的初始加载断言解决。七项失败的最终处理：①入口图标按当前次要图标/悬浮强调 token 验证；②空标签及复选框已组件化并支持悬浮强调，断言改为验证实际组件及语义 token；③完成框验证 AnimatedCheckbox 的 label 传递与 input 的 aria-label/title；④修复标签面板硬编码白色、移除区域阴影并用 outline 保留筛选标记，原有禁硬编码颜色/阴影合同未放宽；⑤验证共享锁定组件及多 Todo 的 save_and_hide(window, todo_id) 参数；⑥验证共享 CloseButton 的 data-no-drag 及父容器保护；⑦插件边界定位不再依赖 LF 空行，全部光标行为断言保留。基线目录的 node_modules 是指向项目依赖的 junction，未来清理不能跟随链接删除目标。

## 真实 WebView2 验收与七项合同闭环

用户确认退出后，检查无实例占用。使用 cargo rustc 构建当前源码的测试 EXE，并嵌入最终生产前端。测试 EXE 使用 dev profile（支持保存失败注入），不是旧发布 EXE，也未生成正式发布包。SHA-256：13917142019802917ee46d607b9c9c2d17608483ca3e879db9691b5ed01f51ab。

测试 EXE：C:\Users\developer\AppData\Local\Temp\mknote-ui-final-43af12a7e8c54ef39a0ec8b674490f85\md-sticky-note.exe。

全部数据、APPDATA、LOCALAPPDATA、TEMP、WebView2 用户目录隔离；CDP 仅监听本机 9391。真实 UI 最终 13/13 通过：

1. 当前 Visual Editor 与代码块正常渲染。
2. 单次普通点击落在指定字符，真实输入保存到临时磁盘。
3. 源码/预览往返保留编辑。
4. 从 Todo 选择器打开原生 Quick Todo。
5. 新增 Todo。
6. 深色标签面板背景与画布一致、无阴影，六类标签保留语义颜色。
7. 完成/取消完成的中文 aria-label、tooltip 与状态一致。
8. 置顶和锁定切换。
9. 440px 布局与关闭按钮 no-drag。
10. 原生焦点转到本轮主窗口后，未锁定 Todo 保存并隐藏。
11. 关闭按钮隐藏原生 Todo。
12. 外部修改 CAS 冲突保留编辑器本地内容及外部磁盘版本，并显示错误。
13. 注入保存失败时，保留未保存内容、磁盘不变、错误可见。

证据：.codex-smoke/audit-20261001-43af12a7/ui-summary.json；同目录保留四份结果 JSON、main-ui.png、todo-ui-final.png、cas-conflict.png、save-failure.png 和 CDP 探针。最终前端产物为该目录 frontend-final/。

测试过程中纠正了三类探针问题：首次构建绝对目录被解析为 URL，改用相对前端目录重建；Todo 入口先显示选择器且新 WebView 有加载阶段，探针增加正确步骤；外部冲突未保存状态会阻止从主窗口重新打开 Todo，关闭验证改为显示本轮已有 Todo 窗口后点击关闭。最终结果均来自纠正后的实际操作，未将探针错误算作产品通过。

最后保存失败测试通过后，已按 PID 和完整 EXE 路径核对并退出本轮测试实例，确认无 MDnote 测试进程和 9391 监听残留。用户无需继续保持应用关闭，可恢复正常使用。没有停止或操纵真实用户实例。

其他明确边界：

- dirty 通知只有到达后端后才能保护尚未执行的下载，不能撤销已完成的写入；字段/内容比较不能辨别先改变后恢复同值的 ABA 情况。
- 外部编辑器若不遵守路径锁协议，仍可能在最终比较与替换之间写入；不承诺跨任意外部软件的严格 CAS。重命名、删除及全应用事务改造未扩展。
- bootstrap 在文件应用前或应用失败的部分早期错误路径，可能保留之前创建的额外冲突备份。这是旧行为，未被本轮扩大为删除；不能宣称所有 bootstrap 失败都完全回滚。
- 未跑 10,000 条便签、500 KiB 编辑器或实机启动/内存性能基准，未运行生产 S3、思源、图床和真实凭据集成。

## 原审计机会逐项归档

已完成：打包防覆盖/排除本地数据/必要未跟踪源码收录；保存和下载锁及快照检查；回滚新编辑保护；tick 合并与 dirty 变化；搜索和颜色旧结果失效；请求级搜索元数据快照；纯筛选免正文；高亮按需加载；Logo 无损压缩；直接类型依赖声明；回环测试超时/代理隔离。

暂缓且原因明确：全文索引/top-k、80 份完整撤销快照的内存优化需先有性能基准；App.tsx/App.css/lib.rs/sync.rs 大模块拆分属于大重构，本轮不扩展；Lute/Milkdown/回退编辑器有不同职责，不按重复依赖裁剪；未使用工具、重复图标、JS global-shortcut 依赖及旧 S3 PUT 分支属于待确认裁剪，保留现状；CI 扩充、OpenWiki/历史文档统一另行处理，生成页面不手改；七项旧 UI 合同失败现已完成真实验收和合同修正。未实施项没有计入已完成收益。

## 待确认删除计划：未执行

根目录：C:\Projects\MKnote。以下大小为上一轮逻辑字节快照；本轮 EXE 构建使缓存继续变化，执行前必须重算，不是承诺释放空间；Cargo 产物有硬链接，执行前须重扫文件 ID/链接并集及占用，不能机械相加。所有候选仍在原处。

### A：优先评估

| 路径 | 逻辑大小 B | 引用/重复证据、风险与恢复 |
|---|---:|---|
| src-tauri/target/debug/incremental/ | 2,612,603,523 | Cargo 增量缓存；仅限此子目录，无运行编译占用后才可清理；后续重编译恢复，首次编译变慢。 |
| portable-release/ | 34,865,528 | 仅 EXE+README；EXE 与 portable、release 相同 SHA-256（d8b86c7e…a8fc）。须确认快捷方式/运行入口与 README 的保留需求；保留 portable 与最新 ZIP。 |
| Refs/Timeline Note List UI.zip | 1,020,845 | 66/66 文件内容哈希在 Refs/timeline-ui/ 找到相同副本；保留解压目录，需要原归档元数据则备份。 |
| Refs/Dark Futuristic Toolbar UI.zip | 669,733 | 67/67 文件内容哈希在 Refs/capsule-ui-ref/ 找到相同副本；同上。 |
| MKnote-portable-v5.0.0-20260828-181043.zip | 13,835,346 | 历史回退版本、文档有引用，不是二进制重复；需要回退则归档。 |
| MKnote-portable-v5.0.1-20260903-111111.zip | 13,844,344 | 历史版本，保留需求确认后才删。 |
| MKnote-portable-v5.0.1-20260908-194840.zip | 13,844,348 | 同上，不能按相同版本号认定重复。 |
| MKnote-portable-v5.0.1-20260915-124542.zip | 13,844,448 | 同上。 |
| MKnote-portable-v5.0.1-20260915-142947.zip | 13,844,379 | 同上。 |

五个旧 ZIP 合计 69,212,865 B。备份若仍在同一磁盘，不产生相应净空间收益。旧轮硬链接估计不再作为本轮删除承诺，实际执行前重新计算。

### B：可选重建缓存

| 路径 | 逻辑大小 B | 风险与恢复 |
|---|---:|---|
| src-tauri/target/debug/deps/ | 7,732,323,315 | 与其他产物可能硬链接，重建成本较高。 |
| src-tauri/target/debug/build/ | 1,190,229,872 | 构建脚本缓存，需要重编译。 |
| src-tauri/target/release/deps/ | 2,367,086,997 | 影响下次发布构建，保留上层 EXE 与发布包。 |
| src-tauri/target/release/build/ | 502,422,552 | 同上。 |

执行前确认无 cargo/rustc 占用，保留 Cargo.toml/Cargo.lock、工具链和离线下载缓存。不得扩大为 target、debug 或 release 整目录删除。

### C：低优先级

| 路径 | 逻辑大小 B | 风险 |
|---|---:|---|
| node_modules/ | 200,097,442 | 影响离线开发，需按锁文件重装；基线证据目录有指向它的 junction。 |
| dist/ | 7,262,309 | 可重建，但可能用于已有预览；本轮未覆盖。 |

### D：源码裁剪候选，不能直接当垃圾删除

| 路径 | 大小 B | 证据与执行前验证 |
|---|---:|---|
| src/utils/htmlSanitizer.ts | 2,255 | 未发现生产调用；核对入口及编辑器 HTML 安全回归。 |
| src/utils/imageAsset.ts | 433 | 未发现调用；核对图片粘贴、导入、本地资源展示。 |
| src/utils/taskCheckbox.ts | 357 | 仅旧 previewCheckbox 测试使用；验证任务列表保存/重开。 |
| tests/previewCheckbox.test.ts | 1,300 | 与上项联合评估，不留悬空导入。 |
| src/utils/quickTodo.ts | 211 | 仅 quickTodo.test.ts 两个旧断言使用；不得删除整个 quickTodo.test.ts。 |
| src/assets/icons/timeline.svg.svg | 826 | 与 timeline.svg SHA-256 相同；Icon.tsx 使用 eager glob，先核对 manifest/图标 ID。 |
| src/assets/icons/Text-style-one (文本样式).svg | 560 | 与 font-increase.svg SHA-256 相同；同上。 |

D 组约 5.8 KiB。搜不到引用不等于可删；应按源码修改流程保留 diff 并跑回归。@tauri-apps/plugin-global-shortcut 的 JS 包未发现前端导入，但 Rust 插件确实使用；旧 S3 PUT 方法仍有测试，不删除整个模块或手工删 node_modules 子目录。

### 明确保留

- src-tauri/target/debug/config.json、src-tauri/target/release/config.json，以及两目录下 File/、inbox/、默认便签、同步状态、历史快照和未分类文件。路径存在不代表缓存，未读取配置凭据。
- portable/、MKnote-portable-v5.0.1-20260917-085127.zip（13,584,290 B）、MKnote-portable-v5.0.2-20260917-164701.zip（13,584,134 B）。
- .git/：只读统计发现 16 个临时垃圾对象约 26.52 MiB，需另行授权 Git 原生维护，不手删对象、不改写历史。
- poc/（上一轮 9,673,651 B）、.codex-smoke/（本轮新增前端与 UI 证据，大小已增长）、历史交接与 OpenWiki：保留实验和验收证据。
- 本轮系统 Temp 日志、构建和隔离基线：保留供审阅；后续清理须核对具体路径，不能跟随 junction 删除依赖目标。

用户只授权了修复和验证，未授权清理。本计划须逐组明确确认后执行，例如“同意 A 组但保留所有历史 ZIP”。确认前不删除。

最终补充：QuickTodoPanel.css 修复主题背景与扁平样式；tests/quickTodo.test.ts 和 tests/visualEditorCaretClickContract.test.ts 更新组件边界及 CRLF 兼容断言，相关 66/66 通过。没有通过删除原有安全/行为要求来使测试变绿。Rust 源码自 182/182 验证后未改变；本轮追加修改仅涉及 CSS、合同测试及报告。未额外声称所有窗口/所有功能均已验收，也未测试生产远端同步或正式 Release 性能。

## 后续授权执行：A 组回收站清理与 5.0.3 本地提交

用户明确授权“清理 A，然后提交 git”。严格采用上方原 A 组九项清单，没有扩大到 B/C/D 或后续只读审计新增候选。以下为执行前重算的逻辑大小，不是释放空间。

| A 组精确路径 | 逻辑大小 B | 执行结果 |
|---|---:|---|
| src-tauri/target/debug/incremental/ | 4,134,538,206 | 已进入 Windows 回收站，可还原 |
| portable-release/ | 34,865,528 | 已进入 Windows 回收站，可还原 |
| Refs/Timeline Note List UI.zip | 1,020,845 | 已进入 Windows 回收站，可还原；66/66 内容在解压目录保留 |
| Refs/Dark Futuristic Toolbar UI.zip | 669,733 | 已进入 Windows 回收站，可还原；67/67 内容在解压目录保留 |
| MKnote-portable-v5.0.0-20260828-181043.zip | 13,835,346 | 已进入 Windows 回收站，可还原 |
| MKnote-portable-v5.0.1-20260903-111111.zip | 13,844,344 | 已进入 Windows 回收站，可还原 |
| MKnote-portable-v5.0.1-20260908-194840.zip | 13,844,348 | 已进入 Windows 回收站，可还原 |
| MKnote-portable-v5.0.1-20260915-124542.zip | 13,844,448 | 已进入 Windows 回收站，可还原 |
| MKnote-portable-v5.0.1-20260915-142947.zip | 13,844,379 | 已进入 Windows 回收站，可还原 |

执行保障与可恢复性：

- 全部绝对路径均在指定仓库内且精确命中清单；检查祖先和子项，无 reparse point/junction。逐文件独占打开检查通过，无 cargo/rustc 占用。
- 用户运行中的 `C:\MDnote\MarkdownStickyNote.exe` 不在目标内，保留原进程，没有关闭、操作或读取其数据。
- 先用自建无用户数据文件验证回收站和资源管理器标准“还原”，还原后 SHA-256 一致。PowerShell 5 初次探针因 UTF-8 无 BOM 产生错编码测试路径，随后修正编码；该路径仅含本次两个探针文件，核实后也移入回收站，未扩大用户文件清理范围。
- 使用 Windows IFileOperation 的 FOFX_RECYCLEONDELETE / undo flags，并在 PreDeleteItem 拒绝非回收操作；操作前确认回收站容量余量，失败即停。API 依据：[SetOperationFlags](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags)、[PreDeleteItem](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperationprogresssink-predeleteitem)。未永久删除、未清空回收站。
- 九项均能在资源管理器回收站中找到“还原”操作；回收元数据中的原路径匹配，所有载荷文件数量、大小、文件 ID、硬链接数量与清理前一致。
- 可打开 Windows 回收站，按原位置 `C:\Projects\MKnote` 查找相应项目并选择“还原”；若以后构建已重建 incremental 或 portable-release，先处理同名目录冲突，不盲目覆盖新内容。

空间口径：九项累计逻辑大小 **4,240,307,177 B**；按唯一文件 ID 计内容为 **3,032,291,813 B**，仍不等同物理分配空间。其中 incremental 2,461 条文件路径对应 1,491 个文件 ID，1,942 条路径的链接数大于 1；A 组有 3 个文件 ID 还链接到清单外。回收站位于同一 D 盘，内容仍保留，不能宣称释放 3.95 GiB。

操作窗口实测 D 盘可用空间从 **624,026,521,600 B** 变为 **624,007,888,896 B**，差值 **-18,632,704 B**（约 -17.8 MiB）。这是全盘读数，可能包含其他进程写入、回收站元数据及本轮证据开销，不能归因于某一个清理项；本次未证明物理可用空间增加。

保留核对：93 个指定保留文件的文件 ID、大小、修改时间一致；保留 portable/、20260917 的 5.0.1 与 5.0.2 ZIP、最新 5.0.3 ZIP、debug/release 的配置和笔记、Refs 两个解压目录、B/C/D、poc、dist、node_modules、全部验收证据。最新 5.0.3 ZIP SHA-256 仍为 `B32299EBB0D23B9EAA998ADD4F45725D27535C14036A79067DC30D3FD3AC38A9`。

本地证据位于 `.codex-smoke/cleanup-a-20261002/`：before.json、recycled.json、verified.json、space.json、restore-canary.json。证据和辅助脚本不纳入 Git。两份已跟踪 Refs ZIP 的移除纳入本次清理提交；其他 A 组为忽略的本地产物。

提交范围仅包含既有审计修复、对应回归测试、5.0.3 清单与交付文档，以及授权移除的两份 Refs ZIP。没有推送，不代表用户已验收应用，也不包含真实笔记、配置、凭据、发布 ZIP 或大体积证据。

提交前复验：前端与打包测试 **390/390** 通过；直接运行已构建的 5.0.3 Rust 测试二进制 **182/182** 通过，未重建刚清理的 incremental；TypeScript 无输出检查及 git diff --check 通过。前端日志 `mknote-precommit-front-de5a196c818d4146afe0ca0a43aecbf7.log`、Rust 日志 `mknote-precommit-rust-0de839ffd3454568a8fbddc021429b8b.log` 保留在系统 Temp。Release 隔离冒烟沿用本轮 5.0.3 的 6/6 证据，没有重启或干扰正在运行的用户实例；生产外部服务和性能基准仍未验证。
