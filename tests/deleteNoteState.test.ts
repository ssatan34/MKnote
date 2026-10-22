import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("打开普通笔记时退出默认便签状态，恢复删除按钮可用性", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /const applyNoteToEditor[\s\S]*?setActiveZone\(zone\);\s*defaultNoteOpenRef\.current = false;\s*setDefaultNoteOpen\(false\);\s*lastRegularNoteRef/,
  );
  assert.match(source, /defaultNoteOpen=\{defaultNoteOpen\}/);
  assert.doesNotMatch(source, /defaultNoteOpen=\{isDefaultNote\(activeNote\)\}/);
});

test("没有上一个普通笔记时退出默认便签也必须回到可新建的普通笔记", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const handler = source.slice(
    source.indexOf("const handleOpenDefaultNote"),
    source.indexOf("const handleLibraryZoneChange"),
  );

  assert.match(handler, /if \(defaultNoteOpenRef\.current\)/);
  assert.match(handler, /await flushSave\(\)/);
  assert.match(handler, /lastRegularNoteRef\.current \?\? \(await findExistingMarkdownNote\(\)\)/);
  assert.match(handler, /const created = await notesService\.create\(DEFAULT_ZONE\)/);
  assert.match(handler, /await openCreatedNote\(created, "\\n"\)/);
});

test("根默认便签与同名普通笔记往返时不能被同一 Tab 键短路", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const handler = source.slice(
    source.indexOf("const handleOpenDefaultNote"),
    source.indexOf("const handleLibraryZoneChange"),
  );

  assert.match(
    source,
    /activeNoteRef\.current === name\s*&&\s*activeZoneRef\.current === zone\s*&&\s*!defaultNoteOpenRef\.current/,
  );
  assert.match(source, /const currentIsRootDefault = isRootDefaultNote\([\s\S]*?const stillOpen =\s*!currentIsRootDefault[\s\S]*?openTabsRef\.current\.some/);
  assert.doesNotMatch(
    handler,
    /await flushSave\(\);\s*defaultNoteOpenRef\.current = false;\s*setDefaultNoteOpen\(false\);\s*const target/,
  );
});
