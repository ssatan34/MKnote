import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionProbeSource = readFileSync(
  "scripts/visual-editor-phase2-production-e2e.mjs",
  "utf8",
);
const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");

test("任务列表运行时合同覆盖嵌套中英文、点击复选框和重新打开", () => {
  assert.match(productionProbeSource, /async function runTaskPersistenceCase\(\)/);
  assert.match(productionProbeSource, /visual-task-persistence/);
  assert.match(productionProbeSource, /嵌套任务/);
  assert.match(productionProbeSource, /input\[type=\\?['"]checkbox/);
  assert.match(productionProbeSource, /reopened/);
});

test("任务 Markdown 序列化必须把 GFM 默认星号项目符号规范化为连字符", () => {
  assert.match(adapterSource, /normalizeVisualTaskMarkdown/);
  assert.ok(adapterSource.includes("replace(/^([ \\t]*)\\*"));
});
