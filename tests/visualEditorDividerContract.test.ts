import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");
const visualEditorSource = readFileSync("src/components/VisualEditor.tsx", "utf8");
const compactViewSource = readFileSync("src/components/CompactView.tsx", "utf8");
const visualEditorCssSource = readFileSync("src/components/VisualEditor.css", "utf8");
const productionProbeSource = readFileSync("scripts/visual-editor-phase2-production-e2e.mjs", "utf8");

test("P1 分割线必须拥有独立命令并映射到 CommonMark thematic break", () => {
  assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"insert-divider"/);
  assert.match(adapterSource, /insertHrCommand/);
  assert.match(
    adapterSource,
    /case\s+"insert-divider"\s*:\s*return\s+commands\.call\(insertHrCommand\.key\)/,
  );
  assert.match(adapterSource, /\.use\(commonmark\)/);
  assert.match(adapterSource, /ctx\.get\(parserCtx\)\(markdown\)/);
  assert.match(adapterSource, /ctx\.get\(serializerCtx\)\(view\.state\.doc\)/);
  assert.match(adapterSource, /ctx\.get\(listenerCtx\)\.markdownUpdated/);
});

test("分割线入口由上方 Markdown 工具栏提供，Visual Editor 保留可辨识的呈现样式", () => {
  assert.doesNotMatch(visualEditorSource, /data-testid="visual-editor-insert-divider"/);
  assert.doesNotMatch(visualEditorSource, /runVisualCommand\("insert-divider"\)/);
  assert.match(compactViewSource, /hr:\s*"insert-divider"/);
  assert.match(visualEditorCssSource, /\.visual-editor-host\s+\.ProseMirror\s+hr/);
});

test("隔离 Release 探针必须覆盖分割线保存与重开", () => {
  assert.match(productionProbeSource, /async function runDividerCase\(\)/);
  assert.match(productionProbeSource, /visual-divider-persistence/);
  assert.match(productionProbeSource, /clickMarkdownToolbarAction\(runtime\.page, "分割线"\)/);
  assert.doesNotMatch(productionProbeSource, /visual-editor-insert-divider/);
  assert.match(productionProbeSource, /\.ProseMirror hr/);
});
