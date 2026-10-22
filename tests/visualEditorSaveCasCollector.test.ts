import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("../scripts/collect-visual-editor-t4-save-cas.ps1", import.meta.url),
);

const makeSamples = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sample: index + 1,
    blockingMs: index,
  }));

const makeReport = (sampleCount = 30) => ({
  schemaVersion: "mknote.visual-editor.t4-save-cas-samples.v1",
  generatedAt: "2026-08-23T00:00:00.000Z",
  expectedSamples: 30,
  samples: makeSamples(sampleCount),
  failureEvidence: {
    saveFailure: {
      status: "pass",
      sourcePath: "release-smoke-save-failure.json",
    },
    casConflict: {
      status: "pass",
      sourcePath: "release-smoke-cas-conflict.json",
    },
  },
});

function runCollector(report: unknown) {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-save-cas-"));
  const inputPath = join(tempRoot, "samples.json");
  const outputPath = join(tempRoot, "metrics.json");
  writeFileSync(inputPath, `\uFEFF${JSON.stringify(report)}`, "utf8");
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-InputReportPath",
      inputPath,
      "-OutputPath",
      outputPath,
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    },
  );

  try {
    if (!existsSync(outputPath)) {
      throw new Error(`${result.stdout}\n${result.stderr}`);
    }
    const metrics = JSON.parse(readFileSync(outputPath, "utf8").replace(/^\uFEFF/, ""));
    return { result, metrics };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

test("保存/CAS collector 读取 30 个 blockingMs 样本并计算 p95", () => {
  const { result, metrics } = runCollector(makeReport());
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(metrics.metrics.saveCas.status, "pass");
  assert.equal(metrics.metrics.saveCas.samples, 30);
  assert.equal(metrics.metrics.saveCas.expectedSamples, 30);
  assert.equal(metrics.metrics.saveCas.p95Ms, 28);
  assert.equal(metrics.metrics.saveCas.failureEvidence.saveFailure.status, "pass");
  assert.equal(metrics.metrics.saveCas.failureEvidence.casConflict.status, "pass");
});

test("保存/CAS collector 在样本不足或证据缺失时保持 incomplete", () => {
  const report = makeReport(29);
  report.failureEvidence.casConflict = undefined;
  const { result, metrics } = runCollector(report);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(metrics.metrics.saveCas.status, "incomplete");
  assert.equal(metrics.metrics.saveCas.samples, 29);
  assert.equal(metrics.metrics.saveCas.p95Ms, null);
  assert.equal(metrics.metrics.saveCas.failureEvidence.casConflict.status, "not-run");
});

test("保存/CAS collector 在显式故障或冲突失败时保持 failed", () => {
  const report = makeReport();
  report.failureEvidence.casConflict = {
    status: "failed",
    sourcePath: "release-smoke-cas-conflict.json",
  };
  const { result, metrics } = runCollector(report);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(metrics.metrics.saveCas.status, "failed");
  assert.equal(metrics.metrics.saveCas.p95Ms, 28);
});

test("package 提供只读保存/CAS machine-readable collector 入口", () => {
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );
  assert.equal(
    packageJson.scripts?.["collect:visual-editor-t4-save-cas"],
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/collect-visual-editor-t4-save-cas.ps1",
  );
});
