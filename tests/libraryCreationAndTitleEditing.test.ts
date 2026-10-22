import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("资料库状态下新建笔记后收起资料库", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const createSource = source.slice(
    source.indexOf("const handleCreate = async"),
    source.indexOf("const handleCreateCapsuleTodo"),
  );

  assert.match(createSource, /await openCreatedNote\(created, "\\n"\);[\s\S]*?setLibraryOpen\(false\)/);
});

test("标题输入框仅在双击后进入编辑，进入编辑后的光标逻辑保持不变", () => {
  const source = readFileSync(new URL("../src/components/compact/CompactHeader.tsx", import.meta.url), "utf8");

  assert.match(source, /const \[titleEditing, setTitleEditing\] = useState\(false\)/);
  assert.match(source, /onDoubleClick=\{/);
  assert.match(source, /readOnly=\{titleLocked \|\| !titleEditing\}/);
  assert.match(source, /if \(titleLocked \|\| !titleEditing\) \{\s*e\.preventDefault\(\);[\s\S]*?return;/);
  assert.match(source, /data-title-editing=\{titleEditing \? "true" : "false"\}/);
  assert.match(source, /titleEditing[\s\S]*?e\.currentTarget\.select\(\)/);
  assert.match(source, /titleEditing[\s\S]*?setSelectionRange\(titleDraft\.length, titleDraft\.length\)/);
});
