import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const collectorPath = fileURLToPath(
  new URL("../scripts/collect-visual-editor-t4-evidence.mjs", import.meta.url),
);

function collectSaveCasRecord(saveCas: Record<string, unknown>) {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-save-cas-integration-"));
  const evidencePath = join(tempRoot, "metrics.json");
  const outputPath = join(tempRoot, "manifest.json");
  const missingReportPath = join(tempRoot, "missing-benchmark.json");
  writeFileSync(
    evidencePath,
    "\uFEFF" + JSON.stringify({ metrics: { saveCas } }),
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        collectorPath,
        "--report",
        missingReportPath,
        "--evidence",
        evidencePath,
        "--output",
        outputPath,
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
    const manifest = JSON.parse(
      readFileSync(outputPath, "utf8").replace(/^\uFEFF/, ""),
    );
    return manifest.records.find(
      (record: { id: string }) => record.id === "save-cas-fault-injection",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const baseSaveCas = {
  p95Ms: 40,
  samples: 30,
  expectedSamples: 30,
  sourcePath: "artifacts/save-cas-metrics.json",
  command: "scripts/collect-visual-editor-t4-save-cas.ps1",
};

test("T4 collector 不得忽略显式 CAS 失败证据", () => {
  const record = collectSaveCasRecord({
    ...baseSaveCas,
    failureEvidence: {
      saveFailure: { status: "pass", sourcePath: "save-failure.json" },
      casConflict: { status: "failed", sourcePath: "cas-conflict.json" },
    },
  });
  assert.equal(record.status, "failed");
});

test("T4 collector 在保存失败或 CAS 证据缺失时保持 incomplete", () => {
  const record = collectSaveCasRecord(baseSaveCas);
  assert.equal(record.status, "incomplete");
});
