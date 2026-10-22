import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const editorPaneSource = readFileSync(
  join(process.cwd(), "src", "components", "compact", "EditorPane.tsx"),
  "utf8",
);
const adapterSource = readFileSync(
  join(process.cwd(), "src", "visual-editor", "visualEditorAdapter.ts"),
  "utf8",
);

test("已聚焦的编辑内容在 mousedown 阶段不得再次 focus", () => {
  const mouseDownHandler = editorPaneSource.slice(
    editorPaneSource.indexOf("onMouseDown={(e) =>"),
    editorPaneSource.indexOf("\n      >", editorPaneSource.indexOf("onMouseDown={(e) =>")),
  );

  assert.match(
    mouseDownHandler,
    /target\.closest\(\s*"button, input, \.compact-toolbar, \.compact-statusbar, \.markdown-toolbar, \.ProseMirror, textarea"\s*,?\s*\)/s,
    "编辑内容本身必须跳过外层 mousedown 的主动 focus，保留浏览器落点处理",
  );
});

test("Visual Editor 必须在一次普通点击后显式同步 ProseMirror 光标", () => {
  const pluginStart = adapterSource.indexOf("const caretClickSelection =");
  const pluginEnd = adapterSource.indexOf("function cycleVisualCase", pluginStart);
  assert.ok(pluginStart >= 0, "缺少一次点击光标同步插件");
  assert.ok(pluginEnd > pluginStart, "光标同步插件边界无法识别");

  const pluginSource = adapterSource.slice(pluginStart, pluginEnd);
  assert.match(pluginSource, /handleDOMEvents\s*:\s*\{/);
  assert.match(pluginSource, /mousedown\s*:/);
  assert.match(pluginSource, /mouseup\s*:/);
  assert.match(pluginSource, /posAtCoords\(\{\s*left:\s*event\.clientX,\s*top:\s*event\.clientY\s*\}\)/s);
  assert.match(pluginSource, /TextSelection\.near\(/);
  assert.match(pluginSource, /event\.preventDefault\(\)/);
  assert.match(adapterSource, /\.use\(caretClickSelection\)/);
});
