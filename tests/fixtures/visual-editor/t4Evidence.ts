export const T4_EVIDENCE_IDS = Object.freeze([
  "compatibility-corpus",
  "source-aware-safety",
  "selection-history-paste",
  "webview2-performance-100kb",
  "webview2-performance-500kb",
  "save-cas-fault-injection",
  "process-memory",
  "release-package",
] as const);

export type T4EvidenceId = (typeof T4_EVIDENCE_IDS)[number];

export type T4EvidenceStatus = "pass" | "failed" | "incomplete" | "not-run";

export interface T4EvidenceRecord {
  id: T4EvidenceId;
  status: T4EvidenceStatus;
  summary: string;
  sourcePath?: string | null;
  command?: string | null;
  details?: Record<string, unknown>;
}

export interface T4EvidenceManifest {
  schemaVersion: "mknote.visual-editor.t4-evidence.v1";
  generatedAt: string;
  gate: {
    name: "Gate B-P0";
    status: "pass" | "blocked";
    blockingIds: T4EvidenceId[];
  };
  records: T4EvidenceRecord[];
}

export interface ThresholdMetricInput {
  id: T4EvidenceId;
  value: number | null | undefined;
  target: number;
  unit: string;
  sourcePath: string;
  command?: string;
  samples?: number;
  expectedSamples?: number;
  summary?: string;
}

export interface SaveCasEvidenceInput {
  p95Ms: number | null | undefined;
  samples: number | null | undefined;
  expectedSamples: number;
  sourcePath: string;
  command?: string;
  failureEvidence?: {
    saveFailure?: SaveCasFailureEvidence;
    casConflict?: SaveCasFailureEvidence;
  };
}

export interface SaveCasFailureEvidence {
  status: T4EvidenceStatus;
  sourcePath?: string | null;
  reason?: string | null;
}

export interface ProcessMemoryEvidenceInput {
  baselineBytes: number | null | undefined;
  afterBytes: number | null | undefined;
  tabCount: number | null | undefined;
  popoutCount: number | null | undefined;
  snapshotComplete?: boolean | null | undefined;
  rootPid?: number | null | undefined;
  baselineProcessCount?: number | null | undefined;
  afterProcessCount?: number | null | undefined;
  sourcePath: string;
  command?: string;
}

export interface ReleasePackageEvidenceInput {
  currentBytes: number | null | undefined;
  baselineBytes: number | null | undefined;
  currentPath: string;
  baselinePath: string;
  sha256: string | null | undefined;
  entries: readonly string[] | null | undefined;
  packageExeSha256: string | null | undefined;
  currentReleaseExeSha256: string | null | undefined;
  currentReleaseExePath: string;
  command?: string;
}

interface BenchmarkMetric {
  status?: string;
  count?: number;
  expected?: number;
  p95?: number | null;
  inputToPaintP95?: number | null;
  failures?: unknown[];
}

interface BenchmarkReport {
  protocol?: {
    benchmarkSizes?: unknown;
    benchmarkFixture?: unknown;
    benchmarkLayout?: unknown;
    benchmarkEditorProfile?: unknown;
    coldSamples?: unknown;
    hotSamples?: unknown;
    keySamples?: unknown;
  };
  build?: {
    buildHash?: unknown;
    gitHead?: unknown;
  };
  environment?: {
    os?: { release?: unknown };
    webView2?: { version?: unknown };
  };
  fatal?: unknown;
  results?: Record<string, {
    coldStart?: BenchmarkMetric;
    hotReload?: BenchmarkMetric;
    keyToPaint?: BenchmarkMetric;
  }>;
}

const PERFORMANCE_CASES = Object.freeze([
  {
    sizeBytes: 100 * 1024,
    id: "webview2-performance-100kb",
    targetKeyToPaintMs: 50,
    expected: { coldStart: 30, hotReload: 100, keyToPaint: 1000 },
  },
  {
    sizeBytes: 500 * 1024,
    id: "webview2-performance-500kb",
    targetKeyToPaintMs: 100,
    expected: { coldStart: 30, hotReload: 100, keyToPaint: 1000 },
  },
] as const);

const SAVE_BLOCK_TARGET_MS = 50;
const MEMORY_RATIO_TARGET = 0.25;
const MEMORY_BYTES_TARGET = 50 * 1024 * 1024;
const PACKAGE_GROWTH_TARGET = 0.1;
const EXPECTED_PACKAGE_ENTRIES = Object.freeze([
  "MarkdownStickyNote.exe",
  "README.txt",
]);

const REQUIRED_RECORDS = Object.freeze([
  {
    id: "compatibility-corpus",
    summary: "等待 T4 兼容语料、raw/normalize 与列表/表格/粘贴矩阵的本次运行结果。",
    sourcePath: "tests/visualEditorCorpus.test.ts",
    command: "node --test tests/visualEditorCorpus.test.ts",
  },
  {
    id: "source-aware-safety",
    summary: "等待 source-aware 保真与安全边界的本次运行结果。",
    sourcePath: "tests/sourceAwareMarkdown.test.ts",
    command: "node --test tests/sourceAwareMarkdown.test.ts",
  },
  {
    id: "selection-history-paste",
    summary: "等待 Selection、Undo/Redo 与粘贴矩阵的本次运行结果。",
    sourcePath: "tests/visualEditorInteractionContract.test.ts",
    command: "node --test tests/visualEditorInteractionContract.test.ts",
  },
  {
    id: "save-cas-fault-injection",
    summary: "等待保存序列化阻塞与 CAS 故障注入的本次运行结果。",
    sourcePath: "tests/visualEditorSaveContract.test.ts",
    command: "node --test tests/visualEditorSaveContract.test.ts",
  },
  {
    id: "process-memory",
    summary: "未采集 WebView2 进程树内存增量；需要同一 T4 运行的 machine-readable 指标。",
    sourcePath: null,
    command: "collector input: process-memory evidence",
  },
  {
    id: "release-package",
    summary: "未采集同一工作区 Release ZIP 包体及基线对比；不能使用旧 ZIP 代替。",
    sourcePath: null,
    command: "collector input: release-package evidence",
  },
] as const);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asMetric = (value: unknown): BenchmarkMetric | null =>
  isRecord(value) ? (value as BenchmarkMetric) : null;

const statusRank: Record<T4EvidenceStatus, number> = {
  pass: 0,
  "not-run": 1,
  incomplete: 2,
  failed: 3,
};

const isEvidenceStatus = (value: unknown): value is T4EvidenceStatus =>
  value === "pass" ||
  value === "failed" ||
  value === "incomplete" ||
  value === "not-run";

const isPerformanceEvidenceId = (id: T4EvidenceId): boolean =>
  id === "webview2-performance-100kb" ||
  id === "webview2-performance-500kb";

const validateEvidenceOverride = (record: T4EvidenceRecord): void => {
  if (!T4_EVIDENCE_IDS.includes(record.id)) {
    throw new Error(`unknown T4 evidence id: ${String(record.id)}`);
  }
  if (!isEvidenceStatus(record.status)) {
    throw new Error(`invalid T4 evidence status for ${record.id}`);
  }
  if (!asNonEmptyString(record.summary)) {
    throw new Error(`T4 evidence ${record.id} requires a summary`);
  }
  if (isPerformanceEvidenceId(record.id)) {
    throw new Error(
      `${record.id} must be derived from benchmarkReport, not an evidence override`,
    );
  }
  if (
    record.status === "pass" &&
    (!asNonEmptyString(record.sourcePath) || !asNonEmptyString(record.command))
  ) {
    throw new Error(
      `passing T4 evidence ${record.id} requires sourcePath and command`,
    );
  }
};

const worstStatus = (
  statuses: readonly T4EvidenceStatus[],
): T4EvidenceStatus =>
  statuses.reduce<T4EvidenceStatus>(
    (worst, status) =>
      statusRank[status] > statusRank[worst] ? status : worst,
    "pass",
  );

const evaluateSampleMetric = (
  metric: BenchmarkMetric | null,
  expectedSamples: number,
  targetP95Ms?: number,
): {
  status: T4EvidenceStatus;
  count: number | null;
  p95Ms: number | null;
  summary: string;
} => {
  if (!metric) {
    return {
      status: "incomplete",
      count: null,
      p95Ms: null,
      summary: `缺少 metric；要求 ${expectedSamples} 个样本。`,
    };
  }

  const count = asFiniteNumber(metric.count);
  const p95Ms = asFiniteNumber(metric.p95);
  const failures = Array.isArray(metric.failures) ? metric.failures.length : 0;

  if (metric.status === "failed" || failures > 0) {
    return {
      status: "failed",
      count,
      p95Ms,
      summary: `运行失败；样本 ${count ?? 0}/${expectedSamples}。`,
    };
  }

  if (count !== expectedSamples) {
    return {
      status: "incomplete",
      count,
      p95Ms,
      summary: `样本不足：${count ?? 0}/${expectedSamples}。`,
    };
  }

  if (targetP95Ms !== undefined) {
    if (p95Ms === null) {
      return {
        status: "incomplete",
        count,
        p95Ms,
        summary: `缺少 p95；目标 ≤ ${targetP95Ms} ms。`,
      };
    }

    if (p95Ms > targetP95Ms) {
      return {
        status: "failed",
        count,
        p95Ms,
        summary: `p95 ${p95Ms} ms 超过目标 ${targetP95Ms} ms。`,
      };
    }
  }

  return {
    status: "pass",
    count,
    p95Ms,
    summary: `样本 ${count}/${expectedSamples}，${targetP95Ms === undefined ? "采样完整" : `p95 ${p95Ms} ms 达标`}。`,
  };
};

const reportEligibility = (report: BenchmarkReport): string[] => {
  const protocol = report.protocol;
  const reasons: string[] = [];

  const benchmarkSizes = protocol?.benchmarkSizes;
  if (!Array.isArray(benchmarkSizes)) {
    reasons.push("缺少固定 100/500 KiB benchmark protocol");
  } else if (
    !PERFORMANCE_CASES.every((benchmark) =>
      benchmarkSizes.includes(benchmark.sizeBytes),
    )
  ) {
    reasons.push("benchmark sizes 不是固定 100/500 KiB");
  }

  if (protocol?.benchmarkFixture !== "table") {
    reasons.push("fixture 不是正式 table 语料");
  }
  if (protocol?.benchmarkLayout === undefined) {
    reasons.push("缺少 benchmark layout");
  } else if (protocol.benchmarkLayout !== "normal") {
    reasons.push("layout 是诊断 profile");
  }
  if (protocol?.benchmarkEditorProfile === undefined) {
    reasons.push("缺少 editor profile");
  } else if (protocol.benchmarkEditorProfile !== "normal") {
    reasons.push("editor profile 是诊断 profile");
  }

  const expectedSamples = { coldSamples: 30, hotSamples: 100, keySamples: 1000 };
  for (const [name, expected] of Object.entries(expectedSamples)) {
    if (protocol?.[name as keyof typeof expectedSamples] !== expected) {
      reasons.push(`${name} 配置不是 ${expected}`);
    }
  }

  if (!asNonEmptyString(report.build?.buildHash)) {
    reasons.push("缺少 build hash");
  }
  if (!asNonEmptyString(report.build?.gitHead)) {
    reasons.push("缺少 git HEAD");
  }
  if (!asNonEmptyString(report.environment?.os?.release)) {
    reasons.push("缺少 OS build");
  }
  if (!asNonEmptyString(report.environment?.webView2?.version)) {
    reasons.push("缺少 WebView2 版本");
  }

  return reasons;
};

export function evaluateBenchmarkReport(
  input: unknown,
  sourcePath: string,
): T4EvidenceRecord[] {
  if (!isRecord(input)) {
    return PERFORMANCE_CASES.map((benchmark) => ({
      id: benchmark.id,
      status: "not-run",
      summary: "没有可读取的 WebView2 benchmark 报告。",
      sourcePath,
      command: "node scripts/phase1a-webview2-benchmark.mjs",
    }));
  }

  const report = input as BenchmarkReport;
  const eligibilityReasons = reportEligibility(report);
  const fatal = asNonEmptyString(report.fatal);

  return PERFORMANCE_CASES.map((benchmark) => {
    const result = report.results?.[`${benchmark.sizeBytes}B`];
    const coldStart = evaluateSampleMetric(
      asMetric(result?.coldStart),
      benchmark.expected.coldStart,
    );
    const hotReload = evaluateSampleMetric(
      asMetric(result?.hotReload),
      benchmark.expected.hotReload,
    );
    const keyToPaint = evaluateSampleMetric(
      asMetric(result?.keyToPaint),
      benchmark.expected.keyToPaint,
      benchmark.targetKeyToPaintMs,
    );
    const sampleStatus = worstStatus([
      coldStart.status,
      hotReload.status,
      keyToPaint.status,
    ]);
    const status = fatal
      ? "failed"
      : sampleStatus === "pass" && eligibilityReasons.length > 0
        ? "incomplete"
        : sampleStatus;
    const diagnosticSummary =
      eligibilityReasons.length > 0
        ? `正式 T4 条件未满足：${eligibilityReasons.join("；")}。`
        : "";

    return {
      id: benchmark.id,
      status,
      summary: [
        diagnosticSummary,
        fatal ? `报告 fatal：${fatal}。` : "",
        `coldStart：${coldStart.summary}`,
        `hotReload：${hotReload.summary}`,
        `key-to-paint：${keyToPaint.summary}`,
      ]
        .filter(Boolean)
        .join(" "),
      sourcePath,
      command: "node scripts/phase1a-webview2-benchmark.mjs",
      details: {
        sizeBytes: benchmark.sizeBytes,
        targetKeyToPaintMs: benchmark.targetKeyToPaintMs,
        eligibilityReasons,
        sampleCounts: {
          coldStart: coldStart.count,
          hotReload: hotReload.count,
          keyToPaint: keyToPaint.count,
        },
        p95Ms: keyToPaint.p95Ms,
        inputToPaintP95Ms:
          asFiniteNumber(result?.keyToPaint?.inputToPaintP95),
      },
    };
  });
}

export function evaluateThresholdMetric(
  input: ThresholdMetricInput,
): T4EvidenceRecord {
  const value = asFiniteNumber(input.value);
  let status: T4EvidenceStatus = "pass";
  let summary = input.summary ?? `观测值 ${value} ${input.unit}，目标 ≤ ${input.target} ${input.unit}。`;

  if (
    input.expectedSamples !== undefined &&
    input.samples !== input.expectedSamples
  ) {
    status = "incomplete";
    summary = `样本不足：${input.samples ?? 0}/${input.expectedSamples}。`;
  } else if (value === null) {
    status = "incomplete";
    summary = `缺少 ${input.id} 的可计算指标。`;
  } else if (value > input.target) {
    status = "failed";
    summary = `观测值 ${value} ${input.unit} 超过目标 ${input.target} ${input.unit}。`;
  }

  return {
    id: input.id,
    status,
    summary,
    sourcePath: input.sourcePath,
    command: input.command ?? null,
    details: {
      value,
      target: input.target,
      unit: input.unit,
      samples: input.samples ?? null,
      expectedSamples: input.expectedSamples ?? null,
    },
  };
}

export function evaluateSaveCasEvidence(
  input: SaveCasEvidenceInput,
): T4EvidenceRecord {
  const record = evaluateThresholdMetric({
    id: "save-cas-fault-injection",
    value: input.p95Ms,
    target: SAVE_BLOCK_TARGET_MS,
    unit: "ms",
    sourcePath: input.sourcePath,
    command: input.command,
    samples: input.samples ?? undefined,
    expectedSamples: input.expectedSamples,
    summary:
      "保存/CAS 序列化主线程阻塞：" +
      String(input.p95Ms ?? "缺失") +
      " ms，目标 ≤ " +
      SAVE_BLOCK_TARGET_MS +
      " ms。",
  });

  const evidenceEntries = [
    ["saveFailure", input.failureEvidence?.saveFailure],
    ["casConflict", input.failureEvidence?.casConflict],
  ] as const;
  const failedEvidence = evidenceEntries
    .filter(([, evidence]) => evidence?.status === "failed")
    .map(([name]) => name);
  const incompleteEvidence = evidenceEntries
    .filter(
      ([, evidence]) =>
        !evidence ||
        evidence.status === "not-run" ||
        evidence.status === "incomplete" ||
        (evidence.status === "pass" && !evidence.sourcePath),
    )
    .map(([name]) => name);
  let status = record.status;
  let summary = record.summary;
  if (failedEvidence.length > 0) {
    status = "failed";
    summary = "保存/CAS 故障证据失败：" + failedEvidence.join("、") + "。";
  } else if (incompleteEvidence.length > 0 && status !== "failed") {
    status = "incomplete";
    summary = "保存/CAS 故障证据不完整：缺少 " + incompleteEvidence.join("、") + "。";
  }

  return {
    ...record,
    status,
    summary,
    details: {
      ...record.details,
      metric: "p95Ms",
      targetMs: SAVE_BLOCK_TARGET_MS,
      failureEvidence: input.failureEvidence ?? null,
    },
  };
}

export function evaluateProcessMemoryEvidence(
  input: ProcessMemoryEvidenceInput,
): T4EvidenceRecord {
  const baselineBytes = asFiniteNumber(input.baselineBytes);
  const afterBytes = asFiniteNumber(input.afterBytes);
  const tabCount = asFiniteNumber(input.tabCount);
  const popoutCount = asFiniteNumber(input.popoutCount);
  const rootPid = asFiniteNumber(input.rootPid);
  const baselineProcessCount = asFiniteNumber(input.baselineProcessCount);
  const afterProcessCount = asFiniteNumber(input.afterProcessCount);
  const deltaBytes =
    baselineBytes !== null && afterBytes !== null
      ? afterBytes - baselineBytes
      : null;
  const deltaRatio =
    deltaBytes !== null && baselineBytes !== null && baselineBytes > 0
      ? deltaBytes / baselineBytes
      : null;
  const failures: string[] = [];
  const incomplete: string[] = [];

  if (tabCount !== 10 || popoutCount !== 1) {
    incomplete.push("场景必须是 10 Tab + 1 Popout");
  }
  if (input.snapshotComplete !== true) {
    incomplete.push("进程树快照未声明为完整");
  }
  if (rootPid === null || rootPid <= 0 || !Number.isInteger(rootPid)) {
    incomplete.push("缺少有效的显式 root PID");
  }
  if (
    baselineProcessCount === null ||
    baselineProcessCount <= 0 ||
    !Number.isInteger(baselineProcessCount) ||
    afterProcessCount === null ||
    afterProcessCount <= 0 ||
    !Number.isInteger(afterProcessCount)
  ) {
    incomplete.push("缺少 baseline/after 进程树样本数量");
  }
  if (
    baselineBytes === null ||
    afterBytes === null ||
    baselineBytes <= 0 ||
    afterBytes < 0
  ) {
    incomplete.push("缺少有效 baseline/after 进程树内存");
  }
  if (deltaBytes !== null && deltaBytes > MEMORY_BYTES_TARGET) {
    failures.push("增量超过 " + MEMORY_BYTES_TARGET + " bytes");
  }
  if (deltaRatio !== null && deltaRatio > MEMORY_RATIO_TARGET) {
    failures.push("增量比例超过 " + MEMORY_RATIO_TARGET);
  }

  const status: T4EvidenceStatus =
    failures.length > 0
      ? "failed"
      : incomplete.length > 0
        ? "incomplete"
        : "pass";
  const summary =
    status === "pass"
      ? "10 Tab + 1 Popout 内存增量 " +
        deltaBytes +
        " bytes / " +
        deltaRatio +
        "，两个门槛均达标。"
      : status === "failed"
        ? "进程树内存门槛失败：" + failures.join("；") + "。"
        : "进程树内存证据不完整：" + incomplete.join("；") + "。";

  return {
    id: "process-memory",
    status,
    summary,
    sourcePath: input.sourcePath,
    command: input.command ?? null,
    details: {
      baselineBytes,
      afterBytes,
      deltaBytes,
      deltaRatio,
      tabCount,
      popoutCount,
      snapshotComplete: input.snapshotComplete === true,
      rootPid,
      baselineProcessCount,
      afterProcessCount,
      targetRatio: MEMORY_RATIO_TARGET,
      targetBytes: MEMORY_BYTES_TARGET,
      failures,
      incomplete,
    },
  };
}

export function evaluateReleasePackageEvidence(
  input: ReleasePackageEvidenceInput,
): T4EvidenceRecord {
  const currentBytes = asFiniteNumber(input.currentBytes);
  const baselineBytes = asFiniteNumber(input.baselineBytes);
  const growthRatio =
    currentBytes !== null && baselineBytes !== null && baselineBytes > 0
      ? (currentBytes - baselineBytes) / baselineBytes
      : null;
  const packageExeSha256 = asNonEmptyString(input.packageExeSha256);
  const currentReleaseExeSha256 = asNonEmptyString(input.currentReleaseExeSha256);
  const failures: string[] = [];
  const incomplete: string[] = [];

  if (currentBytes === null || baselineBytes === null || baselineBytes <= 0) {
    incomplete.push("缺少有效当前/基线 ZIP 大小");
  }
  if (!asNonEmptyString(input.sha256)) {
    incomplete.push("缺少当前 ZIP SHA-256");
  }
  if (!packageExeSha256) {
    incomplete.push("缺少 ZIP 内 MarkdownStickyNote.exe SHA-256");
  }
  if (!currentReleaseExeSha256) {
    incomplete.push("缺少当前 Release EXE SHA-256");
  }
  if (!asNonEmptyString(input.currentReleaseExePath)) {
    incomplete.push("缺少当前 Release EXE 路径");
  }
  if (!input.entries) {
    incomplete.push("缺少 ZIP 文件清单");
  } else {
    const actualEntries = [...input.entries].sort();
    const expectedEntries = [...EXPECTED_PACKAGE_ENTRIES].sort();
    if (
      actualEntries.length !== expectedEntries.length ||
      actualEntries.some((entry, index) => entry !== expectedEntries[index])
    ) {
      failures.push("ZIP 必须只包含 MarkdownStickyNote.exe 和 README.txt");
    }
  }
  if (
    packageExeSha256 &&
    currentReleaseExeSha256 &&
    packageExeSha256.toUpperCase() !== currentReleaseExeSha256.toUpperCase()
  ) {
    failures.push("包内 EXE 与当前 Release 不一致");
  }
  if (growthRatio !== null && growthRatio > PACKAGE_GROWTH_TARGET) {
    failures.push(
      "包体增幅 " + growthRatio + " 超过 " + PACKAGE_GROWTH_TARGET,
    );
  }

  const status: T4EvidenceStatus =
    failures.length > 0
      ? "failed"
      : incomplete.length > 0
        ? "incomplete"
        : "pass";
  const summary =
    status === "pass"
      ? "当前 ZIP 相对基线增幅 " +
        growthRatio +
        "，清单和 SHA-256 均完整。"
      : status === "failed"
        ? "Release ZIP 门槛失败：" + failures.join("；") + "。"
        : "Release ZIP 证据不完整：" + incomplete.join("；") + "。";

  return {
    id: "release-package",
    status,
    summary,
    sourcePath: input.currentPath,
    command: input.command ?? null,
    details: {
      currentPath: input.currentPath,
      baselinePath: input.baselinePath,
      currentBytes,
      baselineBytes,
      growthRatio,
      sha256: input.sha256 ?? null,
      packageExeSha256: input.packageExeSha256 ?? null,
      currentReleaseExeSha256: input.currentReleaseExeSha256 ?? null,
      currentReleaseExePath: input.currentReleaseExePath,
      entries: input.entries ?? null,
      targetGrowthRatio: PACKAGE_GROWTH_TARGET,
      failures,
      incomplete,
    },
  };
}

const defaultRecord = (
  definition: (typeof REQUIRED_RECORDS)[number],
): T4EvidenceRecord => ({
  id: definition.id,
  status: "not-run",
  summary: definition.summary,
  sourcePath: definition.sourcePath,
  command: definition.command,
});

export function createT4EvidenceManifest(input: {
  benchmarkReport?: unknown;
  benchmarkReportPath?: string;
  evidence?: readonly T4EvidenceRecord[];
  generatedAt?: string;
}): T4EvidenceManifest {
  const records = new Map<T4EvidenceId, T4EvidenceRecord>();

  for (const definition of REQUIRED_RECORDS) {
    records.set(definition.id, defaultRecord(definition));
  }

  const benchmarkRecords = input.benchmarkReport
    ? evaluateBenchmarkReport(
        input.benchmarkReport,
        input.benchmarkReportPath ?? "poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark.json",
      )
    : PERFORMANCE_CASES.map((benchmark) => ({
        id: benchmark.id,
        status: "not-run" as const,
        summary: "尚未提供 WebView2 benchmark 报告。",
        sourcePath:
          input.benchmarkReportPath ??
          "poc/visual-editor-phase1a/artifacts/phase1a-webview2-benchmark.json",
        command: "node scripts/phase1a-webview2-benchmark.mjs",
      }));

  for (const record of benchmarkRecords) {
    records.set(record.id, record);
  }

  for (const record of input.evidence ?? []) {
    validateEvidenceOverride(record);
    records.set(record.id, record);
  }

  const orderedRecords = T4_EVIDENCE_IDS.map((id) => records.get(id)).filter(
    (record): record is T4EvidenceRecord => record !== undefined,
  );
  const blockingIds = orderedRecords
    .filter((record) => record.status !== "pass")
    .map((record) => record.id);

  return {
    schemaVersion: "mknote.visual-editor.t4-evidence.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    gate: {
      name: "Gate B-P0",
      status: blockingIds.length === 0 ? "pass" : "blocked",
      blockingIds,
    },
    records: orderedRecords,
  };
}
