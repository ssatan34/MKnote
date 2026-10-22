import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");

test("P1 块引用必须拥有独立命令并映射到 CommonMark schema", () => {
  assert.match(sessionSource, /VisualEditorCommand\s*=\s*[\s\S]*"blockquote"/);
  assert.match(adapterSource, /wrapInBlockquoteCommand/);
  assert.match(
    adapterSource,
    /case\s+"blockquote"\s*:\s*return\s+commands\.call\(wrapInBlockquoteCommand\.key\)/,
  );
});

test("块引用必须继续经过同一 Markdown parser/serializer 边界", () => {
  assert.match(adapterSource, /\.use\(commonmark\)/);
  assert.match(adapterSource, /ctx\.get\(parserCtx\)\(markdown\)/);
  assert.match(adapterSource, /ctx\.get\(serializerCtx\)\(view\.state\.doc\)/);
  assert.match(adapterSource, /ctx\.get\(listenerCtx\)\.markdownUpdated/);
});
