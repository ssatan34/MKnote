import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");
const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const visualEditorSource = readFileSync("src/components/VisualEditor.tsx", "utf8");
const visualEditorCssSource = readFileSync("src/components/VisualEditor.css", "utf8");
const productionProbeSource = readFileSync("scripts/visual-editor-phase2-production-e2e.mjs", "utf8");

test("P1 查找替换必须贯通 Session、Adapter 和 ProseMirror selection", () => {
  assert.match(sessionSource, /findNext\(query: string\): boolean/);
  assert.match(sessionSource, /replaceCurrent\(text: string\): boolean/);
  assert.match(sessionSource, /replaceAll\(query: string, replacement: string\): number/);
  assert.match(adapterSource, /TextSelection/);
  assert.match(adapterSource, /findVisualTextRanges/);
  assert.match(adapterSource, /findNext\(query: string\): boolean/);
  assert.match(adapterSource, /replaceCurrent\(text: string\): boolean/);
  assert.match(adapterSource, /replaceAll\(query: string, replacement: string\): number/);
  assert.match(adapterSource, /ctx\.get\(listenerCtx\)\.markdownUpdated/);
});

test("查找替换必须有 visual editor 用户入口和可验证操作控件", () => {
  assert.match(visualEditorSource, /data-testid="visual-editor-find-replace-toggle"/);
  assert.match(visualEditorSource, /data-testid="visual-editor-find-query"/);
  assert.match(visualEditorSource, /data-testid="visual-editor-find-next"/);
  assert.match(visualEditorSource, /data-testid="visual-editor-replace-current"/);
  assert.match(visualEditorSource, /data-testid="visual-editor-replace-all"/);
  assert.match(visualEditorCssSource, /\.visual-editor-find-replace/);
});

test("隔离 Release 探针必须覆盖查找、当前替换、全部替换和重开", () => {
  assert.match(productionProbeSource, /async function runFindReplaceCase\(\)/);
  assert.match(productionProbeSource, /visual-find-replace-persistence/);
  assert.match(productionProbeSource, /visual-editor-find-next/);
  assert.match(productionProbeSource, /visual-editor-replace-current/);
  assert.match(productionProbeSource, /visual-editor-replace-all/);
});
