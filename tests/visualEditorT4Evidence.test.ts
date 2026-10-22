import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createT4EvidenceManifest,
  evaluateBenchmarkReport,
  evaluateProcessMemoryEvidence,
  evaluateReleasePackageEvidence,
  evaluateSaveCasEvidence,
  evaluateThresholdMetric,
  type T4EvidenceRecord,
} from "./fixtures/visual-editor/t4Evidence.ts";

const makeCompleteBenchmarkReport = () => ({
  generatedAt: "2026-08-23T00:00:00.000Z",
  protocol: {
    benchmarkSizes: [102400, 512000],
    benchmarkFixture: "table",
    benchmarkLayout: "normal",
    benchmarkEditorProfile: "normal",
    coldSamples: 30,
    hotSamples: 100,
    keySamples: 1000,
  },
  build: {
    buildHash: "build-hash",
    gitHead: "git-head",
    worktreeDirty: false,
  },
  environment: {
    os: { release: "10.0.26200" },
    webView2: { version: "151.0.4129.101" },
  },
  results: {
    "102400B": {
      coldStart: { count: 30, expected: 30, p95: 40, failures: [] },
      hotReload: { count: 100, expected: 100, p95: 40, failures: [] },
      keyToPaint: {
        count: 1000,
        expected: 1000,
        p95: 40,
        inputToPaintP95: 35,
        failures: [],
      },
    },
    "512000B": {
      coldStart: { count: 30, expected: 30, p95: 80, failures: [] },
      hotReload: { count: 100, expected: 100, p95: 80, failures: [] },
      keyToPaint: {
        count: 1000,
        expected: 1000,
        p95: 80,
        inputToPaintP95: 70,
        failures: [],
      },
    },
  },
});

const makeRequiredEvidence = (): T4EvidenceRecord[] => [
  {
    id: "compatibility-corpus",
    status: "pass",
    summary: "compatibility pass",
    sourcePath: "tests/visualEditorCorpus.test.ts",
    command: "node --test tests/visualEditorCorpus.test.ts",
  },
  {
    id: "source-aware-safety",
    status: "pass",
    summary: "source-aware pass",
    sourcePath: "tests/sourceAwareMarkdown.test.ts",
    command: "node --test tests/sourceAwareMarkdown.test.ts",
  },
  {
    id: "selection-history-paste",
    status: "pass",
    summary: "interaction pass",
    sourcePath: "tests/visualEditorInteractionContract.test.ts",
    command: "node --test tests/visualEditorInteractionContract.test.ts",
  },
  {
    id: "save-cas-fault-injection",
    status: "pass",
    summary: "save and CAS pass",
    sourcePath: "tests/visualEditorSaveContract.test.ts",
    command: "node --test tests/visualEditorSaveContract.test.ts",
  },
  {
    id: "process-memory",
    status: "pass",
    summary: "memory pass",
    sourcePath: "artifacts/t4-memory.json",
    command: "collector input: t4-memory.json",
  },
  {
    id: "release-package",
    status: "pass",
    summary: "package pass",
    sourcePath: "artifacts/t4-package.json",
    command: "collector input: t4-package.json",
  },
];

test("完整 benchmark 报告才允许生成性能通过证据", () => {
  const evidence = evaluateBenchmarkReport(
    makeCompleteBenchmarkReport(),
    "artifacts/phase1a-webview2-benchmark.json",
  );

  assert.equal(evidence.every((record) => record.status === "pass"), true);
  assert.equal(evidence[0]?.sourcePath, "artifacts/phase1a-webview2-benchmark.json");
});

test("缩小采样、失败输入和诊断 profile 不能被 collector 标绿", () => {
  const report = makeCompleteBenchmarkReport() as any;
  report.protocol.coldSamples = 0;
  report.protocol.hotSamples = 0;
  report.protocol.keySamples = 1;
  report.protocol.benchmarkEditorProfile = "incremental-table-align-runtime";
  report.results["512000B"].keyToPaint = {
    count: 0,
    expected: 1,
    p95: null,
    failures: [{ error: "input timeout" }],
  };

  const evidence = evaluateBenchmarkReport(report, "diagnostic.json");

  assert.equal(evidence.length, 2);
  assert.equal(evidence[0]?.status, "incomplete");
  assert.equal(evidence[1]?.status, "failed");
  assert.match(evidence[0]?.summary ?? "", /diagnostic|sample/i);
});

test("阈值指标在样本不足或超标时不能报告通过", () => {
  assert.equal(
    evaluateThresholdMetric({
      id: "save-cas-fault-injection",
      value: 10,
      target: 50,
      unit: "ms",
      samples: 1,
      expectedSamples: 30,
      sourcePath: "save.json",
    }).status,
    "incomplete",
  );
  assert.equal(
    evaluateThresholdMetric({
      id: "save-cas-fault-injection",
      value: 80,
      target: 50,
      unit: "ms",
      samples: 30,
      expectedSamples: 30,
      sourcePath: "save.json",
    }).status,
    "failed",
  );
});

test("manifest 明确列出保存、内存和包体缺口，并阻止 Gate B", () => {
  const manifest = createT4EvidenceManifest({
    generatedAt: "2026-08-23T00:00:00.000Z",
    benchmarkReport: makeCompleteBenchmarkReport(),
    benchmarkReportPath: "artifacts/benchmark.json",
    evidence: makeRequiredEvidence().filter(
      (record) => record.id !== "process-memory" && record.id !== "release-package",
    ),
  });

  assert.equal(manifest.schemaVersion, "mknote.visual-editor.t4-evidence.v1");
  assert.equal(manifest.gate.status, "blocked");
  assert.deepEqual(manifest.gate.blockingIds, ["process-memory", "release-package"]);
  assert.equal(
    manifest.records.find((record) => record.id === "save-cas-fault-injection")?.status,
    "pass",
  );
  assert.equal(
    manifest.records.find((record) => record.id === "process-memory")?.status,
    "not-run",
  );
  assert.doesNotMatch(JSON.stringify(manifest), /visual-editor-benchmark-0000/);
});

test("只有所有 T4 证据通过时 manifest 才允许 Gate B", () => {
  const manifest = createT4EvidenceManifest({
    generatedAt: "2026-08-23T00:00:00.000Z",
    benchmarkReport: makeCompleteBenchmarkReport(),
    benchmarkReportPath: "artifacts/benchmark.json",
    evidence: makeRequiredEvidence(),
  });

  assert.equal(manifest.gate.status, "pass");
  assert.deepEqual(manifest.gate.blockingIds, []);
});

test("collector 不允许无来源的人工 pass 覆盖性能或保存证据", () => {
  assert.throws(
    () =>
      createT4EvidenceManifest({
        benchmarkReport: makeCompleteBenchmarkReport(),
        evidence: [
          {
            id: "save-cas-fault-injection",
            status: "pass",
            summary: "",
            sourcePath: null,
            command: null,
          },
        ],
      }),
    /requires a summary/,
  );
  assert.throws(
    () =>
      createT4EvidenceManifest({
        benchmarkReport: makeCompleteBenchmarkReport(),
        evidence: [
          {
            id: "webview2-performance-100kb",
            status: "pass",
            summary: "manual override",
            sourcePath: "manual.json",
            command: "manual",
          },
        ],
      }),
    /must be derived from benchmarkReport/,
  );
});

test("T4 保存、内存和包体指标按计划的联合门槛评估", () => {
  const save = evaluateSaveCasEvidence({
    p95Ms: 40,
    samples: 30,
    expectedSamples: 30,
    sourcePath: "artifacts/save-cas.json",
    command: "save probe",
    failureEvidence: {
      saveFailure: { status: "pass", sourcePath: "save-failure.json" },
      casConflict: { status: "pass", sourcePath: "cas-conflict.json" },
    },
  });
  assert.equal(save.status, "pass");
  assert.equal(save.details?.targetMs, 50);

  const memory = evaluateProcessMemoryEvidence({
    baselineBytes: 200 * 1024 * 1024,
    afterBytes: 240 * 1024 * 1024,
    tabCount: 10,
    popoutCount: 1,
    snapshotComplete: true,
    rootPid: 1234,
    baselineProcessCount: 2,
    afterProcessCount: 12,
    sourcePath: "artifacts/memory.json",
    command: "memory probe",
  });
  assert.equal(memory.status, "pass");
  assert.equal(memory.details?.deltaBytes, 40 * 1024 * 1024);

  const packageEvidence = evaluateReleasePackageEvidence({
    currentBytes: 105,
    baselineBytes: 100,
    currentPath: "artifacts/current.zip",
    baselinePath: "artifacts/baseline.zip",
    sha256: "current-sha256",
    entries: ["MarkdownStickyNote.exe", "README.txt"],
    packageExeSha256: "current-release-exe-sha256",
    currentReleaseExeSha256: "current-release-exe-sha256",
    currentReleaseExePath: "src-tauri/target/release/md-sticky-note.exe",
    command: "package probe",
  });
  assert.equal(packageEvidence.status, "pass");
  assert.equal(packageEvidence.details?.growthRatio, 0.05);
});

test("T4 保存、内存和包体缺少样本或超出联合门槛时保持阻塞", () => {
  assert.equal(
    evaluateSaveCasEvidence({
      p95Ms: 40,
      samples: 1,
      expectedSamples: 30,
      sourcePath: "save.json",
      command: "save probe",
      failureEvidence: {
        saveFailure: { status: "pass", sourcePath: "save-failure.json" },
        casConflict: { status: "pass", sourcePath: "cas-conflict.json" },
      },
    }).status,
    "incomplete",
  );

  assert.equal(
    evaluateProcessMemoryEvidence({
      baselineBytes: 200 * 1024 * 1024,
      afterBytes: 260 * 1024 * 1024,
      tabCount: 10,
      popoutCount: 1,
      snapshotComplete: true,
      rootPid: 1234,
      baselineProcessCount: 2,
      afterProcessCount: 12,
      sourcePath: "memory.json",
      command: "memory probe",
    }).status,
    "failed",
  );

  assert.equal(
    evaluateReleasePackageEvidence({
      currentBytes: 111,
      baselineBytes: 100,
      currentPath: "current.zip",
      baselinePath: "baseline.zip",
      sha256: null,
      entries: ["MarkdownStickyNote.exe", "README.txt", "config.json"],
      packageExeSha256: "current-release-exe-sha256",
      currentReleaseExeSha256: "current-release-exe-sha256",
      currentReleaseExePath: "src-tauri/target/release/md-sticky-note.exe",
      command: "package probe",
    }).status,
    "failed",
  );
});

test("旧 ZIP 与当前 Release EXE 不一致时包体证据失败", () => {
  const packageEvidence = evaluateReleasePackageEvidence({
    currentBytes: 105,
    baselineBytes: 100,
    currentPath: "artifacts/current.zip",
    baselinePath: "artifacts/baseline.zip",
    sha256: "current-zip-sha256",
    entries: ["MarkdownStickyNote.exe", "README.txt"],
    packageExeSha256: "old-release-exe-sha256",
    currentReleaseExeSha256: "current-release-exe-sha256",
    currentReleaseExePath: "src-tauri/target/release/md-sticky-note.exe",
    command: "package probe",
  });

  assert.equal(packageEvidence.status, "failed");
  assert.match(packageEvidence.summary, /包内 EXE 与当前 Release 不一致/);
  assert.equal(packageEvidence.details?.packageExeSha256, "old-release-exe-sha256");
  assert.equal(
    packageEvidence.details?.currentReleaseExeSha256,
    "current-release-exe-sha256",
  );
});

test("进程树快照不完整或未声明完整时不能标记内存通过", () => {
  const incompleteSnapshot = evaluateProcessMemoryEvidence({
    baselineBytes: 200 * 1024 * 1024,
    afterBytes: 220 * 1024 * 1024,
    tabCount: 10,
    popoutCount: 1,
    snapshotComplete: false,
    rootPid: 1234,
    baselineProcessCount: 1,
    afterProcessCount: 2,
    sourcePath: "memory-incomplete.json",
    command: "memory probe",
  });
  assert.equal(incompleteSnapshot.status, "incomplete");
  assert.match(incompleteSnapshot.summary, /快照|完整/);

  const missingDeclaration = evaluateProcessMemoryEvidence({
    baselineBytes: 200 * 1024 * 1024,
    afterBytes: 220 * 1024 * 1024,
    tabCount: 10,
    popoutCount: 1,
    sourcePath: "memory-missing-completeness.json",
    command: "memory probe",
  });
  assert.equal(missingDeclaration.status, "incomplete");
});

test("CLI 可以把 machine-readable 三类指标输入并入 manifest", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-t4-evidence-"));
  const metricsPath = join(tempRoot, "metrics.json");
  const outputPath = join(tempRoot, "manifest.json");
  const scriptPath = fileURLToPath(
    new URL("../scripts/collect-visual-editor-t4-evidence.mjs", import.meta.url),
  );

  try {
    writeFileSync(
      metricsPath,
      "\uFEFF" +
        JSON.stringify({
        metrics: {
          saveCas: {
            p95Ms: 40,
            samples: 30,
            expectedSamples: 30,
            sourcePath: metricsPath,
            command: "save probe",
            failureEvidence: {
              saveFailure: { status: "pass", sourcePath: "save-failure.json" },
              casConflict: { status: "pass", sourcePath: "cas-conflict.json" },
            },
          },
          processMemory: {
            baselineBytes: 200 * 1024 * 1024,
            afterBytes: 240 * 1024 * 1024,
            tabCount: 10,
            popoutCount: 1,
            snapshotComplete: true,
            rootPid: 1234,
            baselineProcessCount: 2,
            afterProcessCount: 12,
            sourcePath: metricsPath,
            command: "memory probe",
          },
          releasePackage: {
            currentBytes: 105,
            baselineBytes: 100,
            currentPath: "current.zip",
            baselinePath: "baseline.zip",
            sha256: "current-sha256",
            entries: ["MarkdownStickyNote.exe", "README.txt"],
            packageExeSha256: "current-release-exe-sha256",
            currentReleaseExeSha256: "current-release-exe-sha256",
            currentReleaseExePath: "src-tauri/target/release/md-sticky-note.exe",
            command: "package probe",
          },
        },
        }),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [scriptPath, "--evidence", metricsPath, "--output", outputPath],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(readFileSync(outputPath, "utf8")) as {
      records: Array<{ id: string; status: string }>;
    };
    assert.equal(
      manifest.records.find((record) => record.id === "save-cas-fault-injection")?.status,
      "pass",
    );
    assert.equal(
      manifest.records.find((record) => record.id === "process-memory")?.status,
      "pass",
    );
    assert.equal(
      manifest.records.find((record) => record.id === "release-package")?.status,
      "pass",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("CLI 可以合并多个独立 evidence 文件并入同一份 manifest", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-t4-evidence-multi-"));
  const saveCasPath = join(tempRoot, "save-cas.json");
  const processMemoryPath = join(tempRoot, "process-memory.json");
  const outputPath = join(tempRoot, "manifest.json");
  const scriptPath = fileURLToPath(
    new URL("../scripts/collect-visual-editor-t4-evidence.mjs", import.meta.url),
  );

  try {
    writeFileSync(
      saveCasPath,
      JSON.stringify({
        metrics: {
          saveCas: {
            p95Ms: 40,
            samples: 30,
            expectedSamples: 30,
            sourcePath: saveCasPath,
            command: "save probe",
            failureEvidence: {
              saveFailure: { status: "pass", sourcePath: "save-failure.json" },
              casConflict: { status: "pass", sourcePath: "cas-conflict.json" },
            },
          },
        },
      }),
      "utf8",
    );
    writeFileSync(
      processMemoryPath,
      JSON.stringify({
        metrics: {
          processMemory: {
            baselineBytes: 200 * 1024 * 1024,
            afterBytes: 220 * 1024 * 1024,
            tabCount: 10,
            popoutCount: 1,
            snapshotComplete: true,
            rootPid: 1234,
            baselineProcessCount: 2,
            afterProcessCount: 3,
            sourcePath: processMemoryPath,
            command: "memory probe",
          },
        },
      }),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--evidence",
        saveCasPath,
        "--evidence",
        processMemoryPath,
        "--output",
        outputPath,
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(readFileSync(outputPath, "utf8")) as {
      records: Array<{ id: string; status: string }>;
    };
    assert.equal(
      manifest.records.find((record) => record.id === "save-cas-fault-injection")
        ?.status,
      "pass",
    );
    assert.equal(
      manifest.records.find((record) => record.id === "process-memory")?.status,
      "pass",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("T4 collector 只汇总 artifact，不启动 harness 或触碰 Owner 端口", () => {
  const collector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-evidence.mjs", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };

  assert.equal(
    packageJson.scripts?.["collect:visual-editor-t4"],
    "node scripts/collect-visual-editor-t4-evidence.mjs",
  );
  assert.match(collector, /createT4EvidenceManifest/);
  assert.match(collector, /--require-pass/);
  assert.match(collector, /not-run|incomplete/);
  assert.doesNotMatch(collector, /4173/);
  assert.doesNotMatch(collector, /EditorPane|VisualEditorAdapter/);
  assert.doesNotMatch(collector, /spawn\(|connectOverCDP/);
});

test("进程内存采集脚本只读显式 PID 的 Win32_Process 树并输出完整性字段", () => {
  const processMemoryCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-process-memory.ps1", import.meta.url),
    "utf8",
  );

  assert.match(processMemoryCollector, /Win32_Process/);
  assert.match(processMemoryCollector, /ParentProcessId/);
  assert.match(processMemoryCollector, /WorkingSetSize/);
  assert.match(processMemoryCollector, /RootPid/);
  assert.match(processMemoryCollector, /snapshotComplete/);
  assert.match(processMemoryCollector, /baselineSnapshot|BaselineSnapshot/);
  assert.match(processMemoryCollector, /afterSnapshot|AfterSnapshot/);
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.equal(
    packageJson.scripts?.["collect:visual-editor-t4-process-memory"],
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/collect-visual-editor-t4-process-memory.ps1",
  );
  assert.doesNotMatch(processMemoryCollector, /Start-Process|Stop-Process|taskkill/);
  assert.doesNotMatch(processMemoryCollector, /4173/);
});

test("Popout 生命周期诊断必须显式启用并保留 closed 快照", () => {
  const processMemoryUiCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-process-memory-ui.mjs", import.meta.url),
    "utf8",
  );
  const processMemoryCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-process-memory.ps1", import.meta.url),
    "utf8",
  );

  assert.match(processMemoryUiCollector, /process\.argv\.includes\("--lifecycle"\)/);
  assert.match(processMemoryUiCollector, /popout-close-btn/);
  assert.match(processMemoryUiCollector, /closedSnapshot/);
  assert.match(processMemoryUiCollector, /phase1a-t4-process-memory-closed-/);
  assert.match(processMemoryUiCollector, /tabCountAfterClose/);
  assert.match(processMemoryUiCollector, /lifecycle/);
  const closedArgumentIndex = processMemoryUiCollector.indexOf(
    'args.push("-ClosedSnapshotPath"',
  );
  const outputArgumentIndex = processMemoryUiCollector.indexOf(
    'args.push("-OutputPath"',
  );
  assert.ok(closedArgumentIndex >= 0 && closedArgumentIndex < outputArgumentIndex);
  assert.match(processMemoryCollector, /ValidateSet\("baseline", "after", "closed", "tabs"\)/);
});

test("进程内存诊断可显式继承隔离浏览器参数并保留 CDP 端口", () => {
  const processMemoryUiCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-process-memory-ui.mjs", import.meta.url),
    "utf8",
  );

  assert.match(processMemoryUiCollector, /MKN_T4_PROCESS_MEMORY_BROWSER_ARGS/);
  const inheritedArgsIndex = processMemoryUiCollector.indexOf(
    "MKN_T4_PROCESS_MEMORY_BROWSER_ARGS",
  );
  const remoteDebuggingIndex = processMemoryUiCollector.indexOf(
    "--remote-debugging-port=",
  );
  const childEnvironmentIndex = processMemoryUiCollector.indexOf(
    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
  );
  assert.ok(
    inheritedArgsIndex >= 0 &&
      inheritedArgsIndex < remoteDebuggingIndex &&
      remoteDebuggingIndex < childEnvironmentIndex,
  );
  assert.match(processMemoryUiCollector, /browserArguments/);
});

test("进程内存采集脚本把完整 baseline/after 快照合并为 collector 指标", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-t4-process-memory-"));
  const baselinePath = join(tempRoot, "baseline.json");
  const afterPath = join(tempRoot, "after.json");
  const outputPath = join(tempRoot, "metrics.json");
  const scriptPath = fileURLToPath(
    new URL("../scripts/collect-visual-editor-t4-process-memory.ps1", import.meta.url),
  );
  const makeSnapshot = (totalWorkingSetBytes: number) => ({
    schemaVersion: "mknote.visual-editor.t4-process-memory-snapshot.v1",
    snapshotComplete: true,
    rootPid: 4321,
    processCount: 2,
    totalWorkingSetBytes,
    totalPrivateBytes: totalWorkingSetBytes - 10,
    processes: [
      {
        processId: 4321,
        parentProcessId: 1,
        name: "owner",
        workingSetBytes: totalWorkingSetBytes - 40,
        privateBytes: totalWorkingSetBytes - 50,
      },
      {
        processId: 4322,
        parentProcessId: 4321,
        name: "webview2",
        workingSetBytes: 40,
        privateBytes: 40,
      },
    ],
  });

  try {
    writeFileSync(baselinePath, JSON.stringify(makeSnapshot(100)), "utf8");
    writeFileSync(afterPath, JSON.stringify(makeSnapshot(120)), "utf8");

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-BaselineSnapshotPath",
        baselinePath,
        "-AfterSnapshotPath",
        afterPath,
        "-TabCount",
        "10",
        "-PopoutCount",
        "1",
        "-OutputPath",
        outputPath,
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(outputPath), true, `${result.stdout}\n${result.stderr}`);

    const rawMetrics = readFileSync(outputPath, "utf8").replace(/^\uFEFF/, "");
    const metrics = JSON.parse(rawMetrics) as {
      metrics: {
        processMemory: {
          snapshotComplete: boolean;
          baselineBytes: number;
          afterBytes: number;
          tabCount: number;
          popoutCount: number;
          rootPid: number;
        };
      };
    };
    assert.equal(metrics.metrics.processMemory.snapshotComplete, true);
    assert.equal(metrics.metrics.processMemory.baselineBytes, 100);
    assert.equal(metrics.metrics.processMemory.afterBytes, 120);
    assert.equal(metrics.metrics.processMemory.tabCount, 10);
    assert.equal(metrics.metrics.processMemory.popoutCount, 1);
    assert.equal(metrics.metrics.processMemory.rootPid, 4321);

    const manifestPath = join(tempRoot, "manifest.json");
    const collectorPath = fileURLToPath(
      new URL("../scripts/collect-visual-editor-t4-evidence.mjs", import.meta.url),
    );
    const collectorResult = spawnSync(
      process.execPath,
      [collectorPath, "--evidence", outputPath, "--output", manifestPath],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
    assert.equal(collectorResult.status, 0, collectorResult.stderr);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      records: Array<{ id: string; status: string }>;
    };
    assert.equal(
      manifest.records.find((record) => record.id === "process-memory")?.status,
      "pass",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("生命周期 compare 输出 after/closed 内存与 WebView2 释放差分", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-t4-process-memory-lifecycle-"));
  const baselinePath = join(tempRoot, "baseline.json");
  const afterPath = join(tempRoot, "after.json");
  const closedPath = join(tempRoot, "closed.json");
  const outputPath = join(tempRoot, "metrics.json");
  const scriptPath = fileURLToPath(
    new URL("../scripts/collect-visual-editor-t4-process-memory.ps1", import.meta.url),
  );
  const makeSnapshot = (
    phase: string,
    processes: Array<{
      processId: number;
      parentProcessId: number;
      name: string;
      workingSetBytes: number;
      privateBytes: number;
    }>,
  ) => ({
    schemaVersion: "mknote.visual-editor.t4-process-memory-snapshot.v1",
    phase,
    snapshotComplete: true,
    rootPid: 4321,
    processCount: processes.length,
    totalWorkingSetBytes: processes.reduce(
      (total, process) => total + process.workingSetBytes,
      0,
    ),
    totalPrivateBytes: processes.reduce(
      (total, process) => total + process.privateBytes,
      0,
    ),
    processes,
  });
  const root = {
    processId: 4321,
    parentProcessId: 1,
    name: "md-sticky-note.exe",
    workingSetBytes: 80,
    privateBytes: 70,
  };
  const retainedWebView = {
    processId: 4322,
    parentProcessId: 4321,
    name: "msedgewebview2.exe",
    workingSetBytes: 40,
    privateBytes: 30,
  };
  const releasedWebView = {
    processId: 4323,
    parentProcessId: 4321,
    name: "msedgewebview2.exe",
    workingSetBytes: 60,
    privateBytes: 50,
  };

  try {
    writeFileSync(
      baselinePath,
      JSON.stringify(makeSnapshot("baseline", [root, retainedWebView])),
      "utf8",
    );
    writeFileSync(
      afterPath,
      JSON.stringify(makeSnapshot("after", [root, retainedWebView, releasedWebView])),
      "utf8",
    );
    writeFileSync(
      closedPath,
      JSON.stringify(makeSnapshot("closed", [root, retainedWebView])),
      "utf8",
    );

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-BaselineSnapshotPath",
        baselinePath,
        "-AfterSnapshotPath",
        afterPath,
        "-ClosedSnapshotPath",
        closedPath,
        "-TabCount",
        "10",
        "-PopoutCount",
        "1",
        "-OutputPath",
        outputPath,
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const metrics = JSON.parse(readFileSync(outputPath, "utf8").replace(/^\uFEFF/, "")) as {
      metrics: {
        processMemory: {
          lifecycle: {
            enabled: boolean;
            snapshotComplete: boolean;
            afterBytes: number;
            closedBytes: number;
            releasedWorkingSetBytes: number;
            releasedWebView2ProcessCount: number;
            releasedWebView2ProcessIds: number[];
          };
        };
      };
    };
    assert.equal(metrics.metrics.processMemory.lifecycle.enabled, true);
    assert.equal(metrics.metrics.processMemory.lifecycle.snapshotComplete, true);
    assert.equal(metrics.metrics.processMemory.lifecycle.afterBytes, 180);
    assert.equal(metrics.metrics.processMemory.lifecycle.closedBytes, 120);
    assert.equal(metrics.metrics.processMemory.lifecycle.releasedWorkingSetBytes, 60);
    assert.equal(metrics.metrics.processMemory.lifecycle.releasedWebView2ProcessCount, 1);
    assert.deepEqual(
      metrics.metrics.processMemory.lifecycle.releasedWebView2ProcessIds,
      [4323],
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("ZIP 指标采集器只读取显式当前/基线包，不自行构建或删除产物", () => {
  const packageCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-package-metrics.ps1", import.meta.url),
    "utf8",
  );

  assert.match(packageCollector, /CurrentZip/);
  assert.match(packageCollector, /BaselineZip/);
  assert.match(packageCollector, /Get-FileHash/);
  assert.match(packageCollector, /ZipFile\]\:\:OpenRead/);
  assert.match(packageCollector, /CurrentReleaseExe/);
  assert.match(packageCollector, /packageExeSha256/);
  assert.match(packageCollector, /currentReleaseExeSha256/);
  assert.match(packageCollector, /releasePackage/);
  assert.doesNotMatch(packageCollector, /build-green|Compress-Archive|Remove-Item/);
});

test("ZIP 指标采集器记录包内 EXE 与当前 Release 的 hash", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-t4-package-"));
  const currentSource = join(tempRoot, "current");
  const baselineSource = join(tempRoot, "baseline");
  const currentZip = join(tempRoot, "current.zip");
  const baselineZip = join(tempRoot, "baseline.zip");
  const currentReleaseExe = join(tempRoot, "current-release.exe");
  const outputPath = join(tempRoot, "metrics.json");
  const zipScript = join(tempRoot, "create-zip.ps1");
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const collectorPath = join(
    repositoryRoot,
    "scripts",
    "collect-visual-editor-t4-package-metrics.ps1",
  );
  const powershellExecutable = "pwsh.exe";

  const createZip = (sourceDirectory: string, destination: string) => {
    const result = spawnSync(
      powershellExecutable,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        zipScript,
        sourceDirectory,
        destination,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(destination), result.stderr || result.stdout);
  };

  try {
    writeFileSync(
      zipScript,
      [
        "param([string]$SourceDirectory, [string]$Destination)",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem",
        "[System.IO.Compression.ZipFile]::CreateFromDirectory($SourceDirectory, $Destination)",
        "",
      ].join("\r\n"),
      "utf8",
    );
    mkdirSync(currentSource, { recursive: true });
    mkdirSync(baselineSource, { recursive: true });
    writeFileSync(
      join(currentSource, "MarkdownStickyNote.exe"),
      Buffer.alloc(1024, 0x6f),
    );
    writeFileSync(
      join(baselineSource, "MarkdownStickyNote.exe"),
      Buffer.alloc(1024, 0x62),
    );
    writeFileSync(join(currentSource, "README.txt"), "README\n", "utf8");
    writeFileSync(join(baselineSource, "README.txt"), "README\n", "utf8");
    writeFileSync(currentReleaseExe, Buffer.alloc(1024, 0x6e));
    createZip(currentSource, currentZip);
    createZip(baselineSource, baselineZip);

    const result = spawnSync(
      powershellExecutable,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        collectorPath,
        "-CurrentZip",
        currentZip,
        "-BaselineZip",
        baselineZip,
        "-CurrentReleaseExe",
        currentReleaseExe,
        "-OutputPath",
        outputPath,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);

    const metrics = JSON.parse(readFileSync(outputPath, "utf8")) as {
      metrics: { releasePackage: Parameters<typeof evaluateReleasePackageEvidence>[0] };
    };
    const releasePackage = metrics.metrics.releasePackage;
    assert.notEqual(releasePackage.packageExeSha256, releasePackage.currentReleaseExeSha256);
    assert.equal(
      evaluateReleasePackageEvidence(releasePackage).status,
      "failed",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Tab/Popout 内存诊断可显式采集中间 Tab 快照", () => {
  const processMemoryUiCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-process-memory-ui.mjs", import.meta.url),
    "utf8",
  );
  const processMemoryCollector = readFileSync(
    new URL("../scripts/collect-visual-editor-t4-process-memory.ps1", import.meta.url),
    "utf8",
  );

  assert.match(processMemoryUiCollector, /process\.argv\.includes\("--tabs-diagnostic"\)/);
  assert.match(processMemoryUiCollector, /tabsSnapshot/);
  assert.match(processMemoryUiCollector, /tabsMetricsPath/);
  assert.match(processMemoryUiCollector, /tabCountBeforePopout/);
  assert.match(processMemoryUiCollector, /-PopoutCount[\s\S]*"0"/);
  assert.match(processMemoryCollector, /ValidateSet\("baseline", "after", "closed", "tabs"\)/);
});

test("Phase 2 生产探针记录 console error 的来源位置", () => {
  const productionProbe = readFileSync(
    new URL("../scripts/visual-editor-phase2-production-e2e.mjs", import.meta.url),
    "utf8",
  );

  assert.match(productionProbe, /message\.location\(\)/);
});
