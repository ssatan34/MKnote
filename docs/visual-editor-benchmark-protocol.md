# MKnote 可视化编辑器基准协议

> 固定版本：2026-08-21。本文用于比较当前链路与未来隔离 PoC；Node 探针不能替代 WebView2、IME 或真实窗口验收。

## 固定环境

- OS：Windows 11 家庭版中文版，build `26200`。
- CPU：AMD Ryzen AI 7 H 350 w/ Radeon 860M。
- 内存：31.12 GB。
- WebView2 Runtime：`151.0.4129.93`。
- 语料生成脚本：`tests/fixtures/visual-editor/benchmark.ts`。
- 运行脚本：`tests/visualEditorBenchmarkRunner.ts`。

## 输入与指标

- 固定输入：UTF-8 Markdown 100 KiB 和 500 KiB，分别由 `buildBenchmarkMarkdown(100 * 1024)` 与 `buildBenchmarkMarkdown(500 * 1024)` 生成。
- 冷启动：30 次；热挂载预热 5 轮后采样 100 次。
- key-to-paint：预热 5 轮后采样 1000 次。
- p95：排序后使用 `ceil(n * 0.95) - 1` 下标。
- 每份结果记录构建 hash、OS build、WebView2、语料字节数和脚本版本；不得记录笔记正文。

## Phase 1 目标（当前尚未验收）

| 指标 | 100 KiB | 500 KiB |
|---|---:|---:|
| key-to-paint p95 | ≤ 50 ms | ≤ 100 ms |
| 单次自动保存序列化主线程阻塞 | ≤ 50 ms | ≤ 100 ms |
| 内存增量 | ≤ 25% | ≤ 50 MB |
| 包体增量 | ≤ 10% | ≤ 10% |

## 当前 Node/Lute 探针

运行方式：

```powershell
node tests/visualEditorBenchmarkRunner.ts
```

2026-08-22 04:36 使用当前工作区重跑，5 轮预热、30 次样本，仅测 `luteMarkdownToHtml`：

| 语料 | median | p95 | 结论 |
|---|---:|---:|---|
| 100 KiB | 263.29 ms | 295.15 ms | 高于 Phase 1 目标；不能外推为 ProseMirror 结论 |
| 500 KiB | 1286.33 ms | 1370.28 ms | 高于 Phase 1 目标；必须在 WebView2 复测 |

该探针没有测 DOM paint、IME、React mount、真实保存、窗口内存或 ZIP 大小，因此不构成 Gate B 证据。

## 复测纪律

1. 不把 `npm run build`、Node 性能或 schema 单测当作真实窗口通过。
2. 不把旧 ZIP 大小当作当前工作区 Release 包大小；必须用同一构建重新生成。
3. 未知语法保护、IME、列表、表格、粘贴或安全样例任一低于 100% 时，停止进入下一 Gate。

## 2026-08-23 Node/Lute 重跑记录

- 本轮执行 `node tests/visualEditorBenchmarkRunner.ts` 完成，100 KiB median/p95 为 `306.07/842.57 ms`，500 KiB median/p95 为 `1422.61/3230.76 ms`。
- 该结果仅表示当前 Node/Lute CPU 适配器开销，且与 2026-08-22 结果存在明显波动；不代表 ProseMirror、WebView2、DOM paint、窗口内存、真实保存或 ZIP 包体性能。
- 因此本轮不能关闭 T4，也不能作为 Gate B-P0 的通过证据；真实 WebView2 采集入口仍需补齐或在固定窗口探针中完成。

## 2026-08-23 WebView2 诊断探针

运行入口：

```powershell
$env:MKN_PHASE1A_BENCHMARK_COLD_SAMPLES='0'
$env:MKN_PHASE1A_BENCHMARK_HOT_SAMPLES='0'
$env:MKN_PHASE1A_BENCHMARK_KEY_WARMUP='0'
$env:MKN_PHASE1A_BENCHMARK_KEY_SAMPLES='1'
$env:MKN_PHASE1A_BENCHMARK_OPERATION_TIMEOUT_MS='120000'
$env:MKN_PHASE1A_BENCHMARK_KEY_EVENT_TIMEOUT_MS='120000'
npm.cmd --prefix poc/visual-editor-phase1a run test:webview2:benchmark
```

本次只用于验证真实 WebView2 采集链路，不是完整 T4 采样：

| 语料 | key-to-paint | 状态 |
|---|---:|---|
| 100 KiB | 65.3 ms（1 次） | 诊断通过，不能替代 p95 |
| 500 KiB | 120000 ms 内未观察到 input | 当前响应阻塞，失败 |

- 报告：[phase1a-webview2-benchmark.json](../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark.json)；记录了 build hash、OS、WebView2 和采样配置，不记录正文。
- 真实 Runtime 为 `151.0.4129.101`；CDP UA 的产品版本显示为 `151.0.0.0`，两者均保留以避免把 UA 简化值当作 Runtime 精确版本。
- 该诊断运行确认 500 KiB 的编辑响应需要先处理或明确降级边界；T4、Gate B-P0 和生产接入均保持未通过。

### 2026-08-23 结构诊断补充

在不改变固定 100/500 KiB fixture、且 benchmark 输入路径不挂载全量 Markdown listener 的前提下，采集以下不泄漏正文的结构统计：

| 语料 | table | 行 | 单元格 | 后代元素 | key-to-paint |
|---|---:|---:|---:|---:|---:|
| 100 KiB | 1,024 | 2,048 | 4,096 | 16,384 | 65.3 ms（1 次） |
| 500 KiB | 5,120 | 10,240 | 20,480 | 81,920 | 120000 ms 内无 input |

- 两档结构数量近似严格按 5 倍增长；该证据支持优先调查大规模表格化 DOM / ProseMirror 压力，但不单独证明唯一根因。
- 结构报告仅写数量、节点类型计数和文本长度，不写 Markdown 正文或 HTML；最新 table 默认路径 build hash 为 `727db9c50f210301a3d89f3d43f95ae8d5c3f968c5d545d49e13158af7a9a8de`。
- paragraph 差分已完成；下一步应在不改官方 fixture 的前提下细分表格节点数量、初始化 / 布局和编辑事务压力。若引入混合 Markdown 语料，必须同步更新 Node/Lute 基线、协议和验收记录；当前仍不得把该缩小运行当作完整 T4 或 Gate B-P0 通过。

### 2026-08-23 paragraph 差分诊断（非官方 T4 fixture）

为判断 500 KiB 失败是否主要来自表格化结构，使用独立端口和独立报告运行默认关闭的 paragraph fixture：

```powershell
$env:MKN_PHASE1A_BENCHMARK_FIXTURE='paragraph'
$env:MKN_PHASE1A_BENCHMARK_REPORT='C:\Projects\MKnote\poc\visual-editor-phase1a\artifacts\phase1a-webview2-benchmark-paragraph-diagnostic.json'
$env:MKN_PHASE1A_BENCHMARK_DEV_PORT='4182'
$env:MKN_PHASE1A_BENCHMARK_CDP_PORT='9252'
$env:MKN_PHASE1A_BENCHMARK_COLD_SAMPLES='0'
$env:MKN_PHASE1A_BENCHMARK_HOT_SAMPLES='0'
$env:MKN_PHASE1A_BENCHMARK_KEY_WARMUP='0'
$env:MKN_PHASE1A_BENCHMARK_KEY_SAMPLES='1'
$env:MKN_PHASE1A_BENCHMARK_OPERATION_TIMEOUT_MS='120000'
$env:MKN_PHASE1A_BENCHMARK_KEY_EVENT_TIMEOUT_MS='120000'
npm.cmd --prefix poc/visual-editor-phase1a run test:webview2:benchmark
```

| 语料 | table | 后代元素 | key-to-paint | 结果 |
|---|---:|---:|---:|---|
| paragraph 500 KiB | 0 | 4,130 | 97.4 ms（1 次） | 通过；input-to-paint 85.7 ms |

该结果支持“官方 table fixture 的 ProseMirror / DOM 结构是主要阻塞方向”的判断，但不证明唯一根因，也不替代官方 table fixture 的完整 `30/100/1000` T4 采样。paragraph fixture 仅用于差分诊断，默认仍为官方 `table`，不得用它改写正式性能门槛。

### 2026-08-23 初始化 / 首帧 / 编辑事务 timing

在同一机器、同一 WebView2 和同一缩小采样配置下，新增 timing 报告：

| fixture | 语料 | Editor.create | ready → 首帧 | key-to-paint | input-to-paint |
|---|---|---:|---:|---:|---:|
| table | 500 KiB | 22,873.6 ms | 438.7 ms | 362.4 ms | 301.9 ms |
| paragraph | 500 KiB | 538.3 ms | 116.2 ms | 94.5 ms | 87.6 ms |

- table 最新样本已观察到 input，但 key-to-paint 和 input-to-paint 均超过正式 500 KiB 目标；此前 120 秒无 input 的样本保留为波动风险，不被新样本覆盖。
- 该结果把当前主要阻塞收窄到表格化编辑器创建 / 首帧和编辑事务，但两个 fixture 都只采集 1 次，不能替代完整 T4 p95、冷启动、热挂载、内存、保存阻塞和包体证据。
- 报告：[table timing](../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-table-timing.json)、[paragraph timing](../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-paragraph-timing.json)。

### 2026-08-23 single-table 差分 fixture

- `single-table` 是默认关闭的诊断 fixture，官方默认仍为 `table`；它只把表格节点收敛为一张表，并用固定 padding 将 500 KiB 行数保持在官方约 `10,240` 行附近。`phase1aDiagnosticFixture.test.mjs` 约束 500 KiB 行数为 `9,000–11,000`。
- 本次受控运行使用 `4183/9253`、cold `0`、hot `0`、key `1`、operation/key timeout `120000 ms`；报告：[single-table timing](../poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark-single-table-timing.json)。
- 500 KiB 结果：1 张表、`9,661` 行、`19,322` 单元格、`48,307` 个后代元素；`Editor.create=6,993.9 ms`、ready → 首帧 `281.3 ms`、key-to-paint `308.6 ms`、input-to-paint `280.6 ms`。
- 该 fixture 仅用于表格节点组织方式的方向性差分；它不改官方 `table` fixture、100/500 KiB 正式输入、T4 `30/100/1000` 采样或 `100 ms` 门槛。单样本仍超过门槛，不能据此放行 T4、Gate B-P0 或生产接入。
