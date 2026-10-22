import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const probeSource = readFileSync("scripts/visual-editor-table-matrix-e2e.mjs", "utf8");

test("表格矩阵 Release 探针必须使用唯一 fixture registry 并逐例运行", () => {
  assert.match(probeSource, /tableMatrix\.ts/);
  assert.match(probeSource, /VISUAL_EDITOR_TABLE_MATRIX/);
  assert.match(probeSource, /for\s*\(const\s+fixture\s+of\s+VISUAL_EDITOR_TABLE_MATRIX\)/);
  assert.match(probeSource, /fixture\.expectedRows/);
  assert.match(probeSource, /fixture\.expectedColumns/);
  assert.match(probeSource, /fixture\.expectedAlignments/);
});

test("表格矩阵 Release 探针必须隔离数据根、启用显式 visual editor 并验证重开", () => {
  assert.match(probeSource, /VITE_MKNOTE_EDITOR_MODE/);
  assert.match(probeSource, /visual-prosemirror/);
  assert.match(probeSource, /APPDATA/);
  assert.match(probeSource, /LOCALAPPDATA/);
  assert.match(probeSource, /phase2-production-table-matrix/);
  assert.match(probeSource, /reopen|重开/);
  assert.match(probeSource, /9341/);
  assert.match(probeSource, /headerRowCells/);
  assert.match(probeSource, /waitForCdpClosed/);
  assert.match(probeSource, /button\[aria-label="预览"\]/);
  assert.match(probeSource, /launchFailure|stopProcess\(processHandle\)/);
  assert.match(probeSource, /domAlignments/);
  assert.match(probeSource, /expectedAlignments\[index\]/);
});

test("表格矩阵 Release 探针不得用替代输入协议冒充正式性能证据", () => {
  assert.doesNotMatch(probeSource, /insertText/);
  assert.doesNotMatch(probeSource, /execCommand/);
  assert.doesNotMatch(probeSource, /page\.keyboard/);
});
