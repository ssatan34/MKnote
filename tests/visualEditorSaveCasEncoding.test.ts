import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const collectorPath = fileURLToPath(
  new URL("../scripts/collect-visual-editor-t4-save-cas.ps1", import.meta.url),
);

test("保存/CAS collector 使用 UTF-8 读取 Node 生成的无 BOM 报告", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mknote-save-cas-encoding-"));
  const inputPath = join(tempRoot, "samples.json");
  const outputPath = join(tempRoot, "metrics.json");
  const report = {
    schemaVersion: "mknote.visual-editor.t4-save-cas-samples.v1",
    generatedAt: "2026-08-24T00:00:00.000Z",
    expectedSamples: 30,
    samples: Array.from({ length: 30 }, (_, index) => ({
      index: index + 1,
      label: "invoke:write_note_checked",
      blockingMs: index,
      status: "ok",
    })),
    failureEvidence: {
      saveFailure: { status: "pass", sourcePath: "save-failure.json", reason: "保存失败证据" },
      casConflict: { status: "pass", sourcePath: "cas-conflict.json", reason: "CAS 冲突证据" },
    },
    collector: {
      releaseExecutable: "C:\\Projects\\MKnote\\src-tauri\\target\\release\\md-sticky-note.exe",
    },
  };

  writeFileSync(inputPath, JSON.stringify(report), "utf8");
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", collectorPath, "-InputReportPath", inputPath, "-OutputPath", outputPath],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(outputPath), true);
    const metrics = JSON.parse(readFileSync(outputPath, "utf8").replace(/^\uFEFF/, ""));
    assert.equal(metrics.metrics.saveCas.status, "pass");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
