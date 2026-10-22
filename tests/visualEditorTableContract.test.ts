import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");
const visualEditorSource = readFileSync("src/components/VisualEditor.tsx", "utf8");
const visualEditorCssSource = readFileSync("src/components/VisualEditor.css", "utf8");
const editorPaneSource = readFileSync("src/components/compact/EditorPane.tsx", "utf8");
const compactViewSource = readFileSync("src/components/CompactView.tsx", "utf8");

test("P1 表格必须拥有独立插入命令并映射到 GFM schema", () => {
  assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"insert-table"/);
  assert.match(adapterSource, /insertTableCommand/);
  assert.match(
    adapterSource,
    /case\s+"insert-table"\s*:\s*return\s+commands\.call\(insertTableCommand\.key,\s*\{\s*row:\s*2,\s*col:\s*2\s*\}\)/,
  );
  assert.match(adapterSource, /\.use\(gfm\)/);
  assert.match(adapterSource, /tableKeyboard/);
  assert.match(adapterSource, /goToNextCell/);
  assert.match(adapterSource, /addRowAfter/);
  assert.match(adapterSource, /\.use\(tableKeyboard\)/);
  assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"add-table-row"/);
  assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"add-table-column"/);
  assert.match(adapterSource, /addRowAfterCommand/);
  assert.match(adapterSource, /addColAfterCommand/);
  assert.match(
    adapterSource,
    /case\s+"add-table-row"\s*:\s*return\s+commands\.call\(addRowAfterCommand\.key\)/,
  );
  assert.match(
    adapterSource,
    /case\s+"add-table-column"\s*:\s*return\s+commands\.call\(addColAfterCommand\.key\)/,
  );
});

test("表格必须继续经过同一 Markdown parser/serializer 边界", () => {
 assert.match(adapterSource, /ctx\.get\(parserCtx\)\(markdown\)/);
 assert.match(adapterSource, /ctx\.get\(serializerCtx\)\(view\.state\.doc\)/);
 assert.match(adapterSource, /ctx\.get\(listenerCtx\)\.markdownUpdated/);
});

test("P1 表格必须支持当前行列删除和三档对齐命令", () => {
 assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"delete-table-row"/);
 assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"delete-table-column"/);
 assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"align-table-left"/);
 assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"align-table-center"/);
 assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"align-table-right"/);
 assert.match(adapterSource, /deleteSelectedCellsCommand/);
 assert.match(adapterSource, /selectRowCommand/);
 assert.match(adapterSource, /selectColCommand/);
 assert.match(adapterSource, /setAlignCommand/);
 assert.match(adapterSource, /case\s+"delete-table-row"[\s\S]*deleteSelectedCellsCommand\.key/);
 assert.match(adapterSource, /case\s+"delete-table-column"[\s\S]*deleteSelectedCellsCommand\.key/);
 assert.match(adapterSource, /case\s+"align-table-left"[\s\S]*setAlignCommand\.key,\s*"left"/);
 assert.match(adapterSource, /case\s+"align-table-center"[\s\S]*setAlignCommand\.key,\s*"center"/);
 assert.match(adapterSource, /case\s+"align-table-right"[\s\S]*setAlignCommand\.key,\s*"right"/);
});

test("表格命令必须有 visual editor 用户可达入口", () => {
 assert.match(visualEditorSource, /visual-editor-table-toolbar/);
 assert.match(visualEditorSource, /data-testid="visual-editor-table-delete-row"/);
 assert.match(visualEditorSource, /data-testid="visual-editor-table-delete-column"/);
 assert.match(visualEditorSource, /data-testid="visual-editor-table-align-center"/);
 assert.match(editorPaneSource, /visualEditorCommandRef/);
 assert.match(compactViewSource, /visualEditorCommandRef\.current/);
});

test("visual editor 表格的空单元格必须保留可操作宽度", () => {
 assert.match(visualEditorCssSource, /\.visual-editor-host[\s\S]*table-layout:\s*fixed/);
 assert.match(visualEditorCssSource, /\.visual-editor-host[\s\S]*min-width:/);
});
