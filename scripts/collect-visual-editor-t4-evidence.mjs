/**
 * 汇总已经完成的 T4 证据，不启动编辑器、不重跑 benchmark，也不接生产保存链。
 *
 * 运行结果只描述可追溯的 machine-readable evidence；缺失指标会保留为
 * not-run/incomplete，避免把测试源文件或旧 artifact 误当作当前通过证据。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createT4EvidenceManifest,
  evaluateProcessMemoryEvidence,
  evaluateReleasePackageEvidence,
  evaluateSaveCasEvidence,
} from "../tests/fixtures/visual-editor/t4Evidence.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const defaultReportPath = path.join(
  repositoryRoot,
  "poc",
  "visual-editor-phase1a",
  "artifacts",
  "phase1a-webview2-benchmark.json",
);
const defaultOutputPath = path.join(
  repositoryRoot,
  "poc",
  "visual-editor-phase1a",
  "artifacts",
  "phase1a-t4-evidence-manifest.json",
);

function parseArgs(argv) {
  const options = {
    reportPath: defaultReportPath,
    evidencePaths: [],
    outputPath: defaultOutputPath,
    requirePass: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-pass") {
      options.requirePass = true;
      continue;
    }

    const [name, inlineValue] = argument.split("=", 2);
    if (!["--report", "--evidence", "--output"].includes(name)) {
      throw new Error(`unknown argument: ${argument}`);
    }

    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`missing value for ${name}`);
    if (name === "--report") options.reportPath = value;
    if (name === "--evidence") options.evidencePaths.push(value);
    if (name === "--output") options.outputPath = value;
  }

  return options;
}

function resolvePath(value) {
  return path.resolve(repositoryRoot, value);
}

function manifestPath(value) {
  const absolutePath = resolvePath(value);
  const relativePath = path.relative(repositoryRoot, absolutePath);
  return relativePath.split(path.sep).join("/");
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEvidence(filePath) {
  if (!filePath) return [];
  const input = readJsonIfPresent(resolvePath(filePath));
  if (input === null) {
    throw new Error(`evidence input not found: ${filePath}`);
  }
  if (Array.isArray(input)) return input;

  const records = Array.isArray(input.records) ? input.records : [];
  const metrics = isRecord(input.metrics) ? input.metrics : input;
  if (
    records.length === 0 &&
    !metrics.saveCas &&
    !metrics.processMemory &&
    !metrics.releasePackage
  ) {
    throw new Error(
      "evidence input must be an array, records[], or metrics.saveCas/processMemory/releasePackage",
    );
  }

  const generated = [];
  if (isRecord(metrics.saveCas)) {
    generated.push(
      evaluateSaveCasEvidence({
        ...metrics.saveCas,
        sourcePath: metrics.saveCas.sourcePath ?? filePath,
        command: metrics.saveCas.command ?? "collector input: save-cas",
      }),
    );
  }
  if (isRecord(metrics.processMemory)) {
    generated.push(
      evaluateProcessMemoryEvidence({
        ...metrics.processMemory,
        sourcePath: metrics.processMemory.sourcePath ?? filePath,
        command:
          metrics.processMemory.command ?? "collector input: process-memory",
      }),
    );
  }
  if (isRecord(metrics.releasePackage)) {
    generated.push(
      evaluateReleasePackageEvidence({
        ...metrics.releasePackage,
        currentPath: metrics.releasePackage.currentPath ?? filePath,
        baselinePath: metrics.releasePackage.baselinePath ?? filePath,
        command:
          metrics.releasePackage.command ?? "collector input: release-package",
      }),
    );
  }
  return [...records, ...generated];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportPath = resolvePath(options.reportPath);
  const report = readJsonIfPresent(reportPath);
  const manifest = createT4EvidenceManifest({
    benchmarkReport: report ?? undefined,
    benchmarkReportPath: manifestPath(options.reportPath),
    evidence: options.evidencePaths.flatMap((evidencePath) =>
      readEvidence(evidencePath),
    ),
  });
  const outputPath = resolvePath(options.outputPath);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        output: manifestPath(options.outputPath),
        gate: manifest.gate,
        records: manifest.records.map(({ id, status }) => ({ id, status })),
        reportPresent: report !== null,
      },
      null,
      2,
    ),
  );

  if (options.requirePass && manifest.gate.status !== "pass") {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack ?? error?.message ?? error));
  process.exitCode = 1;
}
