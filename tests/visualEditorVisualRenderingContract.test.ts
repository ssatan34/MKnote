import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const visualEditorCssSource = readFileSync("src/components/VisualEditor.css", "utf8");

test("Visual Editor 必须恢复 Markdown 基础块级语义的可视样式", () => {
  assert.match(visualEditorCssSource, /\.ProseMirror h1[\s\S]*font-size/);
  assert.match(visualEditorCssSource, /\.ProseMirror h2[\s\S]*font-size/);
  assert.match(visualEditorCssSource, /\.ProseMirror h3[\s\S]*font-size/);
  assert.match(visualEditorCssSource, /\.ProseMirror ul[\s\S]*list-style-type:\s*disc/);
  assert.match(visualEditorCssSource, /\.ProseMirror ol[\s\S]*list-style-type:\s*decimal/);
  assert.match(visualEditorCssSource, /data-type=["']hardbreak["']/);
  assert.match(visualEditorCssSource, /\.ProseMirror a[\s\S]*text-decoration/);
});

test("行内代码和代码块必须有明确的视觉边界", () => {
  assert.match(visualEditorCssSource, /\.ProseMirror code:not\(pre code\)/);
  assert.match(visualEditorCssSource, /\.ProseMirror pre[\s\S]*overflow-x:\s*auto/);
  assert.match(visualEditorCssSource, /\.ProseMirror pre code/);
});

test("下划线和高亮必须在 Visual Editor 中拥有可序列化的节点路径", () => {
  assert.match(adapterSource, /underline/);
  assert.match(adapterSource, /highlight/);
  assert.match(adapterSource, /\$markSchema/);
  assert.match(adapterSource, /toMarkdown/);
  assert.match(adapterSource, /case "underline"/);
  assert.match(adapterSource, /case "highlight"/);
  assert.match(adapterSource, /\.use\(toggleVisualUnderlineCommand\)/);
  assert.match(adapterSource, /\.use\(toggleVisualHighlightCommand\)/);
  assert.match(visualEditorCssSource, /\.ProseMirror u/);
  assert.match(visualEditorCssSource, /\.ProseMirror mark/);
});

test("代码块必须保留复制和收起/展开工具栏，并阻止工具栏点击破坏编辑选区", () => {
  assert.match(adapterSource, /code_block/);
  assert.match(adapterSource, /mk-code-toolbar/);
  assert.match(adapterSource, /mk-code-copy/);
  assert.match(adapterSource, /mk-code-collapse/);
  assert.match(adapterSource, /navigator\.clipboard/);
  assert.match(adapterSource, /stopEvent/);
  assert.match(visualEditorCssSource, /\.mk-code-toolbar/);
  assert.match(visualEditorCssSource, /\.mk-code-collapsed/);
});

test("Visual Editor 必须把硬换行保持为编辑器内可定位的光标边界", () => {
  assert.match(adapterSource, /hardbreak/);
  assert.match(adapterSource, /TextSelection/);
  assert.match(adapterSource, /selection/);
});
