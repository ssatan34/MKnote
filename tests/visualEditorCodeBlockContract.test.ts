import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");

test("P1 代码块必须拥有独立命令并映射到 CommonMark schema", () => {
  assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"code-block"/);
  assert.match(adapterSource, /createCodeBlockCommand/);
  assert.match(
    adapterSource,
    /case\s+"code-block"\s*:\s*return\s+commands\.call\(createCodeBlockCommand\.key\)/,
  );
});

test("代码块必须继续经过同一 Markdown parser/serializer 边界", () => {
  assert.match(adapterSource, /\.use\(commonmark\)/);
  assert.match(adapterSource, /ctx\.get\(parserCtx\)\(markdown\)/);
  assert.match(adapterSource, /ctx\.get\(serializerCtx\)\(view\.state\.doc\)/);
  assert.match(adapterSource, /ctx\.get\(listenerCtx\)\.markdownUpdated/);
});
